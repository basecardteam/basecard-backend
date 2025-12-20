import { Module, Global } from '@nestjs/common';
import { QuestVerificationService } from './quest-verification.service';
import { BlockchainModule } from '../blockchain/blockchain.module';

@Global()
@Module({
  imports: [BlockchainModule],
  providers: [QuestVerificationService],
  exports: [QuestVerificationService],
})
export class QuestVerificationModule {}
