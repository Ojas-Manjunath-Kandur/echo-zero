import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../constants';

/**
 * A half-resolution light map. Lights are stamped additively onto a dark ambient fill, then the map is
 * multiplied over the scene — this gives hard pools of light and deep shadow for very little GPU cost.
 */
export class Lighting {
  readonly rt: Phaser.GameObjects.RenderTexture;
  private camX = 0;
  private camY = 0;
  private readonly scale = 0.5;

  constructor(scene: Phaser.Scene, depth: number) {
    this.rt = scene.add
      .renderTexture(0, 0, VIEW_W * this.scale, VIEW_H * this.scale)
      .setOrigin(0, 0)
      .setScale(1 / this.scale)
      .setScrollFactor(0)
      .setDepth(depth)
      .setBlendMode(Phaser.BlendModes.MULTIPLY);
  }

  begin(ambient: number, camX: number, camY: number) {
    this.camX = camX;
    this.camY = camY;
    const v = Math.max(0, Math.min(255, Math.round(ambient * 255)));
    this.rt.beginDraw();
    this.rt.fill((v << 16) | (v << 8) | v, 1);
  }

  end() {
    this.rt.endDraw();
  }

  add(wx: number, wy: number, radius: number, intensity: number) {
    if (intensity <= 0.01) return;
    const sx = (wx - this.camX) * this.scale;
    const sy = (wy - this.camY) * this.scale;
    const r = radius * this.scale;
    if (sx < -r || sx > VIEW_W * this.scale + r || sy < -r || sy > VIEW_H * this.scale + r) return;
    this.rt.stamp('light', undefined, sx, sy, {
      scale: (radius * 2) / 256 * this.scale,
      alpha: Math.min(1, intensity),
      blendMode: Phaser.BlendModes.ADD,
    });
  }

  /** punches a hole of darkness into the light map (used around the Shadow) */
  addDark(wx: number, wy: number, radius: number, strength: number) {
    const sx = (wx - this.camX) * this.scale;
    const sy = (wy - this.camY) * this.scale;
    this.rt.stamp('dark', undefined, sx, sy, {
      scale: (radius * 2) / 256 * this.scale,
      alpha: strength,
      blendMode: Phaser.BlendModes.NORMAL,
    });
  }
}

const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** per-light flicker intensity multiplier at time t (seconds) */
export function flicker(kind: string | undefined, t: number, seed: number): number {
  switch (kind) {
    case 'flicker': {
      const n = Math.floor(t * 13 + seed);
      const h = hash(n);
      const base = 0.93 + 0.07 * Math.sin(t * 47 + seed);
      if (h < 0.09) return 0.12 + 0.3 * hash(n + 1);
      if (h < 0.13) return 0.55;
      return base;
    }
    case 'dying': {
      const n = Math.floor(t * 9 + seed);
      const h = hash(n);
      if (h < 0.5) return 0.05;
      if (h < 0.78) return 0.45 + 0.3 * hash(n + 3);
      return 0.95;
    }
    case 'strobe': {
      const n = Math.floor(t * 5.5 + seed * 0.1);
      return hash(n) < 0.35 ? 0.06 : 0.9 + 0.1 * Math.sin(t * 60);
    }
    default:
      return 1;
  }
}
