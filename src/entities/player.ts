import { audio } from '../core/audio';
import { Input } from '../core/input';
import { Rect, approach, clamp, sign } from '../core/math';
import { PALETTE } from '../render/palette';
import { glow, shadow, slashArc, withHitFlash } from '../render/sprites';
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
      }
      if (this.attackTimer <= 0) {
        if (this.attackQueued) {
          this.attackQueued = false;
          this.startSwing();
        } else {
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
    this.attackTimer = ATTACK_TOTAL;
    this.attackCombo = (this.attackCombo % 3) + 1;
    this.hitThisSwing.clear();
    audio.play('swing', this.attackCombo === 3 ? 0.8 : 1 + this.attackCombo * 0.08);
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

    ctx.save();
    ctx.translate(this.cx, this.bottom);
    const sq = this.squash;
    ctx.scale(this.facing * (1 - sq * 0.35), 1 + sq * 0.45);

    withHitFlash(ctx, this.flash, () => this.drawBody(ctx));
    ctx.restore();
    ctx.globalAlpha = 1;

    this.drawSword(ctx);
  }

  private drawBody(ctx: CanvasRenderingContext2D): void {
    const t = this.runCycle;
    const moving = Math.abs(this.vx) > 25 && this.onGround;
    const airborne = !this.onGround;
    const bob = moving ? Math.sin(t * 2) * 1.2 : Math.sin(t * 0.8) * 0.8;
    const legSwing = moving ? Math.sin(t * 2) * 5 : 0;

    // Cloak billowing behind the hero.
    const cloakSway = clamp(-this.vx / 220, -1, 1) * 6 + Math.sin(t * 1.6) * 1.6;
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

    // Arms.
    ctx.fillStyle = '#3a5fb8';
    ctx.fillRect(4, -20 + bob, 4, 8);

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

  private drawSword(ctx: CanvasRenderingContext2D): void {
    const cx = this.cx;
    const cy = this.cy - 2;
    const dir = this.facing;

    if (this.attackTimer > 0) {
      const elapsed = (ATTACK_TOTAL - this.attackTimer) / ATTACK_TOTAL;
      const combo = this.attackCombo;
      const reach = combo === 3 ? 40 : 34;
      // Combo 1 sweeps down, combo 2 sweeps up, combo 3 is a wide spin.
      const spans: [number, number][] = [
        [-1.15, 0.95],
        [1.0, -1.05],
        [-1.5, 1.5],
      ];
      const [a0, a1] = spans[combo - 1];
      const eased = elapsed < 0.25 ? (elapsed / 0.25) * 0.18 : 0.18 + ((elapsed - 0.25) / 0.75) * 0.82;
      const angle = (a0 + (a1 - a0) * eased) * dir;
      const alpha = elapsed < 0.15 ? elapsed / 0.15 : Math.max(0, 1 - (elapsed - 0.15) / 0.75);

      const from = (a0 + (a1 - a0) * Math.max(0, eased - 0.32)) * dir;
      slashArc(
        ctx,
        cx,
        cy,
        reach,
        dir > 0 ? Math.min(from, angle) : Math.min(from, angle),
        dir > 0 ? Math.max(from, angle) : Math.max(from, angle),
        combo === 3 ? 13 : 9,
        PALETTE.bladeGlow,
        alpha * 0.85,
      );

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.scale(dir, 1);
      this.drawBlade(ctx, reach + 6);
      ctx.restore();

      if (combo === 3 && elapsed > 0.2 && elapsed < 0.7) {
        glow(ctx, cx + dir * 26, cy, 30, 'rgba(140,220,255,0.35)', alpha);
      }
    } else {
      // Sheathed on the back.
      ctx.save();
      ctx.translate(cx - dir * 5, cy - 4);
      ctx.rotate(dir * 2.5);
      ctx.scale(dir, 1);
      this.drawBlade(ctx, 30, 0.75);
      ctx.restore();
    }
  }

  private drawBlade(ctx: CanvasRenderingContext2D, length: number, scale = 1): void {
    const w = 4 * scale;
    // Guard + grip.
    ctx.fillStyle = '#6b4326';
    ctx.fillRect(-9 * scale, -1.5 * scale, 8 * scale, 3 * scale);
    ctx.fillStyle = PALETTE.gold;
    ctx.fillRect(-2 * scale, -4.5 * scale, 3 * scale, 9 * scale);
    // Blade.
    const grad = ctx.createLinearGradient(0, 0, length, 0);
    grad.addColorStop(0, '#9fb6d8');
    grad.addColorStop(0.45, PALETTE.blade);
    grad.addColorStop(1, '#ffffff');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(1 * scale, -w / 2);
    ctx.lineTo(length - 6 * scale, -w / 2);
    ctx.lineTo(length, 0);
    ctx.lineTo(length - 6 * scale, w / 2);
    ctx.lineTo(1 * scale, w / 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(2 * scale, -w / 2, length - 8 * scale, 1);
  }
}
