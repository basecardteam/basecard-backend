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
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes } from '@nestjs/swagger';
import { BasecardsService } from './basecards.service';
import { CreateBasecardDto } from './dto/create-basecard.dto';
import { UpdateBasecardDto } from './dto/update-basecard.dto';

@Controller('basecards')
export class BasecardsController {
  private readonly logger = new Logger(BasecardsController.name);

  constructor(private readonly basecardsService: BasecardsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('profileImageFile'))
  @ApiConsumes('multipart/form-data')
  async create(
    @UploadedFile() file: Express.Multer.File,
    @Body() createBasecardDto: CreateBasecardDto,
  ) {
    this.logger.log(`Creating card for address: ${createBasecardDto.address}`);

    // Check if card exists to avoid unnecessary image processing
    const existingCard = await this.basecardsService.findByAddress(
      createBasecardDto.address,
    );
    if (existingCard) {
      this.logger.log(
        `Card already exists for address: ${createBasecardDto.address}`,
      );
      const socialKeys = existingCard.socials
        ? Object.keys(existingCard.socials)
        : [];
      const socialValues = existingCard.socials
        ? Object.values(existingCard.socials)
        : [];
      return {
        card_data: {
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
      // If file is provided, process it via BasecardsService
      if (!file) {
        throw new BadRequestException('Profile image file is required');
      }

      const result = await this.basecardsService.create(
        createBasecardDto,
        file,
      );

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
    return this.basecardsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.basecardsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateBasecardDto: UpdateBasecardDto,
  ) {
    return this.basecardsService.update(id, updateBasecardDto);
  }

  @Put(':address')
  updateTokenId(
    @Param('address') address: string,
    @Body('tokenId') tokenId: number | null,
    @Body('txHash') txHash: string,
  ) {
    return this.basecardsService.updateTokenId(address, tokenId, txHash);
  }

  @Delete(':address')
  removeByAddress(@Param('address') address: string) {
    return this.basecardsService.removeByAddress(address);
  }
}
