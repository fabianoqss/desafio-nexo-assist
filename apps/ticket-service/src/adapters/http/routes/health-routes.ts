import { ErrorCode } from '@nexo/contracts';
import { ApplicationError } from '@nexo/server-kit';
import { Hono } from 'hono';

export function healthRoutes(checkReadiness: () => Promise<boolean>): Hono {
  const routes = new Hono();

  routes.get('/health', (context) => context.json({ status: 'ok' }));
  routes.get('/ready', async (context) => {
    const ready = await Promise.resolve()
      .then(checkReadiness)
      .catch(() => false);
    if (!ready) {
      throw new ApplicationError(ErrorCode.SERVICE_UNAVAILABLE, 'Serviço indisponível');
    }

    return context.json({ status: 'ok' });
  });

  return routes;
}
