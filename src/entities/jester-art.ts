import { RAMP } from '../render/palette';
import { Sheet, eightWays } from '../render/sheet';
import { type Decal, type Mat, PartCache, type PartSprite, buildPart, cell, inOval, inPoly, quad, segDist, stepAngle } from './boss-art';

/**
 * Maskarill's parts: the doublet in harlequin diamonds, the head with its
 * porcelain mask and its cap of three bells, the sleeves and the hose, each
 * drawn at sixteen turns (see boss-art.ts) and put together on his skeleton
 * every frame at whole art pixels. Violet and gold on the dark of the stage,
 * the mask the brightest thing on him.
 */

/** His drawn size against the skeleton the fight measures with: a showman stands tall. */
export const FIG = 1.15;

/* The paints: 15 of the palette, and the black of the shadow he throws. */
const VIOLET = 1;
const GOLD = 2;
const PORCELAIN = 3;
const INK = 4;
const RED = 5;
const TEAR_BLUE = 6;
const TEAR_RED = 7;
const HOOD = 8;
const SIL = 9;
const DIM = 10;
const EMBER = 11;
const SMOKE = 12;
const ASH = 13;

export const JESTER_MATS: readonly Mat[] = [
  { tones: [RAMP.plum[0], RAMP.plum[1], RAMP.plum[2], RAMP.plum[3]] },
  { tones: [RAMP.earth[3], RAMP.earth[4], RAMP.rust[3], RAMP.fire[3]] },
  { tones: [RAMP.slate[5], RAMP.slate[6], RAMP.grey[7]] },
  { tones: [RAMP.earth[0]], flat: true },
  { tones: [RAMP.rose[2]], flat: true },
  { tones: [RAMP.blue[3]], flat: true },
  { tones: [RAMP.rose[3]], flat: true },
  { tones: [RAMP.earth[0], RAMP.plum[0], RAMP.plum[1]] },
  { tones: [RAMP.earth[0]], flat: true },
  { tones: [RAMP.plum[0]], flat: true },
  { tones: [RAMP.fire[4]], flat: true },
  { tones: [RAMP.slate[5]], flat: true },
  { tones: [RAMP.slate[3]], flat: true },
];

/** His bones (logical px), as the fight measures them. */
export const BONES = { thigh: 16, shin: 15, torso: 21, upper: 12, fore: 11 } as const;

/* ------------------------------------------------------------- painters */

type Painter = (x: number, y: number) => number;

/** A limb from its pivot down its length, tapering from r0 to r1. */
function capsule(x: number, y: number, len: number, r0: number, r1: number): boolean {
  const t = Math.max(0, Math.min(1, y / len));
  const r = r0 + (r1 - r0) * t;
  const dy = y - t * len;
  return x * x + dy * dy <= r * r;
}

/** The thigh: hose in one colour. */
function thigh(mat: number): Painter {
  return (x, y) => (capsule(x, y, BONES.thigh, 2.9, 2.6) ? cell(mat, 2) : 0);
}

/** The shoe, from the ankle: pointed forward and curled up into a bell. */
const SHOE: number[] = [
  -3.5, -2.6,
  ...quad(-3.5, -2.6, 4, -4.2, 8, -2.2, 4).slice(2),
  ...quad(8, -2.2, 11.5, -1.2, 12.5, -5.6, 4).slice(2),
  ...quad(12.5, -5.6, 11.5, 1.6, 6, 2, 4).slice(2),
  -3.5, 2,
];

/** Shin, knee patch, shoe and the bell on its toe. */
function shin(mat: number, patch: number, shoe: number): Painter {
  const L = BONES.shin;
  return (x, y) => {
    // The bell on the toe.
    const bx = x - 12.6;
    const by = y - (L - 6);
    if (bx * bx + by * by <= 1.9 * 1.9) return by < -0.6 && bx < 0 ? cell(GOLD, 3) : cell(GOLD, 2);
    if (inPoly(x, y - L, SHOE)) return cell(shoe, 1);
    if (x * x + y * y <= 2.3 * 2.3) return cell(patch, 2);
    return capsule(x, y, L, 2.6, 2.1) ? cell(mat, 2) : 0;
  };
}

/** The upper arm: a puffed sleeve from the shoulder. */
function upperArm(mat: number): Painter {
  return (x, y) => {
    if (x * x + y * y <= 4.4 * 4.4) return cell(mat, x + y < -2.2 ? 3 : 2);
    return capsule(x, y, BONES.upper, 2.6, 2.5) ? cell(mat, 2) : 0;
  };
}

/** The forearm: sleeve, a ruffled cuff in the other colour, a white glove. */
function foreArm(mat: number, cuff: number): Painter {
  const L = BONES.fore;
  return (x, y) => {
    const gy = y - L;
    if (x * x + gy * gy <= 2.9 * 2.9) return cell(PORCELAIN, 2);
    const cy = y - L * 0.72;
    if (x * x + cy * cy <= 2.7 * 2.7) return cell(cuff, 2);
    return capsule(x, y, L, 2.5, 2.4) ? cell(mat, 2) : 0;
  };
}

/** The doublet, from the hips up: a dagged hem, a pinched waist, square shoulders. */
const DOUBLET: number[] = [
  -7.8, 3, -5.2, 7.4, -2.6, 3.6, 0, 7.8, 2.6, 3.6, 5.2, 7.4, 7.8, 3,
  ...quad(7.8, 3, 8.8, -4, 6.2, -9.5, 5).slice(2),
  ...quad(6.2, -9.5, 8.9, -15.5, 6.6, -21, 5).slice(2),
  -6.4, -21,
  ...quad(-6.4, -21, -8.4, -14, -5.6, -9.2, 5).slice(2),
  ...quad(-5.6, -9.2, -8.8, -3, -7.8, 3, 5).slice(2),
];

/** Harlequin diamonds six art pixels across and eight high, gold down his middle, violet at his sides; his back a step darker. */
function torso(): Painter {
  return (x, y) => {
    if (!inPoly(x, y, DOUBLET)) return 0;
    // The belt and its buckle.
    if (y >= -10.6 && y <= -8) return x >= 3 && x <= 6.4 ? cell(GOLD, 3) : cell(VIOLET, 0);
    const u = Math.floor((x + 6) / 12 + (y + 16) / 16);
    const v = Math.floor((x + 6) / 12 - (y + 16) / 16);
    const gold = ((u + v) & 1) === 0;
    const back = x < -3.4 ? -1 : 0;
    return gold ? cell(GOLD, 2 + back) : cell(VIOLET, 2 + back);
  };
}

/** The ruff round the neck: a zig-zag of starched white. */
const RUFF: number[] = (() => {
  const out: number[] = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const r = i % 2 ? 1 : 1.26;
    out.push(Math.cos(a) * 9.6 * r, 0.6 + Math.sin(a) * 3.6 * r);
  }
  return out;
})();

/** A horn of the cap, sampled: from the band, through its pull, to the bell. */
function horn(bx: number, by: number, cx: number, cy: number, tx: number, ty: number): number[] {
  return quad(bx, by, cx, cy, tx, ty, 7);
}

/** The box round a list of points, grown by `pad`: [x0, y0, x1, y1]. */
function bounds(pts: readonly number[], pad: number): [number, number, number, number] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    x0 = Math.min(x0, pts[i]);
    x1 = Math.max(x1, pts[i]);
    y0 = Math.min(y0, pts[i + 1]);
    y1 = Math.max(y1, pts[i + 1]);
  }
  return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
}

function inBox(x: number, y: number, b: readonly number[]): boolean {
  return x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
}

function inHorn(x: number, y: number, pts: readonly number[], w: number): boolean {
  const n = pts.length / 2 - 1;
  for (let i = 0; i < n; i++) {
    const { d, t } = segDist(x, y, pts[i * 2], pts[i * 2 + 1], pts[i * 2 + 2], pts[i * 2 + 3]);
    if (d <= w * (1 - ((i + t) / n) * 0.82)) return true;
  }
  return false;
}

export interface HeadLook {
  /** How far the points of the cap trail, quantised: -2..2. */
  sway: number;
  /** The bells shaking in the crouch: -1, 0 or 1. */
  jingle: number;
  /** The mask knocked off his face, 0..2 (in place, slipping, askew). */
  off: number;
  cracked: boolean;
  /** His second half: the painted tear runs red. */
  late: boolean;
}

/** The porcelain mask in its own frame (its middle at the origin, logical px); 0 outside it. */
function mask(x: number, y: number): number {
  return (x * x) / (6.4 * 6.4) + (y * y) / (8 * 8) > 1 ? 0 : cell(PORCELAIN, 2);
}

/**
 * The face painted on it, placed by hand and stamped where the turned mask
 * puts each feature: almond eyes, the far one narrower, a tear under the near
 * one, a wide red smile with its corners turned up - and a crack, once the
 * hero has found him out. Offsets in the mask's frame; `turn` is its own.
 */
function face(mx: number, my: number, turn: number, cracked: boolean, late: boolean): Decal[] {
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  const at = (x: number, y: number): [number, number] => [mx + x * c - y * s, my + x * s + y * c];
  const ink = { K: cell(INK, 0) };
  const out: Decal[] = [];
  const add = (x: number, y: number, grid: string[], cells: Record<string, number>): void => {
    const [ax, ay] = at(x, y);
    out.push({ x: ax, y: ay, grid, cells, turn });
  };
  add(-1.9, -1.8, ['KK'], ink);
  add(3.4, -1.8, ['K'], ink);
  add(-2.8, 0.6, ['t'], { t: cell(late ? TEAR_RED : TEAR_BLUE, 0) });
  add(0.8, 4, ['R...R', '.RRR.'], { R: cell(RED, 0) });
  if (cracked) add(1.6, -5.2, ['K.', '.K', 'K.'], ink);
  return out;
}

/**
 * The head, from the neck up: hood, porcelain mask, the cap's crown and its
 * three points with a bell each, the gold band across the brow, the ruff.
 */
/** Where the mask sits on the head: knocked down, forward and turned on the chin as it comes off. */
function maskFrame(off: number): { mx: number; my: number; mr: number } {
  const k = off / 2;
  return { mx: 1.2 + k * 6.5, my: -9 + k * 8.5, mr: k * 0.9 };
}

function head(look: HeadLook): Painter {
  const s = look.sway * 2.2;
  const j = look.jingle * 2;
  const horns: [number[], number][] = [
    [horn(-5.2, -15.2, -15 + s, -24, -17.5 + s * 1.5 + j, -9.5), VIOLET],
    [horn(-0.6, -17.6, 1.5 + s, -31, -7 + s * 1.9 - j, -33.5), GOLD],
    [horn(3.8, -16.2, 13 + s, -25, 15.5 + s * 1.5 + j, -12.5), VIOLET],
  ];
  const band = quad(-7.4, -12.4, 0, -17.6, 7.2, -13.6, 8);
  const { mx, my, mr } = maskFrame(look.off);
  const mc = Math.cos(mr);
  const ms = Math.sin(mr);
  // Boxes to turn most of the canvas away before any distance is measured.
  const hornBox = horns.map(([pts]) => bounds(pts, 3.6));
  const bandBox = bounds(band, 1.4);
  const all = bounds([...hornBox.flat(), ...bandBox, -12, 6, 12, -18, mx - 9, my - 9, mx + 9, my + 9], 0.5);
  return (x, y) => {
    if (!inBox(x, y, all)) return 0;
    // The band across the brow, and its three studs.
    if (inBox(x, y, bandBox)) for (let i = 0; i + 3 < band.length; i += 2) {
      if (segDist(x, y, band[i], band[i + 1], band[i + 2], band[i + 3]).d <= 1.25) {
        const stud = Math.abs(x + 4.4) < 1 || Math.abs(x) < 1 || Math.abs(x - 4.4) < 1;
        return stud && y < -13.4 ? cell(GOLD, 3) : cell(GOLD, 2);
      }
    }
    // The points and their bells.
    for (let k = 0; k < horns.length; k++) {
      if (!inBox(x, y, hornBox[k])) continue;
      const [pts, mat] = horns[k];
      const bx = x - pts[pts.length - 2];
      const by = y - pts[pts.length - 1];
      if (bx * bx + by * by <= 2.6 * 2.6) return bx + by < -1.4 ? cell(GOLD, 3) : by > 1 ? cell(GOLD, 1) : cell(GOLD, 2);
      if (inHorn(x, y, pts, 3.4)) return cell(mat, 2);
    }
    // The crown of the cap.
    if (y <= -13.4 && inOval(x, y, -0.6, -13.4, 7.8, 5.2)) return cell(VIOLET, 2);
    // The mask, in its own frame.
    const m = mask((x - mx) * mc + (y - my) * ms, -(x - mx) * ms + (y - my) * mc);
    if (m) return m;
    // Behind the mask there is nothing: a hollow (and two embers in it, stamped on).
    if (look.off > 0 && inOval(x, y, 1.2, -9, 6.2, 7.8)) return cell(INK, 0);
    // The hood round the back of the head.
    if (inOval(x, y, -1.8, -9.5, 7.2, 8.6)) return cell(HOOD, 1);
    // The ruff.
    if (inPoly(x, y, RUFF)) return cell(PORCELAIN, 2);
    return 0;
  };
}

/** A knife, pointing along +x: blade, guard and grip. Only its shadow is drawn from this. */
function knife(x: number, y: number): boolean {
  if (x >= 0 && x <= 9 && Math.abs(y) <= 2.3 * (1 - x / 9)) return true;
  if (x >= -1.4 && x <= 0.6 && Math.abs(y) <= 3.4) return true;
  return x >= -6.6 && x <= -1.2 && Math.abs(y) <= 1.2;
}

/** Every cell of a painter in one flat colour: the shadow on the wall, or a smear. */
function flat(p: Painter, mat: number): Painter {
  return (x, y) => (p(x, y) ? cell(mat, 0) : 0);
}

/* ---------------------------------------------------------------- sprites */

export type PartKind = 'thighF' | 'thighB' | 'shinF' | 'shinB' | 'upperF' | 'upperB' | 'foreF' | 'foreB' | 'torso';

const PAINTERS: Record<PartKind, Painter> = {
  // The harlequin's legs: the near one violet, the far one gold.
  thighF: thigh(VIOLET),
  thighB: thigh(GOLD),
  shinF: shin(VIOLET, GOLD, HOOD),
  shinB: shin(GOLD, VIOLET, VIOLET),
  // And the arms the other way round.
  upperF: upperArm(GOLD),
  upperB: upperArm(VIOLET),
  foreF: foreArm(GOLD, VIOLET),
  foreB: foreArm(VIOLET, GOLD),
  torso: torso(),
};

const REACH: Record<PartKind, number> = {
  thighF: 20,
  thighB: 20,
  shinF: 29,
  shinB: 29,
  upperF: 17,
  upperB: 17,
  foreF: 15,
  foreB: 15,
  torso: 24,
};

/** How a part is drawn: in its colours, as the shadow on the wall, or as the smear of a wheel. */
export type Look = 'body' | 'sil' | 'dim' | 'smoke' | 'ash';

/** The one paint of every look but the body: the shadow, the shadow on a dark stage, a copy going up in smoke. */
const FLAT: Record<Exclude<Look, 'body'>, number> = { sil: SIL, dim: DIM, smoke: SMOKE, ash: ASH };

const cache = new PartCache();

/** A part at one of sixteen turns and one scale. */
export function part(kind: PartKind, step: number, scale: number, look: Look): PartSprite {
  return cache.get(`${kind}|${step}|${scale}|${look}`, () => {
    const p = PAINTERS[kind];
    const paint = look === 'body' ? p : flat(p, FLAT[look]);
    return buildPart(REACH[kind], stepAngle(step), scale, JESTER_MATS, paint);
  });
}

/** The head at one of sixteen turns. */
export function headPart(step: number, scale: number, look: Look, h: HeadLook): PartSprite {
  const id = look === 'body' ? `${h.off}${h.cracked ? 'c' : ''}${h.late ? 'l' : ''}` : '';
  return cache.get(`head|${step}|${scale}|${look}|${h.sway}|${h.jingle}|${id}`, () => {
    const p = head(look === 'body' ? h : { ...h, off: 0, cracked: false, late: false });
    const paint = look === 'body' ? p : flat(p, FLAT[look]);
    const { mx, my, mr } = maskFrame(h.off);
    const decals = look === 'body' ? face(mx, my, mr, h.cracked, h.late) : [];
    // And where the mask was: two embers in the dark, a pixel apart.
    if (look === 'body' && h.off > 0) {
      for (const ex of [-0.4, 4.6]) {
        const lx = (ex - mx) * Math.cos(mr) + (-10.6 - my) * Math.sin(mr);
        const ly = -(ex - mx) * Math.sin(mr) + (-10.6 - my) * Math.cos(mr);
        if (!mask(lx, ly)) decals.push({ x: ex, y: -10.6, grid: ['E', 'E'], cells: { E: cell(EMBER, 0) } });
      }
    }
    return buildPart(40, stepAngle(step), scale, JESTER_MATS, paint, decals);
  });
}

/** The mask alone, off his face: falling, and lying on the boards. */
export function maskPart(step: number): PartSprite {
  return cache.get(`mask|${step}`, () => buildPart(9, stepAngle(step), FIG, JESTER_MATS, mask, face(0, 0, 0, true, false)));
}

/** A juggled knife's shadow on the wall, at one of sixteen turns. */
export function knifeShadow(step: number, scale: number, look: Exclude<Look, 'body'>): PartSprite {
  return cache.get(`knife|${step}|${scale}|${look}`, () => buildPart(10, stepAngle(step), scale, JESTER_MATS, (x, y) => (knife(x, y) ? cell(FLAT[look], 0) : 0)));
}

/* ------------------------------------------------------------- the knives */

/*
 * The knives he juggles, in the eight ways a turning knife can point: the
 * blade two pixels thick on the diagonals, so it is a stroke and not a row of
 * loose dots once the actor layer has drawn its outline round it.
 */
const KNIFE_E = ['.y......', 'pyssssWW', '.y......'];
const KNIFE_NE = ['.....WW', '....ssW', '...sst.', '..sst..', '.yyt...', 'pyy....', 'pp.....'];

export const JUGGLED = new Sheet<string>(
  Object.fromEntries(eightWays(KNIFE_E, KNIFE_NE).map((f, i) => [`k${i}`, f])),
  { p: RAMP.plum[2], y: RAMP.rust[3], s: RAMP.slate[6], t: RAMP.slate[5], W: RAMP.grey[7] },
);

/* ------------------------------------------------------------- the stars */

/** The bells that go round a dizzy head: near and far. */
export const DIZZY_BELLS = new Sheet<'near' | 'far'>(
  {
    near: ['..y..', '.yYy.', 'yYWYy', '.yYy.', '..y..'],
    far: ['.y.', 'yYy', '.y.'],
  },
  { y: RAMP.rust[3], Y: RAMP.fire[3], W: RAMP.grey[7] },
);
