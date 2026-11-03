import {
  APEX_BAND,
  APEX_MULT,
  AIR_ACCEL,
  AIR_DECEL,
  BUFFER_TICKS,
  CORNER_FORGIVE,
  COYOTE_TICKS,
  DROP_TICKS,
  DT,
  FALL_MULT,
  GRAVITY,
  GROUND_ACCEL,
  GROUND_DECEL,
  JUMP_CUT_MULT,
  JUMP_V,
  MAX_ECHOES,
  MAX_FALL,
  PH,
  PW,
  RUN_SPEED,
  SNEAK_SPEED,
  TURN_ACCEL,
} from '../constants';
import type { Compiled, EventC } from './compile';
import { Echo, EchoPose, newEchoPose } from './Echo';
import {
  FLAG_GROUND,
  FLAG_SNEAK,
  P_AIR,
  P_BUF,
  P_COYOTE,
  P_DEAD,
  P_DROP,
  P_FACE,
  P_GROUND,
  P_INTER,
  P_JUMPT,
  P_LAND,
  P_LANDV,
  P_NOISE,
  P_SKID,
  P_SNEAK,
  P_STEP,
  P_SURF,
  P_VX,
  P_VY,
  P_WAKE,
  P_X,
  P_Y,
  S_TICK,
} from './state';
import type { InputFrame, SimEvent } from './types';

export interface InteractTarget {
  kind: 'terminal' | 'lever' | 'exit';
  id: string;
  x: number;
  y: number;
  label: string;
}


function approach(v: number, target: number, amount: number): number {
  if (v < target) return Math.min(v + amount, target);
  return Math.max(v - amount, target);
}

/**
 * The deterministic simulation of one level. All dynamic state lives in `S` (a flat Float64Array),
 * so a snapshot is a copy of that array and rewinding is exact. Nothing in here uses Math.random
 * or wall-clock time.
 */
export class World {
  readonly c: Compiled;
  S: Float64Array;
  /** Shared (by reference) with the Simulation; the world only reads it. */
  echoes: Echo[] = [];
  events: SimEvent[] = [];
  emitting = true;
  lastInteract = -1;

  // dynamic collider buffers (static part copied once)
  private cr: Float64Array;
  private cf: Uint8Array;
  private cs: Uint8Array;
  private cn = 0;
  private ep: EchoPose[] = [];
  private epN = 0;

  constructor(c: Compiled, S?: Float64Array) {
    this.c = c;
    this.S = S ?? new Float64Array(c.size);
    this.cr = new Float64Array(c.sRect.length);
    this.cf = new Uint8Array(c.sFlag.length);
    this.cs = new Uint8Array(c.sSurf.length);
    this.cr.set(c.sRect);
    this.cf.set(c.sFlag);
    this.cs.set(c.sSurf);
    this.cn = c.nStatic;
    for (let i = 0; i < MAX_ECHOES + 2; i++) this.ep.push(newEchoPose());
    if (!S) this.reset();
  }

  /** A cheap copy for foresight prediction: shares static data, has its own state vector. */
  cloneForPrediction(): World {
    const w = new World(this.c, new Float64Array(this.S));
    w.echoes = this.echoes;
    w.emitting = false;
    return w;
  }

  get tick(): number {
    return this.S[S_TICK];
  }

  get dead(): boolean {
    return this.S[P_DEAD] > 0.5;
  }

  reset() {
    const S = this.S;
    const c = this.c;
    S.fill(0);
    S[P_X] = c.def.spawn.x;
    S[P_Y] = c.def.spawn.y;
    S[P_FACE] = 1;
    S[P_GROUND] = 1;
    S[P_WAKE] = c.def.spawn.wake ? 170 : 0;
    for (const e of c.events) S[e.off] = -1;
    if (c.enemy) {
      S[c.enemy.off] = c.enemy.def.x;
      S[c.enemy.off + 2] = -1;
    }
    this.events.length = 0;
    this.settleGates();
  }

  private settleGates() {
    for (const g of this.c.gates) {
      const t = g.fn(this) ? 1 : 0;
      this.S[g.off] = t;
      this.S[g.off + 1] = t;
    }
    if (this.c.exit) this.S[this.c.exit.off + 1] = 0;
  }

  emit(ev: SimEvent) {
    if (this.emitting) {
      if (this.events.length < 256) this.events.push(ev);
    }
  }

  echoCountAt(tick: number): number {
    let n = 0;
    const es = this.echoes;
    for (let i = 0; i < es.length; i++) if (es[i].start <= tick) n++;
    return n;
  }

  // ---------------------------------------------------------------- phase / hazard helpers

  phasePresent(i: number, t: number): boolean {
    const p = this.c.phases[i];
    const d = p.def;
    if (d.timeline) {
      const n = this.echoCountAt(t);
      return n >= d.timeline.min && (d.timeline.max === undefined || n <= d.timeline.max);
    }
    if (!d.cycle || p.sum <= 0) return true;
    let m = (t + (d.offset ?? 0)) % p.sum;
    for (let k = 0; k < d.cycle.length; k++) {
      if (m < d.cycle[k]) return k % 2 === 0;
      m -= d.cycle[k];
    }
    return true;
  }

  hazardOn(i: number, t: number): boolean {
    const h = this.c.hazards[i];
    return (t + h.offset) % h.period < h.on;
  }

  /** ticks until hazard i next switches on (0 if on) — used for the telegraph flicker */
  hazardWarn(i: number, t: number): number {
    const h = this.c.hazards[i];
    const m = (t + h.offset) % h.period;
    if (m < h.on) return 0;
    return h.period - m;
  }

  // ---------------------------------------------------------------- main step

  step(inp: InputFrame) {
    const S = this.S;
    const t = S[S_TICK];
    this.lastInteract = -1;
    if (S[P_DEAD] > 0.5) return;

    this.sampleEchoes(t);
    this.echoLevers(t);
    this.updatePlates();
    this.updateLevers(t);
    this.updateGates();
    this.buildColliders(t);
    this.stepPlayer(inp, t);
    this.updatePickups();
    this.updateHazards(t);
    this.updateEnemy(t);
    this.updateEvents(t);
    this.updateExit();
    if (S[P_Y] > this.c.def.killY && S[P_DEAD] < 0.5) this.kill('fall');
    S[S_TICK] = t + 1;
  }

  kill(cause: string) {
    if (this.S[P_DEAD] > 0.5) return;
    this.S[P_DEAD] = 1;
    this.S[P_VX] = 0;
    this.emit({ t: 'death', cause });
  }

  // ---------------------------------------------------------------- echoes, plates, levers, gates

  private sampleEchoes(t: number) {
    let n = 0;
    const es = this.echoes;
    for (let i = 0; i < es.length && n < this.ep.length; i++) {
      if (es[i].sample(t, this.ep[n])) n++;
    }
    this.epN = n;
  }

  private echoLevers(t: number) {
    const es = this.echoes;
    for (let i = 0; i < es.length; i++) {
      const e = es[i];
      if (e.start > t) continue;
      const li = e.leverAt(t);
      if (li >= 0 && li < this.c.levers.length) this.toggleLever(li, t, true);
    }
  }

  private toggleLever(li: number, t: number, byEcho: boolean) {
    const S = this.S;
    const l = this.c.levers[li];
    const on = S[l.off] > 0.5 ? 0 : 1;
    S[l.off] = on;
    S[l.off + 1] = on && l.def.resetTicks ? l.def.resetTicks : 0;
    this.emit({ t: 'lever', id: l.def.id, on: !!on, x: l.def.x, y: l.def.y, echo: byEcho });
  }

  private updatePlates() {
    const S = this.S;
    const px = S[P_X];
    const py = S[P_Y];
    const alive = S[P_DEAD] < 0.5;
    for (const p of this.c.plates) {
      const half = p.def.w / 2 + PW / 2 - 2;
      let pressed = false;
      if (alive && Math.abs(px - p.def.x) < half && Math.abs(py - p.def.y) < 7) pressed = true;
      if (!pressed) {
        for (let i = 0; i < this.epN; i++) {
          const e = this.ep[i];
          if (Math.abs(e.x - p.def.x) < half && Math.abs(e.y - p.def.y) < 7) {
            pressed = true;
            break;
          }
        }
      }
      const was = S[p.off] > 0.5;
      S[p.off] = pressed ? 1 : 0;
      if (was !== pressed) this.emit({ t: 'plate', id: p.def.id, down: pressed, x: p.def.x, y: p.def.y });
    }
  }

  private updateLevers(t: number) {
    const S = this.S;
    for (const l of this.c.levers) {
      if (S[l.off + 1] > 0) {
        S[l.off + 1] -= 1;
        if (S[l.off + 1] <= 0) {
          S[l.off] = 0;
          this.emit({ t: 'lever', id: l.def.id, on: false, x: l.def.x, y: l.def.y, echo: false });
        }
      }
    }
  }

  private updateGates() {
    const S = this.S;
    for (const g of this.c.gates) {
      const target = g.fn(this) ? 1 : 0;
      let open = S[g.off];
      if (S[g.off + 1] !== target) {
        S[g.off + 1] = target;
        this.emit({ t: 'gate', id: g.def.id, opening: target === 1, x: g.def.x + g.def.w / 2, y: g.def.y + g.def.h / 2 });
      }
      if (open < target) open = Math.min(target, open + 1 / 36);
      else if (open > target) open = Math.max(target, open - 1 / 22);
      S[g.off] = open;
    }
  }

  private buildColliders(t: number) {
    const c = this.c;
    const S = this.S;
    let n = c.nStatic;
    const cr = this.cr;
    for (const g of c.gates) {
      const open = S[g.off];
      const d = g.def;
      if (g.bridge) {
        if (open > 0.5) {
          cr[n * 4] = d.x;
          cr[n * 4 + 1] = d.y;
          cr[n * 4 + 2] = d.w;
          cr[n * 4 + 3] = Math.min(d.h, 14);
          this.cf[n] = 1;
          this.cs[n] = 2;
          n++;
        }
      } else if (open < 0.98) {
        cr[n * 4] = d.x;
        cr[n * 4 + 1] = d.y;
        cr[n * 4 + 2] = d.w;
        cr[n * 4 + 3] = d.h * (1 - open);
        this.cf[n] = 0;
        this.cs[n] = 2;
        n++;
      }
    }
    for (let i = 0; i < c.phases.length; i++) {
      if (!this.phasePresent(i, t)) continue;
      const d = c.phases[i].def;
      cr[n * 4] = d.x;
      cr[n * 4 + 1] = d.y;
      cr[n * 4 + 2] = d.w;
      cr[n * 4 + 3] = Math.min(d.h, 16);
      this.cf[n] = 1;
      this.cs[n] = 2;
      n++;
    }
    this.cn = n;
  }

  // ---------------------------------------------------------------- collision

  private overlapAt(x: number, y: number, skipOneWay: boolean): number {
    const l = x - PW / 2;
    const r = x + PW / 2;
    const tp = y - PH;
    const cr = this.cr;
    const cf = this.cf;
    for (let i = 0; i < this.cn; i++) {
      if (skipOneWay && cf[i] & 1) continue;
      const o = i * 4;
      if (l < cr[o] + cr[o + 2] && r > cr[o] && tp < cr[o + 1] + cr[o + 3] && y > cr[o + 1]) return i;
    }
    return -1;
  }

  /** index of a collider the feet at (x,y) are resting on, or -1 */
  private standingOn(x: number, y: number, allowOneWay: boolean): number {
    const l = x - PW / 2;
    const r = x + PW / 2;
    const cr = this.cr;
    const cf = this.cf;
    for (let i = 0; i < this.cn; i++) {
      const o = i * 4;
      if (cf[i] & 1) {
        if (!allowOneWay) continue;
        if (l < cr[o] + cr[o + 2] && r > cr[o] && y <= cr[o + 1] + 0.01 && y + 1.5 > cr[o + 1]) return i;
      } else if (l < cr[o] + cr[o + 2] && r > cr[o] && y + 1 > cr[o + 1] && y - PH < cr[o + 1] + cr[o + 3] && y <= cr[o + 1] + 0.01) {
        return i;
      }
    }
    return -1;
  }

  private unstick() {
    const S = this.S;
    for (let iter = 0; iter < 3; iter++) {
      const x = S[P_X];
      const y = S[P_Y];
      const i = this.overlapAt(x, y, true);
      if (i < 0) return;
      const o = i * 4;
      const rx = this.cr[o];
      const ry = this.cr[o + 1];
      const rw = this.cr[o + 2];
      const rh = this.cr[o + 3];
      const pushL = x + PW / 2 - rx;
      const pushR = rx + rw - (x - PW / 2);
      const pushU = y - ry;
      const pushD = ry + rh - (y - PH);
      const m = Math.min(pushL, pushR, pushU * 1.5, pushD * 3);
      if (m === pushL) S[P_X] = rx - PW / 2 - 0.01;
      else if (m === pushR) S[P_X] = rx + rw + PW / 2 + 0.01;
      else if (m === pushU * 1.5) {
        S[P_Y] = ry;
        S[P_VY] = 0;
      } else S[P_Y] = ry + rh + PH;
    }
  }

  private moveX(dx: number) {
    const S = this.S;
    let x = S[P_X];
    const y = S[P_Y];
    let rem = dx;
    while (rem !== 0) {
      const step = Math.abs(rem) > 6 ? Math.sign(rem) * 6 : rem;
      rem -= step;
      x += step;
      const i = this.overlapAt(x, y, true);
      if (i >= 0) {
        const rx = this.cr[i * 4];
        const rw = this.cr[i * 4 + 2];
        x = step > 0 ? rx - PW / 2 : rx + rw + PW / 2;
        S[P_VX] = 0;
        break;
      }
    }
    S[P_X] = x;
  }

  /** returns true when landed on something */
  private moveY(dy: number): boolean {
    const S = this.S;
    let y = S[P_Y];
    let x = S[P_X];
    let rem = dy;
    let landed = false;
    const drop = S[P_DROP] > 0;
    const cr = this.cr;
    const cf = this.cf;
    while (rem !== 0) {
      const step = Math.abs(rem) > 8 ? Math.sign(rem) * 8 : rem;
      rem -= step;
      const prevB = y;
      y += step;
      const l = x - PW / 2;
      const r = x + PW / 2;
      if (step > 0) {
        let top = Infinity;
        let idx = -1;
        for (let i = 0; i < this.cn; i++) {
          const o = i * 4;
          if (!(l < cr[o] + cr[o + 2] && r > cr[o] && y - PH < cr[o + 1] + cr[o + 3] && y > cr[o + 1])) continue;
          if (cf[i] & 1 && drop) continue;
          if (prevB <= cr[o + 1] + 0.01 && cr[o + 1] < top) {
            top = cr[o + 1];
            idx = i;
          }
        }
        if (idx >= 0) {
          y = top;
          S[P_VY] = 0;
          S[P_SURF] = this.cs[idx];
          landed = true;
          break;
        }
      } else {
        const prevT = prevB - PH;
        let bottom = -Infinity;
        for (let i = 0; i < this.cn; i++) {
          if (cf[i] & 1) continue;
          const o = i * 4;
          if (!(l < cr[o] + cr[o + 2] && r > cr[o] && y - PH < cr[o + 1] + cr[o + 3] && y > cr[o + 1])) continue;
          if (prevT >= cr[o + 1] + cr[o + 3] - 0.01 && cr[o + 1] + cr[o + 3] > bottom) bottom = cr[o + 1] + cr[o + 3];
        }
        if (bottom > -Infinity) {
          // corner correction: slide around a ledge the head just clipped
          let fixed = false;
          for (let n = 1; n <= CORNER_FORGIVE && !fixed; n++) {
            for (const s of [1, -1]) {
              if (this.overlapAt(x + s * n, y, true) < 0) {
                x += s * n;
                fixed = true;
                break;
              }
            }
          }
          if (!fixed) {
            y = bottom + PH;
            S[P_VY] = 0;
            break;
          }
        }
      }
    }
    S[P_Y] = y;
    S[P_X] = x;
    return landed;
  }

  // ---------------------------------------------------------------- player

  private stepPlayer(inp: InputFrame, t: number) {
    const S = this.S;

    if (S[P_WAKE] > 0) {
      S[P_WAKE] -= 1;
      S[P_VX] = 0;
      S[P_VY] = 0;
      S[P_GROUND] = 1;
      S[P_SURF] = this.cs[0];
      return;
    }

    this.unstick();

    let vx = S[P_VX];
    let vy = S[P_VY];
    const wasGround = S[P_GROUND] > 0.5;
    const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    const sneak = inp.sneak;
    S[P_SNEAK] = sneak ? 1 : 0;

    // ---- horizontal
    const maxV = sneak ? SNEAK_SPEED : RUN_SPEED;
    const target = dir * maxV;
    let acc: number;
    if (dir === 0) acc = wasGround ? GROUND_DECEL : AIR_DECEL;
    else if (vx !== 0 && Math.sign(vx) !== dir) acc = wasGround ? TURN_ACCEL : AIR_ACCEL * 1.3;
    else acc = wasGround ? GROUND_ACCEL : AIR_ACCEL;
    // do not instantly brake a fast run when the player merely taps sneak mid-air
    vx = approach(vx, target, acc * DT);
    if (dir !== 0) S[P_FACE] = dir;
    S[P_SKID] = wasGround && dir !== 0 && vx !== 0 && Math.sign(vx) !== dir && Math.abs(vx) > 110 ? 1 : 0;

    // ---- jump timers
    S[P_COYOTE] = wasGround ? COYOTE_TICKS : Math.max(0, S[P_COYOTE] - 1);
    S[P_BUF] = inp.jumpPressed ? BUFFER_TICKS : Math.max(0, S[P_BUF] - 1);
    if (S[P_DROP] > 0) S[P_DROP] -= 1;

    // drop through one-way platforms: Down + Jump
    if (inp.down && inp.jumpPressed && wasGround) {
      const idx = this.standingOn(S[P_X], S[P_Y], true);
      if (idx >= 0 && this.cf[idx] & 1 && this.standingOn(S[P_X], S[P_Y], false) < 0) {
        S[P_DROP] = DROP_TICKS;
        S[P_BUF] = 0;
        S[P_COYOTE] = 0;
        S[P_GROUND] = 0;
        S[P_Y] += 2;
      }
    }

    if (S[P_BUF] > 0 && S[P_COYOTE] > 0 && S[P_DROP] <= 0) {
      vy = -JUMP_V;
      S[P_BUF] = 0;
      S[P_COYOTE] = 0;
      S[P_JUMPT] = 0;
      this.emit({ t: 'jump', x: S[P_X], y: S[P_Y] });
    }

    // ---- gravity (variable jump height + apex hang + snappier fall)
    let g = GRAVITY;
    if (vy < 0) {
      if (!inp.jumpHeld) g *= JUMP_CUT_MULT;
      else if (vy > -APEX_BAND) g *= APEX_MULT;
    } else g *= FALL_MULT;
    const preVy = vy;
    vy = Math.min(vy + g * DT, MAX_FALL);
    S[P_VX] = vx;
    S[P_VY] = vy;

    // ---- move
    this.moveX(S[P_VX] * DT);
    const landed = this.moveY(S[P_VY] * DT);
    vx = S[P_VX];
    vy = S[P_VY];

    // ---- ground state
    let ground = false;
    if (S[P_VY] >= 0) {
      const idx = this.standingOn(S[P_X], S[P_Y], S[P_DROP] <= 0);
      if (idx >= 0) {
        ground = true;
        S[P_SURF] = this.cs[idx];
        S[P_VY] = 0;
      }
    }
    if (landed) ground = true;
    S[P_GROUND] = ground ? 1 : 0;

    if (!wasGround && ground && preVy > 170) {
      const impact = Math.max(preVy, S[P_VY]);
      S[P_LAND] = 11 + Math.min(9, Math.floor(impact / 160));
      S[P_LANDV] = impact;
      this.emit({ t: 'land', x: S[P_X], y: S[P_Y], impact, surface: S[P_SURF] });
    } else if (S[P_LAND] > 0) S[P_LAND] -= 1;

    if (ground) S[P_AIR] = 0;
    else S[P_AIR] += 1;
    S[P_JUMPT] = ground ? 0 : S[P_JUMPT] + 1;

    // ---- footsteps + noise
    const speed = Math.abs(S[P_VX]);
    if (ground && speed > 45) {
      S[P_STEP] += speed * DT;
      const stride = sneak ? 30 : 58;
      if (S[P_STEP] >= stride) {
        S[P_STEP] -= stride;
        this.emit({ t: 'step', x: S[P_X], y: S[P_Y], surface: S[P_SURF], sneak });
      }
    } else if (ground) S[P_STEP] = 38;
    let noise = 0;
    if (!ground) noise = 0.6;
    else if (S[P_LAND] > 6) noise = 1.5;
    else if (speed > 200) noise = 1;
    else if (speed > 45) noise = sneak ? 0.22 : 0.5;
    S[P_NOISE] = noise;

    // ---- interaction
    if (S[P_INTER] > 0) S[P_INTER] -= 1;
    if (inp.interactPressed && ground) this.interact(t);
  }

  findInteract(): InteractTarget | null {
    const S = this.S;
    const px = S[P_X];
    const py = S[P_Y];
    let best: InteractTarget | null = null;
    let bd = 1e9;
    const consider = (kind: InteractTarget['kind'], id: string, x: number, y: number, label: string, rx: number, ry: number) => {
      const dx = Math.abs(px - x);
      if (dx > rx || Math.abs(py - y) > ry) return;
      if (dx < bd) {
        bd = dx;
        best = { kind, id, x, y, label };
      }
    };
    for (const tm of this.c.terminals) consider('terminal', tm.def.id, tm.def.x, tm.def.y, 'READ', 46, 44);
    for (const l of this.c.levers) consider('lever', l.def.id, l.def.x, l.def.y, l.def.label ?? 'USE', 44, 44);
    const ex = this.c.exit;
    if (ex) consider('exit', 'exit', ex.def.x, ex.def.y, 'CALL ELEVATOR', 70, 44);
    return best;
  }

  private interact(t: number) {
    const S = this.S;
    const tgt = this.findInteract();
    if (!tgt) return;
    S[P_INTER] = 22;
    const dx = tgt.x - S[P_X];
    if (Math.abs(dx) > 4) S[P_FACE] = Math.sign(dx);
    if (tgt.kind === 'terminal') {
      const tm = this.c.terminals.find((q) => q.def.id === tgt.id)!;
      S[tm.off] = 1;
      S[tm.off + 1] = t;
      this.emit({ t: 'terminal', id: tgt.id });
    } else if (tgt.kind === 'lever') {
      const l = this.c.levers.find((q) => q.def.id === tgt.id)!;
      this.toggleLever(l.index, t, false);
      this.lastInteract = l.index;
    } else {
      const ex = this.c.exit!;
      if (ex.fn(this)) {
        S[ex.off] = 1;
        this.emit({ t: 'exit', toFloor: ex.def.toFloor });
      } else this.emit({ t: 'locked', text: ex.def.lockedText });
    }
  }

  // ---------------------------------------------------------------- pickups, hazards, enemy, events

  private updatePickups() {
    const S = this.S;
    const px = S[P_X];
    const py = S[P_Y];
    for (const p of this.c.pickups) {
      if (S[p.off] > 0.5) continue;
      if (Math.abs(px - p.def.x) < 30 && py - p.def.y > -75 && py - p.def.y < 30) {
        S[p.off] = 1;
        this.emit({ t: 'pickup', id: p.def.id, kind: p.def.kind, label: p.def.label, x: p.def.x, y: p.def.y });
      }
    }
  }

  private updateHazards(t: number) {
    const S = this.S;
    const hs = this.c.hazards;
    const l = S[P_X] - PW / 2 + 3;
    const r = S[P_X] + PW / 2 - 3;
    const tp = S[P_Y] - PH + 4;
    const b = S[P_Y] - 2;
    for (let i = 0; i < hs.length; i++) {
      if (!this.hazardOn(i, t)) continue;
      const h = hs[i];
      if (l < h.x + h.w && r > h.x && tp < h.y + h.h && b > h.y) {
        this.kill(h.kind);
        return;
      }
    }
  }

  private updateEnemy(t: number) {
    const e = this.c.enemy;
    if (!e) return;
    const S = this.S;
    const o = e.off;
    const active = e.wakeIdx < 0 || S[this.c.events[e.wakeIdx].off] >= 0;
    S[o + 7] = active ? 1 : 0;
    if (!active) return;

    let ex = S[o];
    let state = S[o + 3];
    const hearing = e.def.hearing;
    let bestD = 1e9;
    let bestX = 0;
    let bestN = 0;
    const pn = S[P_NOISE];
    if (pn > 0 && S[P_DEAD] < 0.5) {
      const d = Math.abs(S[P_X] - ex);
      if (d < hearing * pn) {
        bestD = d;
        bestX = S[P_X];
        bestN = pn;
      }
    }
    for (let i = 0; i < this.epN; i++) {
      const p = this.ep[i];
      if (p.finished) continue;
      const grounded = (p.flags & FLAG_GROUND) !== 0;
      const sp = Math.abs(p.vx);
      const n = !grounded ? 0.6 : sp > 200 ? 1 : sp > 45 ? ((p.flags & FLAG_SNEAK) !== 0 ? 0.22 : 0.5) : 0;
      if (n <= 0) continue;
      const d = Math.abs(p.x - ex);
      if (d < hearing * n && d < bestD) {
        bestD = d;
        bestX = p.x;
        bestN = n;
      }
    }
    const prevState = state;
    if (bestD < 1e8) {
      state = 2;
      S[o + 4] = bestX;
      S[o + 5] = t;
    } else if (state === 2 && t - S[o + 5] > 140) state = 1;
    else if (state === 1 && t - S[o + 5] > 520) state = 0;
    if (state !== prevState) this.emit({ t: 'enemy', mode: state, x: ex, y: e.def.y });

    let targetV = 0;
    if (state === 0) {
      // idle patrol along the lane
      const dir = S[o + 2] >= 0 ? 1 : -1;
      const goal = dir > 0 ? e.def.maxX : e.def.minX;
      if (Math.abs(goal - ex) < 12) S[o + 2] = -dir;
      targetV = dir * 52;
    } else {
      const dx = S[o + 4] - ex;
      if (Math.abs(dx) > 8) {
        const sp = e.def.speed * (state === 2 ? 0.7 + 0.3 * Math.min(1.5, bestN || 1) : 0.4);
        targetV = Math.sign(dx) * sp;
      }
    }
    let evx = approach(S[o + 1], targetV, 520 * DT);
    ex += evx * DT;
    if (ex < e.def.minX) {
      ex = e.def.minX;
      evx = 0;
    } else if (ex > e.def.maxX) {
      ex = e.def.maxX;
      evx = 0;
    }
    S[o] = ex;
    S[o + 1] = evx;
    S[o + 3] = state;
    if (Math.abs(evx) > 6) S[o + 2] = Math.sign(evx);
    S[o + 6] += Math.abs(evx) * DT;

    // contact kills (the shadow is tall; platforms high enough are safe)
    if (S[P_DEAD] < 0.5) {
      const dx = Math.abs(S[P_X] - ex);
      if (dx < 24 && S[P_Y] > e.def.y - 112 && S[P_Y] - PH < e.def.y) this.kill('shadow');
    }
  }

  private updateEvents(t: number) {
    const S = this.S;
    const px = S[P_X];
    const py = S[P_Y];
    for (const ev of this.c.events) {
      const o = ev.off;
      const d = ev.def;
      if (S[o] < 0) {
        const r = d.rect;
        if (px + PW / 2 > r.x && px - PW / 2 < r.x + r.w && py > r.y && py - PH < r.y + r.h && (!ev.fn || ev.fn(this))) {
          S[o] = t;
          S[o + 1] = d.kind === 'silhouette' ? -1 : 0;
          S[o + 2] = 0;
          this.emit({ t: 'event', id: d.id, kind: d.kind, x: px, y: py, params: d.params ?? {} });
        }
      } else if (d.kind === 'silhouette') this.updateSilhouette(ev, t);
    }
  }

  /** The corridor silhouette creeps closer every time the lights blink out. */
  private updateSilhouette(ev: EventC, t: number) {
    const S = this.S;
    const o = ev.off;
    const first = Number(ev.def.params?.first ?? 150);
    const gap = Number(ev.def.params?.gap ?? 210);
    const dt = t - S[o];
    const prm = ev.def.params ?? {};
    const endX = Number(prm.endX ?? 1e9);
    if (S[o + 1] >= 0 && S[P_X] > endX) {
      S[o + 1] = -1;
      S[o + 2] = 99;
      this.emit({ t: 'blink', stage: 99, x: -1 });
      return;
    }
    if (dt < first || (dt - first) % gap !== 0) return;
    const k = (dt - first) / gap;
    if (k < 5) {
      const x = Number(prm['x' + (k + 1)] ?? 3000);
      S[o + 1] = x;
      S[o + 2] = k + 1;
      this.emit({ t: 'blink', stage: k + 1, x });
    } else if (k === 5 && S[o + 1] >= 0) {
      S[o + 1] = -1;
      S[o + 2] = 6;
      this.emit({ t: 'blink', stage: 6, x: -1 });
    }
  }

  private updateExit() {
    const ex = this.c.exit;
    if (!ex) return;
    const S = this.S;
    const near = Math.abs(S[P_X] - ex.def.x) < 260;
    const want = S[ex.off] > 0.5 || (ex.fn(this) && near) ? 1 : 0;
    const cur = S[ex.off + 1];
    S[ex.off + 1] = cur < want ? Math.min(want, cur + 1 / 40) : Math.max(want, cur - 1 / 40);
  }

  // ---------------------------------------------------------------- queries for the presentation layer

  /** world-space rect of collider i (for debugging / tests) */
  colliderCount(): number {
    return this.cn;
  }

  playerFlags(): number {
    return this.S[P_GROUND] > 0.5 ? FLAG_GROUND : 0;
  }
}
