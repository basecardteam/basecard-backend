import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

async function reset() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  await client.connect();

  try {
    console.log('Dropping public schema...');
    await client.query('DROP SCHEMA IF EXISTS public CASCADE;');
    console.log('Dropping drizzle schema...');
    await client.query('DROP SCHEMA IF EXISTS drizzle CASCADE;');
    console.log('Recreating public schema...');
    await client.query('CREATE SCHEMA public;');
    await client.query('GRANT ALL ON SCHEMA public TO public;');
    console.log('Database reset successful');
  } catch (err) {
    console.error('Error resetting database:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

reset();
