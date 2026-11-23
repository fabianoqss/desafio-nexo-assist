import { UnauthorizedError } from '@nexo/server-kit';
import type { AuthenticatedUser } from '../../auth/authenticated-user.ts';
import { hashSessionToken } from '../../auth/session-token.ts';
import type { User } from '../../model/user.ts';
import type { Clock } from '../../ports/clock.ts';
import type { SessionRepository } from '../../ports/session-repository.ts';
import type { UserRepository } from '../../ports/user-repository.ts';

export interface SessionDependencies {
  users: UserRepository;
  sessions: SessionRepository;
  clock: Clock;
}

export async function resolveSessionUser(
  { users, sessions, clock }: SessionDependencies,
  token: string | undefined,
): Promise<User> {
  if (!token) {
    throw new UnauthorizedError('UNAUTHORIZED');
  }

  const session = await sessions.findValid(hashSessionToken(token), clock.now());
  const user = session && (await users.findById(session.userId));
  if (user === undefined) {
    throw new UnauthorizedError('UNAUTHORIZED');
  }

  return user;
}

export async function resolveSession(
  deps: SessionDependencies,
  token: string | undefined,
): Promise<AuthenticatedUser> {
  const { id, role, name } = await resolveSessionUser(deps, token);
  return { id: id.toLowerCase(), role, name };
}
