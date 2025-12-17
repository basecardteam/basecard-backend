import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../src/db/schema';
import { eq } from 'drizzle-orm';
import { Logger } from '@nestjs/common';

async function seed() {
  const logger = new Logger('SeedQuests');

  // Load env vars manually since we are running a script
  require('dotenv').config();

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    logger.error('DATABASE_URL is not set');
    process.exit(1);
  }

  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });

  const questsToSeed = [
    {
      title: 'Mint your BaseCard',
      description: 'Mint your first onchain ID card',
      rewardAmount: 200,
      actionType: 'MINT',
    },
    {
      title: 'Share on Farcaster',
      description: 'Share your BaseCard on Farcaster',
      rewardAmount: 200,
      actionType: 'SHARE',
    },
    {
      title: 'Notification ON',
      description: 'Add BaseCard miniapp & enable notification',
      rewardAmount: 200,
      actionType: 'NOTIFICATION',
    },
    {
      title: 'Follow @basecardteam',
      description: 'Follow the official basecard account',
      rewardAmount: 200,
      actionType: 'FOLLOW',
    },
    {
      title: 'Link Twitter',
      description: 'Link your Twitter account',
      rewardAmount: 10,
      actionType: 'LINK_TWITTER',
    },
    {
      title: 'Link Farcaster',
      description: 'Link your Farcaster account',
      rewardAmount: 10,
      actionType: 'LINK_FARCASTER',
    },
    {
      title: 'Link Website',
      description: 'Link your Website',
      rewardAmount: 10,
      actionType: 'LINK_WEBSITE',
    },
    {
      title: 'Link Github',
      description: 'Link your Github account',
      rewardAmount: 10,
      actionType: 'LINK_GITHUB',
    },
    {
      title: 'Link LinkedIn',
      description: 'Link your LinkedIn account',
      rewardAmount: 10,
      actionType: 'LINK_LINKEDIN',
    },
    {
      title: 'Link Basename',
      description: 'Link your Basename',
      rewardAmount: 10,
      actionType: 'LINK_BASENAME',
    },
  ];

  logger.log('Seeding quests...');

  for (const quest of questsToSeed) {
    const existing = await db.query.quests.findFirst({
      where: eq(schema.quests.actionType, quest.actionType),
    });

    if (existing) {
      logger.log(`Quest ${quest.actionType} already exists, skipping.`);
    } else {
      await db.insert(schema.quests).values(quest);
      logger.log(`Created quest: ${quest.title}`);
    }
  }

  logger.log('Seeding completed.');
  await pool.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
