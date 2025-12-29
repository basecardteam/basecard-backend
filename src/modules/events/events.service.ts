import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { DRIZZLE } from '../../db/db.module';
import * as schema from '../../db/schema';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { CreateEventDto } from './dto/create-event.dto';
import { BasecardsService } from '../basecards/basecards.service';
import { UsersService } from '../users/users.service';
import { eq, desc, and } from 'drizzle-orm';
import { createPublicClient, webSocket, fallback, http, Log } from 'viem';
import { baseSepolia, base } from 'viem/chains';

import { AppConfigService } from '../../app/configs/app-config.service';
import { EvmLib } from '../blockchain/evm.lib';
import { IpfsService, getBaseCardFilename } from '../ipfs/ipfs.service';
import * as BaseCardABI from '../blockchain/abi/BaseCard.json';

// Event names we listen to
type EventName =
  | 'MintBaseCard'
  | 'SocialLinked'
  | 'SocialUnlinked'
  | 'BaseCardEdited';

@Injectable()
export class EventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventsService.name);
  private readonly client;
  private readonly contractAddress;
  private unwatchers: (() => void)[] = [];

  constructor(
    @Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>,
    private basecardsService: BasecardsService,
    private usersService: UsersService,
    private appConfigService: AppConfigService,
    private evmLib: EvmLib,
    private ipfsService: IpfsService,
  ) {
    this.contractAddress = this.appConfigService.baseCardContractAddress;

    // Select chain based on configured CHAIN_ID
    const chainId = this.appConfigService.chainId;
    const chain = chainId === 8453 ? base : baseSepolia;

    // Create fallback transports from separate URL lists
    const wsUrls = this.appConfigService.baseWsRpcUrls;
    const httpUrls = this.appConfigService.baseHttpRpcUrls;

    const transports = [
      ...wsUrls.map((url) => webSocket(url, { timeout: 2_000, retryCount: 0 })),
      ...httpUrls.map((url) => http(url, { timeout: 2_000, retryCount: 0 })),
    ];

    this.client = createPublicClient({
      chain,
      transport: fallback(transports, {
        rank: false,
      }),
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
    this.subscribeToAllEvents();
  }

  onModuleDestroy() {
    this.unwatchers.forEach((unwatch) => unwatch());
    this.logger.log('Unwatched all contract events');
  }

  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 0;
  private readonly reconnectDelay = 3000;

  private subscribeToAllEvents() {
    this.logger.log('Subscribing to all BaseCard events...');

    try {
      // Subscribe to all events at once
      const unwatch = this.client.watchContractEvent({
        address: this.contractAddress as `0x${string}`,
        abi: BaseCardABI.abi as any,
        onLogs: async (logs: Log[]) => {
          this.reconnectAttempts = 0;
          for (const log of logs) {
            await this.processLog(log);
          }
        },
        onError: (error: Error) => {
          this.logger.error('Error in event subscription', error);
          this.reconnect();
        },
      });

      this.unwatchers.push(unwatch);
      this.logger.log(
        'Subscribed to events: MintBaseCard, SocialLinked, SocialUnlinked, BaseCardEdited',
      );
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
      this.subscribeToAllEvents();
    }, delay);
  }

  private async getTransactionDetails(txHash: `0x${string}`) {
    try {
      const receipt = await this.client.getTransactionReceipt({ hash: txHash });
      return {
        fromAddress: receipt.from,
        toAddress: receipt.to || null,
        gasUsed: receipt.gasUsed.toString(),
        effectiveGasPrice: receipt.effectiveGasPrice.toString(),
        txStatus: receipt.status === 'success' ? 'success' : 'reverted',
      };
    } catch (error) {
      this.logger.error(`Failed to get tx receipt for ${txHash}`, error);
      return null;
    }
  }

  private async processLog(log: any) {
    const { transactionHash, blockNumber, blockHash, logIndex, args } = log;
    const eventName = log.eventName as EventName;

    if (!eventName) {
      this.logger.warn(
        `Unknown event received: ${JSON.stringify(log, (_, v) => (typeof v === 'bigint' ? v.toString() : v))}`,
      );
      return;
    }

    // Check if already exists
    const exists = await this.db.query.contractEvents.findFirst({
      where: and(
        eq(schema.contractEvents.transactionHash, transactionHash),
        eq(schema.contractEvents.logIndex, Number(logIndex)),
      ),
    });

    if (exists) {
      this.logger.debug(`Event already processed: ${transactionHash}`);
      return;
    }

    // Get TX receipt details
    const txDetails = await this.getTransactionDetails(
      transactionHash as `0x${string}`,
    );

    // Serialize args based on event type
    const serializedArgs = this.serializeArgs(eventName, args);

    await this.create({
      transactionHash,
      blockNumber: Number(blockNumber),
      blockHash,
      logIndex: Number(logIndex),
      eventName,
      args: serializedArgs,
      ...(txDetails || {}),
    });
  }

  private serializeArgs(eventName: string, args: any): Record<string, any> {
    // Helper to convert BigInt to string
    const serializeValue = (val: any): any => {
      if (typeof val === 'bigint') return val.toString();
      if (Array.isArray(val)) return val.map(serializeValue);
      if (typeof val === 'object' && val !== null) {
        return Object.fromEntries(
          Object.entries(val).map(([k, v]) => [k, serializeValue(v)]),
        );
      }
      return val;
    };

    switch (eventName) {
      case 'MintBaseCard':
        return {
          user: args.user,
          tokenId: args.tokenId?.toString(),
        };
      case 'SocialLinked':
        return {
          tokenId: args.tokenId?.toString(),
          key: args.key,
          value: args.value,
        };
      case 'SocialUnlinked':
        return {
          tokenId: args.tokenId?.toString(),
          key: args.key,
        };
      case 'BaseCardEdited':
        return {
          tokenId: args.tokenId?.toString(),
        };
      case 'Transfer':
        return {
          from: args.from,
          to: args.to,
          tokenId: args.tokenId?.toString(),
        };
      case 'TokenDelegateGranted':
        return {
          tokenId: args.tokenId?.toString(),
          delegate: args.delegate,
        };
      default:
        // Serialize all BigInt values in unknown events
        return serializeValue(args);
    }
  }

  async create(createEventDto: CreateEventDto) {
    this.logger.log(`Received event: ${createEventDto.eventName}`);

    // 1. Save event to DB with TX receipt details
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
        // TX Receipt Details
        fromAddress: createEventDto.fromAddress,
        toAddress: createEventDto.toAddress,
        gasUsed: createEventDto.gasUsed,
        effectiveGasPrice: createEventDto.effectiveGasPrice,
        txStatus: createEventDto.txStatus,
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
    switch (event.eventName) {
      case 'MintBaseCard':
        await this.handleMintBaseCard(event);
        break;
      case 'SocialLinked':
        await this.handleSocialLinked(event);
        break;
      case 'SocialUnlinked':
        await this.handleSocialUnlinked(event);
        break;
      case 'BaseCardEdited':
        await this.handleBaseCardEdited(event);
        break;
      default:
        this.logger.warn(`Unhandled event type: ${event.eventName}`);
    }
  }

  private async handleMintBaseCard(
    event: typeof schema.contractEvents.$inferSelect,
  ) {
    const args = event.args as {
      user: string;
      tokenId: number | string;
    };

    if (!args.user || args.tokenId === undefined) {
      throw new Error('Invalid args for MintBaseCard');
    }

    const tokenOwnerAddress = args.user.toLowerCase();

    const tokenId = Number(args.tokenId);
    this.logger.log(
      `Processing MintBaseCard: User ${tokenOwnerAddress}, TokenId ${tokenId}`,
    );

    // Update BaseCard with Token ID (This also updates hasMintedCard)
    await this.basecardsService.updateTokenId(
      tokenOwnerAddress,
      tokenId,
      event.transactionHash,
    );

    // Mark MINT quest as claimable
    try {
      const basecard = await this.db.query.basecards.findFirst({
        where: eq(schema.basecards.tokenOwner, tokenOwnerAddress),
      });

      if (basecard?.userId) {
        const mintQuest = await this.db.query.quests.findFirst({
          where: eq(schema.quests.actionType, 'MINT'),
        });

        if (mintQuest) {
          await this.db
            .update(schema.userQuests)
            .set({ status: 'claimable' })
            .where(
              and(
                eq(schema.userQuests.userId, basecard.userId),
                eq(schema.userQuests.questId, mintQuest.id),
              ),
            );
          this.logger.log(
            `MINT quest marked as claimable for user ${tokenOwnerAddress}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to update quest status for user ${tokenOwnerAddress}`,
        error,
      );
    }
  }

  private async handleSocialLinked(
    event: typeof schema.contractEvents.$inferSelect,
  ) {
    const args = event.args as { tokenId: string; key: string; value: string };
    this.logger.log(
      `Processing SocialLinked: TokenId ${args.tokenId}, ${args.key}=${args.value}`,
    );
    // Currently just logging - no business logic needed
  }

  private async handleSocialUnlinked(
    event: typeof schema.contractEvents.$inferSelect,
  ) {
    const args = event.args as { tokenId: string; key: string };
    this.logger.log(
      `Processing SocialUnlinked: TokenId ${args.tokenId}, key=${args.key}`,
    );
    // Currently just logging - no business logic needed
  }

  /**
   * Phase 2: Sync onchain data to DB after contract editBaseCard call
   */
  private async handleBaseCardEdited(
    event: typeof schema.contractEvents.$inferSelect,
  ) {
    const args = event.args as { tokenId: string };
    const tokenId = Number(args.tokenId);
    this.logger.log(`Processing BaseCardEdited: TokenId ${tokenId}`);

    try {
      // 1. Get owner address from onchain
      const ownerAddress = await this.evmLib.getOwnerOf(tokenId);
      if (!ownerAddress) {
        this.logger.error(`Could not find owner for token ${tokenId}`);
        return;
      }

      // 2. Get latest card data from onchain
      const onchainData = await this.evmLib.getCardData(tokenId);
      if (!onchainData) {
        this.logger.error(`Could not fetch card data for token ${tokenId}`);
        return;
      }

      // 3. Find user in DB
      const user = await this.db.query.users.findFirst({
        where: eq(schema.users.walletAddress, ownerAddress.toLowerCase()),
        with: { card: true },
      });

      if (!user) {
        this.logger.warn(`User not found for address ${ownerAddress}`);
        return;
      }

      if (!user.card) {
        this.logger.warn(`Card not found for user ${ownerAddress}`);
        return;
      }

      // 4. Convert socials array to object
      const socialsObj: Record<string, string> = {};
      if (onchainData.socials && Array.isArray(onchainData.socials)) {
        for (const social of onchainData.socials) {
          if (social.key && social.value) {
            socialsObj[social.key] = social.value;
          }
        }
      }

      // 5. Update basecards table with onchain data
      await this.db
        .update(schema.basecards)
        .set({
          nickname: onchainData.nickname,
          role: onchainData.role,
          bio: onchainData.bio,
          imageUri: onchainData.imageUri,
          socials: socialsObj,
          updatedAt: new Date(),
        })
        .where(eq(schema.basecards.id, user.card.id));

      this.logger.log(
        `Updated card ${user.card.id} with onchain data for token ${tokenId}`,
      );

      // 6. Invalidate caches so GET /users/me returns fresh data
      this.usersService.invalidateUserCache(user.id);
      this.basecardsService.invalidateCache(user.card.id);
      this.logger.debug(
        `Cache invalidated for user ${user.id} and card ${user.card.id}`,
      );

      // 6. Cleanup old IPFS files, keeping only the latest one
      if (onchainData.imageUri) {
        const currentCid = onchainData.imageUri.startsWith('ipfs://')
          ? onchainData.imageUri.replace('ipfs://', '')
          : onchainData.imageUri.split('/ipfs/')[1];

        if (currentCid) {
          const filename = getBaseCardFilename(ownerAddress);
          const result = await this.ipfsService.deleteOldFilesByName(
            filename,
            currentCid,
          );
          if (result.deletedCount > 0) {
            this.logger.log(
              `Cleaned up ${result.deletedCount} old IPFS files for ${ownerAddress}`,
            );
          }
        }
      }
    } catch (error) {
      this.logger.error(
        `Error processing BaseCardEdited for token ${tokenId}`,
        error,
      );
    }
  }

  async findAll() {
    return this.db.query.contractEvents.findMany({
      orderBy: [desc(schema.contractEvents.createdAt)],
    });
  }

  async findByEventName(eventName: string) {
    return this.db.query.contractEvents.findMany({
      where: eq(schema.contractEvents.eventName, eventName),
      orderBy: [desc(schema.contractEvents.createdAt)],
    });
  }
}
