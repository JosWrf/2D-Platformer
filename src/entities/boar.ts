import { audio } from '../core/audio';
import { Rect, approach, clamp, rand, rectsOverlap, sign } from '../core/math';
import { shadow, withHitFlash } from '../render/sprites';
import type { World } from '../world/context';
import { type BoarFrame, RIDGE, STARS, drawBoar, warmBoar } from './boar-art';
import { Enemy, type GlowLight } from './enemy';
import { Projectile } from './projectile';
import { ROCK } from './projectile-art';

/**
 * Health before the hero is sized up - with Gallert's core alone that is what
 * he keeps. Sixty-two, twice the thirty he was drawn with, because a dazed boar
 * takes double and a daze next to a hero who reads him is worth up to twenty
 * of it: at thirty that hero felled him in 18 to 24 s. At sixty-two it is 26 to
 * 53 s, about thirty-eight.
 */
const BOAR_HP = 62;
/**
 * Damage he takes while busy - trotting, running off, winding up - before he
 * stumbles for STAGGER. His windows take none: measured, a stumble in the
 * middle of the panting after a rock cut that window from 1.7 s to 0.9, and
 * hitting him there was the way to lose it.
 */
const BOAR_POISE = 8;
const W = 64;
const H = 40;
/**
 * How high the charge hurts: 34 px, his head down and his crest laid back in
 * the wind - a jump that clears the tusks clears the rest.
 */
const CHARGE_H = 34;
/**
 * The charge's warning, the longest in the fight for the one move that takes
 * two hearts: the hoof going back and back, dust flying, a snort, the head
 * going down and the crest standing up, and a tell on top.
 */
const SCRAPE = 0.75;
/**
 * The warning before he comes straight back off a wall in his second half: he
 * stumbles back, shakes his head - no stars - turns, and scrapes once. A hero
 * right at his tusks has to jump on its rhythm: from 0.3 s before the charge
 * to just before it.
 */
const TURN = 0.65;
/** Up on his hind legs before the stomp. */
const REAR = 0.6;
/** Tusks in the dirt before the rock. */
const DIG = 0.6;
/**
 * The run: 150 px/s, climbing to 420 in a quarter of a second. Measured with a
 * normal jump taken at a spread of distances, it clears him from 40 to 190 px
 * out - a third of a second of timing at full tilt; at 20 it is late, at 230
 * it comes down on him.
 */
const CHARGE_START = 150;
const CHARGE_ACCEL = 1100;
const CHARGE_TOP = 420;
/** The one move in the fight that takes two hearts. */
const CHARGE_DAMAGE = 2;
/** Seconds he stands dazed against the wall, taking double. */
const DAZE = 2.2;
/** And after a parried charge, which stops him dead wherever he is. */
const PARRY_DAZE = 2.6;
/**
 * The windows after the stomp and the rock: head low, flanks heaving, at sword
 * height, where the move left him. Neither hurries in his second half.
 */
const AFTER_STOMP = 1.6;
const AFTER_TOSS = 1.7;
const STAGGER = 0.9;
/** His trot, against the hero's 235: a hero who wants to can always catch him. */
const TROT = 120;
/** Off to get a run at him, before a charge or a rock from too close. */
const RUN_OFF = 250;
/**
 * The stomp's ridges of earth: 290 px/s for 0.72 s, so about 210 px each way,
 * and 20 px high - a jump clears one, a plank is out of their way.
 */
const WAVE_SPEED = 290;
const WAVE_LIFE = 0.72;
const WAVE_W = 24;
const WAVE_H = 20;
/** How often, in his second half, a wall that allows it sends him straight back. */
const BOUNCE_CHANCE = 0.5;
const INTRO = 1.4;
const DYING = 2.3;

type BoarState =
  | 'dormant'
  | 'intro'
  | 'trot'
  | 'runoff'
  | 'scrape'
  | 'charge'
  | 'turn'
  | 'dazed'
  | 'rear'
  | 'dig'
  | 'recover'
  | 'stagger'
  | 'dying';

type Move = 'charge' | 'stomp' | 'rock';

/**
 * A rock on its way up, still his: it only becomes a thrown thing - one that
 * hurts, and that a blade can turn - at the top of its arc. Thrown as a rock
 * from his snout, it went up through a hero walking in to meet him, or standing
 * on a plank above him, a sixth of a second after it left: measured, five of
 * the six hearts a hero who read him lost in six fights went to a rising rock.
 * Now it comes down where the hero stood when it was thrown, and nowhere else.
 */
interface Lob {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
}

/** A ridge of earth thrown up by the stomp, running along the floor. */
interface Wave {
  x: number;
  dir: 1 | -1;
  life: number;
  hit: boolean;
}

/**
 * Grimmzahn, der Keiler - the boar of the forest den, all bristle and mud and
 * tusk, and the second boss of the road, right after Gallert.
 *
 * The rule of the fight is the rule of every boar: Lass ihn gegen die Wand
 * laufen. Nothing on him is armour - a blade that reaches him finds him - but
 * outside a daze he is quick and he hits hard, and his charge only ends at a
 * wall:
 *
 *   Ansturm   - he scrapes the floor with a hoof (SCRAPE) and comes, faster
 *               and faster, until the wall of the den stops him. Two hearts if
 *               he catches the hero - the only move that takes two. Jump him,
 *               or stand on a plank. The wall leaves him dazed for 2.2 s, stars
 *               round his head, BENOMMEN!, and dazed he takes double. Parried,
 *               he stops dead where he is and stands dazed for 2.6.
 *   Stampfer  - he rears up (REAR) and slams down, and a ridge of earth runs
 *               along the floor each way. Jump the one coming at you.
 *   Steinwurf - he digs his tusks into the floor (DIG) and flings a rock on a
 *               high arc at where the hero stands. It only hurts coming down,
 *               and a swing bats it away; walking on is enough.
 *
 * After the stomp and the rock he stands panting, open, for a second and a
 * half and more. Between moves he trots at a respectful distance, and nothing
 * about him hurts that is not coming at the hero - not a trot, not a boar
 * standing dazed or panting with a hero in his bristles.
 *
 * From half health on he now and then shakes a wall off and charges straight
 * back (TURN) - but never twice running: the charge after one that came back
 * always ends in a daze.
 *
 * Measured with a hero who sees him 0.3 s late, as a player does, swings only
 * from the floor and jumps only to get out of the way: felled in 26 to 53 s,
 * about thirty-eight, and in forty fights not one of his seven hearts lost -
 * the boar was open, dazed or panting or stumbling, for two fifths of each. A
 * hero who stands still where he is loses thirteen or fourteen hearts in forty
 * seconds, wherever he stands.
 */
export class Boar extends Enemy {
  private state: BoarState = 'dormant';
  private timer = 0;
  private floorY = 0;
  private arenaLeft = 0;
  private arenaRight = 0;
  private poise = BOAR_POISE;
  private poiseMax = BOAR_POISE;
  private phaseTwo = false;
  private struck: 'head' | 'body' | null = null;
  private lastMove = '';
  /** The moves left in this round. See drawMove. */
  private bag: Move[] = [];
  /** How fast the running charge is going. */
  private speed = 0;
  /** Seconds the running charge has lasted. */
  private run = 0;
  private hitThisCharge = false;
  /** The last charge came off the wall without a daze; the next one cannot. */
  private bounced = false;
  /** How far he keeps from the hero while he trots. */
  private keep = 220;
  /** Where a run-off is headed, and what he does when he gets there. */
  private runTo = 0;
  private runThen: 'charge' | 'rock' = 'charge';
  private turned = false;
  private readonly waves: Wave[] = [];
  private readonly lobs: Lob[] = [];
  /* Animation. */
  private gait = 0;
  private lower = 0;
  private rearUp = 0;
  private dig = 0;
  private bristle = 0;
  private eyeHeat = 0;
  private slamPose = 0;
  private fall = 0;

  override castLight = false;

  constructor(x: number, y: number) {
    super('boar', x, y);
    this.w = W;
    this.h = H;
    this.hp = this.maxHp = BOAR_HP;
    this.scoreValue = 800;
    this.aggroRange = 560;
    this.contactDamage = 0;
    this.facing = -1;
    // He keeps to the floor of his den: the planks are the hero's.
    this.ignorePlatforms = true;
  }

  get phase(): 1 | 2 {
    return this.phaseTwo ? 2 : 1;
  }

  override barName(): string {
    return 'GRIMMZAHN   ·   DER KEILER';
  }

  override barPhase(): number {
    return this.phase;
  }

  protected override deathColor(): string {
    return '#8a6448';
  }

  private get haste(): number {
    return this.phaseTwo ? 0.85 : 1;
  }

  /** Head and tusks: a little past the front of the body, where the blade meets him first. */
  private headRect(): Rect {
    return { x: this.facing > 0 ? this.x + this.w - 22 : this.x - 6, y: this.bottom - 38, w: 28, h: 34 };
  }

  /**
   * What a charge hurts with: head, tusks and shoulders, CHARGE_H high - not
   * the rump, which only ever moves away from whoever stands at it.
   */
  private chargeRect(): Rect {
    return { x: this.facing > 0 ? this.x + 20 : this.x + 3, y: this.bottom - CHARGE_H, w: this.w - 23, h: CHARGE_H };
  }

  private waveRect(w: Wave): Rect {
    return { x: w.x - WAVE_W / 2, y: this.floorY - WAVE_H, w: WAVE_W, h: WAVE_H };
  }

  /** Roughly where his snout is, for the breath and the dirt. */
  private snout(): { x: number; y: number } {
    return {
      x: this.cx + this.facing * (66 - this.rearUp * 22),
      y: this.bottom - 36 + this.lower * 8 + this.dig * 10 - this.rearUp * 52,
    };
  }

  /* ------------------------------------------------------------ targeting */

  /**
   * All of him counts, from his first squeal to his last: nothing on a boar
   * is armour. Which part the blade met only decides where the bristles fly.
   */
  override overlaps(r: Rect): boolean {
    this.struck = null;
    if (this.state === 'dormant' || this.state === 'intro' || this.state === 'dying') return false;
    if (rectsOverlap(this.headRect(), r)) {
      this.struck = 'head';
      return true;
    }
    if (rectsOverlap(this.rect, r)) {
      this.struck = 'body';
      return true;
    }
    return false;
  }

  /**
   * Dazed, double - the wall's, or a parry's - and the gold sparks say so. A
   * parry's own knock (it reaches him without overlaps, struck null) counts
   * like any blow.
   */
  override hurt(amount: number, fromDir: number, world: World): void {
    const part = this.struck;
    this.struck = null;
    if (this.dead || this.state === 'dormant' || this.state === 'intro' || this.state === 'dying') return;
    const dazed = this.state === 'dazed';
    this.hp -= dazed ? amount * 2 : amount;
    this.flash = 1;
    audio.play('bossHit', dazed ? 0.8 : 1.05);
    const head = part === 'head';
    const hx = head ? this.cx + this.facing * 26 : this.cx - this.facing * 6;
    const hy = this.bottom - (head ? 22 : 24);
    world.particles.burst(hx, hy, dazed ? 16 : 9, dazed ? '#ffe27a' : '#b88a62', { speed: dazed ? 210 : 160, gravity: 380 });
    if (this.hp <= 0) {
      this.beginDying(world);
      return;
    }
    if (!this.phaseTwo && this.hp <= this.maxHp / 2) {
      this.phaseTwo = true;
      audio.play('phase', 0.8);
      audio.play('bossRoar', 0.75);
      world.camera.addShake(6);
      world.particles.burst(this.snout().x, this.snout().y, 18, 'rgba(230,236,240,0.7)', { speed: 160, gravity: -60, size: 4 });
    }
    // Windows take no poise: a stumble that cut one short would make hitting
    // him the way to lose it. A running charge carries through whatever lands
    // on it. What is left is a boar busy with something else.
    if (dazed || this.state === 'recover' || this.state === 'charge' || this.state === 'stagger') return;
    this.poise -= amount;
    if (this.poise <= 0 && this.poiseLock <= 0) this.stumble(world, fromDir);
  }

  override onParried(world: World): void {
    if (this.state === 'charge') this.parried(world);
  }

  /** A charge caught on the hero's guard stops dead, and so does he. */
  private parried(world: World): void {
    this.vx = -this.facing * 40;
    this.bounced = false;
    audio.play('clank', 0.7);
    audio.play('crumble', 1.1);
    world.camera.addShake(7);
    world.hitStop(0.1);
    this.daze(world, PARRY_DAZE);
  }

  private daze(world: World, seconds: number): void {
    this.state = 'dazed';
    this.timer = seconds;
    this.speed = 0;
    this.poise = this.poiseMax;
    audio.play('screech', 1.35);
    world.particles.text(this.cx, this.y - 26, 'BENOMMEN!', '#ffe27a');
  }

  private stumble(world: World, fromDir: number): void {
    this.state = 'stagger';
    this.timer = STAGGER;
    this.poise = this.poiseMax;
    this.poiseLock = 4;
    this.vx = fromDir * 80;
    this.rearUp = 0;
    this.dig = 0;
    audio.play('screech', 1.6);
    world.particles.burst(this.cx, this.bottom - 4, 12, '#7a6248', { speed: 140, gravity: 500, angle: -Math.PI / 2, spread: 2.2 });
  }

  private wake(world: World): void {
    this.engaged = true;
    this.poise = this.poiseMax = this.sizeUpFor(world, BOAR_POISE);
    this.state = 'intro';
    this.timer = INTRO;
    this.facing = world.player.cx > this.cx ? 1 : -1;
    audio.play('rumble', 0.7);
    world.camera.addShake(4);
  }

  /** Starts his fall, from whatever he is doing. Ends in die and onBossFelled. */
  beginDying(world: World): void {
    if (this.dead || this.state === 'dying') return;
    this.hp = 0;
    this.state = 'dying';
    this.timer = DYING;
    this.vx = 0;
    this.speed = 0;
    this.waves.length = 0;
    this.lobs.length = 0;
    this.rearUp = 0;
    this.dig = 0;
    audio.play('screech', 0.8);
    audio.play('bossRoar', 0.6);
    world.camera.addShake(8);
    world.hitStop(0.14);
  }

  /**
   * Only what moves hurts: the charge, and the earth the stomp throws up. A
   * boar standing, trotting, dazed or panting is no harm to walk into.
   */
  override touchPlayer(world: World): void {
    const p = world.player;
    if (this.dead || p.dead) return;
    for (const w of this.waves) {
      if (w.hit || w.life <= 0 || !rectsOverlap(this.waveRect(w), p.rect)) continue;
      if (p.parryTimer <= 0 && p.isInvulnerable) continue;
      w.hit = true;
      p.hurt(1, w.dir, world);
    }
    if (this.state !== 'charge' || this.hitThisCharge || !rectsOverlap(this.chargeRect(), p.rect)) return;
    const guarding = p.parryTimer > 0;
    if (!guarding && p.isInvulnerable) return;
    this.hitThisCharge = true;
    // From the way he is running: the guard that turns him faces him.
    p.hurt(CHARGE_DAMAGE, this.facing, world);
    // The guard only reaches what stands within sixty pixels of the hero's
    // middle; a charge caught on it is often a little further off than that.
    if (guarding && p.parryTimer === 0 && p.parryFlash > 0.95 && this.state === 'charge') this.parried(world);
  }

  /* --------------------------------------------------------------- update */

  /** All his frames worked out (see warmBoar). */
  private ready = false;

  override update(dt: number, world: World): void {
    // His frames are worked out a little at a time from the moment he is in
    // view, long before the fight needs them.
    if (!this.ready) this.ready = warmBoar(2);
    this.updateCommon(dt);
    const p = world.player;
    if (this.arenaRight === 0) {
      const arena = world.level.arenaAt(this.cx);
      this.arenaLeft = arena ? arena.left : this.cx - 540;
      this.arenaRight = arena ? arena.right : this.cx + 540;
      this.floorY = this.bottom;
    }
    if (this.onGround) this.floorY = this.bottom;
    this.updateWaves(dt, world);
    this.updateLobs(dt, world);
    this.eyeHeat = Math.max(0, this.eyeHeat - dt * 2);
    this.slamPose = Math.max(0, this.slamPose - dt * 3);
    this.bristle = Math.max(0, this.bristle - dt * 1.5);
    const dx = p.cx - this.cx;
    const dist = Math.abs(dx);
    let lowerTo = 0;

    switch (this.state) {
      case 'dormant': {
        const inside = p.cx > this.arenaLeft + 16 && p.cx < this.arenaRight - 16;
        if (inside && dist < this.aggroRange && !p.dead) this.wake(world);
        else if (world.time % 1.7 < dt) this.breathe(world, 1);
        break;
      }

      case 'intro': {
        // Up out of his wallow, a shake of the bristles, and a squeal at the
        // one who woke him.
        const before = this.timer;
        this.timer -= dt;
        if (before > 0.7 && this.timer <= 0.7) {
          audio.play('bossRoar', 0.7);
          world.camera.addShake(5);
          this.breathe(world, 6);
          this.bristle = 1;
          this.eyeHeat = 1;
        }
        if (this.timer <= 0) this.toTrot(0.5);
        break;
      }

      case 'trot': {
        this.timer -= dt;
        const want = this.trotSpot(p.cx);
        const diff = want - this.cx;
        const speed = TROT * (this.phaseTwo ? 1.15 : 1);
        this.vx = approach(this.vx, Math.abs(diff) > 12 ? sign(diff) * speed : 0, 700 * dt);
        if (Math.abs(diff) > 70) this.facing = diff > 0 ? 1 : -1;
        else if (Math.abs(diff) < 30) this.facing = dx > 0 ? 1 : -1;
        if (world.time % 0.6 < dt) this.breathe(world, 1);
        if (this.timer <= 0) this.chooseMove(world);
        break;
      }

      case 'runoff': {
        // Off to get a run at him: wheel round, and away.
        const diff = this.runTo - this.cx;
        this.facing = diff > 0 ? 1 : -1;
        this.vx = approach(this.vx, sign(diff) * RUN_OFF, 1400 * dt);
        this.timer -= dt;
        if (Math.abs(diff) < 16 || this.timer <= 0) {
          if (this.runThen === 'rock') this.beginDig(world);
          else this.beginScrape(world);
        }
        break;
      }

      case 'scrape':
        // The hoof goes back, and back again, and the dust flies: the charge.
        this.timer -= dt;
        this.vx = approach(this.vx, 0, 1400 * dt);
        lowerTo = 0.55;
        this.bristle = 1;
        this.eyeHeat = 1;
        if (world.time % 0.05 < dt) this.kickDust(world);
        if (world.time % 0.26 < dt) {
          audio.play('crumble', 1.9);
          this.breathe(world, 2);
        }
        if (this.timer <= 0) this.beginCharge(world);
        break;

      case 'charge':
        this.run += dt;
        this.speed = Math.min(CHARGE_TOP, this.speed + CHARGE_ACCEL * dt);
        this.vx = this.facing * this.speed;
        lowerTo = 1;
        // The crest lies back in the wind of it: he is no taller than his
        // head, and a jump that clears the head clears the rest.
        this.bristle = Math.min(this.bristle, 0.3);
        this.eyeHeat = 1;
        if (world.time % 0.03 < dt) {
          world.particles.spawn({
            x: this.cx - this.facing * rand(10, 34),
            y: this.bottom - 3,
            vx: -this.facing * rand(30, 120),
            vy: -rand(20, 90),
            gravity: 240,
            color: Math.random() < 0.5 ? 'rgba(150,120,90,0.6)' : 'rgba(110,90,70,0.5)',
            size: rand(2.5, 4.5),
            life: 0.45,
            shape: 'circle',
          });
        }
        break;

      case 'turn': {
        // Off the wall, a shake of the head, and round he comes - no stars.
        const before = this.timer;
        this.timer -= dt;
        this.vx = approach(this.vx, 0, 500 * dt);
        if (!this.turned && before > TURN - 0.15 && this.timer <= TURN - 0.15) {
          this.turned = true;
          this.facing = this.facing > 0 ? -1 : 1;
          this.breathe(world, 6);
        }
        lowerTo = this.turned ? 0.55 : 0.2;
        this.bristle = 1;
        this.eyeHeat = 1;
        if (this.turned && world.time % 0.05 < dt) this.kickDust(world);
        if (this.timer <= 0) this.beginCharge(world);
        break;
      }

      case 'dazed':
        this.timer -= dt;
        this.vx = approach(this.vx, 0, 400 * dt);
        lowerTo = 0.25;
        if (this.timer <= 0) this.toTrot(rand(0.5, 0.8) * this.haste);
        break;

      case 'rear':
        this.timer -= dt;
        this.vx = approach(this.vx, 0, 1400 * dt);
        this.rearUp = approach(this.rearUp, 1, dt / (REAR * 0.6));
        this.eyeHeat = 1;
        this.bristle = 1;
        if (this.timer <= 0) this.slam(world);
        break;

      case 'dig':
        this.timer -= dt;
        this.vx = approach(this.vx, 0, 1400 * dt);
        this.dig = approach(this.dig, 1, dt * 4);
        this.eyeHeat = 0.8;
        if (world.time % 0.05 < dt) this.throwDirt(world);
        if (this.timer <= 0) this.toss(world);
        break;

      case 'recover':
        // Head low, flanks heaving, steaming: the window.
        this.timer -= dt;
        this.vx = approach(this.vx, 0, 900 * dt);
        lowerTo = 0.2;
        if (world.time % 0.35 < dt) this.breathe(world, 2);
        if (this.timer <= 0) this.toTrot(rand(0.7, 1.1) * this.haste);
        break;

      case 'stagger':
        this.timer -= dt;
        this.vx = approach(this.vx, 0, 500 * dt);
        if (this.timer <= 0) this.toTrot(0.5);
        break;

      case 'dying':
        this.timer -= dt;
        this.vx = approach(this.vx, 0, 600 * dt);
        this.fall = approach(this.fall, 1, dt * 1.6);
        if (this.timer <= 0) {
          this.die(world);
          world.onBossFelled('boar', this.cx, this.y - 30);
        }
        break;
    }

    this.lower = approach(this.lower, lowerTo, dt * (lowerTo > this.lower ? 5 : 3));
    if (this.state !== 'rear') this.rearUp = approach(this.rearUp, 0, dt * 7);
    if (this.state !== 'dig') this.dig = approach(this.dig, 0, dt * 5);
    this.gait += (dt * Math.abs(this.vx)) / 9;

    this.vy += 1400 * dt;
    this.moveAndCollide(world.level, dt);
    this.x = clamp(this.x, this.arenaLeft, this.arenaRight - this.w);
    if (this.state === 'charge') {
      const wall = this.facing > 0 ? this.x + this.w >= this.arenaRight - 0.5 || this.touching.right : this.x <= this.arenaLeft + 0.5 || this.touching.left;
      if (wall || this.run > 4) this.crash(world);
    }
  }

  private toTrot(seconds: number): void {
    this.state = 'trot';
    this.timer = seconds;
    this.keep = rand(200, 250);
  }

  /** Where he trots to: a respectful distance off, on his own side if there is room. */
  private trotSpot(heroX: number): number {
    const lo = this.arenaLeft + W / 2 + 10;
    const hi = this.arenaRight - W / 2 - 10;
    const side = this.cx < heroX ? -1 : 1;
    let want = heroX + side * this.keep;
    if (want < lo || want > hi) want = heroX - side * this.keep;
    return clamp(want, lo, hi);
  }

  private chooseMove(world: World): void {
    const p = world.player;
    const dist = Math.abs(p.cx - this.cx);
    this.facing = p.cx > this.cx ? 1 : -1;
    // Up on the planks only a rock reaches him - and not from right under
    // him, where it would go straight up through the plank: off a way first,
    // so it comes on an arc he can see.
    if (p.bottom < this.floorY - 40) {
      if (dist < 150) this.runOff(p.cx, 230, 'rock');
      else this.beginDig(world);
      return;
    }
    const move = this.drawMove(dist);
    if (move === 'stomp') this.beginRear();
    else if (dist < (move === 'charge' ? 200 : 150)) this.runOff(p.cx, move === 'charge' ? 290 : 230, move);
    else if (move === 'charge') this.beginScrape(world);
    else this.beginDig(world);
  }

  /**
   * The next move of this round. A round is two charges, a stomp and a rock,
   * shuffled, so every one of them comes up whatever the hero does: drawn by
   * distance alone, a hero who stayed close never saw a rock - in two and a
   * half minutes, measured, seventeen charges, fourteen stomps and not one
   * rock. The stomp is only for a hero close by; further off it waits in the
   * bag. Never the same move twice running, across rounds too, except the
   * charge, which is half of every round.
   */
  private drawMove(dist: number): Move {
    if (this.bag.length === 0) {
      this.bag = ['charge', 'charge', 'stomp', 'rock'];
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
      const top = this.bag.length - 1;
      if (this.bag[top] === this.lastMove && this.lastMove !== 'charge') [this.bag[0], this.bag[top]] = [this.bag[top], this.bag[0]];
    }
    let i = this.bag.length - 1;
    if (this.bag[i] === 'stomp' && dist > 220) {
      const other = this.bag.findIndex((m) => m !== 'stomp');
      if (other < 0) return 'charge';
      i = other;
    }
    return this.bag.splice(i, 1)[0] ?? 'charge';
  }

  /** Off to get some room first: wheel round and away, then the move. */
  private runOff(heroX: number, room: number, then: 'charge' | 'rock'): void {
    const lo = this.arenaLeft + W / 2 + 10;
    const hi = this.arenaRight - W / 2 - 10;
    const dir = hi - heroX > heroX - lo ? 1 : -1;
    this.runTo = clamp(heroX + dir * room, lo, hi);
    this.runThen = then;
    this.state = 'runoff';
    this.timer = 1.6;
    audio.play('jump', 0.45);
  }

  private beginRear(): void {
    this.lastMove = 'stomp';
    this.state = 'rear';
    this.timer = REAR;
    audio.play('tellSlam', 1.1);
    audio.play('bossRoar', 1.35);
  }

  private beginDig(world: World): void {
    this.facing = world.player.cx > this.cx ? 1 : -1;
    this.lastMove = 'rock';
    this.state = 'dig';
    this.timer = DIG;
    audio.play('tellVolley', 1.3);
    audio.play('crumble', 1.4);
  }

  private beginScrape(world: World): void {
    this.facing = world.player.cx > this.cx ? 1 : -1;
    this.state = 'scrape';
    this.timer = SCRAPE;
    this.lastMove = 'charge';
    audio.play('tellLunge', 0.75);
    audio.play('crumble', 1.7);
    this.breathe(world, 4);
  }

  private beginCharge(world: World): void {
    this.state = 'charge';
    this.speed = CHARGE_START;
    this.run = 0;
    this.hitThisCharge = false;
    this.vx = this.facing * this.speed;
    audio.play('dash', 0.5);
    audio.play('bossRoar', 1.2);
    world.camera.addShake(2);
  }

  /** The wall. In his second half, now and then, he shakes it off and comes straight back. */
  private crash(world: World): void {
    const wallX = this.facing > 0 ? this.x + this.w : this.x;
    this.vx = 0;
    this.speed = 0;
    audio.play('impactBoar', 0.6);
    audio.play('crumble', 0.8);
    world.camera.addShake(9);
    world.hitStop(0.08);
    world.particles.burst(wallX, this.bottom - 24, 22, '#8a7458', { speed: 240, gravity: 700, size: 4, angle: this.facing > 0 ? Math.PI : 0, spread: 2 });
    world.particles.burst(wallX, this.bottom - 30, 12, 'rgba(200,180,150,0.6)', { speed: 160, gravity: 120, size: 5, shape: 'circle' });
    if (this.phaseTwo && !this.bounced && Math.random() < BOUNCE_CHANCE) {
      this.bounced = true;
      this.state = 'turn';
      this.timer = TURN;
      this.turned = false;
      this.vx = -this.facing * 90;
      audio.play('tellLunge', 0.65);
      audio.play('bossRoar', 1.05);
      return;
    }
    this.bounced = false;
    this.daze(world, DAZE);
  }

  /** Two ridges of earth from under his hooves, one each way. */
  private slam(world: World): void {
    this.rearUp = 0;
    this.slamPose = 1;
    this.waves.push({ x: this.cx + 4, dir: 1, life: WAVE_LIFE, hit: false });
    this.waves.push({ x: this.cx - 4, dir: -1, life: WAVE_LIFE, hit: false });
    audio.play('impactBoar', 0.75);
    audio.play('burst', 0.7);
    world.camera.addShake(6);
    world.hitStop(0.04);
    for (const dir of [-1, 1]) {
      world.particles.burst(this.cx + dir * 24, this.bottom - 4, 12, '#7a6248', {
        speed: 200,
        gravity: 600,
        size: 4,
        angle: dir > 0 ? -0.5 : Math.PI + 0.5,
        spread: 1,
      });
    }
    this.state = 'recover';
    this.timer = AFTER_STOMP;
  }

  /** A rock out of the floor on his tusks, flung on an arc at where the hero stands. */
  private toss(world: World): void {
    const p = world.player;
    const ox = this.cx + this.facing * 24;
    const oy = this.bottom - 46;
    const flight = clamp(0.8 + Math.abs(p.cx - ox) / 1500, 0.85, 1.05);
    const vx = (p.cx - ox) / flight;
    const vy = (p.cy - oy) / flight - 0.5 * 900 * flight;
    this.lobs.push({ x: ox, y: oy, vx, vy, spin: 0 });
    this.dig = 0;
    this.slamPose = 0.6;
    audio.play('swing', 0.55);
    audio.play('crumble', 1.2);
    world.particles.burst(ox, this.bottom - 4, 10, '#6a5238', { speed: 160, gravity: 600, size: 3, angle: -Math.PI / 2, spread: 1.6 });
    this.state = 'recover';
    this.timer = AFTER_TOSS;
  }

  private updateWaves(dt: number, world: World): void {
    for (const w of this.waves) {
      w.life -= dt;
      w.x += w.dir * WAVE_SPEED * dt;
      if (w.x < this.arenaLeft + 8 || w.x > this.arenaRight - 8) w.life = Math.min(w.life, 0);
      if (w.life > 0 && world.time % 0.04 < dt) {
        world.particles.spawn({
          x: w.x + rand(-8, 8),
          y: this.floorY - rand(2, 10),
          vx: w.dir * rand(20, 80),
          vy: -rand(60, 160),
          gravity: 700,
          color: Math.random() < 0.5 ? '#6e5640' : '#9a8062',
          size: rand(2, 3.5),
          life: 0.4,
        });
      }
    }
    for (let i = this.waves.length - 1; i >= 0; i--) if (this.waves[i].life <= 0) this.waves.splice(i, 1);
  }

  /**
   * Up it goes, his; over the top it is let go. Integrated the way a
   * Projectile integrates itself, so it comes down where it was aimed.
   */
  private updateLobs(dt: number, world: World): void {
    for (let i = this.lobs.length - 1; i >= 0; i--) {
      const l = this.lobs[i];
      l.vy += 900 * dt;
      l.x += l.vx * dt;
      l.y += l.vy * dt;
      l.spin += dt * 9;
      if (l.vy < 0) continue;
      const rock = new Projectile('rock', l.x - 10, l.y - 10, l.vx, l.vy);
      rock.damage = 1;
      world.spawnProjectile(rock);
      this.lobs.splice(i, 1);
    }
  }

  /** Breath steaming out of the snout: n puffs. */
  private breathe(world: World, n: number): void {
    const s = this.snout();
    for (let i = 0; i < n; i++) {
      world.particles.spawn({
        x: s.x + rand(-2, 2),
        y: s.y + rand(-2, 2),
        vx: this.facing * rand(20, 70) + rand(-10, 10),
        vy: -rand(10, 40),
        gravity: -50,
        color: 'rgba(225,230,236,0.42)',
        size: rand(3, 5),
        life: rand(0.5, 0.8),
        shape: 'circle',
        drag: 0.92,
      });
    }
  }

  /** Dust off the scraping hoof, thrown back behind him. */
  private kickDust(world: World): void {
    world.particles.spawn({
      x: this.cx + this.facing * 16,
      y: this.bottom - 2,
      vx: -this.facing * rand(80, 200),
      vy: -rand(40, 140),
      gravity: 500,
      color: Math.random() < 0.5 ? 'rgba(150,122,92,0.75)' : 'rgba(110,88,66,0.7)',
      size: rand(2, 4),
      life: 0.5,
    });
  }

  /** Clods off the tusks, flying back over him. */
  private throwDirt(world: World): void {
    world.particles.spawn({
      x: this.cx + this.facing * 56,
      y: this.bottom - 4,
      vx: -this.facing * rand(40, 160),
      vy: -rand(180, 320),
      gravity: 900,
      color: Math.random() < 0.5 ? '#5e4834' : '#7a6248',
      size: rand(2.5, 4.5),
      life: 0.6,
    });
  }

  override lights(): GlowLight[] {
    const out: GlowLight[] = [];
    if (this.dead) return out;
    out.push({ x: this.cx, y: this.bottom - 44, radius: 150, rgb: '235,190,140', strength: 0.55, tint: 0.22 });
    if (this.state !== 'dormant' && this.state !== 'dying') {
      const s = this.snout();
      out.push({ x: s.x - this.facing * 28, y: s.y - 20, radius: 34 + this.eyeHeat * 44, rgb: '255,70,50', strength: 0.45 + this.eyeHeat * 0.4, tint: 0.4 });
    }
    if (this.state === 'dazed') out.push({ x: this.cx + this.facing * 36, y: this.bottom - 84, radius: 70, rgb: '255,226,122', strength: 0.6, tint: 0.35 });
    for (const w of this.waves) out.push({ x: w.x, y: this.floorY - 10, radius: 70, rgb: '230,190,130', strength: 0.6, tint: 0.3 });
    for (const l of this.lobs) out.push({ x: l.x, y: l.y, radius: 84, rgb: '200,180,160', strength: 0.8, tint: 0.34 });
    return out;
  }


  /* -------------------------------------------------------------- drawing */

  override draw(ctx: CanvasRenderingContext2D): void {
    this.drawRidges(ctx);
    const facing = this.facing > 0 ? 1 : -1;
    const frame = this.frame();
    // About to come - scraping, charging, rearing, digging, off a wall: the
    // ember of his eye goes white-hot (and its light flares, see lights()).
    const hot = this.eyeHeat > 0.5 && this.state !== 'dazed' && this.state !== 'dying' && this.state !== 'dormant';
    shadow(ctx, this.cx + this.facing * 8, this.bottom, 128, 0.38);
    // Struck: his silhouette in white for the first two frames, then himself.
    const white = this.flash >= HIT_WHITE;
    withHitFlash(
      ctx,
      white ? this.flash : 0,
      (c) => drawBoar(c, frame, this.cx, this.bottom, facing, hot),
      white ? { x: this.cx - 104, y: this.bottom - 132, w: 208, h: 136 } : undefined,
    );
    if (this.state === 'dazed') this.drawStars(ctx);
    for (const l of this.lobs) {
      const turn = ((Math.floor((l.spin * 0.5 * 8) / (Math.PI * 2)) % 8) + 8) % 8;
      ROCK.draw(ctx, `r${turn}`, l.x, l.y, 6, 6, 1);
    }
  }

  /** Which of his frames this moment of the fight is. */
  private frame(): BoarFrame {
    const t = this.anim;
    switch (this.state) {
      case 'dormant':
        // Asleep in his wallow, his flank rising and falling.
        return Math.floor(t / 0.85) % 2 ? 'sleep1' : 'sleep0';
      case 'intro':
        // Up out of the wallow, and a squeal at the one who woke him.
        return this.timer > 1 ? 'sleep0' : this.timer > 0.8 ? 'wake' : this.timer > 0.3 ? 'roar' : 'stand0';
      case 'trot':
      case 'runoff':
        if (Math.abs(this.vx) > 25) return TROT_FRAMES[Math.floor(this.gait * 0.6) % 4];
        return Math.sin(t * 3) > 0 ? 'stand0' : 'stand1';
      case 'scrape':
        return SCRAPE_FRAMES[Math.floor(t * 7.2) % 3];
      case 'charge':
        return GALLOP_FRAMES[Math.floor(this.gait * 0.26) % 4];
      case 'turn':
        // Off the wall: a shake of the head, then round, scraping.
        if (!this.turned) return Math.floor(t * 14) % 2 ? 'shake1' : 'shake0';
        return SCRAPE_FRAMES[Math.floor(t * 7.2) % 3];
      case 'dazed':
        return Math.floor(t * 3) % 2 ? 'dazed1' : 'dazed0';
      case 'rear':
        if (this.rearUp < 0.45) return 'rear0';
        return Math.floor(t * 10) % 2 ? 'rear2' : 'rear1';
      case 'dig':
        return this.dig < 0.5 ? 'dig0' : 'dig1';
      case 'recover':
        // The blow's own pose for a breath, then head low, flanks heaving.
        if (this.slamPose > 0.25) return this.lastMove === 'stomp' ? 'slam' : 'toss';
        return Math.sin(t * 9) > 0 ? 'pant0' : 'pant1';
      case 'stagger':
        return 'stagger';
      case 'dying':
        return this.fall < 0.3 ? 'fall0' : this.fall < 0.7 ? 'fall1' : 'fall2';
    }
  }

  /**
   * The ridges of earth running out from the stomp: a crest of dirt at the
   * height the ridge has, rising in, at full height while it runs, sinking
   * away at the end.
   */
  private drawRidges(ctx: CanvasRenderingContext2D): void {
    for (const w of this.waves) {
      const k = clamp(w.life / 0.2, 0, 1);
      const rise = clamp((WAVE_LIFE - w.life) / 0.06, 0, 1);
      const h = k * (0.5 + 0.5 * rise);
      const f = h > 0.8 ? 'r3' : h > 0.55 ? 'r2' : h > 0.3 ? 'r1' : 'r0';
      RIDGE.draw(ctx, f, w.x, this.floorY, 6, RIDGE_H[f], w.dir);
    }
  }

  /** Stars round the head of a dazed boar, so the window reads from across the den. */
  private drawStars(ctx: CanvasRenderingContext2D): void {
    const hx = this.cx + this.facing * 40;
    const hy = this.bottom - 84;
    for (let i = 0; i < 4; i++) {
      const a = this.anim * 4.5 + (i * Math.PI) / 2;
      const front = Math.sin(a) > 0;
      STARS.draw(ctx, front ? 'big' : 'small', hx + Math.cos(a) * 16, hy + Math.sin(a) * 4, front ? 2 : 1, front ? 2 : 1);
    }
  }
}

/** Above this his flash is a white silhouette (two frames of a blow); below it, nothing. */
const HIT_WHITE = 0.8;
const TROT_FRAMES: readonly BoarFrame[] = ['trot0', 'trot1', 'trot2', 'trot3'];
const GALLOP_FRAMES: readonly BoarFrame[] = ['gallop0', 'gallop1', 'gallop2', 'gallop3'];
const SCRAPE_FRAMES: readonly BoarFrame[] = ['scrape0', 'scrape1', 'scrape2'];
const RIDGE_H = { r0: 3, r1: 5, r2: 8, r3: 10 } as const;
