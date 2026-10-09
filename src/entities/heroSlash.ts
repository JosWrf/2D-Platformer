import { RAMP } from '../render/palette';
import { makeCanvas } from '../render/pixel';
import { type HeroFrame, throughNight } from './heroArt';

/**
 * The hero's sword and the slashes it leaves, on the grid.
 *
 * A sword can only point a few ways in pixel art without a jagged edge: along
 * the axes, along the diagonals, and along the 2:1 stairs between - sixteen
 * directions. Every pose of a swing holds the blade in one of them, at a
 * length chosen for that pose, and the blade is drawn once per direction and
 * length into a canvas and blitted from then on.
 *
 * The slash itself is three hard-edged frames per swing - the crescent
 * growing behind the blade, the whole crescent, and the crescent thinning away
 * from its tail - in a white edge, a cyan body and a blue tail. Each is laid
 * along an ellipse fitted to the swing's hitbox (Player.swordRect): as far
 * forward as the blow reaches, as high and as low as it hits, so what the
 * player sees cut is what is cut.
 */

/** A cached picture and the pixel of it that goes on its origin. */
export interface Stamp {
  readonly canvas: HTMLCanvasElement;
  /** Width and height in art pixels. */
  readonly w: number;
  readonly h: number;
  /** Where the origin (the fist, or the hitbox's middle column at the feet) is in it. */
  readonly ox: number;
  readonly oy: number;
}

/** A direction on the grid: one step along the longer axis moves one pixel. */
type Dir = readonly [number, number];

/** The sixteen clean directions, screen y downwards. */
export const DIRS = {
  fwd: [1, 0],
  fwdDown: [2, 1],
  downFwd: [1, 1],
  downSteep: [1, 2],
  down: [0, 1],
  backDown: [-2, 1],
  back: [-1, 0],
  backUp: [-2, -1],
  upBack: [-1, -1],
  upBackSteep: [-1, -2],
  up: [0, -1],
  upFwdSteep: [1, -2],
  upFwd: [1, -1],
  fwdUp: [2, -1],
} as const satisfies Record<string, Dir>;

export type DirName = keyof typeof DIRS;

/** The i-th pixel along a direction from the origin: a clean stair. */
function step(d: Dir, i: number): [number, number] {
  const n = Math.max(Math.abs(d[0]), Math.abs(d[1]));
  return [Math.trunc((i * d[0]) / n), Math.trunc((i * d[1]) / n)];
}

const STEEL_LIT = throughNight(RAMP.slate[6]);
const STEEL = throughNight(RAMP.slate[5]);
const GLOW = throughNight(RAMP.blue[4]);
const GOLD_LIT = throughNight(RAMP.fire[3]);
const GOLD = throughNight(RAMP.rust[3]);
const SLASH_BODY = throughNight(RAMP.blue[3]);
const SLASH_TAIL = throughNight(RAMP.blue[2]);

/** Pixels as a map "x,y" -> colour, turned into a stamp with its origin. */
function stamp(px: Map<string, string>): Stamp {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const k of px.keys()) {
    const [x, y] = k.split(',').map(Number);
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const { canvas, ctx } = makeCanvas(w, h);
  for (const [k, color] of px) {
    const [x, y] = k.split(',').map(Number);
    ctx.fillStyle = color;
    ctx.fillRect(x - x0, y - y0, 1, 1);
  }
  return { canvas, w, h, ox: -x0, oy: -y0 };
}

const blades = new Map<DirName, Stamp[]>();

/**
 * The sword pointing along a direction from the fist: a gold pommel behind
 * the fist, a three-pixel gold guard across it, and `length` pixels of blade,
 * two wide - the edge that faces the light (up and to the left) pale steel,
 * the other the blade's cyan - running out to a one-pixel point. Hot, the
 * whole blade burns cyan with a pale core: the heavy strike, wound up.
 */
export function blade(dir: DirName, length: number, hot = false): Stamp {
  let list = blades.get(dir);
  if (!list) blades.set(dir, (list = []));
  const key = length * 2 + (hot ? 1 : 0);
  let s = list[key];
  if (!s) {
    const d = DIRS[dir];
    const px = new Map<string, string>();
    const put = (x: number, y: number, c: string, over = false): void => {
      const k = `${x},${y}`;
      if (over || !px.has(k)) px.set(k, c);
    };
    const [bx, by] = step(d, -1);
    put(bx, by, GOLD_LIT);
    const [gx, gy] = step(d, 1);
    // Across the blade: for an upright blade the guard lies flat, for a level
    // one it stands, for a diagonal it runs along the other diagonal.
    const perp: Dir =
      d[0] === 0 ? [1, 0] : d[1] === 0 ? [0, 1] : Math.abs(d[0]) === Math.abs(d[1]) ? (d[0] * d[1] > 0 ? [1, -1] : [1, 1]) : Math.abs(d[0]) > Math.abs(d[1]) ? [0, 1] : [1, 0];
    put(gx, gy, GOLD_LIT);
    put(gx + perp[0], gy + perp[1], GOLD);
    put(gx - perp[0], gy - perp[1], GOLD);
    // The second line of the blade lies on its shaded side: under a level
    // blade, to the right of an upright one.
    const off: Dir = Math.abs(d[0]) >= Math.abs(d[1]) ? [0, 1] : [1, 0];
    for (let i = 2; i < length + 2; i++) {
      const [x, y] = step(d, i);
      put(x, y, hot ? GLOW : STEEL_LIT);
      if (i < length + 1) put(x + off[0], y + off[1], i > 2 ? (hot ? STEEL_LIT : GLOW) : STEEL);
    }
    s = stamp(px);
    list[key] = s;
  }
  return s;
}

/* ------------------------------------------------------------- swings */

/**
 * How a swing is drawn, in art pixels from the middle column of the hitbox
 * at the feet (x forward, y down). `ell` is the ellipse its crescent follows -
 * centre, half-width, half-height - fitted to the hitbox of swordRect(), and
 * `sweep` the angles (degrees; 0 straight ahead, -90 straight up) it is swept
 * between. The four keys are the poses of the swing - wound up, striking,
 * followed through, recovering - each a frame of him and the blade's
 * direction and length in it; the strike's and the follow-through's tips sit
 * on the crescent's outer edge.
 */
export interface SwingArt {
  readonly ell: readonly [number, number, number, number];
  readonly sweep: readonly [number, number];
  /** The crescent's greatest width, in art pixels. */
  readonly width: number;
  readonly wind: Key;
  readonly strike: Key;
  readonly follow: Key;
  readonly recover: Key;
}

interface Key {
  /** The pose, on the ground; its air twin is 'air_' instead of 'atk_'. */
  readonly pose: 'high' | 'low' | 'back' | 'strike' | 'follow' | 'rise' | 'recover';
  readonly dir: DirName;
  readonly length: number;
}

export type SwingKind = 'cut' | 'rise' | 'wide' | 'heavy';

export const SWING_ART: Record<SwingKind, SwingArt> = {
  // The first cut, from over his head down through the front: the box it hits
  // is twenty pixels deep and sixteen high, from his shoulders to his feet.
  cut: {
    ell: [3, -7, 20, 9],
    sweep: [-85, 50],
    width: 5,
    wind: { pose: 'high', dir: 'upBackSteep', length: 12 },
    strike: { pose: 'strike', dir: 'fwd', length: 13 },
    follow: { pose: 'follow', dir: 'fwdDown', length: 10 },
    recover: { pose: 'recover', dir: 'fwd', length: 12 },
  },
  // The second, back up through the same box.
  rise: {
    ell: [3, -7, 20, 9],
    sweep: [50, -85],
    width: 5,
    wind: { pose: 'low', dir: 'fwdDown', length: 9 },
    strike: { pose: 'strike', dir: 'fwd', length: 13 },
    follow: { pose: 'rise', dir: 'fwdUp', length: 9 },
    recover: { pose: 'rise', dir: 'upFwd', length: 9 },
  },
  // The finisher, from behind his shoulder over his head: a wider, taller box.
  wide: {
    ell: [3, -8, 23, 10],
    sweep: [-100, 50],
    width: 6,
    wind: { pose: 'back', dir: 'upBack', length: 13 },
    strike: { pose: 'strike', dir: 'fwd', length: 16 },
    follow: { pose: 'follow', dir: 'fwdDown', length: 12 },
    recover: { pose: 'recover', dir: 'fwd', length: 13 },
  },
  // The heavy strike: the deepest box of all, and the longest blade.
  heavy: {
    ell: [3, -8, 29, 13],
    sweep: [-110, 40],
    width: 8,
    wind: { pose: 'back', dir: 'backUp', length: 16 },
    strike: { pose: 'strike', dir: 'fwd', length: 23 },
    follow: { pose: 'follow', dir: 'fwdDown', length: 16 },
    recover: { pose: 'recover', dir: 'fwdDown', length: 15 },
  },
};

/** The frame of him for a key of a swing, on the ground or in the air. */
export function keyFrame(key: Key, air: boolean): HeroFrame {
  return `${air ? 'air' : 'atk'}_${key.pose}` as HeroFrame;
}

const smears = new Map<SwingKind, Map<number, Stamp>>();

/**
 * The crescent of a swing, as far as the blade has got: frame 1 from where it
 * started to `head` (degrees on its ellipse), growing from a wisp to its full
 * width at the blade; frame 2 the whole of it, pointed at both ends and
 * fullest late; frame 3 the front half, thin, its tail breaking up.
 */
export function smear(kind: SwingKind, frame: 1 | 2 | 3, head: number): Stamp {
  let byKind = smears.get(kind);
  if (!byKind) smears.set(kind, (byKind = new Map()));
  const key = frame * 10000 + head;
  let s = byKind.get(key);
  if (!s) {
    const art = SWING_ART[kind];
    const [cx, cy, a, b] = art.ell;
    const a0 = art.sweep[0];
    const span = head - a0;
    const lo = frame === 3 ? 0.5 : 0;
    const px = new Map<string, string>();
    for (let y = Math.floor(cy - b - 3); y <= cy + b + 3; y++) {
      for (let x = Math.floor(cx - a - 3); x <= cx + a + 3; x++) {
        const ex = (x + 0.5 - cx) / a;
        const ey = (y + 0.5 - cy) / b;
        const r = Math.hypot(ex, ey);
        if (r > 1 || r < 0.2) continue;
        const ang = (Math.atan2(ey, ex) * 180) / Math.PI;
        let u = -1;
        for (const turn of [-360, 0, 360]) {
          const t = (ang + turn - a0) / span;
          if (t >= 0 && t <= 1) {
            u = t;
            break;
          }
        }
        if (u < lo) continue;
        const v = (u - lo) / (1 - lo);
        const theta = Math.atan2(ey, ex);
        // How many pixels in from the outer edge this one lies.
        const depth = (1 - r) * Math.hypot(a * Math.cos(theta), b * Math.sin(theta));
        const width =
          frame === 1
            ? art.width * Math.min(1, v / 0.75) ** 1.2
            : frame === 2
              ? art.width * Math.sin(Math.PI * Math.min(1, v ** 0.75)) ** 0.6
              : art.width * 0.5 * Math.sin(Math.PI * Math.min(1, v ** 0.8)) ** 0.6;
        if (depth > width) continue;
        let color: string;
        if (frame === 3) {
          if (v < 0.4 && (x + y) & 1) continue;
          color = depth < 1 ? SLASH_BODY : SLASH_TAIL;
        } else if (depth < 1 && v > (frame === 1 ? 0.5 : 0.3)) {
          color = STEEL_LIT;
        } else if (depth < Math.max(1.5, width * 0.6) && v > 0.15) {
          color = GLOW;
        } else {
          color = SLASH_BODY;
        }
        px.set(`${x},${y}`, color);
      }
    }
    // Lone pixels at the ragged ends of a thin crescent read as noise, not
    // as the slash: drop any that touches none of the others side by side.
    for (const k of [...px.keys()]) {
      const [x, y] = k.split(',').map(Number);
      if (!px.has(`${x + 1},${y}`) && !px.has(`${x - 1},${y}`) && !px.has(`${x},${y + 1}`) && !px.has(`${x},${y - 1}`)) px.delete(k);
    }
    s = px.size ? stamp(px) : stamp(new Map([['0,0', SLASH_BODY]]));
    byKind.set(key, s);
  }
  return s;
}

/** Where on its ellipse the tip of a key's blade lies, in degrees, for frame 1's head. */
export function tipAngle(kind: SwingKind, hand: { x: number; y: number }, key: Key): number {
  const art = SWING_ART[kind];
  const [cx, cy, a, b] = art.ell;
  const [tx, ty] = step(DIRS[key.dir], key.length + 1);
  const x = hand.x + tx + 0.5;
  const y = hand.y + ty + 0.5;
  let ang = (Math.atan2((y - cy) / b, (x - cx) / a) * 180) / Math.PI;
  // On the side of the start the sweep runs to.
  const a0 = art.sweep[0];
  const span = art.sweep[1] - a0;
  while ((ang - a0) * span < 0 && Math.abs(ang - a0) > 180) ang += span > 0 ? 360 : -360;
  return Math.round(ang);
}

/* -------------------------------------------------------------- guard */

/*
 * The tells drawn round him - the heavy strike winding up, the guard open, a
 * parry landing, something saving him - as rings and arcs of whole pixels,
 * each made once per size. They are drawn on the actors' layer and outlined
 * with it, which keeps a pale ring readable over any ground.
 */

const rings = new Map<number, Stamp>();

/**
 * A ring of the pixels whose centres lie between r - thick and r from its
 * middle pixel, optionally only between two angles (degrees, screen: 0 ahead,
 * 90 down), in one colour - or, with `inner`, the inner pixels in another.
 */
export function ring(r: number, thick: number, color: string, inner = color, from = -180, to = 180): Stamp {
  const key = ((((colorKey(color) * 64 + colorKey(inner)) * 64 + r) * 4 + thick) * 361 + from + 180) * 361 + to + 180;
  let s = rings.get(key);
  if (!s) {
    const px = new Map<string, string>();
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        const d = Math.hypot(x, y);
        if (d > r + 0.5 || d <= r + 0.5 - thick) continue;
        const a = (Math.atan2(y, x) * 180) / Math.PI;
        if (a < from || a > to) continue;
        px.set(`${x},${y}`, d > r - 0.5 ? color : inner);
      }
    }
    s = stamp(px);
    rings.set(key, s);
  }
  return s;
}

const colorKeys = new Map<string, number>();
function colorKey(c: string): number {
  let k = colorKeys.get(c);
  if (k === undefined) colorKeys.set(c, (k = colorKeys.size + 1));
  return k;
}

let silk: Stamp | null = null;

/**
 * Arachna's silk wound round him: three fine threads on tilted ellipses, one
 * pixel thin. Drawn translucent on purpose, so that the actor pass lets it
 * through as a scatter of single glints rather than as three outlined hoops.
 */
export function silkThreads(): Stamp {
  if (!silk) {
    const px = new Map<string, string>();
    const color = throughNight(RAMP.slate[6]);
    for (let i = 0; i < 3; i++) {
      const tilt = -0.5 + i * 0.5;
      const rx = 7.5;
      const ry = 11 - i;
      for (let k = 0; k < 160; k++) {
        const t = (k / 160) * Math.PI * 2;
        const ex = Math.cos(t) * rx;
        const ey = Math.sin(t) * ry;
        const x = Math.round(ex * Math.cos(tilt) - ey * Math.sin(tilt));
        const y = Math.round(ex * Math.sin(tilt) + ey * Math.cos(tilt));
        px.set(`${x},${y}`, color);
      }
    }
    silk = stamp(px);
  }
  return silk;
}

let heart: Stamp | null = null;

/** A heart knocked out of him by a blow (the Lichtkern): a small gold light. */
export function moteHeart(): Stamp {
  if (!heart) {
    const rows = ['.GG.GG.', 'GWGGGGG', 'GGGGGGg', '.GGGgg.', '..Ggg..', '...g...'];
    const key: Record<string, string> = {
      G: throughNight(RAMP.fire[3]),
      g: throughNight(RAMP.rust[3]),
      W: throughNight(RAMP.slate[6]),
    };
    const px = new Map<string, string>();
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) if (key[row[x]]) px.set(`${x - 3},${y - 3}`, key[row[x]]);
    });
    heart = stamp(px);
  }
  return heart;
}
