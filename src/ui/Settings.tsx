import { useEffect, useState } from 'react';
import { audio } from '../game/audio/AudioManager';
import { getSettings, onSettings, updateSettings, Settings } from '../game/settings';

function useSettings(): Settings {
  const [s, setS] = useState(getSettings());
  useEffect(() => onSettings(setS), []);
  return s;
}

const Slider = ({ label, value, onChange, disabled }: { label: string; value: number; onChange: (v: number) => void; disabled?: boolean }) => (
  <label className="row">
    <span>{label}</span>
    <input
      type="range"
      min={0}
      max={100}
      value={Math.round(value * 100)}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value) / 100)}
      onPointerUp={() => audio.uiClick()}
    />
    <em>{Math.round(value * 100)}</em>
  </label>
);

const Toggle = ({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) => (
  <button
    className={'row toggle' + (value ? ' on' : '')}
    role="switch"
    aria-checked={value}
    onClick={() => {
      audio.uiClick();
      onChange(!value);
    }}
  >
    <span>
      {label}
      {hint && <small>{hint}</small>}
    </span>
    <em>{value ? 'ON' : 'OFF'}</em>
  </button>
);

export function SettingsPanel({ onBack }: { onBack: () => void }) {
  const s = useSettings();
  return (
    <div className="panel settings">
      <h2>SETTINGS</h2>
      <h3>AUDIO</h3>
      <Slider label="MASTER" value={s.master} onChange={(v) => updateSettings({ master: v })} />
      <Slider label="MUSIC" value={s.music} onChange={(v) => updateSettings({ music: v })} />
      <Slider label="EFFECTS" value={s.sfx} onChange={(v) => updateSettings({ sfx: v })} />
      <Toggle label="MUTE ALL" value={s.muted} onChange={(v) => updateSettings({ muted: v })} hint="The game is fully playable without sound." />
      <h3>VISUALS</h3>
      <Toggle label="FILM GRAIN" value={s.grain} onChange={(v) => updateSettings({ grain: v })} />
      <Toggle label="HALFTONE SCREEN" value={s.halftone} onChange={(v) => updateSettings({ halftone: v })} />
      <Toggle label="GLITCH & DISTORTION" value={s.glitch} onChange={(v) => updateSettings({ glitch: v })} hint="Turn off for a calmer image." />
      <Toggle label="FOG" value={s.fog} onChange={(v) => updateSettings({ fog: v })} />
      <Toggle label="SCREEN SHAKE" value={s.shake} onChange={(v) => updateSettings({ shake: v })} />
      <button
        className="row toggle"
        onClick={() => {
          audio.uiClick();
          updateSettings({ quality: s.quality === 'high' ? 'low' : 'high' });
        }}
      >
        <span>
          EFFECT QUALITY<small>Low removes light shafts and reduces dust. Applies on the next floor.</small>
        </span>
        <em>{s.quality.toUpperCase()}</em>
      </button>
      <h3>GAMEPLAY</h3>
      <Toggle label="TUTORIAL HINTS" value={s.tutorial} onChange={(v) => updateSettings({ tutorial: v })} />
      <div className="actions">
        <button className="btn" onClick={() => { audio.uiClick(); onBack(); }}>
          BACK
        </button>
      </div>
    </div>
  );
}
