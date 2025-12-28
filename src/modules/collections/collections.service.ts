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
import { eq, and } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { UsersService } from '../users/users.service';
import { BasecardsService } from '../basecards/basecards.service';

@Injectable()
export class CollectionsService {
  private readonly logger = new Logger(CollectionsService.name);

  // In-memory cache for collections (1 minute TTL)
  private collectionsCache = new Map<string, { data: any[]; expiry: number }>();
  private readonly CACHE_TTL_MS = 60 * 1000; // 1 minute

  constructor(
    @Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>,
    private usersService: UsersService,
    private basecardsService: BasecardsService,
  ) {}

  async create(userId: string, basecardId: string) {
    this.logger.log(
      `Creating collection: userId=${userId}, card=${basecardId}`,
    );

    // 1. Check if collector has their own BaseCard
    const collectorCard = await this.db.query.basecards.findFirst({
      where: eq(schema.basecards.userId, userId),
    });
    if (!collectorCard) {
      throw new BadRequestException(
        'You must have your own BaseCard before collecting others',
      );
    }

    // 2. Resolve Collected Card (Basecard) by ID
    const collectedCard = await this.db.query.basecards.findFirst({
      where: eq(schema.basecards.id, basecardId),
    });
    if (!collectedCard) {
      throw new NotFoundException(`Basecard not found: ${basecardId}`);
    }

    // 3. Create Collection
    try {
      this.logger.log(
        `Creating collection: collector=${userId}, card=${collectedCard.id}`,
      );
      const [collection] = await this.db
        .insert(schema.collections)
        .values({
          collectorUserId: userId,
          collectedCardId: collectedCard.id,
        })
        .returning();

      // Invalidate cache for this user
      this.collectionsCache.delete(userId);
      this.logger.debug(`Collections cache invalidated for user ${userId}`);

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

  async findAllByUserId(userId: string) {
    const now = Date.now();

    // Check cache first
    const cached = this.collectionsCache.get(userId);
    if (cached && cached.expiry > now) {
      this.logger.debug(`[TIMING] collections cache hit for ${userId}`);
      return cached.data;
    }

    const start = Date.now();
    const collections = await this.db.query.collections.findMany({
      where: eq(schema.collections.collectorUserId, userId),
      with: {
        collectedCard: true,
      },
    });
    const result = collections.map((c) => c.collectedCard);
    this.logger.debug(`[TIMING] collections query: ${Date.now() - start}ms`);

    // Update cache
    this.collectionsCache.set(userId, {
      data: result,
      expiry: now + this.CACHE_TTL_MS,
    });

    return result;
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

  async remove(id: string) {
    // Get collection first to find userId for cache invalidation
    const collection = await this.db.query.collections.findFirst({
      where: eq(schema.collections.id, id),
    });

    await this.db
      .delete(schema.collections)
      .where(eq(schema.collections.id, id));

    // Invalidate cache
    if (collection) {
      this.collectionsCache.delete(collection.collectorUserId);
      this.logger.debug(
        `Collections cache invalidated for user ${collection.collectorUserId}`,
      );
    }

    return { success: true };
  }

  async removeByCardId(userId: string, basecardId: string) {
    // 1. Find the collection (and verify ownership)
    const collection = await this.db.query.collections.findFirst({
      where: and(
        eq(schema.collections.collectedCardId, basecardId),
        eq(schema.collections.collectorUserId, userId),
      ),
    });

    if (!collection) {
      throw new NotFoundException(
        `Collection not found or access denied for card: ${basecardId}`,
      );
    }

    // 2. Delete and invalidate cache
    await this.db
      .delete(schema.collections)
      .where(eq(schema.collections.id, collection.id));

    this.collectionsCache.delete(userId);
    this.logger.debug(`Collections cache invalidated for user ${userId}`);

    return { success: true };
  }
}
