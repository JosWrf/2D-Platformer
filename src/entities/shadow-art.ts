import { ART_HEX, RAMP } from '../render/palette';
import { sector } from '../render/pen';
import { ART, PixelSprite, makeCanvas, snap } from '../render/pixel';
import type { World } from '../world/context';
import type { Player } from './player';

/**
 * Umbra, drawn: the hero's own frames - whatever its body is doing, swing,
 * roll, charge or guard, in exactly the pixels heroArt places for him -
 * dyed into the shadow's paints.
 *
 * Its body is a Player, so it is drawn by the hero's own drawing code, into a
 * small canvas of its own on the art grid; then every pixel of that canvas
 * goes through a table that gives each colour of the palette its shadow: the
 * blues of hood, tunic and cape go to the plum ramp, steel and breeches to
 * the cold slates a step down, skin and leather into the dark of the hood,
 * gold and any warm accent to wine. The table covers all sixty-four colours,
 * each going to one of the same or a lower lightness - the hero's paints may
 * change, and whatever he is given comes out in the shadow's ramps with his
 * light and dark where they were, so his frames still read as his.
 *
 * Then the shadow's own marks: a one-pixel magenta rim down every edge that
 * faces away from the key light (the rift's glow behind it), and one red eye
 * where his eye is - the eye that flares before it commits.
 */

/** Its paints, for what is drawn here besides his frames. */
export const UMBRA = {
  black: RAMP.slate[0],
  deep: RAMP.slate[1],
  plum0: RAMP.plum[0],
  plum1: RAMP.plum[1],
  plum2: RAMP.plum[2],
  plum3: RAMP.plum[3],
  rim: RAMP.violet[3],
  pale: RAMP.violet[4],
  white: RAMP.grey[7],
  eye: RAMP.rose[6],
} as const;

/*
 * The shadow of every colour of the palette, ramp by ramp. The hero's own
 * paints today: K slate1, C/B/L/Y blue1-4, W slate6, M/m/t slate5-3,
 * G fire3, g rust3, o/S earth4-5, b/H earth3, and the white of his blade's
 * edge, his slashes and his tells.
 */
const SHADOW_OF: Readonly<Record<string, string>> = {
  // Greys: steel, white edges and cores.
  '#131313': RAMP.slate[0],
  '#1b1b1b': RAMP.slate[0],
  '#272727': RAMP.slate[1],
  '#3d3d3d': RAMP.slate[1],
  '#5d5d5d': RAMP.slate[2],
  '#858585': RAMP.slate[3],
  '#b4b4b4': RAMP.violet[4],
  '#ffffff': RAMP.violet[5],
  // Slates: folds, breeches, steel - a step down and as cold as they were.
  '#0e071b': RAMP.slate[0],
  '#1a1932': RAMP.plum[0],
  '#2a2f4e': RAMP.slate[1],
  '#424c6e': RAMP.slate[2],
  '#657392': RAMP.slate[3],
  '#92a1b9': RAMP.slate[4],
  '#c7cfdd': RAMP.violet[4],
  // Earth: skin and leather sink into the dark of the hood.
  '#1c121c': RAMP.slate[0],
  '#391f21': RAMP.slate[1],
  '#5d2c28': RAMP.slate[1],
  '#8a4836': RAMP.slate[1],
  '#bf6f4a': RAMP.plum[0],
  '#e69c69': RAMP.plum[1],
  '#f6ca9f': RAMP.plum[2],
  '#f9e6cf': RAMP.plum[3],
  // Rust and fire: his gold, and any warm accent, as wine.
  '#8e251d': RAMP.rose[0],
  '#c64524': RAMP.rose[0],
  '#e07438': RAMP.rose[1],
  '#edab50': RAMP.rose[1],
  '#ff5000': RAMP.rose[1],
  '#ed7614': RAMP.rose[1],
  '#ffa214': RAMP.rose[2],
  '#ffc825': RAMP.rose[2],
  '#ffeb57': RAMP.rose[3],
  // Greens: nothing of his; plum by lightness, should he ever wear one.
  '#0c2e44': RAMP.slate[1],
  '#134c4c': RAMP.plum[0],
  '#1e6f50': RAMP.plum[0],
  '#33984b': RAMP.plum[1],
  '#5ac54f': RAMP.plum[2],
  '#99e65f': RAMP.plum[2],
  '#d3fc7e': RAMP.plum[3],
  // Blues: hood, tunic and cape, onto the plum ramp at his own lightness.
  '#03193f': RAMP.plum[0],
  '#00396d': RAMP.plum[1],
  '#0069aa': RAMP.plum[2],
  '#0098dc': RAMP.plum[4],
  '#00cdf9': RAMP.violet[4],
  '#0cf1ff': RAMP.violet[4],
  '#94fdff': RAMP.violet[5],
  // Violets and plums: its own colours, a step down.
  '#0c0293': RAMP.slate[1],
  '#3003d9': RAMP.plum[0],
  '#7a09fa': RAMP.plum[1],
  '#db3ffd': RAMP.plum[2],
  '#f389f5': RAMP.plum[3],
  '#fdd2ed': RAMP.violet[4],
  '#3b1443': RAMP.slate[1],
  '#622461': RAMP.plum[0],
  '#93388f': RAMP.plum[1],
  '#ca52c9': RAMP.plum[2],
  '#c85086': RAMP.plum[2],
  // Rose: a warm accent (a scarf, a sash) stays a warm accent, in wine.
  '#571c27': RAMP.slate[1],
  '#891e2b': RAMP.rose[0],
  '#c42430': RAMP.rose[0],
  '#ea323c': RAMP.rose[1],
  '#f5555d': RAMP.rose[1],
  '#f68187': RAMP.rose[2],
  '#ff0040': RAMP.rose[1],
};

function hexWord(hex: string): number {
  return parseInt(hex.slice(1), 16);
}

/** "#rrggbb" as the low 24 bits of the ABGR word ImageData holds. */
function abgr24(hex: string): number {
  const v = hexWord(hex);
  return ((v & 255) << 16) | (v & 0xff00) | ((v >> 16) & 255);
}

const PALETTE_RGB = ART_HEX.map((h) => {
  const v = hexWord(h);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255] as const;
});

/** A hero pixel (ABGR, 24 bits) -> its shadow, worked out on first sight. */
const dye = new Map<number, number>();
for (const [from, to] of Object.entries(SHADOW_OF)) dye.set(abgr24(from), abgr24(to));

function dyeOf(c: number): number {
  let out = dye.get(c);
  if (out === undefined) {
    // Between two colours of the palette (a translucent edge read back a
    // shade off): the nearest one's shadow.
    const r = c & 255;
    const g = (c >> 8) & 255;
    const b = (c >> 16) & 255;
    let best = 0;
    let bestD = Infinity;
    PALETTE_RGB.forEach(([pr, pg, pb], k) => {
      const rm = (r + pr) / 2;
      const d = (2 + rm / 256) * (r - pr) ** 2 + 4 * (g - pg) ** 2 + (2 + (255 - rm) / 256) * (b - pb) ** 2;
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    });
    out = abgr24(SHADOW_OF[ART_HEX[best]] ?? UMBRA.plum1);
    dye.set(c, out);
  }
  return out;
}

/** Skin: warm. */
function warm(c: number): boolean {
  return (c & 255) > ((c >> 16) & 255) + 24;
}

/** An eye: light, and not warm - cyan, ice, white, whatever he is given. */
function eyeLike(c: number): boolean {
  const r = c & 255;
  const g = (c >> 8) & 255;
  const b = (c >> 16) & 255;
  return b >= r && r * 0.3 + g * 0.6 + b * 0.1 > 120;
}

/** The canvas the hero's drawing goes into: room for his widest slash and his rings. */
const LW = 132;
const LH = 104;
/** Where the middle column of his hitbox and the row he stands on fall in it. */
const MID = 66;
const FEET = 72;
/** Alpha from which a pixel is body (as the actor pass counts it). */
const SOLID = 160;
/** 4×4 Bayer thresholds, 0..1: the order the shadow comes apart in. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

const RIM = (0xff000000 | abgr24(UMBRA.rim)) >>> 0;
const WHITE = 0xffffffff;
const EYE = (0xff000000 | abgr24(UMBRA.eye)) >>> 0;
const EYE_CORE = WHITE;

export interface UmbraLook {
  /** Struck: a white silhouette, as the hero's own first frames of a blow. */
  white: boolean;
  /** Art pixels it is sunk into the floor, cut off at the floor line. */
  sink: number;
  /** 0..1: how much of it has come apart (dying), in steps. */
  gone: number;
  /** 0..1: the eye's flare before it commits. */
  flare: number;
}

/**
 * Draws the shadow's body - the hero's drawing of it, dyed, rimmed and given
 * its eye - onto the actor layer (logical coordinates under the camera).
 */
export class UmbraPainter {
  private readonly layer = makeCanvas(LW, LH);
  private readonly body = new Uint8Array(LW * LH);
  /** Where the eye was last seen, from the middle column and the feet, facing right. */
  private eyeAt = { x: 3, y: 17 };

  /** The middle of its eye, in world (logical) pixels, as last drawn. */
  eyeOf(b: Player): { x: number; y: number } {
    return { x: snap(b.x) + 8 + this.eyeAt.x * b.facing * ART + ART / 2, y: snap(b.bottom) - this.eyeAt.y * ART + ART / 2 };
  }

  draw(ctx: CanvasRenderingContext2D, b: Player, world: World, look: UmbraLook): void {
    const L = this.layer.ctx;
    const mid = snap(b.x) + 8;
    const ox = mid - MID * ART;
    const oy = snap(b.bottom) - FEET * ART;
    L.setTransform(1, 0, 0, 1, 0, 0);
    L.globalAlpha = 1;
    L.globalCompositeOperation = 'source-over';
    L.clearRect(0, 0, LW, LH);
    L.setTransform(1 / ART, 0, 0, 1 / ART, -ox / ART, -oy / ART);
    b.draw(L, world);
    L.setTransform(1, 0, 0, 1, 0, 0);

    const img = L.getImageData(0, 0, LW, LH);
    const px = new Uint32Array(img.data.buffer, img.data.byteOffset, LW * LH);
    const body = this.body;

    // His eye, before the dye: the light, cold pixel in his face with skin
    // either side of it - wherever this frame has put his head.
    let ex = -1;
    let ey = -1;
    for (let y = FEET - 26; y < FEET - 6 && ex < 0; y++) {
      for (let x = MID - 16; x < MID + 16; x++) {
        const i = y * LW + x;
        const c = px[i];
        if (c >>> 24 < SOLID || !eyeLike(c)) continue;
        const l = px[i - 1];
        const r = px[i + 1];
        if (l >>> 24 >= SOLID && r >>> 24 >= SOLID && warm(l) && warm(r)) {
          ex = x;
          ey = y;
          break;
        }
      }
    }
    const facing = b.facing;
    if (ex >= 0) this.eyeAt = { x: (ex - MID) * facing, y: FEET - ey };

    const cut = Math.max(0, Math.min(1, look.gone));
    for (let y = 0; y < LH; y++) {
      // Coming apart in chunks of two by two, in the ordered pattern's order:
      // pieces breaking off, not a screen of single dots.
      const row = ((y >> 1) & 3) * 4;
      let i = y * LW;
      for (let x = 0; x < LW; x++, i++) {
        const c = px[i];
        const a = c >>> 24;
        if (a === 0) {
          body[i] = 0;
          continue;
        }
        if (cut > 0 && BAYER[row + ((x >> 1) & 3)] < cut) {
          px[i] = 0;
          body[i] = 0;
          continue;
        }
        const solid = a >= SOLID;
        body[i] = solid ? 1 : 0;
        px[i] = look.white && solid ? WHITE : ((a << 24) | dyeOf(c & 0xffffff)) >>> 0;
      }
    }
    if (!look.white) {
      // The rim: down the right-hand edge of every mass at least three pixels
      // across - hood, back, cape, tunic - and not along a limb or the blade,
      // which it would only turn into a magenta line.
      for (let y = 0; y < LH; y++) {
        let i = y * LW + 2;
        for (let x = 2; x < LW - 1; x++, i++) {
          if (body[i] && !body[i + 1] && body[i - 1] && body[i - 2]) px[i] = RIM;
        }
      }
      const put = (x: number, y: number, c: number): void => {
        if (x >= 0 && y >= 0 && x < LW && y < LH) px[y * LW + x] = c;
      };
      if (ex >= 0 && cut < 0.5) {
        put(ex, ey, EYE);
      }
      if (look.flare > 0.3) {
        // Before a blow, the eye goes white-hot: a star of it, then a cross.
        const fx = MID + this.eyeAt.x * facing;
        const fy = FEET - this.eyeAt.y;
        put(fx, fy, EYE_CORE);
        const reach = look.flare > 0.66 ? 2 : 1;
        for (let k = 1; k <= reach; k++) {
          put(fx + k, fy, EYE);
          put(fx - k, fy, EYE);
          put(fx, fy + k, EYE);
          put(fx, fy - k, EYE);
        }
      }
    }
    L.putImageData(img, 0, 0);

    // Down in the floor by `sink`, and nothing of it below the floor line.
    const sink = Math.max(0, Math.round(look.sink));
    const shown = sink > 0 ? FEET - sink : LH;
    if (shown <= 0) return;
    ctx.drawImage(this.layer.canvas, 0, 0, LW, shown, ox, oy + sink * ART, LW * ART, shown * ART);
  }
}

/* ------------------------------------------------------------------ pools */

const pools = new Map<number, PixelSprite>();

/**
 * The pool it lies in, sinks into and rises out of: a lens of the violet
 * black on the floor, `half` art pixels either side of its middle, its far
 * edge catching the rift's glow in a line of magenta. Two rows above the
 * floor line and two below it.
 */
function pool(half: number): PixelSprite {
  let s = pools.get(half);
  if (!s) {
    const w = half * 2 + 1;
    const out: string[] = [];
    const widths = [Math.round(half * 0.62), Math.round(half * 0.9), half, Math.round(half * 0.82)];
    widths.forEach((hw, y) => {
      let row = '';
      for (let x = 0; x < w; x++) {
        const d = Math.abs(x - half);
        if (d > hw) row += '.';
        else if (y === 0) row += d > hw - 2 ? 'p' : 'r';
        else if (y === 1 && d > hw - 2) row += 'p';
        else row += y === 3 && d > hw - 3 ? 'd' : 'k';
      }
      out.push(row);
    });
    s = new PixelSprite(out, { r: UMBRA.rim, p: UMBRA.plum1, k: UMBRA.black, d: UMBRA.deep });
    pools.set(half, s);
  }
  return s;
}

/** A pool on the floor at `floorY`, centred on x; k (0..1) how much of one there is. */
export function drawPool(ctx: CanvasRenderingContext2D, x: number, floorY: number, k: number): void {
  if (k <= 0.05) return;
  const half = Math.round(8 + 8 * Math.min(1, k));
  pool(half).draw(ctx, snap(x) - half * ART, snap(floorY) - 2 * ART);
}

/* ------------------------------------------------------------------ rings */

/**
 * Drawing back for its charge: a broken ring closing in on it - ten dashes
 * that turn as they close, paler and thicker the nearer it is to letting go -
 * wider than the charge's own ring, which takes over once the blade has cut.
 */
export function drawDrawRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, t: number): void {
  const r = snap(62 - t * 16);
  const thick = t > 0.6 ? 2 : 1;
  const color = t > 0.75 ? UMBRA.pale : t > 0.4 ? UMBRA.rim : UMBRA.plum3;
  const n = 10;
  const slot = (Math.PI * 2) / n;
  const turn = Math.round(t * 6) * (slot / 6);
  for (let i = 0; i < n; i++) {
    const a0 = i * slot + turn;
    sector(ctx, snap(cx), snap(cy), r - thick * ART, r, a0, a0 + slot * 0.55, color);
  }
}

/**
 * Its charge ring, closing on it while the blade is held back: the ring the
 * hero's own body draws (the same pixels - round his chest, nine rows up from
 * his feet), laid over in the shadow's magenta, so the tell reads through the
 * dye. `mid` and `feet` as the hero's drawing has them.
 */
export function drawChargeRing(ctx: CanvasRenderingContext2D, mid: number, feet: number, t: number): void {
  const r = Math.round(23 - t * 10);
  const cx = mid + ART / 2;
  const cy = feet - 9 * ART + ART / 2;
  sector(ctx, cx, cy, (r - 0.5) * ART, (r + 0.5) * ART, 0, Math.PI * 2, t > 0.5 ? UMBRA.rim : UMBRA.plum3);
}
