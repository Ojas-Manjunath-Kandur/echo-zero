// CPU-side cost of the simulation (the renderer cannot be timed headlessly with software GL).
import { Simulation } from '../src/game/sim/Simulation';
import { LEVELS } from '../src/game/levels';
import { NO_INPUT } from '../src/game/sim/types';

for (const def of LEVELS) {
  const sim = new Simulation(def);
  const N = 20000;
  const t0 = performance.now();
  for (let i = 0; i < N; i++) sim.play({ ...NO_INPUT, right: (i >> 7) % 2 === 0, left: (i >> 7) % 2 === 1 });
  const stepUs = ((performance.now() - t0) / N) * 1000;
  const t1 = performance.now();
  for (let i = 0; i < 50; i++) sim.predict({ ...NO_INPUT, right: true });
  const predMs = (performance.now() - t1) / 50;
  console.log(`${def.id}: sim step ${stepUs.toFixed(1)} µs (budget 16667 µs/frame)   foresight prediction (600 ticks) ${predMs.toFixed(2)} ms`);
}
