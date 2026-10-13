import { audio } from '../core/audio';
import { Rect, approach, clamp, easeOut, lerp, rand, rectsOverlap, sign } from '../core/math';
import { RAMP } from '../render/palette';
import { ART, PixelSprite, snap } from '../render/pixel';
import type { Grid } from '../render/sheet';
import { shadow } from '../render/sprites';
import type { World } from '../world/context';
import { runLine } from './boss-pixels';
import { Enemy, type GlowLight } from './enemy';
import {
  CHIPS,
  SWIPE_TRAIL,
  TRAIL_KEY,
  crackGrid,
  crumbleOf,
  forget,
  frameOf,
  keyOf,
  overlay,
  prepare,
  shoulderOf,
  spriteOf,
  type CrackLevel,
  type Frame,
  type FrameName,
  type PaintName,
} from './gargoyle-art';
import type { Player } from './player';
import { Projectile } from './projectile';

/**
 * Health before the hero is sized up. He meets a hero with ten relics, so what
 * he really carries is about two thirds more (sizeUpFor): 133. Everything he
 * loses he loses cracked, or as the fall that cracks him, and a crack next to
 * that hero is worth about twenty - at the 52 he was sketched with, a reader
 * was done in 31 s, four cracks; at 80 it takes 44 to 49 s.
 */
const GARGOYLE_HP = 80;
/** He has no stagger - the crack is his window - but sizeUpFor wants a figure. */
const GARGOYLE_POISE = 8;
const W = 44;
const H = 58;
const INTRO = 1.5;
const DYING = 2.4;
/**
 * Within this many pixels of straight above or below the hero, the side he was
 * last clearly on still counts. Without it a statue the hero stands inside
 * flickers between stone and flesh with every pixel the hero drifts.
 */
const SIDE_SLACK = 3;
/**
 * A hero standing in him, this close to his middle, cannot turn his back on
 * him: there is no back to turn. Without it the blade found flesh - measured,
 * the bench's masher, carried in by the little hop every blow gives, stood in
 * the statue's middle with his eyes the wrong way and felled him in 58 s,
 * every point of it dealt in the frames he spent awake. 14 px is where a
 * sword swung away from him stops reaching him.
 */
const INSIDE = 14;
/** Watched this long on the ground, he spits: first half, second half. */
const STARE = 2.2;
const STARE_2 = 1.6;
/** The gurgle before the stream: water in his throat, dribbling over the lip. */
const GURGLE = 0.6;
const GOUTS = 5;
const GOUT_EVERY = 0.12;
/** How fast he scuttles after the hero's back - slower than the hero walks (235). */
const STALK = 170;
const STALK_2 = 190;
/** Centre to centre: this close to the hero's back he rears for the claw. */
const CLAW_REACH = 78;
const CLAW_TELL = 0.5;
const CLAW_STRIKE = 0.16;
/**
 * The step into the swipe, px/s while it lasts: 48 px, so the claws reach a
 * hero whose middle is 113 px off. One who walks on the moment the claws go
 * up is out of it; one who stands and only starts walking a third of a second
 * later is not - he has to turn round instead.
 */
const CLAW_LUNGE = 300;
const CLAW_RECOVER = 0.45;
/** Wings open, the screech: the one move that takes two hearts warns longest. */
const DIVE_TELL = 0.65;
const DIVE_TELL_2 = 0.55;
/** Up off the battlements, before he comes down. */
const RISE = 0.4;
const RISE_LOW = 150;
const RISE_HIGH = 180;
const DIVE_SPEED = 600;
const DIVE_SPEED_2 = 640;
/**
 * How far off the hero has to be for a dive: closer, he goes for the claw.
 * Further than DIVE_MAX he scuttles closer first: the camera leads the way the
 * hero walks, 82 px at a run, so a wind-up 420 px behind a hero walking away
 * from it began just off the edge of the view - a warning nobody can see.
 */
const DIVE_MIN = 140;
const DIVE_MAX = 360;
/** He only gurgles at a hero close enough to see him do it. */
const SPIT_RANGE = 400;
const DIVE_DAMAGE = 2;
/** On all fours after a dive or a glide that reached the floor. */
const LAND = 0.7;
const GLIDE_TELL = 0.5;
const GLIDE_SPEED = 430;
/**
 * How high his feet are in a glide. Tipped forward as he is, his belly
 * passes through the top third of a hero standing on the floor - his head.
 */
const GLIDE_ALT = 16;
const GLIDE_PAST = 200;
/** A statue that falls this far breaks; a shorter drop only jars it. */
const CRACK_FALL = 60;
const CRACKED = 2.6;
/** The last part of the crack, when it is closing again: the glow goes out. */
const MENDING = 0.4;
const GRAVITY = 1400;
const FALL_GRAVITY = 1600;
/** How often the blade on stone says so in words, and not only in sparks. */
const HINT_EVERY = 1.8;
/** The arena's title has the banner this long before the rule takes it over. */
const TITLE_TIME = 3.2;

/** Where his upper body pivots when he rears, in his own space (feet at 0, 0). */
const HIP = { x: -9, y: -18 };
const REAR_TILT = 0.62;
const HEAD = { x: 20, y: -47 };
/** A waterspout is mostly face: the head is a size up from the body. */
const HEAD_SCALE = 1.15;
/** The spout's lip, in the head's own space: where the water leaves him. */
const MOUTH = { x: 14 * HEAD_SCALE, y: 3 * HEAD_SCALE };
/** The eye, in the head's own space, as his frames draw it (gargoyle-art.ts): where its light sits. */
const EYE = { x: 9.8, y: -4.6 };

type GargoyleState =
  | 'dormant'
  | 'intro'
  | 'stone'
  | 'gurgle'
  | 'spit'
  | 'stalk'
  | 'clawWind'
  | 'claw'
  | 'clawRecover'
  | 'diveWind'
  | 'rise'
  | 'dive'
  | 'land'
  | 'glideWind'
  | 'glide'
  | 'fall'
  | 'cracked'
  | 'dying';

type AirMove = 'dive' | 'glide';

/** The flesh states he spends on the floor: looked at, he is stone where he stands. */
const FLESH_GROUND: ReadonlySet<GargoyleState> = new Set(['stalk', 'clawWind', 'claw', 'clawRecover', 'diveWind', 'land', 'glideWind']);
/** The flesh states he spends in the air: looked at, he drops. */
const FLESH_AIR: ReadonlySet<GargoyleState> = new Set(['rise', 'dive', 'glide']);
/** Stone on the floor, watched: turn away, and he is not. */
const STONE_GROUND: ReadonlySet<GargoyleState> = new Set(['stone', 'gurgle', 'spit']);
/** Where nothing gets through: stone that has not broken. */
const ARMOURED: ReadonlySet<GargoyleState> = new Set(['dormant', 'stone', 'gurgle', 'spit', 'fall']);

/** His body, as it is drawn and as it holds still: every value freezes with him. */
interface Pose {
  clock: number;
  gait: number;
  /** Wing beat phase, and how hard they beat. */
  wing: number;
  beat: number;
  /** 0 folded on his back, 1 open, 1.2 snapped wide. */
  spread: number;
  rear: number;
  crouch: number;
  swipe: number;
  jaw: number;
  /** 0 on his feet, 1 in flight: legs trailing, arms forward. */
  fly: number;
  /** 1 laid flat for the glide. */
  glide: number;
  /** The head's tilt: up for the screech, down into a dive. */
  head: number;
  /** The whole body's lean: nose up on the rise, down along a dive. */
  roll: number;
}

/** A crack across the statue, in his own space, for as long as he lies broken. */
interface Crack {
  pts: number[];
  w: number;
}

/** A chip of him on the battlements. */
interface Chip {
  x: number;
  y: number;
  r: number;
  a: number;
  shade: number;
}

/**
 * Grauwacht, der Wasserspeier - the gargoyle of the castle battlements, a
 * hundred winters on the wall and never once able to bear being looked at.
 *
 * His rule: Sieh ihn an, und er ist Stein. The hero looks where he last walked
 * (Math.sign(gargoyle - hero) === hero.facing), and whatever the hero looks at
 * is a statue: it does not move, and nothing gets through it - the blade
 * clangs, and so does the crescent of the Flutklinge. Turn your back and he is
 * flesh, and he comes for it:
 *
 *   Speien      - watched on the floor for 2.2 s (1.6 in his second half), the
 *                 stone gurgles (GURGLE) and five gouts of water arc onto where
 *                 the hero stands. Walking in under the arc keeps him stone;
 *                 walking away turns your back, and he wakes.
 *   Pirschen    - unwatched, he scuttles after the hero's back, slower than the
 *                 hero walks. Close behind him he rears (CLAW_TELL) and claws:
 *                 one heart. Turning round in the wind-up freezes him; walking
 *                 on takes the hero out of reach.
 *   Sturzflug   - further off (DIVE_MIN to DIVE_MAX), wings snap open with a
 *                 screech (DIVE_TELL), he climbs 150 to 180 px (RISE) and dives
 *                 at the hero: two hearts, the only move that takes two.
 *   Gleitflug   - from half health on: a skim across the arena at the hero's
 *                 head (GLIDE_TELL). Jump it, or freeze it - a glide frozen
 *                 drops him 16 px, and that breaks nothing. Whatever flies past
 *                 the hero flies into his eyes, so a glide that has gone by
 *                 ends as a statue in front of him anyway.
 *
 * Looked at in the air, he falls as stone. Sixty pixels and more, and the
 * statue breaks on the battlements: ZERSPRUNGEN, three and a bit damage for
 * the fall (6 from the top of a dive), and for CRACKED seconds every blow
 * lands, watched or not - the blade and the crescent alike. That is his
 * window: he has no stagger. A statue coming down on the hero takes a heart.
 * Then the cracks close, and he is whatever the hero's eyes make him. The
 * crescent of the Flutklinge, water, breaks off his flesh like rain off a
 * waterspout: it lands only where the blade would - see shrugCrescents.
 *
 * So the fight is a dance with one's own back: walk away from him to make him
 * fly, and turn round while he is high.
 *
 * Measured on the balance bench (verify:balance), with the ten relics a hero
 * carries here and his 80 sized up to 133: a reader who sees him 0.3 s late
 * fells him in 44 to 49 s, fifteen fights of fifteen without a heart lost -
 * every blow he has is announced half a second ahead and answered by one key,
 * and a bot never misses one; what a person loses here is reading the wrong
 * one. A hero who only ever faces him and swings takes 27 hearts and a silk's
 * catch in two minutes and not a point off him; one who stands still loses 11
 * a minute. At his first 52 the reader was done in 31 s: a crack next to a
 * hero with the Flutklinge is worth about twenty, the fall and the blows
 * together.
 */
export class Gargoyle extends Enemy {
  private state: GargoyleState = 'dormant';
  private timer = 0;
  private floorY = 0;
  private arenaLeft = 0;
  private arenaRight = 0;
  private phaseTwo = false;
  /** Which side of the hero he was last clearly on: 1 to the right of him. */
  private side: 1 | -1 = 1;
  /** Seconds watched as stone on the floor, towards STARE. */
  private stare = 0;
  /** Seconds since he last woke, and how long he scuttles before he may fly. */
  private awakeFor = 0;
  private flyAfter = 0.5;
  /** Seconds since the fight began, for the banner. */
  private sinceWake = 0;
  private hitThisMove = false;
  /** The air moves of this round in his second half. See drawAir. */
  private bag: AirMove[] = [];
  private lastAir: AirMove | null = null;
  private riseFrom = { x: 0, y: 0 };
  private riseTo = { x: 0, y: 0 };
  private glideTo = 0;
  /** Where the dive or the stream is going. */
  private target = { x: 0, y: 0 };
  private gouts = 0;
  private goutTimer = 0;
  /** Where his feet were when he turned to stone in the air. */
  private fallTop = 0;
  /** How far the last statue fell, and what the fall cost him - for verify:gargoyle. */
  lastFall = 0;
  lastFallDamage = 0;
  private cracks: Crack[] = [];
  private chips: Chip[] = [];
  private crackGlow = 0;
  private mending = false;
  private toldRule = false;
  private rulePending = false;
  private toldCrack = false;
  private hintTimer = 0;
  private crackleCd = 0;
  private rumbleCd = 0;
  /** 0 stone, 1 flesh, as he is drawn: stone comes at once, flesh warms. */
  private warmth = 0;
  /** The grey flash of turning to stone. */
  private wash = 0;
  /** How far a falling statue has tipped over. */
  private tumble = 0;
  /** Broken and settling: how far he has sagged. */
  private slump = 0;
  private crumble = 0;
  /** A puff of breath on the cold air, fading. */
  private breath = 0;
  /** Which set of cracks he wears, and their cells on each frame they have been drawn on - see draw. */
  private crackSerial = 0;
  private readonly crackGrids = new Map<string, Grid>();
  /** The heaps a dying statue comes apart into, step by step. */
  private readonly crumbled = new Map<string, Frame>();
  /** Asleep on the wall as every other gargoyle is: wings folded, head bowed. */
  private readonly pose: Pose = {
    clock: 0,
    gait: 0,
    wing: 0,
    beat: 0,
    spread: 0.04,
    rear: 0,
    crouch: 0.16,
    swipe: 0,
    jaw: 0.24,
    fly: 0,
    glide: 0,
    head: 0.14,
    roll: 0,
  };

  override castLight = false;

  constructor(x: number, y: number) {
    super('gargoyle', x, y);
    this.w = W;
    this.h = H;
    this.hp = this.maxHp = GARGOYLE_HP;
    this.scoreValue = 1000;
    this.aggroRange = 560;
    this.contactDamage = 0;
    this.facing = -1;
    // He keeps to the stone of the walk; the planks are the hero's, and a
    // statue falls through one as if it were not there.
    this.ignorePlatforms = true;
  }

  get phase(): 1 | 2 {
    return this.phaseTwo ? 2 : 1;
  }

  override barName(): string {
    return 'GRAUWACHT   ·   DER WASSERSPEIER';
  }

  override barPhase(): number {
    return this.phase;
  }

  protected override deathColor(): string {
    return '#9aa4b4';
  }

  private get haste(): number {
    return this.phaseTwo ? 0.85 : 1;
  }

  /** Stone that has not broken: nothing gets through it. */
  get armoured(): boolean {
    return ARMOURED.has(this.state);
  }

  /** Grey and still, broken or not: how he looks, which is what the hero reads. */
  get stone(): boolean {
    return this.warmth < 0.5;
  }

  /** How high his feet are off the battlements. */
  get height(): number {
    return Math.max(0, (this.floorY || this.bottom) - this.bottom);
  }

  /**
   * The rule: the hero looks the way he last walked, and whatever is on that
   * side of him is looked at.
   */
  private watchedBy(p: Player): boolean {
    if (p.dead) return false;
    const dx = this.cx - p.cx;
    if (Math.abs(dx) > SIDE_SLACK) this.side = dx > 0 ? 1 : -1;
    if (Math.abs(dx) < INSIDE && Math.abs(p.bottom - this.bottom) < 40 && !FLESH_AIR.has(this.state)) return true;
    return this.side === p.facing;
  }

  /* ------------------------------------------------------------ targeting */

  /** What a blow has to meet: him, laid flat in a glide, or the whole statue. */
  private bodyRect(): Rect {
    if (this.state === 'glide') return this.glideRect();
    return { x: this.x + 3, y: this.y + 4, w: this.w - 6, h: this.h - 4 };
  }

  /** The swipe: from his chest to a claw's length ahead of it, floor to shoulder. */
  private clawRect(): Rect {
    const reach = 50;
    return { x: this.facing > 0 ? this.cx + 6 : this.cx - 6 - reach, y: this.floorY - 50, w: reach, h: 50 };
  }

  private diveRect(): Rect {
    return { x: this.x + 6, y: this.y + 10, w: this.w - 12, h: this.h - 16 };
  }

  /**
   * Tipped forward in a glide: from his rump to the claws held out ahead, at
   * the height of the hero's head - 10 px of a hero standing on the floor.
   */
  private glideRect(): Rect {
    return { x: this.facing > 0 ? this.cx - 20 : this.cx - 56, y: this.bottom - 44, w: 76, h: 40 };
  }

  override overlaps(r: Rect): boolean {
    if (this.state === 'dormant' || this.state === 'intro' || this.state === 'dying') return false;
    return rectsOverlap(this.bodyRect(), r);
  }

  /**
   * Stone rings: the blade, the crescent it throws, anything. Broken stone
   * and flesh take what they are given.
   */
  override hurt(amount: number, fromDir: number, world: World): void {
    if (this.dead || this.state === 'dormant' || this.state === 'intro' || this.state === 'dying') return;
    if (this.armoured) {
      audio.play('clank', 0.95 + Math.random() * 0.1);
      world.particles.burst(this.cx - fromDir * 16, this.bottom - 30, 7, '#e8ecf2', {
        speed: 170,
        gravity: 320,
        shape: 'spark',
        angle: fromDir > 0 ? Math.PI : 0,
        spread: 1.5,
      });
      world.particles.burst(this.cx - fromDir * 14, this.bottom - 30, 4, '#8a929e', { speed: 90, gravity: 500, size: 2.5 });
      // No hit flash on stone: a flash says a blow went in. The sparks say it rang.
      if (this.hintTimer <= 0) {
        // A clank alone reads as a boss that cannot be hurt at all.
        this.hintTimer = HINT_EVERY;
        world.particles.text(this.cx, this.y - 18, 'STEIN!', '#d8dee8');
      }
      return;
    }
    this.wound(amount, world, fromDir);
  }

  private wound(amount: number, world: World, fromDir: number): void {
    this.hp -= amount;
    this.flash = 1;
    const broken = this.state === 'cracked';
    audio.play('bossHit', broken ? 0.82 : 1.05);
    const hx = this.cx - fromDir * 10;
    const hy = this.bottom - 28;
    world.particles.burst(hx, hy, broken ? 10 : 8, broken ? '#9aa3b0' : '#4a5262', { speed: 170, gravity: 520, size: 3 });
    if (broken) world.particles.burst(hx, hy, 6, '#ffc27a', { speed: 140, gravity: 120, shape: 'spark' });
    if (this.hp <= 0) {
      this.beginDying(world);
      return;
    }
    if (!this.phaseTwo && this.hp <= this.maxHp / 2) {
      this.phaseTwo = true;
      this.bag = [];
      audio.play('phase', 0.9);
      audio.play('bossRoar', 0.85);
      world.camera.addShake(6);
      world.particles.burst(this.cx, this.bottom - 40, 16, '#b8c0cc', { speed: 180, gravity: 500, size: 3 });
    }
  }

  /** Starts his fall, from whatever he is doing. Ends in die and onBossFelled. */
  beginDying(world: World): void {
    if (this.dead || this.state === 'dying') return;
    this.hp = 0;
    this.state = 'dying';
    this.timer = DYING;
    this.vx = 0;
    if (this.vy < 0) this.vy = 0;
    this.gouts = 0;
    this.warmth = 0;
    this.wash = 1;
    if (this.cracks.length === 0) this.makeCracks(9);
    this.crackGlow = 1;
    audio.play('crumble', 0.7);
    audio.play('bossRoar', 0.55);
    audio.play('slam', 0.7);
    world.camera.addShake(8);
    world.hitStop(0.14);
  }

  /**
   * Only what moves at the hero hurts: the swipe, the dive, the glide, and a
   * statue coming down on him. A statue standing, a gargoyle scuttling, a
   * broken one lying there: nothing.
   */
  override touchPlayer(world: World): void {
    const p = world.player;
    if (this.dead || p.dead || this.hitThisMove) return;
    let box: Rect | null = null;
    let damage = 1;
    switch (this.state) {
      case 'claw':
        box = this.clawRect();
        break;
      case 'dive':
        box = this.diveRect();
        damage = DIVE_DAMAGE;
        break;
      case 'glide':
        box = this.glideRect();
        break;
      case 'fall':
        if (this.vy > 150 && this.cy < p.cy) box = this.bodyRect();
        break;
    }
    if (!box || !rectsOverlap(box, p.rect)) return;
    // Rolled through it: that is a dodge, and the Gauklerschritt counts it.
    if (p.isDashing && p.invuln <= 0) {
      p.dodged(world);
      return;
    }
    if (p.parryTimer <= 0 && p.isInvulnerable) return;
    this.hitThisMove = true;
    p.hurt(damage, sign(p.cx - this.cx) || this.facing, world);
  }

  /* --------------------------------------------------------------- update */

  override update(dt: number, world: World): void {
    this.updateCommon(dt);
    // His frames, made ahead of need a little at a time - see prepare.
    prepare(2);
    const p = world.player;
    if (this.arenaRight === 0) {
      const arena = world.level.arenaAt(this.cx);
      this.arenaLeft = arena ? arena.left : this.cx - 560;
      this.arenaRight = arena ? arena.right : this.cx + 560;
      this.floorY = this.bottom;
      this.side = p.cx < this.cx ? 1 : -1;
    }
    this.hintTimer = Math.max(0, this.hintTimer - dt);
    this.crackleCd = Math.max(0, this.crackleCd - dt);
    this.rumbleCd = Math.max(0, this.rumbleCd - dt);
    this.wash = Math.max(0, this.wash - dt * 3.5);
    if (this.state !== 'dormant') this.sinceWake += dt;
    const watched = this.watchedBy(p);

    // The rule, before anything else he does in this frame.
    if (watched && FLESH_GROUND.has(this.state)) this.petrify(world);
    else if (watched && FLESH_AIR.has(this.state)) this.freezeInAir(world);
    else if (!watched && STONE_GROUND.has(this.state)) this.wakeUp(world);
    if (this.rulePending && !this.toldRule && this.sinceWake >= TITLE_TIME) {
      if (watched && STONE_GROUND.has(this.state) && Math.abs(p.cx - this.cx) <= 300) this.tellRule(world);
    }
    if (FLESH_GROUND.has(this.state) || FLESH_AIR.has(this.state)) this.shrugCrescents(dt, world);

    let gravity = GRAVITY;
    let flying = false;
    switch (this.state) {
      case 'dormant': {
        const inside = p.cx > this.arenaLeft + 16 && p.cx < this.arenaRight - 16;
        if (inside && Math.abs(p.cx - this.cx) < this.aggroRange && !p.dead) this.beginIntro(world);
        break;
      }

      case 'intro': {
        // The moss shivers, flakes of stone come off, and then the eyes.
        const before = this.timer;
        this.timer -= dt;
        if (world.time % 0.09 < dt) this.flake(world, 1);
        if (before > 0.9 && this.timer <= 0.9) {
          audio.play('screech', 0.7);
          audio.play('bossRoar', 1.15);
          world.camera.addShake(5);
          this.flake(world, 14);
        }
        if (this.timer < 0.9) this.warmth = approach(this.warmth, 1, dt * 2.6);
        if (this.timer <= 0) {
          this.warmth = 1;
          this.toStalk();
        }
        break;
      }

      case 'stone':
        this.vx = 0;
        if (this.onGround && Math.abs(p.cx - this.cx) <= SPIT_RANGE) this.stare += dt;
        if (this.stare >= (this.phaseTwo ? STARE_2 : STARE)) this.beginGurgle();
        break;

      case 'gurgle':
        // Water in the stone throat, bubbling over the lip of the spout.
        this.vx = 0;
        this.timer -= dt;
        if (world.time % 0.05 < dt) this.dribble(world, 1);
        if (world.time % 0.22 < dt) audio.play('splash', 0.45 + Math.random() * 0.1);
        if (this.timer <= 0) this.beginSpit(world);
        break;

      case 'spit':
        this.vx = 0;
        this.goutTimer -= dt;
        while (this.goutTimer <= 0 && this.gouts > 0) {
          this.emitGout(world);
          this.gouts--;
          this.goutTimer += GOUT_EVERY;
        }
        if (this.gouts <= 0 && this.goutTimer <= 0) {
          this.state = 'stone';
          this.stare = 0;
        }
        break;

      case 'stalk':
        this.stalk(dt, world);
        break;

      case 'clawWind':
        // Up on his hind legs, claws over his head.
        this.timer -= dt;
        this.vx = approach(this.vx, 0, 1600 * dt);
        if (this.timer <= 0) {
          this.state = 'claw';
          this.timer = CLAW_STRIKE;
          this.vx = this.facing * CLAW_LUNGE;
          this.hitThisMove = false;
          audio.play('swing', 0.62);
          audio.play('screech', 1.5);
        }
        break;

      case 'claw':
        this.timer -= dt;
        if (this.timer <= 0) {
          this.state = 'clawRecover';
          this.timer = CLAW_RECOVER * this.haste;
          this.vx *= 0.3;
          world.particles.burst(this.cx + this.facing * 34, this.floorY - 3, 8, '#8a929e', {
            speed: 140,
            gravity: 600,
            size: 2.5,
            angle: -Math.PI / 2,
            spread: 2,
          });
        }
        break;

      case 'clawRecover':
        this.timer -= dt;
        this.vx = approach(this.vx, 0, 900 * dt);
        if (this.timer <= 0) this.toStalk();
        break;

      case 'diveWind':
        // Wings snap open, the head goes back, the screech.
        this.timer -= dt;
        this.vx = approach(this.vx, 0, 1600 * dt);
        if (world.time % 0.06 < dt) this.kickDust(world, 1);
        if (this.timer <= 0) this.beginRise(world);
        break;

      case 'rise': {
        flying = true;
        this.timer -= dt;
        const t = clamp(1 - this.timer / RISE, 0, 1);
        const nx = lerp(this.riseFrom.x, this.riseTo.x, easeOut(t, 1.6));
        const ny = lerp(this.riseFrom.y, this.riseTo.y, easeOut(t, 2.2));
        this.vx = (nx - this.cx) / dt;
        this.vy = (ny - this.bottom) / dt;
        this.x = nx - this.w / 2;
        this.y = ny - this.h;
        if (this.timer <= 0) this.beginDive(world);
        break;
      }

      case 'dive':
        flying = true;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        if (world.time % 0.025 < dt) {
          world.particles.spawn({
            x: this.cx + rand(-10, 10),
            y: this.cy + rand(-12, 12),
            vx: -this.vx * 0.12,
            vy: -this.vy * 0.12,
            gravity: 0,
            color: 'rgba(170,184,206,0.45)',
            size: rand(2, 3.5),
            life: 0.28,
            shape: 'circle',
          });
        }
        if (this.bottom >= this.floorY) {
          this.y = this.floorY - this.h;
          this.landFromAir(world);
        }
        break;

      case 'land':
        this.timer -= dt;
        this.vx = approach(this.vx, 0, 700 * dt);
        if (this.timer <= 0 && this.onGround) this.toStalk();
        break;

      case 'glideWind':
        // Down on his belly, wings flat out to either side.
        this.timer -= dt;
        this.vx = approach(this.vx, 0, 1600 * dt);
        if (world.time % 0.07 < dt) this.kickDust(world, 1);
        if (this.timer <= 0) this.beginGlide(world);
        break;

      case 'glide': {
        flying = true;
        const alt = this.floorY - GLIDE_ALT;
        const ny = approach(this.bottom, alt, 520 * dt);
        this.vy = (ny - this.bottom) / dt;
        this.y = ny - this.h;
        this.x += this.vx * dt;
        if (world.time % 0.03 < dt) {
          world.particles.spawn({
            x: this.cx - this.facing * rand(10, 26),
            y: this.floorY - rand(1, 5),
            vx: -this.vx * 0.2,
            vy: -rand(20, 70),
            gravity: 300,
            color: 'rgba(150,160,176,0.5)',
            size: rand(2, 3.5),
            life: 0.35,
          });
        }
        const past = this.facing > 0 ? this.cx >= this.glideTo : this.cx <= this.glideTo;
        const wall = this.x <= this.arenaLeft + 1 || this.x + this.w >= this.arenaRight - 1;
        if (past || wall) {
          this.state = 'land';
          this.timer = LAND * 0.8 * this.haste;
          this.vx = this.facing * 140;
          this.vy = 0;
          audio.play('land', 0.6);
        }
        break;
      }

      case 'fall':
        gravity = FALL_GRAVITY;
        this.tumble = approach(this.tumble, 0.24, dt * 0.7);
        break;

      case 'cracked':
        this.timer -= dt;
        this.vx = approach(this.vx, 0, 900 * dt);
        if (!this.mending && this.timer <= MENDING) {
          // The stone grinds shut.
          this.mending = true;
          audio.play('crumble', 0.5);
          audio.play('rumble', 1.25);
        }
        if (this.mending) {
          // And settles back into its crouch as it closes, so that a statue
          // the hero is still looking at does not stand there in the shape
          // of the dive it fell out of.
          const k = (dt / MENDING) * 1.25;
          const P = this.pose;
          this.slump = approach(this.slump, 0, k);
          this.tumble = approach(this.tumble, 0, k * 0.3);
          P.roll = approach(P.roll, 0, k * 0.6);
          P.fly = approach(P.fly, 0, k);
          P.glide = approach(P.glide, 0, k);
          P.beat = approach(P.beat, 0, k);
        } else {
          this.slump = approach(this.slump, 1, dt * 5);
        }
        this.crackGlow = this.mending ? clamp(this.timer / MENDING, 0, 1) : 0.75 + 0.25 * Math.sin(this.anim * 7);
        if (world.time % 0.18 < dt) {
          world.particles.spawn({
            x: this.cx + rand(-18, 18),
            y: this.bottom - rand(10, 44),
            vx: rand(-20, 20),
            vy: -rand(10, 40),
            gravity: 500,
            color: Math.random() < 0.5 ? '#8f98a5' : '#6d7682',
            size: rand(1.5, 3),
            life: 0.6,
          });
        }
        if (this.timer <= 0) this.mend(world, watched);
        break;

      case 'dying': {
        this.timer -= dt;
        this.vx = approach(this.vx, 0, 600 * dt);
        this.crumble = clamp(1 - this.timer / DYING, 0, 1);
        this.slump = approach(this.slump, 1, dt * 2);
        this.crackGlow = 0.6 + 0.4 * Math.sin(this.anim * 11);
        if (world.time % 0.07 < dt) {
          world.particles.spawn({
            x: this.cx + rand(-22, 22),
            y: this.bottom - rand(6, 50) * (1 - this.crumble * 0.6),
            vx: rand(-60, 60),
            vy: -rand(20, 120),
            gravity: 700,
            color: Math.random() < 0.6 ? '#8f98a5' : '#5f6874',
            size: rand(2, 4.5),
            life: rand(0.5, 0.9),
          });
          if (Math.random() < 0.35) audio.play('crumble', 1.1 + Math.random() * 0.4);
        }
        if (this.timer <= 0) {
          world.particles.burst(this.cx, this.bottom - 20, 30, '#8f98a5', { speed: 240, gravity: 700, size: 4.5 });
          world.particles.burst(this.cx, this.bottom - 20, 16, 'rgba(210,216,226,0.6)', { speed: 120, gravity: -30, size: 6, shape: 'circle' });
          world.particles.burst(this.cx, this.bottom - 24, 12, '#ffc27a', { speed: 180, gravity: 100, shape: 'spark' });
          this.die(world);
          world.onBossFelled('gargoyle', this.cx, this.y - 30);
        }
        break;
      }
    }

    if (!this.stoneState) this.animate(dt);
    // Flesh warms out of the stone in a fifth of a second; stone comes at once.
    if (FLESH_GROUND.has(this.state) || FLESH_AIR.has(this.state)) this.warmth = approach(this.warmth, 1, dt * 5);

    if (!flying) {
      this.vy = Math.min(this.vy + gravity * dt, 1400);
      this.moveAndCollide(world.level, dt);
    }
    this.x = clamp(this.x, this.arenaLeft, this.arenaRight - this.w);
    if (this.state === 'fall' && this.onGround) this.landStone(world, watched);
  }

  /** States in which he is a statue, and his body holds whatever pose it had. */
  private get stoneState(): boolean {
    return ARMOURED.has(this.state) || this.state === 'cracked' || this.state === 'dying';
  }

  /* ----------------------------------------------------------- the rule */

  /** Looked at on the floor: stone where he stands, mid-step, mid-claw, mid-screech. */
  private petrify(world: World): void {
    this.state = 'stone';
    this.timer = 0;
    this.vx = 0;
    this.stare = 0;
    this.gouts = 0;
    this.hitThisMove = true;
    this.turnToStone(world);
  }

  /** Looked at in the air: stone where he hangs, and down he goes. */
  private freezeInAir(world: World): void {
    this.state = 'fall';
    this.fallTop = this.bottom;
    this.vx = 0;
    this.vy = 0;
    this.tumble = 0;
    // The statue's own fall can still land on the hero, once.
    this.hitThisMove = false;
    this.turnToStone(world);
  }

  /** The crackle and the grey wash: stone, at once. */
  private turnToStone(world: World): void {
    this.warmth = 0;
    this.wash = 1;
    if (this.crackleCd <= 0) {
      this.crackleCd = 0.14;
      audio.play('crumble', 1.75);
    }
    for (let i = 0; i < 10; i++) {
      world.particles.spawn({
        x: this.cx + rand(-20, 20),
        y: this.bottom - rand(6, 54),
        vx: rand(-40, 40),
        vy: -rand(10, 50),
        gravity: 140,
        color: Math.random() < 0.5 ? 'rgba(200,206,216,0.7)' : 'rgba(150,158,170,0.65)',
        size: rand(1.5, 3),
        life: rand(0.35, 0.6),
        shape: 'circle',
        drag: 0.9,
      });
    }
    const p = world.player;
    if (!this.toldRule && Math.abs(p.cx - this.cx) <= 300 && this.state !== 'fall') {
      if (this.sinceWake >= TITLE_TIME) this.tellRule(world);
      else this.rulePending = true;
    }
  }

  /**
   * The blade's crescent lands only where the blade itself would: on broken
   * stone. On flesh it breaks like water off a waterspout. It flies for 0.4 s,
   * long enough to be thrown at a statue and arrive at a gargoyle - measured,
   * a hero who swung at him from 100 px and turned his back as each crescent
   * left took 17 off him in 20 s and never a heart, the crack never needed.
   * (On whole stone it rings as everything does - see hurt.)
   */
  private shrugCrescents(dt: number, world: World): void {
    const box = this.bodyRect();
    for (const q of world.projectiles) {
      if (q.dead || !q.friendly || q.kind !== 'beam') continue;
      const next = { x: q.x + q.vx * dt, y: q.y + q.vy * dt, w: q.w, h: q.h };
      if (!rectsOverlap(next, box) && !rectsOverlap(q.rect, box)) continue;
      q.dead = true;
      world.particles.burst(q.cx, q.cy, 10, q.water ? 'rgba(170,236,226,0.8)' : 'rgba(200,236,255,0.8)', {
        speed: 150,
        gravity: 400,
        shape: 'circle',
        size: 2.5,
      });
      if (this.crackleCd <= 0) audio.play('splash', 1.3);
    }
  }

  /** The rule, said once: the first time he turns to stone in front of the hero. */
  private tellRule(world: World): void {
    this.toldRule = true;
    this.rulePending = false;
    world.announce('SIEH IHN AN, UND ER IST STEIN', 3.6);
  }

  /** Not looked at: the stone warms, and he moves. */
  private wakeUp(world: World): void {
    this.state = 'stalk';
    this.timer = 0;
    this.stare = 0;
    this.gouts = 0;
    this.awakeFor = 0;
    this.flyAfter = rand(0.35, 0.8) * this.haste;
    if (this.rumbleCd <= 0) {
      this.rumbleCd = 0.3;
      audio.play('rumble', 1.7);
    }
    this.flake(world, 4);
  }

  private beginIntro(world: World): void {
    this.engaged = true;
    this.sizeUpFor(world, GARGOYLE_POISE);
    this.state = 'intro';
    this.timer = INTRO;
    this.sinceWake = 0;
    this.facing = world.player.cx > this.cx ? 1 : -1;
    audio.play('rumble', 0.8);
    world.camera.addShake(4);
  }

  private toStalk(): void {
    this.state = 'stalk';
    this.timer = 0;
  }

  /**
   * Unwatched on the floor: after the hero's back. Close behind it, the claw;
   * far enough off, and once he has scuttled a moment, the air.
   */
  private stalk(dt: number, world: World): void {
    const p = world.player;
    const dx = p.cx - this.cx;
    const dist = Math.abs(dx);
    const dir = sign(dx) || this.facing;
    this.awakeFor += dt;
    this.facing = dir > 0 ? 1 : -1;
    // Within a stride of the floor counts as on it: a hop is no escape.
    const low = p.bottom >= this.floorY - 24;
    if (!p.dead && low && dist <= CLAW_REACH) {
      this.beginClawWind();
      return;
    }
    if (!p.dead && this.awakeFor >= this.flyAfter && dist >= DIVE_MIN && dist <= DIVE_MAX) {
      if (this.drawAir(low) === 'glide') this.beginGlideWind();
      else this.beginDiveWind(world);
      return;
    }
    // Up on a plank right over him, he backs off for the room a dive needs.
    const want = !low && dist < DIVE_MIN + 20 ? -dir : dir;
    const speed = this.phaseTwo ? STALK_2 : STALK;
    this.vx = approach(this.vx, want * speed, 1000 * dt);
    if (world.time % 0.11 < dt && this.onGround && Math.abs(this.vx) > 60) this.kickDust(world, 1);
  }

  /**
   * In his first half he only dives. In his second, dives and glides by the
   * round - two of each, shuffled, never the same twice running across rounds
   * - and a hero up on a plank only ever gets the dive: a glide at the height
   * of a head on the floor is no glide at one up there.
   */
  private drawAir(low: boolean): AirMove {
    if (!this.phaseTwo || !low) return 'dive';
    if (this.bag.length === 0) {
      this.bag = ['dive', 'glide', 'dive', 'glide'];
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
      const top = this.bag.length - 1;
      if (this.bag[top] === this.lastAir) {
        const other = this.bag.findIndex((m) => m !== this.lastAir);
        if (other >= 0) [this.bag[other], this.bag[top]] = [this.bag[top], this.bag[other]];
      }
    }
    let i = this.bag.length - 1;
    if (this.bag[i] === this.lastAir) {
      const other = this.bag.findIndex((m) => m !== this.lastAir);
      if (other >= 0) i = other;
    }
    const move = this.bag.splice(i, 1)[0] ?? 'dive';
    this.lastAir = move;
    return move;
  }

  private beginClawWind(): void {
    this.state = 'clawWind';
    this.timer = CLAW_TELL;
    this.hitThisMove = true;
    audio.play('tellLunge', 1.3);
    audio.play('wing', 1.3);
  }

  private beginDiveWind(world: World): void {
    this.state = 'diveWind';
    this.timer = this.phaseTwo ? DIVE_TELL_2 : DIVE_TELL;
    this.facing = world.player.cx > this.cx ? 1 : -1;
    this.hitThisMove = true;
    audio.play('tellSlam', 0.8);
    audio.play('screech', 0.85);
    audio.play('wing', 0.75);
    this.kickDust(world, 6);
  }

  /** Up off the walk: 150 to 180 px, and a little way towards the hero. */
  private beginRise(world: World): void {
    const p = world.player;
    const dx = p.cx - this.cx;
    let lift = rand(RISE_LOW, RISE_HIGH);
    // One up on a plank is dived at from above him too.
    const up = this.floorY - p.bottom;
    if (up > 30) lift = Math.min(300, Math.max(lift, up + 70));
    this.riseFrom = { x: this.cx, y: this.bottom };
    this.riseTo = {
      x: clamp(this.cx + clamp(dx * 0.22, -80, 80), this.arenaLeft + W, this.arenaRight - W),
      y: this.floorY - lift,
    };
    this.state = 'rise';
    this.timer = RISE;
    audio.play('wing', 0.6);
    audio.play('jump', 0.5);
    world.particles.burst(this.cx, this.floorY - 2, 14, 'rgba(160,168,180,0.7)', { speed: 170, gravity: 300, angle: -Math.PI / 2, spread: Math.PI });
  }

  /** From the top of the climb, straight at where the hero is now. */
  private beginDive(world: World): void {
    const p = world.player;
    this.target = { x: clamp(p.cx, this.arenaLeft + W / 2, this.arenaRight - W / 2), y: Math.min(p.bottom, this.floorY) };
    let ddx = this.target.x - this.cx;
    const ddy = Math.max(30, this.target.y - this.bottom);
    if (Math.abs(ddx) < 1) ddx = this.facing;
    const len = Math.hypot(ddx, ddy);
    const speed = this.phaseTwo ? DIVE_SPEED_2 : DIVE_SPEED;
    this.vx = (ddx / len) * speed;
    this.vy = (ddy / len) * speed;
    this.facing = ddx > 0 ? 1 : -1;
    this.state = 'dive';
    this.hitThisMove = false;
    audio.play('dash', 0.6);
    audio.play('wing', 0.5);
  }

  private landFromAir(world: World): void {
    this.state = 'land';
    this.timer = LAND * this.haste;
    this.vx = sign(this.vx) * 120;
    this.vy = 0;
    audio.play('slam', 1.25);
    world.camera.addShake(4);
    world.particles.burst(this.cx, this.floorY - 2, 16, '#7c8490', { speed: 200, gravity: 500, angle: -Math.PI / 2, spread: Math.PI });
  }

  private beginGlideWind(): void {
    this.state = 'glideWind';
    this.timer = GLIDE_TELL;
    this.hitThisMove = true;
    audio.play('tellLunge', 1.05);
    audio.play('wing', 0.9);
  }

  /** Flat out across the walk at the height of a head, and on past the hero. */
  private beginGlide(world: World): void {
    const p = world.player;
    this.facing = p.cx >= this.cx ? 1 : -1;
    this.glideTo = clamp(p.cx + this.facing * GLIDE_PAST, this.arenaLeft + W / 2 + 4, this.arenaRight - W / 2 - 4);
    this.vx = this.facing * GLIDE_SPEED;
    this.vy = 0;
    this.state = 'glide';
    this.hitThisMove = false;
    audio.play('dash', 0.75);
    audio.play('wing', 0.55);
  }

  /** Down on the walk as stone: from high enough, he breaks. */
  private landStone(world: World, watched: boolean): void {
    const drop = this.bottom - this.fallTop;
    this.vx = 0;
    this.vy = 0;
    this.lastFall = Math.round(drop);
    if (drop >= CRACK_FALL) {
      this.crack(world, drop);
      return;
    }
    // A jolt, no more.
    this.state = 'stone';
    this.stare = 0;
    this.tumble = 0;
    this.lastFallDamage = 0;
    audio.play('slam', 1.55);
    world.camera.addShake(2);
    world.particles.burst(this.cx, this.floorY - 2, 8, '#7c8490', { speed: 120, gravity: 500, angle: -Math.PI / 2, spread: Math.PI });
    if (!watched) this.wakeUp(world);
  }

  /** ZERSPRUNGEN: the fall's damage, and for a while every blow lands. */
  private crack(world: World, drop: number): void {
    const damage = Math.round(3 + Math.min(drop, 200) / 60);
    this.lastFallDamage = damage;
    this.state = 'cracked';
    this.timer = CRACKED;
    this.warmth = 0;
    this.mending = false;
    this.slump = 0;
    this.makeCracks(6);
    this.crackGlow = 1;
    audio.play('slam', 0.8);
    audio.play('crumble', 0.85);
    world.camera.addShake(8);
    world.hitStop(0.08);
    world.particles.burst(this.cx, this.floorY - 4, 22, '#8f98a5', { speed: 230, gravity: 650, size: 4, angle: -Math.PI / 2, spread: Math.PI * 0.9 });
    world.particles.burst(this.cx, this.floorY - 6, 14, 'rgba(206,212,222,0.55)', { speed: 150, gravity: 60, size: 6, shape: 'circle' });
    world.particles.burst(this.cx, this.bottom - 28, 12, '#ffc27a', { speed: 190, gravity: 200, shape: 'spark' });
    world.particles.text(this.cx, this.y - 22, 'ZERSPRUNGEN!', '#ffc98a');
    if (!this.toldCrack) {
      this.toldCrack = true;
      world.announce('KEHR IHM DEN RÜCKEN — UND DREH DICH, WENN ER FLIEGT', 4);
    }
    this.wound(damage, world, 0);
  }

  /** The cracks close: stone if the hero is looking, flesh if not. */
  private mend(world: World, watched: boolean): void {
    this.cracks = [];
    this.chips = [];
    this.crackGlow = 0;
    this.slump = 0;
    this.tumble = 0;
    if (watched) {
      this.state = 'stone';
      this.stare = 0;
    } else {
      this.wakeUp(world);
    }
  }

  private beginGurgle(): void {
    this.state = 'gurgle';
    this.timer = GURGLE;
    audio.play('tellBeam', 0.9);
    audio.play('splash', 0.5);
  }

  /** The stream starts: aimed at where the hero stands right now. */
  private beginSpit(world: World): void {
    const p = world.player;
    this.target = { x: p.cx, y: p.cy };
    this.state = 'spit';
    this.gouts = GOUTS;
    this.goutTimer = 0;
    audio.play('splash', 0.7);
  }

  /**
   * One gout on its arc. The five walk outwards along the line a little, so
   * the stream covers the spot rather than a point - and a hero walking in
   * under it has the whole of it come down behind him.
   */
  private emitGout(world: World): void {
    const m = this.mouthWorld();
    const i = GOUTS - this.gouts;
    const away = sign(this.target.x - m.x) || this.facing;
    const tx = this.target.x + (i - 2) * 9 * away;
    const ty = this.target.y;
    const flight = clamp(0.42 + Math.abs(tx - m.x) / 800, 0.42, 0.85);
    const vx = (tx - m.x) / flight;
    const vy = (ty - m.y) / flight - 0.5 * 900 * flight;
    const gout = new Projectile('spout', m.x - 7, m.y - 7, vx, vy);
    // A gout of water is not something a blade bats away.
    gout.deflectable = false;
    world.spawnProjectile(gout);
    audio.play('splash', 1.05 + i * 0.06);
    world.particles.burst(m.x, m.y, 4, 'rgba(170,215,240,0.8)', { speed: 90, gravity: 500, size: 2.5, shape: 'circle' });
  }

  /* --------------------------------------------------------- animation */

  /** His body, while it is his: everything here holds still the moment he is stone. */
  private animate(dt: number): void {
    const P = this.pose;
    P.clock += dt;
    P.gait += (dt * Math.abs(this.vx)) / 7;
    let spread = 0.22 + Math.max(0, Math.sin(P.clock * 2.3)) * 0.06;
    let rear = 0;
    let crouch = 0.1;
    let swipe = 0;
    let jaw = 0.32 + Math.sin(P.clock * 1.7) * 0.04;
    let fly = 0;
    let glideK = 0;
    let head = Math.sin(P.clock * 1.3) * 0.04;
    let roll = 0;
    let beat = 0;
    let rate = 0;
    switch (this.state) {
      case 'intro':
        spread = this.timer < 0.9 ? 1.05 : 0.08;
        jaw = this.timer < 0.9 ? 0.85 : 0.3;
        head = this.timer < 0.9 ? -0.3 : 0;
        break;
      case 'stalk':
        crouch = 0.22;
        spread = 0.3 + Math.sin(P.clock * 6) * 0.05;
        break;
      case 'clawWind':
        rear = 1;
        spread = 0.6;
        jaw = 0.7;
        head = -0.1;
        break;
      case 'claw':
        rear = 0.25;
        swipe = 1;
        spread = 0.55;
        jaw = 0.55;
        head = 0.15;
        break;
      case 'clawRecover':
        swipe = 0.55;
        crouch = 0.35;
        spread = 0.35;
        break;
      case 'diveWind':
        crouch = 0.75;
        spread = 1.22;
        jaw = 0.9;
        head = -0.35;
        break;
      case 'rise':
        fly = 1;
        spread = 1.0;
        beat = 1;
        rate = 17;
        jaw = 0.5;
        roll = -0.32;
        head = -0.1;
        break;
      case 'dive':
        fly = 1;
        spread = 0.42;
        jaw = 0.8;
        head = 0.2;
        roll = Math.atan2(this.vy, Math.abs(this.vx)) * 0.7;
        break;
      case 'land':
        crouch = 0.55;
        spread = 0.65;
        jaw = 0.45;
        break;
      case 'glideWind':
        // Low on his belly, wings swept back flat - not up, as for a dive.
        crouch = 0.9;
        spread = 1.0;
        glideK = 0.75;
        jaw = 0.6;
        head = 0.1;
        roll = 0.12;
        break;
      case 'glide':
        // Tipped forward, claws out ahead, wings flat behind.
        fly = 1;
        glideK = 1;
        spread = 1.05;
        beat = 0.18;
        rate = 11;
        jaw = 0.6;
        roll = 0.42;
        head = -0.38;
        break;
    }
    const k = (v: number, to: number, speed: number): number => approach(v, to, dt * speed);
    // Wings snap open fast and fold slowly: the snap is the tell.
    P.spread = k(P.spread, spread, spread > P.spread ? 9 : 3);
    P.rear = k(P.rear, rear, 1 / (CLAW_TELL * 0.55));
    P.crouch = k(P.crouch, crouch, 4);
    P.swipe = k(P.swipe, swipe, swipe > P.swipe ? 1 / (CLAW_STRIKE * 0.6) : 3);
    P.jaw = k(P.jaw, jaw, 4);
    P.fly = k(P.fly, fly, 6);
    P.glide = k(P.glide, glideK, 6);
    P.head = k(P.head, head, 3);
    P.roll = k(P.roll, roll, 5);
    P.beat = k(P.beat, beat, 5);
    P.wing += dt * rate;
    if (this.state === 'stalk' || this.state === 'land') {
      // Breath on the cold air, now and then.
      if (P.clock % 1.3 < dt) this.breath = 1;
    }
    this.breath = Math.max(0, this.breath - dt * 1.6);
  }

  /* -------------------------------------------------------------- effects */

  /** Flakes of stone shaken off the stone skin. */
  private flake(world: World, n: number): void {
    for (let i = 0; i < n; i++) {
      world.particles.spawn({
        x: this.cx + rand(-20, 20),
        y: this.bottom - rand(10, 56),
        vx: rand(-60, 60),
        vy: -rand(20, 90),
        gravity: 600,
        color: Math.random() < 0.5 ? '#9aa3b0' : '#6f7884',
        size: rand(1.5, 3),
        life: rand(0.4, 0.7),
      });
    }
  }

  private kickDust(world: World, n: number): void {
    for (let i = 0; i < n; i++) {
      world.particles.spawn({
        x: this.cx + rand(-16, 16),
        y: this.floorY - 2,
        vx: rand(-90, 90),
        vy: -rand(20, 80),
        gravity: 300,
        color: Math.random() < 0.5 ? 'rgba(150,158,170,0.6)' : 'rgba(110,118,130,0.55)',
        size: rand(2, 3.5),
        life: 0.45,
      });
    }
  }

  /** Water over the lip of the spout. */
  private dribble(world: World, n: number): void {
    const m = this.mouthWorld();
    for (let i = 0; i < n; i++) {
      world.particles.spawn({
        x: m.x + rand(-2, 2),
        y: m.y + rand(-1, 2),
        vx: this.facing * rand(10, 40),
        vy: rand(-20, 30),
        gravity: 700,
        color: Math.random() < 0.6 ? 'rgba(160,210,236,0.85)' : 'rgba(220,240,250,0.8)',
        size: rand(1.5, 2.8),
        life: rand(0.35, 0.6),
        shape: 'circle',
      });
    }
  }

  /** Cracks across the statue, from the head and the shoulders down. */
  private makeCracks(n: number): void {
    // The last set's sprites are done with.
    forget(`${this.crackId()}|`);
    this.crackSerial++;
    this.crackGrids.clear();
    this.crumbled.clear();
    this.cracks = [];
    const starts: [number, number][] = [
      [20, -54],
      [6, -46],
      [-8, -40],
      [-14, -24],
      [14, -30],
      [-2, -30],
      [-20, -50],
      [24, -40],
      [0, -14],
    ];
    for (let c = 0; c < n; c++) {
      const [sx, sy] = starts[c % starts.length];
      const pts = [sx + rand(-3, 3), sy + rand(-3, 3)];
      let x = pts[0];
      let y = pts[1];
      let a = rand(0.6, 2.5);
      const steps = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < steps; i++) {
        a += rand(-0.7, 0.7);
        const len = rand(4, 9);
        x = clamp(x + Math.cos(a) * len, -24, 30);
        y = clamp(y + Math.sin(a) * len, -62, -3);
        pts.push(x, y);
      }
      this.cracks.push({ pts, w: rand(0.9, 1.6) });
    }
    this.chips = [];
    for (let i = 0; i < 9; i++) {
      this.chips.push({ x: rand(-34, 34), y: rand(-1, 1), r: rand(1.6, 3.6), a: rand(0, Math.PI), shade: Math.random() });
    }
  }

  /* -------------------------------------------------------------- space */

  /**
   * A point of his own space (feet at 0, 0, facing +x) in the world, through
   * the same transforms the drawing uses. `upper` for what rears with his
   * shoulders.
   */
  private toWorld(lx: number, ly: number, upper: boolean): { x: number; y: number } {
    const P = this.pose;
    let x = lx;
    let y = ly;
    if (upper && P.rear > 0) {
      const a = -P.rear * REAR_TILT;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const ox = x - HIP.x;
      const oy = y - HIP.y;
      x = HIP.x + ox * c - oy * s;
      y = HIP.y + ox * s + oy * c;
    }
    x *= 1 + P.crouch * 0.06;
    y *= 1 - P.crouch * 0.16 - this.slump * 0.08;
    x *= this.facing;
    const r = (P.roll + this.tumble + this.slump * 0.12) * this.facing;
    const c = Math.cos(r);
    const s = Math.sin(r);
    return { x: this.cx + x * c - y * s, y: this.bottom + x * s + y * c };
  }

  /** The head's centre in his own space. */
  private headLocal(): { x: number; y: number } {
    return HEAD;
  }

  private mouthWorld(): { x: number; y: number } {
    const P = this.pose;
    const h = this.headLocal();
    const a = P.head;
    const mx = h.x + MOUTH.x * Math.cos(a) - MOUTH.y * Math.sin(a);
    const my = h.y + MOUTH.x * Math.sin(a) + MOUTH.y * Math.cos(a);
    return this.toWorld(mx, my, true);
  }

  /** His eye in the world, where it is drawn. */
  private headWorld(): { x: number; y: number } {
    const h = this.headLocal();
    const a = this.pose.head;
    return this.toWorld(h.x + EYE.x * Math.cos(a) - EYE.y * Math.sin(a), h.y + EYE.x * Math.sin(a) + EYE.y * Math.cos(a), true);
  }

  override lights(): GlowLight[] {
    const out: GlowLight[] = [];
    if (this.dead || this.floorY === 0) return out;
    // The moon on him: a statue the colour of the wall needs a light of its
    // own. Stone takes a cool sheen from it; flesh only the light and not the
    // colour, or the slate washes out to the grey it must not be.
    const k = this.warmth;
    out.push({ x: this.cx, y: this.bottom - 32, radius: 150, rgb: '190,202,226', strength: 0.55 - 0.1 * k, tint: 0.12 - 0.09 * k });
    const head = this.headWorld();
    if (k > 0.05 && this.state !== 'dying') {
      // Red eyes, hotter in his second half - and flaring in every wind-up.
      const hot = this.phaseTwo ? '255,130,60' : '255,84,76';
      const tell = this.state === 'diveWind' || this.state === 'clawWind' || this.state === 'glideWind' ? 1 : 0;
      out.push({ x: head.x, y: head.y, radius: 30 + 34 * k + 18 * tell, rgb: hot, strength: 0.3 + 0.4 * k + 0.2 * tell, tint: 0.3 });
    }
    if (this.crackGlow > 0.02) {
      out.push({ x: this.cx, y: this.bottom - 28, radius: 130, rgb: '255,156,76', strength: 0.85 * this.crackGlow, tint: 0.4 });
    }
    if (this.state === 'gurgle' || this.state === 'spit') {
      const m = this.mouthWorld();
      out.push({ x: m.x, y: m.y, radius: 64, rgb: '150,206,240', strength: 0.6, tint: 0.38 });
    }
    return out;
  }

  /* -------------------------------------------------------------- drawing */

  /*
   * He is drawn from frames (gargoyle-art.ts): each a pose of his rig laid
   * onto the art grid once, in a paint for each of his bodies. A frame is
   * picked by which pose he is nearest to, so a statue keeps the frame he
   * froze in - mid-step, mid-claw, mid-screech.
   */

  /** The frame of him his pose is nearest to. */
  private frameName(): FrameName {
    const P = this.pose;
    if (P.fly > 0.5) {
      if (P.glide > 0.5) return Math.sin(P.wing) >= 0 ? 'glide0' : 'glide1';
      // The beat in four frames: level, up, level, down.
      if (P.beat > 0.3) return FLAP[quarter(P.wing)];
      return P.roll < 0.35 ? 'dive0' : P.roll < 0.65 ? 'dive1' : 'dive2';
    }
    if (P.glide > 0.4) return 'glideWind';
    if (P.swipe > 0.6) return 'swipe';
    if (P.swipe > 0.3 && P.rear < 0.3) return 'recover';
    if (P.rear > 0.75) return 'rear';
    if (P.rear > 0.3) return 'rearHalf';
    if (P.spread > 0.9) return P.crouch > 0.45 ? 'screech' : 'roar';
    if (P.crouch > 0.45) return 'land';
    if (P.crouch > 0.18) return WALK[quarter(P.gait)];
    return P.spread < 0.12 ? 'sleep' : 'perch';
  }

  /** His paint: stone, warming, flesh - his eyes lit white in a wind-up - or the flash of a blow or of turning to stone. */
  private paintName(): PaintName {
    if (this.flash > 0.78) return 'flash';
    if (this.wash > 0.45 || this.flash > 0.4) return 'wash';
    if (this.warmth < 0.3) return this.state === 'gurgle' || this.state === 'spit' ? 'stoneWet' : 'stone';
    if (this.warmth < 0.75) return 'warm';
    const tell = this.state === 'diveWind' || this.state === 'clawWind' || this.state === 'glideWind';
    if (this.phaseTwo) return tell ? 'flesh2Tell' : 'flesh2';
    return tell ? 'fleshTell' : 'flesh';
  }

  override draw(ctx: CanvasRenderingContext2D): void {
    const F = this.floorY || this.bottom;
    const air = Math.max(0, F - this.bottom);
    shadow(ctx, this.cx, F, 64 * clamp(1 - air / 380, 0.3, 1), 0.4 * clamp(1 - air / 420, 0.2, 1));
    this.drawChips(ctx, F);
    const name = this.frameName();
    // Tipping as he falls, and settling as he lies broken.
    const tilt = clamp(Math.round((this.tumble + this.slump * 0.12) / 0.12), 0, 3);
    const id = `${name}|${tilt}|${this.phaseTwo ? 1 : 0}`;
    const paint = this.paintName();
    const level = crackLevel(this.crackGlow);
    const facing: 1 | -1 = this.facing < 0 ? -1 : 1;
    const frame = frameOf(name, tilt, this.phaseTwo);
    const cracked = this.crackGlow > 0.02 && this.cracks.length > 0;
    if (this.state === 'dying' && this.crumble > 0.2) {
      // The statue comes apart in blocks, its cracks still glowing in them.
      const step = this.crumble < 0.45 ? 1 : this.crumble < 0.7 ? 2 : 3;
      const cid = `${this.crackId()}|${id}|${step}`;
      let heap = this.crumbled.get(cid);
      if (!heap) {
        heap = crumbleOf(cracked ? overlay(frame, this.crackCells(id, frame)) : frame, step);
        this.crumbled.set(cid, heap);
      }
      this.blit(ctx, spriteOf(cid, heap.grid, paint, level), heap, facing);
      return;
    }
    const at = this.blit(ctx, spriteOf(id, frame.grid, paint), frame, facing);
    if (cracked) this.blit(ctx, spriteOf(`${this.crackId()}|${id}`, this.crackCells(id, frame), paint, level), frame, facing);
    const w = frame.grid[0].length;
    const mx = Math.floor(frame.mouth[0]);
    const my = Math.floor(frame.mouth[1]);
    if (this.state === 'gurgle' || this.state === 'spit') this.drawWater(ctx, at, w, mx, my, facing, F);
    if (this.state === 'claw') {
      // The swipe's trail, round his shoulder.
      const [sx, sy] = shoulderOf(frame);
      const s = trailSprite();
      const x = at.x + (facing > 0 ? sx : w - sx) * ART;
      s.draw(ctx, x - (s.w / 2) * ART, at.y + sy * ART - (s.h / 2) * ART, facing);
    }
    if (this.breath > 0.2 && this.warmth > 0.75) {
      // A breath on the cold air, out of the spout and rising.
      const late = this.breath < 0.6;
      this.cells(ctx, at, w, mx + (late ? 4 : 2), my - (late ? 3 : 1), late ? 3 : 2, late ? 2 : 1, facing, late ? RAMP.slate[5] : RAMP.slate[6]);
    }
  }

  /** Draws a frame of him with his feet on his feet; gives back where its top-left landed. */
  private blit(ctx: CanvasRenderingContext2D, s: PixelSprite, f: Frame, facing: 1 | -1): { x: number; y: number } {
    const x = snap(this.cx - (facing > 0 ? f.px : s.w - f.px) * ART);
    const y = snap(this.bottom - f.py * ART);
    s.draw(ctx, x, y, facing);
    return { x, y };
  }

  /** A block of cells over a frame drawn at `at`, `w` cells wide: from (fx, fy) on, forwards and down. */
  private cells(ctx: CanvasRenderingContext2D, at: { x: number; y: number }, w: number, fx: number, fy: number, nw: number, nh: number, facing: 1 | -1, color: string): void {
    ctx.fillStyle = color;
    ctx.fillRect(at.x + (facing > 0 ? fx : w - fx - nw) * ART, at.y + fy * ART, nw * ART, nh * ART);
  }

  /** His cracks laid on a frame: worked out once per frame for each set of cracks. */
  private crackCells(id: string, f: Frame): Grid {
    let g = this.crackGrids.get(id);
    if (!g) {
      g = crackGrid(
        f,
        this.cracks.map((c) => c.pts),
      );
      this.crackGrids.set(id, g);
    }
    return g;
  }

  /** The name his current cracks' sprites go by, so that the next set does not find them. */
  private crackId(): string {
    return `${CRACKS}${this.crackSerial}`;
  }

  /** Bits of him on the stone around a broken statue. */
  private drawChips(ctx: CanvasRenderingContext2D, F: number): void {
    if (this.chips.length === 0) return;
    const spread = this.state === 'dying' ? 1 + this.crumble * 0.8 : 1;
    for (const c of this.chips) {
      const chip = chipSprite(c.r < 3 ? 0 : 1, Math.floor((c.a / Math.PI) * 4) & 3);
      chip.sprite.draw(ctx, this.cx + c.x * spread - chip.mid * ART, F + c.y - chip.bottom * ART);
    }
  }

  /**
   * The spout's water over a frame drawn at `at`: bubbling on the lip while it
   * gurgles and pours, and a thread of it down to the stone while it gurgles.
   * The channel along his jaw runs wet in the paint itself.
   */
  private drawWater(ctx: CanvasRenderingContext2D, at: { x: number; y: number }, w: number, mx: number, my: number, facing: 1 | -1, F: number): void {
    const t = this.anim;
    for (let i = 0; i < 2; i++) {
      if (Math.sin(t * 13 + i * 2.4) < -0.2) continue;
      const lift = Math.sin(t * 9 + i) > 0.3 ? 2 : 1;
      this.cells(ctx, at, w, mx - 2 - i * 3, my - lift, 2, 1, facing, i === 0 ? '#ffffff' : RAMP.blue[6]);
    }
    if (this.state === 'gurgle') {
      const x0 = at.x + (facing > 0 ? mx + 1 : w - mx - 2) * ART;
      const y0 = at.y + (my + 1) * ART;
      const sway = Math.round(Math.sin(t * 20)) * ART;
      runLine(ctx, x0, y0, x0 + facing * 2 * ART + sway, F - ART, RAMP.blue[4]);
    }
  }
}

const TAU = Math.PI * 2;

/** The quarter of a turn an angle is nearest: 0 at none, 1 at a quarter, and round. */
function quarter(a: number): number {
  return Math.round((((a % TAU) + TAU) % TAU) / (Math.PI / 2)) % 4;
}

const FLAP: readonly FrameName[] = ['fly0', 'fly1', 'fly2', 'fly3'];
const WALK: readonly FrameName[] = ['walk0', 'walk1', 'walk2', 'walk3'];
/** What the sprites of his cracks are called, before the number of the set. */
const CRACKS = 'gargoyle-cracks';

/** How bright his cracks glow, in four steps. */
function crackLevel(g: number): CrackLevel {
  return g > 0.85 ? 3 : g > 0.6 ? 2 : g > 0.35 ? 1 : 0;
}

let trail: PixelSprite | null = null;

function trailSprite(): PixelSprite {
  trail ??= new PixelSprite(SWIPE_TRAIL, TRAIL_KEY);
  return trail;
}

/** A chip's sprite, its middle column and the row under it. */
interface ChipArt {
  sprite: PixelSprite;
  mid: number;
  bottom: number;
}

const chipArt = new Map<number, ChipArt>();

function chipSprite(size: number, turn: number): ChipArt {
  const k = size * 4 + turn;
  let c = chipArt.get(k);
  if (!c) {
    const grid = CHIPS[size][turn];
    let bottom = 0;
    grid.forEach((row, y) => {
      if (/[^.]/.test(row)) bottom = y + 1;
    });
    c = { sprite: new PixelSprite(grid, keyOf('stone')), mid: grid[0].length / 2, bottom };
    chipArt.set(k, c);
  }
  return c;
}
