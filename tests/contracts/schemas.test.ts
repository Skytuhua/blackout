import { describe, expect, it } from 'vitest';
import { KnowledgeViewSchema, ActionRequestSchema, GatewayResponseSchema, ComparisonResultSchema } from '../../src/shared/schemas';
import { alarmFixture, inspectionFixture, completedInspectionFixture, fallbackFixture, comparisonFixture } from '../../src/shared/fixtures';

describe('contract version 1', () => {
  it('parses the projected alarm without latent diagnosis', () => {
    const view = KnowledgeViewSchema.parse(alarmFixture);
    expect(view.observations.some(o => o.field === 'temperatureC')).toBe(true);
    expect(JSON.stringify(view)).not.toContain('latentFault');
    expect(KnowledgeViewSchema.safeParse({ ...view, latentFault: 'controller' }).success).toBe(false);
  });
  it('rejects nonfinite or malformed command envelopes', () => {
    expect(ActionRequestSchema.safeParse({ schemaVersion: 1, runId: 'demo', requestId: 'req', actorId: 'player', intent: { action: 'pause_batch', targetId: 'site', atSimTime: Infinity, args: {} }, expectedEntityVersions: {}, idempotencyKey: 'i' }).success).toBe(false);
  });
  it('separates gateway kind from displayed mode', () => { expect(GatewayResponseSchema.parse(fallbackFixture).kind).toBe('fallback'); });
  it('validates dispatched and completed inspection fixtures', () => {
    expect(KnowledgeViewSchema.parse(inspectionFixture).tasks[0].status).toBe('traveling');
    expect(KnowledgeViewSchema.parse(completedInspectionFixture).observations.at(-1)?.quality).toBe('independent');
  });
  it('does not allow unsupported comparisons to carry full-horizon alternative metrics', () => {
    expect(ComparisonResultSchema.safeParse(comparisonFixture).success).toBe(true);
    expect(ComparisonResultSchema.safeParse({ ...comparisonFixture, status: 'unsupported', reason: 'invalid', firstInvalidAction: {}, alternative: comparisonFixture.baseline }).success).toBe(false);
  });
});
