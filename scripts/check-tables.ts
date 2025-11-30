import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

async function checkTables() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('Checking tables in public schema...');

    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    if (res.rows.length === 0) {
      console.log('❌ No tables found in public schema.');
    } else {
      console.log('✅ Found tables:');
      res.rows.forEach((row) => console.log(` - ${row.table_name}`));
    }

    // Also check drizzle_migrations table
    const migrationsRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'drizzle';
    `);
    if (migrationsRes.rows.length > 0) {
      console.log('\n✅ Found drizzle schema tables (migrations):');
      migrationsRes.rows.forEach((row) => console.log(` - ${row.table_name}`));
    }
  } catch (err) {
    console.error('❌ Error checking tables:', err);
  } finally {
    await client.end();
  }
}

checkTables();
