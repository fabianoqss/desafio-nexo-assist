import { MessageAuthor } from '@nexo/domain';
import { z } from 'zod';
import { LowercaseUuidSchema } from '../../common/uuid.ts';

export const MessageResponseSchema = z.object({
  id: z.string(),
  author: z.enum(MessageAuthor),
  authorId: LowercaseUuidSchema.exactOptional(),
  content: z.string(),
  createdAt: z.iso.datetime(),
});

export type MessageResponse = z.infer<typeof MessageResponseSchema>;
