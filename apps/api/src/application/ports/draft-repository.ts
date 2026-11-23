import type { Draft } from '../model/draft.ts';

export interface DraftRepository {
  nextId(): Promise<string>;
  insert(draft: Draft): Promise<void>;
  findById(id: string): Promise<Draft | undefined>;
  findByIdForUpdate(id: string): Promise<Draft | undefined>;
  update(draft: Draft): Promise<void>;
  listPending(conversationId: string): Promise<Draft[]>;
}
