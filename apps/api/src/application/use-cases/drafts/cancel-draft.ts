import { ErrorCode } from '@nexo/contracts';
import { DraftStatus } from '@nexo/domain';
import { ConflictError, NotFoundError } from '@nexo/server-kit';
import type { AuthenticatedUser } from '../../auth/authenticated-user.ts';
import type { Draft } from '../../model/draft.ts';
import type { Clock } from '../../ports/clock.ts';
import type { ConversationEventBus } from '../../ports/conversation-event-bus.ts';
import type { Metrics } from '../../ports/metrics.ts';
import type { UnitOfWork } from '../../ports/unit-of-work.ts';
import { toDraftView } from '../../views/conversation-view.ts';
import type { DraftView } from './confirm-draft.ts';

export interface CancelDraftDependencies {
  unitOfWork: UnitOfWork;
  clock: Clock;
  metrics: Metrics;
  eventBus: ConversationEventBus;
}

export async function cancelDraft(
  { unitOfWork, clock, metrics, eventBus }: CancelDraftDependencies,
  user: AuthenticatedUser,
  draftId: string,
): Promise<DraftView> {
  const cancelled = await unitOfWork.run(async ({ drafts, conversations }) => {
    const draft = await drafts.findByIdForUpdate(draftId);
    const conversation = draft ? await conversations.findById(draft.conversationId) : undefined;
    if (!draft || conversation?.employeeId !== user.id) {
      throw new NotFoundError('Rascunho não encontrado');
    }
    if (draft.status !== DraftStatus.PENDING) {
      throw new ConflictError(ErrorCode.DRAFT_NOT_PENDING, 'O rascunho não está pendente');
    }

    const updated: Draft = {
      ...draft,
      status: DraftStatus.CANCELLED,
      decidedAt: clock.now(),
    };
    await drafts.update(updated);
    return updated;
  });

  const view = toDraftView(cancelled);
  eventBus.publish({ type: 'draft', conversationId: cancelled.conversationId, draft: view });
  metrics.increment('nexo_drafts_total', {
    kind: cancelled.payload.kind,
    outcome: 'cancelled',
  });
  return view;
}
