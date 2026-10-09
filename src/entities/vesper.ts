import { audio } from '../core/audio';
import { Rect, approach, clamp, damp, rand, rectsOverlap, sign } from '../core/math';
import { glow, shadow, withHitFlash } from '../render/sprites';
import type { World } from '../world/context';
import { Bat, Enemy, type GlowLight } from './enemy';
import { Projectile } from './projectile';

const VESPER_HP = 56;
/** Damage taken in the air before he drops out of it. */
const VESPER_POISE = 9;
/** How high he holds, above the roof. */
const HOVER = 236;
/**
 * At most this many of his bats at once, and he calls two at a time. Four,
 * three to a call, was most of what the fight cost a hero who read it: about
 * six hearts in seven, against one for everything the lord does himself.
 */
const MAX_BATS = 3;

interface Mark {
  x: number;
  t: number;
  dropped: boolean;
}

type VesperState =
  | 'dormant'
  | 'intro'
  | 'hover'
  | 'diveWind'
  | 'dive'
  | 'grounded'
  | 'fall'
  | 'stunned'
  | 'rise'
  | 'slashWind'
  | 'swarmWind'
  | 'moonWind'
  | 'moon'
  | 'dying';

/**
 * Vesperon, der Blutfürst - master of the keep, who has not touched the floor
 * of his own tower in a hundred years unless it was to take something off it.
 *
 * A flier, which is a problem for a hero with a sword, so the fight is built
 * around the moments he comes down:
 *
 *   Sturzflug    - he rises, spreads his wings, screams, and marks where he is
 *                  going with a line of red; then he goes there. Roll through it
 *                  or step off the line. Where he lands he has to catch his
 *                  breath, on the floor, in reach. Parry the dive and he lands
 *                  on his face.
 *   Blutsicheln  - crescents of blood thrown from the cape. A swing of the
 *                  blade sends them back up at him.
 *   Schwarm      - bats out of his cloak, two at a call and never more than
 *                  three; they come down one at a time, never while he dives.
 *   Blutmond     - from half health on, once in a while: he climbs to the top
 *                  of the sky and it rains red where it is marked.
 *
 * And he can be fetched down: the planks and the merlons put a hero at his
 * height, and enough damage in the air drops him onto the roof.
 */
export class Vesper extends Enemy {
  private state: VesperState = 'dormant';
  private timer = 0;
  private floorY = 0;
  private arenaLeft = 0;
  private arenaRight = 0;
  private wing = 0;
  /** 0 wings furled, 1 spread wide. */
  private spread = 0.4;
  private eyes = 0;
  private poise = VESPER_POISE;
  private poiseMax = VESPER_POISE;
  private lastMove = '';
  private target = { x: 0, y: 0 };
  private diveFrom = { x: 0, y: 0 };
  private dives = 0;
  private marks: Mark[] = [];
  private phaseTwo = false;
  private hitThisMove = false;
  /** Where he drifts to between moves. */
  private driftX = 0;
  private moonGlow = 0;
  private fade = 1;
  /** Moves since his bats were last called. */
  private sinceSwarm = 2;

  override castLight = false;

  constructor(x: number, y: number) {
    super('vesper', x, y);
    this.w = 54;
    this.h = 94;
    this.hp = this.maxHp = VESPER_HP;
    this.scoreValue = 1100;
    this.contactDamage = 1;
    this.aggroRange = 520;
  }

  /**
   * His bats keep off while he winds up and makes his dive, and while he is
   * down on the roof: that is the window the dive's parry earns, and bats
   * coming down into it cost a hero who read him most of what he still lost -
   * punished for punishing.
   */
  override get holdsSwarm(): boolean {
    return (
      this.state === 'diveWind' ||
      this.state === 'dive' ||
      this.state === 'fall' ||
      this.state === 'stunned' ||
      this.state === 'grounded'
    );
  }

  get phase(): 1 | 2 {
    return this.phaseTwo ? 2 : 1;
  }

  override barName(): string {
    return 'VESPERON   ·   DER BLUTFÜRST';
  }

  override barPhase(): number {
    return this.phase;
  }

  private get haste(): number {
    return this.phaseTwo ? 0.8 : 1;
  }

  protected override deathColor(): string {
    return '#c0203c';
  }

  override overlaps(r: Rect): boolean {
    if (this.state === 'dormant' || this.state === 'intro' || this.state === 'dying') return false;
    if (this.state === 'moon' && this.fade < 0.5) return false;
    return rectsOverlap({ x: this.x + 4, y: this.y + 4, w: this.w - 8, h: this.h - 8 }, r);
  }

  override hurt(amount: number, fromDir: number, world: World): void {
    if (this.dead || !this.overlapsAllowed) return;
    this.hp -= amount;
    this.flash = 1;
    audio.play('bossHit', 1.1);
    world.particles.burst(this.cx, this.cy, 10, '#d0203c', { speed: 170, gravity: 400 });
    if (this.hp <= 0) {
      this.beginDying(world);
      return;
    }
    if (!this.phaseTwo && this.hp <= this.maxHp / 2) {
      this.phaseTwo = true;
      audio.play('phase', 1.1);
      audio.play('screech', 0.7);
      world.camera.addShake(6);
    }
    const inAir = this.state === 'hover' || this.state === 'slashWind' || this.state === 'swarmWind';
    if (inAir) {
      this.poise -= amount;
      this.vx += fromDir * 60;
      if (this.poise <= 0 && this.poiseLock <= 0) this.knockDown(world);
    }
  }

  private get overlapsAllowed(): boolean {
    return this.state !== 'dormant' && this.state !== 'intro' && this.state !== 'dying';
  }

  /** A parry catches him: out of a dive he goes into the roof. */
  override onParried(world: World): void {
    if (this.dead || this.state === 'stunned' || this.state === 'fall' || this.state === 'dying') return;
    if (this.poiseLock > 0) return;
    this.knockDown(world);
  }

  /** Out of the air and onto the floor, stunned. */
  private knockDown(world: World): void {
    this.poise = this.poiseMax;
    this.poiseLock = 3.2;
    this.state = 'fall';
    this.vx = 0;
    this.vy = 120;
    this.spread = 0.2;
    audio.play('screech', 0.6);
    world.particles.text(this.cx, this.y - 16, 'ABGESTÜRZT!', '#ff9fb4');
    world.camera.addShake(5);
  }

  private beginDying(world: World): void {
    this.hp = 0;
    this.state = 'dying';
    this.timer = 2.2;
    this.marks = [];
    audio.play('screech', 0.5);
    audio.play('bossDown', 1.2);
    world.camera.addShake(8);
    world.hitStop(0.14);
  }

  override touchPlayer(world: World): void {
    if (this.state === 'dormant' || this.state === 'intro' || this.state === 'dying') return;
    // Getting up off the roof is not a blow: it ends the window, it does not
    // punish whoever was using it - with nothing before it but the beat of
    // his wings, it caught a hero standing at his side every time.
    if (this.state === 'moon' || this.state === 'stunned' || this.state === 'grounded' || this.state === 'rise') return;
    const p = world.player;
    if (this.state === 'dive') {
      if (this.hitThisMove || p.dead || p.isInvulnerable) return;
      if (!rectsOverlap(this.rect, p.rect)) return;
      this.hitThisMove = true;
      const guarding = p.parryTimer > 0;
      p.hurt(2, sign(p.cx - this.cx) || 1, world);
      // hurt() hands a parried blow to onParried only for foes close to his
      // middle; a dive can land a little off it, so it is checked here too.
      if (guarding && p.parryTimer === 0 && p.parryFlash > 0.95) this.knockDown(world);
      return;
    }
    super.touchPlayer(world);
  }

  /* --------------------------------------------------------------- update */

  override update(dt: number, world: World): void {
    this.updateCommon(dt);
    const player = world.player;
    this.wing += dt * (this.state === 'dive' ? 2 : this.state === 'grounded' || this.state === 'stunned' ? 1.5 : 9);
    this.eyes = approach(this.eyes, this.state === 'dormant' ? 0.2 : 1, dt * 2);
    this.moonGlow = approach(this.moonGlow, this.state === 'moon' || this.state === 'moonWind' ? 1 : 0, dt * 1.2);

    if (this.floorY === 0) {
      // The roof, not a plank: planks are for the hero to stand on.
      const tx = Math.floor(this.cx / 32);
      let ty = Math.floor(this.bottom / 32);
      while (ty < world.level.height && !world.level.solidAt(tx, ty)) ty++;
      this.floorY = ty * 32;
      const arena = world.level.arenaAt(this.cx);
      this.arenaLeft = arena ? arena.left : this.cx - 560;
      this.arenaRight = arena ? arena.right : this.cx + 560;
      this.driftX = this.cx;
    }

    this.updateMarks(dt, world);

    switch (this.state) {
      case 'dormant': {
        // Hanging folded at the top of the tower, until someone comes in.
        this.spread = 0.1;
        const inside = player.cx > this.arenaLeft + 16 && player.cx < this.arenaRight - 16;
        if (inside && Math.abs(player.cx - this.cx) < this.aggroRange && !player.dead) {
          this.engaged = true;
          this.poise = this.poiseMax = this.sizeUpFor(world, VESPER_POISE);
          this.state = 'intro';
          this.timer = 1.6;
          audio.play('screech', 0.55);
          audio.play('wing', 0.7);
          world.camera.addShake(4);
        }
        return;
      }

      case 'intro':
        this.timer -= dt;
        this.spread = approach(this.spread, 1, dt * 1.2);
        this.flyTo(dt, this.cx, this.floorY - HOVER, 2);
        if (this.timer <= 0) {
          this.state = 'hover';
          this.timer = 0.6;
        }
        break;

      case 'hover':
        this.spread = damp(this.spread, 0.75, 4, dt);
        this.flyTo(dt, this.driftX, this.floorY - HOVER + Math.sin(this.anim * 1.8) * 14, 2.4);
        if (Math.random() < dt * 0.8) this.pickDrift(player.cx);
        this.timer -= dt;
        if (this.timer <= 0) this.chooseMove(world);
        break;

      case 'diveWind':
        // Up a little, wings wide, eyes lit: here it comes.
        this.timer -= dt;
        this.spread = approach(this.spread, 1.15, dt * 4);
        this.flyTo(dt, this.diveFrom.x, this.diveFrom.y, 4);
        if (this.timer > 0.22) {
          this.target.x = clamp(player.cx, this.arenaLeft + 30, this.arenaRight - 30);
          this.target.y = this.floorY - this.h / 2;
        }
        if (this.timer <= 0) {
          this.state = 'dive';
          this.hitThisMove = false;
          const dx = this.target.x - this.cx;
          const dy = this.target.y - this.cy;
          const len = Math.hypot(dx, dy) || 1;
          this.vx = (dx / len) * 940;
          this.vy = (dy / len) * 940;
          audio.play('dash', 0.7);
          audio.play('wing', 0.6);
        }
        break;

      case 'dive': {
        this.spread = approach(this.spread, 0, dt * 8);
        this.facing = this.vx >= 0 ? 1 : -1;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        if (world.time % 0.02 < dt) {
          world.particles.spawn({
            x: this.cx + rand(-8, 8),
            y: this.cy + rand(-10, 10),
            vx: -this.vx * 0.1,
            vy: -this.vy * 0.1,
            color: 'rgba(200,20,50,0.6)',
            gravity: 0,
            size: rand(2, 4),
            life: 0.3,
          });
        }
        if (this.bottom >= this.floorY - 1) {
          this.y = this.floorY - this.h;
          this.land(world);
        } else if (world.level.rectHitsSolid(this.x, this.y, this.w, this.h)) {
          // Straight into a merlon: that is a lord on his back.
          for (let i = 0; i < 8 && world.level.rectHitsSolid(this.x, this.y, this.w, this.h); i++) {
            this.x -= sign(this.vx) * 8;
          }
          this.knockDown(world);
          audio.play('slam', 1.2);
        }
        break;
      }

      case 'grounded':
        // Catching his breath on the roof, wings down around him. The window.
        this.timer -= dt;
        this.vx = approach(this.vx, 0, 1400 * dt);
        this.x += this.vx * dt;
        if (world.level.rectHitsSolid(this.x, this.y, this.w, this.h - 2)) {
          this.x -= this.vx * dt;
          this.vx = 0;
        }
        this.spread = approach(this.spread, 0.25, dt * 3);
        if (this.timer <= 0) {
          if (this.phaseTwo && this.dives < 2) {
            this.beginDive(player.cx, 0.55);
          } else {
            this.state = 'rise';
            audio.play('wing', 0.8);
          }
        }
        break;

      case 'fall':
        this.vy = Math.min(900, this.vy + 1800 * dt);
        this.y += this.vy * dt;
        this.spread = approach(this.spread, 0.1, dt * 3);
        if (this.bottom >= this.floorY) {
          this.y = this.floorY - this.h;
          this.state = 'stunned';
          this.timer = 2.2;
          audio.play('slam', 1.1);
          world.camera.addShake(6);
          world.particles.burst(this.cx, this.floorY - 2, 16, '#6a5060', { speed: 160, gravity: 500 });
        }
        break;

      case 'stunned':
        this.timer -= dt;
        if (this.timer <= 0) {
          this.state = 'rise';
          audio.play('wing', 0.8);
        }
        break;

      case 'rise':
        this.spread = approach(this.spread, 0.9, dt * 3);
        this.flyTo(dt, this.cx, this.floorY - HOVER, 3);
        if (this.floorY - this.bottom > HOVER - 60) {
          this.state = 'hover';
          this.timer = rand(0.6, 0.9) * this.haste;
          this.pickDrift(player.cx);
        }
        break;

      case 'slashWind':
        this.timer -= dt;
        this.flyTo(dt, this.cx, this.floorY - HOVER, 2);
        this.spread = approach(this.spread, 0.5, dt * 4);
        if (this.timer <= 0) {
          const count = this.phaseTwo ? 5 : 3;
          const dx = player.cx - this.cx;
          const dy = player.cy - this.cy;
          const base = Math.atan2(dy, dx);
          for (let i = 0; i < count; i++) {
            const a = base + (i - (count - 1) / 2) * 0.2;
            world.spawnProjectile(new Projectile('blood', this.cx - 13, this.cy - 8, Math.cos(a) * 300, Math.sin(a) * 300));
          }
          audio.play('swing', 0.6);
          audio.play('magic', 0.6);
          this.state = 'hover';
          this.timer = 1.0 * this.haste;
        }
        break;

      case 'swarmWind':
        this.timer -= dt;
        this.spread = approach(this.spread, 1.2, dt * 3);
        this.flyTo(dt, this.cx, this.floorY - HOVER, 2);
        if (this.timer <= 0) {
          const alive = world.enemies.filter((e) => e.kind === 'bat' && !e.dead && e.spawnKey === 'vesper').length;
          const count = Math.min(2, MAX_BATS - alive);
          for (let i = 0; i < count; i++) {
            const bat = new Bat(this.cx + (i - 1) * 30, this.cy - 10);
            bat.spawnKey = 'vesper';
            // His bats hunt; they do not go home to the rafters.
            bat.aggroRange = 900;
            bat.active = true;
            world.spawnEnemy(bat);
            world.particles.burst(bat.cx, bat.cy, 8, '#8a2040', { speed: 120, gravity: 0 });
          }
          audio.play('screech', 1.2);
          this.state = 'hover';
          this.timer = 1.1 * this.haste;
        }
        break;

      case 'moonWind':
        // Up to the top of the sky.
        this.timer -= dt;
        this.spread = approach(this.spread, 1.2, dt * 3);
        this.flyTo(dt, (this.arenaLeft + this.arenaRight) / 2, this.floorY - 400, 2.6);
        if (this.timer <= 0) {
          this.state = 'moon';
          this.timer = 2.4;
          const xs: number[] = [world.player.cx];
          const span = this.arenaRight - this.arenaLeft - 120;
          for (let i = 0; i < 6; i++) xs.push(this.arenaLeft + 60 + ((i + rand(0.2, 0.8)) / 6) * span);
          this.marks = xs.map((x, i) => ({ x, t: -i * 0.12, dropped: false }));
          audio.play('phase', 1.3);
        }
        break;

      case 'moon':
        this.timer -= dt;
        this.flyTo(dt, (this.arenaLeft + this.arenaRight) / 2, this.floorY - 400, 2);
        if (this.timer <= 0 && this.marks.length === 0) {
          this.state = 'hover';
          this.timer = 0.8;
          this.pickDrift(player.cx);
        }
        break;

      case 'dying':
        this.timer -= dt;
        this.fade = clamp(this.timer / 2.2, 0, 1);
        this.vy = Math.min(300, this.vy + 400 * dt);
        this.y = Math.min(this.y + this.vy * dt, this.floorY - this.h);
        if (Math.random() < 0.6) {
          world.particles.spawn({
            x: this.cx + rand(-40, 40),
            y: this.cy + rand(-30, 30),
            vx: rand(-40, 40),
            vy: -rand(40, 120),
            gravity: -20,
            color: Math.random() < 0.5 ? 'rgba(200,20,50,0.8)' : 'rgba(60,20,40,0.8)',
            size: rand(2, 5),
            life: 0.8,
          });
        }
        if (this.timer <= 0) {
          // He goes as he came: a cloud of bats, scattering.
          for (let i = 0; i < 18; i++) {
            world.particles.spawn({
              x: this.cx,
              y: this.cy,
              vx: rand(-260, 260),
              vy: rand(-260, 60),
              gravity: -40,
              drag: 0.97,
              color: '#2a0c18',
              size: rand(4, 7),
              life: rand(0.8, 1.4),
            });
          }
          this.die(world);
          world.onBossFelled('vesper', this.cx, this.y - 30);
        }
        break;
    }

    if (this.state !== 'dive' && this.state !== 'dying') {
      const dx = player.cx - this.cx;
      if (Math.abs(dx) > 6) this.facing = dx > 0 ? 1 : -1;
    }
    if (this.state !== 'dying') this.x = clamp(this.x, this.arenaLeft + 4, this.arenaRight - this.w - 4);
    if (this.state === 'hover' || this.state === 'rise' || this.state === 'intro') {
      const beat = Math.sin(this.wing);
      if (beat > 0.96 && world.time % 0.1 < dt) audio.play('wing', 1.1);
    }
  }

  private flyTo(dt: number, x: number, y: number, k: number): void {
    const nx = damp(this.cx, x, k, dt);
    const ny = damp(this.cy, y, k, dt);
    this.vx = (nx - this.cx) / dt;
    this.vy = (ny - this.cy) / dt;
    this.x = nx - this.w / 2;
    this.y = ny - this.h / 2;
  }

  private pickDrift(heroX: number): void {
    const side = Math.random() < 0.5 ? -1 : 1;
    this.driftX = clamp(heroX + side * rand(120, 260), this.arenaLeft + 80, this.arenaRight - 80);
  }

  private chooseMove(world: World): void {
    const options = ['dive', 'slash', 'dive', 'swarm'];
    if (this.phaseTwo) options.push('moon');
    const bats = world.enemies.filter((e) => e.kind === 'bat' && !e.dead && e.spawnKey === 'vesper').length;
    const pick = options.filter((o) => o !== this.lastMove && !(o === 'swarm' && bats >= 2));
    let move = pick[Math.floor(Math.random() * pick.length)] ?? 'dive';
    // A cloak with nothing left in it calls again before long.
    if (bats === 0 && this.sinceSwarm >= 4 && this.lastMove !== 'swarm') move = 'swarm';
    this.sinceSwarm = move === 'swarm' ? 0 : this.sinceSwarm + 1;
    this.lastMove = move;
    switch (move) {
      case 'dive':
        this.dives = 0;
        this.beginDive(world.player.cx, 0.8 * this.haste + 0.1);
        break;
      case 'slash':
        this.state = 'slashWind';
        this.timer = 0.62;
        audio.play('tell', 1.4);
        break;
      case 'swarm':
        this.state = 'swarmWind';
        this.timer = 0.7;
        audio.play('tell', 1.1);
        break;
      case 'moon':
        this.state = 'moonWind';
        this.timer = 1.1;
        audio.play('screech', 0.5);
        break;
    }
  }

  private beginDive(heroX: number, wind: number): void {
    this.state = 'diveWind';
    this.timer = wind;
    this.dives++;
    const side = this.cx < heroX ? -1 : 1;
    this.diveFrom = {
      x: clamp(heroX + side * 260, this.arenaLeft + 60, this.arenaRight - 60),
      y: this.floorY - HOVER - 40,
    };
    this.target = { x: heroX, y: this.floorY - this.h / 2 };
    audio.play('screech');
  }

  private land(world: World): void {
    this.state = 'grounded';
    this.timer = 1.35 * (this.phaseTwo && this.dives < 2 ? 0.55 : 1);
    this.vx = sign(this.vx) * 260;
    this.vy = 0;
    audio.play('slam', 1.3);
    world.camera.addShake(5);
    world.particles.burst(this.cx, this.floorY - 2, 18, '#7a5a6a', { speed: 200, gravity: 500, angle: -Math.PI / 2, spread: Math.PI });
    world.particles.burst(this.cx, this.floorY - 2, 10, '#ff4a68', { speed: 160, gravity: 200, shape: 'spark' });
  }

  /** The blood moon's marks, and what falls on them. */
  private updateMarks(dt: number, world: World): void {
    for (const m of this.marks) {
      m.t += dt;
      if (!m.dropped && m.t >= 0.85) {
        m.dropped = true;
        const drop = new Projectile('blood', m.x - 13, this.floorY - 460, 0, 620);
        drop.deflectable = false;
        world.spawnProjectile(drop);
        if (Math.random() < 0.4) audio.play('fireball', 1.6);
      }
    }
    this.marks = this.marks.filter((m) => m.t < 1.7);
  }

  override lights(): GlowLight[] {
    const out: GlowLight[] = [];
    if (this.state === 'dormant') return out;
    out.push({ x: this.cx, y: this.y + 14, radius: 110 * this.eyes, rgb: '255,50,80', strength: 0.7, tint: 0.35 });
    out.push({ x: this.cx, y: this.cy, radius: 150, rgb: '200,160,190', strength: 0.45, tint: 0.12 });
    if (this.moonGlow > 0.05) {
      out.push({ x: (this.arenaLeft + this.arenaRight) / 2, y: this.floorY - 380, radius: 320 * this.moonGlow, rgb: '255,60,70', strength: 0.6, tint: 0.4 });
    }
    for (const m of this.marks) out.push({ x: m.x, y: this.floorY - 6, radius: 50, rgb: '255,40,70', strength: 0.6, tint: 0.4 });
    return out;
  }

  /* -------------------------------------------------------------- drawing */

  override draw(ctx: CanvasRenderingContext2D): void {
    if (this.floorY === 0) return;
    this.drawMoon(ctx);
    this.drawMarks(ctx);
    if (this.state === 'diveWind') this.drawDiveLine(ctx);
    // His shadow, on the roof, however high he is.
    const height = this.floorY - this.bottom;
    shadow(ctx, this.cx, this.floorY, 60 * clamp(1 - height / 420, 0.3, 1), 0.3 * clamp(1 - height / 500, 0.2, 1));
    ctx.save();
    ctx.globalAlpha = this.fade;
    withHitFlash(ctx, this.flash, () => {
      ctx.save();
      ctx.translate(this.cx, this.cy);
      if (this.state === 'dive') {
        ctx.rotate(Math.atan2(this.vy, Math.abs(this.vx)) * this.facing * 0.6);
      }
      // Drawn a third larger than he was sketched: a lord, not a bat.
      ctx.scale(this.facing * 1.35, 1.35);
      this.drawWings(ctx);
      this.drawFigure(ctx);
      ctx.restore();
    });
    ctx.restore();
  }

  /** A blood-red moon behind him while he calls the rain. */
  private drawMoon(ctx: CanvasRenderingContext2D): void {
    if (this.moonGlow < 0.02) return;
    const x = (this.arenaLeft + this.arenaRight) / 2;
    const y = this.floorY - 430;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, x, y, 200, `rgba(255,40,60,${(0.35 * this.moonGlow).toFixed(3)})`);
    ctx.fillStyle = `rgba(255,90,90,${(0.55 * this.moonGlow).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x, y, 62, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawMarks(ctx: CanvasRenderingContext2D): void {
    if (this.marks.length === 0) return;
    ctx.save();
    for (const m of this.marks) {
      if (m.t < 0) continue;
      const p = clamp(m.t / 0.85, 0, 1);
      ctx.strokeStyle = `rgba(255,60,90,${(0.25 + p * 0.5).toFixed(3)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(m.x, this.floorY - 2, 26 - p * 8, 6 - p * 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(160,10,40,${(0.1 + p * 0.25).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(m.x, this.floorY - 2, 18, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Where the dive will go: a line that sharpens as it locks. */
  private drawDiveLine(ctx: CanvasRenderingContext2D): void {
    const locked = this.timer <= 0.22;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = locked ? 'rgba(255,90,110,0.75)' : 'rgba(255,60,90,0.3)';
    ctx.lineWidth = locked ? 3 : 1.5;
    ctx.setLineDash(locked ? [] : [8, 8]);
    ctx.beginPath();
    ctx.moveTo(this.cx, this.cy);
    ctx.lineTo(this.target.x, this.floorY - 4);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.ellipse(this.target.x, this.floorY - 2, 24, 5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Bat wings: an arm bone and four long fingers from the shoulder, and the
   * membrane between them cut into scallops on the trailing edge. `spread`
   * opens them from furled to wide; the beat rides on top of that.
   */
  private drawWings(ctx: CanvasRenderingContext2D): void {
    const flying = this.state !== 'grounded' && this.state !== 'stunned' && this.state !== 'dormant';
    const beat = flying && this.state !== 'dive' ? Math.sin(this.wing) : 0;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(side * 8, -18);
      ctx.scale(side, 1);
      const open = clamp(this.spread, 0, 1.25);
      const lift = -0.35 - beat * 0.45 + (1 - open) * 1.25;
      ctx.rotate(lift);
      const reach = 36 + open * 74;
      // Four finger tips fanned out below the arm.
      const tips: [number, number][] = [];
      for (let i = 0; i < 4; i++) {
        const a = -0.25 + i * (0.42 + open * 0.12);
        const len = reach * (1.05 - i * 0.13);
        tips.push([reach * 0.55 + Math.cos(a) * len, Math.sin(a) * len * 0.9]);
      }
      // Membrane: shoulder, wrist, then each finger tip in turn, with the
      // trailing edge cut into a scallop between every pair of fingers.
      const wrist = { x: reach * 0.55, y: -8 };
      const scallop = (ax: number, ay: number, bx: number, by: number): void => {
        const mx = (ax + bx) / 2;
        const my = (ay + by) / 2;
        ctx.quadraticCurveTo(mx + (wrist.x - mx) * 0.34, my + (wrist.y - my) * 0.34, bx, by);
      };
      const edge = (): void => {
        ctx.moveTo(tips[0][0], tips[0][1]);
        for (let i = 1; i < 4; i++) scallop(tips[i - 1][0], tips[i - 1][1], tips[i][0], tips[i][1]);
        scallop(tips[3][0], tips[3][1], 6, 44);
      };
      const mem = ctx.createRadialGradient(wrist.x, wrist.y, 4, wrist.x, wrist.y, reach * 1.1);
      mem.addColorStop(0, '#83183a');
      mem.addColorStop(0.55, '#480a1e');
      mem.addColorStop(1, '#22040e');
      ctx.fillStyle = mem;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(wrist.x, wrist.y);
      ctx.lineTo(tips[0][0], tips[0][1]);
      for (let i = 1; i < 4; i++) scallop(tips[i - 1][0], tips[i - 1][1], tips[i][0], tips[i][1]);
      scallop(tips[3][0], tips[3][1], 6, 44);
      ctx.lineTo(0, 22);
      ctx.closePath();
      ctx.fill();
      // The red moon catching the trailing edge.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(255,70,100,0.32)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      edge();
      ctx.stroke();
      ctx.restore();
      // Bones.
      ctx.strokeStyle = '#1a0610';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(reach * 0.55, -8);
      ctx.stroke();
      ctx.lineWidth = 1.8;
      for (const [tx, ty] of tips) {
        ctx.beginPath();
        ctx.moveTo(wrist.x, wrist.y);
        ctx.quadraticCurveTo((wrist.x + tx) / 2 + 3, (wrist.y + ty) / 2 - 3, tx, ty);
        ctx.stroke();
      }
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(255,70,100,0.35)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, -1);
      ctx.lineTo(reach * 0.55, -9);
      ctx.lineTo(tips[0][0], tips[0][1] - 1);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#d8c8cc';
      ctx.beginPath();
      ctx.moveTo(reach * 0.55, -10);
      ctx.lineTo(reach * 0.55 + 6, -16);
      ctx.lineTo(reach * 0.55 + 3, -7);
      ctx.fill();
      ctx.restore();
    }
  }

  /** The lord himself: collar, cape, a pale face, and the eyes. */
  private drawFigure(ctx: CanvasRenderingContext2D): void {
    const down = this.state === 'grounded' || this.state === 'stunned';
    const kneel = down ? 8 : 0;
    // Cape, falling to a point below him in the air, pooled on the floor.
    const cape = ctx.createLinearGradient(0, -30, 0, 36);
    cape.addColorStop(0, '#2a0812');
    cape.addColorStop(1, '#0e0206');
    ctx.fillStyle = cape;
    ctx.beginPath();
    ctx.moveTo(-14, -22);
    ctx.lineTo(14, -22);
    if (down) {
      ctx.quadraticCurveTo(26, 10, 30, 35);
      ctx.lineTo(-30, 35);
      ctx.quadraticCurveTo(-26, 10, -14, -22);
    } else {
      const sway = Math.sin(this.anim * 3) * 3;
      ctx.quadraticCurveTo(22, 8, 12 + sway, 38);
      ctx.lineTo(0, 30);
      ctx.lineTo(-12 + sway, 40);
      ctx.quadraticCurveTo(-22, 8, -14, -22);
    }
    ctx.closePath();
    ctx.fill();
    // Crimson lining showing at the edge.
    ctx.strokeStyle = '#8a1030';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Doublet and the medallion.
    ctx.fillStyle = '#1c1420';
    ctx.fillRect(-9, -22 + kneel, 18, 30);
    ctx.fillStyle = '#c9a14a';
    ctx.beginPath();
    ctx.arc(0, -8 + kneel, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, 0, -8 + kneel, 12, 'rgba(255,40,70,0.6)');
    ctx.fillStyle = '#ff3a5a';
    ctx.beginPath();
    ctx.arc(0, -8 + kneel, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // The high collar, flared behind the head.
    ctx.fillStyle = '#3a0a18';
    ctx.beginPath();
    ctx.moveTo(-12, -22 + kneel);
    ctx.lineTo(-20, -46 + kneel);
    ctx.lineTo(-8, -32 + kneel);
    ctx.closePath();
    ctx.moveTo(12, -22 + kneel);
    ctx.lineTo(20, -46 + kneel);
    ctx.lineTo(8, -32 + kneel);
    ctx.closePath();
    ctx.fill();

    // Face: pale, long, with a widow's peak and pointed ears.
    const hy = -32 + kneel;
    ctx.fillStyle = '#e6dbe0';
    ctx.beginPath();
    ctx.moveTo(-7, hy - 8);
    ctx.quadraticCurveTo(0, hy - 12, 7, hy - 8);
    ctx.quadraticCurveTo(8, hy + 4, 0, hy + 10);
    ctx.quadraticCurveTo(-8, hy + 4, -7, hy - 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#cdbfc6';
    ctx.beginPath();
    ctx.moveTo(-7, hy - 3);
    ctx.lineTo(-13, hy - 10);
    ctx.lineTo(-6, hy + 1);
    ctx.closePath();
    ctx.moveTo(7, hy - 3);
    ctx.lineTo(13, hy - 10);
    ctx.lineTo(6, hy + 1);
    ctx.closePath();
    ctx.fill();
    // Hair, swept back to a peak.
    ctx.fillStyle = '#16101a';
    ctx.beginPath();
    ctx.moveTo(-8, hy - 6);
    ctx.quadraticCurveTo(0, hy - 16, 8, hy - 6);
    ctx.lineTo(3, hy - 7);
    ctx.lineTo(0, hy - 3);
    ctx.lineTo(-3, hy - 7);
    ctx.closePath();
    ctx.fill();
    // Eyes and fangs.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const e = this.eyes * (this.state === 'diveWind' ? 1.4 : 1);
    glow(ctx, 2, hy - 1, 12, `rgba(255,40,70,${(0.6 * e).toFixed(3)})`);
    ctx.fillStyle = `rgba(255,${this.state === 'diveWind' ? 200 : 90},110,${Math.min(1, 0.9 * e).toFixed(3)})`;
    ctx.fillRect(-4.5, hy - 2, 3.4, 1.8);
    ctx.fillRect(1.8, hy - 2, 3.4, 1.8);
    ctx.restore();
    ctx.fillStyle = '#7a2030';
    ctx.fillRect(-2.5, hy + 4, 5, 1.2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-2.2, hy + 5, 1.2, 2.2);
    ctx.fillRect(1.1, hy + 5, 1.2, 2.2);

    // Hands: clawed, out from the cape, raised to throw.
    const raise = this.state === 'slashWind' ? -14 : this.state === 'swarmWind' ? -18 : 0;
    ctx.fillStyle = '#d8ccd2';
    ctx.beginPath();
    ctx.ellipse(12, -4 + raise + kneel, 3.4, 4.5, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d8ccd2';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(13 + i, -7 + raise + kneel);
      ctx.lineTo(17 + i * 1.5, -12 + raise + kneel - i);
      ctx.stroke();
    }
    if (this.state === 'slashWind') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, 16, -14 + kneel, 22, 'rgba(255,30,60,0.7)');
      ctx.restore();
    }
    // Stunned: little dizzy sparks over him.
    if (this.state === 'stunned') {
      ctx.fillStyle = '#ffd0dc';
      for (let i = 0; i < 3; i++) {
        const a = this.anim * 4 + i * 2.1;
        ctx.fillRect(Math.cos(a) * 14 - 1.5, hy - 20 + Math.sin(a) * 4, 3, 3);
      }
    }
  }
}
