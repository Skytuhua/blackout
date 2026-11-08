export const SOUND_CUES = [
  'ui-select', 'ui-open', 'ui-close', 'message-sent', 'message-received',
  'order-accepted', 'order-rejected', 'crew-step', 'task-start', 'task-complete',
  'task-cancel', 'report-arrived', 'incident-warning', 'incident-critical',
  'cooling-recovered', 'mission-success', 'mission-failure', 'save-complete',
  'simulation-pause', 'simulation-resume', 'work-loop', 'facility-loop',
] as const;
export type SoundCue = (typeof SOUND_CUES)[number];
export type LoopCue = Extract<SoundCue, 'work-loop' | 'facility-loop'>;
export const isLoop = (cue: SoundCue): cue is LoopCue => cue === 'work-loop' || cue === 'facility-loop';
export const isPhysical = (cue: SoundCue) => isLoop(cue) || ['crew-step', 'task-start', 'task-complete', 'task-cancel', 'report-arrived', 'cooling-recovered', 'mission-success', 'mission-failure'].includes(cue);
export const priority = (cue: SoundCue) => cue.startsWith('mission-') ? 5 : cue === 'incident-critical' ? 4
  : cue === 'incident-warning' || cue === 'order-rejected' ? 3 : isLoop(cue) || cue === 'crew-step' ? 0 : cue.startsWith('ui-') ? 1 : 2;
