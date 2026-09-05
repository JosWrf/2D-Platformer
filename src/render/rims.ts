import { Camera } from '../core/camera';
import { Level } from '../world/level';
import { TILE, Tile } from '../world/tiles';
import type { Light } from './lighting';

/**
 * Readability pass, drawn after the lighting.
 *
 * The darkness is what makes the look, but it swallows exactly the information
 * the player needs in order to jump: where a ledge ends, where a pit begins,
 * which surface carries. So every face that borders empty space keeps a lit
 * rim, no matter how far away the nearest torch is. It doubles as the rim
 * lighting the style calls for.
 *
 * The rim is not uniform: it holds a floor bright enough to read, and rises
 * towards the light sources near it. A rim of constant brightness reads as a
 * drawn outline instead of light falling on an edge.
 */
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
  const r0 = Math.floor(camY / TILE) - 1;
  const r1 = Math.ceil((camY + viewH) / TILE) + 1;

  const carries = (tx: number, ty: number): boolean => {
    const tile = level.tileAt(tx, ty);
    return tile === Tile.Solid || tile === Tile.Earth || tile === Tile.Platform;
  };
  const blocks = (tx: number, ty: number): boolean => {
    const tile = level.tileAt(tx, ty);
    return tile === Tile.Solid || tile === Tile.Earth;
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
  // One colour, varied by globalAlpha: building an rgba string per tile costs
  // more than the whole pass is worth.
  ctx.fillStyle = `rgb(${rgb})`;
  for (let tx = Math.max(0, t0); tx <= Math.min(level.width - 1, t1); tx++) {
    for (let ty = r0; ty <= r1; ty++) {
      if (!carries(tx, ty)) continue;
      const solid = blocks(tx, ty);
      const top = !carries(tx, ty - 1);
      const left = solid && !blocks(tx - 1, ty);
      const right = solid && !blocks(tx + 1, ty);
      if (!top && !left && !right) continue;

      const x = tx * TILE - camX;
      const y = ty * TILE - camY;
      // A floor that always reads, plus the share the nearby lights add.
      const lit = litness(tx * TILE + TILE / 2, ty * TILE);
      const grain = 0.86 + level.noiseAt(tx, ty) * 0.28;

      if (top) {
        const edge = (0.12 + lit * 0.42) * grain;
        ctx.globalAlpha = edge;
        ctx.fillRect(x, y, TILE, 2);
        ctx.globalAlpha = edge * 0.38;
        ctx.fillRect(x, y + 2, TILE, 2);
      }

      // Vertical faces: the drop next to a ledge, and the wall of a pit.
      if (left || right) {
        ctx.globalAlpha = (0.09 + lit * 0.24) * grain;
        if (left) ctx.fillRect(x, y, 2, TILE);
        if (right) ctx.fillRect(x + TILE - 2, y, 2, TILE);
      }
    }
  }
  ctx.restore();
}
