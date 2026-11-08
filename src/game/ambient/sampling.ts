import type { KnowledgeView, Observation } from '../../shared/contracts';
import { readingStatus } from '../../ui/presentation';

export const MAX_AMBIENT_PIXELS = 64;
export const MAX_AMBIENT_CREW = 8;
export interface AmbientPixel {
  kind: 'tool' | 'airflow' | 'rack';
  subjectId: string;
  /** Integer native pixels in the 320x192 world. */
  x: number;
  y: number;
  width: number;
  height: number;
  color: number;
}
export interface IdleOffset {
  actorId: string;
  /** Presentation only, added after public crew positioning; never a route coordinate. */
  x: number;
  y: number;
}
export interface AmbientSample { pixels: AmbientPixel[]; idleOffsets: IdleOffset[] }

// Normalize before multiplication so even very large supplied clocks stay finite.
function phase(seconds: number, period: number, id: string): number {
  let stagger = 0;
  for (let i = 0; i < id.length; i++) stagger = (stagger * 31 + id.charCodeAt(i)) % 997;
  return ((Number.isFinite(seconds) ? Math.max(0, seconds) % period : 0) + stagger / 997 * period) % period;
}

/** Select chronology before testing evidence. Equal-time conflicts fail closed. */
function latestPositive(view: KnowledgeView, assetId: string, fields: readonly string[], positive: (o: Observation) => boolean): boolean {
  let latest: Observation | undefined, active = false;
  for (const observation of view.observations) {
    if (observation.assetId !== assetId || !fields.includes(observation.field)) continue;
    const newer = !latest || observation.observedAt > latest.observedAt || observation.observedAt === latest.observedAt && observation.receivedAt > latest.receivedAt;
    const tied = latest && observation.observedAt === latest.observedAt && observation.receivedAt === latest.receivedAt;
    if (!newer && !tied) continue;
    const valid = readingStatus(observation, view.simTime) === 'fresh' && positive(observation);
    active = newer ? valid : active && valid;
    latest = observation;
  }
  return active;
}

/** Pure scoped presentation: no engine, wall time, randomness, commands, or retained view. */
export function sampleAmbient(view: KnowledgeView, animationClockSeconds: number, reducedMotion = false): AmbientSample {
  const sample: AmbientSample = { pixels: [], idleOffsets: [] };
  const worldWidth = Math.min(320, view.knownTopology.width * 16), worldHeight = Math.min(192, view.knownTopology.height * 16);
  const pixel = (kind: AmbientPixel['kind'], subjectId: string, x: number, y: number, width: number, color: number) => {
    x = Math.round(x); y = Math.round(y);
    if (sample.pixels.length >= MAX_AMBIENT_PIXELS || ![x, y, width].every(Number.isFinite) || x < 0 || y < 0 || x + width > worldWidth || y + 1 > worldHeight) return;
    sample.pixels.push({ kind, subjectId, x, y, width, height: 1, color });
  };
  const crewIds = new Set<string>();
  for (const crew of view.crew) {
    if (crewIds.size >= MAX_AMBIENT_CREW) break;
    if (crewIds.has(crew.id)) continue;
    crewIds.add(crew.id);
    if (crew.role === 'remote') continue;
    if (crew.taskId === null) {
      if (!reducedMotion) sample.idleOffsets.push({ actorId: crew.id, x: 0, y: phase(animationClockSeconds, 6, crew.id) < .6 ? -1 : 0 });
      continue;
    }
    const task = view.tasks.find(t => t.id === crew.taskId && t.actorId === crew.id);
    if (!task || !['inspecting', 'working'].includes(task.status) || task.action === 'move_crew' || task.startedAt > view.simTime || task.arrivalAt > view.simTime || task.completesAt <= view.simTime || task.progress >= 1) continue;
    if (!view.knownTopology.assets.some(a => a.id === task.targetId)) continue;
    const step = reducedMotion ? 0 : Math.floor(phase(animationClockSeconds, 1, crew.id) * 2);
    // A two-pixel hand/tool mark stays inside the existing 12x16 actor frame.
    pixel('tool', crew.id, crew.x * 16 + 11, crew.y * 16 + 9 - step, 2, 0xf4b860);
    pixel('tool', crew.id, crew.x * 16 + 12, crew.y * 16 + 8 - step, 1, 0x92a8b7);
  }

  const assetIds = new Set<string>();
  for (const asset of view.knownTopology.assets) {
    if (assetIds.size >= 32 || sample.pixels.length >= MAX_AMBIENT_PIXELS) break;
    if (assetIds.has(asset.id)) continue;
    assetIds.add(asset.id);
    const x = asset.x * 16, y = asset.y * 16;
    if (asset.kind === 'cooling' && asset.width >= 2 && asset.height >= 2 && latestPositive(view, asset.id, ['running', 'state'], o => o.field === 'running' ? o.value === true : o.value === 'running')) {
      const step = reducedMotion ? 0 : Math.floor(phase(animationClockSeconds, 1.5, asset.id) * 2);
      pixel('airflow', asset.id, x + 11, y + 26 + step, 2, 0x45d5e8);
      pixel('airflow', asset.id, x + 19, y + 27 + step, 2, 0x45d5e8);
    }
    if (asset.kind === 'rack' && asset.width >= 1 && asset.height >= 2
      && latestPositive(view, asset.id, ['power_state'], o => o.value === 'running')
      && latestPositive(view, asset.id, ['batch_processing_rate'], o => typeof o.value === 'number' && Number.isFinite(o.value) && o.value > 0)) {
      const step = reducedMotion ? 0 : Math.floor(phase(animationClockSeconds, 2, asset.id) * 1.5);
      pixel('rack', asset.id, x + (step === 1 ? 10 : 5), y + 11 + step * 5, 1, 0xdceaf2);
    }
  }
  return sample;
}
