import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DbModule } from '../db/db.module';
import { CommonModule } from './common.module';
import { UsersModule } from '../modules/users/users.module';
import { BasecardsModule } from '../modules/basecards/basecards.module';
import { AuthModule } from '../modules/auth/auth.module';
import { EarnModule } from '../modules/earn/earn.module';
import { QuestsModule } from '../modules/quests/quests.module';
import { UserQuestsModule } from '../modules/user-quests/user-quests.module';
import { CollectionsModule } from '../modules/collections/collections.module';
import { EventsModule } from '../modules/events/events.module';
import { HealthModule } from '../modules/health/health.module';
import { AppConfigModule } from '../modules/config/config.module';
import { ImagesModule } from '../modules/images/images.module';
import { IpfsModule } from '../modules/ipfs/ipfs.module';
import { BlockchainModule } from '../modules/blockchain/blockchain.module';
// middleware
import { LoggingMiddleware } from './middleware/logging.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DbModule,
    CommonModule,
    UsersModule,
    BasecardsModule,
    EarnModule,
    QuestsModule,
    UserQuestsModule,
    CollectionsModule,
    EventsModule,
    HealthModule,
    AppConfigModule,
    ImagesModule,
    IpfsModule,
    BlockchainModule,
    AuthModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggingMiddleware).forRoutes('*');
  }
}
