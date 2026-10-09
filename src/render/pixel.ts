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
 *   - a fixed palette every frame is mapped to (render/palettemap.ts), with
 *     an ordered pattern only where a blend falls between two neighbouring
 *     colours of a ramp, instead of the tens of thousands of colours a canvas
 *     makes;
 *   - a one-pixel outline round everything the player has to read - the hero,
 *     what he fights, what is thrown and what he picks up (settleActors) -
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

/* ------------------------------------------------------------- actors */

/** Alpha from which an actor's pixel counts as body rather than glow. */
const SOLID = 160;
/** The 4×4 Bayer thresholds as alpha bytes. */
const BAYER_ALPHA = new Uint8Array([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => Math.round(((v + 0.5) / 16) * 255)));
let actorMask = new Uint8Array(0);

/**
 * The actor layer made pixel art, in one pass over its pixels:
 *   - what is mostly opaque is body: made wholly opaque, its colour left
 *     exactly as drawn, so a sprite drawn in the palette stays in it (a
 *     breath of the zone's night laid over the actors used to push every
 *     flat fill between two palette colours, into a checker);
 *   - what is translucent - a glow, a trail, a ghost - becomes a pattern of
 *     opaque pixels, as many as its alpha asks for, picked by the same 4×4
 *     ordered pattern as the palette's dither and fixed to the world the same
 *     way ((ox, oy): where the layer sits in the world, in art pixels);
 *   - every pixel that is not body but touches body side by side takes the
 *     outline colour.
 * No pixel is left half transparent, so no edge is soft and nothing smears
 * across two pixels; and only bodies are outlined, never their glows.
 */
export function settleActors(image: ImageData, outline: number, ox = 0, oy = 0): void {
  const w = image.width;
  const h = image.height;
  const n = w * h;
  const px = new Uint32Array(image.data.buffer, image.data.byteOffset, n);
  if (actorMask.length < n) actorMask = new Uint8Array(n);
  const mask = actorMask;
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
      px[i] = c | 0xff000000;
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
        mask[i] = 3;
      }
    }
  }
}

/**
 * Which pixels of the last settled actor layer are actors: 0 for none, 1 a
 * glow's pattern, 2 body, 3 outline. The palette pass leaves these out of the
 * light (an actor is drawn in its own colours; a pool of light round a torch
 * should not bleach the hero walking through it).
 */
export function actorCoverage(): Uint8Array {
  return actorMask;
}

/** "#rrggbb" as the ABGR word ImageData holds, fully opaque. */
export function abgrOf(hex: string): number {
  const v = parseInt(hex.slice(1), 16);
  return ((255 << 24) | ((v & 255) << 16) | (v & 0xff00) | ((v >> 16) & 255)) >>> 0;
}
