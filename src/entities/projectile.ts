import { Rect, rand, rectsOverlap } from '../core/math';
import { PALETTE } from '../render/palette';
import { glow } from '../render/sprites';
import type { World } from '../world/context';
import { Body } from './entity';

export type ProjectileKind = 'orb' | 'bone' | 'shockwave' | 'rock' | 'beam' | 'blob' | 'ember';

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
      case 'blob':
        // Slime, spat on an arc. Slower and fatter than a bone, and worth one
        // heart: it is the first thing in the game a player learns to bat out
        // of the air with the blade.
        this.w = 16;
        this.h = 16;
        this.life = 3;
        this.damage = 1;
        break;
      case 'ember':
        // The hydra's fire, lobbed on a solved arc. It is her attack and the
        // hero's only tool at once - see deflect.
        this.w = 18;
        this.h = 18;
        this.life = 3.2;
        this.damage = 2;
        break;
    }
  }

  overlaps(r: Rect): boolean {
    return rectsOverlap(this.rect, r);
  }

  deflect(dir: number): void {
    this.friendly = true;
    if (this.kind === 'ember') {
      /*
       * Her fire flies flat once it has been turned. That is the whole of the
       * aiming in her fight: whatever height the hero parries at is the height
       * the ember travels at, so where he is standing is where he is aiming.
       * An arc would make lining a stump up a matter of luck.
       */
      this.vx = 420 * dir;
      this.vy = 0;
      this.life = Math.max(this.life, 1.6);
      this.damage = 2;
      return;
    }
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
    } else if (this.kind === 'ember') {
      // Falls until it is turned; a turned ember carries its own fire.
      if (!this.friendly) this.vy += 1000 * dt;
      if (world.time % 0.04 < dt) {
        world.particles.spawn({
          x: this.cx + rand(-5, 5),
          y: this.cy + rand(-5, 5),
          vx: rand(-14, 14),
          vy: -rand(20, 60),
          gravity: -40,
          color: this.friendly ? 'rgba(255,226,150,0.75)' : 'rgba(255,150,60,0.7)',
          size: 3,
          life: 0.32,
          shape: 'circle',
        });
      }
    } else if (this.kind === 'blob') {
      // Heavier than it looks, so the arc is short and readable.
      this.vy += 1150 * dt;
      if (world.time % 0.06 < dt) {
        world.particles.spawn({
          x: this.cx + rand(-4, 4),
          y: this.cy + rand(-4, 4),
          vx: -this.vx * 0.05,
          vy: rand(-10, 20),
          color: 'rgba(150,220,110,0.55)',
          size: 2.5,
          life: 0.3,
          shape: 'circle',
        });
      }
    } else if (this.kind === 'beam') {
      // Flies flat and thins out as it goes, so its reach can be read.
      if (world.time % 0.03 < dt) {
        world.particles.spawn({
          x: this.cx - Math.sign(this.vx) * 8,
          y: this.cy,
          vx: -this.vx * 0.08,
          vy: rand(-24, 24),
          color: this.water ? 'rgba(170,240,225,0.6)' : 'rgba(190,240,255,0.6)',
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
      case 'blob':
        return this.friendly ? '#bdf0a0' : '#8fd45c';
      case 'ember':
        return this.friendly ? '#ffe9b0' : '#ff9a44';
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
        // The first tier of the blade throws water rather than light, and a
        // smaller crescent: the eye should be able to tell them apart.
        const size = this.water ? 0.8 : 1;
        glow(
          ctx,
          cx,
          cy,
          26 * fade * size,
          this.water
            ? `rgba(140,235,220,${(0.35 * fade).toFixed(2)})`
            : `rgba(150,230,255,${(0.4 * fade).toFixed(2)})`,
        );
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(dir * size, size);
        ctx.globalCompositeOperation = 'lighter';
        const [edge, core] = this.water ? ['#3fc8b8', '#dcfaf2'] : ['#5ec8ff', '#e8fbff'];
        for (const [w, alpha, color] of [
          [1, 0.5 * fade, edge],
          [0.62, 0.85 * fade, core],
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
      case 'blob': {
        // A wobbling drop of slime, squashed along the way it is flying, with a
        // brighter skin on top so it reads as wet rather than as a rock.
        const wob = Math.sin(this.spin * 1.6) * 0.14;
        glow(ctx, cx, cy, 16, 'rgba(150,225,110,0.4)');
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(Math.atan2(this.vy, this.vx) * 0.35);
        ctx.scale(1.15 + wob, 0.85 - wob);
        ctx.fillStyle = this.friendly ? '#bdf0a0' : '#77c246';
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(220,255,190,0.75)';
        ctx.beginPath();
        ctx.ellipse(-2, -2.5, 3.4, 2.2, -0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'ember': {
        /*
         * Two readings of the same thing: hers is a falling coal trailing
         * smoke, the turned one is a white-hot bolt with a tail. A player has
         * to be able to tell at a glance whether the fire on screen is still a
         * threat or already a tool.
         */
        const hot = this.friendly;
        glow(ctx, cx, cy, hot ? 26 : 20, hot ? 'rgba(255,220,140,0.6)' : 'rgba(255,130,50,0.5)');
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(Math.atan2(this.vy, this.vx));
        const len = hot ? 20 : 11;
        const tail = ctx.createLinearGradient(-len, 0, len * 0.5, 0);
        tail.addColorStop(0, 'rgba(255,120,40,0)');
        tail.addColorStop(1, hot ? 'rgba(255,238,190,0.95)' : 'rgba(255,168,70,0.9)');
        ctx.fillStyle = tail;
        ctx.beginPath();
        ctx.moveTo(-len, 0);
        ctx.lineTo(0, -7);
        ctx.lineTo(len * 0.5, 0);
        ctx.lineTo(0, 7);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = hot ? '#fffbe8' : '#ffd28a';
        ctx.beginPath();
        ctx.arc(0, 0, hot ? 5 : 4.2, 0, Math.PI * 2);
        ctx.fill();
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
