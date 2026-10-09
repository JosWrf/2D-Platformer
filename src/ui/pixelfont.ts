import { ART, makeCanvas, snap } from '../render/pixel';

/**
 * The game's lettering: two bitmap fonts drawn on the art grid.
 *
 *   body   5×7 capitals, lower case with ascenders and descenders, umlauts
 *          and ß - what anything longer than a word is set in.
 *   small  3×5 capitals and figures, for labels and numbers in the HUD; lower
 *          case is set in capitals.
 *
 * A font pixel is one art pixel at scale 1, two at scale 2 and so on, and the
 * outline round the letters is one art pixel whatever the scale - the same
 * line the actors carry. Nothing is anti-aliased and nothing falls between
 * pixels, so a word in the HUD is drawn by the same hand as the sprites.
 *
 * Every glyph is a list of rows, '#' for a pixel, from the top of the line
 * box: in body, rows 0-6 hold the capitals and ascenders, 2-6 the lower case
 * and 7-8 the descenders; in small, rows 1-5 hold the letters and row 0 the
 * dots of an umlaut. Each colour, scale and outline is drawn into an atlas
 * once, the first time it is asked for, and a word is then one drawImage a
 * letter.
 */

export type FontName = 'body' | 'small';

export interface TextStyle {
  /** The letters' colour. */
  color?: string;
  font?: FontName;
  /** Art pixels per font pixel: 1, 2 or 3. */
  scale?: number;
  align?: 'left' | 'center' | 'right';
  /** A one-art-pixel line round the letters, in this colour. */
  outline?: string | null;
  /** A shadow one font pixel down and to the right, in this colour. */
  shadow?: string | null;
}

interface FontDef {
  /** Rows of the line box. */
  rows: number;
  /** The row the letters stand on (the first row of a descender). */
  baseline: number;
  /** Art pixels from one line's top to the next at scale 1. */
  lineHeight: number;
  /** Empty columns between two letters. */
  gap: number;
  glyphs: Record<string, string>;
  /** Characters this font sets as others: lower case in small, say. */
  fold?: (ch: string) => string;
}

/* Glyphs are written as rows joined by '|'; '.' is empty. */
const BODY_GLYPHS: Record<string, string> = {
  ' ': '..',
  A: '.###.|#...#|#...#|#####|#...#|#...#|#...#',
  B: '####.|#...#|#...#|####.|#...#|#...#|####.',
  C: '.###.|#...#|#....|#....|#....|#...#|.###.',
  D: '####.|#...#|#...#|#...#|#...#|#...#|####.',
  E: '#####|#....|#....|####.|#....|#....|#####',
  F: '#####|#....|#....|####.|#....|#....|#....',
  G: '.###.|#...#|#....|#.###|#...#|#...#|.####',
  H: '#...#|#...#|#...#|#####|#...#|#...#|#...#',
  I: '###|.#.|.#.|.#.|.#.|.#.|###',
  J: '....#|....#|....#|....#|#...#|#...#|.###.',
  K: '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#',
  L: '#....|#....|#....|#....|#....|#....|#####',
  M: '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#',
  N: '#...#|#...#|##..#|#.#.#|#..##|#...#|#...#',
  O: '.###.|#...#|#...#|#...#|#...#|#...#|.###.',
  P: '####.|#...#|#...#|####.|#....|#....|#....',
  Q: '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#',
  R: '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
  S: '.####|#....|#....|.###.|....#|....#|####.',
  T: '#####|..#..|..#..|..#..|..#..|..#..|..#..',
  U: '#...#|#...#|#...#|#...#|#...#|#...#|.###.',
  V: '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..',
  W: '#...#|#...#|#...#|#.#.#|#.#.#|#.#.#|.#.#.',
  X: '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
  Y: '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..',
  Z: '#####|....#|...#.|..#..|.#...|#....|#####',
  Ä: '#...#|.....|.###.|#...#|#####|#...#|#...#',
  Ö: '#...#|.....|.###.|#...#|#...#|#...#|.###.',
  Ü: '#...#|.....|#...#|#...#|#...#|#...#|.###.',
  a: '.....|.....|.###.|....#|.####|#...#|.####',
  b: '#....|#....|####.|#...#|#...#|#...#|####.',
  c: '....|....|.###|#...|#...|#...|.###',
  d: '....#|....#|.####|#...#|#...#|#...#|.####',
  e: '.....|.....|.###.|#...#|#####|#....|.###.',
  f: '..##|.#..|####|.#..|.#..|.#..|.#..',
  g: '.....|.....|.####|#...#|#...#|#...#|.####|....#|.###.',
  h: '#....|#....|####.|#...#|#...#|#...#|#...#',
  i: '#|.|#|#|#|#|#',
  j: '..#|...|..#|..#|..#|..#|..#|#.#|.#.',
  k: '#...|#...|#..#|#.#.|##..|#.#.|#..#',
  l: '#.|#.|#.|#.|#.|#.|.#',
  m: '.....|.....|####.|#.#.#|#.#.#|#.#.#|#.#.#',
  n: '.....|.....|####.|#...#|#...#|#...#|#...#',
  o: '.....|.....|.###.|#...#|#...#|#...#|.###.',
  p: '.....|.....|####.|#...#|#...#|#...#|####.|#....|#....',
  q: '.....|.....|.####|#...#|#...#|#...#|.####|....#|....#',
  r: '....|....|#.##|##..|#...|#...|#...',
  s: '....|....|.###|#...|.##.|...#|###.',
  t: '.#..|.#..|####|.#..|.#..|.#..|..##',
  u: '.....|.....|#...#|#...#|#...#|#...#|.####',
  v: '.....|.....|#...#|#...#|#...#|.#.#.|..#..',
  w: '.....|.....|#...#|#...#|#.#.#|#.#.#|.#.#.',
  x: '.....|.....|#...#|.#.#.|..#..|.#.#.|#...#',
  y: '.....|.....|#...#|#...#|#...#|#...#|.####|....#|.###.',
  z: '.....|.....|#####|...#.|..#..|.#...|#####',
  ä: '.#.#.|.....|.###.|....#|.####|#...#|.####',
  ö: '.#.#.|.....|.###.|#...#|#...#|#...#|.###.',
  ü: '.#.#.|.....|#...#|#...#|#...#|#...#|.####',
  ß: '.##..|#..#.|#..#.|#.##.|#...#|#...#|#.##.',
  0: '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.',
  1: '..#..|.##..|..#..|..#..|..#..|..#..|.###.',
  2: '.###.|#...#|....#|...#.|..#..|.#...|#####',
  3: '####.|....#|....#|.###.|....#|....#|####.',
  4: '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.',
  5: '#####|#....|####.|....#|....#|#...#|.###.',
  6: '..##.|.#...|#....|####.|#...#|#...#|.###.',
  7: '#####|....#|...#.|..#..|.#...|.#...|.#...',
  8: '.###.|#...#|#...#|.###.|#...#|#...#|.###.',
  9: '.###.|#...#|#...#|.####|....#|...#.|.##..',
  '.': '.|.|.|.|.|.|#',
  ',': '..|..|..|..|..|..|.#|#.',
  ':': '.|.|#|.|.|.|#',
  ';': '..|..|.#|..|..|..|.#|#.',
  '!': '#|#|#|#|#|.|#',
  '?': '.###.|#...#|....#|...#.|..#..|.....|..#..',
  "'": '#|#',
  '"': '#.#|#.#',
  '-': '...|...|...|...|###',
  '+': '.....|.....|..#..|..#..|#####|..#..|..#..',
  '=': '....|....|....|####|....|####',
  '/': '....#|....#|...#.|..#..|.#...|#....|#....',
  '(': '..#|.#.|#..|#..|#..|.#.|..#',
  ')': '#..|.#.|..#|..#|..#|.#.|#..',
  '[': '###|#..|#..|#..|#..|#..|###',
  ']': '###|..#|..#|..#|..#|..#|###',
  '%': '##..#|##..#|...#.|..#..|.#...|#..##|#..##',
  '#': '.#.#.|.#.#.|#####|.#.#.|#####|.#.#.|.#.#.',
  '*': '.....|#.#.#|.###.|#####|.###.|#.#.#',
  '_': '.....|.....|.....|.....|.....|.....|.....|#####',
  '<': '...#|..#.|.#..|#...|.#..|..#.|...#',
  '>': '#...|.#..|..#.|...#|..#.|.#..|#...',
  '|': '#|#|#|#|#|#|#|#',
  '@': '.###.|#...#|#.###|#.#.#|#.###|#....|.###.',
  '&': '.##..|#..#.|#.#..|.#...|#.#.#|#..#.|.##.#',
  '^': '.#.|#.#',
  '$': '..#..|.####|#.#..|.###.|..#.#|####.|..#..',
  '·': '.|.|.|.|#',
  '—': '......|......|......|......|######',
  '…': '.....|.....|.....|.....|.....|.....|#.#.#',
  '×': '.....|.....|#...#|.#.#.|..#..|.#.#.|#...#',
  '◀': '...#|..##|.###|####|.###|..##|...#',
  '▶': '#...|##..|###.|####|###.|##..|#...',
  '←': '.....|.....|..#..|.#...|#####|.#...|..#..',
  '→': '.....|.....|..#..|...#.|#####|...#.|..#..',
  '↓': '..#..|..#..|..#..|..#..|#.#.#|.###.|..#..',
  '↑': '..#..|.###.|#.#.#|..#..|..#..|..#..|..#..',
  '♥': '.#.#.|#####|#####|.###.|..#..',
  '°': '.#.|#.#|.#.',
};

const SMALL_GLYPHS: Record<string, string> = {
  ' ': '..',
  A: '...|.#.|#.#|###|#.#|#.#',
  B: '...|##.|#.#|##.|#.#|##.',
  C: '...|.##|#..|#..|#..|.##',
  D: '...|##.|#.#|#.#|#.#|##.',
  E: '...|###|#..|##.|#..|###',
  F: '...|###|#..|##.|#..|#..',
  G: '....|.###|#...|#.##|#..#|.##.',
  H: '...|#.#|#.#|###|#.#|#.#',
  I: '...|###|.#.|.#.|.#.|###',
  J: '...|..#|..#|..#|#.#|.#.',
  K: '...|#.#|#.#|##.|#.#|#.#',
  L: '...|#..|#..|#..|#..|###',
  M: '.....|#...#|##.##|#.#.#|#...#|#...#',
  N: '....|#..#|##.#|#.##|#..#|#..#',
  O: '...|.#.|#.#|#.#|#.#|.#.',
  P: '...|##.|#.#|##.|#..|#..',
  Q: '....|.#..|#.#.|#.#.|#.#.|.#.#',
  R: '...|##.|#.#|##.|#.#|#.#',
  S: '...|.##|#..|.#.|..#|##.',
  T: '...|###|.#.|.#.|.#.|.#.',
  U: '...|#.#|#.#|#.#|#.#|###',
  V: '...|#.#|#.#|#.#|#.#|.#.',
  W: '.....|#...#|#...#|#.#.#|##.##|#...#',
  X: '...|#.#|#.#|.#.|#.#|#.#',
  Y: '...|#.#|#.#|.#.|.#.|.#.',
  Z: '...|###|..#|.#.|#..|###',
  Ä: '#.#|.#.|#.#|###|#.#|#.#',
  Ö: '#.#|.#.|#.#|#.#|#.#|.#.',
  Ü: '#.#|...|#.#|#.#|#.#|###',
  0: '...|###|#.#|#.#|#.#|###',
  1: '...|.#.|##.|.#.|.#.|###',
  2: '...|##.|..#|.#.|#..|###',
  3: '...|##.|..#|.#.|..#|##.',
  4: '...|#.#|#.#|###|..#|..#',
  5: '...|###|#..|##.|..#|##.',
  6: '...|.##|#..|###|#.#|###',
  7: '...|###|..#|.#.|.#.|.#.',
  8: '...|###|#.#|###|#.#|###',
  9: '...|###|#.#|###|..#|##.',
  '.': '.|.|.|.|.|#',
  ',': '..|..|..|..|..|.#|#.',
  ':': '.|.|#|.|#|.',
  '!': '.|#|#|#|.|#',
  '?': '...|##.|..#|.#.|...|.#.',
  "'": '.|#|#',
  '-': '..|..|..|##',
  '+': '...|...|.#.|###|.#.',
  '/': '...|..#|..#|.#.|#..|#..',
  '(': '..|.#|#.|#.|#.|.#',
  ')': '..|#.|.#|.#|.#|#.',
  '%': '...|#.#|..#|.#.|#..|#.#',
  '·': '.|.|.|#',
  '—': '....|....|....|####',
  '×': '...|...|#.#|.#.|#.#',
  '◀': '...|..#|.##|###|.##|..#',
  '▶': '...|#..|##.|###|##.|#..',
  '←': '...|...|.#.|###|.#.',
  '→': '...|...|.#.|###|.#.',
  '♥': '.....|.#.#.|#####|.###.|..#..',
};

const FONTS: Record<FontName, FontDef> = {
  body: { rows: 9, baseline: 7, lineHeight: 11, gap: 1, glyphs: BODY_GLYPHS },
  small: {
    rows: 7,
    baseline: 6,
    lineHeight: 8,
    gap: 1,
    glyphs: SMALL_GLYPHS,
    fold: (ch) => (ch === 'ß' ? 'SS' : ch === 'ẞ' ? 'SS' : ch.toUpperCase()),
  },
};

/** Characters set as others in every font: typographer's quotes and the like. */
const ALIASES: Record<string, string> = {
  '’': "'",
  '‘': "'",
  '„': '"',
  '“': '"',
  '”': '"',
  '–': '-',
  '‑': '-',
};

/* ------------------------------------------------------------- glyphs */

interface Glyph {
  w: number;
  rows: string[];
}

const parsed = new Map<FontName, Map<string, Glyph>>();

function glyphsOf(name: FontName): Map<string, Glyph> {
  let map = parsed.get(name);
  if (map) return map;
  map = new Map();
  for (const [ch, src] of Object.entries(FONTS[name].glyphs)) {
    const rows = src.split('|');
    map.set(ch, { w: Math.max(...rows.map((r) => r.length)), rows });
  }
  parsed.set(name, map);
  return map;
}

/** The text as the font will set it: folded, aliased, unknown letters as '?'. */
function setText(text: string, name: FontName): string {
  const font = FONTS[name];
  const glyphs = glyphsOf(name);
  let out = '';
  for (const raw of text) {
    let ch = ALIASES[raw] ?? raw;
    if (font.fold) ch = font.fold(ch);
    for (const c of ch) out += glyphs.has(c) ? c : glyphs.has(c.toUpperCase()) ? c.toUpperCase() : '?';
  }
  return out;
}

/* ------------------------------------------------------------- atlases */

interface Atlas {
  canvas: HTMLCanvasElement;
  /** Where each glyph's cell starts, in atlas pixels. */
  at: Map<string, number>;
  /** Pixels of padding round each glyph: room for the outline. */
  pad: number;
}

const atlases = new Map<string, Atlas>();

/**
 * Every glyph of a font at a scale in one colour, side by side - or, for an
 * outline, the glyphs grown by one art pixel each way, so that drawing the
 * outline atlas and then the letters on top leaves the line round them.
 */
function atlasOf(name: FontName, scale: number, color: string, outline: boolean): Atlas {
  const key = `${name}|${scale}|${color}|${outline ? 'o' : 'f'}`;
  const cached = atlases.get(key);
  if (cached) return cached;
  const font = FONTS[name];
  const glyphs = glyphsOf(name);
  const pad = 1;
  const at = new Map<string, number>();
  let width = 0;
  for (const [ch, g] of glyphs) {
    at.set(ch, width);
    width += g.w * scale + pad * 2;
  }
  const height = font.rows * scale + pad * 2;
  const { canvas, ctx } = makeCanvas(width, height);
  ctx.fillStyle = color;
  for (const [ch, g] of glyphs) {
    const x0 = (at.get(ch) as number) + pad;
    for (let r = 0; r < g.rows.length; r++) {
      const row = g.rows[r];
      for (let c = 0; c < row.length; c++) {
        if (row[c] !== '#') continue;
        if (outline) {
          // The pixel grown by one each way, as a plus: the corners stay open.
          ctx.fillRect(x0 + c * scale - 1, pad + r * scale, scale + 2, scale);
          ctx.fillRect(x0 + c * scale, pad + r * scale - 1, scale, scale + 2);
        } else {
          ctx.fillRect(x0 + c * scale, pad + r * scale, scale, scale);
        }
      }
    }
  }
  const atlas = { canvas, at, pad };
  atlases.set(key, atlas);
  return atlas;
}

/* ------------------------------------------------------------- measure */

function scaleOf(style: TextStyle): number {
  return Math.max(1, Math.round(style.scale ?? 1));
}

/** The width of a line of text in art pixels. */
function artWidth(text: string, name: FontName, scale: number): number {
  const glyphs = glyphsOf(name);
  const gap = FONTS[name].gap;
  let w = 0;
  let n = 0;
  for (const ch of text) {
    w += (glyphs.get(ch) as Glyph).w;
    n++;
  }
  return (w + Math.max(0, n - 1) * gap) * scale;
}

/** How wide the text is drawn, in logical pixels. */
export function measureText(text: string, style: TextStyle = {}): number {
  const name = style.font ?? 'body';
  return artWidth(setText(text, name), name, scaleOf(style)) * ART;
}

/** From one line's top to the next, in logical pixels. */
export function lineHeight(style: TextStyle = {}): number {
  return FONTS[style.font ?? 'body'].lineHeight * scaleOf(style) * ART;
}

/** How far below the top of a line its letters stand, in logical pixels. */
export function baselineOf(style: TextStyle = {}): number {
  return FONTS[style.font ?? 'body'].baseline * scaleOf(style) * ART;
}

/** Height of a capital letter, in logical pixels. */
export function capHeight(style: TextStyle = {}): number {
  const name = style.font ?? 'body';
  return (name === 'body' ? 7 : 5) * scaleOf(style) * ART;
}

/** The text broken into lines no wider than maxWidth (logical pixels), at the spaces. */
export function wrapText(text: string, maxWidth: number, style: TextStyle = {}): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (line && measureText(next, style) > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** The text cut short with an ellipsis so that it fits maxWidth (logical pixels). */
export function fitText(text: string, maxWidth: number, style: TextStyle = {}): string {
  if (measureText(text, style) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && measureText(`${t}…`, style) > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/* ------------------------------------------------------------- draw */

function drawRun(
  ctx: CanvasRenderingContext2D,
  text: string,
  name: FontName,
  scale: number,
  atlas: Atlas,
  x: number,
  y: number,
): void {
  const glyphs = glyphsOf(name);
  const gap = FONTS[name].gap;
  const rows = FONTS[name].rows;
  const pad = atlas.pad;
  let cx = x;
  for (const ch of text) {
    const g = glyphs.get(ch) as Glyph;
    const sx = atlas.at.get(ch) as number;
    const sw = g.w * scale + pad * 2;
    const sh = rows * scale + pad * 2;
    ctx.drawImage(atlas.canvas, sx, 0, sw, sh, cx - pad * ART, y - pad * ART, sw * ART, sh * ART);
    cx += (g.w + gap) * scale * ART;
  }
}

/**
 * Draws a line of text with the top of its line box at y (logical pixels) -
 * capitals start there in small text, ascenders and capitals in body text -
 * and x its left edge, centre or right edge as `align` says. Returns its
 * width in logical pixels.
 */
export function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, style: TextStyle = {}): number {
  const name = style.font ?? 'body';
  const scale = scaleOf(style);
  const set = setText(text, name);
  const width = artWidth(set, name, scale) * ART;
  const align = style.align ?? 'left';
  const left = snap(align === 'center' ? x - width / 2 : align === 'right' ? x - width : x);
  const top = snap(y);
  const smoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  if (style.outline) drawRun(ctx, set, name, scale, atlasOf(name, scale, style.outline, true), left, top);
  if (style.shadow) {
    drawRun(ctx, set, name, scale, atlasOf(name, scale, style.shadow, false), left + scale * ART, top + scale * ART);
  }
  drawRun(ctx, set, name, scale, atlasOf(name, scale, style.color ?? '#f9e6cf', false), left, top);
  ctx.imageSmoothingEnabled = smoothing;
  return width;
}

/** Draws text broken into lines no wider than maxWidth; returns the number of lines. */
export function drawWrapped(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  style: TextStyle = {},
): number {
  const lines = wrapText(text, maxWidth, style);
  const lh = lineHeight(style);
  lines.forEach((line, i) => drawText(ctx, line, x, y + i * lh, style));
  return lines.length;
}
