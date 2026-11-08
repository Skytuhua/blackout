import type { PublicMessage, RecordedInteraction, RunRecord, SavedRunRecord } from '../shared/contracts';
import { PublicMessageSchema, RecordedInteractionSchema } from '../shared/schemas';
import { canonicalJson } from '../sim/replay/canonical';
import { ReplayDataError } from '../sim/replay/validation';
import { validateSavedRun } from './saved-record';

const equal = (left: unknown, right: unknown) => canonicalJson(left) === canonicalJson(right);
const identityError = (detail: string): never => { throw new ReplayDataError('IDENTITY_MISMATCH', detail); };

function mergeMessages(target: Map<string, PublicMessage>, messages: PublicMessage[]) {
  for (const message of messages) {
    const previous = target.get(message.id);
    if (previous && !equal(previous, message)) identityError('Conflicting public message identity.');
    if (!previous) target.set(message.id, structuredClone(message));
  }
}

/** Host-only recorder. Wire inputs are already captured by runCoworker, never reconstructed here. */
export class HostArchive {
  private readonly source?: SavedRunRecord;
  private readonly interactions: RecordedInteraction[];
  private readonly requests = new Map<string, RecordedInteraction>();
  private readonly messages = new Map<string, PublicMessage>();
  private readonly lineage: SavedRunRecord['lineage'];

  constructor(private readonly runId: string, source?: SavedRunRecord) {
    if (!runId || runId.length > 120) identityError('Invalid host run identity.');
    this.source = source === undefined ? undefined : validateSavedRun(source);
    if (this.source && (this.source.runId === runId || this.source.lineage.some(row => row.runId === runId))) identityError('A resumed run requires a new identity.');
    this.interactions = structuredClone(this.source?.interactions ?? []);
    this.lineage = this.source ? [...structuredClone(this.source.lineage), { runId: this.source.runId, throughSimTime: this.source.finalCheckpoint.simTime }] : [];
    mergeMessages(this.messages, this.source?.dialogue ?? []);
  }

  capture(interaction: RecordedInteraction | null): void {
    if (interaction === null) return;
    const parsed = RecordedInteractionSchema.safeParse(interaction);
    if (!parsed.success) throw new ReplayDataError('CORRUPT', 'Invalid recorded interaction.');
    const first = interaction.turns[0].input;
    if (first.kind !== 'start' || first.runId !== this.runId) identityError('Captured interaction belongs to another run.');
    const previous = this.requests.get(first.requestId);
    if (previous) {
      if (!equal(previous, interaction)) identityError('Conflicting captured request identity.');
      return;
    }
    const captured = structuredClone(interaction);
    this.requests.set(first.requestId, captured);
    this.interactions.push(captured);
  }

  message(message: PublicMessage): void {
    if (!PublicMessageSchema.safeParse(message).success) throw new ReplayDataError('CORRUPT', 'Invalid public message.');
    mergeMessages(this.messages, [message]);
  }

  build(record: RunRecord): SavedRunRecord {
    if (record.runId !== this.runId) identityError('Engine record belongs to another host run.');
    const dialogue = new Map(this.messages);
    mergeMessages(dialogue, record.dialogue);
    const provenance = structuredClone(this.source?.provenance ?? record.provenance);
    // Null metadata means unobserved, so it cannot erase previously observed provenance.
    for (const interaction of this.requests.values()) {
      const first = interaction.turns[0].input;
      if (first.kind === 'start') provenance.promptVersion = first.promptVersion;
      for (const turn of interaction.turns) if (turn.call) provenance.model = turn.call.model;
    }
    const interactions = [...this.interactions.slice(0, this.source?.interactions.length ?? 0), ...[...this.requests.values()].sort((a, b) => a.turns[0].atSimTime - b.turns[0].atSimTime)];
    return validateSavedRun({ ...structuredClone(record), schemaVersion: 2, dialogue: [...dialogue.values()].sort((a, b) => a.at - b.at), provenance, lineage: structuredClone(this.lineage), interactions: structuredClone(interactions) });
  }
}
