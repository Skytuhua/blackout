import { expect, it } from 'vitest';
import { appendConversationEntry, authorizationMatchesOrigin, createConversations, markConversationRead, ProposalBook, setConversationDraft } from '../../src/shared/conversations';
import type { ConversationEntry, GatewayStart, ProposalAuthorization, RecordedInteraction } from '../../src/shared/contracts';
import { initialize } from '../../src/sim/engine';
import { hotRestart } from '../../src/content/scenarios/hot-restart';

const entry = (actorId: string, id: string): ConversationEntry => ({ id, actorId, at: 0, kind: 'report', text: id, unread: true });
it('retains actor-owned drafts, more than eight entries and late replies without cross-character reads', () => {
  let threads = createConversations();
  threads = setConversationDraft(threads, 'alex', 'Cooling question'); threads = setConversationDraft(threads, 'sam', 'IT question');
  for (let i = 0; i < 12; i++) threads = appendConversationEntry(threads, entry('alex', `report-${i}`));
  threads = appendConversationEntry(threads, entry('sam', 'sam-report'));
  threads = markConversationRead(threads, 'sam', ['report-0', 'sam-report']);
  expect(threads.find(t => t.actorId === 'alex')).toMatchObject({ draft: 'Cooling question', unread: 12 });
  expect(threads.find(t => t.actorId === 'alex')!.entries).toHaveLength(12);
  expect(threads.find(t => t.actorId === 'sam')).toMatchObject({ draft: 'IT question', unread: 0 });
  threads = appendConversationEntry(threads, entry('alex', 'late')); expect(threads.find(t => t.actorId === 'alex')!.entries.at(-1)!.id).toBe('late');
  expect(appendConversationEntry(threads, entry('alex', 'late'))).toEqual(threads);
});
it('takes an original proposal once, without accepting a selected tab or current version vector', () => {
  const auth: ProposalAuthorization = { id: 'proposal', runId: 'run', actorId: 'alex', requestId: 'exchange', intent: { action: 'inspect', targetId: 'controller', atSimTime: 10, args: { technicianId: 'alex' } }, expectedEntityVersions: { controller: 1, alex: 2 } };
  const book = new ProposalBook('run'); book.register(auth); auth.expectedEntityVersions.alex = 99;
  expect(book.take('unknown')).toBeNull(); expect(book.take('proposal')!.authorization.expectedEntityVersions).toEqual({ controller: 1, alex: 2 });
  expect(book.take('proposal')).toBeNull();
  expect(() => book.register({ ...auth, id: 'other', runId: 'old-run' })).toThrow(/run/);
});

it('accepts only the exact original wire proposal snapshot, including its originating actor', () => {
  const engine = initialize(hotRestart, 'run'); engine.step(10);
  const start: GatewayStart = { kind: 'start', runId: 'run', requestId: 'exchange', actorId: 'alex', role: 'facilities', interactionMode: 'advisory', message: 'Check the controls', view: engine.observe('alex'), procedures: [], promptVersion: 'test' };
  const intent = { action: 'inspect' as const, targetId: 'controller', atSimTime: 10, args: { technicianId: 'alex' } };
  const reply = { kind: 'final' as const, runId: 'run', requestId: 'exchange', actorId: 'alex', response: { runId: 'run', requestId: 'exchange', actorId: 'alex', speaker: 'alex', mode: 'live' as const, facts: [], inference: 'I can inspect the controls.', uncertainty: '', proposals: [intent] } };
  const recording: RecordedInteraction = { turns: [{ atSimTime: 10, input: start, reply, call: null, toolResult: null }], end: { atSimTime: 10, reason: 'final', reply, durationMs: 1 } };
  const auth: ProposalAuthorization = { id: 'exchange:proposal:1', runId: 'run', requestId: 'exchange', actorId: 'alex', intent, expectedEntityVersions: structuredClone(start.view.observedEntityVersions) };
  expect(authorizationMatchesOrigin(auth, recording)).toBe(true);
  expect(authorizationMatchesOrigin({ ...auth, actorId: 'sam' }, recording)).toBe(false);
  expect(authorizationMatchesOrigin({ ...auth, expectedEntityVersions: { ...auth.expectedEntityVersions, alex: 99 } }, recording)).toBe(false);
  expect(authorizationMatchesOrigin({ ...auth, intent: { ...intent, atSimTime: 11 } }, recording)).toBe(false);
});
