# ECHO//ZERO

A 2D cinematic time‑manipulation psychological thriller puzzle‑platformer for the browser.
React + Vite + TypeScript + Phaser 3. Strictly monochrome. No image or audio assets: every picture
(Canvas2D ink, halftone, grain, fog) and every sound (Web Audio synthesis) is generated at runtime.

*Built by Ojas Manjunath Kandur for the CodeDay Hackathon.*

> Five floors of Vespertine Dynamics, one underground car park, and one recording of you walking in.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
```

Production build / preview:

```bash
npm run build        # type-checks, then bundles to dist/
npm run preview      # serves dist/ on http://localhost:4173
```

Needs Node 20+ and a browser with WebGL (Chrome, Safari, Firefox, Edge). Target: 60 FPS on a MacBook Air M1.
Click once on the menu to unlock audio (browsers require a gesture). The game is fully playable muted.

## Controls

| Key | Action |
| --- | --- |
| `A` `D` / `←` `→` | move |
| `Space` / `W` / `↑` | jump (hold for higher; coyote time and jump buffering are on) |
| `Shift` | sneak (quiet) |
| `↓` + jump | drop through a ledge |
| `E` | interact (terminals, buttons, elevator) |
| hold `R` | **Time Rewind** — scrub back up to 10 s; on release you leave an **Echo** of the erased timeline |
| hold `F` | **Future Vision** — slows time, previews the next 10 s (path, gates, Shadow, your death) |
| `Q` | release all Echoes |
| `Esc` / `P` | pause |
| `Enter` | restart immediately after dying (otherwise you may rewind during the first 3 s) |

## The mechanics

* **Rewind** is bit-exact: the whole simulation state is one `Float64Array`, snapshotted every 1/60 s into a 10 s ring buffer.
* **Echoes** replay the path you walked in the timeline you erased. They hold pressure plates, press buttons on schedule,
  make noise (the Shadow hears them), and stack up to three. Reaching a checkpoint disperses them.
* **Foresight** simulates the real world 600 ticks ahead (gates, hazards, Shadow, echoes) assuming you keep holding your direction keys.
  It costs focus (HUD bar) and slows time while held.
* Some platforms exist only on certain timelines (`dashed` = another timeline); some hazards run on irregular schedules.

## The floors

| Level | Idea |
| --- | --- |
| 05 Reception | movement lesson; your first echo holds the glass door while you run the spark corridor; the silhouette creeps closer each time the lights die |
| 04 Open Office | two plates → two echoes; bridges that exist only under an echo; a 1‑second button the door is too far from |
| 03 Archive | the Shadow hunts by sound; decoy it with a running echo, leave a second echo on the plate, cross the ledges |
| 02 Lab | irregular time platforms; an island that vanishes the moment you leave an echo on it; beams and two plates |
| 01 Executive | a button, three plates, a spark, phase stairs, three recordings, the reconstruction |
| B1 Parking | one car, headlights on |

There is also a hidden true ending (spoiler: it needs all three echoes, and a note in the parking level explains how).

## Project layout

```
src/game/sim/      deterministic fixed-timestep simulation (World, Timeline, Echo, Simulation, level compiler)
src/game/levels/   the six levels as plain data (floor5.ts … garage.ts) + the LevelDef model
src/game/render/   art baker (Canvas2D ink), dynamic renderer, silhouette animator, lighting, post-process shader
src/game/audio/    procedural Web Audio manager
src/game/scenes/   Phaser scenes (Boot, Menu, Game)
src/ui/            React: HUD, terminal, settings, pause, credits, ending
tests/             simulation, reachability, puzzle-solution and perf scripts
```

## Tests

```bash
npm run test:all        # typecheck + the three suites below
npm test                # simulation unit tests (movement feel, exact rewind, echoes, prediction)
npm run test:reach      # every pickup/terminal/plate/lever/exit is physically reachable on every level
npm run test:puzzles    # a scripted player solves every floor's puzzle with the real simulation
npx tsx tests/perf.ts   # CPU cost of the sim (≈1–3 µs per tick, foresight ≈0.5 ms)
```

`test:puzzles` includes negative controls (e.g. you cannot beat the timed button alone, platforms A–D don't exist with no echo).

## Settings

Master / music / effects volume and mute, film grain, halftone, glitch & distortion, fog, screen shake, effect quality, tutorial hints.
Settings and progress are stored in `localStorage` (`echozero.settings.v1`, `echozero.save.v1`).

## Verification status

Verified by running it:

* All three test suites pass (`npm run test:all`), including a scripted player that solves every floor's puzzle on the real simulation.
* The production build runs in headless Chromium (software WebGL): menu → new game → terminal → rewind (and the echo it leaves) →
  foresight → pause/settings/resume → death + restart → elevator transition to the next floor → the ending sequence → back to the menu,
  with no console errors. Screenshots of these were inspected.

**Not** verified (no GPU, no speakers, and no human in the loop in the build environment):

* Real-world frame rate on an M1 (software GL ran at ~6–30 FPS, which says nothing about a GPU). The simulation costs ≈1–3 µs per
  tick and foresight ≈0.5 ms per refresh, so the CPU side is cheap; the GPU cost is the full-screen shader plus a half-resolution light map.
  If it is heavy on your machine, Settings → Effect quality: LOW and switch off grain/halftone/fog.
* How the audio *sounds*. It is synthesised with Web Audio; it ran without errors but was never listened to.
* Difficulty and pacing from a human point of view (the puzzles are proven solvable, not proven fun). The Shadow on floor 03 is the
  likeliest place to feel unfair; foresight shows its next ten seconds.
* Safari and Firefox (only Chromium was exercised).
