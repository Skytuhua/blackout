/** Never let a missing named frame resolve to Phaser's whole-atlas __BASE frame. */
export function atlasFrame(name: string, available: ReadonlySet<string>): string | null {
  if (name !== '__BASE' && available.has(name)) return name;
  const fallback = name.startsWith('floor_') ? 'floor_0' : name.startsWith('wall_') ? 'wall_0' : name.startsWith('commander_') ? 'commander_s_idle' : name.startsWith('fan_') ? 'fan_0' : name.startsWith('generator_') ? 'generator_0' : null;
  return fallback && available.has(fallback) ? fallback : null;
}
