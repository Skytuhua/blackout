import { expect, it } from 'vitest';
import { GatewayStartSchema, INTEGRATION_CONTRACT_VERSION } from '../../src/shared/schemas';
import { start } from '../llm/fixtures';

it('distinguishes advisory chat while preserving exact legacy gateway envelopes', () => {
  expect(INTEGRATION_CONTRACT_VERSION).toBe(5);
  expect(GatewayStartSchema.parse(start)).toEqual(start);
  expect(GatewayStartSchema.parse({ ...start, interactionMode: 'advisory' }).interactionMode).toBe('advisory');
  expect(GatewayStartSchema.safeParse({ ...start, interactionMode: 'execute' }).success).toBe(false);
  expect(GatewayStartSchema.safeParse({ ...start, hiddenState: {} }).success).toBe(false);
});
