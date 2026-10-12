import { ART, PixelSprite } from '../render/pixel';
import { type Decal, type Mat, PartCache, type PartSprite, buildPart, buildUpright, cell, inOval, inPoly, segDist, stepAngle } from './boss-art';

/**
 * Sol und Luna, drawn for the grid: two figures half again the hero's height,
 * each with its heavenly body behind it as a halo - Sol a ring of sun with a
 * crown of rays, Luna a crescent moon as tall as she is - built the way the
 * other bosses are -
 * a body sprite per pose and frame, the working arm and what it holds laid on
 * over it - in two ramps that never meet: Sol in the fire ramp from rust to a
 * white core, a knight in gold plate over a red tabard with a sun on his
 * breast and a crown of rays round his halo; Luna in slate and blue, a
 * priestess in a bell of a robe that never settles, floating.
 * Everything they throw and leave on the floor is drawn here too: crescents
 * at sixteen turns, stars, flames, icicles, and the tether of the call.
 */

/* ------------------------------------------------------------------ Sol */

const PLATE = 1;
const CLOTH = 2;
const DARK = 3;
const GLOW = 4;
const LEATHER = 5;
const BLADE = 6;

const SOL_MATS: Mat[] = [
  { tones: ['#c64524', '#ed7614', '#ffa214', '#ffc825', '#ffeb57'] },
  { tones: ['#571c27', '#891e2b', '#c42430'] },
  { tones: ['#571c27', '#5d2c28'], flat: true },
  { tones: ['#5d2c28', '#ed7614', '#ffa214', '#ffc825', '#ffeb57', '#ffffff'], flat: true },
  { tones: ['#5d2c28', '#5d2c28', '#8a4836'] },
  { tones: ['#ffa214', '#ffc825', '#ffeb57', '#ffffff'] },
];

/** The colours of Sol's light, dim to white-hot: halo, rays, embers, his star. */
export const SUN = ['#8a4836', '#ed7614', '#ffa214', '#ffc825', '#ffeb57', '#ffffff'] as const;

export interface SolLook {
  pose: 'stand' | 'air' | 'run' | 'reel';
  /** How far down he is, 0 standing .. 3 on one knee: two logical px a step. */
  crouch: 0 | 1 | 2 | 3;
  /** How far the top of him leans forward, logical px (whole art px). */
  lean: number;
  /** Breathing in: chest and helm one art px up. */
  breath: 0 | 1;
  /** Which of the two strides of his run. */
  stride: 0 | 1;
  /** The cape's frame, 0..3. */
  cape: number;
  /** His wind-up: 0 at rest .. 2 about to strike. */
  heat: 0 | 1 | 2;
  /** Awake; dim and asleep at the altar otherwise. */
  lit: boolean;
}

/** Where his working shoulder is, in his own frame (facing right, soles on the origin). */
export function solShoulder(look: SolLook): [number, number] {
  return [5 + look.lean * 0.6, -30 + solDrop(look)];
}

/** How far his upper body is down from standing: the crouch, less a breath in. */
export function solDrop(look: SolLook): number {
  return [0, 2, 4, 6][look.crouch] - (look.breath ? 2 : 0);
}

/** Where his head is - the middle of his halo - in his own frame. */
export function solHead(look: SolLook): [number, number] {
  return [Math.round(look.lean * 0.9), -40 + solDrop(look)];
}

/** One leg: hip, knee, ankle. */
type Leg = readonly [number, number, number, number, number, number];

function solLegs(look: SolLook): [Leg, Leg] {
  const d = [0, 2, 4, 6][look.crouch];
  if (look.pose === 'air') {
    return [
      [-3, -9, -6, -4, -11, -3],
      [4, -9, 10, -8, 8, -2],
    ];
  }
  if (look.pose === 'run') {
    return look.stride === 0
      ? [
          [-3, -9, -6, -5, -11, -3],
          [4, -9, 10, -6, 12, -1],
        ]
      : [
          [-3, -9, 2, -6, -2, -1],
          [4, -9, 2, -5, -5, -3],
        ];
  }
  // Standing and crouching: the knees go forward as the hips come down, a
  // thigh and a shin of five pixels each.
  const leg = (hx: number, ax: number): Leg => {
    const hy = -9 + d;
    const ay = -1;
    const mx = (hx + ax) / 2;
    const my = (hy + ay) / 2;
    const half = Math.hypot(ax - hx, ay - hy) / 2;
    const out = Math.sqrt(Math.max(0, 25 - half * half));
    return [hx, hy, mx + out, my, ax, ay];
  };
  return [leg(-4, -4), leg(4, 5)];
}

const solCache = new PartCache();

/** Sol's body: everything but the working arm and the glaive. Soles on the origin, facing right. */
export function solPart(look: SolLook): PartSprite {
  const key = `${look.pose}|${look.crouch}|${look.lean}|${look.breath}|${look.stride}|${look.cape & 3}|${look.heat}|${look.lit ? 1 : 0}`;
  return solCache.get(key, () => {
    const drop = solDrop(look);
    const legs = solLegs(look);
    // A point of the upright figure, for a point where he is drawn.
    const upper = (x: number, y: number): [number, number] => {
      const uy = y - drop;
      const k = Math.max(0, Math.min(1, (-uy - 9) / 36));
      return [x - look.lean * k, uy];
    };
    const real = (ux: number, uy: number): [number, number] => {
      const k = Math.max(0, Math.min(1, (-uy - 9) / 36));
      return [ux + look.lean * k, uy + drop];
    };
    const visor = look.lit ? [4, 5, 5][look.heat] : 0;
    // The cape, behind everything: from the shoulders down to the floor, or
    // streaming back as he runs, or up as he flies.
    const flap = [0, 1, 2, 1][look.cape & 3];
    const [s0x, s0y] = real(-3, -34);
    const [s1x, s1y] = real(-9, -33);
    let cape: number[];
    if (look.pose === 'run') {
      cape = [s0x, s0y, s1x, s1y, -22 - flap, -31 + flap, -31 - flap, -26, -27, -20 + flap, -12, -17];
    } else if (look.pose === 'air') {
      cape = [s0x, s0y, s1x, s1y, -17, -40 - flap, -22 - flap, -31, -10, -19];
    } else {
      const sway = [0, -1, -2, -1][look.cape & 3];
      cape = [s0x, s0y, s1x, s1y, -13 + sway, -19 + drop * 0.5, -16 + sway * 1.5, -3, -11, -2 - flap * 0.5, -6, -4];
    }
    const paint = (x: number, y: number): number => {
      const [ux, uy] = upper(x, y);
      // Helm: a dome with a crest down it, a slit of light for a visor and a
      // dark rim where it meets the gorget.
      if (inOval(ux, uy, 0, -41, 6.2, 7)) {
        if (uy >= -42 && uy <= -40 && ux >= 1) return cell(GLOW, visor);
        if (uy >= -35.5) return cell(PLATE, 0);
        if (ux >= 0 && uy > -40) return cell(PLATE, 1);
        if (Math.abs(ux) <= 1 && uy < -43) return cell(PLATE, 3);
        return cell(PLATE, 2);
      }
      // The gorget, the pauldrons over the shoulders.
      if (uy >= -35 && uy < -33 && Math.abs(ux) <= 4) return cell(PLATE, 0);
      if (inOval(ux, uy, 7.5, -31, 5.2, 4)) return cell(PLATE, uy > -28.5 ? 1 : 2);
      // The breastplate, with a ridge down it and a lame across the belly.
      const chest = 8.5 - (uy + 33) * 0.04;
      if (uy >= -33 && uy < -19 && Math.abs(ux) <= chest) {
        if (uy >= -23 && uy < -21) return cell(PLATE, 0);
        if (ux >= -0.5 && ux <= 1.5 && uy < -24) return cell(PLATE, 2);
        return cell(PLATE, 1);
      }
      if (inOval(ux, uy, -7.5, -31, 5.2, 4)) return cell(PLATE, 1);
      // The belt and its buckle, the tabard with its gold stripe.
      if (uy >= -19 && uy < -17 && Math.abs(ux) <= 9) return ux >= -1 && ux <= 2 ? cell(GLOW, 3) : cell(DARK, 0);
      const swing = [0, 1.2, 0, -1.2][look.cape & 3] * Math.max(0, (uy + 14) / 6);
      if (uy >= -17 && uy <= -8 && Math.abs(ux - swing) <= 9 + (uy + 17) * 0.28) {
        if (Math.abs(ux - swing * 0.5 - 0.5) <= 1.3) return cell(PLATE, 3);
        if (uy > -9.5) return cell(CLOTH, 0);
        return cell(CLOTH, 2);
      }
      // The far arm, hanging behind him (back, as he runs; up, as he flies).
      const [ex, ey] = look.pose === 'run' ? [-15, -24] : look.pose === 'air' ? [-13, -37] : [-10, -20];
      if (segDist(ux, uy, -8, -30, ex, ey).d <= 2.6) return cell(PLATE, 0);
      if (Math.hypot(ux - ex, uy - ey) <= 2.4) return cell(PLATE, 1);
      // Legs: gold greaves and knee cops over leather boots, the far leg a step darker.
      for (let i = 1; i >= 0; i--) {
        const [hx, hy, kx, ky, ax, ay] = legs[i];
        const far = i === 0 ? 1 : 0;
        if (x >= ax - 2.5 && x <= ax + 4 && y >= ay - 1.5 && y <= ay + 1.5) return cell(LEATHER, 2 - far);
        if (Math.hypot(x - kx, y - ky) <= 2.2) return cell(PLATE, 2 - far);
        if (segDist(x, y, hx, hy, kx, ky).d <= 2.7 || segDist(x, y, kx, ky, ax, ay).d <= 2.3) return cell(PLATE, 1 - far);
      }
      if (inPoly(x, y, cape)) {
        const fold = segDist(x, y, s1x + 2, s1y + 2, cape[6], cape[7]).d <= 1;
        return cell(CLOTH, fold ? 0 : 1);
      }
      return 0;
    };
    // The sun on his breast: white-hot at its core, bigger with every wind-up.
    const [ex, ey] = real(0.5, -27);
    const sun: Record<string, number> = { y: cell(GLOW, look.lit ? 4 : 2), W: cell(GLOW, look.lit ? 5 : 3) };
    const grid =
      look.heat === 2 && look.lit
        ? ['...y...', '..yWy..', '.yWWWy.', 'yWWWWWy', '.yWWWy.', '..yWy..', '...y...']
        : look.heat === 1 && look.lit
          ? ['..y..', '.yWy.', 'yWWWy', '.yWy.', '..y..']
          : ['.yy.', 'yWWy', 'yWWy', '.yy.'];
    const decals: Decal[] = [{ x: ex, y: ey, grid, cells: sun }];
    return buildUpright(-34, -58, 22, 1, SOL_MATS, paint, decals);
  });
}

const glaiveCache = new PartCache();
export const GLAIVE_STEPS = 32;

/** His glaive at one of 32 turns, the hand on it at the pivot. */
export function glaivePart(k: number, heat: 0 | 1 | 2): PartSprite {
  return glaiveCache.get(`${k}|${heat}`, () => {
    const paint = (x: number, y: number): number => {
      if (Math.hypot(x, y) <= 2.4) return cell(PLATE, 3);
      if (x >= 23 && x <= 41) {
        const u = (x - 23) / 18;
        const back = -2 + 3.2 * u;
        const edge = 2.5 + 6.5 * Math.sin(Math.PI * Math.min(1, u * 1.04)) * (1 - 0.3 * u) - u;
        if (y >= back - 0.3 && y <= edge) return cell(BLADE, y > edge - 1.6 ? 3 : heat === 2 ? 2 : 1);
      }
      if (x >= -14 && x <= 24 && Math.abs(y) <= 1.7) return cell(x < -11 || (x > 20 && x <= 24) ? GLOW : LEATHER, x < -11 || x > 20 ? 3 : 2);
      return 0;
    };
    return buildPart(44, stepAngle(k, GLAIVE_STEPS), 1, SOL_MATS, paint);
  });
}

/* ----------------------------------------------------------------- Luna */

const ROBE = 1;
const PANEL = 2;
const HAIR = 3;
const SKIN = 4;
const TRIM = 5;
const MOON = 6;

const LUNA_MATS: Mat[] = [
  { tones: ['#2a2f4e', '#424c6e', '#657392', '#92a1b9', '#c7cfdd'] },
  { tones: ['#92a1b9', '#c7cfdd', '#ffffff'] },
  { tones: ['#0e071b', '#1a1932', '#2a2f4e', '#424c6e'] },
  { tones: ['#92a1b9', '#c7cfdd', '#ffffff'] },
  { tones: ['#0098dc', '#0098dc', '#0098dc', '#00cdf9', '#94fdff'], flat: true },
  { tones: ['#424c6e', '#657392', '#92a1b9', '#c7cfdd', '#ffffff'], flat: true },
];

/** The colours of Luna's light, dim to white: halo, frost, crescents, her star. */
export const MOONLIGHT = ['#424c6e', '#657392', '#92a1b9', '#c7cfdd', '#ffffff'] as const;
export const FROST = ['#0098dc', '#0098dc', '#00cdf9', '#94fdff'] as const;

export interface LunaLook {
  /** The hem's frame, 0..3: it never settles. */
  frame: number;
  /** Head bowed: 0 up, 1 a little, 2 asleep. */
  bow: 0 | 1 | 2;
  heat: 0 | 1 | 2;
  lit: boolean;
}

/** Where her working shoulder is, in her own frame (facing right, hem on the origin). */
export const LUNA_SHOULDER: readonly [number, number] = [4, -33];

/** The middle of her halo, a little above her head. */
export function lunaHead(look: LunaLook): [number, number] {
  return [-4, -50 + look.bow * 2];
}

const haloCache = new PartCache();

/**
 * Luna's halo: the moon itself behind her, a crescent as tall as she is with
 * its lit limb over her head and down her back, opening towards the way she
 * faces - slate at rest, pale as she winds up, white with a rim of frost just
 * before she moves. Its horns end where the band would be thinner than two
 * pixels, so they never come out as single dots.
 */
export function lunaHaloPart(heat: 0 | 1 | 2, lit: boolean): PartSprite {
  return haloCache.get(`${heat}|${lit ? 1 : 0}`, () => {
    const R = 42;
    const ri = 37;
    const cx = 10;
    const cy = 3;
    const tones = !lit
      ? [MOONLIGHT[0], MOONLIGHT[1], MOONLIGHT[1]]
      : heat === 2
        ? [MOONLIGHT[3], MOONLIGHT[4], '#94fdff']
        : heat === 1
          ? [MOONLIGHT[2], MOONLIGHT[3], MOONLIGHT[4]]
          : [MOONLIGHT[1], MOONLIGHT[2], MOONLIGHT[3]];
    const mats: Mat[] = [{ tones, flat: true }];
    const paint = (x: number, y: number): number => {
      const d = Math.hypot(x, y);
      if (d > R || d < 1) return 0;
      const di = Math.hypot(x - cx, y - cy);
      if (di <= ri) return 0;
      const proj = (cx * x + cy * y) / d;
      const disc = ri * ri - (cx * cx + cy * cy - proj * proj);
      const inner = disc > 0 ? proj + Math.sqrt(disc) : 0;
      if (R - inner < 6) return 0;
      return cell(1, R - d < 2.2 ? 2 : di - ri < 2.2 ? 0 : 1);
    };
    return buildPart(R + 1, 0, 1, mats, paint);
  });
}

const lunaCache = new PartCache();

/** Luna: hem on the origin, facing right; her working arm is drawn over this. */
export function lunaPart(look: LunaLook): PartSprite {
  const key = `${look.frame & 3}|${look.bow}|${look.heat}|${look.lit ? 1 : 0}`;
  return lunaCache.get(key, () => {
    const f = look.frame & 3;
    const sway = [0, 3, 1, -3][f];
    const flare = [1, 1.06, 1.02, 0.95][f];
    const b = look.bow * 2;
    const hair = [-1, -48 + b, -6, -45 + b, -9, -36, -11 + sway * 0.5, -24, -10 + sway, -15, -6 + sway, -17, -4, -30, -1, -38 + b];
    const sash = look.lit ? 1 + look.heat : 0;
    const paint = (x: number, y: number): number => {
      // Head: a hair cap over the back and top, a pale face in front.
      const cap = inOval(x, y, 0, -44 + b, 5.6, 5.3) && (y < -45 + b || x < -0.5);
      if (cap) return cell(HAIR, y < -47 + b ? 3 : 1);
      if (inOval(x, y, 1.8, -41.5 + b, 4.6, 5.2)) return cell(SKIN, 1);
      if (x >= 0 && x <= 3 && y >= -38 + b && y <= -35) return cell(SKIN, 0);
      // The robe: a bell from the shoulders to a hem that never settles.
      if (y >= -36 + b * 0.5 && y <= 0) {
        const v = Math.max(0, (y + 36) / 36);
        const c = sway * v;
        let hw = 6 + 7.5 * Math.pow(v, 0.9) * (v > 0.5 ? flare : 1);
        if (y < -33) hw *= Math.sqrt(Math.max(0, 1 - ((-33 - y) / 3.5) ** 2));
        const hem = -1.6 * (1 + Math.cos((x - c) * (Math.PI / 5) + f * (Math.PI / 2))) * 0.5;
        if (Math.abs(x - c) <= hw && y <= hem + 0.6) {
          if (y > hem - 2.4) return cell(TRIM, 1);
          if (y >= -28 && y <= -25) return cell(TRIM, Math.max(1, sash));
          if (x >= 3 && x <= 6 && y > -25 && y <= -20) return cell(TRIM, 1);
          const px = 1.5 + c * 0.6;
          if (Math.abs(x - px) <= 1 + 2 * v && y > -33) return cell(PANEL, 1);
          if (y > -22 && Math.abs(Math.abs(x - c) - (4 + 6 * v)) < 0.8) return cell(ROBE, 1);
          return cell(ROBE, 2);
        }
      }
      // Her hair, long down her back.
      if (inPoly(x, y, hair)) return cell(HAIR, y < -40 + b ? 2 : 1);
      return 0;
    };
    const eye = look.lit ? cell(TRIM, look.heat > 0 ? 3 : 2) : cell(MOON, 0);
    const decals: Decal[] = [{ x: 4, y: -42 + b, grid: ['ee'], cells: { e: eye } }];
    return buildUpright(-20, -58, 20, 1, LUNA_MATS, paint, decals);
  });
}

/* ------------------------------------------------------------ crescents */

const crescentCache = new PartCache();

/**
 * A crescent at one of sixteen turns, opening towards the turn: `size` 0..2
 * (small, growing, thrown), `tone` her moonlight, Sol's gold when batted back
 * at her, or dimmed as it comes apart.
 */
export function crescentPart(size: 0 | 1 | 2, k: number, tone: 'moon' | 'sun' | 'dim'): PartSprite {
  return crescentCache.get(`${size}|${k}|${tone}`, () => {
    const r = [5, 7.5, 10][size];
    const tones = tone === 'sun' ? ['#ffa214', '#ffc825', '#ffeb57'] : tone === 'dim' ? ['#424c6e', '#657392', '#92a1b9'] : ['#92a1b9', '#c7cfdd', '#ffffff'];
    const mats: Mat[] = [{ tones, flat: true }];
    const paint = (x: number, y: number): number => {
      const d = Math.hypot(x, y);
      const di = Math.hypot(x - r * 0.5, y);
      if (d > r || di <= r * 0.82) return 0;
      return cell(1, d > r - 1.8 ? 2 : di < r * 0.82 + 1.6 ? 0 : 1);
    };
    return buildPart(r + 1, stepAngle(k, 16), 1, mats, paint);
  });
}

/* ---------------------------------------------------------------- stars */

const SOL_STARS = [
  ['.....y.....', '.....y.....', '..yy.y.yy..', '..yyyyyyy..', '...yyWyy...', 'yyyyWWWyyyy', '...yyWyy...', '..yyyyyyy..', '..yy.y.yy..', '.....y.....', '.....y.....'],
  ['...........', '.yy.....yy.', '.yyy...yyy.', '..yyyyyyy..', '...yyWyy...', '...yWWWy...', '...yyWyy...', '..yyyyyyy..', '.yyy...yyy.', '.yy.....yy.', '...........'],
];
const LUNA_STARS = [
  ['.....y.....', '.....y.....', '.....y.....', '....yyy....', '...yyWyy...', 'yyyyWWWyyyy', '...yyWyy...', '....yyy....', '.....y.....', '.....y.....', '.....y.....'],
  ['...........', '.yy.....yy.', '.yyy...yyy.', '..yyy.yyy..', '...yyWyy...', '....WWW....', '...yyWyy...', '..yyy.yyy..', '.yyy...yyy.', '.yy.....yy.', '...........'],
];
const stars = new Map<string, PixelSprite>();

/** A twin brought down: a star on the floor, turning slowly, pulsing between two tones. */
export function starSprite(who: 'sol' | 'luna', frame: number, bright: boolean): PixelSprite {
  const key = `${who}|${frame & 1}|${bright ? 1 : 0}`;
  let s = stars.get(key);
  if (!s) {
    const rows = (who === 'sol' ? SOL_STARS : LUNA_STARS)[frame & 1];
    const body = who === 'sol' ? (bright ? '#ffc825' : '#ffa214') : bright ? '#c7cfdd' : '#92a1b9';
    s = new PixelSprite(rows, { y: body, W: '#ffffff' });
    stars.set(key, s);
  }
  return s;
}

/* -------------------------------------------------------------- flames */

/** A tongue of fire on the floor, w×h art px, in four flickers. */
function flameRows(w: number, h: number, seed: number): string[] {
  const rows: string[] = [];
  const mid = (w - 1) / 2;
  const tops: number[] = [];
  for (let x = 0; x < w; x++) {
    const off = Math.abs(x - mid) / (w / 2);
    const n = Math.sin(seed * 12.9898 + x * 78.233) * 43758.5453;
    const jitter = (n - Math.floor(n) - 0.5) * h * 0.4;
    tops.push(Math.max(1, Math.min(h, Math.round(h * Math.pow(Math.max(0, 1 - off), 0.75) + jitter))));
  }
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      const fromBottom = h - 1 - y;
      if (fromBottom >= tops[x]) {
        row += '.';
        continue;
      }
      const depth = Math.min(fromBottom === 0 ? 9 : tops[x] - fromBottom, x + 1, w - x);
      row += depth <= 1 ? 'a' : depth === 2 ? 'b' : depth === 3 ? 'c' : 'd';
    }
    rows.push(row);
  }
  return rows;
}

const flames = new Map<string, PixelSprite>();
const FIRE = { a: '#ff5000', b: '#ffa214', c: '#ffc825', d: '#ffeb57' };
const EMBER = { a: '#c64524', b: '#ff5000', c: '#ed7614', d: '#ffa214' };

/** A flame on the floor: size 0..2, flicker 0..3, burning or put out. */
export function flameSprite(size: number, flicker: number, out: boolean): PixelSprite {
  const key = `${size}|${flicker & 3}|${out ? 1 : 0}`;
  let s = flames.get(key);
  if (!s) {
    const [w, h] = [
      [5, 4],
      [7, 6],
      [9, 9],
    ][size];
    s = new PixelSprite(flameRows(w, h, (flicker & 3) + size * 7), out ? EMBER : FIRE);
    flames.set(key, s);
  }
  return s;
}

/* ----------------------------------------------------------------- ice */

const ICICLE_ROWS = [
  'lmmmd',
  'lmmmd',
  '.lmd.',
  '.lmd.',
  '.lmd.',
  '.lmd.',
  '.lmd.',
  '.lmd.',
  '..md.',
  '..md.',
  '..md.',
  '..m..',
  '..m..',
  '..m..',
  '..m..',
  '..m..',
  '..m..',
];
const ICE_KEY = { l: '#ffffff', m: '#94fdff', d: '#0098dc' };
let icicleFull: PixelSprite | null = null;
let icicleForming: PixelSprite | null = null;

/** An icicle, 5×17 art px: whole, or forming (its top half). */
export function icicleSprite(forming: boolean): PixelSprite {
  if (forming) return (icicleForming ??= new PixelSprite(ICICLE_ROWS.slice(0, 8), ICE_KEY));
  return (icicleFull ??= new PixelSprite(ICICLE_ROWS, ICE_KEY));
}

let frostMark: PixelSprite | null = null;

/** The mark in the middle of a ring of frost. */
export function frostSprite(): PixelSprite {
  return (frostMark ??= new PixelSprite(['..c..', 'ccccc', '..c..'], { c: '#c7cfdd' }));
}

const sparkles: PixelSprite[] = [];

/** Frost gathering between her raised hands: two twinkles. */
export function sparkleSprite(frame: number): PixelSprite {
  if (sparkles.length === 0) {
    sparkles.push(new PixelSprite(['.w.', 'www', '.w.'], { w: '#ffffff' }));
    sparkles.push(new PixelSprite(['..w..', '..w..', 'wwwww', '..w..', '..w..'], { w: '#94fdff' }));
  }
  return sparkles[frame & 1];
}

/* ---------------------------------------------------------------- beam */

/**
 * A banded beam along a polyline (logical points): three art px wide, its
 * bands - `a` and `b` by turns, four px each - running along it with `phase`,
 * and a core of `core` down the middle. The middle is walked pixel by pixel
 * and never steps diagonally, so it stays one connected line.
 */
export function beam(ctx: CanvasRenderingContext2D, pts: readonly number[], a: string, b: string, core: string, phase: number): void {
  const path: number[] = [];
  let px = Math.floor(pts[0] / ART);
  let py = Math.floor(pts[1] / ART);
  path.push(px, py);
  for (let i = 2; i + 1 < pts.length; i += 2) {
    const x0 = pts[i - 2] / ART;
    const y0 = pts[i - 1] / ART;
    const x1 = pts[i] / ART;
    const y1 = pts[i + 1] / ART;
    const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 3) + 1;
    for (let k = 1; k <= n; k++) {
      const qx = Math.floor(x0 + ((x1 - x0) * k) / n);
      const qy = Math.floor(y0 + ((y1 - y0) * k) / n);
      if (qx === px && qy === py) continue;
      if (qx !== px && qy !== py) path.push(qx, py);
      px = qx;
      py = qy;
      path.push(px, py);
    }
  }
  const steps = path.length / 2;
  for (let i = 0; i < steps; i++) {
    ctx.fillStyle = ((i + phase) & 7) < 4 ? a : b;
    ctx.fillRect((path[i * 2] - 1) * ART, (path[i * 2 + 1] - 1) * ART, 3 * ART, 3 * ART);
  }
  ctx.fillStyle = core;
  for (let i = 0; i < steps; i++) ctx.fillRect(path[i * 2] * ART, path[i * 2 + 1] * ART, ART, ART);
}
