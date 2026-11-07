export const SCHEMA_VERSION = 1 as const;
export const ENGINE_VERSION = '1.0.0';
export const PROMPT_VERSION = 'coworker-v1';
export const FIXED_STEP_SECONDS = 1;
export function formatSimTime(seconds: number): string { return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`; }
