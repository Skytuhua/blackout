import { useId } from 'react';
import type { OutcomeLedger, Telemetry } from '../../shared/contracts';
import { number } from './format';

interface EvidenceProps { baseline: OutcomeLedger; alternative?: OutcomeLedger }
const metrics = [
  ['horizon', 'Accounting horizon', 's'],
  ['criticalDelivered', 'Critical delivered', 'units'], ['criticalDemand', 'Critical demand', 'units'],
  ['interactiveDelivered', 'Interactive delivered', 'units'], ['interactiveDemand', 'Interactive demand', 'units'],
  ['batchCompleted', 'Batch completed', 'units'], ['batchArrivals', 'Batch arrivals', 'units'],
  ['batchBacklog', 'Batch backlog', 'units'], ['batchDelayUnitSeconds', 'Batch delay', 'unit·s'],
  ['peakTemperatureC', 'Peak temperature', '°C'],
] as const;

export function OutcomeTable({ baseline, alternative }: EvidenceProps) {
  return <div className="debrief-table-scroll" tabIndex={0} role="region" aria-label="Comparison outcomes table">
    <table aria-label="Comparison outcomes"><caption>Equal-horizon engine outcomes. Batch delay remains part of the tradeoff.</caption>
      <thead><tr><th scope="col">Measure</th><th scope="col">Baseline</th><th scope="col">Earlier cap</th></tr></thead>
      <tbody>{metrics.map(([field, label, unit]) => <tr key={field}><th scope="row">{label} ({unit})</th><td title={String(baseline[field])}>{number(baseline[field])}{field === 'horizon' && ' s'}</td><td title={String(alternative?.[field])}>{alternative ? number(alternative[field]) : 'Unavailable'}{field === 'horizon' && alternative && ' s'}</td></tr>)}</tbody>
    </table>
  </div>;
}

const series = [
  { key: 'hottestTemperatureC', label: 'Hottest inlet proxy', unit: '°C', scale: 1 },
  { key: 'criticalServedFraction', label: 'Critical service delivered', unit: '% of offered demand', scale: 100 },
  { key: 'batchBacklog', label: 'Batch backlog', unit: 'compute units', scale: 1 },
] as const;

export function TelemetryCharts({ baseline, alternative }: EvidenceProps) {
  const id = useId();
  const rows = [baseline, ...(alternative ? [alternative] : [])];
  if (rows.every(l => !l.telemetry.length)) return <p>No recorded telemetry. Computed ledger totals are still available; no trend is inferred.</p>;
  return <>
    <p className="debrief-legend"><span>Solid cyan: {alternative ? 'Baseline' : 'Original run'}</span>{alternative && <span>Dashed amber: Earlier cap</span>}<span>Vertical dotted lines: baseline task reservations</span></p>
    {rows.some(l => !l.telemetry.length) && <p className="debrief-warning">One branch has no recorded telemetry; its line is unavailable.</p>}
    <div className="debrief-charts">{series.map(({ key, label, unit, scale }) => {
      const max = key === 'criticalServedFraction' ? 100 : Math.max(1, ...rows.flatMap(l => l.telemetry.map(t => t[key] * scale)));
      const x = (time: number) => 52 + time / Math.max(1, baseline.horizon) * 276;
      const y = (value: number) => 148 - value / max * 112;
      const titleId = `${id}-${key}`;
      return <figure key={key}>
        <figcaption>{label}</figcaption>
        <svg viewBox="0 0 360 198" role="img" aria-labelledby={titleId}>
          <title id={titleId}>{`${label} (${unit}), simulation truth, 0 to ${baseline.horizon} seconds. Exact samples in the telemetry table.`}</title>
          <text x="52" y="16">{unit}</text>
          {[0, 0.5, 1].map(f => <g key={f}><line className="debrief-gridline" x1="52" x2="328" y1={y(max * f)} y2={y(max * f)} /><text x="46" y={y(max * f) + 4} textAnchor="end">{number(max * f)}</text></g>)}
          {baseline.timeline.filter(e => e.type === 'task.reserved' && e.simTime <= baseline.horizon).map(e => <line key={e.id} className="debrief-marker" x1={x(e.simTime)} x2={x(e.simTime)} y1="36" y2="148"><title>{`${String(e.payload.action)} at ${e.simTime} s`}</title></line>)}
          {rows.map((ledger, index) => <g key={ledger.runId} className={index ? 'debrief-series-alt' : 'debrief-series-base'}>
            <polyline points={ledger.telemetry.map(t => `${x(t.simTime)},${y(t[key] * scale)}`).join(' ')} />
            {ledger.telemetry.length === 1 && <circle cx={x(ledger.telemetry[0].simTime)} cy={y(ledger.telemetry[0][key] * scale)} r="3" />}
          </g>)}
          {[0, 0.5, 1].map(f => <text key={f} x={x(baseline.horizon * f)} y="168" textAnchor="middle">{number(baseline.horizon * f)}</text>)}
          <text x="190" y="190" textAnchor="middle">Simulation time (s)</text>
        </svg>
      </figure>;
    })}</div>
    <details><summary>Accessible telemetry table · exact samples</summary>
      <div className="debrief-table-scroll" tabIndex={0} role="region" aria-label="Telemetry samples table"><table>
        <caption>Simulation truth at each recorded time. Service is the fraction of offered critical demand delivered.</caption>
        <thead><tr><th scope="col">Series</th><th scope="col">Time (s)</th><th scope="col">Inlet proxy (°C)</th><th scope="col">Critical delivered (%)</th><th scope="col">Backlog (units)</th></tr></thead>
        <tbody>{rows.flatMap((l, index) => l.telemetry.map((t: Telemetry, i) => <tr key={`${index}-${i}`}><th scope="row">{index ? 'Earlier cap' : alternative ? 'Baseline' : 'Original run'}</th><td>{t.simTime}</td><td>{t.hottestTemperatureC}</td><td>{t.criticalServedFraction * 100}</td><td>{t.batchBacklog}</td></tr>))}</tbody>
      </table></div>
    </details>
  </>;
}
