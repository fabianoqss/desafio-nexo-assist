import { Category, Impact, Priority, TicketStatus, TicketType, Urgency } from '@nexo/domain';
import { z } from 'zod';
import { TicketIdSchema } from '../ticket-id.ts';

export const TicketResponseSchema = z.object({
  id: TicketIdSchema,
  type: z.enum(TicketType),
  title: z.string(),
  description: z.string(),
  category: z.enum(Category),
  item: z.string().exactOptional(),
  impact: z.enum(Impact),
  urgency: z.enum(Urgency),
  priority: z.enum(Priority),
  status: z.enum(TicketStatus),
  requesterId: z.uuid(),
  createdAt: z.iso.datetime(),
  lastUpdateAt: z.iso.datetime(),
  resolvedAt: z.iso.datetime().exactOptional(),
  dueAt: z.iso.datetime(),
  overdue: z.boolean(),
});

export type TicketResponse = z.infer<typeof TicketResponseSchema>;
