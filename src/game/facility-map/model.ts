import type { FacilityRoom, FacilityTopology } from '../../shared/facility-map';
import type { Observation } from '../../shared/contracts';
import { freshRunning, indicatorState, readingStatus } from '../../ui/presentation';

export function roomViewport(topology: FacilityTopology, roomId: string | null): FacilityRoom['bounds'] {
  const room = topology.rooms.find(room => room.id === roomId);
  if (!room) return { x: 0, y: 0, width: topology.width, height: topology.height };
  const b = room.bounds, x = Math.max(0, b.x - 1), y = Math.max(0, b.y - 1);
  return { x, y, width: Math.min(topology.width, b.x + b.width + 1) - x, height: Math.min(topology.height, b.y + b.height + 1) - y };
}

export function fitMap(width: number, height: number, native: { width: number; height: number }) {
  const ratio = Math.max(0, Math.min(width / native.width, height / native.height));
  const scale = ratio;
  return { scale, width: native.width * scale, height: native.height * scale };
}

/** These are observations, never equipment truth or inferred thermal alarms. */
export function assetEvidence(observations: Observation[], simTime: number) {
  const delivered = observations.filter(o => o.observedAt <= simTime && o.receivedAt <= simTime);
  const latest = new Map<string, Observation>();
  for (const o of delivered) if (!latest.has(o.field) || latest.get(o.field)!.observedAt <= o.observedAt) latest.set(o.field, o);
  const rows = [...latest.values()], state = indicatorState(rows, simTime);
  // Use the same newest delivered record for visual motion and the indicator.
  const indicator = rows.filter(o => ['state', 'power', 'power_state', 'running', 'output_state'].includes(o.field)).sort((a, b) => b.observedAt - a.observedAt)[0];
  const running = indicator ? freshRunning([indicator], simTime) : false;
  const fresh = rows.filter(o => readingStatus(o, simTime) === 'fresh');
  const stale = !fresh.length && rows.some(o => readingStatus(o, simTime) === 'stale');
  const label = state === 'active' ? 'Observed active' : state === 'attention' ? 'Observed attention' : stale ? 'Stale' : fresh.length ? 'Reading received' : 'Unknown';
  const readings = rows.filter(o => readingStatus(o, simTime) !== 'unknown').map(o => `${o.field}: ${String(o.value)}${o.units ? ` ${o.units}` : ''} · ${Math.floor(simTime - o.observedAt)}s old${readingStatus(o, simTime) === 'stale' ? ' (stale)' : ''}`).join('; ');
  return { state, running, label, readings, badge: stale ? 'stale' : state === 'attention' ? 'warning' : state };
}

/** Bounded visual interpolation. Selection changes cannot reset or advance it. */
export class PresentationClock {
  time = 0;
  private runId = '';
  private observed = 0;
  receive(runId: string, simTime: number) {
    if (runId !== this.runId || simTime !== this.observed) this.time = simTime;
    this.runId = runId; this.observed = simTime;
  }
  advance(seconds: number, speed: 1 | 2 | 4, running: boolean) {
    if (running) this.time = Math.min(this.observed + 1, this.time + Math.max(0, seconds) * speed);
    return this.time;
  }
}
