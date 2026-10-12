import { PixelSprite } from '../render/pixel';
import { type Mat, PartCache, type PartSprite, buildPart, buildUpright, cell, inPoly, quad, segDist, stepAngle } from './boss-art';

/**
 * Schattenritter Morvain, drawn for the grid: the last knight of the throne
 * room in plate of cold slate with red trim along every edge, a bucket helm
 * with two horns sweeping up from it and two red eyes in the slot, a red gem
 * on his breast, a tattered cape in four frames, and a greatsword at thirty-two
 * drawn angles with a two-pixel light along its edge and a red rune down its
 * fuller. Built from parts like the other bosses: a body sprite per pose and
 * frame, two arms of two segments each found by the shoulder and the grip,
 * and the sword; the eyes and the gem are laid on per frame.
 */

const PLATE = 1;
const TRIM = 2;
const DARK = 3;
const CAPE = 4;
const HORN = 5;
const BLADE = 6;
const RUNE = 7;

/** Slate for the plate, darkest first. */
export const SLATE = ['#0e071b', '#1a1932', '#2a2f4e', '#424c6e', '#657392', '#92a1b9', '#c7cfdd', '#ffffff'] as const;
/** Blood red for the trim, the cape, the eyes and the gem. */
export const BLOOD = ['#571c27', '#891e2b', '#c42430', '#ea323c'] as const;

const MATS: Mat[] = [
  { tones: ['#0e071b', '#1a1932', '#2a2f4e', '#424c6e', '#657392', '#92a1b9', '#c7cfdd'] },
  { tones: ['#571c27', '#891e2b', '#c42430', '#ea323c'], flat: true },
  { tones: ['#0e071b', '#1a1932'], flat: true },
  { tones: ['#0e071b', '#571c27', '#891e2b', '#c42430'] },
  { tones: ['#1a1932', '#2a2f4e', '#424c6e', '#657392'] },
  { tones: ['#2a2f4e', '#424c6e', '#657392', '#92a1b9', '#c7cfdd', '#ffffff'], flat: true },
  { tones: ['#571c27', '#891e2b', '#c42430', '#ea323c'], flat: true },
];

export type KnightPose = 'stand' | 'walk' | 'raise' | 'crouch' | 'strike' | 'charge' | 'air' | 'reel' | 'kneel';

export interface KnightLook {
  pose: KnightPose;
  /** The frame of the pose: the walk's four steps, the reel's two sways, a breath at rest. */
  frame: number;
  /** The cape's frame, 0..3. */
  cape: number;
}

/** How a pose bends him: the upper body down by `drop`, its top forward by `lean` (logical px). */
function bend(look: KnightLook): { drop: number; lean: number } {
  switch (look.pose) {
    case 'stand':
      return { drop: look.frame & 1 ? -2 : 0, lean: 0 };
    case 'walk':
      return { drop: look.frame & 1 ? 2 : 0, lean: 2 };
    case 'raise':
      return { drop: 0, lean: -4 };
    case 'crouch':
      return { drop: 6, lean: 4 };
    case 'strike':
      return { drop: 8, lean: 8 };
    case 'charge':
      return { drop: 4, lean: 10 };
    case 'air':
      return { drop: 0, lean: 2 };
    case 'reel':
      return { drop: 4, lean: look.frame & 1 ? 2 : -4 };
    case 'kneel':
      return { drop: 22, lean: 6 };
  }
}

/** A point of the upright figure (above the hips), where it is drawn in this pose. */
export function knightPoint(look: KnightLook, ux: number, uy: number): [number, number] {
  const { drop, lean } = bend(look);
  const k = Math.max(0, Math.min(1, (-uy - 40) / 70));
  return [Math.round((ux + lean * k) / 2) * 2, Math.round((uy + drop) / 2) * 2];
}

/** Where his eyes are: the middle of the slot. */
export function eyesAt(look: KnightLook): [number, number] {
  return knightPoint(look, 0, -96);
}

/** Where the gem on his breast is. */
export function gemAt(look: KnightLook): [number, number] {
  return knightPoint(look, 0, -70);
}

/** His two shoulders, far then near. */
export function shouldersOf(look: KnightLook): [[number, number], [number, number]] {
  return [knightPoint(look, -22, -74), knightPoint(look, 22, -74)];
}

/** Hip, knee and foot of each leg, far then near. */
function legsOf(look: KnightLook): [number, number, number, number, number, number][] {
  const { drop } = bend(look);
  const hipY = -40 + Math.min(drop, 10);
  const ik = (hx: number, hy: number, fx: number, fy: number): [number, number, number, number, number, number] => {
    const L = 20;
    const dx = fx - hx;
    const dy = fy - hy;
    const d = Math.min(L * 2 - 0.01, Math.hypot(dx, dy));
    const a = Math.sqrt(Math.max(0, L * L - (d / 2) ** 2));
    const mx = hx + dx / 2;
    const my = hy + dy / 2;
    // The knee forward of the line from hip to foot.
    const nx = -dy / Math.hypot(dx, dy || 1);
    const ny = dx / Math.hypot(dx, dy || 1);
    const s = nx >= 0 ? 1 : -1;
    return [hx, hy, mx + nx * a * s, my + ny * a * s, fx, fy];
  };
  switch (look.pose) {
    case 'walk': {
      const steps: [number, number, number, number][] = [
        [-16, 0, 14, 0],
        [-2, -6, 2, 0],
        [14, 0, -14, 0],
        [2, 0, -2, -6],
      ];
      const [bx, by, fx, fy] = steps[look.frame & 3];
      return [ik(-9, hipY, bx, by), ik(9, hipY, fx, fy)];
    }
    case 'air':
      return [ik(-9, -40, -18, -8), ik(9, -40, 18, -16)];
    case 'charge':
      return [ik(-9, hipY, -22, 0), ik(9, hipY, 16, 0)];
    case 'strike':
      return [ik(-9, hipY, -20, 0), ik(9, hipY, 18, 0)];
    case 'kneel':
      // The far knee on the floor, the near foot planted in front.
      return [[-9, -22, -8, -4, -24, -2], ik(9, -22, 16, 0)];
    default:
      return [ik(-9, hipY, -11, 0), ik(9, hipY, 11, 0)];
  }
}

const bodies = new PartCache();

/** His body: everything but his arms and the sword. Feet on the origin, facing right. */
export function knightBody(look: KnightLook): PartSprite {
  return bodies.get(`${look.pose}|${look.frame & 3}|${look.cape & 3}`, () => {
    const { drop, lean } = bend(look);
    const legs = legsOf(look);
    const up = (x: number, y: number): [number, number] => {
      const uy = y - drop;
      const k = Math.max(0, Math.min(1, (-uy - 40) / 70));
      return [x - lean * k, uy];
    };
    // The cape: hung from behind the shoulders, its hem torn into tongues
    // that shift from frame to frame; streaming back as he charges, up as he
    // falls on someone.
    const f = look.cape & 3;
    const [lx, ly] = knightPoint(look, -22, -84);
    const [rx, ry] = knightPoint(look, 18, -84);
    let cape: number[];
    if (look.pose === 'charge') {
      cape = [rx, ry, lx, ly, -54 - f * 2, -88 + f, -70, -70, -62 + f, -56, -30, -40];
    } else if (look.pose === 'air') {
      cape = [rx, ry, lx, ly, -36, -120 + f * 2, -44, -96, -22, -60];
    } else {
      const tongues = 7;
      const left = -30 - (f === 1 ? 2 : f === 3 ? -2 : 0);
      const right = 18;
      cape = [rx, ry, right + 2, -40];
      for (let i = 0; i <= tongues * 2; i++) {
        const x = right - ((right - left) * i) / (tongues * 2);
        cape.push(x, i % 2 === 0 ? -4 : -12 - ((i * 7 + f * 3) % 5) * 2);
      }
      cape.push(left - 2, -40, lx, ly);
    }
    // The horns: up and out from the sides of the helm.
    const horn = (s: number): number[] => quad(s * 10, -100, s * 28, -102, s * 22, -126, 8);
    const horns = [horn(-1), horn(1)];
    const paint = (x: number, y: number): number => {
      const [ux, uy] = up(x, y);
      // Helm: a bucket with a rounded crown, the slot for the eyes, a
      // breathing slit below it and red trim round its foot.
      if (ux >= -12 && ux <= 12 && uy >= -106 && uy <= -86) {
        const corner = Math.max(0, Math.abs(ux) - 8) ** 2 + Math.max(0, -102 - uy) ** 2;
        if (corner <= 16) {
          if (uy >= -99 && uy <= -94 && ux >= -10 && ux <= 11) return cell(DARK, 0);
          if (uy > -94 && uy <= -89 && ux >= 2 && ux <= 4) return cell(DARK, 0);
          if (uy > -88) return cell(TRIM, 2);
          if (Math.abs(ux - 0.5) <= 1 && uy < -99) return cell(PLATE, 5);
          return cell(PLATE, 4);
        }
      }
      for (let s = 0; s < 2; s++) {
        const pts = horns[s];
        for (let i = 0; i + 3 < pts.length; i += 2) {
          const seg = segDist(ux, uy, pts[i], pts[i + 1], pts[i + 2], pts[i + 3]);
          const along = (i / 2 + seg.t) / ((pts.length - 2) / 2);
          if (seg.d <= 4.2 - along * 3.2) return cell(HORN, along > 0.75 ? 3 : 2);
        }
      }
      // Gorget and pauldrons: three lames each, the lowest trimmed red.
      if (uy >= -90 && uy < -84 && Math.abs(ux) <= 9) return cell(PLATE, 2);
      for (const s of [1, -1]) {
        const cx = s * 19;
        const dx = (ux - cx) / 15;
        const dy = (uy + 81) / 10;
        if (dx * dx + dy * dy <= 1 && uy <= -72) {
          const far = s < 0 ? 1 : 0;
          if (uy > -75) return cell(TRIM, 2 - far);
          if (Math.abs(uy + 80) < 1 || Math.abs(uy + 86) < 1) return cell(PLATE, 3 - far);
          return cell(PLATE, 5 - far);
        }
      }
      // The breastplate: broad at the chest, drawn in at the waist; red trim
      // at its neck and its foot, a ridge down it, a plate line across it.
      const half = uy < -74 ? 18 + (uy + 84) * 0.2 : 20 - (uy + 74) * 0.24;
      if (uy >= -84 && uy < -48 && Math.abs(ux) <= half) {
        if (uy < -82) return cell(TRIM, 2);
        if (uy >= -50) return cell(TRIM, 1);
        if (Math.abs(uy + 62) < 1) return cell(PLATE, 2);
        if (Math.abs(ux) <= 1 && uy < -54) return cell(PLATE, 5);
        return cell(PLATE, 4);
      }
      // Belt and buckle, the faulds over the hips with red along their foot.
      if (uy >= -48 && uy < -45 && Math.abs(ux) <= 15) return Math.abs(ux) <= 3 ? cell(TRIM, 3) : cell(DARK, 1);
      if (uy >= -45 && uy <= -35 && Math.abs(ux) <= 16 + (uy + 45) * 0.2) {
        if (uy > -37) return cell(TRIM, 1);
        if (Math.abs(uy + 40) < 1) return cell(PLATE, 2);
        return cell(PLATE, 4);
      }
      // Legs: cuisses, knee cops and greaves over sabatons; the far one darker.
      for (let i = 1; i >= 0; i--) {
        const [hx, hy, kx, ky, fx, fy] = legs[i];
        const far = i === 0 ? 1 : 0;
        if (x >= fx - 7 && x <= fx + 10 && y >= fy - 6 && y <= fy + 1 && y <= 0) return cell(PLATE, 3 - far);
        if (Math.hypot(x - kx, y - ky) <= 6) return cell(PLATE, 5 - far);
        if (segDist(x, y, hx, hy, kx, ky).d <= 6.5) return cell(PLATE, 4 - far);
        if (segDist(x, y, kx, ky, fx, fy - 4).d <= 5) return cell(PLATE, 4 - far);
      }
      // The undersuit between the plates, and the cape behind it all.
      if (uy >= -90 && uy < -35 && Math.abs(ux) <= 14) return cell(DARK, 1);
      if (inPoly(x, y, cape)) {
        const fold = Math.abs(((x + 60) % 14) - 7) < 1 && y > -76;
        return cell(CAPE, fold ? 2 : 3);
      }
      return 0;
    };
    return buildUpright(-76, -130, 46, 1, MATS, paint);
  });
}

const parts = new PartCache();
export const SWORD_STEPS = 32;

/**
 * The greatsword at one of 32 turns, pivoted where the two hands hold it: a
 * pommel and a grip in leather, the hands on it, a red crossguard, and the
 * blade - slate with a two-pixel light along its upper edge and a dark one
 * along the lower, and the rune down its fuller. White all over the moment it
 * has batted something out of the air.
 */
export function swordPart(k: number, rune: 0 | 1, flash: boolean): PartSprite {
  return parts.get(`s|${k}|${rune}|${flash ? 1 : 0}`, () => {
    const paint = (x: number, y: number): number => {
      // The hands on the grip.
      if (Math.hypot(x + 13, y) <= 4.6 || Math.hypot(x + 4, y) <= 4.6) return cell(PLATE, 4);
      if (Math.hypot(x + 22, y) <= 3.6) return cell(TRIM, 1);
      if (x >= -20 && x < 0 && Math.abs(y) <= 2.4) return cell(DARK, 1);
      if (x >= 0 && x <= 6 && Math.abs(y) <= 15) return cell(TRIM, Math.abs(y) > 12 || x > 4 ? 1 : 2);
      if (x > 6 && x <= 98) {
        const half = x < 80 ? 10 - (x - 6) * 0.03 : 7.8 * (1 - (x - 80) / 18);
        if (Math.abs(y) > half) return 0;
        if (flash) return cell(BLADE, y < -half + 3 ? 5 : 4);
        if (y < -half + 3.2) return cell(BLADE, 4);
        if (y > half - 2.2) return cell(BLADE, 1);
        if (x > 11 && x < 78 && Math.abs(y) <= 1.6) return cell(RUNE, rune ? 3 : 1);
        return cell(BLADE, y < 0 ? 3 : 2);
      }
      return 0;
    };
    return buildPart(102, stepAngle(k, SWORD_STEPS), 1, MATS, paint);
  });
}

/** An arm's segment at one of 32 turns: the upper arm with its elbow cop, or the forearm with its red cuff. */
export function armPart(which: 'upper' | 'fore', k: number, far: boolean): PartSprite {
  return parts.get(`a|${which}|${k}|${far ? 1 : 0}`, () => {
    const L = which === 'upper' ? 20 : 18;
    const r = which === 'upper' ? 5.5 : 5;
    const d = far ? 1 : 0;
    const paint = (x: number, y: number): number => {
      if (which === 'upper' && Math.hypot(x - L, y) <= 6) return cell(PLATE, 5 - d);
      const s = segDist(x, y, 0, 0, L, 0);
      if (s.d > r) return 0;
      if (which === 'fore' && x > L - 6 && x < L - 2) return cell(TRIM, 2 - d);
      return cell(PLATE, 4 - d);
    };
    return buildPart(L + 7, stepAngle(k, SWORD_STEPS), 1, MATS, paint);
  });
}

/** Two-bone reach from shoulder to hand: where the elbow goes, below the line between them. */
export function elbowOf(sx: number, sy: number, hx: number, hy: number): [number, number] {
  const L1 = 20;
  const L2 = 18;
  const dx = hx - sx;
  const dy = hy - sy;
  const d = Math.max(1, Math.min(L1 + L2 - 0.01, Math.hypot(dx, dy)));
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const ux = dx / d;
  const uy = dy / d;
  const mx = sx + ux * a;
  const my = sy + uy * a;
  // Of the two places the elbow could be, the lower one.
  const e1: [number, number] = [mx - uy * h, my + ux * h];
  const e2: [number, number] = [mx + uy * h, my - ux * h];
  return e1[1] >= e2[1] ? e1 : e2;
}

/* --------------------------------------------------------------- overlays */

const gems: PixelSprite[] = [];

/** The gem on his breast: dull, lit as he winds up, burning in his last phase. */
export function gemSprite(heat: 0 | 1 | 2): PixelSprite {
  if (gems.length === 0) {
    const rows = ['..rr..', '.rRRr.', 'rRWWRr', 'rRWWRr', '.rRRr.', '..rr..'];
    gems.push(new PixelSprite(rows, { r: BLOOD[1], R: BLOOD[2], W: BLOOD[3] }));
    gems.push(new PixelSprite(rows, { r: BLOOD[2], R: BLOOD[3], W: '#ffffff' }));
    gems.push(
      new PixelSprite(['...rr...', '..rRRr..', '.rRWWRr.', 'rRWWWWRr', 'rRWWWWRr', '.rRWWRr.', '..rRRr..', '...rr...'], {
        r: BLOOD[2],
        R: BLOOD[3],
        W: '#ffffff',
      }),
    );
  }
  return gems[heat];
}
