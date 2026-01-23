/**
 * Migration Script: Convert socials to nested object format
 *
 * Before: { github: 'username', twitter: 'handle', ... }
 * After:  { github: { handle: 'username', verified: false }, twitter: { handle: 'handle', verified: false }, ... }
 *
 * Usage: npx ts-node -r dotenv/config scripts/migrate-socials.ts
 */

import { Client } from 'pg';

interface OldSocials {
  [key: string]: string;
}

interface NewSocialEntry {
  handle: string;
  verified: boolean;
}

interface NewSocials {
  [key: string]: NewSocialEntry;
}

async function migrateSocials() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  await client.connect();
  console.log('Connected to database');

  try {
    // 1. Fetch all basecards with socials
    const result = await client.query(`
      SELECT id, socials, token_owner
      FROM basecards
      WHERE socials IS NOT NULL
    `);

    console.log(`Found ${result.rows.length} cards with socials`);

    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const row of result.rows) {
      const { id, socials, token_owner } = row;

      // Skip if socials is null or already migrated
      if (!socials || typeof socials !== 'object') {
        skippedCount++;
        continue;
      }

      // Check if already migrated (has nested object structure)
      const firstValue = Object.values(socials)[0];
      if (
        firstValue &&
        typeof firstValue === 'object' &&
        'handle' in (firstValue as object)
      ) {
        console.log(`Skipping ${id} - already migrated`);
        skippedCount++;
        continue;
      }

      // Convert to new format
      const newSocials: NewSocials = {};
      for (const [key, value] of Object.entries(socials as OldSocials)) {
        if (value && typeof value === 'string' && value.trim() !== '') {
          newSocials[key] = {
            handle: value,
            verified: false, // Default to false
          };
        }
      }

      // Update database
      try {
        await client.query(
          `UPDATE basecards SET socials = $1, updated_at = NOW() WHERE id = $2`,
          [JSON.stringify(newSocials), id],
        );
        console.log(`Migrated ${id} (${token_owner}):`, newSocials);
        migratedCount++;
      } catch (err) {
        console.error(`Failed to migrate ${id}:`, err);
        errorCount++;
      }
    }

    console.log('\n=== Migration Summary ===');
    console.log(`Total cards: ${result.rows.length}`);
    console.log(`Migrated: ${migratedCount}`);
    console.log(`Skipped (already migrated or empty): ${skippedCount}`);
    console.log(`Errors: ${errorCount}`);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await client.end();
    console.log('\nDatabase connection closed');
  }
}

// Dry run mode
async function dryRun() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  await client.connect();
  console.log('=== DRY RUN MODE ===\n');

  try {
    const result = await client.query(`
      SELECT id, socials, token_owner, nickname
      FROM basecards
      WHERE socials IS NOT NULL
      LIMIT 10
    `);

    console.log(`Sample of ${result.rows.length} cards:\n`);

    for (const row of result.rows) {
      const { id, socials, token_owner, nickname } = row;
      console.log(`Card: ${nickname || 'N/A'} (${token_owner})`);
      console.log(`  Current: ${JSON.stringify(socials)}`);

      // Check if already migrated
      const firstValue = Object.values(socials || {})[0];
      if (
        firstValue &&
        typeof firstValue === 'object' &&
        'handle' in (firstValue as object)
      ) {
        console.log(`  Status: Already migrated`);
      } else {
        // Show what it would look like
        const newSocials: NewSocials = {};
        for (const [key, value] of Object.entries(
          (socials || {}) as OldSocials,
        )) {
          if (value && typeof value === 'string' && value.trim() !== '') {
            newSocials[key] = { handle: value, verified: false };
          }
        }
        console.log(`  After:   ${JSON.stringify(newSocials)}`);
      }
      console.log('');
    }
  } finally {
    await client.end();
  }
}

// Check args
const args = process.argv.slice(2);
if (args.includes('--dry-run')) {
  dryRun();
} else {
  migrateSocials();
}
