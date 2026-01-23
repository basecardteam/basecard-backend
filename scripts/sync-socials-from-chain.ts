/**
 * Sync Script: Sync DB socials with on-chain data
 *
 * This script updates the database to match on-chain data.
 * It prioritizes on-chain data: if on-chain data exists, it updates the DB.
 *
 * Usage: npx ts-node -r dotenv/config scripts/sync-socials-from-chain.ts [--execute]
 */

import { Client } from 'pg';
import { createPublicClient, http } from 'viem';
import { baseSepolia, base } from 'viem/chains';
import * as BaseCardABI from '../src/modules/blockchain/abi/BaseCard.json';

const EXECUTE = process.argv.includes('--execute');

interface Metric {
  updated: number;
  skipped: number;
  errors: number;
}

interface NewSocialEntry {
  handle: string;
  verified: boolean;
}

interface NewSocials {
  [key: string]: NewSocialEntry;
}

const SOCIAL_KEYS = ['github', 'x', 'twitter', 'farcaster', 'linkedin'];

async function syncSocialsFromChain() {
  // Database connection
  const dbClient = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  await dbClient.connect();
  console.log('Connected to database\n');

  // Blockchain client
  const chainId = parseInt(process.env.CHAIN_ID || '84532');
  const chain = chainId === 8453 ? base : baseSepolia;
  const contractAddress = process.env
    .BASECARD_CONTRACT_ADDRESS as `0x${string}`;

  const rpcUrl =
    process.env.BASE_HTTP_RPC_URLS?.split(',')[0] ||
    (chainId === 8453
      ? 'https://mainnet.base.org'
      : 'https://sepolia.base.org');

  const evmClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  console.log(`Chain: ${chain.name}`);
  console.log(`Contract: ${contractAddress}\n`);
  console.log(
    `Mode: ${EXECUTE ? 'EXECUTE (Updating DB)' : 'DRY RUN (Read-only)'}\n`,
  );

  try {
    // Fetch all minted cards
    const result = await dbClient.query(`
      SELECT bc.id, bc.token_id, bc.token_owner, bc.nickname, bc.socials
      FROM basecards bc
      WHERE bc.token_id IS NOT NULL
      ORDER BY bc.token_id
    `);

    console.log(`Found ${result.rows.length} minted cards\n`);
    console.log('='.repeat(80));

    const metrics: Metric = { updated: 0, skipped: 0, errors: 0 };

    for (const row of result.rows) {
      const { id, token_id, token_owner, nickname, socials } = row;
      let dbSocials = (socials || {}) as NewSocials;
      let hasChanges = false;
      const updates: string[] = [];

      // console.log(`\n[Token #${token_id}] ${nickname || 'N/A'}`);

      for (const key of SOCIAL_KEYS) {
        // Map 'twitter' to 'x' in DB if needed, but on-chain keys are what they are.
        // On-chain typically uses 'x' or 'twitter'? Contract usually uses 'twitter' or 'x'.
        // Let's assume on-chain uses 'github', 'x', 'farcaster', 'linkedin'.
        // If query uses SOCIAL_KEYS, we should map them to DB keys.
        // DB keys: github, x, farcaster, linkedin.

        // Map on-chain key to DB key
        let dbKey = key;
        if (key === 'twitter') dbKey = 'x';

        const dbEntry = dbSocials[dbKey];
        const dbHandle = dbEntry?.handle || '';

        try {
          // Get on-chain value
          const onChainValue = (await evmClient.readContract({
            address: contractAddress,
            abi: BaseCardABI.abi,
            functionName: 'getSocial',
            args: [BigInt(token_id), key],
          })) as string;

          const normalizedDbHandle = dbHandle.toLowerCase().trim();
          const normalizedOnChain = (onChainValue || '').toLowerCase().trim();

          if (normalizedOnChain && normalizedOnChain !== normalizedDbHandle) {
            // On-chain value exists and differs from DB
            // Update DB to match OnChain
            updates.push(`${dbKey}: "${dbHandle}" -> "${onChainValue}"`);

            dbSocials[dbKey] = {
              handle: onChainValue,
              verified: false, // Reset verified flag as source changed? Or keep current?
              // Safe to assume false if we just synced from a string
            };
            hasChanges = true;
          }
        } catch (err) {
          // Ignore read errors (key might not exist on contract)
        }
      }

      if (hasChanges) {
        console.log(
          `\n[Token #${token_id}] ${nickname || 'N/A'} - Found changes:`,
        );
        updates.forEach((u) => console.log(`  - ${u}`));

        if (EXECUTE) {
          await dbClient.query(
            `UPDATE basecards SET socials = $1 WHERE id = $2`,
            [JSON.stringify(dbSocials), id],
          );
          console.log('  ✅ DB Updated');
          metrics.updated++;
        } else {
          console.log('  Wait for --execute to update');
          metrics.skipped++;
        }
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('\n=== Sync Summary ===');
    console.log(`Cards Updated: ${metrics.updated}`);
    console.log(`Cards Skipped: ${metrics.skipped}`);
  } catch (err) {
    console.error('Sync failed:', err);
    process.exit(1);
  } finally {
    await dbClient.end();
    console.log('\nDatabase connection closed');
  }
}

syncSocialsFromChain();
