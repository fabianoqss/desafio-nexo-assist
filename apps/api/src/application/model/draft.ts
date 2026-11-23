import type { DraftPayload } from '@nexo/contracts';
import type { DraftStatus } from '@nexo/domain';

export interface Draft {
  id: string;
  conversationId: string;
  status: DraftStatus;
  payload: DraftPayload;
  ticketId?: string;
  createdAt: Date;
  decidedAt?: Date;
}
