import { ART_PALETTE, RAMP } from './palette';

/**
 * The frame as a sixteen-bit machine would show it: every pixel one of the
 * palette's sixty-four colours, light as steps up a colour's own ramp, and a
 * fade as the whole palette shifted at once.
 *
 * Three things happen to each pixel, in one pass over the frame:
 *
 *   1. It becomes a palette colour. A colour the art painted from the palette
 *      stays exactly as it is. Anything else - a blend, the darkness pass, a
 *      soft edge - goes to its nearest palette colour, or, when it lies well
 *      between two colours that sit next to each other on a ramp, to an
 *      ordered pattern of the two at a quarter or a half. Never a pattern of
 *      two colours far apart (that is speckle, not shading), never a faint
 *      sprinkling of one in the other, and never one of the palette's neon
 *      colours (see NEON) unless the art painted it.
 *   2. Where a light falls (LightField), it climbs its ramp one or two steps,
 *      pulled a little towards the light's own hue - a torch warms a blue
 *      wall, it does not lay grey over it - with an ordered seam where one
 *      band meets the next. A light never makes anything darker. Actors are
 *      left as they are drawn.
 *   3. A fade - a pause, a dialogue, the fall, a flash - moves every colour
 *      along a table at once, per row of the screen, instead of laying a veil
 *      over the frame that the dither would turn into a checker.
 */

/** The palette's index for each of its colours, as "#rrggbb". */
const HEX: readonly string[] = ART_PALETTE.map((c) => `#${c.toString(16).padStart(6, '0')}`);

/**
 * Endesga's neons: electric ultramarines and violets, a hot red, an orange and
 * a cyan that are right where the art asks for them and wrong anywhere a blend
 * happens to land near them - a dim blue haze snapping to a block of #0c0293.
 * Never the result of a blend, a light or a fade; painted, they stay.
 */
const NEON = new Set(['#0c0293', '#3003d9', '#7a09fa', '#ff0040', '#ff5000', '#0cf1ff']);

/** Light families: what hue a light pulls what it lights towards. */
export const enum Family {
  Neutral = 0,
  Warm = 1,
  Green = 2,
  Cyan = 3,
  Violet = 4,
}
const FAMILIES = 5;

/**
 * Where the lights fall, at a quarter of the logical view (two art pixels to
 * a cell): a band coordinate per cell - 0 nothing, 64 one step, 128 two -
 * with the values in between dithered into a seam, and the family of the
 * strongest light on it.
 */
export interface LightField {
  readonly w: number;
  readonly h: number;
  readonly level: Uint8Array;
  readonly family: Uint8Array;
}

/** 4×4 Bayer ranks, 0..15, row by row. */
const RANK = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** The rank as an offset of an eighth of a band each way: a seam two or three pixels wide between light bands. */
const SEAM = new Int8Array(RANK.map((r) => Math.round((r - 7.5) * 0.9)));
/** The same for the darkness levels, in 256ths of a level. */
const DARK_SEAM = new Int16Array(RANK.map((r) => Math.round((r - 7.5) * 4)));

/* ----------------------------------------------------------------- Lab */

function linear(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function labOf(r: number, g: number, b: number): [number, number, number] {
  const lr = linear(r);
  const lg = linear(g);
  const lb = linear(b);
  const x = (lr * 0.4124 + lg * 0.3576 + lb * 0.1805) / 0.95047;
  const y = lr * 0.2126 + lg * 0.7152 + lb * 0.0722;
  const z = (lr * 0.0193 + lg * 0.1192 + lb * 0.9505) / 1.08883;
  const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : (t * 24389) / 27 / 116 + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** Hue angle of a Lab colour, degrees. */
function hueOf(a: number, b: number): number {
  const h = (Math.atan2(b, a) * 180) / Math.PI;
  return h < 0 ? h + 360 : h;
}

function hueGap(h1: number, h2: number): number {
  const d = Math.abs(h1 - h2) % 360;
  return d > 180 ? 360 - d : d;
}

/** The pull of each light family, as a Lab direction (unit a, b). */
const FAMILY_HUE: readonly number[] = [0, 62, 140, 225, 305];

/* --------------------------------------------------------------- the map */

export class PaletteMap {
  /** How many colours. */
  readonly n: number;
  /** Each colour as the ABGR word ImageData holds. */
  readonly abgr: Uint32Array;
  private readonly L: Float64Array;
  private readonly A: Float64Array;
  private readonly B: Float64Array;
  /** Per 15-bit colour: the nearest colour, a ramp neighbour to mix in, and how much (0, 1 = a quarter, 2 = a half). */
  private readonly near = new Uint8Array(32768);
  private readonly mix = new Uint8Array(32768);
  private readonly level = new Uint8Array(32768);
  /** One bit per possible colour, set for the palette's own. */
  private readonly exact = new Uint32Array(1 << 19);
  /** Per 15-bit colour: the palette colour that is exactly in it, if any (255 if none or several). */
  private readonly exactAt = new Uint8Array(32768).fill(255);
  /** Colours whose 15-bit box holds another palette colour too: looked up by value. */
  private readonly exactSlow = new Map<number, number>();
  /** Light steps: [family][band 0..2][index] → index. */
  private readonly steps: Uint8Array;
  /** Each colour's ramp, and its place on it. */
  private readonly rampOf: Int16Array;
  private readonly posOf: Int16Array;
  private readonly ramps: number[][] = [];
  private readonly tables = new Map<string, Uint8Array>();
  /** The colours a blend, a light or a fade may land on: all but the neons. */
  private readonly candidates: readonly number[];

  constructor() {
    const n = ART_PALETTE.length;
    this.n = n;
    this.abgr = new Uint32Array(n);
    this.L = new Float64Array(n);
    this.A = new Float64Array(n);
    this.B = new Float64Array(n);
    const rgb = ART_PALETTE.map((c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255]);
    for (let i = 0; i < n; i++) {
      const [r, g, b] = rgb[i];
      this.abgr[i] = ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
      [this.L[i], this.A[i], this.B[i]] = labOf(r, g, b);
      const key = (b << 16) | (g << 8) | r;
      this.exact[key >>> 5] |= 1 << (key & 31);
      const box = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      const there = this.exactAt[box];
      if (there === 255) this.exactAt[box] = i;
      else {
        // Two palette colours in one box: both by value from now on.
        if (there !== 254) this.exactSlow.set(this.abgr[there] & 0xffffff, there);
        this.exactAt[box] = 254;
        this.exactSlow.set(this.abgr[i] & 0xffffff, i);
      }
    }

    // Ramps: each colour's ramp and place on it.
    this.rampOf = new Int16Array(n).fill(-1);
    this.posOf = new Int16Array(n).fill(0);
    for (const ramp of Object.values(RAMP)) {
      const idx = ramp.map((hex) => HEX.indexOf(hex)).filter((i) => i >= 0);
      const id = this.ramps.length;
      this.ramps.push(idx);
      idx.forEach((i, p) => {
        this.rampOf[i] = id;
        this.posOf[i] = p;
      });
    }

    const candidates: number[] = [];
    for (let i = 0; i < n; i++) if (!NEON.has(HEX[i])) candidates.push(i);
    this.candidates = candidates;
    const neighbours = this.neighbourLists(candidates);
    this.buildTable(candidates, neighbours);
    this.steps = this.buildSteps(candidates);
  }

  /**
   * Which colours a colour may be mixed with in a pattern: its neighbours on
   * its own ramp, and any colour close to it in lightness that shares its hue
   * (or is as grey as it is).
   */
  private neighbourLists(candidates: readonly number[]): number[][] {
    const { L, A, B } = this;
    const out: number[][] = [];
    for (let i = 0; i < this.n; i++) {
      const list: number[] = [];
      const ci = Math.hypot(A[i], B[i]);
      const hi = hueOf(A[i], B[i]);
      for (const j of candidates) {
        if (j === i) continue;
        const sameRamp = this.rampOf[i] >= 0 && this.rampOf[i] === this.rampOf[j] && Math.abs(this.posOf[i] - this.posOf[j]) === 1;
        const dL = Math.abs(L[i] - L[j]);
        const cj = Math.hypot(A[j], B[j]);
        const greyish = ci < 12 && cj < 12;
        const hueOk = greyish || (ci >= 12 && cj >= 12 && hueGap(hi, hueOf(A[j], B[j])) <= 40);
        const dE = Math.hypot(L[i] - L[j], A[i] - A[j], B[i] - B[j]);
        if (sameRamp || (dL <= 15 && hueOk && dE <= 32)) list.push(j);
      }
      out.push(list);
    }
    return out;
  }

  /** The 15-bit table: nearest colour, and the partner and share of a pattern where one fits. */
  private buildTable(candidates: readonly number[], neighbours: readonly number[][]): void {
    const { L, A, B } = this;
    for (let box = 0; box < 32768; box++) {
      const r = ((box >> 10) & 31) * 8 + 4;
      const g = ((box >> 5) & 31) * 8 + 4;
      const b = (box & 31) * 8 + 4;
      const [pl, pa, pb] = labOf(r, g, b);
      let best = candidates[0];
      let bestD = Infinity;
      for (const k of candidates) {
        const d = (pl - L[k]) ** 2 + (pa - A[k]) ** 2 + (pb - B[k]) ** 2;
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      }
      this.near[box] = best;
      this.mix[box] = best;
      this.level[box] = 0;
      // The partner that explains this colour best as a mix with the nearest.
      let partner = -1;
      let partnerT = 0;
      let partnerRes = bestD * 0.8;
      for (const j of neighbours[best]) {
        const sl = L[j] - L[best];
        const sa = A[j] - A[best];
        const sb = B[j] - B[best];
        const len2 = sl * sl + sa * sa + sb * sb;
        if (len2 <= 0) continue;
        const t = ((pl - L[best]) * sl + (pa - A[best]) * sa + (pb - B[best]) * sb) / len2;
        if (t <= 0) continue;
        const tt = Math.min(1, t);
        const res = (pl - L[best] - sl * tt) ** 2 + (pa - A[best] - sa * tt) ** 2 + (pb - B[best] - sb * tt) ** 2;
        if (res < partnerRes) {
          partnerRes = res;
          partner = j;
          partnerT = tt;
        }
      }
      // A quarter at least, so a pattern is a pattern and not a sprinkling.
      if (partner >= 0 && partnerT >= 0.2) {
        this.mix[box] = partner;
        this.level[box] = partnerT < 0.4 ? 1 : 2;
      }
    }
  }

  /** The nearest colour to a Lab target, among candidates, no darker than minL. */
  private nearestTo(candidates: readonly number[], l: number, a: number, b: number, minL = -Infinity): number {
    let best = -1;
    let bestD = Infinity;
    for (const k of candidates) {
      if (this.L[k] < minL) continue;
      const d = (l - this.L[k]) ** 2 + (a - this.A[k]) ** 2 + (b - this.B[k]) ** 2;
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    return best;
  }

  /**
   * The light steps: for each family and band, where a colour goes when it
   * is lit - one or two steps lighter (about ten L* a step), its hue pulled
   * towards the light's, never darker and never neon. A neutral light climbs
   * the colour's own ramp.
   */
  private buildSteps(candidates: readonly number[]): Uint8Array {
    const n = this.n;
    const out = new Uint8Array(FAMILIES * 3 * n);
    for (let f = 0; f < FAMILIES; f++) {
      for (let band = 0; band < 3; band++) {
        for (let i = 0; i < n; i++) {
          let j = i;
          if (band > 0) {
            if (f === Family.Neutral) j = this.alongRamp(i, band);
            else {
              // Mostly the colour's own hue, a little of the light's: a torch
              // warms a blue wall, it does not turn it grey. And it keeps its
              // colour: a step up may not land on a much greyer one.
              const pull = band === 1 ? 0.12 : 0.2;
              const chroma = Math.hypot(this.A[i], this.B[i]);
              const reach = Math.max(chroma, 22);
              const h = (FAMILY_HUE[f] * Math.PI) / 180;
              const ta = this.A[i] * (1 - pull) + Math.cos(h) * reach * pull;
              const tb = this.B[i] * (1 - pull) + Math.sin(h) * reach * pull;
              const tl = this.L[i] + band * 12;
              let best = -1;
              let bestD = Infinity;
              for (const k of candidates) {
                if (this.L[k] < this.L[i] + band * 6) continue;
                if (chroma >= 12 && Math.hypot(this.A[k], this.B[k]) < Math.min(chroma * 0.6, 18)) continue;
                const d = (tl - this.L[k]) ** 2 + 2.2 * ((ta - this.A[k]) ** 2 + (tb - this.B[k]) ** 2);
                if (d < bestD) {
                  bestD = d;
                  best = k;
                }
              }
              j = best >= 0 ? best : this.alongRamp(i, band);
            }
          }
          out[(f * 3 + band) * n + i] = j;
        }
      }
    }
    return out;
  }

  /**
   * A zone's darkness as four tables, levels 0 to 3: each colour pulled
   * towards the zone's shade - a third, two thirds, all of the zone's
   * darkness - the way a ceiling darkens (only what is brighter than the
   * shade comes down, channel by channel), and put back on the palette's
   * nearest colour, never a pattern of two and never brighter than it was.
   */
  darkness(shade: readonly [number, number, number], dark: number): Uint8Array {
    const key = `k${shade.join(',')}|${dark.toFixed(3)}`;
    let t = this.tables.get(key);
    if (t) return t;
    const n = this.n;
    t = new Uint8Array(4 * n);
    for (let level = 0; level < 4; level++) {
      const d = (dark * level) / 3;
      for (let i = 0; i < n; i++) {
        if (level === 0) {
          t[i] = i;
          continue;
        }
        const c = ART_PALETTE[i];
        const ch = [(c >> 16) & 255, (c >> 8) & 255, c & 255];
        const out = ch.map((v, k) => v * (1 - d) + Math.min(v, shade[k]) * d);
        const [l, a, b] = labOf(out[0], out[1], out[2]);
        let best = this.nearestTo(this.candidates, l, a, b);
        if (best < 0 || this.L[best] > this.L[i] + 1) best = i;
        t[level * n + i] = best;
      }
    }
    this.tables.set(key, t);
    return t;
  }

  /**
   * Puts the ground on the palette under its darkness, before anything else
   * is drawn over it - the ground being its own layer, over the painted
   * backdrop, which is never darkened: every pixel of it to its palette
   * colour (a blend to its nearest, no pattern), then down its zone's
   * darkness table by how dark the field says it is there, with a seam a
   * pixel or two wide between two levels. What the layer only half covers
   * becomes an ordered pattern of whole pixels, as on the actor layer. The
   * field is a quarter of the view, 0 lit to 255 the zone's full dark.
   * Marks in `ground` which pixels the layer covers: only those take light.
   */
  shade(
    image: ImageData,
    ox: number,
    oy: number,
    field: Uint8Array,
    fw: number,
    fh: number,
    table: Uint8Array,
    ground: Uint8Array,
  ): void {
    const w = image.width;
    const h = image.height;
    const px = new Uint32Array(image.data.buffer, image.data.byteOffset, w * h);
    const { exact, exactAt, near, abgr, n } = this;
    for (let y = 0; y < h; y++) {
      const row = ((y + oy) & 3) * 4;
      const fy = Math.min(fh - 1, y >> 1) * fw;
      let i = y * w;
      for (let x = 0; x < w; x++, i++) {
        const c = px[i];
        const alpha = c >>> 24;
        const rank = RANK[row + ((x + ox) & 3)];
        if (alpha === 0 || (alpha < 224 && alpha <= rank * 16 + 8)) {
          px[i] = 0;
          ground[i] = 0;
          continue;
        }
        const box = ((c & 0xf8) << 7) | ((c >> 6) & 0x3e0) | ((c >> 19) & 0x1f);
        let idx: number;
        if (alpha === 255 && exact[(c & 0xffffff) >>> 5] & (1 << (c & 31))) {
          idx = exactAt[box];
          if (idx >= 254) idx = this.exactSlow.get(c & 0xffffff) ?? near[box];
        } else idx = near[box];
        const level = (field[fy + (x >> 1)] * 3 + 128 + DARK_SEAM[row + ((x + ox) & 3)]) >> 8;
        px[i] = abgr[table[(level > 3 ? 3 : level < 0 ? 0 : level) * n + idx]];
        ground[i] = 1;
      }
    }
  }

  /** k steps up (k > 0) or down (k < 0) a colour's own ramp, stopping at its ends. */
  alongRamp(i: number, k: number): number {
    const ramp = this.ramps[this.rampOf[i]];
    if (!ramp) return i;
    const p = Math.max(0, Math.min(ramp.length - 1, this.posOf[i] + k));
    return ramp[p];
  }

  /** A fade that takes every colour k steps down its ramp: the screen dims, hues kept. */
  darken(k: number): Uint8Array {
    return this.table(`d${k}`, (i) => this.alongRamp(i, -k));
  }

  /**
   * A fade towards white, k steps: up the colour's ramp, and off the top of
   * it into the palette's palest colours.
   */
  brighten(k: number): Uint8Array {
    return this.table(`b${k}`, (i) => {
      const ramp = this.ramps[this.rampOf[i]];
      const top = ramp ? ramp.length - 1 : 0;
      const over = this.posOf[i] + k - top;
      if (!ramp || over <= 0) return this.alongRamp(i, k);
      const white = HEX.indexOf('#ffffff');
      const pale = HEX.indexOf('#f9e6cf');
      return over >= 2 ? white : pale >= 0 ? pale : white;
    });
  }

  /**
   * The fall: the world sinking into old blood, k = 1..3 - each colour to the
   * rose ramp's colour of about its lightness, and darker with every step.
   */
  bleed(k: number): Uint8Array {
    const rose = RAMP.rose.map((hex) => HEX.indexOf(hex)).filter((i) => i >= 0 && !NEON.has(HEX[i]));
    const plum = ['#1c121c', '#391f21'].map((hex) => HEX.indexOf(hex));
    const ramp = [...plum, ...rose];
    return this.table(`r${k}`, (i) => {
      const target = this.L[i] * (1 - 0.18 * k) - 4 * k;
      let best = ramp[0];
      for (const j of ramp) if (Math.abs(this.L[j] - target) < Math.abs(this.L[best] - target)) best = j;
      // The first step keeps a little of the colour: half the pixels' hue
      // would be a pattern, so instead it only darkens.
      return k === 1 ? this.alongRamp(i, -1) : best;
    });
  }

  /** Two fades one after the other, as one table. */
  then(first: Uint8Array, second: Uint8Array): Uint8Array {
    const out = new Uint8Array(this.n);
    for (let i = 0; i < this.n; i++) out[i] = second[first[i]];
    return out;
  }

  private table(key: string, fn: (i: number) => number): Uint8Array {
    let t = this.tables.get(key);
    if (!t) {
      t = new Uint8Array(this.n);
      for (let i = 0; i < this.n; i++) t[i] = fn(i);
      this.tables.set(key, t);
    }
    return t;
  }

  /** The light family of a colour given as "r,g,b": by its hue, or neutral if it has hardly any. */
  static familyOf(rgb: string): Family {
    const [r = 255, g = 255, b = 255] = rgb.split(',').map(Number);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max - min < 40) return Family.Neutral;
    let h: number;
    if (max === r) h = ((g - b) / (max - min)) * 60;
    else if (max === g) h = (2 + (b - r) / (max - min)) * 60;
    else h = (4 + (r - g) / (max - min)) * 60;
    if (h < 0) h += 360;
    if (h < 75 || h >= 335) return Family.Warm;
    if (h < 165) return Family.Green;
    if (h < 255) return Family.Cyan;
    return Family.Violet;
  }

  /**
   * Maps a frame in place. (ox, oy) is where it sits in the world in art
   * pixels, so the patterns stay put on the world as the camera moves; light
   * is the field of where lights fall (or null), and it lights only the
   * pixels `lit` marks (the ground) that `actors` does not (an actor is drawn
   * in its own colours); fades holds a table per row of the screen, or null
   * for none.
   */
  map(
    image: ImageData,
    ox: number,
    oy: number,
    light: LightField | null,
    lit: Uint8Array | null,
    actors: Uint8Array | null,
    fades: readonly (Uint8Array | null)[] | null,
  ): void {
    const w = image.width;
    const h = image.height;
    const px = new Uint32Array(image.data.buffer, image.data.byteOffset, w * h);
    const { exact, exactAt, near, mix, level, abgr, steps, n } = this;
    const lw = light ? light.w : 0;
    const lh = light ? light.h : 0;
    const lv = light ? light.level : null;
    const lf = light ? light.family : null;
    for (let y = 0; y < h; y++) {
      const row = ((y + oy) & 3) * 4;
      const fade = fades ? fades[y] : null;
      const ly = Math.min(lh - 1, y >> 1) * lw;
      let i = y * w;
      for (let x = 0; x < w; x++, i++) {
        const c = px[i];
        const box = ((c & 0xf8) << 7) | ((c >> 6) & 0x3e0) | ((c >> 19) & 0x1f);
        let idx: number;
        if (exact[(c & 0xffffff) >>> 5] & (1 << (c & 31))) {
          idx = exactAt[box];
          if (idx >= 254) idx = this.exactSlow.get(c & 0xffffff) ?? near[box];
        } else {
          const lvl = level[box];
          idx = lvl !== 0 && RANK[row + ((x + ox) & 3)] < lvl * 4 ? mix[box] : near[box];
        }
        if (lv !== null && lit !== null && lit[i] !== 0 && (actors === null || actors[i] === 0)) {
          const m = ly + (x >> 1);
          const s = lv[m];
          if (s !== 0) {
            let band = (s + SEAM[row + ((x + ox) & 3)]) >> 6;
            if (band > 0) {
              if (band > 2) band = 2;
              idx = steps[((lf as Uint8Array)[m] * 3 + band) * n + idx];
            }
          }
        }
        if (fade !== null) idx = fade[idx];
        px[i] = abgr[idx];
      }
    }
  }
}
