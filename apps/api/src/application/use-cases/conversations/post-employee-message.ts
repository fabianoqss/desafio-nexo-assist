import { type ConversationEvent, ErrorCode, type PostMessageRequest } from '@nexo/contracts';
import {
  ConversationStatus,
  MAX_EMPLOYEE_MESSAGES,
  MessageAuthor,
  shouldAgentReply,
} from '@nexo/domain';
import { ConflictError } from '@nexo/server-kit';
import { assertOwnConversation } from '../../access/conversation-access.ts';
import type { AuthenticatedUser } from '../../auth/authenticated-user.ts';
import type {
  AgentTurnContext,
  AgentTurnEvent,
  AgentTurnRunner,
} from '../../ports/agent-turn-runner.ts';
import type { Clock } from '../../ports/clock.ts';
import type { ConversationEventBus } from '../../ports/conversation-event-bus.ts';
import type { Metrics } from '../../ports/metrics.ts';
import type { UnitOfWork } from '../../ports/unit-of-work.ts';
import { MESSAGE_HISTORY_LIMIT, toDraftView } from '../../views/conversation-view.ts';
import { toMessageView } from '../../views/message-view.ts';

interface PostEmployeeMessageDependencies {
  unitOfWork: UnitOfWork;
  clock: Clock;
  metrics: Metrics;
  eventBus: ConversationEventBus;
  agentTurnRunner: AgentTurnRunner;
}

interface PostEmployeeMessageOptions {
  signal?: AbortSignal;
  turnTimeoutMs?: number;
}

export const AGENT_TURN_TIMEOUT_MS = 60_000;
const agentFailureMessage = 'Não foi possível obter uma resposta do assistente.';

function publishEvent(
  { metrics, eventBus }: PostEmployeeMessageDependencies,
  conversationId: string,
  event: ConversationEvent,
): ConversationEvent {
  if (event.type === 'message') {
    metrics.increment('nexo_messages_total', { author: event.message.author });
  }
  eventBus.publish({ ...event, conversationId });
  return event;
}

async function persistAgentEvent(
  deps: PostEmployeeMessageDependencies,
  user: AuthenticatedUser,
  conversationId: string,
  output: AgentTurnEvent,
  signal: AbortSignal | undefined,
): Promise<ConversationEvent | undefined> {
  return deps.unitOfWork.run<ConversationEvent | undefined>(
    async ({ conversations, messages, drafts }) => {
      const conversation = assertOwnConversation(
        user,
        await conversations.findByIdForUpdate(conversationId),
      );
      signal?.throwIfAborted();
      if (!shouldAgentReply(conversation.status)) {
        return undefined;
      }
      if (output.type === 'draft') {
        if (output.draft.conversationId !== conversationId) {
          throw new Error('Rascunho associado a outra conversa');
        }
        await drafts.insert(output.draft);
        signal?.throwIfAborted();
        return { type: 'draft', draft: toDraftView(output.draft) };
      }

      const createdAt = deps.clock.now();
      const message = await messages.append({
        conversationId,
        author: output.author,
        content: output.content,
        createdAt,
      });
      signal?.throwIfAborted();
      await conversations.update({ ...conversation, lastMessageAt: createdAt });
      signal?.throwIfAborted();
      return { type: 'message', message: toMessageView(message) };
    },
  );
}

async function nextAgentOutput(
  iterator: AsyncIterator<AgentTurnEvent, unknown>,
  signal: AbortSignal,
): Promise<IteratorResult<AgentTurnEvent, unknown>> {
  signal.throwIfAborted();
  const { promise, reject } = Promise.withResolvers<never>();
  const abort = () => {
    reject(signal.reason);
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    const next = Promise.resolve().then(() => {
      signal.throwIfAborted();
      return iterator.next();
    });
    return await Promise.race([next, promise]);
  } finally {
    signal.removeEventListener('abort', abort);
  }
}

async function* runAgentTurn(
  deps: PostEmployeeMessageDependencies,
  context: AgentTurnContext,
): AsyncIterable<ConversationEvent> {
  const { conversation, employee, signal } = context;
  signal.throwIfAborted();
  const iterator = deps.agentTurnRunner.run(context)[Symbol.asyncIterator]();
  let result: IteratorResult<AgentTurnEvent, unknown> | undefined;
  try {
    for (;;) {
      result = await nextAgentOutput(iterator, signal);
      signal.throwIfAborted();
      if (result.done) {
        return;
      }
      const event = await persistAgentEvent(deps, employee, conversation.id, result.value, signal);
      signal.throwIfAborted();
      if (!event) {
        return;
      }
      yield publishEvent(deps, conversation.id, event);
    }
  } finally {
    if (!result?.done) {
      void Promise.resolve()
        .then(() => iterator.return?.())
        .catch(() => undefined);
    }
  }
}

export async function* postEmployeeMessage(
  deps: PostEmployeeMessageDependencies,
  user: AuthenticatedUser,
  conversationId: string,
  request: PostMessageRequest,
  { signal: requestSignal, turnTimeoutMs = AGENT_TURN_TIMEOUT_MS }: PostEmployeeMessageOptions = {},
): AsyncIterable<ConversationEvent> {
  if (requestSignal?.aborted) {
    return;
  }
  const { unitOfWork, clock } = deps;
  const initial = await unitOfWork.run(async ({ conversations, messages }) => {
    const stored = assertOwnConversation(
      user,
      await conversations.findByIdForUpdate(conversationId),
    );
    if (requestSignal?.aborted) {
      return undefined;
    }
    if (stored.status === ConversationStatus.CLOSED) {
      throw new ConflictError(ErrorCode.CONVERSATION_STATE_CONFLICT, 'A conversa está encerrada');
    }
    if (stored.employeeMessageCount >= MAX_EMPLOYEE_MESSAGES) {
      throw new ConflictError(ErrorCode.MESSAGE_LIMIT_REACHED, 'Limite de mensagens atingido');
    }

    const createdAt = clock.now();
    const message = await messages.append({
      conversationId,
      author: MessageAuthor.EMPLOYEE,
      authorId: user.id,
      content: request.content,
      createdAt,
    });
    const conversation = {
      ...stored,
      employeeMessageCount: stored.employeeMessageCount + 1,
      lastMessageAt: createdAt,
    };
    await conversations.update(conversation);

    const history = shouldAgentReply(conversation.status)
      ? await messages.listByConversation(conversationId, MESSAGE_HISTORY_LIMIT)
      : undefined;
    return { message, history };
  });

  if (!initial || requestSignal?.aborted) {
    return;
  }
  const { message, history } = initial;
  yield publishEvent(deps, conversationId, { type: 'message', message: toMessageView(message) });

  if (history !== undefined && !requestSignal?.aborted) {
    const conversation = await unitOfWork.run(async ({ conversations }) =>
      assertOwnConversation(user, await conversations.findById(conversationId)),
    );
    if (shouldAgentReply(conversation.status)) {
      const timeout = AbortSignal.timeout(turnTimeoutMs);
      const signal = requestSignal ? AbortSignal.any([requestSignal, timeout]) : timeout;
      try {
        yield* runAgentTurn(deps, { conversation, employee: user, history, signal });
      } catch {
        if (requestSignal?.aborted) {
          return;
        }
        const fallback = await persistAgentEvent(
          deps,
          user,
          conversationId,
          { type: 'message', author: MessageAuthor.SYSTEM, content: agentFailureMessage },
          requestSignal,
        ).catch((error: unknown) => {
          if (!requestSignal?.aborted) {
            throw error;
          }
        });
        if (fallback && !requestSignal?.aborted) {
          yield {
            type: 'error',
            code: ErrorCode.SERVICE_UNAVAILABLE,
            message: agentFailureMessage,
          };
          if (!requestSignal?.aborted) {
            yield publishEvent(deps, conversationId, fallback);
          }
        }
      }
    }
  }

  if (!requestSignal?.aborted) {
    yield { type: 'done' };
  }
}
