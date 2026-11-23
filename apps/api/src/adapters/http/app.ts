import { errorHandler, requestLogger } from '@nexo/server-kit';
import { Hono } from 'hono';
import type { Logger } from 'pino';
import type { Clock } from '../../application/ports/clock.ts';
import type { Metrics } from '../../application/ports/metrics.ts';
import type { RateLimiter } from '../../application/ports/rate-limiter.ts';
import type { Env } from '../../config/env.ts';
import { corsFor } from './middleware/cors.ts';
import { jsonBody } from './middleware/json-body.ts';
import { originCheck } from './middleware/origin-check.ts';
import { healthRoutes } from './routes/health-routes.ts';

export interface AppDependencies {
  logger: Logger;
  checkReadiness: () => Promise<boolean>;
  env: Pick<Env, 'WEB_ORIGIN' | 'TRUST_PROXY'>;
  clock: Clock;
  metrics: Metrics;
  rateLimiter: RateLimiter;
}

export function createApp(deps: AppDependencies): Hono {
  const { logger, checkReadiness, env } = deps;
  const app = new Hono();

  app.onError(errorHandler(logger));
  app.use(requestLogger(logger));
  app.use(corsFor(env.WEB_ORIGIN));
  app.use(originCheck(env.WEB_ORIGIN));
  app.use(jsonBody());
  app.route('/', healthRoutes(checkReadiness, logger));

  return app;
}
