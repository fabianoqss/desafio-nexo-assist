import type { MessageResponse } from '@nexo/contracts';
import type { Message } from '../model/message.ts';

export function toMessageView({
  id,
  author,
  authorId,
  content,
  createdAt,
}: Message): MessageResponse {
  return {
    id,
    author,
    ...(authorId === undefined ? {} : { authorId }),
    content,
    createdAt: createdAt.toISOString(),
  };
}
