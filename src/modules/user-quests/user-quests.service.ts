import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { DRIZZLE } from '../../db/db.module';
import * as schema from '../../db/schema';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and } from 'drizzle-orm';
import { UsersService } from '../users/users.service';
import { QuestVerificationService } from '../quest-verification/quest-verification.service';
import { Platform, ActionType } from '../quests/quest-types';
import { EvmLib } from '../blockchain/evm.lib';
import { VerificationContext } from '../quest-verification/quest-verification.service';

@Injectable()
export class UserQuestsService {
  private readonly logger = new Logger(UserQuestsService.name);

  constructor(
    @Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>,
    private usersService: UsersService,
    private questVerificationService: QuestVerificationService,
    private evmLib: EvmLib,
  ) {}

  /**
   * Get all quests with user's completion status (by userId)
   */
  async findAllForUserById(userId: string) {
    // Get user with fid
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.id, userId),
    });

    // Get all active quests
    const quests = await this.db.query.quests.findMany({
      where: eq(schema.quests.isActive, true),
      orderBy: (quests, { desc }) => [desc(quests.createdAt)],
    });

    if (!user) {
      // Return quests with default 'pending' status
      return quests.map((quest) => ({
        ...quest,
        status: 'pending' as const,
      }));
    }

    // Get user's quest statuses
    const userQuests = await this.db.query.userQuests.findMany({
      where: eq(schema.userQuests.userId, userId),
    });

    // Merge quest data with user status (no auto-verify here for performance)
    return quests.map((quest) => {
      const userQuest = userQuests.find((uq) => uq.questId === quest.id);
      const status = userQuest?.status || ('pending' as const);
      return { ...quest, status };
    });
  }

  /**
   * Verify all pending quests for a user and update their status
   * This should be called on login or explicitly by the user
   */
  async verifyQuestsForUser(
    userId: string,
    actionType?: string,
  ): Promise<{
    verified: number;
    quests: { questId: string; actionType: string; status: string }[];
  }> {
    // Should use UsersService to benefit from caching and relations (card, wallets)
    const user = await this.usersService.findOne(userId);

    if (!user) {
      return { verified: 0, quests: [] };
    }

    // Get all active quests (optionally filtered by actionType)
    const quests = await this.db.query.quests.findMany({
      where:
        actionType && actionType !== 'ALL'
          ? and(
              eq(schema.quests.isActive, true),
              eq(schema.quests.actionType, actionType),
            )
          : eq(schema.quests.isActive, true),
    });

    // Get user's current quest statuses
    // Keeping direct DB query for now as per current structure, but ensuring we use the 'user' object from service
    const userQuests = await this.db.query.userQuests.findMany({
      where: eq(schema.userQuests.userId, userId),
    });

    const results: { questId: string; actionType: string; status: string }[] =
      [];
    let verifiedCount = 0;

    if (!user.card?.tokenOwner) {
      this.logger.warn(
        `User ${userId} has no card token owner, skipping verification`,
      );
      return { verified: 0, quests: [] };
    }

    // making verify context here..
    const ctx: VerificationContext = {
      address: user.card?.tokenOwner,
      fid: user.fid ?? undefined,
    };

    // Pre-fetch blockchain data to avoid repeated calls
    try {
      // Use card's tokenId if available from relation
      const tokenId = user.card?.tokenId
        ? user.card.tokenId
        : await this.evmLib.getTokenId(ctx.address);

      if (tokenId) {
        ctx.tokenId = tokenId;
        ctx.cardData = await this.evmLib.getCardData(tokenId);
        this.logger.debug(
          `Pre-fetched blockchain data for user ${userId}: ${JSON.stringify(ctx)}`,
        );
      } else {
        this.logger.debug(
          `No blockchain data found for user ${userId}: ${JSON.stringify(ctx)}`,
        );

        return { verified: 0, quests: [] };
      }
    } catch (e) {
      this.logger.warn(
        `Failed to pre-fetch blockchain data for user ${userId}: ${e}`,
      );
    }

    // Check each pending quest
    await Promise.all(
      quests.map(async (quest) => {
        const userQuest = userQuests.find((uq) => uq.questId === quest.id);
        const currentStatus = userQuest?.status || 'pending';

        // Only verify if pending
        if (currentStatus === 'pending') {
          const isClaimable = await this.tryAutoVerify(quest, ctx);

          if (isClaimable) {
            this.logger.log(
              `Verified quest ${quest.actionType} for user ${userId}`,
            );

            // Update DB
            await this.db
              .insert(schema.userQuests)
              .values({
                userId: user.id,
                questId: quest.id,
                status: 'claimable',
              })
              .onConflictDoUpdate({
                target: [schema.userQuests.userId, schema.userQuests.questId],
                set: { status: 'claimable' },
                where: eq(schema.userQuests.status, 'pending'),
              });

            verifiedCount++;
            results.push({
              questId: quest.id,
              actionType: quest.actionType,
              status: 'claimable',
            });
          } else {
            results.push({
              questId: quest.id,
              actionType: quest.actionType,
              status: 'pending',
            });
          }
        } else {
          results.push({
            questId: quest.id,
            actionType: quest.actionType,
            status: currentStatus,
          });
        }
      }),
    );

    return { verified: verifiedCount, quests: results };
  }

  /**
   * Try to auto-verify status for a quest using QuestVerificationService
   */
  private async tryAutoVerify(
    quest: typeof schema.quests.$inferSelect,
    ctx: VerificationContext,
  ): Promise<boolean> {
    // Delegate all verification to QuestVerificationService
    return this.questVerificationService.verify(
      quest.platform as Platform,
      quest.actionType as ActionType,
      ctx,
    );
  }

  /**
   * Claim a quest reward after verifying on-chain conditions
   */ /**
   * Claim quest by userId
   */
  async claimQuestByUserId(
    questId: string,
    userId: string,
  ): Promise<{
    verified: boolean;
    rewarded: number;
    newTotalPoints: number;
  }> {
    // 1. Find the quest by ID
    const quest = await this.db.query.quests.findFirst({
      where: eq(schema.quests.id, questId),
    });

    if (!quest) {
      throw new BadRequestException(`Quest not found`);
    }

    // 2. Find the user by ID
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.id, userId),
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    this.logger.debug(
      `Claiming quest ${quest.title} (${questId}) for user ${userId}`,
    );

    // 3. Check if already claimed or claimable
    const userQuest = await this.db.query.userQuests.findFirst({
      where: and(
        eq(schema.userQuests.userId, userId),
        eq(schema.userQuests.questId, quest.id),
      ),
    });

    if (userQuest?.status === 'completed') {
      this.logger.debug(
        `Quest ${quest.actionType} (${questId}) already claimed by user ${userId}`,
      );
      return {
        verified: false,
        rewarded: 0,
        newTotalPoints: user.totalPoints,
      };
    }

    // 4. Check if quest requires FID but user doesn't have one
    if (quest.platform === 'FARCASTER' && !user.fid) {
      throw new BadRequestException(
        'This quest requires Farcaster login. Wallet login cannot complete this quest.',
      );
    }

    // 5. Verify quest condition (skip if already verified/claimable)
    let isVerified = userQuest?.status === 'claimable';

    if (!isVerified) {
      isVerified = await this.questVerificationService.verify(
        quest.platform as Platform,
        quest.actionType as ActionType,
        { address: user.walletAddress, fid: user.fid ?? undefined },
      );
    }

    if (!isVerified) {
      this.logger.debug(
        `Quest ${quest.actionType} condition not met for user ${userId}`,
      );
      throw new BadRequestException(
        `Quest ${quest.actionType} condition not met`,
      );
    }

    // 6. Mark quest as completed and award points
    const updatedUser = await this.db.transaction(async (tx) => {
      // Upsert userQuests status
      await tx
        .insert(schema.userQuests)
        .values({
          userId: user.id,
          questId: quest.id,
          status: 'completed',
          completedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [schema.userQuests.userId, schema.userQuests.questId],
          set: {
            status: 'completed',
            completedAt: new Date(),
          },
        });

      // Award points
      const updated = await this.usersService.increasePointsByUserId(
        userId,
        quest.rewardAmount,
        'QUEST_REWARD',
        quest.id,
      );

      return updated;
    });

    this.logger.log(
      `Quest ${quest.actionType} claimed by user ${userId}: +${quest.rewardAmount} points`,
    );

    // Invalidate user cache so next /users/me returns fresh data
    this.usersService.invalidateUserCache(userId);

    return {
      verified: true,
      rewarded: quest.rewardAmount,
      newTotalPoints: updatedUser.totalPoints,
    };
  }
  /**
   * Verify all quests for a user (bulk check)
   * This persists 'claimable' status to DB for any quests that meet conditions.
   */
  async verifyAllUserQuests(address: string, fid?: number) {
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.walletAddress, address.toLowerCase()),
    });
    if (!user) throw new BadRequestException('User not found');

    const quests = await this.db.query.quests.findMany({
      where: eq(schema.quests.isActive, true),
    });

    const userQuests = await this.db.query.userQuests.findMany({
      where: eq(schema.userQuests.userId, user.id),
    });

    const results: { questId: string; status: string }[] = [];

    for (const quest of quests) {
      // Skip if already completed
      const uq = userQuests.find((u) => u.questId === quest.id);
      if (uq?.status === 'completed') continue;

      // Check condition using QuestVerificationService
      const isValid = await this.questVerificationService.verify(
        quest.platform as Platform,
        quest.actionType as ActionType,
        { address, fid },
      );

      if (isValid) {
        // Mark as 'claimable'
        await this.db
          .insert(schema.userQuests)
          .values({
            userId: user.id,
            questId: quest.id,
            status: 'claimable',
          })
          .onConflictDoUpdate({
            target: [schema.userQuests.userId, schema.userQuests.questId],
            set: {
              status: 'claimable',
            },
            where: eq(schema.userQuests.status, 'pending'),
          });
        results.push({ questId: quest.id, status: 'claimable' });
      }
    }

    return { success: true, updated: results };
  }
}
