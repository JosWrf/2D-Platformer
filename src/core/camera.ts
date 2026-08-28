import { clamp, damp, rand } from './math';

export class Camera {
  x = 0;
  y = 0;
  shake = 0;
  offsetX = 0;
  offsetY = 0;

  constructor(
    readonly viewW: number,
    readonly viewH: number,
  ) {}

  worldBounds = { w: 4000, h: 1000 };

  snapTo(targetX: number, targetY: number): void {
    this.x = clamp(targetX - this.viewW / 2, 0, Math.max(0, this.worldBounds.w - this.viewW));
    this.y = clamp(targetY - this.viewH / 2, 0, Math.max(0, this.worldBounds.h - this.viewH));
  }

  follow(targetX: number, targetY: number, lookAhead: number, dt: number): void {
    const desiredX = targetX + lookAhead - this.viewW / 2;
    const desiredY = targetY - this.viewH * 0.58;
    this.x = damp(this.x, desiredX, 7, dt);
    this.y = damp(this.y, desiredY, 5.5, dt);
    this.x = clamp(this.x, 0, Math.max(0, this.worldBounds.w - this.viewW));
    this.y = clamp(this.y, 0, Math.max(0, this.worldBounds.h - this.viewH));

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 26);
      this.offsetX = rand(-this.shake, this.shake);
      this.offsetY = rand(-this.shake, this.shake);
    } else {
      this.offsetX = 0;
      this.offsetY = 0;
    }
  }

  addShake(amount: number): void {
    this.shake = Math.min(16, this.shake + amount);
  }

  get renderX(): number {
    return Math.round(this.x + this.offsetX);
  }

  get renderY(): number {
    return Math.round(this.y + this.offsetY);
  }
}
