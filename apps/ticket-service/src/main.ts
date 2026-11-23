import { serve } from '@hono/node-server';
import { createApp } from './adapters/http/app.ts';
import { createLogger } from './adapters/logging/logger.ts';
import { createDatabase } from './adapters/persistence/database.ts';
import { loadEnv } from './config/env.ts';

const env = loadEnv(process.env);
const logger = createLogger(env.LOG_LEVEL);
const { pool, checkReadiness } = createDatabase(env.DATABASE_URL);
pool.on('error', (error) => {
  logger.error({ err: error }, 'Falha em uma conexão ociosa com o PostgreSQL');
});
const app = createApp({ logger, checkReadiness });

const server = serve(
  { fetch: app.fetch, hostname: env.HOST, port: env.PORT },
  ({ address, port }) => {
    logger.info({ address, port }, 'Ticket service iniciado');
  },
);

let closing = false;

function shutdown() {
  if (closing) {
    return;
  }

  closing = true;
  server.close((error) => {
    if (error) {
      logger.error({ err: error }, 'Falha ao fechar o servidor');
      process.exitCode = 1;
    }
    void pool.end().catch((error: unknown) => {
      logger.error({ err: error }, 'Falha ao fechar o pool do PostgreSQL');
      process.exitCode = 1;
    });
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
