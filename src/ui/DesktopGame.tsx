import { useState } from 'react';
import { CircleHelp, ClipboardList, Cpu, Maximize2, Pause, Play, Radio, RotateCcw, SkipForward, Terminal, X } from 'lucide-react';
import type { DesktopGameProps, DesktopPanel } from '../shared/contracts';
import { DesktopMap } from '../game/DesktopMap';
import { terminal } from '../game/desktop-world';
import './DesktopGame.css';

export const desktopTime = (seconds: number) => `T+${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const navigation = [['equipment', 'Equipment', Cpu], ['command', 'Command', Terminal], ['radio', 'Radio', Radio], ['objectives', 'Objectives', ClipboardList], ['replay', 'Replay', SkipForward], ['help', 'Help', CircleHelp]] as const;

export function DesktopGame(props: DesktopGameProps) { return <DesktopSurface key={props.view.runId} {...props} />; }
function DesktopSurface(props: DesktopGameProps) {
  const { view } = props, [focus, setFocus] = useState(false), [dockPage, setDockPage] = useState(0);
  const asset = view.knownTopology.assets.find(a => a.id === props.selectedAssetId);
  const panelTitle = props.panel === 'equipment' ? asset?.label ?? 'Equipment' : props.panel ? props.panel[0].toUpperCase() + props.panel.slice(1) : 'Your shift';
  const show = (panel: DesktopPanel) => props.onPanelChange(panel);
  return <main className={`blackout-desktop${focus ? ' blackout-focus' : ''}`}>
    <header className="blackout-top">
      <h1>BLACKOUT</h1><span className="blackout-mission-name">{props.session === 'practice' ? 'PRACTICE' : 'HOT RESTART'}</span>
      <button className="blackout-top-status" onClick={() => show('objectives')}><i className={view.summary.criticalServedFraction === 1 ? 'blackout-led' : 'blackout-led blackout-led-warn'} />Service {view.summary.criticalServedFraction === null ? 'unknown' : `${Math.round(view.summary.criticalServedFraction * 100)}%`}</button>
      <span className="blackout-top-reading">{view.summary.hottestTemperatureC === null ? 'Temperature unknown' : `${view.summary.hottestTemperatureC.toFixed(1)} °C`}<small>{desktopTime(view.summary.observedAt)}</small></span>
      <span className="blackout-top-reading">{view.summary.sourceHeadroomKw === null ? 'Power unknown' : `${view.summary.sourceHeadroomKw.toFixed(0)} kW headroom`}</span>
      <div className="blackout-playback"><button aria-label={props.paused ? 'Resume simulation' : 'Pause simulation'} onClick={props.onPause} disabled={terminal(view) || props.session === 'welcome'}>{props.paused ? <Play size={18} /> : <Pause size={18} />}</button>{([1, 2, 4] as const).map(speed => <button key={speed} aria-pressed={props.speed === speed} onClick={() => props.onSpeed(speed)}>{speed}x</button>)}</div>
      <time>{desktopTime(view.simTime)}</time>
    </header>
    <div className="blackout-play-area"><DesktopMap {...props} />
      <aside className="blackout-panel" aria-label={`${panelTitle} panel`}>
        <header className="blackout-panel-heading"><h2>{panelTitle}</h2><button aria-label={focus ? 'Return to side panel' : 'Enlarge text panel'} onClick={() => setFocus(!focus)}><Maximize2 size={16} /></button><button aria-label="Return to world" onClick={() => { show(null); setFocus(false); }}><X size={16} /></button></header>
        <div className="blackout-panel-content">
          {props.panel === 'replay' ? props.replayContent ?? <p>A recorded mission’s replay and computed debrief will appear here.</p> : props.panel === 'equipment' ? <><label>Equipment<select value={props.selectedAssetId ?? ''} onChange={e => { props.onSelectAsset(e.target.value); props.onTutorialEvent('equipment_opened'); }}><option value="">Choose equipment</option>{view.knownTopology.assets.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label><p>{asset ? `Known ${asset.kind}. Information comes from permitted observations.` : 'Choose equipment on the map or from this list.'}</p></> : <><h3>{props.coach?.title ?? 'You are the incident commander.'}</h3><p>{props.coach?.text ?? 'Walk the facility, check timestamped evidence, and coordinate your crew to protect critical service.'}</p><p>Alex · Facilities<br />Jules · Electrical<br />Sam · Remote IT</p><button onClick={() => show('equipment')}>Inspect equipment</button><button onClick={() => show('command')}>Site commands</button></>}
        </div>
      </aside>
    </div>
    <footer className="blackout-dock" data-page={dockPage}>
      <button className="blackout-dock-page" aria-label="Switch crew and navigation dock" onClick={() => setDockPage(1 - dockPage)}>{dockPage ? 'Crew' : 'Menu'}</button>
      <div className="blackout-crew">{view.crew.map(crew => { const task = view.tasks.find(t => t.id === crew.taskId); return <button key={crew.id} aria-pressed={props.selectedCrewId === crew.id} onClick={() => { props.onSelectCrew(props.selectedCrewId === crew.id ? null : crew.id); props.onTutorialEvent('crew_selected'); }}><span className={`blackout-portrait blackout-portrait-${crew.role}`} aria-hidden="true" /><span><strong>{crew.role === 'remote' ? 'IT · Sam' : crew.role === 'facilities' ? 'Facilities · Alex' : 'Electrical · Jules'}</strong><small>{task ? task.status : crew.role === 'remote' ? 'Online' : 'Ready'}</small></span></button>; })}</div>
      <nav aria-label="Game panels">{navigation.map(([panel, label, Icon]) => <button key={panel} aria-pressed={props.panel === panel} onClick={() => show(panel)}><Icon size={16} /><span>{label}</span></button>)}</nav>
    </footer>
    {props.session === 'welcome' && <div className="blackout-welcome" role="dialog" aria-modal="true" aria-labelledby="blackout-welcome-title"><h2 id="blackout-welcome-title">Your first shift.</h2><p>You are the incident commander. Keep critical service running while coordinating two field technicians and a remote IT operator.</p><p>Learn the controls in a healthy facility with no deadline, then start the timed Hot Restart incident.</p><button className="blackout-primary" onClick={props.onStartPractice}>Start safe practice</button><button onClick={props.onStartMission}>Skip practice · Start incident</button></div>}
    {terminal(view) && props.panel !== 'replay' && <div className="blackout-result" role="status"><strong>Mission {view.mission.status}</strong><span>{view.mission.reason}</span><button onClick={() => show('replay')}>After action</button><button onClick={props.onRetry}><RotateCcw size={16} /> Retry</button></div>}
  </main>;
}
