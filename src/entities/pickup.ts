import { audio } from '../core/audio';
import { Rect, rectsOverlap } from '../core/math';
import { PALETTE } from '../render/palette';
import { glow } from '../render/sprites';
import type { World } from '../world/context';

export type PickupKind = 'gem' | 'heart';

export class Pickup {
  x: number;
  y: number;
  w = 16;
  h = 16;
  dead = false;
  /** Stable id so collected pickups stay collected after a respawn. */
  id = '';
  private anim = Math.random() * 6;

  constructor(
    readonly kind: PickupKind,
    x: number,
    y: number,
  ) {
    this.x = x;
    this.y = y;
    if (kind === 'heart') {
      this.w = 20;
      this.h = 18;
    }
  }

  get rect(): Rect {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  update(dt: number, world: World): void {
    this.anim += dt;
    const player = world.player;
    if (!player.dead && rectsOverlap(this.rect, player.rect)) {
      this.dead = true;
      if (this.kind === 'gem') {
        audio.play('coin');
        world.addScore(50, this.x + this.w / 2, this.y, '+50');
        world.particles.burst(this.x + 8, this.y + 8, 12, PALETTE.gold, { speed: 130, gravity: 220 });
      } else {
        audio.play('heal');
        player.heal(2);
        world.particles.text(this.x + 10, this.y - 4, '+2 LEBEN', PALETTE.hearts);
        world.particles.burst(this.x + 10, this.y + 8, 16, PALETTE.hearts, { speed: 140, gravity: 180, shape: 'circle' });
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const bob = Math.sin(this.anim * 2.6) * 3;
    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2 + bob;
    if (this.kind === 'gem') {
      glow(ctx, cx, cy, 16, 'rgba(242,193,78,0.35)');
      ctx.save();
      ctx.translate(cx, cy);
      const spin = Math.cos(this.anim * 2.2);
      ctx.scale(Math.max(0.25, Math.abs(spin)), 1);
      ctx.fillStyle = PALETTE.gold;
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(6, -2);
      ctx.lineTo(0, 8);
      ctx.lineTo(-6, -2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff0b8';
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(3, -2);
      ctx.lineTo(0, 2);
      ctx.lineTo(-3, -2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else {
      glow(ctx, cx, cy, 20, 'rgba(255,87,115,0.35)');
      ctx.save();
      ctx.translate(cx, cy);
      const pulse = 1 + Math.sin(this.anim * 4) * 0.07;
      ctx.scale(pulse, pulse);
      ctx.fillStyle = PALETTE.hearts;
      ctx.beginPath();
      ctx.moveTo(0, 7);
      ctx.bezierCurveTo(-11, -2, -6, -10, 0, -4);
      ctx.bezierCurveTo(6, -10, 11, -2, 0, 7);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.ellipse(-3, -3, 2, 1.4, -0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

export class Checkpoint {
  x: number;
  y: number;
  w = 24;
  h = 56;
  activated = false;
  private anim = 0;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  get rect(): Rect {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  update(dt: number, world: World): boolean {
    this.anim += dt;
    if (this.activated) return false;
    if (rectsOverlap(this.rect, world.player.rect)) {
      this.activated = true;
      audio.play('checkpoint');
      world.particles.text(this.x + 12, this.y - 6, 'GESICHERT', '#8fe6ff');
      world.particles.burst(this.x + 12, this.y + 20, 26, '#8fe6ff', { speed: 160, gravity: -60, shape: 'circle' });
      return true;
    }
    return false;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const x = this.x;
    const y = this.y;
    // Pole.
    ctx.fillStyle = '#3a3f56';
    ctx.fillRect(x + 4, y, 5, this.h);
    ctx.fillStyle = '#565d7d';
    ctx.fillRect(x + 4, y, 2, this.h);
    ctx.fillStyle = '#2a2e40';
    ctx.fillRect(x, y + this.h - 4, 14, 4);

    if (this.activated) glow(ctx, x + 8, y + 6, 26, 'rgba(140,230,255,0.35)');
    // Banner.
    const wave = Math.sin(this.anim * 3) * 2.5;
    ctx.fillStyle = this.activated ? '#3aa6d8' : '#5a4152';
    ctx.beginPath();
    ctx.moveTo(x + 9, y + 4);
    ctx.lineTo(x + 30 + wave, y + 9 + wave * 0.4);
    ctx.lineTo(x + 22, y + 18);
    ctx.lineTo(x + 30 + wave, y + 27 + wave * 0.4);
    ctx.lineTo(x + 9, y + 30);
    ctx.closePath();
    ctx.fill();
    if (this.activated) {
      ctx.fillStyle = '#8fe6ff';
      ctx.fillRect(x + 13, y + 12, 5, 5);
    }
  }
}
