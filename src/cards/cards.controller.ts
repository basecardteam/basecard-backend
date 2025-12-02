import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Put,
  Logger,
  UseInterceptors,
  UploadedFile,
  InternalServerErrorException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes } from '@nestjs/swagger';
import { CardsService } from './cards.service';
import { CreateCardDto } from './dto/create-card.dto';
import { UpdateCardDto } from './dto/update-card.dto';

@Controller('cards')
export class CardsController {
  private readonly logger = new Logger(CardsController.name);

  constructor(private readonly cardsService: CardsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('profileImageFile'))
  @ApiConsumes('multipart/form-data')
  async create(
    @UploadedFile() file: Express.Multer.File,
    @Body() createCardDto: CreateCardDto,
  ) {
    this.logger.log(`Creating card for address: ${createCardDto.address}`);

    // Check if card exists to avoid unnecessary image processing
    const existingCard = await this.cardsService.findByAddress(
      createCardDto.address,
    );
    if (existingCard) {
      this.logger.log(
        `Card already exists for address: ${createCardDto.address}`,
      );
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

    try {
      let imageURI = createCardDto.imageUri;
      let profileImage = createCardDto.profileImage;

      // If file is provided, process it via CardsService
      if (file) {
        this.logger.log('Processing profile image file...');
        const mintResult = await this.cardsService.processMinting(
          file,
          createCardDto,
        );
        imageURI = mintResult.imageURI;
        profileImage = mintResult.profileImage;
      }

      const result = await this.cardsService.create({
        ...createCardDto,
        imageUri: imageURI,
        profileImage,
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to create card', error);
      throw new InternalServerErrorException(
        error.message || 'Internal Server Error',
      );
    }
  }

  @Get()
  findAll() {
    return this.cardsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.cardsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateCardDto: UpdateCardDto) {
    return this.cardsService.update(id, updateCardDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.cardsService.remove(id);
  }

  @Put('card/:address')
  updateTokenId(
    @Param('address') address: string,
    @Body('tokenId') tokenId: number,
  ) {
    return this.cardsService.updateTokenId(address, tokenId);
  }

  @Delete('card/:address')
  removeByAddress(@Param('address') address: string) {
    return this.cardsService.removeByAddress(address);
  }
}
