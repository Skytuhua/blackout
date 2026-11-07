import { describe, expect, it } from 'vitest';
import type { ActionRequest, Checkpoint, ScenarioSpec, SimulationEngine } from '../../src/shared/contracts';
import { CheckpointSchema, KnowledgeViewSchema, RunRecordSchema } from '../../src/shared/schemas';
import { hotRestart } from '../../src/content/scenarios/hot-restart';
import { initialize, restore } from '../../src/sim/engine';
import type { PhysicalState } from '../../src/sim/state';

const healthy = (): ScenarioSpec => ({ ...structuredClone(hotRestart), externalEvents: [] });
const physical = (engine: SimulationEngine) => engine.snapshot().state.physical as unknown as PhysicalState;
function configured(spec: ScenarioSpec, edit: (p: PhysicalState) => void) {
  const checkpoint = initialize(spec, 'run-a').snapshot();
  const p = checkpoint.state.physical as unknown as PhysicalState;
  edit(p);
  return restore(checkpoint, 'run-a');
}
const command = (runId = 'run-a'): ActionRequest => ({ schemaVersion: 1, runId, requestId: 'request-1', actorId: 'player', idempotencyKey: 'once', expectedEntityVersions: {}, intent: { action: 'repair_cooling', targetId: 'cooling-1', atSimTime: 0, args: {} } });

describe('frozen simulation engine physical slice', () => {
  it('starts balanced from real content and advances the same one-second steps in every batch', () => {
    const full = initialize(healthy(), 'run-a');
    expect(physical(full).racks).toHaveLength(8);
    expect(physical(full).racks.every(r => r.temperatureC === 24 && r.powerKw === 8)).toBe(true);
    expect(full.step(600).simTime).toBe(600);
    expect(physical(full).racks.every(r => Math.abs(r.temperatureC - 24) < 1e-10)).toBe(true);
    expect(physical(full).lastInterval.sourceUsedKw).toBeCloseTo(64 / 0.95 + 64 / 3 + 4, 10);
    const separate = initialize(healthy(), 'run-a');
    for (let i = 0; i < 600; i++) separate.step(1);
    expect(separate.snapshot()).toEqual(full.snapshot());
    expect(physical(full).totals.batchCompleted).toBe(144000);
  });

  it('applies external time/phase/input-sequence ordering before interval physics', () => {
    const spec = healthy();
    spec.externalEvents = [
      { id: 'pulse', kind: 'workload_pulse_start', at: 0, value: 10 },
      { id: 'lost', kind: 'utility_loss', at: 0, value: null },
      { id: 'returned', kind: 'utility_restore', at: 0, value: null },
      { id: 'fault', kind: 'cooling_control_fault', at: 0, value: null },
    ];
    const engine = initialize(spec, 'run-a');
    const result = engine.step(1);
    expect(result.events.filter(e => e.type.startsWith('external.')).map(e => e.payload.externalId)).toEqual(['lost', 'returned', 'fault', 'pulse']);
    expect(physical(engine).racks[0].temperatureC).toBeCloseTo(24.045, 10);
    expect(physical(engine).ups.every(u => u.energyKwh === 5)).toBe(true);
  });

  it('does not grant a full powered second at partial-tick depletion, then recomputes the other feed', () => {
    const spec = healthy();
    spec.externalEvents = [{ id: 'loss', at: 0, kind: 'utility_loss', value: null }];
    const engine = configured(spec, p => {
      p.ups[0].energyKwh = 32 * 0.25 / (0.95 * 3600);
      p.ups[1].energyKwh = (32 * 0.25 + 64 * 0.25) / (0.95 * 3600);
    });
    engine.step(1);
    const p = physical(engine);
    expect(p.ups.map(u => u.energyKwh)).toEqual([0, 0]);
    expect(p.totals.itEnergyKwh).toBeCloseTo(32 / 3600, 12);
    expect(p.totals.criticalDelivered).toBeCloseTo(80, 10);
    expect(p.totals.criticalDemand).toBe(160);
    expect(p.totals.batchArrivals - p.totals.batchCompleted).toBeCloseTo(120, 9);
    expect(p.racks[0].temperatureC).toBeCloseTo(24.02, 10);
    expect(p.racks.every(r => r.mode === 'off')).toBe(true);
  });

  it('delivers only 534.375 seconds of baseline work from the two 5kWh batteries', () => {
    const spec = healthy();
    spec.externalEvents = [{ id: 'loss', at: 0, kind: 'utility_loss', value: null }];
    spec.profile.throttleC = 100;
    spec.profile.tripC = 200;
    const engine = initialize(spec, 'run-a');
    engine.step(535);
    expect(physical(engine).totals.criticalDelivered / 160).toBeCloseTo(534.375, 8);
    expect(physical(engine).ups.every(u => u.energyKwh === 0)).toBe(true);
    expect(physical(engine).totals.itEnergyKwh).toBeCloseTo(9.5, 10);
  });

  it('honors generator transfer, allocates IT before cooling, and charging last', () => {
    const spec = healthy();
    spec.profile.generatorKw = 80;
    spec.externalEvents = [
      { id: 'loss', at: 0, kind: 'utility_loss', value: null },
      { id: 'generator', at: 0, kind: 'generator_ready', value: null },
      { id: 'transfer', at: 1, kind: 'transfer_complete', value: null },
    ];
    const engine = initialize(spec, 'run-a');
    engine.step(1);
    expect(physical(engine).lastInterval.sourceUsedKw).toBe(0);
    engine.step(31);
    const p = physical(engine);
    expect(p.lastInterval.sourceUsedKw).toBeLessThanOrEqual(80 + 1e-10);
    expect(p.lastInterval.itInputKw).toBeCloseTo(64 / 0.95, 10);
    expect(p.lastInterval.coolingThermalKw).toBeCloseTo((80 - 64 / 0.95 - 4) * 3, 9);
    expect(p.lastInterval.chargeInputKw).toBeCloseTo(0, 9);
    expect(p.lastInterval.coolingElectricKw).toBeCloseTo(80 - 64 / 0.95, 9);
  });

  it('restores healthy cooling only after its restart delay without removing stored heat instantly', () => {
    const spec = healthy();
    spec.externalEvents = [{ id: 'loss', at: 0, kind: 'utility_loss', value: null }, { id: 'return', at: 5, kind: 'utility_restore', value: null }];
    const engine = initialize(spec, 'run-a');
    engine.step(35);
    expect(physical(engine).racks[0].temperatureC).toBeCloseTo(25.4, 8);
    engine.step(1);
    expect(physical(engine).racks[0].temperatureC).toBeCloseTo(25.386, 8);
    const fault = initialize(hotRestart, 'run-a');
    fault.step(80);
    expect(physical(fault).controllerFault).toBe(true);
    expect(physical(fault).lastInterval.coolingThermalKw).toBe(0);
  });

  it('applies thermal protection at the interval end and stops useful work during boot', () => {
    const engine = configured(healthy(), p => {
      p.racks[0].temperatureC = 40;
      p.racks[0].tripSeconds = 9;
      p.controllerFault = true;
      p.racks[1].mode = 'booting';
      p.racks[1].bootRemainingSeconds = 2;
    });
    const result = engine.step(1);
    const p = physical(engine);
    expect(result.events.some(e => e.type === 'thermal_trip' && e.entityIds.includes('rack-1'))).toBe(true);
    expect(p.racks[0].mode).toBe('off');
    expect(p.racks[0].temperatureC).toBeCloseTo(40.04, 9);
    expect(p.racks[0].critical).toBe(0);
    expect(p.racks[1].critical).toBe(0);
    expect(p.racks[1].powerKw).toBe(4);
    engine.step(1);
    expect(physical(engine).racks[1].mode).toBe('ready');
  });

  it('round-trips complete finite checkpoints, retains event/timer state, and rejects stale envelopes', () => {
    const engine = initialize(hotRestart, 'run-a');
    engine.step(32);
    const checkpoint = CheckpointSchema.parse(JSON.parse(JSON.stringify(engine.snapshot())));
    const same = restore(checkpoint, 'run-a');
    engine.step(100);
    same.step(100);
    expect(same.snapshot()).toEqual(engine.snapshot());
    const fresh = restore(checkpoint, 'run-b');
    expect(fresh.applyCommand(command()).reason).toBe('STALE_RUN');
    expect(fresh.observe('player').runId).toBe('run-b');
    expect(RunRecordSchema.safeParse(fresh.exportRecord()).success).toBe(true);
  });

  it('publishes unknown observations rather than physical state, latent faults or future events', () => {
    const engine = initialize(hotRestart, 'run-a');
    engine.step(30);
    const view = KnowledgeViewSchema.parse(engine.observe('alex'));
    expect(view.observations).toEqual([]);
    expect(Object.values(view.summary).filter(value => value !== null)).toEqual([0]);
    expect(view.mission.status).toBe('briefing');
    expect(view.affordances.every(a => !a.enabled)).toBe(true);
    expect(JSON.stringify(view)).not.toMatch(/controllerFault|energyKwh|externalEvents|checkpoint|causalParents/);
    view.knownTopology.assets[0].id = 'changed';
    expect(engine.observe('alex').knownTopology.assets[0].id).toBe('rack-1');
  });

  it('explicitly rejects unavailable actions without accepting tasks, advancing time, or duplicating effects', () => {
    const engine = initialize(healthy(), 'run-a');
    const receipt = engine.applyCommand(command());
    expect(receipt.status).toBe('rejected');
    expect(receipt.reason).toBe('SIM01_ACTION_UNAVAILABLE');
    expect(receipt.taskId).toBeNull();
    expect(engine.step(0).simTime).toBe(0);
    expect(engine.observe('player').tasks).toEqual([]);
    const duplicate = engine.applyCommand({ ...command(), requestId: 'request-2' });
    expect(duplicate.requestId).toBe('request-2');
    expect(engine.exportRecord().commands).toHaveLength(1);
    expect(engine.exportRecord().commands[0].receipt.status).toBe('rejected');
  });

  it('rejects non-integer advancement, mismatched identities and invalid internal checkpoint values', () => {
    const engine = initialize(healthy(), 'run-a');
    for (const ticks of [-1, 0.5, Infinity, NaN]) expect(() => engine.step(ticks)).toThrow();
    const checkpoint = engine.snapshot();
    checkpoint.engineVersion = 'other-engine';
    expect(() => restore(checkpoint, 'run-a')).toThrow();
    const invalid = engine.snapshot();
    (invalid.state.physical as unknown as PhysicalState).ups[0].energyKwh = Infinity;
    expect(() => restore(invalid, 'run-a')).toThrow();
    const wrongTime: Checkpoint = { ...engine.snapshot(), simTime: -1 };
    expect(() => restore(wrongTime, 'run-a')).toThrow();
  });

  it('conserves cohosted paused batch work and reduces heat on every endangered rack', () => {
    const spec = healthy();
    spec.externalEvents = [{ id: 'fault', at: 0, kind: 'cooling_control_fault', value: null }];
    const engine = configured(spec, p => { for (const rack of p.racks) rack.batchCeiling = 0; });
    engine.step(75);
    const p = physical(engine);
    expect(p.racks.every(r => Math.abs(r.temperatureC - 25.875) < 1e-9)).toBe(true);
    expect(p.totals.criticalDelivered).toBe(p.totals.criticalDemand);
    expect(p.totals.batchArrivals).toBe(18000);
    expect(p.totals.batchCompleted).toBe(0);
    expect(p.racks.reduce((sum, r) => sum + r.backlog, 0)).toBe(18000);
    const resumedCheckpoint = engine.snapshot();
    for (const rack of (resumedCheckpoint.state.physical as unknown as PhysicalState).racks) rack.batchCeiling = 50;
    const resumed = restore(resumedCheckpoint, 'run-b');
    resumed.step(100);
    const resumedPhysical = physical(resumed);
    expect(resumedPhysical.lastInterval.itPowerKw).toBe(80);
    expect(resumedPhysical.racks.reduce((sum, r) => sum + r.backlog, 0)).toBe(2000);
    expect(resumedPhysical.totals.batchArrivals - resumedPhysical.totals.batchCompleted).toBe(2000);
  });

  it('limits one cooling train to 80kW while peak executed workload draws 96kW', () => {
    const spec = healthy();
    spec.topology.assets = spec.topology.assets.filter(a => a.id !== 'cooling-2').map(a => ({ ...a, dependencies: a.dependencies.filter(id => id !== 'cooling-2') }));
    spec.externalEvents = [{ id: 'peak', at: 0, kind: 'workload_pulse_start', value: 40 }];
    spec.profile.throttleC = 100;
    spec.profile.tripC = 200;
    const engine = initialize(spec, 'run-a');
    engine.step(300);
    const p = physical(engine);
    expect(p.lastInterval.itPowerKw).toBe(96);
    expect(p.lastInterval.coolingThermalKw).toBeCloseTo(80, 9);
    expect(p.racks[0].temperatureC).toBeGreaterThan(27);
    expect(p.totals.batchArrivals - p.totals.batchCompleted).toBe(0);
  });

  it('boots after a depleted source returns, with no useful work during the 20s boot', () => {
    const spec = healthy();
    spec.externalEvents = [{ id: 'loss', at: 0, kind: 'utility_loss', value: null }, { id: 'restore', at: 1, kind: 'utility_restore', value: null }];
    const engine = configured(spec, p => { for (const ups of p.ups) ups.energyKwh = 0; });
    engine.step(1);
    engine.step(20);
    expect(physical(engine).racks.every(r => r.mode === 'ready')).toBe(true);
    expect(physical(engine).totals.criticalDelivered).toBe(0);
    expect(physical(engine).lastInterval.itPowerKw).toBe(32);
    engine.step(1);
    expect(physical(engine).totals.criticalDelivered).toBe(160);
  });

  it('rejects checkpoint cursors or sequence counters that would skip or reorder the external record', () => {
    const engine = initialize(hotRestart, 'run-a');
    const skipped = engine.snapshot();
    skipped.state.eventCursor = 1;
    expect(() => restore(skipped, 'run-a')).toThrow();
    engine.step(20);
    const duplicate = engine.snapshot();
    duplicate.state.nextSequence = 0;
    expect(() => restore(duplicate, 'run-a')).toThrow();
  });

  it('permits a zero-heat, zero-conductance reference equilibrium without non-finite state', () => {
    const spec = healthy();
    spec.profile.conductanceKwK = 0;
    spec.profile.idleKw = 0;
    spec.workload = { critical: 0, interactive: 0, batch: 0, catchupCeiling: 0 };
    const engine = initialize(spec, 'run-a');
    engine.step(1);
    expect(physical(engine).racks.every(r => r.temperatureC === 20)).toBe(true);
    expect(CheckpointSchema.safeParse(engine.snapshot()).success).toBe(true);
  });
});
