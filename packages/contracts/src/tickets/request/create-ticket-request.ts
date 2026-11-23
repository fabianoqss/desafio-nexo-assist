import { Category, Impact, TicketType, Urgency, type TicketDraft } from '@nexo/domain';
import { z } from 'zod';
import { boundedText } from '../../common/bounded-text.ts';

export const CreateTicketRequestSchema = z.object({
  type: z.enum(TicketType),
  title: boundedText(120),
  description: boundedText(4000),
  category: z.enum(Category),
  item: boundedText(80).exactOptional(),
  impact: z.enum(Impact),
  urgency: z.enum(Urgency),
}) satisfies z.ZodType<TicketDraft>;

export type CreateTicketRequest = z.infer<typeof CreateTicketRequestSchema>;
