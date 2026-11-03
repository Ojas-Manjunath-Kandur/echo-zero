import type { LevelDef, PropDef, SolidDef, Theme } from '../levels/types';
import { Ctx, INK, Rng, glow, g, halftone, hatch, inkRect, inkSplat, line, makeCanvas, poly, wobbleRect } from './ink';

interface Pal {
  wall: number;
  wall2: number;
  floor: number;
  floorTop: number;
  ceil: number;
  prop: number;
  propLight: number;
}

const PALS: Record<Theme, Pal> = {
  reception: { wall: 128, wall2: 112, floor: 40, floorTop: 214, ceil: 30, prop: 44, propLight: 190 },
  office: { wall: 118, wall2: 102, floor: 36, floorTop: 200, ceil: 28, prop: 40, propLight: 184 },
  archive: { wall: 96, wall2: 82, floor: 30, floorTop: 170, ceil: 22, prop: 34, propLight: 160 },
  lab: { wall: 150, wall2: 132, floor: 44, floorTop: 226, ceil: 36, prop: 52, propLight: 210 },
  exec: { wall: 160, wall2: 142, floor: 22, floorTop: 236, ceil: 40, prop: 30, propLight: 220 },
  garage: { wall: 100, wall2: 86, floor: 52, floorTop: 176, ceil: 24, prop: 36, propLight: 170 },
};

export interface BakedLayers {
  far: HTMLCanvasElement;
  mid: HTMLCanvasElement;
  front: HTMLCanvasElement | null;
  farScroll: number;
}

export function bakeLevel(def: LevelDef): BakedLayers {
  const rng = new Rng(def.index * 7919 + 13);
  const pal = PALS[def.theme];
  const W = def.width;
  const H = def.height;
  const farScroll = 0.35;
  const far = makeCanvas(W * farScroll + 1300, H);
  paintFar(far.getContext('2d')!, def, pal, new Rng(def.index * 31 + 5));

  const mid = makeCanvas(W, H);
  const mc = mid.getContext('2d')!;
  paintWall(mc, def, pal, rng);
  const props = def.props ?? [];
  for (const p of props) if (p.layer === 'back') paintProp(mc, p, def, pal, rng);
  for (const s of def.solids) paintSolid(mc, s, def, pal, rng);
  for (const p of props) if (!p.layer || p.layer === 'mid') paintProp(mc, p, def, pal, rng);
  paintFixtures(mc, def, pal);
  paintSplats(mc, def, rng);

  let front: HTMLCanvasElement | null = null;
  const fp = props.filter((p) => p.layer === 'front');
  if (fp.length) {
    front = makeCanvas(W, H);
    const fc = front.getContext('2d')!;
    for (const p of fp) paintProp(fc, p, def, pal, rng);
  }
  return { far, mid, front, farScroll };
}

// ------------------------------------------------------------------------------------ far layer

function paintFar(ctx: Ctx, def: LevelDef, pal: Pal, rng: Rng) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, g(10));
  sky.addColorStop(0.7, g(56));
  sky.addColorStop(1, g(26));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  if (def.theme === 'reception' || def.theme === 'office' || def.theme === 'exec') {
    // moon + halo
    const mx = w * 0.62;
    glow(ctx, mx, 150, 220, 0.35);
    ctx.fillStyle = g(240);
    ctx.beginPath();
    ctx.arc(mx, 150, 46, 0, 6.28);
    ctx.fill();
    halftone(ctx, mx - 46, 104, 92, 92, 'right', '#000', 0.55, 6, 2.4, 1);
    // skyline layers
    for (let layer = 0; layer < 3; layer++) {
      const base = h - 40 - layer * 20;
      const tone = 22 + layer * 12;
      let x = -20;
      while (x < w) {
        const bw = rng.range(50, 130);
        const bh = rng.range(120, 360) - layer * 40;
        ctx.fillStyle = g(tone);
        ctx.fillRect(x, base - bh, bw, bh + 200);
        // windows
        if (layer < 2) {
          for (let wy = base - bh + 14; wy < base - 10; wy += 16) {
            for (let wx = x + 8; wx < x + bw - 10; wx += 14) {
              if (rng.next() < 0.14) {
                ctx.fillStyle = g(rng.range(170, 250));
                ctx.fillRect(wx, wy, 5, 8);
              }
            }
          }
        }
        x += bw + rng.range(0, 14);
      }
    }
  } else if (def.theme === 'archive') {
    for (let x = 0; x < w; x += 190) {
      ctx.fillStyle = g(14);
      ctx.fillRect(x, 0, 38, h);
      ctx.fillStyle = g(30);
      ctx.fillRect(x + 38, 0, 3, h);
      halftone(ctx, x + 41, 0, 150, h, 'left', '#000', 0.5, 8, 3);
    }
  } else if (def.theme === 'lab') {
    for (let x = 0; x < w; x += 260) {
      const th = rng.range(200, 420);
      ctx.fillStyle = g(30);
      ctx.fillRect(x + 20, h - th, 90, th);
      ctx.fillStyle = g(70);
      ctx.fillRect(x + 20, h - th, 90, 6);
      ctx.strokeStyle = g(90);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + 65, h - th);
      ctx.lineTo(x + 65, 0);
      ctx.stroke();
      glow(ctx, x + 65, h - th * 0.6, 80, 0.12);
    }
  } else {
    for (let x = 0; x < w; x += 300) {
      ctx.fillStyle = g(18);
      ctx.fillRect(x, 0, 70, h);
      ctx.fillStyle = g(40);
      ctx.fillRect(x + 70, 0, 3, h);
    }
    ctx.fillStyle = g(30);
    ctx.fillRect(0, 0, w, 90);
  }
  // horizon fog
  const fog = ctx.createLinearGradient(0, h * 0.5, 0, h);
  fog.addColorStop(0, 'rgba(120,120,120,0)');
  fog.addColorStop(1, 'rgba(120,120,120,0.35)');
  ctx.fillStyle = fog;
  ctx.fillRect(0, h * 0.5, w, h * 0.5);
}

// ------------------------------------------------------------------------------------ wall

function paintWall(ctx: Ctx, def: LevelDef, pal: Pal, rng: Rng) {
  const W = def.width;
  const H = def.height;
  const top = def.ceiling;
  const bot = def.ground;
  const grad = ctx.createLinearGradient(0, top, 0, bot);
  grad.addColorStop(0, g(pal.wall * 0.62));
  grad.addColorStop(0.45, g(pal.wall));
  grad.addColorStop(1, g(pal.wall * 0.72));
  ctx.fillStyle = grad;
  ctx.fillRect(0, top, W, H - top);

  // theme-specific wall treatment
  const t = def.theme;
  if (t === 'lab') {
    // white tile grid
    ctx.strokeStyle = g(pal.wall * 0.55);
    ctx.lineWidth = 1.5;
    for (let x = 0; x < W; x += 80) line(ctx, x, top, x, bot, g(pal.wall * 0.55), 1.5);
    for (let y = top; y < bot; y += 80) line(ctx, 0, y, W, y, g(pal.wall * 0.55), 1.5);
  } else if (t === 'garage') {
    hatch(ctx, 0, top, W, bot - top, 14, -0.6, g(pal.wall * 0.7), 1, 0.35);
    for (let x = 0; x < W; x += 420) line(ctx, x, top, x, bot, g(pal.wall * 0.5), 3);
  } else if (t === 'archive') {
    for (let x = 0; x < W; x += 240) {
      line(ctx, x, top, x, bot, g(pal.wall * 0.55), 3);
      line(ctx, x + 3, top, x + 3, bot, g(pal.wall * 1.3), 1.5);
    }
  } else {
    // panelled walls
    for (let x = 0; x < W; x += 200) {
      line(ctx, x, top, x, bot, g(pal.wall * 0.5), 3);
      line(ctx, x + 3, top, x + 3, bot, g(pal.wall * 1.25), 1.5);
    }
    // wainscot
    ctx.fillStyle = g(pal.wall * 0.7);
    ctx.fillRect(0, bot - 96, W, 96);
    line(ctx, 0, bot - 96, W, bot - 96, g(pal.wall * 1.35), 3);
    line(ctx, 0, bot - 99, W, bot - 99, INK, 2);
  }
  halftone(ctx, 0, top, W, 190, 'up', '#000', 0.55, 8, 3.6, 1.1);
  halftone(ctx, 0, bot - 160, W, 160, 'down', '#000', 0.5, 8, 3.4, 1.2);

  // ceiling band
  const cg = ctx.createLinearGradient(0, 0, 0, top);
  cg.addColorStop(0, g(6));
  cg.addColorStop(1, g(pal.ceil));
  ctx.fillStyle = cg;
  ctx.fillRect(0, 0, W, top);
  for (let x = 0; x < W; x += 160) line(ctx, x, 0, x, top, g(pal.ceil + 26), 2);
  line(ctx, 0, top, W, top, INK, 5);
  line(ctx, 0, top + 4, W, top + 4, g(pal.wall * 1.4), 1.5);
  // ceiling beams (exaggerated perspective)
  for (let x = 0; x < W; x += 480) {
    poly(ctx, [x, top, x + 40, top, x + 70, top + 36, x - 30, top + 36], g(pal.ceil + 8), INK, 2);
  }
}

// ------------------------------------------------------------------------------------ solids

function paintSolid(ctx: Ctx, s: SolidDef, def: LevelDef, pal: Pal, rng: Rng) {
  const st = s.style ?? (s.oneWay ? 'platform' : s.h > 100 && s.w > 400 ? 'slab' : 'wall');
  if (st === 'none') return;
  const { x, y, w, h } = s;
  switch (st) {
    case 'slab': {
      // floors / ceilings: dark mass, bright top lip, tile seams, halftone falloff
      ctx.fillStyle = g(pal.floor);
      ctx.fillRect(x, y, w, h);
      halftone(ctx, x, y, w, Math.min(h, 60), 'down', '#fff', 0.2, 7, 2.4, 1.1);
      ctx.fillStyle = g(pal.floorTop);
      ctx.fillRect(x, y, w, 7);
      line(ctx, x, y, x + w, y, INK, 3);
      line(ctx, x, y + 7, x + w, y + 7, INK, 2);
      for (let sx = x - (x % 120); sx < x + w; sx += 120) if (sx > x) line(ctx, sx, y + 7, sx, y + Math.min(h, 22), g(pal.floor + 26), 2);
      // underside shadow so floors have weight
      break;
    }
    case 'wall': {
      ctx.fillStyle = g(pal.floor - 8);
      ctx.fillRect(x, y, w, h);
      hatch(ctx, x, y, w, h, 9, 0.7, g(pal.floor + 30), 1, 0.7);
      line(ctx, x, y, x + w, y, g(pal.floorTop * 0.8), 3);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, w, h);
      break;
    }
    case 'desk': {
      inkRect(ctx, x, y + 12, w, h - 12, g(pal.prop + 8), rng, 2.5, 1);
      // drawers
      const dw = Math.min(54, w * 0.3);
      inkRect(ctx, x + w - dw - 6, y + 17, dw, h - 22, g(pal.prop - 6), rng, 2, 0.8);
      for (let i = 0; i < 2; i++) line(ctx, x + w - dw + 8, y + 26 + i * ((h - 34) / 2), x + w - 14, y + 26 + i * ((h - 34) / 2), g(210), 2);
      // knee hole shading
      halftone(ctx, x + 6, y + 14, w - dw - 18, h - 18, 'right', '#000', 0.7, 6, 2.4, 1);
      // top slab
      inkRect(ctx, x - 5, y, w + 10, 12, g(pal.propLight), rng, 2.5, 0.8);
      line(ctx, x - 3, y + 2, x + w + 3, y + 2, g(255), 1.5);
      break;
    }
    case 'counter': {
      inkRect(ctx, x, y + 12, w, h - 12, g(pal.prop + 14), rng, 3, 1);
      // faceted front panels
      const n = Math.max(2, Math.floor(w / 70));
      for (let i = 0; i < n; i++) {
        const px = x + 6 + (i * (w - 12)) / n;
        inkRect(ctx, px, y + 20, (w - 12) / n - 6, h - 30, g(pal.prop + 24), rng, 1.6, 0.6);
        halftone(ctx, px, y + 20, (w - 12) / n - 6, h - 30, 'up', '#000', 0.5, 6, 2.2, 1);
      }
      inkRect(ctx, x - 8, y, w + 16, 14, g(pal.propLight + 20), rng, 3, 0.8);
      line(ctx, x - 6, y + 2, x + w + 6, y + 2, g(255), 2);
      break;
    }
    case 'partition': {
      ctx.fillStyle = g(pal.wall * 0.8);
      ctx.fillRect(x, y, w, h);
      hatch(ctx, x, y, w, h, 5, 0.9, g(pal.wall * 0.55), 1, 0.7);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = g(pal.propLight);
      ctx.fillRect(x - 3, y - 4, w + 6, 8);
      ctx.strokeRect(x - 3, y - 4, w + 6, 8);
      break;
    }
    case 'shelf': {
      inkRect(ctx, x, y, w, h, g(pal.prop - 6), rng, 3, 1);
      const rows = Math.max(1, Math.floor(h / 54));
      const rh = h / rows;
      for (let r = 0; r < rows; r++) {
        const ry = y + r * rh;
        line(ctx, x, ry + rh - 4, x + w, ry + rh - 4, g(pal.floorTop * 0.8), 3);
        let fx = x + 6;
        while (fx < x + w - 12) {
          const fw = rng.range(5, 11);
          const fh = rng.range(rh * 0.5, rh - 14);
          ctx.fillStyle = g(rng.range(90, 225));
          ctx.fillRect(fx, ry + rh - 4 - fh, fw, fh);
          ctx.strokeStyle = INK;
          ctx.lineWidth = 1.2;
          ctx.strokeRect(fx, ry + rh - 4 - fh, fw, fh);
          fx += fw + rng.range(0, 3);
          if (rng.next() < 0.06) fx += rng.range(10, 30);
        }
      }
      ctx.fillStyle = g(pal.propLight * 0.9);
      ctx.fillRect(x - 3, y - 5, w + 6, 8);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(x - 3, y - 5, w + 6, 8);
      break;
    }
    case 'crate': {
      inkRect(ctx, x, y, w, h, g(pal.prop + 40), rng, 3, 1);
      line(ctx, x + 3, y + 3, x + w - 3, y + h - 3, INK, 2);
      line(ctx, x + w - 3, y + 3, x + 3, y + h - 3, INK, 2);
      line(ctx, x + 2, y + 2, x + w - 2, y + 2, g(240), 2);
      break;
    }
    default: {
      // generic platform / catwalk / ledge
      ctx.fillStyle = g(pal.floorTop * 0.9);
      ctx.fillRect(x, y, w, Math.min(h, 12));
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(x, y, w, Math.min(h, 12));
      line(ctx, x + 2, y + 2, x + w - 2, y + 2, g(255), 1.5);
      // brackets
      for (let bx = x + 14; bx < x + w - 10; bx += 70) poly(ctx, [bx, y + 12, bx + 12, y + 12, bx, y + 26], g(pal.prop), INK, 1.5);
      break;
    }
  }
}

// ------------------------------------------------------------------------------------ props

function paintProp(ctx: Ctx, p: PropDef, def: LevelDef, pal: Pal, rng: Rng) {
  const x = p.x;
  const y = p.y;
  const w = p.w ?? 60;
  const h = p.h ?? 60;
  ctx.save();
  if (p.flip) {
    ctx.translate(x * 2, 0);
    ctx.scale(-1, 1);
  }
  switch (p.kind) {
    case 'window': {
      // punches a hole through the wall to reveal the parallax skyline
      const x0 = x - w / 2;
      const y0 = y - h;
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = '#000';
      ctx.fillRect(x0, y0, w, h);
      ctx.restore();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 6;
      ctx.strokeRect(x0, y0, w, h);
      ctx.lineWidth = 4;
      const cols = Math.max(1, Math.round(w / 120));
      for (let i = 1; i < cols; i++) line(ctx, x0 + (w / cols) * i, y0, x0 + (w / cols) * i, y0 + h, INK, 5);
      line(ctx, x0, y0 + h * 0.62, x0 + w, y0 + h * 0.62, INK, 4);
      // glass streaks
      for (let i = 0; i < 5; i++) {
        const sx = x0 + rng.range(10, w - 40);
        poly(ctx, [sx, y0 + 4, sx + 18, y0 + 4, sx - 40, y0 + h - 4, sx - 58, y0 + h - 4], 'rgba(255,255,255,0.08)', null);
      }
      // sill
      ctx.fillStyle = g(pal.propLight);
      ctx.fillRect(x0 - 6, y0 + h, w + 12, 8);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(x0 - 6, y0 + h, w + 12, 8);
      break;
    }
    case 'clock': {
      const r = (p.w ?? 34) / 2;
      ctx.fillStyle = g(235);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 6.28);
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 4;
      ctx.stroke();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * 6.28;
        line(ctx, x + Math.cos(a) * (r - 4), y + Math.sin(a) * (r - 4), x + Math.cos(a) * (r - 8), y + Math.sin(a) * (r - 8), INK, 1.5);
      }
      // frozen at 03:17
      const ha = ((3 + 17 / 60) / 12) * 6.28 - 1.57;
      const ma = (17 / 60) * 6.28 - 1.57;
      line(ctx, x, y, x + Math.cos(ha) * r * 0.5, y + Math.sin(ha) * r * 0.5, INK, 3.5);
      line(ctx, x, y, x + Math.cos(ma) * r * 0.78, y + Math.sin(ma) * r * 0.78, INK, 2.5);
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, 6.28);
      ctx.fill();
      break;
    }
    case 'sign': {
      const txt = p.text ?? 'EXIT';
      ctx.font = '700 22px Impact, "Arial Black", sans-serif';
      const tw = Math.max(w, ctx.measureText(txt).width + 26);
      inkRect(ctx, x - tw / 2, y - 18, tw, 36, g(236), rng, 3, 0.8);
      ctx.fillStyle = INK;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(txt, x, y + 1);
      break;
    }
    case 'poster': {
      inkRect(ctx, x - w / 2, y - h, w, h, g(222), rng, 3, 1);
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(x, y - h * 0.58, w * 0.26, 0, 6.28);
      ctx.fill();
      halftone(ctx, x - w / 2 + 6, y - h + 6, w - 12, h * 0.5, 'down', '#000', 0.8, 5, 2, 1);
      ctx.font = '700 13px Impact, "Arial Black", sans-serif';
      ctx.fillStyle = INK;
      ctx.textAlign = 'center';
      ctx.fillText(p.text ?? 'SAFETY FIRST', x, y - 12);
      break;
    }
    case 'door': {
      inkRect(ctx, x - w / 2, y - h, w, h, g(pal.prop + 26), rng, 3.5, 1);
      inkRect(ctx, x - w / 2 + 12, y - h + 16, w - 24, h * 0.34, g(150), rng, 2, 0.8);
      halftone(ctx, x - w / 2 + 12, y - h + 16, w - 24, h * 0.34, 'down', '#000', 0.7, 5, 2, 1);
      line(ctx, x + w / 2 - 14, y - h * 0.45, x + w / 2 - 14, y - h * 0.38, g(240), 4);
      if (p.text) {
        ctx.font = '700 12px "Courier New", monospace';
        ctx.fillStyle = g(235);
        ctx.textAlign = 'center';
        ctx.fillText(p.text, x, y - h + 12 + h * 0.34 + 28);
      }
      break;
    }
    case 'elevator': {
      const fw = w || 150;
      const fh = h || 200;
      ctx.fillStyle = g(8);
      ctx.fillRect(x - fw / 2 - 10, y - fh - 12, fw + 20, fh + 12);
      inkRect(ctx, x - fw / 2 - 14, y - fh - 16, fw + 28, 16, g(pal.propLight), rng, 3, 0.6);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 4;
      ctx.strokeRect(x - fw / 2 - 10, y - fh - 12, fw + 20, fh + 12);
      // floor indicator plate
      inkRect(ctx, x - 34, y - fh - 56, 68, 34, g(14), rng, 3, 0.6);
      break;
    }
    case 'desk': {
      inkRect(ctx, x - w / 2, y - 62, w, 62, g(pal.prop + 8), rng, 2.5, 1);
      inkRect(ctx, x - w / 2 - 4, y - 66, w + 8, 10, g(pal.propLight), rng, 2.5, 0.8);
      break;
    }
    case 'monitor': {
      // sits on top of whatever is below: y = surface
      const mw = p.w ?? 46;
      const mh = (p.h ?? 32);
      line(ctx, x, y - 4, x, y - 12, INK, 5);
      inkRect(ctx, x - 14, y - 6, 28, 6, g(pal.prop), rng, 2, 0.5);
      inkRect(ctx, x - mw / 2, y - 12 - mh, mw, mh, g(pal.prop - 10), rng, 3, 0.7);
      ctx.fillStyle = g(200);
      ctx.fillRect(x - mw / 2 + 4, y - 8 - mh, mw - 8, mh - 8);
      halftone(ctx, x - mw / 2 + 4, y - 8 - mh, mw - 8, mh - 8, 'down', '#000', 0.5, 5, 1.8, 1);
      for (let i = 0; i < 3; i++) line(ctx, x - mw / 2 + 9, y - 12 - mh + 8 + i * 6, x + mw / 2 - 11 - i * 6, y - 12 - mh + 8 + i * 6, INK, 1.6);
      break;
    }
    case 'chair': {
      // base y = floor; side view office chair
      line(ctx, x, y - 4, x, y - 26, INK, 5);
      line(ctx, x - 20, y - 3, x + 20, y - 3, INK, 4);
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(x - 18, y - 3, 3.4, 0, 6.28);
      ctx.arc(x + 18, y - 3, 3.4, 0, 6.28);
      ctx.fill();
      inkRect(ctx, x - 20, y - 36, 40, 11, g(pal.prop + 28), rng, 2.5, 0.6);
      inkRect(ctx, x - 22, y - 78, 12, 46, g(pal.prop + 20), rng, 2.5, 0.6);
      break;
    }
    case 'plant': {
      inkRect(ctx, x - 16, y - 30, 32, 30, g(pal.propLight * 0.7), rng, 2.5, 0.6);
      for (let i = 0; i < 9; i++) {
        const a = -1.57 + (i - 4) * 0.34;
        const l = rng.range(40, 78);
        poly(ctx, [x, y - 28, x + Math.cos(a - 0.14) * l * 0.55, y - 28 + Math.sin(a - 0.14) * l * 0.55, x + Math.cos(a) * l, y - 28 + Math.sin(a) * l, x + Math.cos(a + 0.14) * l * 0.55, y - 28 + Math.sin(a + 0.14) * l * 0.55], g(22 + rng.range(0, 26)), INK, 1.5);
      }
      break;
    }
    case 'couch': {
      inkRect(ctx, x - w / 2, y - 40, w, 40, g(pal.prop + 14), rng, 3, 1);
      inkRect(ctx, x - w / 2 - 8, y - 52, 18, 52, g(pal.prop + 24), rng, 3, 1);
      inkRect(ctx, x + w / 2 - 10, y - 52, 18, 52, g(pal.prop + 24), rng, 3, 1);
      inkRect(ctx, x - w / 2 + 12, y - 74, w - 24, 38, g(pal.prop + 20), rng, 3, 1);
      halftone(ctx, x - w / 2 + 12, y - 74, w - 24, 38, 'down', '#fff', 0.2, 6, 2, 1);
      break;
    }
    case 'cabinet': {
      inkRect(ctx, x - w / 2, y - h, w, h, g(pal.prop + 30), rng, 3, 1);
      const n = Math.max(2, Math.floor(h / 40));
      for (let i = 0; i < n; i++) {
        const dy = y - h + 6 + (i * (h - 8)) / n;
        inkRect(ctx, x - w / 2 + 5, dy, w - 10, (h - 8) / n - 5, g(pal.prop + 42), rng, 2, 0.5);
        line(ctx, x - 9, dy + (h - 8) / n / 2 - 2, x + 9, dy + (h - 8) / n / 2 - 2, g(236), 3);
      }
      break;
    }
    case 'column': {
      const cw = w;
      ctx.fillStyle = g(pal.wall * 0.62);
      ctx.fillRect(x - cw / 2, def.ceiling, cw, y - def.ceiling);
      halftone(ctx, x - cw / 2, def.ceiling, cw, y - def.ceiling, 'right', '#000', 0.65, 7, 3.2, 1);
      line(ctx, x - cw / 2, def.ceiling, x - cw / 2, y, g(pal.wall * 1.4), 3);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 4;
      ctx.strokeRect(x - cw / 2, def.ceiling, cw, y - def.ceiling);
      inkRect(ctx, x - cw / 2 - 8, y - 22, cw + 16, 22, g(pal.prop + 30), rng, 3, 0.8);
      inkRect(ctx, x - cw / 2 - 8, def.ceiling, cw + 16, 20, g(pal.prop + 30), rng, 3, 0.8);
      break;
    }
    case 'pillar': {
      const cw = w;
      ctx.fillStyle = g(pal.wall * 0.7);
      ctx.fillRect(x - cw / 2, def.ceiling, cw, y - def.ceiling);
      for (let yy = y - 150; yy < y - 20; yy += 36) {
        poly(ctx, [x - cw / 2, yy, x - cw / 2 + 28, yy, x - cw / 2, yy + 28], g(235), null);
        poly(ctx, [x - cw / 2 + 28, yy, x - cw / 2 + 56, yy, x - cw / 2 + 28, yy + 28, x - cw / 2, yy + 28], g(14), null);
      }
      halftone(ctx, x - cw / 2, def.ceiling, cw, y - def.ceiling, 'right', '#000', 0.6, 7, 3, 1);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 4;
      ctx.strokeRect(x - cw / 2, def.ceiling, cw, y - def.ceiling);
      break;
    }
    case 'pipe': {
      ctx.fillStyle = g(pal.prop + 26);
      ctx.fillRect(x, y - 9, w, 18);
      line(ctx, x, y - 6, x + w, y - 6, g(230), 2);
      line(ctx, x, y + 9, x + w, y + 9, INK, 3);
      for (let px = x + 40; px < x + w; px += 140) {
        inkRect(ctx, px, y - 13, 12, 26, g(pal.prop + 50), rng, 2, 0.4);
      }
      break;
    }
    case 'vent': {
      inkRect(ctx, x - w / 2, y - h, w, h, g(pal.prop + 40), rng, 2.5, 0.6);
      for (let i = 1; i < 6; i++) line(ctx, x - w / 2 + 4, y - h + (h / 6) * i, x + w / 2 - 4, y - h + (h / 6) * i, INK, 2);
      break;
    }
    case 'tube': {
      const tw = w;
      const th = h;
      ctx.fillStyle = 'rgba(210,210,210,0.18)';
      ctx.fillRect(x - tw / 2, y - th, tw, th);
      ctx.fillStyle = g(180);
      ctx.fillRect(x - tw / 2 + 4, y - th * 0.55, tw - 8, th * 0.55 - 6);
      halftone(ctx, x - tw / 2 + 4, y - th * 0.55, tw - 8, th * 0.55 - 6, 'right', '#000', 0.6, 5, 2, 1);
      inkRect(ctx, x - tw / 2 - 8, y - th - 14, tw + 16, 16, g(pal.prop + 20), rng, 2.5, 0.5);
      inkRect(ctx, x - tw / 2 - 8, y - 12, tw + 16, 14, g(pal.prop + 20), rng, 2.5, 0.5);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      ctx.strokeRect(x - tw / 2, y - th, tw, th);
      line(ctx, x - tw / 2 + 8, y - th + 12, x - tw / 2 + 8, y - th * 0.6, g(255), 3);
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = g(250);
        ctx.beginPath();
        ctx.arc(x + rng.range(-tw / 3, tw / 3), y - rng.range(th * 0.15, th * 0.5), rng.range(1.5, 3.5), 0, 6.28);
        ctx.fill();
      }
      break;
    }
    case 'machine': {
      inkRect(ctx, x - w / 2, y - h, w, h, g(pal.prop + 24), rng, 3.5, 1);
      inkRect(ctx, x - w / 2 + 10, y - h + 12, w - 20, h * 0.32, g(30), rng, 2.5, 0.6);
      line(ctx, x - w / 2 + 18, y - h + 26, x + w / 2 - 30, y - h + 26, g(240), 2.5);
      line(ctx, x - w / 2 + 18, y - h + 38, x + w / 2 - 50, y - h + 38, g(180), 2);
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = g(i % 2 ? 235 : 90);
        ctx.beginPath();
        ctx.arc(x - w / 2 + 22 + i * 24, y - h * 0.38, 6, 0, 6.28);
        ctx.fill();
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      halftone(ctx, x - w / 2, y - h, w, h, 'right', '#000', 0.5, 6, 2.6, 1);
      break;
    }
    case 'rack': {
      inkRect(ctx, x - w / 2, y - h, w, h, g(pal.prop - 4), rng, 3.5, 0.8);
      for (let yy = y - h + 12; yy < y - 14; yy += 22) {
        inkRect(ctx, x - w / 2 + 8, yy, w - 16, 16, g(pal.prop + 20), rng, 1.5, 0.4);
        ctx.fillStyle = g(240);
        ctx.fillRect(x + w / 2 - 22, yy + 6, 5, 4);
        ctx.fillStyle = g(120);
        ctx.fillRect(x + w / 2 - 32, yy + 6, 5, 4);
      }
      break;
    }
    case 'bench': {
      inkRect(ctx, x - w / 2, y - 58, w, 10, g(pal.propLight), rng, 2.5, 0.6);
      inkRect(ctx, x - w / 2 + 6, y - 48, 12, 48, g(pal.prop), rng, 2, 0.5);
      inkRect(ctx, x + w / 2 - 18, y - 48, 12, 48, g(pal.prop), rng, 2, 0.5);
      // flasks
      for (let i = 0; i < 3; i++) {
        const fx = x - w / 4 + i * (w / 4);
        poly(ctx, [fx - 4, y - 58, fx + 4, y - 58, fx + 4, y - 74, fx + 12, y - 92, fx - 12, y - 92, fx - 4, y - 74], 'rgba(230,230,230,0.5)', INK, 2);
      }
      break;
    }
    case 'car': {
      // original sedan silhouette (side view); base y = ground
      const cw = w || 330;
      const x0 = x - cw / 2;
      ctx.fillStyle = g(14);
      poly(ctx, [x0, y - 18, x0 + 14, y - 52, x0 + cw * 0.2, y - 60, x0 + cw * 0.32, y - 92, x0 + cw * 0.68, y - 94, x0 + cw * 0.82, y - 62, x0 + cw - 10, y - 56, x0 + cw, y - 20, x0 + cw - 6, y - 8, x0 + 8, y - 8], g(16), INK, 4);
      // windows
      poly(ctx, [x0 + cw * 0.34, y - 88, x0 + cw * 0.5, y - 89, x0 + cw * 0.5, y - 62, x0 + cw * 0.27, y - 62], g(70), null);
      poly(ctx, [x0 + cw * 0.53, y - 89, x0 + cw * 0.66, y - 89, x0 + cw * 0.77, y - 62, x0 + cw * 0.53, y - 62], g(70), null);
      line(ctx, x0 + 20, y - 60, x0 + cw - 20, y - 58, g(200), 2);
      for (const wx of [x0 + cw * 0.22, x0 + cw * 0.78]) {
        ctx.fillStyle = g(6);
        ctx.beginPath();
        ctx.arc(wx, y - 12, 26, 0, 6.28);
        ctx.fill();
        ctx.strokeStyle = g(180);
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = g(120);
        ctx.beginPath();
        ctx.arc(wx, y - 12, 9, 0, 6.28);
        ctx.fill();
      }
      // headlamp
      ctx.fillStyle = g(255);
      poly(ctx, [x0 + cw - 18, y - 52, x0 + cw - 2, y - 50, x0 + cw - 4, y - 38, x0 + cw - 22, y - 40], g(255), null);
      glow(ctx, x0 + cw, y - 44, 70, 0.7);
      break;
    }
    case 'boxes': {
      let by = y;
      const n = p.n ?? 3;
      for (let i = 0; i < n; i++) {
        const bw = w - i * 10;
        inkRect(ctx, x - bw / 2 + rng.range(-4, 4), by - 34, bw, 34, g(rng.range(150, 215)), rng, 2.5, 1);
        line(ctx, x - bw / 2 + 8, by - 22, x + bw / 2 - 8, by - 22, INK, 2);
        by -= 34;
      }
      break;
    }
    case 'lamp': {
      line(ctx, x, y, x - 8, y - 22, INK, 3);
      line(ctx, x - 8, y - 22, x + 10, y - 38, INK, 3);
      poly(ctx, [x + 4, y - 40, x + 22, y - 34, x + 16, y - 26], g(220), INK, 2);
      break;
    }
    case 'cable': {
      ctx.strokeStyle = INK;
      ctx.lineWidth = 4;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        const sx = x + i * 22;
        ctx.moveTo(sx, def.ceiling);
        ctx.quadraticCurveTo(sx + rng.range(-30, 30), def.ceiling + h * 0.7, sx + rng.range(-20, 20), def.ceiling + h);
        ctx.stroke();
      }
      break;
    }
    case 'tvwall': {
      inkRect(ctx, x - w / 2, y - h, w, h, g(pal.prop), rng, 3.5, 0.8);
      const cols = Math.floor(w / 56);
      const rows = Math.floor(h / 40);
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          const sx = x - w / 2 + 8 + c * 56;
          const sy = y - h + 8 + r * 40;
          ctx.fillStyle = g(rng.next() < 0.4 ? rng.range(150, 240) : 28);
          ctx.fillRect(sx, sy, 48, 32);
          ctx.strokeStyle = INK;
          ctx.lineWidth = 2;
          ctx.strokeRect(sx, sy, 48, 32);
        }
      break;
    }
    case 'shelf': {
      paintSolid(ctx, { x: x - w / 2, y: y - h, w, h, style: 'shelf' }, def, pal, rng);
      halftone(ctx, x - w / 2, y - h, w, h, 'down', '#000', 0.35, 7, 2.6, 1);
      break;
    }
    case 'sink':
      break;
    case 'chairDyn':
      break;
  }
  ctx.restore();
  void wobbleRect;
}

// ------------------------------------------------------------------------------------ fixtures & splats

function paintFixtures(ctx: Ctx, def: LevelDef, pal: Pal) {
  for (const l of def.lights) {
    if (!l.fixture) continue;
    const w = 130;
    ctx.fillStyle = g(30);
    ctx.fillRect(l.x - w / 2 - 4, l.y - 6, w + 8, 12);
    ctx.fillStyle = g(250);
    ctx.fillRect(l.x - w / 2, l.y + 2, w, 7);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.strokeRect(l.x - w / 2 - 4, l.y - 6, w + 8, 15);
  }
  void pal;
}

function paintSplats(ctx: Ctx, def: LevelDef, rng: Rng) {
  const n = Math.floor(def.width / 700);
  for (let i = 0; i < n; i++) {
    const x = rng.range(100, def.width - 100);
    const y = rng.range(def.ceiling + 60, def.ground - 120);
    inkSplat(ctx, x, y, rng.range(5, 12), rng, g(10));
  }
}
