import type {
  EnemyDef,
  EventDef,
  ExitDef,
  GateDef,
  HazardDef,
  LeverDef,
  LevelDef,
  PhaseDef,
  PickupDef,
  PlateDef,
  Sig,
  TerminalDef,
} from '../levels/types';
import { P_BLOCK_END } from './state';
import type { World } from './World';
import { SURF } from './types';

export type SigFn = (w: World) => boolean;

export interface PlateC {
  def: PlateDef;
  off: number; // [pressed]
}
export interface LeverC {
  def: LeverDef;
  off: number; // [on, timer]
  index: number;
}
export interface GateC {
  def: GateDef;
  off: number; // [openAmt, lastTarget]
  fn: SigFn;
  bridge: boolean;
}
export interface PickupC {
  def: PickupDef;
  off: number; // [collected]
}
export interface TerminalC {
  def: TerminalDef;
  off: number; // [read, readTick]
}
export interface PhaseC {
  def: PhaseDef;
  sum: number;
}
export interface EventC {
  def: EventDef;
  off: number; // [trigTick(-1), a0, a1, a2]
  fn?: SigFn;
}
export interface ExitC {
  def: ExitDef;
  off: number; // [used, openAmt]
  fn: SigFn;
}
export interface EnemyC {
  def: EnemyDef;
  off: number; // [x, vx, face, state, targetX, heardTick, anim, active]
  wakeIdx: number;
}

export interface Compiled {
  def: LevelDef;
  size: number;
  nStatic: number;
  sRect: Float64Array;
  sFlag: Uint8Array;
  sSurf: Uint8Array;
  plates: PlateC[];
  levers: LeverC[];
  gates: GateC[];
  pickups: PickupC[];
  terminals: TerminalC[];
  phases: PhaseC[];
  hazards: HazardDef[];
  events: EventC[];
  exit?: ExitC;
  enemy?: EnemyC;
  eventIndex: Map<string, EventC>;
  cardPickups: PickupC[];
  maxColliders: number;
  /** compiles a signal expression against this level (used by the HUD for objectives) */
  sig: (s: Sig) => SigFn;
}

export function compileLevel(def: LevelDef): Compiled {
  let size = P_BLOCK_END;
  const alloc = (n: number) => {
    const o = size;
    size += n;
    return o;
  };

  const plates: PlateC[] = (def.plates ?? []).map((d) => ({ def: d, off: alloc(1) }));
  const levers: LeverC[] = (def.levers ?? []).map((d, i) => ({ def: d, off: alloc(2), index: i }));
  const pickups: PickupC[] = (def.pickups ?? []).map((d) => ({ def: d, off: alloc(1) }));
  const terminals: TerminalC[] = (def.terminals ?? []).map((d) => ({ def: d, off: alloc(2) }));
  const events: EventC[] = (def.events ?? []).map((d) => ({ def: d, off: alloc(4) }));
  const eventIndex = new Map(events.map((e) => [e.def.id, e]));

  // signal sources
  const res = new Map<string, SigFn>();
  const reg = (id: string, fn: SigFn) => {
    if (res.has(id)) throw new Error(`Duplicate signal id "${id}" in ${def.id}`);
    res.set(id, fn);
  };
  plates.forEach((p) => reg(p.def.id, (w) => w.S[p.off] > 0.5));
  levers.forEach((l) => reg(l.def.id, (w) => w.S[l.off] > 0.5));
  pickups.forEach((p) => reg(p.def.id, (w) => w.S[p.off] > 0.5));
  terminals.forEach((t) => reg(t.def.id, (w) => w.S[t.off] > 0.5));
  events.forEach((e) => reg(e.def.id, (w) => w.S[e.off] >= 0));

  const cardPickups = pickups.filter((p) => p.def.kind === 'card');
  const compileSig = (sig: Sig): SigFn => {
    if (typeof sig === 'string') {
      const m = /^(cards|frag|tapes|echoes)>=(\d+)$/.exec(sig);
      if (m) {
        const n = parseInt(m[2], 10);
        if (m[1] === 'echoes') return (w) => w.echoCountAt(w.S[0]) >= n;
        const kind = m[1] === 'cards' ? 'card' : m[1] === 'frag' ? 'fragment' : 'tape';
        const list = pickups.filter((p) => p.def.kind === kind);
        return (w) => {
          let c = 0;
          for (let i = 0; i < list.length; i++) if (w.S[list[i].off] > 0.5) c++;
          return c >= n;
        };
      }
      const f = res.get(sig);
      if (!f) throw new Error(`Unknown signal "${sig}" in ${def.id}`);
      return f;
    }
    if ('not' in sig) {
      const f = compileSig(sig.not);
      return (w) => !f(w);
    }
    if ('all' in sig) {
      const fs = sig.all.map(compileSig);
      return (w) => {
        for (let i = 0; i < fs.length; i++) if (!fs[i](w)) return false;
        return true;
      };
    }
    const fs = sig.any.map(compileSig);
    return (w) => {
      for (let i = 0; i < fs.length; i++) if (fs[i](w)) return true;
      return false;
    };
  };

  const gates: GateC[] = (def.gates ?? []).map((d) => ({
    def: d,
    off: alloc(2),
    fn: compileSig(d.open),
    bridge: d.kind === 'bridge',
  }));
  for (const e of events) if (e.def.need !== undefined) e.fn = compileSig(e.def.need);
  let exit: ExitC | undefined;
  if (def.exit) exit = { def: def.exit, off: alloc(2), fn: compileSig(def.exit.need) };
  let enemy: EnemyC | undefined;
  if (def.enemy) {
    const wakeIdx = def.enemy.wakeOn ? events.findIndex((e) => e.def.id === def.enemy!.wakeOn) : -1;
    enemy = { def: def.enemy, off: alloc(8), wakeIdx };
  }

  const phases: PhaseC[] = (def.phases ?? []).map((d) => ({
    def: d,
    sum: d.cycle ? d.cycle.reduce((a, b) => a + b, 0) : 0,
  }));

  // static colliders (+ invisible world bounds)
  const solids = [
    ...def.solids,
    { x: -200, y: -800, w: 200, h: 2400 },
    { x: def.width, y: -800, w: 200, h: 2400 },
  ];
  const nStatic = solids.length;
  const maxColliders = nStatic + gates.length + phases.length + 4;
  const sRect = new Float64Array(maxColliders * 4);
  const sFlag = new Uint8Array(maxColliders);
  const sSurf = new Uint8Array(maxColliders);
  const defSurf = SURF[def.audio?.surface ?? 'tile'];
  solids.forEach((s, i) => {
    sRect[i * 4] = s.x;
    sRect[i * 4 + 1] = s.y;
    sRect[i * 4 + 2] = s.w;
    sRect[i * 4 + 3] = s.h;
    sFlag[i] = (s as { oneWay?: boolean }).oneWay ? 1 : 0;
    const sf = (s as { surface?: keyof typeof SURF }).surface;
    sSurf[i] = sf ? SURF[sf] : defSurf;
  });

  return {
    def,
    size,
    nStatic,
    sRect,
    sFlag,
    sSurf,
    plates,
    levers,
    gates,
    pickups,
    terminals,
    phases,
    hazards: def.hazards ?? [],
    events,
    exit,
    enemy,
    eventIndex,
    cardPickups,
    maxColliders,
    sig: compileSig,
  };
}
