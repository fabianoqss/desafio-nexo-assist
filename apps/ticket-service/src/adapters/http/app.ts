import { Hono } from 'hono';
import type { Logger } from 'pino';
import type { WriteDependencies } from '../../application/idempotency/with-idempotency.ts';
import { errorHandler } from './error-handler.ts';
import { requestLogger } from './middleware/request-logger.ts';
import { healthRoutes } from './routes/health-routes.ts';
import { ticketRoutes } from './routes/ticket-routes.ts';

export interface AppDependencies extends WriteDependencies {
  logger: Logger;
  checkReadiness: () => Promise<boolean>;
  apiToken: string;
}

export function createApp(deps: AppDependencies): Hono {
  const { logger, checkReadiness } = deps;
  const app = new Hono();
  app.onError(errorHandler(logger));
  app.use(requestLogger(logger));
  app.route('/', healthRoutes(checkReadiness));
  app.route('/', ticketRoutes(deps));
  return app;
}
