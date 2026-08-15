// Runs migrations/014_seed_data.sql on its own. Kept separate from
// migrate.js because seeding is a one-time "give me a demo dataset" action,
// not a schema change -- running it against a database that already has
// real registered tenants would collide on the seed script's fixed UUIDs.
// Safe to run once against a fresh, freshly-migrated database.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const seedFile = path.join(__dirname, '..', 'migrations', '014_seed_data.sql');
  const sql = fs.readFileSync(seedFile, 'utf8');

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log('Seeding demo data (Amaka Foods & Provisions, Bello Electronics)...');
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('Seed complete.');
    console.log('\nDemo login (Amaka Foods, Business Owner):');
    console.log('  email:    amaka@example.com');
    console.log('  password: NOT SET -- the seed file stores a placeholder hash.');
    console.log('  Register a fresh user via POST /api/v1/auth/register instead,');
    console.log('  or update the seed script to hash a real password before inserting.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seeding failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Unexpected error seeding database:', err);
  process.exit(1);
});
