import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { resolve } from 'node:path';
import { createDatabase } from './adapters/persistence/database.ts';
import { readDatabaseUrl } from './config/database-url.ts';

const { db, pool } = createDatabase(readDatabaseUrl(process.env));
try {
  await migrate(db, {
    migrationsFolder: resolve(import.meta.dirname, 'adapters/persistence/migrations'),
  });
} finally {
  await pool.end();
}
