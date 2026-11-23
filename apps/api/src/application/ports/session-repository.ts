import type { Session } from '../model/session.ts';

export interface SessionRepository {
  insert(session: Session): Promise<void>;
  findValid(tokenHash: string, now: Date): Promise<Session | undefined>;
  delete(tokenHash: string): Promise<void>;
  deleteExpired(now: Date): Promise<void>;
}
