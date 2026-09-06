import { audio } from '../core/audio';
import { Rect, approach, clamp, rand, rectsOverlap, sign } from '../core/math';
import { PALETTE } from '../render/palette';
import { shadow, withHitFlash } from '../render/sprites';
import type { World } from '../world/context';
import { Body } from './entity';
import { Projectile } from './projectile';

export type EnemyKind = 'slime' | 'bat' | 'skeleton' | 'mage' | 'warden' | 'prismarch';

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

/* ------------------------------------------------------------------ warden */

/** Damage the warden shrugs off mid-move before it staggers. */
const POISE = 5;

/**
 * The Shard Warden: what the rift grew in the knight's place.
 *
 * A mini-boss rather than a second boss - a third of the knight's health, three
 * moves instead of five, and no arena to lock the player in. What it keeps from
 * the knight is the thing that made him fair: every move is announced, and the
 * pause afterwards is long enough to answer.
 */
export class Warden extends Enemy {
  private state: 'wait' | 'stalk' | 'lungeWind' | 'lunge' | 'volleyWind' | 'slamWind' | 'slam' | 'recover' = 'wait';
  private timer = 0;
  private core = 0;
  private hitThisMove = false;
  /** Damage it can absorb mid-move before it is thrown off balance. */
  private poise = POISE;
  /** True once the player has come close enough to wake it. */
  engaged = false;

  constructor(x: number, y: number) {
    super('warden', x, y);
    this.w = 46;
    this.h = 58;
    this.hp = this.maxHp = 16;
    this.scoreValue = 500;
    this.aggroRange = 300;
    this.contactDamage = 1;
  }

  protected override deathColor(): string {
    return '#8f5fd0';
  }

  /**
   * A move once started is seen through. Without this the warden is a sandbag:
   * every hit re-stunned it, so a player who simply held the attack key never
   * saw a single one of its attacks. Landing POISE damage still breaks it, and
   * a parry always does - that is what the parry is for.
   */
  override hurt(amount: number, fromDir: number, world: World): void {
    if (this.dead) return;
    this.hp -= amount;
    this.flash = 1;
    this.poise -= amount;
    if (this.hp <= 0) {
      this.die(world);
      return;
    }
    audio.play('hit');
    const committed = this.state !== 'wait' && this.state !== 'stalk' && this.state !== 'recover';
    if (!committed) this.vx = fromDir * 130;
    if (this.poise <= 0) {
      this.poise = POISE;
      this.stun = 0.5;
      this.vx = fromDir * 150;
      world.particles.burst(this.cx, this.cy, 14, '#e2c4ff', { speed: 190, shape: 'spark' });
    }
  }

  override update(dt: number, world: World): void {
    this.updateCommon(dt);
    const player = world.player;
    const dx = player.cx - this.cx;
    const dist = Math.abs(dx);
    this.core = Math.max(0, this.core - dt * 2);

    if (!this.engaged) {
      if (dist < this.aggroRange && !player.dead) {
        this.engaged = true;
        this.state = 'recover';
        this.timer = 0.9;
        world.camera.addShake(5);
      }
      this.vx = approach(this.vx, 0, 900 * dt);
      this.moveAndCollide(world.level, dt);
      return;
    }

    // A parry or a hard hit knocks it out of whatever it was doing.
    if (this.stun > 0) {
      if (this.state !== 'recover') {
        this.state = 'recover';
        this.timer = 0.75;
      }
      this.vy += 1400 * dt;
      this.moveAndCollide(world.level, dt);
      return;
    }

    if (this.state !== 'lunge') this.facing = dx > 0 ? 1 : -1;
    this.timer -= dt;

    switch (this.state) {
      case 'recover':
      case 'wait':
        this.vx = approach(this.vx, 0, 700 * dt);
        if (this.timer <= 0) {
          this.state = 'stalk';
          this.timer = rand(0.5, 0.9);
        }
        break;

      case 'stalk': {
        // Closes the distance at a walk, so its next move can be read coming.
        const want = dist > 90 ? sign(dx) * 74 : dist < 50 ? -sign(dx) * 60 : 0;
        this.vx = approach(this.vx, want, 620 * dt);
        if (this.timer <= 0) {
          this.hitThisMove = false;
          this.core = 1;
          if (dist < 84) {
            this.state = 'slamWind';
            this.timer = 0.5;
          } else if (dist < 210) {
            this.state = 'lungeWind';
            this.timer = 0.55;
          } else {
            this.state = 'volleyWind';
            this.timer = 0.5;
          }
          audio.play('shoot', 0.7);
        }
        break;
      }

      case 'lungeWind':
        // Leans back into the wind-up; the core burns brighter the closer it is.
        this.vx = approach(this.vx, -this.facing * 40, 700 * dt);
        this.core = 1;
        if (this.timer <= 0) {
          this.state = 'lunge';
          this.timer = 0.36;
          this.vx = this.facing * 360;
          world.camera.addShake(3);
        }
        break;

      case 'lunge':
        if (this.timer <= 0 || this.touching.left || this.touching.right) {
          this.state = 'recover';
          this.timer = 1.15;
        }
        break;

      case 'volleyWind':
        this.vx = approach(this.vx, 0, 800 * dt);
        this.core = 1;
        if (this.timer <= 0) {
          for (let i = -1; i <= 1; i++) {
            const dy = player.cy - this.cy + i * 46;
            const len = Math.hypot(dx, dy) || 1;
            const shard = new Projectile('orb', this.cx - 7, this.cy - 14, (dx / len) * 200, (dy / len) * 200);
            world.spawnProjectile(shard);
          }
          audio.play('shoot');
          this.state = 'recover';
          this.timer = 1.25;
        }
        break;

      case 'slamWind':
        this.vx = approach(this.vx, 0, 900 * dt);
        this.core = 1;
        if (this.timer <= 0) {
          this.state = 'slam';
          this.timer = 1.1;
          this.vy = -470;
          this.vx = sign(dx) * 90;
        }
        break;

      case 'slam':
        if (this.vy > 0 && this.onGround) {
          world.camera.addShake(9);
          world.hitStop(0.05);
          audio.play('slam');
          world.particles.burst(this.cx, this.bottom, 26, '#b078ff', { speed: 260, gravity: 620, shape: 'spark' });
          if (!this.hitThisMove && Math.abs(player.cx - this.cx) < 78 && Math.abs(player.bottom - this.bottom) < 40) {
            this.hitThisMove = true;
            player.hurt(2, sign(player.cx - this.cx) || 1, world);
          }
          this.state = 'recover';
          this.timer = 1.3;
        }
        break;
    }

    this.vy += 1400 * dt;
    this.moveAndCollide(world.level, dt);

    // The lunge is the only move that hurts on contact for more than a brush.
    if (this.state === 'lunge' && !this.hitThisMove && !player.dead && !player.isInvulnerable && this.overlaps(player.rect)) {
      this.hitThisMove = true;
      player.hurt(2, sign(player.cx - this.cx) || 1, world);
    }

    if (world.level.rectHitsHazard(this.x, this.y, this.w, this.h)) this.hurt(3, 0, world);
  }

  /** Contact damage only outside the lunge, which does its own, heavier hit. */
  override touchPlayer(world: World): void {
    if (this.state === 'lunge') return;
    super.touchPlayer(world);
  }

  override draw(ctx: CanvasRenderingContext2D): void {
    withHitFlash(ctx, this.flash, () => {
      ctx.save();
      ctx.translate(this.cx, this.bottom);
      shadow(ctx, 0, 0, this.w * 0.6);
      ctx.scale(this.facing, 1);
      const lean = this.state === 'lungeWind' ? -0.16 : this.state === 'lunge' ? 0.2 : 0;
      ctx.rotate(lean);

      // Body: a slab of rift stone standing on two short legs.
      const g = ctx.createLinearGradient(0, -this.h, 0, 0);
      g.addColorStop(0, '#4a3070');
      g.addColorStop(1, '#1d1230');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-16, -this.h + 8);
      ctx.lineTo(16, -this.h + 3);
      ctx.lineTo(20, -13);
      ctx.lineTo(-19, -13);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#2e1d4a';
      ctx.fillRect(-16, -this.h + 8, 32, 3);
      ctx.fillStyle = '#170e26';
      ctx.fillRect(-15, -14, 11, 14);
      ctx.fillRect(4, -14, 11, 14);

      // The core, which is also the tell: it burns before every move.
      const heat = 0.35 + this.core * 0.65;
      const cy = -this.h + 26;
      const halo = ctx.createRadialGradient(2, cy, 0, 2, cy, 30 * heat);
      halo.addColorStop(0, `rgba(200,140,255,${(0.5 * heat).toFixed(2)})`);
      halo.addColorStop(1, 'rgba(200,140,255,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(-28, cy - 30, 60, 60);
      ctx.fillStyle = `rgba(226,196,255,${(0.6 + heat * 0.4).toFixed(2)})`;
      ctx.beginPath();
      ctx.moveTo(2, cy - 12);
      ctx.lineTo(10, cy);
      ctx.lineTo(2, cy + 12);
      ctx.lineTo(-6, cy);
      ctx.closePath();
      ctx.fill();

      // Shoulder shards, turned outwards while it winds up.
      const flare = this.core * 5;
      ctx.fillStyle = '#6d4aa8';
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(side * (16 + flare), -this.h + 16);
        ctx.rotate(side * (0.5 + this.core * 0.35));
        ctx.beginPath();
        ctx.moveTo(0, -17);
        ctx.lineTo(7, 8);
        ctx.lineTo(-7, 8);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      // A crown of splinters, so the silhouette alone says "not a skeleton".
      ctx.fillStyle = '#553584';
      for (let i = -1; i <= 1; i++) {
        const bx = i * 9;
        const bh = 12 - Math.abs(i) * 4;
        ctx.beginPath();
        ctx.moveTo(bx, -this.h - 4 - bh);
        ctx.lineTo(bx + 4, -this.h + 2);
        ctx.lineTo(bx - 4, -this.h + 2);
        ctx.closePath();
        ctx.fill();
      }

      // Head: a narrow visor, lit from inside.
      ctx.fillStyle = '#241640';
      ctx.fillRect(-11, -this.h - 2, 22, 14);
      ctx.fillStyle = `rgba(255,190,120,${(0.55 + this.core * 0.45).toFixed(2)})`;
      ctx.fillRect(-6, -this.h + 3, 13, 4);
      ctx.restore();
    });
  }
}

/* --------------------------------------------------------------- prismarch */

/** Damage it shrugs off mid-move. Higher than the warden's: it is the last word. */
const PRISM_POISE = 7;

/**
 * Prismarch, the heart of the crystal - the bonus boss behind the world, and
 * the only thing in the game the player has to earn a fight with.
 *
 * Built on the warden's lesson rather than the knight's code: a move once begun
 * is seen through, and every one of them is announced before it lands. What
 * makes this one the harder fight is not shorter warnings but more of them at
 * once - in its second half it answers with two things instead of one.
 */
export class Prismarch extends Enemy {
  private state:
    | 'wait'
    | 'stalk'
    | 'fanWind'
    | 'rainWind'
    | 'rain'
    | 'chargeWind'
    | 'charge'
    | 'recover' = 'wait';
  private timer = 0;
  private core = 0;
  private poise = PRISM_POISE;
  private rainLeft = 0;
  private rainTimer = 0;
  private hitThisMove = false;
  private lastMove = '';
  engaged = false;

  constructor(x: number, y: number) {
    super('prismarch', x, y);
    this.w = 58;
    this.h = 74;
    this.hp = this.maxHp = 70;
    this.scoreValue = 3000;
    this.aggroRange = 460;
    this.contactDamage = 1;
  }

  /** Second half of the fight: shorter pauses, and the rain comes in twos. */
  get phase(): 1 | 2 {
    return this.hp <= this.maxHp / 2 ? 2 : 1;
  }

  protected override deathColor(): string {
    return '#8fe8ff';
  }

  override hurt(amount: number, fromDir: number, world: World): void {
    if (this.dead) return;
    this.hp -= amount;
    this.flash = 1;
    this.poise -= amount;
    if (this.hp <= 0) {
      this.die(world);
      return;
    }
    audio.play('bossHit');
    if (this.poise <= 0) {
      this.poise = PRISM_POISE;
      this.stun = 0.55;
      this.vx = fromDir * 120;
      world.particles.burst(this.cx, this.cy, 20, '#bff2ff', { speed: 220, shape: 'spark' });
    }
  }

  protected override die(world: World): void {
    super.die(world);
    world.particles.burst(this.cx, this.cy, 70, '#8fe8ff', { speed: 320, gravity: 200, size: 5 });
    world.onCrystalBossDefeated();
  }

  override update(dt: number, world: World): void {
    this.updateCommon(dt);
    const player = world.player;
    const dx = player.cx - this.cx;
    const dist = Math.abs(dx);
    this.core = Math.max(0, this.core - dt * 2);

    if (!this.engaged) {
      if (dist < this.aggroRange && !player.dead) {
        this.engaged = true;
        this.state = 'recover';
        this.timer = 1.2;
        world.camera.addShake(6);
      }
      this.moveAndCollide(world.level, dt);
      return;
    }

    if (this.stun > 0) {
      if (this.state !== 'recover') {
        this.state = 'recover';
        this.timer = 0.8;
      }
      this.vy += 1400 * dt;
      this.moveAndCollide(world.level, dt);
      return;
    }

    if (this.state !== 'charge') this.facing = dx > 0 ? 1 : -1;
    this.timer -= dt;
    const quick = this.phase === 2 ? 0.78 : 1;

    switch (this.state) {
      case 'wait':
      case 'recover':
        this.vx = approach(this.vx, 0, 800 * dt);
        if (this.timer <= 0) {
          this.state = 'stalk';
          this.timer = rand(0.45, 0.8) * quick;
        }
        break;

      case 'stalk': {
        const want = dist > 150 ? sign(dx) * 62 : dist < 80 ? -sign(dx) * 62 : 0;
        this.vx = approach(this.vx, want, 520 * dt);
        if (this.timer <= 0) {
          this.hitThisMove = false;
          this.core = 1;
          // Never the same move twice running: the fight has to keep asking a
          // different question, or it is one pattern learnt and then repeated.
          const options = dist < 150 ? ['chargeWind', 'rainWind'] : ['fanWind', 'rainWind', 'chargeWind'];
          const pick = options.filter((o) => o !== this.lastMove);
          const move = pick[Math.floor(Math.random() * pick.length)] ?? options[0];
          this.lastMove = move;
          this.state = move as typeof this.state;
          this.timer = move === 'rainWind' ? 0.6 * quick : 0.55 * quick;
          audio.play('shoot', 0.6);
        }
        break;
      }

      case 'fanWind':
        this.vx = approach(this.vx, 0, 900 * dt);
        this.core = 1;
        if (this.timer <= 0) {
          const spread = this.phase === 2 ? 5 : 3;
          for (let i = 0; i < spread; i++) {
            const a = ((i - (spread - 1) / 2) / spread) * 1.5;
            const dy = player.cy - this.cy;
            const len = Math.hypot(dx, dy) || 1;
            const vx = ((dx / len) * Math.cos(a) - (dy / len) * Math.sin(a)) * 215;
            const vy = ((dx / len) * Math.sin(a) + (dy / len) * Math.cos(a)) * 215;
            world.spawnProjectile(new Projectile('orb', this.cx - 7, this.cy - 16, vx, vy));
          }
          audio.play('shoot');
          this.state = 'recover';
          this.timer = 1.25 * quick;
        }
        break;

      case 'rainWind':
        this.vx = approach(this.vx, 0, 900 * dt);
        this.core = 1;
        if (this.timer <= 0) {
          this.state = 'rain';
          this.rainLeft = this.phase === 2 ? 8 : 5;
          this.rainTimer = 0;
          this.timer = 3;
        }
        break;

      case 'rain':
        // Shards dropped from the ceiling, one every fifth of a second, each
        // aimed a little ahead of where the hero is standing. Running works;
        // standing still does not.
        this.vx = approach(this.vx, 0, 700 * dt);
        this.rainTimer -= dt;
        if (this.rainTimer <= 0 && this.rainLeft > 0) {
          this.rainTimer = 0.22;
          this.rainLeft--;
          const at = player.cx + player.vx * 0.28 + rand(-40, 40);
          const shard = new Projectile('rock', at - 10, world.camera.renderY - 30, 0, 190);
          world.spawnProjectile(shard);
        }
        if (this.rainLeft <= 0 && this.timer <= 2.2) {
          this.state = 'recover';
          this.timer = 1.15 * quick;
        }
        break;

      case 'chargeWind':
        this.vx = approach(this.vx, -this.facing * 50, 800 * dt);
        this.core = 1;
        if (this.timer <= 0) {
          this.state = 'charge';
          this.timer = 0.5;
          this.vx = this.facing * 390;
          world.camera.addShake(4);
        }
        break;

      case 'charge':
        if (this.timer <= 0 || this.touching.left || this.touching.right) {
          this.state = 'recover';
          this.timer = 1.3 * quick;
        }
        break;
    }

    this.vy += 1400 * dt;
    this.moveAndCollide(world.level, dt);

    if (this.state === 'charge' && !this.hitThisMove && !player.dead && !player.isInvulnerable && this.overlaps(player.rect)) {
      this.hitThisMove = true;
      player.hurt(2, sign(player.cx - this.cx) || 1, world);
    }
  }

  override touchPlayer(world: World): void {
    if (this.state === 'charge') return;
    super.touchPlayer(world);
  }

  override draw(ctx: CanvasRenderingContext2D): void {
    withHitFlash(ctx, this.flash, () => {
      ctx.save();
      ctx.translate(this.cx, this.bottom);
      shadow(ctx, 0, 0, this.w * 0.6);
      ctx.scale(this.facing, 1);
      const lean = this.state === 'chargeWind' ? -0.14 : this.state === 'charge' ? 0.18 : 0;
      ctx.rotate(lean);
      const heat = 0.4 + this.core * 0.6;

      // A ring of shards turning slowly around the body.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 6; i++) {
        const a = this.anim * 0.5 + (i / 6) * Math.PI * 2;
        const rx = Math.cos(a) * (30 + this.core * 8);
        const ry = -this.h * 0.55 + Math.sin(a) * 15;
        ctx.globalAlpha = 0.25 + Math.cos(a) * 0.15 + this.core * 0.2;
        ctx.fillStyle = '#8fe8ff';
        ctx.beginPath();
        ctx.moveTo(rx, ry - 9);
        ctx.lineTo(rx + 5, ry);
        ctx.lineTo(rx, ry + 9);
        ctx.lineTo(rx - 5, ry);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // Body: a standing prism.
      const g = ctx.createLinearGradient(0, -this.h, 0, 0);
      g.addColorStop(0, '#2f5f88');
      g.addColorStop(0.55, '#1d3a5e');
      g.addColorStop(1, '#0f1c34');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, -this.h - 6);
      ctx.lineTo(20, -this.h + 22);
      ctx.lineTo(16, -8);
      ctx.lineTo(-16, -8);
      ctx.lineTo(-20, -this.h + 22);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(160,225,255,0.18)';
      ctx.beginPath();
      ctx.moveTo(0, -this.h - 6);
      ctx.lineTo(20, -this.h + 22);
      ctx.lineTo(0, -14);
      ctx.closePath();
      ctx.fill();

      // The heart, which is also the tell.
      const cy = -this.h * 0.52;
      const halo = ctx.createRadialGradient(0, cy, 0, 0, cy, 44 * heat);
      halo.addColorStop(0, `rgba(150,235,255,${(0.55 * heat).toFixed(2)})`);
      halo.addColorStop(1, 'rgba(150,235,255,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(-44, cy - 44, 88, 88);
      ctx.fillStyle = `rgba(226,250,255,${(0.65 + heat * 0.35).toFixed(2)})`;
      ctx.beginPath();
      ctx.moveTo(0, cy - 15);
      ctx.lineTo(11, cy);
      ctx.lineTo(0, cy + 15);
      ctx.lineTo(-11, cy);
      ctx.closePath();
      ctx.fill();

      // Feet, so it stands rather than floats.
      ctx.fillStyle = '#12233d';
      ctx.fillRect(-15, -9, 12, 9);
      ctx.fillRect(3, -9, 12, 9);
      ctx.restore();
    });
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
    case 'warden':
      return new Warden(x, y);
    case 'prismarch':
      return new Prismarch(x, y);
  }
}
