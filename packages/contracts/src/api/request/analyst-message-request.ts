import { z } from 'zod';
import { PostMessageRequestSchema } from './post-message-request.ts';

export const AnalystMessageRequestSchema = PostMessageRequestSchema;

export type AnalystMessageRequest = z.infer<typeof AnalystMessageRequestSchema>;
