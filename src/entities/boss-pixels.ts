import { ART } from '../render/pixel';
import { blank, plot, rows, type Grid } from '../render/sheet';

/**
 * Small tools for drawing bosses as rows of characters, shared by the boss art
 * modules: runs of a letter, laying one grid on another, Bresenham's lines in
 * cells, the cells of a flat ring, a cog at any turn, a polygon filled on the
 * grid. All of them work once, when a sprite is made, never per frame.
 */

/** A row from runs: "3. 5a 2D" is three blanks, five a, two D. */
export function rl(spec: string): string {
  let out = '';
  for (const t of spec.trim().split(/\s+/)) {
    const m = /^(\d+)(.)$/.exec(t);
    if (!m) throw new Error(`bad run ${t}`);
    out += m[2].repeat(Number(m[1]));
  }
  return out;
}

/** Lays a grid onto cells at (dx, dy); '.' lets through. */
export function stamp(cells: string[][], g: Grid, dx: number, dy: number): void {
  for (let y = 0; y < g.length; y++) {
    for (let x = 0; x < g[y].length; x++) {
      const c = g[y][x];
      if (c !== '.' && c !== ' ') plot(cells, x + dx, y + dy, c);
    }
  }
}

/** The cells along a polyline, Bresenham's, in cell coordinates. */
export function trace(pts: readonly number[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i + 3 < pts.length; i += 2) {
    let x = pts[i];
    let y = pts[i + 1];
    const x1 = pts[i + 2];
    const y1 = pts[i + 3];
    const dx = Math.abs(x1 - x);
    const dy = -Math.abs(y1 - y);
    const sx = x < x1 ? 1 : -1;
    const sy = y < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      const last = out[out.length - 1];
      if (!last || last[0] !== x || last[1] !== y) out.push([x, y]);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }
  return out;
}

const rings = new Map<string, readonly (readonly [number, number])[]>();

/**
 * The cells of a flat ellipse's outline, rx × ry cells round its middle - a
 * ring on the floor seen from the side - in order round it, worked out once
 * per size.
 */
export function ellipseCells(rx: number, ry: number): readonly (readonly [number, number])[] {
  const id = `${rx}|${ry}`;
  let cells = rings.get(id);
  if (!cells) {
    const seen = new Set<string>();
    const out: [number, number][] = [];
    const steps = Math.max(24, Math.round((rx + ry) * 4));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const x = Math.round(Math.cos(a) * rx);
      const y = Math.round(Math.sin(a) * ry);
      const k = `${x},${y}`;
      if (!seen.has(k)) {
        seen.add(k);
        out.push([x, y]);
      }
    }
    cells = out;
    rings.set(id, cells);
  }
  return cells;
}

/**
 * A cog of radius r cells with `teeth` teeth, turned by `turn` (radians), on
 * an odd square grid round its middle cell: teeth, a rim, and for the bigger
 * ones three spokes round a hub - lit from the upper left whichever way it is
 * turned. `tones` from dark to light: edge, shadow, body, light.
 */
export function cog(r: number, teeth: number, turn: number, tones: string, hole = '.'): string[] {
  const n = Math.ceil(r) * 2 + 1;
  const c = (n - 1) / 2;
  const cells = blank(n, n);
  const body = r - 1.1;
  const big = r >= 5;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = x - c;
      const dy = y - c;
      const d = Math.hypot(dx, dy);
      if (d > r + 0.3) continue;
      const a = Math.atan2(dy, dx) - turn;
      const slot = (((a / (Math.PI * 2)) * teeth) % 1 + 1) % 1;
      const tooth = slot > 0.22 && slot < 0.72;
      if (d > body && !tooth) continue;
      const light = d < 0.5 ? 0 : (-dx - dy) / (d * Math.SQRT2);
      let t = light > 0.45 ? 3 : light > -0.3 ? 2 : 1;
      if (big) {
        // The rim, three spokes, the hub; between them, open.
        const inner = body - 1.6;
        if (d < inner && d > 1.6) {
          const sa = Math.atan2(dy, dx) - turn;
          const spoke = Math.abs(((((sa / (Math.PI * 2)) * 3) % 1) + 1) % 1 - 0.5) > 0.38;
          if (!spoke) {
            if (hole !== '.') plot(cells, x, y, hole);
            continue;
          }
          t = Math.min(t, 2);
        }
        if (d <= 1.6) t = 0;
      } else if (d < 0.6 && r >= 3) t = 0;
      // The lower right edge of everything in the dark tone.
      if (d > body - 0.6 && light < -0.35) t = 0;
      plot(cells, x, y, tones[t]);
    }
  }
  return rows(cells);
}

/** Whether (px, py) is inside a polygon of [x0, y0, x1, y1, …] (even-odd). */
export function insidePoly(pts: readonly number[], px: number, py: number): boolean {
  let odd = false;
  const n = pts.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const yi = pts[i * 2 + 1];
    const yj = pts[j * 2 + 1];
    if (yi > py !== yj > py && px < pts[i * 2] + ((py - yi) / (yj - yi)) * (pts[j * 2] - pts[i * 2])) odd = !odd;
  }
  return odd;
}

/** A polygon's points turned by `angle` about (0, 0) and moved by (ox, oy). */
export function turned(pts: readonly number[], angle: number, ox = 0, oy = 0): number[] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const out: number[] = [];
  for (let i = 0; i < pts.length; i += 2) out.push(ox + pts[i] * c - pts[i + 1] * s, oy + pts[i] * s + pts[i + 1] * c);
  return out;
}

/** Each glyph letter of a grid swapped for another: a palette swap done on the characters. */
export function swap(g: Grid, map: Readonly<Record<string, string>>): string[] {
  return g.map((r) => r.replace(/./g, (ch) => map[ch] ?? ch));
}

/** Every letter of a grid but '.' as one letter: a silhouette. */
export function silhouette(g: Grid, letter: string): string[] {
  return g.map((r) => r.replace(/[^.]/g, letter));
}

/**
 * A grid without stray pixels: a cell whose four neighbours are all one other
 * letter takes that letter. A rule that shades by formula leaves such crumbs
 * where two bands meet, and a pixel artist would never place them.
 */
export function despeckle(g: Grid): string[] {
  const cells = g.map((r) => r.split(''));
  const at = (x: number, y: number): string => g[y]?.[x] ?? '.';
  for (let y = 0; y < g.length; y++) {
    for (let x = 0; x < g[y].length; x++) {
      const c = g[y][x];
      if (c === '.') continue;
      const n = at(x, y - 1);
      if (n !== '.' && n !== c && at(x, y + 1) === n && at(x - 1, y) === n && at(x + 1, y) === n) cells[y][x] = n;
    }
  }
  return rows(cells);
}

/**
 * Cells in order made 4-connected: where two follow each other only by a
 * corner, the cell between them is filled - so a thin ring or line on the
 * actor layer is a run of pixels, not a string of loose dots.
 */
export function connect4(cells: readonly (readonly [number, number])[], closed = true): [number, number][] {
  const out: [number, number][] = [];
  const n = cells.length;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = cells[i];
    out.push([x0, y0]);
    if (!closed && i === n - 1) break;
    const [x1, y1] = cells[(i + 1) % n];
    if (Math.abs(x1 - x0) === 1 && Math.abs(y1 - y0) === 1) out.push([x1, y0]);
  }
  return out;
}

const rings4 = new Map<string, readonly (readonly [number, number])[]>();

/** ellipseCells, 4-connected. */
export function ellipseCells4(rx: number, ry: number): readonly (readonly [number, number])[] {
  const id = `${rx}|${ry}`;
  let cells = rings4.get(id);
  if (!cells) {
    cells = connect4(ellipseCells(rx, ry));
    rings4.set(id, cells);
  }
  return cells;
}

/** The cells of a straight line, 4-connected: Bresenham's, with the corners filled. */
export function line4(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  return connect4(trace([x0, y0, x1, y1]), false);
}

/**
 * A straight line with a square brush `thick` art pixels wide, from one
 * logical point to another - Bresenham's, like the pen's - but laid down as
 * runs: every stretch of the line along one row (or, for a steep line, one
 * column) is a single rectangle. A long pendulum rod is a handful of fills,
 * not a hundred.
 */
export function runLine(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, thick = 1): void {
  let ax = Math.floor(x0 / ART);
  let ay = Math.floor(y0 / ART);
  const bx = Math.floor(x1 / ART);
  const by = Math.floor(y1 / ART);
  const dx = Math.abs(bx - ax);
  const dy = -Math.abs(by - ay);
  const sx = ax < bx ? 1 : -1;
  const sy = ay < by ? 1 : -1;
  const steep = -dy > dx;
  const o = Math.floor((thick - 1) / 2);
  let err = dx + dy;
  let rx = ax;
  let ry = ay;
  let len = 0;
  ctx.fillStyle = color;
  const flush = (): void => {
    if (len === 0) return;
    if (steep) ctx.fillRect((rx - o) * ART, (Math.min(ry, ry + sy * (len - 1)) - o) * ART, thick * ART, (len + thick - 1) * ART);
    else ctx.fillRect((Math.min(rx, rx + sx * (len - 1)) - o) * ART, (ry - o) * ART, (len + thick - 1) * ART, thick * ART);
  };
  for (let guard = 0; guard < 4096; guard++) {
    // Extend the run while the line stays on its row (or column).
    if (len > 0 && (steep ? ax !== rx : ay !== ry)) {
      flush();
      rx = ax;
      ry = ay;
      len = 0;
    }
    if (len === 0) {
      rx = ax;
      ry = ay;
    }
    len++;
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
  flush();
}
