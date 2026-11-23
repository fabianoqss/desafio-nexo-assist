import { ErrorCode, REQUEST_ID_HEADER } from '@nexo/contracts';
import { ApplicationError, describeError } from '@nexo/server-kit';
import { Hono } from 'hono';
import type { Logger } from 'pino';

export function healthRoutes(checkReadiness: () => Promise<boolean>, logger: Logger): Hono {
  const routes = new Hono();

  routes.get('/health', (context) => context.json({ status: 'ok' }));
  routes.get('/ready', async (context) => {
    const ready = await Promise.resolve()
      .then(checkReadiness)
      .catch((error: unknown) => {
        logger.error(
          { ...describeError(error), requestId: context.res.headers.get(REQUEST_ID_HEADER) },
          'Falha na checagem de prontidão',
        );
        return false;
      });

    if (!ready) {
      throw new ApplicationError(ErrorCode.SERVICE_UNAVAILABLE, 'Serviço indisponível');
    }

    return context.json({ status: 'ok' });
  });

  return routes;
}
