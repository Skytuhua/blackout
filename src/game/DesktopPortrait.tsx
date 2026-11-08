import { useEffect, useState } from 'react';
type Frame = { frame: { x: number; y: number; w: number; h: number } };
let manifest: Promise<Record<string, Frame> | null> | null = null;
export function DesktopPortrait({ role }: { role: 'facilities' | 'electrical' | 'remote' | 'commander' }) {
  const [frame, setFrame] = useState<Frame | null>(null);
  useEffect(() => {
    let alive = true;
    manifest ??= fetch('/assets/facility-v2.json').then(async response => response.ok && response.headers.get('content-type')?.includes('json') ? (await response.json()).frames as Record<string, Frame> : null).catch(() => null);
    void manifest.then(frames => { if (alive) setFrame(frames?.[`portrait_${role === 'remote' ? 'it' : role}`] ?? null); });
    return () => { alive = false; };
  }, [role]);
  return <span className={`blackout-portrait${frame ? '' : ' blackout-portrait-fallback'}`} aria-hidden="true" style={frame ? { backgroundPosition: `-${frame.frame.x}px -${frame.frame.y}px` } : undefined} />;
}
