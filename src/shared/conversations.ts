import type { ActionIntent, ConversationEntry, ConversationThread, KnowledgeView, ProposalAuthorization, RecordedInteraction } from './contracts';
import { ActionIntentSchema } from './schemas';
import { validAction } from '../llm/validation';
import { canonicalJson } from '../sim/replay/canonical';

export const conversationPeople = [
  { actorId: 'alex', name: 'Alex', role: 'Cooling' },
  { actorId: 'jules', name: 'Jules', role: 'Power' },
  { actorId: 'sam', name: 'Sam', role: 'IT' },
] as const;
export const createConversations = (): ConversationThread[] => conversationPeople.map(person => ({ ...person, assignment: { taskId: null, label: 'Ready', status: 'ready' }, entries: [], draft: '', busy: false, unread: 0, suggestedOrders: [] }));
export function updateConversation(threads: ConversationThread[], actorId: string, update: (thread: ConversationThread) => ConversationThread) {
  return threads.map(thread => thread.actorId === actorId ? update(thread) : thread);
}
export const setConversationDraft = (threads: ConversationThread[], actorId: string, draft: string) => updateConversation(threads, actorId, thread => ({ ...thread, draft: draft.slice(0, 1600) }));
export function appendConversationEntry(threads: ConversationThread[], entry: ConversationEntry) {
  return updateConversation(threads, entry.actorId, thread => {
    if (thread.entries.some(known => known.id === entry.id)) return thread;
    const entries = [...thread.entries, structuredClone(entry)];
    return { ...thread, entries, unread: entries.filter(message => message.unread).length };
  });
}
export function markConversationRead(threads: ConversationThread[], actorId: string, ids: string[]) {
  const read = new Set(ids);
  return updateConversation(threads, actorId, thread => {
    if (!thread.entries.some(entry => entry.unread && read.has(entry.id))) return thread;
    const entries = thread.entries.map(entry => entry.unread && read.has(entry.id) ? { ...entry, unread: false } : entry);
    return { ...thread, entries, unread: entries.filter(entry => entry.unread).length };
  });
}
export function hydrateConversationReport(threads: ConversationThread[], report: ConversationEntry) {
  const existing = threads.find(thread => thread.actorId === report.actorId)?.entries.find(entry => entry.id === report.id);
  if (!existing) return appendConversationEntry(threads, report);
  const hydrated = { ...existing, text: report.text, sections: report.sections, reportId: report.reportId };
  if (canonicalJson(hydrated) === canonicalJson(existing)) return threads;
  return updateConversation(threads, report.actorId, thread => ({ ...thread, entries: thread.entries.map(entry => entry.id === report.id ? hydrated : entry) }));
}
export function withConversationAssignments(threads: ConversationThread[], view: KnowledgeView) {
  return threads.map(thread => {
    const crew = view.crew.find(person => person.id === thread.actorId);
    const task = crew?.taskId ? view.tasks.find(task => task.id === crew.taskId) : [...view.tasks].reverse().find(task => task.actorId === thread.actorId && task.action !== 'move_crew');
    let assignment: ConversationThread['assignment'] = { taskId: null, label: 'Ready', status: 'ready' };
    if (task) {
      const target = view.knownTopology.assets.find(asset => asset.id === task.targetId)?.label ?? 'the site';
      if (task.status === 'traveling') assignment = { taskId: task.id, label: `Walking to ${target}`, status: 'walking' };
      else if (task.status === 'queued' || task.status === 'blocked') assignment = { taskId: task.id, label: task.status === 'queued' ? 'Waiting to start' : 'Task blocked', status: 'working' };
      else if (['working', 'inspecting', 'queued', 'blocked'].includes(task.status)) assignment = { taskId: task.id, label: `${task.action === 'inspect' ? 'Checking' : 'Working on'} ${target}`, status: task.action === 'inspect' ? 'checking' : 'working' };
      else if (task.status === 'completed') assignment = view.messages.some(message => message.id === `report-${task.id}`) ? { taskId: null, label: 'Report delivered', status: 'delivered' } : { taskId: null, label: 'Report on its way', status: 'report_pending' };
    }
    return { ...thread, assignment };
  });
}

/** Check the private token against the first exact wire turn that proposed this operation. */
export function authorizationMatchesOrigin(authorization: ProposalAuthorization, interaction: RecordedInteraction | null) {
  if (!interaction || ['canceled', 'reset', 'interrupted'].includes(interaction.end.reason) || interaction.end.reply?.kind === 'fallback' && interaction.end.reply.reason === 'stale_run') return false;
  const first = interaction.turns[0].input;
  if (first.kind !== 'start' || first.interactionMode !== 'advisory') return false;
  const seen = new Set<string>(); let index = 0;
  for (const turn of interaction.turns) {
    const proposals: ActionIntent[] = turn.reply?.kind === 'final' ? turn.reply.response.proposals : turn.reply?.kind === 'tool_request' && turn.reply.intent.tool === 'propose_action' && turn.reply.intent.action && turn.toolResult?.status === 'completed' && turn.toolResult.reason === 'player_confirmation_required' ? [turn.reply.intent.action] : [];
    for (const intent of proposals) {
      if (!validAction(intent, { ...first, view: turn.input.view }) || turn.input.view.observedEntityVersions[intent.targetId] === undefined) continue;
      const key = canonicalJson([intent.action, intent.targetId, intent.args]); if (seen.has(key)) continue; seen.add(key); index++;
      const expected: ProposalAuthorization = { id: `${first.requestId}:proposal:${index}`, runId: turn.input.runId, actorId: turn.input.actorId, requestId: turn.input.requestId, intent, expectedEntityVersions: turn.input.view.observedEntityVersions };
      if (expected.id === authorization.id) return canonicalJson(expected) === canonicalJson(authorization);
    }
  }
  return false;
}

/** Tokens are single-use host authorization; no selected tab or refreshed version input exists. */
export class ProposalBook {
  private proposals = new Map<string, { authorization: ProposalAuthorization; requestId: string; idempotencyKey: string; taken: boolean }>();
  constructor(private readonly runId: string) {}
  register(input: ProposalAuthorization) {
    if (input.runId !== this.runId) throw new Error('Proposal belongs to another run.');
    if (!conversationPeople.some(person => person.actorId === input.actorId) || !input.id || !input.requestId || !ActionIntentSchema.safeParse(input.intent).success || input.intent.action === 'move_crew') throw new Error('Invalid conversation proposal.');
    if (Object.values(input.expectedEntityVersions).some(version => !Number.isInteger(version) || version < 0)) throw new Error('Invalid proposal versions.');
    const previous = this.proposals.get(input.id);
    if (previous) { if (JSON.stringify(previous.authorization) !== JSON.stringify(input)) throw new Error('Conflicting proposal identity.'); return; }
    this.proposals.set(input.id, { authorization: structuredClone(input), requestId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID(), taken: false });
  }
  take(id: string) {
    const proposal = this.proposals.get(id);
    if (!proposal || proposal.taken) return null;
    proposal.taken = true;
    return structuredClone({ authorization: proposal.authorization, requestId: proposal.requestId, idempotencyKey: proposal.idempotencyKey });
  }
}
