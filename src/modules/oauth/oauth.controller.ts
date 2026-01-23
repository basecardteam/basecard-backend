import {
  Controller,
  Get,
  Delete,
  Query,
  Param,
  Res,
  Req,
  UseGuards,
  HttpException,
  HttpStatus,
  Request,
} from '@nestjs/common';
import type { Response } from 'express';
import { OAuthService, OAuthProvider } from './oauth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

interface AuthenticatedUser {
  userId: string;
  walletAddress: string;
}
@Controller('oauth')
export class OAuthController {
  constructor(private readonly oauthService: OAuthService) {}

  /**
   * Initiate OAuth flow
   * GET /oauth/:provider/init?clientFid=xxx&returnUrl=xxx
   *
   * Returns the OAuth authorization URL for the frontend to redirect to.
   */
  @Get(':provider/init')
  @UseGuards(JwtAuthGuard)
  async initOAuth(
    @Param('provider') provider: string,
    @Query('clientFid') clientFid: string,
    @Query('returnUrl') returnUrl: string,
    @Request() req,
  ): Promise<{ authUrl: string; state: string }> {
    const user = req.user as AuthenticatedUser;
    const validProvider = this.validateProvider(provider);

    const result = await this.oauthService.initOAuth(validProvider, {
      userId: user.userId,
      clientFid: clientFid ? parseInt(clientFid, 10) : undefined,
      returnUrl: returnUrl || '/edit-profile',
    });

    return {
      authUrl: result.authUrl,
      state: result.state,
    };
  }

  /**
   * OAuth callback (called by OAuth provider)
   * GET /oauth/:provider/callback?code=xxx&state=xxx
   *
   * This endpoint handles the OAuth callback from the provider.
   * After processing, redirects user back to the MiniApp.
   */
  @Get(':provider/callback')
  async handleCallback(
    @Param('provider') provider: string,
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Query('error_description') errorDescription: string,
    @Res() res: Response,
  ) {
    const validProvider = this.validateProvider(provider);

    // Handle OAuth errors
    if (error) {
      const errorUrl = await this.oauthService.getErrorRedirectUrl(
        state,
        error,
        errorDescription,
      );
      return res.redirect(errorUrl);
    }

    if (!code || !state) {
      return res.redirect('/edit-profile?oauth_error=missing_params');
    }

    try {
      const result = await this.oauthService.handleCallback(
        validProvider,
        code,
        state,
      );

      // Redirect to MiniApp with success params
      return res.redirect(result.redirectUrl);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      // Try to get the return URL from state
      const errorUrl = await this.oauthService.getErrorRedirectUrl(
        state,
        'callback_failed',
        errorMsg,
      );
      return res.redirect(errorUrl);
    }
  }

  /**
   * Check OAuth connection status (for frontend polling)
   * GET /oauth/:provider/status
   */
  @Get(':provider/status')
  @UseGuards(JwtAuthGuard)
  async getStatus(
    @Param('provider') provider: string,
    @Request() req,
  ): Promise<{ connected: boolean; username?: string; displayName?: string }> {
    const user = req.user as AuthenticatedUser;
    const validProvider = this.validateProvider(provider);

    const status = await this.oauthService.getConnectionStatus(
      validProvider,
      user.userId,
    );

    return status;
  }

  /**
   * Disconnect OAuth provider
   * DELETE /oauth/:provider
   */
  @Delete(':provider')
  @UseGuards(JwtAuthGuard)
  async disconnect(
    @Param('provider') provider: string,
    @Request() req,
  ): Promise<{ success: boolean }> {
    const user = req.user as AuthenticatedUser;
    console.log(
      `[OAuthController] Disconnect request received for provider: ${provider}, user: ${user.userId}`,
    );
    const validProvider = this.validateProvider(provider);
    await this.oauthService.disconnect(validProvider, user.userId);

    return { success: true };
  }

  private validateProvider(provider: string): OAuthProvider {
    const validProviders: OAuthProvider[] = ['github', 'x', 'linkedin'];
    if (!validProviders.includes(provider as OAuthProvider)) {
      throw new HttpException(
        `Invalid provider: ${provider}`,
        HttpStatus.BAD_REQUEST,
      );
    }
    return provider as OAuthProvider;
  }
}
