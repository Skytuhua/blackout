import { useId, useState } from 'react';
import type { AgentResponse, ComparisonResult, GatewayStart, OutcomeLedger, PublicMessage } from '../../shared/contracts';
import { AgentResponseSchema } from '../../shared/schemas';
import { factValue, renderFacts, validStart } from '../../llm/validation';
import { OutcomeTable, TelemetryCharts } from './OutcomeCharts';
import { number } from './format';
import './DebriefView.css';

export interface DebriefViewProps {
  ledger: OutcomeLedger;
  comparison: ComparisonResult | null;
  dialogue: readonly PublicMessage[];
  capOptions: readonly { sequence: number; at: number; label: string }[];
  replay: { cursor: number; playing: boolean };
  onSeek: (at: number) => void;
  onToggle: () => void;
  onCompare: (change: { sequence: number; earlierAt: number }) => void;
  comparisonBusy?: boolean;
  comparisonError?: string | null;
  onRetry: () => void;
  onReturn: () => void;
  explanation?: { response: AgentResponse; context: GatewayStart } | null;
  explanationBusy?: boolean;
  explanationError?: string | null;
  onRequestExplanation: () => void;
}

export function DebriefView(props: DebriefViewProps) {
  const { ledger, comparison, dialogue, replay } = props;
  const terminal = ledger.timeline.find(e => ['mission.success', 'mission.failure'].includes(e.type));
  const title = terminal?.type === 'mission.success' ? 'Mission recovered' : terminal ? 'Mission failed' : 'Recorded run';
  const pair = comparison?.status === 'unsupported'
    ? [comparison.validPrefix.baseline, comparison.validPrefix.alternative] as const
    : comparison ? [comparison.baseline, comparison.alternative] as const : null;
  const equalHorizon = pair && pair.every(l => l.horizon === comparison?.supportedHorizon);
  const cursorValid = Number.isFinite(replay.cursor) && replay.cursor >= 0 && replay.cursor <= ledger.horizon;
  const id = useId();
  return <article className="debrief" aria-label="Mission debrief">
    <header className="debrief-header">
      <div><h1>{title} · debrief</h1><p>{ledger.scenarioId} · Run {ledger.runId}</p></div>
      <nav aria-label="Debrief navigation"><button type="button" onClick={props.onReturn}>Return to run</button><button type="button" onClick={props.onRetry}>Retry mission</button></nav>
    </header>

    <section aria-label="Original run outcome" className="debrief-section">
      <h2>Computed outcome</h2>
      <p className="debrief-horizon">{`Accounting horizon: ${number(ledger.horizon)} s`} <span>· Original run, simulation truth</span></p>
      <p>{terminal ? `Terminal mission time: ${number(terminal.simTime)} s. ${terminal.simTime < ledger.horizon ? 'Physical accounting continued after the mission ended.' : 'Accounting ends at the mission boundary.'}` : 'No terminal mission event is recorded in this ledger.'}</p>
      <p>Critical work delivered: <strong>{number(ledger.criticalDelivered)} / {number(ledger.criticalDemand)} units</strong>. Interactive work delivered: <strong>{number(ledger.interactiveDelivered)} / {number(ledger.interactiveDemand)} units</strong>.</p>
      <dl className="debrief-totals">
        <div><dt>Batch completed / arrived</dt><dd>{number(ledger.batchCompleted)} / {number(ledger.batchArrivals)} units</dd></div>
        <div><dt>Batch backlog</dt><dd>{number(ledger.batchBacklog)} units</dd></div>
        <div><dt>Batch delay</dt><dd>{number(ledger.batchDelayUnitSeconds)} unit·s</dd></div>
        <div><dt>Peak temperature</dt><dd>{number(ledger.peakTemperatureC)} °C</dd></div>
      </dl>
      <p className="debrief-note">Game compute units, not measured hardware throughput. Delay is the engine's accumulated queued-work time. Temperature is the modeled inlet proxy; forensic truth may differ from observations available during play.</p>
    </section>

    <section aria-label="Replay controls" className="debrief-section">
      <h2>Review the recorded run</h2>
      <p>Playback shows recorded events and conversation. It does not dispatch actions or request a model.</p>
      <div className="debrief-playback">
        <button type="button" onClick={props.onToggle} disabled={ledger.horizon === 0}>{replay.playing ? 'Pause replay' : 'Play replay'}</button>
        <label htmlFor={`${id}-seek`}>Replay time: <output>{cursorValid ? `${number(replay.cursor)} s` : 'Unavailable'}</output> / {number(ledger.horizon)} s
          <input id={`${id}-seek`} type="range" min={0} max={ledger.horizon} step={1} value={cursorValid ? replay.cursor : 0} disabled={ledger.horizon === 0} onChange={e => props.onSeek(Number(e.target.value))} />
        </label>
      </div>
      <details><summary>Recorded actions and events ({number(ledger.timeline.length)})</summary>
        {ledger.timeline.length ? <ol className="debrief-timeline">{ledger.timeline.map(event => <li key={event.id}>
          <button type="button" onClick={() => props.onSeek(event.simTime)} aria-label={`Seek to ${event.simTime} seconds: ${event.type}`}>{number(event.simTime)} s</button>
          <div><strong>{event.type}</strong><p>{event.entityIds.join(', ') || 'Site'}{event.payload.action ? ` · ${event.payload.action}` : ''}{event.payload.reason ? ` · ${event.payload.reason}` : ''}</p><small>Event {event.id} · {event.visibility}</small></div>
        </li>)}</ol> : <p>No recorded actions or events.</p>}
      </details>
    </section>

    <section aria-label="Earlier cap comparison" className="debrief-section">
      <h2>Try an earlier batch cap</h2>
      <CapForm key={ledger.runId} {...props} />
      {comparison && <div className="debrief-comparison">
        <h3>{comparison.status === 'unsupported' ? 'Unsupported continuation · valid prefix only' : 'Completed comparison'}</h3>
        <p>{comparison.continuationPolicy}</p>
        <p>All other accepted commands retain their recorded times and order; external disturbances are preserved. Originally rejected attempts remain in the recorded audit and are omitted from this continuation. This does not predict new human choices under different observations.</p>
        <p className="debrief-horizon">{`Common accounting horizon: ${number(comparison.supportedHorizon)} s`}</p>
        {comparison.status === 'unsupported' && <div className="debrief-warning">
          <p><strong>First invalid retained action: {comparison.firstInvalidAction.intent.action}</strong> on {comparison.firstInvalidAction.intent.targetId}, at {number(comparison.firstInvalidAction.at)} s (sequence {comparison.firstInvalidAction.sequence}).</p>
          <p>Reason: {comparison.reason}. The branch stops here; this command was not skipped. Full-horizon alternative outcomes are withheld.</p>
        </div>}
        {equalHorizon && pair ? <OutcomeTable baseline={pair[0]} alternative={pair[1]} /> : <p role="alert">Comparison withheld: the provided ledgers do not share the supported horizon.</p>}
      </div>}
    </section>

    <section aria-label="Engine telemetry" className="debrief-section">
      <h2>{comparison ? 'Comparison telemetry' : 'Recorded telemetry'}</h2>
      <p>{comparison?.status === 'unsupported' ? 'Valid common prefix only. Both series stop at the supported horizon.' : 'Computed simulation truth, not observed sensor readings.'} Temperature, critical service and queued batch work share simulation time. Vertical markers indicate baseline task reservations; seek using the recorded event list.</p>
      {comparison ? equalHorizon && pair && <TelemetryCharts baseline={pair[0]} alternative={pair[1]} /> : <TelemetryCharts baseline={ledger} />}
    </section>

    <section aria-label="Recorded conversation" className="debrief-section">
      <h2>Recorded conversation</h2>
      <p>Original mode labels describe how each line was produced. Replaying these lines never queries a provider.</p>
      {dialogue.length ? <ol className="debrief-dialogue">{dialogue.map(message => <li key={message.id}>
        <div><strong>{message.speaker}</strong><span>{number(message.at)} s · Original mode: {message.mode}</span></div>
        <p>{message.text}</p>{message.evidenceIds.length > 0 && <small>Recorded evidence: {message.evidenceIds.join(', ')}</small>}
      </li>)}</ol> : <p>No recorded dialogue.</p>}
    </section>

    <section aria-label="Grounded explanation" className="debrief-section">
      <h2>Understand the tradeoff</h2>
      <Explanation {...props} />
      {props.explanationError && <p role="alert">Explanation failed: {props.explanationError}. Request it again to retry.</p>}
      <button type="button" onClick={props.onRequestExplanation} disabled={props.explanationBusy}>{props.explanationBusy ? 'Preparing explanation…' : props.explanation ? 'Request another explanation' : 'Request explanation'}</button>
      <p className="debrief-note">An explanation is requested only when you press this button. The host handles the request and labels provider or fallback behavior.</p>
    </section>
  </article>;
}

function CapForm({ capOptions, onCompare, comparisonBusy, comparisonError }: DebriefViewProps) {
  const [sequence, setSequence] = useState(capOptions[0]?.sequence);
  const [earlier, setEarlier] = useState('0');
  const cap = capOptions.find(c => c.sequence === sequence) ?? capOptions[0];
  const max = cap ? Math.ceil(cap.at) - 1 : -1;
  const valid = earlier.trim() !== '' && Number.isInteger(Number(earlier)) && Number(earlier) >= 0 && Number(earlier) <= max;
  const id = useId();
  return <form onSubmit={e => { e.preventDefault(); if (cap && valid && !comparisonBusy) onCompare({ sequence: cap.sequence, earlierAt: Number(earlier) }); }}>
    <fieldset disabled={comparisonBusy || !cap}>
      <legend>Move one existing accepted pause or ceiling</legend>
      <div className="debrief-cap-fields">
        <label>Accepted cap<select value={cap?.sequence ?? ''} onChange={e => { setSequence(Number(e.target.value)); setEarlier('0'); }}>
          {!cap && <option value="">No accepted cap</option>}{capOptions.map(option => <option key={option.sequence} value={option.sequence}>{option.label} · {number(option.at)} s · #{option.sequence}</option>)}
        </select></label>
        <label>Earlier time (whole seconds)<input type="number" min={0} max={max >= 0 ? max : 0} step={1} value={earlier} onChange={e => setEarlier(e.target.value)} aria-describedby={`${id}-help`} aria-invalid={cap && !valid ? true : undefined} disabled={!cap || max < 0} /></label>
        <button type="submit" disabled={!cap || !valid || comparisonBusy}>{comparisonBusy ? 'Computing comparison…' : 'Compare earlier cap'}</button>
      </div>
    </fieldset>
    <p id={`${id}-help`} className="debrief-note">{!cap ? 'No accepted batch cap is available in this run.' : max < 0 ? 'No earlier whole-second time exists for this cap.' : `Choose 0–${number(max)} s, strictly before the recorded cap at ${number(cap.at)} s.`}</p>
    {comparisonBusy && <p role="status">Computing comparison. The host is replaying accepted commands.</p>}
    {comparisonError && <p role="alert">Comparison failed: {comparisonError}. Adjust the selection or compare again to retry.</p>}
  </form>;
}

function Explanation({ explanation, explanationBusy, ledger, comparison }: DebriefViewProps) {
  if (explanationBusy) return <p role="status">Preparing a grounded explanation. Computed outcomes remain available above.</p>;
  if (!explanation) return <p>Review available evidence → decision → consequence → feasible alternative → principle. Request an explanation to connect these records; computed values above remain the source of truth.</p>;
  const { response, context } = explanation;
  // Rebind factual selectors to current evidence, especially an unsupported valid prefix.
  const start: GatewayStart = { ...context, debriefContext: { ledger, comparison } };
  const contextComparison = context.debriefContext?.comparison;
  const sameComparison = comparison
    ? contextComparison?.status === comparison.status && contextComparison.baseRunId === comparison.baseRunId
      && contextComparison.branchRunId === comparison.branchRunId && contextComparison.supportedHorizon === comparison.supportedHorizon
    : contextComparison === null;
  const matching = AgentResponseSchema.safeParse(response).success && validStart(context) && context.role === 'debrief'
    && context.debriefContext?.ledger.runId === ledger.runId && context.runId === ledger.runId
    && context.debriefContext.ledger.horizon === ledger.horizon && sameComparison
    && response.runId === context.runId && response.requestId === context.requestId
    && response.actorId === context.actorId && response.speaker === context.actorId
    && response.proposals.length === 0
    && response.facts.every(f => factValue(f, start) !== undefined && factValue(f, start) === factValue(f, context));
  if (!matching) return <p role="alert">Explanation withheld: its identity or factual selectors do not match the permitted records. Request a fresh explanation.</p>;
  return <div className="debrief-explanation">
    <p>Explanation mode: <strong>{response.mode}</strong> · Factual values resolved from records</p>
    <ul>{renderFacts(response, start).map(({ selector, value }, index) => {
      const observation = 'observationId' in selector ? start.view.observations.find(o => o.id === selector.observationId) : null;
      const units = 'ledgerRunId' in selector ? selector.field === 'horizon' ? 's' : selector.field === 'peakTemperatureC' ? '°C' : selector.field === 'batchDelayUnitSeconds' ? 'unit·s' : 'units' : selector.field === 'value' ? observation?.units : ['observedAt', 'receivedAt'].includes(selector.field) ? 's' : '';
      return <li key={index}>{'ledgerRunId' in selector ? `Ledger ${selector.ledgerRunId}` : `Observation ${selector.observationId}`} · {selector.field}: {typeof value === 'number' ? number(value) : value === null ? 'unknown' : String(value)}{units ? ` ${units}` : ''}{observation && ` (observed at ${number(observation.observedAt)} s; received at ${number(observation.receivedAt)} s)`}</li>;
    })}</ul>
    <h3>Inference</h3><p>{response.inference || 'No inference supplied.'}</p>
    <h3>Uncertainty</h3><p>{response.uncertainty || 'No uncertainty statement supplied; this is not a guarantee.'}</p>
  </div>;
}
