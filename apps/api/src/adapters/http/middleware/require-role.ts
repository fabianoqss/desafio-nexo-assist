import type { UserRole } from '@nexo/domain';
import { ForbiddenError, UnauthorizedError } from '@nexo/server-kit';
import { createMiddleware } from 'hono/factory';
import type { SessionEnv } from './session.ts';

export function requireRole(role: UserRole) {
  return createMiddleware<SessionEnv>(async (context, next) => {
    const user = context.get('user') as SessionEnv['Variables']['user'] | undefined;
    if (user === undefined) {
      throw new UnauthorizedError('UNAUTHORIZED');
    }
    if (user.role !== role) {
      throw new ForbiddenError('Acesso não permitido');
    }
    await next();
  });
}
