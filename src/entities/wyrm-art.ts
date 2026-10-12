import { RAMP } from '../render/palette';
import { ART } from '../render/pixel';
import { type Grid, flame, hash2, rows as rowsOfCells, tumble } from '../render/sheet';
import { BigSheet, cellsOf, despeckle, fillPoly, rowsOf, strokeCells4, turnings } from './puppet';

/**
 * Ignivor, drawn for the grid: plates of obsidian - near-black glass, a step
 * of plum where the key light falls, one pixel of violet sheen along the top
 * of each - with the mountain's fire running between them: the belly under
 * every plate in four bands of the fire ramp, white-hot at the core, and the
 * lava throwing a one-pixel rim of rust up onto the plates' lower edges. A
 * spine on every plate, leaning back. The skull long and horned, an eye like
 * a slit in a furnace door, ivory teeth, and a jaw that drops in three steps.
 *
 * The body is fifteen plates in four sizes, each drawn once and turned with
 * RotSprite to nine angles from straight up to straight down (the other half
 * of the circle is the same frames mirrored, so the spine stays on top); the
 * head the same, in each of its three jaws. The fire he makes - the burning
 * pools, the wall of flame that follows him under the floor - is flame()
 * frames, and the heat over the floor where he swims is rows of one-pixel
 * dashes, not dots.
 */

const KEY: Record<string, string> = {
  x: RAMP.earth[0],
  K: RAMP.plum[0],
  o: RAMP.plum[1],
  O: RAMP.plum[2],
  v: RAMP.plum[3],
  a: RAMP.rust[0],
  b: RAMP.rust[1],
  c: RAMP.fire[1],
  d: RAMP.fire[2],
  e: RAMP.fire[3],
  f: RAMP.fire[4],
  t: RAMP.earth[7],
  T: RAMP.earth[5],
  w: RAMP.grey[7],
};

const PALETTES = {
  /** Dying, the fire going out of him: the glow turns to ash. */
  cool: { a: RAMP.grey[2], b: RAMP.grey[3], c: RAMP.grey[3], d: RAMP.grey[4], e: RAMP.grey[4], f: RAMP.grey[5], w: RAMP.grey[5], v: RAMP.plum[2] },
  /** Dying, the fire sinking in him: the hot tones a step down. */
  dim: { c: RAMP.rust[1], d: RAMP.fire[1], e: RAMP.fire[1], f: RAMP.fire[2], w: RAMP.fire[3] },
  /** Out and in reach: the fire in him showing through the skull, a beat at a time. */
  hot: { a: RAMP.rust[1], c: RAMP.fire[3], d: RAMP.fire[4], e: RAMP.fire[4], f: RAMP.grey[7] },
  /** A blow to the head: white, for the two frames of it. */
  white: Object.fromEntries(Object.keys(KEY).map((k) => [k, RAMP.grey[7]])),
};

type Pt = [number, number];

/** Nine angles, straight up to straight down; the left half of the circle is these mirrored. */
const ANGLES = [-90, -67.5, -45, -22.5, 0, 22.5, 45, 67.5, 90];

/** The frame for a heading (radians, screen space) - which of the nine, and whether mirrored. */
export function heading(ang: number): { i: number; facing: 1 | -1 } {
  let deg = (ang * 180) / Math.PI;
  deg = ((deg % 360) + 540) % 360 - 180;
  let facing: 1 | -1 = 1;
  if (deg > 90) {
    deg = 180 - deg;
    facing = -1;
  } else if (deg < -90) {
    deg = -180 - deg;
    facing = -1;
  }
  return { i: Math.round((deg + 90) / 22.5), facing };
}

/** A quadratic from a through control q to b, as points (b included, a not). */
function quad(a: Pt, q: Pt, b: Pt, n = 8): Pt[] {
  const out: Pt[] = [];
  for (let k = 1; k <= n; k++) {
    const t = k / n;
    const u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * q[0] + t * t * b[0], u * u * a[1] + 2 * u * t * q[1] + t * t * b[1]]);
  }
  return out;
}

/* ---------------------------------------------------------------- plates */

/**
 * One plate of radius r (art pixels), facing right along the body, spine up:
 * its fire belly, the glass over it, the spine and a crack.
 */
function plate(r: number): { rows: string[]; x: number; y: number } {
  const W = Math.ceil(r * 2.4) + 4;
  const H = Math.ceil(r * 3) + 4;
  const ox = W / 2;
  const oy = Math.ceil(r * 1.85) + 1;
  const c = cellsOf([], W, H);
  const at = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [ox + x * r, oy + y * r] as Pt);
  // The belly: an oval of fire in bands, white-hot in the middle.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const nx = (x + 0.5 - ox) / (r * 1.08);
      const ny = (y + 0.5 - oy - r * 0.3) / (r * 0.92);
      const q = Math.hypot(nx, ny);
      if (q > 1) continue;
      c[y][x] = q < 0.4 ? 'e' : q < 0.68 ? 'd' : q < 0.88 ? 'c' : 'b';
    }
  }
  // The plate: a dome of glass over the top of it.
  const dome: Pt[] = [[-1.05, 0.15], ...quad([-1.05, 0.15], [-1.1, -0.9], [0, -0.95]), ...quad([0, -0.95], [1.1, -0.9], [1.05, 0.15]), ...quad([1.05, 0.15], [0, 0.4], [-1.05, 0.15])];
  const glass = cellsOf([], W, H);
  fillPoly(glass, at(dome), 'o');
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (glass[y][x] !== 'o') continue;
      const nx = (x + 0.5 - ox) / r;
      const ny = (y + 0.5 - oy) / r;
      // Lit from the upper left a step lighter; the far lower part darkest.
      c[y][x] = nx * 0.6 + ny * 0.8 < -0.3 ? 'O' : nx * 0.5 + ny > 0.1 ? 'K' : 'o';
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (glass[y][x] !== 'o') continue;
      // The sheen along the top of the glass, and the lava's light along its foot.
      if ((glass[y - 1]?.[x] ?? '.') === '.' && x < ox + r * 0.75) c[y][x] = 'v';
      else if ((glass[y + 1]?.[x] ?? '.') === '.' && c[y + 1]?.[x] !== '.') c[y][x] = 'a';
    }
  }
  // The spine, leaning back, hot along its inner edge.
  fillPoly(c, at([[-0.3, -0.8], [-0.95, -1.8], [0.3, -0.92]]), 'x');
  const [s0, s1] = at([[-0.42, -0.98], [-0.85, -1.6]]);
  strokeCells4(c, s0[0], s0[1], s1[0], s1[1], 'b');
  // A crack where the fire gets through the glass.
  const crack = at([[-0.5, -0.15], [-0.1, -0.4], [0.3, -0.12]]);
  strokeCells4(c, crack[0][0], crack[0][1], crack[1][0], crack[1][1], 'c');
  strokeCells4(c, crack[1][0], crack[1][1], crack[2][0], crack[2][1], 'c');
  return { rows: despeckle(rowsOf(c)), x: Math.floor(ox), y: oy };
}

/** Plate radii in art pixels: fifteen plates from 12.5 at the neck to 5.5 at the tail, in four sizes. */
const SIZES = [12, 10, 8, 6];

export function plateSize(r: number): number {
  let best = 0;
  for (let i = 1; i < SIZES.length; i++) if (Math.abs(SIZES[i] - r) < Math.abs(SIZES[best] - r)) best = i;
  return best;
}

type Turned = { rows: string[]; x: number; y: number };

/** A part turned to the nine angles about its pivot, each cropped, with its pivot. */
function turned(rows: Grid, px: number, py: number): Turned[] {
  return turnings(rows, px, py, ANGLES);
}

const plateFrames: Record<string, string[]> = {};
const plateAt: Record<string, { x: number; y: number }> = {};

/** The plates of one size at all nine angles, worked out the first time they are wanted (see warmWyrm). */
function ensurePlates(s: number): void {
  if (plateFrames[`p${s}_0`]) return;
  const p = plate(SIZES[s]);
  turned(p.rows, p.x, p.y).forEach((t, i) => {
    plateFrames[`p${s}_${i}`] = t.rows;
    plateAt[`p${s}_${i}`] = { x: t.x, y: t.y };
  });
}
const PLATES = new BigSheet<string>(plateFrames, KEY, PALETTES);

/** A plate of the body at (x, y), its size picked from r (art pixels), turned to a heading. */
export function drawPlate(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, ang: number, palette = ''): void {
  const { i, facing } = heading(ang);
  const s = plateSize(r);
  ensurePlates(s);
  const id = `p${s}_${i}`;
  const at = plateAt[id];
  PLATES.draw(ctx, id, x, y, at.x, at.y, facing, palette);
}

/* ------------------------------------------------------------------ head */

/** The head facing right, its point at (0, 0) as the old drawing had it, the jaw dropped by `jaw` radians. */
function head(jaw: number): { rows: string[]; x: number; y: number } {
  const W = 56;
  const H = 40;
  const ox = 28;
  const oy = 18;
  const c = cellsOf([], W, H);
  const at = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [ox + x, oy + y] as Pt);
  const turn = (pts: Pt[], hx: number, hy: number, a: number): Pt[] =>
    pts.map(([x, y]) => [hx + (x - hx) * Math.cos(a) - (y - hy) * Math.sin(a), hy + (x - hx) * Math.sin(a) + (y - hy) * Math.cos(a)] as Pt);
  // Horns, behind the skull: the long one swept back, a short one under it.
  fillPoly(c, at([[-3, -9], ...quad([-3, -9], [-15, -17], [-26, -15]), ...quad([-26, -15], [-15, -12], [-7, -5])]), 'o');
  fillPoly(c, at([[-7, -6], ...quad([-7, -6], [-17, -9], [-23, -4]), ...quad([-23, -4], [-15, -6], [-9, -2])]), 'O');
  // Fire in the open mouth.
  if (jaw > 0.05) fillPoly(c, at([[-2, 2], [21, 1], ...turn([[20, 2], [2, 7]], -4, 3, jaw)]), 'e');
  // The lower jaw, hinged at the back of the skull, with its teeth.
  fillPoly(c, at(turn([[-4, 2], [16, 4], [14, 7.5], [-3, 8]], -4, 3, jaw)), 'o');
  fillPoly(c, at(turn([[-4, 6.5], [14.5, 6.5], [14, 7.5], [-3, 8]], -4, 3, jaw)), 'K');
  for (let i = 0; i < 4; i++) {
    const tooth = turn([[1 + i * 3.5, 4], [2.5 + i * 3.5, 1], [4 + i * 3.5, 4]], -4, 3, jaw);
    fillPoly(c, at(tooth), 't');
  }
  // The skull: glass like the plates, lit along the top, the lava's light under it.
  const skull: Pt[] = [[-13, 3], ...quad([-13, 3], [-14, -10], [-2, -11]), ...quad([-2, -11], [12, -10], [22, -3]), [23, 1], ...quad([23, 1], [10, 4], [-13, 3])];
  const glass = cellsOf([], W, H);
  fillPoly(glass, at(skull), 'o');
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (glass[y][x] !== 'o') continue;
      const nx = x + 0.5 - ox;
      const ny = y + 0.5 - oy;
      c[y][x] = ny < -2 - nx * 0.2 ? 'O' : ny > 2 ? 'K' : 'o';
      if ((glass[y - 1]?.[x] ?? '.') === '.' && nx < 16) c[y][x] = 'v';
      else if ((glass[y + 1]?.[x] ?? '.') === '.') c[y][x] = 'a';
    }
  }
  // Upper teeth.
  for (let i = 0; i < 4; i++) fillPoly(c, at([[7 + i * 3.5, 2], [8.5 + i * 3.5, 5.5], [10 + i * 3.5, 2]]), 't');
  // The brow ridge over the eye, black.
  fillPoly(c, at([[-1, -8], ...quad([-1, -8], [6, -12], [11, -6]), [2, -5]]), 'x');
  // The eye: a slit of white heat in a ring of fire.
  for (const [x, y, l] of [
    [3, -6, 'd'],
    [4, -6, 'f'],
    [5, -6, 'w'],
    [6, -6, 'f'],
    [7, -6, 'd'],
    [4, -5, 'c'],
    [5, -5, 'e'],
    [6, -5, 'c'],
  ] as const) {
    c[oy + y][ox + x] = l;
  }
  // The nostril, and a crack of fire along the cheek.
  c[oy - 3][ox + 19] = 'c';
  c[oy - 3][ox + 20] = 'c';
  for (const line of [
    [[-9, 0], [-5, -3], [-1, -1], [3, -3]],
    [[-11, -4], [-8, -7], [-5, -6]],
  ] as Pt[][]) {
    const crack = at(line);
    for (let k = 0; k + 1 < crack.length; k++) strokeCells4(c, crack[k][0], crack[k][1], crack[k + 1][0], crack[k + 1][1], 'c');
  }
  return { rows: despeckle(rowsOf(c)), x: ox, y: oy };
}

/** The jaw shut, half dropped, and open. */
const JAWS = [0, 0.25, 0.55];

const headFrames: Record<string, string[]> = {};
const headAt: Record<string, { x: number; y: number }> = {};

/** The head with one of its jaws at all nine angles, worked out the first time it is wanted. */
function ensureHeads(n: number): void {
  if (headFrames[`h${n}_0`]) return;
  const h = head(JAWS[n]);
  turned(h.rows, h.x, h.y).forEach((t, i) => {
    headFrames[`h${n}_${i}`] = t.rows;
    headAt[`h${n}_${i}`] = { x: t.x, y: t.y };
  });
}
const HEADS = new BigSheet<string>(headFrames, KEY, PALETTES);

/** The head at its point (x, y) on a heading, the jaw dropped by `jaw` (0..0.55 radians). */
export function drawWyrmHead(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, jaw: number, palette = ''): void {
  const { i, facing } = heading(ang);
  const n = jaw < 0.12 ? 0 : jaw < 0.4 ? 1 : 2;
  ensureHeads(n);
  const id = `h${n}_${i}`;
  const at = headAt[id];
  HEADS.draw(ctx, id, x, y, at.x, at.y, facing, palette);
}

/** Molten drool from a full throat: a drop stretching and falling, three frames. */
export const DROOL = new BigSheet<'d0' | 'd1' | 'd2'>({ d0: ['ce', 'de'], d1: ['ce', 'de', 'dd'], d2: ['ce', 'de', 'dd', '.c'] }, KEY);

/* -------------------------------------------------------------- the fire */

/** Flame frames: a tongue w × h, in two flickers, coolest outside. */
function flames(prefix: string, w: number, heights: readonly number[], tones: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  heights.forEach((h, i) => {
    for (let s = 0; s < 2; s++) out[`${prefix}${i}_${s}`] = despeckle(flame(w, Math.max(2, h), 11 + i * 7 + s * 31, tones));
  });
  return out;
}

/** The wall of flame behind him under the floor: 17 wide, risen to four heights. */
const PILLAR_STEPS = [10, 21, 31, 41];
const pillarFrames: Record<string, string[]> = {};
const PILLAR_FLAMES = new BigSheet<string>(pillarFrames, KEY);

/** The tongues on a burning pool. */
const TONGUE_STEPS = [3, 5, 7];
const tongueFrames: Record<string, string[]> = {};
const TONGUES = new BigSheet<string>(tongueFrames, KEY);

function ensureFire(): void {
  if (pillarFrames.w0_0) return;
  Object.assign(pillarFrames, flames('w', 17, PILLAR_STEPS, 'bcdef'));
  Object.assign(tongueFrames, flames('t', 5, TONGUE_STEPS, 'cde'));
}

/** A tongue of the wall of flame, risen to `step` (0..3), standing on (x, floor). */
export function drawPillarFlame(ctx: CanvasRenderingContext2D, step: number, flick: number, x: number, floor: number): void {
  ensureFire();
  PILLAR_FLAMES.draw(ctx, `w${step}_${flick}`, x, floor, 8, PILLAR_STEPS[step]);
}

/** A tongue on a pool, `n` (0..2) tall, standing on (x, y). */
export function drawTongue(ctx: CanvasRenderingContext2D, n: number, flick: number, x: number, y: number): void {
  ensureFire();
  TONGUES.draw(ctx, `t${n}_${flick}`, x, y, 2, TONGUE_STEPS[n]);
}

/** A pool of fire on the floor: an oval in bands, 31 × 5, white-hot at its heart. */
function poolRows(k: number): string[] {
  const c = cellsOf([], 31, 5);
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 31; x++) {
      const q = Math.hypot((x - 15) / (15.5 * k), (y - 2) / 2.6);
      if (q > 1) continue;
      c[y][x] = q < 0.35 ? 'f' : q < 0.6 ? 'e' : q < 0.82 ? 'd' : 'b';
    }
  }
  return despeckle(rowsOf(c));
}
export const POOLS = new BigSheet<'full' | 'half'>({ full: poolRows(1), half: poolRows(0.6) }, KEY);

/**
 * Where he swims under the floor: the rock split and glowing. Cracks running
 * out from over him, wider as the heat rises, and - once the spot has stopped
 * following the hero - the floor itself white-hot over him.
 */
function crackRows(spread: number): string[] {
  const w = spread * 2 + 3;
  const c = cellsOf([], w, 4);
  const mx = spread + 1;
  for (let i = -2; i <= 2; i++) {
    const a = i * 0.55;
    const pts: Pt[] = [
      [mx, 0],
      [mx + Math.sin(a) * spread * 0.5, 2],
      [mx + Math.sin(a) * spread, Math.min(3, Math.abs(i))],
    ];
    for (let k = 0; k + 1 < pts.length; k++) strokeCells4(c, pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], Math.abs(i) === 2 ? 'c' : 'd');
  }
  c[0][mx] = 'e';
  return despeckle(rowsOf(c));
}
function slabRows(): string[] {
  const c = cellsOf([], 35, 3);
  for (let y = 0; y < 3; y++) for (let x = 0; x < 35; x++) if (Math.hypot((x - 17) / 17.5, (y - 1) / 1.6) <= 1) c[y][x] = Math.abs(x - 17) < 9 ? 'f' : 'e';
  return rowsOf(c);
}
export const CRACKS = new BigSheet<'c0' | 'c1' | 'c2' | 'slab'>({ c0: crackRows(9), c1: crackRows(15), c2: crackRows(22), slab: slabRows() }, KEY);

/**
 * Heat over the floor: a few rows of one-pixel dashes, shifting every tick of
 * `t`, in the low fire tones - air shimmering, drawn as a pixel artist draws it.
 */
export function shimmer(ctx: CanvasRenderingContext2D, cx: number, floorY: number, halfWidth: number, rows: number, t: number): void {
  const ax = Math.round(cx / ART);
  const ay = Math.round(floorY / ART);
  const tick = Math.floor(t * 10);
  const hw = Math.round(halfWidth / ART);
  for (let r = 0; r < rows; r++) {
    ctx.fillStyle = r === 0 ? RAMP.fire[2] : RAMP.fire[1];
    for (let k = 0; k < 3; k++) {
      const u = hash2(tick * 7 + r * 13, k * 29);
      const len = 2 + Math.floor(hash2(k, tick + r) * 3);
      const x = ax - hw + Math.floor(u * Math.max(1, hw * 2 - len));
      ctx.fillRect(x * ART, (ay - 3 - r * 4) * ART, len * ART, ART);
    }
  }
}

/* ---------------------------------------------------------------- cinders */

/** What is left of him: lumps of cooled glass in three sizes, each at eight turns. */
const CINDER_R = [4, 7, 10];
const cinderFrames: Record<string, string[]> = {};
CINDER_R.forEach((r, s) => {
  const corners = [-r, 0, -r * 0.3, -r * 0.8, r * 0.8, -r * 0.4, r, r * 0.3, 0, r * 0.8];
  for (let i = 0; i < 8; i++) {
    const w = r * 2 + 3;
    cinderFrames[`c${s}_${i}`] = despeckle(rowsOfCells(tumble(w, w, corners, (i / 8) * Math.PI * 2, 'KoO')));
  }
});
const CINDERS = new BigSheet<string>(cinderFrames, KEY, PALETTES);

/** A cinder of radius r (logical) at a turn (radians), its middle at (x, y). */
export function drawCinder(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number, palette = ''): void {
  const ra = r / ART;
  const s = ra < 5.5 ? 0 : ra < 8.5 ? 1 : 2;
  const i = ((Math.round((rot / (Math.PI * 2)) * 8) % 8) + 8) % 8;
  const w = CINDER_R[s] * 2 + 3;
  CINDERS.draw(ctx, `c${s}_${i}`, x, y, Math.floor(w / 2), Math.floor(w / 2), 1, palette);
}

/**
 * What is worked out of him only when it is first wanted: plates, head and
 * fire, and the canvases of plates and head both ways round. warmWyrm does
 * it a little at a time from the moment he is in view, so neither the
 * game's start nor the fight pays for it at once.
 */
const PENDING: (() => void)[] = [
  ...SIZES.map((_, s) => () => ensurePlates(s)),
  ...SIZES.map((_, s) => () => ANGLES.forEach((_a, i) => PLATES.bake(`p${s}_${i}`))),
  ...JAWS.map((_, n) => () => ensureHeads(n)),
  ...JAWS.map((_, n) => () => ANGLES.forEach((_a, i) => HEADS.bake(`h${n}_${i}`))),
  ...JAWS.map((_, n) => () => ANGLES.forEach((_a, i) => HEADS.bake(`h${n}_${i}`, 'hot'))),
  ensureFire,
];

/** Works out what is still missing of him for up to `budget` ms. True once all of him is ready. */
export function warmWyrm(budget: number): boolean {
  const t0 = performance.now();
  while (PENDING.length > 0) {
    PENDING.shift()?.();
    if (performance.now() - t0 >= budget) break;
  }
  return PENDING.length === 0;
}

/** Everything as rows, for looking at outside the game. */
export function wyrmDebug(): { key: Record<string, string>; palettes: typeof PALETTES; frames: Record<string, string[]> } {
  SIZES.forEach((_, i) => ensurePlates(i));
  JAWS.forEach((_, n) => ensureHeads(n));
  ensureFire();
  return {
    key: KEY,
    palettes: PALETTES,
    frames: {
      ...plateFrames,
      ...headFrames,
      ...pillarFrames,
      ...tongueFrames,
      pool: poolRows(1),
      c0: crackRows(9),
      c1: crackRows(15),
      c2: crackRows(22),
      slab: slabRows(),
      ...cinderFrames,
      plate0: plate(12).rows,
      plate3: plate(6).rows,
      head0: head(0).rows,
      head2: head(0.55).rows,
    },
  };
}
