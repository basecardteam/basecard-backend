import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { CreateBasecardDto } from './dto/create-basecard.dto';
import { UpdateBasecardDto } from './dto/update-basecard.dto';
import { DRIZZLE } from '../db/db.module';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { S3Service } from '../common/services/s3.service';
import { IpfsService } from '../common/services/ipfs.service';
import { ImageService } from '../common/services/image.service';

@Injectable()
export class BasecardsService {
  private readonly logger = new Logger(BasecardsService.name);

  constructor(
    @Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>,
    private s3Service: S3Service,
    private ipfsService: IpfsService,
    private imageService: ImageService,
  ) {}

  async checkHasMinted(address: string): Promise<boolean> {
    // TODO: Implement contract check
    // const { data: hasMinted } = useReadContract({
    //     address: BASECARD_CONTRACT_ADDRESS,
    //     abi: baseCardAbi,
    //     functionName: "hasMinted",
    //     args: userAddress ? [userAddress] : undefined,
    // });
    return false;
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
      where: eq(schema.users.walletAddress, createBasecardDto.address),
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Process Image (Minting)
    this.logger.log('Processing profile image file...');
    const { imageURI, profileImage } = await this.processMinting(
      file,
      createBasecardDto,
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

      // Update user with profile image
      if (profileImage) {
        await tx
          .update(schema.users)
          .set({ profileImage: profileImage })
          .where(eq(schema.users.id, user.id));
      }

      return newCard;
    });

    // Format response as per spec
    const socialKeys = createBasecardDto.socials
      ? Object.keys(createBasecardDto.socials)
      : [];
    const socialValues = createBasecardDto.socials
      ? Object.values(createBasecardDto.socials)
      : [];

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
    };
  }

  async processMinting(
    file: Express.Multer.File,
    dto: CreateBasecardDto,
  ): Promise<{ imageURI: string; profileImage: string }> {
    let s3Key = '';
    try {
      // A. Parallel: Optimize image for S3 + Prepare image for NFT
      const [optimized, preparedImage] = await Promise.all([
        this.imageService.optimizeImage(file.buffer),
        this.imageService.prepareProfileImage(file.buffer),
      ]);

      s3Key = `profiles/${dto.address}/${Date.now()}-${file.originalname.split('.')[0]}.webp`;

      // B. Parallel: Upload to S3 + Generate NFT PNG
      const profileData = {
        nickname: dto.nickname,
        role: dto.role,
        bio: dto.bio,
      };

      const [profileImageUrl, nftPngBuffer] = await Promise.all([
        this.s3Service.uploadFile(
          Buffer.from(optimized.base64, 'base64'),
          s3Key,
          optimized.mimeType,
        ),
        this.imageService.generateNftPng(profileData, preparedImage.dataUrl),
      ]);

      this.logger.log(`S3 Uploaded: ${profileImageUrl}`);

      // C. Upload NFT PNG to IPFS (depends on nftPngBuffer)
      const ipfsResult = await this.ipfsService.uploadFile(
        nftPngBuffer,
        `nft-${dto.address}-${Date.now()}.png`,
        'image/png',
      );

      if (!ipfsResult.success || !ipfsResult.cid) {
        throw new Error(`IPFS upload failed: ${ipfsResult.error}`);
      }
      const nftUri = `ipfs://${ipfsResult.cid}`;
      this.logger.log(`IPFS Uploaded: ${nftUri}`);

      return {
        imageURI: nftUri,
        profileImage: profileImageUrl,
      };
    } catch (error) {
      this.logger.error('Generating basecard failed', error);

      // when something goes wrong, delete the profile image from S3
      if (s3Key) {
        await this.s3Service.deleteFile(s3Key);
      }

      throw error;
    }
  }

  async findAll() {
    const cards = await this.db.query.basecards.findMany({
      with: {
        user: true,
      },
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

  async updateTokenId(
    address: string,
    tokenId: number | null,
    txHash?: string,
  ) {
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.walletAddress, address),
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
      where: eq(schema.users.walletAddress, address),
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
      where: eq(schema.users.walletAddress, address),
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

    // Best effort: Delete images from S3 and IPFS in parallel
    try {
      // Extract S3 key from Supabase URL
      let s3Key = '';
      if (user.profileImage) {
        const parts = user.profileImage.split('basecard-assets/');
        if (parts.length === 2) {
          s3Key = parts[1];
        }
      }

      // Extract CID from IPFS URL
      let cid = '';
      if (card && card.imageUri) {
        if (card.imageUri.startsWith('ipfs://')) {
          cid = card.imageUri.replace('ipfs://', '');
        } else {
          const parts = card.imageUri.split('/ipfs/');
          if (parts.length === 2) {
            cid = parts[1];
          }
        }
      }

      // Parallel deletion of S3 and IPFS files
      const deletePromises: Promise<void>[] = [];

      if (s3Key) {
        deletePromises.push(
          this.s3Service.deleteFile(s3Key).then(() => {
            this.logger.log(`Deleted S3 file: ${s3Key}`);
          }),
        );
      }

      if (cid) {
        deletePromises.push(
          this.ipfsService.deleteFile(cid).then(() => {
            this.logger.log(`Deleted IPFS file: ${cid}`);
          }),
        );
      }

      await Promise.all(deletePromises);
    } catch (error) {
      this.logger.warn('Failed to cleanup images during card deletion', error);
      // Continue with DB deletion even if image cleanup fails
    }

    await this.db
      .delete(schema.basecards)
      .where(eq(schema.basecards.userId, user.id));
    return { success: true };
  }
}
