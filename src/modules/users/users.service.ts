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
import { getClientTypeFromFid, CLIENT_FIDS } from '../../app/constants';

// Re-export for backward compatibility
export type { FarcasterProfile };

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly NEYNAR_API_URL =
    'https://api.neynar.com/v2/farcaster/user/bulk';

  // In-memory cache for findOne (30 second TTL to reduce DB calls)
  private userCache = new Map<string, { data: any; expiry: number }>();
  private readonly USER_CACHE_TTL_MS = 30 * 1000; // 30 seconds

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
   * Find or create user by FID (for Farcaster login)
   * Returns { user, isNewUser }
   */
  async findOrCreateByFid(
    fid: number,
    walletAddress: string,
  ): Promise<{
    user: typeof schema.users.$inferSelect & { card: any; wallets: any[] };
    isNewUser: boolean;
  }> {
    const safeAddress = walletAddress.toLowerCase();

    // 1. Try to find by FID first
    let existingUser = await this.db.query.users.findFirst({
      where: eq(schema.users.fid, fid),
      with: { card: true, wallets: true },
    });

    if (existingUser) {
      return { user: existingUser, isNewUser: false };
    }

    // 2. Check if wallet address exists (edge case: wallet exists but no FID)
    existingUser = await this.db.query.users.findFirst({
      where: eq(schema.users.walletAddress, safeAddress),
      with: { card: true, wallets: true },
    });

    if (existingUser) {
      // Update FID if not set
      if (!existingUser.fid) {
        await this.db
          .update(schema.users)
          .set({ fid })
          .where(eq(schema.users.id, existingUser.id));
        this.logger.log(`Updated FID ${fid} for user ${existingUser.id}`);
      }
      return { user: { ...existingUser, fid }, isNewUser: false };
    }

    // 3. Create new user
    const [newUser] = await this.db
      .insert(schema.users)
      .values({
        walletAddress: safeAddress,
        fid,
        isNewUser: true,
      })
      .returning();

    this.logger.log(`Created new user: ${newUser.id} (FID: ${fid})`);

    // 4. Initialize User Quests
    const activeQuests = await this.db.query.quests.findMany({
      where: eq(schema.quests.isActive, true),
    });

    if (activeQuests.length > 0) {
      await this.db.insert(schema.userQuests).values(
        activeQuests.map((quest) => ({
          userId: newUser.id,
          questId: quest.id,
          status: 'pending' as const,
        })),
      );
      this.logger.log(
        `Initialized ${activeQuests.length} quests for user ${newUser.id}`,
      );
    }

    return {
      user: { ...newUser, card: null, wallets: [] },
      isNewUser: true,
    };
  }

  /**
   * Create user by wallet address (for wallet-only login)
   */
  async create(createUserDto: CreateUserDto & { fid?: number }) {
    const safeAddress = createUserDto.walletAddress.toLowerCase();

    const existing = await this.db.query.users.findFirst({
      where: eq(schema.users.walletAddress, safeAddress),
    });

    if (existing) {
      this.logger.debug(`User already exists: ${existing.id}`);
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

    this.logger.log(`Created new user: ${user.id}`);
    return user;
  }

  /**
   * Add wallet to user_wallets (for tracking client-specific wallets)
   */
  async addClientWallet(
    userId: string,
    walletAddress: string,
    clientFid: number,
  ): Promise<void> {
    const safeAddress = walletAddress.toLowerCase();
    const clientType = getClientTypeFromFid(clientFid);

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

  /**
   * Upsert notification token/url for user wallet
   * Used when user adds miniapp and wants to enable notifications
   */
  async upsertNotification(
    userId: string,
    walletAddress: string,
    clientFid: number,
    notificationToken: string,
    notificationUrl: string,
  ): Promise<{ success: boolean; message: string }> {
    const safeAddress = walletAddress.toLowerCase();

    // Find wallet matching clientFid for this user
    const wallet = await this.db.query.userWallets.findFirst({
      where: eq(schema.userWallets.walletAddress, safeAddress),
    });

    if (!wallet) {
      // Create wallet if not exists
      const clientType = getClientTypeFromFid(clientFid);
      await this.db.insert(schema.userWallets).values({
        userId,
        walletAddress: safeAddress,
        clientType,
        clientFid,
        miniappAdded: true,
        notificationEnabled: true,
        notificationToken,
        notificationUrl,
      });
      this.logger.log(`Created wallet with notification for user ${userId}`);
      return { success: true, message: 'Wallet and notification created' };
    }

    // Update existing wallet
    await this.db
      .update(schema.userWallets)
      .set({
        miniappAdded: true,
        notificationEnabled: true,
        notificationToken,
        notificationUrl,
      })
      .where(eq(schema.userWallets.id, wallet.id));

    this.logger.log(`Updated notification for wallet ${wallet.id}`);
    return { success: true, message: 'Notification updated' };
  }

  /**
   * Update miniapp added status for user wallet
   */
  async upsertMiniAppAdded(
    userId: string,
    walletAddress: string,
    clientFid: number,
  ): Promise<{ success: boolean; message: string }> {
    const safeAddress = walletAddress.toLowerCase();

    // Find wallet matching clientFid for this user
    const wallet = await this.db.query.userWallets.findFirst({
      where: eq(schema.userWallets.walletAddress, safeAddress),
    });

    if (!wallet) {
      // Create wallet if not exists
      const clientType = getClientTypeFromFid(clientFid);
      await this.db.insert(schema.userWallets).values({
        userId,
        walletAddress: safeAddress,
        clientType,
        clientFid,
        miniappAdded: true,
      });
      this.logger.log(`Created wallet with miniapp added for user ${userId}`);
      return {
        success: true,
        message: 'Wallet created and miniapp marked added',
      };
    }

    // Update existing wallet
    await this.db
      .update(schema.userWallets)
      .set({
        miniappAdded: true,
      })
      .where(eq(schema.userWallets.id, wallet.id));

    this.logger.log(`Updated miniapp added for wallet ${wallet.id}`);
    return { success: true, message: 'Miniapp marked as added' };
  }

  /**
   * Initialize user data from Neynar API (fire-and-forget)
   * - Adds all auth_addresses to user_wallets
   * - Updates pfp_url in users table
   */
  async initializeUserFromNeynar(userId: string, fid: number): Promise<void> {
    const apiKey = this.appConfigService.neynarApiKey;
    if (!apiKey) {
      this.logger.error('NEYNAR_API_KEY is not configured');
      return;
    }

    try {
      const response = await fetch(`${this.NEYNAR_API_URL}?fids=${fid}`, {
        headers: { 'x-api-key': apiKey },
      });

      if (!response.ok) {
        this.logger.error(`Neynar API error: ${response.status}`);
        return;
      }

      const data = await response.json();
      if (!data.users || data.users.length === 0) {
        return;
      }

      const neynarUser = data.users[0];

      // 1. Update pfp_url in users table
      if (neynarUser.pfp_url) {
        await this.db
          .update(schema.users)
          .set({
            farcasterPfpUrl: neynarUser.pfp_url,
            farcasterPfpUpdatedAt: new Date(),
          })
          .where(eq(schema.users.id, userId));
        this.logger.log(`Updated PFP for user ${userId}`);
      }

      // 2. Add all auth_addresses to user_wallets
      const authAddresses: Array<{ address: string; app?: { fid: number } }> =
        neynarUser.auth_addresses || [];

      for (const auth of authAddresses) {
        const appFid = auth.app?.fid;
        if (appFid) {
          await this.addClientWallet(userId, auth.address, appFid);
        }
      }

      this.logger.log(
        `Initialized ${authAddresses.length} wallets for user ${userId} from Neynar`,
      );
    } catch (error) {
      this.logger.error('Error initializing user from Neynar:', error);
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

  async findOne(id: string) {
    const now = Date.now();

    // Check cache first
    const cached = this.userCache.get(id);
    if (cached && cached.expiry > now) {
      this.logger.debug(`[TIMING] findOne cache hit for ${id}`);
      return cached.data;
    }

    const start = Date.now();
    const result = await this.db.query.users.findFirst({
      where: eq(schema.users.id, id),
      with: {
        card: true,
        wallets: true,
      },
    });
    this.logger.debug(`[TIMING] findOne query: ${Date.now() - start}ms`);

    // Update cache
    if (result) {
      this.userCache.set(id, {
        data: result,
        expiry: now + this.USER_CACHE_TTL_MS,
      });
    }

    return result;
  }

  /**
   * Invalidate user cache - call this after user data changes (e.g., claim quest)
   */
  invalidateUserCache(userId: string) {
    this.userCache.delete(userId);
    this.logger.debug(`Cache invalidated for user ${userId}`);
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
