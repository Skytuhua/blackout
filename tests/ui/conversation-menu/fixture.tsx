import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/pixelify-sans/latin-600.css';
import '@fontsource/ibm-plex-sans/latin-400.css';
import { ConversationMenu, type ConversationMenuProps } from '../../../src/ui/conversation-menu';
import type { ConversationThread } from '../../../src/shared/contracts';
import { PagedText } from '../../../src/ui/DesktopPaging';

export const longText = Array.from({ length: 35 }, (_, i) => `Evidence ${i}: Synthetic cooling observation retained exactly.\n`).join('');
const threads: ConversationThread[] = ['alex', 'jules', 'sam'].map((actorId, actor) => ({
  actorId, name: ['Alex', 'Jules', 'Sam'][actor], role: (['Cooling', 'Power', 'IT'] as const)[actor],
  assignment: { taskId: null, label: 'Ready', status: 'ready' }, draft: `Retained ${actorId} draft`, busy: false, unread: 25, suggestedOrders: [],
  entries: Array.from({ length: 25 }, (_, i) => ({
    id: `${actorId}-${i}`, actorId, at: i, kind: i === 0 ? 'report' : 'live', unread: true,
    text: i === 0 ? longText : `${actorId} whole entry ${i}.`,
    ...(i === 0 ? { reportId: 'old-report-original-id', summary: 'Original inspection report.', sections: [{ id: 'original-evidence', label: 'Evidence', text: 'Original section, complete.' }], proposals: [{ id: 'opaque-original-proposal-id', label: 'Check controls', assignedName: 'Jules', status: 'ready' as const }] } : {}),
  })),
}));
type FixtureEvent = { name: string; args: unknown[] };
declare global { interface Window { menuFixture: { events: FixtureEvent[]; patch: (patch: Partial<ConversationMenuProps>) => void; longText: string }; menuFixtureProps: ConversationMenuProps } }
function Fixture() {
  const [open, setOpen] = useState(false);
  const record = (name: string, ...args: unknown[]) => window.menuFixture.events.push({ name, args });
  const [data, setData] = useState<Partial<ConversationMenuProps>>({});
  window.menuFixture = { events: window.menuFixture?.events ?? [], patch: patch => setData(previous => ({ ...previous, ...patch })), longText };
  const props: ConversationMenuProps = {
    conversations: threads, selectedActorId: 'alex', reader: null,
    savedRuns: [{ runId: 'save-original-A', scenarioId: 'Hot Restart', simTime: 80 }, { runId: 'unavailable-original-B', scenarioId: 'Older mission', simTime: 42, unavailableReason: 'VERSION_MISMATCH: Cannot resume with this build. Original bytes remain exportable.' }],
    busy: false, notice: '', error: '', guidanceEnabled: true, speed: 1,
    afterActionContent: <section className="fixture-advanced"><label>Earlier second<input aria-label="Earlier second" defaultValue="10" /></label><PagedText text={longText} label="Advanced evidence" /><button onClick={() => record('advanced')}>Compare recorded cap</button></section>,
    onClose: () => { record('close'); setOpen(false); }, onSave: () => record('save'), onRefreshSaves: () => record('refresh'),
    onResumeSave: id => record('resume', id), onReplaySave: id => record('replay', id), onExportSave: id => record('export', id),
    onOpenEntry: (actorId, entryId) => { record('open', actorId, entryId); setData(previous => ({ ...previous, reader: { actorId, entryId } })); },
    onCloseEntry: () => { record('close-entry'); setData(previous => ({ ...previous, reader: null })); },
    onReadEntries: (actorId, ids) => record('read', actorId, ids), onExecuteProposal: id => record('proposal', id),
    onGuidanceChange: value => record('guidance', value), onSpeed: value => record('speed', value),
    onRestart: () => record('restart'), onStartPractice: () => record('practice'), ...data,
  };
  window.menuFixtureProps = props;
  return <><button id="opener" onClick={() => setOpen(true)}>Open menu fixture</button><button>Background control</button>{open && <ConversationMenu {...props} />}</>;
}
const style = document.createElement('style');
style.textContent = 'html,body{margin:0;background:#050c20;color:#edf1ff;font:16px "IBM Plex Sans",sans-serif} .fixture-advanced{display:flex;flex:1;min-height:0;flex-direction:column;gap:8px}.fixture-advanced label{display:flex;gap:8px}.fixture-advanced input{min-width:0;width:80px}';
document.head.append(style);
createRoot(document.getElementById('root')!).render(<Fixture />);
