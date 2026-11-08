import type { z } from 'zod';
import type * as s from './schemas';
export type Point = z.infer<typeof s.PointSchema>;
export type Asset = z.infer<typeof s.AssetSchema>;
export type Crew = z.infer<typeof s.CrewSchema>;
export type Role = z.infer<typeof s.RoleSchema>;
export type Action = z.infer<typeof s.ActionSchema>;
export type ScenarioSpec = z.infer<typeof s.ScenarioSpecSchema>;
export type Observation = z.infer<typeof s.ObservationSchema>;
export type ActionIntent = z.infer<typeof s.ActionIntentSchema>;
export type ActionRequest = z.infer<typeof s.ActionRequestSchema>;
export type CommandReceipt = z.infer<typeof s.CommandReceiptSchema>;
export type PublicTask = z.infer<typeof s.TaskSchema>;
export type KnowledgeView = z.infer<typeof s.KnowledgeViewSchema>;
export type Checkpoint = z.infer<typeof s.CheckpointSchema>;
export type SimEvent = z.infer<typeof s.SimEventSchema>;
export type RunRecord = z.infer<typeof s.RunRecordSchema>;
export type SavedRunRecord = z.infer<typeof s.SavedRunRecordSchema>;
export type RecordedInteraction = z.infer<typeof s.RecordedInteractionSchema>;
export type ProviderCall = z.infer<typeof s.ProviderCallSchema>;
export type RecordedCommand = z.infer<typeof s.RecordedCommandSchema>;
export type OutcomeLedger = z.infer<typeof s.OutcomeLedgerSchema>;
export type ComparisonResult = z.infer<typeof s.ComparisonResultSchema>;
export type AgentResponse = z.infer<typeof s.AgentResponseSchema>;
export type ToolIntent = z.infer<typeof s.ToolIntentSchema>;
export type PublicToolResult = z.infer<typeof s.PublicToolResultSchema>;
export type GatewayStart = z.infer<typeof s.GatewayStartSchema>;
export type GatewayContinue = z.infer<typeof s.GatewayContinueSchema>;
export type GatewayInput = z.infer<typeof s.GatewayInputSchema>;
export type GatewayResponse = z.infer<typeof s.GatewayResponseSchema>;
export type PublicMessage = z.infer<typeof s.PublicMessageSchema>;
export type Telemetry = z.infer<typeof s.TelemetrySchema>;
export type FactSelector = z.infer<typeof s.FactSelectorSchema>;
export type StepResult = { runId: string; simTime: number; events: SimEvent[] };
export interface SimulationEngine {
  step(ticks: number): StepResult;
  applyCommand(request: ActionRequest): CommandReceipt;
  observe(actorId: string): KnowledgeView;
  snapshot(): Checkpoint;
  exportRecord(): RunRecord;
}
export interface OperationalViewProps {
  view: KnowledgeView;
  onAction: (intent: ActionIntent) => void;
  onInspect: (assetId: string) => void;
  onAskCoworker: (actorId: string, message: string) => void;
}
