import { Module } from '@nestjs/common';
import { BasecardsService } from './basecards.service';
import { BasecardsController } from './basecards.controller';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [CommonModule],
  controllers: [BasecardsController],
  providers: [BasecardsService],
  exports: [BasecardsService],
})
export class BasecardsModule {}
