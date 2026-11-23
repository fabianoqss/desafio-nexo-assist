import { z } from 'zod';

export const LowercaseUuidSchema = z.uuid().transform((value) => value.toLowerCase());
