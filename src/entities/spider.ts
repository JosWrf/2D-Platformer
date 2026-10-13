import { audio } from '../core/audio';
import { Rect, approach, clamp, damp, rand, rectsOverlap, sign } from '../core/math';
import { RAMP } from '../render/palette';
import { oval } from '../render/pen';
import { ART, snap } from '../render/pixel';
import { shadow, withHitFlash } from '../render/sprites';
import { TILE } from '../world/tiles';
import type { World } from '../world/context';
import { Enemy, type GlowLight } from './enemy';
import { Projectile } from './projectile';
import { floorRing, line4 } from './puppet';
import { EGG, SILK, type SpiderFrame, YOUNG, drawArachna } from './spider-art';

/** Health before the hero is sized up. Between Ankhor and Ignivor. */
const SPIDER_HP = 48;
/** Damage to her body, up on her thread, before she loses her grip. */
const SPIDER_POISE = 9;
/** Blows it takes to part her thread. */
const THREAD_HP = 4;
/** How high she hangs, measured from the floor to her middle. */
const HANG = 210;
/** How long a patch of silk lies on the floor. */
const WEB_LIFE = 4.5;
const WEB_W = 60;
/** Spiderlings and eggs together, at most. */
const MAX_BROOD = 4;
/**
 * The lash at a hero level with her on a ledge: front legs up for LASH_WIND,
 * then a sweep across the ledge. Up there she used to have no answer at all -
 * silk does not wound, her young cannot climb, her swing misses the ledges -
 * while she hung within a blade's length of him: measured with a reader that
 * knew the ledges, 23 s and one heart, against sixteen for one who did not.
 */
const LASH_WIND = 0.6;
const LASH_TIME = 0.22;
/** How far in front of her the sweep reaches, from her middle. */
const LASH_REACH = 96;
/** Height of her middle above the floor, standing. */
const GROUND = 30;
/** Where the thread leaves her back, above her middle, while she hangs. */
const SPINNERET = 50;

type SpiderState =
  | 'dormant'
  | 'descend'
  | 'hang'
  | 'webWind'
  | 'broodWind'
  | 'dropWind'
  | 'drop'
  | 'grounded'
  | 'climb'
  | 'swingWind'
  | 'swing'
  | 'lashWind'
  | 'lash'
  | 'fall'
  | 'stunned'
  | 'righting'
  | 'dying';

interface Patch {
  x: number;
  life: number;
}

interface Egg {
  x: number;
  y: number;
  vy: number;
  t: number;
  landed: boolean;
}

/**
 * Arachna, die Netzkönigin - the spider the crystal caves belong to, hanging
 * on a thread from the roof of her chamber with a crystal burning in her back.
 *
 * Up on her thread she is out of a sword's reach from the floor, and the fight
 * is about the two ways down - hers and the hero's:
 *
 *   Netzschuss  - she spits balls of silk that come down around the hero. Where
 *                 one lands the floor is sticky for a while: slow to run
 *                 through, low to jump out of. A swing cuts a patch away.
 *   Sturzbiss   - her shadow gathers on the floor under the hero, she draws up
 *                 her legs, and drops. Out of the shadow. Where she lands she
 *                 has to sit a moment before she can climb again - the window.
 *   Brut        - egg sacs, dropped onto the floor; what hatches skitters at
 *                 the hero. A swing pops a sac before it hatches.
 *   Pendel      - from half health on she swings across the chamber on her
 *                 thread, low enough to need jumping.
 *
 * And the hero's way: the ledges put him level with her. Hit her up there and
 * she loses her grip; hit the thread above her and it parts. Either way she
 * comes down on her back with her legs in the air, which is the long window.
 */
export class Spider extends Enemy {
  private state: SpiderState = 'dormant';
  private timer = 0;
  /** Her middle. */
  private bx = 0;
  private by = 0;
  private bvy = 0;
  /** Where her thread is fixed to the roof. */
  private anchorX = 0;
  private floorY = 0;
  private ceilingY = 0;
  private arenaLeft = 0;
  private arenaRight = 0;
  /** 0 hanging head down, 1 standing, 2 on her back. Eased between. */
  private pose = 0;
  private poseTarget = 0;
  /** Legs drawn in, 0..1: the tell before a drop. */
  private tuck = 0;
  /** The crystal in her back, the tell before silk. */
  private glowCore = 0;
  private threadHp = THREAD_HP;
  private poise = SPIDER_POISE;
  private poiseMax = SPIDER_POISE;
  private struck: 'body' | 'thread' | number | null = null;
  private dropX = 0;
  private hitThisMove = false;
  private lastMove = '';
  private phaseTwo = false;
  private threadFlash = 0;
  private readonly patches: Patch[] = [];
  private readonly eggs: Egg[] = [];
  private readonly webs: Projectile[] = [];
  /** Pendulum: the angle from straight down, and its speed. */
  private swingAngle = 0;
  private swingSpeed = 0;
  private swingLength = 0;
  private crossed = false;
  private walk = 0;
  /** The side the lash goes to, and how far up the legs are for it. */
  private lashDir: 1 | -1 = 1;
  private lashRaise = 0;

  override castLight = false;

  constructor(x: number, y: number) {
    super('spider', x, y);
    this.w = 56;
    this.h = 60;
    this.hp = this.maxHp = SPIDER_HP;
    this.scoreValue = 1000;
    this.aggroRange = 460;
    this.contactDamage = 0;
  }

  get phase(): 1 | 2 {
    return this.phaseTwo ? 2 : 1;
  }

  override barName(): string {
    return 'ARACHNA   ·   DIE NETZKÖNIGIN';
  }

  override barPhase(): number {
    return this.phase;
  }

  private get haste(): number {
    return this.phaseTwo ? 0.8 : 1;
  }

  protected override deathColor(): string {
    return '#8fe8ff';
  }

  /** Up on her thread, rather than down on the floor or falling. */
  private get aloft(): boolean {
    return (
      this.state === 'hang' ||
      this.state === 'webWind' ||
      this.state === 'broodWind' ||
      this.state === 'dropWind' ||
      this.state === 'descend' ||
      this.state === 'swingWind' ||
      this.state === 'lashWind'
    );
  }

  private bodyRect(): Rect {
    // Swinging, she rolls up into a ball: something to jump, not a wall.
    if (this.state === 'swing') return { x: this.bx - 24, y: this.by - 24, w: 48, h: 48 };
    const upright = this.pose > 0.5;
    const w = upright ? 92 : 64;
    const h = upright ? 56 : 84;
    return { x: this.bx - w / 2, y: this.by - h / 2, w, h };
  }

  /** The thread, where a blade can find it: straight up out of her back. */
  private threadRect(): Rect | null {
    if (!this.aloft || this.state === 'swingWind' || this.state === 'descend') return null;
    const top = this.ceilingY;
    const bottom = this.by - SPINNERET + 4;
    if (bottom - top < 10) return null;
    return { x: this.anchorX - 6, y: top, w: 12, h: bottom - top };
  }

  private eggRect(egg: Egg): Rect {
    return { x: egg.x - 10, y: egg.y - 12, w: 20, h: 22 };
  }

  /* ------------------------------------------------------------ targeting */

  override overlaps(r: Rect): boolean {
    this.struck = null;
    if (this.state === 'dormant' || this.state === 'dying') return false;
    if (rectsOverlap(this.bodyRect(), r)) {
      this.struck = 'body';
      return true;
    }
    const thread = this.threadRect();
    if (thread && rectsOverlap(thread, r)) {
      this.struck = 'thread';
      return true;
    }
    for (const [i, egg] of this.eggs.entries()) {
      if (rectsOverlap(this.eggRect(egg), r)) {
        this.struck = i;
        return true;
      }
    }
    return false;
  }

  override hurt(amount: number, fromDir: number, world: World): void {
    void fromDir;
    if (this.dead || this.state === 'dormant' || this.state === 'dying') return;
    const part = this.struck;
    this.struck = null;
    if (part === null) return;
    if (typeof part === 'number') {
      // An egg sac, popped before it hatches.
      const egg = this.eggs[part];
      if (!egg) return;
      this.eggs.splice(part, 1);
      audio.play('splash', 1.8);
      world.particles.burst(egg.x, egg.y - 4, 14, '#cfe8d8', { speed: 140, gravity: 400 });
      return;
    }
    if (part === 'thread') {
      this.threadHp -= amount;
      this.threadFlash = 1;
      audio.play('swing', 1.7);
      world.particles.burst(this.anchorX, clamp(world.player.cy, this.ceilingY, this.by), 6, '#e6eef8', { speed: 90, gravity: 60, shape: 'spark' });
      if (this.threadHp <= 0) {
        world.particles.text(this.bx, this.by - 50, 'DER FADEN REISST!', '#e6eef8');
        this.loseGrip(world);
      }
      return;
    }
    this.hp -= amount;
    this.flash = 1;
    audio.play('bossHit', 1.25);
    world.particles.burst(this.bx, this.by, 10, '#7fd9c8', { speed: 170, gravity: 400 });
    if (this.hp <= 0) {
      this.beginDying(world);
      return;
    }
    if (!this.phaseTwo && this.hp <= this.maxHp / 2) {
      this.phaseTwo = true;
      audio.play('phase', 1.3);
      audio.play('screech', 0.8);
      world.camera.addShake(5);
    }
    if (this.aloft) {
      this.poise -= amount;
      if (this.poise <= 0 && this.poiseLock <= 0) {
        world.particles.text(this.bx, this.by - 50, 'SIE VERLIERT DEN HALT!', '#e6eef8');
        this.loseGrip(world);
      }
    }
  }

  /** A parry catches her coming down, and puts her on her back - or tears her off the thread mid-lash. */
  override onParried(world: World): void {
    if (this.dead) return;
    if (this.state === 'drop') this.land(world, true);
    else if (this.state === 'lash') this.lashParried(world);
  }

  private lashParried(world: World): void {
    world.particles.text(this.bx, this.by - 50, 'PARIERT — SIE STÜRZT!', '#e6eef8');
    audio.play('clank', 1.2);
    this.loseGrip(world);
  }

  /** Off the thread, and down. */
  private loseGrip(world: World): void {
    this.state = 'fall';
    this.poise = this.poiseMax;
    this.poiseLock = 4.5;
    this.threadHp = THREAD_HP;
    this.bvy = 60;
    this.poseTarget = 2;
    audio.play('screech', 1.1);
    world.camera.addShake(4);
  }

  private beginDying(world: World): void {
    this.hp = 0;
    this.state = 'dying';
    this.timer = 2.4;
    this.bvy = 0;
    this.poseTarget = 2;
    this.patches.length = 0;
    this.eggs.length = 0;
    audio.play('screech', 0.6);
    audio.play('bossDown', 1.1);
    world.camera.addShake(8);
    world.hitStop(0.14);
  }

  /** Her body hurts only while it is moving at the hero. */
  override touchPlayer(world: World): void {
    const p = world.player;
    if (this.dead || p.dead || p.isInvulnerable) return;
    if (this.state !== 'swing' || this.hitThisMove) return;
    if (!rectsOverlap(this.bodyRect(), p.rect)) return;
    this.hitThisMove = true;
    p.hurt(2, sign(p.cx - this.bx) || 1, world);
  }

  /* --------------------------------------------------------------- update */

  override update(dt: number, world: World): void {
    this.updateCommon(dt);
    const player = world.player;
    this.threadFlash = Math.max(0, this.threadFlash - dt * 4);
    this.glowCore = Math.max(0, this.glowCore - dt * 1.5);
    this.pose = approach(this.pose, this.poseTarget, dt * 7);
    if (this.state !== 'lashWind' && this.state !== 'lash') this.lashRaise = approach(this.lashRaise, 0, dt * 4);

    if (this.floorY === 0) this.measure(world);

    this.updateFloor(dt, world);

    switch (this.state) {
      case 'dormant': {
        const inside = player.cx > this.arenaLeft + 16 && player.cx < this.arenaRight - 16;
        if (inside && Math.abs(player.cx - this.bx) < this.aggroRange && !player.dead) {
          this.engaged = true;
          this.poise = this.poiseMax = this.sizeUpFor(world, SPIDER_POISE);
          this.state = 'descend';
          this.timer = 1.5;
          audio.play('screech', 0.7);
          world.camera.addShake(3);
        }
        break;
      }

      case 'descend':
        // Down out of the dark on her thread, legs opening.
        this.timer -= dt;
        this.by = damp(this.by, this.floorY - HANG, 2.6, dt);
        this.tuck = approach(this.tuck, 0, dt);
        if (this.timer <= 0) {
          this.state = 'hang';
          this.timer = 0.8;
        }
        break;

      case 'hang': {
        this.timer -= dt;
        // She works her way along the roof to hang over the hero.
        const want = clamp(player.cx + Math.sin(this.anim * 0.7) * 60, this.arenaLeft + 50, this.arenaRight - 50);
        this.anchorX = approach(this.anchorX, want, 95 * dt);
        this.bx = damp(this.bx, this.anchorX, 6, dt);
        this.by = damp(this.by, this.floorY - HANG + Math.sin(this.anim * 1.6) * 6, 3, dt);
        this.tuck = approach(this.tuck, 0, dt * 2);
        if (this.timer <= 0) this.chooseMove(world);
        break;
      }

      case 'webWind':
        this.timer -= dt;
        this.glowCore = 1;
        this.bx = damp(this.bx, this.anchorX, 6, dt);
        if (this.timer <= 0) {
          this.spinWeb(world);
          this.state = 'hang';
          this.timer = 1.0 * this.haste;
        }
        break;

      case 'broodWind':
        this.timer -= dt;
        this.glowCore = 0.6;
        this.by = damp(this.by, this.floorY - HANG + 30, 3, dt);
        if (this.timer <= 0) {
          const room = MAX_BROOD - this.brood(world);
          for (let i = 0; i < Math.min(2, room); i++) {
            this.eggs.push({ x: this.bx + (i === 0 ? -14 : 14), y: this.by + 20, vy: rand(-60, 0), t: 0, landed: false });
          }
          audio.play('splash', 1.4);
          this.state = 'hang';
          this.timer = 0.9 * this.haste;
        }
        break;

      case 'dropWind': {
        // She draws up, legs in, and slides over her mark. The mark follows
        // the hero for most of the warning and then holds.
        this.timer -= dt;
        if (this.timer > 0.24) this.dropX = clamp(player.cx, this.arenaLeft + 40, this.arenaRight - 40);
        this.anchorX = approach(this.anchorX, this.dropX, 520 * dt);
        this.bx = damp(this.bx, this.anchorX, 10, dt);
        this.by = damp(this.by, this.floorY - HANG - 34, 5, dt);
        this.tuck = approach(this.tuck, 1, dt * 3);
        if (this.timer <= 0) {
          this.state = 'drop';
          this.bvy = 120;
          this.hitThisMove = false;
          audio.play('dash', 0.6);
        }
        break;
      }

      case 'drop':
        this.bvy += 2600 * dt;
        this.by += this.bvy * dt;
        this.bx = damp(this.bx, this.dropX, 12, dt);
        this.tuck = approach(this.tuck, 0, dt * 6);
        if (this.by >= this.floorY - GROUND) this.land(world, false);
        break;

      case 'grounded':
        this.timer -= dt;
        this.poseTarget = 1;
        this.walk += dt * 3;
        if (this.timer <= 0) {
          this.state = 'climb';
          this.poseTarget = 0;
          audio.play('swing', 0.7);
        }
        break;

      case 'climb':
        // Back up her own thread.
        this.anchorX = this.bx;
        this.by -= 300 * dt;
        if (this.by <= this.floorY - HANG) {
          this.by = this.floorY - HANG;
          this.state = 'hang';
          this.timer = rand(0.5, 0.8) * this.haste;
        }
        break;

      case 'lashWind':
        // Two front legs up and back on the hero's side, the crystal and the
        // eyes lit: what comes next goes across the ledge.
        this.timer -= dt;
        this.glowCore = Math.max(this.glowCore, 0.5);
        this.lashRaise = approach(this.lashRaise, 1, dt / (LASH_WIND * 0.7));
        this.bx = damp(this.bx, this.anchorX, 6, dt);
        if (this.timer <= 0) {
          this.state = 'lash';
          this.timer = LASH_TIME;
          this.hitThisMove = false;
          audio.play('swing', 0.85);
        }
        break;

      case 'lash': {
        this.timer -= dt;
        this.lashRaise = approach(this.lashRaise, -1, dt / LASH_TIME * 2);
        const p = world.player;
        const reach = { x: this.lashDir > 0 ? this.bx : this.bx - LASH_REACH, y: this.by - 40, w: LASH_REACH, h: 84 };
        if (!this.hitThisMove && !p.dead && rectsOverlap(reach, p.rect) && (p.parryTimer > 0 || !p.isInvulnerable)) {
          this.hitThisMove = true;
          const guarding = p.parryTimer > 0;
          p.hurt(1, this.lashDir, world);
          // The guard reaches what is close to the hero's middle; a lash caught
          // on it at the end of its reach is read off the guard itself.
          if (guarding && p.parryTimer === 0 && p.parryFlash > 0.95 && this.state === 'lash') {
            this.lashParried(world);
            break;
          }
        }
        if (this.timer <= 0) {
          this.state = 'hang';
          this.timer = 0.9 * this.haste;
        }
        break;
      }

      case 'swingWind': {
        // Up and out to the side, the thread held taut over the middle.
        this.timer -= dt;
        const side = player.cx > this.anchorX ? -1 : 1;
        const a = side * 1.0;
        const tx = this.anchorX + Math.sin(a) * this.swingLength;
        const ty = this.ceilingY + Math.cos(a) * this.swingLength;
        this.bx = damp(this.bx, tx, 4, dt);
        this.by = damp(this.by, ty, 4, dt);
        this.tuck = approach(this.tuck, 0.6, dt * 2);
        if (this.timer <= 0) {
          this.state = 'swing';
          this.tuck = 1;
          this.swingAngle = Math.atan2(this.bx - this.anchorX, this.by - this.ceilingY);
          this.swingSpeed = 0;
          this.crossed = false;
          this.hitThisMove = false;
          audio.play('wing', 0.5);
        }
        break;
      }

      case 'swing': {
        // A pendulum, once across: past the bottom, up the far side, and
        // where it turns she lets it go and climbs.
        const g = 1900;
        this.swingSpeed += (-g / this.swingLength) * Math.sin(this.swingAngle) * dt;
        const before = this.swingAngle;
        this.swingAngle += this.swingSpeed * dt;
        this.bx = this.anchorX + Math.sin(this.swingAngle) * this.swingLength;
        this.by = this.ceilingY + Math.cos(this.swingAngle) * this.swingLength;
        if (Math.sign(before) !== Math.sign(this.swingAngle)) {
          this.crossed = true;
          audio.play('wing', 0.8);
        }
        if (this.crossed && Math.sign(this.swingSpeed) !== Math.sign(this.swingAngle)) {
          this.anchorX = this.bx;
          this.state = 'hang';
          this.timer = 0.8 * this.haste;
        }
        break;
      }

      case 'fall':
        this.bvy += 2000 * dt;
        this.by += this.bvy * dt;
        this.poseTarget = 2;
        if (this.by >= this.floorY - GROUND) {
          this.by = this.floorY - GROUND;
          this.bvy = 0;
          this.state = 'stunned';
          this.timer = 2.6;
          audio.play('slam', 0.9);
          world.camera.addShake(6);
          world.hitStop(0.06);
          world.particles.burst(this.bx, this.floorY - 4, 18, '#6a7a8a', { speed: 200, gravity: 600, angle: -Math.PI / 2, spread: 2.4 });
          world.particles.text(this.bx, this.by - 50, 'AUF DEM RÜCKEN!', '#bff2ff');
        }
        break;

      case 'stunned':
        // Legs in the air, kicking.
        this.timer -= dt;
        this.poseTarget = 2;
        this.walk += dt * 9;
        if (this.timer <= 0) {
          this.state = 'righting';
          this.timer = 0.45;
          this.poseTarget = 1;
        }
        break;

      case 'righting':
        this.timer -= dt;
        if (this.timer <= 0) {
          // A fresh line up to the roof, and back to it.
          this.anchorX = this.bx;
          this.state = 'climb';
          this.poseTarget = 0;
          audio.play('swing', 0.6);
          world.particles.burst(this.bx, this.by - 30, 8, '#e6eef8', { speed: 60, gravity: -200, shape: 'spark' });
        }
        break;

      case 'dying':
        this.timer -= dt;
        this.poseTarget = 2;
        this.walk += dt * (this.timer > 1 ? 6 : 1);
        if (this.by < this.floorY - GROUND) {
          this.bvy += 2000 * dt;
          this.by = Math.min(this.floorY - GROUND, this.by + this.bvy * dt);
        }
        if (Math.random() < 0.3) {
          world.particles.spawn({
            x: this.bx + rand(-20, 20),
            y: this.by + rand(-10, 10),
            vx: rand(-30, 30),
            vy: -rand(30, 90),
            gravity: -10,
            color: Math.random() < 0.5 ? 'rgba(140,232,255,0.8)' : 'rgba(200,220,230,0.6)',
            size: rand(2, 3.5),
            life: 0.7,
            shape: 'spark',
          });
        }
        if (this.timer <= 0) {
          world.particles.burst(this.bx, this.by, 40, '#8fe8ff', { speed: 260, gravity: 200, shape: 'spark' });
          this.die(world);
          world.onBossFelled('spider', this.bx, this.by - 50);
        }
        break;
    }

    // The game sees her where she is.
    const r = this.bodyRect();
    this.x = r.x;
    this.y = r.y;
    this.w = r.w;
    this.h = r.h;
  }

  /** Floor and roof, read out of the level once, where she stands. */
  private measure(world: World): void {
    const level = world.level;
    const tx = Math.floor(this.cx / TILE);
    let ty = Math.floor(this.bottom / TILE);
    while (ty < level.height && !level.solidAt(tx, ty)) ty++;
    this.floorY = ty * TILE;
    let cy = ty - 1;
    while (cy > 0 && !level.solidAt(tx, cy - 1)) cy--;
    this.ceilingY = cy * TILE;
    this.bx = this.cx;
    this.anchorX = this.bx;
    this.by = this.ceilingY + 40;
    // The bottom of the swing puts her middle 34 px off the floor: low enough
    // to catch anyone standing, high enough to jump with room to spare.
    this.swingLength = this.floorY - 34 - this.ceilingY;
    const arena = level.arenaAt(this.bx);
    this.arenaLeft = arena ? arena.left : this.bx - 560;
    this.arenaRight = arena ? arena.right : this.bx + 560;
  }

  /** Spiderlings out and eggs still to hatch, together. */
  private brood(world: World): number {
    return world.enemies.filter((e) => e.kind === 'spiderling' && !e.dead).length + this.eggs.length;
  }

  private chooseMove(world: World): void {
    const player = world.player;
    const onFloor = player.bottom > this.floorY - 10;
    // Up on a ledge, level with her and within her legs' reach: the lash.
    const level = Math.abs(player.cy - this.by) < 56 && Math.abs(player.cx - this.bx) < LASH_REACH + 30;
    const options = onFloor ? ['drop', 'web', 'drop', 'web'] : level ? ['lash', 'web', 'lash'] : ['web', 'web'];
    if (this.brood(world) < MAX_BROOD - 1) options.push('brood');
    if (this.phaseTwo) options.push('swing');
    const pick = options.filter((o) => o !== this.lastMove);
    const move = pick[Math.floor(Math.random() * pick.length)] ?? 'web';
    this.lastMove = move;
    switch (move) {
      case 'drop':
        this.state = 'dropWind';
        // The longest warning she has, for the move that hurts most.
        this.timer = 0.7;
        this.dropX = player.cx;
        audio.play('tellSlam', 0.85);
        break;
      case 'web':
        this.state = 'webWind';
        this.timer = 0.55;
        audio.play('tellVolley', 1.25);
        break;
      case 'brood':
        this.state = 'broodWind';
        this.timer = 0.6;
        audio.play('tellBeam', 0.7);
        break;
      case 'lash':
        this.state = 'lashWind';
        this.timer = LASH_WIND;
        this.lashDir = player.cx > this.bx ? 1 : -1;
        audio.play('tellLunge', 1.05);
        audio.play('screech', 1.5);
        break;
      case 'swing':
        this.state = 'swingWind';
        this.timer = 0.75;
        this.anchorX = clamp((this.arenaLeft + this.arenaRight) / 2 + (player.cx - (this.arenaLeft + this.arenaRight) / 2) * 0.3, this.arenaLeft + 200, this.arenaRight - 200);
        audio.play('tellLunge', 0.6);
        audio.play('screech', 1.3);
        break;
    }
  }

  /** Balls of silk, one on the hero and the rest around him. */
  private spinWeb(world: World): void {
    const player = world.player;
    const count = this.phaseTwo ? 5 : 3;
    const flight = 0.75;
    for (let i = 0; i < count; i++) {
      const spread = i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 84;
      const tx = clamp(player.cx + spread, this.arenaLeft + 20, this.arenaRight - 20);
      const vx = (tx - this.bx) / flight;
      const vy = (this.floorY - 8 - (this.by + 20)) / flight - 0.5 * 700 * flight;
      const ball = new Projectile('web', this.bx - 8, this.by + 12, vx, vy);
      world.spawnProjectile(ball);
      this.webs.push(ball);
    }
    audio.play('splash', 1.6);
    audio.play('swing', 1.2);
  }

  private land(world: World, parried: boolean): void {
    this.by = this.floorY - GROUND;
    this.bvy = 0;
    // The legs come down with her, not after her.
    this.pose = Math.max(this.pose, 0.6);
    audio.play('slam', 1.1);
    world.camera.addShake(6);
    world.particles.burst(this.bx, this.floorY - 4, 20, '#7a8a9a', { speed: 220, gravity: 700, angle: -Math.PI / 2, spread: 2.6 });
    const p = world.player;
    if (parried) {
      this.state = 'stunned';
      this.timer = 2.6;
      this.poseTarget = 2;
      this.poiseLock = 4.5;
      world.particles.text(this.bx, this.by - 50, 'AUF DEM RÜCKEN!', '#bff2ff');
      return;
    }
    if (!this.hitThisMove && !p.dead && Math.abs(p.cx - this.bx) < 54 && p.bottom > this.floorY - 70) {
      this.hitThisMove = true;
      const guarding = p.parryTimer > 0;
      p.hurt(2, sign(p.cx - this.bx) || 1, world);
      if (guarding && p.parryTimer === 0 && p.parryFlash > 0.95) {
        this.state = 'stunned';
        this.timer = 2.6;
        this.poseTarget = 2;
        this.poiseLock = 4.5;
        world.particles.text(this.bx, this.by - 50, 'AUF DEM RÜCKEN!', '#bff2ff');
        return;
      }
    }
    this.state = 'grounded';
    this.timer = 1.6 * this.haste;
    this.poseTarget = 1;
  }

  /** Silk on the floor, eggs on their way to hatching, and the webs in flight. */
  private updateFloor(dt: number, world: World): void {
    const player = world.player;
    for (let i = this.webs.length - 1; i >= 0; i--) {
      const ball = this.webs[i];
      if (!ball.dead) continue;
      this.webs.splice(i, 1);
      if (!ball.friendly && Math.abs(ball.bottom - this.floorY) < 34 && ball.cx > this.arenaLeft && ball.cx < this.arenaRight) {
        this.patches.push({ x: ball.cx, life: WEB_LIFE });
        world.particles.burst(ball.cx, this.floorY - 4, 8, '#e6eef8', { speed: 90, gravity: 300, shape: 'spark' });
      }
    }
    for (const patch of this.patches) patch.life -= dt;
    for (let i = this.patches.length - 1; i >= 0; i--) {
      const patch = this.patches[i];
      let cut = patch.life <= 0;
      // A swing through it cuts it away.
      if (!cut && player.isAttacking && rectsOverlap(player.swordRect(), { x: patch.x - WEB_W / 2, y: this.floorY - 14, w: WEB_W, h: 14 })) {
        cut = true;
        audio.play('swing', 1.8);
        world.particles.burst(patch.x, this.floorY - 6, 10, '#e6eef8', { speed: 140, gravity: 200, shape: 'spark' });
      }
      if (cut) {
        this.patches.splice(i, 1);
        continue;
      }
      if (!player.dead && player.onGround && Math.abs(player.cx - patch.x) < WEB_W / 2 + 4 && player.bottom > this.floorY - 6) {
        player.sticky = Math.max(player.sticky, 0.12);
      }
    }
    for (let i = this.eggs.length - 1; i >= 0; i--) {
      const egg = this.eggs[i];
      if (!egg.landed) {
        egg.vy += 1500 * dt;
        egg.y += egg.vy * dt;
        if (egg.y >= this.floorY - 10) {
          egg.y = this.floorY - 10;
          egg.landed = true;
          audio.play('splash', 2);
        }
        continue;
      }
      egg.t += dt;
      if (egg.t >= 2.3) {
        this.eggs.splice(i, 1);
        const young = new Spiderling(egg.x - 9, this.floorY - 12);
        young.active = true;
        world.spawnEnemy(young);
        world.particles.burst(egg.x, egg.y, 12, '#cfe8d8', { speed: 130, gravity: 400 });
        audio.play('screech', 2.2);
      }
    }
  }

  override lights(): GlowLight[] {
    const out: GlowLight[] = [];
    if (this.state === 'dormant') return out;
    out.push({ x: this.bx, y: this.by, radius: 110 + this.glowCore * 80, rgb: '120,230,255', strength: 0.6, tint: 0.35 });
    for (const patch of this.patches) out.push({ x: patch.x, y: this.floorY - 6, radius: 50, rgb: '220,232,246', strength: 0.4, tint: 0.2 });
    if (this.state === 'dropWind') out.push({ x: this.dropX, y: this.floorY - 4, radius: 70, rgb: '255,120,140', strength: 0.5, tint: 0.3 });
    return out;
  }


  /* -------------------------------------------------------------- drawing */

  override draw(ctx: CanvasRenderingContext2D): void {
    if (this.floorY === 0) return;
    this.drawPatches(ctx);
    this.drawEggs(ctx);
    if (this.state === 'dropWind' || this.state === 'drop') this.drawMark(ctx);
    this.drawThread(ctx);
    const { frame, facing } = this.frame();
    if (frame.startsWith('stand') || frame.startsWith('back') || frame === 'curl') {
      shadow(ctx, this.bx, this.floorY + 1, 96, 0.4);
    }
    const white = this.flash >= HIT_WHITE;
    withHitFlash(
      ctx,
      white ? this.flash : 0,
      (c) => drawArachna(c, frame, this.bx, this.by, facing, this.glowCore > 0.5),
      white ? { x: this.bx - 76, y: this.by - 68, w: 152, h: 132 } : undefined,
    );
  }

  /** Which of her frames this moment is, and which way the lash goes. */
  private frame(): { frame: SpiderFrame; facing: 1 | -1 } {
    const t = this.anim;
    const sway = Math.sin(t * 1.6) > 0 ? 'hang1' : 'hang0';
    const drawn = (): SpiderFrame => (this.tuck > 0.6 ? 'tuck' : this.tuck > 0.25 ? 'half' : sway);
    switch (this.state) {
      case 'dormant':
        return { frame: 'tuck', facing: 1 };
      case 'descend':
      case 'dropWind':
      case 'drop':
        return { frame: drawn(), facing: 1 };
      case 'grounded':
      case 'righting':
        return { frame: STAND[Math.floor(this.walk * 2) % 4], facing: 1 };
      case 'lashWind':
        return { frame: this.lashRaise > 0.6 ? 'lashup' : this.lashRaise > 0.2 ? 'lashmid' : sway, facing: this.lashDir };
      case 'lash':
        return { frame: 'lash', facing: this.lashDir };
      case 'swingWind':
        return { frame: this.tuck > 0.45 ? 'ball' : 'half', facing: 1 };
      case 'swing':
        return { frame: 'ball', facing: 1 };
      case 'fall':
        return { frame: this.pose < 1.5 ? 'half' : 'back0', facing: 1 };
      case 'stunned':
        // Legs in the air, kicking.
        return { frame: BACK[Math.floor(this.walk * 0.8) % 3], facing: 1 };
      case 'dying':
        return { frame: this.timer > 0.9 ? BACK[Math.floor(this.walk * 0.8) % 3] : 'curl', facing: 1 };
      default:
        return { frame: sway, facing: 1 };
    }
  }

  /** Silk on the floor, thinning out at the end of its life. */
  private drawPatches(ctx: CanvasRenderingContext2D): void {
    for (const patch of this.patches) SILK.draw(ctx, patch.life < 0.6 ? 'thin' : 'patch', patch.x, this.floorY, 15, 3);
  }

  /** Egg sacs, rocking harder and darker inside as they get ready to hatch. */
  private drawEggs(ctx: CanvasRenderingContext2D): void {
    for (const egg of this.eggs) {
      const near = egg.landed ? clamp(egg.t / 2.3, 0, 1) : 0;
      const wob = egg.landed ? Math.round(Math.sin(this.anim * (8 + near * 30)) * near) * ART : 0;
      EGG.draw(ctx, near < 0.4 ? 'e0' : near < 0.8 ? 'e1' : 'e2', egg.x + wob, egg.y + 6, 3, 7);
    }
  }

  /**
   * Where she means to come down: her shadow gathering on the floor, and a
   * ring of silk closing on it. The ring goes red once the spot has stopped
   * following the hero - from then on it is a place, not a target.
   */
  private drawMark(ctx: CanvasRenderingContext2D): void {
    const locked = this.state === 'drop' || this.timer < 0.24;
    const k = this.state === 'drop' ? 1 : clamp(1 - this.timer / 0.7, 0.15, 1);
    oval(ctx, snap(this.dropX), snap(this.floorY - 2), 26 + k * 18, 4, RAMP.slate[0]);
    floorRing(ctx, this.dropX, this.floorY - 2, 64 - k * 18, 9 - k * 2, locked ? 2 : 1, locked ? RAMP.rose[4] : RAMP.slate[6]);
  }

  /** Her thread: one pixel of silk from the roof to her back, frayed where it has been cut at. */
  private drawThread(ctx: CanvasRenderingContext2D): void {
    if (this.state === 'dormant' || this.state === 'fall' || this.state === 'stunned' || this.state === 'righting' || this.state === 'dying') return;
    if (this.state === 'grounded') return;
    const top = this.ceilingY;
    const endX = this.bx;
    const endY = this.by - SPINNERET;
    const silk = this.threadFlash > 0.5 ? RAMP.grey[7] : RAMP.slate[5];
    line4(ctx, this.anchorX, top, endX, endY, silk);
    const frayed = 1 - this.threadHp / THREAD_HP;
    if (frayed > 0) {
      // Where it has been cut at, loose fibres stand out from it.
      const midY = (top + endY) / 2;
      for (let i = 0; i < Math.round(frayed * 6); i++) {
        const y = midY + (i - 3) * 10;
        const x = this.anchorX + ((endX - this.anchorX) * (y - top)) / Math.max(1, endY - top);
        line4(ctx, x, y, x + (i % 2 ? 6 : -6), y + 4, RAMP.slate[6]);
      }
    }
  }
}

/** Above this her flash is a white silhouette (two frames of a blow); below it, nothing. */
const HIT_WHITE = 0.8;
const STAND: readonly SpiderFrame[] = ['stand0', 'stand1', 'stand2', 'stand3'];
const BACK: readonly SpiderFrame[] = ['back0', 'back1', 'back2'];


/**
 * What hatches out of her eggs: a hand-sized spider that skitters at the hero
 * and jumps the last bit. Two blows, and it is the eggs that are worth hitting.
 */
export class Spiderling extends Enemy {
  private hopTimer = rand(0.2, 0.6);
  private leg = 0;

  constructor(x: number, y: number) {
    super('spiderling', x, y);
    this.w = 18;
    this.h = 12;
    this.hp = this.maxHp = 2;
    this.scoreValue = 20;
    this.aggroRange = 500;
    this.contactDamage = 1;
  }

  protected override deathColor(): string {
    return '#7fd9c8';
  }

  override update(dt: number, world: World): void {
    this.updateCommon(dt);
    const player = world.player;
    const dx = player.cx - this.cx;
    this.vy = Math.min(760, this.vy + 1500 * dt);
    if (this.stun <= 0 && this.onGround) {
      this.facing = dx > 0 ? 1 : -1;
      this.vx = approach(this.vx, this.facing * 130, 900 * dt);
      this.hopTimer -= dt;
      if (Math.abs(dx) < 90 && this.hopTimer <= 0) {
        this.vy = -300;
        this.vx = this.facing * 210;
        this.hopTimer = rand(0.8, 1.3);
      }
      if (this.badStepAhead(world, this.facing)) this.vx = 0;
    }
    this.leg += dt * Math.abs(this.vx) * 0.12;
    this.moveAndCollide(world.level, dt);
    if (this.touchesHazard(world)) this.hurt(99, 0, world);
  }


  override draw(ctx: CanvasRenderingContext2D): void {
    const frame = this.onGround ? (['w0', 'w1', 'w2'] as const)[Math.floor(this.leg * 2) % 3] : 'w1';
    withHitFlash(ctx, this.flash >= 0.8 ? this.flash : 0, (c) => YOUNG.draw(c, frame, this.cx, this.bottom, 5, 5, this.facing > 0 ? 1 : -1), {
      x: this.cx - 16,
      y: this.bottom - 16,
      w: 32,
      h: 18,
    });
    // Its health once struck: a bar one art pixel tall over it, the lost part dark.
    if (this.hp < this.maxHp && this.hp > 0) {
      const x = snap(this.cx) - 4 * ART;
      const y = snap(this.bottom) - 9 * ART;
      ctx.fillStyle = RAMP.rose[0];
      ctx.fillRect(x, y, 8 * ART, ART);
      ctx.fillStyle = RAMP.rose[4];
      ctx.fillRect(x, y, Math.max(1, Math.round((8 * this.hp) / this.maxHp)) * ART, ART);
    }
  }
}
