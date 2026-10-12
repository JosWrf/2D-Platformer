import { RAMP } from '../render/palette';
import { type Grid } from '../render/sheet';
import { BigSheet, type Cells, cellsOf, crop, despeckle, fillPoly, rowsOf, strokeCells4, turnings } from './puppet';

/**
 * Vesperon, drawn for the grid: the lord of the keep, front on, in a high
 * collar and a coffin of a cape - pale long face, a widow's peak, pointed
 * ears, eyes of the brightest red there is and two white fangs, a gold
 * brooch round a red stone on his chest (his "eye core") - between wings
 * that span half the tower.
 *
 * The wings are worked out from the old drawing's own bones - an arm from
 * the shoulder to the wrist, four long fingers fanned out from it, and the
 * membrane between them cut into scallops - at every spread and point of
 * the beat a frame needs, and laid down on the grid once: bones a pixel
 * or two of near-black, the membrane in two tones of wine (lighter along
 * the finger that leads each panel, darker where it sags, darkest in the
 * body's shadow), and the red moon behind him catching the top of the arm
 * and every scallop of the trailing edge. The cape's folds are drawn, not
 * dithered: dark lines with a lit strip on the side towards the key light.
 *
 * Body frames are 42 × 62, his middle on column 21 and between rows 32
 * and 33; a wing frame's pivot is its shoulder. No outer outline: the actor
 * pass outlines him.
 */

const KEY: Record<string, string> = {
  // The wings.
  K: RAMP.earth[0],
  B: RAMP.rose[0],
  r: RAMP.rose[3],
  n: RAMP.rose[2],
  m: RAMP.rose[1],
  M: RAMP.rose[0],
  k: RAMP.slate[6],
  // The lord.
  c: RAMP.plum[1],
  C: RAMP.plum[2],
  x: RAMP.plum[0],
  h: RAMP.earth[0],
  d: RAMP.slate[1],
  D: RAMP.slate[2],
  f: RAMP.slate[6],
  F: RAMP.slate[5],
  e: RAMP.rose[6],
  w: RAMP.grey[7],
  g: RAMP.rust[3],
  G: RAMP.fire[3],
  j: RAMP.rose[3],
  J: RAMP.rose[5],
  y: RAMP.fire[3],
};

/** Eyes white-hot before the dive; dim while he hangs asleep. */
const PALETTES = {
  hot: { e: RAMP.grey[7], j: RAMP.rose[5] },
  dim: { e: RAMP.rose[1], j: RAMP.rose[1] },
  /** The hit flash: his whole silhouette white, for the two frames of a blow. */
  white: Object.fromEntries(Object.keys(KEY).map((k) => [k, RAMP.grey[7]])),
};

/** Old drawing units to art pixels: he was drawn at 1.35, two logical pixels to the art pixel. */
const S = 0.675;

/* ----------------------------------------------------------------- wings */

type Pt = [number, number];

/**
 * One wing (his right; the left is its mirror) at a spread (0 furled, 1.2
 * wide), a point of the beat (+1 top of the stroke, -1 bottom) and a fan
 * (how far the fingers open beyond the spread: wider on the downstroke).
 * Returns the frame and its shoulder.
 */
function wing(open: number, beat: number, fan: number): { rows: string[]; x: number; y: number } {
  const lift = -0.35 - beat * 0.45 + (1 - open) * 1.25;
  const reach = 36 + open * 74;
  const ca = Math.cos(lift);
  const sa = Math.sin(lift);
  const turn = ([x, y]: Pt): Pt => [(x * ca - y * sa) * S, (x * sa + y * ca) * S];
  const wristL: Pt = [reach * 0.55, -8];
  const tipsL: Pt[] = [];
  for (let i = 0; i < 4; i++) {
    const a = -0.25 + i * (0.42 + open * 0.12) * fan;
    const len = reach * (1.05 - i * 0.13);
    tipsL.push([reach * 0.55 + Math.cos(a) * len, Math.sin(a) * len * 0.9]);
  }
  // The membrane's outline: shoulder, wrist, the first finger's tip, a
  // scallop to each tip after it and one more back to the flank.
  // (The root reaches in under the cape, so wing and body never leave a chink between them.)
  const outline: Pt[] = [[-6, -2], [0, -1], wristL, tipsL[0]];
  const scallop = (a: Pt, b: Pt): void => {
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    const qx = mx + (wristL[0] - mx) * 0.34;
    const qy = my + (wristL[1] - my) * 0.34;
    for (let k = 1; k <= 10; k++) {
      const t = k / 10;
      const u = 1 - t;
      outline.push([u * u * a[0] + 2 * u * t * qx + t * t * b[0], u * u * a[1] + 2 * u * t * qy + t * t * b[1]]);
    }
  };
  for (let i = 1; i < 4; i++) scallop(tipsL[i - 1], tipsL[i]);
  scallop(tipsL[3], [6, 44]);
  outline.push([0, 22], [-6, 24]);
  // A canvas just big enough for this pose, with room for the claw and the outline.
  const turned = outline.map(turn);
  const xs = turned.map((p) => p[0]);
  const ys = turned.map((p) => p[1]);
  const OX = Math.ceil(-Math.min(...xs)) + 3;
  const OY = Math.ceil(-Math.min(...ys)) + 6;
  const W = OX + Math.ceil(Math.max(...xs)) + 4;
  const H = OY + Math.ceil(Math.max(...ys)) + 4;
  const P = (p: Pt): Pt => {
    const [x, y] = turn(p);
    return [OX + x, OY + y];
  };
  const c = cellsOf([], W, H);
  fillPoly(c, outline.map(P), 'm');

  // Shade each panel by where it lies round the wrist: lit just after the
  // finger that leads it, in shadow where it sags towards the next.
  const [wx, wy] = P(wristL);
  const tips = tipsL.map(P);
  const angle = (x: number, y: number): number => Math.atan2(y - wy, x - wx);
  const a0 = angle(tips[0][0], tips[0][1]);
  const norm = (a: number): number => {
    let v = a;
    while (v < a0 - 0.4) v += Math.PI * 2;
    while (v >= a0 - 0.4 + Math.PI * 2) v -= Math.PI * 2;
    return v;
  };
  const bones = [...tips.map(([x, y]) => norm(angle(x, y))), norm(angle(OX, OY))];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (c[y][x] !== 'm') continue;
      const a = norm(angle(x + 0.5, y + 0.5));
      let i = 0;
      while (i < 3 && a > bones[i + 1]) i++;
      const t = (a - bones[i]) / Math.max(0.01, bones[i + 1] - bones[i]);
      if (i < 3) c[y][x] = t < 0.8 ? 'n' : 'm';
      else c[y][x] = t < 0.62 ? 'n' : t < 0.92 ? 'm' : 'M';
    }
  }
  // The moon behind him on the trailing edge: every scallop's lowest cells.
  for (let y = 0; y < H - 1; y++) {
    for (let x = OX + 3; x < W; x++) {
      if ((c[y][x] === 'n' || c[y][x] === 'm') && c[y + 1][x] === '.') c[y][x] = 'r';
    }
  }
  // Bones: the arm two cells thick with the moon along its top, one cell
  // for each finger, bowed a little the way the old ones were.
  const sh = P([-6, -1]);
  strokeCells4(c, sh[0], sh[1] + 1, wx, wy + 1, 'K');
  strokeCells4(c, sh[0], sh[1], wx, wy, 'r');
  for (const [tx, ty] of tips) {
    const mx = (wx + tx) / 2 + 2;
    const my = (wy + ty) / 2 - 2;
    let px = wx;
    let py = wy;
    for (let k = 1; k <= 6; k++) {
      const t = k / 6;
      const u = 1 - t;
      const nx = u * u * wx + 2 * u * t * mx + t * t * tx;
      const ny = u * u * wy + 2 * u * t * my + t * t * ty;
      strokeCells4(c, px, py, nx, ny, 'B');
      px = nx;
      py = ny;
    }
  }
  // The thumb's claw, hooked up off the wrist.
  const kx = Math.round(wx);
  const ky = Math.round(wy);
  for (const [dx, dy, l] of [[0, 0, 'K'], [0, -1, 'K'], [0, -2, 'k'], [1, -2, 'k'], [1, -3, 'k']] as const) {
    if (c[ky + dy]?.[kx + dx] !== undefined) c[ky + dy][kx + dx] = l;
  }
  const cut = crop(rowsOf(c));
  return { rows: despeckle(cut.rows), x: OX - cut.x, y: OY - cut.y };
}

/** The beat, frame by frame: [spread, beat, fan]. */
const WING_POSES = {
  furl0: [0.1, 0.5, 1],
  furl1: [0.1, -0.5, 1],
  rest: [0.25, 0, 0.9],
  half0: [0.5, 0, 0.9],
  half1: [0.5, 1, 0.9],
  half2: [0.5, 0, 1.08],
  half3: [0.5, -1, 1.05],
  open0: [0.75, 0, 0.9],
  open1: [0.75, 0.87, 0.85],
  open2: [0.75, 0.87, 1],
  open3: [0.75, 0, 1.12],
  open4: [0.75, -0.87, 1.12],
  open5: [0.75, -0.87, 0.95],
  wide0: [1.15, 0, 0.9],
  wide1: [1.15, 1, 0.9],
  wide2: [1.15, 0, 1.08],
  wide3: [1.15, -1, 1.05],
} as const;

export type WingFrame = keyof typeof WING_POSES;

const wingRows = {} as Record<WingFrame, string[]>;
const wingAt = {} as Record<WingFrame, { x: number; y: number }>;

/** A wing frame, worked out the first time it is wanted (see warmVesper). */
function ensureWing(name: WingFrame): void {
  if (wingRows[name]) return;
  const [o, b, f] = WING_POSES[name];
  const w = wing(o, b, f);
  wingRows[name] = w.rows;
  wingAt[name] = { x: w.x, y: w.y };
}

const WINGS = new BigSheet<WingFrame>(wingRows, KEY, PALETTES);

/**
 * The wing frame for a spread and a point of the beat (the wing's phase,
 * radians, as the old drawing's sin(wing)); `flying` false holds it still.
 */
export function wingFrame(spread: number, phase: number, flying: boolean): WingFrame {
  const turn = ((phase / (Math.PI * 2)) % 1 + 1) % 1;
  if (spread < 0.18) return flying ? (turn < 0.5 ? 'furl0' : 'furl1') : 'furl0';
  if (spread < 0.38) return 'rest';
  if (!flying) return spread < 0.62 ? 'half0' : spread < 0.95 ? 'open0' : 'wide0';
  if (spread < 0.62) return `half${Math.floor(turn * 4 + 0.5) % 4}` as WingFrame;
  if (spread < 0.95) return `open${Math.floor(turn * 6 + 0.5) % 6}` as WingFrame;
  return `wide${Math.floor(turn * 4 + 0.5) % 4}` as WingFrame;
}

/* ------------------------------------------------------------------ body */

const BW = 42;
const BH = 62;
const MX = 21;
const MY = 33;

const HEAD: Grid = [
  '.....hhhhh.....',
  '...hhhhhhhhh...',
  '..hDDhhhhhhhh..',
  '..hDhhhhhhhhh..',
  '..hhhffhffhhh..',
  'f.hhffffffFhh.F',
  'ffhfffffffFFhFF',
  '.ffhhhfffhhhFF.',
  '..ffeehfheeFF..',
  '..fffffffffFF..',
  '...ffffFffFF...',
  '...ffffFffFF...',
  '...ffhhhhhFF...',
  '....fwfffwF....',
  '....fffffFF....',
  '.....ffFFF.....',
  '......fFF......',
];

/** His head bowed: brow and hair, the eyes shut. */
const HEAD_DOWN: Grid = [
  '...............',
  '.....hhhhh.....',
  '...hhhhhhhhh...',
  '..hDDhhhhhhhh..',
  '..hDhhhhhhhhh..',
  'f.hhhhhhhhhhh.F',
  'ffhhhffhffhhhFF',
  '.ffhffffffFhFF.',
  '..fhhhfffhhhF..',
  '..fffffffffFF..',
  '...ffffFffFF...',
  '...fffhhhfFF...',
  '....ffffffF....',
  '.....fffFF.....',
  '......fFF......',
];

const BROOCH: Grid = ['.GGg.', 'GjJjg', 'gjjjg', 'gjjjg', '.ggg.'];

const HAND: Grid = ['f.f.f', 'f.f.F', 'fFfFF', 'ffffF', '.fFF.'];

const SICKLE: Grid = ['...nnr.', '.nnrJ..', 'nnr....', 'nnr....', '.nnrJ..', '...nnr.'];
const SICKLE_SMALL: Grid = ['..nr', '.nr.', '.nr.', '..nr'];

function put(c: Cells, x: number, y: number, l: string): void {
  const row = c[MY + y];
  if (row && MX + x >= 0 && MX + x < row.length) row[MX + x] = l;
}

function stamp(c: Cells, g: Grid, x: number, y: number): void {
  for (let r = 0; r < g.length; r++) {
    for (let k = 0; k < g[r].length; k++) if (g[r][k] !== '.') put(c, x + k, y + r, g[r][k]);
  }
}

function poly(c: Cells, pts: readonly Pt[], l: string): void {
  fillPoly(
    c,
    pts.map(([x, y]) => [MX + x, MY + y] as Pt),
    l,
  );
}

function stroke(c: Cells, x0: number, y0: number, x1: number, y1: number, l: string): void {
  strokeCells4(c, MX + x0, MY + y0, MX + x1, MY + y1, l);
}

/** The collar, flared behind the head: plum outside, the wine lining inside. */
function collar(c: Cells, dy: number): void {
  for (const s of [-1, 1]) {
    const o: Pt[] = [
      [-5, -15],
      [-11, -15],
      [-15, -33],
      [-12, -31],
      [-7, -26],
      [-5, -19],
    ];
    poly(c, o.map(([x, y]) => [x * s - (s > 0 ? -1 : 0), y + dy] as Pt), 'c');
    const i: Pt[] = [
      [-7, -17],
      [-10, -17],
      [-13.5, -30.5],
      [-8.5, -25],
      [-7, -20],
    ];
    poly(c, i.map(([x, y]) => [x * s - (s > 0 ? -1 : 0), y + dy] as Pt), s < 0 ? 'n' : 'm');
  }
}

type Cape = 'hang' | 'open' | 'pool' | 'billow';

/**
 * The cape: a coffin from the shoulders, folds drawn as dark lines with a
 * lit strip to their left, the wine lining at its lower edges and in the
 * opening at his chest. `hem` (0..3) moves the two tails of its hem.
 */
function cape(c: Cells, mode: Cape, hem: number, dy: number): void {
  const sway = [0, 1, 0, -1][hem % 4];
  const lift = [0, 1, 2, 1][hem % 4];
  let left: Pt[];
  if (mode === 'pool') {
    left = [
      [-9, -15],
      [-13, -11],
      [-15, -5],
      [-16, 4],
      [-19, 14],
      [-21, 22],
    ];
  } else if (mode === 'open') {
    left = [
      [-9, -15],
      [-15, -19],
      [-18, -18],
      [-19, -6],
      [-16, 8],
      [-12, 18],
      [-9 + sway, 27 - lift],
    ];
  } else if (mode === 'billow') {
    left = [
      [-9, -15],
      [-13, -12],
      [-17, -6],
      [-19, 4],
      [-17, 12],
      [-12 + sway, 16 - lift],
    ];
  } else {
    left = [
      [-9, -15],
      [-13, -12],
      [-15, -8],
      [-15, -2],
      [-13, 8],
      [-11, 18],
      [-9 + sway, 27 - lift],
    ];
  }
  const right: Pt[] = left.map(([x, y], i) => [-x - (i === left.length - 1 ? sway * 2 : 0), y + (i === left.length - 1 ? lift * 2 - lift : 0)] as Pt);
  const notch: Pt = mode === 'pool' ? [0, 22] : mode === 'billow' ? [0, 10] : [sway, 20 - lift];
  const outline: Pt[] = [...left, notch, ...right.reverse()].map(([x, y]) => [x, y + dy] as Pt);
  poly(c, outline, 'c');
  // Lit from the upper left: the left of the coffin a step lighter, and the
  // lining showing along its lower edges.
  const bottom = mode === 'pool' ? 22 : mode === 'billow' ? 16 : 27;
  for (let y = -16; y <= bottom + 1; y++) {
    const row = c[MY + y + dy];
    if (!row) continue;
    let l = -1;
    let r = -1;
    for (let x = 0; x < row.length; x++) {
      if (row[x] === 'c') {
        if (l < 0) l = x;
        r = x;
      }
    }
    if (l < 0) continue;
    const split = l + Math.round((r - l) * 0.45);
    for (let x = l; x < split; x++) if (row[x] === 'c') row[x] = 'C';
    if (y > 2) row[l] = 'n';
    if (y > 2) row[r] = 'm';
  }
  // Folds: three on each side, dark lines down to the hem.
  const folds: [number, number, number, number][] =
    mode === 'pool'
      ? [
          [-11, -8, -17, 21],
          [-7, 0, -10, 21],
          [-3, 6, -4, 21],
          [3, 6, 5, 21],
          [7, 0, 11, 21],
          [11, -8, 17, 21],
        ]
      : mode === 'billow'
        ? [
            [-12, -9, -15, 10],
            [-7, -2, -8, 12],
            [7, -2, 8, 12],
            [12, -9, 15, 10],
          ]
        : [
            [-12, -9, -10 + sway, 24 - lift],
            [-8, -3, -6 + sway, 21 - lift],
            [-4, 5, -3 + sway, 18],
            [4, 5, 3 + sway, 18],
            [8, -3, 6 + sway, 21 - lift],
            [12, -9, 10 + sway, 24 - lift],
          ];
  for (const [x0, y0, x1, y1] of folds) {
    const cells = strokeCells4(c, MX + x0, MY + y0 + dy, MX + x1, MY + y1 + dy, 'x');
    // In the shade a fold still catches the light along its left edge.
    for (const [x, y] of cells) if (c[y]?.[x - 1] === 'c') c[y][x - 1] = 'C';
  }
}

/** The opening at his chest: the doublet, the lining either side, the brooch. */
function chest(c: Cells, dy: number): void {
  poly(
    c,
    [
      [-5, -15 + dy],
      [6, -15 + dy],
      [4, 4 + dy],
      [0.5, 7 + dy],
      [-3, 4 + dy],
    ],
    'd',
  );
  for (let y = -15; y <= 6; y++) {
    const row = c[MY + y + dy];
    if (!row) continue;
    let l = -1;
    let r = -1;
    for (let x = 0; x < row.length; x++) {
      if (row[x] === 'd') {
        if (l < 0) l = x;
        r = x;
      }
    }
    if (l < 0) continue;
    row[l] = 'n';
    if (r > l) row[r] = 'm';
    if (y < -12 && l + 1 < r) row[l + 1] = 'D';
  }
  stamp(c, BROOCH, -2, -8 + dy);
}

type Pose = 'fly' | 'cast' | 'call' | 'raise' | 'kneel' | 'stun' | 'fall' | 'wrap';

function body(pose: Pose, hem = 0, breath = 0): string[] {
  const c = cellsOf([], BW, BH);
  const down = pose === 'kneel' || pose === 'stun';
  const dy = down ? 5 + breath : 0;
  collar(c, dy);
  const mode: Cape = pose === 'call' ? 'open' : down ? 'pool' : pose === 'fall' ? 'billow' : 'hang';
  cape(c, mode, hem, dy);
  if (pose === 'call') {
    // The cloak held open: the dark inside it full of his bats' eyes.
    poly(
      c,
      [
        [-15, -12],
        [-6, -13],
        [-4, 8],
        [-9, 20],
        [-13, 8],
      ],
      'h',
    );
    poly(
      c,
      [
        [16, -12],
        [7, -13],
        [5, 8],
        [10, 20],
        [14, 8],
      ],
      'h',
    );
    for (const [x, y] of [
      [-11, -6],
      [-9, 3],
      [-12, 10],
      [10, -4],
      [9, 6],
      [12, 12],
    ] as const) {
      // Two eyes, each a slit two pixels tall: never a lone dot.
      for (const [ex, ey] of [[0, 0], [0, 1], [2, 0], [2, 1]] as const) put(c, x + ex, y + ey, 'y');
    }
  }
  chest(c, dy);
  stamp(c, pose === 'stun' ? HEAD_DOWN : HEAD, -7, -31 + dy);
  if (pose === 'cast') arm(c, 10, -11, 16, -19);
  if (pose === 'call' || pose === 'fall' || pose === 'raise') {
    arm(c, 10, -12, 18, -18);
    arm(c, -10, -12, -18, -18);
  }
  return despeckle(rowsOf(c));
}

/**
 * An arm raised out of the cape: a bell sleeve from the shoulder (x0, y0) to
 * the wrist (x1, y1), lit along its left, the lining showing at the cuff,
 * and the clawed hand above it.
 */
function arm(c: Cells, x0: number, y0: number, x1: number, y1: number): void {
  const side = Math.sign(x1) || 1;
  poly(
    c,
    [
      [x0 - 2 * side, y0 + 2],
      [x0 + 2 * side, y0 - 1],
      [x1 + 3 * side, y1 + 1],
      [x1 - 2 * side, y1 + 1],
    ],
    'C',
  );
  // Its far edge in shade.
  for (let y = y1 + 1; y <= y0 + 2; y++) {
    const row = c[MY + y];
    if (!row) continue;
    for (let x = row.length - 1; x >= 0; x--) {
      if (row[x] === 'C') {
        if (side > 0) row[x] = 'c';
        break;
      }
    }
  }
  for (let x = x1 - 2; x <= x1 + 2; x++) put(c, x, y1, x < x1 ? 'n' : 'm');
  stamp(c, HAND, x1 - 2, y1 - 5);
}

/** Asleep at the top of his tower: wrapped in his own wings, a coffin standing upright. */
function wrapped(): string[] {
  const c = cellsOf(body('fly'), BW, BH);
  for (const s of [-1, 1]) {
    const o: Pt[] = [
      [0.5, -15],
      [-11, -18],
      [-16, -9],
      [-15, 6],
      [-11, 18],
      [-1, 28],
      [0.5, 28],
    ];
    poly(c, o.map(([x, y]) => [s < 0 ? x : 1 - x, y] as Pt), s < 0 ? 'n' : 'm');
    // The folded fingers, running down the wrap.
    for (const [x0, y0, x1, y1] of [
      [-11, -17, -12, 14],
      [-7, -16, -6, 22],
      [-3, -15, -2, 26],
    ] as const) {
      stroke(c, s < 0 ? x0 : 1 - x0, y0, s < 0 ? x1 : 1 - x1, y1, 'B');
    }
    // The arm over the shoulder, and the thumb's claw beside his ear.
    stroke(c, s < 0 ? -12 : 13, -18, s < 0 ? -6 : 7, -15, 'r');
    put(c, s < 0 ? -12 : 13, -19, 'k');
    put(c, s < 0 ? -12 : 13, -20, 'k');
    put(c, s < 0 ? -11 : 12, -21, 'k');
  }
  // The scallops' lit edge along the bottom of the wrap.
  for (let x = 0; x < BW; x++) {
    for (let y = BH - 2; y >= 0; y--) {
      const l = c[y][x];
      if (l === 'n' || l === 'm') {
        if (c[y + 1][x] === '.') c[y][x] = 'r';
        break;
      }
      if (l !== '.') break;
    }
  }
  return despeckle(rowsOf(c));
}

const BODY = {
  fly0: body('fly', 0),
  fly1: body('fly', 1),
  fly2: body('fly', 2),
  fly3: body('fly', 3),
  cast: body('cast', 1),
  call: body('call', 2),
  raise: body('raise', 2),
  kneel0: body('kneel', 0, 0),
  kneel1: body('kneel', 0, 1),
  stun: body('stun', 0, 1),
  fall0: body('fall', 0),
  fall1: body('fall', 2),
  wrap: wrapped(),
};

export type BodyFrame = keyof typeof BODY;

const FIGURE = new BigSheet<BodyFrame>(BODY, KEY, PALETTES);

/* ------------------------------------------------- whole-figure frames */

/** The shoulders, from his middle. */
const SHOULDER_X = 5;
const SHOULDER_Y = -12;

/** Body and both wings laid into one frame, his middle at (cw, ch). */
function whole(pose: BodyFrame, w: WingFrame, cw: number, ch: number): Cells {
  const c = cellsOf([], cw * 2, ch * 2);
  const lay = (g: Grid, x0: number, y0: number, mirror: boolean): void => {
    for (let y = 0; y < g.length; y++) {
      for (let x = 0; x < g[y].length; x++) {
        const l = g[y][x];
        if (l === '.') continue;
        const tx = mirror ? x0 - x : x0 + x;
        if (c[y0 + y] && tx >= 0 && tx < cw * 2) c[y0 + y][tx] = l;
      }
    }
  };
  ensureWing(w);
  const at = wingAt[w];
  lay(wingRows[w], cw + SHOULDER_X - at.x, ch + SHOULDER_Y - at.y, false);
  lay(wingRows[w], cw - SHOULDER_X - 1 + at.x, ch + SHOULDER_Y - at.y, true);
  lay(BODY[pose], cw - MX, ch - MY, false);
  return c;
}

/** The dive, pitched towards where he is going, wings half drawn in: three angles, each turned once with RotSprite. */
const DIVE_DEG = [18, 32, 46] as const;

type WholeFrame = 'dive18' | 'dive32' | 'dive46' | 'die0' | 'die1' | 'die2' | 'die3';
const wholeRows = {} as Record<WholeFrame, string[]>;
const wholeAt = {} as Record<WholeFrame, { x: number; y: number }>;

function makeDives(): void {
  if (wholeRows.dive18) return;
  const base = crop(rowsOf(whole('fly2', 'half0', 100, 70)));
  turnings(base.rows, 100 - base.x, 70 - base.y, DIVE_DEG).forEach((t, i) => {
    const id = `dive${DIVE_DEG[i]}` as WholeFrame;
    wholeRows[id] = t.rows;
    wholeAt[id] = { x: t.x, y: t.y };
  });
}

/** A little bat, the shape he leaves in. */
const BAT: Grid = ['m.....m', 'mm.m.mm', '.mmmmm.'];

/**
 * The figure coming apart from the wing tips in: blocks of 2 × 2 go first
 * where they lie furthest from his heart (hx, hy), and here and there a
 * little bat takes wing from the frayed edge.
 */
function scatter(g: Grid, gone: number, hx: number, hy: number): string[] {
  const c = cellsOf(g);
  const h = c.length;
  const w = c[0]?.length ?? 0;
  let far = 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (c[y][x] !== '.') far = Math.max(far, Math.hypot(x - hx, (y - hy) * 1.6));
  const bats: Pt[] = [];
  for (let by = 0; by < h; by += 2) {
    for (let bx = 0; bx < w; bx += 2) {
      let k = (bx * 374761393 + by * 668265263) | 0;
      k = Math.imul(k ^ (k >>> 13), 1274126177);
      const r = ((k ^ (k >>> 16)) >>> 0) / 4294967296;
      const d = Math.hypot(bx - hx, (by - hy) * 1.6) / far;
      if (d * 0.75 + r * 0.25 <= 1 - gone) continue;
      let had = false;
      for (let y = by; y < by + 2 && y < h; y++) {
        for (let x = bx; x < bx + 2 && x < w; x++) {
          if (c[y][x] !== '.') had = true;
          c[y][x] = '.';
        }
      }
      if (had && r < 0.05) bats.push([bx, by]);
    }
  }
  for (const [bx, by] of bats) {
    for (let y = 0; y < BAT.length; y++) {
      for (let x = 0; x < BAT[y].length; x++) {
        const row = c[by - 4 + y];
        if (BAT[y][x] !== '.' && row && bx - 3 + x >= 0 && bx - 3 + x < w) row[bx - 3 + x] = BAT[y][x];
      }
    }
  }
  return despeckle(rowsOf(c));
}

/** His end: the figure with its wings half spread, fraying into bats over four steps. */
function makeDeath(): void {
  if (wholeRows.die0) return;
  const base = crop(rowsOf(whole('fall1', 'half0', 110, 70)));
  const hx = 110 - base.x;
  const hy = 70 - base.y;
  [0, 0.3, 0.55, 0.8].forEach((gone, i) => {
    const id = `die${i}` as WholeFrame;
    wholeRows[id] = scatter(base.rows, gone, hx, hy);
    wholeAt[id] = { x: hx, y: hy };
  });
}

const WHOLE = new BigSheet<WholeFrame>(wholeRows, KEY, PALETTES);

/**
 * What is worked out of him only when it is first wanted: the wing frames,
 * the dive and his end, and the canvases of every frame both ways round.
 * warmVesper does it a little at a time while he sleeps, so neither the
 * game's start nor the fight pays for it at once.
 */
const PENDING: (() => void)[] = [
  ...(Object.keys(BODY) as BodyFrame[]).map((n) => () => FIGURE.bake(n)),
  ...(Object.keys(WING_POSES) as WingFrame[]).map((n) => () => {
    ensureWing(n);
    WINGS.bake(n);
  }),
  () => {
    makeDives();
    for (const d of DIVE_DEG) WHOLE.bake(`dive${d}`, 'hot');
  },
  () => {
    makeDeath();
    for (let i = 0; i < 4; i++) WHOLE.bake(`die${i}` as WholeFrame);
  },
];

/** Works out what is still missing of him for up to `budget` ms. True once all of him is ready. */
export function warmVesper(budget: number): boolean {
  const t0 = performance.now();
  while (PENDING.length > 0) {
    PENDING.shift()?.();
    if (performance.now() - t0 >= budget) break;
  }
  return PENDING.length === 0;
}

/* --------------------------------------------------------------- drawing */

export interface VesperLook {
  body: BodyFrame;
  /** null when the wings are in the body frame (asleep) or not drawn. */
  wing: WingFrame | null;
  palette: '' | 'hot' | 'dim' | 'white';
  /** The blood sickle forming in his raised hand: 0 none, 1 small, 2 full. */
  sickle: 0 | 1 | 2;
}

/** The lord at his middle (cx, cy) in logical pixels, facing his way; wings behind, body over them. */
export function drawVesper(ctx: CanvasRenderingContext2D, cx: number, cy: number, facing: 1 | -1, look: VesperLook): void {
  if (look.wing) {
    ensureWing(look.wing);
    const at = wingAt[look.wing];
    const p = look.palette === 'white' ? 'white' : '';
    WINGS.draw(ctx, look.wing, cx + SHOULDER_X * 2 * facing, cy + SHOULDER_Y * 2, at.x, at.y, facing, p);
    WINGS.draw(ctx, look.wing, cx - (SHOULDER_X + 1) * 2 * facing, cy + SHOULDER_Y * 2, at.x, at.y, (-facing) as 1 | -1, p);
  }
  FIGURE.draw(ctx, look.body, cx, cy, MX, MY, facing, look.palette);
  if (look.sickle > 0) {
    // Over the claws of his raised hand, which reach up to row -25.
    const big = look.sickle === 2;
    SICKLES.draw(ctx, big ? 'big' : 'small', cx + (big ? 13 : 14) * 2 * facing, cy - 26 * 2, 0, (big ? SICKLE : SICKLE_SMALL).length, facing, look.palette === 'white' ? 'white' : '');
  }
}

const SICKLES = new BigSheet<'big' | 'small'>({ big: SICKLE, small: SICKLE_SMALL }, KEY, PALETTES);

/** A whole-figure frame - the dive or his end - at his middle. */
export function drawVesperWhole(ctx: CanvasRenderingContext2D, frame: WholeFrame, cx: number, cy: number, facing: 1 | -1, palette = ''): void {
  if (!wholeRows[frame]) {
    if (frame.startsWith('dive')) makeDives();
    else makeDeath();
  }
  const at = wholeAt[frame];
  WHOLE.draw(ctx, frame, cx, cy, at.x, at.y, facing, palette);
}

export function diveFrame(pitch: number): WholeFrame {
  const deg = (pitch * 180) / Math.PI;
  return deg < 25 ? 'dive18' : deg < 39 ? 'dive32' : 'dive46';
}

export type { WholeFrame };

/* ------------------------------------------------------------- the moon */

/**
 * The blood moon he calls: first a black disc in a ring of red, then a
 * crescent, then full - rose in three flat bands, lit from the upper left,
 * with its seas in the darkest of them. 63 across.
 */
function moonRows(stage: 0 | 1 | 2): string[] {
  const R = 31;
  const c = cellsOf([], R * 2 + 1, R * 2 + 1);
  const seas: [number, number, number][] = [
    [-9, -6, 6],
    [8, 4, 8],
    [-4, 12, 5],
    [12, -12, 4],
  ];
  for (let y = -R; y <= R; y++) {
    for (let x = -R; x <= R; x++) {
      const d = Math.hypot(x, y);
      if (d > R + 0.3) continue;
      let l: string;
      if (stage === 0) {
        l = d > R - 1.6 ? 'r' : 'h';
      } else {
        const lit = Math.hypot(x + 9, y + 9) < R + 1;
        const dark = stage === 1 ? x < 12 - Math.sqrt(Math.max(0, R * R - y * y)) * 0.55 : false;
        if (dark) l = d > R - 1.6 ? 'M' : 'h';
        else if (seas.some(([sx, sy, sr]) => Math.hypot(x - sx, y - sy) < sr)) l = 'm';
        else l = lit ? (Math.hypot(x + 14, y + 14) < R - 4 ? 'r' : 'n') : 'm';
        if (!dark && d > R - 1.6 && x + y < -6) l = 'J';
      }
      c[y + R][x + R] = l;
    }
  }
  return rowsOf(c);
}

export const MOON = new BigSheet<'m0' | 'm1' | 'm2'>({ m0: despeckle(moonRows(0)), m1: despeckle(moonRows(1)), m2: despeckle(moonRows(2)) }, KEY);
export const MOON_R = 31;

/* -------------------------------------------------------------- sparks */

/** Stars over him when he is down: a little cross in three places of its turn. */
export const STARS = new BigSheet<'s'>({ s: ['.k.', 'kwk', '.k.'] }, KEY);

/** Everything as rows, for looking at outside the game. */
export function vesperDebug(): {
  key: Record<string, string>;
  palettes: typeof PALETTES;
  frames: Record<string, string[]>;
  whole: (pose: BodyFrame, w: WingFrame) => string[];
} {
  for (const n of Object.keys(WING_POSES) as WingFrame[]) ensureWing(n);
  makeDives();
  makeDeath();
  return {
    key: KEY,
    palettes: PALETTES,
    frames: { ...wingRows, ...BODY, ...wholeRows, m0: moonRows(0), m1: moonRows(1), m2: moonRows(2) },
    whole: (pose, w) => crop(rowsOf(whole(pose, w, 140, 120))).rows,
  };
}
