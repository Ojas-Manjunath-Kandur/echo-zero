import { useEffect, useRef } from 'react';
import { hudState } from '../game/render/hud';

/** DOM HUD. Reads the mutable hudState each animation frame and writes straight to the DOM (no React churn). */
export function Hud() {
  const r = useRef<Record<string, HTMLElement | null>>({});
  const set = (k: string) => (el: HTMLElement | null) => {
    r.current[k] = el;
  };
  const showFps = useRef(false);
  useEffect(() => {
    const k = (ev: KeyboardEvent) => {
      if (ev.code === 'Backquote') showFps.current = !showFps.current;
    };
    window.addEventListener('keydown', k);
    let raf = 0;
    let last = '';
    const loop = () => {
      const h = hudState;
      const e = r.current;
      const text = (k: string, v: string) => {
        const el = e[k];
        if (el && el.textContent !== v) el.textContent = v;
      };
      text('floor', h.floorLabel);
      text('name', h.floorName);
      text('obj', h.objective ? '▸ ' + h.objective : '');
      text('prompt', h.prompt);
      text('secs', h.rewindSecs.toFixed(1) + 's');
      if (e.prompt) e.prompt.style.opacity = h.prompt ? '1' : '0';
      if (e.rewindBar) e.rewindBar.style.width = `${Math.round(h.rewindMem * 100)}%`;
      if (e.rewindBox) {
        e.rewindBox.classList.toggle('active', h.rewinding);
        e.rewindBox.classList.toggle('cool', h.rewindCd > 0);
      }
      if (e.cd) e.cd.style.width = `${Math.round(h.rewindCd * 100)}%`;
      if (e.focusBar) e.focusBar.style.width = `${Math.round(h.focus * 100)}%`;
      if (e.visionBox) e.visionBox.classList.toggle('active', h.vision);
      const pips = `${h.echoes}`;
      if (pips !== last) {
        last = pips;
        for (let i = 0; i < 3; i++) e['pip' + i]?.classList.toggle('on', i < h.echoes);
      }
      const fe = e.fps;
      if (fe) {
        const g = (window as unknown as { __game?: { loop: { actualFps: number } } }).__game;
        fe.style.display = showFps.current ? 'block' : 'none';
        if (showFps.current && g) fe.textContent = Math.round(g.loop.actualFps) + ' FPS';
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', k);
    };
  }, []);
  return (
    <div className="hud">
      <div className="hud-top">
        <div className="floor">
          <span className="floor-n" ref={set('floor')} />
          <span className="floor-l">FLOOR</span>
        </div>
        <div className="floor-name" ref={set('name')} />
        <div className="objective" ref={set('obj')} />
      </div>
      <div className="hud-bottom">
        <div className="meter" ref={set('rewindBox')}>
          <label>
            <b>R</b> REWIND <span ref={set('secs')} />
          </label>
          <div className="bar">
            <i ref={set('rewindBar')} />
            <u ref={set('cd')} />
          </div>
        </div>
        <div className="meter" ref={set('visionBox')}>
          <label>
            <b>F</b> FORESIGHT
          </label>
          <div className="bar">
            <i ref={set('focusBar')} />
          </div>
        </div>
        <div className="meter echoes">
          <label>
            <b>Q</b> ECHOES
          </label>
          <div className="pips">
            <span ref={set('pip0')} />
            <span ref={set('pip1')} />
            <span ref={set('pip2')} />
          </div>
        </div>
      </div>
      <div className="prompt" ref={set('prompt')} />
      <div className="fps" ref={set('fps')} />
    </div>
  );
}
