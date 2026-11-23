import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { resolve } from 'node:path';
import { createDatabase } from './adapters/persistence/database.ts';

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL é obrigatória');
}

const { db, pool } = createDatabase(url);
try {
  await migrate(db, {
    migrationsFolder: resolve(import.meta.dirname, 'adapters/persistence/migrations'),
  });
} finally {
  await pool.end();
}
