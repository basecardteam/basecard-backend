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
    const walletAddress = req.user?.walletAddress;
    if (!walletAddress) {
      throw new ForbiddenException('Wallet address not found in token');
    }
    // Verify user can only create collections for themselves
    if (
      createCollectionDto.collectorAddress.toLowerCase() !==
      walletAddress.toLowerCase()
    ) {
      throw new ForbiddenException('Cannot create collections for other users');
    }
    return this.collectionsService.create(createCollectionDto);
  }

  @Get('me')
  findMyCollections(@Request() req: any) {
    const walletAddress = req.user?.walletAddress;
    if (!walletAddress) {
      throw new ForbiddenException('Wallet address not found in token');
    }
    return this.collectionsService.findAll(walletAddress);
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
}
