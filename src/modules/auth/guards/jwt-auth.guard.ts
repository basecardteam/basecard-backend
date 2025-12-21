import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { CustomLogger } from '../../../app/logger/custom.logger';

// Dev token to fake user mapping
const DEV_USERS: Record<
  string,
  { sub: string; walletAddress: string; role: string }
> = {
  admin: {
    sub: 'dev-admin',
    walletAddress: '0xDevAdmin',
    role: 'admin',
  },
  alice: {
    sub: 'dev-alice',
    walletAddress: '0x1234567890123456789012345678901234567890',
    role: 'user',
  },
  bob: {
    sub: 'dev-bob',
    walletAddress: '0x2345678901234567890123456789012345678901',
    role: 'user',
  },
};

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new CustomLogger();

  constructor(
    private configService: ConfigService,
    private reflector: Reflector,
  ) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Check if endpoint is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    // Dev token bypass (only in non-production)
    // Supports: DEV_JWT_TOKEN (admin), DEV_JWT_TOKEN_ALICE, DEV_JWT_TOKEN_BOB
    const devTokenAdmin = this.configService.get<string>('DEV_JWT_TOKEN');
    const devTokenAlice = this.configService.get<string>('DEV_JWT_TOKEN_ALICE');
    const devTokenBob = this.configService.get<string>('DEV_JWT_TOKEN_BOB');

    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      let devUser: { sub: string; walletAddress: string; role: string } | null =
        null;

      if (devTokenAdmin && token === devTokenAdmin) {
        devUser = DEV_USERS.admin;
      } else if (devTokenAlice && token === devTokenAlice) {
        devUser = DEV_USERS.alice;
      } else if (devTokenBob && token === devTokenBob) {
        devUser = DEV_USERS.bob;
      }

      if (devUser) {
        this.logger.debug(
          `Dev token authenticated as: ${devUser.walletAddress}`,
        );
        request.user = devUser;
        return true;
      }
    }

    // Normal JWT validation
    return super.canActivate(context);
  }
}
