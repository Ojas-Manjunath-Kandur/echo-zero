import type Phaser from 'phaser';

type Gfx = Phaser.GameObjects.Graphics;

export interface PoseIn {
  vx: number;
  vy: number;
  ground: boolean;
  landT: number;
  landV: number;
  inter: boolean;
  wake: number; // ticks remaining of the wake-up animation (0 = awake)
  sneak: boolean;
  skid: boolean;
}

export interface CharStyle {
  fill: number;
  fillA: number;
  rim: number;
  rimA: number;
  /** extra rim width (ghosts glow more) */
  rimBoost?: number;
  /** body scale */
  scale?: number;
  /** horizontal glitch slice offset for ghosts */
  glitch?: number;
}

// joint pose layout
const J = {
  tA: 0, // front thigh angle
  kA: 1, // front knee bend
  tB: 2,
  kB: 3,
  aA: 4, // front arm
  eA: 5,
  aB: 6,
  eB: 7,
  lean: 8,
  hip: 9,
  head: 10,
} as const;
const NJ = 11;

const ease = (t: number) => t * t * (3 - 2 * t);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/**
 * Visual-only animation state for one character (player or echo). Blends several procedural
 * poses by smoothed weights so transitions never pop.
 */
export class CharAnimator {
  phase = 0;
  t = 0;
  wIdle = 1;
  wRun = 0;
  wSneak = 0;
  wRise = 0;
  wFall = 0;
  wLand = 0;
  wSkid = 0;
  wInter = 0;
  tail = 0;
  tailV = 0;
  sx = 1;
  sy = 1;
  rot = 0;
  lastVy = 0;
  private pose = new Float32Array(NJ);
  private tmp = new Float32Array(NJ);

  update(p: PoseIn, dt: number) {
    this.t += dt;
    const sp = Math.abs(p.vx);
    const k = 1 - Math.exp(-dt * 16);
    const grounded = p.ground && p.wake <= 0;
    const run = grounded && sp > 25 && !p.sneak ? clamp(sp / 190, 0.25, 1) : 0;
    const sn = grounded && sp > 12 && p.sneak ? 1 : 0;
    const air = !p.ground ? 1 : 0;
    const rise = air && p.vy < 0 ? 1 : 0;
    const fall = air && p.vy >= 0 ? 1 : 0;
    const land = p.landT > 0 ? clamp(p.landT / 14, 0, 1) : 0;
    const idle = grounded && sp <= 25 && !(p.sneak && sp > 12) && land === 0 ? 1 : 0;
    this.wRun += (run - this.wRun) * k;
    this.wSneak += (sn - this.wSneak) * k;
    this.wRise += (rise - this.wRise) * (1 - Math.exp(-dt * 28));
    this.wFall += (fall - this.wFall) * (1 - Math.exp(-dt * 28));
    this.wLand += (land - this.wLand) * (1 - Math.exp(-dt * 34));
    this.wSkid += ((p.skid ? 1 : 0) - this.wSkid) * (1 - Math.exp(-dt * 30));
    this.wIdle += (Math.max(idle, p.wake > 0 ? 1 : 0) - this.wIdle) * k;
    this.wInter += ((p.inter ? 1 : 0) - this.wInter) * (1 - Math.exp(-dt * 22));
    // run cycle advances with ground speed
    if (grounded) this.phase += sp * dt * (p.sneak ? 0.075 : 0.052);
    // coat tail: spring that lags behind velocity
    const target = clamp(-p.vx * 0.045, -16, 16) + (air ? -p.vy * 0.012 : 0);
    this.tailV += (target - this.tail) * 160 * dt;
    this.tailV *= Math.exp(-dt * 11);
    this.tail += this.tailV * dt;
    // squash & stretch
    let ty = 1;
    let tx = 1;
    if (!p.ground) {
      const s = clamp(Math.abs(p.vy) / 5200, 0, 0.13);
      ty = 1 + s;
      tx = 1 - s * 0.7;
    }
    if (p.landT > 0) {
      const q = clamp(p.landT / 16, 0, 1) * clamp(p.landV / 900, 0.35, 1);
      ty = 1 - 0.26 * q;
      tx = 1 + 0.2 * q;
    }
    this.sy += (ty - this.sy) * (1 - Math.exp(-dt * 30));
    this.sx += (tx - this.sx) * (1 - Math.exp(-dt * 30));
    // waking up
    if (p.wake > 0) {
      const w = p.wake / 170;
      const rise2 = w > 0.58 ? 1 : ease(clamp(w / 0.58, 0, 1));
      this.rot = -1.42 * rise2;
    } else this.rot += (0 - this.rot) * (1 - Math.exp(-dt * 12));
    this.lastVy = p.vy;
  }

  private blend(): Float32Array {
    const out = this.pose;
    out.fill(0);
    let wsum = 0;
    const add = (w: number, fn: (o: Float32Array) => void) => {
      if (w < 0.002) return;
      fn(this.tmp);
      for (let i = 0; i < NJ; i++) out[i] += this.tmp[i] * w;
      wsum += w;
    };
    const t = this.t;
    const ph = this.phase;
    const breathe = Math.sin(t * 1.9);
    add(this.wIdle, (o) => {
      o[J.tA] = 0.06;
      o[J.kA] = -0.06;
      o[J.tB] = -0.09;
      o[J.kB] = -0.05;
      o[J.aA] = 0.14 + breathe * 0.03;
      o[J.eA] = -0.22;
      o[J.aB] = -0.1 - breathe * 0.03;
      o[J.eB] = -0.26;
      o[J.lean] = 0.03 + breathe * 0.014;
      o[J.hip] = -26 + breathe * 0.5;
      o[J.head] = 0.04 * Math.sin(t * 0.7);
    });
    add(this.wRun, (o) => {
      const s = Math.sin(ph);
      const s2 = Math.sin(ph + Math.PI);
      o[J.tA] = 0.95 * s;
      o[J.kA] = -(0.28 + 1.0 * Math.max(0, Math.cos(ph)));
      o[J.tB] = 0.95 * s2;
      o[J.kB] = -(0.28 + 1.0 * Math.max(0, Math.cos(ph + Math.PI)));
      o[J.aA] = -0.95 * s;
      o[J.eA] = -1.05;
      o[J.aB] = 0.95 * s;
      o[J.eB] = -1.05;
      o[J.lean] = 0.2;
      o[J.hip] = -25.5 + 2.6 * Math.abs(Math.cos(ph));
      o[J.head] = -0.1;
    });
    add(this.wSneak, (o) => {
      const s = Math.sin(ph);
      const s2 = Math.sin(ph + Math.PI);
      o[J.tA] = 0.62 * s + 0.2;
      o[J.kA] = -(0.65 + 0.5 * Math.max(0, Math.cos(ph)));
      o[J.tB] = 0.62 * s2 + 0.2;
      o[J.kB] = -(0.65 + 0.5 * Math.max(0, Math.cos(ph + Math.PI)));
      o[J.aA] = 0.4 * s;
      o[J.eA] = -0.9;
      o[J.aB] = -0.4 * s;
      o[J.eB] = -0.9;
      o[J.lean] = 0.4;
      o[J.hip] = -20;
      o[J.head] = -0.25;
    });
    add(this.wRise, (o) => {
      o[J.tA] = 0.9;
      o[J.kA] = -1.35;
      o[J.tB] = -0.3;
      o[J.kB] = -0.7;
      o[J.aA] = -2.4;
      o[J.eA] = -0.3;
      o[J.aB] = 1.7;
      o[J.eB] = -0.5;
      o[J.lean] = 0.1;
      o[J.hip] = -27;
      o[J.head] = -0.15;
    });
    add(this.wFall, (o) => {
      const f = clamp(this.lastVy / 500, 0, 1);
      o[J.tA] = 0.45 + 0.2 * f;
      o[J.kA] = -0.35;
      o[J.tB] = -0.45;
      o[J.kB] = -0.5;
      o[J.aA] = -1.7 - f * 0.4;
      o[J.eA] = -0.2;
      o[J.aB] = 1.3 + f * 0.3;
      o[J.eB] = -0.2;
      o[J.lean] = -0.04;
      o[J.hip] = -27;
      o[J.head] = 0.1;
    });
    add(this.wLand, (o) => {
      o[J.tA] = 1.15;
      o[J.kA] = -1.9;
      o[J.tB] = 0.75;
      o[J.kB] = -1.65;
      o[J.aA] = 0.7;
      o[J.eA] = -0.8;
      o[J.aB] = 0.2;
      o[J.eB] = -0.9;
      o[J.lean] = 0.5;
      o[J.hip] = -16;
      o[J.head] = -0.3;
    });
    add(this.wSkid, (o) => {
      o[J.tA] = 0.95;
      o[J.kA] = -0.2;
      o[J.tB] = -0.55;
      o[J.kB] = -0.5;
      o[J.aA] = -1.3;
      o[J.eA] = -0.3;
      o[J.aB] = 1.1;
      o[J.eB] = -0.3;
      o[J.lean] = -0.32;
      o[J.hip] = -24;
      o[J.head] = 0.2;
    });
    if (wsum < 0.001) {
      out[J.hip] = -26;
      wsum = 1;
    }
    for (let i = 0; i < NJ; i++) out[i] /= wsum;
    // interaction overlay: reach forward with the front arm
    if (this.wInter > 0.01) {
      const w = this.wInter;
      const tap = Math.sin(t * 18) * 0.08;
      out[J.aA] += (1.45 + tap - out[J.aA]) * w;
      out[J.eA] += (-0.15 - out[J.eA]) * w;
      out[J.lean] += (0.16 - out[J.lean]) * w * 0.6;
    }
    return out;
  }

  // reusable draw buffers
  private segs: number[] = [];
  private polys: number[][] = [];

  /** feet at (x,y); face = ±1 */
  draw(g: Gfx, x: number, y: number, face: number, st: CharStyle) {
    const p = this.blend();
    const sc = st.scale ?? 1;
    const sx = this.sx * sc;
    const sy = this.sy * sc;
    const cr = Math.cos(this.rot);
    const sr = Math.sin(this.rot);
    const lyingLift = this.rot < -0.05 ? Math.abs(Math.sin(this.rot)) * 7 : 0;
    // local (facing right, feet origin, y up negative) -> world
    const W = (lx: number, ly: number, out: number[], i: number) => {
      const rx = lx * cr - ly * sr;
      const ry = lx * sr + ly * cr;
      out[i] = x + rx * sx * face;
      out[i + 1] = y + ry * sy - lyingLift;
    };
    const P = new Array<number>(2);
    const pt = (lx: number, ly: number): [number, number] => {
      W(lx, ly, P, 0);
      return [P[0], P[1]];
    };

    const hipY = p[J.hip];
    const lean = p[J.lean];
    const hip: [number, number] = [0, hipY];
    const neckL: [number, number] = [Math.sin(lean) * 21, hipY - Math.cos(lean) * 21];
    const headL: [number, number] = [neckL[0] + Math.sin(lean + p[J.head]) * 8, neckL[1] - Math.cos(lean + p[J.head]) * 8];

    const leg = (th: number, kn: number): number[] => {
      const kx = hip[0] + Math.sin(th) * 13.5;
      const ky = hip[1] + Math.cos(th) * 13.5;
      const a2 = th + kn;
      let fx = kx + Math.sin(a2) * 13.5;
      let fy = ky + Math.cos(a2) * 13.5;
      // keep feet from sinking below the ground line
      if (fy > 0 && this.rot > -0.05) {
        fy = 0;
        fx = kx + Math.sqrt(Math.max(0, 13.5 * 13.5 - (0 - ky) * (0 - ky))) * Math.sign(Math.sin(a2) || 1);
      }
      return [kx, ky, fx, fy];
    };
    const arm = (al: number, el: number): number[] => {
      const sxp = neckL[0] - Math.sin(lean) * 3;
      const syp = neckL[1] + Math.cos(lean) * 3;
      const ex = sxp + Math.sin(al) * 10.5;
      const ey = syp + Math.cos(al) * 10.5;
      const a2 = al + el;
      return [sxp, syp, ex, ey, ex + Math.sin(a2) * 10, ey + Math.cos(a2) * 10];
    };
    const legB = leg(p[J.tB], p[J.kB]);
    const legA = leg(p[J.tA], p[J.kA]);
    const armB = arm(p[J.aB], p[J.eB]);
    const armA = arm(p[J.aA], p[J.eA]);

    // coat polygon (local coords)
    const tail = this.tail * (this.rot < -0.05 ? 0 : 1);
    const coat: number[] = [
      neckL[0] + 5.5, neckL[1] + 2,
      neckL[0] - 5.5, neckL[1] + 2,
      hip[0] - 7 - tail * 0.5, hip[1] + 5,
      hip[0] - 9 - tail, hip[1] + 20 + Math.sin(this.t * 7) * 0.8,
      hip[0] + 7 - tail * 0.3, hip[1] + 18,
      hip[0] + 8, hip[1] + 4,
    ];
    // hat (brim + crown)
    const hx = headL[0];
    const hy = headL[1];
    const hatTilt = lean * 0.6;
    const brim: number[] = [
      hx - 10 * Math.cos(hatTilt) + 1, hy - 4.5 + 10 * Math.sin(hatTilt),
      hx + 11 * Math.cos(hatTilt) + 2, hy - 4 - 11 * Math.sin(hatTilt) + 1,
      hx + 9 * Math.cos(hatTilt), hy - 2.2,
      hx - 9 * Math.cos(hatTilt), hy - 2.2,
    ];
    const crown: number[] = [hx - 5.2, hy - 4.5, hx - 4, hy - 11.5, hx + 3.6, hy - 11.5, hx + 5.2, hy - 4.5];

    // build world-space shapes once, draw in two passes (rim then body)
    const wLegs = [legB, legA].map((l) => {
      const a = pt(hip[0], hip[1]);
      const b = pt(l[0], l[1]);
      const c = pt(l[2], l[3]);
      return [a[0], a[1], b[0], b[1], c[0], c[1]];
    });
    const wArms = [armB, armA].map((l) => {
      const a = pt(l[0], l[1]);
      const b = pt(l[2], l[3]);
      const c = pt(l[4], l[5]);
      return [a[0], a[1], b[0], b[1], c[0], c[1]];
    });
    const wp = (arr: number[]) => {
      const o: number[] = [];
      for (let i = 0; i < arr.length; i += 2) {
        const q = pt(arr[i], arr[i + 1]);
        o.push(q[0], q[1]);
      }
      return o;
    };
    const wCoat = wp(coat);
    const wBrim = wp(brim);
    const wCrown = wp(crown);
    const wHead = pt(hx, hy + 1.5);
    const wNeckA = pt(hip[0], hip[1]);
    const wNeckB = pt(neckL[0], neckL[1]);
    const hr = 6 * sc * Math.min(sx, sy) * 1.0;
    const gl = st.glitch ?? 0;

    const passes: { col: number; a: number; boost: number }[] = [];
    passes.push({ col: st.rim, a: st.rimA, boost: 3.2 + (st.rimBoost ?? 0) });
    passes.push({ col: st.fill, a: st.fillA, boost: 0 });
    for (let pi = 0; pi < passes.length; pi++) {
      const ps = passes[pi];
      const lw = (base: number) => (base + ps.boost) * sc;
      g.fillStyle(ps.col, ps.a);
      g.lineStyle(lw(4.2), ps.col, ps.a);
      // back limbs first
      for (const L of [wLegs[0], wArms[0]]) {
        g.lineStyle(lw(L === wLegs[0] ? 5 : 3.6), ps.col, ps.a);
        g.beginPath();
        g.moveTo(L[0], L[1]);
        g.lineTo(L[2], L[3]);
        g.lineTo(L[4], L[5]);
        g.strokePath();
      }
      // torso & coat
      g.lineStyle(lw(5.5), ps.col, ps.a);
      g.beginPath();
      g.moveTo(wNeckA[0], wNeckA[1]);
      g.lineTo(wNeckB[0], wNeckB[1]);
      g.strokePath();
      g.lineStyle(lw(0.2), ps.col, ps.a);
      g.beginPath();
      g.moveTo(wCoat[0], wCoat[1]);
      for (let i = 2; i < wCoat.length; i += 2) g.lineTo(wCoat[i], wCoat[i + 1]);
      g.closePath();
      g.fillPath();
      if (ps.boost > 0) g.strokePath();
      // head
      g.fillCircle(wHead[0], wHead[1], hr + ps.boost * 0.42);
      // hat
      g.beginPath();
      g.moveTo(wBrim[0], wBrim[1]);
      for (let i = 2; i < wBrim.length; i += 2) g.lineTo(wBrim[i], wBrim[i + 1]);
      g.closePath();
      g.fillPath();
      if (ps.boost > 0) g.strokePath();
      g.beginPath();
      g.moveTo(wCrown[0], wCrown[1]);
      for (let i = 2; i < wCrown.length; i += 2) g.lineTo(wCrown[i], wCrown[i + 1]);
      g.closePath();
      g.fillPath();
      if (ps.boost > 0) g.strokePath();
      // front limbs
      for (const L of [wLegs[1], wArms[1]]) {
        g.lineStyle(lw(L === wLegs[1] ? 5 : 3.6), ps.col, ps.a);
        g.beginPath();
        g.moveTo(L[0], L[1]);
        g.lineTo(L[2], L[3]);
        g.lineTo(L[4], L[5]);
        g.strokePath();
      }
      // glitch slice: duplicate a horizontal band offset sideways
      if (gl > 0 && pi === 1) {
        g.fillStyle(ps.col, ps.a * 0.5);
        g.fillRect(wHead[0] - 14 + gl, wHead[1] + 8, 28, 3);
        g.fillRect(wHead[0] - 18 - gl, wHead[1] + 24, 34, 2);
      }
    }
  }
}

/** Draws the Shadow: a tall, wispy silhouette with ragged edges and two pale eyes. */
export function drawShadowEntity(g: Gfx, x: number, y: number, face: number, t: number, speed: number, mode: number, alpha = 1) {
  const sway = Math.sin(t * 2.1) * 4 + speed * 0.012;
  const h = 118;
  const lean = (mode === 2 ? 9 : 2) * face;
  const pts: number[] = [];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const v = i / n;
    const yy = y - v * h;
    const wv = (1 - Math.pow(v - 0.35, 2) * 1.8) * 17 + 3;
    const rag = Math.sin(t * 5 + i * 1.7) * 2.2 + Math.sin(t * 9.1 + i * 3.1) * 1.2;
    pts.push(x + sway * v + lean * v * v - wv - rag, yy);
  }
  for (let i = n; i >= 0; i--) {
    const v = i / n;
    const yy = y - v * h;
    const wv = (1 - Math.pow(v - 0.35, 2) * 1.8) * 17 + 3;
    const rag = Math.sin(t * 6 + i * 2.3) * 2.2 + Math.sin(t * 8.3 + i * 1.1) * 1.2;
    pts.push(x + sway * v + lean * v * v + wv + rag, yy);
  }
  // soft aura
  g.fillStyle(0x000000, 0.28 * alpha);
  g.fillCircle(x + sway * 0.6, y - h * 0.5, 44);
  g.fillStyle(0x000000, 0.96 * alpha);
  g.lineStyle(3, 0x000000, 1 * alpha);
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath();
  g.fillPath();
  // long arms
  g.lineStyle(4, 0x000000, 0.95 * alpha);
  for (const s of [-1, 1]) {
    g.beginPath();
    const sxp = x + sway * 0.7 + s * 8;
    const syp = y - h * 0.72;
    const reach = mode === 2 ? 1.0 : 0.4;
    g.moveTo(sxp, syp);
    g.lineTo(sxp + s * 12 + face * 18 * reach, syp + 30);
    g.lineTo(sxp + s * 6 + face * 32 * reach, y - 18 + Math.sin(t * 3 + s) * 4);
    g.strokePath();
  }
  // tendrils at the base
  g.lineStyle(3, 0x000000, 0.7 * alpha);
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    const bx = x + (i - 2) * 9;
    g.moveTo(bx, y - 4);
    g.lineTo(bx + Math.sin(t * 3 + i) * 10 - face * speed * 0.03, y + 2);
    g.strokePath();
  }
  // eyes
  const ex = x + sway * 0.9 + lean * 0.9 + face * 4;
  const ey = y - h * 0.82;
  const blink = Math.sin(t * 0.9) > 0.97 ? 0.1 : 1;
  g.fillStyle(0xffffff, (mode === 2 ? 1 : 0.75) * alpha);
  g.fillEllipse(ex - 4, ey, 4.5, 8 * blink);
  g.fillEllipse(ex + 5, ey, 4.5, 8 * blink);
}

/** A front-facing silhouette (used when a distorted echo turns toward the camera). */
export function drawFrontal(g: Gfx, x: number, y: number, t: number, glitch: number, alpha = 1) {
  const j = glitch > 0 ? (Math.sin(t * 90) > 0.3 ? (Math.sin(t * 43) * 6) * glitch : 0) : 0;
  const pass = (col: number, a: number, boost: number) => {
    g.fillStyle(col, a);
    g.lineStyle(3 + boost, col, a);
    // legs
    g.beginPath();
    g.moveTo(x - 4 + j, y - 26);
    g.lineTo(x - 5 + j, y);
    g.strokePath();
    g.beginPath();
    g.moveTo(x + 4 + j, y - 26);
    g.lineTo(x + 5 + j, y);
    g.strokePath();
    // coat
    g.beginPath();
    g.moveTo(x - 7 + j, y - 46);
    g.lineTo(x + 7 + j, y - 46);
    g.lineTo(x + 10 + j, y - 6);
    g.lineTo(x - 10 + j, y - 6);
    g.closePath();
    g.fillPath();
    if (boost > 0) g.strokePath();
    // arms
    g.lineStyle(3 + boost, col, a);
    g.beginPath();
    g.moveTo(x - 8 + j, y - 44);
    g.lineTo(x - 12 + j, y - 24);
    g.strokePath();
    g.beginPath();
    g.moveTo(x + 8 + j, y - 44);
    g.lineTo(x + 12 + j, y - 24);
    g.strokePath();
    // head + hat
    g.fillCircle(x + j, y - 53, 6 + boost * 0.4);
    g.fillRect(x - 11 + j, y - 58 - boost * 0.4, 22, 3 + boost * 0.4);
    g.fillRect(x - 5 + j, y - 66 - boost * 0.4, 10, 9 + boost * 0.4);
  };
  pass(0xffffff, 0.9 * alpha, 3.2);
  pass(0x000000, 0.95 * alpha, 0);
  // eyes
  g.fillStyle(0xffffff, alpha);
  g.fillRect(x - 4 + j, y - 54, 2.5, 3);
  g.fillRect(x + 2 + j, y - 54, 2.5, 3);
}
