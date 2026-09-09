import { audio } from '../core/audio';
import { Rect, approach, clamp, rand, rectsOverlap, sign } from '../core/math';
import { PALETTE } from '../render/palette';
import { shadow, withHitFlash } from '../render/sprites';
import type { World } from '../world/context';
import { Body } from './entity';
import { Projectile } from './projectile';

export type EnemyKind =
  | 'slime'
  | 'bat'
  | 'skeleton'
  | 'mage'
  | 'bomber'
  | 'shieldman'
  | 'charger'
  | 'warden'
  | 'thalassa'
  | 'prismarch';

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
  /**
   * How long a boss is safe from being thrown off balance again.
   *
   * Poise alone is not enough. A player who simply holds the attack key deals
   * damage faster than any wind-up takes, so break after break lands and the
   * boss never completes a single move - measured on Thalassa: two projectiles
   * in ten seconds of fighting. After a break there is a breath in which the
   * next one cannot happen, and that breath is what lets her answer.
   */
  protected poiseLock = 0;
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
    this.poiseLock = Math.max(0, this.poiseLock - dt);
  }

  abstract update(dt: number, world: World): void;
  abstract draw(ctx: CanvasRenderingContext2D, world: World): void;

  /**
   * What a parry knocks out of this enemy, beyond the damage it deals.
   *
   * Most have nothing to lose; the shield carrier loses the shield, which is
   * the whole reason the parry exists as an answer to him.
   */
  onParried(world: World): void {
    void world;
  }

  /**
   * True when the step ahead leads off a ledge or onto something deadly.
   *
   * Measured over the whole level: five of eighteen skeletons walked into
   * their own spikes within nine seconds of waking up, and three more walked
   * off into the void. A patrol that kills itself before the player arrives is
   * an enemy the player never meets.
   */
  protected badStepAhead(world: World, dir: number): boolean {
    const level = world.level;
    const probeX = dir > 0 ? this.x + this.w + 4 : this.x - 4;
    if (level.groundBelow(probeX, this.bottom + 2, 3) > 40) return true;
    const tx = Math.floor(probeX / 32);
    const foot = Math.floor((this.bottom + 6) / 32);
    return level.hazardAt(tx, foot) || level.hazardAt(tx, foot - 1);
  }

  /**
   * Stops a walk that would carry the enemy into spikes or off a ledge.
   *
   * Applied to the velocity just before it moves, rather than inside a patrol
   * branch: measured, the shield carrier walked into his own spikes while
   * *advancing* on the player, and a guard that lives in the patrol case never
   * sees that. Only while standing - a knockback throws them airborne, and
   * being able to punt something into a pit is worth keeping.
   */
  protected holdBackAtEdges(world: World): void {
    if (!this.onGround || this.vx === 0) return;
    if (this.badStepAhead(world, Math.sign(this.vx))) this.vx = 0;
  }

  /**
   * Spikes, measured on a slightly smaller box than the body - the same
   * allowance the hero gets.
   *
   * On the full box a skeleton standing one tile from a spike died on its
   * first frame: two tenths of a pixel of drift put the corner of its box into
   * the neighbouring column.
   */
  protected touchesHazard(world: World): boolean {
    return world.level.rectHitsHazard(this.x + 4, this.y + 4, this.w - 8, this.h - 6);
  }

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
    if (this.touchesHazard(world)) this.hurt(99, 0, world);
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
    if (this.touchesHazard(world)) this.hurt(99, 0, world);
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
          if (this.onGround && this.badStepAhead(world, this.dir)) {
            this.dir = (-this.dir) as 1 | -1;
            // Away at once. approach() would let the old direction run on for
            // another few frames, and those frames are inside the spikes.
            this.vx = this.dir * 30;
          }
          if (dist < this.aggroRange && Math.abs(player.cy - this.cy) < 70) this.state = 'chase';
          break;
        }
        case 'chase': {
          this.dir = dx > 0 ? 1 : -1;
          this.facing = this.dir;
          this.vx = approach(this.vx, this.dir * 108, 900 * dt);
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

    this.holdBackAtEdges(world);
    this.moveAndCollide(world.level, dt);
    if (this.touchesHazard(world)) this.hurt(99, 0, world);
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
    if (this.touchesHazard(world)) this.hurt(99, 0, world);
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

/* -------------------------------------------------------------------- bomber */

/** How far the burst reaches, and what it does inside that. */
const BOOM_RADIUS = 66;
const BOOM_DAMAGE = 2;

/**
 * Zunder - a sac of something that wants to go off.
 *
 * It waddles at the hero and lights itself when it gets close. What makes it
 * more than a slow slime is that killing it lights it too: a point-blank swing
 * is answered by the burst it was going to make anyway. The clean answer is to
 * put it down from a distance, which is exactly what the thrown crescent and
 * the mages' own orbs are for - so it also teaches the upgrade.
 */
export class Bomber extends Enemy {
  private state: 'walk' | 'fuse' = 'walk';
  private fuse = 0;
  private dir: 1 | -1 = -1;
  private beeped = 0;

  constructor(x: number, y: number) {
    super('bomber', x, y);
    this.w = 22;
    this.h = 22;
    this.hp = this.maxHp = 2;
    this.scoreValue = 45;
    this.aggroRange = 210;
    this.contactDamage = 0; // It does its damage by going off, not by touching.
  }

  protected override deathColor(): string {
    return '#ff9a5c';
  }

  /** Any death lights the fuse instead of ending it. That is the whole trick. */
  override hurt(amount: number, fromDir: number, _world: World): void {
    if (this.dead) return;
    this.hp -= amount;
    this.flash = 1;
    this.vx = fromDir * 150;
    if (this.hp > 0) {
      audio.play('hit');
      return;
    }
    this.hp = 0;
    if (this.state !== 'fuse') this.light(0.26);
  }

  private light(seconds: number): void {
    this.state = 'fuse';
    this.fuse = seconds;
    this.beeped = 0;
    audio.play('shoot', 1.7);
  }

  private boom(world: World): void {
    this.dead = true;
    audio.play('slam', 1.25);
    world.camera.addShake(5);
    world.particles.burst(this.cx, this.cy, 34, '#ffb066', { speed: 300, gravity: 220, size: 4 });
    world.particles.burst(this.cx, this.cy, 18, '#fff0c8', { speed: 190, shape: 'spark' });
    world.addScore(this.scoreValue, this.cx, this.y, `+${this.scoreValue}`);

    const player = world.player;
    if (!player.dead && !player.isInvulnerable) {
      const d = Math.hypot(player.cx - this.cx, player.cy - this.cy);
      if (d < BOOM_RADIUS) player.hurt(BOOM_DAMAGE, sign(player.cx - this.cx) || 1, world);
    }
    // It does not care whose side anyone is on. A skeleton standing next to it
    // when it goes off is a skeleton the player did not have to fight.
    for (const other of world.enemies) {
      if (other === this || other.dead) continue;
      const d = Math.hypot(other.cx - this.cx, other.cy - this.cy);
      if (d < BOOM_RADIUS) other.hurt(3, sign(other.cx - this.cx) || 1, world);
    }
  }

  override update(dt: number, world: World): void {
    this.updateCommon(dt);
    const player = world.player;
    const dx = player.cx - this.cx;
    const dist = Math.abs(dx);

    if (this.state === 'fuse') {
      this.fuse -= dt;
      // A rising tick, so the last moment is audible as well as visible.
      this.beeped -= dt;
      if (this.beeped <= 0) {
        this.beeped = Math.max(0.06, this.fuse * 0.35);
        audio.play('hit', 1.9);
      }
      this.vx = approach(this.vx, 0, 600 * dt);
      this.vy += 1400 * dt;
      this.moveAndCollide(world.level, dt);
      if (this.fuse <= 0) this.boom(world);
      return;
    }

    if (this.stun <= 0) {
      if (dist < this.aggroRange && !player.dead) {
        this.dir = dx > 0 ? 1 : -1;
        this.vx = approach(this.vx, this.dir * 62, 400 * dt);
        if (dist < 46 && Math.abs(player.cy - this.cy) < 44) this.light(0.85);
      } else {
        // Idles on the spot rather than patrolling: it is a trap, and a trap
        // that wanders off is no trap.
        this.vx = approach(this.vx, 0, 400 * dt);
      }
      this.facing = this.dir;
      // Turns at a ledge or in front of spikes instead of walking into them.
      if (this.onGround && this.badStepAhead(world, this.dir)) {
        this.dir = -this.dir as 1 | -1;
        this.vx = 0;
      }
    }

    this.vy += 1400 * dt;
    this.holdBackAtEdges(world);
    this.moveAndCollide(world.level, dt);
    if (this.touchesHazard(world)) this.light(0.2);
  }

  override draw(ctx: CanvasRenderingContext2D): void {
    const lit = this.state === 'fuse';
    // The tell: it swells, and a ring closes in on it. Both are needed - the
    // swell reads up close, the ring reads across the room.
    const heat = lit ? 1 - Math.max(0, this.fuse) / 0.9 : 0;
    withHitFlash(ctx, this.flash, () => {
      ctx.save();
      ctx.translate(this.cx, this.bottom);
      shadow(ctx, 0, 0, this.w * 0.55);
      const grow = 1 + heat * 0.25;
      ctx.scale(grow, grow);

      if (lit) {
        const halo = ctx.createRadialGradient(0, -10, 0, 0, -10, 34);
        halo.addColorStop(0, `rgba(255,170,90,${(0.35 + heat * 0.4).toFixed(2)})`);
        halo.addColorStop(1, 'rgba(255,170,90,0)');
        ctx.fillStyle = halo;
        ctx.fillRect(-34, -44, 68, 68);
      }

      // Body: a taut sac on two stubby legs.
      const g = ctx.createRadialGradient(-3, -14, 2, 0, -10, 14);
      g.addColorStop(0, lit ? '#ffd9a0' : '#7a5a3c');
      g.addColorStop(1, lit ? '#c1481f' : '#3a2a1e');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, -11, 10, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2a1d14';
      ctx.fillRect(-6, -3, 4, 3);
      ctx.fillRect(2, -3, 4, 3);

      // Seams, which glow apart as it fills.
      ctx.strokeStyle = lit ? `rgba(255,220,150,${(0.4 + heat * 0.6).toFixed(2)})` : 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1.5;
      for (const a of [-0.6, 0.6]) {
        ctx.beginPath();
        ctx.moveTo(Math.sin(a) * 9, -11 - Math.cos(a) * 9);
        ctx.quadraticCurveTo(Math.sin(a) * 3, -11, Math.sin(a) * 9, -11 + Math.cos(a) * 9);
        ctx.stroke();
      }
      // Eyes, wide open once it is lit.
      ctx.fillStyle = lit ? '#fff6dc' : '#e8c88c';
      const eye = lit ? 2.4 : 1.6;
      ctx.fillRect(-4.5, -15, eye, eye);
      ctx.fillRect(2.2, -15, eye, eye);
      ctx.restore();

      if (lit) {
        // The closing ring, in world space so its size means distance.
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(255,190,110,${(0.35 + heat * 0.5).toFixed(2)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.cx, this.cy, BOOM_RADIUS * (1 - heat * 0.72), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    });
    this.drawHpPips(ctx);
  }
}

/* ----------------------------------------------------------------- shieldman */

/**
 * Schildwache - a tower shield with someone behind it.
 *
 * Everything that comes at the shield stops there, the thrown crescent
 * included. The answers are position and timing: get behind it, or parry the
 * thrust, which pulls the shield down for a breath. It is the one enemy in the
 * game that a player who only holds the attack key cannot beat.
 */
export class Shieldman extends Enemy {
  private state: 'patrol' | 'advance' | 'thrustWind' | 'thrust' | 'exposed' = 'patrol';
  private timer = 0;
  private dir: 1 | -1 = -1;
  private hitThisThrust = false;

  constructor(x: number, y: number) {
    super('shieldman', x, y);
    this.w = 24;
    this.h = 34;
    this.hp = this.maxHp = 6;
    this.scoreValue = 90;
    this.aggroRange = 250;
    this.contactDamage = 1;
  }

  /** True while the shield is down and hits land from any side. */
  get exposed(): boolean {
    return this.state === 'exposed';
  }

  protected override deathColor(): string {
    return '#9aa6c4';
  }

  override hurt(amount: number, fromDir: number, world: World): void {
    if (this.dead) return;
    // A blow into the shield is a blow into a wall.
    const fromFront = Math.sign(fromDir) === -this.facing;
    if (fromFront && !this.exposed) {
      audio.play('parry', 0.8);
      world.particles.burst(this.cx - this.facing * 12, this.cy - 4, 8, '#dfe8ff', {
        speed: 150,
        shape: 'spark',
        angle: fromDir > 0 ? Math.PI : 0,
        spread: 1.1,
      });
      this.flash = Math.max(this.flash, 0.4);
      this.vx = fromDir * 60;
      return;
    }
    super.hurt(amount, fromDir, world);
  }

  /** A parried thrust drops the shield: that is what the parry is for. */
  override onParried(world: World): void {
    if (this.dead) return;
    this.state = 'exposed';
    this.timer = 1.8;
    this.vx = -this.facing * 120;
    audio.play('hit', 0.7);
    world.particles.burst(this.cx, this.cy, 12, '#dfe8ff', { speed: 170, shape: 'spark' });
  }

  override update(dt: number, world: World): void {
    this.updateCommon(dt);
    const player = world.player;
    const dx = player.cx - this.cx;
    const dist = Math.abs(dx);
    if (this.stun <= 0 && this.state !== 'exposed') this.facing = dist < this.aggroRange ? (dx > 0 ? 1 : -1) : this.dir;
    this.timer -= dt;

    if (this.stun <= 0) {
      switch (this.state) {
        case 'patrol': {
          this.vx = approach(this.vx, this.dir * 42, 340 * dt);
          if (this.onGround && this.badStepAhead(world, this.dir)) {
            this.dir = -this.dir as 1 | -1;
            this.vx = this.dir * 30;
          }
          if (this.touching.left || this.touching.right) this.dir = -this.dir as 1 | -1;
          if (dist < this.aggroRange && Math.abs(player.cy - this.cy) < 60) {
            this.state = 'advance';
            this.timer = 0.6;
          }
          break;
        }
        case 'advance':
          this.vx = approach(this.vx, dist > 40 ? this.facing * 52 : 0, 340 * dt);
          if (this.timer <= 0) {
            if (dist < 58) {
              this.state = 'thrustWind';
              this.timer = 0.42;
              this.hitThisThrust = false;
              audio.play('swing', 0.7);
            } else if (dist > this.aggroRange) {
              this.state = 'patrol';
            } else {
              this.timer = 0.5;
            }
          }
          break;
        case 'thrustWind':
          this.vx = approach(this.vx, -this.facing * 30, 400 * dt);
          if (this.timer <= 0) {
            this.state = 'thrust';
            this.timer = 0.24;
            this.vx = this.facing * 210;
          }
          break;
        case 'thrust': {
          const reach = {
            x: this.facing > 0 ? this.x + this.w - 4 : this.x - 22,
            y: this.y + 6,
            w: 26,
            h: 16,
          };
          if (!this.hitThisThrust && !player.dead && rectsOverlap(reach, player.rect)) {
            this.hitThisThrust = true;
            player.hurt(1, this.facing, world);
          }
          if (this.timer <= 0) {
            this.state = 'advance';
            this.timer = 0.75;
          }
          break;
        }
        case 'exposed':
          this.vx = approach(this.vx, 0, 500 * dt);
          if (this.timer <= 0) {
            this.state = 'advance';
            this.timer = 0.4;
          }
          break;
      }
    }

    this.vy += 1400 * dt;
    this.holdBackAtEdges(world);
    this.moveAndCollide(world.level, dt);
    if (this.touchesHazard(world)) this.hurt(99, 0, world);
  }

  override draw(ctx: CanvasRenderingContext2D): void {
    withHitFlash(ctx, this.flash, () => {
      ctx.save();
      ctx.translate(this.cx, this.bottom);
      shadow(ctx, 0, 0, this.w * 0.6);
      ctx.scale(this.facing, 1);

      // Body, then the spear, then the shield on top of both: in this mirrored
      // space local +x is forward, and the shield was drawn at -11 - which put
      // it squarely on his back, where it guarded nothing and read as nothing.
      ctx.fillStyle = '#2b3348';
      ctx.fillRect(-9, -30, 15, 30);
      ctx.fillStyle = '#3d4763';
      ctx.fillRect(-9, -30, 15, 5);
      ctx.fillStyle = '#1b2133';
      ctx.fillRect(-7, -26, 11, 4);
      // Helm with a slit.
      ctx.fillStyle = '#39425c';
      ctx.fillRect(-8, -38, 14, 9);
      ctx.fillStyle = this.exposed ? '#ff9c6a' : '#9fd0ff';
      ctx.fillRect(-1, -35, 7, 2);

      // The spear, thrust over the rim of the shield rather than through it.
      const out = this.state === 'thrust' ? 16 : this.state === 'thrustWind' ? -5 : 0;
      ctx.fillStyle = '#5a4a34';
      ctx.fillRect(0, -27, 13 + out, 3);
      ctx.fillStyle = '#c7d2e8';
      ctx.beginPath();
      ctx.moveTo(13 + out, -29.5);
      ctx.lineTo(21 + out, -25.5);
      ctx.lineTo(13 + out, -21.5);
      ctx.closePath();
      ctx.fill();

      // The shield: forward and covering him, or swung down while exposed.
      ctx.save();
      if (this.exposed) {
        ctx.translate(4, -5);
        ctx.rotate(1.15);
      } else {
        ctx.translate(9, -16);
      }
      ctx.fillStyle = '#4a5674';
      ctx.beginPath();
      ctx.moveTo(-5, -15);
      ctx.lineTo(5, -12);
      ctx.lineTo(5, 12);
      ctx.lineTo(-5, 15);
      ctx.closePath();
      ctx.fill();
      // A lit rim along the leading edge, so the guarded side is the side that
      // catches the light.
      ctx.fillStyle = '#8d9dc2';
      ctx.fillRect(3, -12, 2.5, 24);
      ctx.fillStyle = '#6d7c9f';
      ctx.fillRect(-4, -12, 2.5, 24);
      ctx.fillStyle = '#a8b6d6';
      ctx.beginPath();
      ctx.arc(0, 0, 3.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.restore();
    });
    this.drawHpPips(ctx);
  }
}

/* ------------------------------------------------------------------- charger */

/**
 * Klingenläufer - it digs in, then crosses the room.
 *
 * The one enemy that punishes standing still, and the one that can be turned
 * against the level: a charge into a wall leaves it dazed and taking double for
 * a second and a half. Standing in front of a wall and stepping aside is the
 * intended answer, and it is more satisfying than trading hits.
 */
export class Charger extends Enemy {
  private state: 'patrol' | 'wind' | 'run' | 'dazed' = 'patrol';
  private timer = 0;
  private dir: 1 | -1 = -1;
  private hitThisRun = false;

  constructor(x: number, y: number) {
    super('charger', x, y);
    this.w = 26;
    this.h = 24;
    this.hp = this.maxHp = 4;
    this.scoreValue = 75;
    this.aggroRange = 270;
    this.contactDamage = 1;
  }

  protected override deathColor(): string {
    return '#c2705a';
  }

  override hurt(amount: number, fromDir: number, world: World): void {
    // Dazed against a wall is the window, so it is worth twice as much.
    super.hurt(this.state === 'dazed' ? amount * 2 : amount, fromDir, world);
  }

  override touchPlayer(world: World): void {
    if (this.state === 'run') return; // The run does its own, heavier hit.
    super.touchPlayer(world);
  }

  override update(dt: number, world: World): void {
    this.updateCommon(dt);
    const player = world.player;
    const dx = player.cx - this.cx;
    const dist = Math.abs(dx);
    this.timer -= dt;

    if (this.stun <= 0) {
      switch (this.state) {
        case 'patrol': {
          this.vx = approach(this.vx, this.dir * 46, 320 * dt);
          this.facing = this.dir;
          if (this.onGround && this.badStepAhead(world, this.dir)) {
            this.dir = -this.dir as 1 | -1;
            this.vx = this.dir * 30;
          }
          if (this.touching.left || this.touching.right) this.dir = -this.dir as 1 | -1;
          // Only charges at something roughly level with it, so a hero on a
          // ledge is not hit by something that cannot reach him.
          if (dist < this.aggroRange && Math.abs(player.bottom - this.bottom) < 40) {
            this.state = 'wind';
            this.timer = 0.45;
            this.facing = dx > 0 ? 1 : -1;
            this.dir = this.facing;
            audio.play('swing', 0.6);
          }
          break;
        }
        case 'wind':
          this.vx = approach(this.vx, -this.facing * 40, 400 * dt);
          if (world.time % 0.06 < dt) {
            world.particles.spawn({
              x: this.cx - this.facing * 12,
              y: this.bottom - 3,
              vx: -this.facing * rand(40, 110),
              vy: rand(-40, -10),
              color: 'rgba(180,150,120,0.6)',
              gravity: 260,
              size: 2.5,
              life: 0.35,
            });
          }
          if (this.timer <= 0) {
            this.state = 'run';
            this.timer = 0.62;
            this.hitThisRun = false;
            this.vx = this.facing * 420;
          }
          break;
        case 'run':
          if (this.badStepAhead(world, this.facing)) {
            // Digs its heels in at the edge. Baiting it into a wall still
            // works; running itself into the void unprompted does not.
            this.state = 'patrol';
            this.timer = 0.5;
            this.dir = -this.facing as 1 | -1;
            this.vx = this.dir * 40;
          }
          if (!this.hitThisRun && !player.dead && !player.isInvulnerable && this.overlaps(player.rect)) {
            this.hitThisRun = true;
            player.hurt(2, sign(player.cx - this.cx) || 1, world);
          }
          if (this.touching.left || this.touching.right) {
            this.state = 'dazed';
            this.timer = 1.5;
            this.vx = -this.facing * 90;
            audio.play('slam', 1.4);
            world.camera.addShake(3);
            world.particles.burst(this.cx + this.facing * 12, this.cy, 16, '#c2a08a', {
              speed: 200,
              gravity: 300,
            });
          } else if (this.timer <= 0) {
            this.state = 'patrol';
            this.timer = 0.5;
          }
          break;
        case 'dazed':
          this.vx = approach(this.vx, 0, 400 * dt);
          if (this.timer <= 0) this.state = 'patrol';
          break;
      }
    }

    this.vy += 1400 * dt;
    this.holdBackAtEdges(world);
    this.moveAndCollide(world.level, dt);
    if (this.touchesHazard(world)) this.hurt(99, 0, world);
  }

  override draw(ctx: CanvasRenderingContext2D): void {
    withHitFlash(ctx, this.flash, () => {
      ctx.save();
      ctx.translate(this.cx, this.bottom);
      shadow(ctx, 0, 0, this.w * 0.6);
      ctx.scale(this.facing, 1);
      const dazed = this.state === 'dazed';
      if (dazed) ctx.rotate(0.18);
      const crouch = this.state === 'wind' ? 3 : 0;

      // Low, wide body built around the plate on its head.
      const g = ctx.createLinearGradient(0, -20, 0, 0);
      g.addColorStop(0, '#7c4a3a');
      g.addColorStop(1, '#3a201a');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-13, -16 + crouch);
      ctx.lineTo(9, -19 + crouch);
      ctx.lineTo(13, -4);
      ctx.lineTo(-13, -4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#2a1712';
      ctx.fillRect(-11, -5, 5, 5);
      ctx.fillRect(4, -5, 5, 5);

      // The ram plate, which is also where it hurts itself.
      ctx.fillStyle = dazed ? '#8a7a6a' : '#b9a08a';
      ctx.beginPath();
      ctx.moveTo(9, -22 + crouch);
      ctx.lineTo(17, -14 + crouch);
      ctx.lineTo(9, -6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(10, -20 + crouch, 2, 12);

      // Eye: a slit that opens wide before the run.
      ctx.fillStyle = dazed ? '#ffd9a0' : this.state === 'wind' ? '#ffd166' : '#e08a5c';
      ctx.fillRect(2, -16 + crouch, 4, this.state === 'wind' ? 3 : 1.8);
      if (dazed) {
        // Stars, so the window reads without watching the health pips.
        ctx.fillStyle = 'rgba(255,240,200,0.85)';
        for (let i = 0; i < 3; i++) {
          const a = this.anim * 5 + i * 2.1;
          ctx.fillRect(Math.cos(a) * 9 - 1, -26 + Math.sin(a) * 4, 2.5, 2.5);
        }
      }
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
    if (this.poise <= 0 && this.poiseLock <= 0) {
      this.poise = POISE;
      this.poiseLock = 2.0;
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

    if (this.touchesHazard(world)) this.hurt(3, 0, world);
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

/* ---------------------------------------------------------------- thalassa */

/**
 * Damage she absorbs mid-move. Far above the warden's five, and measured
 * rather than picked: a player who simply holds the attack key deals about
 * 3.6 damage a second, so at six she was thrown out of nearly every move she
 * started and landed four in a whole fight. Thirteen means mashing buys an
 * interruption now and then instead of always. The answer that always works
 * is the parry - see onParried below.
 */
const THALASSA_POISE = 13;

/** How high a column of the spring tide stands, and how wide it is. */
const GEYSER_H = 118;
const GEYSER_W = 30;
/** How long a column stands once it has come up. */
const GEYSER_LIFE = 0.5;

/**
 * One column of the spring tide: a spot on the floor that bubbles for a moment
 * before the water comes up through it. It runs on its own clock, so knocking
 * her off balance does not call the water back.
 */
interface Geyser {
  x: number;
  /** Seconds of bubbling before the water arrives. */
  wind: number;
  /** Seconds since the mark appeared. */
  t: number;
  /** Each column takes its toll once. */
  hit: boolean;
}

/**
 * Thalassa, the Drowned Crown - what was left of whoever the flooded hall was
 * built for. The boss of the middle of the game: she comes after the caves and
 * before the castle, so she has to be a step up from the roaming skeletons and
 * a step below the knight.
 *
 * The same contract as the other two: every move is announced, a move once
 * begun is seen through, and the pause afterwards is long enough to answer.
 * What is hers alone is that her moves reach across the whole floor - standing
 * far away is not a way out of this fight - and that she goes through three
 * phases instead of two:
 *
 *   1. Her three opening moves, one at a time, the way they were - plus the
 *      spring tide the moment someone parks in her reach, which is the one
 *      thing she does that a blade cannot answer.
 *   2. The flood answers twice: the surge comes in two volleys, the anchor in
 *      a pair, the tide in two ripples, and the undertow keeps its grip in
 *      mid-air. From here the tide is also one of the moves she simply picks.
 *   3. The crown calls once - a ring of five columns and the hall answering -
 *      and after that she stops resting between moves and answers with two
 *      before she breathes.
 *
 * She used to be too easy, measured rather than guessed: a player who only
 * held the attack key killed her in eleven seconds and lost between nothing
 * and four hearts. Three reasons, in the order they mattered: every one of her
 * moves could be batted out of the air by a blind swing and sent back into her
 * for two; her poise was low enough that the same swinging threw her out of
 * nearly every move she began; and what was left of her idled in recovery for
 * more than half the fight.
 */
export class Thalassa extends Enemy {
  private state:
    | 'wait'
    | 'stalk'
    | 'surgeWind'
    | 'surge'
    | 'anchorWind'
    | 'undertowWind'
    | 'undertow'
    | 'tideWind'
    | 'tide'
    | 'crown'
    | 'recover' = 'wait';
  private timer = 0;
  private crown = 0;
  private poise = THALASSA_POISE;
  private lastMove = '';
  /** Which move the crown is filling for - the draw code reads this. */
  private tell: 'none' | 'surge' | 'anchor' | 'undertow' | 'tide' = 'none';
  /** Volleys left in the surge she is in the middle of. */
  private surgeLeft = 0;
  /** Ripples left in the tide she is in the middle of. */
  private tideLeft = 0;
  /** True while the second half of a third-phase pair is still to come. */
  private chained = false;
  /** Her last third opens with the crown's call, and only ever once. */
  private called = false;
  private geysers: Geyser[] = [];
  /** Top of the floor she is standing on: where the tide comes up from. */
  private floorY = 0;
  /** How long he has been standing inside her reach. */
  private crowded = 0;
  /**
   * Time until the floor can be opened again. Without it the crowding rule
   * eats the fight: the tide holds her still for nearly three seconds, which
   * is long enough for a melee player to have been standing there again by the
   * time it ends, so she cast nothing else - measured at twelve tides in one
   * fight, and thirty of its ninety-seven seconds spent in them.
   */
  private tideCool = 0;
  engaged = false;

  constructor(x: number, y: number) {
    super('thalassa', x, y);
    this.w = 50;
    this.h = 62;
    /*
     * Sixty, up from forty-two. A player who mashes deals about 3.6 damage a
     * second, which used to end her in eleven seconds - before she had shown
     * three of her moves once each.
     */
    this.hp = this.maxHp = 60;
    this.scoreValue = 1200;
    this.aggroRange = 380;
    this.contactDamage = 1;
    this.floorY = y + this.h;
  }

  /**
   * Three shapes now instead of two, and cut where the health bar already
   * draws its notches - the same marks the knight's phases use.
   */
  get phase(): 1 | 2 | 3 {
    const left = this.hp / this.maxHp;
    return left > 0.62 ? 1 : left > 0.3 ? 2 : 3;
  }

  /** How much of her old, slow rhythm is left. */
  private get quick(): number {
    return this.phase === 3 ? 0.72 : this.phase === 2 ? 0.85 : 1;
  }

  protected override deathColor(): string {
    return '#4fb3a6';
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
    if (this.poise <= 0 && this.poiseLock <= 0) {
      this.stagger(world, fromDir, 2.4);
    }
  }

  /**
   * A parry always breaks her, whatever her poise. That is what the parry is
   * for: standing in her reach and answering the move itself, rather than
   * hoping enough blind swings add up to an interruption.
   */
  override onParried(world: World): void {
    // Someone already reeling cannot be thrown off balance again: otherwise
    // held-down parries would keep her there.
    if (this.dead || this.stun > 0) return;
    this.stagger(world, -this.facing, 1.2);
  }

  /** Thrown off balance: whatever she was doing is dropped. */
  private stagger(world: World, fromDir: number, lock: number): void {
    this.poise = THALASSA_POISE;
    this.poiseLock = lock;
    this.stun = 0.5;
    this.vx = fromDir * 130;
    world.particles.burst(this.cx, this.cy, 16, '#9fe4dc', { speed: 200, shape: 'spark' });
  }

  protected override die(world: World): void {
    this.geysers.length = 0;
    super.die(world);
  }

  /**
   * A move has ended. In her last third she answers a second time before she
   * rests, and pays for the pair with a longer breath afterwards.
   */
  private afterMove(base: number): void {
    this.tell = 'none';
    if (this.phase === 3 && !this.chained) {
      this.chained = true;
      this.state = 'stalk';
      this.timer = 0.26;
      return;
    }
    const paired = this.chained;
    this.chained = false;
    this.state = 'recover';
    this.timer = base * (paired ? 1.2 : this.quick);
  }

  override update(dt: number, world: World): void {
    this.updateCommon(dt);
    const player = world.player;
    const dx = player.cx - this.cx;
    const dist = Math.abs(dx);
    this.crown = Math.max(0, this.crown - dt * 2);
    if (this.onGround) this.floorY = this.bottom;
    this.crowded = dist < 118 && !player.dead ? this.crowded + dt : 0;
    this.tideCool = Math.max(0, this.tideCool - dt);

    if (!this.engaged) {
      if (dist < this.aggroRange && !player.dead) {
        this.engaged = true;
        this.state = 'recover';
        this.timer = 1.1;
        world.camera.addShake(5);
      }
      this.vy += 1400 * dt;
      this.moveAndCollide(world.level, dt);
      return;
    }

    // The water she has already called up keeps coming, stagger or not.
    this.updateTide(dt, world);

    if (this.stun > 0) {
      if (this.state !== 'recover') {
        this.state = 'recover';
        this.timer = 0.75;
        this.tell = 'none';
        this.surgeLeft = 0;
        this.tideLeft = 0;
        this.chained = false;
      }
      this.vy += 1400 * dt;
      this.moveAndCollide(world.level, dt);
      return;
    }

    this.facing = dx > 0 ? 1 : -1;

    /*
     * The crown's call opens her last third: she drops whatever she was doing,
     * rises, and the whole floor answers at once. It happens exactly once, and
     * the ring of marks comes up with it rather than after it, so the warning
     * is the move.
     */
    if (this.phase === 3 && !this.called && this.state !== 'crown') {
      this.called = true;
      this.state = 'crown';
      this.timer = 1.2;
      this.tell = 'tide';
      this.crown = 1;
      this.surgeLeft = 0;
      this.chained = false;
      this.vx = 0;
      this.geysers = this.markTide([this.cx - 152, this.cx - 68, this.cx + 68, this.cx + 152, player.cx]);
      this.tideLeft = 1;
      this.crowded = 0;
      this.tideCool = 5;
      audio.play('slam', 0.7);
      world.camera.addShake(6);
      world.particles.burst(this.cx, this.cy, 26, '#a8efe6', { speed: 230, gravity: -80, shape: 'spark' });
    }

    this.timer -= dt;

    switch (this.state) {
      case 'wait':
      case 'recover':
        this.vx = approach(this.vx, 0, 700 * dt);
        if (this.timer <= 0) {
          this.state = 'stalk';
          this.timer = rand(0.4, 0.7) * this.quick;
        }
        break;

      case 'stalk': {
        const want = dist > 130 ? sign(dx) * 58 : dist < 70 ? -sign(dx) * 58 : 0;
        this.vx = approach(this.vx, want, 480 * dt);
        if (this.timer <= 0) {
          this.crown = 1;
          const options =
            dist < 120 ? ['surgeWind', 'undertowWind'] : ['anchorWind', 'undertowWind', 'surgeWind'];
          // The tide opens the floor itself, so it answers any range.
          if (this.phase >= 2 && this.tideCool <= 0) options.push('tideWind');
          const pick = options.filter((o) => o !== this.lastMove);
          /*
           * A guest who plants himself in her reach and swings gets the floor
           * opened under him, whatever else she might have picked. Her thrown
           * and cast moves can all be answered with the blade; the tide is the
           * one that cannot, so it is the one that answers standing still.
           */
          const move =
            this.crowded > (this.phase === 1 ? 2.4 : 1.9) && this.tideCool <= 0
              ? 'tideWind'
              : (pick[Math.floor(Math.random() * pick.length)] ?? options[0]);
          this.lastMove = move;
          this.state = move as typeof this.state;
          this.tell =
            move === 'surgeWind'
              ? 'surge'
              : move === 'anchorWind'
                ? 'anchor'
                : move === 'tideWind'
                  ? 'tide'
                  : 'undertow';
          // The warning itself never shortens - only the resting does.
          this.timer = 0.55;
          audio.play('shoot', 0.55);
        }
        break;
      }

      case 'surgeWind':
        // The tide surge: a wave along the floor in both directions, so the
        // answer is height, not distance.
        this.vx = approach(this.vx, 0, 900 * dt);
        this.crown = 1;
        if (this.timer <= 0) {
          this.surgeLeft = this.phase >= 2 ? 2 : 1;
          this.state = 'surge';
          this.timer = 0;
        }
        break;

      case 'surge':
        this.vx = approach(this.vx, 0, 900 * dt);
        this.crown = Math.max(this.crown, 0.75);
        if (this.timer <= 0) {
          for (const dir of [-1, 1]) {
            const wave = new Projectile('shockwave', this.cx + dir * 22, this.bottom - 30, dir * 250, 0);
            // Not something a blind swing bats away: this one is jumped, or
            // turned aside with a parry. And it comes up the hall as water,
            // not as the knight's fire.
            wave.deflectable = false;
            wave.water = true;
            world.spawnProjectile(wave);
          }
          audio.play('slam');
          world.camera.addShake(this.surgeLeft > 1 ? 7 : 5);
          world.particles.burst(this.cx, this.bottom, 22, '#7fd6cc', { speed: 240, gravity: 500 });
          this.surgeLeft--;
          // A second volley far enough behind the first that one jump cannot
          // clear both: he has to land and go again.
          if (this.surgeLeft > 0) this.timer = 0.72;
          else this.afterMove(0.95);
        }
        break;

      case 'anchorWind':
        this.vx = approach(this.vx, 0, 900 * dt);
        this.crown = 1;
        if (this.timer <= 0) {
          // Thrown on an arc that lands where the hero is heading.
          // The arc is solved from the point it is actually thrown from. It
          // used to be solved from her centre and thrown from 26 px above it,
          // which put every anchor down two feet over the hero's head.
          const flight = 0.9;
          const originY = this.cy - 26;
          // From her second phase on she throws a pair: one where he stands,
          // one where he is going. Standing still stops being an answer.
          const leads = this.phase >= 2 ? [0, 0.6] : [0.25];
          for (const lead of leads) {
            const vx = (dx + player.vx * lead) / flight;
            const vy = (player.cy - originY) / flight - 0.5 * 900 * flight;
            const anchor = new Projectile('rock', this.cx - 10, originY, vx, vy);
            world.spawnProjectile(anchor);
          }
          audio.play('shoot');
          this.afterMove(1.0);
        }
        break;

      case 'undertowWind':
        this.vx = approach(this.vx, 0, 900 * dt);
        this.crown = 1;
        if (this.timer <= 0) {
          this.state = 'undertow';
          this.timer = 1.1;
          audio.play('shoot', 0.5);
        }
        break;

      case 'undertow': {
        // Pulls him in while orbs drift out. Running away costs ground, so the
        // fight is decided in her reach whether he likes it or not.
        this.vx = approach(this.vx, 0, 900 * dt);
        const pull = this.phase === 3 ? 340 : this.phase === 2 ? 300 : 260;
        if (!player.dead && dist > 40) {
          // From her second phase the water has hold of him in the air as
          // well: jumping shortens the drag, it no longer cancels it.
          const grip = player.onGround ? 1 : this.phase >= 2 ? 0.45 : 0;
          if (grip > 0) player.vx += -sign(dx) * pull * grip * dt;
        }
        world.particles.spawn({
          x: player.cx + rand(-20, 20),
          y: player.cy + rand(-18, 18),
          vx: -sign(dx) * rand(60, 160),
          vy: rand(-30, 30),
          color: 'rgba(140,220,215,0.6)',
          size: 2.5,
          life: 0.35,
          shape: 'spark',
        });
        if (this.timer <= 0) {
          // Aimed from the hem, not from her shoulders: one orb low along the
          // floor and one just above it, both at the hero rather than over him.
          // Later a third goes straight down the middle.
          const fan = this.phase >= 2 ? [-0.2, 0, 0.2] : [-0.12, 0.12];
          for (const up of fan) {
            const originY = this.cy + 6;
            const ady = player.cy - originY;
            const len = Math.hypot(dx, ady) || 1;
            const orb = new Projectile(
              'orb',
              this.cx - 7,
              originY,
              (dx / len) * 190,
              (ady / len) * 190 + up * 110,
            );
            world.spawnProjectile(orb);
          }
          audio.play('shoot');
          this.afterMove(1.05);
        }
        break;
      }

      case 'tideWind':
        this.vx = approach(this.vx, 0, 900 * dt);
        this.crown = 1;
        if (this.timer <= 0) {
          /*
           * Spring tide: marks on the floor, one under his feet and the rest
           * spread across the room, that bubble before the water comes up
           * through them. This is the answer to a player who parks in her
           * face and mashes - it is a move you walk out of rather than one you
           * have to guess, and it does not care where in the hall he stands.
           */
          const spots = [player.cx, this.cx - 128, this.cx + 128];
          if (this.phase === 3) {
            spots.push(player.cx + (sign(dx) || 1) * 78, this.cx);
          }
          this.geysers = this.markTide(spots);
          this.crowded = 0;
          this.tideCool = 5;
          // A second ripple later, from her second phase on. One column takes
          // a single heart however many come up at once - the hero is
          // untouchable for a moment after a hit - so a tide that punishes
          // standing still has to ask the question twice.
          this.tideLeft = this.phase >= 2 ? 2 : 1;
          audio.play('shoot', 0.4);
          this.state = 'tide';
          this.timer = 1.35;
        }
        break;

      case 'tide':
        // She holds the water up; the columns keep their own time.
        this.vx = approach(this.vx, 0, 700 * dt);
        if (this.timer <= 0) {
          this.tideLeft--;
          if (this.tideLeft > 0) {
            // The second ripple asks where he is now, not where he was.
            this.geysers.push(...this.markTide([player.cx, this.cx - 92, this.cx + 92]));
            audio.play('shoot', 0.35);
            this.timer = 1.35;
          } else {
            this.afterMove(1.0);
          }
        }
        break;

      case 'crown':
        this.vx = approach(this.vx, 0, 700 * dt);
        this.crown = 1;
        if (this.timer <= 0) this.afterMove(0.9);
        break;
    }

    this.vy += 1400 * dt;
    this.moveAndCollide(world.level, dt);
  }

  /**
   * Marks on the floor for one ripple of the tide. Two columns in the same
   * place is one wasted column, so whichever stands where an earlier one
   * already does gets pushed out of the way.
   */
  private markTide(spots: number[]): Geyser[] {
    const taken = this.geysers.filter((g) => g.t < g.wind).map((g) => g.x);
    const out: Geyser[] = [];
    for (const spot of spots) {
      let x = spot;
      for (const other of [...taken, ...out.map((g) => g.x)]) {
        const gap = x - other;
        if (Math.abs(gap) < 52) x = other + (sign(gap) || 1) * 52;
      }
      out.push({ x, wind: 0.68 + out.length * 0.09, t: 0, hit: false });
    }
    return out;
  }

  /** The columns of the spring tide, from bubble to burst. */
  private updateTide(dt: number, world: World): void {
    if (this.geysers.length === 0) return;
    const player = world.player;
    for (const g of this.geysers) {
      const before = g.t;
      g.t += dt;
      if (g.t < g.wind) {
        // Bubbles boiling up out of the floor: the warning.
        if (world.time % 0.05 < dt) {
          world.particles.spawn({
            x: g.x + rand(-GEYSER_W / 2, GEYSER_W / 2),
            y: this.floorY - 3,
            vx: rand(-16, 16),
            vy: rand(-90, -40),
            color: 'rgba(150,235,225,0.7)',
            size: 2.5,
            life: 0.42,
            shape: 'spark',
          });
        }
        continue;
      }
      if (before < g.wind) {
        audio.play('slam', 0.45);
        world.camera.addShake(3);
        world.particles.burst(g.x, this.floorY - 6, 14, '#a8efe6', {
          speed: 220,
          gravity: -60,
          shape: 'spark',
        });
      }
      const power = this.geyserPower(g);
      if (!g.hit && power > 0.35 && !player.dead) {
        const top = this.floorY - GEYSER_H * power;
        if (
          rectsOverlap(
            { x: g.x - GEYSER_W / 2, y: top, w: GEYSER_W, h: this.floorY - top },
            player.rect,
          )
        ) {
          g.hit = true;
          player.hurt(1, sign(player.cx - g.x) || 1, world);
        }
      }
    }
    this.geysers = this.geysers.filter((g) => g.t < g.wind + GEYSER_LIFE);
  }

  /** How much of a column stands right now: up fast, down soft. */
  private geyserPower(g: Geyser): number {
    if (g.t < g.wind) return 0;
    const rise = clamp((g.t - g.wind) / 0.12, 0, 1);
    const fall = clamp((g.wind + GEYSER_LIFE - g.t) / 0.16, 0, 1);
    return Math.min(rise, fall);
  }

  override draw(ctx: CanvasRenderingContext2D): void {
    this.drawTide(ctx);
    withHitFlash(ctx, this.flash, () => {
      ctx.save();
      ctx.translate(this.cx, this.bottom);
      shadow(ctx, 0, 0, this.w * 0.6);
      ctx.scale(this.facing, 1);
      const heat = 0.35 + this.crown * 0.65;

      // Robe: a wide skirt of water-heavy cloth, wider at the floor.
      const g = ctx.createLinearGradient(0, -this.h, 0, 0);
      g.addColorStop(0, '#2c5f63');
      g.addColorStop(0.6, '#1a3d45');
      g.addColorStop(1, '#0b1e26');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-9, -this.h + 12);
      ctx.lineTo(9, -this.h + 12);
      ctx.quadraticCurveTo(22, -20, 24, 0);
      ctx.lineTo(-24, 0);
      ctx.quadraticCurveTo(-22, -20, -9, -this.h + 12);
      ctx.closePath();
      ctx.fill();
      // Weed trailing off the hem, drawn still: this zone holds its breath.
      ctx.fillStyle = 'rgba(60,140,110,0.55)';
      for (let i = -3; i <= 3; i++) {
        ctx.fillRect(i * 6 - 1, -6, 2, 6 + Math.abs(i));
      }

      // Shoulders and arms. The throwing arm rears back for the anchor.
      ctx.fillStyle = '#20464e';
      ctx.fillRect(-14, -this.h + 14, 28, 7);
      if (this.tell === 'anchor') {
        ctx.fillRect(-12, -this.h + 4, 6, 18);
      } else if (this.tell === 'tide') {
        ctx.fillRect(10, -this.h + 2, 6, 18);
        ctx.fillRect(-16, -this.h + 2, 6, 18);
      } else {
        ctx.fillRect(this.crown > 0.5 ? 12 : 10, -this.h + 18, 6, 20);
      }

      // Head, veiled.
      ctx.fillStyle = '#173239';
      ctx.beginPath();
      ctx.moveTo(-8, -this.h + 14);
      ctx.quadraticCurveTo(0, -this.h - 8, 8, -this.h + 14);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = `rgba(150,240,225,${(0.5 + heat * 0.5).toFixed(2)})`;
      ctx.fillRect(-4, -this.h + 4, 3, 2.5);
      ctx.fillRect(2, -this.h + 4, 3, 2.5);

      this.drawTell(ctx);

      // The crown, which is the tell: it fills before every move.
      const cy = -this.h - 4;
      const halo = ctx.createRadialGradient(0, cy, 0, 0, cy, 34 * heat);
      halo.addColorStop(0, `rgba(120,225,210,${(0.5 * heat).toFixed(2)})`);
      halo.addColorStop(1, 'rgba(120,225,210,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(-34, cy - 34, 68, 68);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(190,250,240,${(0.55 + heat * 0.45).toFixed(2)})`;
      for (let i = -2; i <= 2; i++) {
        const h = 9 - Math.abs(i) * 2;
        const bx = i * 6;
        ctx.beginPath();
        ctx.moveTo(bx, cy - h);
        ctx.lineTo(bx + 2.5, cy + 3);
        ctx.lineTo(bx - 2.5, cy + 3);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      ctx.restore();
    });
  }

  /**
   * What she is about to do, drawn on her rather than only over her head, so
   * the four moves can be told apart at a glance. Called inside her own
   * mirrored space, hence the +x for what is in front of her.
   */
  private drawTell(ctx: CanvasRenderingContext2D): void {
    if (this.tell === 'none' || this.crown < 0.05) return;
    const a = this.crown;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    switch (this.tell) {
      case 'surge':
        // Two arcs sweeping out along the floor from under the hem.
        ctx.strokeStyle = `rgba(140,235,225,${(0.5 * a).toFixed(2)})`;
        ctx.lineWidth = 3;
        for (const r of [18, 30]) {
          ctx.beginPath();
          ctx.ellipse(0, -3, r, r * 0.32, 0, Math.PI, Math.PI * 2);
          ctx.stroke();
        }
        break;
      case 'anchor': {
        // The weight itself, held back over her shoulder.
        ctx.fillStyle = `rgba(120,200,205,${(0.75 * a).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(-15, -this.h - 4, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(180,240,235,${(0.5 * a).toFixed(2)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-10, -this.h + 6);
        ctx.lineTo(-15, -this.h - 4);
        ctx.stroke();
        break;
      }
      case 'undertow':
        // Water winding inwards at her feet.
        ctx.strokeStyle = `rgba(160,240,230,${(0.55 * a).toFixed(2)})`;
        ctx.lineWidth = 2.5;
        for (let i = 0; i < 3; i++) {
          const r = 34 - i * 9;
          ctx.beginPath();
          ctx.ellipse(0, -5, r, r * 0.3, 0, 0.3 + i * 0.5, Math.PI * 1.3 + i * 0.5);
          ctx.stroke();
        }
        break;
      case 'tide':
        // Both hands up, and the water answering from over her head.
        ctx.fillStyle = `rgba(170,245,235,${(0.4 * a).toFixed(2)})`;
        for (let i = -1; i <= 1; i += 2) {
          ctx.fillRect(i * 13 - 2, -this.h - 14, 4, 12);
        }
        break;
    }
    ctx.restore();
  }

  /** The spring tide, drawn in world space: marks first, then the water. */
  private drawTide(ctx: CanvasRenderingContext2D): void {
    if (this.geysers.length === 0) return;
    ctx.save();
    for (const g of this.geysers) {
      if (g.t < g.wind) {
        // The mark: a ring closing in on the spot, no flicker in it.
        const p = clamp(g.t / g.wind, 0, 1);
        ctx.strokeStyle = `rgba(150,235,225,${(0.2 + p * 0.45).toFixed(2)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(g.x, this.floorY - 2, GEYSER_W * (0.9 - p * 0.3), 6 - p * 2, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = `rgba(120,215,210,${(0.12 + p * 0.2).toFixed(2)})`;
        ctx.beginPath();
        ctx.ellipse(g.x, this.floorY - 2, GEYSER_W * 0.6, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      const power = this.geyserPower(g);
      if (power <= 0) continue;
      const h = GEYSER_H * power;
      const top = this.floorY - h;
      const col = ctx.createLinearGradient(0, top, 0, this.floorY);
      col.addColorStop(0, `rgba(214,252,248,${(0.9 * power).toFixed(2)})`);
      col.addColorStop(0.4, `rgba(118,214,212,${(0.78 * power).toFixed(2)})`);
      col.addColorStop(1, `rgba(46,138,152,${(0.6 * power).toFixed(2)})`);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(g.x - GEYSER_W / 2, this.floorY);
      ctx.quadraticCurveTo(g.x - GEYSER_W * 0.42, top + h * 0.3, g.x - GEYSER_W * 0.3, top);
      ctx.lineTo(g.x + GEYSER_W * 0.3, top);
      ctx.quadraticCurveTo(g.x + GEYSER_W * 0.42, top + h * 0.3, g.x + GEYSER_W / 2, this.floorY);
      ctx.closePath();
      ctx.fill();
      // Crest.
      ctx.fillStyle = `rgba(226,255,252,${(0.7 * power).toFixed(2)})`;
      ctx.beginPath();
      ctx.ellipse(g.x, top + 2, GEYSER_W * 0.34, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
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
    if (this.poise <= 0 && this.poiseLock <= 0) {
      this.poise = PRISM_POISE;
      this.poiseLock = 2.0;
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
    case 'bomber':
      return new Bomber(x, y);
    case 'shieldman':
      return new Shieldman(x, y);
    case 'charger':
      return new Charger(x, y);
    case 'warden':
      return new Warden(x, y);
    case 'thalassa':
      return new Thalassa(x, y);
    case 'prismarch':
      return new Prismarch(x, y);
  }
}
