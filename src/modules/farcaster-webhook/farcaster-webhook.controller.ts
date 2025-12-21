import {
  Controller,
  Post,
  Body,
  Headers,
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { FarcasterWebhookService } from './farcaster-webhook.service';
import { FarcasterWebhookEventDto } from './dto/webhook-event.dto';

@ApiTags('webhook')
@Controller('webhook')
export class FarcasterWebhookController {
  private readonly logger = new Logger(FarcasterWebhookController.name);

  constructor(
    private readonly farcasterWebhookService: FarcasterWebhookService,
  ) {}

  /**
   * Receive Farcaster webhook events
   * Called by Farcaster clients when users add/remove app or enable/disable notifications
   */
  @Post('farcaster')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive Farcaster webhook events' })
  async handleWebhook(
    @Headers('x-farcaster-signature') signature: string,
    @Headers('x-farcaster-request-fid') fidHeader: string,
    @Body() body: FarcasterWebhookEventDto,
  ) {
    this.logger.log(`Received Farcaster webhook: ${body.event}`);

    // Extract FID from header (simplified - in production, verify signature)
    // The FID comes from the signed header in the webhook payload
    let fid: number;

    if (fidHeader) {
      fid = parseInt(fidHeader, 10);
    } else {
      // Try to extract from signature/header if available
      // For MVP, log warning and use a fallback approach
      this.logger.warn(
        'No x-farcaster-request-fid header found, attempting to extract from signature',
      );

      // In a full implementation, we would:
      // 1. Decode the base64 header from signature
      // 2. Extract FID from the decoded header
      // 3. Verify the signature using @farcaster/miniapp-node

      // For now, return success but log the issue
      return {
        success: true,
        message: 'Event received but FID extraction not fully implemented',
      };
    }

    if (isNaN(fid)) {
      this.logger.error('Invalid FID in header');
      return { success: false, message: 'Invalid FID' };
    }

    return this.farcasterWebhookService.handleEvent(fid, body);
  }
}
