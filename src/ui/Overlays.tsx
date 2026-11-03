import { useEffect, useRef, useState } from 'react';
import { audio } from '../game/audio/AudioManager';
import { bus, TerminalPayload, TitleCardPayload } from '../game/bus';

export function TerminalPanel({ data }: { data: TerminalPayload }) {
  const full = data.lines.join('\n');
  const [n, setN] = useState(0);
  const done = n >= full.length;
  const doneRef = useRef(false);
  doneRef.current = done;

  useEffect(() => {
    const id = window.setInterval(() => {
      setN((v) => {
        if (v >= full.length) return v;
        const ch = full[v];
        if (ch && ch !== ' ' && ch !== '\n' && v % 2 === 0) audio.typeBlip();
        return v + 1;
      });
    }, 16);
    return () => window.clearInterval(id);
  }, [full]);

  useEffect(() => {
    const close = () => bus.emit('terminal:close');
    const advance = () => {
      if (!doneRef.current) setN(full.length);
      else close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (['KeyE', 'Enter', 'Space', 'Escape'].includes(e.code)) {
        e.preventDefault();
        e.stopPropagation();
        if (e.repeat) return;
        if (e.code === 'Escape') close();
        else advance();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [full]);

  return (
    <div className="terminal-wrap" onClick={() => (done ? bus.emit('terminal:close') : setN(full.length))}>
      <div className="terminal" role="dialog" aria-label={data.title}>
        <div className="t-title">{data.title}</div>
        <pre className="t-body">
          {full.slice(0, n)}
          <span className="caret">█</span>
        </pre>
        <div className="t-foot">{done ? '[E] CLOSE' : '[E] SKIP'}</div>
      </div>
    </div>
  );
}

export function TitleCard({ data }: { data: TitleCardPayload }) {
  return (
    <div className="title-card" key={data.name}>
      <div className="tc-floor">{data.floor}</div>
      <div className="tc-name">{data.name}</div>
      <div className="tc-sub">{data.subtitle}</div>
    </div>
  );
}

export function ElevatorOverlay({ from, to, ms }: { from: string; to: string; ms: number }) {
  const [label, setLabel] = useState(from);
  useEffect(() => {
    const seq = [from, to];
    // count through the floors between
    const a = from === 'B1' ? 0 : Number(from);
    const b = to === 'B1' ? 0 : Number(to);
    const steps: string[] = [];
    const dir = b > a ? 1 : -1;
    for (let f = a; f !== b + dir; f += dir) steps.push(f === 0 ? 'B1' : String(f).padStart(2, '0'));
    void seq;
    const per = (ms * 0.8) / Math.max(1, steps.length);
    let i = 0;
    const id = window.setInterval(() => {
      i = Math.min(steps.length - 1, i + 1);
      setLabel(steps[i]);
    }, per);
    return () => window.clearInterval(id);
  }, [from, to, ms]);
  return (
    <div className="elevator">
      <div className="el-num">{label}</div>
      <div className="el-arrow">{to === 'B1' || Number(to) < Number(from) ? '▼' : '▲'}</div>
      <div className="el-sub">DESCENDING</div>
    </div>
  );
}

export function PauseMenu({ onSettings }: { onSettings: () => void }) {
  return (
    <div className="pause">
      <div className="panel">
        <h2>PAUSED</h2>
        <button className="btn" onClick={() => { audio.uiConfirm(); bus.emit('cmd:resume'); }}>RESUME</button>
        <button className="btn" onClick={() => { audio.uiClick(); bus.emit('cmd:restartFloor'); }}>RESTART FLOOR</button>
        <button className="btn" onClick={() => { audio.uiClick(); onSettings(); }}>SETTINGS</button>
        <button className="btn" onClick={() => { audio.uiClick(); bus.emit('cmd:quit'); }}>QUIT TO MENU</button>
        <div className="controls">
          <b>A/D · ←/→</b> move &nbsp; <b>SPACE/W</b> jump &nbsp; <b>SHIFT</b> sneak &nbsp; <b>E</b> interact
          <br />
          <b>HOLD R</b> rewind &nbsp; <b>HOLD F</b> foresight &nbsp; <b>Q</b> release echoes &nbsp; <b>ESC</b> pause
        </div>
      </div>
    </div>
  );
}
