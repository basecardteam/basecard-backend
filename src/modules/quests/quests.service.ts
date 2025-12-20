import { Inject, Injectable, Logger, ConflictException } from '@nestjs/common';
import { CreateQuestDto } from './dto/create-quest.dto';
import { UpdateQuestDto } from './dto/update-quest.dto';
import { DRIZZLE } from '../../db/db.module';
import * as schema from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

@Injectable()
export class QuestsService {
  private readonly logger = new Logger(QuestsService.name);

  constructor(@Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>) {}

  async create(createQuestDto: CreateQuestDto) {
    // Check if quest with same platform + actionType already exists
    const existing = await this.db.query.quests.findFirst({
      where: and(
        eq(schema.quests.platform, createQuestDto.platform),
        eq(schema.quests.actionType, createQuestDto.actionType),
      ),
    });

    if (existing) {
      throw new ConflictException(
        `Quest with platform '${createQuestDto.platform}' and actionType '${createQuestDto.actionType}' already exists`,
      );
    }

    const [quest] = await this.db
      .insert(schema.quests)
      .values({
        title: createQuestDto.title,
        description: createQuestDto.description,
        platform: createQuestDto.platform,
        actionType: createQuestDto.actionType,
        frequency: createQuestDto.frequency,
        cooldownSecond: createQuestDto.cooldownSecond,
        rewardAmount: createQuestDto.rewardAmount,
      })
      .returning();
    return quest;
  }

  findAll() {
    return this.db.query.quests.findMany({
      orderBy: (quests, { desc }) => [desc(quests.createdAt)],
    });
  }

  /**
   * Get all active quests (for public access)
   */
  findAllActive() {
    return this.db.query.quests.findMany({
      where: eq(schema.quests.isActive, true),
      orderBy: (quests, { desc }) => [desc(quests.createdAt)],
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

  /**
   * Set quest active status
   */
  async setActive(id: string, isActive: boolean) {
    const [updated] = await this.db
      .update(schema.quests)
      .set({ isActive })
      .where(eq(schema.quests.id, id))
      .returning();
    return updated;
  }

  remove(id: string) {
    return this.db.delete(schema.quests).where(eq(schema.quests.id, id));
  }
}
