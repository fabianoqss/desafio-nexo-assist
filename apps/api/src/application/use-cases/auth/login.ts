import type { LoginRequest } from '@nexo/contracts';
import { UnauthorizedError } from '@nexo/server-kit';
import { generateSessionToken, hashSessionToken } from '../../auth/session-token.ts';
import type { User } from '../../model/user.ts';
import type { Clock } from '../../ports/clock.ts';
import type { Metrics } from '../../ports/metrics.ts';
import type { UnitOfWork } from '../../ports/unit-of-work.ts';

interface LoginDependencies {
  unitOfWork: UnitOfWork;
  clock: Clock;
  metrics: Metrics;
  sessionTtlHours: number;
}

export async function login(
  { unitOfWork, clock, metrics, sessionTtlHours }: LoginDependencies,
  { email, password }: LoginRequest,
  previousToken?: string,
): Promise<{ token: string; user: User; expiresAt: Date }> {
  const result = await unitOfWork.run(async ({ users, sessions }) => {
    const user = await users.findByEmail(email);
    if (user === undefined || password === '') {
      metrics.increment('nexo_logins_total', { result: 'failure' });
      throw new UnauthorizedError('INVALID_CREDENTIALS');
    }

    const token = generateSessionToken();
    const createdAt = clock.now();
    const expiresAt = new Date(createdAt.getTime() + sessionTtlHours * 3_600_000);
    if (previousToken !== undefined) {
      await sessions.delete(hashSessionToken(previousToken));
    }
    await sessions.deleteExpired(createdAt);
    await sessions.insert({
      tokenHash: hashSessionToken(token),
      userId: user.id,
      createdAt,
      expiresAt,
    });

    return { token, user, expiresAt };
  });
  metrics.increment('nexo_logins_total', { result: 'success' });

  return result;
}
