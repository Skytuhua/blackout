import type { ScenarioSpec } from '../../shared/contracts';

export interface RackProtection {
  mode: 'ready' | 'throttled' | 'off' | 'booting';
  thermalLatched: boolean;
  throttleLatched: boolean;
  resetRequested: boolean;
  bootRemainingSeconds: number;
  hotSeconds: number;
  tripSeconds: number;
  coolSeconds: number;
}

export function prepareRack(rack: RackProtection, powered: boolean, profile: ScenarioSpec['profile'], temperatureC: number): string[] {
  if (rack.mode === 'throttled') rack.throttleLatched = true;
  if (!powered) {
    const changed = rack.mode !== 'off';
    rack.mode = 'off';
    rack.bootRemainingSeconds = 0;
    return changed ? ['power_off'] : [];
  }
  if (rack.mode === 'off' && (!rack.thermalLatched || (rack.resetRequested && temperatureC <= profile.releaseC && rack.coolSeconds >= profile.releaseDwellSeconds))) {
    rack.thermalLatched = false;
    rack.resetRequested = false;
    rack.bootRemainingSeconds = profile.bootSeconds;
    rack.mode = profile.bootSeconds > 0 ? 'booting' : rack.throttleLatched ? 'throttled' : 'ready';
    return ['boot_started'];
  }
  return [];
}

function exposure(previous: number, from: number, to: number, threshold: number, seconds: number) {
  if (to < threshold) return 0;
  if (from >= threshold) return previous + seconds;
  return seconds * (to - threshold) / (to - from);
}

export function advanceProtection(rack: RackProtection, fromC: number, toC: number, seconds: number, profile: ScenarioSpec['profile']): string[] {
  if (rack.mode === 'throttled') rack.throttleLatched = true;
  rack.hotSeconds = exposure(rack.hotSeconds, fromC, toC, profile.throttleC, seconds);
  rack.tripSeconds = exposure(rack.tripSeconds, fromC, toC, profile.tripC, seconds);
  rack.coolSeconds = exposure(rack.coolSeconds, -fromC, -toC, -profile.releaseC, seconds);
  if (toC <= profile.releaseC && rack.coolSeconds >= profile.releaseDwellSeconds) rack.throttleLatched = false;
  if (rack.mode !== 'off' && toC >= profile.tripC && rack.tripSeconds >= profile.tripDwellSeconds) {
    rack.mode = 'off';
    rack.thermalLatched = true;
    rack.resetRequested = false;
    rack.bootRemainingSeconds = 0;
    return ['thermal_trip'];
  }
  if (rack.mode === 'booting') {
    rack.bootRemainingSeconds = Math.max(0, rack.bootRemainingSeconds - seconds);
    if (rack.bootRemainingSeconds > 0) return [];
    rack.throttleLatched ||= toC >= profile.throttleC && rack.hotSeconds >= profile.throttleDwellSeconds;
    rack.mode = rack.throttleLatched ? 'throttled' : 'ready';
    return ['boot_completed'];
  }
  if (rack.mode === 'ready' && toC >= profile.throttleC && rack.hotSeconds >= profile.throttleDwellSeconds) {
    rack.throttleLatched = true;
    rack.mode = 'throttled';
    return ['thermal_throttle'];
  }
  if (rack.mode === 'throttled' && toC <= profile.releaseC && rack.coolSeconds >= profile.releaseDwellSeconds) {
    rack.mode = 'ready';
    return ['throttle_released'];
  }
  return [];
}
