import type { KnowledgeView, GatewayResponse, ComparisonResult, OutcomeLedger } from './contracts';

// Development fixtures only; these are not evidence that a real mission works.
export const alarmFixture: KnowledgeView = {
  schemaVersion: 1, runId: 'fixture-development', actorId: 'player', simTime: 75, viewHash: 'fixture-alarm-v1',
  knownTopology: { width: 20, height: 12, tileMeters: 1, walkable: [], assets: [
    { id: 'cooling-1', label: 'Cooling 01', kind: 'cooling', x: 2, y: 2, width: 2, height: 2, serviceTile: { x: 2, y: 4 }, dependencies: ['controller'] },
    { id: 'rack-1', label: 'Rack A1', kind: 'rack', x: 6, y: 3, width: 1, height: 2, serviceTile: { x: 6, y: 5 }, dependencies: ['ups-1', 'ups-2'] },
  ] },
  observations: [
    { id: 'obs-fixture-temp', assetId: 'rack-1', source: 'monitoring', field: 'temperatureC', value: 27.1, units: '°C', observedAt: 75, receivedAt: 75, quality: 'reported' },
    { id: 'obs-fixture-cooling', assetId: 'cooling-1', source: 'monitoring', field: 'state', value: 'not_ready', units: 'state', observedAt: 75, receivedAt: 75, quality: 'reported' },
  ],
  tasks: [], crew: [{ id: 'alex', name: 'Alex Chen', role: 'facilities', x: 2, y: 9, speed: 1.25, taskId: null }, { id: 'jules', name: 'Jules Reyes', role: 'electrical', x: 17, y: 9, speed: 1.25, taskId: null }],
  messages: [], allowedProcedureIds: ['hot-restart-v1'], observedEntityVersions: { 'cooling-1': 1, 'rack-1': 1 },
  affordances: [{ action: 'inspect', targetId: 'cooling-1', enabled: true, reason: null, technicianIds: ['alex', 'jules'], travelSeconds: 4, workSeconds: 30 }],
  objectives: [{ id: 'cooling', label: 'Verify cooling recovery', state: 'awaiting_verification' }],
  summary: { criticalServedFraction: 1, interactiveServedFraction: 1, batchBacklog: 0, itPowerKw: 64, sourceHeadroomKw: 107, hottestTemperatureC: 27.1, observedAt: 75 },
  mission: { status: 'active', reason: null, stabilitySeconds: null, windowSeconds: 600 },
};
export const inspectionFixture: KnowledgeView = { ...alarmFixture, tasks: [{ id: 'task-fixture', actorId: 'alex', targetId: 'cooling-1', action: 'inspect', status: 'traveling', startedAt: 75, arrivalAt: 79, completesAt: 109, progress: 0, path: [{ x: 2, y: 9 }, { x: 2, y: 4 }], reason: null }] };
export const completedInspectionFixture: KnowledgeView = { ...alarmFixture, observations: [...alarmFixture.observations, { id: 'obs-fixture-inspection', assetId: 'cooling-1', source: 'alex', field: 'inspection', value: 'Cooling controller prerequisite unavailable. Facilities repair is permitted.', units: 'report', observedAt: 109, receivedAt: 109, quality: 'independent' }] };
export const fallbackFixture: GatewayResponse = { kind: 'fallback', runId: alarmFixture.runId, requestId: 'fixture-request', actorId: 'alex', mode: 'scripted', reason: 'provider_unavailable', message: 'Model unavailable. Use timestamped readings and dispatch an inspection.', facts: [] };
export const ledgerFixture: OutcomeLedger = { schemaVersion: 1, runId: alarmFixture.runId, engineVersion: '1.0.0', scenarioId: 'hot-restart', horizon: 400, criticalDemand: 64000, criticalDelivered: 64000, interactiveDemand: 32000, interactiveDelivered: 32000, batchArrivals: 96000, batchCompleted: 80000, batchBacklog: 16000, batchDelayUnitSeconds: 100000, peakTemperatureC: 31.2, protectionEvents: [], timeline: [], telemetry: [{ simTime: 0, hottestTemperatureC: 24, criticalServedFraction: 1, batchBacklog: 0 }] };
export const comparisonFixture: ComparisonResult = { status: 'complete', baseRunId: alarmFixture.runId, branchRunId: 'fixture-branch', continuationPolicy: 'Earlier batch cap, with the same subsequent accepted commands and external disturbances; originally rejected attempts are omitted.', externalScheduleIdentity: 'fixture-events-v1', supportedHorizon: 400, baseline: ledgerFixture, alternative: { ...ledgerFixture, runId: 'fixture-branch', peakTemperatureC: 30 }, explanation: 'Development fixture: equal simulated horizons.' };
