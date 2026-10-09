import { Sheet, blank, flame, moon, oval, plot, rows, smear, type Grid } from '../render/sheet';

/**
 * The art of the attacks the bosses leave the hero (skills.ts): pillars of
 * fire and water drawn as flames at a handful of heights, a sickle of
 * moonlight turned in eight drawn frames, a brass bob, the jester's double,
 * Nyktos' wisps, Grauwacht's statue. Everything a cast draws is one of these
 * or a hard shape on whole art pixels.
 */

/* --------------------------------------------------- pillars and crests */

/** Heights, in art pixels, a rising pillar is drawn at - the nearest one below its height is used. */
export const PILLAR_STEPS = [6, 12, 18, 26, 34, 41, 50, 59] as const;

function pillars(width: number, tones: string, spread: number, seeds: number): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const h of PILLAR_STEPS) {
    for (let s = 0; s < seeds; s++) out[`${h}-${s}`] = flame(width, h, h * 13 + s * 101, tones, spread);
  }
  return out;
}

/** Ignivor's fire, up out of the floor. */
export const FIRE_PILLAR = new Sheet<string>(pillars(17, '123456', 0.32, 3), {
  '1': '#c64524',
  '2': '#ed7614',
  '3': '#ffa214',
  '4': '#ffc825',
  '5': '#ffeb57',
  '6': '#ffffff',
});

/** Thalassa's springtide: the same rise, as water - a smoother crest, white at the heart. */
export const WATER_PILLAR = new Sheet<string>(pillars(15, '12345', 0.18, 2), {
  '1': '#00396d',
  '2': '#0069aa',
  '3': '#0098dc',
  '4': '#94fdff',
  '5': '#ffffff',
});

/** Morvain's wave of shadow: a crest of dark with violet burning in it. */
export const SHADOW_CREST = new Sheet<string>(
  Object.fromEntries(Array.from({ length: 4 }, (_, i) => [`c${i}`, flame(14, 17, 300 + i * 17, 'abcde', 0.3)])),
  { a: '#3b1443', b: '#3003d9', c: '#7a09fa', d: '#db3ffd', e: '#fdd2ed' },
);

/* ----------------------------------------------------------- the sickle */

/** Luna's sickle at eight turns: a moon whose bite turns round it. */
export const SICKLE = new Sheet<string>(
  Object.fromEntries(
    Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2;
      return [`m${i}`, moon(13, 13, 6.5, 6.5, 6.2, 6.5 - Math.cos(a) * 3.4, 6.5 - Math.sin(a) * 3.4, 5.6, 'W', 'a', 'b')];
    }),
  ),
  { W: '#ffffff', a: '#c7cfdd', b: '#92a1b9' },
);

/* --------------------------------------------------------- the pendulum */

function bob(r: number): string[] {
  const size = r * 2 + 1;
  const cells = blank(size, size);
  oval(cells, r + 0.5, r + 0.5, r + 0.4, r + 0.4, 'b');
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (cells[y][x] !== 'b') continue;
      const nx = (x - r) / (r + 0.4);
      const ny = (y - r) / (r + 0.4);
      const light = -0.6 * nx - 0.8 * ny;
      cells[y][x] = light > 0.55 ? 'h' : light > 0.05 ? 'a' : light > -0.5 ? 'b' : 'c';
    }
  }
  plot(cells, r - Math.round(r * 0.45), r - Math.round(r * 0.5), 'w');
  // A rim, and the shaft's fitting on top.
  plot(cells, r, 0, 'c');
  return rows(cells);
}

export const PENDULUM = new Sheet<'bob' | 'pivot'>(
  { bob: bob(8), pivot: bob(2) },
  { w: '#ffffff', h: '#ffeb57', a: '#edab50', b: '#e07438', c: '#8a4836' },
);

/* ------------------------------------------------------------ the double */

/**
 * Maskarill's double of the hero: a violet figure the hero's size, hood and
 * cloak and a blade, running - and cutting, with the smear of the cut drawn
 * into the frame.
 */
const PHANTOM_RUN: Grid = [
  '.....qq........',
  '....qppp.......',
  '...qpppp.......',
  '...ppWpW.......',
  '...pppppp......',
  '....pppp.......',
  '..qppppppp.....',
  '.qpppppppps....',
  '.qp.pppppp.s...',
  '.q..pppppp..s..',
  '....ppppp....s.',
  '....pp.ppp.....',
  '...pp...pp.....',
  '...pp....pp....',
  '..pp.....pp....',
  '..pp......pp...',
  '.qp........q...',
];

function phantomCut(): string[] {
  const cells = blank(19, 17);
  PHANTOM_RUN.forEach((row, y) => [...row].forEach((c, x) => c !== '.' && c !== 's' && plot(cells, x, y, c)));
  // The arm out straight and the blade's smear sweeping down in front.
  for (let x = 9; x <= 11; x++) plot(cells, x, 7, 'p');
  smear(cells, 9.5, 8.5, 6.5, -1.6, 0.9, 2.6, 'W', 's');
  return rows(cells);
}

export const PHANTOM = new Sheet<'run' | 'cut'>(
  { run: [...PHANTOM_RUN], cut: phantomCut() },
  { p: '#ca52c9', q: '#93388f', W: '#ffffff', s: '#fdd2ed' },
);

/* -------------------------------------------------------------- a wisp */

export const WISP = new Sheet<'w0' | 'w1'>(
  {
    w0: ['..y..', '.yWy.', 'yWWWy', '.yWy.', '..y..'],
    w1: ['.....', '.yWy.', '.WWW.', '.yWy.', '.....'],
  },
  { W: '#ffffff', y: '#ffeb57' },
);

/* -------------------------------------------------------- a crystal */

export const CRYSTAL = new Sheet<'c'>(
  {
    c: ['..W..', '.aWb.', '.aWb.', 'aaWbb', 'aaWbb', 'aaWbb', 'aWWbb', '.aWb.', '.aWb.', '..b..', '..b..'],
  },
  { W: '#ffffff', a: '#94fdff', b: '#00cdf9' },
);

/* -------------------------------------------------------- the statue */

/** Grauwacht's gargoyle coming down: crouched, wings folded, head down. */
export const STATUE = new Sheet<'s'>(
  {
    s: [
      '.a.......a..',
      '.aa.....aa..',
      '.abb...bba..',
      '.abbbbbbba..',
      'aabbcbbcbbb.',
      'abbbkbbkbbbc',
      'abbbbbbbbbbc',
      '.abbbccbbbc.',
      '.abbbbbbbbc.',
      'aabbbbbbbbcc',
      'abbbbbbbbbbc',
      'abbcbbbbcbbc',
      'abbbbbbbbbbc',
      '.abbbbbbbbc.',
      '.aab....bcc.',
      'aabb....bbcc',
    ],
  },
  { a: '#c7cfdd', b: '#92a1b9', c: '#657392', k: '#1a1932' },
);

/* -------------------------------------------------- the hydra's fires */

/** The five heads' colours, nearest the palette has to what they always were. */
export const CROWN_FIRE = ['#99e65f', '#ffa214', '#e69c69', '#94fdff', '#ffeb57'] as const;

export const CROWN_SHOT = new Sheet<'f'>({ f: ['.aa.', 'aWWa', 'aWWa', '.aa.'] }, { W: '#ffffff', a: '#ffa214' }, Object.fromEntries(
  CROWN_FIRE.map((c, i) => [`h${i}`, { a: c }]),
));
