import { RAMP } from '../render/palette';
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
