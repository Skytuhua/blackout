import type { ActionIntent, CommandReceipt, KnowledgeView, TutorialEvent } from './contracts';

export interface TrainingProgress { runId: string; step: number; moveTaskId: string | null; inspectionTaskId: string | null }
export const beginTraining = (runId: string): TrainingProgress => ({ runId, step: 0, moveTaskId: null, inspectionTaskId: null });

export function trainingInput(state: TrainingProgress, event: TutorialEvent): TrainingProgress {
  const expected: Partial<Record<number, TutorialEvent>> = { 0: 'commander_moved', 1: 'equipment_opened', 2: 'crew_selected', 4: 'timestamp_read' };
  return expected[state.step] === event ? { ...state, step: state.step + 1 } : state;
}
export function trainingReceipt(state: TrainingProgress, intent: ActionIntent, receipt: CommandReceipt): TrainingProgress {
  if (receipt.runId !== state.runId || receipt.status !== 'accepted' || !receipt.taskId) return state;
  if (state.step === 3 && intent.action === 'move_crew') return { ...state, moveTaskId: receipt.taskId };
  if (state.step === 5 && intent.action === 'inspect') return { ...state, step: 6, inspectionTaskId: receipt.taskId };
  return state;
}
export function trainingView(state: TrainingProgress, view: KnowledgeView): TrainingProgress {
  if (state.runId !== view.runId || view.mission.status !== 'practice') return state;
  if (state.step === 3 && state.moveTaskId && view.tasks.some(task => task.id === state.moveTaskId && task.status === 'completed')) return { ...state, step: 4 };
  const task = view.tasks.find(task => task.id === state.inspectionTaskId && task.action === 'inspect' && task.status === 'completed');
  if (state.step === 6 && task) {
    const report = view.messages.find(message => message.id === `report-${task.id}`);
    const delivered = report && view.observations.some(observation => report.evidenceIds.includes(observation.id) && observation.assetId === task.targetId && observation.field === 'inspection_complete' && observation.value === true && observation.observedAt >= task.completesAt && observation.receivedAt <= view.simTime);
    if (delivered) return { ...state, step: 7 };
  }
  return state;
}

export const trainingSteps = [
  { title: 'Walk the floor', target: 'world', text: 'You are the commander with the cyan tablet. Click the floor to focus the world, then move with WASD or the arrow keys. This healthy practice has no incident deadline.' },
  { title: 'Look at equipment', target: 'equipment', text: 'Walk near a cabinet and press E, or select equipment on the map. This opens known readings. Looking at a cabinet does not diagnose its hidden condition.' },
  { title: 'Meet your technicians', target: 'crew', text: 'Select Alex in Facilities or Jules in Electrical from the crew dock. They perform technical work; Sam handles remote workload controls.' },
  { title: 'Give a movement order', target: 'world', text: 'With a technician selected, click an open floor tile. Watch the accepted route until they arrive. Movement takes real simulation time; resume if paused.' },
  { title: 'Check the timestamp', target: 'timestamps', text: 'Open equipment readings and use the timestamp control. Observed time says when a reading was measured; received time says when its report arrived. An old reading may no longer describe current equipment.' },
  { title: 'Request a technical inspection', target: 'inspect', text: 'Select cooling equipment or its controller and request inspection with Alex, or select a UPS and use Jules. Review travel and work time, then dispatch. Repairs require qualified work and delivered evidence.' },
  { title: 'Wait for the report', target: 'crew', text: 'Follow the technician: traveling, inspecting, then a delayed report. Acceptance is not completion. Keep time running; 2× or 4× speeds up this safe practice.' },
  { title: 'Ready for Hot Restart', target: 'start-mission', text: 'You received a real inspection report. In the incident, protect critical service, use evidence, and coordinate work. Batch controls trade heat against queued work; pausing batch retains its backlog. Start the timed incident when ready.' },
] as const;
