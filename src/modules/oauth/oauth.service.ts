import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfigService } from '../../app/configs/app-config.service';
import { DRIZZLE } from '../../db/db.module';
import * as schema from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { randomBytes } from 'crypto';
import { CLIENT_FIDS, getClientTypeFromFid } from '../../app/constants';

export type OAuthProvider = 'github' | 'x' | 'linkedin';

interface OAuthStateData {
  state: string;
  provider: OAuthProvider;
  userId: string;
  clientFid?: number;
  returnUrl: string;
  codeVerifier?: string; // For X (Twitter) PKCE
  createdAt: Date;
}

interface SocialEntry {
  handle: string;
  verified: boolean;
}

interface Socials {
  [key: string]: SocialEntry;
}

// In-memory state store (consider Redis for production)
const stateStore = new Map<string, OAuthStateData>();

// Clean up expired states every 5 minutes
setInterval(
  () => {
    const now = Date.now();
    for (const [key, data] of stateStore.entries()) {
      if (now - data.createdAt.getTime() > 5 * 60 * 1000) {
        stateStore.delete(key);
      }
    }
  },
  5 * 60 * 1000,
);

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  // Provider configurations
  private readonly providers = {
    github: {
      authorizeUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      userUrl: 'https://api.github.com/user',
      scopes: 'read:user',
    },
    x: {
      authorizeUrl: 'https://twitter.com/i/oauth2/authorize',
      tokenUrl: 'https://api.twitter.com/2/oauth2/token',
      userUrl: 'https://api.twitter.com/2/users/me',
      scopes: 'tweet.read users.read offline.access',
    },
    linkedin: {
      authorizeUrl: 'https://www.linkedin.com/oauth/v2/authorization',
      tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
      userUrl: 'https://api.linkedin.com/v2/userinfo',
      scopes: 'openid profile email',
    },
  };

  constructor(
    @Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>,
    private configService: ConfigService,
    private appConfigService: AppConfigService,
  ) {}

  /**
   * Initialize OAuth flow - generate auth URL
   */
  async initOAuth(
    provider: OAuthProvider,
    options: {
      userId: string;
      clientFid?: number;
      returnUrl: string;
    },
  ): Promise<{ authUrl: string; state: string }> {
    const state = this.generateState();
    const config = this.getProviderConfig(provider);
    const redirectUri = this.getRedirectUri(provider);

    // Store state for verification
    const stateData: OAuthStateData = {
      state,
      provider,
      userId: options.userId,
      clientFid: options.clientFid,
      returnUrl: options.returnUrl,
      createdAt: new Date(),
    };

    // For Twitter, generate PKCE code verifier
    if (provider === 'x') {
      stateData.codeVerifier = this.generateCodeVerifier();
    }

    stateStore.set(state, stateData);

    // Build authorization URL
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: redirectUri,
      scope: this.providers[provider].scopes,
      state,
      response_type: 'code',
    });

    // Twitter requires PKCE
    if (provider === 'x' && stateData.codeVerifier) {
      const codeChallenge = await this.generateCodeChallenge(
        stateData.codeVerifier,
      );
      params.set('code_challenge', codeChallenge);
      params.set('code_challenge_method', 'S256');
    }

    const authUrl = `${this.providers[provider].authorizeUrl}?${params.toString()}`;

    this.logger.log(`OAuth init for ${provider}, userId: ${options.userId}`);
    this.logger.log(`Generated authUrl: ${authUrl}`);

    return { authUrl, state };
  }

  /**
   * Handle OAuth callback
   */
  async handleCallback(
    provider: OAuthProvider,
    code: string,
    state: string,
  ): Promise<{ redirectUrl: string; handle: string }> {
    // Validate state
    const stateData = stateStore.get(state);
    if (!stateData || stateData.provider !== provider) {
      throw new Error('Invalid or expired OAuth state');
    }

    // Remove state (one-time use)
    stateStore.delete(state);

    // Check expiry (5 minutes)
    if (Date.now() - stateData.createdAt.getTime() > 5 * 60 * 1000) {
      throw new Error('OAuth state expired');
    }

    // Validate clientFid is a valid number
    if (!stateData.clientFid || isNaN(stateData.clientFid)) {
      throw new Error('Invalid clientFid - OAuth cannot build deeplink');
    }

    const config = this.getProviderConfig(provider);
    const redirectUri = this.getRedirectUri(provider);

    // Exchange code for token
    const tokenData = await this.exchangeToken(
      provider,
      code,
      redirectUri,
      config,
      stateData.codeVerifier,
    );

    // Get user info
    const userInfo = await this.getUserInfo(provider, tokenData.access_token);

    // Update socials in database
    await this.updateSocials(stateData.userId, provider, userInfo.handle);

    this.logger.log(`OAuth success for ${provider}: ${userInfo.handle}`);

    // Build redirect URL back to MiniApp based on clientFid
    const redirectUrl = this.buildDeeplinkUrl(
      stateData.clientFid as number, // validated above
      stateData.returnUrl || '/edit-profile',
      provider,
      userInfo.handle,
    );

    return { redirectUrl, handle: userInfo.handle };
  }

  /**
   * Build deeplink URL based on clientFid
   * - Farcaster MiniApp (FID 9152): uses farcaster.xyz deeplink
   * - BaseApp (FID 309857): uses cbwallet:// deeplink
   * - Warpcast (default): uses warpcast:// or fallback
   */
  private buildDeeplinkUrl(
    clientFid: number,
    returnPath: string,
    provider: OAuthProvider,
    handle: string,
  ): string {
    const queryParams = `?oauth_success=${provider}&handle=${encodeURIComponent(handle)}`;
    const clientType = getClientTypeFromFid(clientFid);

    switch (clientType) {
      case 'farcaster': {
        // Farcaster MiniApp deeplink (FID: 9152)
        const farcasterDeeplink = this.configService.get<string>(
          'FARCASTER_MINIAPP_DEEPLINK',
          'https://farcaster.xyz/miniapps/LeQeulEeT8vv/basecard-dev',
        );
        return `${farcasterDeeplink}${returnPath}${queryParams}`;
      }
      case 'baseapp': {
        // BaseApp / Coinbase Wallet deeplink (FID: 309857)
        const baseappDeeplink = this.configService.get<string>(
          'BASEAPP_MINIAPP_DEEPLINK',
          'cbwallet://miniapp?url=https://miniapp-dev.basecard.org',
        );
        // Parse the baseapp deeplink and append returnPath and queryParams
        const [scheme, baseUrl] = baseappDeeplink.split('?url=');
        if (baseUrl) {
          const targetUrl = `${baseUrl}${returnPath}${queryParams}`;
          return `${scheme}?url=${encodeURIComponent(targetUrl)}`;
        }
        return `${baseappDeeplink}${returnPath}${queryParams}`;
      }
      default: {
        // Warpcast and other clients - use miniapp URL directly
        const miniappUrl = this.configService.get<string>(
          'MINIAPP_URL',
          'https://miniapp.basecardteam.org',
        );
        return `${miniappUrl}${returnPath}${queryParams}`;
      }
    }
  }

  /**
   * Get connection status for polling
   */
  async getConnectionStatus(
    provider: OAuthProvider,
    userId: string,
  ): Promise<{ connected: boolean; handle?: string; verified?: boolean }> {
    const card = await this.db.query.basecards.findFirst({
      where: eq(schema.basecards.userId, userId),
    });

    if (!card || !card.socials) {
      return { connected: false };
    }

    const socials = card.socials as Socials;
    const socialKey = provider;
    const entry = socials[socialKey];

    if (!entry || !entry.handle) {
      return { connected: false };
    }

    return {
      connected: true,
      handle: entry.handle,
      verified: entry.verified,
    };
  }

  /**
   * Disconnect OAuth provider
   */
  async disconnect(provider: OAuthProvider, userId: string): Promise<void> {
    try {
      const card = await this.db.query.basecards.findFirst({
        where: eq(schema.basecards.userId, userId),
      });

      if (!card) {
        this.logger.warn(
          `Disconnect failed: Card not found for userId: ${userId}`,
        );
        return;
      }

      if (!card.socials) {
        this.logger.warn(
          `Disconnect failed: No socials found for userId: ${userId}`,
        );
        return;
      }

      this.logger.debug(
        `Disconnecting ${provider} for user ${userId}. Current socials: ${JSON.stringify(
          card.socials,
        )}`,
      );

      // Ensure socials is an object
      if (typeof card.socials !== 'object' || Array.isArray(card.socials)) {
        this.logger.error(
          `Invalid socials format for user ${userId}: ${typeof card.socials}`,
        );
        throw new Error('Invalid socials data format');
      }

      const socials = { ...(card.socials as Socials) };
      const socialKey = provider;

      if (!socials[socialKey]) {
        this.logger.warn(
          `Social account ${socialKey} not found in user socials`,
        );
        // We can return here, but maybe we want to force update just in case?
        // Let's return to avoid unnecessary write.
        return;
      }

      delete socials[socialKey];

      await this.db
        .update(schema.basecards)
        .set({ socials, updatedAt: new Date() })
        .where(eq(schema.basecards.id, card.id));

      this.logger.log(`Disconnected ${provider} for userId: ${userId}`);
    } catch (error) {
      this.logger.error(
        `Error disconnecting ${provider} for user ${userId}:`,
        error,
      );
      throw error; // Re-throw to be caught by controller
    }
  }

  /**
   * Get error redirect URL
   */
  async getErrorRedirectUrl(
    state: string,
    error: string,
    description?: string,
  ): Promise<string> {
    const stateData = stateStore.get(state);
    const returnPath = stateData?.returnUrl || '/edit-profile';

    // Clean up state
    if (stateData) {
      stateStore.delete(state);
    }

    const errorParams = `oauth_error=${encodeURIComponent(error)}${description ? `&oauth_error_desc=${encodeURIComponent(description)}` : ''}`;

    return this.buildErrorDeeplinkUrl(
      stateData?.clientFid,
      returnPath,
      errorParams,
    );
  }

  /**
   * Build error deeplink URL based on clientFid
   */
  private buildErrorDeeplinkUrl(
    clientFid: number | undefined,
    returnPath: string,
    errorParams: string,
  ): string {
    const clientType = getClientTypeFromFid(clientFid ?? 0);

    switch (clientType) {
      case 'farcaster': {
        const farcasterDeeplink = this.configService.get<string>(
          'FARCASTER_MINIAPP_DEEPLINK',
          'https://farcaster.xyz/miniapps/LeQeulEeT8vv/basecard-dev',
        );
        return `${farcasterDeeplink}${returnPath}?${errorParams}`;
      }
      case 'baseapp': {
        const baseappDeeplink = this.configService.get<string>(
          'BASEAPP_MINIAPP_DEEPLINK',
          'cbwallet://miniapp?url=https://miniapp-dev.basecard.org',
        );
        const [scheme, baseUrl] = baseappDeeplink.split('?url=');
        if (baseUrl) {
          const targetUrl = `${baseUrl}${returnPath}?${errorParams}`;
          return `${scheme}?url=${encodeURIComponent(targetUrl)}`;
        }
        return `${baseappDeeplink}${returnPath}?${errorParams}`;
      }
      default: {
        const miniappUrl = this.configService.get<string>(
          'MINIAPP_URL',
          'https://miniapp.basecardteam.org',
        );
        return `${miniappUrl}${returnPath}?${errorParams}`;
      }
    }
  }

  // ===== Private Methods =====

  private generateState(): string {
    return randomBytes(32).toString('hex');
  }

  private generateCodeVerifier(): string {
    return randomBytes(64).toString('base64url');
  }

  private async generateCodeChallenge(verifier: string): Promise<string> {
    const crypto = await import('crypto');
    const hash = crypto.createHash('sha256').update(verifier).digest();
    return hash.toString('base64url');
  }

  private getProviderConfig(provider: OAuthProvider): {
    clientId: string;
    clientSecret: string;
  } {
    if (provider === 'github') {
      return {
        clientId: this.appConfigService.githubClientId,
        clientSecret: this.appConfigService.githubClientSecret,
      };
    }

    const prefix = provider.toUpperCase();
    return {
      clientId: this.configService.get<string>(`${prefix}_CLIENT_ID`, ''),
      clientSecret: this.configService.get<string>(
        `${prefix}_CLIENT_SECRET`,
        '',
      ),
    };
  }

  private getRedirectUri(provider: OAuthProvider): string {
    const backendUrl = this.configService.get<string>(
      'BACKEND_URL',
      'https://api.basecardteam.org',
    );
    return `${backendUrl}/v1/oauth/${provider}/callback`;
  }

  private async exchangeToken(
    provider: OAuthProvider,
    code: string,
    redirectUri: string,
    config: { clientId: string; clientSecret: string },
    codeVerifier?: string,
  ): Promise<{ access_token: string }> {
    const tokenUrl = this.providers[provider].tokenUrl;

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: config.clientId,
    });

    // Provider-specific handling
    if (provider === 'x') {
      if (codeVerifier) {
        params.set('code_verifier', codeVerifier);
      }
    } else {
      params.set('client_secret', config.clientSecret);
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    // GitHub wants Accept header
    if (provider === 'github') {
      headers['Accept'] = 'application/json';
    }

    // Twitter uses Basic auth
    if (provider === 'x') {
      const credentials = Buffer.from(
        `${config.clientId}:${config.clientSecret}`,
      ).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
    }

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers,
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`Token exchange failed for ${provider}:`, error);
      throw new Error(`Token exchange failed: ${error}`);
    }

    const data = await response.json();
    return data;
  }

  private async getUserInfo(
    provider: OAuthProvider,
    accessToken: string,
  ): Promise<{ handle: string; name?: string }> {
    const userUrl = this.providers[provider].userUrl;

    const response = await fetch(userUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`User info fetch failed for ${provider}:`, error);
      throw new Error(`Failed to get user info: ${error}`);
    }

    const data = await response.json();

    // Normalize response by provider
    switch (provider) {
      case 'github':
        return { handle: data.login, name: data.name };
      case 'x':
        return { handle: data.data?.username, name: data.data?.name };
      case 'linkedin':
        // LinkedIn uses 'name' for full name, no username
        return { handle: data.name, name: data.name };
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  private async updateSocials(
    userId: string,
    provider: OAuthProvider,
    handle: string,
  ): Promise<void> {
    let card = await this.db.query.basecards.findFirst({
      where: eq(schema.basecards.userId, userId),
    });

    // If no card exists, create a draft basecard to store OAuth socials
    // This allows new users to connect OAuth before minting
    if (!card) {
      this.logger.log(
        `No card found for userId: ${userId}. Creating draft basecard for OAuth socials.`,
      );

      // Get user's wallet address for tokenOwner
      const user = await this.db.query.users.findFirst({
        where: eq(schema.users.id, userId),
      });

      if (!user) {
        this.logger.error(`User not found for userId: ${userId}`);
        return;
      }

      // Create draft basecard with just userId, tokenOwner, and socials
      // tokenId will be null until actual minting happens
      const socials: Socials = {
        [provider]: {
          handle,
          verified: true,
        },
      };

      const [newCard] = await this.db
        .insert(schema.basecards)
        .values({
          userId,
          tokenOwner: user.walletAddress,
          socials,
          // tokenId remains null - this is a draft card
        })
        .returning();

      this.logger.log(
        `Created draft basecard ${newCard.id} for userId ${userId} with ${provider}: ${handle}`,
      );
      return;
    }

    const socials = { ...((card.socials as Socials) || {}) };
    const socialKey = provider;

    // Check if update is needed (handle changed or not verified)
    const existingEntry = socials[socialKey];
    if (existingEntry?.handle === handle && existingEntry?.verified === true) {
      this.logger.log(
        `${socialKey} already up-to-date for userId ${userId}: ${handle}`,
      );
      return;
    }

    socials[socialKey] = {
      handle,
      verified: true,
    };

    await this.db
      .update(schema.basecards)
      .set({ socials, updatedAt: new Date() })
      .where(eq(schema.basecards.id, card.id));

    this.logger.log(
      `Updated ${socialKey} for userId ${userId}: ${handle} (verified)`,
    );
  }
}
