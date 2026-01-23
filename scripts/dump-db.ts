import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables is handled by dotenv-cli in package.json script
// "db:dump": "dotenv -e .env.dev -- node -r ts-node/register scripts/dump-db.ts"

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('Error: DATABASE_URL is not defined in environment variables.');
  console.error(
    'Make sure to run this script with dotenv, e.g., npm run db:dump',
  );
  process.exit(1);
}

// Ensure backups directory exists
const backupDir = path.join(__dirname, '../backups');
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

// Generate filename with timestamp
const now = new Date();
const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19); // YYYY-MM-DDTHH-mm-ss
const backupFile = path.join(backupDir, `backup-${timestamp}.sql`);

console.log(`Starting database dump...`);
console.log(`Target: ${backupFile}`);

// Construct pg_dump command
// We use the database URL directly which acts as the connection string
const command = `pg_dump "${databaseUrl}" -f "${backupFile}"`;

exec(command, (error, stdout, stderr) => {
  if (error) {
    console.error(`Error creating dump: ${error.message}`);
    // Check if pg_dump is installed
    console.error('Ensure "pg_dump" is installed and available in your PATH.');
    return;
  }

  if (stderr) {
    // pg_dump often prints status to stderr, which is fine
    console.log(`pg_dump output: ${stderr}`);
  }

  console.log(`✅ Database dump created successfully!`);
  console.log(`Path: ${backupFile}`);
});
