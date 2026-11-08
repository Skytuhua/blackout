import type { z } from 'zod';
import type * as s from './schemas';
import type { ReactNode } from 'react';
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

export type DesktopPanel = 'equipment' | 'command' | 'radio' | 'objectives' | 'replay' | 'help' | null;
export type TutorialEvent = 'commander_moved' | 'equipment_opened' | 'crew_selected' | 'timestamp_read';
export interface DesktopRadioExchange {
  start: GatewayStart;
  view: KnowledgeView;
  targetId: string | null;
  reply: GatewayResponse;
  tools: PublicToolResult[];
  intents: ToolIntent[];
  calls: ProviderCall[];
  durationMs: number;
}
export interface DesktopGameProps {
  view: KnowledgeView;
  session: 'welcome' | 'practice' | 'mission';
  selectedAssetId: string | null;
  selectedCrewId: string | null;
  panel: DesktopPanel;
  paused: boolean;
  speed: 1 | 2 | 4;
  busy: boolean;
  radioBusy: boolean;
  notice: string;
  error: string;
  coach: { step: number; total: number; title: string; text: string; target: string | null } | null;
  exchange: DesktopRadioExchange | null;
  replayContent?: ReactNode;
  onSelectAsset: (id: string) => void;
  onSelectCrew: (id: string | null) => void;
  onPanelChange: (panel: DesktopPanel) => void;
  onAction: (intent: ActionIntent) => void;
  onAskCoworker: (actorId: string, message: string) => void;
  onCancelCoworker: () => void;
  onPause: () => void;
  onSpeed: (speed: 1 | 2 | 4) => void;
  onRetry: () => void;
  onStartPractice: () => void;
  onStartMission: () => void;
  onTutorialEvent: (event: TutorialEvent) => void;
}

/** Host-only authorization snapshot; never infer authorization from the open tab. */
export interface ProposalAuthorization {
  id: string;
  runId: string;
  actorId: string;
  requestId: string;
  intent: ActionIntent;
  expectedEntityVersions: Record<string, number>;
}
export interface ConversationProposal {
  id: string;
  label: string;
  assignedName: string;
  status: 'ready' | 'sending' | 'accepted' | 'rejected';
  reason?: string;
}
export interface ConversationEntry {
  id: string;
  actorId: string;
  at: number;
  kind: 'player' | 'order' | 'system' | 'live' | 'fallback' | 'report';
  text: string;
  summary?: string;
  unread: boolean;
  reportId?: string;
  exchangeId?: string;
  sections?: { id: string; label: string; text: string }[];
  proposals?: ConversationProposal[];
}
export interface SuggestedOrder {
  id: string;
  actorId: string;
  label: string;
  enabled: boolean;
  reason?: string;
}
export interface ConversationThread {
  actorId: string;
  name: string;
  role: 'Cooling' | 'Power' | 'IT';
  assignment: { taskId: string | null; label: string; status: 'ready' | 'walking' | 'checking' | 'working' | 'report_pending' | 'delivered' };
  entries: ConversationEntry[];
  draft: string;
  busy: boolean;
  unread: number;
  suggestedOrders: SuggestedOrder[];
}
export interface ConversationGameProps {
  view: KnowledgeView;
  session: 'welcome' | 'practice' | 'mission';
  selectedActorId: string;
  selectedAssetId: string | null;
  conversations: ConversationThread[];
  paused: boolean;
  speed: 1 | 2 | 4;
  busy: boolean;
  objective: string;
  alerts: { id: string; level: 'warning' | 'info'; text: string }[];
  guidance: { enabled: boolean; paused: boolean; text: string; canContinue: boolean; targetActorId?: string; targetOrderId?: string } | null;
  reader: { actorId: string; entryId: string } | null;
  menuOpen: boolean;
  menuContent?: ReactNode;
  onSelectActor: (actorId: string) => void;
  onSelectAsset: (assetId: string) => void;
  onDraftChange: (actorId: string, draft: string) => void;
  onSend: (actorId: string) => void;
  onReadEntries: (actorId: string, entryIds: string[]) => void;
  onOpenEntry: (actorId: string, entryId: string) => void;
  onCloseEntry: () => void;
  onExecuteProposal: (proposalId: string) => void;
  onSuggestedOrder: (orderId: string) => void;
  onStopTask: (actorId: string, taskId: string) => void;
  onWait: (actorId: string) => void;
  onPause: () => void;
  onSpeed: (speed: 1 | 2 | 4) => void;
  onContinueGuide: () => void;
  onSetGuidance: (enabled: boolean) => void;
  onMenuToggle: () => void;
  onStartGuided: () => void;
  onStartPractice: () => void;
}
