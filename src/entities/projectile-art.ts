import { Sheet, blank, comet, eightWays, flame, flipX, hash2, moon, oval, plot, rows, tumble, turnCW, type Grid } from '../render/sheet';

/**
 * What flies: every projectile as frames of art pixels. A thing that turns
 * over in the air turns in drawn frames, a thing that points the way it flies
 * has a frame for each of the eight ways, and a crescent that thins out as it
 * goes thins out in frames, not in alpha.
 */

/** The colours of fire, from the cool outer edge in to the white-hot core. */
const FIRE = '#c64524';

/* -------------------------------------------------------------------- orb */

const ORB_BODY: Grid = ['..OOo..', '.OWWOo.', 'OWWOOov', 'OWOOoov', 'OOooovv', '.oovvv.', '..vvv..'];
/** Where the spark runs round the rim, one place per frame. */
const ORB_RIM: readonly (readonly [number, number])[] = [
  [3, 0],
  [6, 3],
  [3, 6],
  [0, 3],
];

function orbFrame(k: number): string[] {
  const cells = ORB_BODY.map((r) => r.split(''));
  const [x, y] = ORB_RIM[k];
  plot(cells, x, y, 'X');
  const [ox, oy] = ORB_RIM[(k + 2) % 4];
  plot(cells, ox, oy, 'O');
  return rows(cells);
}

export const ORB = new Sheet<'o0' | 'o1' | 'o2' | 'o3'>(
  { o0: orbFrame(0), o1: orbFrame(1), o2: orbFrame(2), o3: orbFrame(3) },
  { O: '#f389f5', W: '#fdd2ed', o: '#db3ffd', v: '#7a09fa', X: '#ffffff' },
  { friendly: { O: '#94fdff', W: '#ffffff', o: '#0cf1ff', v: '#0098dc' } },
);

/* ------------------------------------------------------------------- bone */

const BONE_0: Grid = ['a.....a', 'aabbbab', 'b.....b'];
const BONE_45: Grid = ['aa...', 'aab..', '..b..', '..baa', '...ab'];

export const BONE = new Sheet<'b0' | 'b1' | 'b2' | 'b3'>(
  { b0: [...BONE_0], b1: flipX(BONE_45), b2: turnCW(BONE_0), b3: [...BONE_45] },
  { a: '#c7cfdd', b: '#92a1b9' },
);

/* -------------------------------------------------------------- shockwave */

const FIRE_TONES = '23456';
const WATER_TONES = 'pqrst';

function crest(h: number, seed: number, tones: string): string[] {
  const g = flame(13, h, seed, tones, 0.3);
  return [...new Array<string>(15 - h).fill('.............'), ...g];
}

export type CrestFrame = 'f0' | 'f1' | 'f2' | 'f3' | 'm0' | 'm1' | 'l0' | 'l1';

function crests(tones: string): Record<CrestFrame, string[]> {
  return {
    f0: crest(15, 1, tones),
    f1: crest(15, 2, tones),
    f2: crest(14, 3, tones),
    f3: crest(15, 4, tones),
    m0: crest(10, 5, tones),
    m1: crest(9, 6, tones),
    l0: crest(6, 7, tones),
    l1: crest(5, 8, tones),
  };
}

const CREST_KEY = {
  '2': FIRE,
  '3': '#ed7614',
  '4': '#ffa214',
  '5': '#ffc825',
  '6': '#ffeb57',
  p: '#00396d',
  q: '#0069aa',
  r: '#0098dc',
  s: '#94fdff',
  t: '#ffffff',
};

export const FIRE_CREST = new Sheet<CrestFrame>(crests(FIRE_TONES), CREST_KEY);
export const WATER_CREST = new Sheet<CrestFrame>(crests(WATER_TONES), CREST_KEY);

/* ------------------------------------------------------------------- rock */

/**
 * A lump turned to each of `count` angles, with lines scored into it - facets,
 * cracks - turned along with it, so a tumbling rock shows which way up it is
 * while its light stays on the upper left.
 */
export function lumpFrames(
  w: number,
  corners: readonly number[],
  tones: string,
  count: number,
  marks: readonly (readonly [number, number, number, number, string])[],
): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const cells = tumble(w, w, corners, a, tones);
    const c = Math.cos(a);
    const s = Math.sin(a);
    for (const [x0, y0, x1, y1, letter] of marks) {
      const steps = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.5));
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const x = x0 + (x1 - x0) * t;
        const y = y0 + (y1 - y0) * t;
        const px = Math.floor(w / 2 + x * c - y * s);
        const py = Math.floor(w / 2 + x * s + y * c);
        if (cells[py]?.[px] && cells[py][px] !== '.' && cells[py][px] !== tones[0]) cells[py][px] = letter;
      }
    }
    out.push(rows(cells));
  }
  return out;
}

const ROCK_CORNERS = [-5.4, -0.6, -2.2, -5, 2.6, -4.4, 5.2, -0.4, 3.4, 4.2, -2.4, 4.8];

export const ROCK = new Sheet<string>(
  directional(
    'r',
    lumpFrames(12, ROCK_CORNERS, 'dcba', 8, [
      [-3, -1, 1, -2, 'd'],
      [1, -2, 3, 2, 'c'],
      [-2, 2, 0, 3, 'c'],
    ]),
  ),
  { d: '#391f21', c: '#5d2c28', b: '#8a4836', a: '#bf6f4a' },
);

/* -------------------------------------------------------------- crescents */

/*
 * The crescent the blade throws, and Vesperon's of blood: a moon, its convex
 * side forward, its horns swept back - in three sizes, the smaller for the
 * end of its flight, so its reach can be read without a fade.
 */
function crescentFrames(): Record<'big' | 'mid' | 'small', string[]> {
  return {
    big: moon(15, 11, 7.5, 5.5, 6.8, 2.4, 5.5, 6.6, 'F', 'C', 'B'),
    mid: moon(15, 11, 7.5, 5.5, 5.6, 3.4, 5.5, 5.3, 'F', 'C', 'B'),
    small: moon(15, 11, 7.5, 5.5, 4.4, 4.4, 5.5, 4.0, 'F', 'C', 'B'),
  };
}

export const BEAM = new Sheet<'big' | 'mid' | 'small'>(
  crescentFrames(),
  { F: '#ffffff', C: '#94fdff', B: '#0098dc' },
  {
    water: { F: '#ffffff', C: '#94fdff', B: '#1e6f50' },
    dark: { F: '#db3ffd', C: '#3003d9', B: '#0e071b' },
  },
);

export const BLOOD = new Sheet<'big' | 'mid' | 'small'>(
  crescentFrames(),
  { F: '#f5555d', C: '#c42430', B: '#571c27' },
  { friendly: { F: '#ffffff', C: '#fdd2ed', B: '#f68187' } },
);

/* ------------------------------------------------------------------- blob */

function blobFrame(rx: number, ry: number): string[] {
  const cells = blank(9, 9);
  oval(cells, 4.5, 4.5, rx, ry, 'b');
  // Lit from the upper left: a light crown, a dark underside, a gloss.
  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < 9; x++) {
      if (cells[y][x] !== 'b') continue;
      const nx = (x + 0.5 - 4.5) / rx;
      const ny = (y + 0.5 - 4.5) / ry;
      if (-0.55 * nx - 0.85 * ny > 0.45) cells[y][x] = 'a';
      else if (0.4 * nx + 0.9 * ny > 0.5) cells[y][x] = 'c';
    }
  }
  plot(cells, Math.round(4.5 - rx * 0.45), Math.round(4.5 - ry * 0.5), 'w');
  return rows(cells);
}

export const BLOB = new Sheet<'round' | 'wide' | 'tall'>(
  { round: blobFrame(3.6, 3.4), wide: blobFrame(4.4, 2.8), tall: blobFrame(2.8, 4.4) },
  { a: '#99e65f', b: '#5ac54f', c: '#33984b', w: '#d3fc7e' },
  { friendly: { a: '#d3fc7e', b: '#99e65f', c: '#5ac54f', w: '#ffffff' } },
);

/* ------------------------------------------------------- comets and darts */

function eightComets(w: number, head: number, tail: number, tones: string): string[][] {
  const out: string[][] = [];
  for (let d = 0; d < 8; d++) out.push(comet(w, w, (d * Math.PI) / 4, head, tail, tones));
  return out;
}

function directional(prefix: string, frames: string[][]): Record<string, string[]> {
  return Object.fromEntries(frames.map((f, i) => [`${prefix}${i}`, f]));
}

/** The hydra's coal, falling with its smoke; turned, a white-hot bolt with a long tail. */
export const EMBER = new Sheet<string>(
  {
    ...directional('h', eightComets(11, 2.2, 6, 'sdcbaw')),
    ...directional('f', eightComets(13, 2.4, 9, 'cbaawW')),
  },
  { s: '#424c6e', d: '#8e251d', c: '#c64524', b: '#ed7614', a: '#ffa214', w: '#ffc825', W: '#ffffff' },
);

/** A gout of water from a gargoyle's mouth, stretched along its fall. */
export const SPOUT = new Sheet<string>(directional('s', eightComets(11, 2, 6, 'pqrst')), {
  p: '#00396d',
  q: '#0069aa',
  r: '#0098dc',
  s: '#94fdff',
  t: '#ffffff',
});

/** The warden's splinter: a violet sliver, pointed the way it flies. */
function sliver(angle: number): string[] {
  const cells = blank(7, 7);
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 7; x++) {
      const px = x + 0.5 - 3.5;
      const py = y + 0.5 - 3.5;
      const along = px * dx + py * dy;
      const across = Math.abs(-px * dy + py * dx);
      if (Math.abs(along) > 3.4 || across > 1.15 * (1 - Math.abs(along) / 3.6) + 0.2) continue;
      plot(cells, x, y, along > 0.6 ? 'W' : across < 0.5 ? 'a' : 'b');
    }
  }
  return rows(cells);
}

export const SHARD = new Sheet<string>(
  Object.fromEntries(Array.from({ length: 8 }, (_, d) => [`d${d}`, sliver((d * Math.PI) / 4)])),
  { W: '#fdd2ed', a: '#f389f5', b: '#7a09fa' },
);

/** Maskarill's dagger: a silver blade, a gold guard, a violet grip - pointing right, and up and right. */
const KNIFE_E: Grid = ['.y.......', 'pyssssWs.', '.y.......'];
const KNIFE_NE: Grid = ['......W', '.....s.', '....s..', '...s...', 'y.s....', 'py.....', 'y......'];

export const KNIFE = new Sheet<string>(directional('k', eightWays(KNIFE_E, KNIFE_NE)), {
  p: '#93388f',
  y: '#edab50',
  s: '#c7cfdd',
  W: '#ffffff',
});

/* ------------------------------------------------------------------ magma */

const MAGMA_CORNERS = [-4, -2, -2, -4, 3, -3, 4, 1, 2, 4, -3, 3];

function magmaFrames(): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const cells = tumble(9, 9, MAGMA_CORNERS, a, 'dcba');
    // Fire showing through two cracks, turned with the rock.
    const c = Math.cos(a);
    const s = Math.sin(a);
    for (const [x0, y0, x1, y1] of [
      [-2, 0, 2, -1],
      [0, 0, 1, 2],
    ]) {
      for (let k = 0; k <= 4; k++) {
        const t = k / 4;
        const x = x0 + (x1 - x0) * t;
        const y = y0 + (y1 - y0) * t;
        const px = Math.floor(4.5 + x * c - y * s);
        const py = Math.floor(4.5 + x * s + y * c);
        if (cells[py]?.[px] && cells[py][px] !== '.') cells[py][px] = k === 2 ? 'W' : 'f';
      }
    }
    out.push(rows(cells));
  }
  return out;
}

export const MAGMA = new Sheet<string>(
  directional('m', magmaFrames()),
  { d: '#1c121c', c: '#391f21', b: '#5d2c28', a: '#8a4836', f: '#ed7614', W: '#ffc825' },
  { friendly: { d: '#c64524', c: '#ed7614', b: '#ffa214', a: '#ffc825', f: '#ffeb57', W: '#ffffff' } },
);

/* ------------------------------------------------------------------ quake */

/** Ankhor's quake: a crest of broken stone thrown up off the floor, golden with the light in it. */
function quakeFrame(seed: number, height: number): string[] {
  const w = 13;
  const h = 12;
  const cells = blank(w, h);
  const peak = 6 + Math.round(hash2(seed, 3) * 2 - 1);
  for (let x = 0; x < w; x++) {
    const rise = x <= peak ? x / peak : (w - 1 - x) / (w - 1 - peak);
    const top = Math.round(height * Math.pow(rise, 0.85) + (hash2(x, seed) - 0.5) * 2);
    for (let k = 0; k < top; k++) plot(cells, x, h - 1 - k, k > top - 3 ? 'a' : 'b');
  }
  // The light in it: a golden core up the middle.
  for (let k = 0; k < height - 3; k++) {
    plot(cells, peak, h - 1 - k, 'g');
    if (k < height - 6) plot(cells, peak + (k % 2 === 0 ? 1 : -1), h - 1 - k, 'g');
  }
  plot(cells, peak, h - height + 1, 'W');
  // Chips flying off the crest.
  plot(cells, Math.max(0, peak - 4 - (seed % 2)), h - height - 0 + (seed % 3), 'a');
  plot(cells, Math.min(w - 1, peak + 3 + (seed % 2)), h - height + 1 + ((seed + 1) % 2), 'a');
  return rows(cells);
}

export const QUAKE = new Sheet<'q0' | 'q1' | 'q2' | 's0' | 's1'>(
  { q0: quakeFrame(1, 11), q1: quakeFrame(2, 10), q2: quakeFrame(3, 11), s0: quakeFrame(4, 7), s1: quakeFrame(5, 4) },
  { a: '#e69c69', b: '#8a4836', g: '#ffc825', W: '#ffeb57' },
  { dark: { a: '#7a09fa', b: '#3b1443', g: '#db3ffd', W: '#fdd2ed' } },
);

/* ------------------------------------------------------------------- coin */

function coinFrame(rx: number): string[] {
  const cells = blank(7, 7);
  oval(cells, 3.5, 3.5, rx, 3.4, 'r');
  oval(cells, 3.5 - rx * 0.12, 3.4, Math.max(0.4, rx - 0.9), 2.5, 'g');
  if (rx > 1.4) {
    plot(cells, Math.round(3.5 - rx * 0.4), 2, 'h');
    plot(cells, Math.round(3.5 - rx * 0.4), 3, 'h');
  } else {
    plot(cells, 3, 2, 'h');
  }
  return rows(cells);
}

const COIN_FLAT: Grid = ['.......', '.......', '.......', '.rrrrr.', 'rggghgr', '.rrrrr.', '.......'];
const COIN_WINK: Grid = ['...W...', '...h...', 'WhhWhhW', '...h...', '.rrWrr.', 'rggghgr', '.rrrrr.'];

export const COIN = new Sheet<string>(
  {
    c0: coinFrame(3.4),
    c1: coinFrame(2.6),
    c2: coinFrame(1.2),
    c3: flipX(coinFrame(2.6)),
    flat: [...COIN_FLAT],
    wink: [...COIN_WINK],
  },
  { r: '#e07438', g: '#ffc825', h: '#ffeb57', W: '#ffffff' },
  { friendly: { r: '#edab50', g: '#ffeb57', h: '#ffffff' } },
);

/* -------------------------------------------------------------------- web */

function webFrame(turn: number): string[] {
  const cells = blank(11, 11);
  for (let k = 0; k < 4; k++) {
    const a = turn + (k * Math.PI) / 4;
    for (let r = -5; r <= 5; r++) {
      if (Math.abs(r) < 2) continue;
      plot(cells, Math.floor(5.5 + Math.cos(a) * r), Math.floor(5.5 + Math.sin(a) * r), Math.abs(r) > 3 ? 'v' : 'w');
    }
  }
  oval(cells, 5.5, 5.5, 2.2, 2.2, 'w');
  plot(cells, 4, 4, 'W');
  plot(cells, 5, 4, 'W');
  return rows(cells);
}

export const WEB = new Sheet<'w0' | 'w1'>(
  { w0: webFrame(0), w1: webFrame(Math.PI / 8) },
  { W: '#ffffff', w: '#c7cfdd', v: '#92a1b9' },
  { friendly: { w: '#ffffff', v: '#c7cfdd' } },
);
