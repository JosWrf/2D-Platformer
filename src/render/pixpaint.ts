import { Rng } from '../core/math';
import { makeCanvas } from './pixel';

/*
 * A small paint box for art that is generated once rather than drawn every
 * frame: a buffer of art pixels and the shapes the backdrops are built from -
 * ranges, firs, columns, arches, towers, crystals, islands, water. Every shape
 * lands on whole pixels in exactly the colours it is given, so what comes out
 * is clean pixel art however it was worked out: no anti-aliased edge, no
 * colour that is not one of the palette's (or its ink, see backdrops.ts).
 */

/** A colour as the ABGR word ImageData holds; 0 is transparent. */
export type Abgr = number;

/** 4×4 Bayer thresholds, 0-15, the order the palette pass uses too. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Is the pixel at (x, y) inside a 0-16 dither level? 16 is solid, 0 is none. */
export function bayerOn(x: number, y: number, level: number): boolean {
  return BAYER[(y & 3) * 4 + (x & 3)] < level;
}

/** "#rrggbb" as an opaque ABGR word. */
export function abgr(hex: string): Abgr {
  const n = parseInt(hex.slice(1), 16);
  return ((255 << 24) | ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255)) >>> 0;
}

/**
 * A strip being painted, one word per art pixel. Strips tile sideways, so x
 * wraps round: a tree standing on the seam is whole on both ends.
 */
export class Pix {
  /** Painted straight into the image the canvas will be made from: no copy. */
  private readonly image: ImageData;
  readonly data: Uint32Array;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.image = new ImageData(w, h);
    this.data = new Uint32Array(this.image.data.buffer);
  }

  private wrap(x: number): number {
    const w = this.w;
    return x >= 0 && x < w ? x : ((x % w) + w) % w;
  }

  set(x: number, y: number, c: Abgr): void {
    y = Math.round(y);
    if (y < 0 || y >= this.h) return;
    this.data[y * this.w + this.wrap(Math.round(x))] = c;
  }

  get(x: number, y: number): Abgr {
    y = Math.round(y);
    if (y < 0 || y >= this.h) return 0;
    return this.data[y * this.w + this.wrap(Math.round(x))];
  }

  rect(x: number, y: number, w: number, h: number, c: Abgr): void {
    const y0 = Math.max(0, Math.round(y));
    const y1 = Math.min(this.h, Math.round(y + h));
    const x0 = Math.round(x);
    const x1 = Math.min(x0 + this.w, Math.round(x + w));
    if (x1 <= x0) return;
    // A run that crosses the seam is two runs, one at each end.
    const a = this.wrap(x0);
    const len = x1 - x0;
    const first = Math.min(len, this.w - a);
    for (let yy = y0; yy < y1; yy++) {
      const row = yy * this.w;
      this.data.fill(c, row + a, row + a + first);
      if (first < len) this.data.fill(c, row, row + len - first);
    }
  }

  /**
   * An ordered dither of `c` over a rectangle at a level of 0-16. `over`
   * limits it to pixels already painted ('solid') or still empty ('clear').
   */
  dither(x: number, y: number, w: number, h: number, c: Abgr, level: number, over?: 'solid' | 'clear'): void {
    if (level <= 0) return;
    const y0 = Math.max(0, Math.round(y));
    const y1 = Math.min(this.h, Math.round(y + h));
    const x0 = Math.round(x);
    const x1 = Math.min(x0 + this.w, Math.round(x + w));
    const data = this.data;
    for (let yy = y0; yy < y1; yy++) {
      const row = yy * this.w;
      const t = (yy & 3) * 4;
      let wx = this.wrap(x0);
      for (let xx = x0; xx < x1; xx++, wx++) {
        if (wx === this.w) wx = 0;
        if (BAYER[t + (wx & 3)] >= level) continue;
        const i = row + wx;
        if (over === 'solid' && data[i] === 0) continue;
        if (over === 'clear' && data[i] !== 0) continue;
        data[i] = c;
      }
    }
  }

  /** An ordered dither of `c` over a disc, at a level of 0-16. */
  ditherDisc(cx: number, cy: number, r: number, c: Abgr, level: number): void {
    const rr = (r + 0.5) * (r + 0.5);
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (x * x + y * y > rr) continue;
        const px = this.wrap(Math.round(cx + x));
        const py = Math.round(cy + y);
        if (py >= 0 && py < this.h && bayerOn(px, py, level)) this.data[py * this.w + px] = c;
      }
    }
  }

  /** Rows dithered from level `from` to level `to` (0-16), in even steps. */
  fade(y: number, h: number, c: Abgr, from: number, to: number, over?: 'solid' | 'clear'): void {
    for (let r = 0; r < h; r++) {
      const level = Math.round(from + ((to - from) * (r + 0.5)) / h);
      this.dither(0, y + r, this.w, 1, c, level, over);
    }
  }

  /** A line on whole pixels (Bresenham). */
  line(x0: number, y0: number, x1: number, y1: number, c: Abgr): void {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  /** A filled disc; the half-pixel bias rounds it the way a hand would. */
  disc(cx: number, cy: number, r: number, c: Abgr): void {
    const rr = (r + 0.5) * (r + 0.5);
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) if (x * x + y * y <= rr) this.set(cx + x, cy + y, c);
    }
  }

  /** A ring between two radii, optionally only its upper half. */
  ring(cx: number, cy: number, r0: number, r1: number, c: Abgr, upper = false): void {
    const a = (r0 - 0.5) * (r0 - 0.5);
    const b = (r1 + 0.5) * (r1 + 0.5);
    for (let y = -r1; y <= (upper ? 0 : r1); y++) {
      for (let x = -r1; x <= r1; x++) {
        const d = x * x + y * y;
        if (d >= a && d <= b) this.set(cx + x, cy + y, c);
      }
    }
  }

  /** Replaces one colour by another, everywhere or within some rows. */
  swap(from: Abgr, to: Abgr, y0 = 0, y1 = this.h): void {
    for (let i = y0 * this.w; i < Math.min(this.h, y1) * this.w; i++) if (this.data[i] === from) this.data[i] = to;
  }

  canvas(): HTMLCanvasElement {
    const { canvas, ctx } = makeCanvas(this.w, this.h);
    ctx.putImageData(this.image, 0, 0);
    return canvas;
  }
}

/* --------------------------------------------------------------- noise */

function hash(i: number, seed: number): number {
  let h = Math.imul(i, 374761393) ^ Math.imul(seed + 0x9e37, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Value noise that repeats every `width` pixels, with `cells` lattice cells
 * over that width, so a strip made from it tiles without a seam.
 */
export function noise(x: number, width: number, cells: number, seed: number): number {
  const u = (x / width) * cells;
  const i = Math.floor(u);
  const f = u - i;
  const s = f * f * (3 - 2 * f);
  const a = hash(((i % cells) + cells) % cells, seed);
  const b = hash((((i + 1) % cells) + cells) % cells, seed);
  return a + (b - a) * s;
}

/**
 * A skyline: the top row of a range per column, `base` minus up to `amp`.
 * Octaves are [cells, weight]; `crag` folds the noise into sharp peaks.
 */
export function heights(
  width: number,
  base: number,
  amp: number,
  octaves: readonly (readonly [number, number])[],
  seed: number,
  crag = false,
): Int16Array {
  const out = new Int16Array(width);
  let total = 0;
  for (const [, weight] of octaves) total += weight;
  for (let x = 0; x < width; x++) {
    let v = 0;
    octaves.forEach(([cells, weight], k) => {
      let n = noise(x, width, cells, seed + k * 101);
      if (crag) n = 1 - Math.abs(n * 2 - 1);
      v += n * weight;
    });
    out[x] = Math.round(base - (v / total) * amp);
  }
  return out;
}

/* -------------------------------------------------------------- shapes */

/**
 * A range filled down from its skyline. Slopes that rise to the right face
 * the key light in the upper left and take the lit colour along their
 * surface; slopes turned away take a band of shade.
 */
export function ridge(p: Pix, top: Int16Array, body: Abgr, lit?: Abgr, shade?: Abgr): void {
  for (let x = 0; x < p.w; x++) {
    const t = top[x];
    for (let y = Math.max(0, t); y < p.h; y++) p.data[y * p.w + x] = body;
  }
  if (lit === undefined && shade === undefined) return;
  for (let x = 0; x < p.w; x++) {
    const t = top[x];
    const left = top[(x - 1 + p.w) % p.w];
    const right = top[(x + 1) % p.w];
    if (lit !== undefined && (t < left || (t === left && t < right))) {
      for (let y = t; y <= Math.max(t, left - 1); y++) p.set(x, y, lit);
    } else if (shade !== undefined && t < right) {
      for (let y = t; y <= Math.max(t + 1, right); y++) p.set(x, y, shade);
    }
  }
}

/**
 * A fir: a trunk and a crown of tiers, each tier wider at its foot where the
 * branches droop. With a `lit` colour the moon, high on the left, catches the
 * upper left of every tier; the rest stays in the fir's own shade.
 */
export function fir(p: Pix, cx: number, base: number, h: number, body: Abgr, lit?: Abgr, rng?: Rng): void {
  const trunk = Math.max(1, Math.round(h * 0.1));
  const crown = h - trunk;
  const tiers = Math.max(2, Math.round(crown / (h > 60 ? 11 : 8)));
  const maxHalf = Math.max(1, Math.round(h * 0.2));
  const top = base - h;
  for (let r = 0; r < crown; r++) {
    const t = r / crown;
    const inTier = ((r * tiers) / crown) % 1;
    let half = Math.round(maxHalf * (0.12 + 0.88 * t) * (0.5 + 0.5 * inTier));
    if (rng && inTier > 0.75 && rng.next() < 0.4) half += 1;
    const y = top + r;
    for (let x = cx - half; x <= cx + half; x++) p.set(x, y, body);
    if (lit !== undefined && r > 0 && inTier < 0.7) {
      const reach = Math.max(1, Math.round(half * (0.7 - inTier) * 1.1));
      for (let x = cx - half; x < cx - half + reach; x++) p.set(x, y, lit);
    }
  }
  if (lit !== undefined) p.set(cx, top, lit);
  const tw = h > 70 ? 3 : h > 36 ? 2 : 1;
  p.rect(cx - (tw >> 1), base - trunk, tw, trunk + 1, body);
}

/** A bare tree: a trunk forking into branches that thin as they go. */
export function deadTree(p: Pix, x: number, base: number, h: number, body: Abgr, rng: Rng, lit?: Abgr): void {
  const limb = (x0: number, y0: number, angle: number, len: number, width: number, depth: number): void => {
    const x1 = x0 + Math.cos(angle) * len;
    const y1 = y0 - Math.sin(angle) * len;
    for (let w = 0; w < width; w++) p.line(x0 + w, y0, x1 + w, y1, body);
    if (lit !== undefined && width > 1) p.line(x0, y0, x1, y1, lit);
    if (depth <= 0 || len < 3) return;
    const forks = depth > 2 ? 2 : rng.int(1, 2);
    for (let i = 0; i < forks; i++) {
      const turn = (i === 0 ? -1 : 1) * rng.range(0.25, 0.7);
      limb(x1, y1, angle + turn, len * rng.range(0.55, 0.75), Math.max(1, width - 1), depth - 1);
    }
  };
  limb(x, base, Math.PI / 2 + rng.range(-0.08, 0.08), h * 0.42, Math.max(1, Math.round(h / 22)), 4);
}

/** A low mound of brush along a strip's foot, lit along its top. */
export function brush(p: Pix, base: number, amp: number, cells: number, body: Abgr, lit: Abgr | undefined, seed: number): void {
  const top = heights(p.w, base, amp, [[cells, 1], [cells * 4, 0.45], [cells * 12, 0.2]], seed);
  ridge(p, top, body, lit);
}

/**
 * A column: plinth, shaft and capital, lit down its left side with a line of
 * shade down its right. A broken one ends in a ragged stump, capital gone.
 */
export function column(
  p: Pix,
  x: number,
  base: number,
  h: number,
  w: number,
  c: { body: Abgr; lit: Abgr; shade: Abgr },
  broken = 0,
  rng?: Rng,
): void {
  p.rect(x - 2, base - 3, w + 4, 3, c.body);
  p.rect(x - 2, base - 3, 1, 3, c.lit);
  p.rect(x - 1, base - 4, w + 2, 1, c.body);
  const shaftTop = base - h + (broken > 0 ? 0 : 4);
  p.rect(x, shaftTop, w, base - 4 - shaftTop, c.body);
  p.rect(x, shaftTop, 1, base - 4 - shaftTop, c.lit);
  if (w > 4) {
    for (let fx = x + 3; fx < x + w - 1; fx += 3) p.rect(fx, shaftTop + 1, 1, base - 6 - shaftTop, c.shade);
  }
  p.rect(x + w - 1, shaftTop, 1, base - 4 - shaftTop, c.shade);
  if (broken > 0) {
    // Ragged top: a few steps knocked out of the shaft's head.
    for (let i = 0; i < w; i++) {
      const bite = rng ? rng.int(0, broken) : (i * 7) % (broken + 1);
      p.rect(x + i, shaftTop, 1, bite, 0);
    }
    return;
  }
  p.rect(x - 1, base - h + 2, w + 2, 2, c.body);
  p.rect(x - 1, base - h + 2, 1, 2, c.lit);
  p.rect(x - 2, base - h, w + 4, 2, c.body);
  p.rect(x - 2, base - h, w + 4, 1, c.lit);
}

/**
 * A round arch: the ring of its voussoirs above the springing line, standing
 * on two piers down to the base. The opening stays empty.
 */
export function arch(p: Pix, cx: number, spring: number, r: number, thick: number, base: number, body: Abgr, lit?: Abgr): void {
  p.ring(cx, spring, r, r + thick, body, true);
  if (lit !== undefined) p.ring(cx, spring, r + thick, r + thick, lit, true);
  p.rect(cx - r - thick, spring, thick, base - spring, body);
  p.rect(cx + r + 1, spring, thick, base - spring, body);
  if (lit !== undefined) p.rect(cx - r - thick, spring, 1, base - spring, lit);
}

/**
 * A pointed arch: the inside of two circles that cross at its apex, as the
 * Gothic builders drew it. `fill` paints the opening, `frame` its border.
 */
export function pointed(p: Pix, cx: number, spring: number, half: number, base: number, frame: Abgr, thick: number, fill?: Abgr): void {
  const r = Math.round(half * 1.7);
  const off = r - half;
  const inside = (x: number, y: number, rad: number): boolean =>
    (x - (cx + off)) ** 2 + (y - spring) ** 2 <= rad * rad && (x - (cx - off)) ** 2 + (y - spring) ** 2 <= rad * rad;
  const apex = spring - Math.round(Math.sqrt(r * r - off * off)) - thick - 1;
  for (let y = apex; y <= spring; y++) {
    for (let x = cx - half - thick; x <= cx + half + thick; x++) {
      if (inside(x, y, r - 0.5)) {
        if (fill !== undefined) p.set(x, y, fill);
      } else if (inside(x, y, r + thick)) {
        p.set(x, y, frame);
      }
    }
  }
  p.rect(cx - half - thick, spring, thick, base - spring, frame);
  p.rect(cx + half + 1, spring, thick, base - spring, frame);
  if (fill !== undefined) p.rect(cx - half, spring, half * 2 + 1, base - spring, fill);
}

/** Battlements along a wall's top: merlons `m` wide with gaps `g`, `h` tall. */
export function crenels(p: Pix, x0: number, x1: number, top: number, m: number, g: number, h: number, body: Abgr, lit?: Abgr): void {
  for (let x = x0; x < x1; x += m + g) {
    p.rect(x, top - h, Math.min(m, x1 - x), h, body);
    if (lit !== undefined) p.rect(x, top - h, 1, h, lit);
  }
}

/** A banner hanging from a pole, its foot cut in a swallowtail, a sigil on it. */
export function banner(p: Pix, x: number, top: number, w: number, h: number, cloth: Abgr, shade: Abgr, sigil: Abgr, pole: Abgr): void {
  p.rect(x - 1, top - 1, w + 2, 1, pole);
  p.rect(x, top, w, h, cloth);
  p.rect(x + w - 1, top, 1, h, shade);
  const notch = Math.max(2, Math.round(w / 3));
  for (let i = 0; i < notch; i++) {
    const half = Math.round((notch - i) * (w / 2 / notch)) - 1;
    p.rect(x + Math.round(w / 2) - half, top + h - notch + i, Math.max(0, half * 2), 1, 0);
  }
  const cx = x + Math.floor(w / 2);
  const cy = top + Math.round(h * 0.35);
  p.rect(cx - 1, cy - 1, 2, 3, sigil);
  p.set(cx - 2, cy, sigil);
  p.set(cx + 1, cy, sigil);
}

/**
 * A tower: a shaft with a roof (a cone, or battlements), arrow slits and a few
 * windows, some of them lit. Lit windows are returned so they can flicker.
 */
export function tower(
  p: Pix,
  x: number,
  base: number,
  w: number,
  h: number,
  c: { body: Abgr; lit: Abgr; shade: Abgr; roof: Abgr; glass: Abgr; dark: Abgr },
  rng: Rng,
  roof: 'cone' | 'crenel' | 'spire' = 'cone',
  litShare = 0.35,
): [number, number][] {
  const top = base - h;
  p.rect(x, top, w, h, c.body);
  p.rect(x, top, 1, h, c.lit);
  p.rect(x + w - 1, top, 1, h, c.shade);
  if (roof === 'crenel') {
    p.rect(x - 1, top - 2, w + 2, 2, c.body);
    crenels(p, x - 1, x + w + 1, top - 2, 2, 2, 3, c.body, c.lit);
  } else {
    const rh = roof === 'spire' ? Math.round(w * 2.2) : Math.round(w * 1.2);
    for (let r = 0; r < rh; r++) {
      const half = Math.round(((r + 1) / rh) * (w / 2 + 1));
      const y = top - rh + r;
      p.rect(x + Math.floor(w / 2) - half, y, half * 2 + (w & 1), 1, c.roof);
      p.set(x + Math.floor(w / 2) - half, y, c.lit);
    }
    p.set(x + Math.floor(w / 2), top - rh - 1, c.roof);
    p.set(x + Math.floor(w / 2), top - rh - 2, c.roof);
  }
  const lit: [number, number][] = [];
  for (let y = top + 5; y < base - 8; y += rng.int(9, 14)) {
    const wx = x + Math.floor(w / 2) - 1;
    if (w >= 7 && rng.next() < 0.75) {
      const on = rng.next() < litShare;
      p.rect(wx, y, 2, 3, on ? c.glass : c.dark);
      p.set(wx, y - 1, c.dark);
      p.set(wx + 1, y - 1, c.dark);
      if (on) lit.push([wx, y + 1]);
    } else {
      p.rect(x + Math.floor(w / 2), y, 1, 3, c.dark);
    }
  }
  return lit;
}

/** A spike hanging down (or standing up, with a negative length), lit on its left. */
export function spike(p: Pix, x: number, root: number, len: number, w: number, body: Abgr, lit?: Abgr): void {
  const dir = len < 0 ? -1 : 1;
  const n = Math.abs(len);
  for (let r = 0; r < n; r++) {
    const half = Math.max(0, Math.round((w / 2) * Math.pow(1 - r / n, 0.85)));
    const y = root + r * dir;
    p.rect(x - half, y, half * 2 + 1, 1, body);
    if (lit !== undefined && half > 0) p.set(x - half, y, lit);
  }
}

/**
 * A crystal: a six-sided prism with a pointed head, a lit face to the left,
 * a dark one to the right and a bright edge between them.
 */
export function crystal(p: Pix, cx: number, base: number, h: number, w: number, c: { lit: Abgr; body: Abgr; dark: Abgr; edge: Abgr }, lean = 0): void {
  const half = Math.max(1, Math.round(w / 2));
  const head = Math.max(2, Math.round(half * 1.4));
  for (let r = 0; r < h; r++) {
    const y = base - r;
    const tip = h - r < head ? (h - r) / head : 1;
    const hw = Math.max(0, Math.round(half * tip));
    const x = cx + Math.round((lean * r) / h);
    p.rect(x - hw, y, hw, 1, c.lit);
    p.rect(x, y, hw + 1, 1, c.body);
    if (hw > 1) p.set(x + hw, y, c.dark);
    p.set(x, y, c.edge);
  }
}

/**
 * A rock adrift: a flat top with a few tufts on it, the underside a ragged
 * cone with drips of rock hanging lower, lit along its upper left and in its
 * own shade on the right, roots trailing below.
 */
export function island(
  p: Pix,
  cx: number,
  top: number,
  w: number,
  h: number,
  c: { top: Abgr; body: Abgr; lit: Abgr; root: Abgr; shade?: Abgr },
  rng: Rng,
): void {
  const half = Math.max(2, Math.round(w / 2));
  const bottoms: number[] = [];
  let wobble = 0;
  for (let x = -half; x <= half; x++) {
    const t = Math.abs(x) / (half + 1);
    wobble = Math.max(-2, Math.min(2, wobble + rng.int(-1, 1)));
    let depth = Math.max(2, Math.round(h * Math.pow(1 - t, 1.15)) + wobble);
    if (depth > 5 && rng.next() < 0.1) depth += rng.int(2, 5);
    const colour = c.shade !== undefined && x > half * 0.3 ? c.shade : c.body;
    for (let y = 1; y < depth; y++) p.set(cx + x, top + y, colour);
    bottoms.push(top + depth - 1);
    if (x < -half * 0.3) p.set(cx + x, top + 2, c.lit);
  }
  p.rect(cx - half, top, half * 2 + 1, 2, c.top);
  p.rect(cx - half, top, Math.max(1, half), 1, c.lit);
  for (let i = 0; i < Math.round(w / 5); i++) p.set(cx + rng.int(-half + 1, half - 1), top - 1, c.top);
  for (let i = 0; i < Math.round(w / 7); i++) {
    const k = rng.int(2, half * 2 - 2);
    const rx = cx - half + k;
    let ry = bottoms[k];
    const len = rng.int(2, Math.max(3, Math.round(h * 0.6)));
    for (let j = 0; j < len; j++, ry++) p.set(rx + (j % 5 === 4 ? rng.int(-1, 1) : 0), ry, c.root);
  }
}

/**
 * The strip's own reflection in still water below the line `waterY`: each row
 * a mirror of one above, its colours through `tint` (darker, bluer - water
 * keeps some of the light), rows nudged sideways by `ripple`. Empty pixels
 * stay empty, so what lies behind shows through as more water.
 */
export function reflect(p: Pix, waterY: number, tint: (c: Abgr) => Abgr, ripple: (row: number) => number, squash = 1): void {
  const w = p.w;
  const data = p.data;
  // Colours repeat a great deal; each is put through the tint once.
  const memo = new Map<Abgr, Abgr>();
  for (let y = waterY; y < p.h; y++) {
    const src = Math.round(waterY - 1 - (y - waterY) / squash);
    if (src < 0) break;
    const dx = ((ripple(y - waterY) % w) + w) % w;
    const from = src * w;
    const to = y * w;
    for (let x = 0; x < w; x++) {
      let sx = x - dx;
      if (sx < 0) sx += w;
      const c = data[from + sx];
      if (c === 0) {
        data[to + x] = 0;
        continue;
      }
      let t = memo.get(c);
      if (t === undefined) {
        t = tint(c);
        memo.set(c, t);
      }
      data[to + x] = t;
    }
  }
}

/** A spider's web: spokes out from a hub, threads round them in rings. */
export function web(p: Pix, cx: number, cy: number, r: number, spokes: number, rings: number, c: Abgr, start = 0, sweep = Math.PI * 2): void {
  const ends: [number, number][] = [];
  for (let i = 0; i <= spokes; i++) {
    const a = start + (sweep * i) / spokes;
    ends.push([Math.cos(a), Math.sin(a)]);
  }
  const closed = sweep >= Math.PI * 2 - 1e-6;
  for (let i = 0; i < ends.length - (closed ? 1 : 0); i++) p.line(cx, cy, cx + ends[i][0] * r, cy + ends[i][1] * r, c);
  for (let k = 1; k <= rings; k++) {
    const rr = (r * k) / (rings + 0.6);
    for (let i = 0; i < ends.length - 1; i++) {
      p.line(cx + ends[i][0] * rr, cy + ends[i][1] * rr, cx + ends[i + 1][0] * rr, cy + ends[i + 1][1] * rr, c);
    }
  }
}

/** A cog: a rim with teeth, spokes, and the hub. */
export function cog(p: Pix, cx: number, cy: number, r: number, teeth: number, body: Abgr, lit: Abgr, phase = 0): void {
  p.ring(cx, cy, r - 2, r, body);
  for (let i = 0; i < teeth; i++) {
    const a = phase + (i / teeth) * Math.PI * 2;
    for (let d = r; d <= r + 2; d++) {
      const x = cx + Math.cos(a) * d;
      const y = cy + Math.sin(a) * d;
      p.rect(Math.round(x) - 1, Math.round(y) - 1, 2, 2, body);
    }
  }
  const spokes = r > 14 ? 6 : 4;
  for (let i = 0; i < spokes; i++) {
    const a = phase + (i / spokes) * Math.PI * 2 + 0.3;
    p.line(cx, cy, cx + Math.cos(a) * (r - 1), cy + Math.sin(a) * (r - 1), body);
  }
  p.disc(cx, cy, Math.max(1, Math.round(r / 6)), body);
  p.ring(cx, cy, r, r, lit, true);
}

/** Masonry: courses of blocks with mortar between, a few blocks lighter. */
export function masonry(p: Pix, x0: number, y0: number, w: number, h: number, bw: number, bh: number, c: { body: Abgr; mortar: Abgr; lit: Abgr }, rng: Rng): void {
  p.rect(x0, y0, w, h, c.body);
  for (let y = y0; y < y0 + h; y += bh) {
    p.rect(x0, y, w, 1, c.mortar);
    const offset = ((y - y0) / bh) % 2 === 0 ? 0 : Math.round(bw / 2);
    for (let x = x0 + offset; x < x0 + w; x += bw) {
      p.rect(x, y, 1, bh, c.mortar);
      if (rng.next() < 0.18) p.rect(x + 1, y + 1, bw - 1, 1, c.lit);
    }
  }
}
