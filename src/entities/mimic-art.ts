import { RAMP } from '../render/palette';
import { PixelSprite } from '../render/pixel';
import { Sheet, compose, type Grid } from '../render/sheet';
import { cellsOf, crop, rotSprite, rowsOf } from './puppet';

/**
 * Gierschlund, drawn for the grid: an oak chest of thirty-six by twenty-four
 * art pixels, iron-gold bands over its planks, claw feet, a vaulted lid with
 * a lock plate - and the lid is a jaw. Its underside is gums and a row of
 * teeth, the box's rim another, and when it opens there is a throat behind
 * them with the hoard heaped in it and one yellow eye looking out.
 *
 * The lid is turned about its hinge with RotSprite to five angles - shut,
 * cracked, a third, two thirds and thrown wide, which stands it twice the
 * hero's height - and each angle is a frame of the whole chest. Hopping it
 * squashes and stretches as drawn frames. Its colours: oak in two tones and
 * its grain, gold in three, the throat's dark red, ivory teeth, the eye.
 *
 * Frames face right (hinge at the back, lock at the front) and stand on
 * their bottom row; the actor pass outlines them.
 */

const KEY: Record<string, string> = {
  K: RAMP.earth[0],
  D: RAMP.earth[1],
  d: RAMP.earth[2],
  m: RAMP.earth[3],
  l: RAMP.earth[4],
  g: RAMP.rust[2],
  G: RAMP.rust[3],
  O: RAMP.fire[3],
  /** The keyhole: dark, until something looks out through it. */
  h: RAMP.earth[0],
  M: RAMP.rose[0],
  n: RAMP.rose[1],
  T: RAMP.earth[7],
  t: RAMP.earth[6],
  /** The eye, and its slit. */
  Y: RAMP.fire[3],
  p: RAMP.earth[0],
};

const PALETTES = {
  /** A glint of the hoard through the keyhole. */
  glint: { h: RAMP.fire[3] },
  /** It looks out: the keyhole burns and the eye goes white-hot. */
  eye: { h: RAMP.fire[1], Y: RAMP.fire[4] },
};

const BOX: Grid = [
  'OGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGg',
  'llmmmmgOgmmmmmmmmmmmmmmmmmmmgOgmmmmd',
  'lmmdmmgGgmmmmdmmmmmmmmmdmmmmgGgmmmdd',
  'DDDDDDgGgDDDDDDDDDDDDDDDDDDDgGgDDDDD',
  'lmmmmmgGgmmmmmmmmmdmmmmmmmmmgGgmmmmd',
  'mmmdmmgOgmmmmmmmmmmmmmmmmdmmgOgmmmdd',
  'mmmmmmgGgmmmmmmdmmmmmmmmmmmmgGgmmmmd',
  'DDDDDDgGgDDDDDDDDDDDDDDDDDDDgGgDDDDD',
  'mmmmmmgGgmmmmmmmmmmmmmdmmmmmgGgmmmmd',
  'mmmmdmgGgmmmmmmmmmmmmmmmmmmmgGgmmmdd',
  'ddddddgGgdddddddddddddddddddgGgddddd',
  'gGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGg',
  '.KKK..........................KKK...',
  'KKKKK........................KKKKK..',
];
/** Landing: the box sunk on its feet. */
const BOX_LAND: Grid = [...BOX.slice(0, 5), ...BOX.slice(6, 12), 'KKKK..........................KKKK..', 'KKKKK........................KKKKK..'];
/** Leaving the floor: the feet stretched under it. */
const BOX_JUMP: Grid = [...BOX.slice(0, 12), '.KKK..........................KKK...', '.KK............................KK...', 'KKKK..........................KKKK..'];

const LID: Grid = [
  '...........llllllllllllll...........',
  '.......lllmmmmmmgOgmmmmmmlll........',
  '....llmmmmgOgmmmmmmmmmmmmgOgmmdd....',
  '..llmmmmmmgGgmmmmmmmmmmmmgGgmmmmdd..',
  '.lmmmmmmmmgGgmmmmmmmmmmmmgGgmmmmmmd.',
  'lmmmmmmmmmgGgmmmmmmmmmmmmgGgmmmmmmmd',
  'DDDDDDDDDDgGgDDDDDDDDDDDDgGgDDDDDOOO',
  'mmmmmdmmmmgGgmmmmmmmdmmmmgGgmmmmmOhG',
  'mmmmmmmmmmgOgmmmmmmmmmmmmgOgmmmmmOhg',
  'gGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGg',
];
/** The lid's underside, seen once it lifts: gums and a row of teeth. */
const LID_TEETH: Grid = [
  'nMnMMnMMnMMnMMnMMnMMnMMnMMnMMnMMnMMn',
  '.TTt.TTt.TTt.TTt.TTt.TTt.TTt.TTt.Tt.',
  '..T...T...T...T...T...T...T...T..T..',
];
/** The box's own teeth along the rim. */
const LOW_TEETH: Grid = ['..T...T...T...T...T...T...T...T..T..', '.TTt.TTt.TTt.TTt.TTt.TTt.TTt.TTt.Tt.'];
const HOARD: Grid = ['....O.G.O....', '..OGGOgGOGg..', '.GgOGGGOGgGO.'];
const EYE: Grid = ['.YYY.', 'YYpYY', '.YYY.'];

/** Every frame: 52 × 56; the box (36 wide) has its top-left at (10, 42) and stands on the bottom row. */
const FW = 52;
const FH = 56;
const BX = 10;
const BY = FH - BOX.length;
const LEN = 36;

/** The throat between the rim and the lid's underside, the hoard in it and the eye. */
function throat(deg: number): string[] {
  const c = cellsOf([], FW, FH);
  const a = (deg * Math.PI) / 180;
  const fx = BX + LEN * 0.5 * Math.cos(a);
  const fy = BY - LEN * 0.5 * Math.sin(a);
  const rx = BX + LEN * 0.62;
  const side = (ax: number, ay: number, bx: number, by: number, px: number, py: number): number => (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  for (let y = 0; y < FH; y++) {
    for (let x = 0; x < FW; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const s1 = side(BX, BY, fx, fy, px, py);
      const s2 = side(fx, fy, rx, BY, px, py);
      const s3 = side(rx, BY, BX, BY, px, py);
      if ((s1 <= 0 && s2 <= 0 && s3 <= 0) || (s1 >= 0 && s2 >= 0 && s3 >= 0)) c[y][x] = 'M';
    }
  }
  // Its open edge in the gums' red.
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) if (c[y][x] === 'M' && (x + 1 >= FW || c[y][x + 1] === '.')) c[y][x] = 'n';
  const parts: [Grid, number, number][] = [
    [rowsOf(c), 0, 0],
    [HOARD, BX + 10, BY - 3],
  ];
  if (deg >= 20) parts.push([EYE, Math.trunc(BX + 6 + LEN * Math.cos(a) * 0.2), Math.trunc(BY - LEN * Math.sin(a) * 0.22) - 2]);
  return compose(FW, FH, parts);
}

/** The whole chest with its lid turned `deg` degrees about the hinge, on a box (shut, landing, leaving the floor). */
function chest(deg: number, box: Grid): string[] {
  const top = FH - box.length;
  const parts: [Grid, number, number][] = [];
  if (deg > 0) {
    parts.push([throat(deg), 0, top - BY]);
    parts.push([LOW_TEETH, BX, top - 2]);
  }
  parts.push([box, BX, top]);
  // The lid's hinge is between its bottom row and the teeth, at its back edge.
  const lid = rotSprite(deg > 0 ? [...LID, ...LID_TEETH] : LID, -deg, 0, LID.length, FW, FH, BX, top - LID.length);
  parts.push([lid, 0, 0]);
  return compose(FW, FH, parts);
}

export type ChestFrame = 'shut' | 'land' | 'jump' | 'crack' | 'open1' | 'open2' | 'open3';

const made: Record<ChestFrame, string[]> = {
  shut: chest(0, BOX),
  land: chest(0, BOX_LAND),
  jump: chest(0, BOX_JUMP),
  crack: chest(12, BOX),
  open1: chest(30, BOX),
  open2: chest(50, BOX),
  open3: chest(72, BOX),
};
const cut = {} as Record<ChestFrame, string[]>;
const at = {} as Record<ChestFrame, { x: number; y: number }>;
for (const name of Object.keys(made) as ChestFrame[]) {
  const c = crop(made[name]);
  cut[name] = c.rows;
  at[name] = { x: c.x, y: c.y };
}

export const CHEST = new Sheet<ChestFrame>(cut, KEY, PALETTES);

/** The lid's angle as a frame: 0 shut … 1 thrown wide. */
export function lidFrame(lid: number): ChestFrame {
  return lid < 0.08 ? 'shut' : lid < 0.28 ? 'crack' : lid < 0.52 ? 'open1' : lid < 0.8 ? 'open2' : 'open3';
}

/**
 * Draws a frame with the middle of its hitbox (66 logical wide, the box's
 * width) at `cx` and its feet on `bottom`.
 */
export function drawChest(ctx: CanvasRenderingContext2D, frame: ChestFrame, cx: number, bottom: number, facing: 1 | -1, palette: '' | 'glint' | 'eye'): void {
  const o = at[frame];
  CHEST.draw(ctx, frame, cx, bottom, BX + 18 - o.x, FH - o.y, facing, palette);
}

/* ----------------------------------------------------------- the tongue */

/** The tongue's ramp: shadow under, the meat, the wet light along its top. */
export const TONGUE = { under: RAMP.rose[1], body: RAMP.rose[2], top: RAMP.rose[4], gloss: RAMP.rose[5] };

/* ---------------------------------------------------------- its wreckage */

const PLANKS: Record<string, Grid> = {
  long: ['lmmmmmmmmmmmmmd', 'mmmmdmmmmmdmmmd', 'dDDDDDDDDDDDDDD'],
  short: ['lmmmmmmmmd', 'mmdmmmmmmd', 'dDDDDDDDDD'],
  band: ['OGGGGGg', 'gGGGGGg'],
  lock: ['OOOO', 'OOhG', 'GGhg', 'gGGg'],
};

function plankFrames(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [name, g] of Object.entries(PLANKS)) {
    const w = g[0].length;
    const h = g.length;
    for (let i = 0; i < 4; i++) {
      const size = w + 4;
      const turned = rotSprite(g, i * 45, w / 2, h / 2, size, size, size / 2 - w / 2, size / 2 - h / 2);
      out[`${name}${i}`] = crop(turned).rows;
    }
  }
  return out;
}

/** The chest gone to pieces: planks and bits of its gold, each at four turns. */
export const WRECK = new Sheet<string>(plankFrames(), KEY);

/* ----------------------------------------------------------------- hoard */

/**
 * The hoard, heaped where the chest sleeps: what is left of the treasury, a
 * mound of coins as tall as two heroes and a half against the vault's back
 * wall, with a smaller pile slid off it to one side, a skull half sunk in it
 * and a sword driven into it to the guard - the ones who came for it.
 *
 * Coins as ovals on a grid shaken out of line, each lit along its top and
 * dark along its lower edge; the mound lit from the upper left and darkening
 * to the floor; a rim of the brightest gold along its crest where it faces
 * the light. All of it solid, in the chest's own golds. Made once at each of
 * five heights - whole, and four steps of it sliding away when the chest is
 * broken. It is drawn with the ground (Enemy.drawSetPiece), not with the
 * actors: under the light like the rest of the vault, and behind the chest
 * with the chest's own outline between them.
 */
export const HOARD_W = 112;
export const HOARD_H = 54;

const HOARD_KEY: Record<string, string> = {
  '0': RAMP.earth[2],
  '1': RAMP.earth[3],
  '2': RAMP.rust[2],
  '3': RAMP.rust[3],
  '4': RAMP.fire[3],
  '5': RAMP.fire[4],
  /** The skull: ivory in two tones, its sockets. */
  b: RAMP.earth[6],
  B: RAMP.earth[7],
  k: RAMP.earth[0],
  /** The sword: steel in three tones, the grip's leather. */
  s: RAMP.slate[3],
  S: RAMP.slate[5],
  w: RAMP.slate[6],
  r: RAMP.earth[1],
};

const SKULL = ['..bBBBb..', '.bBBBBBb.', 'bBBBBBBBb', 'bkkBBBkkb', 'bkkBkBkkb', '.bBBkBBb.', '..bBbBb..'];
const SWORD = ['....4....', '...343...', '....r....', '....r....', '....r....', '....r....', 'sSSSSSSSs', '...sws...', '...sws...'];

function hoardHash(n: number): number {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
}

function hoardRows(level: number): string[] {
  const W = HOARD_W;
  const H = HOARD_H;
  const half = W / 2;
  const peak = (H - 2) * level;
  // The crest, column by column: the mound, the pile slid off it to the
  // right, and the coins along the top a pixel or two proud of it.
  const top = new Float64Array(W);
  for (let x = 0; x < W; x++) {
    const u = (x + 0.5 - half) / half;
    const mound = Math.pow(Math.max(0, 1 - Math.abs(u + 0.12) ** 1.7), 0.9) * peak;
    const pile = Math.max(0, 1 - ((u - 0.58) / 0.36) ** 2) * peak * 0.42;
    top[x] = Math.max(mound, pile) + (hoardHash(x >> 2) - 0.5) * 2.4 * level;
  }
  const inside = (x: number, y: number): boolean => x >= 0 && x < W && y >= 0 && y < H && H - y <= top[x];
  // How the mound is lit, 1 (the shadowed foot on the right) to 3 (the
  // crest on the left): lit from the upper left, darkening to the floor.
  const lightAt = (x: number, y: number): number => {
    const u = (x + 0.5 - half) / half;
    const v = (H - y) / Math.max(1, peak);
    return Math.max(1, Math.min(3, Math.round(0.6 + 2.6 * (0.3 + 0.5 * v - 0.35 * u))));
  };
  const grid: number[][] = [];
  for (let y = 0; y < H; y++) {
    const row: number[] = [];
    for (let x = 0; x < W; x++) row.push(inside(x, y) ? lightAt(x, y) - 1 : -1);
    grid.push(row);
  }
  // The coins, row on row from the back: each an oval four wide and three
  // high, lit along its top and dark along its lower edge, on a grid shaken
  // out of line so the heap is a heap and not a wall; a coin here and there
  // turned to the light, or away from it.
  for (let gy = 1; gy < H + 2; gy += 3) {
    const shift = ((gy / 3) & 1) * 2;
    for (let gx = -2; gx < W + 2; gx += 4) {
      const n = gx * 31 + gy * 17;
      const cx = gx + shift + Math.round((hoardHash(n) - 0.5) * 2);
      const cy = gy + Math.round((hoardHash(n + 5) - 0.5) * 2);
      if (!inside(cx, cy)) continue;
      const turn = hoardHash(n + 9);
      const base = lightAt(cx, cy) + (turn > 0.85 ? 1 : turn < 0.15 ? -1 : 0);
      const put = (x: number, y: number, t: number): void => {
        if (inside(x, y)) grid[y][x] = Math.max(0, Math.min(5, t));
      };
      put(cx - 1, cy - 1, base + 1);
      put(cx, cy - 1, base + 1);
      for (let x = cx - 2; x <= cx + 1; x++) put(x, cy, base);
      put(cx - 1, cy + 1, base - 1);
      put(cx, cy + 1, base - 1);
    }
  }
  // The crest catches the light where it faces it, with a glint now and then;
  // the foot sinks into the floor's shadow.
  for (let x = 0; x < W; x++) {
    const y = H - Math.floor(top[x]);
    if (y < 0 || y >= H || !inside(x, y)) continue;
    const facing = x > 0 && top[x] >= top[x - 1] - 0.3;
    grid[y][x] = facing ? (hoardHash(x * 7) > 0.85 ? 5 : 4) : 3;
  }
  for (let x = 0; x < W; x++) {
    if (inside(x, H - 1)) grid[H - 1][x] = 0;
    if (inside(x, H - 2)) grid[H - 2][x] = Math.min(grid[H - 2][x], 1);
  }
  const rows = grid.map((r) => r.map((t) => (t < 0 ? '.' : String(t))));
  // The ones who came for it, while it is still heaped up.
  const stamp = (art: readonly string[], cx: number, sink: number): void => {
    const x0 = Math.round(cx - art[0].length / 2);
    const surface = Math.round(top[Math.max(0, Math.min(W - 1, Math.round(cx)))]);
    const y0 = H - surface - art.length + sink;
    art.forEach((line, j) => {
      [...line].forEach((ch, i) => {
        const y = y0 + j;
        const x = x0 + i;
        if (ch !== '.' && y >= 0 && y < H && x >= 0 && x < W) rows[y][x] = ch;
      });
    });
  };
  if (level >= 0.7) {
    stamp(SKULL, 22, 2);
    stamp(SWORD, 72, 3);
  }
  return rows.map((r) => r.join(''));
}

const hoards: (PixelSprite | null)[] = [];

/** The hoard at a height of 4 (whole) down to 1, made once each; null at 0. */
export function hoardSprite(step: number): PixelSprite | null {
  if (step <= 0) return null;
  let sp = hoards[step];
  if (!sp) {
    sp = new PixelSprite(hoardRows(step / 4), HOARD_KEY);
    hoards[step] = sp;
  }
  return sp;
}
