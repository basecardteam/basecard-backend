import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { CreateBasecardDto } from './dto/create-basecard.dto';
import { UpdateBasecardDto } from './dto/update-basecard.dto';
import { DRIZZLE } from '../../db/db.module';
import * as schema from '../../db/schema';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { IpfsService, getBaseCardFilename } from '../ipfs/ipfs.service';
import { ImageService } from './services/image.service';
import { EvmLib } from '../blockchain/evm.lib';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { BasecardDetail } from './types/basecard.types';

@Injectable()
export class BasecardsService {
  private readonly logger = new Logger(BasecardsService.name);

  // In-memory cache for findAll (5 minute TTL)
  private findAllCache: {
    data: any[] | null;
    expiry: number;
    key: string;
  } = { data: null, expiry: 0, key: '' };

  // In-memory cache for findOne (5 minute TTL)
  private findOneCache = new Map<
    string,
    { data: BasecardDetail; expiry: number }
  >();

  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    @Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>,
    private ipfsService: IpfsService,
    private imageService: ImageService,
    private evmLib: EvmLib,
    private configService: ConfigService,
    @Inject(forwardRef(() => UsersService))
    private usersService: UsersService,
  ) {}

  async checkHasMinted(address: string): Promise<boolean> {
    return this.evmLib.getHasMinted(address);
  }

  async create(
    createBasecardDto: CreateBasecardDto,
    file: Express.Multer.File,
    options: { skipSimulation?: boolean; userId?: string } = {},
  ) {
    // Check if user has already minted (Contract check)
    const hasMinted = await this.checkHasMinted(createBasecardDto.address);
    if (hasMinted) {
      // Sync existing on-chain card to DB
      const tokenId = await this.evmLib.getTokenId(createBasecardDto.address);
      if (!tokenId) {
        throw new Error(
          'BaseCard exists on-chain but failed to fetch Token ID.',
        );
      }

      this.logger.log(
        `Syncing existing BaseCard from chain: Address ${createBasecardDto.address}, TokenId ${tokenId}`,
      );

      // Fetch on-chain data
      const cardData = await this.evmLib.getCardData(tokenId);
      if (!cardData) {
        throw new Error('Failed to fetch BaseCard metadata from on-chain URI.');
      }

      // Find user (Reuse user finding logic helper or duplicate for now due to flow)
      let user;
      const address = createBasecardDto.address.toLowerCase();

      // 1. Try finding by userId first
      if (options.userId) {
        user = await this.db.query.users.findFirst({
          where: eq(schema.users.id, options.userId),
        });
      }

      if (!user) {
        throw new Error('User not found to sync existing card.');
      }

      // Transform socials array to object
      const socialsMap: Record<string, string> = {};
      if (cardData.socials && Array.isArray(cardData.socials)) {
        cardData.socials.forEach((item) => {
          if (item.key && item.value) {
            socialsMap[item.key] = item.value;
          }
        });
      }

      // Insert into DB
      const card = await this.db.transaction(async (tx) => {
        // Ensure no duplicate exists
        const existing = await tx.query.basecards.findFirst({
          where: eq(schema.basecards.userId, user!.id),
        });

        if (existing) {
          // If exists (weird state), update it
          const [updated] = await tx
            .update(schema.basecards)
            .set({
              tokenOwner: address,
              tokenId: tokenId,
              nickname: cardData.nickname,
              role: cardData.role,
              bio: cardData.bio,
              imageUri: cardData.imageUri,
              socials: socialsMap,
              updatedAt: new Date(),
            })
            .where(eq(schema.basecards.id, existing.id))
            .returning();
          return updated;
        }

        const [newCard] = await tx
          .insert(schema.basecards)
          .values({
            userId: user!.id,
            tokenOwner: address,
            tokenId: tokenId,
            nickname: cardData.nickname,
            role: cardData.role,
            bio: cardData.bio,
            imageUri: cardData.imageUri,
            socials: socialsMap,
            txHash: '0x000', // dummy tx for syncing
            // TX Hash and Timestamp might be missing, that's fine for sync
          })
          .returning();

        // Update user stats
        await tx
          .update(schema.users)
          .set({ hasMintedCard: true, isNewUser: false })
          .where(eq(schema.users.id, user!.id));

        return newCard;
      });

      this.logger.log(`Synced existing card to DB: ${card.id}`);

      return {
        card_data: {
          nickname: card.nickname || '',
          role: card.role || '',
          bio: card.bio || '',
          imageUri: card.imageUri || '',
        },
        social_keys: Object.keys(socialsMap),
        social_values: Object.values(socialsMap),
        initial_delegates: [], // Cannot retrieve delegates easily without events, ignore for sync
        gatewayUrl:
          card.imageUri?.replace('ipfs://', 'https://ipfs.io/ipfs/') || '',
      };
    }

    let user;

    // 1. Try finding by userId first (most reliable)
    if (options.userId) {
      user = await this.db.query.users.findFirst({
        where: eq(schema.users.id, options.userId),
      });
    }

    // 2. Fallback: Find user by address (Primary or Secondary Wallet)
    if (!user) {
      const address = createBasecardDto.address.toLowerCase();

      // Check primary wallet
      user = await this.db.query.users.findFirst({
        where: eq(schema.users.walletAddress, address),
      });

      // Check secondary wallets if not found
      if (!user) {
        const userWallet = await this.db.query.userWallets.findFirst({
          where: eq(schema.userWallets.walletAddress, address),
        });
        if (userWallet) {
          user = await this.db.query.users.findFirst({
            where: eq(schema.users.id, userWallet.userId),
          });
        }
      }
    }

    if (!user) {
      this.logger.error(
        `User not found for address: ${createBasecardDto.address}, userId: ${options.userId}`,
      );
      throw new Error('User not found');
    }

    // Get user's wallet addresses for initialDelegates
    const userWallets = await this.db.query.userWallets.findMany({
      where: eq(schema.userWallets.userId, user.id),
    });
    const initialDelegates = userWallets.map((w) => w.walletAddress);
    this.logger.debug(
      `Initial delegates for ${createBasecardDto.address}: ${initialDelegates.join(', ')}`,
    );

    // Process Image (Minting)
    this.logger.log('Processing profile image file...');
    const { imageURI, gatewayUrl } = await this.generateAndUploadImage(
      file,
      createBasecardDto.address,
      {
        nickname: createBasecardDto.nickname,
        role: createBasecardDto.role,
        bio: createBasecardDto.bio || '',
      },
      'mint',
    );

    // Simulate Contract Call (Backend Validation)
    // Sanitize socials (remove query params from URLs)
    const sanitizedSocials = this.sanitizeSocials(
      createBasecardDto.socials || {},
    );

    // Filter out empty social values to avoid unnecessary onchain storage
    const filteredSocials = Object.entries(sanitizedSocials).filter(
      ([, value]) => value && value.trim() !== '',
    );
    const socialKeys = filteredSocials.map(([key]) => key);
    const socialValues = filteredSocials.map(([, value]) => value);

    // Simulate Contract Call (Backend Validation) - skip for admin
    if (!options?.skipSimulation) {
      await this.evmLib.simulateMintBaseCard(
        createBasecardDto.address,
        {
          imageUri: imageURI,
          nickname: createBasecardDto.nickname,
          role: createBasecardDto.role,
          bio: createBasecardDto.bio || '',
        },
        socialKeys,
        socialValues,
        initialDelegates,
      );
    }

    const card = await this.db.transaction(async (tx) => {
      // Check if a draft card already exists (e.g., from OAuth before minting)
      const existingDraftCard = await tx.query.basecards.findFirst({
        where: eq(schema.basecards.userId, user.id),
      });

      if (existingDraftCard && existingDraftCard.tokenId === null) {
        // Update the existing draft card with mint data
        // Merge existing OAuth socials with new socials from mint form
        const mergedSocials = {
          ...((existingDraftCard.socials as Record<string, unknown>) || {}),
          ...sanitizedSocials,
        };

        const [updatedCard] = await tx
          .update(schema.basecards)
          .set({
            tokenOwner: createBasecardDto.address.toLowerCase(),
            nickname: createBasecardDto.nickname,
            role: createBasecardDto.role,
            bio: createBasecardDto.bio,
            imageUri: imageURI,
            socials: mergedSocials,
            updatedAt: new Date(),
          })
          .where(eq(schema.basecards.id, existingDraftCard.id))
          .returning();

        this.logger.log(
          `Updated draft card ${updatedCard.id} with mint data (merged OAuth socials)`,
        );
        return updatedCard;
      }

      // No draft card exists, create a new one
      const [newCard] = await tx
        .insert(schema.basecards)
        .values({
          userId: user.id,
          tokenOwner: createBasecardDto.address.toLowerCase(),
          nickname: createBasecardDto.nickname,
          role: createBasecardDto.role,
          bio: createBasecardDto.bio,
          imageUri: imageURI,
          socials: sanitizedSocials,
        })
        .returning();

      return newCard;
    });

    this.logger.log(`Card created: ${card.id}`);

    // Invalidate findAll cache (new card added)
    this.findAllCache.data = null;

    return {
      card_data: {
        nickname: card.nickname,
        role: card.role,
        bio: card.bio,
        imageUri: card.imageUri,
      },
      social_keys: socialKeys,
      social_values: socialValues,
      initial_delegates: initialDelegates,
      gatewayUrl: gatewayUrl,
    };
  }

  private async generateAndUploadImage(
    file: Express.Multer.File,
    address: string,
    profileData: { nickname: string; role: string; bio: string },
    context: 'mint' | 'update' = 'mint',
  ): Promise<{ imageURI: string; gatewayUrl: string; ipfsId: string }> {
    try {
      // 1. Prepare image for NFT
      const preparedImage = await this.imageService.prepareProfileImage(
        file.buffer,
      );

      // 2. Generate NFT PNG
      const nftPngBuffer = await this.imageService.generateNftPng(
        profileData,
        preparedImage.dataUrl,
      );

      // 3. Upload NFT PNG to IPFS
      const ipfsResult = await this.ipfsService.uploadFile(
        nftPngBuffer,
        getBaseCardFilename(address),
        'image/png',
      );

      if (!ipfsResult.success || !ipfsResult.cid || !ipfsResult.id) {
        throw new Error(`IPFS upload failed: ${ipfsResult.error}`);
      }

      const nftUri = `ipfs://${ipfsResult.cid}`;
      const gatewayBase = this.configService.get<string>(
        'PINATA_GATEWAY',
        'https://ipfs.io/ipfs',
      );
      const gatewayUrl = `https://${gatewayBase}/ipfs/${ipfsResult.cid}`;

      if (context === 'mint') {
        this.logger.log(`IPFS Uploaded: ${nftUri}`);
        this.logger.log(`IPFS Gateway: ${gatewayUrl}`);
      } else {
        this.logger.log(`IPFS Uploaded (update): ${nftUri}`);
      }

      return {
        imageURI: nftUri,
        gatewayUrl: gatewayUrl,
        ipfsId: ipfsResult.id,
      };
    } catch (error) {
      this.logger.error(`Generating basecard failed (${context})`, error);
      throw error;
    }
  }

  async findAll(limit: number = 50, offset: number = 0) {
    const cards = await this.db.query.basecards.findMany({
      limit,
      offset,
      orderBy: (basecards, { desc }) => [desc(basecards.createdAt)],
    });

    return cards.map((card) => ({
      id: card.id,
      userId: card.userId,
      nickname: card.nickname,
      role: card.role,
      bio: card.bio,
      socials: card.socials,
      tokenId: card.tokenId,
      imageUri: card.imageUri,
      createdAt: card.createdAt,
      updatedAt: card.updatedAt,
    }));
  }

  async findOne(id: string): Promise<BasecardDetail | null> {
    const now = Date.now();

    // Check cache first
    const cached = this.findOneCache.get(id);
    if (cached && cached.expiry > now) {
      this.logger.debug(`Returning cached findOne result for ${id}`);
      return cached.data;
    }

    const card = await this.db.query.basecards.findFirst({
      where: eq(schema.basecards.id, id),
      with: {
        user: true,
      },
    });

    if (!card) {
      return null;
    }

    // Use DB cached value (refreshed on login)

    const result: BasecardDetail = {
      id: card.id,
      userId: card.userId,
      nickname: card.nickname,
      role: card.role,
      bio: card.bio,
      address: card.user.walletAddress,
      fid: card.user.fid,
      farcasterPfpUrl: card.user.farcasterPfpUrl,
      socials: card.socials,
      tokenId: card.tokenId,
      imageUri: card.imageUri,
      createdAt: card.createdAt,
      updatedAt: card.updatedAt,
    };

    // Update cache
    this.findOneCache.set(id, {
      data: result,
      expiry: now + this.CACHE_TTL_MS,
    });

    return result;
  }

  async update(id: string, updateBasecardDto: UpdateBasecardDto) {
    const [updated] = await this.db
      .update(schema.basecards)
      .set({
        ...updateBasecardDto,
        updatedAt: new Date(),
      })
      .where(eq(schema.basecards.id, id))
      .returning();

    // Invalidate caches
    this.findOneCache.delete(id);
    this.findAllCache.data = null;
    this.logger.debug(`Cache invalidated for basecard ${id}`);

    return updated;
  }

  /**
   * Invalidate basecard cache - call after card data changes from event handler
   */
  invalidateCache(cardId: string) {
    this.findOneCache.delete(cardId);
    this.findAllCache.data = null;
    this.logger.debug(`Cache invalidated for basecard ${cardId}`);
  }

  /**
   * Phase 1: Process update request - upload images but DON'T update DB
   * Returns data for contract call. DB update happens in event listener (Phase 2).
   */
  async processUpdate(
    address: string,
    updateData: {
      nickname?: string;
      role?: string;
      bio?: string;
      socials?: Record<string, string>;
    },
    file: Express.Multer.File,
  ): Promise<{
    card_data: {
      nickname: string;
      role: string;
      bio: string;
      imageUri: string;
    };
    social_keys: string[];
    social_values: string[];
    tokenId: number;
    // For rollback if tx rejected
    uploadedFiles?: {
      ipfsId: string;
    };
  }> {
    // 1. Find existing card
    const existingCard = await this.findByAddress(address);
    if (!existingCard) {
      // Card not found by direct address lookup
      // Try to find via user_wallets table (user might be using a different wallet)
      this.logger.debug(
        `Card not found for address ${address}, checking user_wallets...`,
      );

      // Step 1: Find userId from user_wallets
      const userWallet = await this.db.query.userWallets.findFirst({
        where: eq(schema.userWallets.walletAddress, address.toLowerCase()),
      });

      if (!userWallet) {
        // User wallet not registered at all
        throw new Error('Card not found for address');
      }

      // Step 2: Find card by userId
      const cardByUserId = await this.db.query.basecards.findFirst({
        where: eq(schema.basecards.userId, userWallet.userId),
      });

      if (!cardByUserId) {
        // User has wallet registered but no card minted
        throw new Error('Card not found for address');
      }

      // Step 3: Card exists but owned by different wallet
      // Find the wallet that owns the card
      const ownerWallet = await this.db.query.userWallets.findFirst({
        where: eq(
          schema.userWallets.walletAddress,
          cardByUserId.tokenOwner.toLowerCase(),
        ),
      });

      const requiredClientType = ownerWallet?.clientType || 'unknown';

      this.logger.warn(
        `Card found but owned by different wallet. Current: ${address}, Owner: ${cardByUserId.tokenOwner}, Required client: ${requiredClientType}`,
      );

      // Throw error with structured data for frontend
      const error: any = new Error('WRONG_WALLET');
      error.data = {
        currentAddress: address.toLowerCase(),
        cardOwnerAddress: cardByUserId.tokenOwner.toLowerCase(),
        requiredClientType,
      };
      throw error;
    }

    // 2. Use values directly from frontend (empty string = delete the field)
    const nickname = updateData.nickname ?? '';
    const role = updateData.role ?? '';
    const bio = updateData.bio ?? '';

    // Simplification: Trust frontend payload
    const rawSocials = updateData.socials ? { ...updateData.socials } : {};
    const socials = this.sanitizeSocials(rawSocials as any);

    // 4. Check if card data changed (nickname, role, bio, or profile image)
    const cardDataChanged =
      nickname !== existingCard.nickname ||
      role !== existingCard.role ||
      bio !== existingCard.bio ||
      !!file; // Profile image file provided

    let imageUri = existingCard.imageUri || '';
    let uploadedFiles: { ipfsId: string } | undefined;

    if (cardDataChanged) {
      // Card data changed - need to regenerate NFT image
      if (!file) {
        throw new Error(
          'Profile image file is required when updating card data',
        );
      }

      this.logger.log('Card data changed, regenerating NFT image...');
      this.logger.log('Card data changed, regenerating NFT image...');
      const result = await this.generateAndUploadImage(
        file,
        address,
        {
          nickname,
          role,
          bio,
        },
        'update',
      );
      imageUri = result.imageURI;

      // Only set uploadedFiles if it's a NEW image (different from existing)
      if (result.imageURI !== existingCard.imageUri) {
        uploadedFiles = {
          ipfsId: result.ipfsId,
        };
        this.logger.debug('New image uploaded, rollback will delete it');
      } else {
        this.logger.debug('Image unchanged (same CID), rollback not needed');
      }
    } else {
      // Only socials changed - skip image generation
      this.logger.log('Only socials changed, skipping image generation');
    }

    // 4. Simulate Contract Call (Backend Validation)
    const socialKeys = Object.keys(socials);
    // CRITICAL: Extract handle if value is an object { handle, verified }
    const socialValues = Object.values(socials).map((s: any) =>
      typeof s === 'object' && s !== null ? s.handle : s,
    ) as string[];

    const tokenId = await this.evmLib.getTokenId(address);
    if (!tokenId) {
      throw new Error('Token ID not found for address');
    }

    await this.evmLib.simulateEditBaseCard(
      address,
      tokenId,
      {
        imageUri,
        nickname,
        role,
        bio,
      },
      socialKeys,
      socialValues,
    );

    this.logger.log(`Prepared update for ${address} - awaiting contract call`);

    return {
      card_data: {
        nickname,
        role,
        bio,
        imageUri,
      },
      social_keys: socialKeys,
      social_values: socialValues,
      tokenId,
      uploadedFiles,
    };
  }

  /**
   * Rollback uploaded files when transaction is rejected
   */
  async rollbackUpdate(uploadedFiles: {
    ipfsId: string;
  }): Promise<{ success: boolean }> {
    this.logger.log('Rolling back uploaded files...');
    const results: boolean[] = [];

    if (uploadedFiles.ipfsId) {
      try {
        const ipfsResult = await this.ipfsService.deleteFile(
          uploadedFiles.ipfsId,
        );
        if (ipfsResult.success) {
          this.logger.log(`IPFS file deleted: ${uploadedFiles.ipfsId}`);
          results.push(true);
        } else {
          this.logger.error(`Failed to delete IPFS file: ${ipfsResult.error}`);
          results.push(false);
        }
      } catch (error) {
        this.logger.error(
          `Failed to delete IPFS file: ${uploadedFiles.ipfsId}`,
          error,
        );
        results.push(false);
      }
    }

    return { success: results.every((r) => r) };
  }

  async updateTokenId(
    tokenOwnerAddress: string,
    tokenId: number | null,
    txHash?: string,
  ) {
    let user = await this.db.query.users.findFirst({
      where: eq(schema.users.walletAddress, tokenOwnerAddress.toLowerCase()),
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Find card for user
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (tokenId !== null) {
      updateData.tokenId = tokenId;
    }

    if (txHash) {
      updateData.txHash = txHash;
    }

    const [updated] = await this.db
      .update(schema.basecards)
      .set(updateData)
      .where(eq(schema.basecards.userId, user.id))
      .returning();

    // Also update user hasMintedCard
    await this.db
      .update(schema.users)
      .set({ hasMintedCard: true, isNewUser: false })
      .where(eq(schema.users.id, user.id));

    return updated;
  }

  async findByUserId(userId: string) {
    return this.db.query.basecards.findFirst({
      where: eq(schema.basecards.userId, userId),
      with: {
        user: true,
      },
    });
  }

  async findByAddress(address: string) {
    return this.db.query.basecards.findFirst({
      where: eq(schema.basecards.tokenOwner, address.toLowerCase()),
    });
  }

  async delete(id: string) {
    return this.remove(id);
  }

  remove(id: string) {
    return this.db.delete(schema.basecards).where(eq(schema.basecards.id, id));
  }

  async removeByAddress(address: string) {
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.walletAddress, address.toLowerCase()),
    });

    if (!user) {
      return { success: false, message: 'User not found' };
    }

    // Check if card exists and has tokenId
    const card = await this.db.query.basecards.findFirst({
      where: eq(schema.basecards.userId, user.id),
    });

    if (card && card.tokenId !== null) {
      throw new BadRequestException('Cannot delete minted card');
    }

    // Best effort: Delete IPFS file if exists
    try {
      if (card?.imageUri) {
        const cid = card.imageUri.startsWith('ipfs://')
          ? card.imageUri.replace('ipfs://', '')
          : card.imageUri.split('/ipfs/')[1];

        if (cid) {
          await this.ipfsService.deleteFileByCid(cid);
          this.logger.debug(`Deleted IPFS file: ${cid}`);
        }
      }
    } catch (error) {
      this.logger.warn('Failed to cleanup IPFS during card deletion', error);
    }

    await this.db
      .delete(schema.basecards)
      .where(eq(schema.basecards.userId, user.id));
    return { success: true };
  }

  /**
   * Helper to sanitize social URLs (e.g. remove query params from LinkedIn)
   */
  private sanitizeSocials(socials: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(socials)) {
      // Handle structure { handle, verified } OR string
      let handle = '';
      let verified = false;

      if (typeof value === 'object' && value !== null) {
        handle = (value as any).handle || '';
        verified = (value as any).verified || false;
      } else {
        handle = value as string;
      }

      if (!handle) continue;

      if (key === 'linkedin') {
        try {
          // Check if it looks like a URL
          if (handle.startsWith('http://') || handle.startsWith('https://')) {
            const url = new URL(handle);
            // Remove search params
            url.search = '';
            handle = url.toString();
          }
        } catch (e) {
          // Fallback: keep original handle
        }
      }

      // Store back in the same format
      sanitized[key] =
        typeof value === 'object' && value !== null
          ? { handle, verified }
          : handle;
    }
    return sanitized;
  }
}
