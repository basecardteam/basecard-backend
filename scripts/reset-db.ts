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

    console.log('Recreating drizzle schema...');
    await client.query('CREATE SCHEMA drizzle;');

    // Re-grant privileges to basecard_user (current user)
    console.log('Re-granting privileges...');
    await client.query('GRANT ALL ON SCHEMA public TO CURRENT_USER;');
    await client.query('GRANT ALL ON SCHEMA drizzle TO CURRENT_USER;');
    await client.query(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO CURRENT_USER;',
    );
    await client.query(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO CURRENT_USER;',
    );
    await client.query(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA drizzle GRANT ALL ON TABLES TO CURRENT_USER;',
    );
    await client.query(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA drizzle GRANT ALL ON SEQUENCES TO CURRENT_USER;',
    );

    console.log('Database reset successful');
  } catch (err) {
    console.error('Error resetting database:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

reset();
