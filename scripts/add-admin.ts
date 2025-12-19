import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../src/db/schema';
import { eq, inArray } from 'drizzle-orm';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Config
const DATABASE_URL = process.env.DATABASE_URL;
const ADMIN_WALLET_ADDRESSES =
  process.env.ADMIN_WALLET_ADDRESSES || process.env.ADMIN_WALLET_ADDRESS;

if (!DATABASE_URL) {
  console.error('Error: DATABASE_URL is not set in .env');
  process.exit(1);
}

if (!ADMIN_WALLET_ADDRESSES) {
  console.error('Error: ADMIN_WALLET_ADDRESSES is not set in .env');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
});

const db = drizzle(pool, { schema });

async function main() {
  // Split by comma if multiple addresses match
  const addressesToPromote = (ADMIN_WALLET_ADDRESSES as string)
    .split(',')
    .map((addr) => addr.trim().toLowerCase())
    .filter((addr) => addr.length > 0);

  if (addressesToPromote.length === 0) {
    console.log('No admin addresses found to promote.');
    await pool.end();
    return;
  }

  console.log(
    `Promoting the following addresses to ADMIN:`,
    addressesToPromote,
  );

  try {
    // 1. Find existing users with these addresses
    const usersToUpdate = await db.query.users.findMany({
      where: inArray(schema.users.walletAddress, addressesToPromote),
    });

    const existingAddresses = usersToUpdate.map((u) => u.walletAddress);

    // 2. Update existing users
    if (existingAddresses.length > 0) {
      await db
        .update(schema.users)
        .set({ role: 'admin' })
        .where(inArray(schema.users.walletAddress, existingAddresses));
      console.log(
        `Updated ${existingAddresses.length} existing users to ADMIN.`,
      );
    }

    // 3. Create missing users (Optional: User asked to "add admin address", implying creation might be desired or just role update)
    // If the user doesn't exist, we should probably create them so they are admin when they login?
    // Let's create them as placeholders if they don't exist.
    const missingAddresses = addressesToPromote.filter(
      (addr) => !existingAddresses.includes(addr),
    );

    if (missingAddresses.length > 0) {
      console.log(`Creating ${missingAddresses.length} new ADMIN users...`);
      for (const address of missingAddresses) {
        await db
          .insert(schema.users)
          .values({
            walletAddress: address,
            role: 'admin',
            // Default values for other fields will be used (e.g. isNewUser: true)
          })
          .onConflictDoUpdate({
            target: schema.users.walletAddress,
            set: { role: 'admin' },
          });
      }
      console.log('New admin users created successfully.');
    }
  } catch (error) {
    console.error('Error updating admins:', error);
  } finally {
    await pool.end();
  }
}

main();
