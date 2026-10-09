import { ART } from './pixel';

/**
 * A pen for the art grid: the shapes the vector code used to draw with arcs,
 * ellipses, curves and rotations, drawn instead as runs of whole art pixels.
 *
 * Everything here takes logical coordinates, like the rest of the game, and
 * fills whole art pixels (ART logical pixels square) by scanline: a shape is a
 * stack of horizontal runs, one fillRect each, and a pixel is in the shape when
 * its centre is. Nothing is anti-aliased and nothing falls between pixels, so
 * a disc is the disc a pixel artist would place, and two shapes that touch
 * share an edge instead of a grey seam.
 *
 * The grid is the canvas's own: draw under a transform that maps logical
 * pixels to art pixels with an even translation - the camera's, plus an
 * entity's position put through snap() - and every run lands on whole pixels.
 * A mirrored transform (scale(-1, 1) about an even x) is fine too.
 */

/** A logical coordinate as a whole art pixel (rounded down). */
function cell(v: number): number {
  return Math.floor(v / ART);
}

/** One art pixel, the one under (x, y). */
export function dot(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(cell(x) * ART, cell(y) * ART, ART, ART);
}

/** The art pixels whose centres fall inside the rectangle. */
export function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  const x0 = Math.round(x / ART);
  const y0 = Math.round(y / ART);
  const x1 = Math.round((x + w) / ART);
  const y1 = Math.round((y + h) / ART);
  if (x1 <= x0 || y1 <= y0) return;
  ctx.fillStyle = color;
  ctx.fillRect(x0 * ART, y0 * ART, (x1 - x0) * ART, (y1 - y0) * ART);
}

/**
 * A line from (x0, y0) to (x1, y1), Bresenham's: one pixel per step along
 * the longer axis, so a 2:1 diagonal comes out as the clean stair a pixel
 * artist draws. `thick` is the width of the brush in art pixels.
 */
export function line(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  thick = 1,
): void {
  let ax = cell(x0);
  let ay = cell(y0);
  const bx = cell(x1);
  const by = cell(y1);
  const dx = Math.abs(bx - ax);
  const dy = -Math.abs(by - ay);
  const sx = ax < bx ? 1 : -1;
  const sy = ay < by ? 1 : -1;
  const t = Math.max(1, Math.round(thick));
  const o = Math.floor((t - 1) / 2);
  let err = dx + dy;
  ctx.fillStyle = color;
  for (let guard = 0; guard < 4096; guard++) {
    ctx.fillRect((ax - o) * ART, (ay - o) * ART, t * ART, t * ART);
    if (ax === bx && ay === by) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      ax += sx;
    }
    if (e2 <= dx) {
      err += dx;
      ay += sy;
    }
  }
}

/**
 * A filled ellipse round (cx, cy) with radii rx and ry (logical pixels). The
 * runs are chosen so the shape is symmetric about its centre pixel, which is
 * what keeps a small disc from looking lopsided.
 */
export function oval(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, color: string): void {
  const rxa = rx / ART;
  const rya = ry / ART;
  if (rxa <= 0 || rya <= 0) return;
  const ccx = cx / ART;
  const ccy = cy / ART;
  const top = Math.ceil(ccy - rya - 0.5);
  const bottom = Math.floor(ccy + rya - 0.5);
  ctx.fillStyle = color;
  for (let row = top; row <= bottom; row++) {
    const v = (row + 0.5 - ccy) / rya;
    const k = 1 - v * v;
    if (k < 0) continue;
    const half = rxa * Math.sqrt(k);
    const left = Math.ceil(ccx - half - 0.5);
    const right = Math.floor(ccx + half - 0.5);
    if (right < left) continue;
    ctx.fillRect(left * ART, row * ART, (right - left + 1) * ART, ART);
  }
}

/** A filled disc of radius r (logical pixels). */
export function disc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
  oval(ctx, cx, cy, r, r, color);
}

/**
 * A ring: the pixels whose centres lie between r - thick and r from the
 * centre (thick in art pixels), drawn as the runs between two circles.
 */
export function ring(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string, thick = 1): void {
  sector(ctx, cx, cy, Math.max(0, r - thick * ART), r, 0, Math.PI * 2, color);
}

/**
 * A polygon, given as a flat list of logical coordinates [x0, y0, x1, y1, …],
 * filled by the even-odd rule. This is what a rotated part becomes: rotate its
 * corners, and fill the outline on the grid - a clean shape, never a
 * resampled image.
 */
export function poly(ctx: CanvasRenderingContext2D, pts: readonly number[], color: string): void {
  const n = pts.length >> 1;
  if (n < 3) return;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 1; i < pts.length; i += 2) {
    if (pts[i] < minY) minY = pts[i];
    if (pts[i] > maxY) maxY = pts[i];
  }
  const top = Math.ceil(minY / ART - 0.5);
  const bottom = Math.floor(maxY / ART - 0.5);
  const xs: number[] = [];
  ctx.fillStyle = color;
  for (let row = top; row <= bottom; row++) {
    const y = (row + 0.5) * ART;
    xs.length = 0;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const yi = pts[i * 2 + 1];
      const yj = pts[j * 2 + 1];
      if (yi > y !== yj > y) {
        const xi = pts[i * 2];
        const xj = pts[j * 2];
        xs.push(xi + ((y - yi) / (yj - yi)) * (xj - xi));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const left = Math.ceil(xs[k] / ART - 0.5);
      const right = Math.floor(xs[k + 1] / ART - 0.5);
      if (right >= left) ctx.fillRect(left * ART, row * ART, (right - left + 1) * ART, ART);
    }
  }
}

/** The corners of a w × h box centred on (cx, cy), turned by `angle`: for poly(). */
export function box(cx: number, cy: number, w: number, h: number, angle = 0): number[] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const hw = w / 2;
  const hh = h / 2;
  const out: number[] = [];
  for (const [x, y] of [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ]) {
    out.push(cx + x * c - y * s, cy + x * s + y * c);
  }
  return out;
}

/**
 * A curve from (x0, y0) through the pull of (qx, qy) to (x1, y1), as the
 * points of a polyline - quadraticCurveTo's curve, for poly() or for stepping
 * a line() along.
 */
export function curve(x0: number, y0: number, qx: number, qy: number, x1: number, y1: number, steps = 8): number[] {
  const out: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push(u * u * x0 + 2 * u * t * qx + t * t * x1, u * u * y0 + 2 * u * t * qy + t * t * y1);
  }
  return out;
}

/** A polyline drawn with line() between its points. */
export function path(ctx: CanvasRenderingContext2D, pts: readonly number[], color: string, thick = 1): void {
  for (let i = 0; i + 3 < pts.length; i += 2) line(ctx, pts[i], pts[i + 1], pts[i + 2], pts[i + 3], color, thick);
}

/**
 * The pixels of an annulus between radii r0 and r1 (logical) and between the
 * angles a0 and a1 (radians, a1 > a0, measured as atan2 does: clockwise on
 * screen from the right): a crescent, a slash, a gauge, a ring when the angles
 * go all the way round. Each row is tested pixel by pixel and filled as runs.
 */
export function sector(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r0: number,
  r1: number,
  a0: number,
  a1: number,
  color: string,
): void {
  const ccx = cx / ART;
  const ccy = cy / ART;
  const ri = r0 / ART;
  const ro = r1 / ART;
  if (ro <= 0 || ro <= ri) return;
  const full = a1 - a0 >= Math.PI * 2 - 1e-6;
  const TAU = Math.PI * 2;
  const start = ((a0 % TAU) + TAU) % TAU;
  const span = a1 - a0;
  const ri2 = ri * ri;
  const ro2 = ro * ro;
  const top = Math.floor(ccy - ro);
  const bottom = Math.ceil(ccy + ro);
  const left = Math.floor(ccx - ro);
  const right = Math.ceil(ccx + ro);
  ctx.fillStyle = color;
  for (let row = top; row <= bottom; row++) {
    const dy = row + 0.5 - ccy;
    let run = -1;
    for (let col = left; col <= right + 1; col++) {
      let inside = false;
      if (col <= right) {
        const dx = col + 0.5 - ccx;
        const d2 = dx * dx + dy * dy;
        if (d2 <= ro2 && d2 >= ri2) {
          if (full) inside = true;
          else {
            const a = (((Math.atan2(dy, dx) - start) % TAU) + TAU) % TAU;
            inside = a <= span;
          }
        }
      }
      if (inside && run < 0) run = col;
      else if (!inside && run >= 0) {
        ctx.fillRect(run * ART, row * ART, (col - run) * ART, ART);
        run = -1;
      }
    }
  }
}

/** 4×4 Bayer thresholds, 0..1. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

/**
 * The share `level` (0..1) of the art pixels of a rectangle, picked by a 4×4
 * ordered pattern fixed to the art grid: translucency the way a palette of a
 * few colours draws it. 0.5 is a checkerboard.
 */
export function dither(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  level: number,
): void {
  if (level <= 0) return;
  if (level >= 1) {
    rect(ctx, x, y, w, h, color);
    return;
  }
  const x0 = Math.round(x / ART);
  const y0 = Math.round(y / ART);
  const x1 = Math.round((x + w) / ART);
  const y1 = Math.round((y + h) / ART);
  ctx.fillStyle = color;
  for (let row = y0; row < y1; row++) {
    const b = (row & 3) * 4;
    for (let col = x0; col < x1; col++) {
      if (BAYER[b + (col & 3)] < level) ctx.fillRect(col * ART, row * ART, ART, ART);
    }
  }
}
