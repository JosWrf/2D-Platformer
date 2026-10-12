import { RAMP } from '../render/palette';
import { Sheet, compose, type Grid } from '../render/sheet';
import { cellsFrom, crop, edit, limb, pad, rotSprite, shear } from './puppet';

/**
 * Grimmzahn, drawn for the grid: a boar of some forty-five art pixels from
 * rump to snout - a wedge of a beast, the line of his back falling from the
 * crest over his shoulders down his long head to the snout, short legs under
 * a deep chest, a curved ivory tusk the brightest thing on him.
 *
 * He is put together from parts, the way a big sprite is puppeted: one body
 * (its hide shaded from the upper left, a tan top-light over the rump and
 * the shoulders, the mane's dark band along the spine), a crest of bristle
 * tufts in three moods (lying, standing, laid back in the wind of a charge),
 * one head - turned down or up by shearing its columns, given its moods by a
 * few changed pixels (a hot eye, a dazed one, a shut one, the jaw dropped,
 * the tongue out) - and four legs laid down at the angles of each pose.
 * Rearing he is turned about his hind hip with RotSprite. Every frame is made
 * once, when the sheet is first used, and drawn from then on as a blit.
 *
 * Frames face right and stand on their bottom row. No outer outline: the
 * actor pass puts it round him.
 */

const KEY: Record<string, string> = {
  /** Bristles, hooves. */
  K: RAMP.earth[0],
  /** The bristles' rust glint. */
  k: RAMP.rust[0],
  /** Hide: deepest shadow, shadow, hide, tan top-light, a rust spark of it. */
  D: RAMP.earth[1],
  d: RAMP.earth[2],
  m: RAMP.earth[3],
  l: RAMP.earth[4],
  r: RAMP.rust[1],
  /** Snout and tusk: the tusk's root, its shade, its ivory. */
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

/* ------------------------------------------------------------------ body */

/*
 * The body in the coordinates of a 48 × 28 box he stands in: where the hide
 * starts and ends, column by column - the spine falling from the crest over
 * the shoulders (x 18-26) to the rump, the belly rising from a deep chest.
 */
const TOP: Record<number, number> = {
  3: 12, 4: 10, 5: 9, 6: 8, 7: 8, 8: 7, 9: 7, 10: 7, 11: 6, 12: 6, 13: 6, 14: 5, 15: 5, 16: 5, 17: 5, 18: 4, 19: 4,
  20: 4, 21: 4, 22: 4, 23: 4, 24: 4, 25: 4, 26: 4, 27: 5, 28: 5, 29: 6, 30: 6, 31: 7, 32: 7, 33: 8,
};
const BOT: Record<number, number> = {
  3: 15, 4: 17, 5: 18, 6: 19, 7: 19, 8: 19, 9: 19, 10: 19, 11: 19, 12: 19, 13: 19, 14: 19, 15: 20, 16: 20, 17: 20,
  18: 20, 19: 20, 20: 20, 21: 20, 22: 20, 23: 21, 24: 21, 25: 21, 26: 21, 27: 21, 28: 21, 29: 21, 30: 21, 31: 21,
  32: 21, 33: 21,
};

function bodyGrid(): string[] {
  const g: string[][] = [];
  for (let y = 0; y < 22; y++) g.push(new Array<string>(34).fill('.'));
  for (let x = 3; x <= 33; x++) {
    const t = TOP[x];
    const b = BOT[x];
    for (let y = t; y <= b; y++) {
      // Hide; shadow over the belly and down the barrel; the deepest under it.
      g[y][x] = y >= b ? 'D' : y >= b - 2 || (y >= b - 3 && x >= 12 && x <= 23) ? 'd' : 'm';
    }
    // The mane's band along the spine.
    if (x >= 6 && x <= 30) {
      g[t][x] = 'K';
      if (x >= 9 && x <= 29) g[t + 1][x] = 'K';
    }
    // The top-light just under it, wherever the back faces up or up-left.
    const under = t + (x >= 9 && x <= 29 ? 2 : x >= 6 && x <= 30 ? 1 : 0);
    const rising = (TOP[x + 1] ?? 99) <= t;
    if ((rising || x <= 6) && under < b - 2 && x <= 30) g[under][x] = 'l';
  }
  for (const [x, y] of [
    [22, 6],
    [23, 6],
    [24, 6],
    [4, 11],
  ]) {
    g[y][x] = 'r';
  }
  // The rump's lit edge.
  for (let y = 10; y < 14; y++) {
    for (let x = 2; x < 8; x++) {
      if (g[y][x] === 'm' || g[y][x] === 'd') {
        g[y][x] = 'l';
        break;
      }
    }
  }
  return g.map((r) => r.join(''));
}

const BODY = bodyGrid();

/** The crest: tufts along the spine, (column, height), leaning back, a rust glint down the lit edge of each. */
function crest(tufts: readonly (readonly [number, number])[], lean: number): string[] {
  const g: string[][] = [];
  for (let y = 0; y < 14; y++) g.push(new Array<string>(34).fill('.'));
  for (const [x0, h] of tufts) {
    const base = Math.min(TOP[x0], TOP[x0 + 1], TOP[x0 + 2]);
    for (let k = 0; k < h; k++) {
      const y = base - 1 - k;
      if (y < 0) continue;
      const left = x0 - Math.floor((k * lean) / 2) - (k === h - 1 && h > 1 ? 1 : 0);
      for (let x = left; x < left + Math.max(1, 3 - k); x++) g[y][x] = 'K';
      g[y][left] = 'k';
    }
  }
  return g.map((r) => r.join(''));
}

const CREST = crest(
  [
    [6, 1],
    [9, 2],
    [12, 2],
    [15, 3],
    [18, 3],
    [21, 4],
    [24, 4],
    [27, 3],
    [29, 2],
  ],
  1,
);
/** Standing up: he means it. */
const CREST_UP = crest(
  [
    [6, 2],
    [9, 3],
    [12, 4],
    [15, 4],
    [18, 5],
    [21, 5],
    [24, 5],
    [27, 4],
    [29, 3],
  ],
  1,
);
/** Laid back in the wind of a charge: no taller than his head. */
const CREST_FLAT = crest(
  [
    [9, 1],
    [12, 1],
    [15, 2],
    [18, 2],
    [21, 2],
    [24, 2],
    [27, 2],
  ],
  3,
);

const TAIL: Grid = ['.DD', 'D..', 'D..', 'KD.', 'K..'];
const TAIL_UP: Grid = ['.DD', 'D.K', '...'];

/* ------------------------------------------------------------------ head */

/** The head, neck at the left: ear, brow, ember eye, the long face falling to the snout, the tusk. */
const HEAD: Grid = [
  '.................',
  '..D..............',
  '..dD.............',
  '.mdD.............',
  '.mmd.............',
  'mmmmll...........',
  'mmmmmmll.........',
  'mmmDemmmll.......',
  'mmmmmmmmmml......',
  'mmmmmmmmmmml.....',
  'mmmmmmmmmmmml....',
  'mmdmmmmmmmmmml...',
  'mmdmmmmmmmmmmml..',
  'mmmdmmmmmmmmmmml.',
  'mmmdmmmmmmmmmmmlS',
  'mmmmdmmmmmmmmmmlS',
  'dmmmmddmmmmmmTmlD',
  'ddmmmmmdmmmmTtdll',
  'dddddddddmmTmddl.',
  '.DDDDDDDDDStDDD..',
];
/** Where the head's (0, 0) sits on the body. */
const HEAD_AT = [29, 2] as const;

type Mood = readonly (readonly [number, number, string])[];
const SHUT: Mood = [
  [3, 7, 'D'],
  [4, 7, 'D'],
];
const DAZED: Mood = [
  [3, 6, 'Y'],
  [5, 6, 'Y'],
  [4, 7, 'Y'],
  [3, 8, 'Y'],
  [5, 8, 'Y'],
];

/** The jaw dropped from its hinge, the tusk going down with it (it grows from the lower jaw): squealing, panting. */
const HEAD_OPEN: Grid = [
  ...HEAD.slice(0, 16),
  'dmmmmddmmmmmmmmlD',
  'ddmmmmmdddddddmll',
  'dddddddDPPPPPPdl.',
  '.DDDDDDdDPPPPPT..',
  '......DmdDPPPTt..',
  '......DmmmmmTmD..',
  '.......DDDDDSDD..',
];

/** Where the head is turned about: the middle of the neck. */
const NECK = [3, 12] as const;
/** Room round the turned head, so nothing of it is cut off. */
const HEAD_ROOM = 6;

/**
 * The head in a mood, the jaw dropped or not, the tongue out or not, turned
 * about the neck with RotSprite - `nod` the tangent of the angle, + the snout
 * down. Its (0, 0) ends up at (HEAD_ROOM, HEAD_ROOM).
 */
function head(nod: number, mood: Mood, mouth: boolean, tongue: boolean): string[] {
  let g = pad(edit(mouth ? HEAD_OPEN : HEAD, mood), 0, 0, 19, 24);
  if (tongue) {
    g = edit(
      g,
      mouth
        ? [
            [10, 19, 'p'],
            [11, 19, 'p'],
            [12, 19, 'p'],
            [11, 20, 'p'],
            [12, 20, 'P'],
          ]
        : [
            [9, 20, 'p'],
            [10, 20, 'p'],
            [9, 21, 'p'],
            [10, 21, 'P'],
            [9, 22, 'P'],
          ],
    );
  }
  const deg = (Math.atan(nod) * 180) / Math.PI;
  return rotSprite(g, deg, NECK[0], NECK[1], 19 + HEAD_ROOM * 2, 24 + HEAD_ROOM * 2, HEAD_ROOM, HEAD_ROOM);
}

/* ------------------------------------------------------------------ legs */

/** A leg: upper segment angle and length, lower segment angle and length (degrees from straight down, + forward). */
type Leg = readonly [number, number, number, number];
/** Hind far, hind near, front far, front near. */
type Legs = readonly [Leg, Leg, Leg, Leg];

const NEAR = { lit: 'm', body: 'm', back: 'd', foot: 'K', heel: 'D' };
const FAR = { lit: 'D', body: 'D', back: 'd', foot: 'K', heel: 'K' };
const HIP_FAR = [5, 17] as const;
const HIP_NEAR = [9, 17] as const;
const SHOULDER_FAR = [26, 19] as const;
const SHOULDER_NEAR = [29, 19] as const;

function legLayers(legs: Legs, dy: number, k: number): { far: string[]; near: string[] } {
  const at = (p: readonly [number, number]): [number, number] => [p[0], p[1] + dy + (k ? Math.round((p[0] - 10) * k) : 0)];
  const [hf, hn, ff, fn] = legs;
  const far = cellsFrom([limb(...at(HIP_FAR), ...hf, FAR), limb(...at(SHOULDER_FAR), ...ff, FAR)], 50, 32);
  const near = cellsFrom([limb(...at(HIP_NEAR), ...hn, NEAR), limb(...at(SHOULDER_NEAR), ...fn, NEAR)], 50, 32);
  return { far, near };
}

/* ---------------------------------------------------------------- frames */

/** Every frame: 52 × 36, he stands on the bottom row; the box he stands in has its (0, 0) at (2, 8). */
const FW = 52;
const FH = 36;
const OX = 2;
const OY = 8;

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

const STAND: Legs = [
  [0, 4, 8, 5],
  [0, 4, 8, 5],
  [0, 3, 0, 4],
  [0, 3, 0, 4],
];

function torso(crestRows: Grid, tail: readonly [Grid, number, number], pitch: number): { rows: string[]; dy: number } {
  const body = compose(50, 30, [
    [tail[0], tail[1], tail[2]],
    [BODY, 0, 0],
    [crestRows, 0, 0],
  ]);
  if (!pitch) return { rows: body, dy: 0 };
  return { rows: shear(body, pitch, 10, 10), dy: -10 };
}

function pose(p: Pose): string[] {
  const dy = p.dy ?? 0;
  const pitch = p.pitch ?? 0;
  const { far, near } = legLayers(p.legs ?? STAND, dy, pitch);
  const body = torso(p.crest ?? CREST, p.tail ?? [TAIL, 1, 10], pitch);
  const h = head(p.nod ?? 0, p.mood ?? [], !!p.mouth, !!p.tongue);
  const neck = pitch ? Math.round((HEAD_AT[0] + 2 - 10) * pitch) : 0;
  return compose(FW, FH, [
    [far, OX, OY],
    [body.rows, OX, OY + body.dy + dy],
    [h, OX + HEAD_AT[0] - HEAD_ROOM + (p.hx ?? 0), OY + HEAD_AT[1] - HEAD_ROOM + dy + neck + (p.hy ?? 0)],
    [near, OX, OY],
  ]);
}

/** Up on his hind legs: body, crest and head turned about the hind hip, the front legs pawing the air. */
function rearing(deg: number, front: readonly [Leg, Leg], hind: readonly [Leg, Leg]): string[] {
  const body = torso(CREST_UP, [TAIL_UP, 1, 9], 0);
  const h = head(-0.05, [], false, false);
  const whole = compose(50, 34, [
    [body.rows, 0, 4],
    [h, HEAD_AT[0] - HEAD_ROOM, HEAD_AT[1] - HEAD_ROOM + 4],
  ]);
  const hip = [8, 21] as const;
  const turned = rotSprite(whole, -deg, hip[0], hip[1], 50, 44, 0, 8);
  const a = (-deg * Math.PI) / 180;
  const sx = SHOULDER_NEAR[0] - hip[0];
  const sy = SHOULDER_NEAR[1] + 4 - hip[1];
  const fx = hip[0] + sx * Math.cos(a) - sy * Math.sin(a);
  const fy = hip[1] + sx * Math.sin(a) + sy * Math.cos(a) - 4;
  const far = cellsFrom([limb(HIP_FAR[0], HIP_FAR[1], ...hind[0], FAR), limb(fx - 3, fy, ...front[0], FAR)], 50, 32);
  const near = cellsFrom([limb(fx, fy, ...front[1], NEAR), limb(HIP_NEAR[0], HIP_NEAR[1], ...hind[1], NEAR)], 50, 32);
  return compose(FW, FH, [
    [far, OX, OY],
    [turned, OX, OY - 12],
    [near, OX, OY],
  ]);
}

const TROT: readonly Legs[] = [
  [
    [-14, 4, 6, 5],
    [16, 4, 4, 5],
    [14, 3, 10, 4],
    [-12, 3, -4, 4],
  ],
  [
    [0, 4, 18, 4],
    [0, 4, 4, 5],
    [0, 3, 30, 3],
    [0, 3, -2, 4],
  ],
  [
    [16, 4, 4, 5],
    [-14, 4, 6, 5],
    [-12, 3, -4, 4],
    [14, 3, 10, 4],
  ],
  [
    [0, 4, 4, 5],
    [0, 4, 18, 4],
    [0, 3, -2, 4],
    [0, 3, 30, 3],
  ],
];
const GALLOP: readonly Legs[] = [
  [
    [-50, 4, -40, 4],
    [-40, 4, -30, 4],
    [55, 3, 50, 4],
    [45, 3, 35, 4],
  ],
  [
    [-15, 4, 25, 3],
    [-25, 4, 15, 4],
    [25, 3, -5, 3],
    [15, 3, -15, 3],
  ],
  [
    [35, 4, 15, 4],
    [25, 4, 35, 3],
    [-25, 3, -45, 3],
    [-15, 3, -35, 3],
  ],
  [
    [5, 4, -25, 4],
    [-5, 4, -15, 4],
    [-40, 3, 25, 3],
    [-30, 3, 45, 3],
  ],
];
/** The near front hoof going back, up and down again: the scrape. */
const SCRAPE: readonly Leg[] = [
  [-40, 3, -15, 4],
  [10, 3, 70, 3],
  [30, 3, 10, 4],
];
const SPLAY: Legs = [
  [-12, 4, 0, 5],
  [12, 4, 6, 5],
  [-14, 3, -6, 4],
  [16, 3, 8, 4],
];
const BRACE: Legs = [
  [18, 4, 6, 5],
  [24, 4, 8, 5],
  [-18, 3, -10, 4],
  [-10, 3, -6, 4],
];
const BUCKLE: Legs = [
  [-30, 4, 60, 3],
  [30, 4, -50, 3],
  [-40, 3, 70, 2],
  [40, 3, -60, 2],
];
const FOLD: Legs = [
  [-80, 4, 100, 3],
  [-80, 4, 100, 3],
  [80, 3, -100, 3],
  [80, 3, -100, 3],
];
const SLAM: Legs = [
  [0, 4, 8, 5],
  [0, 4, 8, 5],
  [-30, 3, -20, 4],
  [35, 3, 25, 4],
];

const UP_TAIL = [TAIL_UP, 1, 9] as const;

function frames(): Record<BoarFrame, string[]> {
  const scrape = (leg: Leg): string[] =>
    pose({ legs: [STAND[0], STAND[1], [5, 3, 0, 4], leg], dy: 1, pitch: 0.06, nod: 0.18, crest: CREST_UP, tail: UP_TAIL });
  return {
    stand0: pose({}),
    stand1: pose({ dy: 1 }),
    trot0: pose({ legs: TROT[0] }),
    trot1: pose({ legs: TROT[1], dy: 1 }),
    trot2: pose({ legs: TROT[2] }),
    trot3: pose({ legs: TROT[3], dy: 1 }),
    gallop0: pose({ legs: GALLOP[0], dy: 1, pitch: 0.05, nod: 0.14, crest: CREST_FLAT }),
    gallop1: pose({ legs: GALLOP[1], dy: 2, pitch: 0.05, nod: 0.14, crest: CREST_FLAT }),
    gallop2: pose({ legs: GALLOP[2], dy: 1, pitch: 0.05, nod: 0.14, crest: CREST_FLAT }),
    gallop3: pose({ legs: GALLOP[3], dy: 2, pitch: 0.05, nod: 0.14, crest: CREST_FLAT }),
    scrape0: scrape(SCRAPE[0]),
    scrape1: scrape(SCRAPE[1]),
    scrape2: scrape(SCRAPE[2]),
    rear0: rearing(
      16,
      [
        [20, 3, 30, 4],
        [30, 3, 40, 4],
      ],
      [
        [-12, 4, 14, 5],
        [-8, 4, 18, 5],
      ],
    ),
    rear1: rearing(
      32,
      [
        [50, 3, 90, 4],
        [70, 3, 110, 4],
      ],
      [
        [-25, 4, 20, 5],
        [-20, 4, 25, 5],
      ],
    ),
    rear2: rearing(
      32,
      [
        [80, 3, 120, 4],
        [40, 3, 70, 4],
      ],
      [
        [-25, 4, 20, 5],
        [-20, 4, 25, 5],
      ],
    ),
    slam: pose({ legs: SLAM, dy: 2, pitch: 0.07, nod: 0.2, crest: CREST_UP }),
    dig0: pose({ dy: 1, pitch: 0.06, nod: 0.3 }),
    dig1: pose({ dy: 2, pitch: 0.08, nod: 0.36 }),
    toss: pose({ nod: -0.3, hy: -1, crest: CREST_UP, tail: UP_TAIL }),
    pant0: pose({ dy: 1, nod: 0.12, mouth: true, tongue: true }),
    pant1: pose({ dy: 2, nod: 0.14, mouth: true, tongue: true }),
    dazed0: pose({ legs: SPLAY, dy: 1, nod: 0.16, mood: DAZED, tongue: true, hx: -1 }),
    dazed1: pose({ legs: SPLAY, dy: 1, nod: 0.1, mood: DAZED, tongue: true, hy: 1 }),
    stagger: pose({ legs: BRACE, nod: -0.18, hx: -1, hy: -1, crest: CREST_UP, mouth: true }),
    shake0: pose({ nod: -0.08, hx: -1, crest: CREST_UP, tail: UP_TAIL }),
    shake1: pose({ nod: 0.12, hx: 1, hy: 1, crest: CREST_UP }),
    roar: pose({ nod: -0.22, hy: -1, mouth: true, crest: CREST_UP, tail: UP_TAIL }),
    sleep0: pose({ legs: FOLD, dy: 6, nod: 0.3, mood: SHUT, crest: CREST_FLAT }),
    sleep1: pose({ legs: FOLD, dy: 7, nod: 0.3, mood: SHUT, crest: CREST_FLAT }),
    wake: pose({ legs: BUCKLE, dy: 3, nod: 0.1 }),
    fall0: pose({ legs: BUCKLE, dy: 3, nod: 0.2, mood: SHUT, mouth: true }),
    fall1: pose({ legs: BUCKLE, dy: 5, pitch: 0.08, nod: 0.35, mood: SHUT, tongue: true, crest: CREST_FLAT }),
    fall2: pose({ legs: FOLD, dy: 7, pitch: 0.04, nod: 0.4, mood: SHUT, tongue: true, crest: CREST_FLAT }),
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
const made = frames();
const cut: Record<string, string[]> = {};
const at: Record<string, { x: number; y: number }> = {};
for (const [name, rows] of Object.entries(made)) {
  const c = crop(rows);
  cut[name] = c.rows;
  at[name] = { x: c.x, y: c.y };
}

export const BOAR = new Sheet<BoarFrame>(cut as Record<BoarFrame, string[]>, KEY, PALETTES);

/**
 * Draws a frame with the middle of his hitbox at logical x `cx` and his
 * hooves on `bottom`. The hitbox (32 art pixels wide) runs over columns
 * 11-42 of the uncropped frame; its middle line is the left edge of column 27.
 */
export function drawBoar(ctx: CanvasRenderingContext2D, frame: BoarFrame, cx: number, bottom: number, facing: 1 | -1, hot: boolean): void {
  const o = at[frame];
  BOAR.draw(ctx, frame, cx, bottom, 27 - o.x, FH - o.y, facing, hot ? 'hot' : '');
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
