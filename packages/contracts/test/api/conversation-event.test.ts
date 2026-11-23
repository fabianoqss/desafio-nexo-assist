import { ConversationEventSchema } from '@nexo/contracts';
import { describe, expect, it } from 'vitest';

const conversationId = '123e4567-e89b-42d3-a456-426614174000';
const createdAt = '2026-11-23T14:00:00.000Z';

describe('ConversationEventSchema', () => {
  it.each([
    {
      type: 'message',
      message: { id: '1', author: 'AGENT', content: 'Como posso ajudar?', createdAt },
    },
    {
      type: 'status',
      conversationId,
      status: 'WITH_ANALYST',
      assignedAnalystId: '123e4567-e89b-42d3-a456-426614174001',
    },
    {
      type: 'draft',
      draft: {
        id: 'D-400',
        conversationId,
        status: 'PENDING',
        payload: { kind: 'UPDATE', ticketId: 'INC-20298', message: 'O Outlook voltou a falhar.' },
        createdAt,
      },
    },
    { type: 'error', code: 'MESSAGE_LIMIT_REACHED', message: 'Limite de mensagens atingido.' },
    { type: 'done' },
  ])('aceita evento $type', (event) => {
    expect(ConversationEventSchema.parse(event)).toEqual(event);
  });

  it('recusa agent-step', () => {
    expect(ConversationEventSchema.safeParse({ type: 'agent-step' }).success).toBe(false);
  });
});
