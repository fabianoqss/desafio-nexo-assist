import {
  computeDueAt,
  ConversationStatus,
  HandoffReason,
  MessageAuthor,
  Priority,
} from '@nexo/domain';
import { SEED_USERS } from '@nexo/seed-data';
import { randomUUID } from 'node:crypto';
import type { Conversation } from '../application/model/conversation.ts';
import type { NewMessage } from '../application/ports/message-repository.ts';

interface SeedConversation {
  conversation: Conversation;
  messages: NewMessage[];
}

export function buildSeedConversations(now: Date): SeedConversation[] {
  const [, bruno, carla] = SEED_USERS;
  const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000);
  const brunoId = randomUUID();
  const carlaId = randomUUID();
  const brunoCreatedAt = minutesAgo(24);
  const requestedAt = minutesAgo(20);
  const carlaCreatedAt = minutesAgo(7);
  const carlaLastMessageAt = minutesAgo(6);

  return [
    {
      conversation: {
        id: brunoId,
        employeeId: bruno.id,
        status: ConversationStatus.WAITING_ANALYST,
        handoff: {
          reason: HandoffReason.CRITICAL_CASE,
          summary: 'VPN caiu para o time comercial; INC-20320 crítico',
          priority: Priority.CRITICAL,
          requestedAt,
          dueAt: computeDueAt(Priority.CRITICAL, requestedAt),
        },
        employeeMessageCount: 1,
        createdAt: brunoCreatedAt,
        lastMessageAt: requestedAt,
      },
      messages: [
        {
          conversationId: brunoId,
          author: MessageAuthor.EMPLOYEE,
          authorId: bruno.id,
          content: 'A VPN caiu para todo o time comercial. O chamado é INC-20320.',
          createdAt: brunoCreatedAt,
        },
        {
          conversationId: brunoId,
          author: MessageAuthor.AGENT,
          content: 'O chamado INC-20320 é crítico. Vou encaminhar a conversa a um analista.',
          createdAt: minutesAgo(21),
        },
        {
          conversationId: brunoId,
          author: MessageAuthor.SYSTEM,
          content: 'Conversa transferida para um analista.',
          createdAt: requestedAt,
        },
      ],
    },
    {
      conversation: {
        id: carlaId,
        employeeId: carla.id,
        status: ConversationStatus.WITH_AGENT,
        employeeMessageCount: 1,
        createdAt: carlaCreatedAt,
        lastMessageAt: carlaLastMessageAt,
      },
      messages: [
        {
          conversationId: carlaId,
          author: MessageAuthor.EMPLOYEE,
          authorId: carla.id,
          content: 'Preciso de ajuda para configurar a VPN no notebook.',
          createdAt: carlaCreatedAt,
        },
        {
          conversationId: carlaId,
          author: MessageAuthor.AGENT,
          content: 'Você já tem o cliente VPN instalado? Posso orientar a configuração.',
          createdAt: carlaLastMessageAt,
        },
      ],
    },
  ];
}
