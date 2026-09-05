import { Camera } from '../core/camera';
import { Level } from '../world/level';
import { TILE, Tile } from '../world/tiles';

/**
 * Readability pass, drawn after the lighting.
 *
 * The darkness is what makes the look, but it swallows exactly the information
 * the player needs in order to jump: where a ledge ends, where a pit begins,
 * which surface carries. So every face that borders empty space keeps a lit
 * rim, no matter how far away the nearest torch is. It doubles as the rim
 * lighting the style calls for.
 */
export function drawEdgeLight(
  ctx: CanvasRenderingContext2D,
  level: Level,
  camera: Camera,
  viewW: number,
  viewH: number,
  rgb: string,
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

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let tx = t0; tx <= t1; tx++) {
    for (let ty = r0; ty <= r1; ty++) {
      if (!carries(tx, ty)) continue;
      const x = tx * TILE - camX;
      const y = ty * TILE - camY;

      // Top face: this is what the player lands on.
      if (!carries(tx, ty - 1)) {
        ctx.fillStyle = `rgba(${rgb},0.34)`;
        ctx.fillRect(x, y, TILE, 2);
        ctx.fillStyle = `rgba(${rgb},0.13)`;
        ctx.fillRect(x, y + 2, TILE, 2);
      }

      // Vertical faces: the drop next to a ledge, and the wall of a pit.
      if (blocks(tx, ty)) {
        if (!blocks(tx - 1, ty)) {
          ctx.fillStyle = `rgba(${rgb},0.2)`;
          ctx.fillRect(x, y, 2, TILE);
        }
        if (!blocks(tx + 1, ty)) {
          ctx.fillStyle = `rgba(${rgb},0.2)`;
          ctx.fillRect(x + TILE - 2, y, 2, TILE);
        }
      }
    }
  }
  ctx.restore();
}
