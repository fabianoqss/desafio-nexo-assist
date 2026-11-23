import { z } from 'zod';

export const TicketIdSchema = z.string().regex(/^(INC|REQ)-\d{5,}$/);

export type TicketId = z.infer<typeof TicketIdSchema>;
