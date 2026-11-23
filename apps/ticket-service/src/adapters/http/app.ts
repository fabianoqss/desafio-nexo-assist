import { Hono } from 'hono';
import type { Logger } from 'pino';
import { errorHandler } from './error-handler.ts';
import { requestLogger } from './middleware/request-logger.ts';
import { healthRoutes } from './routes/health-routes.ts';

export interface AppDependencies {
  logger: Logger;
  checkReadiness: () => Promise<boolean>;
}

export function createApp({ logger, checkReadiness }: AppDependencies): Hono {
  const app = new Hono();
  app.onError(errorHandler(logger));
  app.use(requestLogger(logger));
  app.route('/', healthRoutes(checkReadiness));
  return app;
}
