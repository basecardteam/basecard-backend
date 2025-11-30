import { Injectable, Logger } from '@nestjs/common';
import { CreateMintDto } from './dto/create-mint.dto';
import { CardsService } from '../cards/cards.service';
import { IpfsService } from '../common/services/ipfs.service';
import { S3Service } from '../common/services/s3.service';
import { CardGeneratorService } from '../common/services/card-generator.service';
import { ImageUtils } from '../common/utils/image.utils';

@Injectable()
export class MintService {
  private readonly logger = new Logger(MintService.name);

  constructor(
    private cardsService: CardsService,
    private ipfsService: IpfsService,
    private s3Service: S3Service,
    private cardGenerator: CardGeneratorService,
  ) {}

  async mint(
    file: Express.Multer.File | undefined,
    createMintDto: CreateMintDto,
  ) {
    try {
      // 1. Process Image
      let profileImageUrl = createMintDto.defaultProfileUrl;

      if (file) {
        // Optimize image (TODO: Add optimization logic if needed, for now just convert/upload)
        // Upload to S3
        const key = `profiles/${createMintDto.address}/${Date.now()}-${file.originalname}`;
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
      const skills =
        typeof createMintDto.skills === 'string'
          ? JSON.parse(createMintDto.skills)
          : createMintDto.skills;

      const svg = this.cardGenerator.generateCardSVG({
        nickname: createMintDto.name,
        basename: createMintDto.baseName || '',
        role: createMintDto.role,
        profileImage: profileImageUrl,
        skills: skills,
        bio: createMintDto.bio,
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

      // 4. Save to Database
      const socials = createMintDto.socials
        ? JSON.parse(createMintDto.socials)
        : undefined;

      const card = await this.cardsService.create({
        nickname: createMintDto.name,
        role: createMintDto.role,
        bio: createMintDto.bio,
        imageURI: ipfsResult.url,
        basename: createMintDto.baseName,
        skills: skills,
        address: createMintDto.address,
        profileImage: profileImageUrl,
        socials: socials,
      });

      return {
        success: true,
        cardId: card.card_data.id,
        ipfs: ipfsResult,
        profileImageBase64: profileImageUrl,
        svg: svg,
      };
    } catch (error) {
      this.logger.error('Minting failed', error);
      throw error;
    }
  }
}
