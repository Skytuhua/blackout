import { z } from 'zod';
import { ActionRequestSchema, CheckpointSchema, CommandReceiptSchema, KnowledgeViewSchema, RunRecordSchema, ScenarioSpecSchema } from '../shared/schemas';
const identity = { correlationId: z.string().min(1), runId: z.string().min(1) };
export const WorkerRequestSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('initialize'), ...identity, spec: ScenarioSpecSchema }),
  z.strictObject({ kind: z.literal('advance'), ...identity, ticks: z.number().int().min(0).max(600) }),
  z.strictObject({ kind: z.literal('command'), ...identity, request: ActionRequestSchema }),
  z.strictObject({ kind: z.literal('observe'), ...identity, actorId: z.string().min(1) }),
  z.strictObject({ kind: z.literal('snapshot'), ...identity }),
  z.strictObject({ kind: z.literal('restore'), ...identity, checkpoint: CheckpointSchema, newRunId: z.string().min(1) }),
  z.strictObject({ kind: z.literal('record'), ...identity }),
]);
export const WorkerReplySchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('initialized'), ...identity, view: KnowledgeViewSchema }),
  z.strictObject({ kind: z.literal('advanced'), ...identity, view: KnowledgeViewSchema }),
  z.strictObject({ kind: z.literal('receipt'), ...identity, receipt: CommandReceiptSchema }),
  z.strictObject({ kind: z.literal('view'), ...identity, view: KnowledgeViewSchema }),
  z.strictObject({ kind: z.literal('checkpoint'), ...identity, checkpoint: CheckpointSchema }),
  z.strictObject({ kind: z.literal('restored'), ...identity, view: KnowledgeViewSchema }),
  z.strictObject({ kind: z.literal('record'), ...identity, record: RunRecordSchema }),
  z.strictObject({ kind: z.literal('error'), ...identity, code: z.enum(['invalid_request', 'stale_run', 'not_initialized', 'not_implemented', 'engine_error']), message: z.string().max(400) }),
]);
export type WorkerRequest = z.infer<typeof WorkerRequestSchema>;
export type WorkerReply = z.infer<typeof WorkerReplySchema>;
