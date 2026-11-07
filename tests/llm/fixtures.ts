import { alarmFixture } from '../../src/shared/fixtures';
import type { GatewayStart, AgentResponse } from '../../src/shared/contracts';
export const start: GatewayStart = { kind: 'start', runId: alarmFixture.runId, requestId: 'req', actorId: 'player', role: 'player', message: 'Help', view: alarmFixture, procedures: [], promptVersion: '1' };
export const final: AgentResponse = { runId: start.runId, requestId: 'req', actorId: 'player', speaker: 'player', mode: 'live', facts: [{ observationId: 'obs-fixture-temp', field: 'value' }], inference: 'Check cooling.', uncertainty: 'Inspection needed.', proposals: [] };
