import { IsNumber, IsObject, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Notification details received from Farcaster client
 */
export class NotificationDetailsDto {
  @ApiProperty({ description: 'URL to send notifications to' })
  @IsString()
  url: string;

  @ApiProperty({ description: 'Notification token' })
  @IsString()
  token: string;
}

/**
 * Webhook event payload from Farcaster client
 * Events: miniapp_added, miniapp_removed, notifications_enabled, notifications_disabled
 */
export class FarcasterWebhookEventDto {
  @ApiProperty({
    description: 'Event type',
    enum: [
      'miniapp_added',
      'miniapp_removed',
      'notifications_enabled',
      'notifications_disabled',
    ],
  })
  @IsString()
  event:
    | 'miniapp_added'
    | 'miniapp_removed'
    | 'notifications_enabled'
    | 'notifications_disabled';

  @ApiPropertyOptional({
    description:
      'Notification details (present for miniapp_added and notifications_enabled)',
  })
  @IsOptional()
  @IsObject()
  notificationDetails?: NotificationDetailsDto;
}

/**
 * Full webhook payload including header for FID extraction
 */
export class FarcasterWebhookPayloadDto {
  @ApiProperty({ description: 'Signed header containing FID' })
  @IsString()
  header: string;

  @ApiProperty({ description: 'Payload signature' })
  @IsString()
  signature: string;

  @ApiProperty({ description: 'Webhook event payload (JSON string)' })
  @IsString()
  payload: string;
}
