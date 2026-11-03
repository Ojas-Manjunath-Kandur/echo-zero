import type { LevelDef, PropDef } from './types';
import { fix, G, prop, slab } from './helpers';

const props: PropDef[] = [];
for (let x = 420; x < 3000; x += 420) props.push({ kind: 'pillar', x, y: G, w: 70, layer: 'back' });
props.push(
  prop('elevator', 110, G, { w: 150, h: 200, layer: 'back' }),
  prop('sign', 110, 340, { text: 'B1', w: 60, layer: 'back' }),
  prop('sign', 900, 250, { text: 'EXIT →', w: 120, layer: 'back' }),
  prop('sign', 1500, 250, { text: 'P1  RESERVED', w: 150, layer: 'back' }),
  prop('pipe', 0, 118, { w: 3000, layer: 'mid' }),
  prop('pipe', 0, 150, { w: 3000, layer: 'mid' }),
  prop('vent', 1230, 430, { w: 70, h: 44, layer: 'back' }),
  prop('car', 2300, G, { w: 340, layer: 'mid' }),
  prop('cable', 760, 0, { h: 220, layer: 'mid' }),
);

/** UNDERGROUND PARKING — THE END. One car. Headlights on. */
export const garage: LevelDef = {
  id: 'b1',
  floor: 0,
  index: 5,
  name: 'UNDERGROUND PARKING',
  subtitle: 'You have been here before.',
  theme: 'garage',
  width: 3000,
  height: 720,
  ground: G,
  ceiling: 80,
  spawn: { x: 250, y: G },
  ambient: 0.1,
  fog: 0.7,
  distortion: 0.2,
  killY: 900,
  audio: { drone: 1.3, buzz: 0.9, tick: 0, surface: 'concrete' },
  solids: [slab(0, 3000, 'concrete')],
  terminals: [
    {
      id: 'rv',
      x: 1750,
      y: G,
      title: 'STICKY NOTE  //  R.V.  //  PINNED TO A PILLAR',
      lines: [
        'Ray —',
        '',
        'I found out why it never ends.',
        'The experiment needs a witness. The car plays the tape.',
        'You stand there and you watch. Every time. Alone.',
        '',
        'The recording only holds if ONE of you is watching.',
        'Bring everyone who ever walked in. All three.',
        'Stand them at the car.',
        'Let it count a crowd.',
        '',
        'Then read it.',
      ],
    },
    {
      id: 'car',
      x: 2090,
      y: G,
      title: 'THE CAR',
      lines: ['A recording is playing from the dashboard.'],
    },
  ],
  lights: [
    fix(250, 0.8, 'flicker', 380),
    fix(900, 0.35, 'dying', 340),
    fix(1500, 0.3, 'dying', 340),
    fix(1950, 0.25, 'flicker', 300),
    // the car's headlights (not a ceiling fixture)
    { x: 2430, y: 560, radius: 620, intensity: 1, flicker: 'steady' },
    { x: 2300, y: 560, radius: 260, intensity: 0.45, flicker: 'steady' },
  ],
  checkpoints: [{ x: 1400, y: G }],
  events: [
    { id: 'ride', kind: 'elevator', rect: { x: 150, y: 300, w: 30, h: 300 }, params: { x: 110 } },
    { id: 'radio', kind: 'radio', rect: { x: 700, y: 300, w: 40, h: 300 }, params: {} },
    { id: 'steps', kind: 'footsteps', rect: { x: 1100, y: 300, w: 40, h: 300 }, params: { x: 600 } },
    { id: 'whisper', kind: 'whisper', rect: { x: 1600, y: 300, w: 40, h: 300 }, params: { x: 1200 } },
    { id: 'low', kind: 'stinger', rect: { x: 1850, y: 300, w: 40, h: 300 }, params: { type: 'low' } },
  ],
  hints: [{ id: 'h1', rect: { x: 1990, y: 300, w: 200, h: 300 }, text: 'E — LISTEN', tutorial: false }],
  props,
  objectives: [{ until: 99999, text: 'REACH THE CAR' }],
  introText: 'The garage appears empty.',
};
