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
  Header,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { BasecardsService } from './basecards.service';
import { CreateBasecardDto } from './dto/create-basecard.dto';
import {
  UpdateBasecardDto,
  UpdateBaseCardResponse,
} from './dto/update-basecard.dto';
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
  @Header('Cache-Control', 'no-cache, no-store, must-revalidate')
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  findAll(@Query('limit') limit?: number, @Query('offset') offset?: number) {
    return this.basecardsService.findAll(limit ?? 50, offset ?? 0);
  }

  @Get('me')
  @Get('me')
  async findMyCard(@Request() req) {
    const userId = req.user?.userId;
    const walletAddress = req.user?.loginAddress;

    if (!userId) {
      throw new ForbiddenException('User ID not found in token');
    }

    const card = await this.basecardsService.findByUserId(userId);

    // Cleanup incomplete card if exists (tokenId null but no onchain mint)
    if (card && card.tokenId === null && walletAddress) {
      const hasMinted =
        await this.basecardsService.checkHasMinted(walletAddress);
      if (!hasMinted) {
        this.logger.log(`Cleaning up incomplete card for user ${userId}`);
        await this.basecardsService.remove(card.id);
        return null; // Card was incomplete, return null
      }
    }

    return card;
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.basecardsService.findOne(id);
  }

  @Post()
  @UseInterceptors(FileInterceptor('profileImageFile'))
  @ApiConsumes('multipart/form-data')
  async create(
    @UploadedFile() file: Express.Multer.File,
    @Body() createBasecardDto: CreateBasecardDto,
    @Request() req,
  ) {
    // 디버그: 두 주소 비교
    this.logger.debug(
      `Address check: JWT=${req.user?.loginAddress}, DTO=${createBasecardDto.address}, Role=${req.user?.role}`,
    );

    // Admin can create cards for any user
    const isAdmin = req.user?.role === 'admin';

    // 본인 확인 (admin은 스킵)
    if (
      !isAdmin &&
      req.user.loginAddress?.toLowerCase() !==
        createBasecardDto.address?.toLowerCase()
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
        { skipSimulation: isAdmin, userId: req.user?.userId },
      );

      return result;
    } catch (error) {
      this.logger.error('Failed to create card', error);
      throw new InternalServerErrorException(
        error.message || 'Internal Server Error',
      );
    }
  }

  @Patch('me')
  @UseInterceptors(FileInterceptor('profileImageFile'))
  @ApiConsumes('multipart/form-data')
  async processUpdate(
    @UploadedFile() file: Express.Multer.File,
    @Body() updateBasecardDto: UpdateBasecardDto,
    @Request() req,
  ): Promise<UpdateBaseCardResponse> {
    const userId = req.user?.userId;
    if (!userId) {
      throw new ForbiddenException('User ID not found in token');
    }

    const loginAddress = req.user?.loginAddress;
    if (!loginAddress) {
      throw new ForbiddenException('User address not found in token');
    }

    this.logger.debug(
      `Update: ${loginAddress}, dto=${JSON.stringify(updateBasecardDto)}, file=${file ? `${file.originalname}(${file.size}B)` : 'none'}`,
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
        loginAddress,
        {
          nickname: updateBasecardDto.nickname,
          role: updateBasecardDto.role,
          bio: updateBasecardDto.bio,
          socials: socials as Record<string, string>,
        },
        file,
      );

      return {
        card_data: result.card_data,
        social_keys: result.social_keys,
        social_values: result.social_values,
        token_id: result.tokenId,
        needs_rollback: !!result.uploadedFiles,
      };
    } catch (error) {
      this.logger.error('Failed to process update', error);
      throw new InternalServerErrorException(
        error.message || 'Internal Server Error',
      );
    }
  }

  @Post('me/rollback')
  async rollbackUpdate(@Body() body: { imageUri: string }, @Request() req) {
    const userId = req.user?.sub || req.user?.userId;
    if (!userId) {
      throw new ForbiddenException('User ID not found in token');
    }

    // Extract ipfsId from imageUri (format: ipfs://QmXxx... or https://...pinata.../ipfs/QmXxx)
    let ipfsId = '';
    if (body.imageUri) {
      if (body.imageUri.startsWith('ipfs://')) {
        ipfsId = body.imageUri.replace('ipfs://', '');
      } else if (body.imageUri.includes('/ipfs/')) {
        ipfsId = body.imageUri.split('/ipfs/').pop() || '';
      }
    }

    if (!ipfsId) {
      throw new BadRequestException('Invalid imageUri format');
    }

    this.logger.debug(`Rollback: userId=${userId}, ipfsId=${ipfsId}`);

    try {
      return await this.basecardsService.rollbackUpdate({ ipfsId });
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
    if (req.user.loginAddress?.toLowerCase() !== address.toLowerCase()) {
      throw new ForbiddenException('You can only delete your own card');
    }
    return this.basecardsService.removeByAddress(address);
  }
}
