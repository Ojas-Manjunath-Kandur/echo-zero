import type Phaser from 'phaser';
import type { Compiled } from '../sim/compile';
import type { Sig } from '../levels/types';
import { S_TICK } from '../sim/state';

type Gfx = Phaser.GameObjects.Graphics;

const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

export function sigLeaves(sig: Sig, out: string[] = []): string[] {
  if (typeof sig === 'string') out.push(sig);
  else if ('not' in sig) sigLeaves(sig.not, out);
  else if ('all' in sig) sig.all.forEach((s) => sigLeaves(s, out));
  else sig.any.forEach((s) => sigLeaves(s, out));
  return out;
}

/** 7-segment digit using rectangles (used for elevator floor displays) */
const SEG: Record<string, number> = {
  '0': 0b1111110,
  '1': 0b0110000,
  '2': 0b1101101,
  '3': 0b1111001,
  '4': 0b0110011,
  '5': 0b1011011,
  '6': 0b1011111,
  '7': 0b1110000,
  '8': 0b1111111,
  '9': 0b1111011,
  B: 0b0011111,
};
export function drawDigit(g: Gfx, ch: string, x: number, y: number, h: number, a = 1) {
  const m = SEG[ch] ?? 0;
  const w = h * 0.55;
  const t = Math.max(2, h * 0.14);
  const on = (bit: number) => (m >> (6 - bit)) & 1;
  const seg = (bit: number, rx: number, ry: number, rw: number, rh: number) => {
    g.fillStyle(0xffffff, on(bit) ? a : a * 0.08);
    g.fillRect(rx, ry, rw, rh);
  };
  seg(0, x + t, y, w - 2 * t, t);
  seg(1, x + w - t, y + t, t, h / 2 - t);
  seg(2, x + w - t, y + h / 2, t, h / 2 - t);
  seg(3, x + t, y + h - t, w - 2 * t, t);
  seg(4, x, y + h / 2, t, h / 2 - t);
  seg(5, x, y + t, t, h / 2 - t);
  seg(6, x + t, y + h / 2 - t / 2, w - 2 * t, t);
}

export interface LeafRef {
  off: number;
  special?: 'echo' | 'cards';
}

export class DynamicRenderer {
  private gateLeaves: LeafRef[][] = [];
  private elevatorFloor = '0';

  constructor(private readonly c: Compiled) {
    for (const gt of c.gates) {
      const refs: LeafRef[] = [];
      for (const id of sigLeaves(gt.def.open)) {
        const p = c.plates.find((q) => q.def.id === id) ?? c.levers.find((q) => q.def.id === id);
        if (p) refs.push({ off: p.off });
      }
      this.gateLeaves.push(refs);
    }
    const f = c.def.floor;
    this.elevatorFloor = f === 0 ? 'B' : String(f);
  }

  /**
   * Draws all dynamic level objects from state vector S.
   * `env` is lit by the lightmap; `emit` is drawn on top of the lighting (glowing things).
   * `a` is an overall alpha (used for translucent "future" previews).
   */
  draw(env: Gfx, emit: Gfx, S: Float64Array, timeSec: number, a = 1, ghost = false) {
    const c = this.c;
    const tick = S[S_TICK];

    // ---- plates
    for (const p of c.plates) {
      const pressed = S[p.off] > 0.5;
      const x = p.def.x - p.def.w / 2;
      const y = p.def.y;
      const dy = pressed ? 3 : 0;
      env.fillStyle(0x0a0a0a, a);
      env.fillRect(x - 6, y - 4 + dy, p.def.w + 12, 6);
      env.fillStyle(pressed ? 0xe8e8e8 : 0x9a9a9a, a);
      env.fillRect(x, y - 8 + dy, p.def.w, 5);
      env.lineStyle(2, 0x050505, a);
      env.strokeRect(x, y - 8 + dy, p.def.w, 5);
      emit.fillStyle(0xffffff, (pressed ? 1 : 0.28 + 0.12 * Math.sin(timeSec * 3)) * a);
      emit.fillRect(x + p.def.w / 2 - 12, y - 6 + dy, 24, 2);
    }

    // ---- levers / buttons
    for (const l of c.levers) {
      const on = S[l.off] > 0.5;
      const x = l.def.x;
      const y = l.def.y;
      env.fillStyle(0x151515, a);
      env.fillRect(x - 12, y - 46, 24, 46);
      env.lineStyle(2.5, 0x050505, a);
      env.strokeRect(x - 12, y - 46, 24, 46);
      if (l.def.resetTicks) {
        // timed push button with a draining ring
        const frac = on ? S[l.off + 1] / l.def.resetTicks : 0;
        emit.fillStyle(0xffffff, (on ? 1 : 0.35) * a);
        emit.fillCircle(x, y - 28, 6);
        if (frac > 0) {
          emit.lineStyle(3, 0xffffff, 0.9 * a);
          emit.beginPath();
          emit.arc(x, y - 28, 11, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac, false);
          emit.strokePath();
        }
      } else {
        const ang = on ? -0.65 : 0.65;
        const bx = x + Math.sin(ang) * 22;
        const by = y - 24 - Math.cos(ang) * 22;
        env.lineStyle(5, 0xd8d8d8, a);
        env.beginPath();
        env.moveTo(x, y - 24);
        env.lineTo(bx, by);
        env.strokePath();
        emit.fillStyle(0xffffff, (on ? 1 : 0.35) * a);
        emit.fillCircle(bx, by, 4.5);
      }
    }

    // ---- gates (doors, shutters, bridges)
    c.gates.forEach((gt, gi) => {
      const d = gt.def;
      const open = S[gt.off];
      const style = d.style ?? 'door';
      if (gt.bridge) {
        const x = d.x;
        const w = d.w;
        if (open > 0.02) {
          const aa = a * Math.min(1, open * 1.4);
          env.fillStyle(0x1a1a1a, aa);
          env.fillRect(x, d.y, w, 14);
          env.fillStyle(0xf0f0f0, aa);
          env.fillRect(x, d.y, w, 4);
          env.lineStyle(2, 0x050505, aa);
          env.strokeRect(x, d.y, w, 14);
          emit.fillStyle(0xffffff, 0.55 * aa);
          emit.fillRect(x + 4, d.y + 8, w - 8, 2);
        }
        if (open < 0.98) {
          // unpowered: faint dashed outline
          env.lineStyle(1.5, 0xffffff, (0.25 + 0.12 * Math.sin(timeSec * 4)) * a * (1 - open));
          for (let sx = d.x; sx < d.x + w - 6; sx += 14) {
            env.beginPath();
            env.moveTo(sx, d.y + 1);
            env.lineTo(sx + 7, d.y + 1);
            env.strokePath();
          }
        }
      } else {
        const hClosed = d.h * (1 - open);
        if (style === 'beam') {
          if (hClosed > 2) {
            const flick = 0.75 + 0.25 * hash(Math.floor(timeSec * 30) + gi);
            for (let bx = d.x + 4; bx < d.x + d.w; bx += 8) {
              emit.lineStyle(2, 0xffffff, flick * a * (1 - open));
              emit.beginPath();
              emit.moveTo(bx, d.y);
              emit.lineTo(bx, d.y + hClosed);
              emit.strokePath();
            }
          }
        } else if (hClosed > 1) {
          const dark = style === 'glass' ? 0x3a3a3a : style === 'vault' ? 0x1c1c1c : 0x232323;
          env.fillStyle(dark, (style === 'glass' ? 0.7 : 1) * a);
          env.fillRect(d.x, d.y, d.w, hClosed);
          env.lineStyle(3, 0x050505, a);
          env.strokeRect(d.x, d.y, d.w, hClosed);
          // hazard stripes along the leading edge
          env.fillStyle(0xe6e6e6, a);
          const ey = d.y + hClosed - 10;
          for (let sx = d.x; sx < d.x + d.w; sx += 10) {
            env.fillRect(sx, ey, 5, 10);
          }
          env.fillStyle(0x0a0a0a, a);
          for (let sx = d.x + 5; sx < d.x + d.w; sx += 10) env.fillRect(sx, ey, 5, 10);
          if (style === 'glass') {
            env.lineStyle(2, 0xffffff, 0.35 * a);
            env.beginPath();
            env.moveTo(d.x + 3, d.y + 6);
            env.lineTo(d.x + d.w - 3, d.y + hClosed * 0.5);
            env.strokePath();
          }
          if (style === 'vault') {
            env.fillStyle(0xcfcfcf, a);
            for (let by = d.y + 14; by < d.y + hClosed - 14; by += 26) env.fillCircle(d.x + d.w / 2, by, 3);
          }
        }
        // frame
        env.fillStyle(0x0b0b0b, a);
        env.fillRect(d.x - 5, d.y - 6, d.w + 10, 8);
      }
      // status LEDs along the top: one per required input
      const leaves = this.gateLeaves[gi];
      const lx0 = d.x + d.w / 2 - (leaves.length * 11) / 2;
      leaves.forEach((lf, i) => {
        const lit = S[lf.off] > 0.5;
        emit.fillStyle(0xffffff, (lit ? 1 : 0.22) * a);
        emit.fillCircle(lx0 + i * 11 + 5, d.y - (gt.bridge ? 14 : 14), 3);
      });
    });

    // ---- phase platforms (time-dependent)
    c.phases.forEach((p, i) => {
      const d = p.def;
      const present = this.phasePresent(S, i, tick);
      const warn = this.phaseWarn(S, i, tick);
      const fl = warn > 0 && warn < 26 ? (Math.floor(tick / 3) % 2 === 0 ? 0.25 : 1) : 1;
      if (present) {
        env.fillStyle(0x161616, a * fl);
        env.fillRect(d.x, d.y, d.w, 16);
        env.fillStyle(0xffffff, a * fl);
        env.fillRect(d.x, d.y, d.w, 4);
        env.lineStyle(2, 0x050505, a * fl);
        env.strokeRect(d.x, d.y, d.w, 16);
        emit.fillStyle(0xffffff, 0.5 * a * fl);
        for (let sx = d.x + 8; sx < d.x + d.w - 8; sx += 18) emit.fillRect(sx, d.y + 9, 8, 2);
      } else {
        env.lineStyle(1.5, 0xffffff, (0.3 + 0.15 * Math.sin(timeSec * 5 + i)) * a * (warn > 0 && warn < 26 ? fl : 1));
        for (let sx = d.x; sx < d.x + d.w - 8; sx += 14) {
          env.beginPath();
          env.moveTo(sx, d.y);
          env.lineTo(sx + 8, d.y);
          env.strokePath();
        }
        for (let sx = d.x; sx <= d.x + d.w; sx += d.w) {
          env.beginPath();
          env.moveTo(sx, d.y);
          env.lineTo(sx, d.y + 14);
          env.strokePath();
        }
      }
    });

    // ---- hazards
    c.hazards.forEach((h, i) => {
      const t = tick;
      const on = (t + h.offset) % h.period < h.on;
      const warn = on ? 0 : h.period - ((t + h.offset) % h.period);
      const vertical = h.h >= h.w;
      const ax = vertical ? h.x + h.w / 2 : h.x;
      const ay = vertical ? h.y : h.y + h.h / 2;
      const bx = vertical ? h.x + h.w / 2 : h.x + h.w;
      const by = vertical ? h.y + h.h : h.y + h.h / 2;
      env.fillStyle(0x0c0c0c, a);
      env.fillCircle(ax, ay, 8);
      env.fillCircle(bx, by, 8);
      env.lineStyle(2, 0xdddddd, a);
      env.strokeCircle(ax, ay, 8);
      env.strokeCircle(bx, by, 8);
      if (on) {
        const seg = 9;
        for (let k = 0; k < 3; k++) {
          emit.lineStyle(k === 0 ? 3 : 1.5, 0xffffff, (k === 0 ? 1 : 0.6) * a);
          emit.beginPath();
          emit.moveTo(ax, ay);
          for (let s = 1; s < seg; s++) {
            const f = s / seg;
            const jx = (hash(i * 7 + s * 13 + Math.floor(timeSec * 40) + k * 5) - 0.5) * 16;
            const jy = (hash(i * 5 + s * 17 + Math.floor(timeSec * 40) + k * 9) - 0.5) * 16;
            emit.lineTo(ax + (bx - ax) * f + (vertical ? jx : 0), ay + (by - ay) * f + (vertical ? 0 : jy));
          }
          emit.lineTo(bx, by);
          emit.strokePath();
        }
      } else if (warn < 30) {
        emit.fillStyle(0xffffff, (0.4 + 0.6 * hash(Math.floor(timeSec * 30) + i)) * a);
        emit.fillCircle(ax, ay, 3.5);
        emit.fillCircle(bx, by, 3.5);
      } else {
        emit.fillStyle(0xffffff, 0.2 * a);
        emit.fillCircle(ax, ay, 2.5);
        emit.fillCircle(bx, by, 2.5);
      }
    });

    // ---- terminals
    if (!ghost) for (const tm of c.terminals) {
      const x = tm.def.x;
      const y = tm.def.y;
      const read = S[tm.off] > 0.5;
      env.fillStyle(0x101010, a);
      env.fillRect(x - 5, y - 20, 10, 20);
      env.fillRect(x - 15, y - 3, 30, 3);
      env.fillStyle(0x161616, a);
      env.fillRect(x - 26, y - 62, 52, 42);
      env.lineStyle(3, 0x050505, a);
      env.strokeRect(x - 26, y - 62, 52, 42);
      emit.fillStyle(0xd6d6d6, (read ? 0.75 : 0.95) * a);
      emit.fillRect(x - 21, y - 57, 42, 32);
      emit.fillStyle(0x060606, a);
      for (let i = 0; i < 4; i++) emit.fillRect(x - 17, y - 52 + i * 7, 18 + ((i * 11) % 14), 2);
      if (!read && Math.floor(timeSec * 2) % 2 === 0) emit.fillRect(x + 8, y - 31, 6, 3);
    }

    // ---- pickups
    if (!ghost) for (const p of c.pickups) {
      if (S[p.off] > 0.5) continue;
      const bob = Math.sin(timeSec * 2.4 + p.def.x * 0.01) * 3;
      const x = p.def.x;
      const y = p.def.y - 22 + bob;
      emit.fillStyle(0xffffff, 0.12 * a);
      emit.fillCircle(x, y, 22);
      emit.fillStyle(0xffffff, 0.2 * a);
      emit.fillCircle(x, y, 14);
      if (p.def.kind === 'card') {
        emit.fillStyle(0xf4f4f4, a);
        emit.fillRect(x - 10, y - 7, 20, 14);
        emit.lineStyle(2, 0x050505, a);
        emit.strokeRect(x - 10, y - 7, 20, 14);
        emit.fillStyle(0x080808, a);
        emit.fillRect(x - 10, y - 3, 20, 3);
        emit.fillRect(x - 7, y + 2, 7, 2);
      } else if (p.def.kind === 'fragment') {
        emit.fillStyle(0xf0f0f0, a);
        emit.beginPath();
        emit.moveTo(x - 9, y - 9);
        emit.lineTo(x + 8, y - 7);
        emit.lineTo(x + 10, y + 2);
        emit.lineTo(x + 3, y + 9);
        emit.lineTo(x - 8, y + 6);
        emit.closePath();
        emit.fillPath();
        emit.lineStyle(1.5, 0x050505, a);
        for (let i = 0; i < 3; i++) {
          emit.beginPath();
          emit.moveTo(x - 6, y - 4 + i * 4);
          emit.lineTo(x + 6 - i * 2, y - 4 + i * 4);
          emit.strokePath();
        }
      } else {
        emit.fillStyle(0xeaeaea, a);
        emit.fillRect(x - 11, y - 8, 22, 16);
        emit.lineStyle(2, 0x050505, a);
        emit.strokeRect(x - 11, y - 8, 22, 16);
        emit.fillStyle(0x080808, a);
        emit.fillCircle(x - 5, y - 1, 3.5);
        emit.fillCircle(x + 5, y - 1, 3.5);
      }
    }

    // ---- exit / elevator doors
    if (c.exit && !ghost) {
      const e = c.exit.def;
      const open = S[c.exit.off + 1];
      const fw = 150;
      const fh = 200;
      const x0 = e.x - fw / 2;
      const y0 = e.y - fh;
      // interior
      env.fillStyle(0x2a2a2a, a);
      env.fillRect(x0, y0, fw, fh);
      emit.fillStyle(0xffffff, (0.12 + 0.7 * open) * a);
      emit.fillRect(x0, y0, fw, fh);
      // doors
      const half = (fw / 2) * (1 - open);
      env.fillStyle(0x6a6a6a, a);
      env.fillRect(x0, y0, half, fh);
      env.fillRect(x0 + fw - half, y0, half, fh);
      env.lineStyle(3, 0x050505, a);
      if (half > 1) {
        env.strokeRect(x0, y0, half, fh);
        env.strokeRect(x0 + fw - half, y0, half, fh);
      }
      env.fillStyle(0xffffff, 0.35 * a);
      if (half > 4) {
        env.fillRect(x0 + 6, y0 + 8, 3, fh - 16);
        env.fillRect(x0 + fw - 9, y0 + 8, 3, fh - 16);
      }
      // display
      emit.fillStyle(0x000000, a);
      emit.fillRect(e.x - 30, y0 - 50, 60, 30);
      const next = e.toFloor < 0 ? '0' : this.elevatorFloor;
      drawDigit(emit, next === 'B' ? 'B' : next, e.x - 8, y0 - 46, 22, 0.95 * a);
      // call light
      const ok = S[c.exit.off + 1] > 0.1;
      emit.fillStyle(0xffffff, (ok ? 1 : 0.18) * a);
      emit.fillCircle(e.x + fw / 2 + 22, e.y - 90, 4);
    }
  }

  phasePresent(S: Float64Array, i: number, t: number): boolean {
    const p = this.c.phases[i];
    const d = p.def;
    if (d.timeline) {
      // counted from echo state externally; renderers treat timeline platforms via `timelineCount`
      return (this.timelineCount ?? 0) >= d.timeline.min && (d.timeline.max === undefined || (this.timelineCount ?? 0) <= d.timeline.max);
    }
    if (!d.cycle || p.sum <= 0) return true;
    let m = (t + (d.offset ?? 0)) % p.sum;
    for (let k = 0; k < d.cycle.length; k++) {
      if (m < d.cycle[k]) return k % 2 === 0;
      m -= d.cycle[k];
    }
    return true;
  }

  /** ticks until the platform next changes state (0 if timeline-driven) */
  phaseWarn(S: Float64Array, i: number, t: number): number {
    const p = this.c.phases[i];
    const d = p.def;
    if (!d.cycle || p.sum <= 0) return 0;
    let m = (t + (d.offset ?? 0)) % p.sum;
    for (let k = 0; k < d.cycle.length; k++) {
      if (m < d.cycle[k]) return d.cycle[k] - m;
      m -= d.cycle[k];
    }
    return 0;
  }

  /** set each frame by the scene: number of echoes alive at the rendered tick */
  timelineCount = 0;
}
