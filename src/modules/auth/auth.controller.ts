import {
  Controller,
  Post,
  Body,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @Post('login/farcaster')
  @ApiOperation({ summary: 'Login with Farcaster Quick Auth Token' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        token: { type: 'string' },
        clientFid: {
          type: 'number',
          description: 'Farcaster: 9152, BaseApp: 309857',
        },
        loginAddress: {
          type: 'string',
          description:
            'Actual wallet address used for login (may differ from token address)',
        },
      },
    },
  })
  @HttpCode(HttpStatus.OK)
  async loginFarcaster(
    @Body() body: { token: string; clientFid: number; loginAddress: string },
  ) {
    // this.logger.debug(`Farcaster login request: ${JSON.stringify(body)}`);

    const { token, clientFid, loginAddress } = body;

    if (!token) throw new UnauthorizedException('Token is required');
    if (!clientFid) throw new UnauthorizedException('clientFid is required');
    if (!loginAddress)
      throw new UnauthorizedException('loginAddress is required');

    const { address: tokenAddress, fid } =
      await this.authService.validateFarcasterToken(token);

    return this.authService.loginOrRegisterWithFarcaster(
      loginAddress,
      fid,
      clientFid,
      tokenAddress,
    );
  }

  @Post('login/wallet')
  @ApiOperation({ summary: 'Login with Wallet Signature (SIWE style)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        address: { type: 'string' },
        message: { type: 'string' },
        signature: { type: 'string' },
      },
    },
  })
  @HttpCode(HttpStatus.OK)
  async loginWallet(
    @Body('address') address: string,
    @Body('message') message: string,
    @Body('signature') signature: string,
  ) {
    if (!address || !message || !signature) {
      throw new UnauthorizedException('Missing credentials');
    }

    const isValid = await this.authService.verifyWalletSignature(
      address,
      message,
      signature,
    );
    if (!isValid) {
      throw new UnauthorizedException('Invalid signature');
    }

    return this.authService.loginOrRegister(address);
  }
}
