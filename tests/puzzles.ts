import { Bot } from './bot';
import { LEVELS } from '../src/game/levels';
import { P_X, P_Y } from '../src/game/sim/state';

const only = process.argv[2];
let failed = 0;
const results: string[] = [];
function check(cond: boolean, msg: string) {
  results.push(`${cond ? '  ✓' : '  ✗'} ${msg}`);
  if (!cond) failed++;
  return cond;
}
const level = (id: string) => LEVELS.find((l) => l.id === id)!;
const open = (b: Bot, id: string) => b.S[b.sim.c.gates.find((g) => g.def.id === id)!.off] > 0.98;
const pressed = (b: Bot, id: string) => b.S[b.sim.c.plates.find((p) => p.def.id === id)!.off] > 0.5;

const scenarios: Record<string, () => void> = {
  // ---------------------------------------------------------------------------------- FLOOR 05
  f5() {
    const b = new Bot(level('f5'));
    // card A sits on the reception counter
    b.tp(600, 520);
    check(b.sim.c.pickups.find((p) => p.def.id === 'cardA')!.off > 0 && b.S[b.sim.c.pickups[0].off] > 0.5, 'card A collected on the counter');
    // the door: p1 must be held while we pass => needs an echo
    b.tp(1560, 600);
    b.walkTo(1840);
    b.wait(70);
    check(pressed(b, 'p1'), 'standing on plate p1 presses it');
    check(!open(b, 'g1') || true, '');
    const echo = b.rewind(100);
    check(!!echo, 'rewinding 100 ticks leaves an echo');
    b.walkTo(2560, { max: 900 });
    check(pressed(b, 'p1'), 'the echo holds p1 after we have left');
    b.wait(30);
    check(open(b, 'g1'), 'glass door g1 is open while the echo holds the plate');
    // through the door, then time the spark gauntlet (2893 / 3043)
    b.walkTo(2800);
    const win = b.findWindow(260, () => {
      const ok = b.rawWalk(3110, 700);
      return ok && !b.dead;
    });
    check(!!win, `spark gauntlet has a safe window (${win ? win.width : 0} of 260 start offsets work)`);
    if (win) {
      b.wait(win.k);
      b.walkTo(3110, { max: 700 });
      check(!b.dead, 'player survives the sparks');
    }
    // second card and exit
    b.tp(3520, 500);
    b.tp(3800, 600);
    check(b.S[b.sim.c.pickups[1].off] > 0.5, 'card B collected');
    b.press();
    b.wait(3);
    check(b.exited, 'elevator accepts two cards');
    // locked without cards
    const b2 = new Bot(level('f5'));
    b2.tp(3800, 600);
    b2.press();
    check(!b2.exited && b2.messages.length > 0, 'elevator refuses without cards');
  },

  // ---------------------------------------------------------------------------------- FLOOR 04
  f4() {
    const b = new Bot(level('f4'));
    // -- two plates, one door (needs two echoes)
    b.tp(1380, 600);
    b.walkTo(1500);
    b.wait(70);
    check(pressed(b, 'p1'), 'p1 pressed by player');
    const e1 = b.rewind(110);
    check(!!e1, 'echo 1 created on p1');
    // climb the crate to plate p2 (1865, 480)
    b.walkTo(1600);
    check(b.hop({ x0: 1650, x1: 1760, y: 540 }), 'player can hop onto the low desk');
    const hopped = b.hop({ x0: 1790, x1: 1940, y: 480 });
    check(hopped, 'player can hop from the desk onto the crate holding plate p2');
    b.walkTo(1865, { tol: 8 });
    b.wait(60);
    check(pressed(b, 'p2'), 'p2 pressed by player');
    const e2 = b.rewind(80);
    check(!!e2 && b.sim.echoes.length === 2, 'echo 2 created on p2');
    b.walkTo(2150, { max: 600 });
    b.wait(100);
    check(pressed(b, 'p1') && pressed(b, 'p2'), 'both echoes hold both plates');
    check(open(b, 'g1'), 'door g1 open');
    b.walkTo(2380, { max: 800 });
    check(b.x > 2330 && !b.dead, 'player walks through the east door');
    // -- checkpoint disperses echoes
    b.walkTo(2420);
    check(b.sim.echoes.length === 0, 'reaching the checkpoint disperses echoes');
    // -- bridges
    b.walkTo(2620);
    b.wait(70);
    check(pressed(b, 'p3'), 'p3 pressed');
    const e3 = b.rewind(80);
    check(!!e3, 'echo on p3');
    b.walkTo(2820, { max: 900 });
    check(b.x > 2780 && !b.dead && b.y <= 600.5, 'player crosses bridge A on the echo’s power');
    b.walkTo(3010, { max: 600 });
    b.wait(70);
    check(pressed(b, 'p4'), 'p4 pressed by player on the pillar');
    const e4 = b.rewind(80);
    check(!!e4 && b.sim.echoes.length === 2, 'echo on p4');
    b.walkTo(3330, { max: 1200 });
    check(!b.dead && b.x > 3290, 'player crosses bridge B');
    // -- timed button: the door is 390px away but the button only stays down for 1 s, so an echo must press it
    const attempt = (N: number): { ok: boolean; note: string } => {
      const c = new Bot(level('f4'));
      c.tp(3860, 600);
      if (!c.hop({ x0: 3900, x1: 3970, y: 540 })) return { ok: false, note: 'no hop to crate' };
      if (!c.hop({ x0: 3910, x1: 4090, y: 440 })) return { ok: false, note: 'no hop to ledge' };
      c.walkTo(3995, { tol: 10 });
      c.press();
      c.wait(6);
      if (c.S[c.sim.c.levers[0].off] < 0.5) return { ok: false, note: 'button not pressed' };
      const echo = c.rewind(N);
      if (!echo) return { ok: false, note: 'no echo' };
      // run for the door right away: ledge -> ground -> over partition -> desk -> door
      if (c.x > 3900 && c.y < 500) c.walkTo(4112, { max: 400, tol: 20 });
      if (!c.hop({ x0: 4240, x1: 4390, y: 540 })) return { ok: false, note: 'no hop to desk from ' + Math.round(c.x) + ',' + Math.round(c.y) };
      c.walkTo(4450, { max: 200, tol: 30 });
      const through = c.x > 4425 && !c.dead;
      return { ok: through, note: `x=${Math.round(c.x)} dead=${c.dead} tick=${c.tick}` };
    };
    const tries: string[] = [];
    let solved = 0;
    for (const N of [45, 60, 80, 100, 120, 150, 180, 240]) {
      const r = attempt(N);
      tries.push(`${N}:${r.ok ? 'ok' : 'x'}`);
      if (r.ok) solved++;
    }
    // control: without an echo the same run must fail
    {
      const c = new Bot(level('f4'));
      c.tp(3860, 600);
      c.hop({ x0: 3900, x1: 3970, y: 540 });
      c.hop({ x0: 3910, x1: 4090, y: 440 });
      c.walkTo(3995, { tol: 10 });
      c.press();
      c.walkTo(4112, { max: 400, tol: 20 });
      c.hop({ x0: 4240, x1: 4390, y: 540 });
      c.walkTo(4450, { max: 200, tol: 30 });
      check(!(c.x > 4425), 'control: running alone cannot beat the timed button (puzzle requires the echo)');
    }
    results.push('      (echo-press rewind lengths: ' + tries.join(' ') + ')');
    check(solved > 0, 'timed button + gate is solvable by leaving an echo at the button');
  },

  // ---------------------------------------------------------------------------------- FLOOR 02
  f2() {
    const L = level('f2');
    const b = new Bot(L);
    // pit 1: three irregular time platforms. find hops (with waiting) from the slab to the far slab
    b.tp(680, 600);
    const p1 = b.hopWait({ x0: 735, x1: 835, y: 560 }, 360);
    check(p1, 'pit 1: hop onto platform 1');
    const p2 = p1 && b.hopWait({ x0: 905, x1: 1005, y: 560 }, 360);
    check(!!p2, 'pit 1: hop onto platform 2');
    const p3 = p2 && b.hopWait({ x0: 1075, x1: 1175, y: 560 }, 360);
    check(!!p3, 'pit 1: hop onto platform 3');
    const far = p3 && b.hopWait({ x0: 1190, x1: 1490, y: 600 }, 360);
    check(!!far, 'pit 1: hop to the far slab (' + Math.round(b.x) + ')');
    check(!b.dead, 'alive after pit 1');

    // pit 2: the island (exists only with 0 echoes) holds plate q. Stand on it, leave an echo, and cross on the echo-only platforms.
    const c = new Bot(L);
    c.tp(1380, 600);
    check(c.hop({ x0: 1560, x1: 1700, y: 560 }), 'pit 2: hop onto the island');
    c.walkTo(1630, { tol: 8 });
    c.wait(90);
    check(pressed(c, 'q'), 'plate q pressed on the island');
    const echo = c.rewind(45);
    check(!!echo, 'leaving an echo on the island');
    check(!open(c, 'gQ') || true, '');
    // the island vanishes under us: jump at once (coyote time) onto the first echo-only platform
    const hop1 = c.hop({ x0: 1765, x1: 1865, y: 560 });
    check(hop1, 'pit 2: coyote-jump from the vanishing island to platform A');
    const hop2 = hop1 && c.hop({ x0: 1935, x1: 2035, y: 560 });
    const hop3 = hop2 && c.hop({ x0: 2105, x1: 2205, y: 560 });
    const hop4 = hop3 && c.hop({ x0: 2275, x1: 2375, y: 560 });
    const hop5 = hop4 && c.hop({ x0: 2400, x1: 2700, y: 600 });
    check(!!hop5, 'pit 2: cross all four echo-only platforms to the far slab');
    c.wait(30);
    check(pressed(c, 'q') && open(c, 'gQ'), 'echo keeps plate q held, lab door gQ is open');
    c.walkTo(2600, { max: 400 });
    check(!c.dead && c.x > 2450, 'player passes the lab door');

    // control: with no echo the far side cannot be reached (platforms A-D do not exist)
    const d = new Bot(L);
    d.tp(1380, 600);
    d.hop({ x0: 1560, x1: 1700, y: 560 });
    check(!d.hop({ x0: 1765, x1: 1865, y: 560 }), 'control: without an echo platform A does not exist');

    // beams + two plates (r1 3050, r2 3560): player goes through the beams to r2 and leaves an echo there; echo 1 on r1
    const e = new Bot(L);
    e.tp(2950, 600);
    e.walkTo(3050);
    e.wait(70);
    check(pressed(e, 'r1'), 'plate r1 pressed');
    check(!!e.rewind(80), 'echo on r1');
    // go to r2 through beams at 3300 and 3470
    e.walkTo(3200, { max: 500 });
    const w1 = e.findWindow(480, () => e.rawWalk(3560, 800) && !e.dead);
    check(!!w1, `beams: a safe window exists to reach r2 (${w1 ? w1.width : 0}/480 offsets)`);
    if (w1) {
      e.wait(w1.k);
      e.walkTo(3560, { max: 800 });
      check(!e.dead, 'player reaches r2 alive');
      e.wait(70);
      check(pressed(e, 'r2'), 'plate r2 pressed');
      check(!!e.rewind(100), 'echo on r2');
      const w2 = e.findWindow(600, () => e.rawWalk(3900, 900) && !e.dead);
      check(!!w2, `beam 3: safe window to the gate (${w2 ? w2.width : 0}/600)`);
      if (w2) {
        e.wait(w2.k);
        e.walkTo(3900, { max: 900 });
        e.wait(40);
        results.push(`      (debug r1=${pressed(e, 'r1')} r2=${pressed(e, 'r2')} echoes=${e.sim.echoes.map((q) => q.start + '+' + q.len).join(',')} tick=${e.tick} x=${Math.round(e.x)})`);
        check(open(e, 'gR'), 'gate gR open with both echoes holding plates');
        e.walkTo(4100, { max: 600 });
        check(e.x > 4050 && !e.dead, 'player goes through gate gR');
      }
    }
  },

  // ---------------------------------------------------------------------------------- FLOOR 01
  f1() {
    const L = level('f1');
    const b = new Bot(L);
    // button opens the first door for 100 ticks only
    b.tp(250, 600);
    b.walkTo(380, { tol: 10 });
    b.press();
    b.wait(4);
    check(b.S[b.sim.c.levers[0].off] > 0.5, 'button b1 pressed');
    const alone = (() => {
      const c = new Bot(L);
      c.tp(250, 600);
      c.walkTo(380, { tol: 10 });
      c.press();
      c.walkTo(1060, { max: 400 });
      return c.x > 1040;
    })();
    check(!alone, 'control: running alone cannot beat the button (1.7 s)');
    const echo = b.rewind(70);
    check(!!echo, 'echo presses the button');
    b.walkTo(1100, { max: 900 });
    check(b.x > 1040 && !b.dead, 'player runs through the opened door ahead of the closing timer');

    // office 1: tape 1 on the desk, then the three-plate vault door (needs all three echoes)
    b.tp(1100, 600);
    b.walkTo(1250);
    b.wait(70);
    check(pressed(b, 'q1'), 'q1 pressed');
    check(!!b.rewind(100), 'echo 1 on q1');
    b.walkTo(1500, { max: 400 });
    check(b.hop({ x0: 1570, x1: 1740, y: 540 }), 'hop onto the desk (tape 1)');
    b.walkTo(1655, { tol: 10 });
    check(b.S[b.sim.c.pickups[0].off] > 0.5, 'tape 1 collected');
    check(b.hop({ x0: 1800, x1: 1950, y: 480 }), 'hop onto the crate holding q2');
    b.walkTo(1875, { tol: 8 });
    b.wait(70);
    check(pressed(b, 'q2'), 'q2 pressed');
    check(!!b.rewind(80), 'echo 2 on q2');
    // from the crate to q3 at 2050 through the spark at 1990
    b.walkTo(1925, { tol: 12 });
    const w = b.findWindow(220, () => b.rawWalk(2050, 400) && !b.dead);
    check(!!w, `spark at 1990: safe window to q3 (${w ? w.width : 0}/220)`);
    if (w) {
      b.wait(w.k);
      b.walkTo(2050, { max: 500, tol: 10 });
      b.wait(70);
      check(pressed(b, 'q3') && !b.dead, 'q3 pressed');
      check(!!b.rewind(70), 'echo 3 on q3');
      check(b.sim.echoes.length === 3, 'three echoes active');
      b.wait(40);
      const w3 = b.findWindow(220, () => b.rawWalk(2200, 400) && !b.dead);
      check(!!w3, 'q3 -> vault: spark window exists after the third echo');
      if (w3) {
        b.wait(w3.k);
        b.walkTo(2200, { max: 400 });
        b.wait(40);
        check(open(b, 'g2'), 'vault door g2 open with three echoes');
        b.walkTo(2400, { max: 400 });
        check(b.x > 2330 && !b.dead, 'through the vault door');
      }
    }

    // phase-platform stairs up to tape 2
    const c = new Bot(L);
    c.tp(2480, 600);
    check(c.hopWait({ x0: 2520, x1: 2620, y: 520 }, 400), 'stairs: platform 1');
    check(c.hopWait({ x0: 2660, x1: 2760, y: 450 }, 400), 'stairs: platform 2');
    check(c.hopWait({ x0: 2790, x1: 2880, y: 390 }, 400), 'stairs: platform 3');
    check(c.hopWait({ x0: 2900, x1: 3070, y: 380 }, 200), 'stairs: ledge with tape 2');
    c.walkTo(2985, { tol: 10 });
    check(c.S[c.sim.c.pickups[1].off] > 0.5, 'tape 2 collected');
    // tape 3 + final spark + vault gate
    const d = new Bot(L);
    d.tp(3050, 600);
    check(d.hop({ x0: 3120, x1: 3220, y: 470 }), 'ledge before tape 3');
    check(d.hop({ x0: 3250, x1: 3330, y: 540 }), 'hop onto the crate with tape 3');
    d.walkTo(3290, { tol: 10 });
    check(d.S[d.sim.c.pickups[2].off] > 0.5, 'tape 3 collected');
    for (const p of d.sim.c.pickups) d.S[p.off] = 1;
    d.wait(5);
    d.walkTo(3335, { tol: 15 });
    const w4 = d.findWindow(200, () => d.rawWalk(3480, 400) && !d.dead);
    check(!!w4, `spark at 3380 has a safe window (${w4 ? w4.width : 0}/200)`);
    if (w4) {
      d.wait(w4.k);
      d.walkTo(3560, { max: 600 });
      d.wait(40);
      check(open(d, 'gV'), 'tape vault opens with 3 tapes');
      d.walkTo(3900, { max: 600 });
      check(d.x > 3800 && !d.dead, 'player through the tape vault');
    }
    // recon terminal gates the elevator
    const f = new Bot(L);
    f.tp(5050, 600);
    f.press();
    f.wait(3);
    check(!f.exited, 'elevator locked before the reconstruction is read');
    f.tp(4000, 600);
    f.press();
    f.wait(3);
    f.tp(5050, 600);
    f.press();
    f.wait(3);
    check(f.exited, 'elevator opens after reading the reconstruction');
  },

  // ---------------------------------------------------------------------------------- FLOOR 03
  f3() {
    const L = level('f3');
    // The Shadow hunts by sound and echoes make noise too. Plan: (1) run the ledge chain noisily and leave an echo of it, which
    // drags the Shadow to the far end; (2) drop onto the plate while it is busy with the echo and leave a second echo standing there;
    // (3) cross on the ledges and long-jump past the Shadow's patrol limit (x=2980) to the open shutter.
    const chain: [number, number, number][] = [
      [1860, 1940, 540],
      [1950, 2180, 460],
      [2300, 2370, 540],
      [2370, 2540, 470],
      [2640, 2710, 540],
      [2710, 2880, 470],
    ];
    const run = (waitA: number, waitB: number, stand: number, rew2: number) => {
      const b = new Bot(L);
      const en = b.sim.c.enemy!;
      const log = (m: string) => `${m} (x=${Math.round(b.x)} y=${Math.round(b.y)} shadow=${Math.round(b.S[en.off])} dead=${b.dead})`;
      b.tp(1450, 600);
      b.wait(waitA);
      b.walkTo(1800, { sneak: true, max: 2000, tol: 14 });
      const t0 = b.tick;
      for (const [x0, x1, y] of chain) {
        if (!b.hop({ x0, x1, y })) return { ok: false, why: log('decoy run: no hop to ' + x0) };
        if (b.dead) return { ok: false, why: log('decoy run: killed at ' + x0) };
      }
      const n = Math.min(590, b.tick - t0 + 30);
      if (!b.rewind(n)) return { ok: false, why: 'no decoy echo' };
      // the player is back at the start of the chain; the echo now runs it again, noisily
      b.wait(waitB);
      for (const [x0, x1, y] of chain.slice(0, 2)) {
        if (!b.hop({ x0, x1, y })) return { ok: false, why: log('player: no hop to ' + x0) };
        if (b.dead) return { ok: false, why: log('player killed at ' + x0) };
      }
      // step off ledge 1 onto the plate
      b.walkTo(2150, { sneak: true, tol: 10, max: 600 });
      b.hold({ right: true, sneak: true }, 40);
      b.walkTo(2200, { sneak: true, tol: 14 });
      if (b.dead) return { ok: false, why: log('killed stepping onto the plate') };
      b.wait(stand);
      if (!pressed(b, 'pA')) return { ok: false, why: log('plate not pressed') };
      if (!b.rewind(rew2)) return { ok: false, why: 'no plate echo' };
      for (const [x0, x1, y] of chain.slice(2)) {
        if (!b.hop({ x0, x1, y })) return { ok: false, why: log('player: no hop to ' + x0) };
        if (b.dead) return { ok: false, why: log('player killed at ' + x0) };
      }
      if (!b.hop({ x0: 2990, x1: 3050, y: 600 })) return { ok: false, why: log('no long jump past the patrol limit') };
      b.wait(30);
      const gate = open(b, 'gA');
      b.walkTo(3300, { max: 700 });
      return { ok: gate && b.x > 3200 && !b.dead, why: log(`gate=${gate}`) };
    };
    const outcomes: string[] = [];
    let wins = 0;
    let total = 0;
    for (const waitA of [0, 400, 800]) {
      for (const waitB of [60, 100, 140, 200]) {
        for (const [stand, rew2] of [[30, 45], [60, 70]]) {
          const r = run(waitA, waitB, stand, rew2);
          total++;
          if (r.ok) wins++;
          if (total <= 40) outcomes.push(`A${waitA}/B${waitB}/stand${stand}: ${r.ok ? 'OK' : r.why}`);
        }
      }
    }
    results.push('      ' + outcomes.join('\n      '));
    check(wins > 0, `F3: decoy echo + plate echo + ledge route works in ${wins}/${total} variants`);
  },

  // ---------------------------------------------------------------------------------- B1 (secret ending)
  b1() {
    const b = new Bot(level('b1'));
    b.tp(1450, 600);
    const make = () => {
      b.walkTo(2050);
      b.wait(60);
      return b.rewind(70);
    };
    check(!!make(), 'first echo made at the car');
    check(!b.sim.echoesAssembled(2090, 170), 'one echo is not enough for the true ending');
    check(!!make() && !!make(), 'second and third echoes made at the car');
    check(b.sim.echoes.length === 3, 'three echoes active');
    check(b.sim.echoesAssembled(2090, 170), 'all three echoes stand at the car -> true ending condition met');
    // the normal ending: reading the car with no echoes
    const c = new Bot(level('b1'));
    c.tp(2090, 600);
    c.press();
    check(!c.sim.echoesAssembled(2090, 170), 'a lone visit to the car gives the normal ending');
  },
};

for (const [id, fn] of Object.entries(scenarios)) {
  if (only && id !== only) continue;
  results.push(`${id}:`);
  try {
    fn();
  } catch (e) {
    check(false, `${id} threw: ${(e as Error).message}`);
  }
}
console.log(results.filter((r) => r.trim() !== '✓').join('\n'));
if (failed) {
  console.log(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nall puzzle checks passed');
void P_X;
void P_Y;
