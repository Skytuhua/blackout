import type { DesktopRadioExchange, KnowledgeView } from '../shared/contracts';
import { alarmFixture } from '../shared/fixtures';
import { hotRestart } from '../content/scenarios/hot-restart';

export function desktopFixtureView(): KnowledgeView {
  return { ...alarmFixture, knownTopology: hotRestart.topology, crew: hotRestart.crew,
    observations: [...alarmFixture.observations, ...hotRestart.topology.assets.filter(a => a.kind === 'rack').map(a => ({ ...alarmFixture.observations[1], id: `fixture-power-${a.id}`, assetId: a.id, field: 'power_state', value: 'online' })), { ...alarmFixture.observations[1], id: 'fixture-running-cooling-2', assetId: 'cooling-2', field: 'running', value: false }],
    affordances: [...alarmFixture.affordances, ...(['pause_batch', 'resume_batch', 'set_batch_ceiling', 'verify_recovery'] as const).map(action => ({ action, targetId: 'site', enabled: true, reason: null, technicianIds: [], travelSeconds: 0, workSeconds: 3 })), ...hotRestart.crew.filter(c => c.role !== 'remote').map(c => ({ action: 'move_crew' as const, targetId: c.id, enabled: true, reason: null, technicianIds: [], travelSeconds: null, workSeconds: 0 }))],
  };
}
export function desktopFixtureExchange(view: KnowledgeView): DesktopRadioExchange {
  const long = 'This is a deliberately long offline fixture record. Evidence, inference and uncertainty remain separate. '.repeat(10);
  const id = `fixture-${'x'.repeat(110)}`;
  return {
    start: { kind: 'start', runId: view.runId, requestId: id, actorId: 'alex', role: 'facilities', message: 'What does this permitted report establish?', view, procedures: [{ id: 'hot-restart-v1', text: 'Fictional fixture procedure. '.repeat(90) }], promptVersion: 'offline-ui-fixture' },
    view, targetId: 'cooling-1', reply: { kind: 'final', runId: view.runId, requestId: id, actorId: 'alex', response: { runId: view.runId, requestId: id, actorId: 'alex', speaker: 'Alex', mode: 'scripted', facts: [{ observationId: view.observations[1].id, field: 'value' }, { observationId: view.observations[0].id, field: 'observedAt' }], inference: long, uncertainty: 'Not a real mission report. '.repeat(20), proposals: [{ action: 'inspect', targetId: 'cooling-1', atSimTime: 50, args: { technicianId: 'alex' } }] } },
    tools: [{ runId: view.runId, requestId: id, actorId: 'alex', interactionId: 'fixture-interaction', callId: 'fixture-call', status: 'accepted', reason: 'fixture-only', receipt: { schemaVersion: 1, runId: view.runId, requestId: id, actorId: 'alex', status: 'accepted', reason: 'fixture-only', taskId: null, eta: 110, evidenceIds: [], observedAt: 75 }, observations: [view.observations[0]], procedureText: long.repeat(3) }],
    intents: [], calls: [{ receiptId: id, provider: 'openai', responseId: null, runId: view.runId, requestId: id, actorId: 'alex', model: 'offline-fixture-no-request', inputTokens: null, outputTokens: null, durationMs: 0, status: 'not-called' }], durationMs: 0,
  };
}
