import { Controller, Get, Logger, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserWalletsService } from './user-wallets.service';

@ApiTags('user-wallets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('user-wallets')
export class UserWalletsController {
  private readonly logger = new Logger(UserWalletsController.name);

  constructor(private readonly userWalletsService: UserWalletsService) {}

  @Get()
  findAll() {
    return this.userWalletsService.findAll();
  }

  @Get('me')
  async findMyWallets(@Request() req) {
    this.logger.debug(`Finding wallets for user: ${req.user?.userId}`);
    return this.userWalletsService.findByUserId(req.user?.userId);
  }
}
