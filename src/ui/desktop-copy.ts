import type { DesktopRadioExchange, FactSelector, KnowledgeView, Observation } from '../shared/contracts';
import { formatObservationFact, readingStatus } from './presentation';

export const timeLabel = (seconds: number) => `T+${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
export const words = (value: string) => value.replaceAll('_', ' ');
export function observationText(observation: Observation, now: number): string {
  return `${words(observation.field)}: ${observation.value === null ? 'Unknown' : String(observation.value)} ${observation.units}\n${readingStatus(observation, now).toUpperCase()} · ${words(observation.quality)}\nObserved ${timeLabel(observation.observedAt)}\nReceived ${timeLabel(observation.receivedAt)}\nSource: ${observation.source}\nEvidence: ${observation.id}\nAsset: ${observation.assetId}`;
}
function factText(fact: FactSelector, exchange: DesktopRadioExchange): string {
  if ('observationId' in fact) {
    const observation = exchange.view.observations.find(o => o.id === fact.observationId);
    return observation ? formatObservationFact(observation, fact.field) : `Unavailable citation: ${fact.observationId}`;
  }
  const ledger = exchange.start.debriefContext?.ledger;
  return ledger?.runId === fact.ledgerRunId ? `${fact.field}: ${ledger[fact.field]} (recorded ledger ${ledger.runId})` : `Unavailable ledger citation: ${fact.ledgerRunId} · ${fact.field}`;
}
export function radioReport(exchange: DesktopRadioExchange | null): string {
  if (!exchange) return 'No coworker reply yet. Ask a question using the Message tab. Delivered field reports also appear in the Log tab.';
  const reply = exchange.reply;
  if (reply.kind === 'tool_request') return `TOOL REQUEST\n${words(reply.intent.tool)} · ${reply.intent.targetId}\nThis is a request, not a completed inspection or repair.`;
  const facts = reply.kind === 'final' ? reply.response.facts : reply.facts;
  const factBlock = `FACTS\n${facts.length ? facts.map(f => factText(f, exchange)).join('\n\n') : 'No factual citations supplied.'}`;
  if (reply.kind === 'fallback') return `SCRIPTED FALLBACK · ${words(reply.reason)}\n${reply.message}\n\n${factBlock}`;
  return `${reply.response.speaker} · ${reply.response.mode.toUpperCase()}\n\n${factBlock}\n\nINFERENCE\n${reply.response.inference || 'None supplied.'}\n\nUNCERTAINTY\n${reply.response.uncertainty || 'None supplied.'}`;
}
export function radioCitations(exchange: DesktopRadioExchange | null): string {
  if (!exchange) return 'No exchange citations.';
  const reply = exchange.reply, facts = reply.kind === 'final' ? reply.response.facts : reply.kind === 'fallback' ? reply.facts : [];
  return facts.map((fact, i) => {
    const observation = 'observationId' in fact ? exchange.view.observations.find(o => o.id === fact.observationId) : null;
    return `CITATION ${i + 1}\n${factText(fact, exchange)}${observation ? `\n\n${observationText(observation, exchange.view.simTime)}` : ''}`;
  }).join('\n\n') || 'The reply contains no factual citations.';
}
export function radioReceipts(exchange: DesktopRadioExchange | null): string {
  return exchange?.tools.map(tool => `TOOL ${tool.callId}\n${tool.status.toUpperCase()} · ${tool.reason}\n${tool.receipt ? `COMMAND ${tool.receipt.requestId}\n${tool.receipt.status.toUpperCase()} · ${tool.receipt.reason}\nTask: ${tool.receipt.taskId ?? 'none'}\nETA: ${tool.receipt.eta === null ? 'not supplied' : timeLabel(tool.receipt.eta)}\nEvidence: ${tool.receipt.evidenceIds.join(', ') || 'none'}\nObserved ${timeLabel(tool.receipt.observedAt)}` : 'No command receipt.'}\n${tool.procedureText ?? ''}\n${tool.observations.map(o => observationText(o, exchange.view.simTime)).join('\n\n')}`).join('\n\n') || 'No tool or command receipts in this exchange. A queued receipt does not mean work is complete.';
}
export function radioProvenance(exchange: DesktopRadioExchange | null): string {
  if (!exchange) return 'No interaction provenance yet.';
  return `Run: ${exchange.start.runId}\nRequest: ${exchange.start.requestId}\nActor: ${exchange.start.actorId}\nTarget: ${exchange.targetId ?? 'none'}\nPrompt: ${exchange.start.promptVersion}\nExchange view: ${exchange.view.viewHash}\nScoped time: ${timeLabel(exchange.view.simTime)}\nRound trip: ${exchange.durationMs} ms\n\nQUESTION\n${exchange.start.message}\n\nPROCEDURES\n${exchange.start.procedures.map(p => `${p.id}\n${p.text}`).join('\n\n') || 'None supplied.'}\n\nPROVIDER CALLS\n${exchange.calls.map(call => `${call.provider} · ${call.model}\nStatus: ${call.status}\nReceipt: ${call.receiptId}\nResponse: ${call.responseId ?? 'not supplied'}\nInput tokens: ${call.inputTokens ?? 'not reported'}\nOutput tokens: ${call.outputTokens ?? 'not reported'}\nDuration: ${call.durationMs} ms`).join('\n\n') || 'No provider call receipt. This does not imply a live model was used.'}`;
}
/** Preserve object identity, original atSimTime and original arguments for the host. */
export function proposalForConfirmation(exchange: DesktopRadioExchange | null, index: number, runId: string) {
  if (!exchange || exchange.start.runId !== runId || exchange.reply.runId !== runId || exchange.reply.kind !== 'final') return null;
  return exchange.reply.response.proposals[index] ?? null;
}
export function missionText(view: KnowledgeView): string {
  const s = view.summary, age = view.simTime - s.observedAt;
  return `MISSION ${words(view.mission.status).toUpperCase()}\n${view.mission.reason ?? 'Protect critical service and verify recovery using permitted evidence.'}\n\nOBJECTIVES\n${view.objectives.map(o => `${words(o.state).toUpperCase()} · ${o.label}`).join('\n\n')}\n\nSITE READINGS\n${age < 0 ? 'UNKNOWN: sample is ahead of the public clock.' : age > 10 ? `STALE · ${age} seconds old` : 'RECENT sample'} · ${timeLabel(s.observedAt)}\nCritical service: ${s.criticalServedFraction === null ? 'unknown' : `${s.criticalServedFraction * 100}%`}\nInteractive service: ${s.interactiveServedFraction === null ? 'unknown' : `${s.interactiveServedFraction * 100}%`}\nHottest observed inlet: ${s.hottestTemperatureC ?? 'unknown'} °C\nIT power: ${s.itPowerKw ?? 'unknown'} kW\nSource headroom: ${s.sourceHeadroomKw ?? 'unknown'} kW\nBatch backlog: ${s.batchBacklog ?? 'unknown'} work units\n${view.mission.status === 'practice' ? 'Practice has no incident deadline.' : `Incident window: ${view.mission.windowSeconds} seconds`}\n\nRUN\n${view.runId}`;
}
