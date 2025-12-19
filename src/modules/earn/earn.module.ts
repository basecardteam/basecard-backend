import { Module } from '@nestjs/common';
import { EarnService } from './earn.service';
import { EarnController } from './earn.controller';

@Module({
  controllers: [EarnController],
  providers: [EarnService],
})
export class EarnModule {}
