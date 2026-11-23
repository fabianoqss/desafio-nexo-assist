import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, type PoolClient } from 'pg';

const readinessTimeoutMs = 1_000;

export type DatabaseExecutor = Pick<
  NodePgDatabase,
  'select' | 'selectDistinctOn' | 'insert' | 'update' | 'delete' | 'execute'
>;

export function createDatabase(url: string): {
  db: NodePgDatabase;
  pool: Pool;
  checkReadiness: () => Promise<boolean>;
} {
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: readinessTimeoutMs });

  async function checkReadiness(): Promise<boolean> {
    const timeout = Promise.withResolvers<boolean>();
    const timer = setTimeout(() => {
      timeout.resolve(false);
    }, readinessTimeoutMs);
    let client: PoolClient | undefined;
    let finished = false;
    let ready = false;

    async function probe(): Promise<boolean> {
      const connection = await pool.connect();
      if (finished) {
        connection.release();
        return false;
      }

      client = connection;
      await client.query('select 1');
      return true;
    }

    try {
      ready = await Promise.race([probe(), timeout.promise]);
      return ready;
    } catch {
      return false;
    } finally {
      finished = true;
      clearTimeout(timer);
      client?.release(!ready);
    }
  }

  return { db: drizzle(pool), pool, checkReadiness };
}
