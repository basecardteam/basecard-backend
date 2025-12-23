import {
  Controller,
  Post,
  Body,
  Logger,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { WebhookService } from './webhook.service';
import { AppConfigService } from '../../app/configs/app-config.service';
import {
  parseWebhookEvent,
  verifyAppKeyWithNeynar,
  type ParseWebhookEvent,
} from '@farcaster/miniapp-node';

@ApiTags('webhook')
@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly webhookService: WebhookService,
    private readonly appConfig: AppConfigService,
  ) {}

  /**
   * Receive webhook events from Farcaster/Base clients
   * Called when users add/remove app or enable/disable notifications
   * Endpoint: POST /v1/webhook
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive miniapp webhook events (Farcaster/Base)' })
  async handleWebhook(@Body() body: any) {
    this.logger.log('Received miniapp webhook event');

    let data;

    try {
      if (this.appConfig.neynarApiKey) {
        // Verify signature with Neynar
        data = await parseWebhookEvent(body, verifyAppKeyWithNeynar);
      } else {
        // Parse without verification (development only)
        this.logger.warn(
          '⚠️ Processing webhook without signature verification (NEYNAR_API_KEY not set)',
        );
        data = await parseWebhookEvent(body, async () => ({
          valid: true,
          appFid: 0,
        }));
      }
    } catch (e: unknown) {
      const error = e as ParseWebhookEvent.ErrorType;

      switch (error.name) {
        case 'VerifyJsonFarcasterSignature.InvalidDataError':
        case 'VerifyJsonFarcasterSignature.InvalidEventDataError':
          this.logger.error('Invalid webhook data format:', error);
          throw new BadRequestException('Invalid request data');

        case 'VerifyJsonFarcasterSignature.InvalidAppKeyError':
          this.logger.error('Invalid app key signature:', error);
          throw new UnauthorizedException('Invalid signature');

        case 'VerifyJsonFarcasterSignature.VerifyAppKeyError':
          this.logger.error('Error verifying app key:', error);
          throw new InternalServerErrorException('Verification error');

        default:
          this.logger.error('Unknown verification error:', error);
          throw new InternalServerErrorException('Verification failed');
      }
    }

    const { fid, appFid, event } = data;
    this.logger.log(
      `Webhook: event=${event.event}, fid=${fid}, appFid=${appFid}`,
    );

    return this.webhookService.handleEvent(fid, appFid, event);
  }
}
