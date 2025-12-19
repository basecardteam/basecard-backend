import { Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { DbModule } from '../../db/db.module';
import { BasecardsModule } from '../basecards/basecards.module';
import { CommonModule } from '../../app/common.module';

import { UsersModule } from '../users/users.module';

@Module({
  imports: [DbModule, BasecardsModule, CommonModule, UsersModule],
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}
