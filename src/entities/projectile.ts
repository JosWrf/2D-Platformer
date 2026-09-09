import { Rect, rand, rectsOverlap } from '../core/math';
import { PALETTE } from '../render/palette';
import { glow } from '../render/sprites';
import type { World } from '../world/context';
import { Body } from './entity';

export type ProjectileKind = 'orb' | 'bone' | 'shockwave' | 'rock' | 'beam';

export class Projectile extends Body {
  friendly = false;
  /**
   * Whether a swing of the blade turns it aside. True for everything thrown or
   * cast - that is what the blade is for. Thalassa's flood waves set it false:
   * a wall of water is not something a blind swing can bat away, it has to be
   * jumped or parried. Measured on her before that: a player who simply held
   * the attack key swatted every wave she made and sent it back into her for
   * two, which is why he could kill her without being touched once.
   */
  deflectable = true;
  /**
   * Drawn as water rather than as force. Thalassa's flood waves set it: they
   * used to come up the hall in the knight's fire colours, which looked wrong
   * in a drowned choir and, once they stopped being deflectable, read as the
   * same thing his are.
   */
  water = false;
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
      case 'beam':
        // The crescent thrown off an upgraded blade. Short-lived on purpose:
        // it is a reach extension, not a gun.
        this.w = 30;
        this.h = 20;
        this.life = 0.62;
        this.damage = 1;
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
    } else if (this.kind === 'beam') {
      // Flies flat and thins out as it goes, so its reach can be read.
      if (world.time % 0.03 < dt) {
        world.particles.spawn({
          x: this.cx - Math.sign(this.vx) * 8,
          y: this.cy,
          vx: -this.vx * 0.08,
          vy: rand(-24, 24),
          color: 'rgba(190,240,255,0.6)',
          size: 2.5,
          life: 0.22,
          shape: 'spark',
        });
      }
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (this.kind === 'shockwave') {
      // Rides along the floor and dies against a wall.
      const level = world.level;
      if (level.rectHitsSolid(this.x, this.y, this.w, this.h)) {
        this.dead = true;
        world.particles.burst(this.cx, this.cy, 12, this.hitColor(), { speed: 150 });
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
      case 'beam':
        return '#bff0ff';
      case 'shockwave':
        return this.water ? '#9fe4dc' : '#ff9a5c';
      default:
        return '#ff9a5c';
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const cx = this.cx;
    const cy = this.cy;
    switch (this.kind) {
      case 'beam': {
        // A crescent of light, leaning the way it flies, with the tips drawn
        // back: it has to read as thrown off a blade, not as a bullet.
        const dir = Math.sign(this.vx) || 1;
        const fade = Math.max(0, Math.min(1, this.life / 0.4));
        glow(ctx, cx, cy, 26 * fade, `rgba(150,230,255,${(0.4 * fade).toFixed(2)})`);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(dir, 1);
        ctx.globalCompositeOperation = 'lighter';
        for (const [w, alpha, color] of [
          [1, 0.5 * fade, '#5ec8ff'],
          [0.62, 0.85 * fade, '#e8fbff'],
        ] as const) {
          ctx.globalAlpha = alpha;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.moveTo(13 * w, 0);
          ctx.quadraticCurveTo(2 * w, -11 * w, -13 * w, -8 * w);
          ctx.quadraticCurveTo(-1 * w, 0, -13 * w, 8 * w);
          ctx.quadraticCurveTo(2 * w, 11 * w, 13 * w, 0);
          ctx.closePath();
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.restore();
        break;
      }
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
        const [halo, body, crest] = this.water
          ? ['rgba(110,225,215,0.4)', '#2f93a0', '#d8faf4']
          : ['rgba(255,120,60,0.45)', '#ff8a45', '#ffd08a'];
        glow(ctx, cx, this.y + this.h, 34, halo, a);
        ctx.globalAlpha = a;
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y + this.h);
        ctx.lineTo(this.x + this.w * 0.5, this.y + Math.sin(this.spin * 3) * 3);
        ctx.lineTo(this.x + this.w, this.y + this.h);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = crest;
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
