/**
 * Script to test Farcaster follow check via Neynar API
 * Usage: npx tsx scripts/check-fc-follow.ts <user_fid>
 * Example: npx tsx scripts/check-fc-follow.ts 402755
 */

import { NeynarAPIClient, Configuration } from '@neynar/nodejs-sdk';
import * as dotenv from 'dotenv';

dotenv.config();

const TEAM_FID = 1459788; // @basecardteam FID

async function checkFarcasterFollow(userFid: number) {
  const apiKey = process.env.NEYNAR_API_KEY;

  if (!apiKey) {
    console.error('❌ NEYNAR_API_KEY not found in environment');
    process.exit(1);
  }

  console.log(
    `\n🔍 Checking if FID ${userFid} follows team FID ${TEAM_FID}...\n`,
  );

  const client = new NeynarAPIClient(new Configuration({ apiKey }));

  try {
    const startTime = Date.now();
    const response = await client.fetchBulkUsers({
      fids: [TEAM_FID],
      viewerFid: userFid,
    });
    const elapsed = Date.now() - startTime;

    console.log(`⏱️  API response time: ${elapsed}ms\n`);

    if (!response.users || response.users.length === 0) {
      console.error(`❌ Team FID ${TEAM_FID} not found`);
      return;
    }

    const teamUser = response.users[0];
    console.log('📌 Team account info:');
    console.log(`   Username: @${teamUser.username}`);
    console.log(`   Display name: ${teamUser.display_name}`);
    console.log(`   FID: ${teamUser.fid}`);
    console.log();

    const viewerContext = teamUser.viewer_context;
    console.log('👁️  Viewer context (full):');
    console.log(JSON.stringify(viewerContext, null, 2));
    console.log();
    console.log(
      `   followed_by (user follows team): ${viewerContext?.followed_by ?? 'N/A'}`,
    );
    console.log(
      `   following (team follows user): ${viewerContext?.following ?? 'N/A'}`,
    );
    console.log();

    if (viewerContext?.followed_by === true) {
      console.log(`✅ FID ${userFid} IS following @${teamUser.username}`);
    } else {
      console.log(`❌ FID ${userFid} is NOT following @${teamUser.username}`);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

// Main
const userFid = parseInt(process.argv[2], 10);
if (!userFid || isNaN(userFid)) {
  console.log('Usage: npx tsx scripts/check-fc-follow.ts <user_fid>');
  console.log('Example: npx tsx scripts/check-fc-follow.ts 402755');
  process.exit(1);
}

checkFarcasterFollow(userFid);
