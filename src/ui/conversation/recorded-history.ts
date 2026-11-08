import type { SavedRunRecord, KnowledgeView } from '../../shared/contracts';
import { appendConversationEntry, conversationPeople, createConversations } from '../../shared/conversations';
const person = (actorId: string) => conversationPeople.find(actor => actor.actorId === actorId);
export function savedConversations(source?: SavedRunRecord, view?: KnowledgeView) {
  let threads = createConversations();
  for (const message of source?.dialogue ?? []) {
    const actorId = message.conversationActorId ?? (person(message.speaker) ? message.speaker : null);
    if (!actorId) continue;
    threads = appendConversationEntry(threads, { id: message.id, actorId, at: message.at, kind: message.conversationKind ?? (message.id.startsWith('report-') ? 'report' : message.mode === 'live' ? 'live' : 'system'), text: message.text, summary: message.text.length > 260 ? `${person(actorId)?.name} sent a saved message.` : message.text, unread: false, ...(message.id.startsWith('report-') ? { reportId: message.id } : {}) });
  }
  for (const interaction of source?.interactions ?? []) {
    const input = interaction.turns[0].input; if (input.kind !== 'start') continue;
    const id = `question:${input.requestId}`;
    if (!threads.find(thread => thread.actorId === input.actorId)?.entries.some(entry => entry.id === id)) threads = appendConversationEntry(threads, { id, actorId: input.actorId, at: interaction.turns[0].atSimTime, kind: 'player', text: input.message, unread: false });
  }
  return threads;
}
