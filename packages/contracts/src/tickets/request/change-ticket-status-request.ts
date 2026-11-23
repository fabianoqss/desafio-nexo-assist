import { TicketStatus, type StatusChangeTarget } from '@nexo/domain';
import { z } from 'zod';

const StatusChangeTargetSchema = z
  .enum(TicketStatus)
  .exclude([TicketStatus.OPEN]) satisfies z.ZodType<StatusChangeTarget>;

export const ChangeTicketStatusRequestSchema = z.object({
  status: StatusChangeTargetSchema,
});

export type ChangeTicketStatusRequest = z.infer<typeof ChangeTicketStatusRequestSchema>;
