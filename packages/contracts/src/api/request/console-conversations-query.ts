import { z } from 'zod';

export const ConsoleConversationsQuerySchema = z.object({
  filter: z.enum(['ALL', 'FOR_YOU', 'WITH_AGENT', 'MINE']).default('ALL'),
});

export type ConsoleConversationsQuery = z.infer<typeof ConsoleConversationsQuerySchema>;
