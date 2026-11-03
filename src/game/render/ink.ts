// Small helpers for the hand-inked, comic-book look of the baked level art. Everything is greyscale.

export type Ctx = CanvasRenderingContext2D;

export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 1;
  }
  next(): number {
    // mulberry32
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(a: number, b: number): number {
    return Math.floor(this.range(a, b + 1));
  }
  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
}

export const g = (v: number, a = 1): string => {
  const c = Math.max(0, Math.min(255, Math.round(v)));
  return a >= 1 ? `rgb(${c},${c},${c})` : `rgba(${c},${c},${c},${a})`;
};

export const INK = g(8);
export const PAPER = g(236);

/** A rectangle with slightly wobbly, hand-drawn edges. */
export function wobbleRect(ctx: Ctx, x: number, y: number, w: number, h: number, rng: Rng, amp = 1.4) {
  const j = () => rng.range(-amp, amp);
  ctx.beginPath();
  ctx.moveTo(x + j(), y + j());
  ctx.lineTo(x + w * 0.5 + j(), y + j() * 0.6);
  ctx.lineTo(x + w + j(), y + j());
  ctx.lineTo(x + w + j() * 0.6, y + h * 0.5 + j());
  ctx.lineTo(x + w + j(), y + h + j());
  ctx.lineTo(x + w * 0.5 + j(), y + h + j() * 0.6);
  ctx.lineTo(x + j(), y + h + j());
  ctx.lineTo(x + j() * 0.6, y + h * 0.5 + j());
  ctx.closePath();
}

export function inkRect(ctx: Ctx, x: number, y: number, w: number, h: number, fill: string, rng: Rng, lw = 2.5, amp = 1.3) {
  wobbleRect(ctx, x, y, w, h, rng, amp);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

export function line(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, color: string, lw = 1.5) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.stroke();
}

export function poly(ctx: Ctx, pts: number[], fill: string | null, stroke: string | null, lw = 2) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

/** parallel hatch lines clipped to a rect */
export function hatch(ctx: Ctx, x: number, y: number, w: number, h: number, spacing: number, angle: number, color: string, lw = 1, alpha = 1) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const diag = Math.hypot(w, h);
  const cx = x + w / 2;
  const cy = y + h / 2;
  ctx.beginPath();
  for (let d = -diag; d <= diag; d += spacing) {
    const px = cx + -dy * d;
    const py = cy + dx * d;
    ctx.moveTo(px - dx * diag, py - dy * diag);
    ctx.lineTo(px + dx * diag, py + dy * diag);
  }
  ctx.stroke();
  ctx.restore();
}

export type HalftoneDir = 'up' | 'down' | 'left' | 'right' | 'center' | 'edge';

/** A halftone dot gradient (print-style shading) inside a rect. Dots grow in the direction given. */
export function halftone(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  dir: HalftoneDir,
  color = '#000',
  alpha = 1,
  spacing = 7,
  maxR = 3.2,
  power = 1.2,
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  const rows = Math.ceil(h / spacing) + 1;
  const cols = Math.ceil(w / spacing) + 1;
  for (let j = 0; j < rows; j++) {
    const cy = y + j * spacing * 0.866;
    if (cy > y + h + spacing) break;
    for (let i = 0; i < cols; i++) {
      const cx = x + i * spacing + (j % 2 ? spacing / 2 : 0);
      let t: number;
      const u = (cx - x) / w;
      const v = (cy - y) / h;
      switch (dir) {
        case 'up':
          t = 1 - v;
          break;
        case 'down':
          t = v;
          break;
        case 'left':
          t = 1 - u;
          break;
        case 'right':
          t = u;
          break;
        case 'edge':
          t = Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5)) * 2;
          break;
        default:
          t = 1 - Math.min(1, Math.hypot(u - 0.5, v - 0.5) * 2);
      }
      if (t <= 0) continue;
      const r = maxR * Math.pow(Math.min(1, t), power);
      if (r < 0.45) continue;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, 6.2832);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function inkSplat(ctx: Ctx, x: number, y: number, r: number, rng: Rng, color = INK) {
  ctx.fillStyle = color;
  ctx.beginPath();
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * rng.range(0.55, 1.15);
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  const drops = rng.int(3, 7);
  for (let i = 0; i < drops; i++) {
    const a = rng.range(0, 6.28);
    const d = r * rng.range(1.3, 2.6);
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * rng.range(0.06, 0.22), 0, 6.28);
    ctx.fill();
  }
}

export function glow(ctx: Ctx, x: number, y: number, r: number, a: number, color = '255,255,255') {
  const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, `rgba(${color},${a})`);
  gr.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = gr;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}
