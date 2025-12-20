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
  ForbiddenException,
  UseGuards,
  SetMetadata,
  Query,
  Request,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { BasecardsService } from './basecards.service';
import { CreateBasecardDto } from './dto/create-basecard.dto';
import { UpdateBasecardDto } from './dto/update-basecard.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

// Public decorator to bypass auth
const Public = () => SetMetadata('isPublic', true);

@ApiTags('basecards')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('basecards')
export class BasecardsController {
  private readonly logger = new Logger(BasecardsController.name);

  constructor(private readonly basecardsService: BasecardsService) {}

  @Public()
  @Get()
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  findAll(@Query('limit') limit?: number, @Query('offset') offset?: number) {
    return this.basecardsService.findAll(limit ?? 50, offset ?? 0);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.basecardsService.findOne(id);
  }

  @Get('me')
  async findMyCard(@Request() req) {
    const walletAddress = req.user?.walletAddress;
    if (!walletAddress) {
      throw new ForbiddenException('Wallet address not found in token');
    }
    const card = await this.basecardsService.findByAddress(walletAddress);
    return card;
  }

  @Post()
  @UseInterceptors(FileInterceptor('profileImageFile'))
  @ApiConsumes('multipart/form-data')
  async create(
    @UploadedFile() file: Express.Multer.File,
    @Body() createBasecardDto: CreateBasecardDto,
    @Request() req,
  ) {
    // 본인 확인
    if (
      req.user.walletAddress?.toLowerCase() !==
      createBasecardDto.address.toLowerCase()
    ) {
      throw new ForbiddenException('You can only create your own card');
    }

    this.logger.debug(
      `Create: ${JSON.stringify(createBasecardDto)}, file=${file ? `${file.originalname}(${file.size}B)` : 'none'}`,
    );

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

  @Patch(':address')
  @UseInterceptors(FileInterceptor('profileImageFile'))
  @ApiConsumes('multipart/form-data')
  async processUpdate(
    @Param('address') address: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() updateBasecardDto: UpdateBasecardDto,
    @Request() req,
  ) {
    // 본인 확인
    if (req.user.walletAddress?.toLowerCase() !== address.toLowerCase()) {
      throw new ForbiddenException('You can only modify your own card');
    }

    this.logger.debug(
      `Update: ${address}, dto=${JSON.stringify(updateBasecardDto)}, file=${file ? `${file.originalname}(${file.size}B)` : 'none'}`,
    );

    try {
      // Parse socials if it's a string (from FormData)
      let socials = updateBasecardDto.socials;
      if (typeof socials === 'string') {
        try {
          socials = JSON.parse(socials);
        } catch {
          this.logger.warn('Failed to parse socials JSON');
        }
      }

      const result = await this.basecardsService.processUpdate(
        address,
        {
          nickname: updateBasecardDto.nickname,
          role: updateBasecardDto.role,
          bio: updateBasecardDto.bio,
          socials: socials as Record<string, string>,
        },
        file,
      );

      return result;
    } catch (error) {
      this.logger.error('Failed to process update', error);
      throw new InternalServerErrorException(
        error.message || 'Internal Server Error',
      );
    }
  }

  @Post(':address/rollback')
  async rollbackUpdate(
    @Param('address') address: string,
    @Body() body: { ipfsId: string },
    @Request() req,
  ) {
    // 본인 확인
    if (req.user.walletAddress?.toLowerCase() !== address.toLowerCase()) {
      throw new ForbiddenException('You can only rollback your own card');
    }

    this.logger.debug(`Rollback: ${address}, ipfs=${body.ipfsId}`);

    try {
      return await this.basecardsService.rollbackUpdate({
        ipfsId: body.ipfsId,
      });
    } catch (error) {
      this.logger.error('Failed to rollback', error);
      throw new InternalServerErrorException(
        error.message || 'Rollback failed',
      );
    }
  }

  // this is for event module to update tokenId and txHash
  @Put(':address')
  updateTokenId(
    @Param('address') address: string,
    @Body('tokenId') tokenId: number | null,
    @Body('txHash') txHash: string,
  ) {
    return this.basecardsService.updateTokenId(address, tokenId, txHash);
  }

  @Delete(':address')
  removeByAddress(@Param('address') address: string, @Request() req) {
    // 본인 확인
    if (req.user.walletAddress?.toLowerCase() !== address.toLowerCase()) {
      throw new ForbiddenException('You can only delete your own card');
    }
    return this.basecardsService.removeByAddress(address);
  }
}
