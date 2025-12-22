import {
  BadRequestException,
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

@Injectable()
export class BasecardsService {
  private readonly logger = new Logger(BasecardsService.name);

  constructor(
    @Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>,
    private ipfsService: IpfsService,
    private imageService: ImageService,
    private evmLib: EvmLib,
    private configService: ConfigService,
  ) {}

  async checkHasMinted(address: string): Promise<boolean> {
    return this.evmLib.getHasMinted(address);
  }

  async create(
    createBasecardDto: CreateBasecardDto,
    file: Express.Multer.File,
  ) {
    // Check if user has already minted (Contract check)
    const hasMinted = await this.checkHasMinted(createBasecardDto.address);
    if (hasMinted) {
      throw new Error(
        'You have already minted a BaseCard. Each address can only mint once.',
      );
    }

    // Find user by address to get ID
    const user = await this.db.query.users.findFirst({
      where: eq(
        schema.users.walletAddress,
        createBasecardDto.address.toLowerCase(),
      ),
    });

    if (!user) {
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
    const { imageURI } = await this.processMinting(file, createBasecardDto);

    // Simulate Contract Call (Backend Validation)
    // Filter out empty social values to avoid unnecessary onchain storage
    const filteredSocials = createBasecardDto.socials
      ? Object.entries(createBasecardDto.socials).filter(
          ([, value]) => value && value.trim() !== '',
        )
      : [];
    const socialKeys = filteredSocials.map(([key]) => key);
    const socialValues = filteredSocials.map(([, value]) => value);

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

    const card = await this.db.transaction(async (tx) => {
      const [newCard] = await tx
        .insert(schema.basecards)
        .values({
          userId: user.id,
          nickname: createBasecardDto.nickname,
          role: createBasecardDto.role,
          bio: createBasecardDto.bio,
          imageUri: imageURI,
          socials: createBasecardDto.socials,
        })
        .returning();

      return newCard;
    });

    this.logger.log(`Card created: ${card.id}`);

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
    };
  }

  async processMinting(
    file: Express.Multer.File,
    dto: CreateBasecardDto,
  ): Promise<{ imageURI: string }> {
    try {
      // 1. Prepare image for NFT
      const preparedImage = await this.imageService.prepareProfileImage(
        file.buffer,
      );

      // 2. Generate NFT PNG
      const profileData = {
        nickname: dto.nickname,
        role: dto.role,
        bio: dto.bio,
      };

      const nftPngBuffer = await this.imageService.generateNftPng(
        profileData,
        preparedImage.dataUrl,
      );

      // 3. Upload NFT PNG to IPFS
      const ipfsResult = await this.ipfsService.uploadFile(
        nftPngBuffer,
        getBaseCardFilename(dto.address),
        'image/png',
      );

      if (!ipfsResult.success || !ipfsResult.cid) {
        throw new Error(`IPFS upload failed: ${ipfsResult.error}`);
      }
      const nftUri = `ipfs://${ipfsResult.cid}`;
      const gatewayBase = this.configService.get<string>(
        'IPFS_GATEWAY_URL',
        'https://ipfs.io/ipfs',
      );
      const gatewayUrl = `https://${gatewayBase}/${ipfsResult.cid}`;
      this.logger.log(`IPFS Uploaded: ${nftUri}`);
      this.logger.log(`IPFS Gateway: ${gatewayUrl}`);

      return {
        imageURI: nftUri,
      };
    } catch (error) {
      this.logger.error('Generating basecard failed', error);
      throw error;
    }
  }

  async findAll(limit: number = 50, offset: number = 0) {
    const cards = await this.db.query.basecards.findMany({
      with: {
        user: true,
      },
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
      address: card.user.walletAddress,
      socials: card.socials,
      tokenId: card.tokenId,
      imageUri: card.imageUri,
      createdAt: card.createdAt,
      updatedAt: card.updatedAt,
    }));
  }

  async findOne(id: string) {
    const card = await this.db.query.basecards.findFirst({
      where: eq(schema.basecards.id, id),
      with: {
        user: true,
      },
    });

    if (!card) {
      return null;
    }

    return {
      id: card.id,
      userId: card.userId,
      nickname: card.nickname,
      role: card.role,
      bio: card.bio,
      address: card.user.walletAddress,
      socials: card.socials,
      tokenId: card.tokenId,
      imageUri: card.imageUri,
      createdAt: card.createdAt,
      updatedAt: card.updatedAt,
    };
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
    return updated;
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
    // For rollback if tx rejected
    uploadedFiles?: {
      ipfsId: string;
    };
  }> {
    // 1. Find existing card
    const existingCard = await this.findByAddress(address);
    if (!existingCard) {
      throw new Error('Card not found for address');
    }

    // 2. Use values directly from frontend (empty string = delete the field)
    const nickname = updateData.nickname ?? '';
    const role = updateData.role ?? '';
    const bio = updateData.bio ?? '';
    const socials = updateData.socials ? { ...updateData.socials } : {};

    // 3. Handle removal: if a handle was in DB but not in update request, add it as empty string
    // This ensures it is properly cleared on-chain during editBaseCard call
    if (existingCard.socials) {
      const existingKeys = Object.keys(existingCard.socials);
      for (const key of existingKeys) {
        if (socials[key] === undefined) {
          socials[key] = '';
        }
      }
    }

    // 3. Process image if provided
    let imageUri = existingCard.imageUri || '';
    let uploadedFiles: { ipfsId: string } | undefined;

    if (!file) {
      throw new Error('No file provided');
    }

    this.logger.log('Processing updated profile image...');
    const result = await this.processUpdateImage(file, address, {
      nickname,
      role,
      bio,
    });
    imageUri = result.imageURI;
    uploadedFiles = {
      ipfsId: result.ipfsId,
    };

    // 4. Simulate Contract Call (Backend Validation)
    const socialKeys = Object.keys(socials);
    const socialValues = Object.values(socials) as string[];

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
      uploadedFiles,
    };
  }

  /**
   * Process image for update (IPFS upload, no DB update)
   */
  private async processUpdateImage(
    file: Express.Multer.File,
    address: string,
    profileData: { nickname: string; role: string; bio: string },
  ): Promise<{
    imageURI: string;
    ipfsId: string;
  }> {
    let ipfsId = '';
    try {
      // A. Prepare image for NFT
      const preparedImage = await this.imageService.prepareProfileImage(
        file.buffer,
      );

      // B. Generate NFT PNG
      const nftPngBuffer = await this.imageService.generateNftPng(
        profileData,
        preparedImage.dataUrl,
      );

      // C. Upload NFT PNG to IPFS
      const ipfsResult = await this.ipfsService.uploadFile(
        nftPngBuffer,
        getBaseCardFilename(address),
        'image/png',
      );

      if (!ipfsResult.success || !ipfsResult.cid || !ipfsResult.id) {
        throw new Error(`IPFS upload failed: ${ipfsResult.error}`);
      }
      ipfsId = ipfsResult.id;
      const nftUri = `ipfs://${ipfsResult.cid}`;
      this.logger.log(`IPFS Uploaded (update): ${nftUri}`);

      return {
        imageURI: nftUri,
        ipfsId,
      };
    } catch (error) {
      this.logger.error('Processing update image failed', error);
      // Cleanup on failure
      if (ipfsId) {
        await this.ipfsService.deleteFile(ipfsId).catch(() => {});
      }
      throw error;
    }
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
    address: string,
    tokenId: number | null,
    txHash?: string,
  ) {
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.walletAddress, address.toLowerCase()),
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
      .set({ hasMintedCard: true })
      .where(eq(schema.users.id, user.id));

    return updated;
  }

  async findByAddress(address: string) {
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.walletAddress, address.toLowerCase()),
    });

    if (!user) {
      return null;
    }

    return this.db.query.basecards.findFirst({
      where: eq(schema.basecards.userId, user.id),
      with: {
        user: true,
      },
    });
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
}
