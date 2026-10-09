import { RAMP } from '../render/palette';
import { type Decal, type Mat, PartCache, type PartSprite, buildPart, cell, segDist } from './boss-art';

/**
 * Der Splitterwächter, drawn for the grid: what the rift grew in the knight's
 * place - a knight in pale silver plate, the rift's lilac in its trim, its
 * crown and its shoulders grown out of it as crystal shards (three flat
 * facets each, a one-pixel white edge on the lit one), a visor lit from
 * inside and the white diamond on its chest that burns before every move.
 * Built from shapes (boss-art.ts) once per lean, flare and heat, mirrored
 * to face the hero; twice the hero's height, crown and all.
 */

const PLATE = 1;
const TRIM = 2;
const SHARD = 3;
const EDGE = 4;
const VISOR = 5;
const CORE = 6;
const DARK = 7;

const MATS: Mat[] = [
  { tones: [RAMP.slate[3], RAMP.slate[4], RAMP.slate[5], RAMP.slate[6], RAMP.grey[7]] },
  { tones: [RAMP.plum[1], RAMP.plum[2], RAMP.plum[3], RAMP.violet[4]] },
  { tones: [RAMP.plum[1], RAMP.plum[2], RAMP.plum[3], RAMP.violet[4]], flat: true },
  { tones: [RAMP.violet[5], RAMP.grey[7]], flat: true },
  { tones: [RAMP.fire[1], RAMP.fire[2], RAMP.fire[4]], flat: true },
  { tones: [RAMP.violet[5], RAMP.grey[7]], flat: true },
  { tones: [RAMP.slate[1], RAMP.slate[2]], flat: true },
];

const cache = new PartCache();

/**
 * A crystal shard from (bx, by) to its tip (tx, ty), `w` half as wide: three
 * faces across, lit, plain and shadowed, a white edge along the lit ridge.
 */
function shard(x: number, y: number, bx: number, by: number, tx: number, ty: number, w: number): number {
  const dx = tx - bx;
  const dy = ty - by;
  const len = Math.hypot(dx, dy);
  const ax = dx / len;
  const ay = dy / len;
  const a = ((x - bx) * ax + (y - by) * ay) / len;
  if (a < 0 || a > 1) return 0;
  const across = ((x - bx) * -ay + (y - by) * ax) / w;
  const reach = a < 0.35 ? 0.7 + a : 1.05 * (1 - a) / 0.65;
  if (Math.abs(across) > reach) return 0;
  const ridge = reach / 3;
  if (Math.abs(across + ridge) * w < 1) return cell(EDGE, 1);
  return cell(SHARD, across < -ridge ? 3 : across > ridge ? 1 : 2);
}

export interface Look {
  /** -1 rearing back for the lunge, 1 driving into it, 0 upright. */
  lean: -1 | 0 | 1;
  /** The shoulder shards turned out while it winds up. */
  flare: boolean;
  /** The heat of the chest diamond and the visor: 0 cold, 1 warm, 2 burning. */
  heat: 0 | 1 | 2;
  /** The stride of the walk: 0, 1 or 2 (planted, left foot forward, right). */
  step: 0 | 1 | 2;
}

/** The knight, facing right, feet on the origin, in logical px. */
export function wardenPart(look: Look): PartSprite {
  const key = `w|${look.lean}|${look.flare}|${look.heat}|${look.step}`;
  return cache.get(key, () => {
    const out = look.flare ? 7 : 0;
    const turn = look.flare ? 0.3 : 0;
    const shoulders: [number, number, number, number, number][] = [
      [-14, -54, -30 - out, -78 + turn * 10, 8],
      [14, -54, 30 + out, -76 + turn * 10, 8],
    ];
    const crown: [number, number, number, number, number][] = [
      [-8, -76, -12, -90, 3.4],
      [0, -78, 0, -98, 4.2],
      [8, -76, 12, -90, 3.4],
    ];
    const stride = look.step === 1 ? 3 : look.step === 2 ? -3 : 0;
    const legs: [number, number, number][] = [
      [-9 - stride, -26, 0],
      [9 + stride, -26, 0],
    ];
    const paint = (x: number, y: number): number => {
      // The crown of splinters and the shoulder shards, over everything.
      for (const [bx, by, tx, ty, w] of crown) {
        const c = shard(x, y, bx, by, tx, ty, w);
        if (c) return c;
      }
      for (const [bx, by, tx, ty, w] of shoulders) {
        const c = shard(x, y, bx, by, tx, ty, w);
        if (c) return c;
      }
      // The helm: a rounded pot with a narrow visor, lit from inside.
      if (y >= -78 && y <= -58 && Math.abs(x) <= 10 - Math.max(0, -70 - y) * 0.45) {
        if (y >= -71 && y <= -66 && x > -6 && x < 9) return cell(VISOR, look.heat);
        if (y >= -72 && y <= -65 && x > -8 && x < 10) return cell(TRIM, 0);
        return cell(PLATE, 2);
      }
      // The arms first: plate down to the gauntlets at its sides, parted from
      // the breastplate by a dark line where they cross its edge.
      const chestHalf = y < -50 ? 15 - (-y - 50) * 0.4 : 12 + (y + 22) * -0.1;
      for (const side of [-1, 1]) {
        const sx = side * 17;
        const hx = side * 20 + (look.lean > 0 ? 4 : look.lean < 0 ? -4 : 0);
        const arm = segDist(x, y, sx, -52, hx, -27);
        const fist = Math.hypot(x - hx, y + 24) <= 4.6;
        if (arm.d <= 4.2 || fist) {
          if (!fist && y > -54 && Math.abs(Math.abs(x) - chestHalf) < 1.3 && Math.abs(x) * side > 0) return cell(DARK, 1);
          if (fist) return cell(PLATE, y < -25 ? 2 : 1);
          // The elbow cop, a step darker across the joint.
          if (Math.abs(arm.t - 0.5) < 0.09) return cell(PLATE, 1);
          return cell(PLATE, 2);
        }
      }
      // The breastplate: broad at the chest, drawn in at the waist; a lilac
      // rim along its top, a ridge down its middle and the lames of its belly.
      if (y >= -58 && y <= -22 && Math.abs(x) <= chestHalf) {
        if (y <= -55) return cell(TRIM, 1);
        if (Math.abs(y + 33) < 1 || Math.abs(y + 27.5) < 1) return cell(PLATE, 1);
        if (Math.abs(x) < 1.2 && y > -52) return cell(PLATE, 1);
        return cell(PLATE, x < -3 ? 3 : 2);
      }
      // The belt, and the tassets hanging from it over the hips.
      if (y > -22 && y <= -19 && Math.abs(x) <= 13) return cell(TRIM, 1);
      if (y > -19 && y <= -12 && Math.abs(x) <= 14 && Math.abs(x) >= 2) return cell(PLATE, Math.abs(x) > 8 ? 1 : 2);
      // Legs: greaves on knees, sabatons on the floor.
      for (const [lx, top, bottom] of legs) {
        if (y >= top && y <= bottom) {
          if (y > -4 && x >= lx - 6 && x <= lx + 8) return cell(PLATE, 1);
          if (Math.abs(x - lx) <= 4.6) return cell(PLATE, Math.abs(y + 14) < 2.5 ? 3 : x < lx ? 3 : 2);
        }
      }
      return 0;
    };
    const coreGrid =
      look.heat === 2 ? ['..W..', '.WWW.', 'WWWWW', '.WWW.', '..W..'] : look.heat === 1 ? ['.W.', 'WcW', '.W.'] : ['c'];
    const decals: Decal[] = [
      // The diamond on its chest: the tell, swelling and going white.
      { x: 0, y: -40, grid: look.heat === 0 ? ['.c.', 'cWc', '.c.'] : coreGrid, cells: { W: cell(CORE, 1), c: cell(CORE, 0) } },
      // Dark joints between the plates.
      { x: -9, y: -22, grid: ['KKK'], cells: { K: cell(DARK, 0) } },
      { x: 9, y: -22, grid: ['KKK'], cells: { K: cell(DARK, 0) } },
    ];
    const lean = look.lean < 0 ? -0.16 : look.lean > 0 ? 0.2 : 0;
    return buildPart(104, lean, 1, MATS, paint, decals);
  });
}
