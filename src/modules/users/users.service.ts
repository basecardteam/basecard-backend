import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { DRIZZLE } from '../../db/db.module';
import * as schema from '../../db/schema';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { EvmLib } from '../blockchain/evm.lib';
import { BasecardsService } from '../basecards/basecards.service';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>,
    private evmLib: EvmLib,
    @Inject(forwardRef(() => BasecardsService))
    private basecardsService: BasecardsService,
  ) {}

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
        earnList: true,
        collections: true,
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
