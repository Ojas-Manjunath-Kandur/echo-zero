import type Phaser from 'phaser';
import { makeCanvas } from './ink';

/** Generates all small helper textures procedurally — the game ships no image assets. */
export function generateTextures(scene: Phaser.Scene) {
  const tex = scene.textures;
  const radial = (key: string, size: number, stops: [number, string][]) => {
    if (tex.exists(key)) return;
    const c = makeCanvas(size, size);
    const x = c.getContext('2d')!;
    const gr = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [o, col] of stops) gr.addColorStop(o, col);
    x.fillStyle = gr;
    x.fillRect(0, 0, size, size);
    tex.addCanvas(key, c);
  };
  radial('light', 256, [
    [0, 'rgba(255,255,255,1)'],
    [0.25, 'rgba(255,255,255,0.72)'],
    [0.6, 'rgba(255,255,255,0.2)'],
    [1, 'rgba(255,255,255,0)'],
  ]);
  radial('dark', 256, [
    [0, 'rgba(0,0,0,0.95)'],
    [0.5, 'rgba(0,0,0,0.6)'],
    [1, 'rgba(0,0,0,0)'],
  ]);
  radial('soft', 64, [
    [0, 'rgba(255,255,255,1)'],
    [1, 'rgba(255,255,255,0)'],
  ]);

  // tileable fog: sum of wrapped blurry blobs
  if (!tex.exists('fog')) {
    const S = 512;
    const c = makeCanvas(S, S);
    const x = c.getContext('2d')!;
    let seed = 99;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 34; i++) {
      const bx = rnd() * S;
      const by = rnd() * S;
      const r = 50 + rnd() * 110;
      for (const ox of [-S, 0, S])
        for (const oy of [-S, 0, S]) {
          const gr = x.createRadialGradient(bx + ox, by + oy, 0, bx + ox, by + oy, r);
          gr.addColorStop(0, 'rgba(255,255,255,0.20)');
          gr.addColorStop(1, 'rgba(255,255,255,0)');
          x.fillStyle = gr;
          x.fillRect(bx + ox - r, by + oy - r, r * 2, r * 2);
        }
    }
    tex.addCanvas('fog', c);
  }

  // light shaft (vertical cone)
  if (!tex.exists('shaft')) {
    const c = makeCanvas(128, 256);
    const x = c.getContext('2d')!;
    const gr = x.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, 'rgba(255,255,255,0.55)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr;
    x.beginPath();
    x.moveTo(52, 0);
    x.lineTo(76, 0);
    x.lineTo(128, 256);
    x.lineTo(0, 256);
    x.closePath();
    x.fill();
    tex.addCanvas('shaft', c);
  }

  // vignette fallback for non-WebGL
  if (!tex.exists('vignette')) {
    const c = makeCanvas(512, 288);
    const x = c.getContext('2d')!;
    const gr = x.createRadialGradient(256, 144, 90, 256, 144, 300);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(0,0,0,0.85)');
    x.fillStyle = gr;
    x.fillRect(0, 0, 512, 288);
    tex.addCanvas('vignette', c);
  }
}
