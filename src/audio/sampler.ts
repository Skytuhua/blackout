import type { AudioView } from './index';
import type { LoopCue, SoundCue } from './cues';

// This is an audio freshness ceiling, using the master plan's 10 s fresh
// verification window; it never infers an alarm or equipment truth.
const FRESH_SECONDS = 10;
const HISTORY_LIMIT = 512;
const tailMap = <T extends { id: string }>(items: T[]) => new Map(items.slice(-HISTORY_LIMIT).map(item => [item.id, item]));
type Sample = { cues: SoundCue[]; loops: Set<LoopCue>; work: string };

function onRoute(point: AudioView['crew'][number], path: AudioView['tasks'][number]['path']) {
  return path.some((end, i) => {
    const start = path[Math.max(0, i - 1)];
    return (start.x === end.x && point.x === end.x && point.y >= Math.min(start.y, end.y) && point.y <= Math.max(start.y, end.y))
      || (start.y === end.y && point.y === end.y && point.x >= Math.min(start.x, end.x) && point.x <= Math.max(start.x, end.x));
  });
}

function summarize(view: AudioView) {
  const tasks = tailMap(view.tasks);
  const crew = tailMap(view.crew.map(person => ({ ...person })));
  const working = new Set<string>();
  let physicalWork = false;
  for (const task of tasks.values()) {
    if (!['working', 'inspecting'].includes(task.status) || task.action === 'move_crew' || view.simTime < task.arrivalAt || view.simTime >= task.completesAt) continue;
    const person = crew.get(task.actorId);
    if (!person || person.taskId !== task.id) continue;
    const tile = view.knownTopology.assets.find(asset => asset.id === task.targetId)?.serviceTile;
    if (person.role !== 'remote' && (!tile || person.x !== tile.x || person.y !== tile.y)) continue;
    working.add(task.id);
    if (person.role !== 'remote') physicalWork = true;
  }
  const cooling = new Map<string, boolean | null>();
  for (const asset of view.knownTopology.assets.filter(asset => asset.kind === 'cooling').slice(-HISTORY_LIMIT)) {
    let latest: AudioView['observations'][number] | undefined;
    for (const reading of view.observations) {
      if (reading.assetId !== asset.id || reading.field !== 'running' || reading.receivedAt > view.simTime || reading.observedAt > view.simTime) continue;
      if (!latest || reading.observedAt > latest.observedAt || reading.observedAt === latest.observedAt && reading.receivedAt >= latest.receivedAt) latest = reading;
    }
    cooling.set(asset.id, latest && latest.quality !== 'unknown' && view.simTime - latest.observedAt <= FRESH_SECONDS && typeof latest.value === 'boolean' ? latest.value : null);
  }
  return {
    time: view.simTime, tasks: new Map([...tasks].map(([id, task]) => [id, { ...task, path: [] }])), crew,
    working, physicalWork, cooling, mission: view.mission.status,
    reports: new Set(view.messages.filter(message => message.at <= view.simTime).slice(-HISTORY_LIMIT).map(message => message.id)),
  };
}

/** Consumes permitted public state only. No engine, recorder, DOM or network. */
export class CueSampler {
  private previous: ReturnType<typeof summarize> | undefined;
  private started = new Set<string>();

  clear() { this.previous = undefined; this.started.clear(); }

  sample(view: AudioView, silent: boolean): Sample {
    const current = summarize(view);
    const work = [...current.working].sort().join('\0');
    const previous = this.previous;
    this.previous = current;
    if (!previous || silent || current.time < previous.time) {
      this.started = new Set(current.working);
      return { cues: [], loops: new Set(), work };
    }
    const cues = new Set<SoundCue>();
    for (const task of view.tasks.slice(-HISTORY_LIMIT)) {
      const before = previous.tasks.get(task.id);
      if (current.working.has(task.id) && !previous.working.has(task.id) && !this.started.has(task.id)) {
        cues.add('task-start'); this.started.add(task.id);
      }
      if (task.action !== 'move_crew' && (before || task.startedAt >= previous.time)) {
        if (task.status === 'completed' && before?.status !== 'completed' && task.completesAt >= previous.time) cues.add('task-complete');
        if (task.status === 'canceled' && before?.status !== 'canceled') cues.add('task-cancel');
      }
      const person = current.crew.get(task.actorId);
      const old = previous.crew.get(task.actorId);
      const finishedTravel = before?.status === 'traveling' && task.status === 'completed' && person?.taskId === null;
      const moving = task.status === 'traveling' || before?.status === 'traveling' && current.working.has(task.id) || finishedTravel;
      if (moving && current.time > previous.time && person && old && person.role !== 'remote'
        && (person.taskId === task.id || finishedTravel) && old.taskId === task.id && (person.x !== old.x || person.y !== old.y)
        && onRoute(person, task.path) && onRoute(old, task.path)) cues.add('crew-step');
    }
    // Public reports use the existing report-task ID convention, or an explicit
    // public conversationKind. Never identify reports by parsing their prose.
    const reportIds = new Set([...current.tasks.keys(), ...previous.tasks.keys()].map(id => `report-${id}`));
    if (view.messages.some(message => message.at >= previous.time && message.at <= current.time && !previous.reports.has(message.id)
      && (message.conversationKind === 'report' || reportIds.has(message.id)))) cues.add('report-arrived');
    for (const [id, running] of current.cooling) if (running === true && previous.cooling.get(id) === false) cues.add('cooling-recovered');
    if (['active', 'practice'].includes(previous.mission) && ['success', 'failure'].includes(current.mission)) cues.add(current.mission === 'success' ? 'mission-success' : 'mission-failure');
    // The retained state is bounded even if a host streams unbounded histories.
    this.started = new Set([...this.started].slice(-HISTORY_LIMIT));
    const loops = new Set<LoopCue>();
    if (['active', 'practice'].includes(current.mission)) {
      if (current.physicalWork) loops.add('work-loop');
      if ([...current.cooling.values()].some(value => value === true)) loops.add('facility-loop');
    }
    return { cues: [...cues], loops, work };
  }
}
