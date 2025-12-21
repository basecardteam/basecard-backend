import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../src/db/schema';
import { eq } from 'drizzle-orm';
import { Logger } from '@nestjs/common';

/**
 * Seed test data for frontend development
 * Creates: alice, bob, main user (0x62121e4...) with basecards and collections
 */
async function seedTestData() {
  const logger = new Logger('SeedTestData');

  // Load env vars manually since we are running a script
  require('dotenv').config();

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    logger.error('DATABASE_URL is not set');
    process.exit(1);
  }

  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });

  // Test addresses
  const addresses = {
    alice: '0x1234567890123456789012345678901234567890',
    bob: '0x2345678901234567890123456789012345678901',
    mainUser: '0x62121e4Daa06a23128B568b76D0Bcae33743afA3',
  };

  logger.log('=== Seeding Test Users ===');

  // Create users
  const usersToSeed = [
    { walletAddress: addresses.alice.toLowerCase(), role: 'user' as const },
    { walletAddress: addresses.bob.toLowerCase(), role: 'user' as const },
    { walletAddress: addresses.mainUser.toLowerCase(), role: 'user' as const },
  ];

  const createdUsers: Record<string, typeof schema.users.$inferSelect> = {};

  for (const userData of usersToSeed) {
    const existing = await db.query.users.findFirst({
      where: eq(schema.users.walletAddress, userData.walletAddress),
    });

    if (existing) {
      logger.log(`User ${userData.walletAddress} already exists`);
      createdUsers[userData.walletAddress] = existing;
    } else {
      const [user] = await db
        .insert(schema.users)
        .values({
          walletAddress: userData.walletAddress,
          role: userData.role,
          isNewUser: false,
          hasMintedCard: true,
        })
        .returning();
      logger.log(`Created user: ${userData.walletAddress}`);
      createdUsers[userData.walletAddress] = user;
    }
  }

  logger.log('=== Seeding Test Basecards ===');

  // Create basecards
  const cardsToSeed = [
    {
      userId: createdUsers[addresses.alice.toLowerCase()].id,
      nickname: 'Alice',
      role: 'Developer',
      bio: 'Hello BaseCard! I am Alice, a blockchain developer.',
      imageUri:
        'ipfs://bafkreigqz5iakvf4hz5mj3pa2pczirth25so7756yqydpo7ugoueiyw2bq',
      socials: {
        twitter: '@alice_dev',
        farcaster: '@alice',
        github: '@alice-dev',
      },
      tokenId: 1,
    },
    {
      userId: createdUsers[addresses.bob.toLowerCase()].id,
      nickname: 'Bob',
      role: 'Designer',
      bio: 'Hello BaseCard! I am Bob, a UI/UX designer.',
      imageUri:
        'ipfs://bafkreiconngtwoghv67mz4szq2umbuwzneit6x3zlllu6tg7b5otilkv7a',
      socials: { twitter: '@bob_design', farcaster: '@bob' },
      tokenId: 2,
    },
  ];

  const createdCards: Record<string, typeof schema.basecards.$inferSelect> = {};

  for (const cardData of cardsToSeed) {
    const existing = await db.query.basecards.findFirst({
      where: eq(schema.basecards.userId, cardData.userId),
    });

    if (existing) {
      logger.log(`Basecard for userId ${cardData.userId} already exists`);
      createdCards[cardData.userId] = existing;
    } else {
      const [card] = await db
        .insert(schema.basecards)
        .values(cardData)
        .returning();
      logger.log(`Created basecard: ${cardData.nickname}`);
      createdCards[cardData.userId] = card;
    }
  }

  logger.log('=== Seeding Test Collections ===');

  // Create collections (main user collects alice and bob)
  const mainUser = createdUsers[addresses.mainUser.toLowerCase()];
  const aliceCard =
    createdCards[createdUsers[addresses.alice.toLowerCase()].id];
  const bobCard = createdCards[createdUsers[addresses.bob.toLowerCase()].id];

  const collectionsToSeed = [
    { collectorUserId: mainUser.id, collectedCardId: aliceCard?.id },
    { collectorUserId: mainUser.id, collectedCardId: bobCard?.id },
  ].filter((c) => c.collectedCardId); // Filter out if card doesn't exist

  for (const collectionData of collectionsToSeed) {
    try {
      const existing = await db.query.collections.findFirst({
        where: eq(
          schema.collections.collectorUserId,
          collectionData.collectorUserId,
        ),
      });

      // Check if this specific collection exists
      const collections = await db.query.collections.findMany({
        where: eq(
          schema.collections.collectorUserId,
          collectionData.collectorUserId,
        ),
      });

      const alreadyExists = collections.some(
        (c) => c.collectedCardId === collectionData.collectedCardId,
      );

      if (alreadyExists) {
        logger.log(
          `Collection already exists: collector=${collectionData.collectorUserId}, card=${collectionData.collectedCardId}`,
        );
      } else {
        await db.insert(schema.collections).values(collectionData);
        logger.log(
          `Created collection: collector=${collectionData.collectorUserId}, card=${collectionData.collectedCardId}`,
        );
      }
    } catch (error: any) {
      if (error.code === '23505') {
        logger.log('Collection already exists, skipping');
      } else {
        throw error;
      }
    }
  }

  logger.log('=== Seed Complete ===');
  logger.log(`Main user address: ${addresses.mainUser}`);
  logger.log(`Alice address: ${addresses.alice}`);
  logger.log(`Bob address: ${addresses.bob}`);

  await pool.end();
}

seedTestData().catch((err) => {
  console.error(err);
  process.exit(1);
});
