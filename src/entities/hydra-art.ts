import { RAMP } from '../render/palette';
import { type Decal, type Mat, PartCache, type PartSprite, buildPart, buildUpright, cell, inOval, inPoly, quad, segDist, stepAngle } from './boss-art';

/**
 * Die Fünfkronige, drawn for the grid: a scaled body built once, necks as
 * chains of segment sprites at sixteen angles - each a slab of the neck with
 * its lit back, its dark underside and a pale belly stripe, so a row of them
 * reads as plates rather than a tube - and five heads rasterised from their
 * shapes with the eye and the teeth placed by hand. Her greens are the
 * yellow end of the ramp, two steps above the teal of her lair.
 */

export type HeadKind = 'venom' | 'flame' | 'storm' | 'stone' | 'crown';
/** How a neck or head is drawn: as it is, winding up, struck, or burnt shut. */
export type Tone = 'plain' | 'hot' | 'struck' | 'sealed';

/* ------------------------------------------------------------- materials */

const SKIN = 1;
const SKIN_HOT = 2;
const SKIN_SEALED = 3;
const BELLY = 4;
const BONE = 5;
const WHITE = 6;
// 7: the darkest line, kept for its slot in the table.
const MOUTH = 8;
const MOUTH_HOT = 9;
const EYE = 10;
const EYE_HOT = 11;
const PUPIL = 12;
// Each head's own: skin, shade, mark.
const H_SKIN = 13;
const H_SHADE = 14;
const H_MARK = 15;
const EMBER = 16;
const RAW = 17;
const RAW_HOT = 18;

const BASE: Mat[] = [
  // Her skin: the yellow end of the green ramp, two steps over the teal of her lair.
  { tones: [RAMP.green[2], RAMP.green[2], RAMP.green[3], RAMP.green[4], RAMP.green[5]] },
  { tones: [RAMP.green[3], RAMP.green[3], RAMP.green[4], RAMP.green[5], RAMP.green[6]] },
  { tones: [RAMP.earth[0], RAMP.earth[0], RAMP.earth[1], RAMP.grey[3], RAMP.grey[3]] },
  { tones: [RAMP.earth[3], RAMP.earth[4], RAMP.earth[5], RAMP.earth[5]] },
  { tones: [RAMP.earth[4], RAMP.earth[5], RAMP.earth[7], RAMP.earth[7]] },
  { tones: [RAMP.earth[7]], flat: true },
  { tones: [RAMP.earth[0]], flat: true },
  { tones: [RAMP.earth[0]], flat: true },
  { tones: [RAMP.fire[1]], flat: true },
  { tones: [RAMP.earth[7]], flat: true },
  { tones: [RAMP.grey[7]], flat: true },
  { tones: [RAMP.earth[0]], flat: true },
];

/**
 * Each head's skin (dark to light), its shade (frill, brow, jaw) and its mark:
 * five colours, each from as few paints as reads, sharing where they can -
 * the venom head wears her own greens with a plum frill, the crown the
 * flame's gold.
 */
const HEAD_PAINT: Record<HeadKind, { skin: string[]; shade: string[]; mark: string[] }> = {
  venom: { skin: [RAMP.green[3], RAMP.green[4], RAMP.green[5], RAMP.green[5]], shade: [RAMP.plum[1], RAMP.plum[1], RAMP.plum[2]], mark: [RAMP.plum[2], RAMP.plum[3]] },
  flame: { skin: [RAMP.rose[1], RAMP.rust[1], RAMP.rust[2], RAMP.rust[2]], shade: [RAMP.rose[1], RAMP.rose[1], RAMP.rust[1]], mark: [RAMP.fire[3], RAMP.fire[3]] },
  storm: { skin: [RAMP.blue[1], RAMP.blue[2], RAMP.blue[3], RAMP.blue[3]], shade: [RAMP.blue[1], RAMP.blue[1], RAMP.blue[2]], mark: [RAMP.blue[6], RAMP.blue[6]] },
  stone: { skin: [RAMP.grey[3], RAMP.grey[4], RAMP.grey[5], RAMP.grey[5]], shade: [RAMP.grey[3], RAMP.grey[3], RAMP.grey[4]], mark: [RAMP.grey[6], RAMP.grey[6]] },
  crown: { skin: [RAMP.rust[2], RAMP.rust[3], RAMP.fire[3], RAMP.fire[3]], shade: [RAMP.earth[3], RAMP.earth[3], RAMP.earth[4]], mark: [RAMP.fire[3], RAMP.fire[4]] },
};

function matsFor(kind: HeadKind | null, tone: Tone, flat = false): Mat[] {
  const out = flat ? BASE.map((m) => ({ tones: m.tones, flat: true })) : [...BASE];
  if (kind) {
    const p = HEAD_PAINT[kind];
    out.push({ tones: tone === 'hot' ? [p.skin[1], p.skin[2], p.mark[1], p.mark[1]] : p.skin });
    out.push({ tones: p.shade });
    out.push({ tones: p.mark });
  } else {
    out.push({ tones: ['#000000'] }, { tones: ['#000000'] }, { tones: ['#000000'] });
  }
  out.push({ tones: [RAMP.fire[1], RAMP.fire[2]], flat: true });
  out.push({ tones: [RAMP.green[4], RAMP.green[5], RAMP.green[6]] });
  out.push({ tones: [RAMP.fire[2], RAMP.fire[3], RAMP.fire[4]] });
  if (tone === 'struck') return out.map(() => ({ tones: [RAMP.grey[7]], flat: true }));
  return out;
}

const cache = new PartCache();

/* ---------------------------------------------------------------- the body */

/** How big she is drawn: her box is what the physics walks her round on. */
export const BULK_W = 129;
export const BULK_H = 84;

/**
 * Her body, once, and once more drawn a pixel taller for the breath: a domed
 * back of scales in rows that follow its curve - each scale lit on its upper
 * face and shadowed at its lower rim, a cluster, not a dither - a belly of
 * pale plates where she rests on the floor, bone spines down the ridge and
 * the forelimbs dug in with their claws. Pivot: her middle, on the floor.
 */
export function bodyPart(breath: 0 | 1): PartSprite {
  return cache.get(`body|${breath}`, () => {
    const w = BULK_W;
    const h = BULK_H + breath * 2;
    const cy = -h * 0.44;
    const rx = w * 0.5;
    const ry = h * 0.56;
    const ridge = -h * 0.82;
    const spines: number[][] = [];
    for (let i = -4; i <= 4; i++) {
      const x = i * 14;
      const tall = 18 - Math.abs(i) * 2.4;
      const droop = Math.abs(i) * 2.8;
      spines.push([x - 5.5, ridge + droop + 3, x, ridge + droop - tall, x + 5.5, ridge + droop + 3]);
    }
    const limbs: number[][] = [];
    for (const side of [-1, 1]) {
      const lx = side * w * 0.34;
      limbs.push([
        lx - side * 9, -32,
        ...quad(lx - side * 9, -32, lx + side * 13, -23, lx + side * 11, -2, 4).slice(2),
        lx - side * 7, -2,
        ...quad(lx - side * 7, -2, lx - side * 2, -19, lx - side * 13, -27, 4).slice(2),
      ]);
    }
    const paint = (x: number, y: number): number => {
      if (y > 0 || Math.abs(x) > rx + 12 || y < ridge - 20) return 0;
      // Claws: three hooks in bone at the end of each forelimb.
      if (y > -8) {
        for (const side of [-1, 1]) {
          const lx = side * w * 0.34;
          for (let c = 0; c < 3; c++) {
            const clawX = lx + side * (4 + c * 5);
            if (inPoly(x, y, [clawX, -7, clawX + side * 6, -1, clawX, -1])) return cell(BONE, c === 0 ? 3 : 2);
          }
        }
      }
      // The forelimbs, dug in: lit on the shoulder, dark down the back of the leg.
      for (const l of limbs) {
        if (inPoly(x, y, l)) {
          const knuckle = y > -9;
          return cell(SKIN, knuckle ? 1 : (x > 0) === y < -18 ? 3 : 2);
        }
      }
      // Spines down the ridge, the tallest in the middle.
      if (y < ridge + 30) for (const sp of spines) if (inPoly(x, y, sp)) return cell(BONE, x < sp[2] ? 3 : 1);
      const nx = x / rx;
      const ny = (y - cy) / ry;
      if (nx * nx + ny * ny > 1) return 0;
      // How far below her back this point is: the scale rows run parallel to it.
      const top = cy - ry * Math.sqrt(Math.max(0, 1 - nx * nx));
      const depth = y - top;
      // The belly: the lowest rows, pale plates across the front.
      if (y > -12) {
        const row = Math.floor(-y / 6);
        if (-y - row * 6 > 4.4) return cell(BELLY, 0);
        return cell(BELLY, Math.abs(x) > rx * 0.48 ? 1 : 2);
      }
      const k = Math.floor(depth / 8);
      const v = depth / 8 - k;
      const around = x / 13 + (k & 1 ? 0.5 : 0);
      const u = around - Math.floor(around) - 0.5;
      const lit = -nx * 0.5 - ny * 0.8;
      let tone = lit > 0.42 ? 3 : lit > -0.2 ? 2 : 1;
      // Each scale: shadowed under its lower rim, a glint on its crown in the light.
      if (v > 0.7 - u * u * 1.3) tone -= 1;
      else if (v < 0.32 && Math.abs(u) < 0.26 && lit > 0.1) tone += 1;
      return cell(SKIN, Math.max(0, Math.min(4, tone)));
    };
    return buildUpright(-rx - 14, -h - 4, rx + 14, 0, matsFor(null, 'plain', true), paint);
  });
}

/* --------------------------------------------------------------- the necks */

/**
 * One plate of a neck, `rq` art pixels thick, its axis along +x (towards the
 * head) and its belly on the +y side (or -y): a round slab, lit on the side
 * the key light comes from, shadowed on the other, a stripe of pale belly
 * plates down its underside and a dark rim at its root end. Laid one over the
 * next from the root up, the rims become rows of scales and the stripes one
 * belly running the length of the neck.
 */
export function segmentPart(rq: number, step: number, belly: 1 | -1, tone: Tone): PartSprite {
  return cache.get(`seg|${rq}|${step}|${belly}|${tone}`, () => {
    const r = rq * 2;
    const len = r * 0.95;
    const theta = stepAngle(step);
    // Which way across the neck the key light (up and to the left) is.
    const toLight = -Math.sin(theta) * -0.6 + Math.cos(theta) * -0.8 > 0 ? 1 : -1;
    const skin = tone === 'hot' ? SKIN_HOT : tone === 'sealed' ? SKIN_SEALED : SKIN;
    const paint = (x: number, y: number): number => {
      const along = x / len;
      const across = y / r;
      if (along * along + across * across > 1) return 0;
      const lit = across * toLight;
      if (tone !== 'sealed' && across * belly > 0.48 && across * belly < 0.9) return cell(BELLY, lit > 0 ? 1 : 0);
      if (along < -0.8) return cell(skin, 1);
      return cell(skin, lit > 0.42 ? 3 : lit < -0.5 ? 1 : 2);
    };
    return buildPart(r + 2, theta, 1, matsFor(null, tone, true), paint);
  });
}

/* ---------------------------------------------------------------- the heads */

/** The skull, facing right round its middle: shapes from the old drawing, in logical px. */
const FRILL = [-12, -18, -31, -27, -26, 0, -31, 25, -12, 16];
const CRANIUM = [
  -15, -15,
  ...quad(-15, -15, 4, -20, 20, -12, 5).slice(2),
  ...quad(20, -12, 33, -7, 34, -1, 4).slice(2),
  ...quad(34, -1, 30, 3, 16, 4, 4).slice(2),
  ...quad(16, 4, 0, 6, -15, 8, 5).slice(2),
  ...quad(-15, 8, -21, -4, -15, -15, 4).slice(2),
];
const BROW = [-14, -14, ...quad(-14, -14, 3, -19, 18, -11, 5).slice(2), ...quad(18, -11, 3, -10, -13, -8, 5).slice(2)];
const JAW = [0, -4, ...quad(0, -4, 16, 2, 30, 3, 5).slice(2), ...quad(30, 3, 16, 12, 0, 10, 5).slice(2)];

/** A mark's horn: a curve of width w, tapering. */
function hornIn(x: number, y: number, x0: number, y0: number, qx: number, qy: number, x1: number, y1: number, w: number): boolean {
  const pts = quad(x0, y0, qx, qy, x1, y1, 6);
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const { d, t } = segDist(x, y, pts[i], pts[i + 1], pts[i + 2], pts[i + 3]);
    if (d <= (w / 2) * (1 - ((i / 2 + t) / 6) * 0.6)) return true;
  }
  return false;
}

function markIn(kind: HeadKind, x: number, y: number): number {
  switch (kind) {
    case 'crown':
      if (inPoly(x, y, [-12, -15, 12, -15, 12, -19, -12, -19])) return cell(H_MARK, 0);
      for (let i = -1; i <= 1; i++) if (inPoly(x, y, [i * 9 - 3.2, -18, i * 9, -31, i * 9 + 3.2, -18])) return cell(H_MARK, i === 0 ? 1 : 0);
      return 0;
    case 'storm':
      for (const s of [-1, 1]) if (hornIn(x, y, -7, -12 + s * 2, -20, -23 + s * 6, -29, -16 + s * 13, 3.4)) return cell(H_MARK, 0);
      return 0;
    case 'flame':
      return hornIn(x, y, -8, -13, -15, -30, -4, -36, 3.6) ? cell(H_MARK, 0) : 0;
    case 'stone':
      for (let i = 0; i < 3; i++) if (inPoly(x, y, [-5 - i * 6, -13 - i * 2, -11 - i * 6, -24 - i * 3, -16 - i * 6, -11 - i * 2])) return cell(H_MARK, 0);
      return 0;
    case 'venom':
      return hornIn(x, y, -8, -13, -19, -22, -25, -14, 3) ? cell(H_MARK, 0) : 0;
  }
}

/**
 * A head: frill, the lower jaw hinged at the back and swung open by `jaw`
 * (0..2), the cranium with its brow ridge, the mark that tells the five apart
 * in silhouette. The slit eye and the teeth are stamped on by hand.
 */
export function headPart(kind: HeadKind, jaw: 0 | 1 | 2, tone: Tone): PartSprite {
  return cache.get(`head|${kind}|${jaw}|${tone}`, () => {
    const a = jaw * 0.25;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const hot = tone === 'hot';
    const paint = (x: number, y: number): number => {
      const m = markIn(kind, x, y);
      if (m) return m;
      // The cranium over everything below it.
      if (inPoly(x, y, BROW)) return cell(H_SHADE, 1);
      if (inPoly(x, y, CRANIUM)) return cell(H_SKIN, y < -6 ? 2 : 1);
      // The lower jaw, in its own frame about the hinge.
      const jx = (x + 8) * ca + (y - 4) * sa;
      const jy = -(x + 8) * sa + (y - 4) * ca;
      if (inPoly(jx, jy, JAW)) return cell(H_SHADE, 2);
      // The mouth, open: dark, or lit from inside by what is coming.
      if (jaw > 0 && inPoly(x, y, [-9, 4, 32, 0, -8 + 30 * ca - 3 * sa, 4 + 30 * sa + 3 * ca])) return cell(hot ? MOUTH_HOT : MOUTH, 0);
      if (inPoly(x, y, FRILL)) return cell(H_SHADE, x < -22 ? 0 : 1);
      return 0;
    };
    const decals: Decal[] = [
      // The slit eye under the brow, its pupil towards the snout.
      { x: 6, y: -6, grid: ['.eee.', 'eeKee', '.eKe.'], cells: { e: cell(hot ? EYE_HOT : EYE, 0), K: cell(PUPIL, 0) } },
      // Upper teeth hanging from the lip.
      { x: 19, y: 5, grid: ['w.w.w.w', 'w.w.w.w'], cells: { w: cell(WHITE, 0) } },
    ];
    if (jaw > 0) {
      // Lower teeth on the swung jaw.
      const tx = -8 + 18 * ca - 1 * sa;
      const ty = 4 + 18 * sa + 1 * ca;
      decals.push({ x: tx, y: ty - 1, grid: ['w.w.w'], cells: { w: cell(WHITE, 0) } });
    }
    if (kind === 'flame') {
      // Coals banked at the corners of the mouth, always lit: this is the head the fight is fetched from.
      decals.push({ x: 22, y: -1, grid: ['.F.', 'FfF'], cells: { F: cell(EMBER, 1), f: cell(EMBER, 0) } });
    }
    if (kind === 'venom') decals.push({ x: 15, y: 9 + jaw * 3, grid: ['v.v', 'v.v'], cells: { v: cell(H_MARK, 1) } });
    if (kind === 'storm') decals.push({ x: -14, y: -9, grid: ['.Z', 'Z.', 'ZZ', '.Z', 'Z.'], cells: { Z: cell(H_MARK, 1) } });
    if (kind === 'stone') decals.push({ x: 2, y: -5, grid: ['K.', '.K', 'K.', '.K'], cells: { K: cell(H_SHADE, 0) } });
    return buildPart(42, 0, 1, matsFor(kind, tone), paint, tone === 'struck' ? [] : decals);
  });
}

/* --------------------------------------------------------- stumps and seals */

/** A cut neck's end: a ring of pale bone round the raw wound, beating. */
export function stumpPart(beat: 0 | 1, tone: Tone): PartSprite {
  return cache.get(`stump|${beat}|${tone}`, () =>
    buildPart(18, 0, 1, matsFor(null, tone), (x, y) => {
      if (!inOval(x, y, 0, 0, 15, 12, 0.2)) return 0;
      if (inOval(x, y, 0.5, 0.5, 9.5 + beat, 7 + beat, 0.2)) return cell(beat ? RAW_HOT : RAW, inOval(x, y, -1.5, -1.5, 4, 3, 0.2) ? 2 : 1);
      return cell(BONE, 2);
    }),
  );
}

/** A neck burnt shut: charred, a crust over it, embers in its cracks. */
export function sealPart(flicker: 0 | 1): PartSprite {
  return cache.get(`seal|${flicker}`, () =>
    buildPart(17, 0, 1, matsFor(null, 'sealed'), (x, y) => {
      if (!inOval(x, y, 0, 0, 15, 11, 0.2)) return 0;
      if (inOval(x, y, 0, -2, 9, 5, 0.2)) return cell(SKIN_SEALED, 3);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4 + flicker * 0.15;
        if (segDist(x, y, Math.cos(a) * 4, Math.sin(a) * 3, Math.cos(a) * 13, Math.sin(a) * 9.5).d <= 0.9) return cell(EMBER, flicker);
      }
      return cell(SKIN_SEALED, 2);
    }),
  );
}
