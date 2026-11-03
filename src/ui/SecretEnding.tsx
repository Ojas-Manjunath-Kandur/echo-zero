import { useEffect, useRef, useState } from 'react';
import { audio } from '../game/audio/AudioManager';
import { bus } from '../game/bus';
import { figure } from './Ending';

const W = 1280;
const H = 720;
const T_END = 49;

type Beat = { from: number; to: number; text: string; size?: number; y?: number };

// Part 1 — the garage, over the cinematic
const NARRATION: Beat[] = [
  { from: 3.0, to: 6.0, text: 'ITERATION 413.' },
  { from: 6.3, to: 10.0, text: 'Four of you now. The building counts one.' },
  { from: 10.6, to: 14.2, text: 'It was never the experiment that kept you here.' },
  { from: 14.6, to: 18.0, text: 'It was the audience.' },
];

// Part 2 — the teaser
const CARDS: Beat[] = [
  { from: 28.0, to: 31.4, text: 'YOU WALKED OUT OF THE LOOP.', size: 54 },
  { from: 31.8, to: 35.0, text: 'THE LOOP WALKED OUT WITH YOU.', size: 54 },
];

function car(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#080808';
  ctx.strokeStyle = '#2a2a2a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - 190, y - 40);
  ctx.lineTo(x - 175, y - 78);
  ctx.lineTo(x - 90, y - 92);
  ctx.lineTo(x - 40, y - 140);
  ctx.lineTo(x + 70, y - 140);
  ctx.lineTo(x + 120, y - 90);
  ctx.lineTo(x + 185, y - 78);
  ctx.lineTo(x + 195, y - 40);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  for (const wx of [x - 110, x + 115]) {
    ctx.beginPath();
    ctx.arc(wx, y - 22, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(wx, y - 22, 11, 0, Math.PI * 2);
    ctx.fillStyle = '#333';
    ctx.fill();
    ctx.fillStyle = '#080808';
  }
}

function glowAt(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, a: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(255,255,255,${a})`);
  g.addColorStop(0.35, `rgba(255,255,255,${a * 0.35})`);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function shadowFace(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, t: number) {
  // the Shadow, close: a tall dark wisp with two pale eyes
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.moveTo(cx - 90 * s, H);
  for (let i = 0; i <= 12; i++) {
    const v = i / 12;
    ctx.lineTo(cx - (40 + Math.sin(v * 3) * 35) * s - Math.sin(t * 9 + i) * 6, H - v * H * 0.9);
  }
  for (let i = 12; i >= 0; i--) {
    const v = i / 12;
    ctx.lineTo(cx + (40 + Math.sin(v * 3) * 35) * s + Math.sin(t * 8 + i) * 6, H - v * H * 0.9);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f4f4f4';
  ctx.beginPath();
  ctx.ellipse(cx - 18 * s, cy, 7 * s, 15 * s, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + 20 * s, cy, 7 * s, 15 * s, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** The true ending: you bring every iteration of yourself to the car, the loop breaks, and a teaser for ECHO//ZERO 2.0 plays. */
export function SecretEnding() {
  const cv = useRef<HTMLCanvasElement>(null);
  const [done, setDone] = useState(false);
  const st = useRef({ start: 0, fired: new Set<string>(), skip: false });

  useEffect(() => {
    const c = cv.current!;
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d')!;
    st.current.start = performance.now();
    audio.init();
    audio.stopAll();
    let raf = 0;
    const once = (key: string, sec: number, now: number, fn: () => void) => {
      if (now >= sec && !st.current.fired.has(key)) {
        st.current.fired.add(key);
        fn();
      }
    };
    const text = (t: string, x: number, y: number, size: number, a: number, font = '"Courier New", monospace', jitter = 0) => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, a));
      ctx.font = `${size}px ${font}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f2f2f2';
      if (jitter > 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillText(t, x + (Math.random() - 0.5) * jitter * 2, y + (Math.random() - 0.5) * jitter);
        ctx.fillStyle = '#f2f2f2';
      }
      ctx.fillText(t, x, y);
      ctx.restore();
    };
    const fade = (now: number, b: Beat) => Math.min((now - b.from) / 0.5, (b.to - now) / 0.5, 1);

    const frame = () => {
      const s = st.current;
      let now = (performance.now() - s.start) / 1000;
      if (s.skip) {
        now = Math.max(now, T_END);
        s.start = performance.now() - now * 1000;
      }
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);

      // ============ PART 1: the garage (0 – 20)
      if (now < 20.5) {
        once('low', 0.2, now, () => audio.stinger('low'));
        const bg = ctx.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, '#080808');
        bg.addColorStop(1, '#161616');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#0d0d0d';
        for (const px of [120, 520, 1020]) ctx.fillRect(px, 0, 70, H * 0.8);
        ctx.fillStyle = '#1b1b1b';
        ctx.fillRect(0, H * 0.8, W, H * 0.2);
        ctx.fillStyle = '#2c2c2c';
        ctx.fillRect(0, H * 0.8, W, 3);
        const floorY = H * 0.8;
        // car + headlights
        const carX = 930;
        car(ctx, carX, floorY);
        const flick = 0.92 + 0.08 * Math.sin(now * 40) * (now > 15.5 ? 3 : 1);
        glowAt(ctx, carX + 195, floorY - 62, 520 * flick + (now > 17 ? (now - 17) * 400 : 0), 0.55 + (now > 17 ? (now - 17) * 0.2 : 0));
        // the four of you, one by one
        const baseX = 470;
        const count = now < 0.8 ? 1 : now < 1.6 ? 2 : now < 2.4 ? 3 : 4;
        for (let i = 0; i < count; i++) {
          const ox = baseX + i * 95;
          if (i === 3) {
            figure(ctx, ox, floorY + 4, 1.75, 0, 1, 0); // you
          } else {
            ctx.save();
            ctx.globalAlpha = 0.55 + 0.2 * Math.sin(now * 6 + i);
            ctx.shadowColor = '#fff';
            ctx.shadowBlur = 14;
            figure(ctx, ox, floorY + 4, 1.75, 0, 1, 0);
            ctx.restore();
          }
        }
        for (const b of NARRATION) if (now >= b.from && now <= b.to) text(b.text, W / 2, 150, b.text.startsWith('ITER') ? 54 : 30, fade(now, b), '"Courier New", monospace', now > 14 ? 1.5 : 0);
        // tape dies
        once('rise', 17.0, now, () => audio.stinger('rise'));
        if (now > 17.4 && now < 19) {
          for (let i = 0; i < 40; i++) {
            ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.25})`;
            ctx.fillRect(0, Math.random() * H, W, 1 + Math.random() * 3);
          }
          text('RECORDING ENDS', W / 2, 320, 38, 1, '"Courier New", monospace', 3);
        }
        // whiteout
        if (now > 18.4) {
          ctx.fillStyle = `rgba(255,255,255,${Math.min(1, (now - 18.4) / 1.6)})`;
          ctx.fillRect(0, 0, W, H);
        }
        if (now < 1.2) {
          ctx.fillStyle = `rgba(0,0,0,${1 - now / 1.2})`;
          ctx.fillRect(0, 0, W, H);
        }
      }
      // ============ the clock moves (20.5 – 27)
      else if (now < 27) {
        ctx.fillStyle = '#f4f4f4';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#050505';
        const flipped = now > 22.2;
        text(flipped ? '03:17:45' : '03:17:44', W / 2, 360, 120, 1, 'Impact, "Arial Narrow Bold", sans-serif');
        ctx.fillStyle = '#050505';
        once('bell', 22.2, now, () => audio.elevatorDing());
        if (now > 23.6) {
          ctx.save();
          ctx.globalAlpha = Math.min(1, (now - 23.6) / 1.0);
          ctx.fillStyle = '#050505';
          ctx.font = '30px "Courier New", monospace';
          ctx.textAlign = 'center';
          ctx.fillText('The clock moves.', W / 2, 440);
          ctx.restore();
        }
        if (now > 25.6) {
          ctx.fillStyle = `rgba(0,0,0,${Math.min(1, (now - 25.6) / 1.2)})`;
          ctx.fillRect(0, 0, W, H);
        }
      }
      // ============ PART 2: the teaser (27 – 49)
      else {
        once('glitch', 27.8, now, () => audio.stinger('glitch'));
        for (const b of CARDS) {
          if (now >= b.from && now <= b.to) {
            const glitchy = Math.random() < 0.08 ? 10 : 2;
            text(b.text, W / 2, 380, b.size ?? 48, fade(now, b), 'Impact, "Arial Narrow Bold", sans-serif', glitchy);
          }
        }
        // the Shadow, three strobes
        if (now > 35.4 && now < 37.4) {
          once('hit', 35.4, now, () => audio.stinger('hit'));
          const on = Math.floor((now - 35.4) * 10) % 4 !== 3;
          if (on) {
            ctx.fillStyle = '#e8e8e8';
            ctx.fillRect(0, 0, W, H);
            shadowFace(ctx, W / 2, 230, 1.1 + (now - 35.4) * 0.3, now);
          }
        }
        if (now >= 37.6 && now < 41.4) {
          once('low2', 37.6, now, () => audio.stinger('low'));
          const a = Math.min((now - 37.6) / 0.8, (41.4 - now) / 0.6, 1);
          text('SOMEONE ELSE IS STILL INSIDE.', W / 2, 360, 40, a, '"Courier New", monospace', 1);
          // a small elevator light blinking in the dark
          ctx.fillStyle = `rgba(255,255,255,${0.2 + 0.8 * (Math.sin(now * 5) > 0 ? 1 : 0)})`;
          ctx.beginPath();
          ctx.arc(W / 2, 450, 5, 0, Math.PI * 2);
          ctx.fill();
        }
        if (now >= 41.8) {
          once('title', 41.8, now, () => audio.elevatorArrive());
          const a = Math.min(1, (now - 41.8) / 1.2);
          const jit = Math.random() < 0.06 ? 8 : 0;
          text('ECHO//ZERO', W / 2 + jit, 330, 128, a, 'Impact, "Arial Narrow Bold", sans-serif', jit);
          if (now > 43.6) text('2.0', W / 2 + 470, 330, 60, Math.min(1, (now - 43.6) / 0.6), 'Impact, "Arial Narrow Bold", sans-serif', 2);
          if (now > 44.6) text('NO ONE LEAVES ALONE.', W / 2, 400, 28, Math.min(1, (now - 44.6) / 1.0), '"Courier New", monospace');
          if (now > 46.2) text('COMING SOON', W / 2, 470, 20, 0.6 + 0.4 * Math.sin(now * 3), '"Courier New", monospace');
        }
      }
      // vignette + grain on everything
      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.95);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.5)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 90; i++) {
        ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.1})`;
        ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2);
      }
      if (now >= T_END) {
        setDone(true);
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const key = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.code === 'Enter') st.current.skip = true;
    };
    window.addEventListener('keydown', key);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', key);
    };
  }, []);

  return (
    <div className="ending">
      <canvas ref={cv} className="ending-canvas" />
      {!done && <div className="end-skip">ENTER — SKIP</div>}
      {done && (
        <div className="end-final" style={{ position: 'absolute', bottom: '7%', left: 0, right: 0 }}>
          <div className="end-small dim">TRUE ENDING &nbsp;·&nbsp; THE LOOP IS BROKEN</div>
          <div style={{ height: 14 }} />
          <button className="btn" onClick={() => { audio.uiClick(); bus.emit('cmd:quit'); }}>
            MAIN MENU
          </button>
        </div>
      )}
    </div>
  );
}
