import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { resolve } from 'node:path';
import { createDatabase } from '../../src/adapters/persistence/database.ts';

export async function startPostgres(): Promise<{ url: string; stop(): Promise<void> }> {
  const container = await new PostgreSqlContainer('postgres:18-alpine').start();

  try {
    const url = container.getConnectionUri();
    const { db, pool } = createDatabase(url);
    try {
      await migrate(db, {
        migrationsFolder: resolve(import.meta.dirname, '../../src/adapters/persistence/migrations'),
      });
    } finally {
      await pool.end();
    }

    return {
      url,
      async stop() {
        await container.stop();
      },
    };
  } catch (error) {
    await container.stop();
    throw error;
  }
}
