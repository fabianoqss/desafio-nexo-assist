import { ErrorCode } from '@nexo/contracts';
import { ApplicationError, errorHandler, requestLogger } from '@nexo/server-kit';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { contextStorage } from 'hono/context-storage';
import type { Logger } from 'pino';
import { corsFor } from './middleware/cors.ts';
import { jsonBody } from './middleware/json-body.ts';
import { originCheck } from './middleware/origin-check.ts';
import type { SessionEnv } from './middleware/session.ts';
import { authRoutes, type AuthDependencies } from './routes/auth-routes.ts';
import { healthRoutes } from './routes/health-routes.ts';

export interface AppDependencies extends AuthDependencies {
  logger: Logger;
  checkReadiness: () => Promise<boolean>;
}

export function createApp(deps: AppDependencies): Hono {
  const { logger, checkReadiness, env } = deps;
  const app = new Hono();

  app.onError(errorHandler(logger));
  app.use(contextStorage());
  app.use(
    requestLogger<{ Variables: Partial<SessionEnv['Variables']> }>(
      logger,
      (context) => context.get('user')?.id,
    ),
  );
  app.use(corsFor(env.WEB_ORIGIN));
  app.use(originCheck(env.WEB_ORIGIN));
  app.use(jsonBody());
  app.use(
    bodyLimit({
      maxSize: 16 * 1024,
      onError: () => {
        throw new ApplicationError(ErrorCode.PAYLOAD_TOO_LARGE, 'Corpo da requisição muito grande');
      },
    }),
  );
  app.route('/', healthRoutes(checkReadiness, logger));
  app.route('/auth', authRoutes(deps));

  return app;
}
