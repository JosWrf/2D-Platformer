import { Rect, rectsOverlap } from '../core/math';
import { PALETTE } from '../render/palette';
import { glow } from '../render/sprites';
import type { World } from '../world/context';
import { Body } from './entity';

export type ProjectileKind = 'orb' | 'bone' | 'shockwave' | 'rock';

export class Projectile extends Body {
  friendly = false;
  damage = 1;
  life = 4;
  spin = 0;
  private age = 0;

  constructor(
    public kind: ProjectileKind,
    x: number,
    y: number,
    vx: number,
    vy: number,
  ) {
    super();
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    switch (kind) {
      case 'orb':
        this.w = 14;
        this.h = 14;
        break;
      case 'bone':
        this.w = 12;
        this.h = 12;
        break;
      case 'shockwave':
        this.w = 26;
        this.h = 30;
        this.life = 2.6;
        this.damage = 2;
        break;
      case 'rock':
        this.w = 20;
        this.h = 20;
        this.damage = 2;
        break;
    }
  }

  overlaps(r: Rect): boolean {
    return rectsOverlap(this.rect, r);
  }

  deflect(dir: number): void {
    this.friendly = true;
    this.vx = Math.abs(this.vx || 260) * dir * 1.5;
    this.vy *= 0.3;
    this.damage = 2;
  }

  update(dt: number, world: World): void {
    this.age += dt;
    this.life -= dt;
    this.spin += dt * 9;
    if (this.life <= 0) {
      this.dead = true;
      return;
    }

    if (this.kind === 'orb') {
      // Gentle homing while it is still an enemy projectile.
      if (!this.friendly && this.age < 1.1) {
        const dx = world.player.cx - this.cx;
        const dy = world.player.cy - this.cy;
        const len = Math.hypot(dx, dy) || 1;
        this.vx += (dx / len) * 190 * dt;
        this.vy += (dy / len) * 190 * dt;
      }
      if (world.time % 0.05 < dt) {
        world.particles.spawn({
          x: this.cx,
          y: this.cy,
          vx: 0,
          vy: 0,
          gravity: -20,
          color: this.friendly ? 'rgba(160,230,255,0.7)' : 'rgba(200,90,230,0.7)',
          size: 4,
          life: 0.3,
          shape: 'circle',
        });
      }
    } else if (this.kind === 'bone' || this.kind === 'rock') {
      this.vy += 900 * dt;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (this.kind === 'shockwave') {
      // Rides along the floor and dies against a wall.
      const level = world.level;
      if (level.rectHitsSolid(this.x, this.y, this.w, this.h)) {
        this.dead = true;
        world.particles.burst(this.cx, this.cy, 12, '#ff9a5c', { speed: 150 });
      }
      const drop = world.level.groundBelow(this.cx, this.y + this.h - 4, 3);
      if (drop > 6) this.y += Math.min(drop, 260 * dt);
    } else if (world.level.rectHitsSolid(this.x, this.y, this.w, this.h)) {
      this.dead = true;
      world.particles.burst(this.cx, this.cy, 10, this.hitColor(), { speed: 130 });
    }

    if (this.x < -80 || this.x > world.level.pixelWidth + 80 || this.y > world.level.pixelHeight + 80) {
      this.dead = true;
    }
  }

  private hitColor(): string {
    switch (this.kind) {
      case 'orb':
        return this.friendly ? '#8fe6ff' : PALETTE.mage;
      case 'bone':
        return PALETTE.skeleton;
      case 'rock':
        return '#8a7460';
      default:
        return '#ff9a5c';
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const cx = this.cx;
    const cy = this.cy;
    switch (this.kind) {
      case 'orb': {
        const color = this.friendly ? '#8fe6ff' : '#d46bf0';
        glow(ctx, cx, cy, 18, this.friendly ? 'rgba(140,230,255,0.55)' : 'rgba(210,90,240,0.5)');
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(cx, cy, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(cx - 1.5, cy - 1.5, 2.4, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'bone': {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.spin);
        ctx.fillStyle = PALETTE.skeleton;
        ctx.fillRect(-6, -2, 12, 4);
        ctx.fillRect(-7, -4, 3, 8);
        ctx.fillRect(4, -4, 3, 8);
        ctx.restore();
        break;
      }
      case 'rock': {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.spin * 0.5);
        ctx.fillStyle = '#6b5747';
        ctx.beginPath();
        ctx.moveTo(-10, -4);
        ctx.lineTo(-3, -10);
        ctx.lineTo(8, -6);
        ctx.lineTo(10, 4);
        ctx.lineTo(1, 10);
        ctx.lineTo(-8, 6);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#8a7460';
        ctx.fillRect(-4, -4, 5, 4);
        ctx.restore();
        break;
      }
      case 'shockwave': {
        const a = Math.min(1, this.life / 1.5);
        glow(ctx, cx, this.y + this.h, 34, 'rgba(255,120,60,0.45)', a);
        ctx.globalAlpha = a;
        ctx.fillStyle = '#ff8a45';
        ctx.beginPath();
        ctx.moveTo(this.x, this.y + this.h);
        ctx.lineTo(this.x + this.w * 0.5, this.y + Math.sin(this.spin * 3) * 3);
        ctx.lineTo(this.x + this.w, this.y + this.h);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ffd08a';
        ctx.beginPath();
        ctx.moveTo(this.x + this.w * 0.28, this.y + this.h);
        ctx.lineTo(this.x + this.w * 0.5, this.y + this.h * 0.35);
        ctx.lineTo(this.x + this.w * 0.72, this.y + this.h);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
        break;
      }
    }
  }
}
