import type { TicketResponse } from '@nexo/contracts';
import { DraftKind } from '@nexo/domain';
import type { Draft } from '../../model/draft.ts';
import type { TicketActor, TicketGateway } from '../../ports/ticket-gateway.ts';

export function draftIdempotencyKey(draftId: string): string {
  return `draft-${draftId}`;
}

export function executeDraft(
  gateway: TicketGateway,
  actor: TicketActor,
  draft: Draft,
): Promise<TicketResponse> {
  const idempotencyKey = draftIdempotencyKey(draft.id);
  const { payload } = draft;

  switch (payload.kind) {
    case DraftKind.CREATE:
      return gateway.create(actor, payload.ticket, idempotencyKey);
    case DraftKind.UPDATE:
      return gateway.addInfo(actor, payload.ticketId, { message: payload.message }, idempotencyKey);
    case DraftKind.REOPEN:
      return gateway.reopen(actor, payload.ticketId, { message: payload.message }, idempotencyKey);
  }
}
