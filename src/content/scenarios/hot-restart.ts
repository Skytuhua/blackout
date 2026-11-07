import type { Asset, ScenarioSpec } from '../../shared/contracts';

const racks: Asset[] = Array.from({ length: 8 }, (_, i) => ({ id: `rack-${i + 1}`, label: `Rack ${['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C2'][i]}`, kind: 'rack', x: [5, 7, 9, 5, 7, 9, 13, 15][i], y: i < 3 || i > 5 ? 3 : 7, width: 1, height: 2, serviceTile: { x: [5, 7, 9, 5, 7, 9, 13, 15][i], y: i < 3 || i > 5 ? 5 : 9 }, dependencies: ['ups-1', 'ups-2', 'cooling-1', 'cooling-2'] }));
const assets: Asset[] = [...racks,
  { id: 'cooling-1', label: 'Cooling 01', kind: 'cooling', x: 2, y: 2, width: 2, height: 2, serviceTile: { x: 2, y: 4 }, dependencies: ['controller', 'distribution'] },
  { id: 'cooling-2', label: 'Cooling 02', kind: 'cooling', x: 2, y: 6, width: 2, height: 2, serviceTile: { x: 2, y: 8 }, dependencies: ['controller', 'distribution'] },
  { id: 'controller', label: 'Cooling control', kind: 'controller', x: 2, y: 10, width: 1, height: 1, serviceTile: { x: 3, y: 10 }, dependencies: ['distribution'] },
  { id: 'ups-1', label: 'UPS A', kind: 'ups', x: 18, y: 3, width: 1, height: 2, serviceTile: { x: 17, y: 4 }, dependencies: ['distribution'] },
  { id: 'ups-2', label: 'UPS B', kind: 'ups', x: 18, y: 7, width: 1, height: 2, serviceTile: { x: 17, y: 8 }, dependencies: ['distribution'] },
  { id: 'distribution', label: 'Transfer board', kind: 'distribution', x: 15, y: 10, width: 1, height: 1, serviceTile: { x: 15, y: 9 }, dependencies: ['generator'] },
  { id: 'generator', label: 'Generator', kind: 'generator', x: 17, y: 10, width: 2, height: 1, serviceTile: { x: 17, y: 9 }, dependencies: [] },
];
const walkable = Array.from({ length: 18 * 10 }, (_, i) => ({ x: i % 18 + 1, y: Math.floor(i / 18) + 1 })).filter(p => !assets.some(a => p.x >= a.x && p.x < a.x + a.width && p.y >= a.y && p.y < a.y + a.height));
export const hotRestart: ScenarioSpec = {
  schemaVersion: 1, id: 'hot-restart', contentVersion: 'hot-restart-v1', procedureVersion: 'procedures-v1', title: 'Hot Restart', description: 'A brief power disturbance ends. Verify why cooling has not recovered, protect critical service, and coordinate a safe recovery.', seed: 20261107,
  topology: { width: 20, height: 12, tileMeters: 1, walkable, assets },
  crew: [{ id: 'alex', name: 'Alex Chen', role: 'facilities', x: 3, y: 9, speed: 1.25, taskId: null }, { id: 'jules', name: 'Jules Reyes', role: 'electrical', x: 16, y: 9, speed: 1.25, taskId: null }, { id: 'sam', name: 'Sam Okafor', role: 'remote', x: 0, y: 0, speed: 1, taskId: null }],
  profile: { idleKw: 2, peakKw: 12, computeCapacity: 100, heatCapacityKjK: 200, conductanceKwK: 2, supplyReferenceC: 20, coolingTrainKw: 80, coolingCop: 3, coolingAuxiliaryKw: 2, upsEnergyKwh: 5, upsOutputLimitKw: 80, upsEfficiency: 0.95, upsRechargeKw: 5, generatorKw: 200, sensorIntervalSeconds: 5, sensorNoiseC: 0.2, warningC: 27, throttleC: 32, throttleDwellSeconds: 30, releaseC: 30, releaseDwellSeconds: 30, tripC: 40, tripDwellSeconds: 10, bootSeconds: 20, bootKw: 4 },
  workload: { critical: 20, interactive: 10, batch: 30, catchupCeiling: 50 },
  externalEvents: [
    { id: 'power-sag', at: 10, kind: 'utility_loss', value: null },
    { id: 'control-interlock', at: 10, kind: 'cooling_control_fault', value: null },
    { id: 'utility-return', at: 15, kind: 'utility_restore', value: null },
    { id: 'generator-start', at: 30, kind: 'generator_ready', value: null },
    { id: 'generator-transfer', at: 35, kind: 'transfer_complete', value: null },
    { id: 'announced-recovery-pulse', at: 300, kind: 'workload_pulse_start', value: 10 },
    { id: 'recovery-pulse-ends', at: 360, kind: 'workload_pulse_end', value: 0 },
  ],
  mission: { windowSeconds: 600, criticalLossSeconds: 60, stabilityHoldSeconds: 60, verificationMaxAgeSeconds: 10, recoveryRestartSeconds: 30, repairSeconds: 120, inspectSeconds: 30, remoteSeconds: 3, verifySeconds: 10 },
};
