/**
 * The pixel grid, and the rules that keep everything on it.
 *
 * The game thinks in a 960×540 logical view (VIEW_W × VIEW_H), and nothing
 * about the rules of play changes with how it is drawn. The art, though, is
 * drawn into a 480×270 buffer - one art pixel is two logical pixels - and
 * that buffer is shown at a whole-number scale, pixel for pixel, whatever the
 * screen. Before this, the same frame came out at 960·devicePixelRatio and
 * was stretched by whatever fraction fitted the window: pixels one and two
 * screen pixels wide side by side, and a finer drawing of every sprite on a
 * HiDPI screen than on any other.
 *
 * Three things keep the art honest once it is on the grid:
 *   - a fixed palette every frame is mapped to (PaletteMapper), with an
 *     ordered dither where a gradient or a soft edge falls between two of its
 *     colours, instead of the tens of thousands of colours a canvas makes;
 *   - a one-pixel outline round everything the player has to read - the hero,
 *     what he fights, what is thrown and what he picks up (outlineLayer) -
 *     and never round the terrain, which is what separates the play from the
 *     scenery;
 *   - helpers that place and draw on whole art pixels (snap, artRect,
 *     PixelSprite), for art drawn for the grid rather than squeezed onto it.
 */

/** Logical pixels per art pixel. */
export const ART = 2;
/** The art buffer: 480×270 art pixels. */
export const ART_W = 480;
export const ART_H = 270;

/** A logical coordinate moved onto the art grid. */
export function snap(v: number): number {
  return Math.round(v / ART) * ART;
}

/**
 * A canvas for a layer, kept in main memory like every canvas of the game.
 *
 * The frame is read back once a frame to be mapped to the palette, and a
 * canvas the browser keeps on the graphics card makes that read - and every
 * drawImage between a card canvas and a memory one - a round trip that stalls
 * until the card has caught up: forty milliseconds at a time in a tight loop.
 * At 480×270 the processor draws a frame in a few milliseconds by itself.
 */
export function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

/** A filled rectangle on whole art pixels, in logical coordinates. */
export function artRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  const x0 = snap(x);
  const y0 = snap(y);
  ctx.fillStyle = color;
  ctx.fillRect(x0, y0, Math.max(ART, snap(x + w) - x0), Math.max(ART, snap(y + h) - y0));
}

/* ------------------------------------------------------------- sprites */

/**
 * A sprite drawn for the grid: rows of characters, one per art pixel, each
 * standing for a colour of its key ('.' or ' ' is empty). Turned into a canvas
 * once and drawn from then on with drawImage - still no sprite sheet, the art
 * lives in the code, but every pixel of it is placed by hand.
 */
export class PixelSprite {
  readonly canvas: HTMLCanvasElement;
  /** Width and height in art pixels. */
  readonly w: number;
  readonly h: number;
  private flipped: HTMLCanvasElement | null = null;

  constructor(rows: readonly string[], key: Readonly<Record<string, string>>) {
    this.h = rows.length;
    this.w = Math.max(...rows.map((r) => r.length));
    const { canvas, ctx } = makeCanvas(this.w, this.h);
    for (let y = 0; y < rows.length; y++) {
      const row = rows[y];
      for (let x = 0; x < row.length; x++) {
        const c = row[x];
        if (c === '.' || c === ' ') continue;
        const color = key[c];
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    this.canvas = canvas;
  }

  /** The same sprite mirrored, made once on first use. */
  private mirror(): HTMLCanvasElement {
    if (!this.flipped) {
      const { canvas, ctx } = makeCanvas(this.w, this.h);
      ctx.translate(this.w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(this.canvas, 0, 0);
      this.flipped = canvas;
    }
    return this.flipped;
  }

  /**
   * Draws it with its top-left at logical (x, y), snapped to the grid; facing
   * -1 mirrors it. One art pixel is ART logical pixels.
   */
  draw(ctx: CanvasRenderingContext2D, x: number, y: number, facing: 1 | -1 = 1): void {
    ctx.drawImage(facing < 0 ? this.mirror() : this.canvas, snap(x), snap(y), this.w * ART, this.h * ART);
  }
}

/* ------------------------------------------------------------- palette */

/** 4×4 Bayer matrix, centred on zero, in units of one step. */
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);

/**
 * Maps a frame to a fixed palette. A 15-bit lookup table holds, for every
 * colour a canvas can make (to 5 bits a channel), the nearest colour of the
 * palette by a perceptually weighted distance; the frame is read once, nudged
 * by an ordered dither so that what falls between two palette colours comes
 * out as a pattern of both, and written back.
 */
export class PaletteMapper {
  private readonly lut = new Uint32Array(32768);
  readonly colors: readonly number[];

  constructor(colors: readonly number[]) {
    this.colors = colors;
    const pr = colors.map((c) => (c >> 16) & 255);
    const pg = colors.map((c) => (c >> 8) & 255);
    const pb = colors.map((c) => c & 255);
    for (let i = 0; i < 32768; i++) {
      const r = ((i >> 10) & 31) * 8 + 4;
      const g = ((i >> 5) & 31) * 8 + 4;
      const b = (i & 31) * 8 + 4;
      let best = 0;
      let bestD = Infinity;
      for (let k = 0; k < colors.length; k++) {
        // "Redmean": a cheap distance that weighs the channels the way the eye
        // does, more so in the reds.
        const rm = (r + pr[k]) / 2;
        const dr = r - pr[k];
        const dg = g - pg[k];
        const db = b - pb[k];
        const d = (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      }
      // ImageData is RGBA in memory: as a little-endian Uint32 that is ABGR.
      this.lut[i] = (255 << 24) | (pb[best] << 16) | (pg[best] << 8) | pr[best];
    }
  }

  /**
   * The table as bytes, red, green, blue and alpha per entry: a 32×32×32
   * texture with blue running fastest, then green, then red.
   */
  lutBytes(): Uint8Array {
    return new Uint8Array(this.lut.buffer);
  }

  /**
   * Maps the pixels in place. `dither` is the spread of the pattern in levels
   * of 0-255; (ox, oy) is where the image sits in the world, in art pixels,
   * so that the pattern stays put on the world as the camera moves instead of
   * crawling over it like a pane of frosted glass.
   *
   * Written for speed, since it runs over every pixel of every frame: the
   * dither of a row is four whole numbers, worked out once per row, and the
   * clamping and the drop to five bits a channel are one table lookup.
   */
  map(image: ImageData, dither: number, ox = 0, oy = 0): void {
    const w = image.width;
    const h = image.height;
    const px = new Uint32Array(image.data.buffer, image.data.byteOffset, w * h);
    const lut = this.lut;
    const hi = FIVE_BITS;
    const d = this.rowDither;
    for (let y = 0; y < h; y++) {
      const row = ((y + oy) & 3) * 4;
      for (let k = 0; k < 4; k++) d[k] = Math.round(BAYER4[row + ((k + ox) & 3)] * dither) + SLACK;
      const d0 = d[0];
      const d1 = d[1];
      const d2 = d[2];
      const d3 = d[3];
      let i = y * w;
      const end = i + w - (w & 3);
      for (; i < end; i += 4) {
        let c = px[i];
        px[i] = lut[(hi[(c & 255) + d0] << 10) | (hi[((c >> 8) & 255) + d0] << 5) | hi[((c >> 16) & 255) + d0]];
        c = px[i + 1];
        px[i + 1] = lut[(hi[(c & 255) + d1] << 10) | (hi[((c >> 8) & 255) + d1] << 5) | hi[((c >> 16) & 255) + d1]];
        c = px[i + 2];
        px[i + 2] = lut[(hi[(c & 255) + d2] << 10) | (hi[((c >> 8) & 255) + d2] << 5) | hi[((c >> 16) & 255) + d2]];
        c = px[i + 3];
        px[i + 3] = lut[(hi[(c & 255) + d3] << 10) | (hi[((c >> 8) & 255) + d3] << 5) | hi[((c >> 16) & 255) + d3]];
      }
      for (let x = end - y * w; x < w; x++, i++) {
        const c = px[i];
        const dx = d[x & 3];
        px[i] = lut[(hi[(c & 255) + dx] << 10) | (hi[((c >> 8) & 255) + dx] << 5) | hi[((c >> 16) & 255) + dx]];
      }
    }
  }

  private readonly rowDither = new Int32Array(4);
}

/** Room either side of 0-255 for the dither to push a channel into. */
const SLACK = 64;
/** A channel plus its dither (offset by SLACK), clamped to 0-255 and cut to five bits. */
const FIVE_BITS = new Uint8Array(256 + SLACK * 2).map((_, v) => Math.max(0, Math.min(255, v - SLACK)) >> 3);

/* ------------------------------------------------------------- actors */

/** Alpha from which an actor's pixel counts as body rather than glow. */
const SOLID = 160;
/** The 4×4 Bayer thresholds as alpha bytes. */
const BAYER_ALPHA = new Uint8Array([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => Math.round(((v + 0.5) / 16) * 255)));
let actorMask = new Uint8Array(0);

/**
 * The actor layer made pixel art, in one pass over its pixels:
 *   - what is mostly opaque is body: made wholly opaque, and darkened a
 *     breath towards the zone's night (tint by amount, 0..1);
 *   - what is translucent - a glow, a trail, a ghost - becomes a pattern of
 *     opaque pixels, as many as its alpha asks for, picked by the same 4×4
 *     ordered pattern as the palette's dither and fixed to the world the same
 *     way ((ox, oy): where the layer sits in the world, in art pixels);
 *   - every pixel that is not body but touches body side by side takes the
 *     outline colour.
 * No pixel is left half transparent, so no edge is soft and nothing smears
 * across two pixels; and only bodies are outlined, never their glows.
 */
export function settleActors(
  image: ImageData,
  outline: number,
  tint: readonly [number, number, number],
  amount: number,
  ox = 0,
  oy = 0,
): void {
  const w = image.width;
  const h = image.height;
  const n = w * h;
  const px = new Uint32Array(image.data.buffer, image.data.byteOffset, n);
  if (actorMask.length < n) actorMask = new Uint8Array(n);
  const mask = actorMask;
  const k = Math.round(Math.max(0, Math.min(1, amount)) * 256);
  const keep = 256 - k;
  const tr = tint[0] * k;
  const tg = tint[1] * k;
  const tb = tint[2] * k;
  for (let y = 0; y < h; y++) {
    const row = ((y + oy) & 3) * 4;
    let i = y * w;
    for (let x = 0; x < w; x++, i++) {
      const c = px[i];
      const a = c >>> 24;
      if (a === 0) {
        mask[i] = 0;
        continue;
      }
      if (a >= SOLID) mask[i] = 2;
      else if (a > BAYER_ALPHA[row + ((x + ox) & 3)]) mask[i] = 1;
      else {
        px[i] = 0;
        mask[i] = 0;
        continue;
      }
      const r = ((c & 255) * keep + tr) >> 8;
      const g = (((c >> 8) & 255) * keep + tg) >> 8;
      const b = (((c >> 16) & 255) * keep + tb) >> 8;
      px[i] = 0xff000000 | (b << 16) | (g << 8) | r;
    }
  }
  for (let y = 0; y < h; y++) {
    let i = y * w;
    for (let x = 0; x < w; x++, i++) {
      if (mask[i] === 2) continue;
      if (
        (x > 0 && mask[i - 1] === 2) ||
        (x < w - 1 && mask[i + 1] === 2) ||
        (y > 0 && mask[i - w] === 2) ||
        (y < h - 1 && mask[i + w] === 2)
      ) {
        px[i] = outline;
      }
    }
  }
}

/** "#rrggbb" as the ABGR word ImageData holds, fully opaque. */
export function abgrOf(hex: string): number {
  const v = parseInt(hex.slice(1), 16);
  return ((255 << 24) | ((v & 255) << 16) | (v & 0xff00) | ((v >> 16) & 255)) >>> 0;
}
