import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Logger,
  Query,
  Request,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(private readonly usersService: UsersService) {}

  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    this.logger.log(`Login request: ${createUserDto.walletAddress}`);
    return this.usersService.create(createUserDto);
  }

  @Get('me')
  async findMe(@Request() req) {
    const start = Date.now();
    this.logger.log(`Finding current user: ${req.user?.userId}`);
    const result = await this.usersService.findOne(req.user?.userId);
    this.logger.log(`[TIMING] findMe total: ${Date.now() - start}ms`);
    return result;
  }

  @Get()
  @ApiQuery({ name: 'role', required: false, enum: ['user', 'admin'] })
  findAll(@Query('role') role?: 'user' | 'admin') {
    return this.usersService.findAll(role);
  }

  @Get('farcaster/:fid')
  async getFarcasterProfile(@Param('fid') fid: string) {
    this.logger.debug(`Fetching Farcaster profile for FID: ${fid}`);
    const profile = await this.usersService.fetchFarcasterProfile(Number(fid));
    if (!profile) {
      return { error: 'User not found' };
    }
    return profile;
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    this.logger.debug(`Finding user with id: ${id}`);
    return this.usersService.findOne(id);
  }

  @Get('address/:address')
  async findByAddress(@Param('address') address: string) {
    this.logger.debug(`Finding user with address: ${address}`);
    return this.usersService.findByAddress(address);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    if (id.startsWith('0x')) {
      return this.usersService.updateByAddress(id, updateUserDto);
    }
    return this.usersService.update(id, updateUserDto);
  }

  @Patch(':address/points')
  increasePoints(
    @Param('address') address: string,
    @Body('points') points: number,
  ) {
    this.logger.log(`Increasing points for ${address} by ${points}`);
    return this.usersService.increasePoints(address, points);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
