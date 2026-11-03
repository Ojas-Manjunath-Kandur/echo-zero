import { useEffect, useRef, useState } from 'react';
import { audio } from '../game/audio/AudioManager';
import { bus } from '../game/bus';

// Timeline (seconds)
const T_WALK0 = 1.0;
const T_WALK1 = 8.0;
const T_TURN = 9.4;
const T_CUT = 10.8;
const T_ELEV = 12.6;
const T_TEXT = 15.2;
const T_TEXT_OFF = 19.6;
const T_FLASH = 22.4;
const T_END = 24.2;

function ts(sec: number): string {
  const s = 33 + Math.floor(sec);
  return `14 NOV 2023   03:17:${String(s).padStart(2, '0')}`;
}

export function figure(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, phase: number, face: number, frontal: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = '#050505';
  ctx.strokeStyle = '#050505';
  ctx.lineCap = 'round';
  ctx.lineWidth = 6;
  if (frontal < 0.5) {
    ctx.scale(face, 1);
    // legs
    for (const k of [0, 1]) {
      const a = Math.sin(phase + k * Math.PI) * 0.6;
      ctx.beginPath();
      ctx.moveTo(0, -30);
      ctx.lineTo(Math.sin(a) * 26, -30 + Math.cos(a) * 30);
      ctx.stroke();
    }
    // coat
    ctx.beginPath();
    ctx.moveTo(-9, -80);
    ctx.lineTo(10, -80);
    ctx.lineTo(14, -22);
    ctx.lineTo(-18 - Math.sin(phase) * 4, -20);
    ctx.closePath();
    ctx.fill();
    // arm
    ctx.beginPath();
    ctx.moveTo(0, -76);
    ctx.lineTo(Math.sin(phase + Math.PI) * 14, -48);
    ctx.stroke();
    // head + hat
    ctx.beginPath();
    ctx.arc(2, -90, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-9, -97, 24, 4);
    ctx.fillRect(-4, -108, 14, 12);
  } else {
    for (const k of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(k * 5, -30);
      ctx.lineTo(k * 6, 0);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-12, -80);
    ctx.lineTo(12, -80);
    ctx.lineTo(16, -22);
    ctx.lineTo(-16, -22);
    ctx.closePath();
    ctx.fill();
    for (const k of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(k * 13, -76);
      ctx.lineTo(k * 17, -38);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, -90, 8.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-13, -97, 26, 4);
    ctx.fillRect(-6, -108, 12, 12);
    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(-4.5, -92, 3, 3.5);
    ctx.fillRect(1.5, -92, 3, 3.5);
  }
  ctx.restore();
}

function lobby(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, sec: number) {
  const floorY = H * 0.78;
  // wall
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#4a4a4a');
  g.addColorStop(1, '#2c2c2c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // floor
  ctx.fillStyle = '#1d1d1d';
  ctx.fillRect(0, floorY, W, H - floorY);
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 12; i++) {
    ctx.beginPath();
    ctx.moveTo(W * 0.5 + (i - 6) * 20, floorY);
    ctx.lineTo(W * 0.5 + (i - 6) * 220, H);
    ctx.stroke();
  }
  // glass entrance (left)
  ctx.fillStyle = '#8c8c8c';
  ctx.fillRect(W * 0.02, floorY - 330, 210, 330);
  ctx.fillStyle = '#d4d4d4';
  ctx.fillRect(W * 0.02 + 10, floorY - 320, 190, 310);
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 5;
  ctx.strokeRect(W * 0.02, floorY - 330, 210, 330);
  ctx.beginPath();
  ctx.moveTo(W * 0.02 + 105, floorY - 330);
  ctx.lineTo(W * 0.02 + 105, floorY);
  ctx.stroke();
  // reception counter
  ctx.fillStyle = '#121212';
  ctx.fillRect(W * 0.58, floorY - 120, 360, 120);
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(W * 0.58 - 8, floorY - 130, 376, 12);
  // sign + clock
  ctx.fillStyle = '#e6e6e6';
  ctx.font = `bold ${H * 0.04}px Impact, sans-serif`;
  ctx.fillText('RECEPTION', W * 0.58 + 90, floorY - 220);
  ctx.beginPath();
  ctx.arc(W * 0.5, floorY - 280, 34, 0, Math.PI * 2);
  ctx.fillStyle = '#ddd';
  ctx.fill();
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 4;
  ctx.stroke();
  // clock hands stopped at 3:17
  ctx.beginPath();
  ctx.moveTo(W * 0.5, floorY - 280);
  ctx.lineTo(W * 0.5 + 18, floorY - 280 - 9);
  ctx.moveTo(W * 0.5, floorY - 280);
  ctx.lineTo(W * 0.5 - 4, floorY - 280 - 26);
  ctx.stroke();
  // elevator at the back
  ctx.fillStyle = '#242424';
  ctx.fillRect(W * 0.84, floorY - 280, 170, 280);
  ctx.strokeStyle = '#0a0a0a';
  ctx.strokeRect(W * 0.84, floorY - 280, 170, 280);
  void t;
  void sec;
}

/** The final cinematic: a security-camera recording of the player entering the building, a cut to black, an elevator arriving. */
export function Ending({ stats }: { stats: { deaths: number; rewinds: number; seconds: number } }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<'play' | 'done'>('play');
  const [text, setText] = useState(0); // 0 none, 1 main, 2 iteration
  const state = useRef({ start: 0, elevStarted: false, flashed: false, skip: false });

  useEffect(() => {
    const c = cv.current!;
    const ctx = c.getContext('2d')!;
    const W = (c.width = 1280);
    const H = (c.height = 720);
    state.current.start = performance.now();
    audio.stopAll();
    let raf = 0;
    const noise = document.createElement('canvas');
    noise.width = 160;
    noise.height = 90;
    const nctx = noise.getContext('2d')!;
    const img = nctx.createImageData(160, 90);

    const frame = () => {
      const st = state.current;
      let sec = (performance.now() - st.start) / 1000;
      if (st.skip) {
        sec = Math.max(sec, T_END);
        st.start = performance.now() - sec * 1000;
      }
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);

      if (sec < T_CUT) {
        // --- camera recording
        ctx.save();
        const shake = sec > T_TURN ? (Math.random() - 0.5) * 6 : 0;
        ctx.translate(shake, 0);
        lobby(ctx, W, H, sec, sec);
        const floorY = H * 0.78;
        const wp = Math.min(1, Math.max(0, (sec - T_WALK0) / (T_WALK1 - T_WALK0)));
        const x = 120 + wp * (W * 0.46);
        const scale = 1.9 + wp * 0.5;
        if (sec > T_WALK0) {
          const turning = sec >= T_TURN ? 1 : 0;
          figure(ctx, x, floorY + wp * 30, scale, sec * 6.2, 1, sec > T_TURN - 0.4 ? 1 : 0);
          void turning;
        }
        ctx.restore();
        // camera look: scanlines, vignette, noise
        for (let y = 0; y < H; y += 4) {
          ctx.fillStyle = 'rgba(0,0,0,0.18)';
          ctx.fillRect(0, y, W, 2);
        }
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          const v = Math.random() * 255;
          d[i] = d[i + 1] = d[i + 2] = v;
          d[i + 3] = 40;
        }
        nctx.putImageData(img, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(noise, 0, 0, W, H);
        const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.9);
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(1, 'rgba(0,0,0,0.75)');
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, W, H);
        // glitch bands near the end
        if (sec > T_TURN - 0.6) {
          for (let i = 0; i < 5; i++) {
            const y = Math.random() * H;
            const h = 6 + Math.random() * 30;
            ctx.drawImage(c, 0, y, W, h, (Math.random() - 0.5) * 80, y, W, h);
          }
        }
        // overlay
        ctx.fillStyle = '#f0f0f0';
        ctx.font = '24px "Courier New", monospace';
        ctx.fillText('CAM 01  LOBBY', 40, 56);
        ctx.fillText(ts(Math.max(0, sec - 1)), 40, H - 40);
        if (Math.floor(sec * 2) % 2 === 0) {
          ctx.beginPath();
          ctx.arc(W - 120, 50, 9, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillText('REC', W - 100, 58);
        // fade in from black
        if (sec < 1) {
          ctx.fillStyle = `rgba(0,0,0,${1 - sec})`;
          ctx.fillRect(0, 0, W, H);
        }
      } else {
        // --- black
        if (sec >= T_ELEV && !st.elevStarted) {
          st.elevStarted = true;
          audio.init();
          audio.elevatorArrive();
        }
        if (sec >= T_TEXT && sec < T_TEXT_OFF + 0.6) {
          setText(1);
        } else if (sec >= T_TEXT_OFF + 0.6 && sec < T_FLASH) {
          setText(2);
        } else setText(0);
        if (sec >= T_FLASH && sec < T_FLASH + 0.16) {
          if (!st.flashed) {
            st.flashed = true;
            audio.stinger('hit');
          }
          // one frame of it, standing very close, looking out
          ctx.fillStyle = '#d8d8d8';
          ctx.fillRect(0, 0, W, H);
          figure(ctx, W / 2, H * 0.98, 5.4, 0, 1, 1);
        }
      }
      if (sec >= T_END) {
        setPhase('done');
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const key = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.code === 'Enter') state.current.skip = true;
    };
    window.addEventListener('keydown', key);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', key);
    };
  }, []);

  const mins = Math.floor(stats.seconds / 60);
  return (
    <div className="ending">
      <canvas ref={cv} className="ending-canvas" />
      {phase === 'play' && text === 1 && <div className="end-text">YOU HAVE BEEN HERE BEFORE.</div>}
      {phase === 'play' && text === 2 && <div className="end-small">ENTRY 0413 &nbsp;·&nbsp; SUBJECT INTAKE &nbsp;·&nbsp; 03:17</div>}
      {phase === 'play' && <div className="end-skip">ENTER — SKIP</div>}
      {phase === 'done' && (
        <div className="end-final">
          <div className="end-small big">ENTRY 0413 &nbsp;·&nbsp; SUBJECT INTAKE &nbsp;·&nbsp; 03:17</div>
          <div className="end-small dim">The elevator doors are open.</div>
          <div className="end-stats">
            {stats.deaths} {stats.deaths === 1 ? "DEATH" : "DEATHS"} &nbsp;·&nbsp; {stats.rewinds} {stats.rewinds === 1 ? "REWIND" : "REWINDS"} &nbsp;·&nbsp; {mins}m {stats.seconds % 60}s
          </div>
          <button className="btn" onClick={() => { audio.uiClick(); bus.emit('cmd:quit'); }}>
            MAIN MENU
          </button>
        </div>
      )}
    </div>
  );
}
