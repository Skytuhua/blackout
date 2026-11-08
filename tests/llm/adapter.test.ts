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
