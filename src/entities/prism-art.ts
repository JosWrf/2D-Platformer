import { RAMP } from '../render/palette';
import { type Mat, PartCache, type PartSprite, buildPart, cell, segDist, stepAngle } from './boss-art';

/**
 * Prismarch, Herz des Kristalls, drawn for the grid: a cluster of crystal in
 * the violets and roses of the rift - the one warm thing in the blue world it
 * guards - each crystal cut into flat facets (lit, plain, shadowed) with a
 * one-pixel white edge where two facets meet; a heart of rose and white that
 * beats in drawn frames and blazes before every move; and a ring of shards
 * turning round it, the set piece that makes it the size of the hall.
 */

const CRYSTAL = 1;
const EDGE = 2;
const HEART = 3;
const SHARD = 4;

const MATS: Mat[] = [
  { tones: [RAMP.plum[0], RAMP.plum[1], RAMP.plum[2], RAMP.plum[3], RAMP.violet[4]], flat: true },
  { tones: [RAMP.violet[5], RAMP.grey[7]], flat: true },
  { tones: [RAMP.rose[5], RAMP.violet[5], RAMP.grey[7]], flat: true },
  { tones: [RAMP.plum[1], RAMP.plum[4], RAMP.violet[4], RAMP.grey[7]], flat: true },
];

const cache = new PartCache();

/**
 * One crystal of the cluster: from its base (bx, by) to its tip (tx, ty),
 * `w` half as wide, its point beginning at `s` of the way up. Three faces
 * across - the one towards the light lit, the middle plain, the far one in
 * shadow - and the cap above the shoulder a step lighter; white where two
 * faces meet on the lit side, pale rose on the other. 0 outside it.
 */
function crystal(x: number, y: number, bx: number, by: number, tx: number, ty: number, w: number, s: number, bright = 0): number {
  const dx = tx - bx;
  const dy = ty - by;
  const len = Math.hypot(dx, dy);
  const ax = dx / len;
  const ay = dy / len;
  const px = x - bx;
  const py = y - by;
  const a = (px * ax + py * ay) / len;
  if (a < 0 || a > 1) return 0;
  // Across, from the side facing the light (-1) to the far side (+1).
  const across = (px * -ay + py * ax) / w;
  const reach = a < s ? 1 : (1 - a) / (1 - s);
  if (Math.abs(across) > reach) return 0;
  const ridge = (1 / 3) * reach;
  const edge = (u: number): boolean => Math.abs(across - u) * w < 1.05;
  if (edge(-ridge)) return cell(EDGE, 1);
  if (edge(ridge)) return cell(EDGE, 0);
  if (a >= s && Math.abs(a - s) * len < 1.05) return cell(EDGE, across < 0 ? 1 : 0);
  const cap = a > s ? 1 : 0;
  const face = across < -ridge ? 3 : across > ridge ? 1 : 2;
  return cell(CRYSTAL, Math.min(4, face + cap + bright));
}

/** The cluster's crystals, in the order they are painted over each other (front last). */
const CRYSTALS: readonly (readonly [number, number, number, number, number, number])[] = [
  // The shoulders, leaning out.
  [-14, -36, -36, -84, 8, 0.7],
  [14, -36, 36, -80, 8, 0.7],
  // The feet.
  [-10, 0, -12, -22, 6, 0.75],
  [10, 0, 12, -22, 6, 0.75],
  // The great crystal at its middle.
  [0, -10, 0, -112, 18, 0.72],
  // And two young ones grown out of its foot, in front of it.
  [-6, -4, -22, -46, 7, 0.68],
  [8, -4, 24, -38, 6, 0.66],
];

/**
 * The cluster, leaning by one of three drawn angles (back in the wind-up of
 * its charge, forward in the charge, upright otherwise), facing right; its
 * feet on the origin. The heart is drawn over it, at heartAt().
 */
export function clusterPart(lean: -1 | 0 | 1): PartSprite {
  return cache.get(`cluster|${lean}`, () => {
    const paint = (x: number, y: number): number => {
      let out = 0;
      for (const [bx, by, tx, ty, w, s] of CRYSTALS) {
        const c = crystal(x, y, bx, by, tx, ty, w, s);
        if (c) out = c;
      }
      return out;
    };
    return buildPart(118, lean < 0 ? -0.14 : lean > 0 ? 0.18 : 0, 1, MATS, paint);
  });
}

/** Where the heart sits on the cluster at a lean: logical px from its feet. */
export function heartAt(lean: -1 | 0 | 1): { x: number; y: number } {
  const a = lean < 0 ? -0.14 : lean > 0 ? 0.18 : 0;
  const y = -56;
  return { x: -y * Math.sin(a), y: y * Math.cos(a) };
}

/**
 * The heart: a rose diamond round a white core, in three beats - and at full
 * blaze, before a move, white to its rim.
 */
export function heartPart(beat: 0 | 1 | 2, blaze: boolean): PartSprite {
  return cache.get(`heart|${beat}|${blaze}`, () => {
    const r = 8 + beat * 2 + (blaze ? 2 : 0);
    const paint = (x: number, y: number): number => {
      const d = Math.abs(x) / (r * 0.7) + Math.abs(y) / r;
      if (d > 1) return 0;
      if (d < 0.38) return cell(HEART, 2);
      if (d < 0.68) return cell(HEART, blaze ? 2 : 1);
      return cell(HEART, blaze ? 1 : 0);
    };
    return buildPart(r + 2, 0, 1, MATS, paint);
  });
}

/**
 * A shard of the ring at one of eight turns: a long diamond, lit along one
 * side, a white edge down its spine. Hot, while the heart blazes: a step
 * lighter all over.
 */
export function shardPart(step: number, hot: boolean): PartSprite {
  return cache.get(`shard|${step}|${hot}`, () => {
    const paint = (x: number, y: number): number => {
      const d = Math.abs(x) / 6.5 + Math.abs(y) / 12;
      if (d > 1) return 0;
      if (segDist(x, y, 0, -11, 0, 11).d < 0.9) return cell(SHARD, 3);
      return cell(SHARD, (x < 0 ? 2 : 1) + (hot ? 1 : 0) - (d > 0.75 && x > 0 ? 1 : 0));
    };
    return buildPart(13, stepAngle(step, 8), 1, MATS, paint);
  });
}
