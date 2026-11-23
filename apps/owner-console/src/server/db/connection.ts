import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from './migrator';

let singletonDb: DatabaseSync | null = null;

export function createDatabase(dbPath?: string): DatabaseSync {
  const target = dbPath ?? process.env.KAYAN_OWNER_DB_PATH ?? path.resolve(process.cwd(), 'data/kayan_owner.db');

  if (target !== ':memory:') {
    const dir = path.dirname(target);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new DatabaseSync(target);
  db.exec('PRAGMA foreign_keys = ON;');
  if (target !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA synchronous = NORMAL;');
  }
  runMigrations(db);
  return db;
}

export function getDb(): DatabaseSync {
  if (!singletonDb) {
    singletonDb = createDatabase();
  }
  return singletonDb;
}

export function resetDbForTesting(db: DatabaseSync | null): void {
  singletonDb = db;
}

export function getDatabaseMetadata(): {
  engine: string;
  mode: string;
  externalPostgresConfigured: boolean;
  pathLabel: string;
} {
  const externalPg = Boolean(process.env.DATABASE_URL?.trim());
  const dbPath = process.env.KAYAN_OWNER_DB_PATH ?? 'data/kayan_owner.db';
  return {
    engine: 'SQLite (Node 22 Native WAL)',
    mode: externalPg ? 'Hybrid (DATABASE_URL detected)' : 'Local Persistent Store',
    externalPostgresConfigured: externalPg,
    pathLabel: dbPath === ':memory:' ? ':memory:' : path.basename(dbPath),
  };
}
