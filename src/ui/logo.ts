import { makeCanvas } from '../render/pixel';
import { UI } from './kit';

/**
 * The title's logotype: SHADOWBLADE in hand-cut block letters.
 *
 * The letters are drawn below as masks of 10×13 cells (the W is 12 wide) and
 * doubled, so each stroke is six pixels thick - but everything that is drawn
 * onto them is drawn at one pixel: the bevel of light along the top and left
 * of every stroke, its shade along the bottom and right, the bands of the
 * steel, the ink line round it all. A logo blown up from a small one would
 * have two-pixel highlights and read as a different hand from the rest.
 *
 * The face is steel above a dark horizon line and the blade's cold blue
 * below it - the chrome of a sixteen-bit title, in the hero's colours - and
 * the word rests on a sword drawn under it, hilt to point.
 */

const LETTERS: Record<string, string[]> = {
  S: [
    '.#########',
    '##########',
    '##########',
    '###.......',
    '###.......',
    '##########',
    '##########',
    '##########',
    '.......###',
    '.......###',
    '##########',
    '##########',
    '#########.',
  ],
  H: [
    '###....###',
    '###....###',
    '###....###',
    '###....###',
    '###....###',
    '##########',
    '##########',
    '##########',
    '###....###',
    '###....###',
    '###....###',
    '###....###',
    '###....###',
  ],
  A: [
    '..######..',
    '.########.',
    '####..####',
    '###....###',
    '###....###',
    '##########',
    '##########',
    '##########',
    '###....###',
    '###....###',
    '###....###',
    '###....###',
    '###....###',
  ],
  D: [
    '########..',
    '#########.',
    '##########',
    '###....###',
    '###....###',
    '###....###',
    '###....###',
    '###....###',
    '###....###',
    '###....###',
    '##########',
    '#########.',
    '########..',
  ],
  O: [
    '..######..',
    '.########.',
    '##########',
    '###....###',
    '###....###',
    '###....###',
    '###....###',
    '###....###',
    '###....###',
    '###....###',
    '##########',
    '.########.',
    '..######..',
  ],
  W: [
    '###......###',
    '###......###',
    '###......###',
    '###......###',
    '###..##..###',
    '###..##..###',
    '###..##..###',
    '###..##..###',
    '###..##..###',
    '###.####.###',
    '############',
    '.####..####.',
    '..##....##..',
  ],
  B: [
    '#########.',
    '##########',
    '##########',
    '###....###',
    '###....###',
    '#########.',
    '#########.',
    '##########',
    '###....###',
    '###....###',
    '##########',
    '##########',
    '#########.',
  ],
  L: [
    '###.......',
    '###.......',
    '###.......',
    '###.......',
    '###.......',
    '###.......',
    '###.......',
    '###.......',
    '###.......',
    '###.......',
    '##########',
    '##########',
    '##########',
  ],
  E: [
    '##########',
    '##########',
    '##########',
    '###.......',
    '###.......',
    '########..',
    '########..',
    '########..',
    '###.......',
    '###.......',
    '##########',
    '##########',
    '##########',
  ],
};

/** The face from top to bottom, a colour per row of the doubled letters (26). */
const FACE = [
  '#c7cfdd', '#c7cfdd', '#c7cfdd', '#c7cfdd', '#c7cfdd',
  '#92a1b9', '#92a1b9', '#92a1b9', '#92a1b9',
  '#657392', '#657392', '#657392',
  '#424c6e',
  // The horizon: a hard dark line, then the blue of the blade under it.
  '#1a1932',
  '#94fdff', '#0cf1ff',
  '#00cdf9', '#00cdf9', '#00cdf9',
  '#0098dc', '#0098dc', '#0098dc',
  '#0069aa', '#0069aa', '#0069aa',
  '#00396d',
];

/** Lighter and darker neighbours on the face's ramps, for the bevel. */
const LIGHTER: Record<string, string> = {
  '#c7cfdd': '#ffffff',
  '#92a1b9': '#c7cfdd',
  '#657392': '#92a1b9',
  '#424c6e': '#657392',
  '#1a1932': '#424c6e',
  '#94fdff': '#ffffff',
  '#0cf1ff': '#94fdff',
  '#00cdf9': '#0cf1ff',
  '#0098dc': '#00cdf9',
  '#0069aa': '#0098dc',
  '#00396d': '#0069aa',
};
const DARKER: Record<string, string> = {
  '#c7cfdd': '#92a1b9',
  '#92a1b9': '#657392',
  '#657392': '#424c6e',
  '#424c6e': '#2a2f4e',
  '#1a1932': '#0e071b',
  '#94fdff': '#0cf1ff',
  '#0cf1ff': '#00cdf9',
  '#00cdf9': '#0098dc',
  '#0098dc': '#0069aa',
  '#0069aa': '#00396d',
  '#00396d': '#03193f',
};

/*
 * The sword the word is set on: the hilt in gold with a stone of the blade's
 * cyan in its pommel, a leather grip, and a blade of steel - its edge lit,
 * its spine dark - that runs behind the letters and comes out past the E as
 * a point.
 */
const SWORD_KEY: Record<string, string> = {
  o: UI.ink,
  Y: '#ffeb57',
  G: '#ffc825',
  g: '#ffa214',
  d: '#ed7614',
  c: '#0cf1ff',
  C: '#0098dc',
  b: '#8a4836',
  B: '#5d2c28',
  w: '#ffffff',
  l: '#c7cfdd',
  m: '#92a1b9',
  s: '#424c6e',
};

/* Pommel (columns 0-4), grip (5-9), guard (10-14), the root of the blade (15-20). */
const HILT = [
  '...........ooo.......',
  '..........oYGGo......',
  '..........oGGgo......',
  '..........oGggo......',
  '.ooo......oGgdo......',
  'oYGgoooooooGgdooooooo',
  'oGcdoBbBBboGgdowwwwww',
  'oGCdoBBbBBoGgdollllll',
  'oggdobBBbBoGgdommmmmm',
  '.ooo.ooooooGgdossssss',
  '..........oGgdooooooo',
  '..........oggdo......',
  '..........oggdo......',
  '..........odddo......',
  '...........ooo.......',
];
const HILT_W = 21;

/** One column of blade, from the ink of its top edge to the ink under its spine. */
const BLADE = ['o', 'w', 'l', 'm', 's', 'o'];

const TIP = ['oo....', 'wwoo..', 'llllo.', 'mmmmlo', 'sssoo.', 'ooo...'];
const TIP_W = 6;

/** The blade's top row, under the doubled letters (26 rows) and their shadow. */
const BLADE_Y = 31;

const WORD = 'SHADOWBLADE';
/** Cells between two letters, before doubling. */
const GAP = 2;

let made: HTMLCanvasElement | null = null;
let wordCentre = 0;

/**
 * Where the middle of the word is in the logotype's canvas, in pixels from
 * its left edge: the hilt sticks out to the left, so the word is what gets
 * centred on the screen, not the canvas.
 */
export function logoCentre(): number {
  logo();
  return wordCentre;
}

/** The logotype, made the first time it is asked for. */
export function logo(): HTMLCanvasElement {
  if (made) return made;
  // The doubled mask of the whole word.
  const cells = WORD.split('').map((ch) => LETTERS[ch]);
  const maskW = cells.reduce((w, l) => w + l[0].length, 0) + GAP * (cells.length - 1);
  const w = maskW * 2;
  const h = 13 * 2;
  const solid = new Uint8Array(w * h);
  let cx = 0;
  for (const letter of cells) {
    letter.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] !== '#') continue;
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) solid[(y * 2 + dy) * w + (cx + x) * 2 + dx] = 1;
      }
    });
    cx += letter[0].length + GAP;
  }
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && solid[y * w + x] === 1;

  // Room round it for the ink line (1), the shadow (2 down, 2 right) and its
  // line, and either side for the sword's hilt and its point.
  const pad = 1;
  const drop = 2;
  const { canvas, ctx } = makeCanvas(w + pad * 2 + drop + 1 + HILT_W + TIP_W, BLADE_Y + 10 + pad);
  const put = (x: number, y: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(x + pad + HILT_W, y + pad, 1, 1);
  };
  const sprite = (rows: readonly string[], ox: number, oy: number) => {
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const c = SWORD_KEY[row[x]];
        if (c) put(ox + x, oy + y, c);
      }
    });
  };
  // The sword under the word: the hilt before the S, the blade along the
  // whole word, the point past the E.
  sprite(HILT, -HILT_W, BLADE_Y - 5);
  for (let x = 0; x < w + 2; x++) sprite(BLADE, x, BLADE_Y);
  sprite(TIP, w + 2, BLADE_Y);
  const ringOf = (ox: number, oy: number, color: string) => {
    for (let y = -1; y <= h; y++) {
      for (let x = -1; x <= w; x++) {
        const sx = x - ox;
        const sy = y - oy;
        if (at(sx, sy)) continue;
        if (at(sx - 1, sy) || at(sx + 1, sy) || at(sx, sy - 1) || at(sx, sy + 1)) put(x, y, color);
      }
    }
  };
  // The shadow: the word again, two pixels down and right, in the night's
  // violet black, with the ink line round it too.
  ringOf(drop, drop, UI.ink);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (at(x, y)) put(x + drop, y + drop, '#1a1932');
  // The ink line round the word itself.
  ringOf(0, 0, UI.ink);
  // The face, row by row, with a pixel of bevel on every edge of every stroke.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!at(x, y)) continue;
      const face = FACE[y];
      let c = face;
      if (!at(x, y - 1) || !at(x - 1, y)) c = LIGHTER[face] ?? face;
      else if (!at(x, y + 1) || !at(x + 1, y)) c = DARKER[face] ?? face;
      put(x, y, c);
    }
  }
  made = canvas;
  wordCentre = pad + HILT_W + w / 2;
  return canvas;
}
