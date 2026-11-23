import { UserRole } from '@nexo/domain';
import { Hono } from 'hono';
import { z } from 'zod';
import type { ConversationEventBus } from '../../../application/ports/conversation-event-bus.ts';
import type { Metrics } from '../../../application/ports/metrics.ts';
import type { TicketGateway } from '../../../application/ports/ticket-gateway.ts';
import type { UnitOfWork } from '../../../application/ports/unit-of-work.ts';
import type { SessionDependencies } from '../../../application/use-cases/auth/resolve-session.ts';
import { cancelDraft } from '../../../application/use-cases/drafts/cancel-draft.ts';
import { confirmDraft } from '../../../application/use-cases/drafts/confirm-draft.ts';
import { requireRole } from '../middleware/require-role.ts';
import { session, type SessionEnv } from '../middleware/session.ts';

export interface DraftDependencies extends SessionDependencies {
  unitOfWork: UnitOfWork;
  metrics: Metrics;
  eventBus: ConversationEventBus;
  ticketGateway: TicketGateway;
}

const draftIdSchema = z.string().regex(/^D-\d+$/);

export function draftRoutes(deps: DraftDependencies) {
  const routes = new Hono<SessionEnv>();
  routes.use(async (context, next) => {
    context.header('Cache-Control', 'no-store');
    await next();
  });
  routes.use(session(deps), requireRole(UserRole.EMPLOYEE));

  routes.post('/:id/confirm', async (context) => {
    const id = draftIdSchema.parse(context.req.param('id'));
    return context.json(await confirmDraft(deps, context.get('user'), id));
  });

  routes.post('/:id/cancel', async (context) => {
    const id = draftIdSchema.parse(context.req.param('id'));
    return context.json(await cancelDraft(deps, context.get('user'), id));
  });

  return routes;
}
