import { useLayoutEffect, useRef, useState } from 'react';
import type { ConversationGameProps } from '../shared/contracts';
import { latestObservations } from '../llm/context';
import { nearbyEquipment, type NearbyEquipment as Choice } from './public-task-ui';

const labels: Record<string, string> = { running: 'Cooling', temperature: 'Temperature', temperatureC: 'Temperature', inlet_temperature_c: 'Temperature', batch_ceiling: 'Job limit', batch_processing_rate: 'Job rate', prerequisite_ready: 'Controls ready', power_available: 'Power', inspection_complete: 'Checked', transfer_ready: 'Transfer ready' };
const at = (value: number) => `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
export function NearbyEquipment(props: ConversationGameProps) {
  const retained = useRef<Choice | null>(null);
  const choice = nearbyEquipment(props.view, props.selectedActorId, props.selectedAssetId, retained.current); retained.current = choice;
  if (!choice) return null;
  return <EquipmentDetails key={`${choice.runId}:${choice.actorId}:${choice.assetId}`} props={props} choice={choice} />;
}
function EquipmentDetails({ props, choice }: { props: ConversationGameProps; choice: Choice }) {
  const [page, onPage] = useState(0);
  const panel = useRef<HTMLElement>(null), [available, setAvailable] = useState(200);
  useLayoutEffect(() => { const world = panel.current?.parentElement; if (!world) return; const update = () => setAvailable(world.clientHeight); update(); const observer = new ResizeObserver(update); observer.observe(world); return () => observer.disconnect(); }, []);
  const asset = props.view.knownTopology.assets.find(asset => asset.id === choice.assetId)!, crew = props.view.crew.find(crew => crew.id === choice.actorId)!;
  const readings = latestObservations(props.view.observations).filter(observation => observation.assetId === asset.id);
  const size = available < 320 ? 1 : available < 420 ? 2 : 3, tight = available < 260;
  const count = Math.max(1, Math.ceil(readings.length / size)), index = Math.min(page, count - 1);
  const navigation = count > 1 && <nav aria-label="Equipment readings"><button aria-label="Previous equipment reading" disabled={index === 0} onClick={() => onPage(index - 1)}>{tight ? '‹' : 'Previous'}</button><button aria-label="Next equipment reading" disabled={index === count - 1} onClick={() => onPage(index + 1)}>{tight ? '›' : 'Next'}</button></nav>;
  return <aside ref={panel} className="conv-equipment-popup" data-tight={tight} aria-label="Nearby equipment details"><header><strong>{asset.label}</strong><span>{props.conversations.find(thread => thread.actorId === crew.id)?.name ?? crew.name} nearby</span>{tight && navigation}</header>
    {readings.length ? <dl>{readings.slice(index * size, index * size + size).map(reading => <div key={reading.id}><dt>{labels[reading.field] ?? reading.field.replaceAll('_', ' ')}</dt><dd>{reading.value === null ? 'Unknown' : reading.field === 'running' ? reading.value ? 'Running' : 'Stopped' : typeof reading.value === 'boolean' ? reading.value ? 'Yes' : 'No' : `${typeof reading.value === 'number' ? new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(reading.value) : reading.value} ${reading.units}`}<span>{props.view.simTime - reading.observedAt > 10 ? 'Earlier reading' : 'Read'} {at(reading.observedAt)}</span></dd></div>)}</dl> : <p>No reading yet. A check can tell you more.</p>}
    {!tight && navigation}
  </aside>;
}
