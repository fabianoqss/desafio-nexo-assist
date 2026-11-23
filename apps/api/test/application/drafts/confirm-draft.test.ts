import { ErrorCode, type CreateTicketRequest, type TicketResponse } from '@nexo/contracts';
import { DraftKind, DraftStatus, MessageAuthor } from '@nexo/domain';
import { SEED_USERS } from '@nexo/seed-data';
import { ConflictError, NotFoundError } from '@nexo/server-kit';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createInMemoryConversationEventBus } from '../../../src/adapters/events/in-memory-conversation-event-bus.ts';
import type { Conversation } from '../../../src/application/model/conversation.ts';
import type { Draft } from '../../../src/application/model/draft.ts';
import {
  TicketServiceUnavailableError,
  type TicketGateway,
} from '../../../src/application/ports/ticket-gateway.ts';
import { cancelDraft } from '../../../src/application/use-cases/drafts/cancel-draft.ts';
import { confirmDraft } from '../../../src/application/use-cases/drafts/confirm-draft.ts';
import { draftIdempotencyKey } from '../../../src/application/use-cases/drafts/execute-draft.ts';
import { FixedClock } from '../../support/fixed-clock.ts';
import { InMemoryApiStore } from '../../support/in-memory-api-store.ts';
import { RecordingMetrics } from '../../support/recording-metrics.ts';

const [ana, bruno] = SEED_USERS;
const createdAt = new Date('2026-11-23T12:00:00.000Z');
const decidedAt = new Date('2026-11-23T12:05:00.000Z');

const createTicketRequest: CreateTicketRequest = {
  type: 'INC',
  title: 'VPN indisponível',
  description: 'A conexão cai após o login',
  category: 'NETWORK_VPN',
  impact: 'SELF',
  urgency: 'BLOCKED',
};

function ticketResponse(overrides: Partial<TicketResponse> = {}): TicketResponse {
  return {
    ...createTicketRequest,
    id: 'INC-20321',
    priority: 'HIGH',
    status: 'OPEN',
    requesterId: ana.id,
    createdAt: createdAt.toISOString(),
    lastUpdateAt: createdAt.toISOString(),
    dueAt: '2026-11-23T20:00:00.000Z',
    overdue: false,
    ...overrides,
  };
}

function createGatewayMock() {
  const create = vi.fn<TicketGateway['create']>();
  const addInfo = vi.fn<TicketGateway['addInfo']>();
  const reopen = vi.fn<TicketGateway['reopen']>();
  const gateway: TicketGateway = {
    list: vi.fn<TicketGateway['list']>(),
    get: vi.fn<TicketGateway['get']>(),
    findDuplicates: vi.fn<TicketGateway['findDuplicates']>(),
    create,
    addInfo,
    reopen,
  };
  return { gateway, create, addInfo, reopen };
}

async function setup(
  payload: Draft['payload'] = { kind: DraftKind.CREATE, ticket: createTicketRequest },
  status: DraftStatus = DraftStatus.PENDING,
) {
  const unitOfWork = new InMemoryApiStore(SEED_USERS);
  const clock = new FixedClock(decidedAt);
  const metrics = new RecordingMetrics();
  const eventBus = createInMemoryConversationEventBus();
  const { gateway, create, addInfo, reopen } = createGatewayMock();
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
    payload,
    createdAt,
    ...(status === DraftStatus.CONFIRMED ? { ticketId: 'INC-20321', decidedAt } : {}),
    ...(status === DraftStatus.CANCELLED ? { decidedAt } : {}),
  };
  await unitOfWork.drafts.insert(draft);

  const deps = { unitOfWork, clock, metrics, eventBus, ticketGateway: gateway };
  return {
    deps,
    unitOfWork,
    clock,
    metrics,
    eventBus,
    conversation,
    draft,
    create,
    addInfo,
    reopen,
  };
}

describe('confirmação de rascunhos', () => {
  it('gera chave de idempotência estável a partir do id do rascunho', () => {
    expect(draftIdempotencyKey('D-400')).toBe('draft-D-400');
    expect(draftIdempotencyKey('D-400')).toBe(draftIdempotencyKey('D-400'));
  });

  it('confirma um rascunho CREATE, grava mensagem SYSTEM, publica eventos e registra métricas', async () => {
    const { deps, unitOfWork, metrics, eventBus, conversation, draft, create } = await setup();
    const ticket = ticketResponse({ id: 'INC-20321', type: 'INC' });
    create.mockResolvedValueOnce(ticket);
    const events: unknown[] = [];
    eventBus.subscribe({ conversationId: conversation.id }, (event) => {
      events.push(event);
    });

    const result = await confirmDraft(deps, ana, draft.id);

    expect(result).toEqual({
      id: draft.id,
      conversationId: conversation.id,
      status: DraftStatus.CONFIRMED,
      payload: draft.payload,
      ticketId: 'INC-20321',
      createdAt: createdAt.toISOString(),
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      { id: ana.id, role: ana.role },
      createTicketRequest,
      `draft-${draft.id}`,
    );

    const stored = await unitOfWork.drafts.findById(draft.id);
    expect(stored).toMatchObject({
      status: DraftStatus.CONFIRMED,
      ticketId: 'INC-20321',
      decidedAt,
    });

    const messages = await unitOfWork.messages.listByConversation(conversation.id, 10);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      author: MessageAuthor.SYSTEM,
      content: 'Chamado INC-20321 criado.',
      createdAt: decidedAt,
    });
    expect((await unitOfWork.conversations.findById(conversation.id))?.lastMessageAt).toEqual(
      decidedAt,
    );
    expect(events).toEqual([
      { type: 'draft', draft: result },
      {
        type: 'message',
        message: {
          id: messages[0]?.id,
          author: MessageAuthor.SYSTEM,
          content: 'Chamado INC-20321 criado.',
          createdAt: decidedAt.toISOString(),
        },
      },
    ]);
    expect(metrics.calls).toEqual([
      {
        method: 'increment',
        name: 'nexo_messages_total',
        labels: { author: MessageAuthor.SYSTEM },
      },
      {
        method: 'increment',
        name: 'nexo_drafts_total',
        labels: { kind: DraftKind.CREATE, outcome: 'confirmed' },
      },
      { method: 'increment', name: 'nexo_tickets_created_total', labels: { type: 'INC' } },
    ]);
  });

  it('confirma rascunho UPDATE sem incrementar nexo_tickets_created_total', async () => {
    const payload = {
      kind: DraftKind.UPDATE,
      ticketId: 'INC-20320',
      message: 'Continua sem acesso ao ERP.',
    } as const;
    const { deps, unitOfWork, metrics, conversation, draft, addInfo } = await setup(payload);
    addInfo.mockResolvedValueOnce(ticketResponse({ id: 'INC-20320' }));

    const result = await confirmDraft(deps, ana, draft.id);

    expect(result.status).toBe(DraftStatus.CONFIRMED);
    expect(result.ticketId).toBe('INC-20320');
    expect(addInfo).toHaveBeenCalledWith(
      { id: ana.id, role: ana.role },
      'INC-20320',
      { message: 'Continua sem acesso ao ERP.' },
      `draft-${draft.id}`,
    );
    const messages = await unitOfWork.messages.listByConversation(conversation.id, 10);
    expect(messages[0]?.content).toBe('Informação enviada ao INC-20320.');
    expect(metrics.calls).toEqual([
      {
        method: 'increment',
        name: 'nexo_messages_total',
        labels: { author: MessageAuthor.SYSTEM },
      },
      {
        method: 'increment',
        name: 'nexo_drafts_total',
        labels: { kind: DraftKind.UPDATE, outcome: 'confirmed' },
      },
    ]);
  });

  it('confirma rascunho REOPEN com mensagem de reabertura', async () => {
    const payload = {
      kind: DraftKind.REOPEN,
      ticketId: 'INC-20298',
      message: 'O problema voltou hoje cedo.',
    } as const;
    const { deps, unitOfWork, metrics, conversation, draft, reopen } = await setup(payload);
    reopen.mockResolvedValueOnce(ticketResponse({ id: 'INC-20298' }));

    const result = await confirmDraft(deps, ana, draft.id);

    expect(result.status).toBe(DraftStatus.CONFIRMED);
    expect(result.ticketId).toBe('INC-20298');
    expect(reopen).toHaveBeenCalledWith(
      { id: ana.id, role: ana.role },
      'INC-20298',
      { message: 'O problema voltou hoje cedo.' },
      `draft-${draft.id}`,
    );
    const messages = await unitOfWork.messages.listByConversation(conversation.id, 10);
    expect(messages[0]?.content).toBe('Chamado INC-20298 reaberto.');
    expect(metrics.calls).toEqual([
      {
        method: 'increment',
        name: 'nexo_messages_total',
        labels: { author: MessageAuthor.SYSTEM },
      },
      {
        method: 'increment',
        name: 'nexo_drafts_total',
        labels: { kind: DraftKind.REOPEN, outcome: 'confirmed' },
      },
    ]);
  });

  it('retorna o rascunho já confirmado em replay sem chamar o serviço novamente', async () => {
    const { deps, unitOfWork, metrics, eventBus, conversation, draft, create } = await setup();
    create.mockResolvedValueOnce(ticketResponse({ id: 'INC-20321' }));
    const listener = vi.fn();
    eventBus.subscribe({ conversationId: conversation.id }, listener);

    const first = await confirmDraft(deps, ana, draft.id);
    const second = await confirmDraft(deps, ana, draft.id);

    expect(second).toEqual(first);
    expect(create).toHaveBeenCalledTimes(1);
    expect(await unitOfWork.messages.listByConversation(conversation.id, 10)).toHaveLength(1);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(metrics.calls).toHaveLength(3);
  });

  it('mantém o rascunho PENDING e registra métrica failed quando o serviço falha', async () => {
    const { deps, unitOfWork, metrics, eventBus, conversation, draft, create } = await setup();
    create.mockRejectedValueOnce(new TicketServiceUnavailableError());
    const listener = vi.fn();
    eventBus.subscribe({ conversationId: conversation.id }, listener);

    await expect(confirmDraft(deps, ana, draft.id)).rejects.toBeInstanceOf(
      TicketServiceUnavailableError,
    );

    expect((await unitOfWork.drafts.findById(draft.id))?.status).toBe(DraftStatus.PENDING);
    expect(await unitOfWork.messages.listByConversation(conversation.id, 10)).toEqual([]);
    expect(listener).not.toHaveBeenCalled();
    expect(metrics.calls).toEqual([
      {
        method: 'increment',
        name: 'nexo_drafts_total',
        labels: { kind: DraftKind.CREATE, outcome: 'failed' },
      },
    ]);

    create.mockResolvedValueOnce(ticketResponse({ id: 'INC-20322' }));
    const recovered = await confirmDraft(deps, ana, draft.id);
    expect(recovered.status).toBe(DraftStatus.CONFIRMED);
    expect(recovered.ticketId).toBe('INC-20322');
  });

  it('propaga 409 REOPEN_NOT_ALLOWED mantendo o rascunho PENDING', async () => {
    const payload = {
      kind: DraftKind.REOPEN,
      ticketId: 'INC-20298',
      message: 'Reabrir após prazo.',
    } as const;
    const { deps, unitOfWork, metrics, conversation, draft, reopen } = await setup(payload);
    reopen.mockRejectedValueOnce(
      new ConflictError(ErrorCode.REOPEN_NOT_ALLOWED, 'Reabertura não permitida'),
    );

    await expect(confirmDraft(deps, ana, draft.id)).rejects.toMatchObject({
      code: ErrorCode.REOPEN_NOT_ALLOWED,
    });

    expect((await unitOfWork.drafts.findById(draft.id))?.status).toBe(DraftStatus.PENDING);
    expect(await unitOfWork.messages.listByConversation(conversation.id, 10)).toEqual([]);
    expect(metrics.calls).toEqual([
      {
        method: 'increment',
        name: 'nexo_drafts_total',
        labels: { kind: DraftKind.REOPEN, outcome: 'failed' },
      },
    ]);
  });

  it('rejeita confirmação de rascunho já cancelado com DRAFT_NOT_PENDING', async () => {
    const { deps, draft, create } = await setup(undefined, DraftStatus.CANCELLED);

    await expect(confirmDraft(deps, ana, draft.id)).rejects.toMatchObject({
      code: ErrorCode.DRAFT_NOT_PENDING,
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('vence cancelamento concorrente ocorrido enquanto o serviço executava o rascunho', async () => {
    const { deps, unitOfWork, conversation, draft, create } = await setup();
    const pendingTicket = Promise.withResolvers<TicketResponse>();
    create.mockReturnValueOnce(pendingTicket.promise);

    const confirmation = confirmDraft(deps, ana, draft.id);
    await vi.waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });

    const cancelled = await cancelDraft(deps, ana, draft.id);
    expect(cancelled.status).toBe(DraftStatus.CANCELLED);

    pendingTicket.resolve(ticketResponse({ id: 'INC-20325' }));
    const confirmed = await confirmation;

    expect(confirmed.status).toBe(DraftStatus.CONFIRMED);
    expect(confirmed.ticketId).toBe('INC-20325');
    expect(await unitOfWork.drafts.findById(draft.id)).toMatchObject({
      status: DraftStatus.CONFIRMED,
      ticketId: 'INC-20325',
    });
    expect(await unitOfWork.messages.listByConversation(conversation.id, 10)).toHaveLength(1);
  });

  it('retorna o mesmo NotFoundError para rascunho de outro funcionário e inexistente', async () => {
    const { deps, draft, create } = await setup();

    const otherError = await confirmDraft(deps, bruno, draft.id).catch((error: unknown) => error);
    const missingError = await confirmDraft(deps, bruno, 'D-99999').catch(
      (error: unknown) => error,
    );

    expect(otherError).toBeInstanceOf(NotFoundError);
    expect(missingError).toBeInstanceOf(NotFoundError);
    expect((otherError as NotFoundError).message).toBe((missingError as NotFoundError).message);
    expect(create).not.toHaveBeenCalled();
  });

  it('usa o funcionário da sessão como ator mesmo com campo extra no payload do rascunho', async () => {
    const { deps, draft, create } = await setup({
      kind: DraftKind.CREATE,
      ticket: {
        ...createTicketRequest,
        ...({ actorId: bruno.id, requesterId: bruno.id } as Record<string, string>),
      },
    });
    create.mockResolvedValueOnce(ticketResponse({ id: 'INC-20326' }));

    await confirmDraft(deps, ana, draft.id);

    expect(create).toHaveBeenCalledWith(
      { id: ana.id, role: ana.role },
      expect.anything(),
      `draft-${draft.id}`,
    );
  });
});
