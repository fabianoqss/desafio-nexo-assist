import { serve } from '@hono/node-server';
import { createLogger, describeError } from '@nexo/server-kit';
import { systemClock } from './adapters/clock/system-clock.ts';
import { createApp } from './adapters/http/app.ts';
import { noopMetrics } from './adapters/metrics/noop-metrics.ts';
import { createDatabase } from './adapters/persistence/database.ts';
import { createDrizzleSessionRepository } from './adapters/persistence/drizzle-session-repository.ts';
import { createDrizzleUnitOfWork } from './adapters/persistence/drizzle-unit-of-work.ts';
import { createDrizzleUserRepository } from './adapters/persistence/drizzle-user-repository.ts';
import { createInMemoryRateLimiter } from './adapters/rate-limit/in-memory-rate-limiter.ts';
import { loadEnv } from './config/env.ts';

const env = loadEnv(process.env);
const logger = createLogger(env.LOG_LEVEL);
const { db, pool, checkReadiness } = createDatabase(env.DATABASE_URL);
pool.on('error', (error) => {
  logger.error(describeError(error), 'Falha em uma conexão ociosa com o PostgreSQL');
});
const app = createApp({
  logger,
  checkReadiness,
  env,
  clock: systemClock,
  metrics: noopMetrics,
  rateLimiter: createInMemoryRateLimiter(),
  users: createDrizzleUserRepository(db),
  sessions: createDrizzleSessionRepository(db),
  unitOfWork: createDrizzleUnitOfWork(db),
});

const server = serve(
  { fetch: app.fetch, hostname: env.HOST, port: env.PORT },
  ({ address, port }) => {
    logger.info({ address, port }, 'API iniciada');
  },
);
server.on('error', (error) => {
  logger.error(describeError(error), 'Falha no servidor HTTP');
  process.exitCode = 1;
});

let closing = false;

function shutdown() {
  if (closing) {
    return;
  }

  closing = true;
  server.close((error) => {
    if (error) {
      logger.error(describeError(error), 'Falha ao fechar o servidor');
      process.exitCode = 1;
    }
    void pool.end().catch((error: unknown) => {
      logger.error(describeError(error), 'Falha ao fechar o pool do PostgreSQL');
      process.exitCode = 1;
    });
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
