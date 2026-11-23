import type { ConversationEvent } from '@nexo/contracts';

export interface ConversationEventBus {
  publish(event: ConversationEvent & { conversationId: string }): void;
  subscribe(
    filter: { conversationId?: string },
    listener: (event: ConversationEvent) => void,
  ): () => void;
}
