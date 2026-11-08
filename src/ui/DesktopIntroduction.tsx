import { useEffect, useRef } from 'react';
import type { DesktopGameProps } from '../shared/contracts';
import { PagedText } from './DesktopPaging';

export function DesktopWelcome({ props }: { props: DesktopGameProps }) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => { dialog.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus(); }, []);
  return <div ref={dialog} className="blackout-welcome" role="dialog" aria-modal="true" aria-labelledby="blackout-welcome-title" onKeyDown={event => {
    if (event.key !== 'Tab') return;
    const buttons = [...(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1)?.focus(); }
    else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0]?.focus(); }
  }}>
    <h2 id="blackout-welcome-title">Your first shift.</h2>
    <PagedText text="You are the incident commander. Protect critical service while coordinating Alex in Facilities, Jules in Electrical, and Sam in remote IT.\n\nStart practice to learn movement, timestamped evidence, crew travel, technical inspection and delivered reports in a healthy facility. There is no incident deadline.\n\nE views already permitted equipment information. Repairs and observations remain the simulation’s responsibility. Your commander has no extra repair power.\n\nWhen you are ready, Start timed incident begins a new Hot Restart run at zero. Practice progress does not carry into the incident. You can skip practice or reopen Help at any time." label="Welcome briefing" />
    <button className="blackout-primary" onClick={props.onStartPractice}>Start practice</button>
    <button onClick={props.onStartMission}>Skip practice</button>
  </div>;
}

export function DesktopCoach({ props }: { props: DesktopGameProps }) {
  const coach = props.coach; if (!coach || props.session !== 'practice') return null;
  return <section className="blackout-coach" aria-label="Practice coach" data-training-target={coach.target ?? ''}>
    <div className="blackout-coach-title"><strong>Practice {coach.step + 1} / {coach.total}</strong><button onClick={() => props.onPanelChange('help')}>Instructions</button></div>
    <PagedText text={`${coach.title}\n${coach.text}`} label="Practice guidance" />
    {coach.step >= 7 && <button className="blackout-primary" onClick={props.onStartMission}>Start timed incident</button>}
  </section>;
}
