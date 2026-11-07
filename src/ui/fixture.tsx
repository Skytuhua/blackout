import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/ibm-plex-sans/400.css';
import '../styles.css';
import { alarmFixture } from '../shared/fixtures';
import { hotRestart } from '../content/scenarios/hot-restart';
import { OperationalView } from './OperationalView';
function Fixture() {
  const [event, setEvent] = useState('No fixture action sent');
  return <><div style={{padding:'8px 24px',color:'#f4b860',background:'#102332'}}>Development fixture only · {event}</div><OperationalView view={{...alarmFixture, knownTopology:hotRestart.topology}} onInspect={id => setEvent(`Selected ${id}`)} onAction={intent => setEvent(`Intent ${JSON.stringify(intent)}`)} onAskCoworker={(id, text) => setEvent(`Message to ${id}: ${text}`)} /></>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
