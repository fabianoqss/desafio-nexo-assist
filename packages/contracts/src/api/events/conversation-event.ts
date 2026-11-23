import { ConversationStatus } from '@nexo/domain';
import { z } from 'zod';
import { ErrorCode } from '../../common/error-response.ts';
import { LowercaseUuidSchema } from '../../common/uuid.ts';
import { DraftResponseSchema } from '../response/draft-response.ts';
import { MessageResponseSchema } from '../response/message-response.ts';

export const ConversationEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('message'),
    message: MessageResponseSchema,
  }),
  z.object({
    type: z.literal('status'),
    conversationId: z.string(),
    status: z.enum(ConversationStatus),
    assignedAnalystId: LowercaseUuidSchema.exactOptional(),
  }),
  z.object({
    type: z.literal('draft'),
    draft: DraftResponseSchema,
  }),
  z.object({
    type: z.literal('error'),
    code: z.enum(ErrorCode),
    message: z.string(),
  }),
  z.object({
    type: z.literal('done'),
  }),
]);

export type ConversationEvent = z.infer<typeof ConversationEventSchema>;
