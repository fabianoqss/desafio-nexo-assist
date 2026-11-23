import { ConversationStatus } from '@nexo/domain';
import { z } from 'zod';
import { LowercaseUuidSchema } from '../../common/uuid.ts';
import { HandoffSummarySchema } from './handoff-summary-response.ts';
import { UserResponseSchema } from './user-response.ts';

export const ConsoleConversationResponseSchema = z.object({
  id: z.string(),
  status: z.enum(ConversationStatus),
  employee: UserResponseSchema.pick({ id: true, name: true, department: true }),
  assignedAnalystId: LowercaseUuidSchema.exactOptional(),
  handoff: HandoffSummarySchema.exactOptional(),
  lastMessageAt: z.iso.datetime(),
  lastMessagePreview: z.string().max(120),
});

export type ConsoleConversationResponse = z.infer<typeof ConsoleConversationResponseSchema>;
