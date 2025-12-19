import {
  Controller,
  Post,
  Body,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login/farcaster')
  @ApiOperation({ summary: 'Login with Farcaster Quick Auth Token' })
  @ApiBody({
    schema: { type: 'object', properties: { token: { type: 'string' } } },
  })
  @HttpCode(HttpStatus.OK)
  async loginFarcaster(@Body('token') token: string) {
    if (!token) throw new UnauthorizedException('Token is required');
    const { address } = await this.authService.validateFarcasterToken(token);
    return this.authService.loginOrRegister(address);
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
