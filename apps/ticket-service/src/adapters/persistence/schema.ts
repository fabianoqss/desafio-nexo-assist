import {
  Category,
  Impact,
  Priority,
  TicketEventKind,
  TicketStatus,
  TicketType,
  Urgency,
} from '@nexo/domain';
import { inArray } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  jsonb,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const ticketNumberSequenceNames = {
  [TicketType.INC]: 'inc_ticket_number_seq',
  [TicketType.REQ]: 'req_ticket_number_seq',
} as const;

export const incTicketNumberSequence = pgSequence(ticketNumberSequenceNames.INC, {
  startWith: 20400,
});
export const reqTicketNumberSequence = pgSequence(ticketNumberSequenceNames.REQ, {
  startWith: 10500,
});

export const tickets = pgTable(
  'tickets',
  {
    id: text('id').primaryKey(),
    type: text('type').$type<TicketType>().notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    category: text('category').$type<Category>().notNull(),
    item: text('item'),
    impact: text('impact').$type<Impact>().notNull(),
    urgency: text('urgency').$type<Urgency>().notNull(),
    priority: text('priority').$type<Priority>().notNull(),
    status: text('status').$type<TicketStatus>().notNull(),
    requesterId: uuid('requester_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    lastUpdateAt: timestamp('last_update_at', { withTimezone: true }).notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => [
    index('tickets_requester_last_update_idx').on(table.requesterId, table.lastUpdateAt.desc()),
    check('tickets_type_check', inArray(table.type, Object.values(TicketType)).inlineParams()),
    check(
      'tickets_category_check',
      inArray(table.category, Object.values(Category)).inlineParams(),
    ),
    check('tickets_impact_check', inArray(table.impact, Object.values(Impact)).inlineParams()),
    check('tickets_urgency_check', inArray(table.urgency, Object.values(Urgency)).inlineParams()),
    check(
      'tickets_priority_check',
      inArray(table.priority, Object.values(Priority)).inlineParams(),
    ),
    check(
      'tickets_status_check',
      inArray(table.status, Object.values(TicketStatus)).inlineParams(),
    ),
  ],
);

export const ticketEvents = pgTable(
  'ticket_events',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    ticketId: text('ticket_id')
      .notNull()
      .references(() => tickets.id),
    kind: text('kind').$type<TicketEventKind>().notNull(),
    actorId: uuid('actor_id').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('ticket_events_ticket_id_idx').on(table.ticketId),
    check(
      'ticket_events_kind_check',
      inArray(table.kind, Object.values(TicketEventKind)).inlineParams(),
    ),
  ],
);

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    actorId: uuid('actor_id').notNull(),
    key: text('key').notNull(),
    operation: text('operation').notNull(),
    requestHash: text('request_hash').notNull(),
    ticketId: text('ticket_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.actorId, table.key] })],
);
