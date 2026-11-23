import { type DraftResponse, ErrorCode, type TicketResponse } from '@nexo/contracts';
import { DraftKind, DraftStatus, MessageAuthor } from '@nexo/domain';
import { ConflictError, NotFoundError } from '@nexo/server-kit';
import type { AuthenticatedUser } from '../../auth/authenticated-user.ts';
import type { Draft } from '../../model/draft.ts';
import type { Clock } from '../../ports/clock.ts';
import type { ConversationEventBus } from '../../ports/conversation-event-bus.ts';
import type { Metrics } from '../../ports/metrics.ts';
import type { TicketGateway } from '../../ports/ticket-gateway.ts';
import type { UnitOfWork } from '../../ports/unit-of-work.ts';
import { toDraftView } from '../../views/conversation-view.ts';
import { toMessageView } from '../../views/message-view.ts';
import { executeDraft } from './execute-draft.ts';

export type DraftView = DraftResponse;

export interface ConfirmDraftDependencies {
  unitOfWork: UnitOfWork;
  clock: Clock;
  metrics: Metrics;
  eventBus: ConversationEventBus;
  ticketGateway: TicketGateway;
}

function confirmationMessage(kind: DraftKind, ticketId: string): string {
  switch (kind) {
    case DraftKind.CREATE:
      return `Chamado ${ticketId} criado.`;
    case DraftKind.UPDATE:
      return `Informação enviada ao ${ticketId}.`;
    case DraftKind.REOPEN:
      return `Chamado ${ticketId} reaberto.`;
  }
}

export async function confirmDraft(
  { unitOfWork, clock, metrics, eventBus, ticketGateway }: ConfirmDraftDependencies,
  user: AuthenticatedUser,
  draftId: string,
): Promise<DraftView> {
  const initial = await unitOfWork.run(async ({ drafts, conversations }) => {
    const draft = await drafts.findById(draftId);
    const conversation = draft ? await conversations.findById(draft.conversationId) : undefined;
    if (!draft || conversation?.employeeId !== user.id) {
      throw new NotFoundError('Rascunho não encontrado');
    }
    return draft;
  });

  if (initial.status === DraftStatus.CONFIRMED) {
    return toDraftView(initial);
  }
  if (initial.status === DraftStatus.CANCELLED) {
    throw new ConflictError(ErrorCode.DRAFT_NOT_PENDING, 'O rascunho não está pendente');
  }

  let ticket: TicketResponse;
  try {
    ticket = await executeDraft(ticketGateway, { id: user.id, role: user.role }, initial);
  } catch (error) {
    metrics.increment('nexo_drafts_total', { kind: initial.payload.kind, outcome: 'failed' });
    throw error;
  }

  const committed = await unitOfWork.run(async ({ drafts, conversations, messages }) => {
    const conversation = await conversations.findByIdForUpdate(initial.conversationId);
    const locked = await drafts.findByIdForUpdate(draftId);
    if (!locked) {
      throw new NotFoundError('Rascunho não encontrado');
    }
    if (locked.status === DraftStatus.CONFIRMED) {
      return { draft: locked, message: undefined };
    }

    const decidedAt = clock.now();
    const confirmed: Draft = {
      ...locked,
      status: DraftStatus.CONFIRMED,
      ticketId: ticket.id,
      decidedAt,
    };
    await drafts.update(confirmed);

    const message = await messages.append({
      conversationId: confirmed.conversationId,
      author: MessageAuthor.SYSTEM,
      content: confirmationMessage(confirmed.payload.kind, ticket.id),
      createdAt: decidedAt,
    });

    if (conversation) {
      await conversations.update({ ...conversation, lastMessageAt: decidedAt });
    }

    return { draft: confirmed, message };
  });

  const view = toDraftView(committed.draft);
  if (committed.message !== undefined) {
    eventBus.publish({
      type: 'draft',
      conversationId: committed.draft.conversationId,
      draft: view,
    });
    eventBus.publish({
      type: 'message',
      conversationId: committed.draft.conversationId,
      message: toMessageView(committed.message),
    });
    metrics.increment('nexo_messages_total', { author: MessageAuthor.SYSTEM });
    metrics.increment('nexo_drafts_total', {
      kind: committed.draft.payload.kind,
      outcome: 'confirmed',
    });
    if (committed.draft.payload.kind === DraftKind.CREATE) {
      metrics.increment('nexo_tickets_created_total', { type: ticket.type });
    }
  }

  return view;
}
