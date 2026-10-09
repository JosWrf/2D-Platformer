import { Camera } from '../core/camera';
import { Level } from '../world/level';
import { TILE, Tile } from '../world/tiles';
import type { Light } from './lighting';
import { ART_PALETTE } from './palette';
import { ART } from './pixel';
import { TPX, type TileShape, rimColorAt, tileShape } from './tileArt';

/**
 * Readability pass, drawn after the lighting.
 *
 * The darkness is what makes the look, but it swallows exactly the information
 * the player needs in order to jump: where a ledge ends, where a pit begins,
 * which surface carries. So every face that borders empty space keeps a lit
 * rim, no matter how far away the nearest torch is. It doubles as the rim
 * lighting the style calls for.
 *
 * The rim is one art pixel wide and runs along the pixels the terrain really
 * has - round a chipped corner, out along a lip of grass - in colours of the
 * palette. A top edge catches the light in its own material's highlight, so
 * the lit edge of grass stays green and that of a rift ledge violet; a wall
 * catches the zone's light. It is a light, so it is laid on additively and
 * never stronger than a fifth: it used to reach well over half, and the lit
 * edge of the floor came out brighter than the hero standing on it. It still
 * rises a little towards the light sources near it, in whole steps rather
 * than smoothly, the way the darkness itself falls off: a rim of constant
 * brightness reads as a drawn outline instead of light falling on an edge.
 */

/**
 * The strengths a rim can have: the floor that always reads, then up towards
 * the lights. It rises only a little - where a light is, the light pass has
 * already lifted the edge, and the hero's own lantern is always beside him.
 */
const STEPS = [0.12, 0.12, 0.13, 0.14, 0.15];
/** Walls take less of it than tops: the light comes from above. */
const WALL = 0.75;

const shape: TileShape = {
  tl: 0,
  tr: 0,
  bl: 0,
  br: 0,
  top: false,
  left: false,
  right: false,
  bottom: false,
  hangL: 0,
  hangR: 0,
};

/** The palette colour nearest a zone's light ("r,g,b") at a middle tone, found once per colour. */
const zoneColors = new Map<string, string>();

function zoneColor(rgb: string): string {
  let hex = zoneColors.get(rgb);
  if (!hex) {
    // The zone's colour brought down to a middle tone first: laid on at a
    // fifth, a pale colour lifts a dark wall to the hero's own brightness.
    const [r, g, b] = rgb.split(',').map((v) => Number(v) * 0.5);
    let best = ART_PALETTE[0];
    let bestD = Infinity;
    for (const c of ART_PALETTE) {
      const cr = (c >> 16) & 255;
      const cg = (c >> 8) & 255;
      const cb = c & 255;
      const rm = (r + cr) / 2;
      const d = (2 + rm / 256) * (r - cr) ** 2 + 4 * (g - cg) ** 2 + (2 + (255 - rm) / 256) * (b - cb) ** 2;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    hex = `#${best.toString(16).padStart(6, '0')}`;
    zoneColors.set(rgb, hex);
  }
  return hex;
}

export function drawEdgeLight(
  ctx: CanvasRenderingContext2D,
  level: Level,
  camera: Camera,
  viewW: number,
  viewH: number,
  rgb: string,
  lights: readonly Light[],
): void {
  const camX = camera.renderX;
  const camY = camera.renderY;
  const t0 = Math.floor(camX / TILE) - 1;
  const t1 = Math.ceil((camX + viewW) / TILE) + 1;
  const r0 = Math.max(0, Math.floor(camY / TILE) - 1);
  const r1 = Math.min(level.height - 1, Math.ceil((camY + viewH) / TILE) + 1);
  const wallColor = zoneColor(rgb);

  const carries = (tx: number, ty: number): boolean => {
    const tile = level.tileAt(tx, ty);
    return tile === Tile.Solid || tile === Tile.Earth || tile === Tile.Platform;
  };

  /** How much light reaches a point, 0..1, from the same sources as the pass. */
  const litness = (wx: number, wy: number): number => {
    let sum = 0;
    for (const light of lights) {
      const dx = wx - light.x;
      const dy = wy - light.y;
      const d2 = dx * dx + dy * dy;
      const r = light.radius;
      if (d2 > r * r) continue;
      sum += light.strength * (1 - Math.sqrt(d2) / r);
      if (sum >= 1) return 1;
    }
    return sum;
  };

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  let fill = '';
  const color = (c: string): void => {
    // Changing the fill is what costs; the colour changes only between materials.
    if (c !== fill) {
      ctx.fillStyle = c;
      fill = c;
    }
  };
  for (let tx = Math.max(0, t0); tx <= Math.min(level.width - 1, t1); tx++) {
    for (let ty = r0; ty <= r1; ty++) {
      if (!carries(tx, ty)) continue;
      const plank = level.tileAt(tx, ty) === Tile.Platform;
      let top: boolean;
      let x0 = 0;
      let x1 = TPX;
      let left = false;
      let right = false;
      if (plank) {
        top = !carries(tx, ty - 1);
        // The boards are bevelled at the ends of a run.
        if (level.tileAt(tx - 1, ty) !== Tile.Platform) x0 = 1;
        if (level.tileAt(tx + 1, ty) !== Tile.Platform) x1 = TPX - 1;
      } else {
        if (!tileShape(level, tx, ty, shape)) continue;
        top = shape.top && !carries(tx, ty - 1);
        left = shape.left;
        right = shape.right;
        x0 = shape.tl - shape.hangL;
        x1 = TPX - shape.tr + shape.hangR;
      }
      if (!top && !left && !right) continue;

      // A floor that always reads, plus the share the nearby lights add.
      const lit = litness(tx * TILE + TILE / 2, ty * TILE);
      const step = STEPS[Math.min(STEPS.length - 1, Math.floor(lit * STEPS.length))];
      // This pass draws in view space: the camera is taken off here.
      const x = tx * TILE - camX;
      const y = ty * TILE - camY;

      if (top) {
        color(rimColorAt(level, tx, ty) ?? wallColor);
        ctx.globalAlpha = step;
        ctx.fillRect(x + x0 * ART, y, (x1 - x0) * ART, ART);
      }

      // Vertical faces: the drop next to a ledge, and the wall of a pit. Each
      // starts below the corner it turns from (the top rim already lights that
      // pixel) and stops short of a chipped foot; a face turned left, towards
      // the light, takes more of it than one turned right.
      if (left || right) {
        color(wallColor);
        if (left) {
          const start = top ? Math.max(1, shape.tl) : 0;
          ctx.globalAlpha = step * WALL;
          ctx.fillRect(x, y + start * ART, ART, (TPX - shape.bl - start) * ART);
        }
        if (right) {
          const start = top ? Math.max(1, shape.tr) : 0;
          ctx.globalAlpha = step * WALL * 0.6;
          ctx.fillRect(x + (TPX - 1) * ART, y + start * ART, ART, (TPX - shape.br - start) * ART);
        }
      }
    }
  }
  ctx.restore();
}
