// Runs every .sql file in ../migrations, in filename order, each inside its
// own transaction. This is intentionally plain -- no migration-tracking
// table yet (that's worth adding before this touches a shared/staging
// database with other engineers on it -- see Phase 2 doc, Section 6 on
// migration tooling). For local dev and this phase, running the full set
// against a fresh database each time is the expected workflow.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.error('No migration files found in', migrationsDir);
    process.exit(1);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log(`Connected. Running ${files.length} migration(s)...\n`);

  for (const file of files) {
    const fullPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(fullPath, 'utf8');
    process.stdout.write(`  ${file} ... `);
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('COMMIT');
      console.log('ok');
    } catch (err) {
      await client.query('ROLLBACK');
      console.log('FAILED');
      console.error(`\nMigration ${file} failed:\n${err.message}\n`);
      await client.end();
      process.exit(1);
    }
  }

  console.log('\nAll migrations applied successfully.');
  await client.end();
}

main().catch((err) => {
  console.error('Unexpected error running migrations:', err);
  process.exit(1);
});
