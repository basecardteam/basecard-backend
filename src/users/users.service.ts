import { Inject, Injectable, Logger } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { DRIZZLE } from '../db/db.module';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(@Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>) {}

  async create(createUserDto: CreateUserDto) {
    // Check if user exists
    const existing = await this.db.query.users.findFirst({
      where: eq(schema.users.walletAddress, createUserDto.walletAddress),
    });

    if (existing) {
      this.logger.debug(`User already exists: ${existing.id}`);
      return existing;
    }

    const [user] = await this.db
      .insert(schema.users)
      .values({
        walletAddress: createUserDto.walletAddress,
        isNewUser: true,
      })
      .returning();
    this.logger.log(`Created new user: ${user.id}`);
    return user;
  }

  findAll() {
    return this.db.query.users.findMany();
  }

  findOne(id: string) {
    return this.db.query.users.findFirst({
      where: eq(schema.users.id, id),
      with: {
        card: true,
        earnList: true,
        collections: true,
      },
    });
  }

  async findByAddress(address: string) {
    return this.db.query.users.findFirst({
      where: eq(schema.users.walletAddress, address),
      with: {
        card: true,
      },
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const [updated] = await this.db
      .update(schema.users)
      .set({
        ...updateUserDto,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, id))
      .returning();
    return updated;
  }

  async increasePoints(address: string, points: number) {
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.walletAddress, address),
    });

    if (!user) {
      this.logger.warn(`User not found for points increase: ${address}`);
      throw new Error('User not found');
    }

    const [updated] = await this.db
      .update(schema.users)
      .set({
        totalPoints: user.totalPoints + points,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.walletAddress, address))
      .returning();
    return updated;
  }

  async updateByAddress(address: string, updateUserDto: UpdateUserDto) {
    const [updated] = await this.db
      .update(schema.users)
      .set({
        ...updateUserDto,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.walletAddress, address))
      .returning();
    return updated;
  }

  remove(id: string) {
    return this.db.delete(schema.users).where(eq(schema.users.id, id));
  }
}
