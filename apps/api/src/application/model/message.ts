import type { MessageAuthor } from '@nexo/domain';

export interface Message {
  id: string;
  conversationId: string;
  author: MessageAuthor;
  authorId?: string;
  content: string;
  createdAt: Date;
}
