/**
 * Migration runner entry point for the FrontDesk AI runtime database.
 *
 * Usage:
 *   DATABASE_URL="postgres://..." bun scripts/db/migrate.ts up
 *   DATABASE_URL="postgres://..." bun scripts/db/migrate.ts status
 *   bun run --cwd packages/db migrate:up
 *
 * The implementation lives in packages/db/scripts/migrate.ts next to the SQL files
 * and the `postgres` driver that it uses. This file only exists so the documented
 * root-level command and the packages/db npm scripts share one implementation
 * instead of two drifting copies.
 */
import { runMigrations } from '../../packages/db/scripts/migrate';

runMigrations(process.argv.slice(2)).catch((error: unknown) => {
  console.error(`FATAL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
