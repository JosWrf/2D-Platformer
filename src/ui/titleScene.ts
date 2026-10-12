import { Pix, abgr, noise } from '../render/pixpaint';

/**
 * The title's own scene, in front of Burg Nachtfall's backdrop: a crag
 * rising from the bottom left of the screen to an overhang, the hero on its
 * tip, looking across at the castle under its moon.
 *
 * The crag is painted once, like a backdrop strip: rock in strata, lit from
 * the upper left along its top and in shade down the face that turns away,
 * cracks running down it, a lip of grass along the top with blades standing
 * out of it and a few hanging over the edge, and its foot sinking into the
 * dark a ramp step at a time.
 */

/** Where the painted crag starts, in art rows. */
export const LEDGE_Y = 186;
/** The art row the hero's feet stand on. */
export const LEDGE_TOP = 203;
/** The art column of the middle of the hero, near the tip. */
export const LEDGE_HERO_X = 112;

const W = 150;
const H = 270 - LEDGE_Y;
/** The tip of the overhang, and how far the face slants back under it. */
const TIP = 130;
const UNDERCUT = 0.42;

let ledge: HTMLCanvasElement | null = null;

export function titleLedge(): HTMLCanvasElement {
  if (ledge) return ledge;
  const p = new Pix(W, H);
  const deep = abgr('#0e071b');
  const dark = abgr('#1a1932');
  const body = abgr('#2a2f4e');
  const lit = abgr('#424c6e');
  const rim = abgr('#657392');
  const moss = abgr('#134c4c');
  const grass = abgr('#1e6f50');
  const blade = abgr('#33984b');
  const stand = LEDGE_TOP - LEDGE_Y;

  // The top: rising gently from the left edge of the screen to a level
  // stretch for him to stand on near the tip.
  const top = new Int16Array(W);
  for (let x = 0; x < W; x++) {
    const rise = Math.round((TIP - x) / 26);
    const bump = x >= 96 && x <= 124 ? 0 : Math.round((noise(x, W, 7, 31) - 0.5) * 3);
    top[x] = stand + Math.max(0, rise - 1) + bump;
  }
  // The right edge in each row: the tip, then the face slanting back under it.
  const edge = (y: number): number => Math.round(TIP - Math.max(0, y - stand) * UNDERCUT + (noise(y, H, 5, 47) - 0.5) * 4);
  for (let y = 0; y < H; y++) {
    const e = edge(y);
    for (let x = 0; x < Math.min(W, e); x++) if (y >= top[x]) p.set(x, y, body);
  }
  const solid = (x: number, y: number): boolean => x >= 0 && x < W && y >= 0 && y < H && p.get(x, y) !== 0;
  // Strata: seams running across, broken here and there, a step darker,
  // each with a lit lip under it.
  for (let s = 0; s < 6; s++) {
    const y0 = stand + 8 + s * 10;
    for (let x = 0; x < W; x++) {
      const y = y0 + Math.round((noise(x, W, 6, 40 + s) - 0.5) * 6);
      if (!solid(x, y) || y <= top[x] + 2) continue;
      if (noise(x, W, 14, 60 + s) < 0.3) continue;
      p.set(x, y, dark);
      if (solid(x, y + 1) && noise(x, W, 22, 80 + s) > 0.45) p.set(x, y + 1, lit);
    }
  }
  // Cracks running down from the strata.
  for (const [cx, len] of [
    [24, 22],
    [58, 30],
    [87, 18],
    [104, 26],
  ] as const) {
    let x = cx;
    for (let y = stand + 6; y < stand + 6 + len; y++) {
      if (noise(y, H, 9, cx) > 0.6) x += noise(y, H, 4, cx + 1) > 0.5 ? 1 : -1;
      if (solid(x, y)) p.set(x, y, dark);
    }
  }
  // The face that turns away from the light, in shade; the underside of the
  // overhang in the deepest of it.
  for (let y = 0; y < H; y++) {
    const e = Math.min(W, edge(y));
    for (let k = 1; k <= 3; k++) if (solid(e - k, y)) p.set(e - k, y, k === 1 ? deep : dark);
  }
  // The top: lit where it faces up, a rim of light along it.
  for (let x = 0; x < W; x++) {
    const t = top[x];
    if (!solid(x, t + 1)) continue;
    p.set(x, t + 1, lit);
    if (noise(x, W, 30, 90) > 0.55 && solid(x, t + 2)) p.set(x, t + 2, rim);
  }
  // Grass along the top, its blades standing up, a few hanging over the tip.
  for (let x = 0; x < W; x++) {
    const t = top[x];
    if (!solid(x, t)) continue;
    p.set(x, t, grass);
    if (solid(x, t + 1)) p.set(x, t + 1, moss);
    const n = noise(x, W, 60, 120);
    if (n > 0.6 && t > 0) {
      p.set(x, t - 1, grass);
      if (n > 0.76 && t > 1) p.set(x, t - 2, blade);
    }
  }
  for (const [hx, len] of [
    [TIP - 2, 3],
    [TIP - 5, 5],
    [TIP - 9, 2],
  ] as const) {
    for (let k = 1; k <= len; k++) p.set(hx + 1 + (k > 2 ? 1 : 0), stand + k, k === len ? moss : grass);
  }
  // The foot of the crag sinks into the dark, a ramp step at a time: the
  // rock to its shade, the shade to the deepest dark.
  const foot = H - 28;
  p.dither(0, foot, W, 7, dark, 8, 'solid');
  p.dither(0, foot + 7, W, 7, dark, 16, 'solid');
  p.dither(0, foot + 14, W, 7, deep, 8, 'solid');
  p.dither(0, foot + 21, W, H - foot - 21, deep, 16, 'solid');
  ledge = p.canvas();
  return ledge;
}

/** Where the mist in the valley starts, in art rows. */
export const MIST_Y = 192;

let mist: HTMLCanvasElement | null = null;

/**
 * The valley between the crag and the castle, filled with mist: two banks of
 * it one behind the other, each a ragged crest the moon catches along its
 * top and solid fog below - so the lower part of the title is a place, not
 * an empty dark band, and the call to start stands on something.
 */
export function titleMist(): HTMLCanvasElement {
  if (mist) return mist;
  const w = 480;
  const h = 270 - MIST_Y;
  const p = new Pix(w, h);
  const fog = abgr('#2a2f4e');
  const crest = abgr('#424c6e');
  const banks: readonly (readonly [number, number, number])[] = [
    [8, 7, 41],
    [30, 9, 67],
  ];
  for (const [base, amp, seed] of banks) {
    const top = new Int16Array(w);
    for (let x = 0; x < w; x++) {
      const v = noise(x, w, 9, seed) * 0.7 + noise(x, w, 31, seed + 5) * 0.3;
      top[x] = Math.round(base + (v - 0.5) * 2 * amp);
    }
    for (let x = 0; x < w; x++) {
      for (let y = Math.max(0, top[x]); y < h; y++) p.set(x, y, fog);
      // The crest, lit where it rises towards the moon on the right.
      if (top[x] >= 0 && top[x] < h && (x === w - 1 || top[x + 1] <= top[x])) p.set(x, top[x], crest);
    }
  }
  mist = p.canvas();
  return mist;
}
