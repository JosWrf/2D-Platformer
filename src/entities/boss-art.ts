import { ART, makeCanvas } from '../render/pixel';

/**
 * The bosses' workbench: what their art has in common, on the art grid.
 *
 * A big boss is built the way a sixteen-bit boss was: out of parts - a torso,
 * a head, limbs, a neck segment - each drawn once per angle it can take and
 * then only ever blitted, at whole art pixels, where the skeleton puts it. A
 * part is described as a shape in its own frame (a painter: what lies at a
 * point of the part, unturned), and a sprite of it at a given turn is made by
 * asking the painter about the centre of every art pixel the turned part can
 * cover - the shape is rasterised at that angle, never an image resampled -
 * then shaded by the house rule: the key light from the upper left, so the
 * cells on the upper left of a shape step up its ramp and the cells on its
 * lower right step down. No outer outline: the actor layer draws that.
 */

/** A material: its ramp, darkest first, and whether the light shades it. */
export interface Mat {
  readonly tones: readonly string[];
  /** Flat paints (an eye, a stitch) are left as painted. */
  readonly flat?: boolean;
}

/** A cell as a painter gives it: 0 for nothing, else material (1-based) * 16 + tone. */
export function cell(mat: number, tone: number): number {
  return mat * 16 + tone;
}

/** A part drawn at one turn: the canvas, and where its pivot is on it. */
export interface PartSprite {
  readonly canvas: HTMLCanvasElement;
  readonly w: number;
  readonly h: number;
  /** The pivot's art pixel. */
  readonly px: number;
  readonly py: number;
  mirror: HTMLCanvasElement | null;
}

/**
 * A detail too small to be turned - an eye, a painted smile - placed by hand
 * as a little grid of cells and stamped, unturned, where its anchor point (in
 * the part's frame, logical px) lands once the part is turned. A part turned
 * more than an eighth of the way round gets the grid turned by a quarter, so
 * a face lying on its side still has its features the right way up to it.
 */
export interface Decal {
  x: number;
  y: number;
  grid: readonly string[];
  /** Cell code (see cell) for each character of the grid; '.' is nothing. */
  cells: Readonly<Record<string, number>>;
  /** A turn of its own on top of the part's, for picking which way up the grid goes. */
  turn?: number;
}

function quarterTurns(grid: readonly string[], q: number): string[] {
  let g = [...grid];
  for (let k = 0; k < q; k++) {
    const h = g.length;
    const w = Math.max(...g.map((r) => r.length));
    const out: string[] = [];
    for (let x = 0; x < w; x++) {
      let row = '';
      for (let y = h - 1; y >= 0; y--) row += g[y][x] ?? '.';
      out.push(row);
    }
    g = out;
  }
  return g;
}

/**
 * Rasterises a part. `reach` is how far from its pivot (logical px, before
 * scale) the part can go; `theta` its turn as the canvas measures one
 * (clockwise on screen); `paint(x, y)` answers for a point of the part's own
 * frame in logical px. The pivot sits on the centre of an art pixel.
 */
export function buildPart(
  reach: number,
  theta: number,
  scale: number,
  mats: readonly Mat[],
  paint: (x: number, y: number) => number,
  decals: readonly Decal[] = [],
): PartSprite {
  const r = Math.ceil((reach * scale) / ART) + 1;
  const n = r * 2 + 1;
  const cells = new Int32Array(n * n);
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const X = (i - r) * ART;
      const Y = (j - r) * ART;
      // Back into the part's own frame: turned the other way, and unscaled.
      const x = (X * c + Y * s) / scale;
      const y = (-X * s + Y * c) / scale;
      cells[j * n + i] = paint(x, y);
    }
  }
  if (decals.length) {
    for (const d of decals) {
      const q = ((Math.round((theta + (d.turn ?? 0)) / (Math.PI / 2)) % 4) + 4) % 4;
      const g = quarterTurns(d.grid, q);
      const ax = r + Math.round(((d.x * c - d.y * s) * scale) / ART);
      const ay = r + Math.round(((d.x * s + d.y * c) * scale) / ART);
      const gh = g.length;
      const gw = Math.max(...g.map((row) => row.length));
      const ox = ax - Math.floor(gw / 2);
      const oy = ay - Math.floor(gh / 2);
      for (let y = 0; y < gh; y++) {
        for (let x = 0; x < gw; x++) {
          const ch = g[y][x];
          const v = ch && ch !== '.' ? d.cells[ch] : undefined;
          const i = ox + x;
          const j = oy + y;
          if (v === undefined || i < 0 || j < 0 || i >= n || j >= n) continue;
          cells[j * n + i] = v;
        }
      }
    }
  }
  return finish(cells, n, n, r, r, mats);
}

/**
 * Shades cells by their place in the shape and draws them. A cell whose
 * neighbour above or to the left is empty catches the light (one tone up);
 * one whose neighbour below or to the right is empty, or is another shaded
 * material drawn darker, falls into shadow (one tone down).
 */
export function finish(cells: Int32Array, w: number, h: number, px: number, py: number, mats: readonly Mat[]): PartSprite {
  const at = (i: number, j: number): number => (i < 0 || j < 0 || i >= w || j >= h ? 0 : cells[j * w + i]);
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  const out: string[] = new Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const v = cells[j * w + i];
      if (v <= 0) continue;
      const mi = (v >> 4) - 1;
      const mat = mats[mi];
      let tone = v & 15;
      if (mat && !mat.flat) {
        const lit = at(i - 1, j) <= 0 || at(i, j - 1) <= 0;
        const dark = at(i + 1, j) <= 0 || at(i, j + 1) <= 0;
        if (lit && !dark) tone++;
        else if (dark && !lit) tone--;
      }
      const tones = mat ? mat.tones : ['#ff00ff'];
      out[j * w + i] = tones[Math.max(0, Math.min(tones.length - 1, tone))];
      if (i < minX) minX = i;
      if (i > maxX) maxX = i;
      if (j < minY) minY = j;
      if (j > maxY) maxY = j;
    }
  }
  if (maxX < 0) {
    const { canvas } = makeCanvas(1, 1);
    return { canvas, w: 1, h: 1, px: 0, py: 0, mirror: null };
  }
  // Trimmed to what was painted.
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const { canvas, ctx } = makeCanvas(cw, ch);
  for (let j = minY; j <= maxY; j++) {
    let run = -1;
    let col = '';
    for (let i = minX; i <= maxX + 1; i++) {
      const c = i <= maxX ? out[j * w + i] : undefined;
      if (c !== col) {
        if (run >= 0 && col) {
          ctx.fillStyle = col;
          ctx.fillRect(run - minX, j - minY, i - run, 1);
        }
        run = i;
        col = c ?? '';
      }
    }
  }
  return { canvas, w: cw, h: ch, px: px - minX, py: py - minY, mirror: null };
}

function mirrorOf(s: PartSprite): HTMLCanvasElement {
  if (!s.mirror) {
    const { canvas, ctx } = makeCanvas(s.w, s.h);
    ctx.translate(s.w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(s.canvas, 0, 0);
    s.mirror = canvas;
  }
  return s.mirror;
}

/**
 * A part's sprite blitted with its pivot on the art pixel under (x, y) -
 * logical coordinates under the camera's transform. Mirrored, it turns about
 * that same pixel.
 */
export function blit(ctx: CanvasRenderingContext2D, s: PartSprite, x: number, y: number, mirrored = false): void {
  const ax = Math.floor(x / ART);
  const ay = Math.floor(y / ART);
  const left = mirrored ? ax - (s.w - 1 - s.px) : ax - s.px;
  ctx.drawImage(mirrored ? mirrorOf(s) : s.canvas, left * ART, (ay - s.py) * ART, s.w * ART, s.h * ART);
}

/** Sprites made once, the first time they are asked for. */
export class PartCache {
  private readonly made = new Map<string, PartSprite>();

  get(key: string, make: () => PartSprite): PartSprite {
    let s = this.made.get(key);
    if (!s) {
      s = make();
      this.made.set(key, s);
    }
    return s;
  }
}

/** A turn as one of `steps` drawn angles: the index, 0..steps-1. */
export function angleStep(theta: number, steps = 16): number {
  const k = Math.round((theta / (Math.PI * 2)) * steps);
  return ((k % steps) + steps) % steps;
}

/** The turn a drawn angle stands for. */
export function stepAngle(k: number, steps = 16): number {
  return (k / steps) * Math.PI * 2;
}

/**
 * A hit is a white silhouette for its first two or three frames and nothing
 * after: the fading white withHitFlash lays on below that comes out of the
 * palette as a dither over the whole body.
 */
export function solidFlash(flash: number): number {
  return flash >= 0.8 ? 1 : 0;
}

/* ------------------------------------------------------------- pen extras */

/**
 * The pixels between two ellipses round (cx, cy): the outer one rx × ry, the
 * inner one `thick` art pixels in (logical coordinates). A ring lying on the
 * floor, seen edge on.
 */
export function ovalRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, thick: number, color: string): void {
  const ox = rx / ART;
  const oy = ry / ART;
  if (ox <= 0 || oy <= 0) return;
  const ix = Math.max(0, ox - thick);
  const iy = Math.max(0, oy - thick);
  const ccx = cx / ART;
  const ccy = cy / ART;
  ctx.fillStyle = color;
  const top = Math.ceil(ccy - oy - 0.5);
  const bottom = Math.floor(ccy + oy - 0.5);
  for (let row = top; row <= bottom; row++) {
    const v = (row + 0.5 - ccy) / oy;
    const k = 1 - v * v;
    if (k < 0) continue;
    const half = ox * Math.sqrt(k);
    const left = Math.ceil(ccx - half - 0.5);
    const right = Math.floor(ccx + half - 0.5);
    if (right < left) continue;
    const vi = iy > 0 ? (row + 0.5 - ccy) / iy : 2;
    const ki = 1 - vi * vi;
    if (ki <= 0 || ix <= 0) {
      ctx.fillRect(left * ART, row * ART, (right - left + 1) * ART, ART);
      continue;
    }
    const inner = ix * Math.sqrt(ki);
    const il = Math.ceil(ccx - inner - 0.5);
    const ir = Math.floor(ccx + inner - 0.5);
    if (il > left) ctx.fillRect(left * ART, row * ART, (il - left) * ART, ART);
    if (right > ir) ctx.fillRect((ir + 1) * ART, row * ART, (right - ir) * ART, ART);
    if (il <= left && right <= ir) continue;
  }
}

/**
 * Dashes round an ellipse: `dash` art pixels on, `gap` off, measured along
 * the outline, starting at the angle `phase`.
 */
export function dashedOval(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  dash: number,
  gap: number,
  color: string,
  phase = 0,
): void {
  const ax = rx / ART;
  const ay = ry / ART;
  const steps = Math.max(24, Math.round((ax + ay) * 4));
  const ccx = cx / ART;
  const ccy = cy / ART;
  let walked = 0;
  let px = NaN;
  let py = NaN;
  const seen = new Set<number>();
  ctx.fillStyle = color;
  for (let i = 0; i <= steps; i++) {
    const a = phase + (i / steps) * Math.PI * 2;
    const x = Math.floor(ccx + Math.cos(a) * ax);
    const y = Math.floor(ccy + Math.sin(a) * ay);
    if (x === px && y === py) continue;
    if (!Number.isNaN(px)) walked++;
    px = x;
    py = y;
    if (walked % (dash + gap) >= dash) continue;
    const key = x * 4096 + y;
    if (seen.has(key)) continue;
    seen.add(key);
    ctx.fillRect(x * ART, y * ART, ART, ART);
  }
}

/** Distance from (x, y) to the segment a-b, and how far along it (0..1) the nearest point is. */
export function segDist(x: number, y: number, ax: number, ay: number, bx: number, by: number): { d: number; t: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
  const qx = ax + dx * t - x;
  const qy = ay + dy * t - y;
  return { d: Math.sqrt(qx * qx + qy * qy), t };
}

/** Even-odd point-in-polygon for a flat [x0, y0, x1, y1, …] list. */
export function inPoly(x: number, y: number, pts: readonly number[]): boolean {
  let odd = false;
  const n = pts.length >> 1;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const yi = pts[i * 2 + 1];
    const yj = pts[j * 2 + 1];
    if (yi > y !== yj > y && x < pts[i * 2] + ((y - yi) / (yj - yi)) * (pts[j * 2] - pts[i * 2])) odd = !odd;
  }
  return odd;
}

/** Inside the ellipse round (cx, cy) with radii rx, ry, turned by `rot`. */
export function inOval(x: number, y: number, cx: number, cy: number, rx: number, ry: number, rot = 0): boolean {
  let dx = x - cx;
  let dy = y - cy;
  if (rot) {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const ux = dx * c + dy * s;
    const uy = -dx * s + dy * c;
    dx = ux;
    dy = uy;
  }
  return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1;
}

/** Points along a quadratic curve, as a flat list: for building shapes to fill. */
export function quad(x0: number, y0: number, qx: number, qy: number, x1: number, y1: number, steps = 8): number[] {
  const out: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push(u * u * x0 + 2 * u * t * qx + t * t * x1, u * u * y0 + 2 * u * t * qy + t * t * y1);
  }
  return out;
}
