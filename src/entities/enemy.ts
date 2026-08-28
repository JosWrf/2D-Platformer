import { audio } from '../core/audio';
import { Rect, approach, clamp, rand, rectsOverlap, sign } from '../core/math';
import { PALETTE } from '../render/palette';
import { shadow, withHitFlash } from '../render/sprites';
import type { World } from '../world/context';
import { Body } from './entity';
import { Projectile } from './projectile';

export type EnemyKind = 'slime' | 'bat' | 'skeleton' | 'mage';

export abstract class Enemy extends Body {
  hp = 2;
  maxHp = 2;
  facing: 1 | -1 = -1;
  flash = 0;
  stun = 0;
  contactDamage = 1;
  scoreValue = 25;
  aggroRange = 240;
  /** Enemies far off-screen are frozen to keep the big level cheap. */
  active = false;
  anim = 0;
  readonly homeX: number;
  readonly homeY: number;

  constructor(
    readonly kind: EnemyKind,
    x: number,
    y: number,
  ) {
    super();
    this.x = x;
    this.y = y;
    this.homeX = x;
    this.homeY = y;
  }

  overlaps(r: Rect): boolean {
    return rectsOverlap(this.rect, r);
  }

  hurt(amount: number, fromDir: number, world: World): void {
    if (this.dead) return;
    this.hp -= amount;
    this.flash = 1;
    this.stun = 0.22;
    this.vx = fromDir * 190;
    this.vy = Math.min(this.vy, -140);
    if (this.hp <= 0) {
      this.die(world);
    } else {
      audio.play('hit');
    }
  }

  protected die(world: World): void {
    this.dead = true;
    audio.play('enemyDie');
    world.addScore(this.scoreValue, this.cx, this.y, `+${this.scoreValue}`);
    world.particles.burst(this.cx, this.cy, 22, this.deathColor(), { speed: 210, gravity: 520, size: 4 });
    world.particles.burst(this.cx, this.cy, 10, '#ffffff', { speed: 120, gravity: 200, shape: 'spark' });
  }

  protected abstract deathColor(): string;

  updateCommon(dt: number): void {
    this.anim += dt;
    this.flash = Math.max(0, this.flash - dt * 5);
    this.stun = Math.max(0, this.stun - dt);
  }

  abstract update(dt: number, world: World): void;
  abstract draw(ctx: CanvasRenderingContext2D, world: World): void;

  /** Touch damage; called by the game each frame. */
  touchPlayer(world: World): void {
    if (this.dead || this.contactDamage <= 0) return;
    const p = world.player;
    if (p.dead || p.isInvulnerable) return;
    if (!rectsOverlap(this.rect, p.rect)) return;
    p.hurt(this.contactDamage, sign(p.cx - this.cx) || 1, world);
  }

  protected drawHpPips(ctx: CanvasRenderingContext2D): void {
    if (this.hp >= this.maxHp || this.maxHp <= 1) return;
    const w = this.w;
    const x = this.x;
    const y = this.y - 8;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x - 1, y - 1, w + 2, 4);
    ctx.fillStyle = '#ff5773';
    ctx.fillRect(x, y, (w * this.hp) / this.maxHp, 2);
  }
}

/* -------------------------------------------------------------------- slime */

export class Slime extends Enemy {
  private hopTimer = rand(0.4, 1.4);
  private dir: 1 | -1 = -1;

  constructor(x: number, y: number) {
    super('slime', x, y);
    this.w = 26;
    this.h = 20;
    this.hp = this.maxHp = 3;
    this.scoreValue = 25;
  }

  protected override deathColor(): string {
    return PALETTE.slime;
  }

  override update(dt: number, world: World): void {
    this.updateCommon(dt);
    this.vy = Math.min(760, this.vy + 1600 * dt);

    if (this.stun <= 0) {
      const player = world.player;
      const distance = player.cx - this.cx;
      if (this.onGround) {
        this.vx = approach(this.vx, 0, 900 * dt);
        this.hopTimer -= dt;
        if (this.hopTimer <= 0) {
          const chasing = Math.abs(distance) < this.aggroRange;
          this.dir = chasing ? (distance > 0 ? 1 : -1) : this.dir;
          this.facing = this.dir;
          this.vy = -350;
          this.vx = this.dir * (chasing ? 130 : 80);
          this.hopTimer = chasing ? rand(0.6, 0.95) : rand(1.1, 1.8);
          world.particles.burst(this.cx, this.bottom, 5, PALETTE.slimeDark, { speed: 60, gravity: 300, size: 3 });
        }
      }
      // Turn around at ledges and walls.
      if (this.touching.left) this.dir = 1;
      if (this.touching.right) this.dir = -1;
    }

    this.moveAndCollide(world.level, dt);
    if (world.level.rectHitsHazard(this.x, this.y, this.w, this.h)) this.hurt(99, 0, world);
  }

  override draw(ctx: CanvasRenderingContext2D): void {
    shadow(ctx, this.cx, this.bottom + 1, this.w * 0.9, 0.3);
    const squish = this.onGround ? Math.sin(this.anim * 6) * 0.06 : clamp(-this.vy / 900, -0.2, 0.25);
    withHitFlash(ctx, this.flash, () => {
      ctx.save();
      ctx.translate(this.cx, this.bottom);
      ctx.scale(1 + squish * 0.6, 1 - squish);
      const g = ctx.createLinearGradient(0, -this.h, 0, 0);
      g.addColorStop(0, PALETTE.slime);
      g.addColorStop(1, PALETTE.slimeDark);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-this.w / 2, 0);
      ctx.quadraticCurveTo(-this.w / 2, -this.h * 1.25, 0, -this.h * 1.2);
      ctx.quadraticCurveTo(this.w / 2, -this.h * 1.25, this.w / 2, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.ellipse(-4, -this.h * 0.75, 4, 2.5, -0.4, 0, Math.PI * 2);
      ctx.fill();
      // Eyes.
      ctx.fillStyle = '#10240f';
      ctx.fillRect(this.facing * 2 - 5, -this.h * 0.62, 3, 4);
      ctx.fillRect(this.facing * 2 + 2, -this.h * 0.62, 3, 4);
      ctx.restore();
    });
    this.drawHpPips(ctx);
  }
}

/* ---------------------------------------------------------------------- bat */

export class Bat extends Enemy {
  private phase = rand(0, Math.PI * 2);
  private diving = false;
  private diveCooldown = rand(0.5, 2);

  constructor(x: number, y: number) {
    super('bat', x, y);
    this.w = 22;
    this.h = 16;
    this.hp = this.maxHp = 2;
    this.scoreValue = 30;
    this.aggroRange = 260;
  }

  protected override deathColor(): string {
    return PALETTE.bat;
  }

  override update(dt: number, world: World): void {
    this.updateCommon(dt);
    this.phase += dt * 3;
    const player = world.player;
    const dx = player.cx - this.cx;
    const dy = player.cy - this.cy;
    const dist = Math.hypot(dx, dy);

    if (this.stun > 0) {
      this.vy += 900 * dt;
    } else if (this.diving) {
      this.diveCooldown -= dt;
      if (this.diveCooldown <= 0) {
        this.diving = false;
        this.diveCooldown = rand(1.2, 2.2);
      }
    } else {
      this.diveCooldown -= dt;
      if (dist < this.aggroRange && this.diveCooldown <= 0) {
        this.diving = true;
        this.diveCooldown = 0.9;
        const len = dist || 1;
        this.vx = (dx / len) * 250;
        this.vy = (dy / len) * 250;
        audio.play('swing', 1.8);
      } else {
        const targetX = dist < this.aggroRange ? player.cx - Math.sign(dx) * 70 : this.homeX;
        const targetY = (dist < this.aggroRange ? player.cy - 60 : this.homeY) + Math.sin(this.phase) * 16;
        this.vx = approach(this.vx, clamp((targetX - this.cx) * 2.2, -140, 140), 420 * dt);
        this.vy = approach(this.vy, clamp((targetY - this.cy) * 2.2, -140, 140), 420 * dt);
      }
    }

    if (Math.abs(this.vx) > 8) this.facing = this.vx > 0 ? 1 : -1;
    this.moveAndCollide(world.level, dt);
    if (this.touching.left || this.touching.right || this.touching.up || this.touching.down) {
      this.diving = false;
      this.vx *= -0.4;
      this.vy *= -0.4;
    }
    if (world.level.rectHitsHazard(this.x, this.y, this.w, this.h)) this.hurt(99, 0, world);
  }

  override draw(ctx: CanvasRenderingContext2D): void {
    withHitFlash(ctx, this.flash, () => {
      ctx.save();
      ctx.translate(this.cx, this.cy);
      const flap = Math.sin(this.anim * 18) * 0.9;
      ctx.fillStyle = PALETTE.batDark;
      for (const s of [-1, 1]) {
        ctx.save();
        ctx.scale(s, 1);
        ctx.rotate(flap * 0.35 * s);
        ctx.beginPath();
        ctx.moveTo(2, -1);
        ctx.quadraticCurveTo(13, -9 - flap * 4, 20, -2 - flap * 3);
        ctx.quadraticCurveTo(13, 1, 9, 5);
        ctx.quadraticCurveTo(6, 2, 2, 3);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = PALETTE.bat;
      ctx.beginPath();
      ctx.ellipse(0, 0, 7, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      // Ears.
      ctx.beginPath();
      ctx.moveTo(-4, -5);
      ctx.lineTo(-6, -11);
      ctx.lineTo(-1, -6);
      ctx.closePath();
      ctx.moveTo(4, -5);
      ctx.lineTo(6, -11);
      ctx.lineTo(1, -6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ff5773';
      ctx.fillRect(this.facing * 2 - 4, -2, 2.5, 2.5);
      ctx.fillRect(this.facing * 2 + 1, -2, 2.5, 2.5);
      ctx.restore();
    });
    this.drawHpPips(ctx);
  }
}

/* ----------------------------------------------------------------- skeleton */

export class Skeleton extends Enemy {
  private state: 'patrol' | 'chase' | 'windup' | 'swing' | 'cooldown' = 'patrol';
  private timer = 0;
  private dir: 1 | -1 = -1;
  private hitPlayerThisSwing = false;

  constructor(x: number, y: number) {
    super('skeleton', x, y);
    this.w = 22;
    this.h = 34;
    this.hp = this.maxHp = 5;
    this.scoreValue = 60;
    this.aggroRange = 230;
  }

  protected override deathColor(): string {
    return PALETTE.skeleton;
  }

  override update(dt: number, world: World): void {
    this.updateCommon(dt);
    this.vy = Math.min(760, this.vy + 1700 * dt);
    const player = world.player;
    const dx = player.cx - this.cx;
    const dist = Math.abs(dx);

    if (this.stun > 0) {
      this.state = 'cooldown';
      this.timer = 0.25;
    } else {
      this.timer -= dt;
      switch (this.state) {
        case 'patrol': {
          this.facing = this.dir;
          this.vx = approach(this.vx, this.dir * 52, 700 * dt);
          if (this.touching.left) this.dir = 1;
          if (this.touching.right) this.dir = -1;
          if (this.onGround && this.isLedgeAhead(world)) this.dir = (-this.dir) as 1 | -1;
          if (dist < this.aggroRange && Math.abs(player.cy - this.cy) < 70) this.state = 'chase';
          break;
        }
        case 'chase': {
          this.dir = dx > 0 ? 1 : -1;
          this.facing = this.dir;
          this.vx = approach(this.vx, this.dir * 108, 900 * dt);
          if (this.onGround && this.isLedgeAhead(world)) this.vx = 0;
          if (dist < 46) {
            this.state = 'windup';
            this.timer = 0.36;
            this.vx = 0;
          } else if (dist > this.aggroRange * 1.5) {
            this.state = 'patrol';
          }
          break;
        }
        case 'windup': {
          this.vx = approach(this.vx, 0, 1400 * dt);
          if (this.timer <= 0) {
            this.state = 'swing';
            this.timer = 0.22;
            this.hitPlayerThisSwing = false;
            this.vx = this.facing * 130;
            audio.play('swing', 0.75);
          }
          break;
        }
        case 'swing': {
          if (!this.hitPlayerThisSwing) {
            const box = this.attackRect();
            if (!player.dead && !player.isInvulnerable && player.overlaps(box)) {
              this.hitPlayerThisSwing = true;
              player.hurt(1, this.facing, world);
            }
          }
          if (this.timer <= 0) {
            this.state = 'cooldown';
            this.timer = 0.45;
          }
          break;
        }
        case 'cooldown': {
          this.vx = approach(this.vx, 0, 1200 * dt);
          if (this.timer <= 0) this.state = dist < this.aggroRange ? 'chase' : 'patrol';
          break;
        }
      }
    }

    this.moveAndCollide(world.level, dt);
    if (world.level.rectHitsHazard(this.x, this.y, this.w, this.h)) this.hurt(99, 0, world);
  }

  private isLedgeAhead(world: World): boolean {
    const probeX = this.dir > 0 ? this.x + this.w + 4 : this.x - 4;
    return world.level.groundBelow(probeX, this.bottom + 2, 3) > 40;
  }

  private attackRect(): Rect {
    return {
      x: this.facing > 0 ? this.x + this.w - 6 : this.x - 32,
      y: this.y + 4,
      w: 38,
      h: this.h - 6,
    };
  }

  override draw(ctx: CanvasRenderingContext2D): void {
    shadow(ctx, this.cx, this.bottom + 1, this.w, 0.3);
    withHitFlash(ctx, this.flash, () => {
      ctx.save();
      ctx.translate(this.cx, this.bottom);
      ctx.scale(this.facing, 1);

      const walk = Math.abs(this.vx) > 12 ? Math.sin(this.anim * 9) * 4 : 0;
      // Legs.
      ctx.fillStyle = PALETTE.skeletonDark;
      ctx.fillRect(-6 + walk * 0.4, -12, 4, 12);
      ctx.fillRect(2 - walk * 0.4, -12, 4, 12);
      // Ribcage.
      ctx.fillStyle = PALETTE.skeleton;
      ctx.fillRect(-7, -26, 14, 14);
      ctx.fillStyle = PALETTE.skeletonDark;
      for (let i = 0; i < 3; i++) ctx.fillRect(-6, -24 + i * 4, 12, 1.5);
      // Tattered cape.
      ctx.fillStyle = 'rgba(80,50,90,0.85)';
      ctx.beginPath();
      ctx.moveTo(-6, -27);
      ctx.lineTo(-13, -6);
      ctx.lineTo(-6, -10);
      ctx.lineTo(-4, -27);
      ctx.closePath();
      ctx.fill();
      // Skull.
      ctx.fillStyle = PALETTE.skeleton;
      ctx.fillRect(-6, -37, 12, 11);
      ctx.fillStyle = '#151a26';
      ctx.fillRect(-4, -34, 3, 3);
      ctx.fillRect(1, -34, 3, 3);
      ctx.fillStyle = '#ff7a3c';
      ctx.fillRect(-3.5, -33.5, 2, 2);
      ctx.fillRect(1.5, -33.5, 2, 2);
      // Rusty sword.
      const raise = this.state === 'windup' ? -1.4 : this.state === 'swing' ? 0.7 : -0.2;
      ctx.save();
      ctx.translate(7, -22);
      ctx.rotate(raise);
      ctx.fillStyle = '#4a3324';
      ctx.fillRect(-3, -2, 7, 4);
      ctx.fillStyle = '#9aa3b8';
      ctx.beginPath();
      ctx.moveTo(4, -3);
      ctx.lineTo(26, -2);
      ctx.lineTo(30, 0);
      ctx.lineTo(26, 2);
      ctx.lineTo(4, 3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.restore();
    });
    this.drawHpPips(ctx);
  }
}

/* --------------------------------------------------------------------- mage */

export class DarkMage extends Enemy {
  private castTimer = rand(1, 2.2);
  private floatPhase = rand(0, Math.PI * 2);
  private casting = 0;

  constructor(x: number, y: number) {
    super('mage', x, y);
    this.w = 22;
    this.h = 32;
    this.hp = this.maxHp = 4;
    this.scoreValue = 70;
    this.aggroRange = 380;
    this.contactDamage = 1;
  }

  protected override deathColor(): string {
    return PALETTE.mage;
  }

  override update(dt: number, world: World): void {
    this.updateCommon(dt);
    this.floatPhase += dt * 2;
    const player = world.player;
    const dx = player.cx - this.cx;
    const dist = Math.abs(dx);
    this.facing = dx > 0 ? 1 : -1;

    if (this.stun > 0) {
      this.vy += 1200 * dt;
    } else {
      // Hovers slightly above its anchor point and keeps its distance.
      const targetY = this.homeY - 6 + Math.sin(this.floatPhase) * 7;
      this.vy = approach(this.vy, (targetY - this.y) * 3.2, 600 * dt);
      let targetVx = 0;
      if (dist < 110) targetVx = -Math.sign(dx) * 70;
      else if (dist > 240 && dist < this.aggroRange) targetVx = Math.sign(dx) * 55;
      this.vx = approach(this.vx, targetVx, 500 * dt);

      if (dist < this.aggroRange) {
        this.castTimer -= dt;
        if (this.castTimer <= 0 && this.casting <= 0) {
          this.casting = 0.45;
          this.castTimer = rand(1.9, 3.0);
        }
      }
      if (this.casting > 0) {
        this.casting -= dt;
        world.particles.spawn({
          x: this.cx + this.facing * 12,
          y: this.cy - 4,
          vx: rand(-20, 20),
          vy: rand(-30, 10),
          color: 'rgba(200,90,223,0.8)',
          gravity: -60,
          size: 3,
          life: 0.3,
          shape: 'circle',
        });
        if (this.casting <= 0) {
          const dy = player.cy - this.cy;
          const len = Math.hypot(dx, dy) || 1;
          const speed = 190;
          const p = new Projectile('orb', this.cx - 7 + this.facing * 12, this.cy - 11, (dx / len) * speed, (dy / len) * speed);
          world.spawnProjectile(p);
          audio.play('shoot');
        }
      }
    }

    this.moveAndCollide(world.level, dt);
    if (world.level.rectHitsHazard(this.x, this.y, this.w, this.h)) this.hurt(99, 0, world);
  }

  override draw(ctx: CanvasRenderingContext2D): void {
    withHitFlash(ctx, this.flash, () => {
      ctx.save();
      ctx.translate(this.cx, this.bottom);
      ctx.scale(this.facing, 1);
      // Robe.
      const g = ctx.createLinearGradient(0, -this.h, 0, 0);
      g.addColorStop(0, PALETTE.mage);
      g.addColorStop(1, PALETTE.mageDark);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-4, -26);
      ctx.lineTo(4, -26);
      ctx.quadraticCurveTo(12, -8, 11, 0);
      ctx.lineTo(-11, 0);
      ctx.quadraticCurveTo(-12, -8, -4, -26);
      ctx.closePath();
      ctx.fill();
      // Hood.
      ctx.fillStyle = PALETTE.mageDark;
      ctx.beginPath();
      ctx.moveTo(-7, -24);
      ctx.quadraticCurveTo(0, -40, 7, -24);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#1a0d20';
      ctx.fillRect(-4, -28, 8, 6);
      ctx.fillStyle = '#ff6bd6';
      ctx.fillRect(0, -27, 3, 2.5);
      ctx.fillRect(-4, -27, 3, 2.5);
      // Staff.
      ctx.fillStyle = '#4d3a2a';
      ctx.fillRect(9, -34, 3, 34);
      const orbGlow = this.casting > 0 ? 1 : 0.55;
      ctx.globalAlpha = orbGlow;
      ctx.fillStyle = '#e07bff';
      ctx.beginPath();
      ctx.arc(10.5, -36, 5 + (this.casting > 0 ? 2 : 0), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
    });
    this.drawHpPips(ctx);
  }
}

export function createEnemy(kind: EnemyKind, x: number, y: number): Enemy {
  switch (kind) {
    case 'slime':
      return new Slime(x, y);
    case 'bat':
      return new Bat(x, y);
    case 'skeleton':
      return new Skeleton(x, y);
    case 'mage':
      return new DarkMage(x, y);
  }
}
