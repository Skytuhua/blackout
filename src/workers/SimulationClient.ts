import type { ActionRequest, Checkpoint, ComparisonResult, KnowledgeView, RunRecord, ScenarioSpec, CommandReceipt } from '../shared/contracts';
import { WorkerReplySchema, type WorkerReply, type WorkerRequest } from './protocol';
type RequestPayload<T> = T extends WorkerRequest ? Omit<T, 'correlationId' | 'runId'> : never;

export class SimulationClient {
  private runId = '';
  private listeners = new Set<{ actorId: string; listener: (view: KnowledgeView) => void }>();
  private pending = new Map<string, { resolve: (reply: WorkerReply) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>; sourceRunId: string; expectedRunId: string }>();
  private paused = true;
  private speed: 1 | 2 | 4 = 1;
  private timer: ReturnType<typeof setInterval> | undefined;
  private advancing = false;
  private terminal = false;
  constructor(private worker: Worker = new Worker(new URL('./simulation.worker.ts', import.meta.url), { type: 'module' })) {
    worker.onmessage = (event: MessageEvent<unknown>) => {
      const parsed = WorkerReplySchema.safeParse(event.data);
      if (!parsed.success) return;
      const reply = parsed.data;
      const pending = this.pending.get(reply.correlationId);
      if (!pending) return;
      this.pending.delete(reply.correlationId); clearTimeout(pending.timer);
      if (reply.kind === 'error' && reply.runId === pending.sourceRunId) { pending.reject(new Error(reply.code)); return; }
      if (reply.runId !== pending.expectedRunId || ('view' in reply && reply.view.runId !== pending.expectedRunId)) { pending.reject(new Error('stale_run')); return; }
      if (reply.kind === 'error') { pending.reject(new Error(reply.code)); return; }
      if (reply.kind === 'restored') this.runId = reply.runId;
      if ('view' in reply) {
        this.terminal = ['success', 'failure'].includes(reply.view.mission.status);
        if (this.terminal) this.pause();
        this.listeners.forEach(({ actorId, listener }) => { if (reply.view.actorId === actorId) listener(reply.view); });
      }
      pending.resolve(reply);
    };
    worker.onerror = () => this.rejectPending('The simulation worker stopped. Reload to retry.');
  }
  private rejectPending(message: string) { for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error(message)); } this.pending.clear(); }
  private send(payload: RequestPayload<WorkerRequest>, expectedRunId = this.runId): Promise<WorkerReply> {
    const correlationId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(correlationId); reject(new Error('Simulation request timed out.')); }, 10000);
      this.pending.set(correlationId, { resolve, reject, timer, sourceRunId: this.runId, expectedRunId });
      this.worker.postMessage({ ...payload, correlationId, runId: this.runId });
    });
  }
  async initialize(spec: ScenarioSpec, runId: string = crypto.randomUUID()): Promise<KnowledgeView> {
    this.pause(); this.rejectPending('stale_run'); this.runId = runId;
    const reply = await this.send({ kind: 'initialize', spec });
    if (reply.kind !== 'initialized') throw new Error('Unexpected worker reply');
    return reply.view;
  }
  async command(request: ActionRequest): Promise<CommandReceipt> { const reply = await this.send({ kind: 'command', request }); if (reply.kind !== 'receipt') throw new Error('Unexpected worker reply'); return reply.receipt; }
  async observe(actorId = 'player'): Promise<KnowledgeView> { const reply = await this.send({ kind: 'observe', actorId }); if (reply.kind !== 'view') throw new Error('Unexpected worker reply'); return reply.view; }
  subscribe(listener: (view: KnowledgeView) => void, actorId = 'player') { const subscription = { actorId, listener }; this.listeners.add(subscription); return () => { this.listeners.delete(subscription); }; }
  async advance(ticks: number) { const reply = await this.send({ kind: 'advance', ticks }); if (reply.kind !== 'advanced') throw new Error('Unexpected worker reply'); return reply.view; }
  pause() { this.paused = true; if (this.timer) clearInterval(this.timer); this.timer = undefined; }
  resume() {
    if (!this.paused || this.terminal) return;
    this.paused = false;
    this.timer = setInterval(() => { if (this.advancing) return; this.advancing = true; void this.advance(1).catch(() => this.pause()).finally(() => { this.advancing = false; }); }, 1000 / this.speed);
  }
  setSpeed(speed: 1 | 2 | 4) { const running = !this.paused; this.speed = speed; if (running) { this.pause(); this.resume(); } }
  async snapshot(): Promise<Checkpoint> { const reply = await this.send({ kind: 'snapshot' }); if (reply.kind !== 'checkpoint') throw new Error('Unexpected worker reply'); return reply.checkpoint; }
  async restore(checkpoint: Checkpoint, newRunId: string = crypto.randomUUID()): Promise<KnowledgeView> {
    this.pause(); this.rejectPending('stale_run');
    const reply = await this.send({ kind: 'restore', checkpoint, newRunId }, newRunId); if (reply.kind !== 'restored') throw new Error('Unexpected worker reply'); return reply.view;
  }
  async record(): Promise<RunRecord> { const reply = await this.send({ kind: 'record' }); if (reply.kind !== 'record') throw new Error('Unexpected worker reply'); return reply.record; }
  async replayTo(record: RunRecord, at: number): Promise<KnowledgeView> { const reply = await this.send({ kind: 'replay_to', record, at }); if (reply.kind !== 'view') throw new Error('Unexpected replay reply'); return reply.view; }
  async compare(record: RunRecord, change: { commandSequence: number; earlierAt: number; branchRunId: string }): Promise<ComparisonResult> { const reply = await this.send({ kind: 'compare', record, change }); if (reply.kind !== 'comparison') throw new Error('Unexpected comparison reply'); return reply.comparison; }
  dispose() { this.pause(); this.rejectPending('Simulation closed.'); this.worker.terminate(); this.listeners.clear(); }
}
