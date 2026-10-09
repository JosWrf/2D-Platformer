import { audio } from '../core/audio';
import { Rect, TAU, approach, clamp, damp, easeOut, lerp, rand, rectsOverlap, sign } from '../core/math';
import { makeCanvas } from '../render/pixel';
import { glow, shadow, withHitFlash } from '../render/sprites';
import type { World } from '../world/context';
import { TILE } from '../world/tiles';
import { Enemy, type GlowLight } from './enemy';
import { Projectile } from './projectile';

/* --------------------------------------------------------------- numbers */

/**
 * Health before the hero is sized up: 90 with the three relics of the road so
 * far. Twice the 44 he was drawn with, measured: one unmasking alone is worth
 * about twenty-two of it to a hero who reads him - half his health at 44 - and
 * at 44 that hero felled him in 15 to 25 s, after a single trick. At 88 it is
 * 43 s and three tricks, every one of them unmasked.
 */
const JESTER_HP = 88;
/**
 * Damage his own knives may do him, sent back while he is busy, before he
 * stumbles - nothing else reaches him outside a window. Not refilled by a
 * window: three knives of one throw do not knock him over, the fourth in a
 * row does. His windows take none, or hitting him there would cut them short.
 */
const JESTER_POISE = 8;
/** His box: boots to the top of the mask. The cap's points are cloth. */
const W = 30;
const H = 68;
const INTRO = 1.7;
/** How long he prances between moves, and how fast - against the hero's 235, so he can always be caught. */
const STRUT: readonly [number, number] = [0.5, 0.8];
const STRUT_SPEED = 120;
/** Closer than this, he flips away before the knives or the wheel: both want room to be read. */
const HOP_NEAR = 150;
const HOP_TIME = 0.55;
const HOP_DIST = 170;
const HOP_APEX = 58;
/** Messerwurf: three knives up (the tell), then one after another. See throwKnife for how fast they come. */
const JUGGLE = 0.65;
const THROW_GAP = 0.18;
const KNIVES = 3;
/** The knives fall as Projectile lets a hostile knife fall. */
const KNIFE_G = 760;
/** Radschlag: a crouch with the bells going (the tell), then the wheel. */
const CROUCH = 0.6;
const WHEEL_SPEED = 360;
/**
 * And in his second half, a little faster. A normal jump still clears it from
 * 50 to 140 px out at either speed (verify:jester); it leaves a little less
 * room for a jump timed badly.
 */
const WHEEL_SPEED_TWO = 400;
/** How far past the hero the wheel runs: through him, and on. */
const WHEEL_PAST = 150;
/** The wheel's height - a normal jump clears it - and its half width. */
const WHEEL_H = 48;
const WHEEL_HALF = 22;
/** In his second half, how often a wheel goes straight on into the knives. */
const CHAIN_CHANCE = 0.5;
/** Salto: knees bend (the tell), then a high arc to where the hero stood. */
const KNEEL = 0.55;
const SALTO_TIME = 0.9;
const SALTO_APEX = 150;
const SALTO_G = (8 * SALTO_APEX) / (SALTO_TIME * SALTO_TIME);
/** The ring his landing throws out, centre to centre - Gallert's, a little smaller. */
const RING = 70;
/** The windows after each move, where he stands open at sword height. */
const BOW = 1.3;
const SPLIT = 1.4;
const DIZZY = 1.25;
/** Trugbilder: a bow and a puff of smoke (the tell), the shuffle, the line-up, the guess. */
const CONJURE = 0.7;
const SHUFFLE = 2.4;
const SHUFFLE_TWO = 2.0;
/** The last part of the shuffle, in which everyone goes to his place in the line. */
const PLACES = 0.7;
const GUESS = 1.8;
/** Unmasked: on his knees, the mask askew, taking double. */
const UNMASKED = 2.6;
/** Every figure still standing raises a knife (the tell), and throws. */
const VOLLEY_WIND = 0.55;
const MERGE = 0.6;
/** After the knives of a guess gone wrong he takes his bow for the trick: that is the window. */
const ENCORE = 1.25;
/** The trick waits until the fight has shown the rest of him. */
const TRICK_NOT_BEFORE = 6;
const STAGGER = 0.9;
/** A wheel caught on the hero's guard goes over in a heap. */
const PARRY_DIZZY = 1.6;
const DYING = 2.4;
/** The shadow the footlights throw up the back wall: how big, and how far above the boards. */
const WALL_SCALE = 1.8;
const WALL_LIFT = 120;
/**
 * How far the shadow is pushed sideways, away from the lamp nearest him, at
 * most. Never near half the gap between two figures of the line (115 px):
 * with 64 a shadow could hang right between two of them, and the rule was a
 * coin toss.
 */
const WALL_SHIFT = 22;
/**
 * The game draws an enemy only while its box is near the screen. He is one
 * box and up to four figures: the box sits on the one nearest the hero, and
 * never further from him than this - see placeBox.
 */
const VIEW_REACH = 420;

/* The cloth, the porcelain and the dark. */
const VIOLET = '#5a3a8a';
const VIOLET_DARK = '#38205c';
const VIOLET_LIGHT = '#8a66c4';
const GOLD = '#e8b84a';
const GOLD_DARK = '#a3742a';
const GOLD_LIGHT = '#ffe39a';
const PORCELAIN = '#f4efe4';
const PORCELAIN_SHADE = '#cbc2cf';
const INK = '#160c20';
/** The silhouette on the wall, before it is laid on at 0.55: rgba(10,4,20,0.55) in all. */
const SIL = '#0a0414';
const WALL_SHADOW_ALPHA = 0.55;

/* His bones, in pixels: lanky. */
const THIGH = 16;
const SHIN = 15;
const TORSO = 21;
const UPPER = 12;
const FORE = 11;

type JesterState =
  | 'dormant'
  | 'intro'
  | 'strut'
  | 'hop'
  | 'juggle'
  | 'throw'
  | 'bow'
  | 'crouch'
  | 'wheel'
  | 'split'
  | 'kneel'
  | 'salto'
  | 'dizzy'
  | 'conjure'
  | 'shuffle'
  | 'guess'
  | 'unmasked'
  | 'volley'
  | 'merge'
  | 'encore'
  | 'stagger'
  | 'dying';

type Move = 'knives' | 'wheel' | 'salto' | 'trick';

/** What a figure on the stage is doing, as far as its body is concerned. */
type Act =
  | 'slump'
  | 'rise'
  | 'stand'
  | 'strut'
  | 'run'
  | 'juggle'
  | 'throw'
  | 'bow'
  | 'conjure'
  | 'crouch'
  | 'wheel'
  | 'split'
  | 'kneel'
  | 'tuck'
  | 'flip'
  | 'dizzy'
  | 'raise'
  | 'unmasked'
  | 'stagger'
  | 'collapse';

/** The moves in which nothing on the stage can be struck - from the puff of smoke to the last copy gone, but the guess. */
const VANISHED: ReadonlySet<JesterState> = new Set<JesterState>(['shuffle', 'volley', 'merge']);
/** His windows. They take no poise. */
const WINDOWS: ReadonlySet<JesterState> = new Set<JesterState>(['bow', 'split', 'dizzy', 'unmasked', 'encore']);

/** One run of a figure across the stage during the shuffle. */
interface Leg {
  from: number;
  to: number;
  fromY: number;
  t: number;
  dur: number;
  style: 'run' | 'wheel' | 'flip';
  apex: number;
}

/**
 * Someone on the stage who looks like Maskarill. One of them is.
 */
interface Figure {
  x: number;
  /** Where his boots are - the floor, unless he is in the air. */
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  act: Act;
  /** How far through the act, 0..1, where it has a course. */
  k: number;
  /** Seconds of the act's own loop: gait, juggling, wobble. */
  t: number;
  /** The whole body's turn in wheels and flips. */
  spin: number;
  /** How far the points of the cap trail behind. */
  sway: number;
  seed: number;
  /** Only the one who is really there throws a shadow. */
  casts: boolean;
  leg: Leg | null;
  /** Knives in his hands: juggled, or one raised to throw. */
  knives: number;
  /** 1 standing there, falling to 0 as a copy merges back into him. */
  fade: number;
}

function figure(x: number, y: number, casts: boolean): Figure {
  return { x, y, vx: 0, vy: 0, facing: -1, act: 'slump', k: 0, t: 0, spin: 0, sway: 0, seed: Math.random() * 10, casts, leg: null, knives: 0, fade: 1 };
}

/**
 * A body's pose: angles in radians, 0 pointing straight down, a quarter turn
 * pointing the way he faces, half a turn straight up. Knees fold the shin
 * back (negative), elbows lift the forearm (positive).
 */
interface Pose {
  /** Feet on the floor: the pelvis is put where the lowest foot or knee touches it. */
  planted: boolean;
  /** The pelvis' height when not planted. */
  hipY: number;
  /** Extra height for a planted pose: the bounce of a step. */
  lift: number;
  /** The whole figure about the feet: a sway. */
  tilt: number;
  /** The whole body about the pelvis: wheels and flips. */
  rot: number;
  scale: number;
  lean: number;
  nod: number;
  armF: number;
  elbowF: number;
  armB: number;
  elbowB: number;
  legF: number;
  kneeF: number;
  legB: number;
  kneeB: number;
}

function standPose(): Pose {
  return {
    planted: true,
    hipY: 30,
    lift: 0,
    tilt: 0,
    rot: 0,
    scale: 1,
    lean: 0.06,
    nod: 0,
    armF: 0.3,
    elbowF: 0.5,
    armB: -0.2,
    elbowB: 0.3,
    legF: 0.12,
    kneeF: -0.12,
    legB: -0.1,
    kneeB: -0.06,
  };
}

/** How far below the pelvis the lowest foot or knee hangs. */
function plantDepth(p: Pose): number {
  let low = 0;
  for (const [a1, a2] of [
    [p.legF, p.kneeF],
    [p.legB, p.kneeB],
  ]) {
    const ky = THIGH * Math.cos(a1);
    const fy = ky + SHIN * Math.cos(a1 + a2);
    low = Math.max(low, ky + 3, fy + 2);
  }
  return low;
}

function pelvisOf(p: Pose): number {
  return p.planted ? plantDepth(p) * p.scale + p.lift : p.hipY;
}

/** Between two poses, by k. The result is placed by its pelvis, so planted and airborne poses mix. */
function mixPose(a: Pose, b: Pose, k: number): Pose {
  const m = (x: number, y: number): number => x + (y - x) * k;
  return {
    planted: false,
    hipY: m(pelvisOf(a), pelvisOf(b)),
    lift: 0,
    tilt: m(a.tilt, b.tilt),
    rot: m(a.rot, b.rot),
    scale: m(a.scale, b.scale),
    lean: m(a.lean, b.lean),
    nod: m(a.nod, b.nod),
    armF: m(a.armF, b.armF),
    elbowF: m(a.elbowF, b.elbowF),
    armB: m(a.armB, b.armB),
    elbowB: m(a.elbowB, b.elbowB),
    legF: m(a.legF, b.legF),
    kneeF: m(a.kneeF, b.kneeF),
    legB: m(a.legB, b.legB),
    kneeB: m(a.kneeB, b.kneeB),
  };
}

function slumpPose(): Pose {
  return {
    ...standPose(),
    planted: false,
    hipY: 7,
    lean: 0.82,
    nod: 0.75,
    armF: 0.35,
    elbowF: 0.1,
    armB: 0.15,
    elbowB: 0.05,
    legF: 1.3,
    kneeF: -0.55,
    legB: 1.45,
    kneeB: -0.3,
  };
}

/** A bow's depth over its course: down quickly, held, and up again at the end. */
function bowCurve(u: number): number {
  if (u < 0.22) return easeOut(u / 0.22, 2);
  if (u > 0.84) return 1 - easeOut((u - 0.84) / 0.16, 2) * 0.85;
  return 1;
}

/**
 * Maskarill, der Gaukler - the last player on the stage of the ruined theatre,
 * still giving his show every night to rows of seats nobody has sat in for a
 * hundred years.
 *
 * His rule is the rule of every stage lit from the front: Nur einer wirft
 * einen Schatten. The footlights throw him big onto the back wall, always -
 * the hero has seen that shadow from the first second of the fight before it
 * ever matters - and the copies he conjures throw nothing at all:
 *
 *   Messerwurf - three knives up over his head, spinning (JUGGLE), then one
 *                after another on arcs at where the hero is. A swing bats one
 *                back into him for two. Then a bow: the window.
 *   Radschlag  - he crouches and his bells go (CROUCH), then cartwheels across
 *                the stage, through the hero and on past him. The wheel is 48
 *                px high: a normal jump clears it. He lands in the splits: the
 *                window.
 *   Salto      - his knees bend (KNEEL) and he goes up high, to come down where
 *                the hero stood; his shadow on the boards marks the spot, and
 *                the landing throws a ring. Then he stands there dizzy: the
 *                window.
 *   Trugbilder - a bow and a puff of smoke, and there are three of him (four in
 *                his second half). They shuffle across the stage, crossing,
 *                wheeling and flipping - none of it hurts, and none of it can be
 *                struck - then line up and bow. One blow, now: on the one with
 *                the shadow, ENTLARVT! - the mask cracks and slips, the copies
 *                go, and he kneels there taking double. On a copy, PUFF, and
 *                every figure left throws a knife; on nothing, the same. The
 *                knives go up first, glinting, for half a second - a volley
 *                is a move like any other - and after it he takes his bow for
 *                the trick: the window.
 *
 * Outside his windows a blade never quite finds him: he leans out of its way
 * (HOPPLA!). Hittable everywhere, he was chased down and cut apart between his
 * moves - measured, a hero who read him felled him in fifteen seconds, before
 * the trick had come round once. Only his own knives, sent back, always land.
 *
 * Standing in a jester who is juggling, bowing or doing the splits costs
 * nothing; what hurts is the wheel, the landing of the salto and the knives.
 * From half health on, four of him, a quicker shuffle and a quicker wheel,
 * and now and then a wheel that goes straight on into the knives - with their
 * own juggling first.
 *
 * Measured on the balance bench with the relics of the road (90 health): a
 * hero who sees him 0.3 s late, swings only from the floor and jumps only to
 * get out of the way fells him in 43 s, unmasking him at every trick, for one
 * or two hearts - all of them knives he walked in under. One who walks up and
 * swings takes six to nine blows: the wheel, the salto and the knives find
 * him, and the line is a guess for him.
 */
export class Jester extends Enemy {
  private state: JesterState = 'dormant';
  private timer = 0;
  private floorY = 0;
  private arenaLeft = 0;
  private arenaRight = 0;
  private poise = JESTER_POISE;
  private poiseMax = JESTER_POISE;
  private phaseTwo = false;
  /** Seconds since he woke. */
  private fightTime = 0;
  private lastMove: Move | '' = '';
  /** The plain moves left in this round. See drawMove. */
  private bag: Move[] = [];
  private plainSinceTrick = 0;
  /** How far from the hero he likes to prance. */
  private keep = 220;
  /** What a flip away is making room for. */
  private hopThen: 'knives' | 'wheel' = 'knives';
  private hopT = 0;
  private hopDir = 1;
  private thrown = 0;
  private throwClock = 0;
  private wheelDir: 1 | -1 = 1;
  private wheelTo = 0;
  private hitThisMove = false;
  /** The last wheel went on into the knives; the next one ends in the splits. */
  private chained = false;
  private landX = 0;
  private saltoT = 0;
  /* The trick. */
  private copies: Figure[] = [];
  /** The order they are drawn in: shuffled, so the one in front says nothing. */
  private order: Figure[] = [];
  private spots: number[] | null = null;
  private anchor: Figure | null = null;
  private told = false;
  private volleyThrown = false;
  /** The mask: knocked askew (1) or in its place (0) - and cracked, once it has been. */
  private maskOff = 0;
  private cracked = false;
  /** The mask, gone from his face as he falls: where it is, and its turn. */
  private dropped: { x: number; y: number; vx: number; vy: number; rot: number; spin: number } | null = null;
  private struck: Figure | null = null;
  /** Leaning out of the way of a blade, and from which side it came. */
  private dodge = 0;
  private dodgeDir = 1;
  /** Seconds before he mocks a miss out loud again. */
  private mock = 0;
  private readonly me: Figure;
  /** The lamps along the front of the stage, from the level: x of each flame. */
  private footlights: number[] = [];
  /** 0 dark, 1 the show is on. */
  private stageLight = 0.3;
  /** Rings thrown out by landings. */
  private rings: { x: number; t: number }[] = [];
  private silCanvas: HTMLCanvasElement | null = null;
  private silCtx: CanvasRenderingContext2D | null = null;
  private allOf: Figure[] | null = null;
  private allList: Figure[] = [];
  /**
   * Gradients, made once: a canvas gradient lives in whatever transform it is
   * filled under, so one serves every figure on every frame.
   */
  private paints: { fan: CanvasGradient; shade: CanvasGradient; face: CanvasGradient } | null = null;

  override castLight = false;

  constructor(x: number, y: number) {
    super('jester', x, y);
    this.w = W;
    this.h = H;
    this.hp = this.maxHp = JESTER_HP;
    this.scoreValue = 900;
    this.aggroRange = 520;
    this.contactDamage = 0;
    this.facing = -1;
    // The boards are his; the balconies belong to the hero.
    this.ignorePlatforms = true;
    this.me = figure(x + W / 2, y + H, true);
  }

  get phase(): 1 | 2 {
    return this.phaseTwo ? 2 : 1;
  }

  override barName(): string {
    return 'MASKARILL   ·   DER GAUKLER';
  }

  override barPhase(): number {
    return this.phase;
  }

  protected override deathColor(): string {
    return '#b98cff';
  }

  private get haste(): number {
    return this.phaseTwo ? 0.8 : 1;
  }

  /** Him and his copies. Asked for many times a frame, so kept rather than rebuilt. */
  private get all(): Figure[] {
    if (this.allOf !== this.copies) {
      this.allOf = this.copies;
      this.allList = [this.me, ...this.copies];
    }
    return this.allList;
  }

  /**
   * Everyone on the stage as the eye has them, left to right: where they
   * stand, what they are doing, and whether a shadow goes up the back wall
   * behind them - exactly what draw() puts there. For the tools.
   */
  get figures(): { x: number; bottom: number; vx: number; casts: boolean; act: Act; fade: number }[] {
    return this.all.map((f) => ({ x: f.x, bottom: f.y, vx: f.vx, casts: f.casts, act: f.act, fade: f.fade })).sort((a, b) => a.x - b.x);
  }

  /** Where the shadow's feet are on the back wall, and the figure that throws it; null if nobody does. */
  get wallShadow(): { x: number; y: number; of: number } | null {
    const f = this.all.find((o) => o.casts);
    if (!f || this.dead) return null;
    const lamp = this.nearestLamp(f.x);
    const off = clamp((f.x - lamp) * 0.2, -WALL_SHIFT, WALL_SHIFT);
    return { x: f.x + off, y: this.floorY - WALL_LIFT - (this.floorY - f.y) * 0.6, of: f.x };
  }

  /* ------------------------------------------------------------ targeting */

  /** What a blade meets of a figure, by what it is doing. */
  private rectOf(f: Figure): Rect {
    switch (f.act) {
      case 'wheel':
        return { x: f.x - WHEEL_HALF, y: f.y - WHEEL_H, w: WHEEL_HALF * 2, h: WHEEL_H };
      case 'split':
        return { x: f.x - 26, y: f.y - 48, w: 52, h: 48 };
      case 'tuck':
      case 'flip':
        return { x: f.x - 17, y: f.y - 44, w: 34, h: 42 };
      case 'crouch':
      case 'kneel':
        return { x: f.x - 16, y: f.y - 52, w: 32, h: 52 };
      case 'bow':
      case 'conjure':
        return { x: f.x - 18, y: f.y - 58, w: 36, h: 58 };
      case 'unmasked':
        return { x: f.x - 17, y: f.y - 56, w: 34, h: 56 };
      case 'slump':
      case 'collapse':
        return { x: f.x - 18, y: f.y - 36, w: 36, h: 36 };
      default:
        return { x: f.x - W / 2, y: f.y - H, w: W, h: H };
    }
  }

  /** Standing open: a window, or knocked off his feet by his own knife. */
  private get open(): boolean {
    return WINDOWS.has(this.state) || this.state === 'stagger';
  }

  /**
   * In the guess, whichever figure the blade meets first - the one nearest
   * its middle; while the copies are out and not lined up, nothing at all.
   * Otherwise he is only there to be struck in his windows: prancing, winding
   * up or on the move he is never quite where the blade goes (see evade).
   * His own knives, sent back, are another matter - see catchKnives.
   */
  override overlaps(r: Rect): boolean {
    this.struck = null;
    if (this.state === 'dormant' || this.state === 'intro' || this.state === 'dying' || VANISHED.has(this.state)) return false;
    if (this.state !== 'guess' && !this.open) return false;
    if (this.state === 'guess') {
      const mid = r.x + r.w / 2;
      let best: Figure | null = null;
      for (const f of this.all) {
        if (f.fade < 1 || !rectsOverlap(this.rectOf(f), r)) continue;
        if (!best || Math.abs(f.x - mid) < Math.abs(best.x - mid)) best = f;
      }
      this.struck = best;
      return best !== null;
    }
    if (!rectsOverlap(this.rectOf(this.me), r)) return false;
    this.struck = this.me;
    return true;
  }

  /**
   * The guess decides on the first blow: the real one is unmasked, a copy goes
   * up in smoke. Unmasked he takes double. A parry's own knock reaches him
   * without overlaps (struck null): outside the trick it counts like any blow,
   * in the guess it decides nothing.
   */
  override hurt(amount: number, fromDir: number, world: World): void {
    const part = this.struck;
    this.struck = null;
    if (this.dead || this.state === 'dormant' || this.state === 'intro' || this.state === 'dying') return;
    if (this.state === 'guess') {
      if (part === this.me) this.unmask(world, amount);
      else if (part) this.puff(world, part);
      return;
    }
    if (!this.open) return;
    this.wound(world, amount, fromDir);
  }

  /**
   * A blow that lands: double while unmasked. Only his own knives reach him
   * outside a window, and those take poise as well - a wheel or a salto
   * carries through whatever lands on it, and a window takes none, or hitting
   * him there would cut it short.
   */
  private wound(world: World, amount: number, fromDir: number): void {
    const me = this.me;
    const unmasked = this.state === 'unmasked';
    this.hp -= unmasked ? amount * 2 : amount;
    this.flash = 1;
    audio.play('bossHit', unmasked ? 0.85 : 1.25);
    if (Math.random() < 0.4) audio.play('coin', 1.9);
    world.particles.burst(me.x, me.y - 36, unmasked ? 16 : 9, unmasked ? '#ffe27a' : '#c6a2ff', {
      speed: unmasked ? 210 : 160,
      gravity: 380,
    });
    if (this.hp <= 0) {
      this.beginDying(world);
      return;
    }
    this.checkPhase(world);
    if (this.open || this.state === 'wheel' || this.state === 'salto') return;
    this.poise -= amount;
    if (this.poise <= 0 && this.poiseLock <= 0) this.stumble(world, fromDir);
  }

  /**
   * His own knives, batted back: the one thing he cannot step out of the way
   * of. Caught here rather than in the game's projectile pass, where outside
   * a window he is not there to be found.
   */
  private catchKnives(world: World): void {
    for (const q of world.projectiles) {
      if (q.dead || !q.friendly || q.kind !== 'knife' || q.vy === 0) continue;
      // Just batted. The blade's turn keeps a third of its fall, and a knife
      // turned on its way down went into the boards before it got home -
      // measured, a hero who batted every knife sent none of them into him.
      // His knives come back flat, at chest height, the way they are drawn.
      q.vy = 0;
      q.y = Math.min(q.y, this.floorY - 30);
    }
    if (this.state === 'dormant' || this.state === 'intro' || this.state === 'dying' || VANISHED.has(this.state)) return;
    for (const q of world.projectiles) {
      if (q.dead || !q.friendly || q.kind !== 'knife') continue;
      const dir = sign(q.vx) || 1;
      let hit: Figure | null = null;
      for (const f of this.state === 'guess' ? this.all : [this.me]) {
        if (rectsOverlap(this.rectOf(f), q.rect)) hit = f;
      }
      if (!hit) continue;
      q.dead = true;
      world.particles.burst(q.cx, q.cy, 10, '#eef0f8', { speed: 150, gravity: 200, shape: 'spark' });
      audio.play('clank', 1.6);
      const before = this.hp;
      if (this.state === 'guess') {
        this.struck = hit;
        this.hurt(q.damage, dir, world);
      } else {
        this.wound(world, q.damage, dir);
      }
      world.player.onDamageDealt(Math.max(0, before - Math.max(0, this.hp)));
      // The knife may have felled him, or ended the guess.
      const now = this.state as JesterState;
      if (now === 'dying' || VANISHED.has(now)) return;
    }
  }

  /**
   * A blade that comes for him outside a window finds him leaning away from
   * it, and now and then he says so. Read off the hero's swing, not off
   * overlaps: a dodge is no hit, and must not stop the world like one.
   */
  private evade(world: World, dt: number): void {
    this.dodge = Math.max(0, this.dodge - dt);
    this.mock = Math.max(0, this.mock - dt);
    const p = world.player;
    if (!p.bladeLive || this.open || this.state === 'guess' || this.state === 'dormant' || this.state === 'intro' || this.state === 'dying') return;
    if (VANISHED.has(this.state) || !rectsOverlap(p.swordRect(), this.rectOf(this.me))) return;
    if (this.dodge <= 0) {
      this.dodge = 0.3;
      this.dodgeDir = p.cx < this.me.x ? 1 : -1;
      audio.play('wing', 1.6);
      if (this.mock <= 0) {
        this.mock = 2.4;
        world.particles.text(this.me.x, this.me.y - 88, 'HOPPLA!', '#e6d4ff');
        audio.play('coin', 2.0);
      }
    }
  }

  private checkPhase(world: World): void {
    if (this.phaseTwo || this.hp > this.maxHp / 2) return;
    this.phaseTwo = true;
    audio.play('phase', 1.1);
    audio.play('coin', 0.9);
    world.camera.addShake(5);
    this.confetti(world, this.me.x, this.me.y - 50, 26);
  }

  override onParried(world: World): void {
    if (this.state === 'wheel') this.parried(world);
  }

  /** A wheel caught on the hero's guard goes over in a heap, and he sits there seeing bells. */
  private parried(world: World): void {
    const me = this.me;
    this.state = 'dizzy';
    this.timer = PARRY_DIZZY;
    me.vx = -this.wheelDir * 60;
    me.spin = 0;
    me.act = 'dizzy';
    audio.play('clank', 0.8);
    audio.play('coin', 0.7);
    world.camera.addShake(6);
    world.hitStop(0.1);
    world.particles.text(me.x, me.y - 84, 'AUS DEM TAKT!', '#ffe08a');
  }

  private stumble(world: World, fromDir: number): void {
    this.endTrick(world, false);
    this.state = 'stagger';
    this.timer = STAGGER;
    this.poise = this.poiseMax;
    this.poiseLock = 4;
    this.me.vx = fromDir * 90;
    this.me.knives = 0;
    this.me.act = 'stagger';
    audio.play('screech', 1.7);
    audio.play('coin', 1.2);
    world.particles.burst(this.me.x, this.me.y - 4, 10, '#7a6a8a', { speed: 120, gravity: 500, angle: -Math.PI / 2, spread: 2.2 });
  }

  private wake(world: World): void {
    this.engaged = true;
    this.poise = this.poiseMax = this.sizeUpFor(world, JESTER_POISE);
    this.state = 'intro';
    this.timer = INTRO;
    this.me.facing = world.player.cx > this.me.x ? 1 : -1;
    audio.play('magic', 0.6);
    audio.play('coin', 1.1);
    world.camera.addShake(3);
  }

  /** Starts his fall, from whatever he is doing. Ends in die and onBossFelled. */
  beginDying(world: World): void {
    if (this.dead || this.state === 'dying') return;
    this.endTrick(world, true);
    this.hp = 0;
    this.state = 'dying';
    this.timer = DYING;
    const me = this.me;
    me.leg = null;
    me.vx = 0;
    me.knives = 0;
    me.spin = 0;
    me.act = 'collapse';
    me.k = 0;
    this.maskOff = 0;
    audio.play('bossRoar', 1.45);
    audio.play('coin', 0.75);
    world.camera.addShake(8);
    world.hitStop(0.14);
  }

  /**
   * Only what moves hurts, and only the wheel by touch: the salto hurts where
   * it lands (see land), the knives by themselves. A jester juggling, bowing,
   * kneeling or doing the splits is no harm to walk into.
   */
  override touchPlayer(world: World): void {
    const p = world.player;
    if (this.dead || p.dead || this.state !== 'wheel' || this.hitThisMove) return;
    if (!rectsOverlap(this.rectOf(this.me), p.rect)) return;
    const guarding = p.parryTimer > 0;
    if (!guarding && p.isInvulnerable && !p.isDashing) return;
    this.hitThisMove = true;
    p.hurt(1, this.wheelDir, world);
    // The guard reaches what stands within sixty pixels of the hero's middle.
    if (guarding && p.parryFlash > 0.95 && this.state === 'wheel') this.parried(world);
  }

  /* --------------------------------------------------------------- update */

  private setUp(world: World): void {
    const arena = world.level.arenaAt(this.cx);
    this.arenaLeft = arena ? arena.left : this.cx - 560;
    this.arenaRight = arena ? arena.right : this.cx + 560;
    this.floorY = this.bottom;
    this.me.x = this.cx;
    this.me.y = this.floorY;
    // The footlights: the lamps standing on the boards of his stage.
    for (const s of world.level.spawns) {
      if (s.kind !== 'torch') continue;
      const x = s.tx * TILE + 16;
      if (x < this.arenaLeft || x > this.arenaRight) continue;
      if (Math.abs((s.ty + 1) * TILE - this.floorY) > TILE * 1.5) continue;
      this.footlights.push(x);
    }
    if (this.footlights.length === 0) {
      for (let x = this.arenaLeft + 96; x < this.arenaRight - 64; x += 192) this.footlights.push(x);
    }
    this.footlights.sort((a, b) => a - b);
    this.order = [this.me];
  }

  override update(dt: number, world: World): void {
    this.updateCommon(dt);
    this.struck = null;
    if (this.floorY === 0) this.setUp(world);
    const p = world.player;
    const me = this.me;
    if (this.engaged && this.state !== 'dying') this.fightTime += dt;
    const lit = this.state === 'dormant' ? 0.3 : this.state === 'dying' ? 0.12 : 1;
    this.stageLight = approach(this.stageLight, lit, dt * (this.state === 'intro' ? 1.6 : 0.7));
    this.maskOff = approach(this.maskOff, this.state === 'unmasked' && this.timer > 0.45 ? 1 : 0, dt * (this.state === 'unmasked' && this.timer > 0.45 ? 7 : 2.4));
    for (const r of this.rings) r.t += dt;
    if (this.rings.length && this.rings[0].t > 0.5) this.rings.shift();
    for (const f of this.all) {
      f.t += dt;
      const trail = clamp(-f.vx * 0.014, -5, 5) + Math.sin(this.anim * 2.6 + f.seed) * 0.7;
      f.sway = damp(f.sway, trail, 7, dt);
    }
    this.updateDropped(dt);
    this.catchKnives(world);
    this.evade(world, dt);

    switch (this.state) {
      case 'dormant': {
        me.act = 'slump';
        const inside = p.cx > this.arenaLeft + 16 && p.cx < this.arenaRight - 16;
        if (inside && Math.abs(p.cx - me.x) < this.aggroRange && !p.dead) this.wake(world);
        break;
      }

      case 'intro': {
        // Pulled up as if by strings, a jerk at a time - and a bow to the one
        // who came to see the show.
        const before = this.timer;
        this.timer -= dt;
        const k = 1 - this.timer / INTRO;
        if (k < 0.42) {
          me.act = 'rise';
          me.k = k / 0.42;
        } else {
          me.act = 'bow';
          me.k = bowCurve((k - 0.42) / 0.58);
        }
        me.facing = p.cx > me.x ? 1 : -1;
        for (const at of [0.25, 0.5, 0.75]) {
          if (before > INTRO * (1 - at * 0.42) && this.timer <= INTRO * (1 - at * 0.42)) audio.play('coin', 1.5 + at * 0.6);
        }
        if (before > INTRO * 0.58 && this.timer <= INTRO * 0.58) {
          audio.play('magic', 1.1);
          this.confetti(world, me.x, me.y - 70, 14);
        }
        if (this.timer <= 0) this.toStrut(0.5);
        break;
      }

      case 'strut': {
        this.timer -= dt;
        const want = this.strutSpot(p.cx);
        const diff = want - me.x;
        const speed = STRUT_SPEED * (this.phaseTwo ? 1.15 : 1);
        me.vx = approach(me.vx, Math.abs(diff) > 10 ? sign(diff) * speed : 0, 700 * dt);
        if (Math.abs(diff) > 80) me.facing = diff > 0 ? 1 : -1;
        else me.facing = p.cx > me.x ? 1 : -1;
        me.act = Math.abs(me.vx) > 25 ? 'strut' : 'stand';
        if (this.timer <= 0) this.chooseMove(world);
        break;
      }

      case 'hop':
        // Over backwards and away, or over the hero's head if the wall is at
        // his back: room for what comes next. Landed - see moveReal.
        this.hopT += dt;
        me.act = 'flip';
        me.k = clamp(this.hopT / HOP_TIME, 0, 1);
        me.spin = this.hopDir * TAU * easeOut(me.k, 1.6);
        break;

      case 'juggle':
        this.timer -= dt;
        me.vx = approach(me.vx, 0, 900 * dt);
        me.facing = p.cx > me.x ? 1 : -1;
        me.act = 'juggle';
        me.k = clamp(1 - this.timer / JUGGLE, 0, 1);
        me.knives = KNIVES;
        if (world.time % 0.15 < dt) audio.play('swing', 1.9 + me.k * 0.4);
        if (this.timer <= 0) {
          this.state = 'throw';
          this.thrown = 0;
          this.throwClock = 0;
        }
        break;

      case 'throw': {
        // One after another, each at where the hero is when it leaves.
        me.act = 'throw';
        me.facing = p.cx > me.x ? 1 : -1;
        while (this.thrown < KNIVES && this.throwClock >= this.thrown * THROW_GAP) {
          this.throwKnife(world, me);
          this.thrown++;
          me.knives = KNIVES - this.thrown;
        }
        me.k = clamp((this.throwClock - (this.thrown - 1) * THROW_GAP) / THROW_GAP, 0, 1);
        this.throwClock += dt;
        if (this.throwClock >= (KNIVES - 1) * THROW_GAP + 0.24) this.toWindow('bow', BOW);
        break;
      }

      case 'bow':
      case 'encore':
        this.timer -= dt;
        me.vx = approach(me.vx, 0, 900 * dt);
        me.act = 'bow';
        me.k = bowCurve(1 - this.timer / (this.state === 'bow' ? BOW : ENCORE));
        if (this.timer <= 0) this.toStrut(rand(STRUT[0], STRUT[1]) * this.haste);
        break;

      case 'crouch':
        this.timer -= dt;
        me.vx = approach(me.vx, 0, 1200 * dt);
        me.facing = p.cx > me.x ? 1 : -1;
        me.act = 'crouch';
        me.k = clamp(1 - this.timer / CROUCH, 0, 1);
        // The bells: every one on him going at once.
        if (world.time % 0.1 < dt) audio.play('coin', 2.1 + Math.random() * 0.3);
        if (this.timer <= 0) this.beginWheel(world);
        break;

      case 'wheel': {
        const speed = this.phaseTwo ? WHEEL_SPEED_TWO : WHEEL_SPEED;
        me.vx = this.wheelDir * speed;
        me.facing = this.wheelDir;
        const turn = (speed / (WHEEL_H / 2)) * dt;
        if (Math.floor((me.spin + turn) / Math.PI) !== Math.floor(me.spin / Math.PI)) audio.play('wing', 1.3);
        me.spin += turn;
        me.act = 'wheel';
        if (world.time % 0.03 < dt) this.dust(world, me.x - this.wheelDir * 12, 1);
        const done = this.wheelDir > 0 ? me.x >= this.wheelTo - 0.5 : me.x <= this.wheelTo + 0.5;
        if (done) this.endWheel(world);
        break;
      }

      case 'split':
        this.timer -= dt;
        me.vx = approach(me.vx, 0, 900 * dt);
        me.act = 'split';
        me.k = clamp(1 - this.timer / SPLIT, 0, 1);
        if (this.timer <= 0) this.toStrut(rand(STRUT[0], STRUT[1]) * this.haste);
        break;

      case 'kneel':
        this.timer -= dt;
        me.vx = approach(me.vx, 0, 1200 * dt);
        me.facing = p.cx > me.x ? 1 : -1;
        me.act = 'kneel';
        me.k = clamp(1 - this.timer / KNEEL, 0, 1);
        if (this.timer <= 0) this.leap(world);
        break;

      case 'salto':
        this.saltoT += dt;
        me.act = 'tuck';
        me.k = clamp(this.saltoT / SALTO_TIME, 0, 1);
        me.spin = TAU * (me.k * me.k * (3 - 2 * me.k));
        break;

      case 'dizzy':
        this.timer -= dt;
        me.vx = approach(me.vx, 0, 400 * dt);
        me.act = 'dizzy';
        if (world.time % 0.45 < dt) audio.play('coin', 0.9 + Math.random() * 0.2);
        if (this.timer <= 0) this.toStrut(rand(STRUT[0], STRUT[1]) * this.haste);
        break;

      case 'conjure':
        this.timer -= dt;
        me.vx = approach(me.vx, 0, 1200 * dt);
        me.facing = p.cx > me.x ? 1 : -1;
        me.act = 'conjure';
        me.k = clamp(1 - this.timer / CONJURE, 0, 1);
        if (world.time % 0.04 < dt) this.smoke(world, me.x + rand(-26, 26), me.y - rand(0, 20), 1, 0.4 + me.k * 0.5);
        if (this.timer <= 0) this.splitUp(world);
        break;

      case 'shuffle':
        this.timer -= dt;
        if (!this.spots && this.timer <= PLACES) this.takePlaces(world);
        this.updateLegs(dt, world);
        if (this.timer <= 0) this.beginGuess(world);
        break;

      case 'guess': {
        this.timer -= dt;
        const k = bowCurve(1 - this.timer / GUESS);
        for (const f of this.all) {
          f.act = 'bow';
          f.k = k;
          f.facing = p.cx > f.x ? 1 : -1;
        }
        if (this.timer <= 0) this.beginVolley(world);
        break;
      }

      case 'unmasked':
        this.timer -= dt;
        me.vx = approach(me.vx, 0, 500 * dt);
        me.act = 'unmasked';
        if (world.time % 0.3 < dt) world.particles.burst(me.x + me.facing * 6, me.y - 50, 1, '#ffe27a', { speed: 40, gravity: -30, shape: 'spark' });
        if (this.timer <= 0) this.toStrut(0.35);
        break;

      case 'volley':
        this.timer -= dt;
        for (const f of this.all) {
          f.act = 'raise';
          f.k = clamp(1 - this.timer / VOLLEY_WIND, 0, 1);
          f.facing = p.cx > f.x ? 1 : -1;
        }
        if (this.timer <= 0 && !this.volleyThrown) this.loose(world);
        break;

      case 'merge': {
        // Back into him, the copies, as smoke.
        this.timer -= dt;
        const k = clamp(1 - this.timer / MERGE, 0, 1);
        me.act = 'stand';
        for (const c of this.copies) {
          if (!c.leg) c.leg = { from: c.x, to: me.x, fromY: c.y, t: 0, dur: MERGE, style: 'run', apex: 0 };
          c.leg.t += dt;
          c.x = lerp(c.leg.from, c.leg.to, easeOut(k, 2));
          c.act = 'run';
          c.fade = 1 - k;
          c.facing = c.leg.to >= c.leg.from ? 1 : -1;
          if (world.time % 0.05 < dt) this.smoke(world, c.x, c.y - 30, 1, 0.5);
        }
        if (this.timer <= 0) {
          this.copies = [];
          this.order = [me];
          this.anchor = null;
          this.toWindow('encore', ENCORE);
          audio.play('coin', 1.3);
        }
        break;
      }

      case 'stagger':
        this.timer -= dt;
        me.vx = approach(me.vx, 0, 500 * dt);
        me.act = 'stagger';
        if (this.timer <= 0) this.toStrut(0.4);
        break;

      case 'dying': {
        const before = this.timer;
        this.timer -= dt;
        me.vx = approach(me.vx, 0, 600 * dt);
        me.act = 'collapse';
        me.k = clamp((DYING - this.timer) / 1.0, 0, 1);
        if (before > DYING - 1.1 && this.timer <= DYING - 1.1) this.dropMask(world);
        if (this.timer <= 0) {
          world.particles.burst(me.x, me.y - 24, 18, '#d9c6ff', { speed: 120, gravity: -30, size: 5, shape: 'circle' });
          this.confetti(world, me.x, me.y - 30, 30);
          this.die(world);
          world.onBossFelled('jester', me.x, this.floorY - 90);
        }
        break;
      }
    }

    const landed = this.moveReal(dt);
    if (landed) {
      if (this.state === 'hop') {
        me.spin = 0;
        me.facing = p.cx > me.x ? 1 : -1;
        audio.play('land', 1.2);
        if (this.hopThen === 'knives') this.beginJuggle(world);
        else this.beginCrouch(world);
      } else if (this.state === 'salto') {
        this.land(world);
      }
    }
    this.facing = me.facing;
    this.placeBox(world);
  }

  /**
   * His own feet: on the boards, or in the air through a flip or a salto. The
   * shuffle moves him the way it moves the copies - see updateLegs.
   */
  private moveReal(dt: number): boolean {
    const me = this.me;
    if (this.state === 'shuffle') return false;
    let landed = false;
    const airborne = this.state === 'hop' || this.state === 'salto' || me.y < this.floorY - 0.5;
    if (airborne) {
      me.vy += (this.state === 'salto' ? SALTO_G : this.state === 'hop' ? (8 * HOP_APEX) / (HOP_TIME * HOP_TIME) : 1400) * dt;
      me.x += me.vx * dt;
      me.y += me.vy * dt;
      if (me.y >= this.floorY && me.vy > 0) {
        me.y = this.floorY;
        me.vy = 0;
        landed = true;
      }
    } else {
      me.x += me.vx * dt;
      me.y = this.floorY;
      me.vy = 0;
    }
    me.x = clamp(me.x, this.arenaLeft + W / 2, this.arenaRight - W / 2);
    return landed;
  }

  /**
   * The box the game sees: it culls and draws by it, and the parry finds what
   * is within sixty pixels of its middle. He is one box and up to four
   * figures, and a box on him alone would leave the copies undrawn whenever
   * he was off at the far end of the stage: it sits on the figure nearest the
   * hero - outside the trick that is him - and never further than VIEW_REACH
   * from the hero, so the stage, its lights and every figure on it are drawn
   * whenever any of it is on screen. What a blade meets is his business, not
   * the box's: see overlaps.
   */
  private placeBox(world: World): void {
    const p = world.player;
    let a = this.me;
    if (this.copies.length && this.state !== 'dying') {
      const near = this.all.reduce((b, f) => (Math.abs(f.x - p.cx) < Math.abs(b.x - p.cx) ? f : b), this.me);
      if (!this.anchor || !this.all.includes(this.anchor) || Math.abs(near.x - p.cx) + 40 < Math.abs(this.anchor.x - p.cx)) this.anchor = near;
      a = this.anchor;
    }
    this.w = W;
    this.h = H;
    let x = clamp(a.x - W / 2, p.cx - VIEW_REACH, p.cx + VIEW_REACH - W);
    x = clamp(x, this.arenaLeft, this.arenaRight - W);
    this.x = x;
    this.y = a.y - H;
    this.vx = a.vx;
    this.vy = 0;
  }

  private toStrut(seconds: number): void {
    this.state = 'strut';
    this.timer = seconds;
    this.keep = rand(190, 250);
    this.me.knives = 0;
    this.me.spin = 0;
  }

  private toWindow(state: 'bow' | 'split' | 'dizzy' | 'encore', seconds: number): void {
    this.state = state;
    this.timer = seconds;
    this.me.knives = 0;
    this.me.spin = 0;
    this.me.k = 0;
  }

  /** Where he prances to: a showman's distance off, on his own side if there is room. */
  private strutSpot(heroX: number): number {
    const lo = this.arenaLeft + 50;
    const hi = this.arenaRight - 50;
    const side = this.me.x < heroX ? -1 : 1;
    let want = heroX + side * this.keep;
    if (want < lo || want > hi) want = heroX - side * this.keep;
    return clamp(want, lo, hi);
  }

  private chooseMove(world: World): void {
    const p = world.player;
    const me = this.me;
    const dist = Math.abs(p.cx - me.x);
    me.facing = p.cx > me.x ? 1 : -1;
    // Up on a balcony only the knives reach him - and the trick, which he has
    // to come down for.
    let move = this.drawMove();
    if (p.bottom < this.floorY - 40 && move !== 'trick') move = 'knives';
    this.lastMove = move;
    if (move === 'trick') this.beginConjure(world);
    else if (move === 'salto') this.beginKneel(world);
    else if (dist < HOP_NEAR) this.hop(world, move === 'wheel' ? 'wheel' : 'knives');
    else if (move === 'wheel') this.beginCrouch(world);
    else this.beginJuggle(world);
  }

  /**
   * The next move. Every third one is the trick, once the fight is six
   * seconds old; between tricks the three plain moves come from a shuffled
   * round, so each of them shows up whatever the hero does, and never the
   * same one twice running.
   */
  private drawMove(): Move {
    if (this.plainSinceTrick >= 2 && this.fightTime >= TRICK_NOT_BEFORE) {
      this.plainSinceTrick = 0;
      return 'trick';
    }
    if (this.bag.length === 0) {
      this.bag = ['knives', 'wheel', 'salto'];
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
    }
    const top = this.bag.length - 1;
    if (this.bag[top] === this.lastMove && this.bag.length > 1) [this.bag[0], this.bag[top]] = [this.bag[top], this.bag[0]];
    this.plainSinceTrick++;
    return this.bag.pop() ?? 'knives';
  }

  /** Over and away for room: backwards, or over the hero's head if the wall is behind him. */
  private hop(world: World, then: 'knives' | 'wheel'): void {
    const p = world.player;
    const me = this.me;
    const away = me.x < p.cx ? -1 : 1;
    let to = clamp(me.x + away * HOP_DIST, this.arenaLeft + 40, this.arenaRight - 40);
    let dir = -1;
    if (Math.abs(to - me.x) < 90) {
      to = clamp(p.cx - away * 130, this.arenaLeft + 40, this.arenaRight - 40);
      dir = 1;
    }
    this.state = 'hop';
    this.hopThen = then;
    this.hopT = 0;
    this.hopDir = dir;
    me.facing = dir > 0 ? (to > me.x ? 1 : -1) : p.cx > me.x ? 1 : -1;
    me.vx = (to - me.x) / HOP_TIME;
    me.vy = (-4 * HOP_APEX) / HOP_TIME;
    me.y = this.floorY - 0.6;
    me.spin = 0;
    audio.play('jump', 1.25);
    audio.play('coin', 1.7);
  }

  beginJuggle(world: World): void {
    const me = this.me;
    me.facing = world.player.cx > me.x ? 1 : -1;
    this.state = 'juggle';
    this.timer = JUGGLE;
    me.knives = KNIVES;
    me.t = 0;
    audio.play('tell', 1.35);
    audio.play('clank', 2.1);
  }

  beginCrouch(world: World): void {
    const me = this.me;
    me.facing = world.player.cx > me.x ? 1 : -1;
    this.state = 'crouch';
    this.timer = CROUCH;
    audio.play('tell', 1.15);
  }

  beginKneel(world: World): void {
    const me = this.me;
    me.facing = world.player.cx > me.x ? 1 : -1;
    this.state = 'kneel';
    this.timer = KNEEL;
    audio.play('tell', 1.0);
  }

  beginConjure(world: World): void {
    const me = this.me;
    me.facing = world.player.cx > me.x ? 1 : -1;
    this.state = 'conjure';
    this.timer = CONJURE;
    audio.play('tell', 0.7);
    audio.play('magic', 0.8);
  }

  /** A knife from a hand over the head, on an arc at where the hero is now. */
  private throwKnife(world: World, f: Figure): void {
    const p = world.player;
    const ox = f.x + f.facing * 8;
    const oy = f.y - 74;
    const dist = Math.abs(p.cx - ox);
    // Long enough in the air to be read from across the stage, and quick up
    // close: a hero who crowds a juggler while he throws has a quarter of a
    // second, once he has seen it, to get out from under it. Measured with the
    // bench's reader, who walks in on him while he juggles: at 0.66 s up close
    // he lost no heart in most fights, nothing about him was a danger to a
    // careful player; at 0.56 s he lost two in most; 0.565 s costs him one.
    const flight = clamp(0.525 + dist / 900, 0.565, 0.95);
    const vx = (p.cx - ox) / flight;
    const vy = (p.cy - oy) / flight - 0.5 * KNIFE_G * flight;
    const knife = new Projectile('knife', ox - 8, oy - 6, vx, vy);
    knife.damage = 1;
    world.spawnProjectile(knife);
    audio.play('swing', 1.35);
    world.particles.burst(ox, oy, 4, '#f4f0ff', { speed: 90, gravity: 0, shape: 'spark' });
  }

  private beginWheel(world: World): void {
    const p = world.player;
    const me = this.me;
    this.wheelDir = p.cx >= me.x ? 1 : -1;
    this.wheelTo = clamp(p.cx + this.wheelDir * WHEEL_PAST, this.arenaLeft + WHEEL_HALF + 4, this.arenaRight - WHEEL_HALF - 4);
    // A hero standing right at the wall: the wheel still has to get to him.
    if ((this.wheelTo - me.x) * this.wheelDir < 60) this.wheelTo = clamp(me.x + this.wheelDir * 60, this.arenaLeft + WHEEL_HALF + 4, this.arenaRight - WHEEL_HALF - 4);
    this.state = 'wheel';
    this.hitThisMove = false;
    me.spin = 0;
    me.facing = this.wheelDir;
    audio.play('dash', 0.8);
    audio.play('coin', 1.5);
  }

  private endWheel(world: World): void {
    const me = this.me;
    me.x = this.wheelTo;
    me.vx = 0;
    me.spin = 0;
    me.facing = world.player.cx > me.x ? 1 : -1;
    if (this.phaseTwo && !this.chained && Math.random() < CHAIN_CHANCE) {
      // Up out of the wheel and straight into the juggling: still its own tell.
      this.chained = true;
      this.lastMove = 'knives';
      this.beginJuggle(world);
      return;
    }
    this.chained = false;
    this.toWindow('split', SPLIT);
    audio.play('land', 0.85);
    audio.play('coin', 1.25);
    this.dust(world, me.x, 8);
  }

  /** Up, high, to come down where the hero stands now. */
  private leap(world: World): void {
    const p = world.player;
    const me = this.me;
    this.landX = clamp(p.cx, this.arenaLeft + W, this.arenaRight - W);
    me.facing = this.landX >= me.x ? 1 : -1;
    me.vx = (this.landX - me.x) / SALTO_TIME;
    me.vy = (-4 * SALTO_APEX) / SALTO_TIME;
    me.y = this.floorY - 0.6;
    me.spin = 0;
    this.saltoT = 0;
    this.state = 'salto';
    this.hitThisMove = false;
    audio.play('jump', 0.85);
    audio.play('coin', 1.8);
    this.dust(world, me.x, 6);
  }

  /** Down, and the ring goes out: one heart to a hero still standing on the spot. */
  private land(world: World): void {
    const p = world.player;
    const me = this.me;
    me.x = this.landX;
    me.vx = 0;
    me.spin = 0;
    me.facing = p.cx > me.x ? 1 : -1;
    this.rings.push({ x: me.x, t: 0 });
    audio.play('slam', 1.05);
    audio.play('coin', 0.85);
    world.camera.addShake(5);
    this.dust(world, me.x, 14);
    if (!this.hitThisMove && !p.dead && Math.abs(p.cx - me.x) < RING && Math.abs(p.bottom - this.floorY) < 44) {
      this.hitThisMove = true;
      p.hurt(1, sign(p.cx - me.x) || 1, world);
    }
    this.toWindow('dizzy', DIZZY);
  }

  /* ---------------------------------------------------------------- trick */

  /** The puff: and there are three of him - four, in his second half. */
  private splitUp(world: World): void {
    const p = world.player;
    const me = this.me;
    const n = this.phaseTwo ? 4 : 3;
    const copies: Figure[] = [];
    for (let i = 1; i < n; i++) {
      const c = figure(me.x, me.y, false);
      c.facing = me.facing;
      c.act = 'flip';
      copies.push(c);
    }
    this.copies = copies;
    const all = this.shuffled(this.all);
    const spread = n === 4 ? [-1.5, -0.5, 0.5, 1.5] : [-1, 0, 1];
    const [lo, hi] = this.band(p.cx);
    all.forEach((f, i) => {
      const to = clamp(me.x + spread[i] * 150, lo, hi);
      f.leg = { from: f.x, to, fromY: f.y, t: 0, dur: 0.5 + Math.random() * 0.12, style: 'flip', apex: 40 + Math.random() * 26 };
      f.spin = 0;
      f.knives = 0;
    });
    this.order = this.shuffled(this.all);
    this.spots = null;
    this.anchor = null;
    this.state = 'shuffle';
    this.timer = this.phaseTwo ? SHUFFLE_TWO : SHUFFLE;
    this.smoke(world, me.x, me.y - 30, 22, 1);
    this.confetti(world, me.x, me.y - 50, 20);
    audio.play('fuse', 0.8);
    audio.play('magic', 1.25);
    audio.play('coin', 1.6);
  }

  private shuffled<T>(list: T[]): T[] {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  /** The part of the stage the shuffle keeps to: round the hero, never past the wards. */
  private band(heroX: number): [number, number] {
    let lo = Math.max(this.arenaLeft + 40, heroX - 340);
    let hi = Math.min(this.arenaRight - 40, heroX + 340);
    if (hi - lo < 420) {
      if (lo <= this.arenaLeft + 40) hi = Math.min(this.arenaRight - 40, lo + 420);
      else lo = Math.max(this.arenaLeft + 40, hi - 420);
    }
    return [lo, hi];
  }

  /** Each figure along its run; a new one at the end of each, until the places are given out. */
  private updateLegs(dt: number, world: World): void {
    for (const f of this.all) {
      const leg = f.leg;
      if (!leg) continue;
      leg.t += dt;
      const u = clamp(leg.t / leg.dur, 0, 1);
      const prev = f.x;
      if (leg.style === 'run') {
        f.x = lerp(leg.from, leg.to, u * u * (3 - 2 * u));
        f.y = lerp(leg.fromY, this.floorY, Math.min(1, u * 4));
        f.act = 'run';
      } else if (leg.style === 'wheel') {
        f.x = lerp(leg.from, leg.to, u);
        f.y = lerp(leg.fromY, this.floorY, Math.min(1, u * 4));
        f.spin += (Math.abs(leg.to - leg.from) / Math.max(0.05, leg.dur) / (WHEEL_H / 2)) * dt;
        f.act = 'wheel';
      } else {
        f.x = lerp(leg.from, leg.to, u);
        f.y = lerp(leg.fromY, this.floorY, u) - 4 * leg.apex * u * (1 - u);
        f.spin = TAU * easeOut(u, 1.5);
        f.act = 'flip';
      }
      f.vx = (f.x - prev) / Math.max(dt, 1e-4);
      if (Math.abs(leg.to - leg.from) > 2) f.facing = leg.to > leg.from ? 1 : -1;
      if (u >= 1) {
        f.leg = null;
        f.spin = 0;
        f.y = this.floorY;
        f.vx = 0;
        if (!this.spots) this.nextLeg(f, world);
        else {
          f.act = 'stand';
          f.facing = world.player.cx > f.x ? 1 : -1;
        }
      }
    }
  }

  /** Somewhere else on the stage, and as often as not across one of the others. */
  private nextLeg(f: Figure, world: World): void {
    const [lo, hi] = this.band(world.player.cx);
    const others = this.all.filter((o) => o !== f);
    let to = f.x;
    for (let tries = 0; tries < 8; tries++) {
      const cand = rand(lo, hi);
      if (Math.abs(cand - f.x) < 90) continue;
      to = cand;
      if (others.some((o) => (o.x - f.x) * (o.x - cand) < 0)) break;
    }
    if (Math.abs(to - f.x) < 1) to = clamp(f.x + (f.x - lo > hi - f.x ? -1 : 1) * 140, lo, hi);
    const dist = Math.abs(to - f.x);
    const r = Math.random();
    const style: Leg['style'] = r < 0.45 ? 'run' : r < 0.78 ? 'wheel' : 'flip';
    const fast = this.phaseTwo ? 1.2 : 1;
    const dur = style === 'run' ? dist / (250 * fast) : style === 'wheel' ? dist / (360 * fast) : clamp(dist / 330, 0.42, 0.7) / fast;
    f.leg = { from: f.x, to, fromY: f.y, t: 0, dur: Math.max(0.22, dur), style, apex: style === 'flip' ? 36 + dist * 0.12 : 0 };
  }

  /**
   * The line: one place each, a sword's walk apart, round where the hero is
   * standing - so whichever one he wants, he can get to it while they bow.
   * They go to their places in the order they stand in, so nobody crosses
   * anybody on the way.
   */
  private takePlaces(world: World): void {
    const p = world.player;
    const all = this.all;
    const n = all.length;
    const gap = n >= 4 ? 115 : 130;
    const span = gap * (n - 1);
    const centre = n % 2 === 1 ? p.cx + (Math.random() < 0.5 ? -1 : 1) * (gap / 2) : p.cx;
    const c = clamp(centre, this.arenaLeft + 40 + span / 2, this.arenaRight - 40 - span / 2);
    const spots = all.map((_, i) => c - span / 2 + i * gap);
    const byX = [...all].sort((a, b) => a.x - b.x);
    byX.forEach((f, i) => {
      const to = spots[i];
      const dist = Math.abs(to - f.x);
      const style: Leg['style'] = dist > 170 || f.y < this.floorY - 2 ? 'flip' : 'run';
      f.leg = { from: f.x, to, fromY: f.y, t: 0, dur: Math.max(0.15, this.timer), style, apex: style === 'flip' ? 30 + dist * 0.1 : 0 };
    });
    this.spots = spots;
  }

  private beginGuess(world: World): void {
    const p = world.player;
    const spots = this.spots;
    const byX = [...this.all].sort((a, b) => a.x - b.x);
    byX.forEach((f, i) => {
      f.leg = null;
      if (spots) f.x = spots[i];
      f.y = this.floorY;
      f.vx = 0;
      f.spin = 0;
      f.act = 'bow';
      f.k = 0;
      f.facing = p.cx > f.x ? 1 : -1;
    });
    this.state = 'guess';
    this.timer = GUESS;
    audio.play('coin', 1.2);
    audio.play('magic', 0.95);
    if (!this.told) {
      this.told = true;
      world.announce('NUR EINER WIRFT EINEN SCHATTEN', 3.6);
    }
  }

  /** The real one, struck in his bow: the mask cracks and slips, and the copies are gone. */
  private unmask(world: World, amount: number): void {
    const me = this.me;
    for (const c of this.copies) this.pop(world, c, false);
    this.copies = [];
    this.order = [me];
    this.anchor = null;
    this.spots = null;
    this.state = 'unmasked';
    this.timer = UNMASKED;
    this.cracked = true;
    me.act = 'unmasked';
    me.t = 0;
    this.hp -= amount * 2;
    this.flash = 1;
    audio.play('clank', 1.75);
    audio.play('screech', 1.3);
    audio.play('bossHit', 0.85);
    world.hitStop(0.12);
    world.camera.addShake(7);
    world.particles.text(me.x, me.y - 92, 'ENTLARVT!', '#ffd36a');
    world.particles.burst(me.x + me.facing * 4, me.y - 60, 14, '#f4efe4', { speed: 170, gravity: 520, size: 2.6 });
    world.particles.burst(me.x + me.facing * 4, me.y - 60, 16, '#ffe27a', { speed: 230, gravity: 160, shape: 'spark' });
    if (this.hp <= 0) {
      this.beginDying(world);
      return;
    }
    this.checkPhase(world);
  }

  /** A copy, struck: smoke and confetti, and the rest of them answer with a knife each. */
  private puff(world: World, f: Figure): void {
    this.pop(world, f, true);
    this.copies = this.copies.filter((c) => c !== f);
    this.order = this.order.filter((c) => c !== f);
    if (this.anchor === f) this.anchor = null;
    world.particles.text(f.x, f.y - 84, 'PUFF!', '#eadcff');
    this.beginVolley(world);
  }

  private pop(world: World, f: Figure, loud: boolean): void {
    this.smoke(world, f.x, f.y - 34, 16, 1);
    this.confetti(world, f.x, f.y - 46, loud ? 26 : 14);
    if (loud) {
      audio.play('fuse', 1.2);
      audio.play('magic', 0.65);
      audio.play('blip', 0.7);
    }
  }

  /** Every figure still there raises a knife: the tell for the volley. */
  private beginVolley(world: World): void {
    const p = world.player;
    this.state = 'volley';
    this.timer = VOLLEY_WIND;
    this.volleyThrown = false;
    for (const f of this.all) {
      f.act = 'raise';
      f.k = 0;
      f.knives = 1;
      f.leg = null;
      f.facing = p.cx > f.x ? 1 : -1;
    }
    audio.play('tell', 1.25);
    audio.play('clank', 2.2);
  }

  /** And they throw, all at once, and go back into him. */
  private loose(world: World): void {
    this.volleyThrown = true;
    for (const f of this.all) {
      this.throwKnife(world, f);
      f.knives = 0;
    }
    this.state = 'merge';
    this.timer = MERGE;
    for (const c of this.copies) c.leg = null;
    audio.play('magic', 1.4);
  }

  /** The copies gone, from whatever he was doing - a stumble, or his fall. */
  private endTrick(world: World, loud: boolean): void {
    if (!this.copies.length) return;
    for (const c of this.copies) this.pop(world, c, loud);
    this.copies = [];
    this.order = [this.me];
    this.anchor = null;
    this.spots = null;
    this.me.leg = null;
    this.me.y = Math.min(this.me.y, this.floorY);
  }

  /* -------------------------------------------------------------- effects */

  private smoke(world: World, x: number, y: number, n: number, k: number): void {
    for (let i = 0; i < n; i++) {
      world.particles.spawn({
        x: x + rand(-10, 10),
        y: y + rand(-12, 12),
        vx: rand(-70, 70) * k,
        vy: -rand(20, 80) * k,
        gravity: -40,
        color: Math.random() < 0.5 ? 'rgba(206,190,236,0.5)' : 'rgba(150,130,190,0.45)',
        size: rand(4, 8),
        life: rand(0.5, 0.9),
        shape: 'circle',
        drag: 0.9,
      });
    }
  }

  private confetti(world: World, x: number, y: number, n: number): void {
    const colours = [GOLD, GOLD_LIGHT, VIOLET_LIGHT, '#ff7aa8', '#7ad8ff', '#fff3d0'];
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const s = rand(80, 230);
      world.particles.spawn({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 90,
        gravity: 170,
        color: colours[i % colours.length],
        size: rand(2, 3.4),
        life: rand(0.9, 1.5),
        shape: 'square',
        drag: 0.93,
      });
    }
  }

  private dust(world: World, x: number, n: number): void {
    for (let i = 0; i < n; i++) {
      world.particles.spawn({
        x: x + rand(-10, 10),
        y: this.floorY - rand(1, 5),
        vx: rand(-90, 90),
        vy: -rand(30, 110),
        gravity: 420,
        color: Math.random() < 0.5 ? 'rgba(150,128,110,0.6)' : 'rgba(110,94,84,0.55)',
        size: rand(2, 3.5),
        life: rand(0.3, 0.55),
        shape: 'circle',
      });
    }
  }

  /** His face falls off as he does. */
  private dropMask(world: World): void {
    const me = this.me;
    this.dropped = { x: me.x + me.facing * 10, y: me.y - 34, vx: me.facing * rand(50, 80), vy: -150, rot: 0, spin: me.facing * 7 };
    audio.play('clank', 1.5);
    world.particles.burst(me.x, me.y - 34, 6, '#f4efe4', { speed: 80, gravity: 300, size: 2 });
  }

  private updateDropped(dt: number): void {
    const d = this.dropped;
    if (!d) return;
    if (d.y < this.floorY - 3) {
      d.vy += 900 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.rot += d.spin * dt;
      if (d.y >= this.floorY - 3) {
        d.y = this.floorY - 3;
        d.rot = Math.PI / 2 + 0.25;
        d.vx = 0;
      }
    }
  }

  /* --------------------------------------------------------------- lights */

  override lights(): GlowLight[] {
    const out: GlowLight[] = [];
    if (this.dead || this.floorY === 0) return out;
    const F = this.floorY;
    const k = this.stageLight;
    // The footlights wash the back wall: that is where the shadow has to read.
    // Only the darkness is burnt away here - the warmth is in the wash drawStage
    // lays under the shadow, so the light pass's own colour pass is skipped. The
    // boards are lit already, by the lamps themselves: a light of his own on
    // every figure cost a good part of a frame and showed nothing new.
    for (const x of this.footlights) out.push({ x, y: F - 172, radius: 158, rgb: '255,196,136', strength: 0.66 * k, tint: 0 });
    for (const f of this.all) {
      if (f.knives > 0 && f.fade > 0.05) out.push({ x: f.x, y: f.y - 86, radius: 46, rgb: '236,236,255', strength: 0.45 * f.fade, tint: 0.2 });
    }
    if (this.state === 'unmasked') out.push({ x: this.me.x, y: this.me.y - 52, radius: 80, rgb: '255,226,122', strength: 0.6, tint: 0.3 });
    for (const r of this.rings) out.push({ x: r.x, y: F - 10, radius: 110, rgb: '255,214,160', strength: 0.6 * (1 - r.t / 0.5), tint: 0.3 });
    return out;
  }

  /* -------------------------------------------------------------- drawing */

  override draw(ctx: CanvasRenderingContext2D): void {
    if (this.floorY === 0) return;
    this.drawStage(ctx);
    for (const f of this.all) if (f.casts) this.drawWallShadow(ctx, f);
    this.drawFloor(ctx);
    for (const f of this.order) {
      if (f === this.me) withHitFlash(ctx, this.flash, (ctx) => this.drawFigure(ctx, f, false));
      else this.drawFigure(ctx, f, false);
    }
    if (this.dropped) this.drawDroppedMask(ctx);
  }

  /**
   * The footlights throw their light up the back wall: a warm pool above each
   * lamp. Without it the wall is the night sky, and a dark shadow on a dark
   * sky is no rule anybody can play by.
   */
  private drawStage(ctx: CanvasRenderingContext2D): void {
    const k = this.stageLight;
    if (k <= 0.02) return;
    const F = this.floorY;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const fan = this.paint(ctx).fan;
    for (const x of this.footlights) {
      const flick = 0.88 + 0.12 * Math.sin(this.anim * 6.1 + x * 0.37) + Math.sin(this.anim * 13.7 + x) * 0.03;
      ctx.save();
      ctx.globalAlpha = 0.28 * k * flick;
      ctx.translate(x, F - 150);
      ctx.scale(1, 1.35);
      ctx.fillStyle = fan;
      ctx.beginPath();
      ctx.arc(0, 0, 150, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  private paint(ctx: CanvasRenderingContext2D): { fan: CanvasGradient; shade: CanvasGradient; face: CanvasGradient } {
    if (this.paints) return this.paints;
    const fan = ctx.createRadialGradient(0, 40, 6, 0, 0, 150);
    fan.addColorStop(0, 'rgba(255,200,140,1)');
    fan.addColorStop(0.45, 'rgba(255,170,120,0.55)');
    fan.addColorStop(1, 'rgba(255,150,110,0)');
    const shade = ctx.createLinearGradient(-9, 0, 9, 0);
    shade.addColorStop(0, 'rgba(14,6,26,0.55)');
    shade.addColorStop(0.55, 'rgba(14,6,26,0.1)');
    shade.addColorStop(1, 'rgba(255,220,170,0.12)');
    const face = ctx.createLinearGradient(-5, -14, 7, -3);
    face.addColorStop(0, PORCELAIN_SHADE);
    face.addColorStop(0.45, PORCELAIN);
    face.addColorStop(1, '#fffaf0');
    this.paints = { fan, shade, face };
    return this.paints;
  }

  private nearestLamp(x: number): number {
    let best = x;
    let d = Infinity;
    for (const l of this.footlights) {
      if (Math.abs(l - x) < d) {
        d = Math.abs(l - x);
        best = l;
      }
    }
    return best;
  }

  /**
   * The rule, drawn: his silhouette, 1.8 times his size, up on the back wall
   * and pushed a little away from the lamp nearest him. Drawn whole into a
   * small canvas at half resolution and laid on in one go, so the limbs do not
   * darken where they overlap and the edge comes out soft.
   */
  private drawWallShadow(ctx: CanvasRenderingContext2D, f: Figure): void {
    const s = this.wallShadow;
    if (!s || f.fade <= 0) return;
    const LW = 220;
    const LH = 240;
    const down = 2;
    if (!this.silCanvas) ({ canvas: this.silCanvas, ctx: this.silCtx } = makeCanvas(LW / down, LH / down));
    const sc = this.silCtx;
    if (!sc) return;
    sc.setTransform(1, 0, 0, 1, 0, 0);
    sc.clearRect(0, 0, LW / down, LH / down);
    const k = WALL_SCALE / down;
    sc.setTransform(k, 0, 0, k, LW / 2 / down, (LH - 14) / down);
    // The figure at its own height above the boards, as the wall sees it.
    this.drawFigure(sc, { ...f, x: 0, y: (f.y - this.floorY) * 0.33 }, true);
    // A breath of flicker from the flames that throw it.
    const flick = 0.94 + Math.sin(this.anim * 7.3) * 0.04 + Math.sin(this.anim * 17.1) * 0.02;
    ctx.save();
    ctx.globalAlpha = WALL_SHADOW_ALPHA * flick * f.fade * clamp(this.stageLight * 1.4, 0.4, 1);
    ctx.drawImage(this.silCanvas as HTMLCanvasElement, s.x - LW / 2, s.y - (LH - 14), LW, LH);
    ctx.restore();
  }

  /** What is on the boards: the shadow at his feet, the salto's mark, the rings. */
  private drawFloor(ctx: CanvasRenderingContext2D): void {
    const F = this.floorY;
    if (this.state === 'salto') {
      // His shadow is down where he will land, and darker the nearer he comes.
      const k = clamp(this.saltoT / SALTO_TIME, 0, 1);
      shadow(ctx, this.landX, F + 1, 34 + k * 30, 0.18 + k * 0.32);
      ctx.save();
      ctx.strokeStyle = `rgba(255,214,150,${(0.12 + k * 0.3).toFixed(3)})`;
      ctx.lineWidth = 1.4;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.ellipse(this.landX, F - 1, RING, 8, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
    } else {
      // On the boards too, only the one who is there throws one.
      for (const f of this.all) {
        if (!f.casts || f.fade <= 0) continue;
        const up = clamp((F - f.y) / 120, 0, 1);
        shadow(ctx, f.x, F + 1, (f.act === 'split' ? 64 : f.act === 'slump' || f.act === 'collapse' ? 52 : 36) * (1 - up * 0.4), 0.36 * (1 - up * 0.5));
      }
    }
    for (const r of this.rings) {
      const u = clamp(r.t / 0.5, 0, 1);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(255,220,160,${(0.75 * (1 - u)).toFixed(3)})`;
      ctx.lineWidth = 3 * (1 - u) + 1;
      ctx.beginPath();
      ctx.ellipse(r.x, F - 2, RING * (0.3 + u * 0.8), 6 + u * 6, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  /** A figure, by its act: the real one, a copy, or the silhouette on the wall. */
  private drawFigure(ctx: CanvasRenderingContext2D, f: Figure, sil: boolean): void {
    if (f.fade <= 0.01) return;
    const pose = this.poseOf(f);
    if (f === this.me && this.dodge > 0) {
      // Out of the blade's way: a lean back from the side it came from.
      const k = Math.sin((this.dodge / 0.3) * Math.PI);
      pose.tilt += this.dodgeDir * f.facing * 0.32 * k;
      pose.lean -= 0.25 * k * (this.dodgeDir === f.facing ? -1 : 1);
    }
    const pelvis = pelvisOf(pose);
    ctx.save();
    if (!sil && f.fade < 1) ctx.globalAlpha *= f.fade;
    ctx.translate(f.x, f.y);
    ctx.scale(f.facing, 1);
    if (pose.tilt) ctx.rotate(pose.tilt);
    ctx.translate(0, -pelvis);
    if (pose.rot) ctx.rotate(pose.rot);
    if (pose.scale !== 1) ctx.scale(pose.scale, pose.scale);
    // A wheel is a blur: two fainter copies of himself trail the turn.
    if (!sil && f.act === 'wheel') {
      const base = ctx.globalAlpha;
      for (const [back, a] of [
        [0.55, 0.22],
        [1.1, 0.1],
      ]) {
        ctx.save();
        ctx.rotate(-back);
        ctx.globalAlpha = base * a;
        this.drawBody(ctx, pose, f, false, true);
        ctx.restore();
      }
      ctx.globalAlpha = base;
    }
    this.drawBody(ctx, pose, f, sil, false);
    ctx.restore();
    if (!sil && f.act === 'dizzy') this.drawStars(ctx, f);
  }

  /** Little bells going round the head of a dizzy jester, so the window reads from across the stage. */
  private drawStars(ctx: CanvasRenderingContext2D, f: Figure): void {
    const cx = f.x + f.facing * 2;
    const cy = f.y - 84;
    for (let i = 0; i < 3; i++) {
      const a = this.anim * 5 + (i * TAU) / 3;
      const x = cx + Math.cos(a) * 14;
      const y = cy + Math.sin(a) * 4;
      const r = 2.2 + (Math.sin(a) > 0 ? 0.7 : 0);
      ctx.fillStyle = i % 2 ? GOLD_LIGHT : '#fff4c4';
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const rr = k % 2 ? r * 0.42 : r;
        const aa = (k * Math.PI) / 4;
        if (k === 0) ctx.moveTo(x + Math.cos(aa) * rr, y + Math.sin(aa) * rr);
        else ctx.lineTo(x + Math.cos(aa) * rr, y + Math.sin(aa) * rr);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  /** The pose for what a figure is doing. See Pose for the angles. */
  private poseOf(f: Figure): Pose {
    const p = standPose();
    const t = f.t + f.seed;
    switch (f.act) {
      case 'slump':
        return slumpPose();
      case 'rise': {
        // Up in jerks, as a marionette is pulled up.
        const steps = 4;
        const s = Math.min(steps - 1, Math.floor(f.k * steps));
        const kk = (s + easeOut(f.k * steps - s, 4)) / steps;
        return mixPose(slumpPose(), standPose(), clamp(kk, 0, 1));
      }
      case 'stand':
        p.lean = 0.06 + Math.sin(t * 2.2) * 0.02;
        p.nod = -0.06 + Math.sin(t * 1.3) * 0.06;
        // A hand on the hip, the other turning a flourish in the air.
        p.armB = -0.6;
        p.elbowB = 1.5;
        p.armF = 1.0 + Math.sin(t * 2.4) * 0.22;
        p.elbowF = 1.15 + Math.sin(t * 2.4 + 0.8) * 0.3;
        p.legF = 0.2;
        p.kneeF = -0.12;
        p.legB = -0.14;
        p.kneeB = -0.04;
        return p;
      case 'strut': {
        // High knees, toes pointed: he never simply walks.
        const g = t * 9;
        const s = Math.sin(g);
        const c = Math.cos(g);
        p.legF = 0.12 + 0.48 * s;
        p.kneeF = -0.12 - 1.15 * Math.max(0, c);
        p.legB = 0.12 - 0.48 * s;
        p.kneeB = -0.12 - 1.15 * Math.max(0, -c);
        p.armF = 0.35 - 0.6 * s;
        p.elbowF = 1.0;
        p.armB = 0.35 + 0.6 * s;
        p.elbowB = 1.0;
        p.lean = 0.12;
        p.nod = -0.12;
        p.lift = Math.abs(s) * 1.5;
        return p;
      }
      case 'run': {
        const g = t * 13;
        const s = Math.sin(g);
        const c = Math.cos(g);
        p.legF = 0.2 + 0.7 * s;
        p.kneeF = -0.3 - 1.1 * Math.max(0, c);
        p.legB = 0.2 - 0.7 * s;
        p.kneeB = -0.3 - 1.1 * Math.max(0, -c);
        p.armF = 0.6 - 0.9 * s;
        p.elbowF = 1.3;
        p.armB = 0.6 + 0.9 * s;
        p.elbowB = 1.3;
        p.lean = 0.3;
        p.nod = -0.2;
        p.lift = Math.abs(c) * 3;
        return p;
      }
      case 'juggle': {
        // Hands going up and down in turn over his head; faster as the tell runs out.
        const a = Math.sin(t * (10 + f.k * 8));
        p.armF = 2.45 + 0.3 * a;
        p.elbowF = 0.75 - 0.35 * a;
        p.armB = 2.65 - 0.3 * a;
        p.elbowB = 0.6 + 0.35 * a;
        p.nod = -0.5;
        p.lean = -0.06;
        p.legF = 0.3;
        p.kneeF = -0.14;
        p.legB = -0.28;
        p.kneeB = -0.1;
        return p;
      }
      case 'throw': {
        const a = Math.sin(t * 16);
        const k = easeOut(f.k, 3);
        p.armF = lerp(2.9, 1.25, k);
        p.elbowF = lerp(1.3, 0.05, k);
        p.armB = 2.65 - 0.3 * a;
        p.elbowB = 0.6 + 0.35 * a;
        p.lean = lerp(-0.1, 0.22, k);
        p.nod = -0.2;
        p.legF = 0.42;
        p.kneeF = -0.3;
        p.legB = -0.3;
        p.kneeB = -0.08;
        return p;
      }
      case 'bow':
      case 'conjure': {
        // Down from the waist, a hand on his heart and the other sweeping
        // back: the bow of a man who expects applause.
        const k = f.k;
        const deep = f.act === 'conjure' ? 1.18 : 1.05;
        p.lean = 0.05 + deep * k;
        p.nod = 0.35 * k;
        p.armF = lerp(0.3, -0.25, k);
        p.elbowF = lerp(0.5, 2.5, k);
        p.armB = lerp(-0.2, f.act === 'conjure' ? -2.75 : -2.2, k);
        p.elbowB = lerp(0.3, -0.35, k);
        // Both feet ahead of the hips: the weight stays back while he goes down.
        p.legF = 0.12 + 0.36 * k;
        p.kneeF = -0.06;
        p.legB = -0.1 + 0.24 * k;
        p.kneeB = -0.06 - 0.36 * k;
        if (f.act === 'conjure') p.tilt = Math.sin(t * 30) * 0.012 * k;
        return p;
      }
      case 'crouch': {
        const shake = Math.sin(t * 46) * 0.035 * (0.4 + f.k);
        p.legF = 1.25;
        p.kneeF = -2.35;
        p.legB = 0.85;
        p.kneeB = -2.3;
        p.lean = 0.7 + 0.12 * f.k;
        p.nod = -0.45;
        p.armF = -1.3 - 0.3 * f.k;
        p.elbowF = 0.5;
        p.armB = -1.55 - 0.3 * f.k;
        p.elbowB = 0.4;
        p.rot = shake;
        return p;
      }
      case 'wheel':
        // A star turning on its middle: 48 px from boot to hand.
        p.planted = false;
        p.hipY = WHEEL_H / 2;
        p.scale = 0.64;
        p.rot = f.spin;
        p.lean = 0;
        p.nod = 0.1;
        p.legF = 0.82;
        p.kneeF = -0.15;
        p.legB = -0.82;
        p.kneeB = -0.15;
        p.armF = 2.35;
        p.elbowF = 0.1;
        p.armB = -2.35;
        p.elbowB = -0.1;
        return p;
      case 'split':
        p.planted = false;
        p.hipY = 4;
        p.legF = Math.PI / 2;
        p.kneeF = 0;
        p.legB = -Math.PI / 2;
        p.kneeB = 0;
        p.lean = -0.08 + Math.sin(t * 2) * 0.03;
        p.nod = -0.12;
        p.armF = 2.55 + Math.sin(t * 3) * 0.08;
        p.elbowF = -0.2;
        p.armB = -2.55 - Math.sin(t * 3) * 0.08;
        p.elbowB = 0.2;
        return p;
      case 'kneel': {
        const k = f.k;
        p.legF = 1.1;
        p.kneeF = -2.15 - 0.1 * k;
        p.legB = 0.78;
        p.kneeB = -2.1 - 0.1 * k;
        p.lean = 0.62 + 0.15 * k;
        p.nod = -0.4;
        p.armF = -1.7 - 0.35 * k;
        p.elbowF = 0.3;
        p.armB = -1.9 - 0.35 * k;
        p.elbowB = 0.2;
        p.rot = Math.sin(t * 40) * 0.02 * k;
        return p;
      }
      case 'tuck': {
        // Balled up for the turn, and open again for the landing.
        const open = clamp((f.k - 0.72) / 0.28, 0, 1);
        const tuck: Pose = {
          ...p,
          planted: false,
          hipY: 26,
          rot: f.spin,
          lean: 0.65,
          nod: 0.45,
          legF: 2.05,
          kneeF: -2.55,
          legB: 1.85,
          kneeB: -2.5,
          armF: 1.25,
          elbowF: 1.0,
          armB: 1.1,
          elbowB: 1.1,
        };
        if (open <= 0) return tuck;
        const land: Pose = { ...standPose(), planted: false, hipY: 30, armF: 2.5, elbowF: 0.2, armB: -2.4, elbowB: 0.2, legF: 0.25, kneeF: -0.5, legB: -0.1, kneeB: -0.4 };
        return mixPose(tuck, land, open);
      }
      case 'flip':
        p.planted = false;
        p.hipY = 26;
        p.rot = f.spin;
        p.lean = 0.55;
        p.nod = 0.35;
        p.legF = 1.85;
        p.kneeF = -2.3;
        p.legB = 1.7;
        p.kneeB = -2.25;
        p.armF = 2.8;
        p.elbowF = 0.3;
        p.armB = 2.6;
        p.elbowB = 0.2;
        return p;
      case 'dizzy':
        p.tilt = Math.sin(t * 3.1) * 0.11;
        p.lean = Math.sin(t * 2.5) * 0.14;
        p.nod = 0.25 + Math.sin(t * 3.4) * 0.35;
        p.armF = 0.25 + Math.sin(t * 4.2) * 0.25;
        p.elbowF = 0.2;
        p.armB = -0.15 + Math.sin(t * 3.7) * 0.2;
        p.elbowB = 0.15;
        p.legF = 0.22;
        p.kneeF = -0.35 + Math.sin(t * 5) * 0.18;
        p.legB = -0.2;
        p.kneeB = -0.25;
        return p;
      case 'raise':
        p.armF = lerp(1.0, 2.85, easeOut(f.k, 2));
        p.elbowF = lerp(0.4, 1.0, easeOut(f.k, 2));
        p.armB = 0.9;
        p.elbowB = 0.6;
        p.lean = -0.1 * f.k;
        p.nod = -0.15;
        p.legF = 0.42;
        p.kneeF = -0.25;
        p.legB = -0.35;
        p.kneeB = -0.1;
        return p;
      case 'unmasked':
        // Down on a knee, a hand at his face, holding the mask on.
        p.legF = 1.35;
        p.kneeF = -1.65;
        p.legB = -0.25;
        p.kneeB = -1.9;
        p.lean = -0.22 + Math.sin(t * 15) * 0.02;
        p.nod = 0.45;
        // The hand under his chin, holding up what is left of his face.
        p.armF = 0.9;
        p.elbowF = 2.3;
        p.armB = -0.9 + Math.sin(t * 5) * 0.1;
        p.elbowB = 0.5;
        return p;
      case 'stagger':
        p.lean = -0.42;
        p.nod = -0.3;
        p.armF = 2.0 + Math.sin(t * 13) * 0.5;
        p.elbowF = 0.6;
        p.armB = -2.2 + Math.cos(t * 11) * 0.5;
        p.elbowB = 0.4;
        p.legF = 0.6;
        p.kneeF = -0.9;
        p.legB = -0.15;
        p.kneeB = -0.1;
        return p;
      case 'collapse': {
        // The strings cut: down in a heap, all at once.
        const heap: Pose = { ...slumpPose(), hipY: 5, lean: 1.2, nod: 1.0, armF: 0.6, armB: 0.45 };
        const from: Pose = { ...standPose(), lean: -0.3, nod: -0.3, armF: 1.6, elbowF: 0.4, armB: -1.8, elbowB: 0.3 };
        return mixPose(from, heap, f.k * f.k);
      }
    }
    return p;
  }

  /**
   * The jester himself, pelvis at the origin, facing +x: back arm, back leg,
   * front leg, the doublet, the head with its mask and cap, the front arm, and
   * whatever is in his hands. In the silhouette every part is one colour.
   */
  private drawBody(ctx: CanvasRenderingContext2D, p: Pose, f: Figure, sil: boolean, ghost: boolean): void {
    const upX = Math.sin(p.lean);
    const upY = -Math.cos(p.lean);
    const sx = upX * (TORSO - 2.5);
    const sy = upY * (TORSO - 2.5);
    const ax = Math.cos(p.lean) * 1.3;
    const ay = Math.sin(p.lean) * 1.3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    this.drawArm(ctx, sx - ax, sy - ay, p.armB, p.elbowB, false, sil);
    this.drawLeg(ctx, -1.6, 0, p.legB, p.kneeB, false, sil);
    this.drawLeg(ctx, 1.6, 0, p.legF, p.kneeF, true, sil);
    this.drawTorso(ctx, p.lean, sil);
    if (!ghost) this.drawHead(ctx, upX * TORSO, upY * TORSO, p.lean + p.nod, f, sil);
    else this.drawHeadBlob(ctx, upX * TORSO, upY * TORSO, p.lean + p.nod);
    const hand = this.drawArm(ctx, sx + ax, sy + ay, p.armF, p.elbowF, true, sil);
    if (ghost || f.knives <= 0) return;
    if (f.act === 'juggle' || f.act === 'throw') {
      // The cascade over his head, every knife turning.
      const cx = upX * (TORSO + 26) + 3;
      const cy = upY * (TORSO + 26) - 6;
      const tempo = f.act === 'juggle' ? 7 + f.k * 6 : 12;
      for (let i = 0; i < f.knives; i++) {
        const a = f.t * tempo + (i * TAU) / 3;
        this.drawKnife(ctx, cx + Math.cos(a) * 11, cy + Math.sin(a) * 15, f.t * 15 + i * 2.1, sil);
      }
    } else if (f.act === 'raise') {
      // Held high and glinting: every figure that still stands has one.
      if (!sil) glow(ctx, hand.x, hand.y - 8, 10, 'rgba(236,236,255,0.45)');
      this.drawKnife(ctx, hand.x, hand.y - 4, -Math.PI / 2 - 0.35, sil, 1.35);
    }
  }

  /** An arm from the shoulder: a puffed sleeve, a forearm, a white glove. Returns where the hand is. */
  private drawArm(ctx: CanvasRenderingContext2D, sx: number, sy: number, a1: number, a2: number, front: boolean, sil: boolean): { x: number; y: number } {
    const ex = sx + UPPER * Math.sin(a1);
    const ey = sy + UPPER * Math.cos(a1);
    const hx = ex + FORE * Math.sin(a1 + a2);
    const hy = ey + FORE * Math.cos(a1 + a2);
    const cloth = sil ? SIL : front ? GOLD : VIOLET;
    ctx.strokeStyle = cloth;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    if (!sil) {
      // The shaded underside of the sleeve.
      ctx.strokeStyle = front ? GOLD_DARK : VIOLET_DARK;
      ctx.lineWidth = 1.4;
      const nx = Math.cos(a1) * 1.6;
      const ny = -Math.sin(a1) * 1.6;
      ctx.beginPath();
      ctx.moveTo(sx - nx, sy - ny);
      ctx.lineTo(ex - nx, ey - ny);
      ctx.stroke();
    }
    ctx.fillStyle = cloth;
    ctx.beginPath();
    ctx.arc(sx, sy, 4.4, 0, TAU);
    ctx.fill();
    if (!sil) {
      ctx.fillStyle = front ? GOLD_LIGHT : VIOLET_LIGHT;
      ctx.beginPath();
      ctx.arc(sx - 0.8, sy - 1.6, 1.8, 0, TAU);
      ctx.fill();
      // A ruffled cuff in the other colour.
      ctx.fillStyle = front ? VIOLET : GOLD;
      ctx.beginPath();
      ctx.arc(ex + (hx - ex) * 0.78, ey + (hy - ey) * 0.78, 2.6, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = sil ? SIL : '#f1ece2';
    ctx.beginPath();
    ctx.arc(hx, hy, 2.8, 0, TAU);
    ctx.fill();
    return { x: hx, y: hy };
  }

  /** A leg in hose - one violet, one gold - ending in a curled shoe with a bell on the toe. */
  private drawLeg(ctx: CanvasRenderingContext2D, hx: number, hy: number, a1: number, a2: number, front: boolean, sil: boolean): void {
    const kx = hx + THIGH * Math.sin(a1);
    const ky = hy + THIGH * Math.cos(a1);
    const fx = kx + SHIN * Math.sin(a1 + a2);
    const fy = ky + SHIN * Math.cos(a1 + a2);
    ctx.strokeStyle = sil ? SIL : front ? VIOLET : GOLD;
    ctx.lineWidth = 5.6;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(kx, ky);
    ctx.lineTo(fx, fy);
    ctx.stroke();
    if (!sil) {
      // The footlights catch the front of the shin from below.
      const a = a1 + a2;
      const nx = Math.cos(a) * 2.2;
      const ny = -Math.sin(a) * 2.2;
      ctx.strokeStyle = front ? 'rgba(200,170,255,0.55)' : 'rgba(255,236,170,0.6)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(kx + nx, ky + ny);
      ctx.lineTo(fx + nx, fy + ny);
      ctx.stroke();
      ctx.fillStyle = front ? GOLD : VIOLET;
      ctx.beginPath();
      ctx.arc(kx, ky, 2.2, 0, TAU);
      ctx.fill();
    }
    // The shoe points forward from the ankle and curls up into a bell.
    const sa = a1 + a2 + Math.PI / 2;
    ctx.save();
    ctx.translate(fx, fy);
    ctx.rotate(Math.PI / 2 - sa);
    ctx.fillStyle = sil ? SIL : front ? GOLD_DARK : VIOLET_DARK;
    ctx.beginPath();
    ctx.moveTo(-3.5, -2.6);
    ctx.quadraticCurveTo(4, -4.2, 8, -2.2);
    ctx.quadraticCurveTo(11.5, -1.2, 12.5, -5.6);
    ctx.quadraticCurveTo(11.5, 1.6, 6, 2);
    ctx.lineTo(-3.5, 2);
    ctx.closePath();
    ctx.fill();
    this.drawBell(ctx, 12.6, -6, 1.7, sil);
    ctx.restore();
  }

  /** The doublet: harlequin diamonds, a dagged hem over the hips, a belt. */
  private drawTorso(ctx: CanvasRenderingContext2D, lean: number, sil: boolean): void {
    ctx.save();
    ctx.rotate(lean);
    const path = (): void => {
      ctx.beginPath();
      ctx.moveTo(-7.8, 3);
      ctx.lineTo(-5.2, 7.4);
      ctx.lineTo(-2.6, 3.6);
      ctx.lineTo(0, 7.8);
      ctx.lineTo(2.6, 3.6);
      ctx.lineTo(5.2, 7.4);
      ctx.lineTo(7.8, 3);
      ctx.quadraticCurveTo(8.8, -4, 6.2, -9.5);
      ctx.quadraticCurveTo(8.9, -15.5, 6.6, -21);
      ctx.lineTo(-6.4, -21);
      ctx.quadraticCurveTo(-8.4, -14, -5.6, -9.2);
      ctx.quadraticCurveTo(-8.8, -3, -7.8, 3);
      ctx.closePath();
    };
    path();
    ctx.fillStyle = sil ? SIL : VIOLET;
    ctx.fill();
    if (!sil) {
      ctx.save();
      ctx.clip();
      // Gold diamonds on violet, the harlequin's check.
      ctx.fillStyle = GOLD;
      ctx.beginPath();
      for (let row = 0; row < 5; row++) {
        const y = -21 + row * 7;
        for (let col = -2; col <= 2; col++) {
          const x = col * 7 + (row % 2 ? 3.5 : 0);
          ctx.moveTo(x, y - 3.5);
          ctx.lineTo(x + 3.5, y);
          ctx.lineTo(x, y + 3.5);
          ctx.lineTo(x - 3.5, y);
          ctx.closePath();
        }
      }
      ctx.fill();
      // Light from in front and below; his back falls away into the dark.
      ctx.fillStyle = this.paint(ctx).shade;
      ctx.fillRect(-10, -24, 20, 34);
      ctx.restore();
      // The belt, and its buckle.
      ctx.fillStyle = VIOLET_DARK;
      ctx.fillRect(-7.2, -10.4, 14, 2.6);
      ctx.fillStyle = GOLD_LIGHT;
      ctx.fillRect(3.4, -10.8, 2.8, 3.4);
      path();
      ctx.strokeStyle = 'rgba(16,8,26,0.9)';
      ctx.lineWidth = 1;
      ctx.stroke();
      // A warm rim down the front, where the footlights find him.
      ctx.strokeStyle = 'rgba(255,214,160,0.5)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(7.6, 2);
      ctx.quadraticCurveTo(8.4, -4, 6, -9.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Just the round of a head, for the blurred copies of a wheel. */
  private drawHeadBlob(ctx: CanvasRenderingContext2D, nx: number, ny: number, tilt: number): void {
    ctx.save();
    ctx.translate(nx, ny);
    ctx.rotate(tilt);
    ctx.fillStyle = PORCELAIN;
    ctx.beginPath();
    ctx.ellipse(1, -9, 6.4, 8, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  /** The ruff, the head: a porcelain mask with a painted smile and a tear, under a cap with three bells. */
  private drawHead(ctx: CanvasRenderingContext2D, nx: number, ny: number, tilt: number, f: Figure, sil: boolean): void {
    ctx.save();
    ctx.translate(nx, ny);
    ctx.rotate(tilt);
    // The ruff.
    ctx.fillStyle = sil ? SIL : '#efe9f2';
    ctx.beginPath();
    for (let i = 0; i <= 14; i++) {
      const a = (i / 14) * TAU;
      const r = i % 2 ? 1 : 1.24;
      const x = Math.cos(a) * 9.5 * r;
      const y = 0.6 + Math.sin(a) * 3.4 * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    if (!sil) {
      ctx.strokeStyle = 'rgba(150,130,170,0.8)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    // The hood under the cap, round the back of the head.
    ctx.fillStyle = sil ? SIL : VIOLET_DARK;
    ctx.beginPath();
    ctx.ellipse(-1.8, -9.5, 7.2, 8.6, 0, 0, TAU);
    ctx.fill();
    const me = f === this.me;
    const off = me ? this.maskOff : 0;
    if (!sil && off > 0.02) {
      // Behind the mask there is nothing: a dark hollow, two embers in it.
      ctx.fillStyle = '#0b0612';
      ctx.beginPath();
      ctx.ellipse(1.2, -9, 6.2, 7.8, 0, 0, TAU);
      ctx.fill();
      glow(ctx, 0, -11, 6.5, `rgba(255,190,90,${(0.85 * off).toFixed(2)})`);
      glow(ctx, 4.4, -11, 5.5, `rgba(255,190,90,${(0.85 * off).toFixed(2)})`);
      ctx.fillStyle = '#ffe2a0';
      ctx.fillRect(-0.8, -11.8, 1.8, 1.6);
      ctx.fillRect(3.8, -11.8, 1.5, 1.5);
    }
    ctx.save();
    if (off > 0) {
      // Knocked askew: down and forward, turned on his chin.
      ctx.translate(off * 6.5, off * 8.5);
      ctx.rotate(off * 0.9);
    }
    this.drawMask(ctx, f, sil);
    ctx.restore();
    this.drawCap(ctx, f, sil);
    ctx.restore();
  }

  private drawMask(ctx: CanvasRenderingContext2D, f: Figure, sil: boolean): void {
    if (sil) {
      ctx.fillStyle = SIL;
      ctx.beginPath();
      ctx.ellipse(1.2, -9, 6.4, 8, 0, 0, TAU);
      ctx.fill();
      return;
    }
    ctx.fillStyle = this.paint(ctx).face;
    ctx.beginPath();
    ctx.ellipse(1.2, -9, 6.4, 8, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,24,52,0.75)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    // The eyes: two black almonds, the far one narrower; a glint deep in each.
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.ellipse(-0.6, -10.6, 1.8, 1.05, -0.25, 0, TAU);
    ctx.ellipse(4.5, -10.6, 1.35, 1.0, 0.25, 0, TAU);
    ctx.fill();
    const eye = this.phaseTwo && f === this.me ? '#ff8aa8' : '#e8e0ff';
    ctx.fillStyle = eye;
    ctx.fillRect(-0.4, -11, 0.9, 0.9);
    ctx.fillRect(4.5, -11, 0.8, 0.8);
    // Brows painted high, as if everything amused him.
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(-2.6, -12.4);
    ctx.quadraticCurveTo(-0.6, -14.6, 1.3, -12.9);
    ctx.moveTo(3.4, -12.9);
    ctx.quadraticCurveTo(4.8, -14.4, 6.2, -12.6);
    ctx.stroke();
    // The tear, under the near eye.
    ctx.fillStyle = this.phaseTwo ? '#c8243c' : '#3a72d8';
    ctx.beginPath();
    ctx.moveTo(-1.1, -8.8);
    ctx.quadraticCurveTo(0.1, -6.6, -0.9, -5.6);
    ctx.quadraticCurveTo(-2.2, -6.4, -1.1, -8.8);
    ctx.fill();
    // The smile: wide, red, and painted on.
    ctx.fillStyle = '#c42a44';
    ctx.beginPath();
    ctx.moveTo(-2.2, -5.6);
    ctx.quadraticCurveTo(1.8, -1.6, 6.4, -5.8);
    ctx.quadraticCurveTo(2, -3.6, -2.2, -5.6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,10,24,0.85)';
    ctx.lineWidth = 0.6;
    ctx.stroke();
    if (this.cracked && f === this.me) {
      ctx.strokeStyle = 'rgba(40,24,52,0.9)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(3.2, -16.6);
      ctx.lineTo(2.2, -13.2);
      ctx.lineTo(3.6, -11.6);
      ctx.lineTo(2.4, -8.4);
      ctx.lineTo(3.8, -5.2);
      ctx.moveTo(2.2, -13.2);
      ctx.lineTo(0.4, -12.6);
      ctx.stroke();
    }
  }

  /** The Schellenkappe: a gold band, and three points with a bell each, trailing behind his moves. */
  private drawCap(ctx: CanvasRenderingContext2D, f: Figure, sil: boolean): void {
    const s = f.sway;
    const jingle = f.act === 'crouch' ? Math.sin(f.t * 50) * 1.2 : 0;
    const points: [number, number, number, number, number, number, string, string][] = [
      [-5.2, -15.2, -15 + s, -24, -17.5 + s * 1.5 + jingle, -9.5, VIOLET, VIOLET_DARK],
      [-0.6, -17.6, 1.5 + s, -31, -7 + s * 1.9 - jingle, -33.5, GOLD, GOLD_DARK],
      [3.8, -16.2, 13 + s, -25, 15.5 + s * 1.5 + jingle, -12.5, VIOLET, VIOLET_DARK],
    ];
    // The crown of the cap over the hood.
    ctx.fillStyle = sil ? SIL : VIOLET;
    ctx.beginPath();
    ctx.ellipse(-0.6, -13.4, 7.8, 5.2, 0, Math.PI, TAU);
    ctx.fill();
    for (const [bx, by, cx, cy, tx, ty, colour, dark] of points) {
      this.drawPoint(ctx, bx, by, cx, cy, tx, ty, 3.4, sil ? SIL : colour, sil ? SIL : dark);
      this.drawBell(ctx, tx, ty, 2.4, sil);
    }
    if (!sil) {
      // The band across the brow.
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-7.4, -12.4);
      ctx.quadraticCurveTo(0, -17.6, 7.2, -13.6);
      ctx.stroke();
      ctx.fillStyle = GOLD_LIGHT;
      for (const [x, y] of [
        [-4.4, -14.4],
        [0, -15.6],
        [4.4, -14.9],
      ]) {
        ctx.beginPath();
        ctx.arc(x, y, 0.9, 0, TAU);
        ctx.fill();
      }
    }
  }

  /** One point of the cap: a tapered horn of cloth from the band to its bell. */
  private drawPoint(ctx: CanvasRenderingContext2D, bx: number, by: number, cx: number, cy: number, tx: number, ty: number, w: number, colour: string, dark: string): void {
    const n0x = -(cy - by);
    const n0y = cx - bx;
    const l0 = Math.hypot(n0x, n0y) || 1;
    const n1x = -(ty - by);
    const n1y = tx - bx;
    const l1 = Math.hypot(n1x, n1y) || 1;
    const ux = n0x / l0;
    const uy = n0y / l0;
    const vx = n1x / l1;
    const vy = n1y / l1;
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(bx + ux * w, by + uy * w);
    ctx.quadraticCurveTo(cx + vx * w * 0.55, cy + vy * w * 0.55, tx, ty);
    ctx.quadraticCurveTo(cx - vx * w * 0.55, cy - vy * w * 0.55, bx - ux * w, by - uy * w);
    ctx.closePath();
    ctx.fill();
    if (colour !== dark) {
      // The fold down the middle of the cloth.
      ctx.strokeStyle = dark;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bx - ux * w * 0.3, by - uy * w * 0.3);
      ctx.quadraticCurveTo(cx - vx * w * 0.3, cy - vy * w * 0.3, tx, ty);
      ctx.stroke();
    }
  }

  private drawBell(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, sil: boolean): void {
    ctx.fillStyle = sil ? SIL : GOLD;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    if (sil) return;
    ctx.fillStyle = GOLD_DARK;
    ctx.fillRect(x - r * 0.7, y + r * 0.15, r * 1.4, r * 0.32);
    ctx.fillStyle = '#fff6d0';
    ctx.beginPath();
    ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.34, 0, TAU);
    ctx.fill();
  }

  /** A knife in the air over his head: a silver blade, a gold guard, a violet grip. */
  private drawKnife(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number, sil: boolean, size = 1): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    if (size !== 1) ctx.scale(size, size);
    ctx.fillStyle = sil ? SIL : '#e6eaf2';
    ctx.beginPath();
    ctx.moveTo(9, 0);
    ctx.lineTo(0, -2.3);
    ctx.lineTo(0, 2.3);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = sil ? SIL : GOLD;
    ctx.fillRect(-1.4, -3.4, 2, 6.8);
    ctx.fillStyle = sil ? SIL : '#7a3a8a';
    ctx.fillRect(-6.6, -1.2, 5.4, 2.4);
    if (!sil) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(1.5, -0.6, 5, 0.9);
    }
    ctx.restore();
  }

  /** His mask, off his face and on the boards. */
  private drawDroppedMask(ctx: CanvasRenderingContext2D): void {
    const d = this.dropped;
    if (!d) return;
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(d.rot);
    ctx.translate(-1.2, 9);
    this.drawMask(ctx, this.me, false);
    ctx.restore();
  }
}
