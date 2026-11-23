import type { ConversationEvent } from '@nexo/contracts';
import type { ConversationEventBus } from '../../application/ports/conversation-event-bus.ts';

interface Subscription {
  conversationId: string | undefined;
  listener: (event: ConversationEvent) => void;
}

export function createInMemoryConversationEventBus(): ConversationEventBus {
  const subscriptions = new Set<Subscription>();

  return {
    publish(event) {
      const { conversationId, ...payload } = event;
      const delivered = payload.type === 'status' ? { ...payload, conversationId } : payload;
      for (const subscription of subscriptions) {
        if (
          subscription.conversationId !== undefined &&
          subscription.conversationId !== conversationId
        ) {
          continue;
        }
        try {
          subscription.listener(delivered);
        } catch {
          continue;
        }
      }
    },
    subscribe({ conversationId }, listener) {
      const subscription = { conversationId, listener };
      subscriptions.add(subscription);
      return () => {
        subscriptions.delete(subscription);
      };
    },
  };
}
