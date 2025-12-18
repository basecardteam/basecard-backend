import { NeynarAPIClient, Configuration } from '@neynar/nodejs-sdk';
import { Logger } from '@nestjs/common';
import * as dotenv from 'dotenv';
import * as path from 'path';

async function run() {
  const logger = new Logger('TestFetchCasts');

  // Load .env from backend root
  dotenv.config({ path: path.resolve(__dirname, '../.env') });

  const apiKey = process.env.NEYNAR_API_KEY;
  if (!apiKey) {
    logger.error('NEYNAR_API_KEY is not set');
    process.exit(1);
  }

  const neynarClient = new NeynarAPIClient(new Configuration({ apiKey }));
  const fid = 402755; // User provided FID

  logger.log(`Fetching casts for FID: ${fid}...`);

  try {
    const { casts } = await neynarClient.fetchCastsForUser({
      fid: fid,
      limit: 5,
    });

    logger.log(`Fetched ${casts.length} casts.`);

    let hasShared = false;

    casts.forEach((cast, index) => {
      const text = cast.text.toLowerCase();
      logger.log(`[Cast ${index + 1}] ${cast.text}`);

      const isMatch =
        text.includes('basecard') || text.includes('minted my basecard');
      if (isMatch) {
        logger.log(`   -> MATCH FOUND!`);
        hasShared = true;
      }
    });

    if (hasShared) {
      logger.log('✅ Verification SUCCESS: User has shared about BaseCard.');
    } else {
      logger.warn(
        '❌ Verification FAILED: No matching cast found in the last 5 casts.',
      );
    }
  } catch (error) {
    logger.error('Error fetching casts:', error);
  }
}

run();
