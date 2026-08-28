import { Rect } from '../core/math';
import { Level } from '../world/level';
import { TILE } from '../world/tiles';

export interface CollisionFlags {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

/** Axis-separated AABB body with sub-stepped tile collision. */
export abstract class Body implements Rect {
  x = 0;
  y = 0;
  w = 16;
  h = 16;
  vx = 0;
  vy = 0;
  onGround = false;
  dead = false;
  /** Set by moving platforms so riders inherit their motion. */
  carryX = 0;
  readonly touching: CollisionFlags = { left: false, right: false, up: false, down: false };
  /** Ignore one-way platforms (used while dropping through them). */
  ignorePlatforms = false;

  get cx(): number {
    return this.x + this.w / 2;
  }

  get cy(): number {
    return this.y + this.h / 2;
  }

  get bottom(): number {
    return this.y + this.h;
  }

  get rect(): Rect {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  moveAndCollide(level: Level, dt: number): void {
    this.touching.left = this.touching.right = this.touching.up = this.touching.down = false;
    const dx = this.vx * dt + this.carryX;
    const dy = this.vy * dt;
    this.carryX = 0;

    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (TILE * 0.4)));
    const stepX = dx / steps;
    const stepY = dy / steps;

    for (let i = 0; i < steps; i++) {
      if (stepX !== 0) {
        const nx = this.x + stepX;
        if (level.rectHitsSolid(nx, this.y, this.w, this.h)) {
          // Snap flush against the blocking tile.
          if (stepX > 0) {
            this.x = Math.floor((nx + this.w) / TILE) * TILE - this.w - 0.001;
            this.touching.right = true;
          } else {
            this.x = (Math.floor(nx / TILE) + 1) * TILE + 0.001;
            this.touching.left = true;
          }
          this.vx = 0;
        } else {
          this.x = nx;
        }
      }

      if (stepY !== 0) {
        const prevBottom = this.y + this.h;
        const ny = this.y + stepY;
        if (level.rectHitsSolid(this.x, ny, this.w, this.h)) {
          if (stepY > 0) {
            this.y = Math.floor((ny + this.h) / TILE) * TILE - this.h - 0.001;
            this.touching.down = true;
          } else {
            this.y = (Math.floor(ny / TILE) + 1) * TILE + 0.001;
            this.touching.up = true;
          }
          this.vy = 0;
        } else {
          if (!this.ignorePlatforms && stepY > 0) {
            const surface = level.platformSurfaceBelow(this.x, this.w, prevBottom, ny + this.h);
            if (surface !== null) {
              this.y = surface - this.h - 0.001;
              this.vy = 0;
              this.touching.down = true;
              continue;
            }
          }
          this.y = ny;
        }
      }
    }

    this.onGround = this.touching.down;
  }
}
