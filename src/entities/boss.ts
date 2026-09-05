import { audio } from '../core/audio';
import { Rect, approach, clamp, rand, rectsOverlap } from '../core/math';
import { PALETTE } from '../render/palette';
import { glow, shadow, slashArc, withHitFlash } from '../render/sprites';
import type { World } from '../world/context';
import { Body } from './entity';
import { Skeleton } from './enemy';
import { Projectile } from './projectile';

export const BOSS_MAX_HP = 64;

type BossState =
  | 'dormant'
  | 'intro'
  | 'idle'
  | 'walk'
  | 'slamWindup'
  | 'slam'
  | 'dashWindup'
  | 'dash'
  | 'cast'
  | 'summon'
  | 'leap'
  | 'stagger'
  | 'dying';

export class Boss extends Body {
  readonly name = 'SCHATTENRITTER MORVAIN';
  hp = BOSS_MAX_HP;
  maxHp = BOSS_MAX_HP;
  facing: 1 | -1 = -1;
  flash = 0;
  state: BossState = 'dormant';
  engaged = false;
  vulnerable = false;
  anim = 0;

  private timer = 0;
  private damageSinceStagger = 0;
  private swordAngle = -0.6;
  private targetSwordAngle = -0.6;
  private hitPlayerThisAction = false;
  private auraPulse = 0;
  private deathTimer = 0;
  private lastAction = '';

  constructor(x: number, y: number) {
    super();
    this.w = 62;
    this.h = 92;
    this.x = x;
    this.y = y;
  }

  get phase(): 1 | 2 | 3 {
    const ratio = this.hp / this.maxHp;
    if (ratio > 0.62) return 1;
    if (ratio > 0.3) return 2;
    return 3;
  }

  overlaps(r: Rect): boolean {
    return rectsOverlap({ x: this.x + 8, y: this.y + 6, w: this.w - 16, h: this.h - 6 }, r);
  }

  engage(world: World): void {
    if (this.engaged) return;
    this.engaged = true;
    this.state = 'intro';
    this.timer = 2.2;
    audio.play('bossRoar');
    world.camera.addShake(9);
    world.onBossEngaged();
  }

  hurt(amount: number, fromDir: number, world: World): void {
    if (this.dead || !this.vulnerable) return;
    this.hp -= amount;
    this.flash = 1;
    this.damageSinceStagger += amount;
    audio.play('bossHit');
    world.particles.burst(this.cx - fromDir * 10, this.cy, 12, '#ff8a72', { speed: 200, gravity: 380 });
    if (this.hp <= 0) {
      this.hp = 0;
      this.beginDeath(world);
      return;
    }
    if (this.damageSinceStagger >= 14 && this.state !== 'stagger') {
      this.damageSinceStagger = 0;
      this.state = 'stagger';
      this.timer = 1.35;
      this.vx = fromDir * 90;
      world.camera.addShake(6);
      world.particles.text(this.cx, this.y - 12, 'BENOMMEN!', '#ffd166');
    }
  }

  private beginDeath(world: World): void {
    this.state = 'dying';
    this.deathTimer = 2.6;
    this.vulnerable = false;
    this.vx = 0;
    audio.play('bossRoar');
    world.camera.addShake(12);
    world.hitStop(0.35);
  }

  update(dt: number, world: World): void {
    this.anim += dt;
    this.flash = Math.max(0, this.flash - dt * 4);
    this.auraPulse += dt * (this.phase === 3 ? 5 : 2.6);
    this.swordAngle += (this.targetSwordAngle - this.swordAngle) * Math.min(1, dt * 9);

    const player = world.player;

    if (this.state === 'dormant') {
      this.vy = Math.min(700, this.vy + 1800 * dt);
      this.moveAndCollide(world.level, dt);
      if (Math.abs(player.cx - this.cx) < 460 && !player.dead) this.engage(world);
      return;
    }

    if (this.state === 'dying') {
      this.deathTimer -= dt;
      this.vx = approach(this.vx, 0, 400 * dt);
      this.vy = Math.min(700, this.vy + 1800 * dt);
      this.moveAndCollide(world.level, dt);
      if (Math.random() < 0.5) {
        world.particles.burst(this.cx + rand(-26, 26), this.cy + rand(-34, 34), 3, '#ff6b4a', {
          speed: 90,
          gravity: -60,
          size: 4,
        });
      }
      if (this.deathTimer <= 1.6 && Math.random() < 0.16) world.camera.addShake(4);
      if (this.deathTimer <= 0 && !this.dead) {
        this.dead = true;
        world.camera.addShake(14);
        world.particles.burst(this.cx, this.cy, 90, '#ffd166', { speed: 340, gravity: 260, size: 5 });
        world.particles.burst(this.cx, this.cy, 50, '#ff6b4a', { speed: 240, gravity: 120, shape: 'circle' });
        world.onBossDefeated();
      }
      return;
    }

    this.vulnerable = this.state !== 'intro';
    const dx = player.cx - this.cx;
    const dist = Math.abs(dx);
    if (this.state !== 'dash' && this.state !== 'leap' && this.state !== 'stagger') {
      this.facing = dx > 0 ? 1 : -1;
    }

    this.timer -= dt;
    this.vy = Math.min(760, this.vy + 1800 * dt);

    switch (this.state) {
      case 'intro': {
        this.vx = 0;
        this.targetSwordAngle = -1.8;
        if (this.timer <= 0) {
          this.state = 'idle';
          this.timer = 0.4;
        }
        break;
      }
      case 'idle': {
        this.vx = approach(this.vx, 0, 700 * dt);
        this.targetSwordAngle = -0.5;
        if (this.timer <= 0) this.chooseAction(dist);
        break;
      }
      case 'walk': {
        const speed = this.phase === 3 ? 128 : this.phase === 2 ? 106 : 88;
        this.vx = approach(this.vx, this.facing * speed, 900 * dt);
        this.targetSwordAngle = -0.5 + Math.sin(this.anim * 6) * 0.12;
        if (this.timer <= 0 || dist < 78) {
          this.state = 'idle';
          this.timer = this.phase === 3 ? 0.3 : 0.42;
        }
        break;
      }
      case 'slamWindup': {
        this.vx = approach(this.vx, 0, 1400 * dt);
        this.targetSwordAngle = -2.5;
        if (this.timer <= 0) {
          this.state = 'slam';
          this.timer = 0.42;
          this.hitPlayerThisAction = false;
          this.targetSwordAngle = 0.75;
          this.doSlam(world);
        }
        break;
      }
      case 'slam': {
        this.vx = approach(this.vx, 0, 2200 * dt);
        if (!this.hitPlayerThisAction) this.tryMeleeHit(world, this.slamRect(), 2);
        if (this.timer <= 0) {
          this.state = 'idle';
          this.timer = this.recovery(0.15);
        }
        break;
      }
      case 'dashWindup': {
        this.vx = approach(this.vx, -this.facing * 60, 900 * dt);
        this.targetSwordAngle = -1.9;
        if (this.timer <= 0) {
          this.state = 'dash';
          this.timer = 0.55;
          this.hitPlayerThisAction = false;
          this.targetSwordAngle = 0.1;
          audio.play('swing', 0.6);
        }
        break;
      }
      case 'dash': {
        this.vx = this.facing * (this.phase === 3 ? 620 : 520);
        if (!this.hitPlayerThisAction) this.tryMeleeHit(world, this.dashRect(), 2);
        world.particles.spawn({
          x: this.cx - this.facing * 20 + rand(-8, 8),
          y: this.cy + rand(-30, 34),
          vx: -this.facing * rand(40, 120),
          vy: rand(-30, 10),
          color: 'rgba(180,50,50,0.5)',
          gravity: -40,
          size: rand(3, 6),
          life: 0.4,
          shape: 'circle',
        });
        if (this.timer <= 0 || this.touching.left || this.touching.right) {
          if (this.touching.left || this.touching.right) {
            world.camera.addShake(7);
            world.particles.burst(this.facing > 0 ? this.x + this.w : this.x, this.cy, 18, '#c8b9a0', { speed: 220 });
          }
          this.state = 'idle';
          this.timer = this.recovery(this.touching.left || this.touching.right ? 0.25 : 0.1);
        }
        break;
      }
      case 'cast': {
        this.vx = approach(this.vx, 0, 1200 * dt);
        this.targetSwordAngle = -2.2;
        if (this.timer <= 0) {
          this.castOrbs(world);
          this.state = 'idle';
          this.timer = this.recovery();
        }
        break;
      }
      case 'summon': {
        this.vx = approach(this.vx, 0, 1200 * dt);
        this.targetSwordAngle = -2.6;
        if (this.timer <= 0) {
          this.summonMinions(world);
          this.state = 'idle';
          this.timer = this.recovery(0.1);
        }
        break;
      }
      case 'leap': {
        this.targetSwordAngle = -2.2;
        if (!this.hitPlayerThisAction) this.tryMeleeHit(world, this.rect, 2);
        if (this.onGround && this.vy >= 0 && this.timer < 0.55) {
          this.doGroundPound(world);
          this.state = 'idle';
          this.timer = this.recovery(0.25);
        } else if (this.timer <= -1.6) {
          this.state = 'idle';
          this.timer = this.recovery();
        }
        break;
      }
      case 'stagger': {
        this.vx = approach(this.vx, 0, 500 * dt);
        this.targetSwordAngle = 1.2;
        if (Math.random() < 0.25) {
          world.particles.spawn({
            x: this.cx + rand(-20, 20),
            y: this.y + rand(0, 30),
            vx: rand(-30, 30),
            vy: -rand(20, 50),
            color: 'rgba(255,220,140,0.8)',
            gravity: -30,
            size: 3,
            life: 0.5,
            shape: 'circle',
          });
        }
        if (this.timer <= 0) {
          this.state = 'idle';
          this.timer = 0.45;
        }
        break;
      }
      default:
        break;
    }

    this.moveAndCollide(world.level, dt);

    // Contact damage while charging around.
    if ((this.state === 'dash' || this.state === 'leap') && !this.hitPlayerThisAction) {
      this.tryMeleeHit(world, this.rect, 2);
    }
  }

  /**
   * Breathing room after an attack: the window the player can safely strike
   * in. A full three-hit combo takes 0.9s, so anything shorter leaves them
   * nothing to do but dodge.
   */
  private recovery(extra = 0): number {
    const base = this.phase === 3 ? 0.8 : this.phase === 2 ? 0.9 : 1.05;
    return base + extra;
  }

  private chooseAction(dist: number): void {
    const phase = this.phase;
    const options: string[] = [];
    if (dist > 150) options.push('walk', 'dash');
    if (dist <= 150) options.push('slam', 'slam', 'dash');
    if (phase >= 2) options.push('cast');
    if (phase >= 2 && dist > 110) options.push('summon');
    if (phase >= 3) options.push('leap', 'cast', 'slam');
    // Avoid repeating the same move twice in a row.
    const filtered = options.filter((o) => o !== this.lastAction);
    const pick = (filtered.length ? filtered : options)[Math.floor(Math.random() * (filtered.length || options.length))];
    this.lastAction = pick;

    switch (pick) {
      case 'walk':
        this.state = 'walk';
        this.timer = rand(0.6, 1.3);
        break;
      case 'slam':
        this.state = 'slamWindup';
        this.timer = phase === 3 ? 0.52 : 0.62;
        break;
      case 'dash':
        this.state = 'dashWindup';
        this.timer = phase === 3 ? 0.44 : 0.5;
        break;
      case 'cast':
        this.state = 'cast';
        this.timer = 0.55;
        break;
      case 'summon':
        this.state = 'summon';
        this.timer = 0.7;
        break;
      case 'leap':
        this.state = 'leap';
        this.timer = 1.1;
        this.hitPlayerThisAction = false;
        this.vy = -720;
        this.vx = this.facing * 240;
        audio.play('jump', 0.5);
        break;
      default:
        this.state = 'idle';
        this.timer = 0.4;
    }
  }

  private slamRect(): Rect {
    return {
      x: this.facing > 0 ? this.x + this.w - 14 : this.x - 74,
      y: this.y + 20,
      w: 88,
      h: this.h - 14,
    };
  }

  private dashRect(): Rect {
    return { x: this.x - 10, y: this.y + 6, w: this.w + 20, h: this.h - 6 };
  }

  private tryMeleeHit(world: World, box: Rect, damage: number): void {
    const p = world.player;
    if (p.dead || p.isInvulnerable) return;
    if (!p.overlaps(box)) return;
    this.hitPlayerThisAction = true;
    p.hurt(damage, this.facing, world);
  }

  private doSlam(world: World): void {
    audio.play('slam');
    world.camera.addShake(10);
    const groundY = this.bottom;
    world.particles.burst(this.cx + this.facing * 40, groundY, 26, '#c8b9a0', {
      speed: 240,
      gravity: 620,
      angle: -Math.PI / 2,
      spread: Math.PI * 0.9,
      size: 4,
    });
    const count = this.phase === 3 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const speed = 250 + i * 70;
      const wave = new Projectile('shockwave', this.cx + this.facing * 40, groundY - 30, this.facing * speed, 0);
      world.spawnProjectile(wave);
      if (this.phase >= 2) {
        const back = new Projectile('shockwave', this.cx - this.facing * 40, groundY - 30, -this.facing * speed, 0);
        world.spawnProjectile(back);
      }
    }
  }

  private doGroundPound(world: World): void {
    audio.play('slam', 0.8);
    world.camera.addShake(13);
    world.particles.burst(this.cx, this.bottom, 40, '#c8b9a0', {
      speed: 300,
      gravity: 700,
      angle: -Math.PI / 2,
      spread: Math.PI,
      size: 5,
    });
    for (const dir of [-1, 1]) {
      world.spawnProjectile(new Projectile('shockwave', this.cx + dir * 30, this.bottom - 30, dir * 290, 0));
    }
    // Debris rains from the ceiling.
    for (let i = 0; i < 5; i++) {
      const x = world.player.cx + rand(-190, 190);
      world.spawnProjectile(new Projectile('rock', x, this.y - 220 - i * 34, rand(-20, 20), 60));
    }
  }

  private castOrbs(world: World): void {
    audio.play('shoot', 0.7);
    const count = this.phase === 3 ? 5 : 3;
    const player = world.player;
    const baseAngle = Math.atan2(player.cy - (this.cy - 10), player.cx - this.cx);
    for (let i = 0; i < count; i++) {
      const spread = 0.62;
      const a = baseAngle + (i - (count - 1) / 2) * (spread / Math.max(1, count - 1)) * 2;
      const speed = 210;
      world.spawnProjectile(
        new Projectile('orb', this.cx - 7, this.cy - 18, Math.cos(a) * speed, Math.sin(a) * speed),
      );
    }
    world.particles.burst(this.cx, this.cy - 16, 18, '#d46bf0', { speed: 160, gravity: -40, shape: 'circle' });
  }

  private summonMinions(world: World): void {
    audio.play('bossRoar', 1.6);
    for (const dir of [-1, 1]) {
      const x = clamp(this.cx + dir * 150, 40, world.level.pixelWidth - 60);
      const skeleton = new Skeleton(x, this.bottom - 34);
      skeleton.active = true;
      world.spawnEnemy(skeleton);
      world.particles.burst(x + 11, this.bottom - 8, 24, '#7a4fb5', { speed: 170, gravity: -120, shape: 'circle' });
    }
    world.particles.text(this.cx, this.y - 16, 'GEFOLGE!', '#c98bff');
  }

  /* ------------------------------------------------------------- drawing */

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.dead) return;
    const dyingFade = this.state === 'dying' ? clamp(this.deathTimer / 2.6, 0, 1) : 1;

    shadow(ctx, this.cx, this.bottom + 2, this.w * 1.1, 0.4 * dyingFade);

    // Dark aura, stronger in later phases.
    const auraStrength = this.phase === 3 ? 0.5 : this.phase === 2 ? 0.32 : 0.2;
    glow(
      ctx,
      this.cx,
      this.cy,
      70 + Math.sin(this.auraPulse) * 8,
      `rgba(200,40,40,${(auraStrength * dyingFade).toFixed(3)})`,
    );

    // A raised blade belongs behind the knight so it never hides his helmet.
    const bladeBehind = this.swordAngle < -1.2;
    if (bladeBehind) this.drawGreatsword(ctx, dyingFade * 0.9);

    ctx.globalAlpha = dyingFade;
    withHitFlash(ctx, this.flash, () => {
      ctx.save();
      ctx.translate(this.cx, this.bottom);
      const stagger = this.state === 'stagger' ? Math.sin(this.anim * 22) * 0.07 : 0;
      ctx.rotate(stagger);
      ctx.scale(this.facing, 1);
      this.drawKnight(ctx);
      ctx.restore();
    });
    ctx.globalAlpha = 1;

    if (!bladeBehind) this.drawGreatsword(ctx, dyingFade);

    if (this.state === 'slamWindup' || this.state === 'dashWindup') {
      // Telegraph so the fight stays readable.
      const t = 1 - clamp(this.timer / 0.62, 0, 1);
      ctx.globalAlpha = 0.25 + t * 0.45;
      ctx.strokeStyle = '#ff4d3d';
      ctx.lineWidth = 2;
      const box = this.state === 'slamWindup' ? this.slamRect() : { x: this.x + this.facing * 150, y: this.y, w: this.w, h: this.h };
      ctx.strokeRect(box.x, box.y, box.w, box.h);
      ctx.globalAlpha = 1;
    }
  }

  private drawKnight(ctx: CanvasRenderingContext2D): void {
    const h = this.h;
    const breathe = Math.sin(this.anim * 2.2) * 1.5;

    // Cape.
    const capeSway = Math.sin(this.anim * 2.4) * 5 - this.vx * 0.03;
    ctx.fillStyle = '#5c1620';
    ctx.beginPath();
    ctx.moveTo(-8, -h + 20);
    ctx.quadraticCurveTo(-36 - capeSway, -h * 0.55, -28 - capeSway, -2);
    ctx.lineTo(-2, -10);
    ctx.lineTo(0, -h + 18);
    ctx.closePath();
    ctx.fill();

    // Legs / greaves.
    ctx.fillStyle = PALETTE.boss;
    ctx.fillRect(-19, -37, 13, 37);
    ctx.fillRect(6, -37, 13, 37);
    ctx.fillStyle = PALETTE.bossPlate;
    ctx.fillRect(-20, -39, 15, 9);
    ctx.fillRect(5, -39, 15, 9);
    ctx.fillStyle = '#15111a';
    ctx.fillRect(-22, -7, 18, 7);
    ctx.fillRect(4, -7, 18, 7);

    // Torso.
    const torsoY = -h + 24 + breathe;
    const g = ctx.createLinearGradient(0, torsoY, 0, -34);
    g.addColorStop(0, PALETTE.bossPlate);
    g.addColorStop(1, PALETTE.boss);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-23, torsoY);
    ctx.lineTo(23, torsoY);
    ctx.lineTo(17, -34);
    ctx.lineTo(-17, -34);
    ctx.closePath();
    ctx.fill();

    // Chest emblem.
    ctx.fillStyle = PALETTE.bossTrim;
    ctx.beginPath();
    ctx.moveTo(0, torsoY + 8);
    ctx.lineTo(9, torsoY + 20);
    ctx.lineTo(0, torsoY + 32);
    ctx.lineTo(-9, torsoY + 20);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffb4a0';
    ctx.beginPath();
    ctx.arc(0, torsoY + 20, 3, 0, Math.PI * 2);
    ctx.fill();

    // Pauldrons.
    ctx.fillStyle = PALETTE.bossPlate;
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.scale(s, 1);
      ctx.beginPath();
      ctx.moveTo(14, torsoY - 2);
      ctx.quadraticCurveTo(32, torsoY + 2, 28, torsoY + 18);
      ctx.lineTo(14, torsoY + 14);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = PALETTE.bossTrim;
      ctx.fillRect(18, torsoY + 2, 9, 3);
      ctx.fillStyle = PALETTE.bossPlate;
      ctx.restore();
    }

    // Helmet.
    const headY = torsoY - 20;
    ctx.fillStyle = PALETTE.boss;
    ctx.beginPath();
    ctx.moveTo(-13, headY + 20);
    ctx.lineTo(-13, headY + 4);
    ctx.quadraticCurveTo(0, headY - 8, 13, headY + 4);
    ctx.lineTo(13, headY + 20);
    ctx.closePath();
    ctx.fill();
    // Horns.
    ctx.fillStyle = PALETTE.bossPlate;
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.scale(s, 1);
      ctx.beginPath();
      ctx.moveTo(9, headY + 2);
      ctx.quadraticCurveTo(26, headY - 8, 22, headY - 22);
      ctx.quadraticCurveTo(16, headY - 8, 7, headY + 6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    // Visor slit with burning eyes.
    ctx.fillStyle = '#0a070c';
    ctx.fillRect(-11, headY + 8, 22, 6);
    const eyeGlow = this.state === 'stagger' ? 0.35 : 1;
    ctx.globalAlpha = eyeGlow;
    ctx.fillStyle = PALETTE.bossEye;
    ctx.fillRect(-8, headY + 9, 6, 3.5);
    ctx.fillRect(3, headY + 9, 6, 3.5);
    ctx.globalAlpha = 1;
    glow(ctx, -5, headY + 11, 10, 'rgba(255,70,50,0.5)');
    glow(ctx, 6, headY + 11, 10, 'rgba(255,70,50,0.5)');
  }

  private drawGreatsword(ctx: CanvasRenderingContext2D, alpha: number): void {
    const pivotX = this.cx + this.facing * 18;
    const pivotY = this.y + 50;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(pivotX, pivotY);
    ctx.rotate(this.swordAngle * this.facing);
    ctx.scale(this.facing, 1);

    const len = 98;
    ctx.fillStyle = '#241a20';
    ctx.fillRect(-18, -4.5, 20, 9);
    ctx.fillStyle = PALETTE.bossTrim;
    ctx.fillRect(0, -15, 7, 30);
    const grad = ctx.createLinearGradient(0, 0, len, 0);
    grad.addColorStop(0, '#3b3444');
    grad.addColorStop(0.5, '#75697f');
    grad.addColorStop(1, '#c7bcd4');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(7, -10);
    ctx.lineTo(len - 18, -8);
    ctx.lineTo(len, 0);
    ctx.lineTo(len - 18, 8);
    ctx.lineTo(7, 10);
    ctx.closePath();
    ctx.fill();
    // Glowing rune down the fuller.
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = this.phase === 3 ? 'rgba(255,90,60,0.9)' : 'rgba(200,60,60,0.6)';
    ctx.fillRect(10, -1.5, len - 26, 3);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    if (this.state === 'dash') {
      slashArc(ctx, this.cx, this.cy, 70, -0.9, 0.9, 14, 'rgba(255,80,60,0.6)', 0.6 * alpha);
    }
    ctx.globalAlpha = 1;
  }
}
