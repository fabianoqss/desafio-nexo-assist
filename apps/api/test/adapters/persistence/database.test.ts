import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../../../src/adapters/persistence/database.ts';
import { startPostgres } from '../../support/postgres-container.ts';

describe('createDatabase', () => {
  let postgres: Awaited<ReturnType<typeof startPostgres>>;

  beforeAll(async () => {
    postgres = await startPostgres();
  }, 120_000);

  afterAll(async () => {
    await postgres.stop();
  });

  it('reports ready when the database answers', async () => {
    const { pool, checkReadiness } = createDatabase(postgres.url);

    try {
      await expect(checkReadiness()).resolves.toBe(true);
      expect(pool.idleCount).toBe(1);
    } finally {
      await pool.end();
    }
  });

  it('reports not ready when the database is unreachable', async () => {
    const { pool, checkReadiness } = createDatabase('postgresql://nexo:nexo@127.0.0.1:1/nexo_api');

    try {
      await expect(checkReadiness()).resolves.toBe(false);
    } finally {
      await pool.end();
    }
  });
});
