import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Logger,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
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
    this.logger.log(
      `Creating user with address: ${createUserDto.walletAddress}`,
    );
    return this.usersService.create(createUserDto);
  }

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    this.logger.debug(`Finding user with id: ${id}`);
    return this.usersService.findOne(id);
  }

  @Get('address/:address')
  async findByAddress(@Param('address') address: string) {
    this.logger.debug(`Finding user with address: ${address}`);
    const user = await this.usersService.findByAddress(address);
    if (!user) {
      return { success: false, error: 'User not found' };
    }
    return { success: true, result: user };
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
