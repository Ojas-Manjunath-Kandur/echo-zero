import { HISTORY_TICKS, MAX_ECHOES, MIN_ECHO_TICKS, PREDICT_STRIDE } from '../constants';
import { compileLevel, Compiled } from './compile';
import type { Echo } from './Echo';
import { P_DEAD, P_GROUND, P_X, P_Y, S_TICK } from './state';
import { Timeline } from './Timeline';
import { InputFrame, NO_INPUT } from './types';
import { World } from './World';
import type { LevelDef } from '../levels/types';

export interface Prediction {
  /** snapshots every PREDICT_STRIDE ticks starting at the current tick */
  frames: Float64Array;
  count: number;
  size: number;
  baseTick: number;
  /** index of the frame in which the player dies, or -1 */
  deathFrame: number;
}

/**
 * Owns the world, the 10-second timeline, the echoes and the rewind controller.
 * The presentation layer calls `play()` once per fixed tick, or `rewindBy()` while the rewind key is held.
 */
export class Simulation {
  readonly c: Compiled;
  readonly world: World;
  readonly tl: Timeline;
  echoes: Echo[] = [];
  private echoSeq = 1;
  rewinding = false;
  rewindFrom = 0;
  private checkpoint: Float64Array | null = null;
  private cpIndex = -1;
  /** set when a new checkpoint is reached; the scene clears it after showing a toast */
  checkpointHit = false;
  /** the last prediction built by `predict` */
  prediction: Prediction;
  private scratch: World;

  constructor(def: LevelDef) {
    this.c = compileLevel(def);
    this.world = new World(this.c);
    this.world.echoes = this.echoes;
    this.tl = new Timeline(this.c.size);
    this.scratch = this.world.cloneForPrediction();
    const n = Math.ceil(HISTORY_TICKS / PREDICT_STRIDE) + 2;
    this.prediction = { frames: new Float64Array(n * this.c.size), count: 0, size: this.c.size, baseTick: 0, deathFrame: -1 };
    this.restartFloor();
  }

  get tick(): number {
    return this.world.tick;
  }

  /** fraction (0..1) of the 10 s buffer currently available to rewind into */
  get memory(): number {
    return Math.max(0, Math.min(1, (this.tick - this.tl.oldest) / HISTORY_TICKS));
  }

  /** seconds that can still be rewound */
  get rewindable(): number {
    return (this.tick - this.tl.oldest) / 60;
  }

  restartFloor() {
    this.echoes.length = 0;
    this.world.reset();
    this.tl.clear(0);
    this.tl.record(this.world.S, 0);
    this.checkpoint = null;
    this.cpIndex = -1;
    this.rewinding = false;
  }

  restoreCheckpoint() {
    if (!this.checkpoint) {
      this.restartFloor();
      return;
    }
    this.echoes.length = 0;
    this.world.S.set(this.checkpoint);
    this.world.events.length = 0;
    this.tl.clear(this.world.tick);
    this.tl.record(this.world.S, this.world.tick);
    this.rewinding = false;
  }

  /** advance exactly one fixed tick */
  play(inp: InputFrame) {
    const w = this.world;
    const t = w.tick;
    this.tl.ilog[t % this.tl.cap] = -1;
    w.step(inp);
    this.tl.ilog[t % this.tl.cap] = w.lastInteract;
    this.tl.record(w.S, w.tick);
    this.checkCheckpoints();
  }

  private checkCheckpoints() {
    const cps = this.c.def.checkpoints;
    if (!cps) return;
    const S = this.world.S;
    if (S[P_DEAD] > 0.5 || S[P_GROUND] < 0.5) return;
    for (let i = cps.length - 1; i > this.cpIndex; i--) {
      if (Math.abs(S[P_X] - cps[i].x) < 40 && Math.abs(S[P_Y] - cps[i].y) < 60) {
        this.cpIndex = i;
        this.echoes.length = 0;
        this.checkpoint = new Float64Array(S);
        this.checkpointHit = true;
        break;
      }
    }
  }

  canRewind(): boolean {
    return this.tick - this.tl.oldest >= 6;
  }

  beginRewind(): boolean {
    if (!this.canRewind()) return false;
    this.rewinding = true;
    this.rewindFrom = this.tick;
    return true;
  }

  /** step time backwards by n ticks (clamped to the buffer). Returns ticks actually rewound. */
  rewindBy(n: number): number {
    if (!this.rewinding) return 0;
    const target = Math.max(this.tl.oldest, this.tick - n);
    const moved = this.tick - target;
    if (moved <= 0) return 0;
    this.tl.restore(this.world.S, target);
    this.world.events.length = 0;
    return moved;
  }

  /** Finish rewinding: leaves an echo of the abandoned timeline. Returns the new echo, if any. */
  endRewind(): Echo | null {
    if (!this.rewinding) return null;
    this.rewinding = false;
    const t2 = this.tick;
    const t1 = this.rewindFrom;
    // echoes born in the timeline we just erased never existed
    for (let i = this.echoes.length - 1; i >= 0; i--) if (this.echoes[i].start > t2) this.echoes.splice(i, 1);
    let made: Echo | null = null;
    if (t1 - t2 >= MIN_ECHO_TICKS) {
      made = this.tl.extractEcho(this.echoSeq++, t2, t1);
      this.echoes.push(made);
      while (this.echoes.length > MAX_ECHOES) this.echoes.shift();
    }
    this.world.events.length = 0;
    return made;
  }

  /** true when all three echoes are standing (finished) within `radius` of x — the key to the true ending */
  echoesAssembled(x: number, radius = 150): boolean {
    if (this.echoes.length < MAX_ECHOES) return false;
    const pose = { x: 0, y: 0, vx: 0, vy: 0, face: 1, flags: 0, landT: 0, landV: 0, f: 0, finished: false };
    for (const e of this.echoes) {
      e.sample(e.start + e.len + 1, pose);
      if (Math.abs(pose.x - x) > radius) return false;
    }
    return true;
  }

  clearEchoes() {
    this.echoes.length = 0;
  }

  /**
   * Foresight: simulate the next 10 s assuming the player keeps holding the current direction keys.
   * Echoes, gates, hazards and the shadow all play out for real, so the preview is exact for them.
   */
  predict(held: InputFrame): Prediction {
    const p = this.prediction;
    const sc = this.scratch;
    sc.echoes = this.echoes;
    sc.S.set(this.world.S);
    const inp: InputFrame = { ...NO_INPUT, left: held.left, right: held.right, down: false, sneak: held.sneak, jumpHeld: held.jumpHeld };
    const size = this.c.size;
    let n = 0;
    let death = -1;
    p.baseTick = sc.tick;
    for (let i = 0; i <= HISTORY_TICKS; i++) {
      if (i % PREDICT_STRIDE === 0) {
        p.frames.set(sc.S, n * size);
        if (death < 0 && sc.S[P_DEAD] > 0.5) death = n;
        n++;
      }
      if (sc.S[P_DEAD] > 0.5) {
        if (death >= 0 && i % PREDICT_STRIDE === 0 && n > death + 6) break;
      } else sc.step(inp);
      sc.events.length = 0;
    }
    p.count = n;
    p.deathFrame = death;
    return p;
  }

  /** state vector at tick (for rendering scrubbed / predicted worlds) */
  get S(): Float64Array {
    return this.world.S;
  }

  /** player position helper */
  get px(): number {
    return this.world.S[P_X];
  }
  get py(): number {
    return this.world.S[P_Y];
  }
  get time(): number {
    return this.world.S[S_TICK];
  }
}
