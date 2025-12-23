import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { DRIZZLE } from '../../db/db.module';
import * as schema from '../../db/schema';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { EvmLib } from '../blockchain/evm.lib';
import { BasecardsService } from '../basecards/basecards.service';
import { AppConfigService } from '../../app/configs/app-config.service';
import { FarcasterProfile } from '../basecards/types/basecard.types';

// Re-export for backward compatibility
export type { FarcasterProfile };

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly NEYNAR_API_URL =
    'https://api.neynar.com/v2/farcaster/user/bulk';

  constructor(
    @Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>,
    private evmLib: EvmLib,
    @Inject(forwardRef(() => BasecardsService))
    private basecardsService: BasecardsService,
    private appConfigService: AppConfigService,
  ) {}

  /**
   * Fetch Farcaster profile from Neynar API by FID
   */
  async fetchFarcasterProfile(fid: number): Promise<FarcasterProfile | null> {
    const apiKey = this.appConfigService.neynarApiKey;
    if (!apiKey) {
      this.logger.error('NEYNAR_API_KEY is not configured');
      return null;
    }

    try {
      const response = await fetch(`${this.NEYNAR_API_URL}?fids=${fid}`, {
        headers: {
          'x-api-key': apiKey,
        },
      });

      if (!response.ok) {
        this.logger.error(`Neynar API error: ${response.status}`);
        return null;
      }

      const data = await response.json();

      if (!data.users || data.users.length === 0) {
        return null;
      }

      const user = data.users[0];
      return {
        fid: user.fid,
        username: user.username,
        display_name: user.display_name,
        pfp_url: user.pfp_url,
      };
    } catch (error) {
      this.logger.error('Error fetching Farcaster profile:', error);
      return null;
    }
  }

  /**
   * Get cached Farcaster PFP URL with 1-hour TTL
   * Updates cache if expired or missing
   */
  async getCachedFarcasterPfp(
    user: typeof schema.users.$inferSelect,
  ): Promise<string | null> {
    if (!user.fid) return null;

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Check if cache is valid
    if (
      user.farcasterPfpUrl &&
      user.farcasterPfpUpdatedAt &&
      user.farcasterPfpUpdatedAt > oneHourAgo
    ) {
      return user.farcasterPfpUrl;
    }

    // Fetch fresh profile from Neynar
    const profile = await this.fetchFarcasterProfile(user.fid);
    if (!profile?.pfp_url) {
      return user.farcasterPfpUrl || null; // Return stale cache if fetch fails
    }

    // Update cache in database (fire and forget)
    this.db
      .update(schema.users)
      .set({
        farcasterPfpUrl: profile.pfp_url,
        farcasterPfpUpdatedAt: now,
      })
      .where(eq(schema.users.id, user.id))
      .then(() => this.logger.debug(`Updated PFP cache for user ${user.id}`))
      .catch((err) => this.logger.error('Failed to update PFP cache:', err));

    return profile.pfp_url;
  }

  /**
   * Create or find user by wallet address
   * Optionally sets FID if provided
   */
  async create(createUserDto: CreateUserDto & { fid?: number }) {
    const safeAddress = createUserDto.walletAddress.toLowerCase();

    const existing = await this.db.query.users.findFirst({
      where: eq(schema.users.walletAddress, safeAddress),
    });

    if (existing) {
      this.logger.debug(`User already exists: ${existing.id}`);

      // Update FID if provided and not set
      if (createUserDto.fid && !existing.fid) {
        await this.db
          .update(schema.users)
          .set({ fid: createUserDto.fid })
          .where(eq(schema.users.id, existing.id));
        this.logger.log(`Updated FID for user ${existing.id}`);
      }

      return existing;
    }

    const [user] = await this.db
      .insert(schema.users)
      .values({
        walletAddress: safeAddress,
        fid: createUserDto.fid || null,
        isNewUser: true,
      })
      .returning();
    this.logger.log(
      `Created new user: ${user.id} (FID: ${createUserDto.fid || 'none'})`,
    );

    // Initialize User Quests
    const activeQuests = await this.db.query.quests.findMany({
      where: eq(schema.quests.isActive, true),
    });

    if (activeQuests.length > 0) {
      await this.db.insert(schema.userQuests).values(
        activeQuests.map((quest) => ({
          userId: user.id,
          questId: quest.id,
          status: 'pending' as const,
        })),
      );
      this.logger.log(
        `Initialized ${activeQuests.length} quests for user ${user.id}`,
      );
    }

    return user;
  }

  /**
   * Add wallet to user_wallets (for tracking client-specific wallets)
   */
  async addClientWallet(
    userId: string,
    walletAddress: string,
    clientType: 'farcaster' | 'baseapp' | 'metamask',
    clientFid?: number,
  ): Promise<void> {
    const safeAddress = walletAddress.toLowerCase();

    // Check if already exists
    const existing = await this.db.query.userWallets.findFirst({
      where: eq(schema.userWallets.walletAddress, safeAddress),
    });

    if (!existing) {
      await this.db.insert(schema.userWallets).values({
        userId,
        walletAddress: safeAddress,
        clientType,
        clientFid,
      });
      this.logger.log(
        `Added ${clientType} wallet for user ${userId}: ${safeAddress}`,
      );
    }
  }

  findAll(role?: 'user' | 'admin') {
    if (role) {
      return this.db.query.users.findMany({
        where: eq(schema.users.role, role),
      });
    }
    return this.db.query.users.findMany();
  }

  findOne(id: string) {
    return this.db.query.users.findFirst({
      where: eq(schema.users.id, id),
      with: {
        card: true,
        wallets: true,
      },
    });
  }

  async findByAddress(address: string) {
    return this.db.query.users.findFirst({
      where: eq(schema.users.walletAddress, address.toLowerCase()),
      with: {
        card: true,
      },
    });
  }

  async findByFid(fid: number) {
    return this.db.query.users.findFirst({
      where: eq(schema.users.fid, fid),
      with: {
        card: true,
        wallets: true,
      },
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const [updated] = await this.db
      .update(schema.users)
      .set({
        ...updateUserDto,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, id))
      .returning();
    return updated;
  }

  async increasePoints(
    address: string,
    points: number,
    type:
      | 'QUEST_REWARD'
      | 'MINT_BONUS'
      | 'REFERRAL'
      | 'ADMIN_ADJUST' = 'ADMIN_ADJUST',
    questId?: string,
    eventId?: string,
  ) {
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.walletAddress, address.toLowerCase()),
    });

    if (!user) {
      this.logger.warn(`User not found for points increase: ${address}`);
      throw new Error('User not found');
    }

    return await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(schema.users)
        .set({
          totalPoints: user.totalPoints + points,
          updatedAt: new Date(),
        })
        .where(eq(schema.users.walletAddress, address.toLowerCase()))
        .returning();

      await tx.insert(schema.pointLogs).values({
        userId: user.id,
        amount: points,
        type: type,
        questId: questId,
        eventId: eventId,
      });

      return updated;
    });
  }

  async increasePointsByUserId(
    userId: string,
    points: number,
    type:
      | 'QUEST_REWARD'
      | 'MINT_BONUS'
      | 'REFERRAL'
      | 'ADMIN_ADJUST' = 'ADMIN_ADJUST',
    questId?: string,
    eventId?: string,
  ) {
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.id, userId),
    });

    if (!user) {
      this.logger.warn(`User not found for points increase: ${userId}`);
      throw new Error('User not found');
    }

    return await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(schema.users)
        .set({
          totalPoints: user.totalPoints + points,
          updatedAt: new Date(),
        })
        .where(eq(schema.users.id, userId))
        .returning();

      await tx.insert(schema.pointLogs).values({
        userId: user.id,
        amount: points,
        type: type,
        questId: questId,
        eventId: eventId,
      });

      return updated;
    });
  }

  async updateByAddress(address: string, updateUserDto: UpdateUserDto) {
    const [updated] = await this.db
      .update(schema.users)
      .set({
        ...updateUserDto,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.walletAddress, address.toLowerCase()))
      .returning();
    return updated;
  }

  remove(id: string) {
    return this.db.delete(schema.users).where(eq(schema.users.id, id));
  }
}
