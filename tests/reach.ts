// Geometry reachability check: with every gate open, every platform present and every hazard off,
// can the (simulated) player physically reach every pickup, terminal, plate, lever and exit?
import { compileLevel } from '../src/game/sim/compile';
import { World } from '../src/game/sim/World';
import { NO_INPUT, InputFrame } from '../src/game/sim/types';
import { P_GROUND, P_VX, P_VY, P_X, P_Y, P_WAKE, P_DROP } from '../src/game/sim/state';
import { LEVELS } from '../src/game/levels';
import type { LevelDef } from '../src/game/levels/types';

const only = process.argv[2];

function openUp(def: LevelDef): LevelDef {
  return {
    ...def,
    gates: (def.gates ?? []).map((g) => ({ ...g, open: { all: [] } })),
    phases: (def.phases ?? []).map((p) => ({ ...p, cycle: undefined, timeline: undefined })),
    hazards: [],
    enemy: undefined,
    events: [],
    exit: undefined,
    levers: def.levers,
  };
}

const key = (x: number, y: number) => `${Math.round(x / 10)},${Math.round(y / 8)}`;

function inp(o: Partial<InputFrame>): InputFrame {
  return { ...NO_INPUT, ...o };
}

function analyse(def: LevelDef) {
  const c = compileLevel(openUp(def));
  const w = new World(c);
  w.emitting = false;
  const S = w.S;
  const start = new Float64Array(S);
  start[P_WAKE] = 0;
  const visited = new Map<string, [number, number]>();
  const queue: Float64Array[] = [];
  const addSpot = (st: Float64Array) => {
    if (st[P_GROUND] < 0.5) return;
    const k = key(st[P_X], st[P_Y]);
    if (visited.has(k)) return;
    visited.set(k, [st[P_X], st[P_Y]]);
    const copy = new Float64Array(st);
    copy[P_VX] = 0;
    copy[P_VY] = 0;
    queue.push(copy);
  };
  // settle spawn
  S.set(start);
  for (let i = 0; i < 30; i++) w.step(NO_INPUT);
  addSpot(S);

  while (queue.length) {
    const base = queue.pop()!;
    for (const dir of [-1, 1]) {
      // walk, sampling states
      S.set(base);
      const samples: Float64Array[] = [new Float64Array(S)];
      let lastX = S[P_X];
      for (let i = 0; i < 520; i++) {
        const wasGround = S[P_GROUND] > 0.5;
        w.step(inp({ left: dir < 0, right: dir > 0 }));
        if (Math.abs(S[P_X] - lastX) >= 20 && S[P_GROUND] > 0.5) {
          samples.push(new Float64Array(S));
          lastX = S[P_X];
        }
        if (wasGround && S[P_GROUND] < 0.5) {
          // walked off an edge: record the last grounded state (approx previous sample) and let it fall
          const edge = new Float64Array(S);
          samples.push(edge);
          for (let k = 0; k < 90 && S[P_GROUND] < 0.5; k++) w.step(inp({ left: dir < 0, right: dir > 0 }));
          if (S[P_GROUND] > 0.5) addSpot(S);
          // keep dropping straight too
          S.set(edge);
          for (let k = 0; k < 90 && S[P_GROUND] < 0.5; k++) w.step(NO_INPUT);
          if (S[P_GROUND] > 0.5) addSpot(S);
          break;
        }
        if (S[P_GROUND] > 0.5 && i % 5 === 0) addSpot(S);
        if (Math.abs(S[P_VX]) < 1 && i > 12) break; // hit a wall
      }
      // jumps from each sample
      for (const smp of samples) {
        for (const jd of [dir, 0, -dir]) {
          for (const hold of [5, 10, 16, 24, 34, 50]) {
            S.set(smp);
            w.step(inp({ left: jd < 0, right: jd > 0, jumpPressed: true, jumpHeld: true }));
            let n = 1;
            for (; n < 160; n++) {
              w.step(inp({ left: jd < 0, right: jd > 0, jumpHeld: n < hold }));
              if (S[P_GROUND] > 0.5 && n > 3) break;
              if (S[P_Y] > def.killY) break;
            }
            if (S[P_GROUND] > 0.5) addSpot(S);
            // also a mid-air steer: release direction after apex
          }
        }
        // drop through one-way ledges
        S.set(smp);
        w.step(inp({ down: true, jumpPressed: true }));
        for (let n = 0; n < 80; n++) {
          w.step(inp({ left: dir < 0, right: dir > 0 }));
          if (S[P_GROUND] > 0.5 && S[P_DROP] <= 0) break;
        }
        if (S[P_GROUND] > 0.5) addSpot(S);
      }
    }
    if (visited.size > 4000) break;
  }

  const spots = [...visited.values()];
  const near = (x: number, y: number, dx: number, dyMin: number, dyMax: number) => spots.some(([sx, sy]) => Math.abs(sx - x) <= dx && sy - y >= dyMin && sy - y <= dyMax);
  const problems: string[] = [];
  const check = (what: string, x: number, y: number, dx = 36, dyMin = -30, dyMax = 30) => {
    if (!near(x, y, dx, dyMin, dyMax)) problems.push(`${what} at (${x},${y}) NOT reachable`);
  };
  for (const p of def.pickups ?? []) check('pickup ' + p.id, p.x, p.y, 30, -75, 30);
  for (const t of def.terminals ?? []) check('terminal ' + t.id, t.x, t.y, 44, -40, 40);
  for (const p of def.plates ?? []) check('plate ' + p.id, p.x, p.y, p.w / 2 + 6, -6, 6);
  for (const l of def.levers ?? []) check('lever ' + l.id, l.x, l.y, 40, -40, 40);
  if (def.exit) check('exit', def.exit.x, def.exit.y, 60, -40, 40);
  const maxX = Math.max(...spots.map((s) => s[0]));
  return { spots: spots.length, maxX, problems };
}

let bad = 0;
for (const def of LEVELS) {
  if (only && def.id !== only) continue;
  const t0 = Date.now();
  const r = analyse(def);
  const ok = r.problems.length === 0;
  console.log(`${ok ? '✓' : '✗'} ${def.id} ${def.name}: ${r.spots} standable spots, furthest x=${r.maxX.toFixed(0)}/${def.width}  (${Date.now() - t0} ms)`);
  for (const p of r.problems) console.log('    ' + p);
  if (!ok) bad++;
}
if (bad) process.exit(1);
