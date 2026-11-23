import { z } from 'zod';
import { createDatabase } from '../adapters/persistence/database.ts';
import { createDrizzleUnitOfWork } from '../adapters/persistence/drizzle-unit-of-work.ts';
import { seedTickets } from './seed.ts';

const url = z
  .url()
  .regex(/^postgres(?:ql)?:\/\//)
  .safeParse(process.env.DATABASE_URL);
if (!url.success) {
  throw new Error('DATABASE_URL deve ser uma URL válida do PostgreSQL');
}

const { db, pool } = createDatabase(url.data);
try {
  await seedTickets(createDrizzleUnitOfWork(db), new Date());
} finally {
  await pool.end();
}
