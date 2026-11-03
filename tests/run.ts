import { Simulation } from '../src/game/sim/Simulation';
import { NO_INPUT, InputFrame } from '../src/game/sim/types';
import { P_X, P_Y, P_VY } from '../src/game/sim/state';
import { testLevel } from './testLevel';

let fails = 0;
function ok(cond: boolean, msg: string) {
  if (cond) console.log('  ✓', msg);
  else {
    console.log('  ✗ FAIL:', msg);
    fails++;
  }
}
const inp = (o: Partial<InputFrame> = {}): InputFrame => ({ ...NO_INPUT, ...o });

function run(sim: Simulation, n: number, i: Partial<InputFrame> = {}) {
  for (let k = 0; k < n; k++) sim.play(inp(i));
}

console.log('Movement');
{
  const sim = new Simulation(testLevel);
  run(sim, 5);
  ok(Math.abs(sim.py - 600) < 0.01, 'player rests on the floor at y=600 (got ' + sim.py + ')');
  run(sim, 60, { right: true });
  ok(sim.px > 300 && sim.px < 420, 'running right for 1s travels ~' + (sim.px - 100).toFixed(0) + 'px');
  // jump height
  const s2 = new Simulation(testLevel);
  run(s2, 5);
  let minY = 1e9;
  s2.play(inp({ jumpPressed: true, jumpHeld: true }));
  for (let k = 0; k < 80; k++) {
    s2.play(inp({ jumpHeld: true }));
    minY = Math.min(minY, s2.py);
  }
  console.log('    full jump height =', (600 - minY).toFixed(1));
  ok(600 - minY > 120 && 600 - minY < 170, 'full jump height sensible');
  const s3 = new Simulation(testLevel);
  run(s3, 5);
  minY = 1e9;
  s3.play(inp({ jumpPressed: true, jumpHeld: true }));
  for (let k = 0; k < 80; k++) {
    s3.play(inp({ jumpHeld: false }));
    minY = Math.min(minY, s3.py);
  }
  console.log('    tap jump height  =', (600 - minY).toFixed(1));
  ok(600 - minY < 80 && 600 - minY > 20, 'variable jump height works');
  // horizontal jump distance
  const s4 = new Simulation(testLevel);
  run(s4, 90, { right: true });
  const x0 = s4.px;
  s4.play(inp({ right: true, jumpPressed: true, jumpHeld: true }));
  let air = 1;
  while (s4.world.S[P_VY] !== 0 || air < 3) {
    s4.play(inp({ right: true, jumpHeld: true }));
    air++;
    if (air > 200) break;
  }
  console.log('    full-speed jump distance =', (s4.px - x0).toFixed(0), 'px,', air, 'ticks');
  // coyote time
  const s5 = new Simulation({ ...testLevel, solids: [{ x: 0, y: 600, w: 400, h: 120 }, { x: 600, y: 600, w: 1800, h: 120 }] });
  run(s5, 5);
  s5.world.S[P_X] = 395;
  run(s5, 6, { right: true });
  s5.play(inp({ right: true, jumpPressed: true, jumpHeld: true }));
  ok(s5.world.S[P_VY] < -300, 'coyote jump works after leaving ledge (vy=' + s5.world.S[P_VY].toFixed(0) + ')');
  // jump buffering
  const s6 = new Simulation(testLevel);
  run(s6, 5);
  s6.world.S[P_Y] = 560;
  s6.world.S[P_VY] = 300;
  for (let k = 0; k < 8; k++) {
    s6.play(inp({ jumpPressed: k === 0, jumpHeld: true }));
  }
  ok(s6.world.S[P_VY] < 0, 'jump buffering fires on landing');
  // one-way platform
  const s7 = new Simulation(testLevel);
  run(s7, 5);
  s7.world.S[P_X] = 760;
  s7.world.S[P_Y] = 600;
  s7.play(inp({ jumpPressed: true, jumpHeld: true }));
  run(s7, 40, { jumpHeld: true });
  ok(Math.abs(s7.py - 520) < 0.5, 'jump up through one-way platform and land on it (y=' + s7.py.toFixed(1) + ')');
  s7.play(inp({ down: true, jumpPressed: true }));
  run(s7, 40);
  ok(Math.abs(s7.py - 600) < 0.5, 'drop through one-way platform (y=' + s7.py.toFixed(1) + ')');
  // wall
  const s8 = new Simulation(testLevel);
  run(s8, 5);
  s8.world.S[P_X] = 850;
  run(s8, 60, { right: true });
  ok(s8.px <= 900 - 11 + 0.01, 'solid wall blocks the player (x=' + s8.px.toFixed(1) + ')');
}

console.log('Plates, gates and echoes');
{
  const sim = new Simulation(testLevel);
  run(sim, 40);
  // walk to plate at 400 and stand for 3 s
  while (sim.px < 395) sim.play(inp({ right: true }));
  run(sim, 40);
  ok(sim.world.S[sim.c.plates[0].off] === 1, 'standing on plate presses it');
  run(sim, 100);
  ok(sim.world.S[sim.c.gates[0].off] === 1, 'gate opens while plate held');
  const tNow = sim.tick;
  ok(sim.beginRewind(), 'rewind begins');
  const moved = sim.rewindBy(200);
  ok(moved === 200, 'rewound 200 ticks (' + moved + ')');
  const e = sim.endRewind();
  ok(!!e && sim.echoes.length === 1, 'echo created');
  ok(sim.tick === tNow - 200, 'tick restored');
  // now play forward with no input: echo walks to plate again and holds it
  run(sim, 200);
  ok(sim.world.S[sim.c.plates[0].off] === 1, 'echo holds the plate');
  ok(sim.world.S[sim.c.gates[0].off] === 1, 'gate open thanks to echo');
  ok(Math.abs(sim.px - 100) < 12, 'live player stayed at spawn (x=' + sim.px.toFixed(1) + ')');
}

console.log('Rewind determinism');
{
  const sim = new Simulation(testLevel);
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  let held: Partial<InputFrame> = {};
  const hist: Float64Array[] = [];
  for (let k = 0; k < 500; k++) {
    if (k % 20 === 0) held = { left: rnd() < 0.3, right: rnd() < 0.6, jumpHeld: rnd() < 0.5 };
    sim.play(inp({ ...held, jumpPressed: rnd() < 0.05, interactPressed: rnd() < 0.03 }));
    hist.push(new Float64Array(sim.world.S));
  }
  sim.beginRewind();
  sim.rewindBy(300);
  const tgt = sim.tick;
  const ref = hist[tgt - 1];
  let same = true;
  for (let i = 0; i < ref.length; i++) if (ref[i] !== sim.world.S[i]) same = false;
  ok(same, 'state after rewinding 300 ticks equals recorded state bit-for-bit (tick ' + tgt + ')');
}

console.log('Foresight prediction');
{
  const sim = new Simulation(testLevel);
  run(sim, 30);
  const t0 = performance.now();
  let p = sim.prediction;
  for (let i = 0; i < 20; i++) p = sim.predict(inp({ right: true }));
  const per = (performance.now() - t0) / 20;
  console.log('    prediction cost: ' + per.toFixed(2) + ' ms per 10 s lookahead');
  ok(per < 6, 'prediction is cheap enough to refresh several times per second');
  ok(p.count > 150, 'prediction has frames (' + p.count + ')');
  const lastX = p.frames[(p.count - 1) * p.size + P_X];
  ok(lastX > 800, 'predicted player ran right (x=' + lastX.toFixed(0) + ')');
  ok(sim.tick === 30, 'prediction does not touch the real world (tick ' + sim.tick + ')');
}

if (fails) {
  console.log(`\n${fails} FAILED`);
  process.exit(1);
}
console.log('\nall tests passed');
void P_Y;
