// A tiny scripted "player" used to prove each floor's puzzle can actually be solved with the real simulation.
import { Simulation } from '../src/game/sim/Simulation';
import { InputFrame, NO_INPUT } from '../src/game/sim/types';
import { P_DEAD, P_GROUND, P_VX, P_VY, P_WAKE, P_X, P_Y } from '../src/game/sim/state';
import type { LevelDef } from '../src/game/levels/types';

export type Keys = Partial<InputFrame>;

export class Bot {
  sim: Simulation;
  exited = false;
  messages: string[] = [];
  constructor(public def: LevelDef) {
    this.sim = new Simulation(def);
    this.sim.S[P_WAKE] = 0;
    this.wait(20);
  }
  get S() {
    return this.sim.S;
  }
  get x() {
    return this.S[P_X];
  }
  get y() {
    return this.S[P_Y];
  }
  get dead() {
    return this.S[P_DEAD] > 0.5;
  }
  get tick() {
    return this.sim.tick;
  }
  get grounded() {
    return this.S[P_GROUND] > 0.5;
  }
  /** advance one tick with the given keys */
  t(k: Keys = {}) {
    this.sim.play({ ...NO_INPUT, ...k });
    for (const e of this.sim.world.events) {
      if (e.t === 'exit') this.exited = true;
      if (e.t === 'locked') this.messages.push(e.text);
    }
    this.sim.world.events.length = 0;
  }
  hold(k: Keys, n: number) {
    for (let i = 0; i < n; i++) this.t(k);
  }
  wait(n: number) {
    this.hold({}, n);
  }
  tp(x: number, y: number) {
    this.S[P_X] = x;
    this.S[P_Y] = y;
    this.S[P_VX] = 0;
    this.S[P_VY] = 0;
    this.wait(3);
  }
  /** walk until within tol of x (stops without overshooting by much) */
  walkTo(x: number, o: { sneak?: boolean; max?: number; tol?: number } = {}) {
    const tol = o.tol ?? 6;
    const max = o.max ?? 1500;
    for (let i = 0; i < max; i++) {
      const dx = x - this.x;
      if (Math.abs(dx) <= tol && Math.abs(this.S[P_VX]) < 30) break;
      const brake = o.sneak ? 3 : 14;
      if (Math.abs(dx) < brake && !o.sneak) this.t({});
      else this.t({ left: dx < 0, right: dx > 0, sneak: o.sneak || Math.abs(dx) < 40 });
      if (this.dead) return false;
    }
    this.wait(6);
    return Math.abs(this.x - x) <= tol + 4;
  }
  press() {
    this.t({ interactPressed: true });
  }
  rewind(n: number) {
    if (!this.sim.beginRewind()) throw new Error('cannot begin rewind');
    this.sim.rewindBy(n);
    return this.sim.endRewind();
  }

  // ---- state snapshots for trial runs (uses World.step directly: no timeline / echo side effects)
  private trial<T>(fn: () => T): T {
    const snap = new Float64Array(this.S);
    const r = fn();
    this.S.set(snap);
    this.sim.world.events.length = 0;
    return r;
  }
  private rawStep(k: Keys) {
    this.sim.world.step({ ...NO_INPUT, ...k });
    this.sim.world.events.length = 0;
  }

  /**
   * Finds (by simulation) a run-up + jump that lands on a standable spot inside the target box, then performs it.
   * Searches directions, run-up length and jump hold length.
   */
  hop(target: { x0: number; x1: number; y: number; ytol?: number }): boolean {
    const ytol = target.ytol ?? 6;
    const attempt = (dir: -1 | 1, run: number, hold: number, apply: boolean): boolean => {
      const step = (k: Keys) => (apply ? this.t(k) : this.rawStep(k));
      const ks = { left: dir < 0, right: dir > 0 };
      for (let i = 0; i < run; i++) step(ks);
      step({ ...ks, jumpPressed: true, jumpHeld: true });
      let n = 1;
      for (; n < 170; n++) {
        step({ ...ks, jumpHeld: n < hold });
        if (this.S[P_DEAD] > 0.5) return false;
        if (this.S[P_GROUND] > 0.5 && n > 3) break;
      }
      if (this.S[P_GROUND] < 0.5) return false;
      const ok = this.x >= target.x0 && this.x <= target.x1 && Math.abs(this.y - target.y) <= ytol;
      if (ok && apply) this.wait(4);
      return ok;
    };
    const dirs: (-1 | 1)[] = this.x < (target.x0 + target.x1) / 2 ? [1, -1] : [-1, 1];
    for (const dir of dirs)
      for (let run = 0; run <= 70; run += 2)
        for (let hold = 6; hold <= 52; hold += 2) {
          const ok = this.trial(() => attempt(dir, run, hold, false));
          if (ok) {
            attempt(dir, run, hold, true);
            return true;
          }
        }
    return false;
  }

  /** like hop(), but also searches over how long to wait first (for platforms on a schedule) */
  hopWait(target: { x0: number; x1: number; y: number; ytol?: number }, maxWait = 400): boolean {
    const ytol = target.ytol ?? 6;
    const attempt = (w: number, dir: -1 | 1, run: number, hold: number, apply: boolean): boolean => {
      const step = (k: Keys) => (apply ? this.t(k) : this.rawStep(k));
      for (let i = 0; i < w; i++) step({});
      const ks = { left: dir < 0, right: dir > 0 };
      for (let i = 0; i < run; i++) step(ks);
      step({ ...ks, jumpPressed: true, jumpHeld: true });
      let n = 1;
      for (; n < 170; n++) {
        step({ ...ks, jumpHeld: n < hold });
        if (this.S[P_DEAD] > 0.5) return false;
        if (this.S[P_GROUND] > 0.5 && n > 3) break;
      }
      if (this.S[P_GROUND] < 0.5) return false;
      const ok = this.x >= target.x0 && this.x <= target.x1 && Math.abs(this.y - target.y) <= ytol;
      if (ok && apply) this.wait(2);
      return ok;
    };
    const dir: -1 | 1 = this.x < (target.x0 + target.x1) / 2 ? 1 : -1;
    for (let w = 0; w <= maxWait; w += 2)
      for (let run = 0; run <= 40; run += 8)
        for (let hold = 8; hold <= 50; hold += 3) {
          if (this.trial(() => attempt(w, dir, run, hold, false))) {
            attempt(w, dir, run, hold, true);
            return true;
          }
        }
    return false;
  }

  /** run `go` repeatedly after waiting k = 0..max ticks; returns the first k for which `go` leaves the player alive and `done` true */
  findWindow(max: number, go: () => boolean): { k: number; width: number } | null {
    let first = -1;
    let count = 0;
    for (let k = 0; k < max; k++) {
      const ok = this.trial(() => {
        for (let i = 0; i < k; i++) this.rawStepNoInput();
        return go();
      });
      if (ok) {
        if (first < 0) first = k;
        count++;
      }
    }
    return first < 0 ? null : { k: first, width: count };
  }
  rawStepNoInput() {
    this.rawStep({});
  }
  /** raw (trial-only) helpers for use inside findWindow */
  rawWalk(x: number, maxTicks = 600): boolean {
    for (let i = 0; i < maxTicks; i++) {
      const dx = x - this.x;
      if (Math.abs(dx) < 10) return true;
      this.rawStep({ left: dx < 0, right: dx > 0 });
      if (this.dead) return false;
    }
    return false;
  }
}
