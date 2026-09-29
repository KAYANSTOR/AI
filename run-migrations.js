/**
 * Simple migration runner using Node.js + postgres driver
 * Usage: node run-migrations.js
 */
const { createHash } = require('crypto');
const fs = require('fs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL not set');
  process.exit(1);
}

const MIGRATIONS_DIR = path.join(__dirname, 'packages/db/migrations');

async function main() {
  // Dynamic import for postgres (ESM)
  const { default: postgres } = await import('./packages/db/node_modules/postgres/src/index.js').catch(() =>
    import('./node_modules/postgres/src/index.js')
  );

  const sql = postgres(DATABASE_URL, { ssl: 'require', max: 1 });

  try {
    // Create tracking table
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version      integer PRIMARY KEY,
        name         text    NOT NULL,
        checksum     text    NOT NULL,
        applied_at   timestamptz NOT NULL DEFAULT now()
      );
    `);

    // Get applied migrations
    const applied = await sql`SELECT version, checksum FROM schema_migrations ORDER BY version`;
    const appliedMap = new Map(applied.map(r => [r.version, r.checksum]));

    // Read migration files
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => /^\d{4}_.*\.sql$/.test(f))
      .sort();

    let count = 0;
    for (const file of files) {
      const match = /^(\d{4})_(.+)\.sql$/.exec(file);
      if (!match) continue;
      const version = parseInt(match[1], 10);
      const name = match[2];
      const filePath = path.join(MIGRATIONS_DIR, file);
      const sqlContent = fs.readFileSync(filePath, 'utf-8');
      const checksum = createHash('sha256').update(sqlContent).digest('hex');

      if (appliedMap.has(version)) {
        console.log(`  ✓ ${file} (already applied)`);
        continue;
      }

      console.log(`  ⟳ Applying ${file}...`);
      try {
        await sql.unsafe(sqlContent);
        await sql`
          INSERT INTO schema_migrations (version, name, checksum)
          VALUES (${version}, ${name}, ${checksum})
        `;
        console.log(`  ✅ ${file} done`);
        count++;
      } catch (err) {
        console.error(`  ❌ FAILED: ${file}`);
        console.error(`     ${err.message}`);
        // Continue to next migration instead of stopping
      }
    }

    console.log(`\nDone. Applied ${count} new migration(s).`);
    await sql.end();
  } catch (err) {
    console.error('FATAL:', err.message);
    await sql.end().catch(() => {});
    process.exit(1);
  }
}

main();
