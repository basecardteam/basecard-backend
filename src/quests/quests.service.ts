import { Inject, Injectable, Logger } from '@nestjs/common';
import { CreateQuestDto } from './dto/create-quest.dto';
import { UpdateQuestDto } from './dto/update-quest.dto';
import { DRIZZLE } from '../db/db.module';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

@Injectable()
export class QuestsService {
  private readonly logger = new Logger(QuestsService.name);

  constructor(@Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>) {}

  async create(createQuestDto: CreateQuestDto) {
    const [quest] = await this.db
      .insert(schema.quests)
      .values({
        title: createQuestDto.title,
        description: createQuestDto.description,
        rewardAmount: createQuestDto.rewardAmount,
        actionType: createQuestDto.actionType,
      })
      .returning();
    return quest;
  }

  findAll() {
    return this.db.query.quests.findMany({
      orderBy: (quests, { asc }) => [asc(quests.title)],
    });
  }

  findOne(id: string) {
    return this.db.query.quests.findFirst({
      where: eq(schema.quests.id, id),
    });
  }

  async update(id: string, updateQuestDto: UpdateQuestDto) {
    const [updated] = await this.db
      .update(schema.quests)
      .set({
        ...updateQuestDto,
      })
      .where(eq(schema.quests.id, id))
      .returning();
    return updated;
  }

  remove(id: string) {
    return this.db.delete(schema.quests).where(eq(schema.quests.id, id));
  }
}
