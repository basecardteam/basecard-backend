import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { DRIZZLE } from '../db/db.module';
import * as schema from '../db/schema';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and } from 'drizzle-orm';
import { UsersService } from '../users/users.service';
import { EvmLib } from '../common/libs/evm.lib';
import { ClaimQuestDto } from '../quests/dto/claim-quest.dto';

@Injectable()
export class UserQuestsService {
  private readonly logger = new Logger(UserQuestsService.name);

  constructor(
    @Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>,
    private usersService: UsersService,
    private evmLib: EvmLib,
  ) {}

  /**
   * Get all quests with user's completion status
   */
  async findAllForUser(address: string) {
    // Get user
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.walletAddress, address),
    });

    // Get all active quests
    const quests = await this.db.query.quests.findMany({
      where: eq(schema.quests.isActive, true),
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

    // Merge quest data with user status
    return Promise.all(
      quests.map(async (quest) => {
        const userQuest = userQuests.find((uq) => uq.questId === quest.id);
        let status = userQuest?.status || ('pending' as const);

        // Auto-detect MINT completion
        if (quest.actionType === 'MINT' && status === 'pending') {
          // Check DB first
          if (user.hasMintedCard) {
            status = 'claimable';
          } else {
            // Check Chain (in case of external mint or sync issue)
            try {
              const hasMinted = await this.evmLib.getHasMinted(address);
              if (hasMinted) status = 'claimable';
            } catch (error) {
              this.logger.warn(
                `Failed to check MINT status for ${address}`,
                error,
              );
            }
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
    // We store raw address, so no normalization needed as per user request
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.walletAddress, address),
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

    // 4. Verify quest condition based on actionType
    const isVerified = await this.verifyQuestCondition(
      address,
      quest.actionType,
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
   * Verify quest condition on-chain
   */
  async verifyQuestCondition(
    address: string,
    actionType: string,
  ): Promise<boolean> {
    try {
      const tokenId = await this.evmLib.getTokenId(address);
      if (!tokenId) {
        this.logger.debug(
          `No tokenId found for ${address} during quest check: ${actionType}`,
        );
        return false;
      }

      switch (actionType) {
        case 'MINT':
          // If tokenId exists, they have minted
          return true;

        case 'LINK_SOCIAL':
          const keys = [
            'twitter',
            'github',
            'farcaster',
            'instagram',
            'telegram',
            'website',
          ];
          for (const key of keys) {
            const isLinked = await this.evmLib.isSocialLinked(tokenId, key);
            if (isLinked) return true;
          }
          return false;

        case 'LINK_BASENAME':
          return this.evmLib.isSocialLinked(tokenId, 'basename');

        default:
          this.logger.warn(
            `Unknown actionType: ${actionType}, auto-verify true (legacy logic)`,
          );
          return true;
      }
    } catch (error) {
      this.logger.error(
        `Error verifying quest ${actionType} for ${address}`,
        error,
      );
      return false;
    }
  }
}
