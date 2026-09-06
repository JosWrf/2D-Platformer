import { clamp, damp } from './math';

/**
 * How hard the screen may ever be thrown, in pixels. Ten of these on a view
 * 540 tall is already a lot of screen.
 */
const MAX_SHAKE = 9;
/** Every call site's amount goes through this, so the whole game tunes at once. */
const SHAKE_SCALE = 0.55;
/** How fast a shake dies away, in units per second. */
const SHAKE_DECAY = 27;
/**
 * Swings per second. Together with the decay this is about two swings per
 * impact: enough to read as a thump, few enough that it is over before it
 * becomes a buzz.
 */
const SHAKE_HZ = 6.5;

export class Camera {
  x = 0;
  y = 0;
  shake = 0;
  offsetX = 0;
  offsetY = 0;
  /**
   * 0 turns screen shake off for players who cannot look at it. Nothing else
   * about the game changes - this is not a difficulty setting.
   */
  motion = 1;

  private shakeTime = 0;
  private shakeAngle = 0;

  constructor(
    readonly viewW: number,
    readonly viewH: number,
  ) {}

  worldBounds = { w: 4000, h: 1000 };

  snapTo(targetX: number, targetY: number): void {
    this.x = clamp(targetX - this.viewW / 2, 0, Math.max(0, this.worldBounds.w - this.viewW));
    this.y = clamp(targetY - this.viewH * 0.5, 0, Math.max(0, this.worldBounds.h - this.viewH));
  }

  follow(targetX: number, targetY: number, lookAhead: number, dt: number): void {
    const desiredX = targetX + lookAhead - this.viewW / 2;
    const desiredY = targetY - this.viewH * 0.58;
    this.x = damp(this.x, desiredX, 7, dt);
    this.y = damp(this.y, desiredY, 5.5, dt);
    this.x = clamp(this.x, 0, Math.max(0, this.worldBounds.w - this.viewW));
    this.y = clamp(this.y, 0, Math.max(0, this.worldBounds.h - this.viewH));

    /*
     * Shake as a swing that dies away, not as noise.
     *
     * This used to pick a fresh random offset every single frame. Uncorrelated
     * jitter at sixty hertz is not impact, it is a strobe: the eye fixes on an
     * edge, and by the time it gets there the edge is somewhere else. That is
     * what made it hurt to look at instead of land as a blow. Now one impact
     * picks one direction, and the screen swings along it and settles - the
     * movement is smooth from frame to frame, so it can be followed.
     */
    if (this.shake > 0.05) {
      this.shakeTime += dt;
      this.shake = Math.max(0, this.shake - dt * SHAKE_DECAY);
      const swing = Math.sin(this.shakeTime * SHAKE_HZ * Math.PI * 2);
      const amount = this.shake * swing * this.motion;
      this.offsetX = Math.cos(this.shakeAngle) * amount;
      // Vertical throw is the uncomfortable one; it gets a fraction.
      this.offsetY = Math.sin(this.shakeAngle) * amount * 0.45;
    } else {
      this.shake = 0;
      this.offsetX = 0;
      this.offsetY = 0;
    }
  }

  addShake(amount: number): void {
    if (this.motion <= 0) return;
    const next = Math.min(MAX_SHAKE, this.shake + amount * SHAKE_SCALE);
    // A fresh impact restarts the swing, so it begins at the centre and throws
    // outwards rather than snapping to wherever the last one happened to be.
    if (next > this.shake + 0.5 || this.shake <= 0.05) {
      this.shakeTime = 0;
      this.shakeAngle = Math.random() * Math.PI * 2;
    }
    this.shake = next;
  }

  get renderX(): number {
    return Math.round(this.x + this.offsetX);
  }

  get renderY(): number {
    return Math.round(this.y + this.offsetY);
  }
}
