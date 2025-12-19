import { Inject, Injectable } from '@nestjs/common';
import { CreateEarnDto } from './dto/create-earn.dto';
import { UpdateEarnDto } from './dto/update-earn.dto';
import { DRIZZLE } from '../../db/db.module';
import * as schema from '../../db/schema';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

@Injectable()
export class EarnService {
  constructor(@Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>) {}

  async create(createEarnDto: CreateEarnDto) {
    const [earn] = await this.db
      .insert(schema.earn)
      .values({
        ...createEarnDto,
        // Assuming ownerUserId is passed or handled via auth (not implemented yet)
        // For now, we might need to look up user by address if provided in DTO
      })
      .returning();
    return earn;
  }

  findAll() {
    return this.db.query.earn.findMany({
      with: {
        owner: true,
      },
    });
  }

  findOne(id: string) {
    return this.db.query.earn.findFirst({
      where: eq(schema.earn.id, id),
      with: {
        owner: true,
      },
    });
  }

  async update(id: string, updateEarnDto: UpdateEarnDto) {
    const [updated] = await this.db
      .update(schema.earn)
      .set({
        ...updateEarnDto,
        updatedAt: new Date(),
      })
      .where(eq(schema.earn.id, id))
      .returning();
    return updated;
  }

  remove(id: string) {
    return this.db.delete(schema.earn).where(eq(schema.earn.id, id));
  }
}
