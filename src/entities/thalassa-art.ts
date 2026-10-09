import { RAMP } from '../render/palette';
import { type Decal, type Mat, PartCache, type PartSprite, buildUpright, cell, inOval, inPoly, quad, segDist } from './boss-art';

/**
 * Thalassa, die Ertrunkene Krone: a drowned queen rising out of a swell of
 * her own water - a dark-teal gown whose hem breaks into foam, the water
 * below it banded from the deep blue at the floor to the light at its lip,
 * pale drowned skin, black hair that drifts as if still under water, and her
 * gold crown, which burns before every move. Behind her the water stands up
 * as a mantle and curls over her head: the wave she is, two and a half times
 * the hero's height. Built once per pose and frame from shapes (boss-art.ts),
 * the face placed by hand.
 */

export type Pose = 'still' | 'surge' | 'anchor' | 'undertow' | 'raise';

const WATER = 1;
const FOAM = 2;
const GOWN = 3;
const SKIN = 4;
const HAIR = 5;
const GOLD = 6;
const HOT = 7;
const SOCKET = 8;
const EYE = 9;
const EYE_HOT = 10;
const IRON = 11;

const MATS: Mat[] = [
  { tones: [RAMP.blue[1], RAMP.blue[2], RAMP.blue[3], RAMP.blue[4]], flat: true },
  { tones: [RAMP.blue[6], RAMP.grey[7]], flat: true },
  { tones: [RAMP.green[0], RAMP.green[1], RAMP.green[2]] },
  { tones: [RAMP.slate[5], RAMP.slate[6], RAMP.grey[7]] },
  { tones: [RAMP.blue[0], RAMP.green[0], RAMP.green[1]] },
  { tones: [RAMP.rust[3], RAMP.fire[3], RAMP.fire[4]] },
  { tones: [RAMP.fire[4], RAMP.grey[7]], flat: true },
  { tones: [RAMP.green[0]], flat: true },
  { tones: [RAMP.blue[5]], flat: true },
  { tones: [RAMP.grey[7]], flat: true },
  { tones: [RAMP.slate[3], RAMP.slate[4], RAMP.slate[5]] },
];

const cache = new PartCache();

/* ----------------------------------------------------------- the mantle */

/**
 * The water standing up behind her and curling over her head: banded, its
 * lip a churn of foam that moves through four frames. `high` while the crown
 * calls the tide: the wave stands taller.
 */
export function mantlePart(frame: number, high: boolean): PartSprite {
  return cache.get(`mantle|${frame}|${high}`, () => {
    const lift = high ? 12 : 0;
    const top = -100 - lift;
    // The wave's back, rising out of the swell behind her; over the crest; the
    // lip curling forward and down over her crown; and the hollow under it
    // running back down into her shoulders.
    const outline = [
      -22, -18,
      ...quad(-22, -18, -38, -58 - lift / 2, -26, top + 16, 8).slice(2),
      ...quad(-26, top + 16, -14, top - 6, 6, top + 2, 6).slice(2),
      ...quad(6, top + 2, 14, top + 8, 7, top + 17, 4).slice(2),
      ...quad(7, top + 17, 1, top + 11, -5, top + 15, 3).slice(2),
      ...quad(-5, top + 15, -12, -64, -9, -40, 6).slice(2),
      -13, -18,
    ];
    const paint = (x: number, y: number): number => {
      if (!inPoly(x, y, outline)) return 0;
      // Foam along the crest and down the lip, churning.
      const crest = segDist(x, y, -24, top + 12, -6, top + 1);
      const lipLine = segDist(x, y, -6, top + 1, 9, top + 9);
      const d = Math.min(crest.d, lipLine.d);
      if (d < 3 + Math.sin((x + y) * 0.5 + frame * 1.7) * 1.2) return cell(FOAM, (Math.floor((x - y) / 4) + frame) & 1 ? 1 : 0);
      // The hollow under the lip, dark.
      if (y < top + 26 && x > -10) return cell(WATER, 0);
      // Water climbing the face of the wave: lighter towards the crest, streaked.
      const rise = (-18 - y) / (-18 - top);
      const flow = Math.floor((y + x * 0.6 - frame * 4) / 8) & 3;
      const tone = rise > 0.7 ? 2 : rise > 0.3 ? 1 : 0;
      return cell(WATER, Math.min(3, tone + (flow === 0 && x < -8 ? 1 : 0)));
    };
    return buildUpright(-42, top - 10, 18, -16, MATS, paint);
  });
}

/* ------------------------------------------------------------ the queen */

/** Where her hands are, by pose: [front shoulder, front elbow, front hand, back ...]. */
const ARMS: Record<Pose, number[]> = {
  still: [9, -54, 13, -44, 12, -34, -9, -54, -12, -44, -11, -35],
  surge: [9, -54, 17, -44, 23, -33, -9, -54, -16, -44, -22, -34],
  anchor: [9, -54, 16, -48, 22, -46, -9, -54, -16, -64, -14, -76],
  undertow: [9, -54, 18, -52, 26, -50, -9, -54, -2, -50, 8, -48],
  raise: [9, -54, 14, -66, 12, -80, -9, -54, -14, -66, -12, -80],
};

/**
 * The queen herself, facing right, feet (the floor under the swell) at the
 * origin: the swell of water to her hips, the gown, her arms in the pose,
 * the head with its hair drifting through four frames, and the crown at one
 * of three heats - cold gold, its points catching, white-hot.
 */
export function queenPart(pose: Pose, frame: number, heat: 0 | 1 | 2): PartSprite {
  return cache.get(`queen|${pose}|${frame}|${heat}`, () => {
    const arm = ARMS[pose];
    const sway = [0, 1.5, 2.5, 1.5][frame & 3];
    // The hair: from under the crown down her back, drifting.
    const hair = [
      -2, -76,
      ...quad(-2, -76, -12 - sway, -70, -11 - sway, -56, 4).slice(2),
      ...quad(-11 - sway, -56, -15 - sway * 1.6, -46, -12 - sway * 2, -38, 4).slice(2),
      -7 - sway, -40,
      ...quad(-7 - sway, -40, -6, -52, -2, -60, 3).slice(2),
      4, -62,
    ];
    const gown = [
      -12, -31, -9, -40, -8, -46, -11, -55, -6, -58, 6, -58, 11, -55, 8, -46, 9, -40, 12, -31,
    ];
    const paint = (x: number, y: number): number => {
      // The crown: a band and five points, the middle one tallest.
      if (y >= -84 && y <= -71) {
        if (y >= -75.5 && Math.abs(x - 1.5) <= 6.4) return cell(GOLD, x < 0 ? 2 : 1);
        for (const [px, ph] of [[-3.6, 6], [-1, 8], [1.5, 11], [4, 8], [6.6, 6]] as const) {
          const t = (-75 - y) / ph;
          if (t >= 0 && t <= 1 && Math.abs(x - px) <= 1.4 * (1 - t) + 0.4) {
            if (heat === 2 && t > 0.35) return cell(HOT, 1);
            if (heat >= 1 && t > 0.55) return cell(HOT, 0);
            return cell(GOLD, px < 1 ? 2 : 1);
          }
        }
      }
      // Her arms, in front of everything but the crown.
      for (const [s, e, h] of [[6, 8, 10], [0, 2, 4]] as const) {
        const a = segDist(x, y, arm[s], arm[s + 1], arm[e], arm[e + 1]);
        const b = segDist(x, y, arm[e], arm[e + 1], arm[h], arm[h + 1]);
        if (Math.min(a.d, b.d) <= 2.5 || Math.hypot(x - arm[h], y - arm[h + 1]) <= 3) return cell(SKIN, 1);
      }
      if (pose === 'anchor' && Math.hypot(x + 15, y + 84) <= 6) return cell(IRON, x < -16 && y < -86 ? 2 : 1);
      if (pose === 'anchor' && segDist(x, y, -14, -78, -15, -80).d <= 1) return cell(IRON, 0);
      // The head: pale, the hair framing it.
      if (inOval(x, y, 1.5, -66, 5.8, 7)) return cell(SKIN, 1);
      if (inPoly(x, y, hair)) return cell(HAIR, x < -8 ? 0 : 1);
      // The gown, from the shoulders to the hem, and the pale throat in its neckline.
      if (y <= -57 && y >= -61 && Math.abs(x) <= 2.6) return cell(SKIN, 1);
      if (inPoly(x, y, gown)) {
        if (y < -52 && Math.abs(x - 0.5) < (-52 - y) * 0.7) return cell(SKIN, 1);
        return cell(GOWN, x < -3 ? 1 : 1);
      }
      // The swell: her water from the hem to the floor.
      if (y > -34 && y <= 0) {
        const t = -y / 34;
        const half = 25 - 14 * Math.pow(t, 0.85) + Math.sin(y * 0.45 + frame * 1.6) * 1.1;
        if (Math.abs(x) <= half) {
          // Foam where the gown breaks into water, and where the water meets the floor.
          if (Math.abs(y + 32 + Math.sin(x * 0.5 - frame * 1.4) * 1.2) < 2.2) return cell(FOAM, x < 0 ? 1 : 0);
          if (Math.abs(y + 3 + Math.sin(x * 0.42 + frame * 1.3) * 1.3) < 1.8) return cell(FOAM, 0);
          const lit = t * 0.7 - (x / half) * 0.45;
          const streak = (Math.floor((x + frame * 2) / 9) & 1) === 0 && Math.abs(((x + frame * 2) % 9) - 1) < 1.2 && t > 0.2;
          const tone = lit > 0.55 ? 3 : lit > 0.2 ? 2 : lit > -0.15 ? 1 : 0;
          return cell(WATER, Math.min(3, tone + (streak ? 1 : 0)));
        }
      }
      return 0;
    };
    const decals: Decal[] = [
      // Hollow, drowned eyes with a light in them, and a mouth that has been closed a long time.
      { x: 3, y: -67, grid: ['KK.KK', 'Ke.Ke'], cells: { K: cell(SOCKET, 0), e: cell(heat === 2 ? EYE_HOT : EYE, 0) } },
      { x: 3, y: -62, grid: ['KK'], cells: { K: cell(SOCKET, 0) } },
    ];
    return buildUpright(-30, -92, 30, 0, MATS, paint, decals);
  });
}

/* -------------------------------------------------------------- the tide */

/**
 * A column of the spring tide, `h` logical px high (in steps of four): banded
 * from the deep blue at its foot to the light at its head, streaked, and
 * crowned with a burst of foam that churns through two frames.
 */
export function columnPart(h: number, frame: 0 | 1): PartSprite {
  return cache.get(`column|${h}|${frame}`, () => {
    const paint = (x: number, y: number): number => {
      if (y > 0 || y < -h - 8) return 0;
      // The crest: foam heaped on the top of the column.
      if (inOval(x, y, frame ? 1 : -1, -h + 1, 11, 5.5)) return cell(FOAM, (Math.floor(x / 4) + frame) & 1 ? 1 : 0);
      const t = -y / Math.max(1, h);
      const half = 15 - 5 * t + Math.sin(y * 0.3 + frame * 2) * 1;
      if (Math.abs(x) > half) return 0;
      const streak = Math.abs(x + 6 - frame * 2) < 1.2 || Math.abs(x - 5 + frame * 2) < 1;
      const lit = t * 0.75 - (x / half) * 0.35;
      const tone = lit > 0.55 ? 3 : lit > 0.25 ? 2 : lit > -0.1 ? 1 : 0;
      return cell(WATER, Math.min(3, tone + (streak ? 1 : 0)));
    };
    return buildUpright(-16, -h - 10, 16, 0, MATS, paint);
  });
}
