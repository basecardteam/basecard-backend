import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

async function checkConnection() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('❌ DATABASE_URL is not defined in .env');
    process.exit(1);
  }

  console.log(
    `Checking connection to: ${connectionString.replace(/:[^:@]+@/, ':****@')}`,
  ); // Mask password

  const client = new Client({
    connectionString: connectionString,
  });

  try {
    await client.connect();
    console.log('✅ Successfully connected to the database!');

    const res = await client.query(
      'SELECT current_database(), current_user, version();',
    );
    console.log('Connection Info:', res.rows[0]);
  } catch (err) {
    console.error('❌ Connection failed:', err);
  } finally {
    await client.end();
  }
}

checkConnection();
