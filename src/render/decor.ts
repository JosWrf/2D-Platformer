import { Rng } from '../core/math';
import type { Particles } from '../fx/particles';
import { PALETTE } from './palette';
import { glow } from './sprites';

export type DecorKind = 'torch' | 'crystal';

export type DecorMount = 'ground' | 'hanging';

export class Decor {
  private readonly seed: number;
  private anim: number;

  constructor(
    readonly kind: DecorKind,
    readonly x: number,
    readonly y: number,
    /** Standing on the floor, or suspended from the ceiling above. */
    readonly mount: DecorMount = 'ground',
    /** Distance up to the ceiling the decoration hangs from. */
    readonly hangLength = 24,
  ) {
    const rng = new Rng(Math.floor(x * 31 + y * 17) + 1);
    this.seed = rng.next();
    this.anim = this.seed * 10;
  }

  update(dt: number, particles: Particles, visible: boolean): void {
    this.anim += dt;
    if (!visible || this.kind !== 'torch') return;
    if (Math.random() < 0.22) {
      particles.spawn({
        x: this.x + 8 + (Math.random() - 0.5) * 4,
        y: this.y + 4,
        vx: (Math.random() - 0.5) * 12,
        vy: -Math.random() * 34 - 12,
        color: Math.random() < 0.5 ? 'rgba(255,180,80,0.85)' : 'rgba(255,110,40,0.7)',
        gravity: -30,
        size: 2 + Math.random() * 2,
        life: 0.5 + Math.random() * 0.4,
        shape: 'circle',
        drag: 0.98,
      });
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.kind === 'torch') {
      const flicker = 0.8 + Math.sin(this.anim * 9 + this.seed * 6) * 0.12 + Math.random() * 0.06;
      if (this.mount === 'hanging') {
        // Chain up to the ceiling.
        ctx.strokeStyle = '#39323f';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.x + 8, this.y - this.hangLength);
        ctx.lineTo(this.x + 8, this.y + 4);
        ctx.stroke();
        ctx.fillStyle = '#4a4652';
        for (let i = 0; i < Math.floor(this.hangLength / 8); i++) {
          ctx.fillRect(this.x + 6, this.y - this.hangLength + i * 8, 4, 4);
        }
        // Brazier bowl.
        ctx.fillStyle = '#2b2a33';
        ctx.beginPath();
        ctx.moveTo(this.x - 2, this.y + 4);
        ctx.lineTo(this.x + 18, this.y + 4);
        ctx.lineTo(this.x + 14, this.y + 13);
        ctx.lineTo(this.x + 2, this.y + 13);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#57505f';
        ctx.fillRect(this.x - 2, this.y + 4, 20, 3);
      } else {
        // Iron stand rising from the floor.
        ctx.fillStyle = '#2b2a33';
        ctx.fillRect(this.x + 5, this.y + 8, 6, this.hangLength);
        ctx.fillRect(this.x, this.y + 6 + this.hangLength, 16, 4);
        ctx.fillStyle = '#4a4652';
        ctx.beginPath();
        ctx.moveTo(this.x - 1, this.y + 3);
        ctx.lineTo(this.x + 17, this.y + 3);
        ctx.lineTo(this.x + 13, this.y + 11);
        ctx.lineTo(this.x + 3, this.y + 11);
        ctx.closePath();
        ctx.fill();
      }
      glow(ctx, this.x + 8, this.y + 2, 62 * flicker, 'rgba(255,150,60,0.30)');
      // Flame.
      ctx.fillStyle = '#ff8a2b';
      ctx.beginPath();
      ctx.moveTo(this.x + 8, this.y - 12 * flicker);
      ctx.quadraticCurveTo(this.x + 15, this.y + 2, this.x + 8, this.y + 7);
      ctx.quadraticCurveTo(this.x + 1, this.y + 2, this.x + 8, this.y - 12 * flicker);
      ctx.fill();
      ctx.fillStyle = '#ffdf7a';
      ctx.beginPath();
      ctx.moveTo(this.x + 8, this.y - 5 * flicker);
      ctx.quadraticCurveTo(this.x + 12, this.y + 2, this.x + 8, this.y + 5);
      ctx.quadraticCurveTo(this.x + 4, this.y + 2, this.x + 8, this.y - 5 * flicker);
      ctx.fill();
    } else {
      const pulse = 0.75 + Math.sin(this.anim * 2 + this.seed * 8) * 0.25;
      const flip = this.mount === 'hanging' ? -1 : 1;
      glow(ctx, this.x + 16, this.y + 16 * flip, 46 * pulse, 'rgba(99,230,255,0.22)');
      ctx.save();
      if (flip < 0) {
        ctx.translate(0, this.y * 2 + 30);
        ctx.scale(1, -1);
      }
      const shards: [number, number, number][] = [
        [16, 30, 26],
        [7, 30, 16],
        [25, 30, 12],
      ];
      for (const [cx, base, height] of shards) {
        ctx.fillStyle = PALETTE.crystalDeep;
        ctx.beginPath();
        ctx.moveTo(this.x + cx, this.y + base - height);
        ctx.lineTo(this.x + cx + 5, this.y + base - height * 0.4);
        ctx.lineTo(this.x + cx + 3, this.y + base);
        ctx.lineTo(this.x + cx - 3, this.y + base);
        ctx.lineTo(this.x + cx - 5, this.y + base - height * 0.4);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = PALETTE.crystal;
        ctx.globalAlpha = 0.75;
        ctx.beginPath();
        ctx.moveTo(this.x + cx, this.y + base - height);
        ctx.lineTo(this.x + cx + 2, this.y + base - height * 0.35);
        ctx.lineTo(this.x + cx, this.y + base);
        ctx.lineTo(this.x + cx - 2, this.y + base - height * 0.35);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }
  }
}
