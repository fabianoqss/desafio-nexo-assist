import {
  ConversationStatus,
  DraftStatus,
  HandoffReason,
  MessageAuthor,
  Priority,
  UserRole,
} from '@nexo/domain';
import { inArray, ne, sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgSequence,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const draftNumberSequenceName = 'draft_number_seq';
export const draftNumberSequence = pgSequence(draftNumberSequenceName, { startWith: 400 });

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    department: text('department').notNull(),
    role: text('role').$type<UserRole>().notNull(),
  },
  (table) => [
    check('users_role_check', inArray(table.role, Object.values(UserRole)).inlineParams()),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    tokenHash: text('token_hash').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('sessions_expires_at_idx').on(table.expiresAt)],
);

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => users.id),
    status: text('status').$type<ConversationStatus>().notNull(),
    assignedAnalystId: uuid('assigned_analyst_id').references(() => users.id),
    handoffReason: text('handoff_reason').$type<HandoffReason>(),
    handoffSummary: text('handoff_summary'),
    handoffPriority: text('handoff_priority').$type<Priority>(),
    handoffRequestedAt: timestamp('handoff_requested_at', { withTimezone: true }),
    handoffDueAt: timestamp('handoff_due_at', { withTimezone: true }),
    assumedAt: timestamp('assumed_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    employeeMessageCount: integer('employee_message_count').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('conversations_one_open_per_employee_idx')
      .on(table.employeeId)
      .where(ne(table.status, ConversationStatus.CLOSED).inlineParams()),
    check(
      'conversations_status_check',
      inArray(table.status, Object.values(ConversationStatus)).inlineParams(),
    ),
    check(
      'conversations_handoff_reason_check',
      inArray(table.handoffReason, Object.values(HandoffReason)).inlineParams(),
    ),
    check(
      'conversations_handoff_priority_check',
      inArray(table.handoffPriority, Object.values(Priority)).inlineParams(),
    ),
    check(
      'conversations_handoff_fields_check',
      sql`num_nonnulls(${table.handoffReason}, ${table.handoffSummary}, ${table.handoffPriority}, ${table.handoffRequestedAt}, ${table.handoffDueAt}) in (0, 5)`,
    ),
  ],
);

export const messages = pgTable(
  'messages',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id),
    author: text('author').$type<MessageAuthor>().notNull(),
    authorId: uuid('author_id'),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('messages_conversation_id_id_idx').on(table.conversationId, table.id),
    check(
      'messages_author_check',
      inArray(table.author, Object.values(MessageAuthor)).inlineParams(),
    ),
  ],
);

export const ticketDrafts = pgTable(
  'ticket_drafts',
  {
    id: text('id').primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id),
    status: text('status').$type<DraftStatus>().notNull(),
    payload: jsonb('payload').notNull(),
    ticketId: text('ticket_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (table) => [
    check(
      'ticket_drafts_status_check',
      inArray(table.status, Object.values(DraftStatus)).inlineParams(),
    ),
  ],
);
