import { z } from 'zod';

export const ProviderCallSchema = z.strictObject({
  receiptId: z.string().min(1).max(120),
  runId: z.string().min(1).max(120), requestId: z.string().min(1).max(120), actorId: z.string().min(1).max(120),
  model: z.string().min(1).max(120), inputTokens: z.number().int().nonnegative().nullable(), outputTokens: z.number().int().nonnegative().nullable(),
  durationMs: z.number().int().nonnegative(), status: z.string().max(30),
});
export type ProviderCall = z.infer<typeof ProviderCallSchema>;
