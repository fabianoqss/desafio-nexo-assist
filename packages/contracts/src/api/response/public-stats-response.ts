import { z } from 'zod';

export const PublicStatsResponseSchema = z.object({
  conversationsLast30Days: z.int(),
  resolvedWithoutHandoffRate: z.number().min(0).max(1),
  averageHandoffWaitMinutes: z.number().nullable(),
  generatedAt: z.iso.datetime(),
});

export type PublicStatsResponse = z.infer<typeof PublicStatsResponseSchema>;
