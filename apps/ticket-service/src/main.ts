import { serve } from '@hono/node-server';
import { systemClock } from './adapters/clock/system-clock.ts';
import { createApp } from './adapters/http/app.ts';
import { createLogger } from './adapters/logging/logger.ts';
import { describeError } from './adapters/logging/safe-error.ts';
import { createDatabase } from './adapters/persistence/database.ts';
import { createDrizzleIdempotencyRepository } from './adapters/persistence/drizzle-idempotency-repository.ts';
import { createDrizzleTicketRepository } from './adapters/persistence/drizzle-ticket-repository.ts';
import { createDrizzleUnitOfWork } from './adapters/persistence/drizzle-unit-of-work.ts';
import { loadEnv } from './config/env.ts';

const env = loadEnv(process.env);
const logger = createLogger(env.LOG_LEVEL);
const failureInjection = { rate: env.FAILURE_RATE, extraLatencyMs: env.EXTRA_LATENCY_MS };
if (failureInjection.rate > 0 || failureInjection.extraLatencyMs > 0) {
  logger.warn(failureInjection, 'Injeção de falhas ativa');
}

const { db, pool, checkReadiness } = createDatabase(env.DATABASE_URL);
pool.on('error', (error) => {
  logger.error(describeError(error), 'Falha em uma conexão ociosa com o PostgreSQL');
});
const app = createApp({
  logger,
  checkReadiness,
  apiToken: env.TICKET_SERVICE_API_TOKEN,
  failureInjection,
  tickets: createDrizzleTicketRepository(db),
  unitOfWork: createDrizzleUnitOfWork(db),
  idempotency: createDrizzleIdempotencyRepository(db),
  clock: systemClock,
});

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
