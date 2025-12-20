import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../src/db/schema';
import { eq, and } from 'drizzle-orm';
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

  // Quest Seed Data: Platform + ActionType format
  // Based on user's mapping from the image
  const questsToSeed = [
    // APP Platform
    {
      title: 'Mint your BaseCard',
      description: 'Mint your first onchain ID card',
      platform: 'APP' as const,
      actionType: 'APP_BASECARD_MINT',
      rewardAmount: 200,
      frequency: 'ONCE' as const,
    },
    {
      title: 'Notification ON',
      description: 'Add BaseCard miniapp & enable notification',
      platform: 'APP' as const,
      actionType: 'APP_NOTIFICATION',
      rewardAmount: 200,
      frequency: 'ONCE' as const,
    },
    {
      title: 'Add BaseCard App',
      description: 'Add BaseCard to your Farcaster apps',
      platform: 'APP' as const,
      actionType: 'APP_ADD_MINIAPP',
      rewardAmount: 100,
      frequency: 'ONCE' as const,
    },
    // FARCASTER Platform
    {
      title: 'Link Farcaster',
      description: 'Link your Farcaster account',
      platform: 'FARCASTER' as const,
      actionType: 'FC_LINK',
      rewardAmount: 10,
      frequency: 'ONCE' as const,
    },
    {
      title: 'Share on Farcaster',
      description: 'Share your BaseCard on Farcaster',
      platform: 'FARCASTER' as const,
      actionType: 'FC_SHARE',
      rewardAmount: 200,
      frequency: 'ONCE' as const,
    },
    {
      title: 'Follow @basecardteam',
      description: 'Follow the official basecard account on Farcaster',
      platform: 'FARCASTER' as const,
      actionType: 'FC_FOLLOW',
      rewardAmount: 200,
      frequency: 'ONCE' as const,
    },
    // TWITTER Platform
    {
      title: 'Link Twitter',
      description: 'Link your Twitter account',
      platform: 'TWITTER' as const,
      actionType: 'X_LINK',
      rewardAmount: 10,
      frequency: 'ONCE' as const,
    },
    // GITHUB Platform
    {
      title: 'Link Github',
      description: 'Link your Github account',
      platform: 'GITHUB' as const,
      actionType: 'GH_LINK',
      rewardAmount: 10,
      frequency: 'ONCE' as const,
    },
    // LINKEDIN Platform
    {
      title: 'Link LinkedIn',
      description: 'Link your LinkedIn account',
      platform: 'LINKEDIN' as const,
      actionType: 'LI_LINK',
      rewardAmount: 10,
      frequency: 'ONCE' as const,
    },
    // BASENAME Platform
    {
      title: 'Link Basename',
      description: 'Link your Basename',
      platform: 'BASENAME' as const,
      actionType: 'BASE_LINK_NAME',
      rewardAmount: 10,
      frequency: 'ONCE' as const,
    },
  ];

  logger.log('Seeding quests...');

  for (const quest of questsToSeed) {
    const existing = await db.query.quests.findFirst({
      where: and(
        eq(schema.quests.platform, quest.platform),
        eq(schema.quests.actionType, quest.actionType),
      ),
    });

    if (existing) {
      logger.log(
        `Quest ${quest.platform}:${quest.actionType} already exists, skipping.`,
      );
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
