import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HttpModule } from '@nestjs/axios';
import { HealthController } from './health.controller';
import { DbModule } from '../../db/db.module';

@Module({
  imports: [TerminusModule, HttpModule, DbModule],
  controllers: [HealthController],
})
export class HealthModule {}
