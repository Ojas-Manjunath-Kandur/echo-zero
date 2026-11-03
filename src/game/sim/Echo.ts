import { FLAG_GROUND, FLAG_INTER, FLAG_SKID, FLAG_SNEAK } from './state';

/** Per-frame recorded data for an echo (stride 8). */
export const EFRAME = 8;

export interface EchoPose {
  x: number;
  y: number;
  vx: number;
  vy: number;
  face: number;
  flags: number;
  landT: number;
  landV: number;
  /** frame index inside the recording */
  f: number;
  /** true once the recorded path has finished and the echo is holding its last pose */
  finished: boolean;
}

export function newEchoPose(): EchoPose {
  return { x: 0, y: 0, vx: 0, vy: 0, face: 1, flags: 0, landT: 0, landV: 0, f: 0, finished: false };
}

/**
 * A temporal echo: a perfect recording of the player's path, replayed from `start`.
 * Echoes follow their path exactly (they do not re-simulate), which keeps puzzles deterministic.
 */
export class Echo {
  constructor(
    public readonly id: number,
    public readonly start: number,
    public readonly frames: Float32Array,
    /** lever index toggled on each recorded step (-1 = none) */
    public readonly ilog: Int16Array,
  ) {}

  get len(): number {
    return this.frames.length / EFRAME;
  }

  /** Fills `out` with the pose at world tick `tick`. Returns false if the echo has not started yet. */
  sample(tick: number, out: EchoPose): boolean {
    let f = tick - this.start;
    if (f < 0) return false;
    const n = this.len;
    out.finished = f >= n - 1;
    if (f > n - 1) f = n - 1;
    const o = f * EFRAME;
    const fr = this.frames;
    out.x = fr[o];
    out.y = fr[o + 1];
    out.vx = fr[o + 2];
    out.vy = fr[o + 3];
    out.face = fr[o + 4];
    out.flags = fr[o + 5];
    out.landT = fr[o + 6];
    out.landV = fr[o + 7];
    out.f = f;
    return true;
  }

  /** Lever index toggled during the step that begins at world tick `tick`, or -1 */
  leverAt(tick: number): number {
    const f = tick - this.start;
    if (f < 0 || f >= this.ilog.length) return -1;
    return this.ilog[f];
  }
}

export function packFlags(ground: boolean, inter: boolean, sneak: boolean, skid: boolean): number {
  return (ground ? FLAG_GROUND : 0) | (inter ? FLAG_INTER : 0) | (sneak ? FLAG_SNEAK : 0) | (skid ? FLAG_SKID : 0);
}
