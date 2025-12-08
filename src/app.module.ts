import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DbModule } from './db/db.module';
import { CommonModule } from './common/common.module';
import { UsersModule } from './users/users.module';
import { BasecardsModule } from './basecards/basecards.module';
import { EarnModule } from './earn/earn.module';
import { QuestsModule } from './quests/quests.module';
import { CollectionsModule } from './collections/collections.module';
import { EventsModule } from './events/events.module';
import { LoggingMiddleware } from './common/middleware/logging.middleware';
import { HealthModule } from './health/health.module';
import { DeployModule } from './deploy/deploy.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DbModule,
    CommonModule,
    UsersModule,
    BasecardsModule,
    EarnModule,
    QuestsModule,
    CollectionsModule,
    EventsModule,
    HealthModule,
    DeployModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggingMiddleware).forRoutes('*');
  }
}
