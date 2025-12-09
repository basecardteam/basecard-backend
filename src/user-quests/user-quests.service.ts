import { Inject, Injectable, Logger } from '@nestjs/common';
import { DRIZZLE } from '../db/db.module';
import * as schema from '../db/schema';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

@Injectable()
export class UserQuestsService {
  private readonly logger = new Logger(UserQuestsService.name);

  constructor(@Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>) {}

  async findAll() {
    return this.db.query.userQuests.findMany({
      with: {
        user: true,
        quest: true,
      },
    });
  }
}
