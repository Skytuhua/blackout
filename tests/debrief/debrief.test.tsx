import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { DebriefView, type DebriefViewProps } from '../../src/ui/debrief/DebriefView';
import { baseProps, complete, context, response, terminalLedger, unsupported } from './fixtures';

function render(props: Partial<DebriefViewProps> = {}) {
  return renderToStaticMarkup(createElement(DebriefView, { ...baseProps, ...props }));
}
function comparisonTable(html: string) {
  return html.match(/<table aria-label="Comparison outcomes"[\s\S]*?<\/table>/)?.[0] ?? '';
}

it('reports terminal mission time separately from continued physical accounting', () => {
  const html = render({ ledger: terminalLedger });
  expect(html).toContain('Mission failed');
  expect(html).toContain('505 s');
  expect(html).toContain('Accounting horizon: 600 s');
  expect(html).toContain('71,200');
  expect(html).toContain('96,000');
});

it('shows the real batch-delay tradeoff at the complete equal horizon', () => {
  const table = comparisonTable(render({ comparison: complete }));
  expect(table).toContain('Baseline'); expect(table).toContain('Earlier cap');
  // Pause completes at 23 s vs 8 s; 240 batch units arrive per second.
  expect(table).toContain('5,520'); expect(table).toContain('1,920');
  expect(table).toContain('18,480'); expect(table).toContain('22,080');
  expect(table).toContain('711,480'); expect(table).toContain('1,015,680');
  expect(table).toContain('Batch delay (unit·s)');
  expect(render({ comparison: complete })).toContain(complete.continuationPolicy);
});

it('withholds full-horizon comparisons and resolves explanation ledger selectors to the valid prefix', () => {
  if (unsupported.status !== 'unsupported') throw new Error('Expected unsupported');
  expect(unsupported.baseline.horizon).toBe(100);
  expect(unsupported.validPrefix.baseline.horizon).toBe(10);
  const html = render({ comparison: unsupported, explanation: { response, context } });
  const table = comparisonTable(html);
  expect(html).toContain('Unsupported continuation'); expect(html).toContain('WORKER_BUSY');
  expect(table).toContain('10 s'); expect(table).not.toContain('100 s');
  expect(table).not.toContain('18,480'); expect(table).not.toContain('22,080');
  expect(html).toContain('batchBacklog: 0 units');
  expect(html).not.toContain('batchBacklog: 18,480');
  expect(html).toContain('verify_recovery');
});

it('keeps dialogue original modes and escapes recorded text without requesting explanations on render', () => {
  let requested = 0;
  const html = render({ onRequestExplanation: () => { requested++; } });
  expect(requested).toBe(0);
  expect(html).toContain('Recorded conversation'); expect(html).toContain('Original mode: live');
  expect(html).toContain('Original mode: scripted'); expect(html).toContain('&lt;script&gt;');
  expect(html).not.toContain('<script>');
});

it('withholds unknown selectors and mismatched explanation identities', () => {
  const missing = render({ comparison: unsupported, explanation: { response: { ...response, facts: [{ ledgerRunId: 'unknown', field: 'peakTemperatureC' }] }, context } });
  expect(missing).toContain('Explanation withheld'); expect(missing).not.toContain(response.inference);
  const mismatch = render({ explanation: { response: { ...response, requestId: 'stale' }, context } });
  expect(mismatch).toContain('Explanation withheld');
  const invalid = render({ explanation: { response: { ...response, facts: [{ ledgerRunId: 'original', field: 'secret' } as never] }, context } });
  expect(invalid).toContain('Explanation withheld');
});

it('withholds explanations prepared for a different comparison or accounting horizon', () => {
  const stale = render({ comparison: complete, explanation: { response, context } });
  expect(stale).toContain('Explanation withheld');
  const changedHorizon = render({ ledger: { ...baseProps.ledger, horizon: 101 }, comparison: unsupported, explanation: { response, context } });
  expect(changedHorizon).toContain('Explanation withheld');
});

it('has honest empty, loading, error and no-telemetry states', () => {
  expect(render({ capOptions: [] })).toContain('No accepted batch cap');
  expect(render({ comparisonBusy: true })).toContain('Computing comparison');
  expect(render({ comparisonError: 'Replay could not finish' })).toContain('Replay could not finish');
  const html = render({ ledger: { ...baseProps.ledger, telemetry: [] }, dialogue: [] });
  expect(html).toContain('No recorded telemetry'); expect(html).toContain('No recorded dialogue');
  expect(html).toContain('Request explanation');
});
