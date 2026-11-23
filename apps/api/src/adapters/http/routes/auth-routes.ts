import { LoginRequestSchema, UserResponseSchema } from '@nexo/contracts';
import { UnauthorizedError, ValidationError } from '@nexo/server-kit';
import { type Context, Hono } from 'hono';
import type { User } from '../../../application/model/user.ts';
import type { Metrics } from '../../../application/ports/metrics.ts';
import type { RateLimiter } from '../../../application/ports/rate-limiter.ts';
import type { UnitOfWork } from '../../../application/ports/unit-of-work.ts';
import { login } from '../../../application/use-cases/auth/login.ts';
import { logout } from '../../../application/use-cases/auth/logout.ts';
import {
  resolveSessionUser,
  type SessionDependencies,
} from '../../../application/use-cases/auth/resolve-session.ts';
import type { Env } from '../../../config/env.ts';
import { clientIp } from '../client-ip.ts';
import {
  clearSessionCookie,
  getSessionCookie,
  setSessionCookie,
} from '../cookies/session-cookie.ts';
import { rateLimit } from '../middleware/rate-limit.ts';
import type { SessionEnv } from '../middleware/session.ts';

export interface AuthDependencies extends SessionDependencies {
  env: Pick<Env, 'WEB_ORIGIN' | 'TRUST_PROXY' | 'SESSION_TTL_HOURS'>;
  metrics: Metrics;
  rateLimiter: RateLimiter;
  unitOfWork: UnitOfWork;
}

function userResponse(context: Context<SessionEnv>, user: User) {
  const result = UserResponseSchema.safeParse(user);
  if (!result.success) {
    throw new Error('Perfil do usuário inválido');
  }
  const { id, role, name } = result.data;
  context.set('user', { id, role, name });
  return result.data;
}

export function authRoutes(deps: AuthDependencies) {
  const { env, clock, metrics, rateLimiter, unitOfWork } = deps;
  const routes = new Hono<SessionEnv>();
  const limitLogin = rateLimit<SessionEnv>({
    scope: 'login',
    limit: 10,
    windowMs: 60_000,
    key: (context) => clientIp(context, env.TRUST_PROXY),
    rateLimiter,
    clock,
    metrics,
  });

  routes.use(async (context, next) => {
    context.header('Cache-Control', 'no-store');
    await next();
  });

  routes.post('/login', limitLogin, async (context) => {
    const body = await context.req.json<unknown>().catch(() => {
      throw new ValidationError('Dados inválidos');
    });
    if (typeof body === 'object' && body !== null && 'password' in body && body.password === '') {
      metrics.increment('nexo_logins_total', { result: 'failure' });
      throw new UnauthorizedError('INVALID_CREDENTIALS');
    }

    const request = LoginRequestSchema.parse(body);
    const { token, user } = await login(
      { unitOfWork, clock, metrics, sessionTtlHours: env.SESSION_TTL_HOURS },
      request,
      getSessionCookie(context),
    );
    const response = userResponse(context, user);
    setSessionCookie(context, token, env.SESSION_TTL_HOURS * 3_600);
    return context.json(response);
  });

  routes.post('/logout', async (context) => {
    await logout(deps, getSessionCookie(context));
    clearSessionCookie(context);
    return context.body(null, 204);
  });

  routes.get('/me', async (context) => {
    const user = await resolveSessionUser(deps, getSessionCookie(context));
    return context.json(userResponse(context, user));
  });

  return routes;
}
