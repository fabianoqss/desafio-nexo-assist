export interface IdempotencyRecord {
  actorId: string;
  key: string;
  operation: string;
  requestHash: string;
  ticketId: string;
  createdAt: Date;
}

export interface IdempotencyRepository {
  find(actorId: string, key: string): Promise<IdempotencyRecord | undefined>;
  save(record: IdempotencyRecord): Promise<void>;
}

export class IdempotencyKeyTakenError extends Error {}
