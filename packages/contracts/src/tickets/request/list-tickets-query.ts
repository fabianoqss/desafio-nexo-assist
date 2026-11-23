import { TicketStatus } from '@nexo/domain';
import { z } from 'zod';

export const ListTicketsQuerySchema = z.object({
  requesterId: z.uuid().exactOptional(),
  status: z.enum(TicketStatus).exactOptional(),
  limit: z
    .union([z.string(), z.number()])
    .pipe(z.coerce.number<string | number>().int().min(1).max(100))
    .default(50),
});

export type ListTicketsQuery = z.infer<typeof ListTicketsQuerySchema>;
