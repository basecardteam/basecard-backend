import { Module } from '@nestjs/common';
import { CollectionsService } from './collections.service';
import { CollectionsController } from './collections.controller';
import { UsersModule } from '../users/users.module';
import { BasecardsModule } from '../basecards/basecards.module';

@Module({
  imports: [UsersModule, BasecardsModule],
  controllers: [CollectionsController],
  providers: [CollectionsService],
})
export class CollectionsModule {}
