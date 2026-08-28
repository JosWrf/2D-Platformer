import { Rng, clamp } from '../core/math';
import { CHUNK_H, LEVEL_CHUNKS } from './levelData';
import { CHAR_TO_SPAWN, CHAR_TO_TILE, Spawn, TILE, Tile, isHazard, isPlatform, isSolid } from './tiles';

export interface TileDecor {
  /** Deterministic 0..1 value per tile, used for subtle rendering variety. */
  noise: number;
}

export class Level {
  readonly width: number;
  readonly height = CHUNK_H;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly tiles: Uint8Array;
  readonly spawns: Spawn[] = [];
  readonly decorNoise: Float32Array;
  /** The boss arena gate only turns solid once the fight has begun. */
  gateClosed = false;

  constructor() {
    let width = 0;
    for (const chunk of LEVEL_CHUNKS) width += chunk.width;
    this.width = width;
    this.pixelWidth = width * TILE;
    this.pixelHeight = this.height * TILE;
    this.tiles = new Uint8Array(width * this.height);
    this.decorNoise = new Float32Array(width * this.height);

    const rng = new Rng(0xc0ffee);
    let offsetX = 0;
    for (const chunk of LEVEL_CHUNKS) {
      for (let ty = 0; ty < this.height; ty++) {
        const row = chunk.rows[ty] ?? '';
        for (let cx = 0; cx < chunk.width; cx++) {
          const ch = row[cx] ?? '.';
          const tx = offsetX + cx;
          const tile = CHAR_TO_TILE[ch];
          if (tile !== undefined) {
            this.tiles[ty * width + tx] = tile;
          } else {
            const spawn = CHAR_TO_SPAWN[ch];
            if (spawn) this.spawns.push({ kind: spawn, tx, ty });
          }
        }
      }
      offsetX += chunk.width;
    }
    for (let i = 0; i < this.decorNoise.length; i++) this.decorNoise[i] = rng.next();
  }

  tileAt(tx: number, ty: number): Tile {
    if (tx < 0 || tx >= this.width || ty < 0 || ty >= this.height) {
      // Everything outside the map is empty except the left/right walls.
      return tx < 0 || tx >= this.width ? Tile.Solid : Tile.Empty;
    }
    return this.tiles[ty * this.width + tx] as Tile;
  }

  noiseAt(tx: number, ty: number): number {
    if (tx < 0 || tx >= this.width || ty < 0 || ty >= this.height) return 0.5;
    return this.decorNoise[ty * this.width + tx];
  }

  solidAt(tx: number, ty: number): boolean {
    const t = this.tileAt(tx, ty);
    if (t === Tile.Gate) return this.gateClosed;
    return isSolid(t);
  }

  platformAt(tx: number, ty: number): boolean {
    return isPlatform(this.tileAt(tx, ty));
  }

  hazardAt(tx: number, ty: number): boolean {
    return isHazard(this.tileAt(tx, ty));
  }

  /** True if any solid tile overlaps the given world-space rectangle. */
  rectHitsSolid(x: number, y: number, w: number, h: number): boolean {
    const x0 = Math.floor(x / TILE);
    const x1 = Math.floor((x + w - 0.001) / TILE);
    const y0 = Math.floor(y / TILE);
    const y1 = Math.floor((y + h - 0.001) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (this.solidAt(tx, ty)) return true;
      }
    }
    return false;
  }

  rectHitsHazard(x: number, y: number, w: number, h: number): boolean {
    const x0 = Math.floor(x / TILE);
    const x1 = Math.floor((x + w - 0.001) / TILE);
    const y0 = Math.floor(y / TILE);
    const y1 = Math.floor((y + h - 0.001) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (tx < 0 || tx >= this.width || ty < 0 || ty >= this.height) continue;
        if (this.hazardAt(tx, ty)) return true;
      }
    }
    return false;
  }

  /**
   * One-way platforms only collide when the mover is falling and its previous
   * bottom edge was above the platform surface.
   */
  platformSurfaceBelow(x: number, w: number, prevBottom: number, nextBottom: number): number | null {
    if (nextBottom < prevBottom) return null;
    const x0 = Math.floor(x / TILE);
    const x1 = Math.floor((x + w - 0.001) / TILE);
    const y0 = Math.floor(prevBottom / TILE);
    const y1 = Math.floor(nextBottom / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      const surface = ty * TILE;
      if (prevBottom > surface + 0.5 || nextBottom < surface) continue;
      for (let tx = x0; tx <= x1; tx++) {
        if (this.platformAt(tx, ty)) return surface;
      }
    }
    return null;
  }

  /** Distance from a point straight down to the first solid tile, in pixels. */
  groundBelow(x: number, y: number, maxTiles = 24): number {
    const tx = Math.floor(x / TILE);
    let ty = Math.floor(y / TILE);
    for (let i = 0; i < maxTiles; i++) {
      ty++;
      if (this.solidAt(tx, ty) || this.platformAt(tx, ty)) return ty * TILE - y;
    }
    return maxTiles * TILE;
  }

  clampX(x: number, w: number): number {
    return clamp(x, 0, this.pixelWidth - w);
  }
}
