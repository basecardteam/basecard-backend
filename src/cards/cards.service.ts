import { Inject, Injectable, Logger } from '@nestjs/common';
import { CreateCardDto } from './dto/create-card.dto';
import { UpdateCardDto } from './dto/update-card.dto';
import { DRIZZLE } from '../db/db.module';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { S3Service } from '../common/services/s3.service';
import { IpfsService } from '../common/services/ipfs.service';
import { BaseCardService } from '../common/services/basecard.service';

@Injectable()
export class CardsService {
  private readonly logger = new Logger(CardsService.name);

  constructor(
    @Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>,
    private s3Service: S3Service,
    private ipfsService: IpfsService,
    private cardGenerator: BaseCardService,
  ) {}

  async create(createCardDto: CreateCardDto) {
    // Find user by address to get ID
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.walletAddress, createCardDto.address),
    });

    if (!user) {
      throw new Error('User not found');
    }

    const [card] = await this.db
      .insert(schema.cards)
      .values({
        userId: user.id,
        nickname: createCardDto.nickname,
        role: createCardDto.role,
        bio: createCardDto.bio,
        imageUri: createCardDto.imageURI,
        profileImage: createCardDto.profileImage,
        socials: createCardDto.socials,
      })
      .returning();
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
      let profileImageUrl = dto.profileImage; // Use provided URL if no file

      if (file) {
        const key = `profiles/${dto.address}/${Date.now()}-${file.originalname}`;
        profileImageUrl = await this.s3Service.uploadFile(
          new File([new Uint8Array(file.buffer)], file.originalname, {
            type: file.mimetype,
          }),
          key,
          file.mimetype,
        );
      }

      if (!profileImageUrl) {
        throw new Error('No profile image provided');
      }

      // 2. Generate Card SVG
      const skills = dto.skills;
      let parsedSkills: string[] = [];
      if (Array.isArray(skills)) {
        parsedSkills = skills;
      } else if (typeof skills === 'string') {
        try {
          parsedSkills = JSON.parse(skills);
        } catch {
          parsedSkills = [skills];
        }
      }

      const svg = this.cardGenerator.generateCardSVG({
        nickname: dto.nickname,
        basename: dto.basename || '',
        role: dto.role,
        profileImage: profileImageUrl,
        skills: parsedSkills,
        bio: dto.bio,
      });

      // 3. Upload SVG to IPFS
      const ipfsResult = await this.ipfsService.uploadFile(
        new File([new Blob([svg], { type: 'image/svg+xml' })], 'basecard.svg', {
          type: 'image/svg+xml',
        }),
      );

      if (!ipfsResult.success || !ipfsResult.url) {
        throw new Error(`IPFS upload failed: ${ipfsResult.error}`);
      }

      return {
        imageURI: ipfsResult.url,
        profileImage: profileImageUrl,
        svg: svg,
      };
    } catch (error) {
      this.logger.error('Minting processing failed', error);
      throw error;
    }
  }

  findAll() {
    return this.db.query.cards.findMany();
  }

  findOne(id: string) {
    return this.db.query.cards.findFirst({
      where: eq(schema.cards.id, id),
      with: {
        user: true,
      },
    });
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
