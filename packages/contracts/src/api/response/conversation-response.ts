import { ConversationStatus } from '@nexo/domain';
import { z } from 'zod';
import { DraftResponseSchema } from './draft-response.ts';
import { HandoffSummarySchema } from './handoff-summary-response.ts';
import { MessageResponseSchema } from './message-response.ts';

export const ConversationResponseSchema = z.object({
  id: z.string(),
  status: z.enum(ConversationStatus),
  employeeMessageCount: z.int(),
  maxEmployeeMessages: z.int(),
  messages: z.array(MessageResponseSchema),
  pendingDrafts: z.array(DraftResponseSchema),
  handoff: HandoffSummarySchema.exactOptional(),
});

export type ConversationResponse = z.infer<typeof ConversationResponseSchema>;
