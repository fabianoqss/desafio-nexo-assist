import { Category, Impact, TicketType, Urgency, type TicketDraft } from '@nexo/domain';
import { z } from 'zod';

export const CreateTicketRequestSchema = z.object({
  type: z.enum(TicketType),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(4000),
  category: z.enum(Category),
  item: z.string().trim().min(1).max(80).exactOptional(),
  impact: z.enum(Impact),
  urgency: z.enum(Urgency),
}) satisfies z.ZodType<TicketDraft>;

export type CreateTicketRequest = z.infer<typeof CreateTicketRequestSchema>;
