import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EvmLib } from '../blockchain/evm.lib';
import { AppConfigService } from '../../app/configs/app-config.service';
import { NeynarAPIClient, Configuration } from '@neynar/nodejs-sdk';
import { Platform, ActionType } from '../quests/quest-types';

/**
 * Platform-ActionType Verification Matrix:
 * See quest-types.ts for the complete list of platforms and action types.
 */

export interface VerificationContext {
  address: string;
  tokenId?: number;
  fid?: number; // Farcaster ID
  // Add more context as needed (e.g., GitHub handle, etc.)
}

@Injectable()
export class QuestVerificationService implements OnModuleInit {
  private readonly logger = new Logger(QuestVerificationService.name);
  private neynarClient: NeynarAPIClient | null = null;

  constructor(
    private evmLib: EvmLib,
    private appConfigService: AppConfigService,
  ) {}

  onModuleInit() {
    const apiKey = this.appConfigService.neynarApiKey;
    if (apiKey) {
      this.neynarClient = new NeynarAPIClient(new Configuration({ apiKey }));
      this.logger.log('Neynar client initialized for verification');
    }
  }

  /**
   * Main entry point: verify a quest by platform + actionType
   */
  async verify(
    platform: Platform,
    actionType: ActionType,
    ctx: VerificationContext,
  ): Promise<boolean> {
    this.logger.debug(
      `Verifying [${platform}:${actionType}] for ${ctx.address}`,
    );

    try {
      // Get tokenId if not provided (needed for most verifications)
      if (ctx.tokenId === undefined) {
        const fetchedTokenId = await this.evmLib.getTokenId(ctx.address);
        ctx.tokenId = fetchedTokenId ?? undefined;
      }

      switch (platform) {
        case 'FARCASTER':
          return this.verifyFarcaster(actionType, ctx);
        case 'X':
          return this.verifyX(actionType, ctx);
        case 'APP':
          return this.verifyApp(actionType, ctx);
        case 'GITHUB':
          return this.verifyGithub(actionType, ctx);
        case 'LINKEDIN':
          return this.verifyLinkedin(actionType, ctx);
        case 'BASENAME':
          return this.verifyBasename(actionType, ctx);
        case 'WEBSITE':
          return this.verifyWebsite(actionType, ctx);
        default:
          this.logger.warn(`Unknown platform: ${platform}`);
          return false;
      }
    } catch (error) {
      this.logger.error(
        `Verification error [${platform}:${actionType}]: ${error.message}`,
      );
      return false;
    }
  }

  // ========== Platform-Specific Strategies ==========

  private async verifyFarcaster(
    actionType: ActionType,
    ctx: VerificationContext,
  ): Promise<boolean> {
    switch (actionType) {
      case 'FC_LINK':
        // Check if Farcaster is linked onchain
        if (!ctx.tokenId) return false;
        return this.evmLib.isSocialLinked(ctx.tokenId, 'farcaster');

      case 'FC_SHARE':
        // TODO: Verify user has shared on Farcaster (check recent casts)
        // Requires Neynar API + FID
        return false;

      case 'FC_FOLLOW':
        // TODO: Check if user follows @basecardteam via Neynar API
        return false;

      case 'FC_POST_HASHTAG':
        // TODO: Verify user posted with a specific hashtag
        return false;

      default:
        return false;
    }
  }

  private async verifyX(
    actionType: ActionType,
    ctx: VerificationContext,
  ): Promise<boolean> {
    switch (actionType) {
      case 'X_LINK':
        // Check if X is linked onchain
        if (!ctx.tokenId) return false;
        return this.evmLib.isSocialLinked(ctx.tokenId, 'x');

      case 'X_FOLLOW':
        // TODO: Implement X API follow check (requires OAuth)
        return false;

      default:
        return false;
    }
  }

  private async verifyApp(
    actionType: ActionType,
    ctx: VerificationContext,
  ): Promise<boolean> {
    switch (actionType) {
      case 'APP_BASECARD_MINT':
        // Check if user has minted (tokenId exists)
        return ctx.tokenId !== undefined && ctx.tokenId > 0;

      case 'APP_NOTIFICATION':
        // TODO: Check notification enabled status from DB or Farcaster
        return false;

      case 'APP_DAILY_CHECKIN':
        // TODO: Implement daily check-in logic (client calls this endpoint)
        return false;

      case 'APP_ADD_MINIAPP':
        // Verified client-side when user calls sdk.actions.addMiniApp()
        // Frontend should call claim after successful addMiniApp
        // This is optimistic - frontend reports success
        return false;

      case 'APP_REFERRAL':
        // TODO: Check referral table if invitee has minted
        // Requires referral tracking table
        return false;

      case 'APP_BIO_UPDATE':
        // TODO: Check if user has bio set onchain
        // Could use evmLib to check token metadata
        return false;

      case 'APP_SKILL_TAG':
        // TODO: Check if user has skill tags set onchain
        return false;

      case 'APP_VOTE':
        // Voting is tracked in DB, admin sets claimable
        // Or optimistic: frontend reports vote success
        return false;

      case 'APP_MANUAL':
        // Manual verification by admin
        // User submits URL in metadata, admin approves via dashboard
        // This always returns false - admin sets 'claimable' directly
        return false;

      default:
        return false;
    }
  }

  private async verifyGithub(
    actionType: ActionType,
    ctx: VerificationContext,
  ): Promise<boolean> {
    switch (actionType) {
      case 'GH_LINK':
        if (!ctx.tokenId) return false;
        return this.evmLib.isSocialLinked(ctx.tokenId, 'github');
      default:
        return false;
    }
  }

  private async verifyLinkedin(
    actionType: ActionType,
    ctx: VerificationContext,
  ): Promise<boolean> {
    switch (actionType) {
      case 'LI_LINK':
        if (!ctx.tokenId) return false;
        return this.evmLib.isSocialLinked(ctx.tokenId, 'linkedin');
      default:
        return false;
    }
  }

  private async verifyBasename(
    actionType: ActionType,
    ctx: VerificationContext,
  ): Promise<boolean> {
    switch (actionType) {
      case 'BASE_LINK_NAME':
        if (!ctx.tokenId) return false;
        return this.evmLib.isSocialLinked(ctx.tokenId, 'basename');
      default:
        return false;
    }
  }

  private async verifyWebsite(
    actionType: ActionType,
    ctx: VerificationContext,
  ): Promise<boolean> {
    switch (actionType) {
      case 'WEB_LINK':
        if (!ctx.tokenId) return false;
        return this.evmLib.isSocialLinked(ctx.tokenId, 'website');
      default:
        return false;
    }
  }
}
