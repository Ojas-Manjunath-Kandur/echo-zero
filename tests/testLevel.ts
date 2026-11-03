import type { LevelDef } from '../src/game/levels/types';

/** A small synthetic level used by the unit tests. */
export const testLevel: LevelDef = {
  id: 'test',
  floor: 5,
  index: 0,
  name: 'TEST',
  subtitle: '',
  theme: 'reception',
  width: 2400,
  height: 720,
  ground: 600,
  ceiling: 80,
  spawn: { x: 100, y: 600 },
  ambient: 0.5,
  fog: 0,
  distortion: 0,
  killY: 900,
  solids: [
    { x: 0, y: 600, w: 2400, h: 120 },
    { x: 700, y: 520, w: 120, h: 14, oneWay: true },
    { x: 900, y: 440, w: 160, h: 160 },
  ],
  plates: [{ id: 'p1', x: 400, y: 600, w: 60 }],
  levers: [{ id: 'l1', x: 300, y: 600 }],
  gates: [{ id: 'g1', x: 1500, y: 450, w: 20, h: 150, open: 'p1' }],
  pickups: [{ id: 'c1', x: 200, y: 600, kind: 'card', label: 'CARD' }],
  lights: [],
  objectives: [],
};
