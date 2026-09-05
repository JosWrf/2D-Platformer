import { audio } from '../core/audio';
import { Input } from '../core/input';
import { Rect, TAU, approach, clamp, easeOut, lerp, rand, sign } from '../core/math';
import { PALETTE } from '../render/palette';
import { glow, shadow, slashCrescent, withHitFlash } from '../render/sprites';
import type { World } from '../world/context';
import { Body } from './entity';

const MAX_RUN = 235;
const ACCEL = 1500;
const AIR_ACCEL = 950;
const FRICTION = 2000;
const GRAVITY = 1750;
const FALL_GRAVITY = 2250;
const MAX_FALL = 780;
const JUMP_VELOCITY = 600;
const DOUBLE_JUMP_VELOCITY = 500;
const COYOTE_TIME = 0.1;
const JUMP_BUFFER = 0.13;
const DASH_SPEED = 470;
const DASH_TIME = 0.17;
const DASH_COOLDOWN = 0.5;

const ATTACK_WINDUP = 0.055;
const ATTACK_ACTIVE = 0.12;
const ATTACK_RECOVER = 0.12;
const ATTACK_TOTAL = ATTACK_WINDUP + ATTACK_ACTIVE + ATTACK_RECOVER;

export const PLAYER_MAX_HP = 6;

/**
 * One entry per combo step. Angles are in the hero's facing space: 0 points
 * forward, positive angles point down, so a swing from a negative to a
 * positive angle is an overhead cut.
 */
interface SwingShape {
  /** Angle the blade is wound back to during the anticipation. */
  wind: number;
  /** Angle the sweep ends on. */
  to: number;
  /** Blade length measured from the hand. */
  reach: number;
  /** Width of the crescent trail. */
  trail: number;
  /** How much of the reach is shown while the blade is cocked. */
  windReach: number;
}

const SWINGS: readonly SwingShape[] = [
  // The low guard of the rising cut is drawn short so the blade stays clear of
  // the ground and out of the hero's own silhouette.
  { wind: -1.95, to: 0.85, reach: 33, trail: 12, windReach: 0.8 }, // overhead cut
  { wind: 1.05, to: -1.45, reach: 33, trail: 11, windReach: 0.6 }, // rising cut back up
  { wind: -2.5, to: 0.75, reach: 39, trail: 17, windReach: 0.72 }, // wide finisher
];

/** Where the blade rests between combos - up and slightly forward. */
const CARRY_ANGLE = -1.05;

/** Pose of the sword slung across the hero's back. */
const SHEATH = { x: -2, y: -24, angle: 2.42, length: 22, scale: 0.72 };
/** How long the blade takes to travel back to the shoulder after a combo. */
const SHEATH_TIME = 0.16;

type SwingPhase = 'windup' | 'active' | 'recover';

interface SwingPose {
  phase: SwingPhase;
  /** Progress through the current phase, 0..1. */
  t: number;
  /** Blade angle in facing space. */
  angle: number;
  /** How far the hand is pushed forward, in pixels. */
  lunge: number;
  /** Body tilt, negative leans back into the wind-up. */
  lean: number;
  /** Blade held in close during the wind-up, fully extended through the sweep. */
  reachScale: number;
  /** How far the hand is raised while the blade is cocked. */
  lift: number;
}

export class Player extends Body {
  facing: 1 | -1 = 1;
  hp = PLAYER_MAX_HP;
  maxHp = PLAYER_MAX_HP;

  private coyote = 0;
  private jumpBuffer = 0;
  private jumpsLeft = 2;
  private jumpHeld = false;

  dashTimer = 0;
  private dashCooldown = 0;
  private dashesLeft = 1;

  attackTimer = 0;
  attackCombo = 0;
  private attackQueued = false;
  private readonly hitThisSwing = new Set<object>();
  /** Angle the blade starts the current swing from, so combos flow into each other. */
  private swingEntry = CARRY_ANGLE;
  private finisherDone = false;
  /** Blade travelling back to the shoulder once a combo ends. */
  private sheathTimer = 0;
  private sheathPose: SwingPose | null = null;
  private sheathReach = 0;

  invuln = 0;
  hurtTimer = 0;
  flash = 0;
  respawning = false;

  runCycle = 0;
  private squash = 0;
  private trail: { x: number; y: number; life: number; facing: number }[] = [];

  spawnX = 0;
  spawnY = 0;

  constructor(x: number, y: number) {
    super();
    this.w = 18;
    this.h = 30;
    this.x = x;
    this.y = y;
    this.spawnX = x;
    this.spawnY = y;
  }

  get isAttacking(): boolean {
    return this.attackTimer > 0;
  }

  get isDashing(): boolean {
    return this.dashTimer > 0;
  }

  get isInvulnerable(): boolean {
    return this.invuln > 0 || this.dashTimer > 0;
  }

  respawn(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.hp = this.maxHp;
    this.invuln = 1.4;
    this.hurtTimer = 0;
    this.attackTimer = 0;
    this.attackCombo = 0;
    this.sheathTimer = 0;
    this.dashTimer = 0;
    this.dashCooldown = 0;
    this.dead = false;
    this.respawning = false;
    this.trail.length = 0;
  }

  update(dt: number, input: Input, world: World): void {
    const level = world.level;
    this.flash = Math.max(0, this.flash - dt * 6);
    this.invuln = Math.max(0, this.invuln - dt);
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.sheathTimer = Math.max(0, this.sheathTimer - dt);

    for (let i = this.trail.length - 1; i >= 0; i--) {
      this.trail[i].life -= dt * 3.2;
      if (this.trail[i].life <= 0) this.trail.splice(i, 1);
    }

    const stunned = this.hurtTimer > 0;
    const axis = stunned ? 0 : input.axisX();
    if (axis !== 0 && !this.isDashing) this.facing = axis > 0 ? 1 : -1;

    /* ---------------------------------------------------------- dash */
    if (!stunned && input.pressed('dash') && this.dashCooldown <= 0 && this.dashesLeft > 0) {
      this.dashTimer = DASH_TIME;
      this.dashCooldown = DASH_COOLDOWN;
      this.dashesLeft--;
      this.vy = 0;
      audio.play('dash');
      world.particles.burst(this.cx, this.cy, 12, 'rgba(150,200,255,0.9)', {
        speed: 130,
        gravity: 40,
        shape: 'spark',
        angle: this.facing > 0 ? Math.PI : 0,
        spread: 1.1,
      });
    }

    if (this.dashTimer > 0) {
      this.dashTimer -= dt;
      this.vx = this.facing * DASH_SPEED;
      this.vy = 0;
      if (Math.random() < 0.9) {
        this.trail.push({ x: this.x, y: this.y, life: 1, facing: this.facing });
      }
    } else {
      /* ------------------------------------------------------ walking */
      const accel = this.onGround ? ACCEL : AIR_ACCEL;
      if (axis !== 0) {
        this.vx = approach(this.vx, axis * MAX_RUN, accel * dt);
      } else if (this.onGround) {
        this.vx = approach(this.vx, 0, FRICTION * dt);
      } else {
        this.vx = approach(this.vx, 0, AIR_ACCEL * 0.35 * dt);
      }

      /* ------------------------------------------------------ gravity */
      const rising = this.vy < 0;
      const g = rising && this.jumpHeld ? GRAVITY : FALL_GRAVITY;
      this.vy = Math.min(MAX_FALL, this.vy + g * dt);
    }

    /* --------------------------------------------------------- jumping */
    if (this.onGround) {
      this.coyote = COYOTE_TIME;
      this.jumpsLeft = 2;
      this.dashesLeft = 1;
    } else {
      this.coyote = Math.max(0, this.coyote - dt);
    }

    if (input.pressed('jump')) this.jumpBuffer = JUMP_BUFFER;
    else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);

    if (input.isDown('jump')) this.jumpHeld = true;
    if (!input.isDown('jump')) {
      this.jumpHeld = false;
      if (this.vy < -280) this.vy = -280;
    }

    if (!stunned && this.jumpBuffer > 0 && !this.isDashing) {
      const grounded = this.onGround || this.coyote > 0;
      if (grounded) {
        this.vy = -JUMP_VELOCITY;
        this.jumpsLeft = 1;
        this.coyote = 0;
        this.jumpBuffer = 0;
        this.jumpHeld = true;
        this.squash = -0.35;
        audio.play('jump');
        world.particles.burst(this.cx, this.bottom, 8, 'rgba(200,220,255,0.65)', {
          speed: 90,
          gravity: 260,
          size: 3,
        });
      } else if (this.jumpsLeft > 0) {
        this.vy = -DOUBLE_JUMP_VELOCITY;
        this.jumpsLeft--;
        this.jumpBuffer = 0;
        this.jumpHeld = true;
        this.squash = -0.3;
        audio.play('jump', 1.25);
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          world.particles.spawn({
            x: this.cx + Math.cos(a) * 10,
            y: this.cy + 8 + Math.sin(a) * 4,
            vx: Math.cos(a) * 70,
            vy: Math.sin(a) * 30 + 30,
            color: 'rgba(140,190,255,0.9)',
            gravity: 120,
            size: 3,
            life: 0.35,
          });
        }
      }
    }

    /* ---------------------------------------------------------- attack */
    if (!stunned && input.pressed('attack')) {
      if (this.attackTimer <= 0) this.startSwing();
      else if (this.attackTimer < ATTACK_ACTIVE + ATTACK_RECOVER) this.attackQueued = true;
    }

    if (this.attackTimer > 0) {
      this.attackTimer -= dt;
      const elapsed = ATTACK_TOTAL - this.attackTimer;
      if (elapsed >= ATTACK_WINDUP && elapsed <= ATTACK_WINDUP + ATTACK_ACTIVE) {
        this.applySwordHits(world);
        this.emitSwingSparks(world, elapsed);
        if (this.attackCombo === 3 && !this.finisherDone && elapsed > ATTACK_WINDUP + ATTACK_ACTIVE * 0.72) {
          this.finisherDone = true;
          this.finisherImpact(world);
        }
      }
      if (this.attackTimer <= 0) {
        if (this.attackQueued) {
          this.attackQueued = false;
          this.startSwing();
        } else {
          // Let the blade travel back to the shoulder instead of popping there.
          const end = this.swingPose(ATTACK_TOTAL);
          this.sheathPose = end;
          this.sheathReach = this.bladeReach(end);
          this.sheathTimer = SHEATH_TIME;
          this.attackCombo = 0;
        }
      }
      // A swing plants the hero slightly.
      if (this.onGround && !this.isDashing) this.vx *= 0.86;
    }

    /* --------------------------------------------------------- physics */
    this.ignorePlatforms = input.isDown('down') && input.isDown('jump');
    const wasFalling = this.vy;
    this.moveAndCollide(level, dt);
    if (this.touching.down && wasFalling > 420) {
      this.squash = Math.min(0.45, wasFalling / 1600);
      world.particles.burst(this.cx, this.bottom, 8, 'rgba(210,220,240,0.5)', {
        speed: 110,
        gravity: 300,
        size: 3,
        angle: -Math.PI / 2,
        spread: Math.PI,
      });
    }

    this.squash = approach(this.squash, 0, dt * 3.2);
    if (Math.abs(this.vx) > 20 && this.onGround) this.runCycle += dt * (6 + Math.abs(this.vx) / 40);
    else this.runCycle += dt * 2;

    this.x = level.clampX(this.x, this.w);

    /* ---------------------------------------------------------- hazards */
    if (level.rectHitsHazard(this.x + 3, this.y + 4, this.w - 6, this.h - 6)) {
      this.hurt(2, sign(this.cx - (Math.floor(this.cx / 32) * 32 + 16)) || -this.facing, world, true);
    }
    if (this.y > level.pixelHeight + 60) {
      this.hp = 0;
      this.dead = true;
    }
    if (this.hp <= 0) this.dead = true;
  }

  private startSwing(): void {
    // Chained swings pick up where the last one stopped instead of snapping.
    this.swingEntry = this.attackCombo > 0 ? SWINGS[this.attackCombo - 1].to : CARRY_ANGLE;
    this.attackTimer = ATTACK_TOTAL;
    this.attackCombo = (this.attackCombo % 3) + 1;
    this.finisherDone = false;
    this.sheathTimer = 0;
    this.hitThisSwing.clear();
    audio.play('swing', this.attackCombo === 3 ? 0.8 : 1 + this.attackCombo * 0.08);
  }

  /* -------------------------------------------------------- swing motion */

  /** Blade angle, hand offset and body tilt at a point in the current swing. */
  private swingPose(elapsed: number): SwingPose {
    const swing = SWINGS[Math.max(0, this.attackCombo - 1)];
    const e = clamp(elapsed, 0, ATTACK_TOTAL);
    if (e < ATTACK_WINDUP) {
      const t = e / ATTACK_WINDUP;
      const k = easeOut(t, 2);
      return {
        phase: 'windup',
        t,
        angle: lerp(this.swingEntry, swing.wind, k),
        lunge: -3 * k,
        lean: -0.1 * k,
        // Cocked blades are held close to the body, not at full stretch.
        reachScale: lerp(1, swing.windReach, k),
        lift: 3 * k,
      };
    }
    if (e < ATTACK_WINDUP + ATTACK_ACTIVE) {
      const t = (e - ATTACK_WINDUP) / ATTACK_ACTIVE;
      // A hard ease-out: most of the arc is covered in the first few frames.
      const k = easeOut(t, 4);
      return {
        phase: 'active',
        t,
        angle: lerp(swing.wind, swing.to, k),
        lunge: lerp(-3, 6, k),
        lean: lerp(-0.1, 0.14, k),
        reachScale: lerp(swing.windReach, 1, easeOut(t, 2)),
        lift: lerp(3, 0, k),
      };
    }
    const t = (e - ATTACK_WINDUP - ATTACK_ACTIVE) / ATTACK_RECOVER;
    const k = easeOut(t, 2);
    return {
      phase: 'recover',
      t,
      // The blade drifts back as the hero catches the weight of the swing.
      angle: swing.to - sign(swing.to - swing.wind) * 0.55 * k,
      lunge: lerp(6, 0, k),
      lean: lerp(0.14, 0, k),
      reachScale: lerp(1, 0.86, k),
      lift: 0,
    };
  }

  /** Hand position in the hero's local space, feet at the origin. */
  private handOffset(pose: SwingPose): { x: number; y: number } {
    const a = pose.angle * 0.4;
    return {
      x: 2 + pose.lunge + Math.cos(a) * 7,
      y: -19 - pose.lift + Math.sin(a) * 7,
    };
  }

  private bladeReach(pose: SwingPose): number {
    return SWINGS[Math.max(0, this.attackCombo - 1)].reach * pose.reachScale;
  }

  /** The same hand, in world space, with the body's tilt applied. */
  private handWorld(pose: SwingPose): { x: number; y: number } {
    const { x, y } = this.handOffset(pose);
    const lean = pose.lean * this.facing;
    const cos = Math.cos(lean);
    const sin = Math.sin(lean);
    const lx = x * this.facing;
    return {
      x: this.cx + lx * cos - y * sin,
      y: this.bottom + lx * sin + y * cos,
    };
  }

  private bladeTip(pose: SwingPose): { x: number; y: number } {
    const hand = this.handWorld(pose);
    const reach = this.bladeReach(pose);
    // Negating the angle would mirror across the horizontal axis; facing
    // flips the world horizontally, so the sign belongs on x.
    return {
      x: hand.x + Math.cos(pose.angle) * reach * this.facing,
      y: hand.y + Math.sin(pose.angle) * reach,
    };
  }

  /** Sparks thrown off the tip while the blade is moving fastest. */
  private emitSwingSparks(world: World, elapsed: number): void {
    const pose = this.swingPose(elapsed);
    const swing = SWINGS[Math.max(0, this.attackCombo - 1)];
    const tip = this.bladeTip(pose);
    const sweep = sign(swing.to - swing.wind);
    const tangent = pose.angle + (sweep > 0 ? Math.PI / 2 : -Math.PI / 2);
    const count = this.attackCombo === 3 ? 3 : 2;
    for (let i = 0; i < count; i++) {
      const a = tangent + rand(-0.35, 0.35);
      const speed = rand(70, 170);
      world.particles.spawn({
        x: tip.x + rand(-3, 3),
        y: tip.y + rand(-3, 3),
        vx: Math.cos(a) * speed * this.facing,
        vy: Math.sin(a) * speed - 25,
        color: i === 0 ? '#ffffff' : PALETTE.bladeGlow,
        gravity: 120,
        drag: 0.86,
        size: rand(1.5, 3),
        shape: 'spark',
        life: rand(0.1, 0.24),
      });
    }
  }

  /** The third hit lands with a shockwave along the ground. */
  private finisherImpact(world: World): void {
    world.camera.addShake(2.5);
    const x = this.cx + this.facing * 26;
    if (this.onGround) {
      world.particles.burst(x, this.bottom - 3, 12, 'rgba(210,235,255,0.75)', {
        speed: 165,
        gravity: 340,
        size: 3,
        angle: this.facing > 0 ? -0.45 : Math.PI + 0.45,
        spread: 1.3,
      });
    } else {
      world.particles.burst(x, this.cy, 10, PALETTE.bladeGlow, {
        speed: 140,
        gravity: 60,
        shape: 'spark',
        angle: this.facing > 0 ? 0 : Math.PI,
        spread: 1.6,
      });
    }
  }

  /** World-space rectangle covered by the blade during the active window. */
  swordRect(): Rect {
    const reach = this.attackCombo === 3 ? 46 : 40;
    const height = this.attackCombo === 3 ? 40 : 32;
    return {
      x: this.facing > 0 ? this.x + this.w - 4 : this.x - reach + 4,
      y: this.cy - height / 2 - 2,
      w: reach,
      h: height,
    };
  }

  private applySwordHits(world: World): void {
    const box = this.swordRect();
    const damage = this.attackCombo === 3 ? 2 : 1;
    for (const enemy of world.enemies) {
      if (enemy.dead || this.hitThisSwing.has(enemy)) continue;
      if (!enemy.overlaps(box)) continue;
      this.hitThisSwing.add(enemy);
      enemy.hurt(damage, this.facing, world);
      this.onHitLanded(world, enemy.cx, enemy.cy, damage);
    }
    const boss = world.boss;
    if (boss && !boss.dead && !this.hitThisSwing.has(boss) && boss.overlaps(box) && boss.vulnerable) {
      this.hitThisSwing.add(boss);
      boss.hurt(damage, this.facing, world);
      this.onHitLanded(world, boss.cx, boss.cy - 10, damage);
    }
    // Deflect projectiles with the blade.
    for (const p of world.projectiles) {
      if (p.dead || p.friendly || this.hitThisSwing.has(p)) continue;
      if (!p.overlaps(box)) continue;
      this.hitThisSwing.add(p);
      p.deflect(this.facing);
      world.particles.burst(p.cx, p.cy, 10, '#dff3ff', { speed: 150, gravity: 60, shape: 'spark' });
      audio.play('hit', 1.4);
    }
  }

  private onHitLanded(world: World, x: number, y: number, damage: number): void {
    world.hitStop(damage >= 2 ? 0.075 : 0.045);
    world.camera.addShake(damage >= 2 ? 5 : 3);
    world.particles.burst(x, y, 10 + damage * 4, '#fff2c4', {
      speed: 190,
      gravity: 260,
      shape: 'spark',
      size: 3,
    });
    // A little forward hop keeps combos feeling connected.
    this.vx += this.facing * 40;
  }

  hurt(amount: number, fromDir: number, world: World, ignoreIFrames = false): void {
    if (this.dead) return;
    if (!ignoreIFrames && this.isInvulnerable) return;
    if (ignoreIFrames && this.invuln > 0) return;
    this.hp -= amount;
    this.invuln = 1.15;
    this.hurtTimer = 0.28;
    this.flash = 1;
    this.dashTimer = 0;
    this.vx = -fromDir * 210;
    this.vy = -260;
    audio.play('hurt');
    world.camera.addShake(7);
    world.hitStop(0.09);
    world.particles.burst(this.cx, this.cy, 16, PALETTE.hearts, { speed: 190, gravity: 400 });
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
    }
  }

  heal(amount: number): void {
    this.hp = clamp(this.hp + amount, 0, this.maxHp);
  }

  overlaps(r: Rect): boolean {
    return (
      this.x < r.x + r.w && this.x + this.w > r.x && this.y < r.y + r.h && this.y + this.h > r.y
    );
  }

  /* ------------------------------------------------------------ drawing */

  draw(ctx: CanvasRenderingContext2D, world: World): void {
    for (const t of this.trail) {
      ctx.globalAlpha = t.life * 0.3;
      ctx.fillStyle = '#8fc4ff';
      ctx.fillRect(t.x + 3, t.y + 3, this.w - 6, this.h - 6);
    }
    ctx.globalAlpha = 1;

    const groundDist = world.level.groundBelow(this.cx, this.bottom - 2, 8);
    shadow(ctx, this.cx, this.bottom + Math.min(groundDist, 200), 26 * clamp(1 - groundDist / 260, 0.3, 1), 0.3 * clamp(1 - groundDist / 260, 0.2, 1));

    const blink = this.invuln > 0 && Math.floor(this.invuln * 18) % 2 === 0;
    if (blink && this.hurtTimer <= 0) ctx.globalAlpha = 0.45;

    const pose = this.attackTimer > 0 ? this.swingPose(ATTACK_TOTAL - this.attackTimer) : null;

    ctx.save();
    ctx.translate(this.cx, this.bottom);
    // Tilt into the swing before mirroring, so the lean follows the facing.
    if (pose) ctx.rotate(pose.lean * this.facing);
    const sq = this.squash;
    ctx.scale(this.facing * (1 - sq * 0.35), 1 + sq * 0.45);

    withHitFlash(ctx, this.flash, () => {
      // Carried on the back when idle, so it never crosses the torso.
      if (!pose) this.drawCarriedBlade(ctx);
      this.drawBody(ctx, pose);
    });
    ctx.restore();
    ctx.globalAlpha = 1;

    if (pose) this.drawSwing(ctx, pose);
  }

  private drawBody(ctx: CanvasRenderingContext2D, pose: SwingPose | null): void {
    const t = this.runCycle;
    const moving = Math.abs(this.vx) > 25 && this.onGround;
    const airborne = !this.onGround;
    const bob = moving ? Math.sin(t * 2) * 1.2 : Math.sin(t * 0.8) * 0.8;
    const legSwing = moving ? Math.sin(t * 2) * 5 : 0;

    // Cloak billowing behind the hero.
    const cloakSway = clamp((-this.vx * this.facing) / 220, -1, 1) * 6 + Math.sin(t * 1.6) * 1.6;
    ctx.fillStyle = PALETTE.playerCloakDark;
    ctx.beginPath();
    ctx.moveTo(-2, -26);
    ctx.quadraticCurveTo(-10 - cloakSway, -18, -8 - cloakSway * 1.6, -3 + (airborne ? -3 : 0));
    ctx.lineTo(1, -6);
    ctx.lineTo(2, -26);
    ctx.closePath();
    ctx.fill();

    // Legs.
    ctx.fillStyle = '#26314f';
    ctx.fillRect(-6 + legSwing * 0.5, -9, 5, 9 - Math.abs(legSwing) * 0.2);
    ctx.fillRect(1 - legSwing * 0.5, -9, 5, 9 - Math.abs(legSwing) * 0.2);
    ctx.fillStyle = '#131a2c';
    ctx.fillRect(-7 + legSwing * 0.5, -2, 7, 2);
    ctx.fillRect(0 - legSwing * 0.5, -2, 7, 2);

    // Torso.
    ctx.fillStyle = PALETTE.playerCloak;
    ctx.fillRect(-6, -22 + bob, 12, 14);
    ctx.fillStyle = '#5b8bf0';
    ctx.fillRect(-6, -22 + bob, 12, 3);
    // Belt + chest strap.
    ctx.fillStyle = '#f2c14e';
    ctx.fillRect(-6, -12 + bob, 12, 2);
    ctx.fillStyle = '#cfd6f2';
    ctx.fillRect(-5, -21 + bob, 3, 12);

    // Arms. While swinging, the sword arm reaches out to the hilt.
    ctx.fillStyle = '#3a5fb8';
    if (pose) {
      const hand = this.handOffset(pose);
      const shoulderX = 2;
      const shoulderY = -19 + bob;
      const dx = hand.x - shoulderX;
      const dy = hand.y - shoulderY;
      ctx.save();
      ctx.translate(shoulderX, shoulderY);
      ctx.rotate(Math.atan2(dy, dx));
      ctx.fillRect(-1, -2, Math.hypot(dx, dy) + 2, 4);
      ctx.restore();
      // Glove at the hilt.
      ctx.fillStyle = '#2a3f7a';
      ctx.fillRect(hand.x - 2, hand.y - 2, 4, 4);
    } else {
      ctx.fillRect(4, -20 + bob, 4, 8);
    }

    // Head with hood.
    const headY = -32 + bob;
    ctx.fillStyle = PALETTE.skin;
    ctx.fillRect(-4, headY + 3, 8, 7);
    ctx.fillStyle = PALETTE.playerCloakDark;
    ctx.beginPath();
    ctx.moveTo(-6, headY + 6);
    ctx.quadraticCurveTo(-6, headY - 2, 0, headY - 2);
    ctx.quadraticCurveTo(6, headY - 2, 6, headY + 6);
    ctx.lineTo(4, headY + 6);
    ctx.quadraticCurveTo(4, headY + 1, 0, headY + 1);
    ctx.quadraticCurveTo(-2, headY + 1, -3, headY + 4);
    ctx.lineTo(-3, headY + 8);
    ctx.lineTo(-6, headY + 9);
    ctx.closePath();
    ctx.fill();
    // Eye glint.
    ctx.fillStyle = '#8fe6ff';
    ctx.fillRect(1, headY + 5, 3, 2);
  }

  /** The blade, its trail and the after-images that sell the speed. */
  private drawSwing(ctx: CanvasRenderingContext2D, pose: SwingPose): void {
    const dir = this.facing;
    const combo = Math.max(1, this.attackCombo);
    const swing = SWINGS[combo - 1];
    const elapsed = ATTACK_TOTAL - this.attackTimer;
    const hand = this.handWorld(pose);

    const reach = this.bladeReach(pose);

    const drawBladeAt = (at: SwingPose, alpha: number): void => {
      const grip = this.handWorld(at);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(grip.x, grip.y);
      ctx.scale(dir, 1);
      ctx.rotate(at.angle);
      this.drawBlade(ctx, this.bladeReach(at));
      ctx.restore();
      ctx.globalAlpha = 1;
    };

    /**
     * The crescent is drawn in facing space and mirrored by the scale, not by
     * negating its angles - negated angles flip it across the wrong axis and
     * the trail ends up on the wrong side of a left-facing hero.
     */
    const drawTrail = (
      from: number,
      to: number,
      radius: number,
      thickness: number,
      color: string,
      alpha: number,
    ): void => {
      ctx.save();
      ctx.translate(hand.x, hand.y);
      ctx.scale(dir, 1);
      slashCrescent(ctx, 0, 0, radius, from, to, thickness, color, alpha);
      ctx.restore();
    };

    if (pose.phase === 'active') {
      // After-images of the blade itself.
      for (const [lag, alpha] of [
        [0.042, 0.1],
        [0.022, 0.18],
      ] as const) {
        if (elapsed - lag <= ATTACK_WINDUP) continue;
        drawBladeAt(this.swingPose(elapsed - lag), alpha);
      }
    }

    if (pose.phase !== 'windup') {
      // The crescent spans from where the blade was a few frames ago to now.
      const tail = this.swingPose(Math.max(ATTACK_WINDUP, elapsed - 0.09)).angle;
      const fade =
        pose.phase === 'active'
          ? Math.min(1, 0.35 + pose.t * 3)
          : Math.max(0, 1 - easeOut(pose.t, 1.6));
      drawTrail(tail, pose.angle, reach * 0.98, swing.trail, PALETTE.bladeGlow, 0.9 * fade);

      // A second, wider echo makes the finisher read as the heavy hit.
      if (combo === 3) {
        const echo = this.swingPose(Math.max(ATTACK_WINDUP, elapsed - 0.05)).angle;
        drawTrail(echo, pose.angle, reach * 1.22, swing.trail * 0.55, '#bfe9ff', 0.5 * fade);
      }
    }

    drawBladeAt(pose, 1);

    // The tip flares as the blade reaches full speed.
    const tip = this.bladeTip(pose);
    if (pose.phase === 'active') {
      const heat = Math.sin(Math.PI * Math.min(1, pose.t * 1.15));
      glow(ctx, tip.x, tip.y, combo === 3 ? 26 : 19, 'rgba(200,244,255,0.55)', heat);
      glow(ctx, hand.x, hand.y, 14, 'rgba(150,220,255,0.35)', heat * 0.7);
    }
  }

  /**
   * Sword slung across the hero's back. Right after a combo it is still on its
   * way there, swinging back over the shoulder along the shorter path.
   */
  private drawCarriedBlade(ctx: CanvasRenderingContext2D): void {
    let x = SHEATH.x;
    let y = SHEATH.y;
    let angle = SHEATH.angle;
    let length = SHEATH.length;
    let scale = SHEATH.scale;

    if (this.sheathTimer > 0 && this.sheathPose) {
      const k = easeOut(1 - this.sheathTimer / SHEATH_TIME, 2);
      const from = this.sheathPose;
      const hand = this.handOffset(from);
      // Going over the head can be the shorter way round after a rising cut.
      const target =
        Math.abs(SHEATH.angle - from.angle) <= Math.abs(SHEATH.angle - TAU - from.angle)
          ? SHEATH.angle
          : SHEATH.angle - TAU;
      x = lerp(hand.x, SHEATH.x, k);
      y = lerp(hand.y, SHEATH.y, k);
      angle = lerp(from.angle, target, k);
      length = lerp(this.sheathReach, SHEATH.length, k);
      scale = lerp(1, SHEATH.scale, k);
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    this.drawBlade(ctx, length, scale);
    ctx.restore();
  }

  /**
   * The sword pointing along +x from the hand: wrapped grip, round pommel,
   * gold cross guard and a tapered blade with a fuller down the middle.
   */
  private drawBlade(ctx: CanvasRenderingContext2D, length: number, scale = 1): void {
    const half = 2.2 * scale;
    // Grip and pommel.
    ctx.fillStyle = '#4b2f1c';
    ctx.fillRect(-8 * scale, -1.5 * scale, 7 * scale, 3 * scale);
    ctx.fillStyle = '#6b4326';
    ctx.fillRect(-7 * scale, -1.5 * scale, 1.4 * scale, 3 * scale);
    ctx.fillRect(-4.4 * scale, -1.5 * scale, 1.4 * scale, 3 * scale);
    ctx.fillStyle = PALETTE.gold;
    ctx.beginPath();
    ctx.arc(-9 * scale, 0, 1.9 * scale, 0, TAU);
    ctx.fill();
    // Cross guard, with a lit edge on the blade side.
    ctx.fillRect(-1.6 * scale, -4.8 * scale, 3.2 * scale, 9.6 * scale);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(0.4 * scale, -4.8 * scale, 1.2 * scale, 9.6 * scale);
    // Blade.
    const grad = ctx.createLinearGradient(0, 0, length, 0);
    grad.addColorStop(0, '#7f97ba');
    grad.addColorStop(0.4, PALETTE.blade);
    grad.addColorStop(0.88, '#ffffff');
    grad.addColorStop(1, '#e8f8ff');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(1.6 * scale, -half);
    ctx.lineTo(length - 9 * scale, -half * 0.8);
    ctx.lineTo(length, 0);
    ctx.lineTo(length - 9 * scale, half * 0.8);
    ctx.lineTo(1.6 * scale, half);
    ctx.closePath();
    ctx.fill();
    // Fuller and the highlight along the upper edge.
    ctx.fillStyle = 'rgba(56,96,150,0.55)';
    ctx.fillRect(3 * scale, -0.5 * scale, length - 12 * scale, 1 * scale);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(3 * scale, -half + 0.3 * scale, length - 11 * scale, 0.9 * scale);
  }
}
