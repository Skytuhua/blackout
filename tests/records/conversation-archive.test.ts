import { expect, it } from 'vitest';
import { HostArchive } from '../../src/persistence/host-archive';
import { initialize } from '../../src/sim/engine';
import { hotRestart } from '../../src/content/scenarios/hot-restart';
import type { GatewayStart, RecordedInteraction } from '../../src/shared/contracts';

it('saves concurrent character replies in original simulation start order', () => {
  const engine = initialize(hotRestart, 'concurrent');
  const interaction = (actorId: 'alex' | 'jules', requestId: string): RecordedInteraction => {
    const view = engine.observe(actorId);
    const input: GatewayStart = { kind: 'start', runId: view.runId, requestId, actorId, role: actorId === 'alex' ? 'facilities' : 'electrical', message: 'What is known?', view, procedures: [], promptVersion: 'test', interactionMode: 'advisory' };
    const reply = { kind: 'fallback' as const, runId: input.runId, requestId, actorId, mode: 'scripted' as const, reason: 'scripted', message: 'Offline.', facts: [] };
    return { turns: [{ atSimTime: view.simTime, input, reply, call: null, toolResult: null }], end: { atSimTime: view.simTime, reason: 'fallback', reply, durationMs: 1 } };
  };
  const alex = interaction('alex', 'alex-first'); engine.step(5); const jules = interaction('jules', 'jules-second');
  const archive = new HostArchive('concurrent'); archive.capture(jules); archive.capture(alex);
  const saved = archive.build(engine.exportRecord());
  expect(saved.interactions.map(row => row.turns[0].input.actorId)).toEqual(['alex', 'jules']);
});
