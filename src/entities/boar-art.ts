import { RAMP } from '../render/palette';
import { Sheet, compose, type Grid } from '../render/sheet';
import { cellsFrom, cellsOf, crop, despeckle, edit, limb, pad, rotSprite, rowsOf, shear } from './puppet';

/**
 * Grimmzahn, drawn for the grid: a wild boar some seventy art pixels from
 * rump to snout and two heroes tall at the crest. A high hump over the
 * shoulders, the back sloping from it down to a rounded rump; a deep chest on
 * short, thick legs; a long wedge of a head falling from the poll to the flat
 * disc of the snout, a curved ivory tusk standing up out of the lower jaw -
 * the brightest thing on him - and a small ember of an eye under the brow.
 * The mane is a silhouette of black bristles along the spine, tallest over
 * the hump, lying flat asleep and standing up when he means it - scraping,
 * charging. The hide is three tones of brown lit from the upper left, with short
 * strokes of hair in the darker and the lighter tone running down his flanks.
 *
 * He is put together from parts, the way a big sprite is puppeted: one body,
 * a crest in three moods, one head - turned down or up about the neck with
 * RotSprite, given its moods by a few changed pixels (a hot eye, a dazed one,
 * a shut one, the jaw dropped, the tongue out) - and four legs laid down at
 * the angles of each pose. Rearing he is turned about his hind hip. Every
 * frame is made once, when it is first wanted, and drawn from then on as a
 * blit.
 *
 * Frames face right and stand on their bottom row. No outer outline: the
 * actor pass puts it round him.
 */

const KEY: Record<string, string> = {
  /** Bristles, hooves, nostrils. */
  K: RAMP.earth[0],
  /** Hide: shadow, hide, lit, highlight. */
  D: RAMP.earth[1],
  d: RAMP.earth[2],
  m: RAMP.earth[3],
  l: RAMP.earth[4],
  /** Snout and tusk: the snout's disc, the tusk's shade, its ivory. */
  S: RAMP.earth[5],
  t: RAMP.earth[6],
  T: RAMP.earth[7],
  /** The eye: an ember. */
  e: RAMP.fire[0],
  /** Dazed: the eye a cross of yellow. */
  Y: RAMP.fire[3],
  /** Tongue and the open mouth. */
  p: RAMP.rose[4],
  P: RAMP.rose[2],
};

/** About to come: the ember goes white-hot. */
const PALETTES = { hot: { e: RAMP.fire[4] } };

type Pt = [number, number];

/* ------------------------------------------------------------------ body */

/*
 * The body in a box 60 wide and 52 tall he stands in, the ground under its
 * bottom row: heights above the ground of the top and the bottom of the hide,
 * column by column, from the rump (x 1) to the neck (x 54).
 */
const BOX_W = 60;
const BOX_H = 52;
const GROUND = BOX_H - 1;

function interp(points: readonly (readonly [number, number])[]): Record<number, number> {
  const out: Record<number, number> = {};
  for (let i = 0; i + 1 < points.length; i++) {
    const [x0, h0] = points[i];
    const [x1, h1] = points[i + 1];
    for (let x = x0; x <= x1; x++) out[x] = Math.round(h0 + ((h1 - h0) * (x - x0)) / Math.max(1, x1 - x0));
  }
  return out;
}

/** The back: the rump rounding up, the long slope to the hump over the shoulders, the withers falling to the neck. */
const TOP = interp([
  [1, 14],
  [2, 18],
  [3, 21],
  [4, 24],
  [6, 26],
  [9, 28],
  [14, 30],
  [20, 33],
  [26, 37],
  [32, 41],
  [37, 43],
  [41, 44],
  [44, 44],
  [47, 43],
  [50, 41],
  [54, 38],
]);
/** The belly: the ham down to the hock, the belly tucked up between the legs, the deep chest, the throat. */
const BOT = interp([
  [1, 11],
  [2, 9],
  [4, 8],
  [14, 8],
  [17, 11],
  [20, 14],
  [34, 14],
  [37, 12],
  [48, 12],
  [51, 14],
  [54, 17],
]);

function bodyGrid(): string[] {
  const c = cellsOf([], BOX_W, BOX_H);
  for (let x = 1; x <= 54; x++) {
    const top = GROUND - TOP[x];
    const bot = GROUND - BOT[x];
    for (let y = top; y <= bot; y++) {
      const fromTop = y - top;
      const fromBot = bot - y;
      // Lit along the back, darker down the flanks, darkest under the belly.
      c[y][x] = fromBot <= 1 ? 'D' : fromTop <= 3 ? 'l' : fromBot <= 5 && x > 16 && x < 50 ? 'd' : 'm';
    }
  }
  // The rump's lit curve, the shoulder blade's shadow, the ham's crease.
  for (let y = GROUND - 26; y <= GROUND - 14; y++) {
    for (let x = 1; x < 10; x++) {
      if (c[y][x] !== '.') {
        c[y][x] = 'l';
        if (c[y][x + 1] !== '.') c[y][x + 1] = 'l';
        break;
      }
    }
  }
  const crease = (pts: Pt[], l: string): void => {
    for (const [x, h] of pts) if (c[GROUND - h]?.[x] && c[GROUND - h][x] !== '.') c[GROUND - h][x] = l;
  };
  crease(
    [
      [38, 30],
      [37, 29],
      [37, 28],
      [36, 27],
      [36, 26],
      [36, 25],
      [36, 24],
      [37, 23],
      [37, 22],
      [38, 21],
      [38, 20],
      [39, 19],
    ],
    'D',
  );
  crease(
    [
      [15, 24],
      [16, 23],
      [16, 22],
      [17, 21],
      [17, 20],
      [17, 19],
      [17, 18],
      [16, 17],
      [16, 16],
    ],
    'D',
  );
  // Hair: short strokes down and back across the flanks - the darker tone in
  // the hide, the lighter one in the lit band along the back.
  for (let y = 0; y < BOX_H - 1; y++) {
    for (let x = 2; x < 54; x++) {
      const at = c[y][x];
      const row = y >> 2;
      if (((x + row * 3) % 6 !== 0) || (y & 3) !== 1) continue;
      if (at === 'm' && c[y + 1][x - 1] === 'm') {
        c[y][x] = 'd';
        c[y + 1][x - 1] = 'd';
      } else if (at === 'l' && c[y + 1][x - 1] === 'l' && x > 6) {
        c[y][x] = 'm';
        c[y + 1][x - 1] = 'm';
      }
    }
  }
  return despeckle(rowsOf(c));
}

const BODY = bodyGrid();

/**
 * The mane: black bristles along the spine from the rump to the poll, in
 * tufts leaning back - `rise` scales their height (1 lying, more raised, less
 * laid flat), `lean` how far back the tips go.
 */
function crest(rise: number, lean: number): string[] {
  const c = cellsOf([], BOX_W, BOX_H);
  // The band of dark hair the bristles grow from.
  for (let x = 12; x <= 54; x++) {
    const top = GROUND - TOP[x];
    c[top][x] = 'K';
    if (x > 16 && x < 52) c[top + 1][x] = 'K';
  }
  // Tufts: tallest over the hump.
  for (let x0 = 14; x0 <= 52; x0 += 3) {
    const peak = x0 <= 42 ? (x0 - 14) / 28 : 1 - (x0 - 42) / 20;
    const h = Math.round((2 + peak * 7) * rise);
    if (h <= 0) continue;
    const base = GROUND - TOP[x0];
    for (let k = 0; k < h; k++) {
      const y = base - 1 - k;
      if (y < 0) break;
      const back = Math.round(((k + 1) * lean) / 2);
      const w = k < h * 0.4 ? 3 : k < h * 0.8 ? 2 : 1;
      for (let i = 0; i < w; i++) {
        const x = x0 - back + i - 1;
        if (x >= 0 && x < BOX_W) c[y][x] = k < h - 1 || w > 1 ? 'K' : 'D';
      }
    }
  }
  return despeckle(rowsOf(c));
}

const CREST = crest(1, 1);
/** Standing up - hackles raised: he means it, scraping and charging. */
const CREST_UP = crest(1.35, 0.9);
/** Laid flat: asleep, beaten. */
const CREST_FLAT = crest(0.55, 3);

/** The tail: a thin rope with a tuft, hanging or up. */
const TAIL: Grid = ['.D', 'D.', 'D.', 'D.', 'KD', 'K.'];
const TAIL_UP: Grid = ['..KK', '.D..', 'D...'];

/* ------------------------------------------------------------------ head */

/**
 * The head, neck at the left: the ear, the long face falling from the poll
 * to the flat disc of the snout, the ember eye under the brow, the jowl, the
 * lower jaw, and the tusk curving up out of it, ivory against the cheek.
 */
const HEAD: Grid = [
  '...K......................',
  '...KD.....................',
  '..KmD.....................',
  '..KmdD....................',
  '.KmmdD....................',
  '.KmmddD...................',
  'mmmmmmmll.................',
  'mmmmmmmmmll...............',
  'mmmmmmmmmmmll.............',
  'dmmmmmmmmmmmmll...........',
  'dmmmmmmKKKKmmmmll.........',
  'ddmmmmmmeeDmmmmmmll.......',
  'dddmmmmmmDmmmmmmmmmll.....',
  'ddddmmmmmmmmmmmmmmmmmml...',
  'Dddddmmdmmmmmmmmmmmmmmmml.',
  'DDddddmmdmmmmmmmmmmmmmmmSS',
  'DDdddddmmddmmmmmmmmmmmmSlS',
  'DDDddddddmmdddmmmmmmmmmSKS',
  'DDDdddddddddddddmmTmmmmSlS',
  'DDDDddddddddddddmTTmmmmSKS',
  'DDDDdddddddddddddtTmmmdSSS',
  'DDDDDdddddddddddtTdddddSS.',
  '.DDDDDdddddddddtTdddDDDD..',
  '..DDDDDDDDDDDDtTDDDDDD....',
  '...DDDDDDDDDDDDDDDDD......',
];

/** Where the head's (0, 0) sits on the body's box. */
const HEAD_AT = [47, 5] as const;

type Mood = readonly (readonly [number, number, string])[];
const SHUT: Mood = [
  [8, 11, 'D'],
  [9, 11, 'D'],
];
const DAZED: Mood = [
  [7, 10, 'Y'],
  [9, 10, 'Y'],
  [8, 11, 'Y'],
  [7, 12, 'Y'],
  [9, 12, 'Y'],
];

/** The jaw dropped from its hinge, the tusk going down with it: squealing, panting. */
const HEAD_OPEN: Grid = [
  ...HEAD.slice(0, 19),
  'DDDDddddddddddddddmmmmmSKS',
  'DDDDdddddddddddddddmmmmSSS',
  'DDDDDdddddddddddPPPPPPPSS.',
  '.DDDDDddddddddPPPPPPPPD...',
  '..DDDDDDDDDDdPPPPPPPPTt...',
  '...DDDDDDDDdddPPPPPtTD....',
  '....DDDDDDDdddmmmmtTDD....',
  '.....DDDDDDDDDDDDDDD......',
];

/** Where the head is turned about: the middle of the neck. */
const NECK = [3, 17] as const;
/** Room round the turned head, so nothing of it is cut off. */
const HEAD_ROOM = 8;
const HEAD_W = 26;
const HEAD_H = 28;

/**
 * The head in a mood, the jaw dropped or not, the tongue out or not, turned
 * about the neck with RotSprite - `nod` the tangent of the angle, + the snout
 * down. Its (0, 0) ends up at (HEAD_ROOM, HEAD_ROOM).
 */
function head(nod: number, mood: Mood, mouth: boolean, tongue: boolean): string[] {
  // The neck a tone lighter than the jowl, so it runs on into the hide of the shoulders.
  const neck = (mouth ? HEAD_OPEN : HEAD).map((r) =>
    [...r].map((l, x) => (x >= 7 ? l : l === 'D' ? 'd' : l === 'd' ? 'm' : l)).join(''),
  );
  let g = pad(edit(neck, mood), 0, 0, HEAD_W, HEAD_H);
  if (tongue) {
    g = edit(
      g,
      mouth
        ? [
            [15, 22, 'p'],
            [16, 22, 'p'],
            [17, 22, 'p'],
            [16, 23, 'p'],
            [17, 23, 'P'],
          ]
        : [
            [20, 24, 'p'],
            [21, 24, 'p'],
            [20, 25, 'p'],
            [21, 25, 'P'],
            [20, 26, 'P'],
          ],
    );
  }
  // Hung from the hump, the head is carried a little down even at rest.
  const deg = (Math.atan(nod + 0.24) * 180) / Math.PI;
  return rotSprite(g, deg, NECK[0], NECK[1], HEAD_W + HEAD_ROOM * 2, HEAD_H + HEAD_ROOM * 2, HEAD_ROOM, HEAD_ROOM);
}

/* ------------------------------------------------------------------ legs */

/** A leg: upper segment angle and length, lower segment angle and length (degrees from straight down, + forward). */
type Leg = readonly [number, number, number, number];
/** Hind far, hind near, front far, front near. */
type Legs = readonly [Leg, Leg, Leg, Leg];

const NEAR = { lit: 'm', body: 'm', back: 'd', foot: 'K', heel: 'D' };
const FAR = { lit: 'd', body: 'd', back: 'D', foot: 'K', heel: 'K' };
/** Joints in the box: the hind legs from inside the ham, the front ones from inside the chest. */
const HIP_FAR = [8, GROUND - 12] as const;
const HIP_NEAR = [12, GROUND - 12] as const;
const SHOULDER_FAR = [42, GROUND - 14] as const;
const SHOULDER_NEAR = [46, GROUND - 14] as const;

function legLayers(legs: Legs, dy: number, k: number): { far: string[]; near: string[] } {
  const at = (p: readonly [number, number]): [number, number] => [p[0], p[1] + dy + (k ? Math.round((p[0] - 16) * k) : 0)];
  const [hf, hn, ff, fn] = legs;
  const far = cellsFrom([limb(...at(HIP_FAR), ...hf, FAR, 4, 3, 4), limb(...at(SHOULDER_FAR), ...ff, FAR, 4, 3, 4)], FW, FH);
  const near = cellsFrom([limb(...at(HIP_NEAR), ...hn, NEAR, 5, 3, 4), limb(...at(SHOULDER_NEAR), ...fn, NEAR, 5, 3, 4)], FW, FH);
  return { far, near };
}

/* ---------------------------------------------------------------- frames */

/** Every frame: 90 × 86 (room for him reared), he stands on the bottom row; the box he stands in has its (0, 0) at (OX, OY). */
const FW = 90;
const FH = 86;
const OX = 4;
const OY = FH - BOX_H;
/** The hitbox's middle line, in the box: the left edge of this column. 32 art pixels wide, so columns 22-53. */
const HIT_MID = 38;

interface Pose {
  legs?: Legs;
  /** Down by this many rows, legs and all. */
  dy?: number;
  /** The body pitched forward (front down). */
  pitch?: number;
  /** The head turned down (+) or up (-). */
  nod?: number;
  mood?: Mood;
  crest?: Grid;
  tail?: readonly [Grid, number, number];
  mouth?: boolean;
  tongue?: boolean;
  hx?: number;
  hy?: number;
}

/** Legs: hind far, hind near, front far, front near - [upper angle, length, lower angle, length]. */
const STAND: Legs = [
  [-4, 6, 10, 5],
  [-4, 6, 10, 5],
  [0, 6, 2, 6],
  [0, 6, 2, 6],
];

const TAIL_AT: readonly [Grid, number, number] = [TAIL, 0, GROUND - 24];
const UP_TAIL: readonly [Grid, number, number] = [TAIL_UP, 0, GROUND - 26];

function torso(crestRows: Grid, tail: readonly [Grid, number, number], pitch: number): { rows: string[]; dy: number } {
  const body = compose(BOX_W, BOX_H, [
    [tail[0], tail[1], tail[2]],
    [BODY, 0, 0],
    [crestRows, 0, 0],
  ]);
  if (!pitch) return { rows: body, dy: 0 };
  return { rows: shear(body, pitch, 16, 10), dy: -10 };
}

function pose(p: Pose): string[] {
  const dy = p.dy ?? 0;
  const pitch = p.pitch ?? 0;
  const { far, near } = legLayers(p.legs ?? STAND, dy, pitch);
  const body = torso(p.crest ?? CREST, p.tail ?? TAIL_AT, pitch);
  const h = head(p.nod ?? 0, p.mood ?? [], !!p.mouth, !!p.tongue);
  const neck = pitch ? Math.round((HEAD_AT[0] + 2 - 16) * pitch) : 0;
  return compose(FW, FH, [
    [far, OX, OY],
    [body.rows, OX, OY + body.dy + dy],
    [h, OX + HEAD_AT[0] - HEAD_ROOM + (p.hx ?? 0), OY + HEAD_AT[1] - HEAD_ROOM + dy + neck + (p.hy ?? 0)],
    [near, OX, OY],
  ]);
}

/** Up on his hind legs: body, crest and head turned about the hind hip, the front legs pawing the air. */
function rearing(deg: number, front: readonly [Leg, Leg], hind: readonly [Leg, Leg]): string[] {
  const body = torso(CREST_UP, UP_TAIL, 0);
  const h = head(-0.05, [], false, false);
  const whole = compose(BOX_W + 26, BOX_H, [
    [body.rows, 0, 0],
    [h, HEAD_AT[0] - HEAD_ROOM, HEAD_AT[1] - HEAD_ROOM],
  ]);
  const hip = [HIP_NEAR[0], HIP_NEAR[1]] as const;
  const turned = rotSprite(whole, -deg, hip[0], hip[1], FW, FH, OX, OY);
  const a = (-deg * Math.PI) / 180;
  const sx = SHOULDER_NEAR[0] - hip[0];
  const sy = SHOULDER_NEAR[1] - hip[1];
  const fx = hip[0] + sx * Math.cos(a) - sy * Math.sin(a);
  const fy = hip[1] + sx * Math.sin(a) + sy * Math.cos(a);
  const far = cellsFrom([limb(HIP_FAR[0], HIP_FAR[1], ...hind[0], FAR, 4, 3, 4), limb(fx - 4, fy, ...front[0], FAR, 4, 3, 4)], FW, FH);
  const near = cellsFrom([limb(fx, fy, ...front[1], NEAR, 5, 3, 4), limb(HIP_NEAR[0], HIP_NEAR[1], ...hind[1], NEAR, 5, 3, 4)], FW, FH);
  return compose(FW, FH, [
    [far, OX, OY],
    [turned, 0, 0],
    [near, OX, OY],
  ]);
}

const TROT: readonly Legs[] = [
  [
    [-20, 6, 4, 5],
    [12, 6, 14, 5],
    [16, 6, 10, 6],
    [-14, 6, -6, 6],
  ],
  [
    [-4, 6, 22, 5],
    [-4, 6, 8, 5],
    [0, 6, 34, 5],
    [0, 6, -2, 6],
  ],
  [
    [12, 6, 14, 5],
    [-20, 6, 4, 5],
    [-14, 6, -6, 6],
    [16, 6, 10, 6],
  ],
  [
    [-4, 6, 8, 5],
    [-4, 6, 22, 5],
    [0, 6, -2, 6],
    [0, 6, 34, 5],
  ],
];
const GALLOP: readonly Legs[] = [
  [
    [-55, 6, -40, 5],
    [-45, 6, -30, 5],
    [55, 6, 50, 5],
    [45, 6, 35, 5],
  ],
  [
    [-20, 6, 25, 5],
    [-30, 6, 15, 5],
    [25, 6, -5, 5],
    [15, 6, -15, 5],
  ],
  [
    [35, 6, 15, 5],
    [25, 6, 35, 5],
    [-25, 6, -45, 5],
    [-15, 6, -35, 5],
  ],
  [
    [5, 6, -25, 5],
    [-5, 6, -15, 5],
    [-40, 6, 25, 5],
    [-30, 6, 45, 5],
  ],
];
/** The near front hoof going back, up and down again: the scrape. */
const SCRAPE: readonly Leg[] = [
  [-40, 6, -15, 6],
  [10, 6, 70, 5],
  [30, 6, 10, 6],
];
const SPLAY: Legs = [
  [-16, 6, 0, 5],
  [12, 6, 8, 5],
  [-14, 6, -6, 6],
  [16, 6, 8, 6],
];
const BRACE: Legs = [
  [20, 6, 6, 5],
  [26, 6, 8, 5],
  [-20, 6, -10, 6],
  [-12, 6, -6, 6],
];
const BUCKLE: Legs = [
  [-30, 6, 60, 4],
  [30, 6, -50, 4],
  [-40, 6, 70, 4],
  [40, 6, -60, 4],
];
const FOLD: Legs = [
  [-80, 5, 100, 4],
  [-80, 5, 100, 4],
  [80, 5, -100, 4],
  [80, 5, -100, 4],
];
const SLAM: Legs = [
  [-4, 6, 10, 5],
  [-4, 6, 10, 5],
  [-30, 6, -20, 6],
  [35, 6, 25, 6],
];

function frames(): Record<BoarFrame, () => string[]> {
  const scrape = (leg: Leg): string[] =>
    pose({ legs: [STAND[0], STAND[1], [5, 6, 0, 6], leg], dy: 1, pitch: 0.06, nod: 0.18, crest: CREST_UP, tail: UP_TAIL });
  return {
    stand0: () => pose({}),
    stand1: () => pose({ dy: 1 }),
    trot0: () => pose({ legs: TROT[0] }),
    trot1: () => pose({ legs: TROT[1], dy: 1 }),
    trot2: () => pose({ legs: TROT[2] }),
    trot3: () => pose({ legs: TROT[3], dy: 1 }),
    gallop0: () => pose({ legs: GALLOP[0], dy: 1, pitch: 0.05, nod: 0.14, crest: CREST_UP }),
    gallop1: () => pose({ legs: GALLOP[1], dy: 2, pitch: 0.05, nod: 0.14, crest: CREST_UP }),
    gallop2: () => pose({ legs: GALLOP[2], dy: 1, pitch: 0.05, nod: 0.14, crest: CREST_UP }),
    gallop3: () => pose({ legs: GALLOP[3], dy: 2, pitch: 0.05, nod: 0.14, crest: CREST_UP }),
    scrape0: () => scrape(SCRAPE[0]),
    scrape1: () => scrape(SCRAPE[1]),
    scrape2: () => scrape(SCRAPE[2]),
    rear0: () =>
      rearing(
        14,
        [
          [20, 6, 30, 5],
          [30, 6, 40, 5],
        ],
        [
          [-12, 6, 14, 5],
          [-8, 6, 18, 5],
        ],
      ),
    rear1: () =>
      rearing(
        28,
        [
          [50, 6, 90, 5],
          [70, 6, 110, 5],
        ],
        [
          [-25, 6, 20, 5],
          [-20, 6, 25, 5],
        ],
      ),
    rear2: () =>
      rearing(
        28,
        [
          [80, 6, 120, 5],
          [40, 6, 70, 5],
        ],
        [
          [-25, 6, 20, 5],
          [-20, 6, 25, 5],
        ],
      ),
    slam: () => pose({ legs: SLAM, dy: 2, pitch: 0.07, nod: 0.2, crest: CREST_UP }),
    dig0: () => pose({ dy: 1, pitch: 0.06, nod: 0.3 }),
    dig1: () => pose({ dy: 2, pitch: 0.08, nod: 0.36 }),
    toss: () => pose({ nod: -0.3, hy: -1, crest: CREST_UP, tail: UP_TAIL }),
    pant0: () => pose({ dy: 1, nod: 0.12, mouth: true, tongue: true }),
    pant1: () => pose({ dy: 2, nod: 0.14, mouth: true, tongue: true }),
    dazed0: () => pose({ legs: SPLAY, dy: 1, nod: 0.16, mood: DAZED, tongue: true, hx: -1 }),
    dazed1: () => pose({ legs: SPLAY, dy: 1, nod: 0.1, mood: DAZED, tongue: true, hy: 1 }),
    stagger: () => pose({ legs: BRACE, nod: -0.18, hx: -1, hy: -1, crest: CREST_UP, mouth: true }),
    shake0: () => pose({ nod: -0.08, hx: -1, crest: CREST_UP, tail: UP_TAIL }),
    shake1: () => pose({ nod: 0.12, hx: 1, hy: 1, crest: CREST_UP }),
    roar: () => pose({ nod: -0.22, hy: -1, mouth: true, crest: CREST_UP, tail: UP_TAIL }),
    sleep0: () => pose({ legs: FOLD, dy: 9, nod: 0.3, mood: SHUT, crest: CREST_FLAT }),
    sleep1: () => pose({ legs: FOLD, dy: 10, nod: 0.3, mood: SHUT, crest: CREST_FLAT }),
    wake: () => pose({ legs: BUCKLE, dy: 4, nod: 0.1 }),
    fall0: () => pose({ legs: BUCKLE, dy: 4, nod: 0.2, mood: SHUT, mouth: true }),
    fall1: () => pose({ legs: BUCKLE, dy: 7, pitch: 0.08, nod: 0.35, mood: SHUT, tongue: true, crest: CREST_FLAT }),
    fall2: () => pose({ legs: FOLD, dy: 10, pitch: 0.04, nod: 0.4, mood: SHUT, tongue: true, crest: CREST_FLAT }),
  };
}

export type BoarFrame =
  | 'stand0'
  | 'stand1'
  | 'trot0'
  | 'trot1'
  | 'trot2'
  | 'trot3'
  | 'gallop0'
  | 'gallop1'
  | 'gallop2'
  | 'gallop3'
  | 'scrape0'
  | 'scrape1'
  | 'scrape2'
  | 'rear0'
  | 'rear1'
  | 'rear2'
  | 'slam'
  | 'dig0'
  | 'dig1'
  | 'toss'
  | 'pant0'
  | 'pant1'
  | 'dazed0'
  | 'dazed1'
  | 'stagger'
  | 'shake0'
  | 'shake1'
  | 'roar'
  | 'sleep0'
  | 'sleep1'
  | 'wake'
  | 'fall0'
  | 'fall1'
  | 'fall2';

/**
 * His frames, cropped to what is in them; each remembers where the box he
 * stands in went, so all of them are drawn by the same point.
 */
const MAKE = frames();
const cut = {} as Record<BoarFrame, string[]>;
const at = {} as Record<BoarFrame, { x: number; y: number }>;

/** A frame, worked out the first time it is wanted (see warmBoar). */
function ensureBoar(name: BoarFrame): void {
  if (cut[name]) return;
  const c = crop(despeckle(MAKE[name]()));
  cut[name] = c.rows;
  at[name] = { x: c.x, y: c.y };
}

export const BOAR = new Sheet<BoarFrame>(cut, KEY, PALETTES);

const PENDING = Object.keys(MAKE) as BoarFrame[];

/**
 * Works out frames still missing for up to `budget` ms - a little at a time
 * from the moment he is in view, so neither the game's start nor the fight
 * pays for all of him at once. True once all of him is ready.
 */
export function warmBoar(budget: number): boolean {
  const t0 = performance.now();
  while (PENDING.length > 0) {
    const name = PENDING.shift();
    if (name) ensureBoar(name);
    if (performance.now() - t0 >= budget) break;
  }
  return PENDING.length === 0;
}

/**
 * Draws a frame with the middle of his hitbox at logical x `cx` and his
 * hooves on `bottom`. The hitbox (32 art pixels wide) runs over columns
 * HIT_MID - 16 .. HIT_MID + 15 of the box; its middle line is the left edge
 * of column HIT_MID. His head and rump reach past it, his hump and mane rise
 * over it: the hitbox is the hide a sword finds at the height it swings.
 */
export function drawBoar(ctx: CanvasRenderingContext2D, frame: BoarFrame, cx: number, bottom: number, facing: 1 | -1, hot: boolean): void {
  ensureBoar(frame);
  const o = at[frame];
  BOAR.draw(ctx, frame, cx, bottom, OX + HIT_MID - o.x, FH - o.y, facing, hot ? 'hot' : '');
}

/** Everything as rows, for looking at outside the game. */
export function boarDebug(): { key: Record<string, string>; palettes: typeof PALETTES; frames: Record<string, string[]> } {
  for (const n of Object.keys(MAKE) as BoarFrame[]) ensureBoar(n);
  return { key: KEY, palettes: PALETTES, frames: { ...cut, body: BODY, crest: CREST, head: HEAD.slice(), headOpen: HEAD_OPEN.slice() } };
}

/* ----------------------------------------------------------- what he makes */

/** Stars round a dazed head: a four-point twinkle, big and small. */
export const STARS = new Sheet<'big' | 'small'>(
  {
    big: ['..y..', '..Y..', 'yYTYy', '..Y..', '..y..'],
    small: ['.Y.', 'YTY', '.Y.'],
  },
  { y: RAMP.fire[2], Y: RAMP.fire[3], T: RAMP.fire[4] },
);

/**
 * The ridge of earth the stomp throws up, running along the floor: a crest
 * of dirt, lit on top, clods in the air over it - at four heights, tallest
 * while it runs, smaller as it rises and as it sinks. Facing right, the way
 * it runs; it stands on its bottom row.
 */
export const RIDGE = new Sheet<'r0' | 'r1' | 'r2' | 'r3'>(
  {
    r3: [
      '.........l...',
      '....l.......l',
      '.......llm...',
      '......lmmmd..',
      '.....lmmmmdD.',
      '....lmmmmmdD.',
      '...lmmdmmmddD',
      '..lmmmmmmdddD',
      '.dmmmdmmmddDD',
      'dddddddddDDDD',
    ],
    r2: [
      '.....l.....l.',
      '.........l...',
      '.......lmd...',
      '.....llmmdD..',
      '...llmmdmmdD.',
      '..lmmmmmmddD.',
      '.dmmdmmmmddDD',
      'dddddddddDDDD',
    ],
    r1: [
      '......l..l...',
      '.....llmmd...',
      '...llmmdmmdD.',
      '.ddmmmmmmddDD',
      'dddddddddDDDD',
    ],
    r0: ['....l...l....', '..ddmmmmddD..', 'dddddddddDDDD'],
  },
  { l: RAMP.earth[4], m: RAMP.earth[3], d: RAMP.earth[2], D: RAMP.earth[1] },
);
