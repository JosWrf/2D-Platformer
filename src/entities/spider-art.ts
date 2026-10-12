import { RAMP } from '../render/palette';
import { ART, snap } from '../render/pixel';
import { Sheet, type Grid } from '../render/sheet';
import { type Cells, cellsOf, crop, rowsOf, strokeCells } from './puppet';

/**
 * Arachna, drawn for the grid: the queen of the web chamber, seen from the
 * front the way anyone knows a spider - abdomen up, head down, eight legs
 * radiating from her. Pale as her own silk, so she stands out of the dark
 * teal of her cave: a glossy abdomen in the slate ramp, lit from the upper
 * left in three tones and a glint, with a crystal hourglass of cave light
 * set in a dark saddle; a cluster of pink eyes; jointed legs - three
 * segments each, three, two and one pixel thick, a line of light along the
 * upper edge and a dark knot at each joint.
 *
 * Her poses are frames worked out from the joints of each leg: hanging
 * (legs reaching up and out round her, swaying), drawn in for the drop,
 * standing (legs arched over her to the floor, a walk of four), rolled up
 * for the swing, on her back (legs kicking at the air) and curled up dead,
 * and the lash - the front pair on one side up and back, then across.
 * The crystal flares as a palette of its own.
 *
 * Every frame is 72 × 64 with her middle at (36, 32). No outer outline: the
 * actor pass outlines her.
 */

const KEY: Record<string, string> = {
  a: RAMP.slate[1],
  b: RAMP.slate[2],
  c: RAMP.slate[3],
  d: RAMP.slate[4],
  e: RAMP.slate[5],
  f: RAMP.slate[6],
  h: RAMP.blue[3],
  H: RAMP.blue[4],
  W: RAMP.blue[6],
  p: RAMP.rose[2],
  P: RAMP.rose[5],
  q: RAMP.rose[4],
  x: RAMP.grey[7],
};

/** The crystal burning before she spits silk or lays her eggs. */
const PALETTES = { glow: { h: RAMP.blue[4], H: RAMP.blue[6], W: RAMP.grey[7] } };

const FW = 72;
const FH = 64;
const CX = 36;
const CY = 32;

const HOURGLASS: Grid = [
  '.aaaaaaa.',
  'ahHWWWHha',
  '.ahHWHha.',
  '..ahHha..',
  '...aHa...',
  '..ahHha..',
  '.ahHHHha.',
  'ahHHWHHha',
  '.aaaaaaa.',
];
/** Two big eyes with a glint on their lit edge, and the small ones beside and under them. */
const EYES: Grid = ['.pPp.pPp.', 'qxPPpxPPq', '.pPp.pPp.', '..qp.pq..'];

function put(c: Cells, x: number, y: number, letter: string): void {
  const row = c[Math.floor(y)];
  const col = Math.floor(x);
  if (row && col >= 0 && col < row.length) row[col] = letter;
}

function stamp(c: Cells, g: Grid, x0: number, y0: number, upsideDown = false): void {
  const src = upsideDown ? [...g].reverse() : g;
  src.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] !== '.') put(c, x0 + x, y0 + y, row[x]);
  });
}

/** An oval lit from the upper left: sheen, body, shade and a dark far edge, and a glint. */
function shadedOval(c: Cells, cx: number, cy: number, rx: number, ry: number): void {
  for (let y = 0; y < FH; y++) {
    for (let x = 0; x < FW; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      const r2 = dx * dx + dy * dy;
      if (r2 > 1) continue;
      const light = -0.62 * dx - 0.78 * dy + 0.35 * (1 - r2);
      c[y][x] = r2 > 0.82 && light < 0.1 ? 'b' : light > 0.62 ? 'e' : light > 0.05 ? 'd' : light > -0.45 ? 'c' : 'b';
    }
  }
  const gx = Math.floor(cx - rx * 0.45);
  const gy = Math.floor(cy - ry * 0.5);
  put(c, gx, gy, 'f');
  put(c, gx + 1, gy, 'f');
}

type Pt = readonly [number, number];

/** A leg, root to tip through knee and ankle: 3, 2 and 1 cells thick (the joints show where it narrows), its tip dark. */
function leg(c: Cells, root: Pt, knee: Pt, ankle: Pt, tip: Pt): void {
  strokeCells(c, root[0], root[1], knee[0], knee[1], 'd', 3);
  strokeCells(c, knee[0], knee[1], ankle[0], ankle[1], 'd', 2);
  strokeCells(c, ankle[0], ankle[1], tip[0], tip[1], 'c', 1);
  put(c, tip[0], tip[1], 'b');
}

/** Light along the top of every leg: each leg cell with nothing above it. */
function lightLegs(c: Cells): void {
  for (let y = FH - 1; y > 0; y--) {
    for (let x = 0; x < FW; x++) if (c[y][x] === 'd' && c[y - 1][x] === '.') c[y][x] = 'e';
  }
}

type Pose = 'hang' | 'stand' | 'ball' | 'back' | 'curl';

interface LegSet {
  sd: number;
  i: number;
  root: Pt;
  knee: Pt;
  ankle: Pt;
  tip: Pt;
}

function legsFor(pose: Pose, t: number, open: number, lash: number, kick: boolean): LegSet[] {
  const out: LegSet[] = [];
  for (const sd of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const sway = Math.sin(t + i * 1.1 + (sd > 0 ? 0.8 : 0)) * (kick ? 4 : 1.2);
      const ry = -1 + i * 3.5;
      let root: Pt = [sd * 6, ry];
      let knee: Pt;
      let ankle: Pt;
      let tip: Pt;
      if (pose === 'hang') {
        knee = [sd * (10 + (15 + i * 1.5) * open), ry - (13 - i * 4.5) * open - 4 + sway];
        ankle = [sd * (14 + (21 - i) * open), ry - (2 - i * 4) * open + sway * 0.7];
        tip = [sd * (13 + (22 - i * 2) * open), ry + (7 + i * 6) * open + 5 + sway * 0.5];
      } else if (pose === 'stand') {
        knee = [sd * (14 + i * 4.5), -15 + i * 2.5 + sway * 0.4];
        ankle = [sd * (20 + i * 5.5), -5 + i * 2];
        tip = [sd * (22 + i * 6 + sway * 0.3), 15];
      } else if (pose === 'ball') {
        knee = [sd * (12 + i), ry - 8 + i * 3];
        ankle = [sd * (14 - i * 0.5), ry + 2 + i * 2];
        tip = [sd * (9 - i * 0.5), ry + 9 + i];
      } else if (pose === 'back') {
        root = [sd * 5, -4 + i * 2.5];
        knee = [sd * (11 + i * 3.5), -12 - i * 0.5 + sway];
        ankle = [sd * (13 + i * 4.5), -21 + i * 1.5 + sway];
        tip = [sd * (9 + i * 4), -27 + i * 2.5 + sway * 1.5];
      } else {
        root = [sd * 5, -4 + i * 2.5];
        knee = [sd * (9 + i * 2), -9 + i];
        ankle = [sd * (8 + i * 1.5), -14 + i * 1.5];
        tip = [sd * (4 + i), -12 + i * 1.5];
      }
      // The lash: the front pair of the right-hand side up and back, then across.
      if (lash !== 0 && i < 2 && sd > 0) {
        const up = Math.max(0, lash);
        const across = Math.max(0, -lash);
        knee = [knee[0] + sd * (4 * up + 7 * across), knee[1] - 11 * up + 3 * across];
        ankle = [ankle[0] + sd * (3 * up + 16 * across), ankle[1] - 20 * up + 6 * across];
        tip = [tip[0] + sd * (2 * up + 24 * across), tip[1] - 26 * up + 7 * across];
      }
      out.push({ sd, i, root, knee, ankle, tip });
    }
  }
  return out;
}

/** Pinholes between crossing legs filled with their shade: no lone pixel of background inside her. */
function fillPinholes(c: Cells): void {
  for (let y = 1; y < FH - 1; y++) {
    for (let x = 1; x < FW - 1; x++) {
      if (c[y][x] === '.' && c[y - 1][x] !== '.' && c[y + 1][x] !== '.' && c[y][x - 1] !== '.' && c[y][x + 1] !== '.') c[y][x] = 'b';
    }
  }
}

function spider(pose: Pose, t = 0, open = 1, lash = 0, kick = false): string[] {
  const c = spiderCells(pose, t, open, lash, kick);
  fillPinholes(c);
  return rowsOf(c);
}

function spiderCells(pose: Pose, t: number, open: number, lash: number, kick: boolean): Cells {
  const c = cellsOf([], FW, FH);
  const at = (p: Pt): Pt => [CX + p[0], CY + p[1]];
  // The hind legs first, the front pair over them.
  const legs = legsFor(pose, t, open, lash, kick).sort((a, b) => b.i - a.i);
  for (const l of legs) leg(c, at(l.root), at(l.knee), at(l.ankle), at(l.tip));
  lightLegs(c);
  if (pose === 'back' || pose === 'curl') {
    // On her back: belly up, the abdomen down on the floor and the head over it.
    shadedOval(c, CX, CY + 5, 13, 10);
    stamp(c, HOURGLASS, CX - 4, CY + 1);
    shadedOval(c, CX, CY - 6, 8, 6);
    stamp(c, EYES, CX - 4, CY - 9, true);
    return c;
  }
  const ab = pose === 'stand' ? -12 : pose === 'ball' ? -8 : -14;
  shadedOval(c, CX, CY + ab, 13, pose === 'hang' ? 15 : 12);
  stamp(c, HOURGLASS, CX - 4, CY + ab - 4);
  shadedOval(c, CX, CY + 4, 8, 7);
  stamp(c, EYES, CX - 4, CY + 2);
  for (const [x, y] of [
    [CX - 2, CY + 8],
    [CX - 2, CY + 9],
    [CX - 1, CY + 10],
    [CX + 1, CY + 8],
    [CX + 1, CY + 9],
    [CX, CY + 10],
  ]) {
    put(c, x, y, 'a');
  }
  return c;
}

export type SpiderFrame =
  | 'hang0'
  | 'hang1'
  | 'tuck'
  | 'half'
  | 'lashup'
  | 'lashmid'
  | 'lash'
  | 'stand0'
  | 'stand1'
  | 'stand2'
  | 'stand3'
  | 'ball'
  | 'back0'
  | 'back1'
  | 'back2'
  | 'curl';

const made: Record<SpiderFrame, string[]> = {
  hang0: spider('hang', 0),
  hang1: spider('hang', 1.6),
  half: spider('hang', 0, 0.65),
  tuck: spider('hang', 0, 0.35),
  lashup: spider('hang', 0, 1, 1),
  lashmid: spider('hang', 0, 1, 0.45),
  lash: spider('hang', 0, 1, -1),
  stand0: spider('stand', 0),
  stand1: spider('stand', 1.6),
  stand2: spider('stand', 3.2),
  stand3: spider('stand', 4.8),
  ball: spider('ball'),
  back0: spider('back', 0, 1, 0, true),
  back1: spider('back', 1.6, 1, 0, true),
  back2: spider('back', 3.2, 1, 0, true),
  curl: spider('curl'),
};
const cut = {} as Record<SpiderFrame, string[]>;
const off = {} as Record<SpiderFrame, { x: number; y: number }>;
for (const name of Object.keys(made) as SpiderFrame[]) {
  const c = crop(made[name]);
  cut[name] = c.rows;
  off[name] = { x: c.x, y: c.y };
}

export const ARACHNA = new Sheet<SpiderFrame>(cut, KEY, PALETTES);

/** Draws a frame with her middle at (x, y); facing -1 mirrors it (the lash to the left). */
export function drawArachna(ctx: CanvasRenderingContext2D, frame: SpiderFrame, x: number, y: number, facing: 1 | -1, glow: boolean): void {
  const o = off[frame];
  ARACHNA.draw(ctx, frame, x, y, CX - o.x, CY - o.y, facing, glow ? 'glow' : '');
}

/* ----------------------------------------------------- what she leaves */

/** Silk lying on the floor: crossing strands, and the same thinned out as it goes. */
export const SILK = new Sheet<'patch' | 'thin'>(
  {
    patch: ['...e.......e.......e......e...', '.eefe..e.ee.ee..e.efe.e..ee...', 'efeeefeeeefeeeefeeeeeefeeeefee'],
    thin: ['.....e.............e..........', '..e.....e....e..........e.....', 'e..e.e....e....e.e...e...e..e.'],
  },
  KEY,
);

/** An egg sac, and what is in it growing darker as it gets ready. */
export const EGG = new Sheet<'e0' | 'e1' | 'e2'>(
  {
    e0: ['..fff..', '.ffeef.', 'feeeeef', 'eedddee', 'eeddcee', '.eeeee.', '..eee..'],
    e1: ['..fff..', '.ffeef.', 'feedbef', 'edbbbde', 'edbbbde', '.eddde.', '..eee..'],
    e2: ['..fff..', '.feeef.', 'fedbaef', 'ebaaabe', 'ebaqabe', '.ebbbe.', '..eee..'],
  },
  KEY,
);

/** Her young: a hand-sized spider in her colours, side on, its legs in three steps. */
export const YOUNG = new Sheet<'w0' | 'w1' | 'w2'>(
  {
    w0: ['...dddd.dd.', '..deeedddPq', '.cddHdddddd', 'c.c.c..c.c.', 'c..c.c.c..c'],
    w1: ['...dddd.dd.', '..deeedddPq', '.cddHdddddd', '.c.c.cc.c..', 'c..c..c..c.'],
    w2: ['...dddd.dd.', '..deeedddPq', '.cddHdddddd', 'c..cc.c.c.c', '.c..c..cc..'],
  },
  KEY,
);

/** A flat ring on the floor, on whole art pixels: the rows of an ellipse's outline between two radii. */
export function floorRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, thick: number, color: string): void {
  const ax = snap(cx) / ART;
  const ay = snap(cy) / ART;
  const rxa = Math.max(1, Math.round(rx / ART));
  const rya = Math.max(1, Math.round(ry / ART));
  ctx.fillStyle = color;
  for (let row = -rya; row <= rya; row++) {
    const v = (row + 0.5) / (rya + 0.5);
    const outer = Math.floor(rxa * Math.sqrt(Math.max(0, 1 - v * v)));
    const iv = (row + 0.5) / Math.max(0.5, rya - thick + 0.5);
    const inner = Math.abs(iv) >= 1 ? -1 : Math.floor((rxa - thick) * Math.sqrt(Math.max(0, 1 - iv * iv)));
    if (outer < 0) continue;
    if (inner < 0) {
      ctx.fillRect((ax - outer) * ART, (ay + row) * ART, (outer * 2 + 1) * ART, ART);
    } else {
      ctx.fillRect((ax - outer) * ART, (ay + row) * ART, (outer - inner) * ART, ART);
      ctx.fillRect((ax + inner + 1) * ART, (ay + row) * ART, (outer - inner) * ART, ART);
    }
  }
}

export const SPIDER_PAINT = KEY;
