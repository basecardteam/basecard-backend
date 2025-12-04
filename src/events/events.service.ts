import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { DRIZZLE } from '../db/db.module';
import * as schema from '../db/schema';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { CreateEventDto } from './dto/create-event.dto';
import { BasecardsService } from '../basecards/basecards.service';
import { UsersService } from '../users/users.service';
import { eq, desc } from 'drizzle-orm';
import {
  createPublicClient,
  http,
  webSocket,
  parseAbiItem,
  fallback,
} from 'viem';
import { baseSepolia } from 'viem/chains';

import { AppConfigService } from '../common/configs/app-config.service';

@Injectable()
export class EventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventsService.name);
  private readonly client;
  private readonly contractAddress;
  private unwatch: (() => void) | undefined;

  constructor(
    @Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>,
    private basecardsService: BasecardsService,
    private appConfigService: AppConfigService,
    private usersService: UsersService,
  ) {
    this.contractAddress = this.appConfigService.baseCardContractAddress;
    const wsUrls = this.appConfigService.baseWsRpcUrls;

    this.client = createPublicClient({
      chain: baseSepolia,
      transport: fallback(
        wsUrls.map((url) => webSocket(url)),
        {
          rank: true, // Automatically rank transports by latency/stability
        },
      ),
    });
  }

  async onModuleInit() {
    if (!this.contractAddress) {
      this.logger.warn(
        'BASECARD_CONTRACT_ADDRESS not set, skipping event subscription',
      );
      return;
    }

    this.logger.log('Initializing EventsService...');
    this.subscribeToEvents();
  }

  onModuleDestroy() {
    if (this.unwatch) {
      this.unwatch();
      this.logger.log('Unwatched contract events');
    }
  }

  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly reconnectDelay = 3000; // 3 seconds

  private subscribeToEvents() {
    this.logger.log('Subscribing to MintBaseCard events...');
    try {
      this.unwatch = this.client.watchContractEvent({
        address: this.contractAddress as `0x${string}`,
        abi: [
          parseAbiItem(
            'event MintBaseCard(address indexed user, uint256 indexed tokenId)',
          ),
        ],
        eventName: 'MintBaseCard',
        onLogs: async (logs) => {
          this.reconnectAttempts = 0; // Reset attempts on successful log receipt
          for (const log of logs) {
            await this.processLog(log);
          }
        },
        onError: (error) => {
          this.logger.error('Error in event subscription', error);
          this.reconnect();
        },
      });
    } catch (error) {
      this.logger.error('Failed to set up event watcher', error);
      this.reconnect();
    }
  }

  private reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.error(
        `Max reconnect attempts (${this.maxReconnectAttempts}) reached. Stopping reconnection.`,
      );
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;
    this.logger.log(
      `Attempting to reconnect in ${delay}ms (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`,
    );

    setTimeout(() => {
      this.subscribeToEvents();
    }, delay);
  }

  private async processLog(log: any) {
    const { transactionHash, blockNumber, blockHash, logIndex, args } = log;

    // Check if already exists
    const exists = await this.db.query.contractEvents.findFirst({
      where: eq(schema.contractEvents.transactionHash, transactionHash),
    });

    if (exists) return;

    await this.create({
      transactionHash,
      blockNumber: Number(blockNumber),
      blockHash,
      logIndex: Number(logIndex),
      eventName: 'MintBaseCard',
      args: {
        user: args.user,
        tokenId: args.tokenId?.toString(),
      },
    });
  }

  async create(createEventDto: CreateEventDto) {
    this.logger.log(`Received event: ${createEventDto.eventName}`);

    // 1. Save event to DB
    const [event] = await this.db
      .insert(schema.contractEvents)
      .values({
        transactionHash: createEventDto.transactionHash,
        blockNumber: createEventDto.blockNumber,
        blockHash: createEventDto.blockHash,
        logIndex: createEventDto.logIndex,
        eventName: createEventDto.eventName,
        args: createEventDto.args,
        processed: false,
      })
      .returning();

    // 2. Process Event Logic
    try {
      await this.processEvent(event);

      // Mark as processed
      await this.db
        .update(schema.contractEvents)
        .set({ processed: true })
        .where(eq(schema.contractEvents.id, event.id));

      return { success: true, eventId: event.id };
    } catch (error) {
      this.logger.error(`Failed to process event ${event.id}`, error);
      return { success: false, error: error.message };
    }
  }

  private async processEvent(event: typeof schema.contractEvents.$inferSelect) {
    if (event.eventName === 'MintBaseCard') {
      await this.handleMintBaseCard(event);
    }
    // Add other event handlers here
  }

  private async handleMintBaseCard(
    event: typeof schema.contractEvents.$inferSelect,
  ) {
    const args = event.args as { user: string; tokenId: number | string };

    if (!args.user || args.tokenId === undefined) {
      throw new Error('Invalid args for MintBaseCard');
    }

    const tokenId = Number(args.tokenId);
    this.logger.log(
      `Processing MintBaseCard: User ${args.user}, TokenId ${tokenId}`,
    );

    // Update BaseCard with Token ID (This also updates hasMintedCard)
    await this.basecardsService.updateTokenId(
      args.user,
      tokenId,
      event.transactionHash,
    );

    // Increase User Points (Mint Quest Reward)
    try {
      const mintQuest = await this.db.query.quests.findFirst({
        where: eq(schema.quests.actionType, 'MINT'),
      });

      if (mintQuest) {
        await this.usersService.increasePoints(
          args.user,
          mintQuest.rewardAmount,
          'QUEST_REWARD',
          mintQuest.id,
          event.id,
        );
        this.logger.log(
          `Increased points for user ${args.user} by ${mintQuest.rewardAmount}`,
        );
      } else {
        this.logger.warn('Mint quest not found, skipping point increase');
      }
    } catch (error) {
      this.logger.error(
        `Failed to increase points for user ${args.user}`,
        error,
      );
    }
  }

  async findAll() {
    return this.db.query.contractEvents.findMany({
      orderBy: [desc(schema.contractEvents.createdAt)],
    });
  }
}
