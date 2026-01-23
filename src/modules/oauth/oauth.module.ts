import { Module } from '@nestjs/common';
import { OAuthController } from './oauth.controller';
import { OAuthService } from './oauth.service';
import { BasecardsModule } from '../basecards/basecards.module';
import { UsersModule } from '../users/users.module';
import { AppConfigModule } from '../config/config.module';

@Module({
  imports: [BasecardsModule, UsersModule, AppConfigModule],
  controllers: [OAuthController],
  providers: [OAuthService],
  exports: [OAuthService],
})
export class OAuthModule {}
