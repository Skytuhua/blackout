import { describe, expect, it } from 'vitest';
import { ActionIntentSchema, ScenarioSpecSchema, jsonSchemas } from '../../src/shared/schemas';
import { hotRestart } from '../../src/content/scenarios/hot-restart';

describe('desktop integration v2', () => {
  it('accepts explicit practice without weakening the scenario boundary', () => {
    expect(ScenarioSpecSchema.safeParse({ ...hotRestart, mode: 'practice', externalEvents: [] }).success).toBe(true);
    expect(ScenarioSpecSchema.safeParse({ ...hotRestart, mode: 'sandbox' }).success).toBe(false);
  });
  it('requires a finite integer destination for crew movement', () => {
    const intent = { action: 'move_crew', targetId: 'alex', atSimTime: 0, args: { destination: { x: 4, y: 5 } } };
    expect(ActionIntentSchema.safeParse(intent).success).toBe(true);
    expect(ActionIntentSchema.safeParse({ ...intent, args: {} }).success).toBe(false);
    expect(ActionIntentSchema.safeParse({ ...intent, args: { destination: { x: 4.5, y: 5 } } }).success).toBe(false);
    expect(ActionIntentSchema.safeParse({ ...intent, args: { destination: { x: Infinity, y: 5 } } }).success).toBe(false);
  });
  it('publishes the required destination to JSON schema consumers too', () => {
    const schema = jsonSchemas.action as { oneOf?: any[]; anyOf?: any[] };
    const branches = schema.oneOf ?? schema.anyOf ?? [];
    const move = branches.find(branch => branch.properties?.action?.const === 'move_crew' || branch.properties?.action?.enum?.includes('move_crew'));
    expect(move?.properties.args.required).toContain('destination');
  });
});
