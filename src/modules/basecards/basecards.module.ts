import { forwardRef, Module } from '@nestjs/common';
import { BasecardsService } from './basecards.service';
import { BasecardsController } from './basecards.controller';
import { CommonModule } from '../../app/common.module';
import { DbModule } from '../../db/db.module';
import { UsersModule } from '../users/users.module';

import { ImageService } from './services/image.service';

@Module({
  imports: [DbModule, CommonModule, forwardRef(() => UsersModule)],
  controllers: [BasecardsController],
  providers: [BasecardsService, ImageService],
  exports: [BasecardsService],
})
export class BasecardsModule {}
