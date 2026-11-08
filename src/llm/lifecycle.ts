import type { GatewayStart, ToolIntent } from '../shared/contracts';

export type Lifecycle = { deadline: number; closed: boolean; signal?: AbortSignal };
const lifecycles = new WeakMap<GatewayStart | ToolIntent, Lifecycle>();
export const bindLifecycle = (value: GatewayStart | ToolIntent, lifecycle: Lifecycle) => { lifecycles.set(value, lifecycle); };
export function lifecycleFor(start: GatewayStart, intent?: ToolIntent): Lifecycle {
  let lifecycle = (intent && lifecycles.get(intent)) || lifecycles.get(start);
  if (!lifecycle) {
    lifecycle = { deadline: performance.now() + (start.role === 'debrief' ? 20000 : 18000), closed: false };
    bindLifecycle(start, lifecycle);
  }
  return lifecycle;
}
export const expired = (lifecycle: Lifecycle) => lifecycle.closed || lifecycle.signal?.aborted || performance.now() >= lifecycle.deadline;
