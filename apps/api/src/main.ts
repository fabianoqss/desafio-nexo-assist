import { serve } from '@hono/node-server';
import { createLogger, describeError } from '@nexo/server-kit';
import { systemClock } from './adapters/clock/system-clock.ts';
import { createApp } from './adapters/http/app.ts';
import { noopMetrics } from './adapters/metrics/noop-metrics.ts';
import { createInMemoryRateLimiter } from './adapters/rate-limit/in-memory-rate-limiter.ts';
import { loadEnv } from './config/env.ts';

const env = loadEnv(process.env);
const logger = createLogger(env.LOG_LEVEL);
const app = createApp({
  logger,
  checkReadiness: () => Promise.resolve(true),
  env,
  clock: systemClock,
  metrics: noopMetrics,
  rateLimiter: createInMemoryRateLimiter(),
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
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
