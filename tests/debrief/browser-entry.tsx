import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/ibm-plex-sans/400.css';
import '../../src/styles.css';
import { DebriefView, type DebriefViewProps } from '../../src/ui/debrief/DebriefView';
import { baseProps, complete, context, response, terminalLedger, unsupported, recoveredProps } from './fixtures';

const name = new URLSearchParams(location.search).get('case') ?? 'complete';
const scenarios: Record<string, Partial<DebriefViewProps>> = {
  complete: { comparison: complete },
  unsupported: { comparison: unsupported, explanation: { response, context } },
  'no-cap': { capOptions: [] },
  loading: { comparisonBusy: true, explanationBusy: true },
  failure: { comparisonError: 'Replay could not finish', explanationError: 'Provider unavailable; use computed records' },
  empty: { ledger: { ...baseProps.ledger, telemetry: [], timeline: [] }, dialogue: [] },
  invalid: { explanation: { response: { ...response, facts: [{ ledgerRunId: 'unknown', field: 'peakTemperatureC' }] }, context } },
  'invalid-selector': { explanation: { response: { ...response, facts: [{ ledgerRunId: 'original', field: 'private' } as never] }, context } },
  terminal: { ledger: terminalLedger },
  recovered: recoveredProps,
  'zero-cap': { capOptions: [{ ...baseProps.capOptions[0], at: 0 }] },
};
const props = { ...baseProps, ...scenarios[name] };
const before = JSON.stringify(props);
const calls: { type: string; value?: unknown }[] = [];
declare global { interface Window { debriefProof: { calls: typeof calls; unchanged: () => boolean; capOptions: DebriefViewProps['capOptions'] } } }
window.debriefProof = { calls, unchanged: () => before === JSON.stringify(props), capOptions: props.capOptions };
function Fixture() {
  const [replay, setReplay] = useState(props.replay);
  const [notice, setNotice] = useState('No callback invoked');
  function record(type: string, value?: unknown) { calls.push({ type, value }); setNotice(`${type}${value === undefined ? '' : `: ${JSON.stringify(value)}`}`); }
  return <>
    <aside style={{ padding: '12px 24px', background: '#102332', color: '#f4b860' }}>
      Development fixture · UI-03 · {name}. Engine-generated library data; this is not the application saved-run/replay route or G2 acceptance.
      <p role="status" style={{ margin: '4px 0' }}>{notice}</p>
    </aside>
    <DebriefView {...props} replay={replay}
      onSeek={at => { record('seek', at); setReplay(p => ({ ...p, cursor: at })); }}
      onToggle={() => { record('toggle'); setReplay(p => ({ ...p, playing: !p.playing })); }}
      onCompare={change => record('compare', change)} onReturn={() => record('return')}
      onRetry={() => record('retry')} onRequestExplanation={() => record('explain')} />
  </>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
