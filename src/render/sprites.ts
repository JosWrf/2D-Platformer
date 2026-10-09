import { ART, makeCanvas, snap } from './pixel';

/* ------------------------------------------------------------- colours */

/** A colour taken apart: its channels, and its alpha 0..1. */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const parsed = new Map<string, Rgba>();

/**
 * "#rgb", "#rrggbb", "rgb(…)" or "rgba(…)" as numbers. Callers build their
 * colours as strings, a good many of them with an alpha that changes every
 * frame, so what has been read once is kept (and the store emptied before it
 * grows without end).
 */
export function parseColor(color: string): Rgba {
  let c = parsed.get(color);
  if (c) return c;
  c = { r: 255, g: 255, b: 255, a: 1 };
  const s = color.trim();
  if (s[0] === '#') {
    const hex = s.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      c.r = parseInt(hex[0] + hex[0], 16);
      c.g = parseInt(hex[1] + hex[1], 16);
      c.b = parseInt(hex[2] + hex[2], 16);
      if (hex.length === 4) c.a = parseInt(hex[3] + hex[3], 16) / 255;
    } else if (hex.length >= 6) {
      c.r = parseInt(hex.slice(0, 2), 16);
      c.g = parseInt(hex.slice(2, 4), 16);
      c.b = parseInt(hex.slice(4, 6), 16);
      if (hex.length === 8) c.a = parseInt(hex.slice(6, 8), 16) / 255;
    }
  } else {
    const m = /rgba?\(([^)]*)\)/i.exec(s);
    if (m) {
      const [r = 255, g = 255, b = 255, a = 1] = m[1].split(',').map((v) => Number(v.trim()));
      c.r = r;
      c.g = g;
      c.b = b;
      c.a = a;
    }
  }
  if (parsed.size > 600) parsed.clear();
  parsed.set(color, c);
  return c;
}

/**
 * Where a logical point of the current transform lands, in whole art pixels
 * of the canvas, and how many of the canvas's own pixels one art pixel is.
 * The game's layers are the art buffer's size, so that is one; a tool that
 * draws a monster into a canvas of the logical view's size gets two.
 */
function artPoint(ctx: CanvasRenderingContext2D, x: number, y: number): { ax: number; ay: number; unit: number; m: DOMMatrix } {
  const m = ctx.getTransform();
  const scale = Math.hypot(m.a, m.b) || 1;
  const unit = Math.max(1, Math.round(scale * ART));
  return { ax: (m.a * x + m.c * y + m.e) / unit, ay: (m.b * x + m.d * y + m.f) / unit, unit, m };
}

/* ---------------------------------------------------------------- glow */

/**
 * The bands of a glow, from the middle out: as far as this share of its
 * radius, at this share of its strength. Hard steps, the way a palette of a
 * few colours draws light: no gradient anywhere.
 */
const GLOW_BANDS: readonly (readonly [number, number])[] = [
  [0.42, 1],
  [0.7, 0.55],
  [1, 0.25],
];

/**
 * The most a glow is ever laid on with. On the actor layer whatever ends up
 * at 160 of 255 or more counts as body - made opaque and outlined - and
 * whatever is fainter becomes an ordered pattern of single pixels (see
 * settleActors). Under this, even two glows laid over each other - a pair of
 * eyes, a blade and the hand that holds it - stay a glow.
 */
const GLOW_MAX = 0.38;

const glowStamps = new Map<string, HTMLCanvasElement>();

/**
 * A glow of radius r art pixels in one colour, made once: three concentric
 * discs, each a flat share of the full strength, the outer one a shade darker
 * so that the light falls off in colour as well as in density.
 */
function glowStamp(r: number, c: Rgba): HTMLCanvasElement {
  const id = `${r}|${c.r},${c.g},${c.b}`;
  let stamp = glowStamps.get(id);
  if (stamp) {
    // Most recently used goes to the back of the line.
    glowStamps.delete(id);
    glowStamps.set(id, stamp);
    return stamp;
  }
  const size = r * 2 + 1;
  const { canvas, ctx } = makeCanvas(size, size);
  const fills = GLOW_BANDS.map(([, share], i) => {
    const k = i === GLOW_BANDS.length - 1 ? 0.72 : 1;
    return `rgba(${Math.round(c.r * k)},${Math.round(c.g * k)},${Math.round(c.b * k)},${share})`;
  });
  const limits = GLOW_BANDS.map(([reach]) => (r * reach + 0.4) ** 2);
  for (let y = 0; y < size; y++) {
    const dy = y - r;
    let runStart = 0;
    let runBand = -1;
    for (let x = 0; x <= size; x++) {
      let band = -1;
      if (x < size) {
        const dx = x - r;
        const d2 = dx * dx + dy * dy;
        for (let i = 0; i < limits.length; i++) {
          if (d2 <= limits[i]) {
            band = i;
            break;
          }
        }
      }
      if (band !== runBand) {
        if (runBand >= 0) {
          ctx.fillStyle = fills[runBand];
          ctx.fillRect(runStart, y, x - runStart, 1);
        }
        runBand = band;
        runStart = x;
      }
    }
  }
  glowStamps.set(id, canvas);
  if (glowStamps.size > 96) {
    const oldest = glowStamps.keys().next().value;
    if (oldest !== undefined) glowStamps.delete(oldest);
  }
  return canvas;
}

/**
 * Light round a point: hard concentric bands on whole art pixels, from a
 * stamp made once per size and colour and blitted from then on. It used to
 * be a radial gradient built on every call - about a hundred a frame in a
 * busy fight - which is the one thing a palette of a few colours cannot draw:
 * mapped, a smooth falloff comes out as a haze of dither. On the actor layer
 * the bands come out as an ordered pattern of single pixels, thinning out
 * from the middle; anywhere else the palette's own dither fills them.
 *
 * The strength is the colour's alpha times `alpha`. The radius is rounded to
 * whole art pixels and the centre to the art pixel it falls in, whatever the
 * transform it is called under - a glow is round, so a rotation or a mirror
 * changes nothing about it.
 */
export function glow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  alpha = 1,
): void {
  const c = parseColor(color);
  const strength = Math.min(GLOW_MAX, c.a * alpha);
  const { ax, ay, unit, m } = artPoint(ctx, x, y);
  const r = Math.round((radius * Math.hypot(m.a, m.b)) / unit);
  if (strength > 0.02 && r >= 1) {
    const stamp = glowStamp(r, c);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = strength;
    ctx.drawImage(stamp, (Math.floor(ax) - r) * unit, (Math.floor(ay) - r) * unit, stamp.width * unit, stamp.height * unit);
    ctx.restore();
  }
  // As before: a glow leaves the canvas fully opaque for what comes next.
  ctx.globalAlpha = 1;
}

/* -------------------------------------------------------------- shadow */

/** The contact line's colour: the palette's deepest violet, the colour of the outlines. */
const SHADOW_RGB = '14,7,27';

/**
 * Where something meets the ground: one row of art pixels along the top of
 * the floor under it, densest in the middle and thinning at the ends. It used
 * to be a soft ellipse, which on a floor seen edge-on read as a hole in it.
 * On the actor layer the strip comes out as an ordered pattern (it is never
 * opaque enough to count as body), so it reads as a shadow cast on the rim,
 * not as a slab under the feet.
 *
 * groundY is the floor under the thing - callers have always passed its
 * bottom plus one or two, and the strip goes on the first row of the floor
 * either way. The width is that of the old ellipse; strength 0..1.
 */
export function shadow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  groundY: number,
  width: number,
  strength = 0.35,
): void {
  const core = Math.min(0.58, Math.max(0, strength) * 1.9);
  if (core < 0.08 || width <= 0) return;
  const { ax, ay, unit, m } = artPoint(ctx, cx, groundY);
  const half = Math.max(1, Math.round((width * Math.hypot(m.a, m.b)) / unit / 2));
  const col = Math.floor(ax);
  const row = Math.floor(ay - 0.25);
  const inner = Math.max(0, Math.round(half * 0.6));
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = `rgba(${SHADOW_RGB},${core.toFixed(3)})`;
  ctx.fillRect((col - inner) * unit, row * unit, (inner * 2 + 1) * unit, unit);
  if (half > inner) {
    ctx.fillStyle = `rgba(${SHADOW_RGB},${(core * 0.5).toFixed(3)})`;
    ctx.fillRect((col - half) * unit, row * unit, (half - inner) * unit, unit);
    ctx.fillRect((col + inner + 1) * unit, row * unit, (half - inner) * unit, unit);
  }
  ctx.restore();
}

/* -------------------------------------------------------------- slashes */

const TAU = Math.PI * 2;

/** An angle of the current transform's space as an angle on the canvas. */
function canvasAngle(m: DOMMatrix, a: number): number {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return Math.atan2(m.b * c + m.d * s, m.a * c + m.c * s);
}

/**
 * One layer of a swept band: the art pixels at distance d from the centre and
 * at the share t (0 where the sweep began, 1 where it is now) of its arc that
 * `inside(d, t)` says belong to it.
 */
interface SweepLayer {
  fill: string;
  inside: (d: number, t: number) => boolean;
}

/**
 * Rasterises a sweep on whole art pixels: for every pixel of the ring between
 * rMin and rMax (art pixels) whose angle lies on the arc from a0 to a1 (the
 * transform's angles), each layer decides by distance and position along the
 * arc whether it covers it. Runs of a layer go down as single fillRects, in
 * the canvas's own pixels, under no transform. Only the ring is visited, never
 * the square round it.
 */
function sweep(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  a0: number,
  a1: number,
  rMin: number,
  rMax: number,
  layers: readonly SweepLayer[],
): void {
  const span = Math.min(TAU, a1 - a0);
  if (span <= 0 || rMax <= 0) return;
  const { ax, ay, unit, m } = artPoint(ctx, cx, cy);
  const k = Math.hypot(m.a, m.b) / unit;
  const r0 = Math.max(0, rMin * k);
  const r1 = rMax * k;
  // A mirrored transform sweeps the other way round on the canvas.
  const mirrored = m.a * m.d - m.b * m.c < 0;
  const start = canvasAngle(m, a0);
  const runs: number[][] = layers.map(() => []);
  const ccx = ax;
  const ccy = ay;
  const top = Math.floor(ccy - r1);
  const bottom = Math.ceil(ccy + r1);
  for (let row = top; row <= bottom; row++) {
    const dy = row + 0.5 - ccy;
    if (Math.abs(dy) > r1) continue;
    const reach = Math.sqrt(r1 * r1 - dy * dy);
    const left = Math.floor(ccx - reach);
    const right = Math.ceil(ccx + reach);
    const open: number[] = layers.map(() => -1);
    for (let col = left; col <= right + 1; col++) {
      const dx = col + 0.5 - ccx;
      const d = Math.hypot(dx, dy);
      let t = -1;
      if (col <= right && d <= r1 && d >= r0) {
        let off = Math.atan2(dy, dx) - start;
        if (mirrored) off = -off;
        off = ((off % TAU) + TAU) % TAU;
        if (off <= span) t = off / span;
      }
      for (let i = 0; i < layers.length; i++) {
        const on = t >= 0 && layers[i].inside(d / k, t);
        if (on && open[i] < 0) open[i] = col;
        else if (!on && open[i] >= 0) {
          runs[i].push(open[i], row, col - open[i]);
          open[i] = -1;
        }
      }
    }
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  for (let i = 0; i < layers.length; i++) {
    const list = runs[i];
    if (list.length === 0) continue;
    ctx.fillStyle = layers[i].fill;
    for (let j = 0; j < list.length; j += 3) ctx.fillRect(list[j] * unit, list[j + 1] * unit, list[j + 2] * unit, unit);
  }
  ctx.restore();
}

function rgbaString(c: Rgba, alpha: number): string {
  return `rgba(${c.r},${c.g},${c.b},${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
}

/**
 * The trail of a swing: a band of the arc, `thickness` wide, with a white core
 * down its middle - on whole art pixels, hard-edged, its ends cut square. A
 * faded one (alpha well under one) comes out on the actor layer as a thinning
 * pattern of pixels rather than as a pale smear.
 */
export function slashArc(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
  thickness: number,
  color: string,
  alpha: number,
): void {
  const c = parseColor(color);
  const a = c.a * alpha;
  if (a <= 0.02) return;
  const half = thickness / 2;
  const core = thickness * 0.2;
  const [from, to] = endAngle >= startAngle ? [startAngle, endAngle] : [endAngle, startAngle];
  sweep(ctx, cx, cy, from, to, radius - half, radius + half, [
    { fill: rgbaString(c, a), inside: (d) => Math.abs(d - radius) <= half && Math.abs(d - radius) > core },
    { fill: rgbaString({ r: 255, g: 255, b: 255, a: 1 }, a * 0.85), inside: (d) => Math.abs(d - radius) <= core },
  ]);
}

/**
 * The swept trail of a blade: a crescent that starts as a thin wisp where the
 * swing began, swells in the middle and runs out into a point at the blade -
 * the old ribbon's shape, now as three hard layers of whole art pixels (an
 * outer edge in the colour, the body, a white core along its leading side)
 * instead of three additive anti-aliased passes.
 */
export function slashCrescent(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
  thickness: number,
  color: string,
  alpha: number,
): void {
  if (alpha <= 0.01 || Math.abs(endAngle - startAngle) < 0.02) return;
  const c = parseColor(color);
  // The sweep runs from where the blade was to where it is, either way round.
  const reversed = endAngle < startAngle;
  const [from, to] = reversed ? [endAngle, startAngle] : [startAngle, endAngle];
  const shape = (t: number, widthScale: number, radiusScale: number): [number, number] => {
    const u = reversed ? 1 - t : t;
    const w = thickness * widthScale * 0.5 * Math.sin(Math.PI * Math.pow(u, 0.68)) ** 0.8;
    return [radius * radiusScale * (0.84 + 0.16 * u), w];
  };
  const within = (d: number, t: number, widthScale: number, radiusScale: number): boolean => {
    const [mid, w] = shape(t, widthScale, radiusScale);
    return w >= 0.5 && Math.abs(d - mid) <= w;
  };
  sweep(ctx, cx, cy, from, to, radius * 0.84 - thickness, radius * 1.01 + thickness, [
    { fill: rgbaString(c, c.a * alpha * 0.4), inside: (d, t) => within(d, t, 1.5, 1) && !within(d, t, 1, 1) },
    { fill: rgbaString(c, c.a * alpha * 0.85), inside: (d, t) => within(d, t, 1, 1) && !within(d, t, 0.34, 1.01) },
    { fill: rgbaString({ r: 255, g: 255, b: 255, a: 1 }, alpha), inside: (d, t) => within(d, t, 0.34, 1.01) },
  ]);
}

/* ---------------------------------------------------------- round rects */

/**
 * The path of a rectangle with rounded corners, on whole art pixels: the
 * corners are quarter discs stepped pixel by pixel, the way a pixel artist
 * rounds a panel, not curves the canvas would smooth into grey.
 */
export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const x0 = snap(x);
  const y0 = snap(y);
  const x1 = Math.max(x0 + ART, snap(x + w));
  const y1 = Math.max(y0 + ART, snap(y + h));
  const cols = (x1 - x0) / ART;
  const rows = (y1 - y0) / ART;
  const rr = Math.max(0, Math.min(Math.round(r / ART), Math.floor(cols / 2), Math.floor(rows / 2)));
  /** How far row i (from the top) is pulled in at each end. */
  const inset = (i: number): number => {
    const k = i < rr ? i : rows - 1 - i < rr ? rows - 1 - i : -1;
    if (k < 0) return 0;
    const dy = rr - k - 0.5;
    return rr - Math.floor(Math.sqrt(Math.max(0, rr * rr - dy * dy)) + 0.5);
  };
  ctx.beginPath();
  // Down the right side, stepping wherever the inset changes between two
  // rows, across the bottom, and back up the left the same way.
  let n = inset(0);
  ctx.moveTo(x1 - n * ART, y0);
  for (let i = 1; i < rows; i++) {
    const next = inset(i);
    if (next === n) continue;
    ctx.lineTo(x1 - n * ART, y0 + i * ART);
    ctx.lineTo(x1 - next * ART, y0 + i * ART);
    n = next;
  }
  ctx.lineTo(x1 - n * ART, y1);
  ctx.lineTo(x0 + n * ART, y1);
  for (let i = rows - 1; i >= 1; i--) {
    const next = inset(i - 1);
    if (next === n) continue;
    ctx.lineTo(x0 + n * ART, y0 + i * ART);
    ctx.lineTo(x0 + next * ART, y0 + i * ART);
    n = next;
  }
  ctx.lineTo(x0 + n * ART, y0);
  ctx.closePath();
}

export function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: string,
): void {
  ctx.fillStyle = color;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
}

/* ------------------------------------------------------------ hit flash */

/** Above this a struck sprite is drawn all white; below it the white fades. */
const FLASH_SOLID = 0.8;
const flashLayers = new Map<string, { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }>();

/**
 * A sprite taking a hit: all white for its first two or three frames, then a
 * fading white laid over it, which the palette turns into a dither.
 *
 * The sprite is drawn into a layer of its own - the size of the canvas it is
 * meant for, under the same transform - whitened there with source-atop, so
 * only the sprite and never what is under it, and laid on in one go. The draw
 * is handed the layer's context to draw with. This used to be a canvas filter
 * (brightness and saturate), which the browser runs over a layer the size of
 * the whole canvas for every draw - tens of milliseconds on a canvas kept in
 * main memory - and which turned the struck hero lilac rather than white.
 *
 * `bounds`, if given, is a box (in the transform's coordinates) the drawing
 * stays inside: only that much of the layer is cleared, whitened and laid on,
 * instead of the whole canvas for every struck sprite.
 */
export function withHitFlash(
  ctx: CanvasRenderingContext2D,
  flash: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
  bounds?: { x: number; y: number; w: number; h: number },
): void {
  if (flash <= 0) {
    draw(ctx);
    return;
  }
  const { width, height } = ctx.canvas;
  const key = `${width}x${height}`;
  let layer = flashLayers.get(key);
  if (!layer) {
    layer = makeCanvas(width, height);
    flashLayers.set(key, layer);
  }
  const m = ctx.getTransform();
  let rx = 0;
  let ry = 0;
  let rw = width;
  let rh = height;
  if (bounds) {
    const xa = m.a * bounds.x + m.c * bounds.y + m.e;
    const xb = m.a * (bounds.x + bounds.w) + m.c * (bounds.y + bounds.h) + m.e;
    const ya = m.b * bounds.x + m.d * bounds.y + m.f;
    const yb = m.b * (bounds.x + bounds.w) + m.d * (bounds.y + bounds.h) + m.f;
    rx = Math.max(0, Math.floor(Math.min(xa, xb)));
    ry = Math.max(0, Math.floor(Math.min(ya, yb)));
    rw = Math.min(width, Math.ceil(Math.max(xa, xb))) - rx;
    rh = Math.min(height, Math.ceil(Math.max(ya, yb))) - ry;
    if (rw <= 0 || rh <= 0) return;
  }
  const f = layer.ctx;
  f.setTransform(1, 0, 0, 1, 0, 0);
  f.globalAlpha = 1;
  f.globalCompositeOperation = 'source-over';
  f.clearRect(rx, ry, rw, rh);
  f.setTransform(m);
  draw(f);
  f.setTransform(1, 0, 0, 1, 0, 0);
  f.globalAlpha = flash >= FLASH_SOLID ? 1 : (flash / FLASH_SOLID) * 0.35;
  f.globalCompositeOperation = 'source-atop';
  f.fillStyle = '#ffffff';
  f.fillRect(rx, ry, rw, rh);
  f.globalCompositeOperation = 'source-over';
  f.globalAlpha = 1;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(layer.canvas, rx, ry, rw, rh, rx, ry, rw, rh);
  ctx.restore();
}
