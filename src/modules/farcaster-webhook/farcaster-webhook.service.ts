import {
  Inject,
  Injectable,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { DRIZZLE } from '../../db/db.module';
import * as schema from '../../db/schema';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and } from 'drizzle-orm';
import { FarcasterWebhookEventDto } from './dto/webhook-event.dto';

@Injectable()
export class FarcasterWebhookService {
  private readonly logger = new Logger(FarcasterWebhookService.name);

  constructor(@Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>) {}

  /**
   * Handle incoming Farcaster webhook event
   */
  async handleEvent(
    fid: number,
    event: FarcasterWebhookEventDto,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.log(`Received Farcaster event: ${event.event} for FID ${fid}`);

    // Find user by FID (we need to store FID in users table or lookup via Neynar)
    // For now, we'll try to find by FID in farcasterNotifications or handle gracefully

    switch (event.event) {
      case 'miniapp_added':
        return this.handleMiniappAdded(fid, event);

      case 'miniapp_removed':
        return this.handleMiniappRemoved(fid);

      case 'notifications_enabled':
        return this.handleNotificationsEnabled(fid, event);

      case 'notifications_disabled':
        return this.handleNotificationsDisabled(fid);

      default:
        this.logger.warn(`Unknown event type: ${event.event}`);
        return { success: false, message: 'Unknown event type' };
    }
  }

  /**
   * Handle miniapp_added event
   * - Save notification token if present
   * - Mark APP_ADD_MINIAPP quest as claimable
   */
  private async handleMiniappAdded(
    fid: number,
    event: FarcasterWebhookEventDto,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.log(`User FID ${fid} added miniapp`);

    // Save notification token if present (Warpcast includes it with miniapp_added)
    if (event.notificationDetails) {
      await this.saveNotificationToken(
        fid,
        event.notificationDetails.token,
        event.notificationDetails.url,
      );
    }

    // Mark APP_ADD_MINIAPP quest as claimable
    await this.markQuestClaimable(fid, 'APP_ADD_MINIAPP');

    return { success: true, message: 'Miniapp added processed' };
  }

  /**
   * Handle miniapp_removed event
   * - Invalidate notification tokens
   */
  private async handleMiniappRemoved(
    fid: number,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.log(`User FID ${fid} removed miniapp`);

    await this.invalidateNotificationTokens(fid);

    return { success: true, message: 'Miniapp removed processed' };
  }

  /**
   * Handle notifications_enabled event
   * - Save notification token
   * - Mark APP_NOTIFICATION quest as claimable
   */
  private async handleNotificationsEnabled(
    fid: number,
    event: FarcasterWebhookEventDto,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.log(`User FID ${fid} enabled notifications`);

    if (!event.notificationDetails) {
      throw new BadRequestException(
        'notifications_enabled event must include notificationDetails',
      );
    }

    await this.saveNotificationToken(
      fid,
      event.notificationDetails.token,
      event.notificationDetails.url,
    );

    // Mark APP_NOTIFICATION quest as claimable
    await this.markQuestClaimable(fid, 'APP_NOTIFICATION');

    return { success: true, message: 'Notifications enabled processed' };
  }

  /**
   * Handle notifications_disabled event
   * - Invalidate notification tokens
   */
  private async handleNotificationsDisabled(
    fid: number,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.log(`User FID ${fid} disabled notifications`);

    await this.invalidateNotificationTokens(fid);

    return { success: true, message: 'Notifications disabled processed' };
  }

  /**
   * Save or update notification token for a user
   */
  private async saveNotificationToken(
    fid: number,
    token: string,
    url: string,
  ): Promise<void> {
    // Find existing notification record for this FID
    const existing = await this.db.query.farcasterNotifications.findFirst({
      where: eq(schema.farcasterNotifications.fid, fid),
    });

    if (existing) {
      // Update existing record
      await this.db
        .update(schema.farcasterNotifications)
        .set({
          token,
          url,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(schema.farcasterNotifications.id, existing.id));

      this.logger.log(`Updated notification token for FID ${fid}`);
    } else {
      // We need a userId - for now, create without userId and update later
      // Or we can lookup user by FID via Neynar API
      // For MVP, we'll store FID and handle userId mapping later
      this.logger.warn(
        `Cannot save notification token for FID ${fid}: user lookup not implemented yet`,
      );
    }
  }

  /**
   * Invalidate all notification tokens for a FID
   */
  private async invalidateNotificationTokens(fid: number): Promise<void> {
    await this.db
      .update(schema.farcasterNotifications)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(schema.farcasterNotifications.fid, fid));

    this.logger.log(`Invalidated notification tokens for FID ${fid}`);
  }

  /**
   * Mark a quest as claimable for a user identified by FID
   */
  private async markQuestClaimable(
    fid: number,
    actionType: string,
  ): Promise<void> {
    // TODO: We need to find user by FID
    // Option 1: Store FID in users table
    // Option 2: Lookup via Neynar API to get wallet address
    // For now, log and skip
    this.logger.warn(
      `Quest ${actionType} claimable mark skipped for FID ${fid}: user lookup not implemented`,
    );

    // When implemented:
    // 1. Find user by FID (via users.fid column or Neynar API)
    // 2. Find quest by actionType
    // 3. Upsert userQuests with status 'claimable'
  }
}
