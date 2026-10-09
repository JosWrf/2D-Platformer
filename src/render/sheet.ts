import { ART, PixelSprite, snap } from './pixel';

export { PixelSprite };

/**
 * Sprite sheets kept in code: frames as rows of characters, one per art pixel
 * (see PixelSprite), with the few operations a pixel artist does by hand -
 * turning a frame a quarter round, mirroring it, laying one part over another,
 * swapping one colour key for another - done on the characters, so that what
 * comes out is still exactly the pixels that were placed. Nothing is ever
 * resampled: a frame at 45° is drawn at 45°, not turned there by the canvas.
 */

/** A frame: rows of characters, '.' or ' ' for nothing. */
export type Grid = readonly string[];

function widthOf(g: Grid): number {
  let w = 0;
  for (const row of g) w = Math.max(w, row.length);
  return w;
}

function at(g: Grid, x: number, y: number): string {
  const row = g[y];
  if (!row) return '.';
  const c = row[x];
  return c === undefined || c === ' ' ? '.' : c;
}

/** A quarter turn clockwise on screen: what pointed right points down. */
export function turnCW(g: Grid): string[] {
  const h = g.length;
  const w = widthOf(g);
  const out: string[] = [];
  for (let x = 0; x < w; x++) {
    let row = '';
    for (let y = h - 1; y >= 0; y--) row += at(g, x, y);
    out.push(row);
  }
  return out;
}

/** A quarter turn anticlockwise on screen: what pointed right points up. */
export function turnCCW(g: Grid): string[] {
  const h = g.length;
  const w = widthOf(g);
  const out: string[] = [];
  for (let x = w - 1; x >= 0; x--) {
    let row = '';
    for (let y = 0; y < h; y++) row += at(g, x, y);
    out.push(row);
  }
  return out;
}

/** Mirrored left to right. */
export function flipX(g: Grid): string[] {
  const w = widthOf(g);
  return g.map((row) => {
    let out = '';
    for (let x = w - 1; x >= 0; x--) out += row[x] === undefined || row[x] === ' ' ? '.' : row[x];
    return out;
  });
}

/** Mirrored top to bottom. */
export function flipY(g: Grid): string[] {
  return [...g].reverse();
}

/** Every character of a frame put through a map: one material swapped for another. */
export function recolor(g: Grid, map: Readonly<Record<string, string>>): string[] {
  return g.map((row) => {
    let out = '';
    for (const c of row) out += map[c] ?? c;
    return out;
  });
}

/**
 * Parts laid over a blank w×h frame, each with its top-left at (dx, dy), later
 * ones over earlier ones; '.' lets through what is underneath. This is how a
 * walk cycle is built: one torso, four pairs of legs.
 */
export function compose(w: number, h: number, parts: readonly (readonly [Grid, number, number])[]): string[] {
  const cells: string[][] = [];
  for (let y = 0; y < h; y++) cells.push(new Array<string>(w).fill('.'));
  for (const [g, dx, dy] of parts) {
    for (let y = 0; y < g.length; y++) {
      const row = g[y];
      const ty = y + dy;
      if (ty < 0 || ty >= h) continue;
      for (let x = 0; x < row.length; x++) {
        const c = row[x];
        const tx = x + dx;
        if (c === '.' || c === ' ' || tx < 0 || tx >= w) continue;
        cells[ty][tx] = c;
      }
    }
  }
  return cells.map((r) => r.join(''));
}

/** A blank w×h frame to draw into with plot(). */
export function blank(w: number, h: number): string[][] {
  const cells: string[][] = [];
  for (let y = 0; y < h; y++) cells.push(new Array<string>(w).fill('.'));
  return cells;
}

/** Sets one cell of a frame being built, if it is inside it. */
export function plot(cells: string[][], x: number, y: number, c: string): void {
  const row = cells[y];
  if (row && x >= 0 && x < row.length) row[x] = c;
}

/** A frame being built, finished. */
export function rows(cells: readonly (readonly string[])[]): string[] {
  return cells.map((r) => r.join(''));
}

/**
 * A filled oval in a frame being built: the cells whose centres fall inside
 * the ellipse round (cx, cy) - cell coordinates, so 3.5 is the middle of the
 * fourth column - with radii rx and ry.
 */
export function oval(cells: string[][], cx: number, cy: number, rx: number, ry: number, c: string): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) plot(cells, x, y, c);
    }
  }
}

/**
 * The smear of a swing as a frame's worth of cells: the band of an arc round
 * (cx, cy) at radius r, from angle a0 to a1 (screen angles, clockwise from
 * the right), thin where the swing began and `thick` cells at its widest just
 * behind the head, running out to a point. The outer cells take `edge`, the
 * middle of the band `core`. Worked out once, when the frame is made.
 */
export function smear(
  cells: string[][],
  cx: number,
  cy: number,
  r: number,
  a0: number,
  a1: number,
  thick: number,
  core: string,
  edge: string,
): void {
  const span = a1 - a0;
  const h = cells.length;
  const w = cells[0]?.length ?? 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.hypot(dx, dy);
      let off = Math.atan2(dy, dx) - a0;
      if (span < 0) off = -off;
      off = ((off % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const t = off / Math.abs(span);
      if (t > 1) continue;
      const half = (thick / 2) * Math.sin(Math.PI * Math.pow(t, 0.7)) ** 0.8;
      const gap = Math.abs(d - r);
      if (half < 0.35 || gap > half) continue;
      plot(cells, x, y, gap <= half * 0.45 ? core : edge);
    }
  }
}

/* -------------------------------------------- frames worked out by rule */

/*
 * Some shapes are better worked out than placed: a flame is layers of colour
 * round its own outline, a boulder turning over keeps its light on the upper
 * left whichever way up it is. These make such frames once, when the sheet is
 * built, as ordinary rows of characters - whole cells, no smoothing - so they
 * are drawn exactly like the hand-placed ones.
 */

/** A number in 0..1 for a pair of integers, the same every time: noise for frames. */
export function hash2(a: number, b: number): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** How many cells in from the outline of the filled shape each filled cell is (1 on the edge). */
function depths(cells: string[][], filled: (c: string) => boolean): number[][] {
  const h = cells.length;
  const w = cells[0]?.length ?? 0;
  const out: number[][] = [];
  for (let y = 0; y < h; y++) {
    out.push([]);
    for (let x = 0; x < w; x++) {
      if (!filled(cells[y][x])) {
        out[y].push(0);
        continue;
      }
      let d = 1;
      for (; d < 6; d++) {
        let edge = false;
        for (let k = -d; k <= d && !edge; k++) {
          for (const [px, py] of [
            [x + k, y - d],
            [x + k, y + d],
            [x - d, y + k],
            [x + d, y + k],
          ]) {
            if (py < 0 || py >= h || px < 0 || px >= w || !filled(cells[py][px])) {
              edge = true;
              break;
            }
          }
        }
        if (edge) break;
      }
      out[y].push(d);
    }
  }
  return out;
}

/**
 * A tongue of flame w×h cells standing on its bottom row: each column burns to
 * a height that falls away from the middle, ragged by `seed`, a lick or two
 * torn off above; coloured in layers round its own outline - `tones` from the
 * outermost layer in - so the tip and the edges are the coolest colour and
 * the core the hottest, the way a pixel artist paints fire.
 */
export function flame(w: number, h: number, seed: number, tones: string, spread = 0.35): string[] {
  const cells = blank(w, h);
  const mid = (w - 1) / 2;
  for (let x = 0; x < w; x++) {
    const off = Math.abs(x - mid) / (w / 2);
    const height = h * Math.pow(Math.max(0, 1 - off), 0.8) + (hash2(x, seed) - 0.5) * h * spread;
    const top = Math.max(1, Math.min(h, Math.round(height)));
    for (let k = 0; k < top; k++) plot(cells, x, h - 1 - k, '#');
    // Now and then a lick torn off above the column.
    if (top < h - 2 && hash2(x + 17, seed) > 0.78) plot(cells, x, h - 2 - top - Math.round(hash2(x, seed + 5)), '#');
  }
  const deep = depths(cells, (c) => c === '#');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (cells[y][x] !== '#') continue;
      // The hot core sits low: lift the depth near the base a little.
      const d = deep[y][x] + (y >= h - 2 && Math.abs(x - mid) < w / 4 ? 1 : 0);
      cells[y][x] = tones[Math.min(tones.length - 1, d - 1)];
    }
  }
  return rows(cells);
}

/**
 * A lump - a polygon of corner points round (0, 0) in cells - turned by
 * `angle` and filled on a w×h grid, then lit from the upper left whatever way
 * up it has been turned: `tones` from shadow to highlight, the cells on its
 * lower right edge in the darkest. A tumbling rock is these, one per angle.
 */
export function tumble(w: number, h: number, corners: readonly number[], angle: number, tones: string): string[][] {
  const cells = blank(w, h);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const cx = w / 2;
  const cy = h / 2;
  const pts: number[] = [];
  let reach = 0;
  for (let i = 0; i < corners.length; i += 2) {
    const x = corners[i];
    const y = corners[i + 1];
    pts.push(cx + x * c - y * s, cy + x * s + y * c);
    reach = Math.max(reach, Math.hypot(x, y));
  }
  const n = pts.length / 2;
  const inside = (px: number, py: number): boolean => {
    let odd = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const yi = pts[i * 2 + 1];
      const yj = pts[j * 2 + 1];
      if (yi > py !== yj > py && px < pts[i * 2] + ((py - yi) / (yj - yi)) * (pts[j * 2] - pts[i * 2])) odd = !odd;
    }
    return odd;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inside(x + 0.5, y + 0.5)) continue;
      const nx = (x + 0.5 - cx) / reach;
      const ny = (y + 0.5 - cy) / reach;
      const light = -0.6 * nx - 0.8 * ny;
      const k = Math.max(0, Math.min(tones.length - 2, Math.floor((light + 0.75) * (tones.length - 1) * 0.7)));
      plot(cells, x, y, tones[k + 1]);
    }
  }
  // The edge facing away from the light in the darkest tone.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (cells[y][x] === '.') continue;
      const below = cells[y + 1]?.[x] ?? '.';
      const right = cells[y][x + 1] ?? '.';
      if (below === '.' || right === '.') cells[y][x] = tones[0];
    }
  }
  return cells;
}

/**
 * Something flying with a tail: a head of radius `head` cells at the front of a
 * w×h frame and a tail streaming `tail` cells back from it along the angle it
 * flies at, narrowing to nothing. Coloured by how far back along the tail a
 * cell is and how near the middle: `tones` from the tail's end to the head's
 * core. Worked out per direction, so a comet at 45° is drawn at 45°.
 */
export function comet(w: number, h: number, angle: number, head: number, tail: number, tones: string): string[] {
  const cells = blank(w, h);
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  // The head sits forward of the middle, so the tail has room.
  const hx = w / 2 + dx * (w / 2 - head - 0.5);
  const hy = h / 2 + dy * (h / 2 - head - 0.5);
  const n = tones.length;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x + 0.5 - hx;
      const py = y + 0.5 - hy;
      const along = px * dx + py * dy;
      const across = Math.abs(-px * dy + py * dx);
      const r = Math.hypot(px, py);
      let heat = -1;
      if (r <= head + 0.25) heat = 1 - (r / (head + 0.25)) * 0.45;
      else if (along < 0 && along > -tail) {
        const k = 1 + along / tail;
        if (across <= head * k + 0.15) heat = 0.55 * k - (across / (head + 0.5)) * 0.2;
      }
      if (heat < 0) continue;
      plot(cells, x, y, tones[Math.max(0, Math.min(n - 1, Math.floor(heat * n)))]);
    }
  }
  return rows(cells);
}

/**
 * A crescent: the cells of the disc round (ax, ay) radius ar that are not in
 * the disc round (bx, by) radius br. Its front edge (the outermost cells of
 * the first disc on the far side from the second) takes `front`, the cells
 * just behind it `core`, the rest `back`.
 */
export function moon(
  w: number,
  h: number,
  ax: number,
  ay: number,
  ar: number,
  bx: number,
  by: number,
  br: number,
  front: string,
  core: string,
  back: string,
): string[] {
  const cells = blank(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const da = Math.hypot(x + 0.5 - ax, y + 0.5 - ay);
      const db = Math.hypot(x + 0.5 - bx, y + 0.5 - by);
      if (da > ar || db <= br) continue;
      const rim = ar - da;
      plot(cells, x, y, rim < 1 ? front : db - br < 1.6 ? back : core);
    }
  }
  return rows(cells);
}

/**
 * The eight directions of travel, as an index: 0 right, then clockwise on
 * screen - 1 down-right, 2 down, 3 down-left, 4 left, 5 up-left, 6 up,
 * 7 up-right.
 */
export function dirIndex(vx: number, vy: number): number {
  if (vx === 0 && vy === 0) return 0;
  return (Math.round(Math.atan2(vy, vx) / (Math.PI / 4)) + 8) % 8;
}

/**
 * Eight frames for something that points the way it flies, from two drawn
 * ones: pointing right, and pointing up and to the right. The others are
 * mirrors and quarter turns of those, in dirIndex order. Mirrors are used
 * where they can be, so the key light stays above.
 */
export function eightWays(east: Grid, northEast: Grid): string[][] {
  const north = turnCCW(east);
  return [
    [...east],
    flipY(northEast),
    flipY(north),
    flipX(flipY(northEast)),
    flipX(east),
    flipX(northEast),
    north,
    [...northEast],
  ];
}

/**
 * A set of frames with one colour key, built into sprites on first use - once
 * per palette, for a monster that wears a different colour in every zone.
 */
export class Sheet<F extends string> {
  private readonly built = new Map<string, PixelSprite>();

  constructor(
    readonly frames: Readonly<Record<F, Grid>>,
    readonly key: Readonly<Record<string, string>>,
    readonly palettes: Readonly<Record<string, Readonly<Record<string, string>>>> = {},
  ) {}

  sprite(frame: F, palette = ''): PixelSprite {
    const id = `${frame}|${palette}`;
    let s = this.built.get(id);
    if (!s) {
      const key = palette && this.palettes[palette] ? { ...this.key, ...this.palettes[palette] } : this.key;
      s = new PixelSprite(this.frames[frame], key);
      this.built.set(id, s);
    }
    return s;
  }

  /**
   * Draws a frame by its pivot, in logical coordinates under the camera's
   * transform. Across, the pivot is a column of the frame (px, counted from
   * its left), put on the art column under x - mirrored (facing -1), the frame
   * turns about that same column, the way a figure turns about its spine.
   * Down, it is a line between rows (py: 0 is the top edge of the frame, its
   * height the bottom edge), put on the grid line nearest y - so a frame
   * pivoted on its bottom edge stands on the floor its body stands on, whose
   * bottom is a hair above the tile.
   */
  draw(
    ctx: CanvasRenderingContext2D,
    frame: F,
    x: number,
    y: number,
    px: number,
    py: number,
    facing: 1 | -1 = 1,
    palette = '',
  ): void {
    const s = this.sprite(frame, palette);
    const col = facing < 0 ? s.w - 1 - px : px;
    s.draw(ctx, snap(x - ART / 2) - col * ART, snap(y) - py * ART, facing);
  }
}
