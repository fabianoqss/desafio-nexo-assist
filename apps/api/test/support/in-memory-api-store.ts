import { DraftPayloadSchema } from '@nexo/contracts';
import { ConversationStatus, DraftStatus } from '@nexo/domain';
import type { Conversation } from '../../src/application/model/conversation.ts';
import type { Draft } from '../../src/application/model/draft.ts';
import type { Message } from '../../src/application/model/message.ts';
import type { Session } from '../../src/application/model/session.ts';
import type { User } from '../../src/application/model/user.ts';
import {
  type ConsoleFilter,
  OpenConversationTakenError,
} from '../../src/application/ports/conversation-repository.ts';
import type { ApiStore, UnitOfWork } from '../../src/application/ports/unit-of-work.ts';

interface StoreState {
  users: Map<string, User>;
  sessions: Map<string, Session>;
  conversations: Map<string, Conversation>;
  messages: Message[];
  drafts: Map<string, Draft>;
}

function matchesConsoleFilter(
  conversation: Conversation,
  filter: ConsoleFilter,
  analystId: string,
) {
  switch (filter) {
    case 'ALL':
      return conversation.status !== ConversationStatus.CLOSED;
    case 'FOR_YOU':
      return conversation.status === ConversationStatus.WAITING_ANALYST;
    case 'WITH_AGENT':
      return conversation.status === ConversationStatus.WITH_AGENT;
    case 'MINE':
      return (
        conversation.status === ConversationStatus.WITH_ANALYST &&
        conversation.assignedAnalystId === analystId
      );
  }
}

function consoleOrder(first: Conversation, second: Conversation): number {
  const firstWaiting = first.status === ConversationStatus.WAITING_ANALYST;
  const secondWaiting = second.status === ConversationStatus.WAITING_ANALYST;
  if (firstWaiting !== secondWaiting) {
    return firstWaiting ? -1 : 1;
  }

  const dueDifference = firstWaiting
    ? (first.handoff?.dueAt.getTime() ?? Infinity) - (second.handoff?.dueAt.getTime() ?? Infinity)
    : 0;
  return (
    dueDifference ||
    second.lastMessageAt.getTime() - first.lastMessageAt.getTime() ||
    first.id.localeCompare(second.id)
  );
}

function uniqueViolation(constraint: string): Error {
  return new Error('Violação de unicidade', { cause: { code: '23505', constraint } });
}

function insertUnique<T>(entries: Map<string, T>, key: string, value: T, constraint: string): void {
  if (entries.has(key)) {
    throw uniqueViolation(constraint);
  }
  entries.set(key, structuredClone(value));
}

function readDraft(draft: Draft): Draft {
  return { ...structuredClone(draft), payload: DraftPayloadSchema.parse(draft.payload) };
}

export class InMemoryApiStore implements ApiStore, UnitOfWork {
  #state: StoreState = {
    users: new Map(),
    sessions: new Map(),
    conversations: new Map(),
    messages: [],
    drafts: new Map(),
  };
  #sequences = { draft: 400n, message: 1n };
  #pending = Promise.resolve();

  constructor(users: readonly User[] = []) {
    this.#state.users = new Map(users.map((user) => [user.id, structuredClone(user)]));
  }

  readonly users: ApiStore['users'] = {
    findByEmail: (email) =>
      Promise.resolve(
        structuredClone([...this.#state.users.values()].find((user) => user.email === email)),
      ),
    findById: (id) => Promise.resolve(structuredClone(this.#state.users.get(id))),
    findManyByIds: (ids) => {
      const requested = new Set(ids);
      const users = [...this.#state.users.values()].filter(({ id }) => requested.has(id));
      return Promise.resolve(structuredClone(users));
    },
    upsertMany: (users) =>
      this.#enqueue(() => {
        const entries = new Map(this.#state.users);
        for (const user of users) {
          entries.set(user.id, structuredClone(user));
        }
        if (new Set([...entries.values()].map(({ email }) => email)).size !== entries.size) {
          throw uniqueViolation('users_email_unique');
        }
        this.#state.users = entries;
      }),
  };

  readonly sessions: ApiStore['sessions'] = {
    insert: (session) =>
      this.#enqueue(() => {
        insertUnique(this.#state.sessions, session.tokenHash, session, 'sessions_pkey');
      }),
    findValid: (tokenHash, now) => {
      const session = this.#state.sessions.get(tokenHash);
      return Promise.resolve(
        session && session.expiresAt > now ? structuredClone(session) : undefined,
      );
    },
    delete: (tokenHash) =>
      this.#enqueue(() => {
        this.#state.sessions.delete(tokenHash);
      }),
    deleteExpired: (now) =>
      this.#enqueue(() => {
        for (const [tokenHash, session] of this.#state.sessions) {
          if (session.expiresAt <= now) {
            this.#state.sessions.delete(tokenHash);
          }
        }
      }),
  };

  readonly conversations: ApiStore['conversations'] = {
    findOpenByEmployee: (employeeId) =>
      Promise.resolve(structuredClone(this.#openConversation(employeeId))),
    findById: (id) => Promise.resolve(structuredClone(this.#state.conversations.get(id))),
    findByIdForUpdate: (id) => this.conversations.findById(id),
    insert: (conversation) =>
      this.#enqueue(() => {
        this.#assertOpenConversationUnique(conversation);
        insertUnique(
          this.#state.conversations,
          conversation.id,
          conversation,
          'conversations_pkey',
        );
      }),
    update: (conversation) =>
      this.#enqueue(() => {
        if (this.#state.conversations.has(conversation.id)) {
          this.#assertOpenConversationUnique(conversation);
          this.#state.conversations.set(conversation.id, structuredClone(conversation));
        }
      }),
    listForConsole: (filter, analystId, limit) => {
      const entries = [...this.#state.conversations.values()]
        .filter((conversation) => matchesConsoleFilter(conversation, filter, analystId))
        .sort(consoleOrder)
        .slice(0, limit);
      return Promise.resolve(structuredClone(entries));
    },
    statsSince: (since) => {
      const entries = [...this.#state.conversations.values()].filter(
        ({ createdAt }) => createdAt >= since,
      );
      const closed = entries.filter(({ status }) => status === ConversationStatus.CLOSED);
      const waits = entries.flatMap(({ assumedAt, handoff }) =>
        assumedAt && handoff && assumedAt >= handoff.requestedAt
          ? [(assumedAt.getTime() - handoff.requestedAt.getTime()) / 1_000]
          : [],
      );
      return Promise.resolve({
        total: entries.length,
        closed: closed.length,
        closedWithoutHandoff: closed.filter(({ handoff }) => handoff === undefined).length,
        averageHandoffWaitSeconds:
          waits.length === 0 ? null : waits.reduce((sum, wait) => sum + wait, 0) / waits.length,
      });
    },
  };

  readonly messages: ApiStore['messages'] = {
    append: (message) =>
      this.#enqueue(() => {
        const entry = { ...message, id: String(this.#sequences.message++) };
        this.#state.messages.push(structuredClone(entry));
        return structuredClone(entry);
      }),
    listByConversation: (conversationId, limit) => {
      const entries = this.#state.messages.filter(
        (message) => message.conversationId === conversationId,
      );
      return Promise.resolve(structuredClone(entries.slice(Math.max(0, entries.length - limit))));
    },
    lastByConversations: (ids) => {
      const requested = new Set(ids);
      const entries = new Map<string, Message>();
      for (const message of this.#state.messages) {
        if (requested.has(message.conversationId)) {
          entries.set(message.conversationId, message);
        }
      }
      return Promise.resolve(structuredClone(entries));
    },
  };

  readonly drafts: ApiStore['drafts'] = {
    nextId: () => this.#enqueue(() => `D-${String(this.#sequences.draft++)}`),
    insert: (draft) =>
      this.#enqueue(() => {
        insertUnique(this.#state.drafts, draft.id, draft, 'ticket_drafts_pkey');
      }),
    findById: (id) =>
      Promise.resolve().then(() => {
        const entry = this.#state.drafts.get(id);
        return entry && readDraft(entry);
      }),
    findByIdForUpdate: (id) => this.drafts.findById(id),
    update: (draft) =>
      this.#enqueue(() => {
        if (this.#state.drafts.has(draft.id)) {
          this.#state.drafts.set(draft.id, structuredClone(draft));
        }
      }),
    listPending: (conversationId) =>
      Promise.resolve().then(() => {
        const entries = [...this.#state.drafts.values()]
          .filter(
            (draft) =>
              draft.conversationId === conversationId && draft.status === DraftStatus.PENDING,
          )
          .sort(
            (first, second) =>
              first.createdAt.getTime() - second.createdAt.getTime() ||
              first.id.localeCompare(second.id),
          );
        return entries.map(readDraft);
      }),
  };

  run<T>(work: (store: ApiStore) => Promise<T>): Promise<T> {
    return this.#enqueue(async () => {
      const transaction = new InMemoryApiStore();
      transaction.#state = structuredClone(this.#state);
      transaction.#sequences = this.#sequences;
      const result = await work(transaction);
      this.#state = structuredClone(transaction.#state);
      return result;
    });
  }

  #openConversation(employeeId: string): Conversation | undefined {
    return [...this.#state.conversations.values()].find(
      (conversation) =>
        conversation.employeeId === employeeId && conversation.status !== ConversationStatus.CLOSED,
    );
  }

  #assertOpenConversationUnique(conversation: Conversation): void {
    if (conversation.status === ConversationStatus.CLOSED) {
      return;
    }

    const open = this.#openConversation(conversation.employeeId);
    if (open && open.id !== conversation.id) {
      throw new OpenConversationTakenError('O funcionário já possui uma conversa aberta', {
        cause: { code: '23505', constraint: 'conversations_one_open_per_employee_idx' },
      });
    }
  }

  #enqueue<T>(work: () => T | Promise<T>): Promise<T> {
    const result = this.#pending.then(work);
    this.#pending = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
