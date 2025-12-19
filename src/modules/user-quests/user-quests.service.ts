import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { DRIZZLE } from '../../db/db.module';
import * as schema from '../../db/schema';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and } from 'drizzle-orm';
import { UsersService } from '../users/users.service';
import { EvmLib } from '../blockchain/evm.lib';
import { ClaimQuestDto } from '../quests/dto/claim-quest.dto';
import { NeynarAPIClient, Configuration } from '@neynar/nodejs-sdk';
import { AppConfigService } from '../../app/configs/app-config.service';

@Injectable()
export class UserQuestsService implements OnModuleInit {
  private readonly logger = new Logger(UserQuestsService.name);
  private neynarClient: NeynarAPIClient | null = null;

  constructor(
    @Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>,
    private usersService: UsersService,
    private evmLib: EvmLib,
    private appConfigService: AppConfigService,
  ) {}

  onModuleInit() {
    const apiKey = this.appConfigService.neynarApiKey;
    if (apiKey) {
      this.neynarClient = new NeynarAPIClient(new Configuration({ apiKey }));
      this.logger.log('Neynar client initialized');
    } else {
      this.logger.warn('NEYNAR_API_KEY is not configured');
    }
  }

  /**
   * Get all quests with user's completion status
   * Automatically updates status for on-chain verifiable quests
   */
  async findAllForUser(address: string, fid?: number) {
    // Get user
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.walletAddress, address),
    });

    // Get all active quests
    const quests = await this.db.query.quests.findMany({
      where: eq(schema.quests.isActive, true),
      orderBy: (quests, { asc }) => [asc(quests.title)],
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
          const autoClaimable = await this.tryAutoVerify(
            address,
            user,
            quest.actionType,
            { fid },
          );

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
   * Try to auto-verify status for specific quest types (MINT, LINK_*)
   */
  private async tryAutoVerify(
    address: string,
    user: typeof schema.users.$inferSelect,
    actionType: string,
    data: { fid?: number },
  ): Promise<boolean> {
    switch (actionType) {
      case 'MINT':
        if (user.hasMintedCard) return true;
        try {
          const hasMinted = await this.evmLib.getHasMinted(address);
          if (hasMinted) {
            this.logger.debug(`Auto-verified MINT for ${address}`);
            return true;
          }
        } catch (e) {
          return false;
        }
        return false;

      case 'LINK_TWITTER':
      case 'LINK_FARCASTER':
      case 'LINK_WEBSITE':
      case 'LINK_GITHUB':
      case 'LINK_LINKEDIN':
      case 'LINK_BASENAME':
      case 'SHARE':
        return this.verifyQuestCondition(address, actionType, data);

      case 'NOTIFICATION':
      case 'FOLLOW':
        return false;

      default:
        return false;
    }
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
      { fid: claimQuestDto.fid },
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
  /**
   * Verify quest condition on-chain
   */
  async verifyQuestCondition(
    address: string,
    actionType: string,
    data?: { fid?: number },
  ): Promise<boolean> {
    try {
      const tokenId = await this.evmLib.getTokenId(address);
      if (!tokenId) {
        // No token = cannot have linked anything (except MINT which is handled separately usually)
        if (actionType === 'MINT') return false;
        return false;
      }

      switch (actionType) {
        case 'MINT':
          return true; // Token ID exists

        case 'LINK_TWITTER':
          return this.evmLib.isSocialLinked(tokenId, 'twitter');
        case 'LINK_FARCASTER':
          return this.evmLib.isSocialLinked(tokenId, 'farcaster');
        case 'LINK_WEBSITE':
          return this.evmLib.isSocialLinked(tokenId, 'website');
        case 'LINK_GITHUB':
          return this.evmLib.isSocialLinked(tokenId, 'github');
        case 'LINK_LINKEDIN':
          return this.evmLib.isSocialLinked(tokenId, 'linkedin');
        case 'LINK_BASENAME':
          return this.evmLib.isSocialLinked(tokenId, 'basename');

        case 'SHARE':
          // Verify using Neynar API
          if (!this.neynarClient) {
            this.logger.warn(
              'Neynar client not initialized (missing API key?)',
            );
            return false;
          }

          if (!data?.fid) {
            this.logger.warn('FID is required for SHARE verification');
            return false;
          }

          try {
            // Fetch recent casts or search for specific content
            // We'll check if they have casted a link to our app or specific text
            // Baseseed domain: baseseed.xyz. Or ipfs link.
            const { casts } = await this.neynarClient.fetchCastsForUser({
              fid: data.fid,
              limit: 5, // Check last 5 casts
            });

            const hasShared = casts.some((cast) => {
              const text = cast.text.toLowerCase();

              const hasText =
                text.includes('basecard') ||
                text.includes('minted my basecard');

              return hasText;
            });

            return hasShared;
          } catch (neynarError) {
            this.logger.error('Neynar verification failed', neynarError);
            return false;
          }

        case 'FOLLOW':
        case 'NOTIFICATION':
          // TODO: Implement actual API check (e.g. Farcaster API / Twitter API)
          // For now, these are optimistic or manual.
          return false;

        default:
          this.logger.warn(`Unknown actionType: ${actionType}`);
          return false;
      }
    } catch (error) {
      this.logger.error(
        `Error verifying quest ${actionType} for ${address}`,
        error,
      );
      return false;
    }
  }

  /**
   * Verify all quests for a user (bulk check)
   * This persists 'claimable' status to DB for any quests that meet conditions.
   */
  async verifyAllUserQuests(address: string, fid?: number) {
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.walletAddress, address),
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

      // Skip if already claimable (optional, but good to ensure consistency)
      // If it's claimable in DB, we don't strictly need to check again unless we want to allow "un-claiming" if condition lost?
      // Usually once claimable, it stays claimable.

      // Check condition
      const isValid = await this.verifyQuestCondition(
        address,
        quest.actionType,
        { fid },
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
