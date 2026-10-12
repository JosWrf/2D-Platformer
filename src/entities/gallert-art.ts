import { RAMP } from '../render/palette';
import { PixelSprite } from '../render/pixel';
import { type Decal, type Mat, PartCache, type PartSprite, buildUpright, cell } from './boss-art';

/**
 * Gallert, der Aufgequollene, drawn for the grid: a dome of jelly at the lime
 * end of the green ramp - two steps above the forest's grass - lit along its
 * crown and pooling dark at its foot, a gloss on its brow, two round eyes
 * that watch the hero and a wide mouth; inside, the things the bog has fed
 * it (a bone, a sword, a skull, stones) as dark clusters seen through the
 * jelly, and the core that lights before every move. Squash and stretch are
 * drawn shapes, not a scale: five of them, from flattened to stretched, and
 * a four-frame jiggle at rest. Two dark eyes with a glint and a wide dark
 * mouth with a red tongue, so his face reads against the lime from across the
 * clearing. And the bog he rises out of: a heaving mire heap behind him and a
 * lip of mire round his foot, with bones of what it swallowed sticking out of
 * it and bubbles coming up - his set piece, which sinks into a puddle when he
 * leaps and wells up again where he lands.
 */

const JELLY = 1;
const GLOSS = 2;
const EYE = 3;
const PUPIL = 4;
const MOUTH = 5;
const SUNK = 6;
const CORE = 7;

const MATS: Mat[] = [
  { tones: [RAMP.green[2], RAMP.green[3], RAMP.green[4], RAMP.green[5], RAMP.green[6]], flat: true },
  { tones: [RAMP.green[6], RAMP.grey[7]], flat: true },
  { tones: [RAMP.slate[0], RAMP.grey[7]], flat: true },
  { tones: [RAMP.slate[0]], flat: true },
  { tones: [RAMP.slate[0], RAMP.rose[2]], flat: true },
  { tones: [RAMP.green[1], RAMP.green[2], RAMP.green[3]], flat: true },
  { tones: [RAMP.green[6], RAMP.fire[4], RAMP.grey[7]], flat: true },
];

/** His shapes, flattened to stretched: width and height in logical px. */
const SHAPES: readonly (readonly [number, number])[] = [
  [112, 56],
  [104, 64],
  [96, 72],
  [88, 80],
  [80, 88],
];

export type Mouth = 'grin' | 'open' | 'squint';

const cache = new PartCache();

/**
 * Gallert in one of the five shapes (0 flattened .. 4 stretched), `jiggle`
 * 0..3 at rest, his mouth, his core at a heat (0..2); facing right, standing
 * on the origin.
 */
export function gallertPart(shape: number, jiggle: number, mouth: Mouth, heat: 0 | 1 | 2): PartSprite {
  return cache.get(`g|${shape}|${jiggle}|${mouth}|${heat}`, () => {
    const [bw, bh] = SHAPES[shape];
    const wob = [0, 2, 0, -2][jiggle & 3];
    const w = bw + wob;
    const h = bh - wob;
    const half = (y: number): number => {
      const v = -y / h;
      if (v < 0 || v > 1) return -1;
      if (v <= 0.18) return (w / 2) * (0.94 + 0.33 * v);
      const k = (v - 0.18) / 0.82;
      return (w / 2) * Math.sqrt(Math.max(0, 1 - k * k)) * (1 - 0.05 * k);
    };
    const paint = (x: number, y: number): number => {
      const hw = half(y);
      if (hw < 0 || Math.abs(x) > hw) return 0;
      const v = -y / h;
      // The foot, where he sits on the ground: dark, and darker at the very bottom.
      if (y > -3) return cell(JELLY, 0);
      if (y > -7) return cell(JELLY, 1);
      // The rim of light along his crown and his lit side.
      const above = half(y - 3);
      if ((above < 0 || Math.abs(x) > above) && x < hw * 0.55) return cell(JELLY, 4);
      const u = (x / hw + 1) / 2;
      const light = 0.7 * v + 0.45 * (1 - u) - 0.1;
      return cell(JELLY, light > 0.72 ? 4 : light > 0.42 ? 3 : light > 0.16 ? 2 : 1);
    };
    // Everything placed on him moves with his shape.
    const at = (fx: number, fy: number): [number, number] => [fx * (w / 2), -fy * h];
    const decals: Decal[] = [];
    const add = (fx: number, fy: number, grid: string[], cells: Record<string, number>): void => {
      const [x, y] = at(fx, fy);
      decals.push({ x, y, grid, cells });
    };
    // What he has swallowed, sunk in him: a bone, a sword, a skull, stones.
    const sunk = { a: cell(SUNK, 0), b: cell(SUNK, 1) };
    add(-0.5, 0.26, ['a....a', 'aabbaa', 'a....a'], sunk);
    add(0.46, 0.3, ['..a', '.ab', 'aa.', 'ba.', 'a..'], sunk);
    add(-0.12, 0.17, ['.aa.', 'abba', 'a..a'], sunk);
    add(0.2, 0.14, ['aa', 'ab'], sunk);
    add(-0.68, 0.5, ['ab', 'a.'], sunk);
    // The core, which is the tell: it fills before every move.
    const core = { c: cell(CORE, 0), y: cell(CORE, 1), w: cell(CORE, 2) };
    add(0, 0.4, heat === 2 ? ['.yyy.', 'ywwwy', 'ywwwy', 'ywwwy', '.yyy.'] : heat === 1 ? ['.y.', 'yWy', '.y.'].map((r) => r.replace('W', 'w')) : ['.c.', 'cyc', '.c.'], core);
    // The gloss on his brow.
    add(-0.44, 0.78, ['.ggg', 'gGG.', 'gG..', 'g...'], { g: cell(GLOSS, 0), G: cell(GLOSS, 1) });
    // Two big dark eyes with a glint, towards the hero; screwed shut as he
    // flattens to leap.
    const eye = mouth === 'squint' ? ['kkkk', 'k..k'] : ['.KK.', 'KWKK', 'KWKK', 'KKKK', '.KK.'];
    const eyeCells = { K: cell(EYE, 0), W: cell(EYE, 1), k: cell(PUPIL, 0) };
    add(0.1, 0.66, eye, eyeCells);
    add(0.52, 0.66, eye, eyeCells);
    // And the mouth, dark with a red tongue: a wide grin, or gaping to spit.
    const mouthGrid =
      mouth === 'open'
        ? ['..KKKK..', '.KKKKKK.', 'KKKRRKKK', 'KKRRRRKK', '.KKRRKK.', '..KKKK..']
        : ['K........K', 'KKKKKKKKKK', '.KKRRRRKK.', '..KKKKKK..'];
    add(0.32, mouth === 'open' ? 0.4 : 0.44, mouthGrid, { K: cell(MOUTH, 0), R: cell(MOUTH, 1) });
    return buildUpright(-w / 2 - 4, -h - 4, w / 2 + 4, 0, MATS, paint, decals);
  });
}

/* ------------------------------------------------------------------ the bog */

const BOG = 1;
const BONE = 2;
const RUST = 3;

const BOG_MATS: Mat[] = [
  { tones: [RAMP.earth[2], RAMP.earth[3], RAMP.earth[4]] },
  { tones: [RAMP.earth[4], RAMP.earth[6], RAMP.earth[7]], flat: true },
  { tones: [RAMP.slate[0], RAMP.rose[2]], flat: true },
  { tones: [RAMP.green[3], RAMP.green[4], RAMP.green[5]], flat: true },
];
const SCUM = 4;

/** The heap's height at x (logical, his front to the right), its level 0..4 and heave frame. */
function heapAt(x: number, level: number, frame: number): number {
  const k = level / 4;
  const heave = [0, 3, 5, 3][frame & 3];
  let h = Math.abs(x) < 66 ? 5 * Math.sqrt(Math.max(0, 1 - (x / 66) ** 2)) : 0;
  for (const [c, w, a] of [
    [-10, 46, 98 + heave],
    [30, 28, 46 - heave / 2],
    [-46, 26, 60 + heave / 2],
    [56, 14, 22],
  ]) {
    const u = (x - c) / w;
    if (Math.abs(u) < 1) h = Math.max(h, a * k * Math.pow(1 - u * u, 0.6));
  }
  return h;
}

const bog = new PartCache();

/**
 * The mire heap behind him, `level` 0 (a puddle, while he is in the air) to 4
 * (heaped up round him), in four frames of its heave: lumps of peat with his
 * slime oozing down over their crowns, streaks of mud, and the bones of what
 * it took sticking out of it - ribs, a skull, a thighbone, the hilt of
 * somebody's sword. Standing on the floor at the origin, his front to the right.
 */
export function mirePart(level: number, frame: number): PartSprite {
  return bog.get(`heap|${level}|${frame & 3}`, () => {
    const paint = (x: number, y: number): number => {
      const h = heapAt(x, level, frame);
      if (h <= 0 || -y > h || y > 0) return 0;
      const depth = h + y;
      // His slime oozing down over the crown of the heap, in tongues that
      // creep a little from frame to frame.
      const ooze = 4 + 5 * Math.max(0, Math.sin(x * 0.21 + (frame & 3) * 0.4));
      if (depth < ooze) return cell(SCUM, depth < 2 ? 2 : depth < 4 ? 1 : 0);
      // Streaks of darker mud, two rows thick, following the heap's shape.
      if (depth > 10 && depth % 16 < 2.5) return cell(BOG, 0);
      return cell(BOG, 1);
    };
    const decals: Decal[] = [];
    if (level >= 3) {
      const bone = { b: cell(BONE, 1), B: cell(BONE, 0), w: cell(BONE, 2), K: cell(RUST, 0), r: cell(RUST, 1) };
      const top = heapAt(-10, level, frame);
      decals.push({ x: -54, y: -26, grid: ['BbBbBbB', 'b.b.b.b', 'b.b.b.b', 'b.b.b.b'], cells: bone });
      decals.push({ x: -12, y: -top + 16, grid: ['.wwbbb.', 'wwbbbbb', 'bKKbKKb', 'bKKbKKB', '.bbbbB.', '.bKbKB.'], cells: bone });
      decals.push({ x: 46, y: -24, grid: ['wb....', 'bbb...', '.bbB..', '..bbB.', '...bbB', '....BB'], cells: bone });
      decals.push({ x: -40, y: -50, grid: ['.r.', 'rrr', '.r.', '.K.', '.K.'], cells: bone });
    }
    return buildUpright(-84, -116, 76, 0, BOG_MATS, paint, decals);
  });
}

/** The lip of mire round his foot, drawn in front of him: rippling, four frames. */
export function lipPart(level: number, frame: number): PartSprite {
  return bog.get(`lip|${level}|${frame & 3}`, () =>
    buildUpright(-60, -14, 60, 0, BOG_MATS, (x, y) => {
      if (Math.abs(x) > 56 || y > 0) return 0;
      const crest = (2 + level) * (1 - (x / 58) ** 2) + Math.sin(x * 0.35 + (frame & 3) * 1.6) * 1.2;
      if (-y > crest) return 0;
      return -y > crest - 2.5 ? cell(SCUM, 1) : cell(BOG, 1);
    }),
  );
}

const BUBBLE_KEY = { g: RAMP.green[4], W: RAMP.green[6], d: RAMP.green[3] };
const BUBBLES = [
  ['gg', 'gg'],
  ['.gg.', 'gWWg', 'gggg', '.gg.'],
  ['.ggg.', 'gWWgg', 'gWggg', 'ggggg', '.ggg.'],
  ['d...d', 'd...d'],
].map((rows) => new PixelSprite(rows, BUBBLE_KEY));

/** Where the heap's surface is at x, for the bubbles that come up through it. */
export function heapTop(x: number, level: number, frame: number): number {
  return heapAt(x, level, frame);
}

/** A bubble coming up through the mire: growing over three frames, then popping; -1 for none. */
export function bubbleSprite(stage: number): PixelSprite | null {
  return stage >= 0 && stage < BUBBLES.length ? BUBBLES[stage] : null;
}
