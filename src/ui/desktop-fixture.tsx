import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/ibm-plex-sans/400.css';
import type { DesktopGameProps, DesktopPanel } from '../shared/contracts';
import { alarmFixture } from '../shared/fixtures';
import { hotRestart } from '../content/scenarios/hot-restart';
import { DesktopGame } from './DesktopGame';

/** Explicit offline presentation fixture. No simulated success or provider calls. */
function Fixture() {
  const [view, setView] = useState({ ...alarmFixture, knownTopology: hotRestart.topology, crew: hotRestart.crew, affordances: [...alarmFixture.affordances, ...hotRestart.crew.filter(c => c.role !== 'remote').map(c => ({ action: 'move_crew' as const, targetId: c.id, enabled: true, reason: null, technicianIds: [], travelSeconds: null, workSeconds: 0 }))] });
  const [asset, selectAsset] = useState<string | null>(null), [crew, selectCrew] = useState<string | null>(null), [panel, setPanel] = useState<DesktopPanel>(null);
  const [paused, pause] = useState(false), [speed, setSpeed] = useState<1 | 2 | 4>(1), [session, setSession] = useState<DesktopGameProps['session']>(new URLSearchParams(location.search).has('welcome') ? 'welcome' : 'mission');
  const [notice, setNotice] = useState('Offline development fixture · No engine or provider attached.');
  Object.assign(window, { desktopFixture: { setView, view, pause, setPanel, setSession, notice } });
  return <DesktopGame view={view} session={session} selectedAssetId={asset} selectedCrewId={crew} panel={panel} paused={paused} speed={speed} busy={false} radioBusy={false} notice={notice} error="" exchange={null} coach={null}
    replayContent={<p>Fixture replay slot. The integrated host supplies the recorded ledger.</p>}
    onSelectAsset={selectAsset} onSelectCrew={selectCrew} onPanelChange={setPanel}
    onAction={intent => setNotice(`Fixture intent: ${JSON.stringify(intent)}`)} onAskCoworker={(id, message) => setNotice(`Fixture radio ${id}: ${message}`)} onCancelCoworker={() => setNotice('Fixture canceled radio')}
    onPause={() => pause(p => !p)} onSpeed={setSpeed} onRetry={() => { setView(v => ({ ...v, runId: `${v.runId}-retry`, simTime: 0 })); }} onStartPractice={() => setSession('practice')} onStartMission={() => setSession('mission')}
    onTutorialEvent={event => { document.documentElement.dataset.tutorial = event; }} />;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
