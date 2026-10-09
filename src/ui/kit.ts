import { ART, ART_H, ART_W, makeCanvas } from '../render/pixel';
import { ART_HEX, ART_PALETTE } from '../render/palette';
import { drawText, measureText, wrapText, type TextStyle } from './pixelfont';

/**
 * The pieces every screen is built from: the UI's colours, its frames, its
 * see-through fills, and a way to put a cached canvas down on the art grid.
 *
 * Everything here works in art pixels - the 480×270 grid the HUD is drawn
 * onto - and is turned into logical pixels (×ART) only at the moment it is
 * drawn. A frame that is 3 pixels thick is 3 pixels thick, and nothing in
 * the HUD can fall between two of them.
 *
 * All the colours are colours of the palette (render/palette.ts). The frame is
 * mapped to that palette after the HUD is drawn, and a colour that is not in
 * it comes out as a dither: right for a fog, wrong for a letter.
 */

/** The UI's colours, by what they are for; every one of them is in the palette. */
export const UI = {
  /** The line round everything: the same violet black the actors are outlined in, once mapped. */
  ink: '#0e071b',
  /** Inside a frame. */
  night: '#1a1932',
  dusk: '#2a2f4e',
  steel: '#424c6e',
  slate: '#657392',
  mist: '#92a1b9',
  frost: '#c7cfdd',
  white: '#ffffff',
  cream: '#f9e6cf',
  /** Keys, the score, what is worth something. */
  gold: '#ffc825',
  goldLight: '#ffeb57',
  goldDark: '#ffa214',
  amber: '#ed7614',
  /** What a boss or the dialogue says: the cold light of the game's magic. */
  cyan: '#94fdff',
  /** Danger, loss, a boss's life. */
  rose: '#ea323c',
  roseLight: '#f5555d',
  roseDark: '#c42430',
  blood: '#891e2b',
  wine: '#571c27',
  /** Ready to go. */
  green: '#99e65f',
} as const;

/* ------------------------------------------------------------- palette */

const nearest = new Map<string, string>();

/**
 * The palette colour closest to a CSS colour ("#rrggbb", "#rgb" or
 * "rgb(a)(...)"), by the same weighted distance the frame's mapping uses.
 *
 * The game's data carries its colours as it always did - a relic is
 * '#ff6b86', a skill '#8fe08a' - and the HUD shows them as the palette colour
 * they come out as anyway, flat, instead of as a checkerboard of the two
 * colours either side.
 */
export function paletteColor(css: string): string {
  const hit = nearest.get(css);
  if (hit) return hit;
  const [r, g, b] = parseColor(css);
  let best = 0;
  let bestD = Infinity;
  for (let k = 0; k < ART_PALETTE.length; k++) {
    const c = ART_PALETTE[k];
    const pr = (c >> 16) & 255;
    const pg = (c >> 8) & 255;
    const pb = c & 255;
    const rm = (r + pr) / 2;
    const d = (2 + rm / 256) * (r - pr) ** 2 + 4 * (g - pg) ** 2 + (2 + (255 - rm) / 256) * (b - pb) ** 2;
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  const hex = ART_HEX[best];
  nearest.set(css, hex);
  return hex;
}

function parseColor(css: string): [number, number, number] {
  if (css.startsWith('#')) {
    const h = css.length === 4 ? css.replace(/#(.)(.)(.)/, '#$1$1$2$2$3$3') : css;
    const v = parseInt(h.slice(1, 7), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  const m = css.match(/[\d.]+/g);
  if (!m || m.length < 3) return [255, 255, 255];
  return [Number(m[0]), Number(m[1]), Number(m[2])];
}

/* ------------------------------------------------------------- drawing */

/** Draws a canvas made at art resolution with its top-left on art pixel (ax, ay). */
export function blit(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, ax: number, ay: number): void {
  ctx.drawImage(canvas, Math.round(ax) * ART, Math.round(ay) * ART, canvas.width * ART, canvas.height * ART);
}

/**
 * A line of text with the top of its line box at art pixel (ax, ay); x is
 * its left edge, centre or right edge as the style's `align` says. Returns
 * its width in art pixels.
 */
export function text(ctx: CanvasRenderingContext2D, s: string, ax: number, ay: number, style: TextStyle = {}): number {
  return drawText(ctx, s, Math.round(ax) * ART, Math.round(ay) * ART, style) / ART;
}

/** How wide a line of text is set, in art pixels. */
export function textWidth(s: string, style: TextStyle = {}): number {
  return measureText(s, style) / ART;
}

/** The text broken into lines no wider than aw art pixels. */
export function wrap(s: string, aw: number, style: TextStyle = {}): readonly string[] {
  return wrapText(s, aw * ART, style);
}

/** A filled rectangle in art pixels. */
export function box(ctx: CanvasRenderingContext2D, ax: number, ay: number, aw: number, ah: number, color: string): void {
  if (aw <= 0 || ah <= 0) return;
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(ax) * ART, Math.round(ay) * ART, Math.round(aw) * ART, Math.round(ah) * ART);
}

/**
 * A canvas at art resolution to draw a cached piece of UI into, with the
 * same logical-pixel transform as the art buffer - so the text and sprite
 * helpers, which think in logical pixels, draw into it unchanged.
 */
export function artCanvas(aw: number, ah: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const made = makeCanvas(Math.max(1, Math.round(aw)), Math.max(1, Math.round(ah)));
  made.ctx.setTransform(1 / ART, 0, 0, 1 / ART, 0, 0);
  made.ctx.imageSmoothingEnabled = false;
  return made;
}

/* ------------------------------------------------------------- frames */

export type FrameStyle = 'panel' | 'plate' | 'dialog' | 'tab' | 'boss';

interface FrameSpec {
  /**
   * The border, one colour a pixel from the outside in: `lit` along the top
   * and the left, where the light comes from, `shade` along the bottom and
   * the right.
   */
  lit: readonly string[];
  shade: readonly string[];
  /** The inside, or null to leave it open. */
  fill: string | null;
  /** Pixels cut off each corner on the diagonal: 1 takes the corner pixel, 2 rounds it. */
  cut: number;
}

const FRAMES: Record<FrameStyle, FrameSpec> = {
  // Lists, the title's controls, the victory sheet: a bevelled steel rim.
  panel: { lit: [UI.ink, UI.mist, UI.steel], shade: [UI.ink, UI.steel, UI.dusk], fill: UI.night, cut: 1 },
  // Small pieces of the HUD, where a heavy rim would weigh more than what it holds.
  plate: { lit: [UI.ink, UI.slate], shade: [UI.ink, UI.dusk], fill: UI.night, cut: 1 },
  // What is said: a heavier rim with a dark line inside it, the frame of a page.
  dialog: { lit: [UI.ink, UI.frost, UI.slate, UI.ink], shade: [UI.ink, UI.slate, UI.steel, UI.ink], fill: UI.night, cut: 2 },
  // The speaker's name plate, set into the top of the dialogue frame.
  tab: { lit: [UI.ink, UI.frost, UI.slate], shade: [UI.ink, UI.slate, UI.steel], fill: UI.dusk, cut: 1 },
  // Behind a boss's bar: steel gone the colour of old blood.
  boss: { lit: [UI.ink, '#8a4836', UI.wine], shade: [UI.ink, UI.wine, '#1c121c'], fill: '#1c121c', cut: 1 },
};

const frames = new Map<string, HTMLCanvasElement>();

/** A frame of a style at a size (art pixels), built once and kept. */
export function frame(style: FrameStyle, aw: number, ah: number): HTMLCanvasElement {
  const w = Math.max(2, Math.round(aw));
  const h = Math.max(2, Math.round(ah));
  const key = `${style}|${w}|${h}`;
  const hit = frames.get(key);
  if (hit) return hit;
  const spec = FRAMES[style];
  const { canvas, ctx } = makeCanvas(w, h);
  const image = ctx.createImageData(w, h);
  const px = new Uint32Array(image.data.buffer);
  const word = (hex: string) => {
    const v = parseInt(hex.slice(1), 16);
    return ((255 << 24) | ((v & 255) << 16) | (v & 0xff00) | ((v >> 16) & 255)) >>> 0;
  };
  const lit = spec.lit.map(word);
  const shade = spec.shade.map(word);
  const fill = spec.fill ? word(spec.fill) : 0;
  const t = lit.length;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dl = x;
      const dr = w - 1 - x;
      const dt = y;
      const db = h - 1 - y;
      // Each corner is cut on the diagonal, and the rings inside follow the
      // cut: a pixel's ring is how far it is from the nearest edge or from
      // the diagonal, whichever is nearer.
      const diagonal = Math.min(dl + dt, dr + dt, dl + db, dr + db);
      if (diagonal < spec.cut) continue;
      const d = Math.min(dl, dr, dt, db);
      const ring = Math.min(d, diagonal - spec.cut);
      if (ring >= t) {
        if (fill) px[y * w + x] = fill;
        continue;
      }
      // Lit along the top and the left. Where two sides meet, the top wins
      // over the right and the bottom over the left: the light comes from the
      // upper left, so the top-right corner is lit and the bottom-left is not.
      const isLit = dt === d || (db !== d && dl === d);
      px[y * w + x] = isLit ? lit[ring] : shade[ring];
    }
  }
  ctx.putImageData(image, 0, 0);
  frames.set(key, canvas);
  return canvas;
}

/** Draws a frame with its top-left at art pixel (ax, ay). */
export function drawFrame(ctx: CanvasRenderingContext2D, style: FrameStyle, ax: number, ay: number, aw: number, ah: number): void {
  blit(ctx, frame(style, aw, ah), ax, ay);
}

/* ------------------------------------------------------------- see-through */

export type Density = 1 | 2 | 3;

const screens = new Map<string, HTMLCanvasElement>();

/**
 * A screen-sized sheet of one colour with holes in it, in a fixed pattern:
 * density 1 covers one pixel in four, 2 every other one (a checkerboard),
 * 3 three in four.
 *
 * This is how the HUD lays something over the world and lets the world show
 * through: the pixels it covers are a palette colour, the ones it does not
 * are the world's own. A translucent fill would do the same through the
 * palette's dither - but that dither is anchored to the world, so it would
 * crawl under a HUD that stays put while the camera moves.
 */
function screenSheet(color: string, density: Density): HTMLCanvasElement {
  const key = `${color}|${density}`;
  const hit = screens.get(key);
  if (hit) return hit;
  const { canvas, ctx } = makeCanvas(ART_W, ART_H);
  ctx.fillStyle = color;
  for (let y = 0; y < ART_H; y++) {
    for (let x = 0; x < ART_W; x++) {
      const odd = (x & 1) === 1;
      const oddRow = (y & 1) === 1;
      const on = density === 2 ? ((x + y) & 1) === 0 : density === 1 ? !odd && !oddRow : !(odd && oddRow);
      if (on) ctx.fillRect(x, y, 1, 1);
    }
  }
  screens.set(key, canvas);
  return canvas;
}

/** Covers an area (art pixels) with a colour at a density - see screenSheet. */
export function screen(
  ctx: CanvasRenderingContext2D,
  color: string,
  density: Density,
  ax = 0,
  ay = 0,
  aw = ART_W,
  ah = ART_H,
): void {
  const x = Math.max(0, Math.round(ax));
  const y = Math.max(0, Math.round(ay));
  const w = Math.min(ART_W - x, Math.round(aw));
  const h = Math.min(ART_H - y, Math.round(ah));
  if (w <= 0 || h <= 0) return;
  ctx.drawImage(screenSheet(color, density), x, y, w, h, x * ART, y * ART, w * ART, h * ART);
}

/**
 * A colour laid over an area at some strength, left for the palette to turn
 * into its ordered dither: what is under it sinks down the palette's own
 * ramps, the way a sixteen-bit screen dims by shifting its palette. Right for
 * a whole screen that stands still under it (a pause, a dialogue); for
 * anything that sits over a moving world, see screen.
 */
export function veil(ctx: CanvasRenderingContext2D, color: string, alpha: number, ax = 0, ay = 0, aw = ART_W, ah = ART_H): void {
  const before = ctx.globalAlpha;
  ctx.globalAlpha = alpha;
  box(ctx, ax, ay, aw, ah, color);
  ctx.globalAlpha = before;
}

/* ------------------------------------------------------------- timing */

/**
 * On or off, `hz` times a second: a blink with nothing in between. A fade
 * would come out as a dither crawling over the letters.
 */
export function blinkOn(time: number, hz = 2, duty = 0.6): boolean {
  const t = time * hz;
  return t - Math.floor(t) < duty;
}
