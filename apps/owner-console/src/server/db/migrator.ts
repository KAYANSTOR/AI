import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'src/server/db/migrations');

export interface AppliedMigration {
  version: string;
  checksum: string;
  applied_at: string;
}

export function runMigrations(db: DatabaseSync): AppliedMigration[] {
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return [];
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const appliedStmt = db.prepare('SELECT version, checksum FROM schema_migrations WHERE version = ?');
  const insertStmt = db.prepare('INSERT INTO schema_migrations (version, checksum) VALUES (?, ?)');

  for (const file of files) {
    const fullPath = path.join(MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(fullPath, 'utf8');
    const checksum = crypto.createHash('sha256').update(sql).digest('hex');
    const existing = appliedStmt.get(file) as { version: string; checksum: string } | undefined;

    if (existing) {
      continue;
    }

    db.exec('BEGIN IMMEDIATE;');
    try {
      db.exec(sql);
      insertStmt.run(file, checksum);
      db.exec('COMMIT;');
    } catch (error) {
      db.exec('ROLLBACK;');
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
    }
  }

  return db
    .prepare('SELECT version, checksum, applied_at FROM schema_migrations ORDER BY version ASC')
    .all() as unknown as AppliedMigration[];
}
