import { Rect, TAU, rectsOverlap } from '../core/math';
import { glow } from '../render/sprites';

/**
 * The way home at the far end of the rift. Standing in it ends the run - it is
 * the goal the whole level now points at, since the knight's fall only opens
 * the road rather than finishing it.
 */
export class Portal {
  readonly w = 44;
  readonly h = 62;
  private anim = 0;

  constructor(
    readonly x: number,
    readonly y: number,
  ) {}

  get cx(): number {
    return this.x + this.w / 2;
  }

  get cy(): number {
    return this.y + this.h / 2;
  }

  get rect(): Rect {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  update(dt: number): void {
    this.anim += dt;
  }

  overlaps(r: Rect): boolean {
    return rectsOverlap(this.rect, r);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const cx = this.cx;
    const cy = this.cy;
    const pulse = 0.85 + Math.sin(this.anim * 2.2) * 0.15;

    glow(ctx, cx, cy, 58 * pulse, 'rgba(180,130,255,0.4)');

    // The frame: two standing stones and a lintel, cracked open.
    ctx.fillStyle = '#241a33';
    ctx.fillRect(this.x - 4, this.y + 6, 7, this.h - 6);
    ctx.fillRect(this.x + this.w - 3, this.y + 6, 7, this.h - 6);
    ctx.fillRect(this.x - 4, this.y, this.w + 8, 8);
    ctx.fillStyle = '#3b2b52';
    ctx.fillRect(this.x - 4, this.y, this.w + 8, 3);

    // The tear itself, drawn as nested ovals that breathe.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 3; i >= 0; i--) {
      const t = i / 3;
      const rx = (this.w / 2 - 4) * (0.35 + t * 0.65) * pulse;
      const ry = (this.h / 2 - 6) * (0.35 + t * 0.65) * pulse;
      ctx.fillStyle = `rgba(${170 - i * 20},${110 + i * 30},255,${(0.5 - t * 0.28).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(cx, cy + 4, rx, ry, 0, 0, TAU);
      ctx.fill();
    }
    // Motes falling upwards into the tear.
    for (let i = 0; i < 6; i++) {
      const a = this.anim * 1.4 + i * 1.05;
      const r = ((a % 1) * 26) % 26;
      ctx.globalAlpha = 1 - r / 26;
      ctx.fillStyle = '#e8d8ff';
      ctx.fillRect(cx + Math.cos(a * 2.3) * (22 - r) - 1, cy + 4 + Math.sin(a * 1.7) * (26 - r), 2, 2);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}
