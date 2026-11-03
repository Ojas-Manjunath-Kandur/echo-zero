import { HISTORY_TICKS } from '../constants';
import { Echo, EFRAME } from './Echo';
import {
  P_FACE,
  P_GROUND,
  P_INTER,
  P_LAND,
  P_LANDV,
  P_SKID,
  P_SNEAK,
  P_VX,
  P_VY,
  P_X,
  P_Y,
  FLAG_GROUND,
  FLAG_INTER,
  FLAG_SKID,
  FLAG_SNEAK,
} from './state';

/**
 * Ring buffer of full world snapshots, one per simulation tick (10 seconds of history).
 * Because the entire sim state is a flat Float64Array, a snapshot is a single copy and a
 * rewind restores state bit-exactly.
 */
export class Timeline {
  readonly cap = HISTORY_TICKS + 1;
  private snaps: Float64Array;
  /** lever toggled during the step starting at tick (index tick % cap), or -1 */
  readonly ilog: Int16Array;
  oldest = 0;

  constructor(private readonly size: number) {
    this.snaps = new Float64Array(this.cap * size);
    this.ilog = new Int16Array(this.cap).fill(-1);
  }

  clear(tick: number) {
    this.oldest = tick;
    this.ilog.fill(-1);
  }

  record(S: Float64Array, tick: number) {
    this.snaps.set(S, (tick % this.cap) * this.size);
    if (tick - HISTORY_TICKS > this.oldest) this.oldest = tick - HISTORY_TICKS;
  }

  restore(S: Float64Array, tick: number) {
    const o = (tick % this.cap) * this.size;
    S.set(this.snaps.subarray(o, o + this.size));
  }

  /** Read-only peek at a stored snapshot. */
  peek(tick: number): Float64Array {
    const o = (tick % this.cap) * this.size;
    return this.snaps.subarray(o, o + this.size);
  }

  /** Builds an echo from the recorded ticks [from, to] inclusive. */
  extractEcho(id: number, from: number, to: number): Echo {
    const n = to - from + 1;
    const frames = new Float32Array(n * EFRAME);
    const il = new Int16Array(n).fill(-1);
    for (let i = 0; i < n; i++) {
      const t = from + i;
      const s = this.peek(t);
      const o = i * EFRAME;
      frames[o] = s[P_X];
      frames[o + 1] = s[P_Y];
      frames[o + 2] = s[P_VX];
      frames[o + 3] = s[P_VY];
      frames[o + 4] = s[P_FACE];
      frames[o + 5] =
        (s[P_GROUND] > 0.5 ? FLAG_GROUND : 0) |
        (s[P_INTER] > 0 ? FLAG_INTER : 0) |
        (s[P_SNEAK] > 0.5 ? FLAG_SNEAK : 0) |
        (s[P_SKID] > 0.5 ? FLAG_SKID : 0);
      frames[o + 6] = s[P_LAND];
      frames[o + 7] = s[P_LANDV];
      il[i] = i < n - 1 ? this.ilog[t % this.cap] : -1;
    }
    return new Echo(id, from, frames, il);
  }
}
