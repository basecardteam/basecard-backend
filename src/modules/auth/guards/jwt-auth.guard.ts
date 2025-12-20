import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { CustomLogger } from '../../../app/logger/custom.logger';

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
    const devToken = this.configService.get<string>('DEV_JWT_TOKEN');
    if (devToken && authHeader === `Bearer ${devToken}`) {
      this.logger.debug('Dev token bypassed authentication');
      // Inject a fake admin user for dev token
      request.user = {
        sub: 'dev-admin',
        walletAddress: '0xDevAdmin',
        role: 'admin',
      };
      return true;
    }

    // Normal JWT validation
    return super.canActivate(context);
  }
}
