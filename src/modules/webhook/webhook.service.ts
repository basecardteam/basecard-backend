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
import { CLIENT_FIDS } from '../../app/constants';

interface WebhookEvent {
  event:
    | 'miniapp_added'
    | 'miniapp_removed'
    | 'notifications_enabled'
    | 'notifications_disabled';
  notificationDetails?: {
    token: string;
    url: string;
  };
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(@Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>) {}

  /**
   * Handle incoming webhook event from Farcaster or Base client
   */
  async handleEvent(
    fid: number,
    appFid: number,
    event: WebhookEvent,
  ): Promise<{ success: boolean; message: string }> {
    const clientName = this.getClientName(appFid);
    this.logger.log(
      `Processing ${event.event} from ${clientName} for FID ${fid}`,
    );

    switch (event.event) {
      case 'miniapp_added':
        return this.handleMiniappAdded(fid, appFid, event);

      case 'miniapp_removed':
        return this.handleMiniappRemoved(fid, appFid);

      case 'notifications_enabled':
        return this.handleNotificationsEnabled(fid, appFid, event);

      case 'notifications_disabled':
        return this.handleNotificationsDisabled(fid, appFid);

      default:
        this.logger.warn(`Unknown event type: ${(event as any).event}`);
        return { success: false, message: 'Unknown event type' };
    }
  }

  private getClientName(appFid?: number): string {
    if (appFid === CLIENT_FIDS.BASEAPP) return 'Base App';
    if (appFid === CLIENT_FIDS.WARPCAST) return 'Warpcast';
    return `Client(${appFid ?? 'unknown'})`;
  }

  /**
   * Handle miniapp_added event
   */
  private async handleMiniappAdded(
    fid: number,
    appFid: number,
    event: WebhookEvent,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.log(
      `User FID ${fid} added miniapp from ${this.getClientName(appFid)}`,
    );

    // Update wallet status and save notification token if present
    await this.updateWalletStatus(fid, appFid, {
      miniappAdded: true,
      notificationEnabled: !!event.notificationDetails,
      notificationToken: event.notificationDetails?.token,
      notificationUrl: event.notificationDetails?.url,
    });

    await this.markQuestClaimable(fid, 'APP_ADD_MINIAPP');
    if (event.notificationDetails) {
      await this.markQuestClaimable(fid, 'APP_NOTIFICATION');
    }

    return { success: true, message: 'Miniapp added processed' };
  }

  /**
   * Handle miniapp_removed event
   */
  private async handleMiniappRemoved(
    fid: number,
    appFid: number | undefined,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.log(
      `User FID ${fid} removed miniapp from ${this.getClientName(appFid)}`,
    );

    // Only disable the flag, keep the token for potential re-add
    await this.updateWalletStatus(fid, appFid as number, {
      miniappAdded: false,
    });

    return { success: true, message: 'Miniapp removed processed' };
  }

  /**
   * Handle notifications_enabled event
   */
  private async handleNotificationsEnabled(
    fid: number,
    appFid: number | undefined,
    event: WebhookEvent,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.log(
      `User FID ${fid} enabled notifications from ${this.getClientName(appFid)}`,
    );

    if (!event.notificationDetails) {
      throw new BadRequestException(
        'notifications_enabled event must include notificationDetails',
      );
    }

    await this.saveNotificationToken(
      fid,
      appFid,
      event.notificationDetails.token,
      event.notificationDetails.url,
    );

    await this.markQuestClaimable(fid, 'APP_NOTIFICATION');

    return { success: true, message: 'Notifications enabled processed' };
  }

  /**
   * Handle notifications_disabled event
   */
  private async handleNotificationsDisabled(
    fid: number,
    appFid: number | undefined,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.log(
      `User FID ${fid} disabled notifications from ${this.getClientName(appFid)}`,
    );

    // Only disable the flag, keep the token for potential re-enable
    await this.updateWalletStatus(fid, appFid as number, {
      notificationEnabled: false,
    });

    return { success: true, message: 'Notifications disabled processed' };
  }

  /**
   * Update wallet status flags and notification token
   */
  private async updateWalletStatus(
    fid: number,
    appFid: number,
    updates: {
      miniappAdded?: boolean;
      notificationEnabled?: boolean;
      notificationToken?: string;
      notificationUrl?: string;
    },
  ): Promise<void> {
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.fid, fid),
    });

    if (!user) {
      this.logger.warn(`User not found for FID ${fid}`);
      return;
    }

    const wallets = await this.db.query.userWallets.findMany({
      where: eq(schema.userWallets.userId, user.id),
    });

    if (wallets.length === 0) {
      this.logger.warn(`No wallets found for user ${user.id}`);
      return;
    }

    // Find matching wallet by appFid or use the first one
    let targetWallet = wallets[0];
    const matchingWallet = wallets.find((w) => w.clientFid === appFid);
    if (matchingWallet) {
      targetWallet = matchingWallet;
    }

    await this.db
      .update(schema.userWallets)
      .set({
        ...(updates.miniappAdded !== undefined && {
          miniappAdded: updates.miniappAdded,
        }),
        ...(updates.notificationEnabled !== undefined && {
          notificationEnabled: updates.notificationEnabled,
        }),
        ...(updates.notificationToken !== undefined && {
          notificationToken: updates.notificationToken,
        }),
        ...(updates.notificationUrl !== undefined && {
          notificationUrl: updates.notificationUrl,
        }),
      })
      .where(eq(schema.userWallets.id, targetWallet.id));

    this.logger.log(
      `Updated wallet status for FID ${fid}: ${JSON.stringify(updates)}`,
    );
  }

  /**
   * Save notification token to user_wallets (by FID and appFid)
   */
  private async saveNotificationToken(
    fid: number,
    appFid: number | undefined,
    token: string,
    url: string,
  ): Promise<void> {
    // Find user by FID
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.fid, fid),
    });

    if (!user) {
      this.logger.warn(`User not found for FID ${fid}`);
      return;
    }

    // Find matching wallet entry (by clientFid if provided)
    let walletQuery = eq(schema.userWallets.userId, user.id);

    const wallets = await this.db.query.userWallets.findMany({
      where: walletQuery,
    });

    if (wallets.length === 0) {
      this.logger.warn(`No wallets found for user ${user.id}`);
      return;
    }

    // Find the wallet matching the appFid, or use the first one
    let targetWallet = wallets[0];
    if (appFid) {
      const matchingWallet = wallets.find((w) => w.clientFid === appFid);
      if (matchingWallet) {
        targetWallet = matchingWallet;
      }
    }

    await this.db
      .update(schema.userWallets)
      .set({
        notificationToken: token,
        notificationUrl: url,
      })
      .where(eq(schema.userWallets.id, targetWallet.id));

    this.logger.log(
      `Saved notification token for FID ${fid} (wallet: ${targetWallet.id})`,
    );
  }

  /**
   * Clear notification tokens for a user (by FID and optionally appFid)
   */
  private async clearNotificationTokens(
    fid: number,
    appFid?: number,
  ): Promise<void> {
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.fid, fid),
    });

    if (!user) {
      this.logger.warn(`User not found for FID ${fid}`);
      return;
    }

    // Clear from all wallets or specific one based on appFid
    const wallets = await this.db.query.userWallets.findMany({
      where: eq(schema.userWallets.userId, user.id),
    });

    for (const wallet of wallets) {
      if (!appFid || wallet.clientFid === appFid) {
        await this.db
          .update(schema.userWallets)
          .set({
            notificationToken: null,
            notificationUrl: null,
          })
          .where(eq(schema.userWallets.id, wallet.id));
      }
    }

    this.logger.log(`Cleared notification tokens for FID ${fid}`);
  }

  /**
   * Mark a quest as claimable for a user identified by FID
   */
  private async markQuestClaimable(
    fid: number,
    actionType: string,
  ): Promise<void> {
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.fid, fid),
    });

    if (!user) {
      this.logger.warn(`User not found for FID ${fid}`);
      return;
    }

    const quest = await this.db.query.quests.findFirst({
      where: eq(schema.quests.actionType, actionType),
    });

    if (!quest) {
      this.logger.warn(`Quest not found for actionType ${actionType}`);
      return;
    }

    await this.db
      .insert(schema.userQuests)
      .values({
        userId: user.id,
        questId: quest.id,
        status: 'claimable',
      })
      .onConflictDoUpdate({
        target: [schema.userQuests.userId, schema.userQuests.questId],
        set: { status: 'claimable' },
        where: eq(schema.userQuests.status, 'pending'),
      });

    this.logger.log(`Marked quest ${actionType} as claimable for FID ${fid}`);
  }

  /**
   * Send notification to users
   */
  async sendNotification(params: {
    notificationId: string;
    title: string;
    body: string;
    targetUrl: string;
    userIds: string[];
  }): Promise<{ successful: number; failed: number }> {
    const { notificationId, title, body, targetUrl, userIds } = params;

    // Check if already sent
    const existing = await this.db.query.notificationLogs.findFirst({
      where: eq(schema.notificationLogs.notificationId, notificationId),
    });

    if (existing) {
      this.logger.debug(`Notification ${notificationId} already sent`);
      return { successful: 0, failed: 0 };
    }

    // Get notification tokens for users
    const tokens: { token: string; url: string }[] = [];

    for (const userId of userIds) {
      const wallets = await this.db.query.userWallets.findMany({
        where: eq(schema.userWallets.userId, userId),
      });

      for (const wallet of wallets) {
        if (wallet.notificationToken && wallet.notificationUrl) {
          tokens.push({
            token: wallet.notificationToken,
            url: wallet.notificationUrl,
          });
        }
      }
    }

    if (tokens.length === 0) {
      this.logger.debug('No notification tokens found');
      return { successful: 0, failed: 0 };
    }

    // Group tokens by URL (different clients have different endpoints)
    const tokensByUrl = new Map<string, string[]>();
    for (const { token, url } of tokens) {
      if (!tokensByUrl.has(url)) {
        tokensByUrl.set(url, []);
      }
      tokensByUrl.get(url)!.push(token);
    }

    let successful = 0;
    let failed = 0;

    // Send to each URL endpoint
    for (const [url, urlTokens] of tokensByUrl.entries()) {
      // Split into batches of 100 (API limit)
      for (let i = 0; i < urlTokens.length; i += 100) {
        const batch = urlTokens.slice(i, i + 100);

        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              notificationId,
              title,
              body,
              targetUrl,
              tokens: batch,
            }),
          });

          if (response.ok) {
            const result = await response.json();
            const invalidTokens =
              result.invalidTokens || result.result?.invalidTokens || [];
            successful += batch.length - invalidTokens.length;

            // Clean up invalid tokens
            if (invalidTokens.length > 0) {
              for (const invalidToken of invalidTokens) {
                await this.db
                  .update(schema.userWallets)
                  .set({ notificationToken: null, notificationUrl: null })
                  .where(
                    eq(schema.userWallets.notificationToken, invalidToken),
                  );
              }
            }
          } else {
            failed += batch.length;
          }
        } catch (error) {
          this.logger.error('Error sending notification batch:', error);
          failed += batch.length;
        }
      }
    }

    // Log notification
    await this.db.insert(schema.notificationLogs).values({
      notificationId,
      type: 'broadcast',
      recipientCount: successful,
    });

    this.logger.log(
      `Notification sent: ${successful} successful, ${failed} failed`,
    );

    return { successful, failed };
  }
}
