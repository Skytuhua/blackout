import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/pixelify-sans/latin-600.css';
import '@fontsource/pixelify-sans/latin-700.css';
import '@fontsource/ibm-plex-sans/latin-400.css';
import { ConversationGame } from './ConversationGame';
import type { ConversationGameProps, ConversationThread } from '../../shared/contracts';
import { desktopFixtureView } from '../desktop-fixture-data';
import { conversationSceneFor } from '../../game/ConversationMap';

const longText = 'Synthetic report only. Cooling inspection details remain available in full.\n'.repeat(22);
const initial: ConversationThread[] = ['alex', 'jules', 'sam'].map((actorId, index) => ({ actorId, name: ['Alex', 'Jules', 'Sam'][index], role: (['Cooling', 'Power', 'IT'] as const)[index], assignment: { taskId: null, label: 'Ready for an order', status: 'ready' }, draft: '', busy: false, unread: 0,
  entries: Array.from({ length: index === 0 ? 15 : 2 }, (_, i) => ({ id: `${actorId}-${i}`, actorId, at: i * 5, kind: i === 14 ? 'report' : 'fallback', text: i === 14 ? longText : `Synthetic message ${i + 1}. No engine or provider is attached.`, unread: false, ...(i === 14 ? { summary: 'Inspection finished. Open the full findings.', sections: [{ id: 'evidence', label: 'Evidence', text: 'Synthetic evidence.\n'.repeat(30) }] } : {}) })),
  suggestedOrders: [{ id: `${actorId}-inspect`, actorId, label: index === 2 ? 'Pause background jobs' : 'Check cooling controls', enabled: true }, { id: `${actorId}-verify`, actorId, label: 'Check recovery', enabled: true }],
}));
const events: { name: string; args: unknown[] }[] = [];
function Fixture() {
  const [view, setView] = useState(desktopFixtureView), [threads, setThreads] = useState(initial), [selected, setSelected] = useState('alex'), [asset, setAsset] = useState<string | null>(null), [reader, setReader] = useState<ConversationGameProps['reader']>(null), [paused, setPaused] = useState(true), [menu, setMenu] = useState(false), [session, setSession] = useState<ConversationGameProps['session']>(location.search.includes('welcome') ? 'welcome' : 'mission');
  const record = (name: string, ...args: unknown[]) => { events.push({ name, args }); };
  Object.assign(window, { convFixture: { events, longText, threads, selected, setThreads, setSelected, setView, scene: () => { const element = document.querySelector<HTMLElement>('.conv-canvas'); return element ? conversationSceneFor(element) : undefined; } } });
  return <ConversationGame view={view} session={session} selectedActorId={selected} selectedAssetId={asset} conversations={threads} paused={paused} speed={1} busy={false} objective="Cooling stopped. Reduce the heat." alerts={[{ id: 'synthetic', level: 'warning', text: 'Synthetic fixture · no engine or provider attached.' }]} guidance={{ enabled: true, paused: true, text: 'Select Sam, then choose Pause background jobs.', canContinue: true }} reader={reader} menuOpen={menu} menuContent={<p>Synthetic menu slot. Host supplies save, replay and evidence.</p>}
    onSelectActor={id => { record('selectActor', id); setSelected(id); setReader(null); }} onSelectAsset={id => { record('selectAsset', id); setAsset(id); }} onDraftChange={(id, draft) => { record('draft', id, draft); setThreads(current => current.map(thread => thread.actorId === id ? { ...thread, draft } : thread)); }} onSend={id => record('send', id)} onReadEntries={(id, ids) => { record('read', id, ids); setThreads(current => current.map(thread => thread.actorId === id ? { ...thread, entries: thread.entries.map(entry => ids.includes(entry.id) ? { ...entry, unread: false } : entry) } : thread)); }} onOpenEntry={(actorId, entryId) => { record('open', actorId, entryId); setReader({ actorId, entryId }); }} onCloseEntry={() => setReader(null)} onExecuteProposal={id => record('proposal', id)} onSuggestedOrder={id => record('suggestion', id)} onStopTask={(id, taskId) => record('stop', id, taskId)} onWait={id => record('wait', id)} onPause={() => setPaused(current => !current)} onSpeed={speed => record('speed', speed)} onContinueGuide={() => record('continue')} onSetGuidance={enabled => record('guidance', enabled)} onMenuToggle={() => setMenu(current => !current)} onStartGuided={() => { record('guided'); setSession('mission'); }} onStartPractice={() => { record('practice'); setSession('practice'); }} />;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
