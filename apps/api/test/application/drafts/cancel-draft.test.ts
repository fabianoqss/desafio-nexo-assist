import { ErrorCode } from '@nexo/contracts';
import { DraftKind, DraftStatus } from '@nexo/domain';
import { SEED_USERS } from '@nexo/seed-data';
import { NotFoundError } from '@nexo/server-kit';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createInMemoryConversationEventBus } from '../../../src/adapters/events/in-memory-conversation-event-bus.ts';
import type { Conversation } from '../../../src/application/model/conversation.ts';
import type { Draft } from '../../../src/application/model/draft.ts';
import { cancelDraft } from '../../../src/application/use-cases/drafts/cancel-draft.ts';
import { FixedClock } from '../../support/fixed-clock.ts';
import { InMemoryApiStore } from '../../support/in-memory-api-store.ts';
import { RecordingMetrics } from '../../support/recording-metrics.ts';

const [ana, bruno] = SEED_USERS;
const createdAt = new Date('2026-11-23T12:00:00.000Z');
const decidedAt = new Date('2026-11-23T12:05:00.000Z');

async function setup(status: DraftStatus = DraftStatus.PENDING) {
  const unitOfWork = new InMemoryApiStore(SEED_USERS);
  const clock = new FixedClock(decidedAt);
  const metrics = new RecordingMetrics();
  const eventBus = createInMemoryConversationEventBus();
  const conversation: Conversation = {
    id: randomUUID(),
    employeeId: ana.id,
    status: 'WITH_AGENT',
    employeeMessageCount: 1,
    createdAt,
    lastMessageAt: createdAt,
  };
  await unitOfWork.conversations.insert(conversation);
  const draft: Draft = {
    id: await unitOfWork.drafts.nextId(),
    conversationId: conversation.id,
    status,
    payload: {
      kind: DraftKind.UPDATE,
      ticketId: 'INC-20320',
      message: 'Informação adicional.',
    },
    createdAt,
    ...(status === DraftStatus.CONFIRMED ? { ticketId: 'INC-20320', decidedAt } : {}),
    ...(status === DraftStatus.CANCELLED ? { decidedAt } : {}),
  };
  await unitOfWork.drafts.insert(draft);

  return {
    deps: { unitOfWork, clock, metrics, eventBus },
    unitOfWork,
    metrics,
    eventBus,
    conversation,
    draft,
  };
}

describe('cancelamento de rascunhos', () => {
  it('cancela um rascunho PENDING, publica o evento e registra métrica cancelled', async () => {
    const { deps, unitOfWork, metrics, eventBus, conversation, draft } = await setup();
    const listener = vi.fn();
    eventBus.subscribe({ conversationId: conversation.id }, listener);

    const result = await cancelDraft(deps, ana, draft.id);

    expect(result).toEqual({
      id: draft.id,
      conversationId: conversation.id,
      status: DraftStatus.CANCELLED,
      payload: draft.payload,
      createdAt: createdAt.toISOString(),
    });
    expect(await unitOfWork.drafts.findById(draft.id)).toMatchObject({
      status: DraftStatus.CANCELLED,
      decidedAt,
    });
    expect(await unitOfWork.messages.listByConversation(conversation.id, 10)).toEqual([]);
    expect(listener.mock.calls).toEqual([[{ type: 'draft', draft: result }]]);
    expect(metrics.calls).toEqual([
      {
        method: 'increment',
        name: 'nexo_drafts_total',
        labels: { kind: DraftKind.UPDATE, outcome: 'cancelled' },
      },
    ]);
  });

  it('rejeita cancelar um rascunho já cancelado com DRAFT_NOT_PENDING', async () => {
    const { deps, metrics, draft } = await setup();

    await cancelDraft(deps, ana, draft.id);
    await expect(cancelDraft(deps, ana, draft.id)).rejects.toMatchObject({
      code: ErrorCode.DRAFT_NOT_PENDING,
    });
    expect(metrics.calls).toHaveLength(1);
  });

  it('rejeita cancelar um rascunho já confirmado com DRAFT_NOT_PENDING', async () => {
    const { deps, metrics, draft } = await setup(DraftStatus.CONFIRMED);

    await expect(cancelDraft(deps, ana, draft.id)).rejects.toMatchObject({
      code: ErrorCode.DRAFT_NOT_PENDING,
    });
    expect(metrics.calls).toEqual([]);
  });

  it('retorna o mesmo NotFoundError para rascunho de outro funcionário e inexistente', async () => {
    const { deps, unitOfWork, draft } = await setup();

    const otherError = await cancelDraft(deps, bruno, draft.id).catch((error: unknown) => error);
    const missingError = await cancelDraft(deps, bruno, 'D-99999').catch((error: unknown) => error);

    expect(otherError).toBeInstanceOf(NotFoundError);
    expect(missingError).toBeInstanceOf(NotFoundError);
    expect((otherError as NotFoundError).message).toBe((missingError as NotFoundError).message);
    expect((await unitOfWork.drafts.findById(draft.id))?.status).toBe(DraftStatus.PENDING);
  });
});
