import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/ibm-plex-sans/400.css';
import '../styles.css';
import { alarmFixture } from '../shared/fixtures';
import { hotRestart } from '../content/scenarios/hot-restart';
import { OperationalView } from './OperationalView';
import { inspectionFixture } from '../shared/fixtures';
import type { KnowledgeView } from '../shared/contracts';
const fixtureCase = new URLSearchParams(location.search).get('case');
const globalActions: KnowledgeView['affordances'] = (['pause_batch', 'resume_batch', 'set_batch_ceiling', 'verify_recovery'] as const).map(action => ({ action, targetId: 'site', enabled: true, reason: null, technicianIds: [], travelSeconds: 0, workSeconds: action === 'verify_recovery' ? 10 : 3 }));
const initialView: KnowledgeView = {
  ...alarmFixture, knownTopology: hotRestart.topology,
  ...(fixtureCase === 'site' ? { affordances: globalActions } : {}),
  ...(fixtureCase === 'terminal' ? { mission: { ...alarmFixture.mission, status: 'success', reason: 'Terminal fixture' } } : {}),
  ...(fixtureCase === 'cancel' ? { tasks: inspectionFixture.tasks, affordances: [{ action: 'cancel_task', targetId: 'cooling-1', enabled: true, reason: null, technicianIds: [], travelSeconds: 0, workSeconds: 0 }] } : {}),
};
function Fixture() {
  const [event, setEvent] = useState('No fixture action sent');
  const [view, setView] = useState(initialView);
  return <><div style={{padding:'8px 24px',color:'#f4b860',background:'#102332'}}>Development fixture only · {event}{fixtureCase === 'cancel' && <button onClick={() => setView({ ...view, tasks: [] })}>Complete fixture task</button>}</div><OperationalView view={view} onInspect={id => setEvent(`Selected ${id}`)} onAction={intent => setEvent(`Intent ${JSON.stringify(intent)}`)} onAskCoworker={(id, text) => setEvent(`Message to ${id}: ${text}`)} /></>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
