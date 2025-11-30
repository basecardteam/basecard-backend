import { Module } from '@nestjs/common';
import { MintService } from './mint.service';
import { MintController } from './mint.controller';
import { CommonModule } from '../common/common.module';
import { CardsModule } from '../cards/cards.module';

@Module({
  imports: [CommonModule, CardsModule],
  controllers: [MintController],
  providers: [MintService],
})
export class MintModule {}
