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
import { ClaimQuestDto } from '../quests/dto/claim-quest.dto';
import { QuestVerificationService } from '../quest-verification/quest-verification.service';
import { Platform, ActionType } from '../quests/quest-types';

@Injectable()
export class UserQuestsService {
  private readonly logger = new Logger(UserQuestsService.name);

  constructor(
    @Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>,
    private usersService: UsersService,
    private questVerificationService: QuestVerificationService,
  ) {}

  /**
   * Get all quests with user's completion status
   * Automatically updates status for on-chain verifiable quests
   */
  async findAllForUser(address: string, fid?: number) {
    // Get user
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.walletAddress, address.toLowerCase()),
    });

    // Get all active quests
    const quests = await this.db.query.quests.findMany({
      where: eq(schema.quests.isActive, true),
      orderBy: (quests, { desc }) => [desc(quests.createdAt)],
    });

    if (!user) {
      // Return quests with default 'pending' status for non-logged-in users
      return quests.map((quest) => ({
        ...quest,
        status: 'pending' as const,
      }));
    }

    // Get user's quest statuses
    const userQuests = await this.db.query.userQuests.findMany({
      where: eq(schema.userQuests.userId, user.id),
    });

    // Merge quest data with user status & Attempt auto-verification
    return Promise.all(
      quests.map(async (quest) => {
        const userQuest = userQuests.find((uq) => uq.questId === quest.id);
        let status = userQuest?.status || ('pending' as const);

        // If not completed or claimable, try auto-verify for specific types
        if (status === 'pending') {
          const autoClaimable = await this.tryAutoVerify(address, user, quest, {
            fid,
          });

          if (autoClaimable) {
            this.logger.log(
              `Auto-verified quest ${quest.actionType} for ${address}`,
            );
            status = 'claimable';

            // Update DB to reflect claimable status to avoid re-checking every time
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
          }
        }

        return {
          ...quest,
          status,
        };
      }),
    );
  }

  /**
   * Try to auto-verify status for a quest using QuestVerificationService
   */
  private async tryAutoVerify(
    address: string,
    user: typeof schema.users.$inferSelect,
    quest: typeof schema.quests.$inferSelect,
    data: { fid?: number },
  ): Promise<boolean> {
    // Delegate all verification to QuestVerificationService
    return this.questVerificationService.verify(
      quest.platform as Platform,
      quest.actionType as ActionType,
      { address, fid: data.fid },
    );
  }

  /**
   * Claim a quest reward after verifying on-chain conditions
   */
  async claimQuest(claimQuestDto: ClaimQuestDto): Promise<{
    verified: boolean;
    rewarded: number;
    newTotalPoints: number;
  }> {
    const { address, questId } = claimQuestDto;

    // 1. Find the quest by ID
    const quest = await this.db.query.quests.findFirst({
      where: eq(schema.quests.id, questId),
    });

    if (!quest) {
      throw new BadRequestException(`Quest not found`);
    }

    this.logger.debug(
      `Claiming quest ${quest.title} (${questId}) for ${address}`,
    );

    // 2. Find the user
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.walletAddress, address.toLowerCase()),
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    // 3. Check if already claimed
    const existingClaim = await this.db.query.userQuests.findFirst({
      where: and(
        eq(schema.userQuests.userId, user.id),
        eq(schema.userQuests.questId, quest.id),
        eq(schema.userQuests.status, 'completed'),
      ),
    });

    if (existingClaim) {
      this.logger.debug(
        `Quest ${quest.actionType} (${questId}) already claimed by ${address}`,
      );
      return {
        verified: false,
        rewarded: 0,
        newTotalPoints: user.totalPoints,
      };
    }

    // 4. Verify quest condition using QuestVerificationService
    const isVerified = await this.questVerificationService.verify(
      quest.platform as Platform,
      quest.actionType as ActionType,
      { address, fid: claimQuestDto.fid },
    );

    if (!isVerified) {
      this.logger.debug(
        `Quest ${quest.actionType} condition not met for ${address}`,
      );
      throw new BadRequestException(
        `Quest ${quest.actionType} condition not met`,
      );
    }

    // 5. Mark quest as completed and award points
    const updatedUser = await this.db.transaction(async (tx) => {
      // Upsert userQuests status (could be pending or claimable before)
      // Drizzle upsert with ON CONFLICT
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
      const updated = await this.usersService.increasePoints(
        address,
        quest.rewardAmount,
        'QUEST_REWARD',
        quest.id,
      );

      return updated;
    });

    this.logger.log(
      `Quest ${quest.actionType} claimed by ${address}: +${quest.rewardAmount} points`,
    );

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
