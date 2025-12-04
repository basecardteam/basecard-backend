import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';
import { Inject } from '@nestjs/common';
import { DRIZZLE } from '../db/db.module';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { sql } from 'drizzle-orm';

class DrizzleHealthIndicator extends HealthIndicator {
  constructor(@Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.db.execute(sql`SELECT 1`);
      return this.getStatus(key, true);
    } catch (error) {
      throw new HealthCheckError(
        'Drizzle check failed',
        this.getStatus(key, false, { message: error.message }),
      );
    }
  }
}

@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  private drizzleHealthIndicator: DrizzleHealthIndicator;

  constructor(
    private health: HealthCheckService,
    @Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>,
  ) {
    this.drizzleHealthIndicator = new DrizzleHealthIndicator(this.db);
  }

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.drizzleHealthIndicator.isHealthy('database'),
    ]);
  }
}
