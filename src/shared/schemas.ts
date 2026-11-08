import { z } from 'zod';

const id = z.string().min(1).max(120);
const number = z.number().finite();
const seconds = number.nonnegative();
const version = z.literal(1);
const object = z.strictObject;
export const INTEGRATION_CONTRACT_VERSION = 5;
// Additive conversation contract; legacy desktop/record formats keep their identities.
export const NATURAL_CONVERSATION_CONTRACT_VERSION = 6;
export const PointSchema = object({ x: number, y: number });
export const RoleSchema = z.enum(['player', 'facilities', 'electrical', 'remote', 'debrief']);
export const ActionSchema = z.enum(['inspect', 'independent_reading', 'repair_cooling', 'restart_cooling', 'pause_batch', 'resume_batch', 'set_batch_ceiling', 'verify_recovery', 'cancel_task', 'reset_ups', 'move_crew']);
export const AssetSchema = object({ id, label: z.string(), kind: z.enum(['rack', 'cooling', 'ups', 'controller', 'generator', 'distribution']), x: number, y: number, width: number.positive(), height: number.positive(), serviceTile: PointSchema, dependencies: z.array(id) });
export const CrewSchema = object({ id, name: z.string(), role: z.enum(['facilities', 'electrical', 'remote']), x: number, y: number, speed: number.positive(), taskId: id.nullable() });
export const TopologySchema = object({ width: number.int().positive(), height: number.int().positive(), tileMeters: number.positive(), walkable: z.array(PointSchema), assets: z.array(AssetSchema) });
export const ProfileSchema = object({
  idleKw: number.nonnegative(), peakKw: number.positive(), computeCapacity: number.positive(), heatCapacityKjK: number.positive(), conductanceKwK: number.nonnegative(), supplyReferenceC: number,
  coolingTrainKw: number.positive(), coolingCop: number.positive(), coolingAuxiliaryKw: number.nonnegative(), upsEnergyKwh: number.nonnegative(), upsOutputLimitKw: number.positive(), upsEfficiency: number.positive().max(1), upsRechargeKw: number.nonnegative(), generatorKw: number.positive(),
  sensorIntervalSeconds: seconds.positive().int(), sensorNoiseC: number.nonnegative(), warningC: number, throttleC: number, throttleDwellSeconds: seconds, releaseC: number, releaseDwellSeconds: seconds, tripC: number, tripDwellSeconds: seconds, bootSeconds: seconds, bootKw: number.nonnegative(),
});
export const ExternalEventSchema = object({ id, at: seconds.int(), kind: z.enum(['utility_loss', 'utility_restore', 'generator_ready', 'transfer_complete', 'cooling_control_fault', 'workload_pulse_start', 'workload_pulse_end']), value: number.nullable() });
export const ScenarioSpecSchema = object({
  schemaVersion: version, id, contentVersion: id, procedureVersion: id, mode: z.enum(['practice', 'mission']).optional(), title: z.string(), description: z.string(), seed: number.int().nonnegative(), topology: TopologySchema, crew: z.array(CrewSchema), profile: ProfileSchema,
  workload: object({ critical: number.nonnegative(), interactive: number.nonnegative(), batch: number.nonnegative(), catchupCeiling: number.nonnegative() }),
  externalEvents: z.array(ExternalEventSchema), mission: object({ windowSeconds: seconds.positive().int(), criticalLossSeconds: seconds.positive().int(), stabilityHoldSeconds: seconds.positive().int(), verificationMaxAgeSeconds: seconds.positive().int(), recoveryRestartSeconds: seconds, repairSeconds: seconds, inspectSeconds: seconds, remoteSeconds: seconds, verifySeconds: seconds }),
});
export const ObservationSchema = object({ id, assetId: id, source: id, field: id, value: z.union([number, z.string().max(2000), z.boolean(), z.null()]), units: z.string().max(60), observedAt: seconds, receivedAt: seconds, quality: z.enum(['reported', 'independent', 'estimated', 'unknown']) });
const destination = object({ x: number.int().nonnegative(), y: number.int().nonnegative() });
const actionArgs = object({ technicianId: id.optional(), ceiling: number.min(0).max(100).optional(), taskId: id.optional(), destination: destination.optional() });
const actionIdentity = { targetId: id, atSimTime: seconds };
export const OperationalActionIntentSchema = object({ ...actionIdentity, action: ActionSchema.exclude(['move_crew']), args: actionArgs });
export const ActionIntentSchema = z.discriminatedUnion('action', [
  OperationalActionIntentSchema,
  object({ ...actionIdentity, action: z.literal('move_crew'), args: actionArgs.extend({ destination }) }),
]);
export const ActionRequestSchema = object({ schemaVersion: version, runId: id, requestId: id, actorId: id, intent: ActionIntentSchema, expectedEntityVersions: z.record(id, number.int().nonnegative()), idempotencyKey: id });
export const CommandReceiptSchema = object({ schemaVersion: version, runId: id, requestId: id, actorId: id, status: z.enum(['queued', 'accepted', 'rejected', 'applied']), reason: id, taskId: id.nullable(), eta: seconds.nullable(), evidenceIds: z.array(id), observedAt: seconds });
export const TaskSchema = object({ id, actorId: id, targetId: id, action: ActionSchema, status: z.enum(['queued', 'traveling', 'inspecting', 'working', 'blocked', 'completed', 'canceled']), startedAt: seconds, arrivalAt: seconds, completesAt: seconds, progress: number.min(0).max(1), path: z.array(PointSchema), reason: z.string().nullable() });
export const PublicMessageSchema = object({ id, at: seconds, speaker: id, text: z.string().max(3000), evidenceIds: z.array(id), mode: z.enum(['live', 'scripted', 'recorded', 'system']), conversationActorId: id.optional(), conversationKind: z.enum(['player', 'order', 'system', 'live', 'fallback', 'report']).optional() });
export const AffordanceSchema = object({ action: ActionSchema, targetId: id, enabled: z.boolean(), reason: z.string().nullable(), technicianIds: z.array(id), travelSeconds: seconds.nullable(), workSeconds: seconds });
export const KnowledgeViewSchema = object({
  schemaVersion: version, runId: id, actorId: id, simTime: seconds, viewHash: id, knownTopology: TopologySchema, observations: z.array(ObservationSchema), tasks: z.array(TaskSchema), crew: z.array(CrewSchema), messages: z.array(PublicMessageSchema), allowedProcedureIds: z.array(id), observedEntityVersions: z.record(id, number.int().nonnegative()), affordances: z.array(AffordanceSchema),
  objectives: z.array(object({ id, label: z.string(), state: z.enum(['pending', 'in_progress', 'awaiting_verification', 'complete', 'failed']) })),
  summary: object({ criticalServedFraction: number.min(0).max(1).nullable(), interactiveServedFraction: number.min(0).max(1).nullable(), batchBacklog: number.nonnegative().nullable(), itPowerKw: number.nonnegative().nullable(), sourceHeadroomKw: number.nullable(), hottestTemperatureC: number.nullable(), observedAt: seconds }),
  mission: object({ status: z.enum(['briefing', 'active', 'success', 'failure', 'practice']), reason: z.string().nullable(), stabilitySeconds: seconds.nullable(), windowSeconds: seconds }),
});
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([z.string(), number, z.boolean(), z.null(), z.array(JsonValueSchema), z.record(z.string(), JsonValueSchema)]));
export const CheckpointSchema = object({ schemaVersion: version, engineVersion: id, scenarioVersion: id, runId: id, simTime: seconds, state: z.record(z.string(), JsonValueSchema) });
export const SimEventSchema = object({ id, simTime: seconds, sequence: number.int().nonnegative(), type: id, entityIds: z.array(id), causalParents: z.array(id), visibility: z.enum(['public', 'actor', 'forensic']), actorIds: z.array(id), payload: z.record(z.string(), JsonValueSchema) });
export const TelemetrySchema = object({ simTime: seconds, hottestTemperatureC: number, criticalServedFraction: number.min(0).max(1), batchBacklog: number.nonnegative() });
export const RecordedCommandSchema = object({ at: seconds, sequence: number.int().nonnegative(), intent: ActionIntentSchema, actorId: id, receipt: CommandReceiptSchema });
export const FactSelectorSchema = z.union([
  object({ observationId: id, field: z.enum(['value', 'source', 'observedAt', 'receivedAt', 'units', 'assetId']) }),
  object({ ledgerRunId: id, field: z.enum(['horizon', 'criticalDemand', 'criticalDelivered', 'interactiveDemand', 'interactiveDelivered', 'batchArrivals', 'batchCompleted', 'batchBacklog', 'batchDelayUnitSeconds', 'peakTemperatureC']) }),
]);
export const AgentResponseSchema = object({ runId: id, requestId: id, actorId: id, speaker: id, mode: z.enum(['live', 'scripted', 'recorded']), facts: z.array(FactSelectorSchema).max(12), inference: z.string().max(1200), uncertainty: z.string().max(600), proposals: z.array(ActionIntentSchema).max(3), requestKind: z.enum(['question', 'order', 'unclear']).optional() });
export const ToolIntentSchema = object({ runId: id, requestId: id, actorId: id, interactionId: id, callId: id, tool: z.enum(['inspect_asset', 'read_observations', 'read_procedure', 'propose_action']), targetId: id, action: ActionIntentSchema.nullable() });
export const PublicToolResultSchema = object({ runId: id, requestId: id, actorId: id, interactionId: id, callId: id, status: z.enum(['accepted', 'rejected', 'completed']), reason: id, receipt: CommandReceiptSchema.nullable(), observations: z.array(ObservationSchema), procedureText: z.string().max(4000).nullable() });
const gatewayIdentity = { runId: id, requestId: id, actorId: id };
export const GatewayResponseSchema = z.discriminatedUnion('kind', [
  object({ kind: z.literal('tool_request'), ...gatewayIdentity, interactionId: id, intent: ToolIntentSchema }),
  object({ kind: z.literal('final'), ...gatewayIdentity, response: AgentResponseSchema }),
  object({ kind: z.literal('fallback'), ...gatewayIdentity, mode: z.literal('scripted'), reason: id, message: z.string().max(2000), facts: z.array(FactSelectorSchema) }),
]);
export const OutcomeLedgerSchema = object({ schemaVersion: version, runId: id, engineVersion: id, scenarioId: id, horizon: seconds, criticalDemand: number.nonnegative(), criticalDelivered: number.nonnegative(), interactiveDemand: number.nonnegative(), interactiveDelivered: number.nonnegative(), batchArrivals: number.nonnegative(), batchCompleted: number.nonnegative(), batchBacklog: number.nonnegative(), batchDelayUnitSeconds: number.nonnegative(), peakTemperatureC: number, protectionEvents: z.array(SimEventSchema), timeline: z.array(SimEventSchema), telemetry: z.array(TelemetrySchema) });
export const RunRecordSchema = object({ schemaVersion: version, engineVersion: id, runId: id, scenario: ScenarioSpecSchema, initialCheckpoint: CheckpointSchema, finalCheckpoint: CheckpointSchema, commands: z.array(RecordedCommandSchema), events: z.array(SimEventSchema), observations: z.array(ObservationSchema), dialogue: z.array(PublicMessageSchema), telemetry: z.array(TelemetrySchema), provenance: object({ model: z.string().nullable(), promptVersion: id, procedureVersion: id }) });
const comparisonIdentity = { baseRunId: id, branchRunId: id, continuationPolicy: z.string(), externalScheduleIdentity: id, supportedHorizon: seconds, baseline: OutcomeLedgerSchema, explanation: z.string() };
export const ComparisonResultSchema = z.discriminatedUnion('status', [
  object({ status: z.literal('complete'), ...comparisonIdentity, alternative: OutcomeLedgerSchema }),
  object({ status: z.literal('unsupported'), ...comparisonIdentity, firstInvalidAction: RecordedCommandSchema, reason: z.string(), validPrefix: object({ baseline: OutcomeLedgerSchema, alternative: OutcomeLedgerSchema }) }),
]).superRefine((result, context) => {
  const ledgers = result.status === 'complete' ? [result.baseline, result.alternative] : [result.validPrefix.baseline, result.validPrefix.alternative];
  if (ledgers.some(ledger => ledger.horizon !== result.supportedHorizon)) context.addIssue({ code: 'custom', message: 'Comparison evidence must use the supported equal horizon.' });
});

export const GatewayStartSchema = object({ kind: z.literal('start'), ...gatewayIdentity, role: RoleSchema, message: z.string().max(1600), view: KnowledgeViewSchema, procedures: z.array(object({ id, text: z.string().max(3000) })).max(4), promptVersion: id, interactionMode: z.enum(['advisory', 'conversation']).optional(), debriefContext: object({ ledger: OutcomeLedgerSchema, comparison: ComparisonResultSchema.nullable() }).optional() });
export const GatewayContinueSchema = object({ kind: z.literal('continue'), ...gatewayIdentity, interactionId: id, expectedCallId: id, view: KnowledgeViewSchema, result: PublicToolResultSchema });
export const GatewayInputSchema = z.discriminatedUnion('kind', [GatewayStartSchema, GatewayContinueSchema]);

export const ProviderCallSchema = object({
  receiptId: id, provider: z.literal('openai'), responseId: id.nullable(),
  ...gatewayIdentity, model: id, inputTokens: number.int().nonnegative().nullable(), outputTokens: number.int().nonnegative().nullable(),
  durationMs: number.int().nonnegative(), status: z.string().max(30),
});
export const RecordedInteractionSchema = object({
  turns: z.array(object({ atSimTime: seconds.int(), input: GatewayInputSchema, reply: GatewayResponseSchema.nullable(), call: ProviderCallSchema.nullable(), toolResult: PublicToolResultSchema.nullable() })).min(1).max(3),
  end: object({ atSimTime: seconds.int(), reason: z.enum(['final', 'fallback', 'canceled', 'reset', 'interrupted']), reply: z.union([GatewayResponseSchema.options[1], GatewayResponseSchema.options[2]]).nullable(), durationMs: number.int().nonnegative() }),
});
// Host provenance is versioned separately from deterministic engine/checkpoint history.
export const SavedRunRecordSchema = RunRecordSchema.extend({ schemaVersion: z.literal(2), lineage: z.array(object({ runId: id, throughSimTime: seconds.int() })), interactions: z.array(RecordedInteractionSchema) });

export const jsonSchemas = {
  action: z.toJSONSchema(ActionIntentSchema), agentResponse: z.toJSONSchema(AgentResponseSchema),
  knowledgeView: z.toJSONSchema(KnowledgeViewSchema), gateway: z.toJSONSchema(GatewayInputSchema),
};
