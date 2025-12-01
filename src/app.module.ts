import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DbModule } from './db/db.module';
import { CommonModule } from './common/common.module';
import { UsersModule } from './users/users.module';
import { CardsModule } from './cards/cards.module';
import { EarnModule } from './earn/earn.module';
import { QuestsModule } from './quests/quests.module';
import { CollectionsModule } from './collections/collections.module';
import { LoggingMiddleware } from './common/middleware/logging.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DbModule,
    CommonModule,
    UsersModule,
    CardsModule,
    EarnModule,
    QuestsModule,
    CollectionsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggingMiddleware).forRoutes('*');
  }
}
