import { audio } from '../core/audio';
import { Rect, approach, clamp, rand, rectsOverlap, sign } from '../core/math';
import { ART, snap } from '../render/pixel';
import { shadow, withHitFlash } from '../render/sprites';
import type { World } from '../world/context';
import { Enemy, type GlowLight } from './enemy';
import { HOARD_W, TONGUE, WRECK, drawChest, hoardSprite, lidFrame } from './mimic-art';
import { Projectile } from './projectile';

/**
 * Health before the hero is sized up. The third boss of the run, after
 * Gallert and Grimmzahn. It went from 40 down to 32 when its windows were
 * widened, and that overshot: measured with a hero who reads it 0.3 s late,
 * 18 to 21 s and not one heart - shorter than Grimmzahn before it - and one
 * who only held the attack key felled it as fast and walked out with a heart
 * to spare. Back at 40.
 */
const MIMIC_HP = 40;
/**
 * The gold rain's longest throws are slowed to this across the floor, so the
 * coins come down steep. Thrown on a fixed 0.85 s flight, a coin aimed at a
 * hero 300 px off arrived flat and fast and swept through his whole height
 * twenty-odd pixels past where it was aimed: the gaps of the fan closed, and
 * "half a step aside" was a hit at range - measured, no safe spot at all
 * from 320 px out.
 */
const COIN_SPEED = 260;
/**
 * Damage taken in the open before the lid jams. Eleven was measured against a
 * hero who simply stood against it and swung: at eight he jammed it open every
 * other time it opened. He no longer can - a chest he clings to snaps, and its
 * windows are where it is, not where he is - so eight it is again: a hero who
 * gets to the mouth in time jams it about every third window.
 */
const MIMIC_POISE = 8;
/**
 * How long it stays open after each move: the windows. They used to be 0.85
 * to 1.15 s, and less in its second half - shorter than it takes to see one
 * open, a quarter of a second, and run the hundred pixels or more its own move
 * has just put between it and the hero. Measured with a hero who sees it that
 * late, a window was worth one swing, and the fight took over two minutes.
 */
const GAPE = { bite: 1.9, snap: 0.9, spit: 1.5, tongue: 1.7, gulp: 1.6 };
/**
 * Seconds a hero has to stand against it before it snaps. It used to snap at
 * whoever was close when it next chose a move - which, right after a window,
 * was everyone who had used the window, with 0.4 s of rattle to get out.
 * Now a hero leaving a window gets a hop back; only clinging gets the lid.
 */
const CLING = 0.9;
/** How fast its breath drags the hero across the floor, against MAX_RUN's 235. */
const GULP_PULL = 120;
/** How far the tongue reaches along the floor, from the front of the chest. */
const TONGUE_REACH = 230;
const W = 66;
const H = 48;
/** Height of the box under the lid. */
const BASE_H = 28;

type MimicState =
  | 'dormant'
  | 'intro'
  | 'hop'
  | 'biteWind'
  | 'bite'
  | 'snapWind'
  | 'snap'
  | 'gape'
  | 'spitWind'
  | 'tongueWind'
  | 'tongue'
  | 'gulpWind'
  | 'gulp'
  | 'jammed'
  | 'dying';

interface Plank {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  w: number;
  h: number;
  gold: boolean;
}

/**
 * Gierschlund, die gierige Truhe - the last thing in the temple's treasury, and
 * the thing that ate everyone who came for the rest.
 *
 * A chest that is a mouth, and the rule of the fight is the rule of a chest:
 * shut, it is a strongbox. Every blow on the lid rings and does nothing. It
 * only opens to take something, and open it is all mouth:
 *
 *   Schnappbiss  - the lid cracks, an eye lights in the gap, and it lunges with
 *                  its jaws wide. Afterwards it gapes for a breath - the window.
 *                  Parry the bite and the lid jams open.
 *   Schnapper    - whoever clings to it gets the lid: a short rattle and a
 *                  snap on the spot. Hugging a chest is how chests eat you -
 *                  using a window is not hugging it, and gets a hop back.
 *   Goldregen    - it throws its lid back and spits a fan of coins. They
 *                  come down around the hero and lie there a moment, and a
 *                  swing bats one back - and gold coming home is the one thing
 *                  it cannot keep its lid shut for.
 *   Zunge        - the tongue coils and lashes along the floor, the length of a
 *                  room. Jump it. Out there it is part of the mouth, and hurts
 *                  to hit.
 *   Gierschlucken - from half health on: it gapes and breathes in, and the
 *                  floor slides towards it. Then it bites.
 *
 * Between moves it hops after the hero with its lid shut tight, so there is
 * nothing to do about it then but keep clear and wait for it to want something.
 *
 * It was far too strong for so early a boss, and the bot it was measured with
 * could not tell: that one saw every move the frame it began. One that sees it
 * a quarter of a second late, as a player does, needed over two minutes and
 * lost eleven to fifteen hearts - its windows were shorter than seeing one and
 * running to it, the snap took whoever had used the last one, and its hops
 * came down on him. See GAPE and CLING; now the same bot needs about half a
 * minute.
 */
export class Mimic extends Enemy {
  private state: MimicState = 'dormant';
  private timer = 0;
  /** 0 shut, 1 thrown wide open. */
  private lid = 0;
  private lidTarget = 0;
  /** The keyhole, and the eye behind it: the tell. */
  private eye = 0;
  /** How far the tongue is out, in pixels from the front. */
  private tongue = 0;
  private tongueHit = false;
  private hitThisMove = false;
  private poise = MIMIC_POISE;
  private poiseMax = MIMIC_POISE;
  private lastMove = '';
  private hops = 0;
  private squash = 0;
  private phaseTwo = false;
  /** Set for the first bite of a pair in the second half. */
  private chain = false;
  /** How long the hero has stood against it, without a break. See CLING. */
  private clinging = 0;
  private struck: 'shell' | 'mouth' | 'tongue' | null = null;
  private planks: Plank[] = [];
  private arenaLeft = 0;
  private arenaRight = 0;
  private floorY = 0;
  private coinGlint = 0;
  /** Where its hoard is heaped: under where it slept, on the floor. */
  private readonly hoardX: number;
  private hoardY = 0;

  override castLight = false;
  // The hoard stays where it is while the chest hops about the vault.
  override drawReach = 760;

  constructor(x: number, y: number) {
    super('mimic', x, y);
    this.w = W;
    this.h = H;
    this.hp = this.maxHp = MIMIC_HP;
    this.scoreValue = 800;
    this.aggroRange = 300;
    this.contactDamage = 1;
    this.facing = -1;
    // It stays on the floor of its vault: a chest on a plank is a chest that
    // bites from somewhere it cannot be reached.
    this.ignorePlatforms = true;
    this.hoardX = this.cx;
  }

  get phase(): 1 | 2 {
    return this.phaseTwo ? 2 : 1;
  }

  override barName(): string {
    return 'GIERSCHLUND   ·   DIE GIERIGE TRUHE';
  }

  override barPhase(): number {
    return this.phase;
  }

  private get haste(): number {
    return this.phaseTwo ? 0.8 : 1;
  }

  protected override deathColor(): string {
    return '#f2c14e';
  }

  /** Open enough to be hurt. */
  private get open(): boolean {
    return this.lid > 0.32;
  }

  private mouthRect(): Rect {
    return { x: this.x + 4, y: this.bottom - H - 6, w: W - 8, h: H - 4 };
  }

  private tongueRect(): Rect | null {
    if (this.tongue < 8) return null;
    const front = this.facing > 0 ? this.x + W - 6 : this.x + 6;
    const tip = front + this.facing * this.tongue;
    return { x: Math.min(front, tip), y: this.bottom - 15, w: Math.abs(tip - front), h: 14 };
  }

  /* ------------------------------------------------------------ targeting */

  override overlaps(r: Rect): boolean {
    this.struck = null;
    if (this.state === 'dying') return false;
    const t = this.tongueRect();
    if (t && rectsOverlap(t, r)) {
      this.struck = 'tongue';
      return true;
    }
    if (!rectsOverlap(this.rect, r)) return false;
    this.struck = this.open && rectsOverlap(this.mouthRect(), r) ? 'mouth' : 'shell';
    return true;
  }

  override hurt(amount: number, fromDir: number, world: World): void {
    if (this.dead || this.state === 'dying') return;
    const part = this.struck;
    this.struck = null;
    if (this.state === 'dormant') {
      // The treasure bites back.
      this.wake(world);
      return;
    }
    if (part === null || part === 'shell' || this.state === 'intro') {
      // Iron bands and oak: it rings, and that is all.
      audio.play('clank', 1.1);
      world.particles.burst(this.cx - fromDir * 20, this.cy - 6, 8, '#ffe2a0', {
        speed: 160,
        gravity: 300,
        shape: 'spark',
        angle: fromDir > 0 ? Math.PI : 0,
        spread: 1.4,
      });
      this.flash = Math.max(this.flash, 0.3);
      return;
    }
    this.hp -= amount;
    this.flash = 1;
    this.poise -= amount;
    audio.play('bossHit', 1.2);
    world.particles.burst(this.cx, this.bottom - BASE_H - 4, 10, '#c0305a', { speed: 160, gravity: 400 });
    if (part === 'tongue') {
      // A cut tongue goes home at once.
      this.tongueHit = true;
      audio.play('screech', 1.6);
    }
    if (this.hp <= 0) {
      this.beginDying(world);
      return;
    }
    if (!this.phaseTwo && this.hp <= this.maxHp / 2) {
      this.phaseTwo = true;
      audio.play('phase', 1.2);
      world.camera.addShake(5);
      world.particles.burst(this.cx, this.cy, 24, '#ffd36a', { speed: 220, gravity: 260, shape: 'spark' });
    }
    if (this.poise <= 0 && this.poiseLock <= 0) this.jam(world, 1.3);
  }

  /** A parried bite, or a lunge into the guard: the lid jams wide open. */
  override onParried(world: World): void {
    if (this.dead || this.state === 'dying' || this.state === 'dormant' || this.state === 'intro') return;
    if (this.state === 'jammed' || this.poiseLock > 0) return;
    this.jam(world, 2.4);
  }

  private jam(world: World, seconds: number): void {
    this.state = 'jammed';
    this.timer = seconds;
    this.chain = false;
    this.poise = this.poiseMax;
    this.poiseLock = seconds + 1.2;
    this.lidTarget = 1;
    this.tongue = Math.max(this.tongue, 40);
    this.vx = 0;
    audio.play('clank', 0.7);
    audio.play('crumble', 1.6);
    world.camera.addShake(5);
    world.hitStop(0.06);
    world.particles.text(this.cx, this.y - 26, 'DER DECKEL KLEMMT!', '#ffe08a');
  }

  private wake(world: World): void {
    this.engaged = true;
    this.poise = this.poiseMax = this.sizeUpFor(world, MIMIC_POISE);
    this.state = 'intro';
    this.timer = 1.3;
    audio.play('crumble', 1.3);
    world.camera.addShake(4);
  }

  private beginDying(world: World): void {
    this.hp = 0;
    this.state = 'dying';
    this.timer = 2.1;
    this.tongue = 0;
    this.lidTarget = 1;
    audio.play('screech', 0.9);
    audio.play('bossDown', 1.3);
    world.camera.addShake(8);
    world.hitStop(0.14);
  }

  /**
   * Only a chest in motion hurts: a hop landing, a lunge, a lash. A hop hurts
   * on its way down only - one on its way up is leaving, and a hero walking
   * in to meet a window was being hit by the chest hopping off out of it.
   */
  override touchPlayer(world: World): void {
    if (this.state !== 'hop' || this.onGround || this.vy < 0) return;
    super.touchPlayer(world);
  }

  /* --------------------------------------------------------------- update */

  override update(dt: number, world: World): void {
    this.updateCommon(dt);
    const player = world.player;
    const dx = player.cx - this.cx;
    const dist = Math.abs(dx);
    this.eye = Math.max(0, this.eye - dt * 2);
    this.squash = approach(this.squash, 0, dt * 3);
    this.coinGlint = Math.max(0, this.coinGlint - dt);
    this.clinging = dist < 72 && !player.dead ? this.clinging + dt : 0;

    if (this.arenaRight === 0) {
      const arena = world.level.arenaAt(this.cx);
      this.arenaLeft = arena ? arena.left : this.cx - 560;
      this.arenaRight = arena ? arena.right : this.cx + 560;
    }
    if (this.onGround) this.floorY = this.bottom;
    if (this.hoardY === 0 && this.onGround) this.hoardY = this.bottom;

    if (this.state === 'dormant') {
      // A chest, and a glint in the keyhole now and then.
      if (Math.random() < dt * 0.4) this.coinGlint = 0.4;
      const inside = player.cx > this.arenaLeft + 16 && player.cx < this.arenaRight - 16;
      if (inside && dist < this.aggroRange && !player.dead) this.wake(world);
      this.vy += 1400 * dt;
      this.moveAndCollide(world.level, dt);
      return;
    }

    if (this.state === 'dying') {
      this.updateDying(dt, world);
      return;
    }

    const lidSpeed = this.state === 'bite' ? 9 : this.lidTarget < this.lid ? 7 : 4.5;
    this.lid = approach(this.lid, this.lidTarget, dt * lidSpeed);
    this.timer -= dt;

    switch (this.state) {
      case 'intro':
        // It rattles, then it opens, and there are teeth.
        this.lidTarget = this.timer < 0.6 ? 1 : 0.15 + Math.abs(Math.sin(this.anim * 30)) * 0.15;
        this.eye = 1;
        if (this.timer < 0.5) this.tongue = approach(this.tongue, 60, dt * 300);
        if (this.timer <= 0) {
          audio.play('bossRoar', 1.5);
          this.toHop();
        }
        break;

      case 'hop':
        this.lidTarget = 0;
        this.tongue = approach(this.tongue, 0, dt * 400);
        this.facing = dx > 0 ? 1 : -1;
        if (this.onGround && this.goldComing(world, 170)) {
          // Its own gold, coming home: the lid flies open for it whether it
          // wants it to or not.
          this.gape(0.45);
          this.eye = 1;
          audio.play('coin', 1.3);
          break;
        }
        if (this.onGround) {
          this.vx = approach(this.vx, 0, 1400 * dt);
          if (this.timer <= 0) {
            // Close enough, or hopped long enough: it wants something.
            if (dist < 200 || this.hops >= 2 || (dist < 320 && this.hops >= 1 && Math.random() < 0.5)) {
              this.chooseMove(world, dist);
            } else {
              // After him - but down short of him, not on him.
              this.vy = -400;
              this.vx = sign(dx) * Math.min(190, Math.max(0, dist - 110) * 1.75);
              this.squash = -0.6;
              this.hops++;
              this.timer = 0.36 * this.haste;
              audio.play('jump', 0.55);
            }
          }
        }
        break;

      case 'biteWind':
        // The lid cracks and the eye lights in the gap; it settles back on
        // its heels.
        this.vx = approach(this.vx, -this.facing * 40, 400 * dt);
        this.lidTarget = 0.22 + Math.sin(this.anim * 40) * 0.04;
        this.eye = 1;
        this.squash = 0.5;
        if (this.timer <= 0) {
          this.state = 'bite';
          this.timer = 0.34;
          this.hitThisMove = false;
          // 480, down from 540: the lunge outran a hero who had started back
          // the moment he saw the lid crack.
          this.vx = this.facing * 480;
          this.lidTarget = 1;
          audio.play('dash', 0.7);
        }
        break;

      case 'bite': {
        this.vx = approach(this.vx, 0, 900 * dt);
        if (!this.hitThisMove && !player.dead) {
          const jaws = { x: this.facing > 0 ? this.x + W - 18 : this.x - 22, y: this.y - 8, w: 40, h: H + 8 };
          if (rectsOverlap(jaws, player.rect)) {
            this.hitThisMove = true;
            this.chomp(world, this.facing);
          }
        }
        if (this.state !== 'bite') break;
        if (this.timer < 0.1) this.lidTarget = 0;
        if (this.timer <= 0) {
          audio.play('slam', 1.5);
          world.camera.addShake(3);
          if (this.chain) {
            // The second of a pair: hardly a breath between them.
            this.chain = false;
            this.state = 'biteWind';
            this.timer = 0.5;
            audio.play('tellLunge', 1.3);
          } else {
            this.gape(GAPE.bite);
          }
        }
        break;
      }

      case 'snapWind':
        // A rattle of the lid, short: it is only for whoever is too close.
        this.vx = approach(this.vx, 0, 900 * dt);
        this.lidTarget = 0.12 + Math.abs(Math.sin(this.anim * 34)) * 0.12;
        this.eye = 1;
        if (this.timer <= 0) {
          this.state = 'snap';
          this.timer = 0.2;
          this.hitThisMove = false;
          this.lid = 0.9;
          this.lidTarget = 0;
          audio.play('slam', 1.6);
        }
        break;

      case 'snap': {
        const jaws = { x: this.x - 14, y: this.y - 10, w: W + 28, h: H + 10 };
        if (!this.hitThisMove && !player.dead && rectsOverlap(jaws, player.rect)) {
          this.hitThisMove = true;
          // One heart: it is the lid, not the bite.
          this.chomp(world, sign(player.cx - this.cx) || this.facing, 1);
        }
        if (this.timer <= 0 && this.state === 'snap') this.gape(GAPE.snap);
        break;
      }

      case 'gape':
        // Open, panting, tongue on the floor: the window. It stays open as
        // long as there is gold on its way back into it.
        this.vx = approach(this.vx, 0, 900 * dt);
        this.lidTarget = 0.72 + Math.sin(this.anim * 5) * 0.06;
        this.tongue = approach(this.tongue, 46 + Math.sin(this.anim * 4) * 8, dt * 200);
        if (this.timer <= 0 && this.goldComing(world, 420)) this.timer = 0.05;
        if (this.timer <= 0) this.toHop();
        break;

      case 'spitWind':
        this.vx = approach(this.vx, 0, 900 * dt);
        this.lidTarget = 0.95;
        this.coinGlint = 0.6;
        if (this.timer <= 0) {
          this.spit(world);
          this.gape(GAPE.spit);
        }
        break;

      case 'tongueWind':
        this.vx = approach(this.vx, 0, 900 * dt);
        this.lidTarget = 0.6;
        this.eye = 1;
        this.tongue = approach(this.tongue, 14, dt * 60);
        if (this.timer <= 0) {
          this.state = 'tongue';
          this.timer = 0.85;
          this.tongueHit = false;
          this.hitThisMove = false;
          audio.play('swing', 0.6);
        }
        break;

      case 'tongue': {
        // Out fast, a moment at full stretch, and home. Only the lash hurts:
        // a tongue on its way back is not a second chance to be hit by it,
        // and a hero who jumped it has to be able to land.
        const elapsed = 0.85 - this.timer;
        const lashing = elapsed < 0.4 && !this.tongueHit;
        const want = lashing ? TONGUE_REACH : 0;
        this.tongue = approach(this.tongue, want, dt * (want > this.tongue ? 1100 : 900));
        const t = this.tongueRect();
        if (lashing && t && !this.hitThisMove && !player.dead && rectsOverlap(t, player.rect)) {
          this.hitThisMove = true;
          player.hurt(1, this.facing, world);
        }
        if (this.timer <= 0 || (elapsed > 0.4 && this.tongue < 4)) {
          this.tongue = 0;
          this.gape(GAPE.tongue);
        }
        break;
      }

      case 'gulpWind':
        this.vx = approach(this.vx, 0, 900 * dt);
        this.lidTarget = 1;
        this.eye = 1;
        if (this.timer <= 0) {
          this.state = 'gulp';
          this.timer = 1.15;
          this.hitThisMove = false;
          audio.play('rumble', 1.6);
        }
        break;

      case 'gulp': {
        // It breathes in, and the floor slides towards the mouth: slower than
        // he runs, so running out of it works and standing in it does not.
        // It used to push on his speed, which his own footing simply ate -
        // measured, a hero who stood still in it did not move a pixel.
        this.lidTarget = 1;
        if (!player.dead && dist > 30) {
          const step = -sign(dx) * GULP_PULL * (player.onGround ? 1 : 0.4) * dt;
          if (!world.level.rectHitsSolid(player.x + step, player.y, player.w, player.h)) player.x += step;
        }
        if (world.time % 0.03 < dt) {
          world.particles.spawn({
            x: player.cx + rand(-30, 30),
            y: player.cy + rand(-20, 20),
            vx: -sign(dx) * rand(120, 240),
            vy: rand(-20, 20),
            color: 'rgba(255,220,140,0.55)',
            size: 2,
            life: 0.3,
            shape: 'spark',
          });
        }
        if (this.timer <= 0) {
          // And then it shuts.
          this.lidTarget = 0;
          audio.play('slam', 1.2);
          world.camera.addShake(4);
          const front = this.facing > 0 ? this.x + W : this.x;
          if (!player.dead && Math.abs(player.cx - front) < 52 && Math.abs(player.bottom - this.bottom) < 40) {
            this.chomp(world, this.facing);
          }
          if (this.state === 'gulp') this.gape(GAPE.gulp);
        }
        break;
      }

      case 'jammed':
        // Stuck wide open and rocking, trying to slam a lid that will not.
        this.vx = approach(this.vx, 0, 900 * dt);
        this.lidTarget = 1;
        this.lid = Math.min(1, this.lid + Math.sin(this.anim * 26) * 0.02);
        this.tongue = approach(this.tongue, 30, dt * 200);
        if (world.time % 0.12 < dt) {
          world.particles.spawn({
            x: this.cx + rand(-20, 20),
            y: this.bottom - BASE_H - 4,
            vx: rand(-40, 40),
            vy: -rand(40, 110),
            gravity: 400,
            color: '#ffd36a',
            size: 2,
            life: 0.5,
            shape: 'spark',
          });
        }
        if (this.timer <= 0) this.toHop();
        break;
    }

    this.vy += 1400 * dt;
    if (this.state === 'bite' || this.state === 'hop') this.holdBackAtEdges(world);
    this.moveAndCollide(world.level, dt);
    this.x = clamp(this.x, this.arenaLeft + 4, this.arenaRight - this.w - 4);
    if (this.state === 'hop' && this.onGround && this.squash < -0.3) this.squash = 0.6;
  }

  /**
   * Its jaws close on the hero - or on his guard, which jams them open. The
   * parry itself only reaches what stands within sixty pixels of him, and a
   * lunging chest is often a little further than that when its jaws arrive:
   * measured, two parried bites in three left it shut.
   */
  private chomp(world: World, dir: number, damage = 2): void {
    const p = world.player;
    const guarding = p.parryTimer > 0;
    p.hurt(damage, dir, world);
    if (guarding && p.parryTimer === 0 && p.parryFlash > 0.95 && this.state !== 'jammed') this.onParried(world);
  }

  /** A coin the hero has batted back, flying at it and this close. */
  private goldComing(world: World, within: number): boolean {
    return world.projectiles.some(
      (q) => q.kind === 'coin' && q.friendly && !q.dead && Math.abs(q.cx - this.cx) < within && sign(this.cx - q.cx) === sign(q.vx),
    );
  }

  private toHop(): void {
    this.state = 'hop';
    this.timer = 0.3 * this.haste;
    this.hops = 0;
    this.lidTarget = 0;
  }

  /** Open, after a move. Its second half hurries everything but this. */
  private gape(seconds: number): void {
    this.state = 'gape';
    this.timer = seconds;
  }

  private chooseMove(world: World, dist: number): void {
    const player = world.player;
    // Against it: the lid, if he has been clinging - otherwise it hops off to
    // get some room. See CLING.
    if (dist < 72) {
      this.facing = player.cx > this.cx ? 1 : -1;
      if (this.clinging >= CLING) {
        this.lastMove = 'snap';
        this.state = 'snapWind';
        this.timer = 0.5;
        audio.play('tellSlam', 1.6);
      } else {
        this.lastMove = 'back';
        this.state = 'hop';
        this.timer = 0.9 * this.haste;
        this.hops = 2;
        this.vy = -440;
        this.vx = -sign(player.cx - this.cx) * 230;
        this.squash = -0.6;
        audio.play('jump', 0.5);
      }
      return;
    }
    const options = dist < 200 ? ['bite', 'tongue', 'bite'] : dist < 320 ? ['tongue', 'spit'] : ['spit', 'tongue'];
    if (this.phaseTwo && dist < 260) options.push('gulp');
    const pick = options.filter((o) => o !== this.lastMove);
    const move = pick[Math.floor(Math.random() * pick.length)] ?? options[0];
    this.lastMove = move;
    this.facing = player.cx > this.cx ? 1 : -1;
    this.hitThisMove = false;
    switch (move) {
      case 'bite':
        this.state = 'biteWind';
        // The bite's warning is the longest of its moves: it is the one that
        // hurts most. 0.75, up from 0.62 - a hero who sees the lid crack a
        // quarter of a second late still has half a second to get out.
        this.timer = 0.75;
        this.chain = this.phaseTwo;
        audio.play('tellLunge', 1.1);
        break;
      case 'spit':
        this.state = 'spitWind';
        this.timer = 0.6;
        audio.play('tellVolley', 1.4);
        audio.play('coin', 0.7);
        break;
      case 'tongue':
        this.state = 'tongueWind';
        this.timer = 0.55;
        audio.play('tellBeam', 0.9);
        break;
      case 'gulp':
        this.state = 'gulpWind';
        this.timer = 0.6;
        audio.play('tellSlam', 0.8);
        break;
    }
  }

  /** A fan of coins on short arcs, landing around the hero. */
  private spit(world: World): void {
    const player = world.player;
    const count = this.phaseTwo ? 7 : 5;
    const originX = this.cx;
    const originY = this.bottom - BASE_H - 8;
    const flight = clamp(Math.abs(player.cx - originX) / COIN_SPEED, 0.85, 1.25);
    for (let i = 0; i < count; i++) {
      const spread = (i - (count - 1) / 2) * (this.phaseTwo ? 52 : 64);
      const tx = clamp(player.cx + spread, this.arenaLeft + 10, this.arenaRight - 10);
      const vx = (tx - originX) / flight;
      const vy = (player.cy - originY) / flight - 0.5 * 950 * flight;
      world.spawnProjectile(new Projectile('coin', originX - 6, originY - 6, vx, vy));
    }
    audio.play('coin', 0.6);
    audio.play('fireball', 1.6);
    world.particles.burst(originX, originY, 16, '#ffd36a', { speed: 200, gravity: 400, shape: 'spark', angle: -Math.PI / 2, spread: 1.6 });
  }

  private updateDying(dt: number, world: World): void {
    this.timer -= dt;
    this.lid = approach(this.lid, 1, dt * 3);
    if (this.timer > 0.7) {
      // Its hoard comes up, coin after coin.
      if (world.time % 0.06 < dt) {
        world.particles.spawn({
          x: this.cx + rand(-16, 16),
          y: this.bottom - BASE_H - 4,
          vx: rand(-160, 160),
          vy: -rand(200, 420),
          gravity: 900,
          color: Math.random() < 0.5 ? '#ffd36a' : '#fff1b8',
          size: rand(2, 3.5),
          life: 1.1,
          shape: 'circle',
        });
        if (Math.random() < 0.3) audio.play('coin', rand(0.8, 1.4));
      }
      this.x += Math.sin(this.anim * 50) * 40 * dt;
    } else if (this.planks.length === 0) {
      this.breakApart(world);
    }
    for (const pl of this.planks) {
      pl.vy += 1200 * dt;
      pl.x += pl.vx * dt;
      pl.y += pl.vy * dt;
      pl.rot += pl.spin * dt;
      if (pl.y > this.floorY - pl.h / 2) {
        pl.y = this.floorY - pl.h / 2;
        pl.vy *= -0.25;
        pl.vx *= 0.6;
        pl.spin *= 0.5;
      }
    }
    if (this.timer <= 0) {
      this.die(world);
      world.onBossFelled('mimic', this.cx, this.y - 30);
    }
  }

  private breakApart(world: World): void {
    audio.play('crumble', 0.9);
    audio.play('explode', 1.4);
    world.camera.addShake(7);
    world.particles.burst(this.cx, this.cy, 40, '#ffd36a', { speed: 280, gravity: 700, size: 3 });
    const pieces: [number, number, boolean][] = [
      [30, 8, false],
      [30, 8, false],
      [26, 9, false],
      [26, 9, false],
      [20, 7, false],
      [14, 4, true],
      [14, 4, true],
      [10, 10, true],
    ];
    this.planks = pieces.map(([w, h, gold]) => ({
      x: this.cx + rand(-20, 20),
      y: this.bottom - rand(10, 40),
      vx: rand(-220, 220),
      vy: rand(-420, -160),
      rot: rand(0, 6),
      spin: rand(-9, 9),
      w,
      h,
      gold,
    }));
  }

  override lights(): GlowLight[] {
    const out: GlowLight[] = [];
    if (this.state === 'dormant') {
      out.push({ x: this.cx, y: this.cy, radius: 90, rgb: '255,200,110', strength: 0.5, tint: 0.3 });
      return out;
    }
    const open = this.lid;
    out.push({ x: this.cx, y: this.bottom - BASE_H - 6, radius: 70 + open * 110, rgb: '255,196,96', strength: 0.55 + open * 0.3, tint: 0.35 });
    if (this.eye > 0.1) out.push({ x: this.cx, y: this.bottom - BASE_H, radius: 60, rgb: '255,90,60', strength: 0.5 * this.eye, tint: 0.3 });
    return out;
  }


  /* -------------------------------------------------------------- drawing */

  override draw(ctx: CanvasRenderingContext2D): void {
    if (this.planks.length > 0) {
      this.drawPlanks(ctx);
      return;
    }
    const facing = this.facing > 0 ? 1 : -1;
    // Shut, it squashes and stretches on its hops as drawn frames.
    let frame = lidFrame(this.lid);
    if (frame === 'shut' && this.squash > 0.25) frame = 'land';
    else if (frame === 'shut' && this.squash < -0.25) frame = 'jump';
    // Jammed wide, it rocks, trying to slam a lid that will not.
    if (this.state === 'jammed' && Math.floor(this.anim * 6) % 2) frame = 'open2';
    // The tell: the eye looking out through the keyhole and the gap; a glint
    // of the hoard through the keyhole now and then while it sleeps.
    const palette = this.eye > 0.3 ? 'eye' : this.coinGlint > 0.05 ? 'glint' : '';
    shadow(ctx, this.cx, this.bottom, W * 0.62, 0.34);
    const white = this.flash >= HIT_WHITE;
    withHitFlash(
      ctx,
      white ? this.flash : 0,
      (c) => {
        drawChest(c, frame, this.cx, this.bottom, facing, palette);
        if (this.tongue >= 8) this.drawTongue(c, facing);
      },
      white ? { x: this.cx - 60 - this.tongue, y: this.bottom - 100, w: 120 + this.tongue * 2, h: 104 } : undefined,
    );
  }

  /**
   * Thick, wet, and a long way out: out of the throat over the front of the
   * box, down to the floor and along it to a tip that curls up - drawn column
   * by column on whole pixels, four deep: its underside, the meat, a line of
   * wet light along the top, undulating a pixel up and down as it lashes.
   */
  private drawTongue(ctx: CanvasRenderingContext2D, facing: 1 | -1): void {
    const ox = snap(this.cx);
    const oy = snap(this.bottom);
    // From just behind the rim, over it, down the front of the box to the
    // floor and along it to the tip: art pixels forward of the middle.
    const from = 14;
    const rim = 18;
    const tip = Math.max(rim + 2, Math.round(13.5 + this.tongue / ART));
    const drop = 8;
    const col = (c: number): number => (facing > 0 ? ox + c * ART : ox - (c + 1) * ART);
    for (let c = from; c <= tip; c++) {
      const k = Math.max(0, Math.min(1, (c - rim) / drop));
      let y = Math.round(-14 + 11 * k * k * (3 - 2 * k));
      if (k >= 1) y += Math.round(Math.sin(c * 0.35 + this.anim * 14));
      // The tip curls up.
      const left = tip - c;
      if (left < 3) y -= 3 - left;
      const x = col(c);
      const thin = left < 1;
      ctx.fillStyle = TONGUE.top;
      ctx.fillRect(x, oy + (y - 2) * ART, ART, ART);
      ctx.fillStyle = TONGUE.body;
      ctx.fillRect(x, oy + (y - 1) * ART, ART, (thin ? 1 : 2) * ART);
      if (!thin) {
        ctx.fillStyle = TONGUE.under;
        ctx.fillRect(x, oy + (y + 1) * ART, ART, ART);
      }
      // A glint of wet along the top, every few pixels.
      if ((c + Math.floor(this.anim * 10)) % 7 === 0) {
        ctx.fillStyle = TONGUE.gloss;
        ctx.fillRect(x, oy + (y - 2) * ART, ART, ART);
      }
    }
  }

  /**
   * The hoard behind where it slept (mimic-art.ts), drawn with the ground:
   * whole while it lives, and sliding away in four steps once the chest is
   * broken.
   */
  override drawSetPiece(ctx: CanvasRenderingContext2D): void {
    if (this.hoardY === 0) return;
    const step = this.state === 'dying' ? Math.ceil(clamp(this.timer / 1.4, 0, 1) * 4) : 4;
    const sp = hoardSprite(step);
    if (sp) sp.draw(ctx, this.hoardX - (HOARD_W * ART) / 2, this.hoardY - sp.h * ART);
  }

  /** The chest gone to pieces: planks and bits of its gold, tumbling in four drawn turns. */
  private drawPlanks(ctx: CanvasRenderingContext2D): void {
    for (const pl of this.planks) {
      const turn = ((Math.round(pl.rot / (Math.PI / 4)) % 4) + 4) % 4;
      const kind = pl.gold ? (pl.h > 6 ? 'lock' : 'band') : pl.w > 22 ? 'long' : 'short';
      WRECK.draw(ctx, `${kind}${turn}`, pl.x, pl.y, 4, 2, 1);
    }
  }
}

/** Above this its flash is a white silhouette (two frames of a blow); below it, nothing. */
const HIT_WHITE = 0.8;
