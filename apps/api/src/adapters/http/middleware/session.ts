import { createMiddleware } from 'hono/factory';
import type { AuthenticatedUser } from '../../../application/auth/authenticated-user.ts';
import {
  resolveSession,
  type SessionDependencies,
} from '../../../application/use-cases/auth/resolve-session.ts';
import { getSessionCookie } from '../cookies/session-cookie.ts';

export interface SessionEnv {
  Variables: { user: AuthenticatedUser };
}

export function session(deps: SessionDependencies) {
  return createMiddleware<SessionEnv>(async (context, next) => {
    context.set('user', await resolveSession(deps, getSessionCookie(context)));
    await next();
  });
}
