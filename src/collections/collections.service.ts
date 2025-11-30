import { Inject, Injectable } from '@nestjs/common';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { UpdateCollectionDto } from './dto/update-collection.dto';
import { DRIZZLE } from '../db/db.module';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

@Injectable()
export class CollectionsService {
  constructor(@Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>) {}

  async create(createCollectionDto: CreateCollectionDto) {
    const [collection] = await this.db
      .insert(schema.collections)
      .values(createCollectionDto)
      .returning();
    return collection;
  }

  findAll() {
    return this.db.query.collections.findMany({
      with: {
        collector: true,
        collectedCard: true,
      },
    });
  }

  findOne(id: string) {
    return this.db.query.collections.findFirst({
      where: eq(schema.collections.id, id),
      with: {
        collector: true,
        collectedCard: true,
      },
    });
  }

  async update(id: string, updateCollectionDto: UpdateCollectionDto) {
    // Collections might not be updatable in this simple model, but implementing for completeness
    const [updated] = await this.db
      .update(schema.collections)
      .set(updateCollectionDto)
      .where(eq(schema.collections.id, id))
      .returning();
    return updated;
  }

  remove(id: string) {
    return this.db
      .delete(schema.collections)
      .where(eq(schema.collections.id, id));
  }
}
