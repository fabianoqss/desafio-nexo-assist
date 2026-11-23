import { HandoffReason, Priority } from '@nexo/domain';
import { z } from 'zod';

export const HandoffSummarySchema = z.object({
  reason: z.enum(HandoffReason),
  summary: z.string(),
  priority: z.enum(Priority),
  requestedAt: z.iso.datetime(),
  dueAt: z.iso.datetime(),
  overdue: z.boolean(),
});

export type HandoffSummary = z.infer<typeof HandoffSummarySchema>;
