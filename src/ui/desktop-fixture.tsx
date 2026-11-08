import { createRoot } from 'react-dom/client';
import { useRef, useState } from 'react';
import '@fontsource/pixelify-sans/latin-600.css';
import '@fontsource/pixelify-sans/latin-700.css';
import '@fontsource/ibm-plex-sans/400.css';
import type { ActionIntent, DesktopGameProps, DesktopPanel, DesktopRadioExchange } from '../shared/contracts';
import { desktopFixtureExchange, desktopFixtureView } from './desktop-fixture-data';
import { DesktopGame } from './DesktopGame';

/** Explicit offline presentation fixture. No simulated success or provider calls. */
function Fixture() {
  const [view, setView] = useState(desktopFixtureView);
  const [asset, selectAsset] = useState<string | null>(null), [crew, selectCrew] = useState<string | null>(null), [panel, setPanel] = useState<DesktopPanel>(null);
  const [paused, pause] = useState(false), [speed, setSpeed] = useState<1 | 2 | 4>(1), [session, setSession] = useState<DesktopGameProps['session']>(new URLSearchParams(location.search).has('welcome') ? 'welcome' : 'mission');
  const [notice, setNotice] = useState('Offline development fixture · No engine or provider attached.');
  const [exchange, setExchange] = useState<DesktopRadioExchange | null>(() => desktopFixtureExchange(view));
  const [radioBusy, setRadioBusy] = useState(false), [coach, setCoach] = useState<DesktopGameProps['coach']>(null);
  const lastAction = useRef<ActionIntent | null>(null), lastMessage = useRef('');
  Object.assign(window, { desktopFixture: { setView, view, pause, setPanel, setSession, notice, selectAsset, selectCrew, setExchange, exchange, setRadioBusy, setCoach, lastAction: lastAction.current, lastMessage: lastMessage.current } });
  return <DesktopGame view={view} session={session} selectedAssetId={asset} selectedCrewId={crew} panel={panel} paused={paused} speed={speed} busy={false} radioBusy={radioBusy} notice={notice} error="" exchange={exchange} coach={coach}
    replayContent={<p>Fixture replay slot. The integrated host supplies the recorded ledger.</p>}
    onSelectAsset={selectAsset} onSelectCrew={selectCrew} onPanelChange={setPanel}
    onAction={intent => { lastAction.current = intent; setNotice(`Fixture intent: ${JSON.stringify(intent)}`); }} onAskCoworker={(id, message) => { lastMessage.current = message; setNotice(`Fixture radio ${id}: ${message}`); }} onCancelCoworker={() => { setRadioBusy(false); setNotice('Fixture canceled radio'); }}
    onPause={() => pause(p => !p)} onSpeed={setSpeed} onRetry={() => { setView(v => ({ ...v, runId: `${v.runId}-retry`, simTime: 0 })); }} onStartPractice={() => setSession('practice')} onStartMission={() => setSession('mission')}
    onTutorialEvent={event => { document.documentElement.dataset.tutorial = event; }} />;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
