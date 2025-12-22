import { Injectable, Inject, Logger } from '@nestjs/common';
import { DRIZZLE } from '../../db/db.module';
import * as schema from '../../db/schema';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

@Injectable()
export class UserWalletsService {
  private readonly logger = new Logger(UserWalletsService.name);

  constructor(@Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>) {}

  findAll() {
    return this.db.query.userWallets.findMany();
  }

  findByUserId(userId: string) {
    return this.db.query.userWallets.findMany({
      where: eq(schema.userWallets.userId, userId),
    });
  }

  findByAddress(address: string) {
    return this.db.query.userWallets.findFirst({
      where: eq(schema.userWallets.walletAddress, address.toLowerCase()),
    });
  }
}
