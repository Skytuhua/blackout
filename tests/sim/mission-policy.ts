import type { Action, ActionRequest, KnowledgeView, SimulationEngine } from '../../src/shared/contracts';

let requestCounter = 0;
export function request(engine: SimulationEngine, action: Action, targetId: string, args: ActionRequest['intent']['args'] = {}, actorId = 'player', key?: string): ActionRequest {
  const view = engine.observe(actorId);
  const id = key ?? `request-${requestCounter++}`;
  return { schemaVersion: 1, runId: view.runId, requestId: id, actorId, idempotencyKey: id, expectedEntityVersions: view.observedEntityVersions, intent: { action, targetId, atSimTime: view.simTime, args } };
}

export function latest(view: KnowledgeView, assetId: string, field: string) {
  return view.observations.filter(o => o.assetId === assetId && o.field === field).at(-1);
}

// Decisions consume only the public view and its published eligible worker/ETA.
export function successfulPolicy(engine: SimulationEngine, limit = 600) {
  const trace: { at: number; action: Action; status: string; reason: string; eta: number | null }[] = [];
  for (let t = 0; t < limit; t++) {
    const view = engine.observe('player');
    if (view.mission.status === 'success' || view.mission.status === 'failure') break;
    const stopped = latest(view, 'cooling-1', 'running')?.value === false;
    const inspected = view.observations.some(o => o.field === 'prerequisite_ready' && o.assetId === 'controller');
    const repaired = view.tasks.some(task => task.action === 'repair_cooling' && task.status === 'completed');
    const paused = latest(view, 'rack-1', 'batch_ceiling')?.value === 0;
    const running = ['cooling-1', 'cooling-2'].every(id => latest(view, id, 'running')?.value === true);
    const readings = view.knownTopology.assets.filter(a => a.kind === 'rack').map(a => latest(view, a.id, 'inlet_temperature_c'));
    const cool = readings.every(o => o && typeof o.value === 'number' && o.value < 26 && view.simTime - o.observedAt <= 10);
    const independent = view.observations.some(o => o.quality === 'independent');
    const dispatched = (action: Action, targetId: string) => view.tasks.some(task => task.action === action && task.targetId === targetId && task.status !== 'canceled');
    const actions: [Action, string, boolean, ActionRequest['intent']['args']?][] = [
      ['pause_batch', 'site', stopped && !paused && !repaired && !dispatched('pause_batch', 'site')],
      ['inspect', 'controller', stopped && !inspected && !dispatched('inspect', 'controller')],
      ['repair_cooling', 'controller', inspected && !repaired && !dispatched('repair_cooling', 'controller')],
      ['independent_reading', 'rack-1', repaired && !independent && !dispatched('independent_reading', 'rack-1')],
      ['set_batch_ceiling', 'site', paused && running && cool && !dispatched('set_batch_ceiling', 'site'), { ceiling: 30 }],
      ['verify_recovery', 'site', (view.mission.stabilitySeconds ?? 0) >= 60 && !dispatched('verify_recovery', 'site')],
    ];
    for (const [action, target, wanted, extra] of actions) {
      if (!wanted) continue;
      const current = engine.observe('player');
      const affordance = current.affordances.find(a => a.action === action && a.targetId === target && a.enabled);
      if (!affordance) continue;
      const args = { ...extra, ...(affordance.technicianIds.length ? { technicianId: affordance.technicianIds[0] } : {}) };
      const receipt = engine.applyCommand(request(engine, action, target, args));
      trace.push({ at: view.simTime, action, status: receipt.status, reason: receipt.reason, eta: receipt.eta });
    }
    engine.step(1);
  }
  return trace;
}
