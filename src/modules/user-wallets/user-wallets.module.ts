import { Module } from '@nestjs/common';
import { UserWalletsController } from './user-wallets.controller';
import { UserWalletsService } from './user-wallets.service';

@Module({
  controllers: [UserWalletsController],
  providers: [UserWalletsService],
  exports: [UserWalletsService],
})
export class UserWalletsModule {}
