import { HandoffRequestSchema, PostMessageRequestSchema } from '@nexo/contracts';
import { HandoffReason, UserRole } from '@nexo/domain';
import { RateLimitedError, ValidationError } from '@nexo/server-kit';
import { type Context, Hono } from 'hono';
import { z } from 'zod';
import { assertOwnConversation } from '../../../application/access/conversation-access.ts';
import type { AgentTurnRunner } from '../../../application/ports/agent-turn-runner.ts';
import type { ConversationEventBus } from '../../../application/ports/conversation-event-bus.ts';
import type { Metrics } from '../../../application/ports/metrics.ts';
import type { RateLimiter } from '../../../application/ports/rate-limiter.ts';
import type { UnitOfWork } from '../../../application/ports/unit-of-work.ts';
import {
  resolveSession,
  type SessionDependencies,
} from '../../../application/use-cases/auth/resolve-session.ts';
import { getCurrentConversation } from '../../../application/use-cases/conversations/get-current-conversation.ts';
import { postEmployeeMessage } from '../../../application/use-cases/conversations/post-employee-message.ts';
import { requestHandoff } from '../../../application/use-cases/conversations/request-handoff.ts';
import { getSessionCookie } from '../cookies/session-cookie.ts';
import { rateLimit } from '../middleware/rate-limit.ts';
import { requireRole } from '../middleware/require-role.ts';
import { session, type SessionEnv } from '../middleware/session.ts';
import {
  streamConversation,
  subscribeToConversationEvents,
  writeConversationEvents,
} from '../sse/write-conversation-events.ts';

export interface ConversationDependencies extends SessionDependencies {
  unitOfWork: UnitOfWork;
  metrics: Metrics;
  rateLimiter: RateLimiter;
  agentTurnRunner: AgentTurnRunner;
  eventBus: ConversationEventBus;
  pingIntervalMs?: number;
}

const conversationIdSchema = z.uuid().toLowerCase();
const maxEventStreamsPerUser = 5;

const handoffSummary = {
  [HandoffReason.EMPLOYEE_REQUEST]: 'O funcionário pediu para falar com um analista.',
  [HandoffReason.MESSAGE_LIMIT]: 'Limite de 30 mensagens atingido.',
};

function json(context: Context<SessionEnv>): Promise<unknown> {
  return context.req.json<unknown>().catch(() => {
    throw new ValidationError('Dados inválidos');
  });
}

export function conversationRoutes(deps: ConversationDependencies) {
  const { clock, metrics, rateLimiter, unitOfWork, eventBus, pingIntervalMs } = deps;
  const routes = new Hono<SessionEnv>();
  const openEventStreams = new Map<string, number>();
  routes.use(async (context, next) => {
    await next();
    context.header('Cache-Control', 'no-store');
  });
  routes.use(session(deps), requireRole(UserRole.EMPLOYEE));

  const limitMessages = rateLimit<SessionEnv>({
    scope: 'messages',
    limit: 20,
    windowMs: 60_000,
    key: (context) => context.get('user').id,
    rateLimiter,
    clock,
    metrics,
  });

  routes.get('/current', async (context) => {
    if (context.req.raw.method === 'HEAD') {
      return context.body(null, 200, { 'Content-Type': 'application/json' });
    }
    return context.json(await getCurrentConversation(deps, context.get('user')));
  });

  routes.post('/:id/messages', limitMessages, async (context) => {
    const id = conversationIdSchema.parse(context.req.param('id'));
    const input = PostMessageRequestSchema.parse(await json(context));
    const disconnect = new AbortController();
    const signal = AbortSignal.any([context.req.raw.signal, disconnect.signal]);
    const events = postEmployeeMessage(deps, context.get('user'), id, input, { signal });
    const iterator = events[Symbol.asyncIterator]();
    const first = await iterator.next();
    return streamConversation(context, (stream) => {
      stream.onAbort(() => {
        disconnect.abort();
      });
      return writeConversationEvents(stream, signal, iterator, first);
    });
  });

  routes.post('/:id/handoff', async (context) => {
    const id = conversationIdSchema.parse(context.req.param('id'));
    const { reason } = HandoffRequestSchema.parse(await json(context));
    const view = await requestHandoff(deps, id, {
      reason,
      summary: handoffSummary[reason],
      priorityInput: {},
      actorId: context.get('user').id,
    });
    return context.json(view);
  });

  routes.get('/:id/events', async (context) => {
    const id = conversationIdSchema.parse(context.req.param('id'));
    const user = context.get('user');
    await unitOfWork.run(async ({ conversations }) => {
      assertOwnConversation(user, await conversations.findById(id));
    });
    if (context.req.raw.method === 'HEAD') {
      context.header('Content-Type', 'text/event-stream');
      return context.body(null);
    }
    const token = getSessionCookie(context);
    const authorize = async () => {
      const currentUser = await resolveSession(deps, token);
      return currentUser.id === user.id && currentUser.role === UserRole.EMPLOYEE;
    };
    const open = openEventStreams.get(user.id) ?? 0;
    if (open >= maxEventStreamsPerUser) {
      metrics.increment('nexo_rate_limited_total', { scope: 'conversation-events' });
      throw new RateLimitedError(30);
    }
    openEventStreams.set(user.id, open + 1);
    return streamConversation(context, async (stream) => {
      try {
        await subscribeToConversationEvents(
          stream,
          context.req.raw.signal,
          eventBus,
          { conversationId: id },
          authorize,
          pingIntervalMs,
        );
      } finally {
        const remaining = (openEventStreams.get(user.id) ?? 1) - 1;
        if (remaining === 0) {
          openEventStreams.delete(user.id);
        } else {
          openEventStreams.set(user.id, remaining);
        }
      }
    });
  });

  return routes;
}
