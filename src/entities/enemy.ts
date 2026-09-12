import { audio } from '../core/audio';
import { Rect, approach, clamp, rand, rectsOverlap, sign } from '../core/math';
import { PALETTE } from '../render/palette';
import { shadow, withHitFlash } from '../render/sprites';
import { TILE } from '../world/tiles';
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
  | 'gallert'
  | 'hydra'
  | 'warden'
  | 'thalassa'
  | 'prismarch';

/**
 * The kinds that are bosses rather than roster: announced, with a health bar,
 * and once beaten they stay beaten - the checkpoint rebuilds the roster around
 * them, not them.
 */
export const BOSS_KINDS: ReadonlySet<EnemyKind> = new Set<EnemyKind>([
  'gallert',
  'hydra',
  'thalassa',
  'warden',
  'prismarch',
]);

/**
 * What a boss becomes when the hero turns up with a blade that throws.
 *
 * The upgrade is worth roughly two damage a second at no risk at all - most of
 * a sword's output without a sword's danger - and the bosses were built against
 * a sword. Measured on the knight before this: a bot that only held the attack
 * key used to lose the fight eight times over, and with the blade it killed him
 * in fourteen seconds while he got a single move off.
 *
 * So every boss takes stock of the blade in front of it, once, when it wakes:
 * more health, and more punishment absorbed before it loses its footing.
 * Nothing shifts mid-fight, and a hero who never found the upgrade meets
 * exactly the boss that was tuned for him.
 */
export function bossScale(beamTier: number): { hp: number; poise: number } {
  const tier = clamp(beamTier, 0, 2);
  return { hp: 1 + 0.22 * tier, poise: 1 + 0.35 * tier };
}

export abstract class Enemy extends Body {
  hp = 2;
  maxHp = 2;
  /**
   * Which spawn in the level this one came out of. The game uses it to keep a
   * boss that has fallen from being built again at the next checkpoint.
   */
  spawnKey = '';
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
   * Takes stock of the hero's blade, once, at the moment of waking: more
   * health, and a poise figure scaled the same way. See bossScale.
   */
  protected sizeUpFor(world: World, poiseBase: number): number {
    const scale = bossScale(world.player.beamTier);
    this.maxHp = Math.round(this.maxHp * scale.hp);
    this.hp = this.maxHp;
    return Math.round(poiseBase * scale.poise);
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
  /**
   * True when a hop of this reach would come down on nothing, or on something
   * deadly.
   *
   * badStepAhead only looks at the very next step, which is the right question
   * for a walker and the wrong one for anything that jumps: a slime passes that
   * check standing at the rim and then lands in the pit behind it. Measured at
   * its real place in the ruins, that is exactly what happened - three tiles of
   * floor missing, spikes at the bottom, and one fewer slime in the level nine
   * seconds after the run started.
   */
  protected badLandingAhead(world: World, dir: number, reach: number): boolean {
    const level = world.level;
    const x = this.cx + dir * reach;
    if (x < 16 || x > level.pixelWidth - 16) return true;
    if (level.groundBelow(x, this.bottom + 2, 4) > 64) return true;
    const tx = Math.floor(x / 32);
    const foot = Math.floor((this.bottom + 6) / 32);
    return level.hazardAt(tx, foot) || level.hazardAt(tx, foot - 1) || level.hazardAt(tx, foot + 1);
  }

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
          // Where the hop would land, not where the next step would fall: see
          // badLandingAhead. If both ways are bad he hops on the spot.
          const reach = chasing ? 92 : 58;
          let vx = this.dir * (chasing ? 130 : 80);
          if (this.badLandingAhead(world, this.dir, reach)) {
            this.dir = (-this.dir) as 1 | -1;
            vx = this.badLandingAhead(world, this.dir, reach) ? 0 : this.dir * 80;
          }
          this.facing = this.dir;
          this.vy = -350;
          this.vx = vx;
          this.hopTimer = chasing ? rand(0.6, 0.95) : rand(1.1, 1.8);
          world.particles.burst(this.cx, this.bottom, 5, PALETTE.slimeDark, { speed: 60, gravity: 300, size: 3 });
        }
      }
      // Turn around at walls; the ledges are handled where the hop is decided,
      // because that is the only place the landing spot is known.
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
  /** That figure, once it has seen the blade coming. */
  private poiseMax = POISE;
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
      this.poise = this.poiseMax;
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
        this.poise = this.poiseMax = this.sizeUpFor(world, POISE);
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
        /*
         * The landing has to be read as "on the ground and no longer rising".
         * It used to ask for a downward speed as well, and a collision zeroes
         * that in the very frame the feet touch: measured, the warden never
         * finished a slam at all - it stood in the state until a parry or a
         * poise break shook it out, and verify:warden's close-range run showed
         * it plainly, going stalk, slamWind, slam and never coming back.
         */
        if (this.onGround && this.vy >= 0) {
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
        } else if (this.timer <= 0) {
          // Belt and braces: a move can never be a place to get stuck.
          this.state = 'recover';
          this.timer = 0.9;
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

/* ----------------------------------------------------------------- gallert */

/**
 * Damage he shrugs off mid-move. Fourteen, and measured rather than picked: at
 * eight, a player who simply held the attack key threw him out of every move he
 * began and took not a single scratch in the whole fight. He is the first boss
 * in the game, not a sandbag.
 */
const GALLERT_POISE = 14;

/**
 * Gallert, der Aufgequollene - what the bog at the end of the forest made out
 * of every slime that ever died in it. The first boss of the game, and
 * therefore its teacher: each of his three moves is the plain form of something
 * a later fight does harder, and none of them can kill a careful player.
 *
 *   Klatschsprung  - flattens, leaps, lands with a ring. Get out from under it.
 *                    (The warden's slam, slower and with a longer warning.)
 *   Spucke         - three blobs on a short arc, and a blob is the first thing
 *                    in the game that a swing of the blade bats out of the air.
 *                    (Which is exactly what Thalassa's flood wave later
 *                    refuses to be, and that only reads as a rule if the player
 *                    has learned the rule first.)
 *   Teilung        - he pinches two small slimes off himself, at most twice.
 *                    Clear the adds, then get back to him.
 *
 * He is worth a heart: the Herzkern he leaves behind takes the hero from six to
 * seven, for the whole rest of the run.
 */
export class Gallert extends Enemy {
  private state:
    | 'wait'
    | 'stalk'
    | 'hopWind'
    | 'hop'
    | 'spitWind'
    | 'splitWind'
    | 'recover' = 'wait';
  private timer = 0;
  /** The tell: his core lights before every move. */
  private core = 0;
  /** -1 flattened, +1 stretched. Drives the squash of the leap. */
  private squash = 0;
  private poise = GALLERT_POISE;
  private poiseMax = GALLERT_POISE;
  private lastMove = '';
  private hitThisMove = false;
  /** How many small slimes he has pinched off himself. */
  private spawned = 0;
  /** Last floor he stood on, so his shadow stays down there when he leaps. */
  private groundY = 0;
  engaged = false;

  constructor(x: number, y: number) {
    super('gallert', x, y);
    this.w = 74;
    this.h = 52;
    /*
     * Twenty-two. The knight has sixty-four and Thalassa sixty; this one comes
     * before either, against a hero who has nothing but a sword, so it is the
     * short fight that teaches the vocabulary.
     */
    this.hp = this.maxHp = 22;
    this.scoreValue = 700;
    this.aggroRange = 300;
    this.contactDamage = 1;
  }

  get phase(): 1 | 2 {
    return this.hp <= this.maxHp / 2 ? 2 : 1;
  }

  protected override deathColor(): string {
    return '#8fd45c';
  }

  override hurt(amount: number, fromDir: number, world: World): void {
    if (this.dead) return;
    this.hp -= amount;
    this.flash = 1;
    this.poise -= amount;
    this.squash = Math.min(1, this.squash + 0.35);
    if (this.hp <= 0) {
      this.die(world);
      return;
    }
    audio.play('bossHit');
    if (this.poise <= 0 && this.poiseLock <= 0) this.wobble(world, fromDir, 2.0);
  }

  /** A parry always shakes him loose, whatever he has absorbed. */
  override onParried(world: World): void {
    if (this.dead || this.stun > 0) return;
    this.wobble(world, -this.facing, 1.1);
  }

  private wobble(world: World, fromDir: number, lock: number): void {
    this.poise = this.poiseMax;
    this.poiseLock = lock;
    this.stun = 0.5;
    this.squash = 1;
    this.vx = fromDir * 90;
    world.particles.burst(this.cx, this.cy, 18, '#b6f08a', { speed: 190, gravity: 260 });
  }

  protected override die(world: World): void {
    super.die(world);
    // The core he was holding together goes to whoever took him apart.
    world.onMireBossDefeated();
  }

  override update(dt: number, world: World): void {
    this.updateCommon(dt);
    const player = world.player;
    const dx = player.cx - this.cx;
    const dist = Math.abs(dx);
    this.core = Math.max(0, this.core - dt * 2);
    this.squash = approach(this.squash, 0, dt * 2.4);
    if (this.onGround) this.groundY = this.bottom;

    if (!this.engaged) {
      if (dist < this.aggroRange && !player.dead) {
        this.engaged = true;
        this.poise = this.poiseMax = this.sizeUpFor(world, GALLERT_POISE);
        this.state = 'recover';
        this.timer = 1.2;
        this.squash = 1;
        world.camera.addShake(5);
      }
      this.vy += 1400 * dt;
      this.moveAndCollide(world.level, dt);
      return;
    }

    if (this.stun > 0) {
      if (this.state !== 'recover') {
        this.state = 'recover';
        this.timer = 0.8;
        this.core = 0;
      }
      this.vx = approach(this.vx, 0, 500 * dt);
      this.vy += 1400 * dt;
      this.moveAndCollide(world.level, dt);
      return;
    }

    if (this.state !== 'hop') this.facing = dx > 0 ? 1 : -1;
    this.timer -= dt;
    const quick = this.phase === 2 ? 0.85 : 1;

    switch (this.state) {
      case 'wait':
      case 'recover':
        this.vx = approach(this.vx, 0, 600 * dt);
        if (this.timer <= 0) {
          this.state = 'stalk';
          this.timer = rand(0.5, 0.85) * quick;
        }
        break;

      case 'stalk': {
        // A waddle, not a charge: he has to be readable at a walk.
        const want = dist > 120 ? sign(dx) * 52 : 0;
        this.vx = approach(this.vx, want, 380 * dt);
        this.holdBackAtEdges(world);
        if (this.timer <= 0) {
          const options = dist < 150 ? ['hopWind', 'spitWind'] : ['spitWind', 'hopWind'];
          if (this.phase === 2 && this.spawned < 2) options.push('splitWind');
          const pick = options.filter((o) => o !== this.lastMove);
          const move = pick[Math.floor(Math.random() * pick.length)] ?? options[0];
          this.lastMove = move;
          this.state = move as typeof this.state;
          // The longest warnings in the game, because he is the first thing in
          // it that announces anything at all: seven tenths of a second before
          // the leap, six before the spit.
          this.timer = move === 'hopWind' ? 0.7 : 0.6;
          this.core = 1;
          this.hitThisMove = false;
          audio.play('shoot', 0.5);
        }
        break;
      }

      case 'hopWind':
        // Flattens against the floor. Everything about the shape says up.
        this.vx = approach(this.vx, 0, 700 * dt);
        this.core = 1;
        this.squash = -1;
        if (this.timer <= 0) {
          this.state = 'hop';
          this.timer = 1.4;
          this.vy = -560;
          this.vx = clamp(dx / 0.6, -300, 300);
          this.squash = 1;
          audio.play('jump', 0.7);
        }
        break;

      case 'hop':
        // In the air he keeps his heading; landing is the dangerous part. On
        // the ground and no longer rising is the landing - asking for a
        // downward speed as well never fires, because the collision that puts
        // his feet down zeroes it in the same frame.
        if (this.onGround && this.vy >= 0) {
          this.squash = -1;
          audio.play('slam');
          world.camera.addShake(6);
          world.particles.burst(this.cx, this.bottom, 24, '#8fd45c', { speed: 250, gravity: 520 });
          if (
            !this.hitThisMove &&
            !player.dead &&
            Math.abs(player.cx - this.cx) < 74 &&
            Math.abs(player.bottom - this.bottom) < 44
          ) {
            this.hitThisMove = true;
            player.hurt(2, sign(player.cx - this.cx) || 1, world);
          }
          // A long breath afterwards: this is the first boss in the game and
          // the window to answer him has to be unmissable.
          this.state = 'recover';
          this.timer = 1.4 * quick;
        } else if (this.timer <= 0) {
          this.state = 'recover';
          this.timer = 0.9;
        }
        break;

      case 'spitWind':
        this.vx = approach(this.vx, 0, 700 * dt);
        this.core = 1;
        if (this.timer <= 0) {
          // Three blobs on arcs that land around the hero rather than on him:
          // the middle one is aimed, the outer two straddle it.
          const flight = 0.75;
          const originY = this.cy - 14;
          for (const spread of [-64, 0, 64]) {
            const vx = (dx + spread) / flight;
            const vy = (player.cy - originY) / flight - 0.5 * 1150 * flight;
            world.spawnProjectile(new Projectile('blob', this.cx - 8, originY, vx, vy));
          }
          this.squash = 0.6;
          audio.play('shoot');
          this.state = 'recover';
          this.timer = 1.25 * quick;
        }
        break;

      case 'splitWind':
        this.vx = approach(this.vx, 0, 700 * dt);
        this.core = 1;
        if (this.timer <= 0) {
          // Two of him, pinched off and dropped either side. They are ordinary
          // slimes: the point is that they are in the way, not that they are
          // dangerous.
          for (const side of [-1, 1]) {
            const spawn = createEnemy('slime', this.cx + side * 34, this.bottom - 26);
            spawn.y = this.bottom - spawn.h;
            spawn.active = true;
            world.spawnEnemy(spawn);
            world.particles.burst(spawn.cx, spawn.cy, 14, '#8fd45c', { speed: 200, gravity: 300 });
          }
          this.spawned += 2;
          this.squash = -0.6;
          audio.play('slam', 0.6);
          world.camera.addShake(4);
          this.state = 'recover';
          this.timer = 1.25 * quick;
        }
        break;
    }

    this.vy += 1400 * dt;
    this.moveAndCollide(world.level, dt);
    if (this.touchesHazard(world)) this.hurt(3, 0, world);
  }

  /** Contact hurts less than the landing, which does its own, heavier hit. */
  override touchPlayer(world: World): void {
    if (this.state === 'hop') return;
    super.touchPlayer(world);
  }

  override draw(ctx: CanvasRenderingContext2D): void {
    withHitFlash(ctx, this.flash, () => {
      ctx.save();
      ctx.translate(this.cx, this.bottom);
      // The shadow belongs to the floor, not to him: while he is up there it
      // stays down and shrinks, which is what says how high he is.
      const rise = clamp((this.groundY - this.bottom) / 150, 0, 1);
      shadow(ctx, 0, this.groundY - this.bottom, this.w * 0.55 * (1 - rise * 0.45), 0.32 * (1 - rise * 0.5));
      // The squash: flattened when he is about to go up or has just come down,
      // stretched while he is in the air. One slow wobble on top of it, so he
      // is never quite still without ever flickering.
      const wob = Math.sin(this.anim * 2.2) * 0.04;
      const sx = 1 - this.squash * 0.18 + wob;
      const sy = 1 + this.squash * 0.22 - wob;
      ctx.scale(sx, sy);

      const w = this.w / 2;
      const h = this.h;
      const body = ctx.createLinearGradient(0, -h, 0, 0);
      body.addColorStop(0, 'rgba(178,236,126,0.92)');
      body.addColorStop(0.55, 'rgba(120,196,80,0.92)');
      body.addColorStop(1, 'rgba(58,120,52,0.95)');
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(-w, 0);
      ctx.quadraticCurveTo(-w * 0.96, -h * 0.92, 0, -h);
      ctx.quadraticCurveTo(w * 0.96, -h * 0.92, w, 0);
      ctx.closePath();
      ctx.fill();

      // Skin: a bright rim along the top, and a wet highlight.
      ctx.strokeStyle = 'rgba(214,255,168,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-w * 0.9, -h * 0.2);
      ctx.quadraticCurveTo(-w * 0.85, -h * 0.9, 0, -h + 1);
      ctx.quadraticCurveTo(w * 0.85, -h * 0.9, w * 0.9, -h * 0.2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(235,255,210,0.35)';
      ctx.beginPath();
      ctx.ellipse(-w * 0.34, -h * 0.66, w * 0.22, h * 0.14, -0.4, 0, Math.PI * 2);
      ctx.fill();

      // Swallowed things, because a bog slime is made of what it ate.
      ctx.fillStyle = 'rgba(48,92,54,0.7)';
      for (let i = -2; i <= 2; i++) {
        const bx = i * w * 0.3;
        const by = -h * 0.28 - Math.abs(i) * 3;
        ctx.fillRect(bx - 3, by, 6, 4);
      }

      // The core: the tell. It fills before every move and it is the only
      // thing on him that changes brightness.
      const heat = 0.3 + this.core * 0.7;
      const cy = -h * 0.42;
      const halo = ctx.createRadialGradient(0, cy, 0, 0, cy, 30 * heat);
      halo.addColorStop(0, `rgba(226,255,150,${(0.6 * heat).toFixed(2)})`);
      halo.addColorStop(1, 'rgba(226,255,150,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(-30, cy - 30, 60, 60);
      ctx.fillStyle = `rgba(238,255,180,${(0.5 + heat * 0.5).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(0, cy, 7 + this.core * 2, 0, Math.PI * 2);
      ctx.fill();

      // Eyes, floating a little apart from each other.
      ctx.fillStyle = 'rgba(24,40,26,0.85)';
      for (const ex of [-11, 11]) {
        ctx.beginPath();
        ctx.ellipse(ex, -h * 0.66, 4.2, 5.2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(240,255,230,0.9)';
      for (const ex of [-11, 11]) {
        ctx.beginPath();
        ctx.arc(ex + this.facing * 1.4, -h * 0.7, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
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
  /** Her poise figure, once she has seen what she is up against. */
  private poiseMax = THALASSA_POISE;
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
    this.poise = this.poiseMax;
    this.poiseLock = lock;
    this.stun = 0.5;
    this.vx = fromDir * 130;
    world.particles.burst(this.cx, this.cy, 16, '#9fe4dc', { speed: 200, shape: 'spark' });
  }

  protected override die(world: World): void {
    this.geysers.length = 0;
    super.die(world);
    // What she held goes into the blade. The game says so, not she.
    world.onDrownedCrownDefeated();
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
        this.poise = this.poiseMax = this.sizeUpFor(world, THALASSA_POISE);
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
  /** That figure, once it has seen the blade coming. */
  private poiseMax = PRISM_POISE;
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
      this.poise = this.poiseMax;
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
        this.poise = this.poiseMax = this.sizeUpFor(world, PRISM_POISE);
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

/* ------------------------------------------------------------------- hydra */

/** What one neck carries before the blade gets to it. */
const NECK_HP = 10;
/** Damage she shrugs off mid-move. */
const HYDRA_POISE = 8;
/** Seconds an open stump has before the head is back. */
const REGROW = 9.5;
/** How long a pool of her venom lies on the floor. */
const POOL_LIFE = 4.5;

type NeckKind = 'venom' | 'flame' | 'storm' | 'stone' | 'crown';
type NeckState = 'head' | 'stump' | 'sealed';

/**
 * One of her five necks.
 *
 * The head and the stump are two different places on purpose. A head sits where
 * it has to be cut from - the floor, a double jump, a particular step - and the
 * cut neck then droops to the height of the ledge the hero has to stand on to
 * burn it shut. So every neck asks two questions in two places, and the tower
 * is the answer to both.
 */
interface Neck {
  kind: NeckKind;
  hp: number;
  maxHp: number;
  state: NeckState;
  /** Where the head rides, from her middle and her feet. */
  hx: number;
  hy: number;
  /** Where the cut end hangs. */
  sx: number;
  sy: number;
  /** Where the neck leaves her body. */
  rootX: number;
  /** Seconds left before the head is back. */
  regrow: number;
  /** So five necks do not sway as one. */
  phase: number;
  /** Jaw, 0..1. Opens on the wind-up, which is half the tell. */
  jaw: number;
  /** Runs down after a hit, for the flash on that head alone. */
  sting: number;
}

/** A puddle of her venom, eating the floor it lies on. */
interface Pool {
  x: number;
  life: number;
  /** Seconds until the glob that made it actually lands there. */
  wait: number;
}

/** A spot the ceiling is about to drop something on. */
interface Drop {
  x: number;
  wind: number;
  t: number;
  fired: boolean;
}

/**
 * Die Fünfkronige - the hydra in the lair at the end of the rift, and the last
 * thing between the hero and the gate home.
 *
 * The fight is the old story rather than five bosses in a queue: all five heads
 * are awake and all five can be cut, but cutting one is not killing it. The
 * stump thrashes for nine seconds and then the head is back. Steel alone never
 * finishes her.
 *
 * What does is her own fire. The flame head lobs embers; an ember turned aside
 * with a parry flies dead flat and burns a stump shut for good. So the loop is
 *
 *   cut a head  ->  get to the height its stump droops to  ->  bait an ember
 *                ->  parry it into the stump
 *
 * and because a turned ember flies flat, the height the hero is standing at is
 * the height he is aiming at. Four stumps hang off four different ledges, which
 * is what the tower in her lair is for: the climb is not one phase of the fight
 * any more, it is the whole of it.
 *
 * The fifth neck is the fire itself. It can be cut like any other, but nothing
 * can burn its stump, so it simply grows back - unless the other four are
 * already sealed, in which case putting it out finishes her. A player who cuts
 * the flame head first loses nothing but time, and learns the order.
 *
 * The rest of the contract is the one every boss here keeps: each move is
 * announced, a move once begun is seen through, a parry always breaks her, and
 * nothing she does crosses the room - her longest reach is the stone breath at
 * 340 px, and beyond that she waits instead of shelling the far wall.
 */
export class Hydra extends Enemy {
  private state: 'wait' | 'idle' | 'wind' | 'act' | 'recover' | 'rise' = 'wait';
  private timer = 0;
  /** Which neck is taking its turn. */
  private acting = 0;
  private lastActing = -1;
  /** The tell. Fills before every move, on the acting head alone. */
  private glow = 0;
  private poise = HYDRA_POISE;
  private poiseMax = HYDRA_POISE;
  private hitThisMove = false;
  /** How far the stone breath has reached, 0..1. */
  private breath = 0;
  private breathDir: 1 | -1 = -1;
  /** Runs while a gust is pushing. */
  private gust = 0;
  private gustDir: 1 | -1 = 1;
  private pools: Pool[] = [];
  private drops: Drop[] = [];
  /** Top of the floor she sits on: pools and breath lie along it. */
  private floorY = 0;
  /** Underside of her lair's ceiling, found when she wakes: her rocks come off it. */
  private ceilingY = 0;
  private sway = 0;
  /** Which neck the blade is touching right now - see overlaps and hurt. */
  private struck = -1;
  /** Every head that grows back leaves her angrier, and a little quicker. */
  private fury = 0;
  /** How many heads the blade has had to take twice. Read by verify:hydra. */
  regrowths = 0;
  engaged = false;

  /**
   * Head heights are measured against what the hero can actually do, not
   * eyeballed: a standing swing covers 0 to 33 px above the floor, a held jump
   * lifts the blade to about 140 and a double jump to about 205, and a head box
   * is 44 px tall. Stump heights are measured against where he can stand: the
   * floor and the six steps put his middle 15, 111, 175, 239, 303, 367 and 431
   * px above her feet, and a stump hangs at one of those.
   */
  readonly necks: Neck[] = [
    { kind: 'venom', hp: NECK_HP, maxHp: NECK_HP, state: 'head', hx: -104, hy: -74, sx: -122, sy: -15, rootX: -30, regrow: 0, phase: 0.0, jaw: 0, sting: 0 },
    { kind: 'flame', hp: NECK_HP, maxHp: NECK_HP, state: 'head', hx: -36, hy: -104, sx: -48, sy: -104, rootX: -15, regrow: 0, phase: 1.3, jaw: 0, sting: 0 },
    { kind: 'stone', hp: NECK_HP, maxHp: NECK_HP, state: 'head', hx: 96, hy: -150, sx: 120, sy: -111, rootX: 16, regrow: 0, phase: 2.6, jaw: 0, sting: 0 },
    { kind: 'crown', hp: NECK_HP, maxHp: NECK_HP, state: 'head', hx: 52, hy: -258, sx: 64, sy: -239, rootX: 30, regrow: 0, phase: 3.9, jaw: 0, sting: 0 },
    { kind: 'storm', hp: NECK_HP, maxHp: NECK_HP, state: 'head', hx: -12, hy: -430, sx: -20, sy: -431, rootX: 0, regrow: 0, phase: 5.2, jaw: 0, sting: 0 },
  ];

  constructor(x: number, y: number) {
    super('hydra', x, y);
    this.w = 92;
    this.h = 54;
    this.hp = this.maxHp = NECK_HP * 5;
    this.scoreValue = 2500;
    this.aggroRange = 460;
    // She never hurts anyone by being stood next to: everything she does is
    // announced first.
    this.contactDamage = 0;
    this.floorY = y + this.h;
    this.ceilingY = y - 560;
  }

  /* ------------------------------------------------------------- the necks */

  /** Necks still carrying a head. */
  get heads(): Neck[] {
    return this.necks.filter((n) => n.state === 'head');
  }

  /** Stumps waiting to be burned shut, or to grow back. */
  get openStumps(): Neck[] {
    return this.necks.filter((n) => n.state === 'stump');
  }

  get sealed(): number {
    return this.necks.filter((n) => n.state === 'sealed').length;
  }

  /** For the bar: what each neck is doing, left to right. */
  get pips(): NeckState[] {
    return this.necks.map((n) => n.state);
  }

  /** And how much time each open stump has left, 0..1. */
  get pipUrgency(): number[] {
    return this.necks.map((n) => (n.state === 'stump' ? clamp(n.regrow / REGROW, 0, 1) : 1));
  }

  /** The flame neck is the fire, and the fire is the tool. */
  private get fire(): Neck {
    return this.necks[1];
  }

  /** She is finished when the four that can be burned are, and the fire is out. */
  private get finished(): boolean {
    return this.necks.every((n) => (n.kind === 'flame' ? n.state !== 'head' : n.state === 'sealed'));
  }

  /** Where a head is in the world right now. */
  headCentre(neck: Neck): { x: number; y: number } {
    const long = neck.hy < -300;
    const drift = Math.sin(this.sway * (long ? 0.8 : 1.25) + neck.phase) * (long ? 9 : 6);
    const lift = Math.cos(this.sway * 0.9 + neck.phase) * 4;
    return { x: this.cx + neck.hx + drift, y: this.bottom + neck.hy + lift };
  }

  /** Where a cut end hangs. It does not drift: it is a target to line up on. */
  stumpCentre(neck: Neck): { x: number; y: number } {
    return { x: this.cx + neck.sx, y: this.bottom + neck.sy };
  }

  headRect(neck: Neck): Rect {
    const c = this.headCentre(neck);
    return { x: c.x - 26, y: c.y - 22, w: 52, h: 44 };
  }

  /** Deliberately generous: this is what a thrown ember has to be aimed into. */
  stumpRect(neck: Neck): Rect {
    const c = this.stumpCentre(neck);
    return { x: c.x - 28, y: c.y - 28, w: 56, h: 56 };
  }

  /**
   * A sword or a crescent lands on a head, and on nothing else. Her body, her
   * necks and the stumps are not targets, in either direction - walking into
   * her costs nothing, and steel does nothing to a cut neck. Only fire closes
   * one of those.
   */
  override overlaps(r: Rect): boolean {
    this.struck = -1;
    for (const [i, neck] of this.necks.entries()) {
      if (neck.state !== 'head') continue;
      if (rectsOverlap(this.headRect(neck), r)) {
        this.struck = i;
        return true;
      }
    }
    return false;
  }

  protected override deathColor(): string {
    return '#7fd07f';
  }

  override hurt(amount: number, fromDir: number, world: World): void {
    if (this.dead || this.state === 'rise') return;
    // Whichever head the blade was touching when overlaps said yes. A blow
    // that arrives without one - a parry's shove, say - lands on the nearest.
    let neck = this.necks[this.struck];
    if (!neck || neck.state !== 'head') neck = this.heads[0];
    if (!neck) return;
    this.struck = -1;
    neck.hp -= amount;
    neck.sting = 1;
    this.flash = 1;
    this.poise -= amount;
    this.hp = Math.max(0, this.necks.reduce((sum, n) => sum + Math.max(0, n.hp), 0));
    if (neck.hp <= 0) {
      this.cutOff(neck, world);
      return;
    }
    audio.play('bossHit');
    if (this.poise <= 0 && this.poiseLock <= 0) this.reel(world, fromDir, 2.2);
  }

  /** A parry always breaks her, whatever the head has absorbed. */
  override onParried(world: World): void {
    if (this.dead || this.stun > 0 || this.state === 'rise') return;
    this.reel(world, -this.facing, 1.2);
  }

  private reel(world: World, fromDir: number, lock: number): void {
    this.poise = this.poiseMax;
    this.poiseLock = lock;
    this.stun = 0.55;
    this.glow = 0;
    void fromDir;
    const c = this.headCentre(this.necks[this.acting]);
    world.particles.burst(c.x, c.y, 18, '#c8ffb0', { speed: 210, shape: 'spark' });
  }

  /** A head comes off. It is not dead - it is counting. */
  private cutOff(neck: Neck, world: World): void {
    neck.hp = 0;
    neck.state = 'stump';
    neck.regrow = REGROW;
    neck.jaw = 0;
    const c = this.headCentre(neck);
    world.particles.burst(c.x, c.y, 38, '#9fe88a', { speed: 280, gravity: 300 });
    world.particles.burst(c.x, c.y, 20, '#d8ffcf', { speed: 180, shape: 'spark' });
    world.camera.addShake(7);
    world.hitStop(0.1);
    audio.play('bossHit', 0.7);
    world.addScore(300, c.x, c.y, '+300');
    if (this.finished) {
      this.hp = 0;
      this.die(world);
      return;
    }
    // The move that head was in the middle of is called off with it.
    if (this.necks[this.acting] === neck) {
      this.breath = 0;
      this.gust = 0;
      this.drops.length = 0;
      this.state = 'recover';
      this.timer = 0.9;
    }
    world.onHydraNeckCut(neck.kind === 'flame');
  }

  /** Her own fire, turned back into an open stump. That one is finished. */
  private cauterise(neck: Neck, world: World): void {
    neck.state = 'sealed';
    neck.regrow = 0;
    const c = this.stumpCentre(neck);
    world.particles.burst(c.x, c.y, 30, '#ffd49a', { speed: 220, gravity: -40 });
    world.particles.burst(c.x, c.y, 16, '#fff4d8', { speed: 150, shape: 'spark' });
    world.camera.addShake(6);
    world.hitStop(0.12);
    audio.play('victory', 0.5);
    world.addScore(500, c.x, c.y, '+500');
    world.onHydraNeckSealed(this.sealed);
    if (this.finished) {
      this.hp = 0;
      this.die(world);
    }
  }

  /** Nine seconds up, and the blade's work is undone. */
  private regrowNeck(neck: Neck, world: World): void {
    neck.state = 'head';
    neck.hp = Math.max(1, Math.round(neck.maxHp * 0.6));
    neck.jaw = 1;
    this.fury = Math.min(4, this.fury + 1);
    this.regrowths++;
    this.hp = Math.max(0, this.necks.reduce((sum, n) => sum + Math.max(0, n.hp), 0));
    const c = this.headCentre(neck);
    world.particles.burst(c.x, c.y, 26, '#8fe07a', { speed: 240, gravity: -60 });
    world.camera.addShake(6);
    audio.play('bossRoar', 1.1);
  }

  protected override die(world: World): void {
    this.pools.length = 0;
    this.drops.length = 0;
    this.breath = 0;
    this.gust = 0;
    super.die(world);
    world.onHydraDefeated();
  }

  /* ------------------------------------------------------------ the fight */

  override update(dt: number, world: World): void {
    this.updateCommon(dt);
    const player = world.player;
    const dx = player.cx - this.cx;
    const dist = Math.abs(dx);
    this.sway += dt;
    this.glow = Math.max(0, this.glow - dt * 2);
    if (this.onGround) this.floorY = this.bottom;
    for (const neck of this.necks) {
      neck.sting = Math.max(0, neck.sting - dt * 3);
      const wants = this.state === 'wind' && this.necks[this.acting] === neck ? 1 : 0;
      neck.jaw += (wants - neck.jaw) * Math.min(1, dt * 9);
    }

    if (!this.engaged) {
      if (dist < this.aggroRange && !player.dead) {
        this.engaged = true;
        this.measureTheRoom(world);
        world.onHydraEngaged();
        this.poise = this.poiseMax = this.sizeUpFor(world, HYDRA_POISE);
        // sizeUpFor grows the whole of her; the necks carry that between them,
        // since a neck is what the bar and the fight actually measure.
        const perNeck = Math.max(1, Math.round(this.maxHp / this.necks.length));
        for (const neck of this.necks) {
          neck.hp = neck.maxHp = perNeck;
        }
        this.state = 'rise';
        this.timer = 1.6;
        world.camera.addShake(7);
        audio.play('bossRoar');
      }
      this.vy += 1400 * dt;
      this.moveAndCollide(world.level, dt);
      return;
    }

    // Everything she has already put into the world runs on its own clock.
    this.updateStumps(dt, world);
    /*
     * Checked every frame rather than only on the cut and the seal: with the
     * fire already off and the last of the four burned shut, she is finished
     * whichever of the two happened last, and waiting for the next cut to
     * notice would leave her standing there with nothing left to fight with.
     */
    if (this.finished && !this.dead) {
      this.hp = 0;
      this.die(world);
      return;
    }
    this.updatePools(dt, world);
    this.updateDrops(dt, world);
    this.updateBreath(dt, world);
    this.updateGust(dt, world);
    if (this.dead) return;

    if (this.stun > 0) {
      if (this.state !== 'recover') {
        this.state = 'recover';
        this.timer = 0.8;
        this.hitThisMove = true;
      }
      this.vy += 1400 * dt;
      this.moveAndCollide(world.level, dt);
      return;
    }

    this.facing = dx > 0 ? 1 : -1;
    this.timer -= dt;
    // Every head she has had to regrow costs her a little of her patience.
    const haste = 1 - this.fury * 0.06;

    switch (this.state) {
      case 'rise':
        this.glow = Math.min(1, this.glow + dt * 2);
        if (this.timer <= 0) {
          this.state = 'recover';
          this.timer = 0.9;
          audio.play('bossRoar', 1.2);
          world.camera.addShake(5);
        }
        break;

      case 'wait':
      case 'recover':
        if (this.timer <= 0) {
          this.state = 'idle';
          this.timer = rand(0.3, 0.55) * haste;
        }
        break;

      case 'idle':
        if (this.timer <= 0) {
          /*
           * Nothing she does carries across the room. Her longest move is the
           * stone breath at 340 px and the venom arc is shorter still, so out
           * beyond her reach she waits instead of lobbing at a dot on the far
           * wall. Measured as a real distance rather than a horizontal one:
           * while the hero is on the tower he is above her, not beside her.
           */
          if (Math.hypot(dx, player.cy - this.cy) > this.aggroRange) {
            this.timer = 0.3;
            this.glow = Math.max(this.glow, 0.15);
            break;
          }
          // Every head off at once: nothing to wind up with, so she thrashes
          // and waits for one to come back.
          if (this.heads.length === 0) {
            this.timer = 0.4;
            break;
          }
          this.acting = this.chooseNeck();
          this.state = 'wind';
          this.glow = 1;
          this.hitThisMove = false;
          // The longest warnings belong to the biggest thing in the game.
          this.timer = (this.necks[this.acting].kind === 'storm' ? 0.75 : 0.65) * haste;
          audio.play('shoot', 0.5);
        }
        break;

      case 'wind':
        this.glow = 1;
        if (this.timer <= 0) this.beginMove(world, dx, dist);
        break;

      case 'act':
        if (this.timer <= 0) {
          this.breath = 0;
          this.state = 'recover';
          this.timer = (this.necks[this.acting].kind === 'crown' ? 1.0 : 1.15) * haste;
        }
        break;
    }

    this.vy += 1400 * dt;
    this.moveAndCollide(world.level, dt);
  }

  /**
   * Whose turn it is. Two rules on top of "not the same one twice": while a
   * stump is open the fire head gets most of the turns, because the fire is
   * what closes stumps and a hero who cannot get any is stuck watching his work
   * grow back.
   */
  private chooseNeck(): number {
    const alive = this.necks.map((n, i) => ({ n, i })).filter((e) => e.n.state === 'head');
    if (alive.length === 0) return this.acting;
    if (this.openStumps.length > 0 && this.fire.state === 'head' && Math.random() < 0.7) {
      return this.necks.indexOf(this.fire);
    }
    const fresh = alive.filter((e) => e.i !== this.lastActing);
    const pick = (fresh.length ? fresh : alive)[Math.floor(Math.random() * (fresh.length ? fresh.length : alive.length))];
    this.lastActing = pick.i;
    return pick.i;
  }

  /**
   * Where her lair's floor and ceiling are. Both are read out of the level once
   * she wakes: her rocks fall the height of the room, and the room is a room
   * rather than an open shaft.
   */
  private measureTheRoom(world: World): void {
    const level = world.level;
    this.floorY = this.bottom;
    const tx = Math.floor(this.cx / TILE);
    let ty = Math.floor((this.floorY - 1) / TILE);
    while (ty > 0 && !level.solidAt(tx, ty - 1)) ty--;
    this.ceilingY = ty * TILE;
  }

  /** How far from her middle anything she throws is allowed to land. */
  private static readonly THROW_REACH = 300;

  /* ------------------------------------------------------------- her moves */

  private beginMove(world: World, dx: number, dist: number): void {
    const player = world.player;
    const neck = this.necks[this.acting];
    const from = this.headCentre(neck);
    switch (neck.kind) {
      case 'venom': {
        // Three globs on short arcs, landing around him rather than on him.
        // The arc is solved, so where each one comes down is known here: the
        // pool is queued for that spot and that moment rather than waiting for
        // the glob to report back.
        const flight = 0.8;
        const aim = clamp(dx, -Hydra.THROW_REACH, Hydra.THROW_REACH);
        const aimY = Math.min(player.cy, this.floorY - 8);
        for (const spread of [-72, 0, 72]) {
          const vx = (aim + spread) / flight;
          const vy = (aimY - from.y) / flight - 0.5 * 1150 * flight;
          const glob = new Projectile('blob', from.x - 8, from.y, vx, vy);
          glob.damage = 1;
          world.spawnProjectile(glob);
          this.pools.push({ x: this.cx + aim + spread, life: POOL_LIFE, wait: flight });
        }
        audio.play('shoot');
        this.state = 'recover';
        this.timer = 1.1;
        break;
      }
      case 'flame': {
        // The move the whole fight hangs on: fire, lobbed onto him wherever he
        // is standing, and the only thing that can shut a stump. Two of them,
        // so one can be taken on the chin and the other turned.
        this.lobEmbers(world, from, this.openStumps.length > 0 ? 2 : 1);
        this.state = 'recover';
        // Quicker back to it while a stump is open: the hero needs fire to
        // close one, and standing about waiting for a coal is not a fight.
        this.timer = this.openStumps.length > 0 ? 0.8 : 1.0;
        break;
      }
      case 'stone':
        // A sweep of the neck along the floor - and the steps get the debris,
        // so standing up there is no longer the answer it was.
        this.breathDir = dx > 0 ? 1 : -1;
        this.breath = 0.001;
        this.markDrops(world, [this.cx - 150, this.cx + 20, this.cx + 170], 0.85);
        audio.play('slam');
        world.camera.addShake(5);
        this.state = 'act';
        this.timer = 1.0;
        break;
      case 'storm':
        // Rocks onto the steps, and a gust while he is between them.
        this.markDrops(world, [player.cx, player.cx + rand(-150, 150), this.cx + rand(-170, 170)]);
        if (dist > 120 || player.bottom < this.floorY - 60) {
          this.gust = 1.1;
          this.gustDir = player.cx > this.cx ? 1 : -1;
        }
        audio.play('shoot', 0.4);
        this.state = 'recover';
        this.timer = 1.2;
        break;
      case 'crown': {
        // The crowned head borrows whatever the others are doing, faster.
        const pick = Math.floor(Math.random() * 3);
        if (pick === 0) {
          const flight = 0.75;
          const aim = clamp(dx, -Hydra.THROW_REACH, Hydra.THROW_REACH);
          const aimY = Math.min(player.cy, this.floorY - 8);
          for (const spread of [-60, 60]) {
            const vx = (aim + spread) / flight;
            const vy = (aimY - from.y) / flight - 0.5 * 1150 * flight;
            const glob = new Projectile('blob', from.x - 8, from.y, vx, vy);
            world.spawnProjectile(glob);
            this.pools.push({ x: this.cx + aim + spread, life: POOL_LIFE, wait: flight });
          }
          audio.play('shoot');
          this.state = 'recover';
          this.timer = 0.95;
        } else if (pick === 1) {
          this.breathDir = dx > 0 ? 1 : -1;
          this.breath = 0.001;
          audio.play('slam', 0.8);
          this.state = 'act';
          this.timer = 1.0;
        } else {
          this.markDrops(world, [player.cx, player.cx + rand(-120, 120)], 0.7);
          audio.play('shoot', 0.4);
          this.state = 'recover';
          this.timer = 1.0;
        }
        break;
      }
    }
  }

  /** Coals on a solved arc, so they arrive wherever he is standing. */
  private lobEmbers(world: World, from: { x: number; y: number }, count: number): void {
    const player = world.player;
    const flight = 0.85;
    for (let i = 0; i < count; i++) {
      // One coal comes down on him and the rest go wide. Two lobbed either side
      // of him is two he cannot turn: a parry box is fifty pixels across, so a
      // pair straddling him at thirty-four each just misses twice.
      const spread = i === 0 ? 0 : 78 * (i % 2 === 1 ? 1 : -1);
      const targetX = player.cx + spread;
      const vx = (targetX - from.x) / flight;
      const vy = (player.cy - 6 - from.y) / flight - 0.5 * 1000 * flight;
      const ember = new Projectile('ember', from.x - 9, from.y - 9, vx, vy);
      world.spawnProjectile(ember);
    }
    audio.play('shoot', 0.8);
    world.camera.addShake(3);
  }

  /**
   * Marks on the ceiling that become falling rock. Clamped to her own stretch
   * of ceiling: she brings the room down around herself, not across it.
   */
  private markDrops(world: World, spots: number[], wind = 0.7): void {
    void world;
    for (const [i, x] of spots.entries()) {
      const at = clamp(x, this.cx - Hydra.THROW_REACH - 120, this.cx + Hydra.THROW_REACH + 120);
      this.drops.push({ x: at, wind: wind + i * 0.12, t: 0, fired: false });
    }
  }

  /* --------------------------------------------------- what she left behind */

  /**
   * The stumps: counting down, and waiting for fire. A turned ember is caught
   * here rather than by the general projectile pass, so that steel thrown at a
   * stump still does nothing and only fire closes it.
   */
  private updateStumps(dt: number, world: World): void {
    for (const neck of this.necks) {
      if (neck.state !== 'stump') continue;
      const box = this.stumpRect(neck);
      for (const p of world.projectiles) {
        if (p.dead || !p.friendly || p.kind !== 'ember') continue;
        if (!rectsOverlap(box, p.rect)) continue;
        p.dead = true;
        this.cauterise(neck, world);
        break;
      }
      if (neck.state !== 'stump') continue;
      neck.regrow -= dt;
      if (world.time % 0.09 < dt) {
        const c = this.stumpCentre(neck);
        world.particles.spawn({
          x: c.x + rand(-9, 9),
          y: c.y + rand(-6, 6),
          vx: rand(-24, 24),
          vy: rand(10, 50),
          gravity: 220,
          color: 'rgba(150,220,110,0.7)',
          size: 3,
          life: 0.5,
          shape: 'circle',
        });
      }
      if (neck.regrow <= 0) this.regrowNeck(neck, world);
    }
  }

  private updatePools(dt: number, world: World): void {
    const player = world.player;
    for (const pool of this.pools) {
      if (pool.wait > 0) {
        pool.wait -= dt;
        continue;
      }
      pool.life -= dt;
      if (world.time % 0.08 < dt) {
        world.particles.spawn({
          x: pool.x + rand(-22, 22),
          y: this.floorY - 4,
          vx: rand(-10, 10),
          vy: -rand(12, 34),
          color: 'rgba(150,225,110,0.6)',
          size: 2.5,
          life: 0.5,
          shape: 'circle',
        });
      }
      if (pool.life <= 0 || player.dead) continue;
      const box = { x: pool.x - 26, y: this.floorY - 14, w: 52, h: 16 };
      if (rectsOverlap(box, player.rect)) player.hurt(1, sign(player.cx - pool.x) || 1, world);
    }
    this.pools = this.pools.filter((p) => p.wait > 0 || p.life > 0);
  }

  private updateDrops(dt: number, world: World): void {
    if (this.drops.length === 0) return;
    for (const drop of this.drops) {
      drop.t += dt;
      if (drop.t < drop.wind) {
        if (world.time % 0.06 < dt) {
          world.particles.spawn({
            x: drop.x + rand(-14, 14),
            y: this.ceilingY + 8,
            vx: rand(-6, 6),
            vy: rand(20, 60),
            color: 'rgba(200,190,170,0.7)',
            size: 2,
            life: 0.5,
            shape: 'circle',
          });
        }
        continue;
      }
      if (!drop.fired) {
        drop.fired = true;
        const rock = new Projectile('rock', drop.x - 10, this.ceilingY + 2, 0, 120);
        world.spawnProjectile(rock);
        audio.play('slam', 0.4);
      }
    }
    this.drops = this.drops.filter((d) => !d.fired || d.t < d.wind + 0.4);
  }

  private updateBreath(dt: number, world: World): void {
    if (this.breath <= 0) return;
    this.breath = Math.min(1, this.breath + dt * 2.6);
    const player = world.player;
    const reach = 340 * this.breath;
    const box = {
      x: this.breathDir > 0 ? this.cx : this.cx - reach,
      y: this.floorY - 40,
      w: reach,
      h: 40,
    };
    if (world.time % 0.04 < dt) {
      world.particles.spawn({
        x: this.cx + this.breathDir * rand(20, reach),
        y: this.floorY - rand(6, 34),
        vx: this.breathDir * rand(60, 190),
        vy: -rand(10, 60),
        color: 'rgba(190,180,160,0.6)',
        size: 3,
        life: 0.35,
        shape: 'circle',
      });
    }
    if (!this.hitThisMove && !player.dead && rectsOverlap(box, player.rect)) {
      this.hitThisMove = true;
      player.hurt(2, this.breathDir, world);
    }
  }

  private updateGust(dt: number, world: World): void {
    if (this.gust <= 0) return;
    this.gust -= dt;
    const player = world.player;
    if (player.dead) return;
    // Only in the air, and gently: it is there to make the climb a climb, not
    // to take it away from him.
    if (!player.onGround) player.vx += this.gustDir * 150 * dt;
    if (world.time % 0.05 < dt) {
      world.particles.spawn({
        x: player.cx - this.gustDir * rand(40, 160),
        y: player.cy + rand(-40, 40),
        vx: this.gustDir * rand(120, 260),
        vy: rand(-20, 20),
        color: 'rgba(200,230,255,0.5)',
        size: 2,
        life: 0.35,
        shape: 'spark',
      });
    }
  }

  /* ------------------------------------------------------------- drawing */

  override draw(ctx: CanvasRenderingContext2D): void {
    this.drawPools(ctx);
    this.drawDrops(ctx);
    this.drawBreath(ctx);
    withHitFlash(ctx, this.flash, () => {
      ctx.save();
      shadow(ctx, this.cx, this.bottom, this.w * 0.62);
      /*
       * Back to front by how far the neck leans out: the ones reaching across
       * her pass behind the ones on the near side, so five necks read as depth
       * instead of as a tangle. Her body goes over all of their roots.
       */
      const order = [...this.necks].sort((a, b) => this.lean(b) - this.lean(a));
      const behind = order.filter((n) => this.lean(n) >= 0);
      const infront = order.filter((n) => this.lean(n) < 0);
      for (const neck of behind) this.drawNeck(ctx, neck);
      this.drawBody(ctx);
      for (const neck of infront) this.drawNeck(ctx, neck);
      for (const neck of order) this.drawCrest(ctx, neck);
      ctx.restore();
    });
  }

  /** How far out the neck reaches, used only to decide painting order. */
  private lean(neck: Neck): number {
    return neck.state === 'head' ? Math.abs(neck.hx) + -neck.hy * 0.25 : Math.abs(neck.sx);
  }

  /** Where the far end of a neck is, whatever is on it. */
  private endOf(neck: Neck): { x: number; y: number } {
    return neck.state === 'head' ? this.headCentre(neck) : this.stumpCentre(neck);
  }

  /**
   * The spine of a neck, as points along a quadratic curve with a radius that
   * tapers from the root to the far end.
   */
  private neckSpine(neck: Neck): { x: number; y: number; r: number }[] {
    const root = { x: this.cx + neck.rootX * 1.5, y: this.bottom - this.bulk.h * 0.5 };
    const end = this.endOf(neck);
    const span = Math.hypot(end.x - root.x, end.y - root.y);
    const alive = neck.state === 'head';
    const bow = alive ? Math.sin(this.sway * 1.05 + neck.phase) * Math.min(26, span * 0.09) : 0;
    const mid = {
      x: (root.x + end.x) / 2 + bow - (end.x - root.x) * 0.2,
      y: (root.y + end.y) / 2 - Math.min(78, span * 0.32),
    };
    // Enough samples that the neck reads as a body: the storm head hangs 430 px
    // up, and a fixed count leaves that one a dotted line.
    const steps = Math.max(18, Math.min(96, Math.round(span / 8)));
    const out: { x: number; y: number; r: number }[] = [];
    const thick = neck.state === 'sealed' ? 0.82 : 1;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const u = 1 - t;
      out.push({
        x: u * u * root.x + 2 * u * t * mid.x + t * t * end.x,
        y: u * u * root.y + 2 * u * t * mid.y + t * t * end.y,
        r: (17 - 9 * Math.pow(t, 0.6)) * thick,
      });
    }
    return out;
  }

  /**
   * One neck: a tapered tube with a lit top, a dark underside and scale plates
   * laid down its length, plus whatever is on the end of it.
   */
  private drawNeck(ctx: CanvasRenderingContext2D, neck: Neck): void {
    const spine = this.neckSpine(neck);
    const normals: { nx: number; ny: number }[] = [];
    for (let i = 0; i < spine.length; i++) {
      const a = spine[Math.max(0, i - 1)];
      const b = spine[Math.min(spine.length - 1, i + 1)];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      normals.push({ nx: -dy / len, ny: dx / len });
    }

    const acting = this.necks[this.acting] === neck && neck.state === 'head';
    const heat = acting ? this.glow : 0;
    const dark = neck.state === 'sealed' ? '#1f2a1b' : '#24421f';
    const skin =
      neck.state === 'sealed'
        ? '#3c4a33'
        : `rgb(${74 + heat * 90},${132 + heat * 60},${68 + neck.sting * 90})`;

    // The tube, as a single outline so nothing seams.
    ctx.beginPath();
    for (let i = 0; i < spine.length; i++) {
      const p = spine[i];
      const n = normals[i];
      const x = p.x + n.nx * p.r;
      const y = p.y + n.ny * p.r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let i = spine.length - 1; i >= 0; i--) {
      const p = spine[i];
      const n = normals[i];
      ctx.lineTo(p.x - n.nx * p.r, p.y - n.ny * p.r);
    }
    ctx.closePath();
    ctx.fillStyle = dark;
    ctx.fill();

    // Lit side: a narrower tube laid off-centre towards the light, so the neck
    // has a top and an underside rather than reading as a flat pipe.
    ctx.fillStyle = skin;
    for (let i = 0; i < spine.length; i++) {
      const p = spine[i];
      const n = normals[i];
      ctx.beginPath();
      ctx.arc(p.x - n.nx * p.r * 0.36, p.y - n.ny * p.r * 0.36, p.r * 0.54, 0, Math.PI * 2);
      ctx.fill();
    }

    // Scale plates: short arcs across the tube, tightening towards the head.
    ctx.strokeStyle = neck.state === 'sealed' ? 'rgba(14,20,12,0.6)' : 'rgba(18,38,18,0.55)';
    ctx.lineCap = 'round';
    for (let i = 4; i < spine.length - 2; i += 5) {
      const p = spine[i];
      const n = normals[i];
      ctx.lineWidth = Math.max(1.2, p.r * 0.16);
      ctx.beginPath();
      ctx.moveTo(p.x + n.nx * p.r * 0.86, p.y + n.ny * p.r * 0.86);
      ctx.lineTo(p.x - n.nx * p.r * 0.18, p.y - n.ny * p.r * 0.18);
      ctx.stroke();
    }

    if (neck.state === 'head') this.drawHead(ctx, neck);
    else if (neck.state === 'stump') this.drawStump(ctx, neck);
    else this.drawSeal(ctx, neck);
  }

  /**
   * How big she is drawn. Her hit box is what the physics walks her around on;
   * nothing is ever hit on it - only a head is a target - so the body she is
   * painted as can be the size she ought to look.
   */
  private get bulk(): { w: number; h: number } {
    return { w: this.w * 1.4, h: this.h * 1.55 };
  }

  private drawBody(ctx: CanvasRenderingContext2D): void {
    const cx = this.cx;
    const base = this.bottom;
    const { w, h } = this.bulk;

    // Coils behind her, so the silhouette is wider than the hit box suggests.
    ctx.fillStyle = '#16301b';
    for (const side of [1, -1]) {
      ctx.beginPath();
      ctx.ellipse(cx + side * w * 0.53, base - 15, w * 0.36, 16, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const body = ctx.createLinearGradient(0, base - h, 0, base);
    body.addColorStop(0, '#6fb262');
    body.addColorStop(0.4, '#3f7a42');
    body.addColorStop(1, '#132a17');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(cx, base - h * 0.44, w * 0.5, h * 0.56, 0, 0, Math.PI * 2);
    ctx.fill();

    // Belly: a band of pale scutes rather than a lit blob.
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, base - h * 0.44, w * 0.5, h * 0.56, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = 'rgba(200,222,156,0.3)';
    ctx.lineWidth = 6;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.ellipse(cx, base - 2 - i * 9, w * (0.3 - i * 0.02), 8, 0, Math.PI * 1.05, Math.PI * 1.95, true);
      ctx.stroke();
    }
    // Carapace: overlapping plates sweeping up her back.
    ctx.strokeStyle = 'rgba(16,34,18,0.7)';
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.ellipse(cx, base - h * (0.26 + i * 0.15), w * (0.46 - i * 0.05), 11, 0, Math.PI * 1.04, Math.PI * 1.96);
      ctx.stroke();
    }
    ctx.restore();

    // Rim light along her back, so she is not a dark mass on a dark wall.
    ctx.save();
    ctx.strokeStyle = 'rgba(178,232,146,0.38)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(cx, base - h * 0.44, w * 0.5 - 1, h * 0.56 - 1, 0, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
    ctx.restore();

    // Spines along the ridge, tallest in the middle.
    const ridge = base - h * 0.82;
    for (let i = -4; i <= 4; i++) {
      const x = cx + i * 14;
      const tall = 18 - Math.abs(i) * 2.4;
      const droop = Math.abs(i) * 2.8;
      ctx.fillStyle = i % 2 === 0 ? '#cfdfa8' : '#9fb682';
      ctx.beginPath();
      ctx.moveTo(x - 5.5, ridge + droop);
      ctx.lineTo(x, ridge + droop - tall);
      ctx.lineTo(x + 5.5, ridge + droop);
      ctx.closePath();
      ctx.fill();
    }

    // Forelimbs, dug in.
    for (const side of [-1, 1]) {
      const lx = cx + side * w * 0.34;
      ctx.fillStyle = '#2a5430';
      ctx.beginPath();
      ctx.moveTo(lx - side * 9, base - 32);
      ctx.quadraticCurveTo(lx + side * 13, base - 23, lx + side * 11, base - 2);
      ctx.lineTo(lx - side * 7, base - 2);
      ctx.quadraticCurveTo(lx - side * 2, base - 19, lx - side * 13, base - 27);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#dcebbf';
      for (let c = 0; c < 3; c++) {
        const clawX = lx + side * (4 + c * 5);
        ctx.beginPath();
        ctx.moveTo(clawX, base - 7);
        ctx.lineTo(clawX + side * 6, base - 1);
        ctx.lineTo(clawX, base - 1);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  private neckColours(kind: NeckKind): [string, string, string] {
    switch (kind) {
      case 'venom':
        return ['#7fd45c', '#d8ff9f', '#2f5a25'];
      case 'flame':
        return ['#e07a3a', '#ffd39a', '#5f2a12'];
      case 'storm':
        return ['#79b8e0', '#dff1ff', '#22465f'];
      case 'stone':
        return ['#9a9384', '#e6e0d2', '#3f3b33'];
      case 'crown':
        return ['#d9b84a', '#fff0b8', '#5d4712'];
    }
  }

  /**
   * A serpent skull: a long snout on a hinged jaw that opens while the head is
   * winding up, a brow over a slit eye, teeth, and a frill. The jaw is half the
   * tell - a head about to breathe is a head with its mouth open.
   */
  private drawHead(ctx: CanvasRenderingContext2D, neck: Neck): void {
    const at = this.headCentre(neck);
    const [skin, bright, shade] = this.neckColours(neck.kind);
    const acting = this.necks[this.acting] === neck;
    const heat = acting ? 0.25 + this.glow * 0.75 : 0.12;
    // Every head watches the hero once she is awake. Five skulls turning with
    // him is most of what makes her read as one animal rather than five props.
    const toward = this.engaged ? this.facing : neck.hx > 0 ? 1 : -1;
    const lean = Math.sin(this.sway * 1.15 + neck.phase) * 0.08;

    ctx.save();
    ctx.translate(at.x, at.y);
    ctx.scale(toward, 1);
    ctx.rotate(lean);

    if (this.glow > 0.05 && acting) {
      const halo = ctx.createRadialGradient(6, 0, 0, 6, 0, 58 * heat);
      halo.addColorStop(0, `rgba(255,255,226,${(0.32 * heat).toFixed(2)})`);
      halo.addColorStop(1, 'rgba(255,255,220,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(-58, -58, 116, 116);
    }
    if (neck.sting > 0.02) {
      ctx.fillStyle = `rgba(255,240,220,${(neck.sting * 0.35).toFixed(2)})`;
      ctx.beginPath();
      ctx.ellipse(4, 0, 30, 22, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Frill behind the skull, so the head does not sit flush on the neck.
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.moveTo(-12, -18);
    ctx.lineTo(-31, -27);
    ctx.lineTo(-26, 0);
    ctx.lineTo(-31, 25);
    ctx.lineTo(-12, 16);
    ctx.closePath();
    ctx.fill();

    // Lower jaw, hinged at the back and swinging open on the wind-up.
    ctx.save();
    ctx.translate(-8, 4);
    ctx.rotate(neck.jaw * 0.5);
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.quadraticCurveTo(16, 2, 30, 3);
    ctx.quadraticCurveTo(16, 12, 0, 10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f2f7de';
    for (let i = 0; i < 4; i++) {
      const x = 6 + i * 6;
      ctx.beginPath();
      ctx.moveTo(x, 1);
      ctx.lineTo(x + 2.2, -4);
      ctx.lineTo(x + 4.4, 1);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // The throat, lit by whatever the head is about to do.
    if (neck.jaw > 0.05) {
      ctx.fillStyle = `rgba(255,${160 + heat * 70},${90},${(0.35 + heat * 0.5).toFixed(2)})`;
      ctx.beginPath();
      ctx.ellipse(6, 2, 14 * neck.jaw, 7 * neck.jaw, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Cranium and upper snout.
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.moveTo(-15, -15);
    ctx.quadraticCurveTo(4, -20, 20, -12);
    ctx.quadraticCurveTo(33, -7, 34, -1);
    ctx.quadraticCurveTo(30, 3, 16, 4);
    ctx.quadraticCurveTo(0, 6, -15, 8);
    ctx.quadraticCurveTo(-21, -4, -15, -15);
    ctx.closePath();
    ctx.fill();

    // Brow ridge and upper teeth.
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.moveTo(-14, -14);
    ctx.quadraticCurveTo(3, -19, 18, -11);
    ctx.quadraticCurveTo(3, -10, -13, -8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f2f7de';
    for (let i = 0; i < 4; i++) {
      const x = 8 + i * 6;
      const y = 3 - i * 0.8;
      ctx.beginPath();
      ctx.moveTo(x, y - 1);
      ctx.lineTo(x + 2.2, y + 5);
      ctx.lineTo(x + 4.4, y - 1);
      ctx.closePath();
      ctx.fill();
    }

    // Eye: a slit under the brow.
    ctx.fillStyle = `rgba(255,252,226,${(0.55 + heat * 0.45).toFixed(2)})`;
    ctx.beginPath();
    ctx.ellipse(5, -6, 6, 3.8, -0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(14,22,12,0.92)';
    ctx.beginPath();
    ctx.ellipse(6.6, -6, 1.6, 3.4, -0.18, 0, Math.PI * 2);
    ctx.fill();

    this.drawHeadMark(ctx, neck, bright, heat);
    ctx.restore();
  }

  /** What tells the five heads apart in silhouette. */
  private drawHeadMark(ctx: CanvasRenderingContext2D, neck: Neck, bright: string, heat: number): void {
    ctx.fillStyle = bright;
    ctx.strokeStyle = bright;
    switch (neck.kind) {
      case 'crown': {
        // A circlet of points, the only gold on her.
        ctx.beginPath();
        ctx.moveTo(-12, -15);
        ctx.lineTo(12, -15);
        ctx.lineTo(12, -19);
        ctx.closePath();
        ctx.fill();
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.moveTo(i * 9 - 3, -17);
          ctx.lineTo(i * 9, -31);
          ctx.lineTo(i * 9 + 3, -17);
          ctx.closePath();
          ctx.fill();
        }
        break;
      }
      case 'storm': {
        ctx.lineWidth = 3;
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(-7, -12 + s * 2);
          ctx.quadraticCurveTo(-20, -23 + s * 6, -29, -16 + s * 13);
          ctx.stroke();
        }
        ctx.globalAlpha = 0.4 + heat * 0.6;
        ctx.beginPath();
        ctx.moveTo(-15, -21);
        ctx.lineTo(-10, -11);
        ctx.lineTo(-14, -11);
        ctx.lineTo(-9, 0);
        ctx.lineTo(-21, -10);
        ctx.lineTo(-15, -10);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
        break;
      }
      case 'flame': {
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-8, -13);
        ctx.quadraticCurveTo(-15, -30, -4, -36);
        ctx.stroke();
        // Coals banked at the corners of the mouth, always lit: this is the
        // head the whole fight is fetched from, so it has to look like fire
        // even when it is not its turn.
        ctx.globalAlpha = 0.45 + heat * 0.55;
        for (const [x, y, r] of [[20, -2, 4.4], [13, 2, 3], [26, -3, 2.4]] as const) {
          ctx.beginPath();
          ctx.ellipse(x, y, r, r * 0.72, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        break;
      }
      case 'stone': {
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(-5 - i * 6, -14 - i * 2);
          ctx.lineTo(-11 - i * 6, -23 - i * 3);
          ctx.lineTo(-16 - i * 6, -12 - i * 2);
          ctx.closePath();
          ctx.fill();
        }
        ctx.lineWidth = 1.4;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.moveTo(-3, -13);
        ctx.lineTo(4, -6);
        ctx.lineTo(1, 0);
        ctx.lineTo(10, 5);
        ctx.stroke();
        ctx.globalAlpha = 1;
        break;
      }
      case 'venom': {
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(-8, -13);
        ctx.quadraticCurveTo(-19, -22, -25, -14);
        ctx.stroke();
        ctx.globalAlpha = 0.4 + heat * 0.6;
        for (const x of [13, 20]) {
          ctx.beginPath();
          ctx.moveTo(x, 5);
          ctx.lineTo(x + 1.6, 14);
          ctx.lineTo(x + 3.2, 5);
          ctx.closePath();
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        break;
      }
    }
  }

  /**
   * A cut neck: an open wound that thrashes, with the seconds left drawn round
   * it as a closing ring. It is the one thing in the fight the hero has to read
   * at a glance from the other end of the room, so it is loud on purpose.
   */
  private drawStump(ctx: CanvasRenderingContext2D, neck: Neck): void {
    const c = this.stumpCentre(neck);
    const left = clamp(neck.regrow / REGROW, 0, 1);
    const urgent = left < 0.34;
    const pulse = 0.6 + Math.sin(this.sway * (urgent ? 11 : 6) + neck.phase) * 0.4;

    ctx.save();
    ctx.translate(c.x, c.y);
    const halo = ctx.createRadialGradient(0, 0, 2, 0, 0, 34);
    halo.addColorStop(0, `rgba(190,255,140,${(0.3 + pulse * 0.3).toFixed(2)})`);
    halo.addColorStop(1, 'rgba(150,230,110,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(-34, -34, 68, 68);

    // The cut face itself: a pale ring of bone round raw green.
    ctx.fillStyle = '#2b4a24';
    ctx.beginPath();
    ctx.ellipse(0, 0, 15, 12, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(190,255,150,${(0.55 + pulse * 0.45).toFixed(2)})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, 10, 7.5, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d8e6bb';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.ellipse(0, 0, 15, 12, 0.2, 0, Math.PI * 2);
    ctx.stroke();

    // The clock: an arc that closes as the head comes back.
    ctx.strokeStyle = urgent ? `rgba(255,150,110,${(0.6 + pulse * 0.4).toFixed(2)})` : 'rgba(200,255,160,0.75)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.arc(0, 0, 24, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left);
    ctx.stroke();
    ctx.restore();
  }

  /** A neck that has been burned shut: charred, cracked, and finished. */
  private drawSeal(ctx: CanvasRenderingContext2D, neck: Neck): void {
    const c = this.stumpCentre(neck);
    const ember = 0.25 + Math.sin(this.sway * 1.6 + neck.phase) * 0.12;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.fillStyle = '#171c13';
    ctx.beginPath();
    ctx.ellipse(0, 0, 15, 11, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(255,150,70,${ember.toFixed(2)})`;
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 3, Math.sin(a) * 2.5);
      ctx.lineTo(Math.cos(a) * 13, Math.sin(a) * 10);
      ctx.stroke();
    }
    ctx.fillStyle = `rgba(60,70,52,0.9)`;
    ctx.beginPath();
    ctx.ellipse(0, -2, 9, 5, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Nothing yet - kept so the draw pass reads top to bottom. */
  private drawCrest(ctx: CanvasRenderingContext2D, neck: Neck): void {
    void ctx;
    void neck;
  }

  private drawPools(ctx: CanvasRenderingContext2D): void {
    for (const pool of this.pools) {
      if (pool.wait > 0) continue;
      const fade = Math.min(1, pool.life / 1.2);
      ctx.save();
      ctx.globalAlpha = 0.55 * fade;
      const g = ctx.createLinearGradient(0, this.floorY - 12, 0, this.floorY);
      g.addColorStop(0, 'rgba(180,245,130,0.9)');
      g.addColorStop(1, 'rgba(70,140,60,0.7)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(pool.x, this.floorY - 3, 28, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /**
   * Where the ceiling is about to let go. The ring on the floor is the part a
   * player reads, but half of this fight happens on the steps, where the floor
   * is off the bottom of the screen - so the column it falls down is marked
   * too, and that mark is visible from whatever height he is standing at.
   */
  private drawDrops(ctx: CanvasRenderingContext2D): void {
    for (const drop of this.drops) {
      if (drop.fired) continue;
      const p = clamp(drop.t / drop.wind, 0, 1);
      ctx.save();
      const top = this.ceilingY;
      const glow = ctx.createLinearGradient(drop.x, top, drop.x, this.floorY);
      glow.addColorStop(0, `rgba(235,215,175,${(0.05 + p * 0.1).toFixed(2)})`);
      glow.addColorStop(1, `rgba(235,215,175,${(0.16 + p * 0.34).toFixed(2)})`);
      ctx.fillStyle = glow;
      ctx.fillRect(drop.x - 11, top, 22, this.floorY - top);
      ctx.strokeStyle = `rgba(230,210,170,${(0.25 + p * 0.5).toFixed(2)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(drop.x, this.floorY - 2, 20 * (1 - p * 0.35), 5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawBreath(ctx: CanvasRenderingContext2D): void {
    if (this.breath <= 0) return;
    const reach = 340 * this.breath;
    const x0 = this.breathDir > 0 ? this.cx : this.cx - reach;
    // From her mouth outwards, not from the leading edge: anchored at x0 the
    // gradient ran the wrong way whenever she breathed to the left, and the
    // whole sweep came out at full brightness with a hard edge at the far end.
    const g = ctx.createLinearGradient(this.cx, 0, this.cx + reach * this.breathDir, 0);
    g.addColorStop(0, 'rgba(214,206,186,0.75)');
    g.addColorStop(1, 'rgba(150,140,125,0.05)');
    // Laid down in bands that thin out towards the top, so it reads as
    // something pouring along the floor rather than a bar painted on it. The
    // box that hurts is the full 38 px either way - see updateBreath.
    ctx.save();
    ctx.fillStyle = g;
    const bands = 6;
    for (let i = 0; i < bands; i++) {
      const h = 38 / bands;
      ctx.globalAlpha = 0.18 + (i / (bands - 1)) * 0.82;
      ctx.fillRect(x0, this.floorY - 38 + i * h, reach, h + 0.5);
    }
    ctx.restore();
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
    case 'gallert':
      return new Gallert(x, y);
    case 'hydra':
      return new Hydra(x, y);
    case 'thalassa':
      return new Thalassa(x, y);
    case 'prismarch':
      return new Prismarch(x, y);
  }
}
