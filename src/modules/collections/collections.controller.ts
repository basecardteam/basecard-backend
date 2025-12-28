import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { CollectionsService } from './collections.service';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { UpdateCollectionDto } from './dto/update-collection.dto';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('collections')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('collections')
export class CollectionsController {
  constructor(private readonly collectionsService: CollectionsService) {}

  @Post()
  create(
    @Request() req: any,
    @Body() createCollectionDto: CreateCollectionDto,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new ForbiddenException('User ID not found in token');
    }
    return this.collectionsService.create(
      userId,
      createCollectionDto.basecardId,
    );
  }

  @Get('me')
  findMyCollections(@Request() req: any) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new ForbiddenException('User ID not found in token');
    }
    return this.collectionsService.findAllByUserId(userId);
  }

  @Get(':id')
  async findOne(@Request() req: any, @Param('id') id: string) {
    const walletAddress = req.user?.walletAddress;
    const collection = await this.collectionsService.findOne(id);
    // Verify ownership
    if (
      collection &&
      collection.collector?.walletAddress?.toLowerCase() !==
        walletAddress?.toLowerCase()
    ) {
      throw new ForbiddenException('Cannot access other users collections');
    }
    return collection;
  }

  @Patch(':id')
  async update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() updateCollectionDto: UpdateCollectionDto,
  ) {
    const walletAddress = req.user?.walletAddress;
    const collection = await this.collectionsService.findOne(id);
    // Verify ownership
    if (
      collection &&
      collection.collector?.walletAddress?.toLowerCase() !==
        walletAddress?.toLowerCase()
    ) {
      throw new ForbiddenException('Cannot update other users collections');
    }
    return this.collectionsService.update(id, updateCollectionDto);
  }

  @Delete(':id')
  async remove(@Request() req: any, @Param('id') id: string) {
    const walletAddress = req.user?.walletAddress;
    const collection = await this.collectionsService.findOne(id);
    // Verify ownership
    if (
      collection &&
      collection.collector?.walletAddress?.toLowerCase() !==
        walletAddress?.toLowerCase()
    ) {
      throw new ForbiddenException('Cannot delete other users collections');
    }
    return this.collectionsService.remove(id);
  }

  @Delete('by-card/:basecardId')
  async removeByCardId(
    @Request() req: any,
    @Param('basecardId') basecardId: string,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new ForbiddenException('User ID not found in token');
    }
    return this.collectionsService.removeByCardId(userId, basecardId);
  }
}
