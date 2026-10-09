import { RAMP } from '../render/palette';
import { PixelSprite } from '../render/pixel';
import { blank, flipX, flipY, plot, rows, tumble, turnCW, type Grid } from '../render/sheet';
import { cog, despeckle, ellipseCells4, insidePoly, rl, silhouette, stamp, swap, turned } from './boss-pixels';

/**
 * Tickmar's art: an alarm clock on piston legs, built from parts on the art
 * grid. Every part is a sprite made once from rows of characters - the face
 * with its twelve tick pixels and four signs, the torso with its window on
 * the works, the legs, the key, the bob, the bells, the lamp - and the moving
 * parts come in frames: cogs at their turns, the key at eight, the hands he
 * throws at sixteen. Only straight lines are laid down per frame: the hands
 * on his dial at twelve angles, the pendulum's rod, the hammer, the light of
 * a stab.
 *
 * Every sprite is symmetric about its middle column, which stands on the
 * column of the clock's middle: so a part mirrored with him turns about his
 * spine, not about a seam.
 *
 * Paints: brass from the fire and rust ramps, steel from the slate ramp, a
 * cream dial, a dark ink for his ticks and signs and the inside of him, the
 * red of his second hand, and the fire ramp up to white for what he lights.
 */

/* ------------------------------------------------------------------ paints */

const KEY: Readonly<Record<string, string>> = {
  // Brass, light to the darkest edge.
  Y: RAMP.fire[3],
  y: RAMP.rust[3],
  b: RAMP.rust[2],
  o: RAMP.rust[1],
  O: RAMP.rust[0],
  // Steel.
  S: RAMP.slate[6],
  s: RAMP.slate[5],
  t: RAMP.slate[4],
  // The dial, its shade, and its ink.
  k: RAMP.earth[7],
  K: RAMP.earth[6],
  T: RAMP.earth[2],
  // The dark inside him, and the iron of his hands.
  x: RAMP.earth[1],
  // The second hand.
  r: RAMP.rose[2],
  // Light: white, yellow, amber.
  w: '#ffffff',
  F: RAMP.fire[4],
  f: RAMP.fire[2],
};

/** Every letter white: the flash of a blow. */
const FLASH: Readonly<Record<string, string>> = Object.fromEntries(Object.keys(KEY).map((k) => [k, '#ffffff']));

const cache = new Map<string, PixelSprite>();

/** A grid as a sprite, made once (in white for a flash). */
export function sprite(id: string, grid: Grid, flash = false): PixelSprite {
  const k = flash ? `${id}|!` : id;
  let s = cache.get(k);
  if (!s) {
    s = new PixelSprite(grid, flash ? FLASH : KEY);
    cache.set(k, s);
  }
  return s;
}

export function paint(letter: string): string {
  return KEY[letter];
}

/** For previews. */
export function previewKey(): Record<string, string> {
  return { ...KEY };
}

/** Brass lit from the upper left on a drum, by where across it a cell is (-1 left edge … 1 right). */
function drum(nx: number, lift = 0): string {
  const l = -0.62 * nx + 0.55 * Math.sqrt(Math.max(0, 1 - nx * nx)) + lift;
  return l > 0.7 ? 'Y' : l > 0.28 ? 'y' : l > -0.15 ? 'b' : l > -0.5 ? 'o' : 'O';
}

/** A shaded disc of brass, odd size round its middle cell, with an edge and a groove at `groove` (cells). */
function brassDisc(r: number, groove = 0): string[] {
  const n = Math.round(r) * 2 + 1;
  const c = (n - 1) / 2;
  const cells = blank(n, n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = x - c;
      const dy = y - c;
      const d = Math.hypot(dx, dy);
      if (d > r + 0.2) continue;
      const nx = dx / (r + 0.5);
      const ny = dy / (r + 0.5);
      const l = -0.55 * nx - 0.55 * ny + 0.62 * Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      let t = l > 0.78 ? 'Y' : l > 0.42 ? 'y' : l > 0.05 ? 'b' : 'o';
      if (groove > 0 && Math.abs(d - groove) < 0.5) t = l > 0.42 ? 'b' : 'o';
      if (d > r - 0.8 && l < 0.1) t = 'O';
      plot(cells, x, y, t);
    }
  }
  return rows(cells);
}

/* ------------------------------------------------------------------- face */

/*
 * The face: 29 × 29 art pixels round its middle (column and row 14), on
 * the clock's middle column, its centre 45 art pixels over the floor. A
 * brass bezel lit on its upper left with its inner bevel lit on the lower
 * right, a cream dial with the bezel's shadow across its upper edge, twelve
 * tick pixels (the quarters two deep) and a glint on the glass.
 */
export const FACE_N = 29;
export const FACE_C = 14;
/** The face's middle, in art pixels above the floor. */
export const FACE_UP = 45;
/** Where the signs sit, from the face's middle. */
export const SIGN_R = 7;

function face(): string[] {
  const cells = blank(FACE_N, FACE_N);
  for (let y = 0; y < FACE_N; y++) {
    for (let x = 0; x < FACE_N; x++) {
      const dx = x - FACE_C;
      const dy = y - FACE_C;
      const r = Math.hypot(dx, dy);
      if (r > 14.5) continue;
      const l = r < 0.5 ? 0 : (-dx - dy) / (r * Math.SQRT2);
      let c: string;
      if (r <= 12.45) c = r > 10.6 && dx + dy < -5 ? 'K' : 'k';
      else if (r > 13.5) c = l > 0.45 ? 'Y' : l > -0.2 ? 'y' : l > -0.7 ? 'b' : 'o';
      else c = l < -0.35 ? 'y' : l < 0.3 ? 'b' : 'O';
      plot(cells, x, y, c);
    }
  }
  // Twelve ticks, each two pixels pointing in at the middle.
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const x = Math.round(c * 11);
    const y = Math.round(s * 11);
    plot(cells, FACE_C + x, FACE_C + y, 'T');
    if (Math.abs(c) >= Math.abs(s)) plot(cells, FACE_C + x - Math.sign(c), FACE_C + y, 'T');
    else plot(cells, FACE_C + x, FACE_C + y - Math.sign(s), 'T');
  }
  // A glint on the glass.
  for (const [x, y] of [
    [-5, -8],
    [-6, -8],
    [-6, -7],
    [-7, -7],
    [-7, -6],
  ]) {
    plot(cells, FACE_C + x, FACE_C + y, 'w');
  }
  return rows(cells);
}
export const FACE: Grid = face();
/** Unlit, before he wakes: the dial a step duller, no glint. */
export const FACE_DARK: Grid = swap(FACE, { k: 'K', w: 'K' });

/** The face with a crack across it, for when it comes off him. */
export const FACE_BROKEN: Grid = (() => {
  const cells = FACE.map((r) => r.split(''));
  for (const [x, y] of [
    [6, 11], [7, 12], [8, 12], [9, 13], [10, 13], [11, 14], [12, 14], [13, 15], [14, 15], [15, 14], [16, 13], [17, 12],
    [18, 12], [19, 11], [14, 16], [15, 17], [15, 18], [16, 19], [16, 20], [17, 21],
  ] as const) {
    plot(cells, x, y, 'x');
  }
  return rows(cells);
})();

export type Sign = 'bell' | 'gears' | 'pendel' | 'hands';

/** The four signs in his dial's ink, 5 × 5. */
export const SIGN: Readonly<Record<Sign, Grid>> = {
  bell: ['..T..', '.TTT.', '.TTT.', 'TTTTT', '..T..'],
  gears: ['.T.T.', 'TTTTT', 'TT.TT', 'TTTTT', '.T.T.'],
  pendel: ['..T..', '..T..', '..T..', '.TTT.', '.TTT.'],
  hands: ['..T..', '..T..', 'T.T.T', '.TTT.', '..T..'],
};

/**
 * A sign burning: 11 × 11, the sign grown to 7 × 7 in yellow on a dark window,
 * a ring round it in amber - or, on the tick, in yellow.
 */
const SIGN_BIG: Readonly<Record<Sign, Grid>> = {
  bell: ['...F...', '..FFF..', '.FwFFF.', '.FFFFF.', '.FFFFF.', 'FFFFFFF', '...F...'],
  gears: ['.F.F.F.', 'FFFFFFF', '.FFxFF.', 'FFxxxFF', '.FFxFF.', 'FFFFFFF', '.F.F.F.'],
  pendel: ['...F...', '...F...', '...F...', '...F...', '..FFF..', '.FFwFF.', '..FFF..'],
  hands: ['...F...', '...F...', '...F...', 'F..F..F', '.F.F.F.', '..FFF..', '...F...'],
};

function burning(sign: Sign, ring: string): string[] {
  const cells = blank(11, 11);
  for (let y = 0; y < 11; y++) {
    for (let x = 0; x < 11; x++) {
      const r = Math.hypot(x - 5, y - 5);
      if (r <= 4.7) plot(cells, x, y, 'x');
      else if (r <= 5.6) plot(cells, x, y, ring);
    }
  }
  stamp(cells, SIGN_BIG[sign], 2, 2);
  return rows(cells);
}
export const SIGN_LIT: Readonly<Record<Sign, readonly [Grid, Grid]>> = {
  bell: [burning('bell', 'f'), burning('bell', 'F')],
  gears: [burning('gears', 'f'), burning('gears', 'F')],
  pendel: [burning('pendel', 'f'), burning('pendel', 'F')],
  hands: [burning('hands', 'f'), burning('hands', 'F')],
};

/* ----------------------------------------------------------------- torso */

/*
 * Hips, belly and the vents on his shoulders: 33 × 19 art pixels, its middle
 * column on his, its rows from 39 to 21 above the floor. The window on his
 * works is a hole in it (what turns behind is drawn first), with a dark frame;
 * beside it the hatch the gears come out of.
 */
export const TORSO_W = 33;
export const TORSO_TOP = 39;
/** The window: its columns from his middle, its rows above the floor (top first). */
export const WINDOW = { x0: -11, x1: 8, top: 31, bottom: 26 } as const;
/** The hatch, the same way. */
export const HATCH = { x0: 10, x1: 14, top: 31, bottom: 26 } as const;

/** The window's and hatch's columns for a facing: they sit on the side he faces. */
export function facingCols(r: { x0: number; x1: number }, facing: 1 | -1): [number, number] {
  return facing > 0 ? [r.x0, r.x1] : [-r.x1, -r.x0];
}

function torso(facing: 1 | -1): string[] {
  const half = (TORSO_W - 1) / 2;
  const cells = blank(TORSO_W, TORSO_TOP - 20);
  const put = (x: number, up: number, c: string): void => plot(cells, x + half, TORSO_TOP - up, c);
  const [wx0, wx1] = facingCols(WINDOW, facing);
  const [hx0, hx1] = facingCols(HATCH, facing);
  const bellyHalf = (up: number): number => (up >= 36 ? 6 : up === 35 ? 12 : up === 34 ? 15 : 16);
  for (let up = 36; up >= 21; up--) {
    const hw = up >= 26 ? bellyHalf(up) : 16;
    for (let x = -hw; x <= hw; x++) {
      const lift = up >= 33 ? 0.12 : up <= 22 ? -0.2 : 0;
      put(x, up, drum(x / (hw + 0.5), lift));
    }
  }
  // The hips: a band with a dark lower edge and four rivets.
  for (let x = -16; x <= 16; x++) {
    put(x, 25, x < -4 ? 'Y' : x < 9 ? 'y' : 'b');
    put(x, 21, 'O');
  }
  for (const rx of [-13, -6, 6, 13]) {
    put(rx, 24, 'Y');
    put(rx, 23, 'o');
  }
  // The window, a hole with a dark frame.
  for (let up = WINDOW.top + 1; up >= WINDOW.bottom - 1; up--) {
    for (let x = wx0 - 1; x <= wx1 + 1; x++) {
      const inside = up <= WINDOW.top && up >= WINDOW.bottom && x >= wx0 && x <= wx1;
      put(x, up, inside ? '.' : 'O');
    }
  }
  // The glass's lit top edge.
  for (let x = wx0; x <= wx0 + 6; x++) put(x, WINDOW.top + 1, 'b');
  // The hatch: a dark slot in a frame.
  for (let up = HATCH.top + 1; up >= HATCH.bottom - 1; up--) {
    for (let x = hx0 - 1; x <= hx1 + 1; x++) {
      const inside = up <= HATCH.top && up >= HATCH.bottom && x >= hx0 && x <= hx1;
      put(x, up, inside ? 'x' : 'O');
    }
  }
  // The vents on his shoulders.
  for (const s of [-1, 1]) {
    for (let up = 38; up >= 33; up--) for (let k = 13; k <= 15; k++) put(s * k, up, up === 38 ? 'O' : k === 13 ? 'b' : k === 14 ? 'o' : 'O');
    for (let k = 12; k <= 16; k++) put(s * k, 39, s < 0 && k < 15 ? 'Y' : 'y');
  }
  return rows(cells);
}
/** Facing right (the hatch on his right), and facing left. */
export const TORSO: Readonly<Record<'1' | '-1', Grid>> = { '1': despeckle(torso(1)), '-1': despeckle(torso(-1)) };

/** The hammer's head. */
export const HAMMER_HEAD: Grid = ['.S.', 'Sst', '.t.'];

/* ------------------------------------------------------------------- legs */

/** A piston's cylinder: 9 × 11, its rows from 23 to 13 above the floor. */
export const CYLINDER: Grid = (() => {
  const cells = blank(9, 11);
  for (let y = 0; y < 11; y++) {
    for (let x = 0; x < 9; x++) {
      let c = drum((x - 4) / 4.5);
      if (y === 2) c = x < 6 ? 'Y' : 'y';
      if (y >= 9) c = 'O';
      plot(cells, x, y, c);
    }
  }
  // A rivet: its head lit, its foot in shadow.
  plot(cells, 3, 5, 'Y');
  plot(cells, 4, 5, 'O');
  plot(cells, 4, 6, 'o');
  return despeckle(rows(cells));
})();
export const CYLINDER_TOP = 23;

/** A foot: 13 × 4, standing on the floor. */
export const FOOT: Grid = [rl('1. 2y 7b 2o 1.'), rl('1. 1y 3b 6o 1O 1.'), rl('1y 2b 8o 2O'), rl('13O')];

/** An ankle: a steel ball. */
export const ANKLE: Grid = ['SSs', 'Sst', 'stt'];

/* -------------------------------------------------------------------- key */

/**
 * The key in his back, at eight turns: a shaft out of him and the bow, its
 * two wings as broad as the turn shows them, the one towards the light lit.
 * 9 × 15, its right edge on his back.
 */
export const KEY_FRAMES: readonly Grid[] = Array.from({ length: 8 }, (_, k) => {
  const spread = Math.cos((k * Math.PI) / 4);
  const cells = blank(9, 15);
  const cx = 3;
  const cy = 7;
  // The shaft.
  for (let x = 4; x < 9; x++) {
    plot(cells, x, 6, 'y');
    plot(cells, x, 7, 'b');
    plot(cells, x, 8, 'o');
  }
  for (const s of [-1, 1]) {
    const ry = 3.5 * Math.abs(spread) + 0.6;
    const wy = cy + s * 4 * Math.abs(spread);
    const lit = s * spread > 0;
    for (let y = 0; y < 15; y++) {
      for (let x = 0; x < 7; x++) {
        const u = (x - cx) / 2.6;
        const v = (y - wy) / ry;
        const q = u * u + v * v;
        if (q > 1) continue;
        plot(cells, x, y, q > 0.55 ? 'O' : lit ? (u + v < 0 ? 'Y' : 'y') : 'b');
      }
    }
  }
  plot(cells, cx, cy, 'O');
  plot(cells, cx + 1, cy, 'O');
  return despeckle(rows(cells));
});

/* -------------------------------------------------------------- pendulum */

/** The bob: a brass disc 15 across with a groove, and lit the way it is while it is about to swing. */
export const BOB: Grid = despeckle(brassDisc(7, 4.5));
export const BOB_HOT: Grid = swap(BOB, { Y: 'w', y: 'F', b: 'f', o: 'b', O: 'o' });
export const BOB_GHOST: readonly [Grid, Grid] = [silhouette(BOB, 'o'), silhouette(BOB, 'O')];

/* ----------------------------------------------------------------- bells */

/** A bell, 11 × 7: a dome lit from the upper left on a dark rim, a knob on top. */
export const BELL: Grid = (() => {
  const cells = blank(11, 7);
  plot(cells, 5, 0, 'O');
  for (let y = 1; y <= 5; y++) {
    const hw = Math.sqrt(Math.max(0, 4.6 ** 2 - (5.6 - y) ** 2));
    for (let x = 0; x < 11; x++) {
      const dx = x - 5;
      if (Math.abs(dx) > hw + 0.3) continue;
      const nx = dx / 5;
      const ny = (y - 5.6) / 5;
      const l = -0.6 * nx - 0.5 * ny + 0.3;
      plot(cells, x, y, l > 0.75 ? 'Y' : l > 0.35 ? 'y' : l > -0.05 ? 'b' : 'o');
    }
  }
  for (let x = 0; x < 11; x++) plot(cells, x, 6, x < 4 ? 'b' : 'o');
  return despeckle(rows(cells));
})();

/** The lamp on his head, 4 × 4: out, glowing, burning - and in his second half, red. */
export const LAMP: Readonly<Record<'off' | 'dim' | 'on' | 'dim2' | 'on2', Grid>> = {
  off: ['.TT.', 'TxxT', 'TxxT', '.xx.'],
  dim: ['.ff.', 'fbbo', 'fbbo', '.oo.'],
  on: ['.ww.', 'wFFf', 'wFFf', '.ff.'],
  dim2: ['.rr.', 'rooO', 'rooO', '.OO.'],
  on2: ['.ww.', 'wrrO', 'wrrO', '.OO.'],
};

/* ----------------------------------------------------------- the works */

/** The cogs behind his window: radius, teeth, and frames to a tooth. */
export const WINDOW_COGS = [
  { r: 4, teeth: 8, x: -6, up: 29, speed: 1, phase: 0 },
  { r: 3.5, teeth: 7, x: 1, up: 28, speed: -1.15, phase: 0.2 },
  { r: 2.5, teeth: 6, x: 7, up: 30, speed: 1.6, phase: 0 },
] as const;
export const COG_STEPS = 3;

const cogFrames = new Map<string, Grid[]>();

/** A cog's frames across one tooth: radius, teeth, tones dark to light. */
export function cogFrames3(r: number, teeth: number, tones: string, steps = COG_STEPS): readonly Grid[] {
  const id = `${r}|${teeth}|${tones}|${steps}`;
  let frames = cogFrames.get(id);
  if (!frames) {
    frames = Array.from({ length: steps }, (_, k) => despeckle(cog(r, teeth, (k / steps) * ((Math.PI * 2) / teeth), tones, 'x')));
    cogFrames.set(id, frames);
  }
  return frames;
}

/** Which of a cog's frames shows it turned by `turn`. */
export function cogStep(turn: number, teeth: number, steps = COG_STEPS): number {
  const k = Math.floor((turn / ((Math.PI * 2) / teeth)) * steps);
  return ((k % steps) + steps) % steps;
}

/** The works behind the dial while he winds himself: a dark well, and the spring at eight turns. */
export const WORKS_WELL: Grid = (() => {
  const cells = blank(25, 25);
  for (let y = 0; y < 25; y++) for (let x = 0; x < 25; x++) if (Math.hypot(x - 12, y - 12) <= 12.45) plot(cells, x, y, 'x');
  return rows(cells);
})();
export const WORKS_COGS = [
  { r: 5.5, teeth: 10, x: -4, y: -3, speed: 1 },
  { r: 4.5, teeth: 9, x: 5, y: 1, speed: -1.2 },
  { r: 3.5, teeth: 8, x: -2, y: 6, speed: 1.5 },
] as const;
export const SPRING: readonly Grid[] = Array.from({ length: 8 }, (_, k) => {
  const cells = blank(11, 11);
  const turn = (k / 8) * Math.PI * 2;
  let last: [number, number] | null = null;
  for (let i = 0; i <= 60; i++) {
    const a = (i / 60) * Math.PI * 5 + turn;
    const r = 0.6 + i * 0.075;
    const p: [number, number] = [Math.round(5 + Math.cos(a) * r), Math.round(5 + Math.sin(a) * r)];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) plot(cells, p[0], p[1], i > 40 ? 's' : 'S');
    last = p;
  }
  return rows(cells);
});

/* ------------------------------------------------------------------- loose */

/** The gear he rolls at the hero: radius 6.5, nine teeth, four frames to a tooth. */
export const ROLL_STEPS = 4;
export const ROLL_TEETH = 9;
export const ROLL: readonly Grid[] = cogFrames3(6.5, ROLL_TEETH, 'Ooby', ROLL_STEPS);
/** Sent back by the blade: burning. */
export const ROLL_HOT: readonly Grid[] = ROLL.map((g) => swap(g, { O: 'b', o: 'f', b: 'F', y: 'w', x: 'o' }));
/** Its trail on the way home: three silhouettes, cooling. */
export const ROLL_TRAIL: readonly Grid[] = [silhouette(ROLL[0], 'f'), silhouette(ROLL[0], 'b'), silhouette(ROLL[0], 'o')];

/**
 * One of his hands, out of the dial: iron rimmed in brass, a spade at its tip
 * and a boss on its shaft, at sixteen angles (0 points right, clockwise on
 * screen). Each frame is square round its pivot cell.
 */
export type HandKind = 'minute' | 'hour' | 'second';
const HAND_LEN: Record<HandKind, number> = { minute: 32, hour: 25, second: 29 };

function hand(kind: HandKind, angle: number): string[] {
  const L = HAND_LEN[kind];
  const w = kind === 'hour' ? L * 0.16 : kind === 'minute' ? L * 0.1 : L * 0.075;
  const n = L * 2 + 5;
  const c = (n - 1) / 2;
  const shape = turned([-0.12 * L, -w / 2, 0.72 * L, -w / 2, 0.8 * L, -1.6 * w, L, 0, 0.8 * L, 1.6 * w, 0.72 * L, w / 2, -0.12 * L, w / 2], angle, c + 0.5, c + 0.5);
  const cells = blank(n, n);
  const inside = (x: number, y: number): boolean => insidePoly(shape, x + 0.5, y + 0.5);
  const body = kind === 'second' ? 'r' : 'x';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (inside(x, y)) plot(cells, x, y, body);
  // A brass rim, lit on the side towards the light.
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!inside(x, y)) continue;
      const out = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].filter(([dx, dy]) => !inside(x + dx, y + dy));
      if (out.length === 0) continue;
      const lit = out.some(([dx, dy]) => dx + dy < 0);
      plot(cells, x, y, lit ? 'Y' : 'b');
    }
  }
  // The boss on its shaft.
  const bx = c + Math.cos(angle) * 0.3 * L;
  const by = c + Math.sin(angle) * 0.3 * L;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const d = Math.hypot(x - bx, y - by);
      if (d <= Math.max(1.2, w * 0.9)) plot(cells, x, y, d < 0.8 ? 'Y' : 'y');
    }
  }
  return rows(cells);
}
export const HANDS: Readonly<Record<HandKind, readonly Grid[]>> = {
  minute: Array.from({ length: 16 }, (_, k) => despeckle(hand('minute', (k / 16) * Math.PI * 2))),
  hour: Array.from({ length: 16 }, (_, k) => despeckle(hand('hour', (k / 16) * Math.PI * 2))),
  second: Array.from({ length: 16 }, (_, k) => despeckle(hand('second', (k / 16) * Math.PI * 2))),
};

/* ------------------------------------------------------- rings and marks */

const grids = new Map<string, Grid>();
function once(id: string, make: () => Grid): Grid {
  let g = grids.get(id);
  if (!g) {
    g = make();
    grids.set(id, g);
  }
  return g;
}

/**
 * The ring of a bell going out over it: an arc one pixel thick at radius r
 * (art pixels), over the top, on a grid whose bottom middle cell is the
 * bell's middle.
 */
export function ringArc(r: number, letter: string): Grid {
  return once(`arc${r}${letter}`, () => {
    const cells = blank(r * 2 + 1, r + 1);
    for (let y = 0; y <= r; y++) {
      for (let x = 0; x <= r * 2; x++) {
        const dx = x - r;
        const dy = y - r;
        const d = Math.hypot(dx, dy);
        const a = Math.atan2(dy, dx) + Math.PI * 2;
        if (d > r - 1 && d <= r && a >= Math.PI * 1.08 && a <= Math.PI * 1.92) plot(cells, x, y, letter);
      }
    }
    return rows(cells);
  });
}

/**
 * The front of a ring running along the floor: the half of a flat ellipse 6
 * wide and ry tall that faces the way it runs, standing on the floor - its
 * bottom row is the floor's top row, its column 0 (or 6, running left) the
 * ring's middle.
 */
export function chimeArc(ry: number, dir: 1 | -1, letter: string): Grid {
  return once(`chime${ry}${dir}${letter}`, () => {
    const cells = blank(7, ry + 1);
    for (const [dx, dy] of ellipseCells4(6, ry)) {
      if (dx * dir < 0 || dy > 0) continue;
      plot(cells, dir > 0 ? dx : 6 + dx, ry + dy, letter);
    }
    return rows(cells);
  });
}

/** The mark a hand puts on the floor: a flat dial 23 × 7 round its middle cell, twelve ticks inside. */
export function markGrid(letter: string): Grid {
  return once(`mark${letter}`, () => {
    const cells = blank(23, 7);
    for (const [dx, dy] of ellipseCells4(11, 3)) plot(cells, 11 + dx, 3 + dy, letter);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const tx = Math.round(Math.cos(a) * 8);
      const ty = Math.round(Math.sin(a) * 2);
      plot(cells, 11 + tx - (tx > 0 ? 1 : 0), 3 + ty, letter);
      plot(cells, 11 + tx - (tx > 0 ? 1 : 0) + 1, 3 + ty, letter);
    }
    return rows(cells);
  });
}

/* ------------------------------------------------------------------ debris */

/** A plate of his casing, tumbling: eight angles. */
export const PLATE: readonly Grid[] = Array.from({ length: 8 }, (_, k) =>
  despeckle(rows(tumble(13, 13, [-6, -2, 6, -3, 6, 2, -5, 3], (k / 8) * Math.PI * 2, 'ObyY'))),
);
/** A bell knocked off, at four turns. */
export const BELL_TURNS: readonly Grid[] = [BELL, turnCW(BELL), flipX(flipY(BELL)), flipX(turnCW(BELL))];
