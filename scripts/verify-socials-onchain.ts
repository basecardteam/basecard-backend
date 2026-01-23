/**
 * Verification Script: Compare migrated DB socials with on-chain data
 *
 * This script verifies that the migrated socials in the database match
 * what is stored on-chain for each user.
 *
 * Usage: npx ts-node -r dotenv/config scripts/verify-socials-onchain.ts
 */

import { Client } from 'pg';
import { createPublicClient, http } from 'viem';
import { baseSepolia, base } from 'viem/chains';
import * as BaseCardABI from '../src/modules/blockchain/abi/BaseCard.json';

interface NewSocialEntry {
  handle: string;
  verified: boolean;
}

interface NewSocials {
  [key: string]: NewSocialEntry;
}

const SOCIAL_KEYS = ['github', 'x', 'twitter', 'farcaster', 'linkedin'];

async function verifyOnChainSocials() {
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

  try {
    // Fetch all minted cards with socials
    const result = await dbClient.query(`
      SELECT bc.id, bc.token_id, bc.token_owner, bc.nickname, bc.socials
      FROM basecards bc
      WHERE bc.token_id IS NOT NULL
        AND bc.socials IS NOT NULL
      ORDER BY bc.token_id
    `);

    console.log(`Found ${result.rows.length} minted cards with socials\n`);
    console.log('='.repeat(80));

    let matchCount = 0;
    let mismatchCount = 0;
    let errorCount = 0;

    for (const row of result.rows) {
      const { id, token_id, token_owner, nickname, socials } = row;
      const dbSocials = socials as NewSocials;

      console.log(
        `\n[Token #${token_id}] ${nickname || 'N/A'} (${token_owner})`,
      );

      for (const key of SOCIAL_KEYS) {
        const dbEntry = dbSocials[key];
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

          if (normalizedDbHandle === normalizedOnChain) {
            if (dbHandle || onChainValue) {
              console.log(`  ✓ ${key}: "${dbHandle}" (matches on-chain)`);
            }
            matchCount++;
          } else {
            console.log(
              `  ✗ ${key}: DB="${dbHandle}" vs OnChain="${onChainValue}"`,
            );
            mismatchCount++;
          }
        } catch (err) {
          // Social key might not exist on-chain
          if (dbHandle) {
            console.log(`  ? ${key}: DB="${dbHandle}" (on-chain read failed)`);
            errorCount++;
          }
        }
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('\n=== Verification Summary ===');
    console.log(`Total cards checked: ${result.rows.length}`);
    console.log(`Matched fields: ${matchCount}`);
    console.log(`Mismatched fields: ${mismatchCount}`);
    console.log(`Errors: ${errorCount}`);

    if (mismatchCount === 0 && errorCount === 0) {
      console.log('\n✅ All socials verified successfully!');
    } else {
      console.log('\n⚠️  Some socials need attention');
    }
  } catch (err) {
    console.error('Verification failed:', err);
    process.exit(1);
  } finally {
    await dbClient.end();
    console.log('\nDatabase connection closed');
  }
}

verifyOnChainSocials();
