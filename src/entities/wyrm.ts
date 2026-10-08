import { audio } from '../core/audio';
import { Rect, approach, clamp, rand, rectsOverlap, sign } from '../core/math';
import { glow, withHitFlash } from '../render/sprites';
import type { World } from '../world/context';
import { Enemy, type GlowLight } from './enemy';
import { Projectile } from './projectile';

/**
 * 44, down from 58. With the windows below a hero who reads him lands about
 * as much a second as he does on Ankhor; at 58 the fight ran past a minute and
 * the fire wore down seven hearts before the head did.
 */
const WYRM_HP = 44;
/**
 * Damage to the head, surfaced, before it slams down stunned. Five, down from
 * eleven and then seven: a hero who has walked in under the hanging head
 * lands five before it pulls back, so the long window comes every time the
 * spit is answered, not twice a fight.
 */
const WYRM_POISE = 5;
const SEGMENTS = 15;
const GAP = 21;
/** How deep he swims under the floor. */
const DEPTH = 74;
const PILLAR_H = 82;
/**
 * How long the glow under the hero holds still before it bursts. The one
 * warning in the fight that never gets shorter, second half or not. 0.55, up
 * from 0.4: a hero who sees it stop needs a quarter of a second to answer, and
 * 0.4 left him a tenth to get out from under it.
 */
const LOCK = 0.55;
const PILLAR_W = 34;
/** Where his head lies when it is down on the floor: in reach of a standing swing. */
const LIE = 22;
/**
 * Where it hangs after the spit: at the hero's own height, so a swing from the
 * floor takes the whole head. It used to hang at 96, which only a jump timed to
 * the top of its arc could reach, and then at 54, where a standing swing only
 * grazed the lowest few pixels of it and missed whenever it swayed up.
 */
const LOW_HEAD = 34;
/** How high he rears for the spit itself. */
const SPIT_HEAD = 112;
/**
 * Seconds his head lies stuck where it came down after a breach. 2.3, up from
 * 1.5: the dodge the breach asks for runs the hero away from it, and turning
 * round and coming back used up most of a second and a half.
 */
const STUCK = 2.3;
/** Seconds his head hangs low after the spit. */
const EXPOSED = 2.8;
/** Seconds he lies on the floor once the hanging head is beaten down. */
const STUNNED = 3;
/** Seconds between two "only the head" hints, when the plates take a swing. */
const HINT_EVERY = 2.5;

interface Point {
  x: number;
  y: number;
}

interface Pool {
  x: number;
  life: number;
}

interface Pillar {
  x: number;
  t: number;
  hit: boolean;
}

interface Cinder {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  rot: number;
  spin: number;
}

type WyrmState =
  | 'dormant'
  | 'intro'
  | 'idle'
  | 'hunt'
  | 'breach'
  | 'rise'
  | 'spitWind'
  | 'exposed'
  | 'stuck'
  | 'stunned'
  | 'sink'
  | 'waveEdge'
  | 'waveWind'
  | 'wave'
  | 'dying';

/**
 * Ignivor, der Glutwurm - fifteen plates of obsidian with the mountain's own
 * fire running between them, and the chamber floor is where he lives.
 *
 * The rule of the fight is the rule of every wyrm: the armour is armour. A
 * blade on his plates rings and does nothing. Only the head counts, and the
 * head is only out of the rock when he wants something:
 *
 *   Durchbruch - the floor under the hero starts to glow and follows him, then
 *                holds still for a breath and bursts. Keep moving; when it
 *                stops, leave. What goes up comes down: his head slams onto
 *                the floor beside the hole and sticks there, in reach, for a
 *                breath and a half.
 *   Glutspeien - he rises out of the floor a little way off and spits clots of
 *                magma at the hero and past him - never between the two of
 *                them, so the way to him stays open. Then he stays up, head
 *                hanging low, and that is the time to hit it.
 *   Feuerwelle - he goes to the far wall and swims the length of the chamber
 *                just under the floor, and it comes up as fire behind him the
 *                whole way. The floor is no place to be; the ledges are.
 *
 * Hurt the head enough while it hangs there and it comes down onto the floor,
 * stunned - the long window. From half health on he breaches twice, and the
 * fire he throws up at the top of a breach comes down again as rain.
 *
 * He was too strong, and not because of his numbers: measured, a hero who read
 * every tell and went for the head every time it showed dealt 0.3 to 0.5 damage
 * a second, took thirty hearts in two minutes and still had not finished him.
 * The head was out of a standing swing's reach for nine tenths of the fight,
 * the spit put its fire on the only path to it, and after a breach he was gone
 * again before anyone could turn round. Now every one of his moves but the
 * wave ends with the head where a sword can find it.
 *
 * And then he was still too strong, because that hero was a bot that knew the
 * head to the pixel and saw every change the frame it happened. Measured again
 * with one that sees the fight 0.3 s late and only swings from the floor, as a
 * player does: the hanging head overlapped a standing swing by five pixels,
 * its snout stuck out of its own hit box, the breach left a tenth of a second
 * to get out from under it and the stuck head was gone by the time he had
 * turned round. Now the head hangs at the hero's height, the box is the skull,
 * every window is longer, and he has less to lose: 31 to 47 s with the four
 * relics of the road, against 51 to 72 before.
 */
export class Wyrm extends Enemy {
  private state: WyrmState = 'dormant';
  private timer = 0;
  private floorY = 0;
  private arenaLeft = 0;
  private arenaRight = 0;
  /** The head, and where it is headed. */
  private hx = 0;
  private hy = 0;
  private hvx = 0;
  private hvy = 0;
  private trail: Point[] = [];
  private segs: Point[] = [];
  private jaw = 0;
  private throat = 0;
  private headFlash = 0;
  private struck: 'head' | 'body' | null = null;
  private poise = WYRM_POISE;
  private poiseMax = WYRM_POISE;
  private lastMove = '';
  private breaches = 0;
  private waveDir = 1;
  private lastPillarX = 0;
  private readonly pools: Pool[] = [];
  private readonly pillars: Pillar[] = [];
  private readonly globs: Projectile[] = [];
  private cinders: Cinder[] = [];
  private phaseTwo = false;
  private wasUnder = true;
  /** Cools from 0 to 1 as he dies. */
  private cool = 0;
  /** The burst through the floor has had its chance to hurt. */
  private burstDone = false;
  /** The fire at the top of this breach has come down. */
  private rained = false;
  /** Where his neck goes into the rock while the head lies on the floor. */
  private hole = 0;
  /** This breach ends with the head on the floor, rather than back under it. */
  private landing = false;
  /** The way down from the top of this breach has been picked. */
  private aimed = false;
  /** Where the head comes to rest when it is knocked down. */
  private slumpX = 0;
  /** Counts down to the next time a swing on the plates says where to hit. */
  private hintTimer = 0;

  override castLight = false;

  constructor(x: number, y: number) {
    super('wyrm', x, y);
    this.w = 60;
    this.h = 56;
    this.hp = this.maxHp = WYRM_HP;
    this.scoreValue = 1000;
    this.contactDamage = 0;
    this.aggroRange = 480;
  }

  get phase(): 1 | 2 {
    return this.phaseTwo ? 2 : 1;
  }

  override barName(): string {
    return 'IGNIVOR   ·   DER GLUTWURM';
  }

  override barPhase(): number {
    return this.phase;
  }

  private get haste(): number {
    return this.phaseTwo ? 0.82 : 1;
  }

  protected override deathColor(): string {
    return '#ff8a3a';
  }

  private get headUp(): boolean {
    return this.hy < this.floorY + 6;
  }

  /**
   * The skull as it is drawn: 80 wide and 64 high around the head's point. It
   * was 60 by 52, and the snout he points at the hero stuck 16 px out of it -
   * the part of him a hero swings at first was the part that was not there.
   */
  private headRect(): Rect {
    return { x: this.hx - 40, y: this.hy - 32, w: 80, h: 64 };
  }

  /**
   * What bites during a breach: the skull without its horns, a good deal
   * smaller than what a sword finds. A generous target is a kindness; a
   * generous bite is not.
   */
  private biteRect(): Rect {
    return { x: this.hx - 26, y: this.hy - 22, w: 52, h: 44 };
  }

  /** The head is out and in reach: lying stuck, hanging after a spit, or down. */
  private get open(): boolean {
    return this.state === 'stuck' || this.state === 'exposed' || this.state === 'stunned';
  }

  private segRadius(i: number): number {
    return 25 - (i / (SEGMENTS - 1)) * 14;
  }

  /* ------------------------------------------------------------ targeting */

  override overlaps(r: Rect): boolean {
    this.struck = null;
    if (this.state === 'dormant' || this.state === 'intro' || this.state === 'dying') return false;
    if (this.headUp && rectsOverlap(this.headRect(), r)) {
      this.struck = 'head';
      return true;
    }
    for (let i = 0; i < this.segs.length; i++) {
      const s = this.segs[i];
      if (s.y > this.floorY) continue;
      const rad = this.segRadius(i);
      if (rectsOverlap({ x: s.x - rad, y: s.y - rad, w: rad * 2, h: rad * 2 }, r)) {
        this.struck = 'body';
        return true;
      }
    }
    return false;
  }

  override hurt(amount: number, fromDir: number, world: World): void {
    void fromDir;
    if (this.dead || this.state === 'dormant' || this.state === 'intro' || this.state === 'dying') return;
    const part = this.struck;
    this.struck = null;
    if (part === null) return;
    if (part === 'body') {
      // Armour. It rings, it sparks, and it teaches - in words, too, now and
      // then: a clank alone read as a boss that cannot be hurt at all.
      audio.play('clank', 0.9);
      const s = this.segs[Math.floor(this.segs.length / 2)] ?? { x: this.hx, y: this.hy };
      world.particles.burst(s.x, s.y, 8, '#ffd08a', { speed: 180, gravity: 300, shape: 'spark' });
      if (this.hintTimer <= 0) {
        this.hintTimer = HINT_EVERY;
        world.particles.text(s.x, s.y - 34, 'NUR DER KOPF!', '#ffd08a');
      }
      return;
    }
    this.hp -= amount;
    this.flash = 1;
    this.headFlash = 1;
    this.poise -= amount;
    audio.play('bossHit', 0.9);
    world.particles.burst(this.hx, this.hy, 10, '#ffb070', { speed: 170, gravity: 300 });
    if (this.hp <= 0) {
      this.beginDying(world);
      return;
    }
    if (!this.phaseTwo && this.hp <= this.maxHp / 2) {
      this.phaseTwo = true;
      audio.play('phase', 0.85);
      audio.play('bossRoar', 0.9);
      world.camera.addShake(6);
    }
    // The breach's landing is its own window and does not chain into the long
    // one: only the head hanging after a spit can be beaten down.
    const up = this.state === 'exposed' || this.state === 'spitWind' || this.state === 'rise';
    if (up && this.poise <= 0 && this.poiseLock <= 0) this.knockDown(world);
  }

  override onParried(world: World): void {
    if (this.dead || !this.headUp || this.state === 'stunned' || this.state === 'dying') return;
    if (this.poiseLock > 0) return;
    this.knockDown(world);
  }

  /**
   * The head comes down onto the floor, and stays there a while. It slumps
   * towards whoever put it there - never onto him - and the neck stays in the
   * hole it came out of, so the way to the head is clear.
   */
  private knockDown(world: World): void {
    this.poise = this.poiseMax;
    this.poiseLock = 3.5;
    this.state = 'stunned';
    this.timer = STUNNED;
    this.jaw = 0.2;
    this.hvx = 0;
    this.hvy = 0;
    const p = world.player;
    const toward = sign(p.cx - this.hx) || 1;
    this.hole = this.hx;
    this.slumpX = clamp(this.hx + toward * clamp(Math.abs(p.cx - this.hx) - 52, 0, 64), this.arenaLeft + 40, this.arenaRight - 40);
    audio.play('slam', 0.9);
    audio.play('bossRoar', 1.3);
    world.camera.addShake(7);
    world.hitStop(0.08);
    world.particles.text(this.hx, this.hy - 50, 'ER LIEGT!', '#ffd08a');
  }

  private beginDying(world: World): void {
    this.hp = 0;
    this.state = 'dying';
    this.timer = 2.4;
    this.hvx = 0;
    this.hvy = 0;
    this.pillars.length = 0;
    audio.play('bossRoar', 0.75);
    world.camera.addShake(9);
    world.hitStop(0.14);
  }

  /**
   * Only what is above the floor can touch him, and only while he is coming
   * through it: the head bites and the plates burn during a breach - on the
   * way up. Coming down, the head lands beside the hero on purpose, and the
   * plates trailing after it used to sweep over the one who stepped in to meet
   * it; now the way down is the hero's. A head lying on the floor or hanging
   * after a spit is the window, not a trap, and one that is pulling back into
   * the rock is leaving - walking into either to swing costs nothing. The fire
   * he leaves behind burns whatever he is doing.
   */
  override touchPlayer(world: World): void {
    const p = world.player;
    if (this.dead || p.dead || this.state === 'dormant' || this.state === 'dying') return;
    for (const pool of this.pools) {
      if (Math.abs(p.cx - pool.x) < 26 && p.bottom > this.floorY - 14 && pool.life > 0.3) {
        p.hurt(1, sign(p.cx - pool.x) || 1, world);
      }
    }
    for (const pillar of this.pillars) {
      const k = this.pillarPower(pillar);
      if (pillar.hit || k < 0.4) continue;
      if (rectsOverlap({ x: pillar.x - PILLAR_W / 2, y: this.floorY - PILLAR_H * k, w: PILLAR_W, h: PILLAR_H * k }, p.rect)) {
        pillar.hit = true;
        p.hurt(1, sign(p.cx - pillar.x) || 1, world);
      }
    }
    if (p.isInvulnerable || this.state !== 'breach') return;
    // Rising, he bites and burns; coming down, he is the hero's. The bite used
    // to be asked before the way down was, and the head landing beside the
    // hole - as near as 46 px - came down on a hero who had stepped 50 to 70
    // px out of the glow, exactly the dodge the glow asks for.
    if (this.hvy > 0) return;
    if (this.headUp && rectsOverlap(this.biteRect(), p.rect)) {
      p.hurt(1, sign(p.cx - this.hx) || 1, world);
      return;
    }
    for (let i = 2; i < this.segs.length; i++) {
      const s = this.segs[i];
      if (s.y > this.floorY - 4) continue;
      const rad = this.segRadius(i) * 0.8;
      if (rectsOverlap({ x: s.x - rad, y: s.y - rad, w: rad * 2, h: rad * 2 }, p.rect)) {
        p.hurt(1, sign(p.cx - s.x) || 1, world);
        return;
      }
    }
  }

  /* --------------------------------------------------------------- update */

  override update(dt: number, world: World): void {
    this.updateCommon(dt);
    const player = world.player;
    this.headFlash = Math.max(0, this.headFlash - dt * 5);
    this.hintTimer = Math.max(0, this.hintTimer - dt);
    this.jaw = Math.max(0, this.jaw - dt * 1.4);
    this.throat = Math.max(0, this.throat - dt * 1.2);

    if (this.floorY === 0) {
      this.floorY = this.bottom;
      this.hx = this.cx;
      this.hy = this.floorY + DEPTH;
      const arena = world.level.arenaAt(this.hx);
      this.arenaLeft = arena ? arena.left : this.hx - 560;
      this.arenaRight = arena ? arena.right : this.hx + 560;
      for (let i = 0; i < SEGMENTS * 2; i++) this.trail.push({ x: this.hx + i * GAP * 0.5, y: this.hy + 6 });
    }

    this.updateHazards(dt, world);

    switch (this.state) {
      case 'dormant': {
        const inside = player.cx > this.arenaLeft + 16 && player.cx < this.arenaRight - 16;
        if (inside && Math.abs(player.cx - this.hx) < this.aggroRange && !player.dead) {
          this.engaged = true;
          this.poise = this.poiseMax = this.sizeUpFor(world, WYRM_POISE);
          this.state = 'intro';
          this.timer = 1.0;
          audio.play('rumble', 0.8);
          world.camera.addShake(4);
        }
        break;
      }

      case 'intro':
        // A long rumble, then he comes up out of the middle of the floor.
        this.timer -= dt;
        if (this.timer <= 0 && this.hy > this.floorY) {
          this.hvx = 60;
          this.hvy = -1080;
          this.state = 'breach';
          this.breaches = 0;
          this.burstDone = true;
          this.rained = true;
          // Showing himself, not attacking: he goes straight back under.
          this.landing = false;
          audio.play('bossRoar', 0.85);
        }
        break;

      case 'idle':
        this.swimUnder(dt, player.cx + sign(this.hx - player.cx) * 240, 150);
        this.timer -= dt;
        if (this.timer <= 0) this.chooseMove(world);
        break;

      case 'hunt': {
        this.timer -= dt;
        const locked = this.timer < LOCK;
        if (!locked) this.swimUnder(dt, player.cx, 300);
        else this.hvx = 0;
        if (this.timer <= 0) {
          // Straight up out of the spot that stopped moving. Aiming the arc at
          // where the hero has run to since would punish the one thing the
          // stillness asked him to do.
          this.hvx = rand(-25, 25);
          this.hvy = -1100;
          this.state = 'breach';
          this.burstDone = false;
          this.rained = false;
          this.aimed = false;
          this.hole = this.hx;
          // In his second half the first of a pair goes straight back under
          // to hunt again; the last breach of a move always comes down on
          // the floor.
          this.landing = !(this.phaseTwo && this.breaches === 0);
          audio.play('bossRoar', 1.05);
        }
        break;
      }

      case 'breach':
        this.hvy += 1850 * dt;
        this.hx = clamp(this.hx + this.hvx * dt, this.arenaLeft + 30, this.arenaRight - 30);
        this.hy += this.hvy * dt;
        this.jaw = Math.max(this.jaw, 0.8);
        // At the top of the arc, in his second half, the fire comes down.
        if (this.phaseTwo && this.hvy > -60 && this.hvy < 0 && !this.rained) {
          this.rained = true;
          for (let i = 0; i < 4; i++) {
            const glob = new Projectile('magma', this.hx - 9, this.hy - 9, rand(-230, 230), rand(-360, -160));
            world.spawnProjectile(glob);
            this.globs.push(glob);
          }
          audio.play('fireball', 0.8);
        }
        // Over the top he turns, and the head comes down beside the hole -
        // towards the hero, but never onto him: the dodge he was asked for is
        // what puts him in reach of it.
        if (this.landing && !this.aimed && this.hvy > 0) {
          this.aimed = true;
          const toward = sign(player.cx - this.hole) || (Math.random() < 0.5 ? -1 : 1);
          // Up to 170 px out, up from 120: a hero who ran far from the glow
          // used to find the head landing a long way short of him.
          const reach = clamp(Math.abs(player.cx - this.hole) - 54, 46, 170);
          const landX = clamp(this.hole + toward * reach, this.arenaLeft + 40, this.arenaRight - 40);
          const fall = Math.sqrt((2 * Math.max(20, this.floorY - LIE - this.hy)) / 1850);
          this.hvx = (landX - this.hx) / fall;
        }
        if (this.landing && this.hvy > 0 && this.hy >= this.floorY - LIE) {
          this.breaches++;
          this.stick(world);
        } else if (this.hvy > 0 && this.hy > this.floorY + DEPTH * 0.6) {
          this.hy = this.floorY + DEPTH;
          this.hvy = 0;
          this.hvx = 0;
          this.breaches++;
          if (this.phaseTwo && this.breaches === 1 && this.lastMove === 'hunt') {
            this.state = 'hunt';
            this.timer = 0.9;
          } else {
            this.state = 'idle';
            this.timer = rand(0.7, 1.0) * this.haste;
          }
        }
        break;

      case 'rise': {
        // Up out of the rock at the spot he picked, head reared back.
        this.hx = approach(this.hx, this.riseX, 520 * dt);
        if (Math.abs(this.hx - this.riseX) < 4) {
          this.hy = approach(this.hy, this.floorY - SPIT_HEAD, 520 * dt);
          if (this.hy <= this.floorY - SPIT_HEAD + 2) {
            this.state = 'spitWind';
            this.timer = 0.72;
            audio.play('tell', 1.2);
          }
        } else {
          this.hy = approach(this.hy, this.floorY + DEPTH, 400 * dt);
        }
        break;
      }

      case 'spitWind':
        this.timer -= dt;
        this.throat = 1;
        this.jaw = Math.max(this.jaw, 0.5 + (1 - this.timer / 0.72) * 0.5);
        this.hy = this.floorY - SPIT_HEAD - Math.sin(this.anim * 6) * 3;
        if (this.timer <= 0) this.spit(world);
        break;

      case 'exposed':
        this.timer -= dt;
        // Head low and swaying, breathing smoke: the window.
        this.hy = approach(this.hy, this.floorY - LOW_HEAD - Math.sin(this.anim * 2.2) * 5, 260 * dt);
        this.hx += Math.sin(this.anim * 2.4) * 18 * dt;
        this.hangNeck(player);
        this.smoke(dt, world);
        if (this.timer <= 0) this.beginSink();
        break;

      case 'stuck':
        // Jaws in the rock where the head came down. It shakes, trying to
        // pull itself free, and that is all it can do.
        this.timer -= dt;
        this.hy = this.floorY - LIE;
        this.hx += Math.sin(this.anim * 21) * (this.timer < 0.4 ? 64 : 30) * dt;
        this.archTo(this.hole);
        this.smoke(dt, world);
        if (this.timer <= 0) this.beginSink();
        break;

      case 'stunned':
        this.timer -= dt;
        this.hx = approach(this.hx, this.slumpX, 420 * dt);
        this.hy = approach(this.hy, this.floorY - LIE, 900 * dt);
        this.archTo(this.hole);
        this.smoke(dt, world);
        if (this.timer <= 0) this.beginSink();
        break;

      case 'sink':
        this.hvy += 1500 * dt;
        this.hx = clamp(this.hx + this.hvx * dt, this.arenaLeft + 30, this.arenaRight - 30);
        this.hy += this.hvy * dt;
        if (this.hy > this.floorY + DEPTH) {
          this.hy = this.floorY + DEPTH;
          this.hvx = 0;
          this.hvy = 0;
          this.state = 'idle';
          this.timer = rand(0.6, 0.9) * this.haste;
        }
        break;

      case 'waveEdge': {
        const edge = this.waveDir > 0 ? this.arenaLeft + 30 : this.arenaRight - 30;
        this.swimUnder(dt, edge, 700);
        if (Math.abs(this.hx - edge) < 6) {
          this.state = 'waveWind';
          this.timer = 1.0;
          audio.play('rumble', 0.9);
          audio.play('tell', 0.5);
        }
        break;
      }

      case 'waveWind':
        this.timer -= dt;
        world.camera.addShake(0.6);
        if (this.timer <= 0) {
          this.state = 'wave';
          this.lastPillarX = this.hx;
          audio.play('burst', 0.8);
        }
        break;

      case 'wave': {
        this.hx += this.waveDir * (this.phaseTwo ? 420 : 360) * dt;
        this.hy = this.floorY + 34;
        if (Math.abs(this.hx - this.lastPillarX) >= 42) {
          this.lastPillarX = this.hx;
          this.pillars.push({ x: this.hx, t: 0, hit: false });
          if (this.pillars.length % 3 === 0) audio.play('burst', 1.4);
        }
        const end = this.waveDir > 0 ? this.arenaRight - 30 : this.arenaLeft + 30;
        if ((this.waveDir > 0 && this.hx >= end) || (this.waveDir < 0 && this.hx <= end)) {
          this.state = 'idle';
          this.timer = 1.1 * this.haste;
          this.hy = this.floorY + DEPTH;
        }
        break;
      }

      case 'dying':
        this.timer -= dt;
        this.cool = clamp(1 - this.timer / 2.4, 0, 1);
        if (this.timer < 1.2 && this.cinders.length === 0) this.crumble(world);
        for (const c of this.cinders) {
          c.vy += 1300 * dt;
          c.x += c.vx * dt;
          c.y += c.vy * dt;
          c.rot += c.spin * dt;
          if (c.y > this.floorY - c.r * 0.5) {
            c.y = this.floorY - c.r * 0.5;
            c.vy *= -0.2;
            c.vx *= 0.5;
          }
        }
        if (this.timer <= 0) {
          this.die(world);
          world.onBossFelled('wyrm', this.hx, Math.min(this.hy, this.floorY) - 60);
        }
        break;
    }

    // Body follows head.
    if (this.state !== 'dying') this.recordTrail();
    this.layBody();

    // Breaking the surface throws up rock and fire.
    const under = this.hy > this.floorY + 8;
    if (under !== this.wasUnder && this.state !== 'dying' && this.state !== 'dormant') {
      audio.play('burst', under ? 1.2 : 0.9);
      world.camera.addShake(under ? 3 : 6);
      world.particles.burst(this.hx, this.floorY - 4, 22, '#6a4a3e', { speed: 260, gravity: 900, size: 4, angle: -Math.PI / 2, spread: 2.2 });
      world.particles.burst(this.hx, this.floorY - 4, 16, '#ffae54', { speed: 240, gravity: 300, shape: 'spark', angle: -Math.PI / 2, spread: 2.4 });
      if (!under && this.state === 'breach' && !this.burstDone) {
        // The burst itself hurts, right where it comes through.
        this.burstDone = true;
        const p = world.player;
        if (!p.dead && Math.abs(p.cx - this.hx) < 44 && p.bottom > this.floorY - 120) {
          p.hurt(1, sign(p.cx - this.hx) || 1, world);
        }
      }
    }
    this.wasUnder = under;

    // The glow of him under the floor, where the floor is thin.
    if (under && this.state !== 'dormant' && this.state !== 'dying' && world.time % 0.05 < dt) {
      const hot = this.state === 'hunt' || this.state === 'waveWind';
      world.particles.spawn({
        x: this.hx + rand(-26, 26),
        y: this.floorY - 2,
        vx: rand(-20, 20),
        vy: -rand(40, hot ? 180 : 90),
        gravity: 120,
        color: Math.random() < 0.6 ? 'rgba(255,150,60,0.8)' : 'rgba(120,90,80,0.6)',
        size: rand(1.5, 3),
        life: 0.5,
        shape: Math.random() < 0.5 ? 'spark' : 'circle',
      });
    }

    // Keep the physics box on the head, so the game's culling and lights see
    // him where he actually is.
    this.x = this.hx - this.w / 2;
    this.y = Math.min(this.hy, this.floorY - 20) - this.h / 2;
  }

  private riseX = 0;

  private chooseMove(world: World): void {
    const player = world.player;
    const options = ['hunt', 'spit', 'hunt', 'wave'].filter((o) => o !== this.lastMove);
    let move = options[Math.floor(Math.random() * options.length)] ?? 'hunt';
    // Never two waves close together: it is the fight's longest move.
    if (move === 'wave' && this.waveCooldown > 0) move = 'spit';
    this.lastMove = move;
    this.waveCooldown = Math.max(0, this.waveCooldown - 1);
    switch (move) {
      case 'hunt':
        this.state = 'hunt';
        this.timer = 1.15 * this.haste;
        this.breaches = 0;
        audio.play('rumble', 1.2);
        break;
      case 'spit': {
        // Close enough to be reached well before the window shuts. It used to
        // be 230 to 300 px off, which is more than a second of running, and
        // then 150 to 200.
        const side = player.cx > (this.arenaLeft + this.arenaRight) / 2 ? -1 : 1;
        this.riseX = clamp(player.cx + side * rand(110, 150), this.arenaLeft + 60, this.arenaRight - 60);
        this.state = 'rise';
        audio.play('rumble', 1.4);
        break;
      }
      case 'wave':
        this.waveCooldown = 2;
        this.waveDir = player.cx > (this.arenaLeft + this.arenaRight) / 2 ? -1 : 1;
        this.pillars.length = 0;
        this.state = 'waveEdge';
        break;
    }
  }

  private waveCooldown = 1;

  /**
   * Clots of magma: one on the hero and the rest beyond him, away from the
   * head. They used to straddle him, so one of them always came down between
   * him and the head and its pool burned there for the whole of the window
   * after - measured, two thirds of what a hero lost to this fight he lost
   * walking through that fire to get at the head.
   */
  private spit(world: World): void {
    const player = world.player;
    const count = this.phaseTwo ? 5 : 3;
    const flight = 0.8;
    const away = sign(player.cx - this.hx) || 1;
    for (let i = 0; i < count; i++) {
      const tx = clamp(player.cx + away * i * (this.phaseTwo ? 58 : 70), this.arenaLeft + 20, this.arenaRight - 20);
      const vx = (tx - this.hx) / flight;
      const vy = (this.floorY - 10 - this.hy) / flight - 0.5 * 980 * flight;
      const glob = new Projectile('magma', this.hx - 9, this.hy - 9, vx, vy);
      world.spawnProjectile(glob);
      this.globs.push(glob);
    }
    this.jaw = 1;
    this.throat = 0;
    audio.play('fireball', 0.7);
    audio.play('bossRoar', 1.5);
    this.state = 'exposed';
    this.timer = EXPOSED * this.haste;
  }

  /** The head comes down out of a breach and sticks where it hit. */
  private stick(world: World): void {
    this.state = 'stuck';
    this.timer = STUCK * (this.phaseTwo ? 0.9 : 1);
    this.hy = this.floorY - LIE;
    this.hvx = 0;
    this.hvy = 0;
    this.jaw = 0.6;
    this.archTo(this.hole);
    audio.play('slam', 0.85);
    audio.play('crumble', 1.1);
    world.camera.addShake(6);
    world.hitStop(0.05);
    world.particles.burst(this.hx, this.floorY - 6, 20, '#6a4a3e', { speed: 230, gravity: 900, size: 4, angle: -Math.PI / 2, spread: 2.4 });
    world.particles.burst(this.hx, this.floorY - 6, 12, '#ffae54', { speed: 200, gravity: 300, shape: 'spark', angle: -Math.PI / 2, spread: 2.4 });
    world.particles.text(this.hx, this.floorY - 70, 'ER STECKT FEST!', '#ffd08a');
  }

  /**
   * Lays the body as an arch from the head back to where the neck goes into
   * the rock, and on down out of sight. A head on the floor with the body
   * standing straight up over it read as a pillar with a skull at its foot.
   */
  private archTo(holeX: number): void {
    const span = Math.abs(holeX - this.hx);
    this.layNeck(holeX, (this.hx + holeX) / 2, Math.min(this.hy, this.floorY) - 34 - span * 0.3);
  }

  /**
   * The neck of a head that hangs low after the spit: up out of the rock a
   * little behind it, and over, like a snake that has reared and is leaning
   * in. Following its own path up, the body stood as a column above the head.
   */
  private hangNeck(player: { cx: number }): void {
    const back = sign(this.hx - player.cx) || 1;
    const holeX = clamp(this.hx + back * 42, this.arenaLeft + 30, this.arenaRight - 30);
    this.layNeck(holeX, this.hx + back * 30, this.hy - 26);
  }

  /** A quadratic curve from the head through a control point into the floor at holeX. */
  private layNeck(holeX: number, mx: number, my: number): void {
    const x0 = this.hx;
    const y0 = this.hy;
    const x1 = holeX;
    const y1 = this.floorY + 8;
    const pts: Point[] = [];
    const steps = 36;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const u = 1 - t;
      pts.push({ x: u * u * x0 + 2 * u * t * mx + t * t * x1, y: u * u * y0 + 2 * u * t * my + t * t * y1 });
    }
    for (let d = 10; d <= 300; d += 10) pts.push({ x: x1, y: y1 + d });
    this.trail = pts;
  }

  /** Smoke off a head that has stopped moving: it reads as spent, and as hot. */
  private smoke(dt: number, world: World): void {
    if (world.time % 0.09 >= dt) return;
    world.particles.spawn({
      x: this.hx + rand(-14, 14),
      y: this.hy - 10,
      vx: rand(-12, 12),
      vy: -rand(30, 60),
      gravity: -30,
      color: Math.random() < 0.5 ? 'rgba(120,96,90,0.55)' : 'rgba(255,150,70,0.5)',
      size: rand(2.5, 4),
      life: 0.7,
      shape: 'circle',
    });
  }

  private beginSink(): void {
    this.state = 'sink';
    this.hvx = (this.hx < (this.arenaLeft + this.arenaRight) / 2 ? 1 : -1) * 200;
    this.hvy = -320;
  }

  /** Under the floor, towards a spot, at a speed. */
  private swimUnder(dt: number, targetX: number, speed: number): void {
    const x = clamp(targetX, this.arenaLeft + 30, this.arenaRight - 30);
    this.hvx = approach(this.hvx, sign(x - this.hx) * speed, speed * 4 * dt);
    if (Math.abs(x - this.hx) < 8) this.hvx *= 0.5;
    this.hx += this.hvx * dt;
    this.hy = approach(this.hy, this.floorY + DEPTH, 300 * dt);
  }

  private recordTrail(): void {
    const last = this.trail[0];
    if (!last || Math.hypot(this.hx - last.x, this.hy - last.y) >= 3) {
      this.trail.unshift({ x: this.hx, y: this.hy });
    }
    // Enough trail for the whole body, and no more.
    let len = 0;
    for (let i = 1; i < this.trail.length; i++) {
      len += Math.hypot(this.trail[i].x - this.trail[i - 1].x, this.trail[i].y - this.trail[i - 1].y);
      if (len > SEGMENTS * GAP + 60) {
        this.trail.length = i + 1;
        break;
      }
    }
  }

  /** The segments, one GAP apart along the trail behind the head. */
  private layBody(): void {
    const segs: Point[] = [];
    const head = { x: this.hx, y: this.hy };
    let want = GAP;
    let walked = 0;
    let prev = head;
    for (const p of this.trail) {
      const d = Math.hypot(p.x - prev.x, p.y - prev.y);
      while (d > 0 && walked + d >= want && segs.length < SEGMENTS) {
        const t = (want - walked) / d;
        segs.push({ x: prev.x + (p.x - prev.x) * t, y: prev.y + (p.y - prev.y) * t });
        want += GAP;
      }
      walked += d;
      prev = p;
      if (segs.length >= SEGMENTS) break;
    }
    while (segs.length < SEGMENTS) segs.push({ ...(segs[segs.length - 1] ?? head) });
    this.segs = segs;
  }

  private updateHazards(dt: number, world: World): void {
    for (let i = this.globs.length - 1; i >= 0; i--) {
      const g = this.globs[i];
      if (!g.dead) continue;
      this.globs.splice(i, 1);
      // A clot that came down on the floor keeps burning there.
      if (!g.friendly && Math.abs(g.bottom - this.floorY) < 30 && g.cx > this.arenaLeft && g.cx < this.arenaRight) {
        this.pools.push({ x: g.cx, life: 2.3 });
      }
    }
    for (const pool of this.pools) pool.life -= dt;
    for (let i = this.pools.length - 1; i >= 0; i--) if (this.pools[i].life <= 0) this.pools.splice(i, 1);
    for (const pillar of this.pillars) pillar.t += dt;
    for (let i = this.pillars.length - 1; i >= 0; i--) if (this.pillars[i].t > 0.8) this.pillars.splice(i, 1);
    if (this.pools.length > 0 && world.time % 0.07 < dt) {
      const pool = this.pools[Math.floor(Math.random() * this.pools.length)];
      world.particles.spawn({
        x: pool.x + rand(-16, 16),
        y: this.floorY - 3,
        vx: rand(-10, 10),
        vy: -rand(30, 80),
        gravity: -40,
        color: 'rgba(255,160,70,0.7)',
        size: rand(1.5, 3),
        life: 0.45,
        shape: 'circle',
      });
    }
  }

  /** Up out of the floor, then down again: 0 → 1 → 0 over a pillar's life. */
  private pillarPower(p: Pillar): number {
    const rise = clamp(p.t / 0.1, 0, 1);
    const fall = clamp((0.8 - p.t) / 0.25, 0, 1);
    return Math.min(rise, fall);
  }

  private crumble(world: World): void {
    audio.play('crumble', 0.8);
    audio.play('bossDown', 1.1);
    world.camera.addShake(8);
    this.cinders = this.segs
      .filter((s) => s.y < this.floorY + 10)
      .map((s, i) => ({
        x: s.x,
        y: s.y,
        vx: rand(-120, 120),
        vy: rand(-280, -60),
        r: this.segRadius(i) * 0.8,
        rot: rand(0, 6),
        spin: rand(-5, 5),
      }));
    if (this.hy < this.floorY + 10) {
      this.cinders.push({ x: this.hx, y: this.hy, vx: rand(-60, 60), vy: -200, r: 22, rot: 0, spin: rand(-3, 3) });
    }
    for (const c of this.cinders) world.particles.burst(c.x, c.y, 8, '#ff9a4a', { speed: 160, gravity: 300, shape: 'spark' });
  }

  override lights(): GlowLight[] {
    const out: GlowLight[] = [];
    const heat = 1 - this.cool;
    if (this.state === 'dormant') return out;
    if (this.headUp) {
      out.push({ x: this.hx, y: this.hy, radius: 150 * heat + 40, rgb: '255,140,60', strength: 0.75, tint: 0.35 });
    } else if (this.state !== 'dying') {
      const hot = this.state === 'hunt' ? (this.timer < LOCK ? 1.4 : 1) : 0.7;
      out.push({ x: this.hx, y: this.floorY - 10, radius: 110 * hot, rgb: '255,120,50', strength: 0.8, tint: 0.4 });
    }
    for (let i = 3; i < this.segs.length; i += 4) {
      const s = this.segs[i];
      if (s.y < this.floorY) out.push({ x: s.x, y: s.y, radius: 90 * heat, rgb: '255,120,50', strength: 0.55, tint: 0.3 });
    }
    for (const pool of this.pools) out.push({ x: pool.x, y: this.floorY - 8, radius: 70, rgb: '255,130,50', strength: 0.7, tint: 0.35 });
    for (const pillar of this.pillars) {
      const k = this.pillarPower(pillar);
      if (k > 0.1) out.push({ x: pillar.x, y: this.floorY - 40, radius: 110 * k, rgb: '255,150,60', strength: 0.8, tint: 0.4 });
    }
    return out;
  }

  /* -------------------------------------------------------------- drawing */

  override draw(ctx: CanvasRenderingContext2D): void {
    if (this.floorY === 0) return;
    this.drawGroundGlow(ctx);
    this.drawPools(ctx);
    if (this.cinders.length > 0) {
      this.drawCinders(ctx);
    } else if (this.state !== 'dormant') {
      ctx.save();
      // Everything under the floor stays under the floor.
      ctx.beginPath();
      ctx.rect(this.arenaLeft - 200, this.floorY - 900, this.arenaRight - this.arenaLeft + 400, 900);
      ctx.clip();
      this.drawBody(ctx);
      this.drawHead(ctx);
      ctx.restore();
    }
    this.drawPillars(ctx);
  }

  /** Where he is under the floor: the rock glowing, cracked, getting hotter. */
  private drawGroundGlow(ctx: CanvasRenderingContext2D): void {
    if (this.state === 'dormant' || this.state === 'dying' || this.hy < this.floorY + 8) return;
    const hunting = this.state === 'hunt';
    const locked = hunting && this.timer < LOCK;
    const hot = this.state === 'waveWind' ? 1 : hunting ? (locked ? 1 : 0.7) : 0.35;
    const x = this.hx;
    const y = this.floorY;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, x, y, 70 + hot * 50, `rgba(255,120,40,${(0.35 * hot).toFixed(3)})`);
    ctx.strokeStyle = `rgba(255,190,110,${(0.4 + hot * 0.5).toFixed(3)})`;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    const spread = 18 + hot * 26;
    for (let i = -2; i <= 2; i++) {
      const a = i * 0.55;
      ctx.beginPath();
      ctx.moveTo(x, y + 1);
      ctx.lineTo(x + Math.sin(a) * spread * 0.5, y + 4);
      ctx.lineTo(x + Math.sin(a) * spread, y + 1 + Math.abs(i) * 2);
      ctx.stroke();
    }
    if (locked) {
      ctx.fillStyle = 'rgba(255,240,200,0.55)';
      ctx.beginPath();
      ctx.ellipse(x, y, 34, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawPools(ctx: CanvasRenderingContext2D): void {
    if (this.pools.length === 0) return;
    ctx.save();
    for (const pool of this.pools) {
      const k = clamp(pool.life / 0.4, 0, 1);
      const g = ctx.createRadialGradient(pool.x, this.floorY, 0, pool.x, this.floorY, 30);
      g.addColorStop(0, `rgba(255,236,160,${(0.95 * k).toFixed(3)})`);
      g.addColorStop(0.5, `rgba(255,120,40,${(0.8 * k).toFixed(3)})`);
      g.addColorStop(1, 'rgba(120,30,10,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(pool.x, this.floorY - 1, 30, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      // Little tongues of flame on the pool.
      ctx.globalCompositeOperation = 'lighter';
      for (let i = -1; i <= 1; i++) {
        const fh = (10 + Math.sin(this.anim * 9 + pool.x * 0.1 + i * 2) * 5) * k;
        ctx.fillStyle = `rgba(255,170,70,${(0.6 * k).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(pool.x + i * 11 - 5, this.floorY - 1);
        ctx.quadraticCurveTo(pool.x + i * 11, this.floorY - fh * 1.6, pool.x + i * 11 + 5, this.floorY - 1);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }

  private drawPillars(ctx: CanvasRenderingContext2D): void {
    if (this.pillars.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.pillars) {
      const k = this.pillarPower(p);
      if (k <= 0.02) continue;
      const h = PILLAR_H * k;
      const top = this.floorY - h;
      const g = ctx.createLinearGradient(0, top, 0, this.floorY);
      g.addColorStop(0, 'rgba(255,120,40,0)');
      g.addColorStop(0.3, `rgba(255,150,60,${(0.75 * k).toFixed(3)})`);
      g.addColorStop(1, `rgba(255,236,170,${(0.95 * k).toFixed(3)})`);
      ctx.fillStyle = g;
      const wob = Math.sin(this.anim * 14 + p.x) * 4;
      ctx.beginPath();
      ctx.moveTo(p.x - PILLAR_W / 2, this.floorY);
      ctx.quadraticCurveTo(p.x - PILLAR_W * 0.55, this.floorY - h * 0.5, p.x + wob, top);
      ctx.quadraticCurveTo(p.x + PILLAR_W * 0.55, this.floorY - h * 0.5, p.x + PILLAR_W / 2, this.floorY);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = `rgba(255,252,230,${(0.7 * k).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(p.x - 7, this.floorY);
      ctx.quadraticCurveTo(p.x, this.floorY - h * 0.75, p.x + 7, this.floorY);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Obsidian plates, with the fire between them, tail to neck. */
  private drawBody(ctx: CanvasRenderingContext2D): void {
    const heat = 1 - this.cool;
    // The fire between the plates first, so the plates sit on it.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = this.segs.length - 1; i >= 0; i--) {
      const s = this.segs[i];
      if (s.y > this.floorY + 40) continue;
      const r = this.segRadius(i);
      glow(ctx, s.x, s.y, r * 1.9, `rgba(255,110,40,${(0.35 * heat).toFixed(3)})`);
    }
    ctx.restore();

    for (let i = this.segs.length - 1; i >= 0; i--) {
      const s = this.segs[i];
      if (s.y > this.floorY + 40) continue;
      const r = this.segRadius(i);
      const ahead = i === 0 ? { x: this.hx, y: this.hy } : this.segs[i - 1];
      const ang = Math.atan2(ahead.y - s.y, ahead.x - s.x);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(ang);
      // Keep the spines on top whichever way he is going.
      if (Math.cos(ang) < 0) ctx.scale(1, -1);

      // Molten core showing along the belly.
      ctx.fillStyle = heat > 0.2 ? `rgb(${Math.round(255 * heat + 70 * (1 - heat))},${Math.round(110 * heat + 60 * (1 - heat))},${Math.round(40 + 30 * (1 - heat))})` : '#46403c';
      ctx.beginPath();
      ctx.ellipse(0, r * 0.25, r * 1.02, r * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();

      // The plate: dark glass with a cold sheen on top.
      const plate = ctx.createLinearGradient(0, -r, 0, r * 0.6);
      plate.addColorStop(0, heat > 0.5 ? '#4a3a44' : '#5a5552');
      plate.addColorStop(0.45, '#221519');
      plate.addColorStop(1, '#0d0708');
      ctx.fillStyle = plate;
      ctx.beginPath();
      ctx.moveTo(-r * 1.05, r * 0.3);
      ctx.quadraticCurveTo(-r * 1.1, -r * 0.95, 0, -r);
      ctx.quadraticCurveTo(r * 1.1, -r * 0.95, r * 1.05, r * 0.3);
      ctx.quadraticCurveTo(0, r * 0.55, -r * 1.05, r * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(190,170,210,0.28)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-r * 0.8, -r * 0.55);
      ctx.quadraticCurveTo(0, -r * 0.95, r * 0.7, -r * 0.6);
      ctx.stroke();

      // A spine on every plate, leaning back.
      ctx.fillStyle = '#1a1014';
      ctx.beginPath();
      ctx.moveTo(-r * 0.35, -r * 0.85);
      ctx.lineTo(-r * 0.9, -r * 1.75);
      ctx.lineTo(r * 0.25, -r * 0.92);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = `rgba(255,150,70,${(0.55 * heat).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(-r * 0.4, -r * 0.95);
      ctx.lineTo(-r * 0.8, -r * 1.55);
      ctx.lineTo(-r * 0.2, -r * 0.98);
      ctx.closePath();
      ctx.fill();

      // Cracks where the fire gets through the glass.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(255,170,80,${(0.7 * heat).toFixed(3)})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-r * 0.5, -r * 0.2);
      ctx.lineTo(-r * 0.1, -r * 0.45);
      ctx.lineTo(r * 0.3, -r * 0.15);
      ctx.stroke();
      ctx.restore();
      ctx.restore();
    }
  }

  /** A long skull with swept horns and a jaw that drops when he spits. */
  private drawHead(ctx: CanvasRenderingContext2D): void {
    if (this.hy > this.floorY + 40) return;
    const heat = 1 - this.cool;
    const neck = this.segs[0] ?? { x: this.hx - 10, y: this.hy + 10 };
    let ang = Math.atan2(this.hy - neck.y, this.hx - neck.x);
    // Down on the floor he lies along it, facing away from his neck.
    if (this.state === 'stunned' || this.state === 'stuck') ang = this.hx > neck.x ? 0.1 : Math.PI - 0.1;
    const flip = Math.cos(ang) < 0;
    const flash = this.flash > 0 ? this.headFlash : 0;
    withHitFlash(ctx, flash, () => {
      ctx.save();
      ctx.translate(this.hx, this.hy);
      ctx.rotate(ang);
      if (flip) ctx.scale(1, -1);
      const jaw = this.jaw * 0.55;

      // Out and in reach: the fire in him shows through the skull, pulsing, so
      // the moment to strike reads from across the chamber.
      if (this.open && heat > 0.3) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const pulse = 0.5 + 0.5 * Math.sin(this.anim * 7);
        glow(ctx, 8, -6, 50 + pulse * 10, `rgba(255,214,140,${(0.2 + pulse * 0.16).toFixed(3)})`);
        ctx.restore();
      }

      // Fire in the mouth, seen when the jaw drops.
      if (jaw > 0.05 || this.throat > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, 22, 4, 26 + this.throat * 20, `rgba(255,170,70,${(0.6 * heat).toFixed(3)})`);
        ctx.restore();
      }

      // Lower jaw, hinged at the back of the skull.
      ctx.save();
      ctx.translate(-8, 6);
      ctx.rotate(jaw);
      ctx.fillStyle = '#1c1115';
      ctx.beginPath();
      ctx.moveTo(0, -2);
      ctx.lineTo(40, 2);
      ctx.lineTo(36, 9);
      ctx.lineTo(2, 10);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#f2dcc0';
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(10 + i * 7, 1);
        ctx.lineTo(13 + i * 7, -5);
        ctx.lineTo(16 + i * 7, 1);
        ctx.fill();
      }
      ctx.restore();

      // Skull.
      const skull = ctx.createLinearGradient(0, -22, 0, 10);
      skull.addColorStop(0, heat > 0.5 ? '#54424c' : '#5d5754');
      skull.addColorStop(0.5, '#23161a');
      skull.addColorStop(1, '#100809');
      ctx.fillStyle = skull;
      ctx.beginPath();
      ctx.moveTo(-26, 6);
      ctx.quadraticCurveTo(-28, -20, -4, -22);
      ctx.quadraticCurveTo(24, -20, 44, -6);
      ctx.lineTo(46, 2);
      ctx.quadraticCurveTo(20, 8, -26, 6);
      ctx.closePath();
      ctx.fill();
      // Upper teeth.
      ctx.fillStyle = '#f2dcc0';
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(14 + i * 7, 4);
        ctx.lineTo(17 + i * 7, 10);
        ctx.lineTo(20 + i * 7, 4);
        ctx.fill();
      }
      // Brow ridge and nostril.
      ctx.fillStyle = '#0c0607';
      ctx.beginPath();
      ctx.moveTo(-2, -16);
      ctx.quadraticCurveTo(12, -24, 22, -12);
      ctx.lineTo(4, -10);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = `rgba(255,140,60,${(0.8 * heat).toFixed(3)})`;
      ctx.fillRect(38, -6, 4, 2.5);

      // Horns: two sweeping back from the brow, one short one behind.
      ctx.fillStyle = '#2a1c20';
      ctx.beginPath();
      ctx.moveTo(-6, -18);
      ctx.quadraticCurveTo(-30, -34, -52, -30);
      ctx.quadraticCurveTo(-30, -24, -14, -10);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#3c2c30';
      ctx.beginPath();
      ctx.moveTo(-14, -12);
      ctx.quadraticCurveTo(-34, -18, -46, -8);
      ctx.quadraticCurveTo(-30, -12, -18, -4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(200,180,220,0.3)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-10, -20);
      ctx.quadraticCurveTo(-30, -31, -48, -29);
      ctx.stroke();

      // The eye: a slit of white-hot fire.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, 10, -12, 16, `rgba(255,190,90,${(0.8 * heat).toFixed(3)})`);
      ctx.fillStyle = `rgba(255,248,210,${(0.95 * heat).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(10, -12, 5, 2, -0.2, 0, Math.PI * 2);
      ctx.fill();
      // Cracks glowing along the skull.
      ctx.strokeStyle = `rgba(255,150,60,${(0.7 * heat).toFixed(3)})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-18, 0);
      ctx.lineTo(-10, -6);
      ctx.lineTo(-2, -2);
      ctx.lineTo(6, -6);
      ctx.stroke();
      ctx.restore();

      // Molten drool while the throat is full.
      if (this.throat > 0.2 || jaw > 0.3) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255,160,60,0.8)';
        const drip = 6 + Math.sin(this.anim * 8) * 3;
        ctx.beginPath();
        ctx.ellipse(30, 10 + jaw * 20 + drip * 0.5, 2.4, drip * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    });
  }

  private drawCinders(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    for (const c of this.cinders) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot);
      ctx.fillStyle = '#3d3432';
      ctx.beginPath();
      ctx.moveTo(-c.r, 0);
      ctx.lineTo(-c.r * 0.3, -c.r * 0.8);
      ctx.lineTo(c.r * 0.8, -c.r * 0.4);
      ctx.lineTo(c.r, c.r * 0.3);
      ctx.lineTo(0, c.r * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(255,120,50,${(0.5 * (1 - this.cool)).toFixed(3)})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-c.r * 0.5, 0);
      ctx.lineTo(c.r * 0.4, -c.r * 0.1);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
}
