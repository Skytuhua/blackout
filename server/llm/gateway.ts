import { randomUUID } from 'node:crypto';
import type { GatewayInput, GatewayResponse, GatewayStart, ToolIntent, PublicToolResult, Observation } from '../../src/shared/contracts';
import { GatewayInputSchema } from '../../src/shared/schemas';
import { validStart, validAction, validateResponse } from '../../src/llm/validation';
import { Budget } from './budget';
import { conciseCoworkerResponse, projectCoworkerContext } from '../../src/llm/conversation-policy';
import { usesConversationPolicy } from '../../src/llm/conversation-mode';
import type { ProviderCall } from '../../src/llm/diagnostics';
import { initialHistory, parameters, decode, appendOutput, appendToolResult, appendFreshView, officialTransport, type History, type Transport } from './adapter';
type Options = { mode?: string; keyConfigured?: boolean; transport?: Transport; budget?: Budget; callTimeoutMs?: number; interactionTimeoutMs?: number; debriefTimeoutMs?: number };
type Interaction = { start: GatewayStart; history: History; evidence: Map<string, Observation>; calls: number; controller: AbortController; deadline: number; pending?: ToolIntent; fingerprint: string; reply?: GatewayResponse; busy: boolean; expires: ReturnType<typeof setTimeout> };
const sameIdentity = (a: { runId: string; requestId: string; actorId: string }, b: typeof a) => a.runId === b.runId && a.requestId === b.requestId && a.actorId === b.actorId;
export class Gateway {
  private interactions = new Map<string, Interaction>();
  private providerBusy = false;
  private recent: ProviderCall[] = [];
  private receipts = new WeakMap<GatewayResponse, ProviderCall>();
  get diagnostics(): readonly ProviderCall[] { return this.recent.map(item => ({ ...item })); }
  receiptFor(reply: GatewayResponse): ProviderCall | undefined { const call = this.receipts.get(reply); return call && { ...call }; }
  remainingMs(identity: { runId: string; requestId: string; actorId: string }): number | undefined {
    const state = [...this.interactions.values()].find(s => sameIdentity(s.start, identity));
    return state ? Math.max(0, Math.min(20000, Math.floor(state.deadline - Date.now()))) : undefined;
  }
  private makeRoom() {
    for (const [id, state] of this.interactions) {
      if (this.interactions.size < 128) break;
      if (!state.busy && (state.controller.signal.aborted || Date.now() >= state.deadline || state.reply && state.reply.kind !== 'tool_request')) {
        clearTimeout(state.expires); this.interactions.delete(id);
      }
    }
  }
  private options: Options;
  private transport: Transport;
  private budget: Budget;
  constructor(options: Options = {}) {
    this.options = options; this.transport = options.transport ?? officialTransport();
    this.budget = options.budget ?? new Budget(process.env.LLM_USAGE_LEDGER_PATH ?? '.local/usage.json', Number(process.env.LLM_SESSION_BUDGET_USD ?? 5));
  }
  private fallback(input: GatewayInput, reason: string): GatewayResponse {
    return { kind: 'fallback', runId: input.runId, requestId: input.requestId, actorId: input.actorId, mode: 'scripted', reason, message: 'Scripted fallback: consult permitted observations and procedures. Inspection and player actions remain available.', facts: [] };
  }
  cancel(identity: { runId: string; requestId: string; actorId: string }) {
    for (const state of this.interactions.values()) if (sameIdentity(state.start, identity)) { state.controller.abort('canceled'); clearTimeout(state.expires); }
  }
  private validResult(result: PublicToolResult, state: Interaction, input: Extract<GatewayInput, { kind: 'continue' }>): boolean {
    const intent = state.pending;
    if (!intent || !sameIdentity(result, intent) || result.callId !== intent.callId || result.interactionId !== intent.interactionId || input.expectedCallId !== intent.callId) return false;
    if (intent.tool !== 'inspect_asset' && (result.receipt !== null || result.status === 'accepted')) return false;
    if (intent.tool === 'inspect_asset' && (result.status === 'completed' || result.status === 'accepted' && (!result.receipt || result.receipt.status === 'rejected'))) return false;
    if (intent.tool !== 'read_observations' && result.observations.length > 0) return false;
    if (intent.tool !== 'read_procedure' && result.procedureText !== null) return false;
    if (result.receipt && (!sameIdentity(result.receipt, intent) || result.receipt.evidenceIds.some(id => !input.view.observations.some(o => o.id === id)))) return false;
    if (result.observations.some(o => o.assetId !== intent.targetId || !input.view.observations.some(known => JSON.stringify(known) === JSON.stringify(o)))) return false;
    if (result.procedureText !== null && !state.start.procedures.some(p => p.id === intent.targetId && p.text === result.procedureText)) return false;
    return true;
  }
  async turn(raw: GatewayInput, signal?: AbortSignal): Promise<GatewayResponse> {
    const parsed = GatewayInputSchema.safeParse(raw);
    if (!parsed.success) return this.fallback(raw, 'invalid_payload');
    const rawInput = parsed.data;
    const input = rawInput.kind === 'start' && usesConversationPolicy(rawInput) ? projectCoworkerContext(rawInput) : rawInput;
    if (signal?.aborted) return this.fallback(input, 'canceled');
    if ((this.options.mode ?? process.env.LLM_MODE ?? 'scripted') !== 'live') return this.fallback(input, 'scripted');
    if (!(this.options.keyConfigured ?? Boolean(process.env.OPENAI_API_KEY))) return this.fallback(input, 'missing_key');
    let state: Interaction;
    const fingerprint = JSON.stringify(input);
    if (input.kind === 'start') {
      if (!validStart(input)) return this.fallback(input, 'invalid_scope');
      const existing = [...this.interactions.values()].find(s => sameIdentity(s.start, input));
      if (existing) return existing.controller.signal.aborted ? this.fallback(input, 'canceled') : existing.fingerprint === fingerprint && existing.reply ? existing.reply : this.fallback(input, 'duplicate_or_busy');
      if (this.providerBusy) return this.fallback(input, 'provider_busy');
      if ([...this.interactions.values()].some(s => s.start.actorId === input.actorId && !s.reply && !s.controller.signal.aborted || s.start.actorId === input.actorId && s.reply?.kind === 'tool_request' && !s.controller.signal.aborted)) return this.fallback(input, 'interaction_busy');
      this.makeRoom();
      if (this.interactions.size >= 128) return this.fallback(input, 'interaction_limit');
      const id = randomUUID(), controller = new AbortController();
      const duration = input.role === 'debrief' ? this.options.debriefTimeoutMs ?? 20000 : this.options.interactionTimeoutMs ?? 18000;
      const expires = setTimeout(() => controller.abort('interaction_timeout'), duration); expires.unref();
      state = { start: input, history: initialHistory(input), evidence: new Map(input.view.observations.map(o => [o.id, o])), calls: 0, controller, deadline: Date.now() + duration, fingerprint, busy: false, expires };
      this.interactions.set(id, state);
    } else {
      const found = this.interactions.get(input.interactionId);
      if (!found || !sameIdentity(found.start, input)) return this.fallback(input, 'invalid_interaction');
      state = found;
      if (state.controller.signal.aborted || Date.now() >= state.deadline) return this.fallback(input, 'canceled_or_expired');
      if (state.fingerprint === fingerprint && state.reply) return state.reply;
      if (state.busy || !this.validResult(input.result, state, input) || input.view.runId !== input.runId || input.view.actorId !== input.actorId) return this.fallback(input, 'invalid_tool_result');
      if (this.providerBusy) return this.fallback(input, 'provider_busy');
      state.history = appendToolResult(state.history, input.expectedCallId, input.result);
      const fresh = { ...state.start, view: input.view };
      state.start = usesConversationPolicy(fresh) ? { ...projectCoworkerContext(fresh), procedures: state.start.procedures } : fresh; state.pending = undefined; state.fingerprint = fingerprint;
      for (const observation of input.view.observations) state.evidence.set(observation.id, observation);
      state.history = appendFreshView(state.history, state.start);
    }
    const interactionId = [...this.interactions.entries()].find(([, s]) => s === state)![0];
    const abort = () => state.controller.abort('canceled'); signal?.addEventListener('abort', abort, { once: true });
    state.busy = true;
    let receipt: ProviderCall | undefined;
    try {
      if (state.calls >= (state.start.role === 'debrief' ? 1 : 3)) throw new Error('interaction_quota');
      const params = parameters(state.start, state.history, state.calls + 1);
      // Plan at two UTF-8 bytes per token, including every schema and history item.
      if (Math.ceil(Buffer.byteLength(JSON.stringify(params), 'utf8') / 2) > 6000) throw new Error('input_limit');
      const reservation = this.budget.reserve(6000, state.start.role === 'debrief' ? 800 : 400, input.runId, params.model);
      state.calls++; this.providerBusy = true;
      const callController = new AbortController();
      const timeout = setTimeout(() => callController.abort('call_timeout'), state.start.role === 'debrief' ? this.options.debriefTimeoutMs ?? 20000 : this.options.callTimeoutMs ?? 8000);
      const close = () => callController.abort(state.controller.signal.reason); state.controller.signal.addEventListener('abort', close, { once: true });
      let rejectAbort!: (reason: Error) => void;
      const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
      const onAbort = () => rejectAbort(new Error(String(callController.signal.reason ?? 'canceled')));
      callController.signal.addEventListener('abort', onAbort, { once: true });
      if (state.controller.signal.aborted) close();
      const startedAt = Date.now();
      const provider = Promise.resolve().then(() => { if (callController.signal.aborted) throw new Error('canceled'); return this.transport(params, callController.signal); }).then(response => {
        receipt = { receiptId: randomUUID(), provider: 'openai', responseId: typeof response.id === 'string' && response.id.length > 0 && response.id.length <= 120 ? response.id : null, runId: input.runId, requestId: input.requestId, actorId: input.actorId, model: response.model.slice(0, 120), inputTokens: response.usage?.input_tokens ?? null, outputTokens: response.usage?.output_tokens ?? null, durationMs: Date.now() - startedAt, status: String(response.status).slice(0, 30) };
        this.recent.push(receipt);
        if (this.recent.length > 64) this.recent.shift();
        if (response.usage) this.budget.reconcile(reservation, response.usage.input_tokens, response.usage.output_tokens);
        return response;
      }).finally(() => { this.providerBusy = false; });
      try {
        const response = await Promise.race([provider, aborted]);
        if (state.controller.signal.aborted || callController.signal.aborted) throw new Error('canceled');
        state.history = appendOutput(state.history, response);
        const value = decode(response, state.start, interactionId);
        if ('tool' in value) {
          if (state.start.interactionMode === 'advisory' && value.tool === 'inspect_asset') throw new Error('advisory_execution_forbidden');
          if (state.calls >= 3 || state.start.role === 'debrief') throw new Error('interaction_quota');
          if (state.history.filter(i => 'type' in i && i.type === 'function_call' && i.call_id === value.callId).length !== 1) throw new Error('duplicate_call');
          if (value.tool === 'read_procedure' ? !state.start.procedures.some(p => p.id === value.targetId) : !(value.tool === 'propose_action' && value.action && validAction(value.action, state.start)) && !state.start.view.knownTopology.assets.some(a => a.id === value.targetId)) throw new Error('invalid_target');
          if ((value.tool === 'inspect_asset' || value.tool === 'propose_action') && (!value.action || value.action.targetId !== value.targetId || !validAction(value.action, state.start))) throw new Error('invalid_action');
          state.pending = value; state.reply = { kind: 'tool_request', runId: input.runId, requestId: input.requestId, actorId: input.actorId, interactionId, intent: value };
        } else {
          if (!validateResponse(value, { ...state.start, view: { ...state.start.view, observations: [...state.evidence.values()] } })) throw new Error('invalid_evidence');
          if (usesConversationPolicy(state.start) && !conciseCoworkerResponse({ ...state.start, view: { ...state.start.view, observations: [...state.evidence.values()] } }, value)) throw new Error('unsafe_narrative');
          state.reply = { kind: 'final', runId: input.runId, requestId: input.requestId, actorId: input.actorId, response: value }; clearTimeout(state.expires);
        }
      } finally { clearTimeout(timeout); state.controller.signal.removeEventListener('abort', close); callController.signal.removeEventListener('abort', onAbort); }
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const allowed = ['budget_exhausted', 'budget_unavailable', 'mission_quota', 'interaction_quota', 'input_limit', 'canceled', 'call_timeout', 'interaction_timeout', 'refusal', 'incomplete_response', 'invalid_evidence', 'invalid_target', 'invalid_action', 'duplicate_call', 'advisory_execution_forbidden', 'invalid_reasoning_effort', 'invalid_model_pricing', 'model_pricing_unconfigured', 'unsafe_narrative', 'unsupported_conversation_context'];
      const status = (error as { status?: number }).status;
      state.reply = this.fallback(input, status === 429 ? 'provider_quota' : allowed.includes(message) ? message : 'malformed_or_unavailable');
      clearTimeout(state.expires);
    } finally { if (receipt && state.reply) this.receipts.set(state.reply, receipt); state.busy = false; signal?.removeEventListener('abort', abort); }
    return state.reply!;
  }
}
