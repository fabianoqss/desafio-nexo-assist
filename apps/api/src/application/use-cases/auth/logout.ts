import { hashSessionToken } from '../../auth/session-token.ts';
import type { SessionRepository } from '../../ports/session-repository.ts';

export async function logout(
  { sessions }: { sessions: SessionRepository },
  token: string | undefined,
): Promise<void> {
  if (token) {
    await sessions.delete(hashSessionToken(token));
  }
}
