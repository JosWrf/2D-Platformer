import { ART, makeCanvas, snap } from '../render/pixel';
import { type Grid } from '../render/sheet';

/**
 * Tools for building the bosses' frames out of hand-placed parts, the way a
 * pixel artist puppets a big sprite: a part laid over another at whole-pixel
 * offsets, a few pixels changed for an expression, a column shear for a head
 * that lowers, a limb laid down along two angles, a pose turned with
 * RotSprite. All of it runs once, when a sheet is made, on rows of
 * characters - the result is a frame like any hand-drawn one, every pixel
 * whole, and drawn from then on as a blit.
 */

/** A frame as an array of rows of single characters, to change in place. */
export type Cells = string[][];

export function cellsOf(g: Grid, w = 0, h = 0): Cells {
  const width = Math.max(w, ...g.map((r) => r.length));
  const height = Math.max(h, g.length);
  const out: Cells = [];
  for (let y = 0; y < height; y++) {
    const row = g[y] ?? '';
    const cells: string[] = [];
    for (let x = 0; x < width; x++) {
      const c = row[x];
      cells.push(c === undefined || c === ' ' ? '.' : c);
    }
    out.push(cells);
  }
  return out;
}

export function rowsOf(c: Cells): string[] {
  return c.map((r) => r.join(''));
}

/** Pixels changed by hand: [x, y, letter], '.' clears. */
export function edit(g: Grid, changes: readonly (readonly [number, number, string])[]): string[] {
  const c = cellsOf(g);
  for (const [x, y, letter] of changes) if (c[y] && x >= 0 && x < c[y].length) c[y][x] = letter;
  return rowsOf(c);
}

/** g padded with empty cells: `l` columns left, `t` rows on top, to at least w × h. */
export function pad(g: Grid, l: number, t: number, w: number, h: number): string[] {
  const c = cellsOf([], w, h);
  for (let y = 0; y < g.length; y++) {
    for (let x = 0; x < g[y].length; x++) {
      const ch = g[y][x];
      if (ch !== '.' && ch !== ' ' && c[y + t] && x + l < w) c[y + t][x + l] = ch;
    }
  }
  return rowsOf(c);
}

/**
 * Every column moved down by round((x - pivot) * k) rows - a head lowering, a
 * body pitching forward: the front drops and the back stays, each column whole.
 * The frame grows by `room` rows above and below; the result's row `room` is
 * where row 0 was at the pivot.
 */
export function shear(g: Grid, k: number, pivot: number, room: number): string[] {
  const src = cellsOf(g);
  const w = src[0]?.length ?? 0;
  const out = cellsOf([], w, src.length + room * 2);
  for (let x = 0; x < w; x++) {
    const dy = Math.round((x - pivot) * k);
    for (let y = 0; y < src.length; y++) {
      const ch = src[y][x];
      const ty = y + room + dy;
      if (ch !== '.' && out[ty]) out[ty][x] = ch;
    }
  }
  return rowsOf(out);
}

/** Scale2x (EPX) on a frame of letters. */
function scale2x(c: Cells): Cells {
  const h = c.length;
  const w = c[0]?.length ?? 0;
  const at = (x: number, y: number): string => (y >= 0 && y < h && x >= 0 && x < w ? c[y][x] : '.');
  const out: Cells = [];
  for (let y = 0; y < h * 2; y++) out.push(new Array<string>(w * 2).fill('.'));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = c[y][x];
      const a = at(x, y - 1);
      const b = at(x + 1, y);
      const l = at(x - 1, y);
      const d = at(x, y + 1);
      out[y * 2][x * 2] = l === a && l !== d && a !== b ? a : p;
      out[y * 2][x * 2 + 1] = a === b && a !== l && b !== d ? b : p;
      out[y * 2 + 1][x * 2] = d === l && d !== b && l !== a ? l : p;
      out[y * 2 + 1][x * 2 + 1] = b === d && b !== a && d !== l ? d : p;
    }
  }
  return out;
}

/**
 * A frame turned by `deg` degrees (clockwise on screen) about its point
 * (px, py), RotSprite's way: blown up eight times with Scale2x, which keeps
 * every edge a clean stair, turned there, and brought back down by sampling
 * the middle of each block - a turned pose with the stairs a pixel artist
 * would have placed, not a smear. The result is out w × out h with the pivot
 * at (px + ox, py + oy).
 */
export function rotSprite(g: Grid, deg: number, px: number, py: number, outW: number, outH: number, ox = 0, oy = 0): string[] {
  let big = cellsOf(g);
  for (let i = 0; i < 3; i++) big = scale2x(big);
  const S = 8;
  const h8 = big.length;
  const w8 = big[0]?.length ?? 0;
  const a = (deg * Math.PI) / 180;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const out = cellsOf([], outW, outH);
  const tx = px + ox;
  const ty = py + oy;
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const dx = x + 0.5 - tx;
      const dy = y + 0.5 - ty;
      const sx = dx * ca + dy * sa + px;
      const sy = -dx * sa + dy * ca + py;
      const X = Math.floor(sx * S);
      const Y = Math.floor(sy * S);
      if (X >= 0 && X < w8 && Y >= 0 && Y < h8) out[y][x] = big[Y][X];
    }
  }
  return rowsOf(out);
}

/** The frame's filled box: where to crop it to, and where its old (0, 0) went. */
export function crop(g: Grid): { rows: string[]; x: number; y: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  g.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === '.' || row[x] === ' ') continue;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  });
  if (x1 < 0) return { rows: ['.'], x: 0, y: 0 };
  return { rows: g.slice(y0, y1 + 1).map((r) => r.slice(x0, x1 + 1).padEnd(x1 - x0 + 1, '.')), x: x0, y: y0 };
}

/**
 * A limb laid down from a joint along two angles (degrees from straight
 * down, + towards the way the figure faces): an upper segment `w1` cells
 * wide and a lower one two wide, and a hoof or foot of `foot` under its end.
 * `lit` is the letter of its front-left edge (towards the key light),
 * `body` its middle and `back` its far edge. Returned as cells to lay down.
 */
export function limb(
  jx: number,
  jy: number,
  a1: number,
  l1: number,
  a2: number,
  l2: number,
  paint: { lit: string; body: string; back: string; foot: string; heel: string },
  w1 = 3,
): Map<string, string> {
  const px = new Map<string, string>();
  const seg = (x0: number, y0: number, a: number, length: number, width: number): [number, number] => {
    const dx = Math.sin((a * Math.PI) / 180);
    const dy = Math.cos((a * Math.PI) / 180);
    const n = Math.max(1, Math.round(length));
    for (let i = 0; i <= n; i++) {
      const cx = x0 + dx * i;
      const cy = y0 + dy * i;
      for (let k = 0; k < width; k++) {
        const x = Math.round(cx) + k - (width >> 1);
        const y = Math.round(cy);
        px.set(`${x},${y}`, k === 0 ? paint.lit : k === width - 1 ? paint.back : paint.body);
      }
    }
    return [x0 + dx * n, y0 + dy * n];
  };
  const [kx, ky] = seg(jx, jy, a1, l1, w1);
  const [fx, fy] = seg(kx, ky, a2, l2, 2);
  const hx = Math.round(fx);
  const hy = Math.round(fy) + 1;
  for (let x = hx - 1; x <= hx + 1; x++) px.set(`${x},${hy}`, paint.foot);
  px.set(`${hx},${hy - 1}`, paint.heel);
  return px;
}

/**
 * A line of cells from (x0, y0) to (x1, y1), Bresenham's, `thick` cells
 * wide (a square brush), in one letter. Returns the cells it stepped through.
 */
export function strokeCells(c: Cells, x0: number, y0: number, x1: number, y1: number, letter: string, thick = 1): [number, number][] {
  let ax = Math.round(x0);
  let ay = Math.round(y0);
  const bx = Math.round(x1);
  const by = Math.round(y1);
  const dx = Math.abs(bx - ax);
  const dy = -Math.abs(by - ay);
  const sx = ax < bx ? 1 : -1;
  const sy = ay < by ? 1 : -1;
  const o = Math.floor((thick - 1) / 2);
  let err = dx + dy;
  const out: [number, number][] = [];
  for (let guard = 0; guard < 512; guard++) {
    for (let i = 0; i < thick; i++) {
      for (let j = 0; j < thick; j++) {
        const row = c[ay - o + j];
        const x = ax - o + i;
        if (row && x >= 0 && x < row.length) row[x] = letter;
      }
    }
    out.push([ax, ay]);
    if (ax === bx && ay === by) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      ax += sx;
    }
    if (e2 <= dx) {
      err += dx;
      ay += sy;
    }
  }
  return out;
}

/**
 * A one-pixel line on the canvas (logical coordinates, whole art pixels) that
 * never steps diagonally: where Bresenham's would, it takes the corner pixel
 * too. A thread or a chain drawn this way stays one joined stroke once the
 * actor pass has outlined it, instead of a string of single dots.
 */
export function line4(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, art = 2): void {
  let ax = Math.floor(x0 / art);
  let ay = Math.floor(y0 / art);
  const bx = Math.floor(x1 / art);
  const by = Math.floor(y1 / art);
  const dx = Math.abs(bx - ax);
  const dy = -Math.abs(by - ay);
  const sx = ax < bx ? 1 : -1;
  const sy = ay < by ? 1 : -1;
  let err = dx + dy;
  ctx.fillStyle = color;
  for (let guard = 0; guard < 4096; guard++) {
    ctx.fillRect(ax * art, ay * art, art, art);
    if (ax === bx && ay === by) break;
    const e2 = 2 * err;
    const stepX = e2 >= dy;
    const stepY = e2 <= dx;
    if (stepX && stepY) {
      // The corner first, so the stroke stays joined side to side.
      ctx.fillRect((ax + sx) * art, ay * art, art, art);
    }
    if (stepX) {
      err += dy;
      ax += sx;
    }
    if (stepY) {
      err += dx;
      ay += sy;
    }
  }
}

/** Cells laid into a frame of w × h at an offset. */
export function cellsFrom(maps: readonly Map<string, string>[], w: number, h: number): string[] {
  const c = cellsOf([], w, h);
  for (const m of maps) {
    for (const [k, letter] of m) {
      const [x, y] = k.split(',').map(Number);
      if (c[y] && x >= 0 && x < w) c[y][x] = letter;
    }
  }
  return rowsOf(c);
}

/**
 * A 4-connected line of cells - Bresenham's, with the corner cell taken
 * wherever it would step diagonally - so a one-cell bone or seam laid
 * across a fill stays a joined stroke instead of a string of single dots.
 */
export function strokeCells4(c: Cells, x0: number, y0: number, x1: number, y1: number, letter: string): [number, number][] {
  let ax = Math.round(x0);
  let ay = Math.round(y0);
  const bx = Math.round(x1);
  const by = Math.round(y1);
  const dx = Math.abs(bx - ax);
  const dy = -Math.abs(by - ay);
  const sx = ax < bx ? 1 : -1;
  const sy = ay < by ? 1 : -1;
  let err = dx + dy;
  const out: [number, number][] = [];
  const set = (x: number, y: number): void => {
    const row = c[y];
    if (row && x >= 0 && x < row.length) row[x] = letter;
    out.push([x, y]);
  };
  for (let guard = 0; guard < 1024; guard++) {
    set(ax, ay);
    if (ax === bx && ay === by) break;
    const e2 = 2 * err;
    const stepX = e2 >= dy;
    const stepY = e2 <= dx;
    if (stepX && stepY) set(ax + sx, ay);
    if (stepX) {
      err += dy;
      ax += sx;
    }
    if (stepY) {
      err += dx;
      ay += sy;
    }
  }
  return out;
}

/**
 * A polygon filled into cells by scanlines through the cells' middles
 * (even-odd), `letter` everywhere inside it.
 */
export function fillPoly(c: Cells, pts: readonly (readonly [number, number])[], letter: string): void {
  const h = c.length;
  const w = c[0]?.length ?? 0;
  for (let y = 0; y < h; y++) {
    const yc = y + 0.5;
    const xs: number[] = [];
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i];
      const [xj, yj] = pts[j];
      if (yi > yc !== yj > yc) xs.push(xi + ((yc - yi) / (yj - yi)) * (xj - xi));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil(xs[k] - 0.5));
      const to = Math.min(w - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = from; x <= to; x++) c[y][x] = letter;
    }
  }
}

/**
 * A frame breaking up in chunks of 2 × 2 cells: `gone` (0..1) of them
 * cleared, the same ones every time and more of them each step - a figure
 * coming apart in whole blocks, never in a salt of single dots.
 */
export function crumble(g: Grid, gone: number, seed = 7): string[] {
  const c = cellsOf(g);
  for (let y = 0; y < c.length; y++) {
    for (let x = 0; x < c[y].length; x++) {
      let k = ((x >> 1) * 374761393 + (y >> 1) * 668265263 + seed * 1274126177) | 0;
      k = Math.imul(k ^ (k >>> 13), 1274126177);
      const r = ((k ^ (k >>> 16)) >>> 0) / 4294967296;
      if (r < gone) c[y][x] = '.';
    }
  }
  return rowsOf(c);
}

/** '#rrggbb' as one pixel of an ImageData seen as 32-bit words (little-endian: a, b, g, r from the top). */
function word(hex: string): number {
  const v = parseInt(hex.slice(1), 16);
  return ((0xff << 24) | ((v & 0xff) << 16) | (((v >> 8) & 0xff) << 8) | ((v >> 16) & 0xff)) >>> 0;
}

interface Baked {
  img: HTMLCanvasElement;
  flip: HTMLCanvasElement | null;
  w: number;
  h: number;
}

/**
 * Frames too big to build a pixel at a time - a wing as wide as half the
 * screen - written into their canvases in one putImageData each, and from
 * then on drawn by a pivot exactly like a Sheet's frames.
 */
export class BigSheet<F extends string> {
  private readonly built = new Map<string, Baked>();

  constructor(
    readonly frames: Readonly<Record<F, Grid>>,
    readonly key: Readonly<Record<string, string>>,
    readonly palettes: Readonly<Record<string, Readonly<Record<string, string>>>> = {},
  ) {}

  private sprite(frame: F, palette: string): Baked {
    const id = `${frame}|${palette}`;
    let s = this.built.get(id);
    if (!s) {
      const key = palette && this.palettes[palette] ? { ...this.key, ...this.palettes[palette] } : this.key;
      const words = new Map<string, number>();
      for (const k in key) words.set(k, word(key[k]));
      const rows = this.frames[frame];
      const h = rows.length;
      const w = Math.max(1, ...rows.map((r) => r.length));
      const { canvas, ctx } = makeCanvas(w, h);
      const data = ctx.createImageData(w, h);
      const px = new Uint32Array(data.data.buffer);
      for (let y = 0; y < h; y++) {
        const row = rows[y];
        for (let x = 0; x < row.length; x++) {
          const v = words.get(row[x]);
          if (v !== undefined) px[y * w + x] = v;
        }
      }
      ctx.putImageData(data, 0, 0);
      s = { img: canvas, flip: null, w, h };
      this.built.set(id, s);
    }
    return s;
  }

  /** As Sheet.draw: the pivot column (px) on x, the pivot row line (py) on y, mirrored about that column for facing -1. */
  draw(ctx: CanvasRenderingContext2D, frame: F, x: number, y: number, px: number, py: number, facing: 1 | -1 = 1, palette = ''): void {
    const s = this.sprite(frame, palette);
    let img = s.img;
    if (facing < 0) {
      if (!s.flip) {
        const { canvas, ctx: f } = makeCanvas(s.w, s.h);
        f.translate(s.w, 0);
        f.scale(-1, 1);
        f.drawImage(s.img, 0, 0);
        s.flip = canvas;
      }
      img = s.flip;
    }
    const col = facing < 0 ? s.w - 1 - px : px;
    ctx.drawImage(img, snap(x - ART / 2) - col * ART, snap(y) - py * ART, s.w * ART, s.h * ART);
  }
}

/**
 * A ring flat on the floor, `thick` art pixels wide, in whole art pixels -
 * the mark of where something will come down.
 */
export function floorRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, thick: number, color: string): void {
  const ax = snap(cx) / ART;
  const ay = snap(cy) / ART;
  const rxa = Math.max(1, Math.round(rx / ART));
  const rya = Math.max(1, Math.round(ry / ART));
  ctx.fillStyle = color;
  for (let row = -rya; row <= rya; row++) {
    const v = (row + 0.5) / (rya + 0.5);
    const outer = Math.floor(rxa * Math.sqrt(Math.max(0, 1 - v * v)));
    const iv = (row + 0.5) / Math.max(0.5, rya - thick + 0.5);
    const inner = Math.abs(iv) >= 1 ? -1 : Math.floor((rxa - thick) * Math.sqrt(Math.max(0, 1 - iv * iv)));
    if (outer < 0) continue;
    if (inner < 0) {
      ctx.fillRect((ax - outer) * ART, (ay + row) * ART, (outer * 2 + 1) * ART, ART);
    } else {
      ctx.fillRect((ax - outer) * ART, (ay + row) * ART, (outer - inner) * ART, ART);
      ctx.fillRect((ax + inner + 1) * ART, (ay + row) * ART, (outer - inner) * ART, ART);
    }
  }
}

/**
 * A 4-connected line on the canvas like line4, in dashes of `on` art pixels
 * with `off` left out between them (off 0: solid); `thick` 2 doubles it one
 * pixel down.
 */
export function dashLine4(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  on: number,
  off: number,
  thick = 1,
): void {
  let ax = Math.floor(x0 / ART);
  let ay = Math.floor(y0 / ART);
  const bx = Math.floor(x1 / ART);
  const by = Math.floor(y1 / ART);
  const dx = Math.abs(bx - ax);
  const dy = -Math.abs(by - ay);
  const sx = ax < bx ? 1 : -1;
  const sy = ay < by ? 1 : -1;
  let err = dx + dy;
  let n = 0;
  ctx.fillStyle = color;
  const put = (x: number, y: number): void => {
    if (off > 0 && n % (on + off) >= on) return;
    ctx.fillRect(x * ART, y * ART, ART, ART * thick);
  };
  for (let guard = 0; guard < 4096; guard++) {
    put(ax, ay);
    if (ax === bx && ay === by) break;
    const e2 = 2 * err;
    const stepX = e2 >= dy;
    const stepY = e2 <= dx;
    if (stepX && stepY) put(ax + sx, ay);
    if (stepX) {
      err += dy;
      ax += sx;
    }
    if (stepY) {
      err += dx;
      ay += sy;
    }
    n++;
  }
}
