import { audio } from '../core/audio';
import { Rect, approach, clamp, damp, rand, rectsOverlap, sign } from '../core/math';
import { RAMP } from '../render/palette';
import { oval } from '../render/pen';
import { snap } from '../render/pixel';
import { shadow } from '../render/sprites';
import type { World } from '../world/context';
import { Bat, Enemy, type GlowLight } from './enemy';
import { Projectile } from './projectile';
import { dashLine4, floorRing } from './puppet';
import { type BodyFrame, MOON, MOON_R, STARS, type VesperLook, type WholeFrame, diveFrame, drawVesper, drawVesperWhole, warmVesper, wingFrame } from './vesper-art';

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
  /** All his frames worked out (see warmVesper). */
  private ready = false;

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
    // His frames are worked out a little at a time from the moment he is in
    // view, long before the fight needs them.
    if (!this.ready) this.ready = warmVesper(2);
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
    const hot = this.state === 'diveWind';
    out.push({ x: this.cx, y: this.y + 14, radius: 110 * this.eyes * (hot ? 1.3 : 1), rgb: '255,50,80', strength: hot ? 0.9 : 0.7, tint: 0.35 });
    out.push({ x: this.cx, y: this.cy, radius: 150, rgb: '200,160,190', strength: 0.45, tint: 0.12 });
    if (this.state === 'slashWind') {
      // The sickle of blood in his raised claw.
      out.push({ x: this.cx + 24 * this.facing, y: this.cy - 58, radius: 60, rgb: '255,30,60', strength: 0.7, tint: 0.4 });
    }
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
    const facing: 1 | -1 = this.facing > 0 ? 1 : -1;
    // A whole frame (his end, the dive) or body and wings for the moment.
    const whole: WholeFrame | null =
      this.state === 'dying'
        ? DIE[Math.min(3, Math.floor((1 - this.fade) * 4))]
        : this.state === 'dive'
          ? diveFrame(Math.atan2(this.vy, Math.abs(this.vx)) * 0.6)
          : null;
    // A blow shows as his silhouette in white for two frames: frames of their
    // own, built once, rather than a flash composited over him every time.
    const white = this.flash >= HIT_WHITE && this.state !== 'dying';
    if (whole) {
      drawVesperWhole(ctx, whole, this.cx, this.cy, facing, white ? 'white' : this.state === 'dive' ? 'hot' : '');
    } else {
      const look = this.look();
      drawVesper(ctx, this.cx, this.cy, facing, white ? { ...look, palette: 'white' } : look);
    }
    if (this.state === 'stunned') this.drawStars(ctx);
  }

  /** Body, wings and eyes for this moment. */
  private look(): VesperLook {
    const flying = this.state !== 'grounded' && this.state !== 'stunned' && this.state !== 'dormant';
    const palette: VesperLook['palette'] = this.state === 'diveWind' ? 'hot' : this.eyes < 0.6 ? 'dim' : '';
    const hem = Math.floor(this.anim * 5) % 4;
    const look: VesperLook = { body: FLY[hem], wing: wingFrame(this.spread, this.wing, flying), palette, sickle: 0 };
    switch (this.state) {
      case 'dormant':
        // Asleep at the top of his tower, wrapped in his wings.
        return { body: 'wrap', wing: null, palette: 'dim', sickle: 0 };
      case 'grounded':
        look.body = Math.sin(this.anim * 5) > 0 ? 'kneel0' : 'kneel1';
        break;
      case 'stunned':
        // Down on the roof, his wings spread on it round him.
        look.body = 'stun';
        look.wing = 'rest';
        break;
      case 'fall': {
        // Dropping out of the air, flailing.
        const flail = Math.floor(this.anim * 8) % 2;
        look.body = flail ? 'fall1' : 'fall0';
        look.wing = flail ? 'half3' : 'half1';
        break;
      }
      case 'slashWind':
        // The sickle grows in his claw until he throws it.
        look.body = 'cast';
        look.sickle = this.timer < 0.32 ? 2 : 1;
        break;
      case 'swarmWind':
        look.body = 'call';
        break;
      case 'moonWind':
      case 'moon':
        look.body = 'raise';
        break;
    }
    return look;
  }

  /**
   * A blood moon behind him while he calls the rain: black in a ring of
   * red as it comes, a crescent, then full - and the same way out.
   */
  private drawMoon(ctx: CanvasRenderingContext2D): void {
    if (this.moonGlow < 0.02) return;
    const stage = this.moonGlow < 0.35 ? 'm0' : this.moonGlow < 0.7 ? 'm1' : 'm2';
    MOON.draw(ctx, stage, (this.arenaLeft + this.arenaRight) / 2, this.floorY - 430, MOON_R, MOON_R);
  }

  /** Where the red rain will fall: a ring closing in and warming on the roof, its middle dark. */
  private drawMarks(ctx: CanvasRenderingContext2D): void {
    for (const m of this.marks) {
      if (m.t < 0) continue;
      const p = clamp(m.t / 0.85, 0, 1);
      if (p > 0.3) oval(ctx, snap(m.x), snap(this.floorY - 2), 18, 4, RAMP.rose[0]);
      floorRing(ctx, m.x, this.floorY - 2, 26 - p * 8, 6 - p * 2, 1, p < 0.5 ? RAMP.rose[1] : p < 1 ? RAMP.rose[3] : RAMP.rose[4]);
    }
  }

  /** Where the dive will go: a broken line that turns solid and bright as it locks. */
  private drawDiveLine(ctx: CanvasRenderingContext2D): void {
    const locked = this.timer <= 0.22;
    const color = locked ? RAMP.rose[4] : RAMP.rose[2];
    dashLine4(ctx, this.cx, this.cy, this.target.x, this.floorY - 4, color, locked ? 1 : 4, locked ? 0 : 4, locked ? 2 : 1);
    floorRing(ctx, this.target.x, this.floorY - 2, 24, 5, 1, color);
  }

  /** Three stars turning over his head while he is down. */
  private drawStars(ctx: CanvasRenderingContext2D): void {
    for (let i = 0; i < 3; i++) {
      const a = this.anim * 4 + i * 2.1;
      STARS.draw(ctx, 's', this.cx + Math.cos(a) * 19, this.cy - 54 + Math.sin(a) * 5, 1, 1);
    }
  }
}

/** Above this his flash is a white silhouette (two frames of a blow); below it, nothing. */
const HIT_WHITE = 0.8;
const FLY: readonly BodyFrame[] = ['fly0', 'fly1', 'fly2', 'fly3'];
const DIE: readonly WholeFrame[] = ['die0', 'die1', 'die2', 'die3'];
