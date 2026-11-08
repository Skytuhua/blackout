import type { SavedRunRecord, KnowledgeView } from '../../shared/contracts';
import { appendConversationEntry, conversationPeople, createConversations } from '../../shared/conversations';
import { reportSections } from './report-findings';
const person = (actorId: string) => conversationPeople.find(actor => actor.actorId === actorId);
export function savedConversations(source?: SavedRunRecord, view?: KnowledgeView) {
  let threads = createConversations();
  for (const message of source?.dialogue ?? []) {
    if (view && message.at > view.simTime) continue;
    const actorId = message.conversationActorId ?? (person(message.speaker) ? message.speaker : null);
    if (!actorId) continue;
    const report = message.id.startsWith('report-');
    // Reissuing accepted commands can renumber task/report IDs after rejected attempts.
    // Retain the source ID, but require the same delivered public evidence at this cursor.
    if (report && view && !view.messages.some(delivered => delivered.speaker === message.speaker && delivered.at === message.at && delivered.evidenceIds.length === message.evidenceIds.length && message.evidenceIds.every(id => delivered.evidenceIds.includes(id)))) continue;
    threads = appendConversationEntry(threads, { id: message.id, actorId, at: message.at, kind: message.conversationKind ?? (report ? 'report' : message.mode === 'live' ? 'live' : 'system'), text: message.text, summary: message.text.length > 260 ? `${person(actorId)?.name} sent a saved message.` : message.text, unread: false, ...(report ? { reportId: message.id, ...(view ? { sections: reportSections(message, view) } : {}) } : {}) });
  }
  for (const interaction of source?.interactions ?? []) {
    if (view && interaction.turns[0].atSimTime > view.simTime) continue;
    const input = interaction.turns[0].input; if (input.kind !== 'start') continue;
    const id = `question:${input.requestId}`;
    if (!threads.find(thread => thread.actorId === input.actorId)?.entries.some(entry => entry.id === id)) threads = appendConversationEntry(threads, { id, actorId: input.actorId, at: interaction.turns[0].atSimTime, kind: 'player', text: input.message, unread: false });
  }
  return threads;
}
