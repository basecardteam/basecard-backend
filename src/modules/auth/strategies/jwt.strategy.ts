import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../../app/configs/app-config.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(private readonly appConfigService: AppConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: appConfigService.jwtSecret,
    });
  }

  async validate(payload: any) {
    // this.logger.debug(`JWT payload: ${JSON.stringify(payload)}`);
    return {
      userId: payload.sub,
      role: payload.role,
      fid: payload.fid,
      walletAddress: payload.walletAddress,
    };
  }
}
