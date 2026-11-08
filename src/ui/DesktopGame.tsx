import { useEffect, useRef, useState } from 'react';
import { Maximize2, Pause, Play, X } from 'lucide-react';
import type { DesktopGameProps, DesktopPanel } from '../shared/contracts';
import { DesktopMap } from '../game/DesktopMap';
import { DesktopPortrait } from '../game/DesktopPortrait';
import { terminal } from '../game/desktop-world';
import { CommandPanel, EquipmentPanel, InformationPanel, RadioPanel } from './DesktopPanels';
import { PagedText } from './DesktopPaging';
import { DesktopCoach, DesktopWelcome } from './DesktopIntroduction';
import { indicatorState } from './presentation';
import { timeLabel } from './desktop-copy';
import './DesktopGame.css';

export function DesktopGame(props: DesktopGameProps) { return <DesktopSurface key={props.view.runId} {...props} />; }
function DesktopSurface(props: DesktopGameProps) {
  const { view } = props;
  const [focus, setFocus] = useState(false), [dockPage, setDockPage] = useState(0), [menu, setMenu] = useState(false);
  const [recipient, setRecipient] = useState(''), [drafts, setDrafts] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState(false);
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement)), [fullscreenError, setFullscreenError] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const asset = view.knownTopology.assets.find(a => a.id === props.selectedAssetId);
  const panelTitle = props.panel === 'equipment' && asset && asset.label.length <= 24 ? asset.label : props.panel ? props.panel[0].toUpperCase() + props.panel.slice(1) : '';
  const show = (panel: DesktopPanel) => { setMenu(false); setFeedback(false); props.onPanelChange(panel); };
  useEffect(() => { if (props.panel) heading.current?.focus({ preventScroll: true }); }, [props.panel]);
  useEffect(() => { const changed = () => setFullscreen(Boolean(document.fullscreenElement)); document.addEventListener('fullscreenchange', changed); return () => document.removeEventListener('fullscreenchange', changed); }, []);
  const summaryAge = view.simTime - view.summary.observedAt;
  const cooling = view.knownTopology.assets.filter(a => a.kind === 'cooling').map(a => indicatorState(view.observations.filter(o => o.assetId === a.id), view.simTime));
  const coolingStatus = cooling.includes('attention') ? 'Cooling stopped' : cooling.length > 0 && cooling.every(s => s === 'active') ? 'Cooling ready' : 'Cooling unknown';
  const availableCrew = view.crew.filter(c => c.role !== 'remote' && c.taskId === null).length;
  const serviceStatus = summaryAge < 0 || view.summary.criticalServedFraction === null ? 'Service unknown' : summaryAge > 10 ? 'Service stale' : view.summary.criticalServedFraction === 1 ? 'Service stable' : 'Service reduced';
  const closePanel = () => { show(null); setFocus(false); document.querySelector<HTMLElement>('.blackout-canvas')?.focus({ preventScroll: true }); };
  return <main className={`blackout-desktop${focus ? ' blackout-focus' : ''}${props.panel ? ' blackout-context-open' : ''}`}>
    <div className="blackout-shell" inert={props.session === 'welcome'}>
      <header className="blackout-top">
        <h1>BLACKOUT</h1><span className="blackout-mission-name">{props.session === 'practice' ? 'Practice' : 'Hot Restart'}</span>
        <button className="blackout-status-cell" onClick={() => show('objectives')}><i className={`blackout-led${serviceStatus === 'Service stable' ? '' : ' blackout-led-warn'}`} />{serviceStatus}</button>
        <button className="blackout-status-cell blackout-cooling-status" onClick={() => show('equipment')}><i className={`blackout-led${coolingStatus === 'Cooling ready' ? '' : coolingStatus === 'Cooling stopped' ? ' blackout-led-warn' : ' blackout-led-unknown'}`} />{coolingStatus}</button>
        <button className="blackout-status-cell blackout-temperature" aria-label="Observed inlet temperature" title={`Observed ${timeLabel(view.summary.observedAt)}`} onClick={() => show('objectives')}>{view.summary.hottestTemperatureC === null || summaryAge < 0 ? 'Temp unknown' : `${view.summary.hottestTemperatureC.toFixed(1)} °C${summaryAge > 10 ? ' stale' : ''}`}</button>
        <button className="blackout-status-cell blackout-crew-status" onClick={() => show('command')}><i className="blackout-led" />{availableCrew} crew available</button>
        <div className="blackout-playback"><button aria-label={props.paused ? 'Resume simulation' : 'Pause simulation'} onClick={props.onPause} disabled={terminal(view) || props.session === 'welcome'}>{props.paused ? <Play size={18} /> : <Pause size={18} />}</button>{([1, 2, 4] as const).map(speed => <button key={speed} aria-pressed={props.speed === speed} onClick={() => props.onSpeed(speed)}>{speed}x</button>)}</div>
        <time>{timeLabel(view.simTime)}</time>
      </header>
      <div className="blackout-play-area"><DesktopMap {...props} />
        {props.panel && <aside className="blackout-panel" aria-label={`${panelTitle} panel`} data-panel={props.panel}>
          <header className="blackout-panel-heading"><h2 ref={heading} tabIndex={-1}>{panelTitle}</h2><button aria-label={focus ? 'Return to side panel' : 'Enlarge text panel'} onClick={() => setFocus(!focus)}><Maximize2 size={16} /></button><button aria-label="Return to world" onClick={closePanel}><X size={16} /></button></header>
          <div className="blackout-panel-content">
            {props.panel === 'equipment' ? <EquipmentPanel props={props} /> : props.panel === 'command' ? <CommandPanel props={props} /> : props.panel === 'radio' ? <RadioPanel props={props} recipient={recipient} onRecipient={setRecipient} draft={drafts[recipient] ?? ''} onDraft={draft => setDrafts(previous => ({ ...previous, [recipient]: draft }))} /> : props.panel === 'objectives' || props.panel === 'help' ? <InformationPanel key={`${props.panel}-${feedback}`} props={props} feedback={feedback} /> : <div className="blackout-replay-slot">{props.replayContent ?? <PagedText text="The host supplies the recorded ledger, replay controls and equal-horizon comparison here. No computed results have been supplied." />}</div>}
          </div>
        </aside>}
        <DesktopCoach props={props} />
      </div>
      <footer className="blackout-dock" data-page={dockPage}>
        <button className="blackout-dock-page" aria-label="Switch crew and navigation dock" onClick={() => setDockPage(1 - dockPage)}>{dockPage ? 'Crew' : 'Menu'}</button>
        <div className="blackout-crew">{view.crew.map(crew => { const task = view.tasks.find(t => t.id === crew.taskId); return <button key={crew.id} aria-pressed={props.selectedCrewId === crew.id} onClick={() => { props.onSelectCrew(props.selectedCrewId === crew.id ? null : crew.id); if (crew.role !== 'remote') props.onTutorialEvent('crew_selected'); }}><DesktopPortrait role={crew.role} /><span><strong>{crew.role === 'remote' ? 'IT' : crew.role === 'facilities' ? 'Facilities' : 'Electrical'}</strong><small>{task ? task.status : crew.role === 'remote' ? 'Online' : 'Ready'}</small></span></button>; })}</div>
        <nav aria-label="Game panels">{(['command', 'radio', 'replay'] as const).map(panel => <button key={panel} aria-pressed={props.panel === panel} onClick={() => show(panel)}>{panel[0].toUpperCase() + panel.slice(1)}</button>)}<button aria-expanded={menu} onClick={() => setMenu(!menu)}>More</button></nav>
      </footer>
      {menu && <nav className="blackout-secondary-menu" aria-label="More game panels">{(['equipment', 'objectives', 'help'] as const).map(panel => <button key={panel} onClick={() => show(panel)}>{panel[0].toUpperCase() + panel.slice(1)}</button>)}<button disabled={!document.fullscreenEnabled || fullscreenError} onClick={() => { const request = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); void request.then(() => setMenu(false)).catch(() => setFullscreenError(true)); }}>{fullscreenError ? 'Use F11 for fullscreen' : fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}</button><button onClick={() => setMenu(false)}>Close menu</button></nav>}
    </div>
    {props.session === 'welcome' && <DesktopWelcome props={props} />}
    {terminal(view) && props.panel !== 'replay' && <div className="blackout-result" role="status"><strong>Mission {view.mission.status}</strong><button onClick={() => show('objectives')}>Review result</button><button onClick={() => show('replay')}>After action</button><button onClick={props.onRetry}>Retry</button></div>}
    {(props.notice || props.error) && props.session !== 'welcome' && <button className={`blackout-feedback${props.error ? ' blackout-feedback-error' : ''}`} onClick={() => { show('objectives'); setFeedback(true); }} aria-label={props.error ? 'Read error and feedback' : 'Read command feedback'}>{props.error ? 'Error · Details' : 'Receipt / notices'}</button>}
  </main>;
}
