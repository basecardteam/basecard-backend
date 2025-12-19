import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { UpdateCollectionDto } from './dto/update-collection.dto';
import { DRIZZLE } from '../../db/db.module';
import * as schema from '../../db/schema';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { UsersService } from '../users/users.service';
import { BasecardsService } from '../basecards/basecards.service';

@Injectable()
export class CollectionsService {
  private readonly logger = new Logger(CollectionsService.name);

  constructor(
    @Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>,
    private usersService: UsersService,
    private basecardsService: BasecardsService,
  ) {}

  async create(createCollectionDto: CreateCollectionDto) {
    // 1. Resolve Collector (User)
    const collector = await this.usersService.findByAddress(
      createCollectionDto.collectorAddress,
    );
    if (!collector) {
      throw new NotFoundException(
        `Collector user not found: ${createCollectionDto.collectorAddress}`,
      );
    }

    // 2. Resolve Collected Card (Basecard)
    const collectedCard = await this.basecardsService.findByAddress(
      createCollectionDto.collectedAddress,
    );
    if (!collectedCard) {
      throw new NotFoundException(
        `Basecard not found for address: ${createCollectionDto.collectedAddress}`,
      );
    }

    // 3. Create Collection
    try {
      this.logger.log(
        `Creating collection: collector=${collector.id}, card=${collectedCard.id}`,
      );
      const [collection] = await this.db
        .insert(schema.collections)
        .values({
          collectorUserId: collector.id,
          collectedCardId: collectedCard.id,
        })
        .returning();
      return collection;
    } catch (error: any) {
      this.logger.error(
        `Failed to create collection: ${error.cause || error.message}`,
      );
      if (error.code === '23505' || error.cause?.code === '23505') {
        throw new BadRequestException('Collection already exists');
      }
      throw error;
    }
  }

  async findAll(address?: string) {
    if (address) {
      const user = await this.usersService.findByAddress(address);
      if (!user) {
        return [];
      }
      const collections = await this.db.query.collections.findMany({
        where: eq(schema.collections.collectorUserId, user.id),
        with: {
          collectedCard: true,
        },
      });

      return collections.map((c) => c.collectedCard);
    }

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
    throw new BadRequestException('Updating collections is not supported');
  }

  remove(id: string) {
    return this.db
      .delete(schema.collections)
      .where(eq(schema.collections.id, id));
  }
}
