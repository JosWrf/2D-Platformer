import { RAMP } from '../render/palette';
import { PixelSprite } from '../render/pixel';
import { blank, plot, rows, tumble, type Grid } from '../render/sheet';

/**
 * Ankhor's art: the bust, the head and the two fists as sprites placed on the
 * art grid, the way a sixteen-bit boss is built from parts - a head that can
 * bow and look up, a torso that rises out of the floor, fists that fly.
 *
 * Everything is drawn once, into canvases, from rows of characters. The face,
 * the fist and the eye on its back are placed by hand; the headcloth's stripes,
 * the torso's round chest and the collar's bead rows follow a rule, worked out
 * when the sprite is made - every pixel still lands on the grid, and nothing
 * is ever turned or scaled by the canvas.
 *
 * Paints: sandstone in six steps of the earth ramp (lit from the upper left,
 * the shadows towards plum), lapis in three blues, gold in three steps from a
 * red-brown to yellow, and the light inside him - his eyes, his cracks, the
 * runes on his fists, the sun on his chest - in the fire ramp up to white,
 * which steps down to dull stone when it goes out.
 */

/* ------------------------------------------------------------------ paints */

const STONE = {
  A: RAMP.earth[6],
  a: RAMP.earth[5],
  s: RAMP.earth[4],
  d: RAMP.earth[3],
  D: RAMP.earth[2],
  x: RAMP.earth[1],
};
const LAPIS = { B: RAMP.blue[3], b: RAMP.blue[2], n: RAMP.blue[1] };
const GOLD = { G: RAMP.fire[3], g: RAMP.rust[3], o: RAMP.earth[3] };
const WHITE = '#ffffff';

/**
 * How bright the light inside him burns: 0 out (dull stone), 1 dim, 2 warm,
 * 3 blazing. Each glowing letter has a colour per level; the second phase
 * burns a step paler.
 *   e, E  - an eye's core and its rim
 *   c, C  - a crack's edge and its hot middle
 *   r, R  - a rune's lines and its core
 */
const GLOW_ONE: Record<string, readonly string[]> = {
  e: [RAMP.earth[3], RAMP.fire[1], RAMP.fire[3], WHITE],
  E: [RAMP.earth[2], RAMP.rust[1], RAMP.fire[1], RAMP.fire[2]],
  c: [RAMP.earth[2], RAMP.rust[1], RAMP.fire[1], RAMP.fire[2]],
  C: [RAMP.earth[1], RAMP.fire[1], RAMP.fire[2], RAMP.fire[3]],
  r: [RAMP.earth[2], RAMP.rust[1], RAMP.fire[1], RAMP.fire[2]],
  R: [RAMP.earth[3], RAMP.fire[1], RAMP.fire[3], WHITE],
};
/** The second half burns a step further up the same ramp: paler, whiter. */
const GLOW_TWO: Record<string, readonly string[]> = {
  e: [RAMP.earth[3], RAMP.fire[2], WHITE, WHITE],
  E: [RAMP.earth[2], RAMP.fire[1], RAMP.fire[2], RAMP.fire[3]],
  c: [RAMP.earth[2], RAMP.fire[1], RAMP.fire[2], RAMP.fire[3]],
  C: [RAMP.earth[1], RAMP.fire[2], RAMP.fire[3], WHITE],
  r: [RAMP.earth[2], RAMP.fire[1], RAMP.fire[2], RAMP.fire[3]],
  R: [RAMP.earth[3], RAMP.fire[2], WHITE, WHITE],
};

export type Glow = 0 | 1 | 2 | 3;

/** The key for one glow level of one phase. */
function keyFor(level: Glow, phase: 1 | 2): Record<string, string> {
  const glow = phase === 2 ? GLOW_TWO : GLOW_ONE;
  const key: Record<string, string> = { ...STONE, ...LAPIS, ...GOLD, w: WHITE };
  for (const [k, v] of Object.entries(glow)) key[k] = v[level];
  return key;
}

/** Every letter white: the flash of a blow, as a silhouette. */
const FLASH_KEY: Record<string, string> = Object.fromEntries(
  [...Object.keys(STONE), ...Object.keys(LAPIS), ...Object.keys(GOLD), ...Object.keys(GLOW_ONE), 'w'].map((k) => [k, WHITE]),
);

/* --------------------------------------------------------------- helpers */

/** A row from runs: "3. 5a 2D" is three blanks, five a, two D. */
function rl(spec: string): string {
  let out = '';
  for (const t of spec.trim().split(/\s+/)) {
    const m = /^(\d+)(.)$/.exec(t);
    if (!m) throw new Error(`bad run ${t}`);
    out += m[2].repeat(Number(m[1]));
  }
  return out;
}

/** Lays a grid onto cells at (dx, dy); '.' lets through. */
function stamp(cells: string[][], g: Grid, dx: number, dy: number): void {
  for (let y = 0; y < g.length; y++) {
    for (let x = 0; x < g[y].length; x++) {
      const c = g[y][x];
      if (c !== '.' && c !== ' ') plot(cells, x + dx, y + dy, c);
    }
  }
}

/** Points along a polyline, Bresenham's, in cell coordinates. */
function trace(pts: readonly number[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i + 3 < pts.length; i += 2) {
    let x = pts[i];
    let y = pts[i + 1];
    const x1 = pts[i + 2];
    const y1 = pts[i + 3];
    const dx = Math.abs(x1 - x);
    const dy = -Math.abs(y1 - y);
    const sx = x < x1 ? 1 : -1;
    const sy = y < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      if (!out.length || out[out.length - 1][0] !== x || out[out.length - 1][1] !== y) out.push([x, y]);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }
  return out;
}

/**
 * A crack along a polyline: hot in its middle third, its edge colour towards
 * the ends, and on stone a dark lip on its right where the groove falls into
 * shadow - so a glowing line still reads on stone as light as itself.
 */
function crack(cells: string[][], pts: readonly number[], onlyOn?: (c: string) => boolean): void {
  const path = trace(pts);
  const on = new Set<string>();
  path.forEach(([x, y], i) => {
    const t = i / Math.max(1, path.length - 1);
    if (onlyOn && !onlyOn(cells[y]?.[x] ?? '.')) return;
    plot(cells, x, y, t > 0.25 && t < 0.75 ? 'C' : 'c');
    on.add(`${x},${y}`);
  });
  if (!onlyOn) return;
  for (const p of on) {
    const [x, y] = p.split(',').map(Number);
    if (!on.has(`${x + 1},${y}`) && onlyOn(cells[y]?.[x + 1] ?? '.')) plot(cells, x + 1, y, 'D');
  }
}

/* ------------------------------------------------------------------ head */

/*
 * The head: 45 × 50 art pixels, its middle column 22, the centre of the face
 * (the head's point in the game) at row 24. The nemes headcloth is worked out
 * by rule - its outline, and lapis and gold stripes that bend round the dome
 * and run level down the lappets - and the face, the uraeus and the beard are
 * placed over it by hand.
 */
export const HEAD_W = 45;
export const HEAD_H = 50;
export const HEAD_CX = 22;
export const HEAD_CY = 24;

/** Where the headcloth starts on the left of each row (it is symmetric). */
function clothLeft(row: number): number {
  const dome = [99, 99, 17, 14, 12, 11, 10, 9, 9, 8, 8, 7, 7, 6, 6, 5, 5, 4, 4, 3, 3, 2];
  if (row < dome.length) return dome[row];
  if (row < 32) return 2;
  if (row < 42) return 1;
  return 0;
}

function nemes(): string[][] {
  const cells = blank(HEAD_W, HEAD_H);
  for (let y = 0; y < HEAD_H; y++) {
    const l = clothLeft(y);
    if (l > HEAD_CX) continue;
    const r = HEAD_W - 1 - l;
    for (let x = l; x <= r; x++) {
      // Below the jaw only the two lappets hang, with the neck between them.
      if (y >= 29 && x > 10 && x < 34) continue;
      // The bottoms of the lappets, rounded.
      if (y === HEAD_H - 1 && (x === l || x === 10 || x === 34 || x === r)) continue;
      // The stripes bend down round the dome and run level everywhere else.
      const off = Math.abs(x - HEAD_CX);
      const bend = y < 10 ? Math.round((off / 14) ** 2 * 2) : 0;
      const p = (((y - bend + 1) % 5) + 5) % 5;
      // Lit from the upper left as a dome on top and a drum below, and darker
      // where the wings fold back behind the cheeks.
      const nx = (x - HEAD_CX) / (y < 12 ? 15 : 23);
      const ny = y < 12 ? (y - 13) / 15 : 0;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const light = -0.55 * nx - 0.5 * ny + 0.67 * nz;
      const fold = y >= 8 && y < 29 && (x === 9 || x === 35 || x === 36);
      const lit = light > 0.78 && !fold;
      const shade = light < 0.42 || fold;
      let c: string;
      if (p < 2) {
        // Gold: two rows, the upper catching the light.
        c = p === 0 ? (lit ? 'G' : shade ? 'o' : 'g') : shade ? 'o' : lit ? 'g' : 'o';
      } else {
        // Lapis: three rows, light, body, shadow.
        c = p === 2 ? (lit ? 'B' : shade ? 'n' : 'b') : p === 3 ? (shade ? 'n' : 'b') : 'n';
      }
      // The silhouette's own edges: lit on the left, dark on the right.
      if (x === l && y > 6) c = p < 2 ? 'G' : 'B';
      if (x === r && y > 6) c = p < 2 ? 'o' : 'n';
      // The inner edges of the lappets fold under.
      if (y >= 29 && (x === 10 || x === 34)) c = p < 2 ? 'o' : 'n';
      plot(cells, x, y, c);
    }
  }
  return cells;
}

/** The face, placed by hand: 25 columns (head columns 10-34), head rows 8-39. */
const FACE: Grid = [
  '1. 6G 15g 2o 1.',
  '1. 1g 3G 7g 1b 10g 1o 1.',
  '1. 11o 1n 11o 1.',
  '1. 3s 14a 4s 2d 1.',
  '1. 1a 5A 12a 3s 2d 1.',
  '1. 1a 4A 13a 3s 2d 1.',
  '1. 1a 3A 14a 3s 2d 1.',
  '1. 1a 1A 16a 3s 2d 1.',
  '1. 18a 3s 2d 1.',
  '1. 1a 7s 5a 8s 2d 1.',
  '1. 1a 8s 1a 1A 1a 9s 2d 1.',
  '1. 1a 8s 1a 1A 1a 9s 2d 1.',
  '1. 1a 8s 1a 1A 1a 9s 2d 1.',
  '1. 2a 7s 1a 1A 1a 1s 1d 7s 2d 1.',
  '1s 1a 4A 4a 1a 1A 1a 1s 1d 7s 3d',
  '1s 2a 3A 4a 1a 1A 1a 1s 1d 1s 2a 4s 3d',
  '1s 9a 1a 1A 1a 1s 1d 1s 1a 5s 3d',
  '2s 7a 1a 2A 1a 1s 2d 6s 3d',
  '2s 6a 1s 1a 2A 1a 1s 3d 5s 3d',
  '2s 5a 3s 1D 3s 1D 2d 4s 4d',
  '2s 6a 1s 4s 3d 1d 4s 4d',
  '1. 1s 5a 1s 4s 1d 4s 1s 4s 2d 1.',
  '1. 1s 5a 1s 1d 7D 1d 3s 2d 2d 1.',
  '1. 1s 5a 2s 1a 2A 3a 2s 3s 4d 1.',
  '2. 1s 5a 2s 5d 1s 4s 3d 2.',
  '2. 1s 4a 2s 1a 3A 1a 1s 4s 4d 2.',
  '3. 1s 3a 2s 1a 2A 2a 1s 3s 4d 3.',
  '3. 2s 2a 2s 4a 2s 3s 4d 3.',
  '4. 2s 1a 3s 2a 3s 2s 4d 4.',
  '5. 3s 7s 1d 4d 5.',
  '6. 13d 6.',
  '8. 9D 8.',
].map(rl);

/** The uraeus on the brow: head columns 20-24, rows 0-7. */
const URAEUS: Grid = ['..G..', '.Ggo.', 'gGbgo', 'gGbgo', '.gbo.', '..g..', '..g..', '..o..'];

/** The false beard, lapis bound in gold: head columns 19-25, rows 37-49. */
const BEARD: Grid = [
  '1. 1G 3g 1o 1.',
  '1B 4b 2n',
  '1B 1b 1n 2b 2n',
  '1G 4g 2o',
  '1B 4b 2n',
  '1B 1b 1n 2b 2n',
  '1G 4g 2o',
  '1B 4b 2n',
  '1. 1B 1n 2b 1n 1.',
  '1. 1G 3g 1o 1.',
  '1. 1B 2b 2n 1.',
  '2. 1b 2n 2.',
  '2. 2g 3.',
].map(rl);

export type HeadLook = 'front' | 'up' | 'down';

/**
 * One eye, brow and kohl line, at face columns x0.. (the left eye; the right
 * is its mirror), shifted dy rows. 'down' is a heavy-lidded slit.
 */
function eye(face: string[][], left: boolean, look: HeadLook): void {
  const put = (x: number, y: number, c: string): void => plot(face, left ? x : 24 - x, y, c);
  const dy = look === 'up' ? -1 : 0;
  const lid = look === 'down' ? 1 : 0;
  // The brow ridge catches the light; the brow is a carved line, its outer end dipping.
  for (let x = 3; x <= 8; x++) put(x, 15 + dy + lid, left ? 'A' : 'a');
  for (let x = 3; x <= 8; x++) put(x, 16 + dy + lid, 'D');
  put(2, 17 + dy + lid, 'D');
  // Upper lid.
  for (let x = 3; x <= 8; x++) put(x, 18 + dy + lid, 'D');
  if (look === 'down') {
    // The lids half shut: one row of light.
    put(2, 20, 'D');
    'EeeeeE'.split('').forEach((c, i) => put(3 + i, 20, c));
    put(9, 20, 'D');
    for (let x = 1; x <= 8; x++) put(x, 21, 'D');
    return;
  }
  put(2, 19 + dy, 'D');
  'EeeeeE'.split('').forEach((c, i) => put(3 + i, 19 + dy, c));
  put(9, 19 + dy, 'D');
  put(1, 20 + dy, 'D');
  put(2, 20 + dy, 'D');
  put(3, 20 + dy, 'D');
  'EeeE'.split('').forEach((c, i) => put(4 + i, 20 + dy, c));
  put(8, 20 + dy, 'D');
  for (let x = 4; x <= 7; x++) put(x, 21 + dy, 'D');
}

function head(look: HeadLook): string[] {
  const cells = nemes();
  // The face over the cloth.
  // Its rows are head rows 8-39; eye() works in head rows.
  const faceRows = blank(25, 40);
  stamp(faceRows, FACE, 0, 8);
  eye(faceRows, true, look);
  eye(faceRows, false, look);
  // A crack down the right of the brow and on through the eye, with the light behind it.
  crack(faceRows, [18, 11, 17, 13, 19, 15]);
  crack(faceRows, [19, 22, 18, 24, 20, 26, 21, 28]);
  stamp(cells, rows(faceRows), 10, 0);
  stamp(cells, URAEUS, 20, 0);
  stamp(cells, BEARD, 19, 37);
  return rows(cells);
}

export const HEAD: Readonly<Record<HeadLook, Grid>> = {
  front: head('front'),
  up: head('up'),
  down: head('down'),
};

/* ----------------------------------------------------------------- torso */

/*
 * The bust: chest and shoulders, 109 × 70 art pixels standing on its bottom
 * edge, its middle column 54. A round chest lit from the upper left, lapis
 * shoulder caps rimmed in gold, the stumps where the arms broke off (each
 * with a ring of runes), the broad collar of bead rows under the neck, the
 * setting of the sun disc, and the cracks the light inside him shows
 * through. The sun's fire itself is a sprite of its own (SUN), laid over the
 * setting, because it brightens before every move.
 */
export const TORSO_W = 109;
export const TORSO_H = 70;
export const TORSO_CX = 54;
/** The sun on his breast, in torso cells. */
export const SUN_X = 54;
export const SUN_Y = 39;

/** The light: from the upper left and in front. */
const LX = -0.5;
const LY = -0.55;
const LZ = 0.67;

/**
 * The bust as a relief: the forms a sculptor roughs out - a barrel of a chest,
 * the belly going down into the ground, two slabs of pectoral, the deltoids,
 * the base of the neck - each a half-ellipsoid (centre, radii across, down and
 * out of the stone, in art pixels from the middle of his foot, y up negative).
 * Where they meet they crease, and the light follows the forms.
 */
const FORMS: readonly (readonly [number, number, number, number, number])[] = [
  [-14, -50, 15, 10, 25],
  [14, -50, 15, 10, 25],
  [-38, -58, 14, 11, 19],
  [38, -58, 14, 11, 19],
  [0, -65, 17, 7, 15],
  // What is left of the arms: the tops of them, broken off below the armlet.
  [-46, -46, 7, 13, 15],
  [46, -46, 7, 13, 15],
];

/** Where an arm broke: the ragged lower edge of its stump, rows up from the floor per column. */
const BREAK = [0, 1, 0, 2, 1, 1, 0, 2, 0, 1, 2, 0, 1, 0];

/**
 * The trunk under those forms: a barrel turned on a lathe, its half-width and
 * its depth at each height (art pixels up from the floor), so that it swells
 * from the ground to the chest and rounds over into the shoulders without a
 * seam anywhere.
 */
const TRUNK: readonly (readonly [number, number, number])[] = [
  [0, 36, 9],
  [12, 37.5, 15],
  [26, 40.5, 21],
  [40, 42, 24],
  [52, 41, 22],
  [60, 37, 18],
  [66, 30, 13],
  [70, 18, 8],
  [71, 0, 0],
];

/** Catmull-Rom between the profile's knots: smooth, so the light has no seams. */
function trunk(up: number): [number, number] {
  const n = TRUNK.length;
  for (let i = 1; i < n; i++) {
    if (up > TRUNK[i][0]) continue;
    const p0 = TRUNK[Math.max(0, i - 2)];
    const p1 = TRUNK[i - 1];
    const p2 = TRUNK[i];
    const p3 = TRUNK[Math.min(n - 1, i + 1)];
    const t = (up - p1[0]) / (p2[0] - p1[0]);
    const cr = (k: 1 | 2): number =>
      0.5 *
      (2 * p1[k] +
        (-p0[k] + p2[k]) * t +
        (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t +
        (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t * t * t);
    return [Math.max(0, cr(1)), Math.max(0, cr(2))];
  }
  return [0, 0];
}

function relief(x: number, y: number): number {
  let z = 0;
  const [w, d] = trunk(-y);
  if (w > 0 && Math.abs(x) < w) z = d * Math.sqrt(1 - (x / w) ** 2);
  for (const [cx, cy, rx, ry, rz] of FORMS) {
    if (Math.abs(cx) > 40 && y > -37 - BREAK[Math.abs(Math.floor(x)) % BREAK.length]) continue;
    const u = (x - cx) / rx;
    const v = (y - cy) / ry;
    const k = 1 - u * u - v * v;
    if (k > 0) z = Math.max(z, rz * Math.sqrt(k));
  }
  return y > 0 ? 0 : z;
}

const STONE_STEPS = 'DdsaA';

function stoneTone(light: number): string {
  return light > 0.9 ? 'A' : light > 0.7 ? 'a' : light > 0.46 ? 's' : light > 0.2 ? 'd' : 'D';
}

/** Rotated ellipse test: the point's coordinates in the ellipse's own frame, as fractions of its radii. */
function inEllipse(x: number, y: number, cx: number, cy: number, rx: number, ry: number, rot: number): [number, number] {
  const dx = x - cx;
  const dy = y - cy;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return [(dx * c + dy * s) / rx, (-dx * s + dy * c) / ry];
}

function lightOf(ex: number, ey: number, rot: number): number {
  const q = Math.min(1, ex * ex + ey * ey);
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const nx = ex * c - ey * s;
  const ny = ex * s + ey * c;
  return LX * nx + LY * ny + LZ * Math.sqrt(1 - q);
}

function torso(): string[] {
  const cells = blank(TORSO_W, TORSO_H);
  for (let row = 0; row < TORSO_H; row++) {
    const y = row + 0.5 - TORSO_H;
    const up = -y;
    for (let col = 0; col < TORSO_W; col++) {
      const x = col + 0.5 - (TORSO_CX + 0.5);
      const z = relief(x, y);
      if (z < 0.8) continue;
      // The slope of the relief is the turn of the surface.
      const gx = (relief(x + 0.5, y) - relief(x - 0.5, y)) * 0.9;
      const gy = (relief(x, y + 0.5) - relief(x, y - 0.5)) * 0.9;
      const len = Math.hypot(gx, gy, 1);
      let k = STONE_STEPS.indexOf(stoneTone((LX * -gx + LY * -gy + LZ) / len));
      const arm = Math.abs(x) > 39;
      // The pleats of his kilt below the belt, cut into the stone.
      if (!arm && up < 12 && col % 3 === 0) k = Math.max(0, k - 1);
      // Buried: the foot of him sits in the shadow of the rubble.
      if (up < 7 + BREAK[col % BREAK.length]) k = Math.max(0, k - 1);
      if (up < 3) k = Math.max(0, k - 1);
      let c = STONE_STEPS[k];
      // The belt: gold, lit along its top, with a lapis knot at the front.
      if (!arm && up >= 12 && up < 16) {
        const lit = k >= 3;
        if (Math.abs(x) < 4.5) c = up >= 15 ? 'g' : Math.abs(x) > 3.5 || up < 13 ? 'n' : lit ? 'B' : 'b';
        else c = up >= 15 ? (lit ? 'G' : 'g') : up >= 13 ? (k >= 2 ? 'g' : 'o') : 'o';
      }
      plot(cells, col, row, c);
    }
  }
  // The broad collar under the neck: rows of gold and lapis, and a fringe of drops.
  const bands: [number, number, 'gold' | 'lapis'][] = [
    [8.5, 12.5, 'gold'],
    [12.5, 16.5, 'lapis'],
    [16.5, 20.5, 'gold'],
    [20.5, 24, 'lapis'],
  ];
  for (let row = 0; row < TORSO_H; row++) {
    const y = row + 0.5 - TORSO_H;
    for (let col = 0; col < TORSO_W; col++) {
      if (cells[row][col] === '.') continue;
      const x = col + 0.5 - (TORSO_CX + 0.5);
      const ey = y + 70;
      if (ey < 0) continue;
      const ex = x / 1.85;
      const u = Math.hypot(ex, ey);
      const th = Math.atan2(ey, ex);
      if (th < 0.07 * Math.PI || th > 0.93 * Math.PI) continue;
      const band = bands.find(([a, b]) => u >= a && u < b);
      if (!band) continue;
      const t = (u - band[0]) / (band[1] - band[0]);
      const nx = x / 46;
      const light = LX * nx + LZ * Math.sqrt(Math.max(0, 1 - nx * nx)) - 0.12 * t;
      const lit = light > 0.62;
      const shade = light < 0.3;
      let c: string;
      if (band[2] === 'gold') c = t < 0.3 ? (lit ? 'G' : shade ? 'o' : 'g') : t < 0.75 ? (shade ? 'o' : 'g') : 'o';
      else c = t < 0.3 ? (lit ? 'B' : shade ? 'n' : 'b') : t < 0.75 ? (shade ? 'n' : 'b') : 'n';
      plot(cells, col, row, c);
    }
  }
  for (let i = 0; i <= 10; i++) {
    const th = Math.PI * (0.12 + (i / 10) * 0.76);
    const bx = Math.round(TORSO_CX + 1.85 * 25.6 * Math.cos(th));
    const by = Math.round(TORSO_H - 70 + 25.6 * Math.sin(th));
    const lit = bx < TORSO_CX + 10;
    plot(cells, bx, by, lit ? 'G' : 'g');
    plot(cells, bx + 1, by, 'g');
    plot(cells, bx, by + 1, 'g');
    plot(cells, bx + 1, by + 1, 'o');
  }
  // The arm stumps: a gold armlet with its ring of runes, and the break below it.
  for (const side of [-1, 1]) {
    for (let col = 0; col < TORSO_W; col++) {
      const x = col + 0.5 - (TORSO_CX + 0.5);
      if (Math.abs(x) < 40 || Math.sign(x) !== side) continue;
      let low = -1;
      for (let row = 0; row < TORSO_H; row++) if (cells[row][col] !== '.') low = row;
      for (let row = 0; row < TORSO_H; row++) {
        if (cells[row][col] === '.') continue;
        const up = TORSO_H - row - 0.5;
        if (up >= 45 && up < 49) {
          const top = up >= 48;
          const lit = side < 0;
          const rune = up >= 46 && up < 47 && Math.floor(x) % 3 !== 0;
          plot(cells, col, row, rune ? 'r' : top ? (lit ? 'G' : 'g') : up < 46 ? 'o' : lit ? 'g' : 'o');
        } else if (row === low || (row === low - 1 && Math.floor(x) % 2 === 0)) {
          // The broken face, rough and in shadow.
          plot(cells, col, row, row === low ? 'x' : 'D');
        }
      }
    }
  }
  // Shoulder caps, lapis rimmed in gold.
  for (const side of [-1, 1]) {
    const cx = TORSO_CX + 0.5 + side * 38;
    const cy = TORSO_H - 59;
    const rot = side * 0.35;
    for (let row = 0; row < TORSO_H; row++) {
      for (let col = 0; col < TORSO_W; col++) {
        const [ex, ey] = inEllipse(col + 0.5, row + 0.5, cx, cy, 13, 9, rot);
        const q = ex * ex + ey * ey;
        if (q > 1) continue;
        const light = lightOf(ex, ey, rot);
        const rim = q > 0.7 && ey < -0.25;
        if (rim) plot(cells, col, row, light > 0.74 ? 'G' : light > 0.4 ? 'g' : 'o');
        else plot(cells, col, row, light > 0.86 ? 'B' : light > 0.5 ? 'b' : 'n');
      }
    }
  }
  // The setting of the sun: a socket of dark bronze in a gold ring.
  for (let row = 0; row < TORSO_H; row++) {
    for (let col = 0; col < TORSO_W; col++) {
      const dx = col + 0.5 - (SUN_X + 0.5);
      const dy = row + 0.5 - (SUN_Y + 0.5);
      const r = Math.hypot(dx, dy);
      if (r < 8.6) plot(cells, col, row, 'x');
      else if (r < 10.6) {
        const light = (-dx - dy) / r;
        plot(cells, col, row, r < 9.6 ? (light > 0.3 ? 'G' : light > -0.4 ? 'g' : 'o') : light > -0.2 ? 'g' : 'o');
      }
    }
  }
  // Cracks, with the light inside him showing through.
  const stone = (c: string): boolean => 'AasdD'.includes(c);
  for (const pts of TORSO_CRACKS) crack(cells, pts, stone);
  return rows(cells);
}

/** The cracks the light shows through, in torso cells. */
const TORSO_CRACKS: readonly (readonly number[])[] = [
  [25, 19, 31, 30, 27, 42, 33, 54],
  [79, 16, 75, 27, 82, 38],
  [64, 55, 71, 62, 68, 69],
  [42, 57, 36, 66],
  [88, 47, 84, 55],
];

/** Cracks that open as he dies, in three steps. */
const DEATH_CRACKS: readonly (readonly (readonly number[])[])[] = [
  [
    [40, 10, 46, 21, 43, 33],
    [70, 12, 66, 24, 69, 30],
  ],
  [
    [54, 49, 50, 58, 56, 69],
    [20, 40, 14, 52, 18, 64],
    [96, 36, 90, 46],
  ],
  [
    [54, 29, 51, 20, 55, 11, 53, 2],
    [86, 28, 92, 44, 88, 58, 91, 68],
    [30, 30, 38, 41, 34, 50],
  ],
];

function deathCracks(step: number): string[] {
  const cells = blank(TORSO_W, TORSO_H);
  for (let i = 0; i <= step; i++) for (const pts of DEATH_CRACKS[i]) crack(cells, pts);
  return rows(cells);
}

export const TORSO: Grid = torso();
export const TORSO_DEATH: readonly Grid[] = [deathCracks(0), deathCracks(1), deathCracks(2)];

/**
 * The sun's fire, 27 × 27 around its middle: a disc in three bands - core,
 * body, rim - and twelve rays, turned a third of the way between two rays in
 * each of its three frames.
 */
export const SUN_R = 13;
function sun(turn: number): string[] {
  const n = SUN_R * 2 + 1;
  const cells = blank(n, n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const r = Math.hypot(x + 0.5 - (SUN_R + 0.5), y + 0.5 - (SUN_R + 0.5));
      if (r < 2.6) plot(cells, x, y, 'R');
      else if (r < 4.6) plot(cells, x, y, 'C');
      else if (r < 6.6) plot(cells, x, y, 'c');
    }
  }
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2 + (turn / 3) * (Math.PI / 6);
    const pts = [7.6, 11.4].flatMap((r) => [Math.round(SUN_R + Math.cos(a) * r), Math.round(SUN_R + Math.sin(a) * r)]);
    trace(pts).forEach(([x, y], i) => plot(cells, x, y, i === 0 ? 'c' : 'E'));
  }
  return rows(cells);
}
export const SUN: readonly Grid[] = [sun(0), sun(1), sun(2)];

/* ------------------------------------------------------------------ mound */

/** The paving he broke coming up: a heap of slabs 137 × 12, standing on its bottom edge. */
export const MOUND_W = 137;
export const MOUND_H = 12;
function mound(): string[] {
  const cells = blank(MOUND_W, MOUND_H);
  const mid = (MOUND_W - 1) / 2;
  for (let x = 0; x < MOUND_W; x++) {
    const k = 1 - ((x - mid) / (mid + 1)) ** 2;
    const h = Math.round(5 * Math.sqrt(Math.max(0, k)));
    for (let i = 0; i < h; i++) plot(cells, x, MOUND_H - 1 - i, i === h - 1 ? 'D' : 'x');
  }
  // Slabs tipped up out of the floor, each a lit top, a face and a dark side.
  for (let i = -5; i <= 5; i++) {
    const cx = Math.round(mid + i * 12);
    const hw = 4 + ((i * 3 + 7) % 2);
    const h = 4 + (((i * 7 + 11) % 5) + 5) % 5;
    const tilt = i % 2 === 0 ? 1 : -1;
    for (let x = cx - hw; x <= cx + hw; x++) {
      const t = (x - cx) / hw;
      const top = MOUND_H - h + Math.round(t * tilt * 1.4);
      for (let y = Math.max(0, top); y < MOUND_H; y++) {
        const edge = x === cx + hw;
        const c = y === top ? (x < cx ? 'a' : 's') : y === top + 1 ? 's' : edge ? 'x' : y > MOUND_H - 3 ? 'D' : 'd';
        plot(cells, x, y, c);
      }
    }
  }
  return rows(cells);
}
export const MOUND: Grid = mound();

/** Stones held up round his shoulders by nothing but will: three sizes. */
export const PEBBLES: readonly Grid[] = [['sd', 'dD'], ['asd', 'sdD'], ['ass', 'sdd', 'dDD']];

/** The pieces of a broken fist, three sizes at eight angles each, lit from the upper left whatever way up. */
const SHARD_CORNERS = [-1, -0.3, -0.2, -0.8, 0.9, -0.2, 0.4, 0.7, -0.7, 0.5];
export const SHARDS: readonly (readonly Grid[])[] = [3, 4.5, 6].map((r) => {
  const n = Math.ceil(r * 2) + 3;
  const corners = SHARD_CORNERS.map((v) => v * r);
  return Array.from({ length: 8 }, (_, k) => rows(tumble(n, n, corners, (k / 8) * Math.PI * 2, 'Ddsa')));
});

/* ------------------------------------------------------------------- fist */

/*
 * A fist, 30 × 28, seen from above with the knuckles down: a lapis cuff banded
 * in gold, the back of the hand with the Eye of Horus cut into it, four
 * knuckles and the curled fingers under them, the thumb folded round on the
 * left (the right hand's inside; the left hand is its mirror). The point the
 * game moves is column 15, row 15.
 */
export const FIST_W = 30;
export const FIST_H = 28;
export const FIST_PX = 15;
export const FIST_PY = 15;

const KNUCKLES = [6, 12, 18, 24];

function fistBody(): string[][] {
  const c = blank(FIST_W, FIST_H);
  // The back of the hand.
  for (let y = 5; y <= 17; y++) {
    for (let x = 3; x <= 27; x++) {
      if ((y === 5 && (x < 5 || x > 25)) || (y === 6 && (x < 4 || x > 26))) continue;
      const u = (x - 3) / 24;
      const v = (y - 5) / 12;
      const b = 0.62 * (1 - u) + 0.38 * (1 - v);
      plot(c, x, y, b > 0.8 ? 'A' : b > 0.52 ? 'a' : b > 0.3 ? 's' : 'd');
    }
  }
  // Knuckles, and the curled fingers under them.
  for (const kx of KNUCKLES) {
    for (let y = 15; y <= 26; y++) {
      for (let x = kx - 2; x <= kx + 2; x++) {
        const end = x === kx - 2 || x === kx + 2;
        if ((y === 15 || y === 26) && end) continue;
        let t: string;
        if (y <= 19) {
          const l = x - kx + (y - 17);
          t = l < -2 ? 'A' : l < 0 ? 'a' : l < 2 ? 's' : 'd';
        } else if (y === 20) t = 'd';
        else if (y <= 22) t = x === kx - 2 ? 'a' : x === kx + 2 ? 'd' : 's';
        else if (y <= 24) t = x === kx + 2 ? 'D' : 'd';
        else t = 'D';
        plot(c, x, y, t);
      }
    }
  }
  // The creases between the fingers.
  for (const gx of [9, 15, 21]) for (let y = 17; y <= 25; y++) plot(c, gx, y, y < 20 ? 'd' : 'D');
  // The right edge of the hand, past the little finger, in its own shadow.
  for (let y = 7; y <= 22; y++) plot(c, 28, y, y > 19 ? 'D' : 'd');
  // The thumb, folded round on the left.
  for (let y = 9; y <= 22; y++) {
    for (let x = 0; x <= 6; x++) {
      const dx = (x + 0.5 - 3.4) / 3.5;
      const dy = (y + 0.5 - 15.5) / 7;
      const q = dx * dx + dy * dy;
      if (q > 1) continue;
      const l = -0.7 * dx - 0.5 * dy;
      let t = l > 0.45 ? 'A' : l > 0.05 ? 'a' : l > -0.4 ? 's' : 'd';
      if (dx > 0.62) t = 'D';
      plot(c, x, y, t);
    }
  }
  // Its nail.
  plot(c, 1, 19, 'A');
  plot(c, 2, 19, 'A');
  plot(c, 1, 20, 'a');
  plot(c, 2, 20, 's');
  // The cuff.
  const cuff = ['15G 7g', '3B 15b 4n', '2B 16b 4n', '12G 9g 1o', '2b 20n'];
  cuff.forEach((spec, y) => stamp(c, [rl(spec)], 5, y));
  return c;
}

/** The Eye of Horus, cut into the back of the hand: lines and a core, on a recessed plate. */
const WEDJAT: Grid = [
  '.rrrrrrr....',
  '............',
  '..rrrrrr....',
  '.r..RR..rrrr',
  '..rrrrrr....',
  '....r...r...',
  '....r....r..',
  '...r....rr..',
];

function wedjat(c: string[][], ox: number, oy: number): void {
  // The plate it is cut into.
  for (let y = oy - 1; y <= oy + WEDJAT.length; y++) {
    for (let x = ox - 1; x <= ox + 12; x++) {
      const dx = (x + 0.5 - (ox + 6)) / 7.2;
      const dy = (y + 0.5 - (oy + 4)) / 5.4;
      if (dx * dx + dy * dy <= 1 && c[y]?.[x] && c[y][x] !== '.') plot(c, x, y, 'D');
    }
  }
  stamp(c, WEDJAT, ox, oy);
}

function fistFront(): string[] {
  const c = fistBody();
  wedjat(c, 9, 7);
  return rows(c);
}

/** Transposed: knuckles to the right, thumb on top, the light still from the upper left. */
function transpose(g: string[][]): string[][] {
  const out = blank(g.length, g[0].length);
  for (let y = 0; y < g.length; y++) for (let x = 0; x < g[0].length; x++) out[x][y] = g[y][x];
  return out;
}

function fistSide(): string[] {
  const c = transpose(fistBody());
  wedjat(c, 8, 10);
  return rows(c);
}

export const FIST: Readonly<Record<'front' | 'side', Grid>> = { front: fistFront(), side: fistSide() };

/**
 * The fist's afterimage while it falls or sweeps: its silhouette in one shade
 * of its stone, with the light of its rune drawn out through it in a streak.
 */
function ghost(g: Grid, letter: string, streak: (x: number, y: number) => boolean): string[] {
  return g.map((r, y) => r.replace(/[^.]/g, (_c, x: number) => (streak(x, y) ? 'r' : letter)));
}
const FRONT_STREAK = (x: number): boolean => x === 14 || x === 15;
const SIDE_STREAK = (_x: number, y: number): boolean => y === 13 || y === 14;
export const FIST_GHOST: Readonly<Record<'front' | 'side', readonly [Grid, Grid]>> = {
  front: [ghost(FIST.front, 'd', FRONT_STREAK), ghost(FIST.front, 'D', FRONT_STREAK)],
  side: [ghost(FIST.side, 'd', SIDE_STREAK), ghost(FIST.side, 'D', SIDE_STREAK)],
};

/**
 * The ring of runes that turns round the wrist while a fist winds up: dashes
 * on an ellipse 41 × 11, in six steps of their turning; the half behind the
 * wrist and the half in front as separate frames.
 */
export const RING_W = 41;
export const RING_H = 11;
function ring(step: number, front: boolean): string[] {
  const cells = blank(RING_W, RING_H);
  const cx = (RING_W - 1) / 2;
  const cy = (RING_H - 1) / 2;
  const pts: [number, number][] = [];
  for (let i = 0; i < 160; i++) {
    const a = (i / 160) * Math.PI * 2;
    const p: [number, number] = [Math.round(cx + Math.cos(a) * 20), Math.round(cy + Math.sin(a) * 5)];
    const last = pts[pts.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) pts.push(p);
  }
  pts.forEach(([x, y], i) => {
    if ((i + step) % 6 >= 3) return;
    if (front !== y >= cy) return;
    plot(cells, x, y, y >= cy ? 'R' : 'r');
  });
  return rows(cells);
}
export const RING: Readonly<Record<'back' | 'front', readonly Grid[]>> = {
  back: Array.from({ length: 6 }, (_, k) => ring(k, false)),
  front: Array.from({ length: 6 }, (_, k) => ring(k, true)),
};

/* --------------------------------------------------------------- sprites */

const cache = new Map<string, PixelSprite>();

/** A grid as a sprite in one glow level of one phase (or the flash), made once. */
export function sprite(id: string, grid: Grid, level: Glow, phase: 1 | 2, flash = false): PixelSprite {
  const k = `${id}|${flash ? 'flash' : `${phase}${level}`}`;
  let s = cache.get(k);
  if (!s) {
    s = new PixelSprite(grid, flash ? FLASH_KEY : keyFor(level, phase));
    cache.set(k, s);
  }
  return s;
}

/** For previews: the key a grid is drawn in. */
export function previewKey(level: Glow, phase: 1 | 2): Record<string, string> {
  return keyFor(level, phase);
}

/** One glowing letter's colour at a level of a phase: for what is drawn with the pen. */
export function glowColor(letter: 'e' | 'E' | 'c' | 'C' | 'r' | 'R', level: Glow, phase: 1 | 2): string {
  return (phase === 2 ? GLOW_TWO : GLOW_ONE)[letter][level];
}

/** The side views of the ring of runes: the ring turned to stand round a wrist that points sideways. */
function transposeGrid(g: Grid): string[] {
  const out: string[] = [];
  const w = Math.max(...g.map((r) => r.length));
  for (let x = 0; x < w; x++) {
    let row = '';
    for (let y = 0; y < g.length; y++) row += g[y][x] ?? '.';
    out.push(row);
  }
  return out;
}
export const RING_SIDE: Readonly<Record<'back' | 'front', readonly Grid[]>> = {
  back: RING.back.map(transposeGrid),
  front: RING.front.map(transposeGrid),
};

const rings = new Map<string, readonly (readonly [number, number])[]>();

/**
 * The cells of a flat ellipse's outline, rx × ry art pixels round its middle:
 * a ring on the floor, seen from the side. Worked out once per size.
 */
export function ellipseCells(rx: number, ry: number): readonly (readonly [number, number])[] {
  const id = `${rx}|${ry}`;
  let cells = rings.get(id);
  if (!cells) {
    const seen = new Set<string>();
    const out: [number, number][] = [];
    const steps = Math.max(24, Math.round((rx + ry) * 4));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const x = Math.round(Math.cos(a) * rx);
      const y = Math.round(Math.sin(a) * ry);
      const k = `${x},${y}`;
      if (!seen.has(k)) {
        seen.add(k);
        out.push([x, y]);
      }
    }
    cells = out;
    rings.set(id, cells);
  }
  return cells;
}
