import { Module } from '@nestjs/common';
import { UserQuestsController } from './user-quests.controller';
import { UserQuestsService } from './user-quests.service';

import { UsersModule } from '../users/users.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [UsersModule, CommonModule],
  controllers: [UserQuestsController],
  providers: [UserQuestsService],
  exports: [UserQuestsService],
})
export class UserQuestsModule {}
