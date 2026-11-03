import type { LightDef, PropDef, SolidDef, Surface } from './types';

export const G = 600; // floor line
export const slab = (x: number, w: number, surface?: Surface): SolidDef => ({ x, y: G, w, h: 120, style: 'slab', surface });
export const desk = (x: number, w = 170, top = 540): SolidDef => ({ x, y: top, w, h: G - top, style: 'desk', surface: 'carpet' });
export const partition = (x: number, h = 150, w = 20): SolidDef => ({ x, y: G - h, w, h, style: 'partition' });
export const crate = (x: number, w: number, h: number, base = G): SolidDef => ({ x, y: base - h, w, h, style: 'crate' });
export const ledge = (x: number, y: number, w: number): SolidDef => ({ x, y, w, h: 14, oneWay: true, style: 'platform', surface: 'metal' });
export const block = (x: number, y: number, w: number, h: number, style: SolidDef['style'] = 'wall'): SolidDef => ({ x, y, w, h, style });

/** ceiling fixture */
export const fix = (x: number, intensity = 1, flicker: LightDef['flicker'] = 'steady', radius = 380, y = 92, seed = 0): LightDef => ({
  x,
  y,
  radius,
  intensity,
  flicker,
  fixture: true,
  seed: seed || Math.round(x),
});

export const win = (x: number, w = 320, h = 250, y = 470): PropDef => ({ kind: 'window', x, y, w, h, layer: 'back' });
export const prop = (kind: PropDef['kind'], x: number, y = G, extra: Partial<PropDef> = {}): PropDef => ({ kind, x, y, ...extra });

/** a wall with a doorway: returns the solid above the gate. Gate itself is defined separately. */
export const wallAbove = (x: number, gateTop: number, w = 22): SolidDef => ({ x: x - 10, y: 60, w: w + 20, h: gateTop - 60, style: 'wall' });
