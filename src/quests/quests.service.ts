import {
  Inject,
  Injectable,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { CreateQuestDto } from './dto/create-quest.dto';
import { UpdateQuestDto } from './dto/update-quest.dto';
import { ClaimQuestDto } from './dto/claim-quest.dto';
import { DRIZZLE } from '../db/db.module';
import * as schema from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { UsersService } from '../users/users.service';
import { AppConfigService } from '../common/configs/app-config.service';
import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';

@Injectable()
export class QuestsService {
  private readonly logger = new Logger(QuestsService.name);
  private readonly publicClient;
  private readonly contractAddress: string;

  constructor(
    @Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>,
    private usersService: UsersService,
    private appConfigService: AppConfigService,
  ) {
    this.contractAddress = this.appConfigService.baseCardContractAddress || '';
    this.publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(this.appConfigService.baseRpcUrl),
    });
  }

  async create(createQuestDto: CreateQuestDto) {
    const [quest] = await this.db
      .insert(schema.quests)
      .values(createQuestDto)
      .returning();
    return quest;
  }

  findAll() {
    return this.db.query.quests.findMany({
      where: eq(schema.quests.isActive, true),
    });
  }

  /**
   * Get all quests with user's completion status
   */
  async findAllForUser(address: string) {
    const normalizedAddress = address.toLowerCase();

    // Get user
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.walletAddress, normalizedAddress),
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
    return quests.map((quest) => {
      const userQuest = userQuests.find((uq) => uq.questId === quest.id);
      return {
        ...quest,
        status: userQuest?.status || ('pending' as const),
      };
    });
  }

  findOne(id: string) {
    return this.db.query.quests.findFirst({
      where: eq(schema.quests.id, id),
    });
  }

  async update(id: string, updateQuestDto: UpdateQuestDto) {
    const [updated] = await this.db
      .update(schema.quests)
      .set(updateQuestDto)
      .where(eq(schema.quests.id, id))
      .returning();
    return updated;
  }

  remove(id: string) {
    return this.db.delete(schema.quests).where(eq(schema.quests.id, id));
  }

  /**
   * Claim a quest reward after verifying on-chain conditions
   */
  async claimQuest(claimQuestDto: ClaimQuestDto): Promise<{
    verified: boolean;
    rewarded: number;
    newTotalPoints: number;
  }> {
    const { address, actionType } = claimQuestDto;
    const normalizedAddress = address.toLowerCase();

    // 1. Find the quest by actionType
    const quest = await this.db.query.quests.findFirst({
      where: eq(schema.quests.actionType, actionType),
    });

    if (!quest) {
      throw new BadRequestException(
        `Quest with actionType '${actionType}' not found`,
      );
    }

    // 2. Find the user
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.walletAddress, normalizedAddress),
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
      this.logger.debug(`Quest ${actionType} already claimed by ${address}`);
      return {
        verified: false,
        rewarded: 0,
        newTotalPoints: user.totalPoints,
      };
    }

    // 4. Verify quest condition based on actionType
    const isVerified = await this.verifyQuestCondition(
      normalizedAddress,
      actionType,
    );

    if (!isVerified) {
      this.logger.debug(`Quest ${actionType} condition not met for ${address}`);
      return {
        verified: false,
        rewarded: 0,
        newTotalPoints: user.totalPoints,
      };
    }

    // 5. Mark quest as completed and award points
    const updatedUser = await this.db.transaction(async (tx) => {
      // Update userQuests status
      await tx
        .update(schema.userQuests)
        .set({
          status: 'completed',
          completedAt: new Date(),
        })
        .where(
          and(
            eq(schema.userQuests.userId, user.id),
            eq(schema.userQuests.questId, quest.id),
          ),
        );

      // Award points
      const updated = await this.usersService.increasePoints(
        normalizedAddress,
        quest.rewardAmount,
        'QUEST_REWARD',
        quest.id,
      );

      return updated;
    });

    this.logger.log(
      `Quest ${actionType} claimed by ${address}: +${quest.rewardAmount} points`,
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
  private async verifyQuestCondition(
    address: string,
    actionType: string,
  ): Promise<boolean> {
    switch (actionType) {
      case 'MINT':
        return this.verifyMintQuest(address);
      default:
        this.logger.warn(`Unknown actionType: ${actionType}, auto-verify true`);
        return true;
    }
  }

  /**
   * Verify MINT quest: check if user has minted a BaseCard (tokenId > 0)
   */
  private async verifyMintQuest(address: string): Promise<boolean> {
    try {
      const tokenId = await this.publicClient.readContract({
        address: this.contractAddress as `0x${string}`,
        abi: [
          {
            inputs: [{ name: 'owner', type: 'address' }],
            name: 'tokenIdOf',
            outputs: [{ name: '', type: 'uint256' }],
            stateMutability: 'view',
            type: 'function',
          },
        ],
        functionName: 'tokenIdOf',
        args: [address as `0x${string}`],
      });

      const hasToken = BigInt(tokenId) > 0n;
      this.logger.debug(
        `tokenIdOf(${address}): ${tokenId}, hasToken: ${hasToken}`,
      );
      return hasToken;
    } catch (error) {
      this.logger.error(`Failed to verify mint quest for ${address}`, error);
      // If contract call fails, check DB as fallback
      const user = await this.db.query.users.findFirst({
        where: eq(schema.users.walletAddress, address),
      });
      return user?.hasMintedCard ?? false;
    }
  }
}
