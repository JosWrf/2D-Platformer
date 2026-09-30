import { Rng, clamp } from '../core/math';
import { CHUNK_H, LEVEL_CHUNKS } from './levelData';
import { CHAR_TO_SPAWN, CHAR_TO_TILE, Spawn, TILE, Tile, isHazard, isPlatform, isSolid } from './tiles';

/**
 * A boss arena: the stretch between two wards. Built from the level itself - a
 * chunk that has wards in it is an arena, the leftmost ward column its way in
 * and the rightmost its way out.
 */
export interface Arena {
  /** Column of the ward the hero comes in through. */
  readonly entryTx: number;
  /** Column of the ward that bars the way on. */
  readonly exitTx: number;
  /** World x of the first and last pixel inside. */
  readonly left: number;
  readonly right: number;
  /** The fight is on: both wards stand. */
  fighting: boolean;
  /** Its boss has fallen: both wards are down for good. */
  cleared: boolean;
}

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
  /** The hydra's own portcullis, at both ends of her shaft. */
  lairClosed = false;
  /** World x just right of the gate - everything beyond it is the arena. */
  readonly arenaLeft: number;
  /** The way out of the throne room stays shut until the knight falls. */
  exitSealed = true;
  /** Every warded boss arena, left to right. */
  readonly arenas: Arena[] = [];
  /** Which arena a ward column belongs to, or -1. */
  private readonly wardArena: Int16Array;
  /**
   * Treat every ward as open. Only for the static reachability check, which
   * asks whether the road exists at all - the same reason it opens the seal.
   */
  wardsOpen = false;

  constructor() {
    let width = 0;
    for (const chunk of LEVEL_CHUNKS) width += chunk.width;
    this.width = width;
    this.pixelWidth = width * TILE;
    this.pixelHeight = this.height * TILE;
    this.tiles = new Uint8Array(width * this.height);
    this.decorNoise = new Float32Array(width * this.height);

    const rng = new Rng(0xc0ffee);
    this.wardArena = new Int16Array(width).fill(-1);
    let gateTx = -1;
    let offsetX = 0;
    for (const chunk of LEVEL_CHUNKS) {
      let wardMin = Infinity;
      let wardMax = -Infinity;
      for (let ty = 0; ty < this.height; ty++) {
        const row = chunk.rows[ty] ?? '';
        for (let cx = 0; cx < chunk.width; cx++) {
          const ch = row[cx] ?? '.';
          const tx = offsetX + cx;
          const tile = CHAR_TO_TILE[ch];
          if (tile !== undefined) {
            this.tiles[ty * width + tx] = tile;
            if (tile === Tile.Gate) gateTx = Math.max(gateTx, tx);
            if (tile === Tile.Ward) {
              wardMin = Math.min(wardMin, tx);
              wardMax = Math.max(wardMax, tx);
            }
          } else {
            const spawn = CHAR_TO_SPAWN[ch];
            if (spawn) this.spawns.push({ kind: spawn, tx, ty });
          }
        }
      }
      if (wardMax > wardMin) {
        const index = this.arenas.length;
        this.arenas.push({
          entryTx: wardMin,
          exitTx: wardMax,
          left: (wardMin + 1) * TILE,
          right: wardMax * TILE,
          fighting: false,
          cleared: false,
        });
        this.wardArena[wardMin] = index;
        this.wardArena[wardMax] = index;
      }
      offsetX += chunk.width;
    }
    for (let i = 0; i < this.decorNoise.length; i++) this.decorNoise[i] = rng.next();
    this.arenaLeft = (gateTx + 1) * TILE;
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
    if (t === Tile.LairGate) return this.lairClosed;
    if (t === Tile.Seal) return this.exitSealed;
    if (t === Tile.Ward) return this.wardClosed(tx);
    return isSolid(t);
  }

  /**
   * Whether the ward in this column stands. The way in only closes behind a
   * fight; the way on stands until the boss is gone.
   */
  wardClosed(tx: number): boolean {
    if (this.wardsOpen) return false;
    const arena = this.arenas[this.wardArena[tx] ?? -1];
    if (!arena || arena.cleared) return false;
    return tx === arena.entryTx ? arena.fighting : true;
  }

  /** The arena a world x lies in, wards included, if any. */
  arenaAt(x: number): Arena | null {
    for (const arena of this.arenas) {
      if (x >= arena.left - TILE && x < arena.right + TILE) return arena;
    }
    return null;
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
