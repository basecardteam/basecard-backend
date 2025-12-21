import { Module } from '@nestjs/common';
import { FarcasterWebhookController } from './farcaster-webhook.controller';
import { FarcasterWebhookService } from './farcaster-webhook.service';
import { DbModule } from '../../db/db.module';

@Module({
  imports: [DbModule],
  controllers: [FarcasterWebhookController],
  providers: [FarcasterWebhookService],
  exports: [FarcasterWebhookService],
})
export class FarcasterWebhookModule {}
