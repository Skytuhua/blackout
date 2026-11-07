import type { ScenarioSpec } from '../../shared/contracts';

export function scheduleWork(profile: ScenarioSpec['profile'], demand: Pick<ScenarioSpec['workload'], 'critical' | 'interactive' | 'batch'>, capacity: number, backlog: number, batchCeiling: number, seconds: number) {
  const available = Math.min(capacity, profile.computeCapacity);
  const critical = Math.min(demand.critical, available);
  const interactive = Math.min(demand.interactive, available - critical);
  const batch = Math.min(batchCeiling, available - critical - interactive, demand.batch + backlog / seconds);
  const utilization = (critical + interactive + batch) / profile.computeCapacity;
  return {
    critical, interactive, batch,
    backlog: Math.max(0, backlog + (demand.batch - batch) * seconds),
    powerKw: available > 0 ? profile.idleKw + utilization * (profile.peakKw - profile.idleKw) : 0,
  };
}
