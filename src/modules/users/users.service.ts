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

  async create(createUserDto: CreateUserDto) {
    const existing = await this.db.query.users.findFirst({
      where: eq(
        schema.users.walletAddress,
        createUserDto.walletAddress.toLowerCase(),
      ),
    });
    if (existing) {
      this.logger.debug(`User already exists: ${existing.id}`);
      // Sync onchain data for existing user (in case event listener missed it)
      await this.syncOnchainData(createUserDto.walletAddress);
      return existing;
    }

    const [user] = await this.db
      .insert(schema.users)
      .values({
        walletAddress: createUserDto.walletAddress.toLowerCase(),
        isNewUser: true,
      })
      .returning();
    this.logger.log(`Created new user: ${user.id}`);

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

    // Sync onchain data for new user (in case they already minted externally)
    await this.syncOnchainData(createUserDto.walletAddress);

    return user;
  }

  /**
   * Sync onchain data (tokenId, hasMintedCard) with DB
   * This ensures DB stays in sync even if event listener missed events
   */
  private async syncOnchainData(rawAddress: string): Promise<void> {
    const address = rawAddress.toLowerCase();
    try {
      // 1. Check onchain tokenId
      const tokenId = await this.evmLib.getTokenId(address);

      if (!tokenId) {
        // User hasn't minted yet, nothing to sync
        return;
      }

      // 2. Check if DB already has this data
      const user = await this.db.query.users.findFirst({
        where: eq(schema.users.walletAddress, address),
        with: { card: true },
      });

      if (!user) return;

      // 3. If user has minted onchain but DB doesn't reflect it, sync
      const needsSync = !user.hasMintedCard || !user.card?.tokenId;

      if (needsSync) {
        this.logger.log(
          `Syncing onchain data for ${address}: tokenId=${tokenId}`,
        );

        // Update basecards table with tokenId
        if (user.card && !user.card.tokenId) {
          await this.basecardsService.updateTokenId(address, tokenId);
        }

        // Update user hasMintedCard if not set
        if (!user.hasMintedCard) {
          await this.db
            .update(schema.users)
            .set({ hasMintedCard: true })
            .where(eq(schema.users.walletAddress, address));
        }

        this.logger.log(`Onchain sync completed for ${address}`);
      }
    } catch (error) {
      // Don't fail the request if sync fails, just log
      this.logger.warn(`Failed to sync onchain data for ${address}:`, error);
    }
  }

  findAll() {
    return this.db.query.users.findMany();
  }

  findOne(id: string) {
    return this.db.query.users.findFirst({
      where: eq(schema.users.id, id),
      with: {
        card: true,
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
