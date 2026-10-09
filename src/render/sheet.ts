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
    private readonly key: Readonly<Record<string, string>>,
    private readonly palettes: Readonly<Record<string, Readonly<Record<string, string>>>> = {},
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
