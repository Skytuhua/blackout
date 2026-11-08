import { it, expect, vi, afterEach } from 'vitest';
import { officialTransport, parameters, initialHistory } from '../../server/llm/adapter';
import { start } from './fixtures';
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('uses the installed SDK without retries and sends explicit Responses settings', async () => {
  vi.stubEnv('OPENAI_API_KEY', 'synthetic-test-key');
  vi.stubEnv('OPENAI_BASE_URL', 'https://api.openai.com/v1');
  let requests = 0;
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    requests++;
    expect(String(url)).toBe('https://api.openai.com/v1/responses');
    const body = JSON.parse(String(init.body));
    expect(body.store).toBe(false); expect(body.parallel_tool_calls).toBe(false);
    expect(body.reasoning.effort).toBe('none'); expect(body.max_output_tokens).toBe(400);
    expect(body.text.format.strict).toBe(true);
    for (const tool of body.tools) { expect(tool.strict).toBe(true); expect(tool.parameters.additionalProperties).toBe(false); }
    return new Response(JSON.stringify({ error: { message: 'Synthetic quota exhausted', type: 'insufficient_quota', code: 'insufficient_quota' } }), { status: 429, headers: { 'Content-Type': 'application/json' } });
  });
  await expect(officialTransport()(parameters(start, initialHistory(start), 1), new AbortController().signal)).rejects.toMatchObject({ status: 429 });
  expect(requests).toBe(1);
});

it('supplies the actor speaker explicitly and constrains final identity at the provider boundary', () => {
  const actor = { ...start, actorId: 'alex', role: 'facilities' as const, view: { ...start.view, actorId: 'alex' } };
  const history = initialHistory(actor);
  const context = JSON.parse((history[0] as { content: string }).content);
  expect(context.speaker).toBe('alex');
  const params = parameters(actor, history, 1);
  const properties = (params.text!.format as any).schema.properties;
  for (const [field, value] of Object.entries({ runId: actor.runId, requestId: actor.requestId, actorId: 'alex', speaker: 'alex', mode: 'live' })) expect(properties[field].enum).toEqual([value]);
});

it('distinguishes procedure targets and read-only arguments from equipment inspection tools', () => {
  const input = { ...start, procedures: [{ id: 'hot-restart-v1', text: 'Declared training procedure.' }] };
  const params = parameters(input, initialHistory(input), 1);
  const tool = params.tools!.find(tool => tool.type === 'function' && tool.name === 'read_procedure');
  if (!tool || tool.type !== 'function') throw new Error('Procedure tool missing.');
  const properties = (tool.parameters as any).properties;
  expect(properties.targetId.enum).toEqual(['hot-restart-v1']);
  expect(properties.action.type).toBe('null');
});

it('offers read-only tools and confirmation proposals including inspection in advisory mode', () => {
  const input = { ...start, interactionMode: 'advisory' as const };
  const params = parameters(input, initialHistory(input), 1);
  const names = params.tools!.map(tool => tool.type === 'function' && tool.name);
  expect(names).not.toContain('inspect_asset');
  expect(names).toContain('read_observations');
  const proposal = params.tools!.find(tool => tool.type === 'function' && tool.name === 'propose_action');
  expect(proposal && proposal.type === 'function' && (proposal.parameters as any).properties.targetId.enum).toEqual(['cooling-1']);
  expect(params.instructions).toContain('Answer questions');
  expect(params.instructions).toContain('clarification');
  expect(params.instructions).not.toContain('Inspections dispatch ordinary tasks');
  expect(parameters(start, initialHistory(start), 1).tools!.some(tool => tool.type === 'function' && tool.name === 'inspect_asset')).toBe(true);
});
