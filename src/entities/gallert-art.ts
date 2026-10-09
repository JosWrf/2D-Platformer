import { RAMP } from '../render/palette';
import { type Decal, type Mat, PartCache, type PartSprite, buildUpright, cell } from './boss-art';

/**
 * Gallert, der Aufgequollene, drawn for the grid: a dome of jelly at the lime
 * end of the green ramp - two steps above the forest's grass - lit along its
 * crown and pooling dark at its foot, a gloss on its brow, two round eyes
 * that watch the hero and a wide mouth; inside, the things the bog has fed
 * it (a bone, a sword, a skull, stones) as dark clusters seen through the
 * jelly, and the core that lights before every move. Squash and stretch are
 * drawn shapes, not a scale: five of them, from flattened to stretched, and
 * a four-frame jiggle at rest.
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
  { tones: [RAMP.grey[7]], flat: true },
  { tones: [RAMP.green[0]], flat: true },
  { tones: [RAMP.green[0], RAMP.green[1]], flat: true },
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
    // Two round eyes, towards the hero; squinting as he flattens to leap.
    const eye =
      mouth === 'squint'
        ? ['KKKK', '.KK.']
        : ['.ww.', 'wwKK', 'wwKK', '.ww.'];
    const eyeCells = { w: cell(EYE, 0), K: cell(PUPIL, 0) };
    add(0.12, 0.66, eye, eyeCells);
    add(0.52, 0.66, eye, eyeCells);
    // And the mouth: a wide grin, or wide open to spit.
    const mouthGrid =
      mouth === 'open'
        ? ['.kkkk.', 'kKKKKk', 'kKKKKk', '.kkkk.']
        : ['k.....k', '.kkkkk.'];
    add(0.34, mouth === 'open' ? 0.44 : 0.48, mouthGrid, { k: cell(MOUTH, 0), K: cell(MOUTH, 1) });
    return buildUpright(-w / 2 - 4, -h - 4, w / 2 + 4, 0, MATS, paint, decals);
  });
}
