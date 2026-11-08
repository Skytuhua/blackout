export type AudioSettings = { muted: boolean; volume: number };
export function SoundSettings({ value, onChange, onTest }: { value: AudioSettings; onChange: (next: AudioSettings) => void; onTest: () => void }) {
  return <fieldset className="cm-audio"><legend>Sound effects</legend>
    <label><input type="checkbox" checked={!value.muted} onChange={event => onChange({ ...value, muted: !event.target.checked })} />Enable sound</label>
    <label htmlFor="game-sound-volume">Volume <output>{Math.round(value.volume * 100)}%</output></label>
    <input id="game-sound-volume" aria-label="Sound volume" type="range" min="0" max="100" step="1" value={Math.round(value.volume * 100)} onChange={event => onChange({ ...value, volume: Number(event.target.value) / 100 })} />
    <button onClick={onTest} disabled={value.muted || value.volume === 0}>Test sound</button>
  </fieldset>;
}
