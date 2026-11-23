import { readDatabaseUrl } from '@nexo/server-kit';
import { createDatabase } from '../adapters/persistence/database.ts';
import { createDrizzleUnitOfWork } from '../adapters/persistence/drizzle-unit-of-work.ts';
import { seedApi } from './seed.ts';

const { db, pool } = createDatabase(readDatabaseUrl(process.env));
try {
  await seedApi(createDrizzleUnitOfWork(db), new Date());
} finally {
  await pool.end();
}
