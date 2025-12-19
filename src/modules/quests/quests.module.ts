import { Module } from '@nestjs/common';
import { QuestsService } from './quests.service';
import { QuestsController } from './quests.controller';
import { UsersModule } from '../users/users.module';
import { CommonModule } from '../../app/common.module';

@Module({
  imports: [UsersModule, CommonModule],
  controllers: [QuestsController],
  providers: [QuestsService],
  exports: [QuestsService],
})
export class QuestsModule {}
