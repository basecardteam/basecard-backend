import { Inject, Injectable, Logger } from '@nestjs/common';
import { CreateCardDto } from './dto/create-card.dto';
import { UpdateCardDto } from './dto/update-card.dto';
import { DRIZZLE } from '../db/db.module';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { S3Service } from '../common/services/s3.service';
import { IpfsService } from '../common/services/ipfs.service';
import { ImageService } from '../common/services/image.service';

@Injectable()
export class CardsService {
  private readonly logger = new Logger(CardsService.name);

  constructor(
    @Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>,
    private s3Service: S3Service,
    private ipfsService: IpfsService,
    private imageService: ImageService,
  ) {}

  async create(createCardDto: CreateCardDto) {
    // Find user by address to get ID
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.walletAddress, createCardDto.address),
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Check if card already exists
    const existingCard = await this.db.query.cards.findFirst({
      where: eq(schema.cards.userId, user.id),
    });

    if (existingCard) {
      this.logger.log(`Card already exists for user: ${user.id}`);

      const socialKeys = existingCard.socials
        ? Object.keys(existingCard.socials)
        : [];
      const socialValues = existingCard.socials
        ? Object.values(existingCard.socials)
        : [];

      return {
        card_data: {
          id: existingCard.id,
          nickname: existingCard.nickname,
          role: existingCard.role,
          bio: existingCard.bio,
          imageUri: existingCard.imageUri,
        },
        social_keys: socialKeys,
        social_values: socialValues,
      };
    }

    const [card] = await this.db
      .insert(schema.cards)
      .values({
        userId: user.id,
        nickname: createCardDto.nickname,
        role: createCardDto.role,
        bio: createCardDto.bio,
        imageUri: createCardDto.imageUri,
        socials: createCardDto.socials,
      })
      .returning();

    // Update user with profile image
    if (createCardDto.profileImage) {
      await this.db
        .update(schema.users)
        .set({ profileImage: createCardDto.profileImage })
        .where(eq(schema.users.id, user.id));
    }

    // Format response as per spec
    const socialKeys = createCardDto.socials
      ? Object.keys(createCardDto.socials)
      : [];
    const socialValues = createCardDto.socials
      ? Object.values(createCardDto.socials)
      : [];

    this.logger.log(`Card created: ${card.id}`);

    return {
      card_data: {
        id: card.id,
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
    file: Express.Multer.File | undefined,
    dto: CreateCardDto,
  ) {
    try {
      // 1. Process Image
      let profileImageUrl = dto.profileImage;
      let nftUri = dto.imageUri;

      if (file) {
        // A. Optimize Image for S3 (No Rounding, WebP)
        const optimized = await this.imageService.optimizeImage(file.buffer);
        const s3Key = `profiles/${dto.address}/${Date.now()}-${file.originalname.split('.')[0]}.webp`;

        profileImageUrl = await this.s3Service.uploadFile(
          new File(
            [new Uint8Array(Buffer.from(optimized.base64, 'base64'))],
            s3Key,
            { type: optimized.mimeType },
          ),
          s3Key,
          optimized.mimeType,
        );

        this.logger.log(`S3 Uploaded: ${profileImageUrl}`);

        if (!profileImageUrl) {
          throw new Error('S3 upload failed');
        }

        // B. Generate NFT PNG (Rounded)
        const skills = []; // dto.skills removed
        let parsedSkills: string[] = [];
        // if (Array.isArray(skills)) {
        //   parsedSkills = skills;
        // } else if (typeof skills === 'string') {
        //   try {
        //     parsedSkills = JSON.parse(skills);
        //   } catch {
        //     parsedSkills = [skills];
        //   }
        // }

        const profileData = {
          nickname: dto.nickname,
          basename: '', // dto.basename removed
          role: dto.role,
          bio: dto.bio,
          skills: parsedSkills,
        };

        const nftPngBuffer = await this.imageService.generateNftPng(
          profileData,
          file.buffer, // Use original buffer for better quality
        );

        // C. Upload NFT PNG to IPFS
        const ipfsResult = await this.ipfsService.uploadFile(
          new File(
            [new Uint8Array(nftPngBuffer)],
            `nft-${dto.address}-${Date.now()}.png`,
            { type: 'image/png' },
          ),
        );

        if (!ipfsResult.success || !ipfsResult.url) {
          throw new Error(`IPFS upload failed: ${ipfsResult.error}`);
        }
        nftUri = ipfsResult.url;
        this.logger.log(`IPFS Uploaded: ${nftUri}`);
      }

      if (!profileImageUrl) {
        throw new Error('No profile image provided');
      }

      return {
        imageURI: nftUri,
        profileImage: profileImageUrl,
      };
    } catch (error) {
      this.logger.error('Minting processing failed', error);
      throw error;
    }
  }

  async findAll() {
    const cards = await this.db.query.cards.findMany({
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
      skills: [], // TODO: Add skills to DB schema if needed
      tokenId: card.tokenId,
      imageUri: card.imageUri,
      createdAt: card.createdAt,
      updatedAt: card.updatedAt,
    }));
  }

  async findOne(id: string) {
    const card = await this.db.query.cards.findFirst({
      where: eq(schema.cards.id, id),
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
      skills: [],
      tokenId: card.tokenId,
      imageUri: card.imageUri,
      createdAt: card.createdAt,
      updatedAt: card.updatedAt,
    };
  }

  async update(id: string, updateCardDto: UpdateCardDto) {
    const [updated] = await this.db
      .update(schema.cards)
      .set({
        ...updateCardDto,
        updatedAt: new Date(),
      })
      .where(eq(schema.cards.id, id))
      .returning();
    return updated;
  }

  async updateTokenId(address: string, tokenId: number) {
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.walletAddress, address),
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Find card for user
    // Assuming one card per user for now based on 'hasMintedCard' in users table
    // But cards table has userId.
    const [updated] = await this.db
      .update(schema.cards)
      .set({
        tokenId: tokenId,
        updatedAt: new Date(),
      })
      .where(eq(schema.cards.userId, user.id))
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

    return this.db.query.cards.findFirst({
      where: eq(schema.cards.userId, user.id),
      with: {
        user: true,
      },
    });
  }

  remove(id: string) {
    return this.db.delete(schema.cards).where(eq(schema.cards.id, id));
  }

  async removeByAddress(address: string) {
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.walletAddress, address),
    });

    if (!user) {
      return { success: false, message: 'User not found' };
    }

    await this.db.delete(schema.cards).where(eq(schema.cards.userId, user.id));
    return { success: true };
  }
}
