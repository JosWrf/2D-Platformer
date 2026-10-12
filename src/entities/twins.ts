import { audio } from '../core/audio';
import { Rect, approach, clamp, damp, easeOut, lerp, rand, rectsOverlap, sign } from '../core/math';
import { disc, line, poly, rect, ring, sector } from '../render/pen';
import { ART } from '../render/pixel';
import { hash2 } from '../render/sheet';
import { shadow, withHitFlash } from '../render/sprites';
import type { World } from '../world/context';
import { capHeight, drawText } from '../ui/pixelfont';
import { TILE } from '../world/tiles';
import { angleStep, blit, dashedOval, ovalRing, quad, solidFlash } from './boss-art';
import { Enemy, type GlowLight } from './enemy';
import {
  FROST,
  GLAIVE_STEPS,
  LUNA_SHOULDER,
  type LunaLook,
  MOONLIGHT,
  SUN,
  type SolLook,
  beam,
  crescentPart,
  flameSprite,
  frostSprite,
  glaivePart,
  icicleSprite,
  lunaHead,
  lunaPart,
  solDrop,
  solHead,
  solPart,
  solShoulder,
  sparkleSprite,
  starSprite,
} from './twins-art';

/**
 * Health of each twin before they size the hero up: 60 between them, which
 * the six relics of the road make 82, 41 each. Eighteen each was the first
 * figure, and a hero who reads them - the bot in tools/verify-twins.mjs -
 * felled the pair in 17 to 20 s without losing a heart: two bodies are two
 * targets, and the one that was waiting its turn stood still and was simply
 * cut down. Now the waiting one keeps its distance, and the fight is the
 * length of a fight. 32 made it 54 to 71 s.
 */
const TWIN_HP = 30;
/**
 * Damage a twin takes before it reels - 9 with the relics of the road - and
 * only in the middle of its own turn. See damage().
 */
const TWIN_POISE = 6;
/** Each body, the same size: a little taller than the hero and half again as wide. */
const BODY_W = 30;
const BODY_H = 44;
/** How far Luna's hem floats above the floor. Her box reaches down to it. */
const HOVER = 5;
/** Seconds the standing twin needs to call the fallen one back. */
const REVIVE = 7;
/**
 * The call is no free moment: what the caller pours into the star breaks out
 * of it as a ring along the floor - the first CALL_FIRST seconds in, then
 * every CALL_PULSE - its hands burning up for CALL_TELL before each one.
 * Without it the call was seven seconds of a twin standing still: a hero who
 * only walked up and swang felled the first in a dozen seconds and the caller
 * in the call, three blows in all, where one who read them took twice as long.
 */
const CALL_FIRST = 1.4;
const CALL_PULSE = 1.9;
const CALL_TELL = 0.5;
/** How long a twin stands after every move of its own: the window. */
const REST = 1.6;
/**
 * Nothing new is wound up until this long after the last thing that could
 * hurt is gone - a crescent on its way home, fire on the floor, a ring. With
 * REST it is the second and a half after every attack that belongs to the hero.
 */
const CALM = 1.5;
/**
 * A breath between two turns, on top of the rest. 0.3, down from 0.55: with
 * the rest and the calm on either side of it, there was more waiting about
 * than fighting.
 */
const GAP = 0.3;
const GAP_TWO = 0.2;
/**
 * Sonnensprung: the crouch, how far the landing burns, and how far he can
 * bound. A wind-up loses its first frame to the frame it starts in, so 0.7
 * is 0.68 s on screen - the bound is the move a hero has to start running
 * for, and has the longest of Sol's tells.
 */
const LEAP_TELL = 0.7;
const LEAP_RADIUS = 70;
const LEAP_REACH = 460;
/** Flammenschweif: 0.63 s of the glaive coming down, then 300 px at 400 px/s. */
const DASH_TELL = 0.65;
const DASH_SPEED = 400;
const DASH_LENGTH = 300;
/**
 * The closest he runs at anyone from: 120 px. From 90, a hero who saw the
 * glaive come down 0.3 s late and ran for the end of the line was caught by
 * him on the way - the head start was eaten by getting up to speed.
 */
const RUN_MIN = 120;
const FIRE_LIFE = 1.2;
const FLAME_GAP = 16;
/**
 * Mondsicheln: 0.63 s of the crescent growing over her hand. 430 px/s out,
 * up from 380 - at 380 a pair took four seconds to come home, and she stood
 * still for every one of them.
 */
const THROW_TELL = 0.65;
const CRESCENT_SPEED = 430;
/** Height of a crescent's middle over the floor: low enough to need a jump. */
const CRESCENT_Y = 17;
const BATTED_SPEED = 560;
const BATTED_DAMAGE = 2;
/**
 * Eisfall: the rings lie on the floor for 0.83 s before the ice is in them,
 * three of them 86 px apart - a gap of about fifty pixels between two, for a
 * hero eighteen wide.
 */
const ICE_TELL = 0.85;
const ICE_HALF = 18;
const ICE_SPREAD = 86;
/** Finsternis: a full second of the moon sliding over the sun, then the rings. */
const ECLIPSE_TELL = 1.0;
const RING_SPEED = 300;
const RING_H = 30;
/** Poise broken, and a parried dash or landing. */
const STAGGER = 1.2;
const PARRY_STAGGER = 1.8;
const INTRO = 2.0;
const DYING = 2.8;
/**
 * How far from the hero the box the game sees may sit. See placeBox: the game
 * draws an enemy only while the left edge of its box is within 140 px of the
 * screen, and the screen runs ahead of a running hero by up to 110 px and
 * lags him by 35 - 440 keeps the box drawn with room to spare.
 */
const VIEW_REACH = 440;

/** The two tones of each kind of flare, hot and cooling: Sol's landing and call, the eclipse, Luna's call. */
const FLARE: Record<string, readonly [string, string]> = {
  '255,206,120': [SUN[4], SUN[2]],
  '255,214,140': [SUN[4], SUN[2]],
  '255,240,210': [SUN[5], SUN[4]],
  '200,220,255': [MOONLIGHT[4], MOONLIGHT[2]],
};

type Who = 'sol' | 'luna';

type TwinState =
  | 'idle'
  | 'vault'
  | 'slip'
  | 'approach'
  | 'hop'
  | 'leapWind'
  | 'leap'
  | 'leapRest'
  | 'dashWind'
  | 'dash'
  | 'dashRest'
  | 'throwWind'
  | 'throw'
  | 'throwRest'
  | 'iceWind'
  | 'iceRest'
  | 'toMiddle'
  | 'eclipse'
  | 'eclipseRest'
  | 'stagger'
  | 'channel'
  | 'fallen'
  | 'rise';

interface Twin {
  readonly who: Who;
  /** The middle of the body, and its feet. */
  x: number;
  y: number;
  vy: number;
  hp: number;
  maxHp: number;
  poise: number;
  /** Seconds before its poise can break again. */
  lock: number;
  /** Seconds before it may slip out of a corner again. */
  cool: number;
  state: TwinState;
  timer: number;
  facing: 1 | -1;
  flash: number;
  /** The wind-up, 0..1: what the body shows as the tell. */
  glow: number;
  /** Where the hand that does the work is, and the angle of what it holds - eased. */
  hx: number;
  hy: number;
  ha: number;
  /** This move has hurt the hero already. */
  hit: boolean;
  dir: 1 | -1;
  fromX: number;
  toX: number;
  t: number;
  flight: number;
  apex: number;
  travelled: number;
  /** The move before, so the same one does not come twice running as a rule. */
  last: string;
}

const makeTwin = (who: Who): Twin => ({
  who,
  x: 0,
  y: 0,
  vy: 0,
  hp: TWIN_HP,
  maxHp: TWIN_HP,
  poise: TWIN_POISE,
  lock: 0,
  cool: 0,
  state: 'idle',
  timer: 0,
  facing: -1,
  flash: 0,
  glow: 0,
  hx: 8,
  hy: -22,
  ha: -1.4,
  hit: false,
  dir: 1,
  fromX: 0,
  toX: 0,
  t: 0,
  flight: 0,
  apex: 0,
  travelled: 0,
  last: '',
});

interface Crescent {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dir: 1 | -1;
  speed: number;
  /** How hard it slows on the way out, and speeds up on the way back. */
  decel: number;
  returning: boolean;
  /** Knocked back by the hero: it flies at Luna now. */
  batted: boolean;
  dead: boolean;
  /** Above zero while it comes apart harmlessly. */
  fade: number;
  /** Seconds still in her hand: the second one leaves a moment after the first. */
  delay: number;
  spin: number;
  age: number;
}

interface Icicle {
  x: number;
  /** What it lands on: the floor, or a board in the way. */
  surface: number;
  t: number;
  fell: boolean;
  cancelled: boolean;
  fade: number;
}

interface Flame {
  x: number;
  life: number;
  /** Put out: fading, and no longer burning anyone. */
  out: boolean;
  seed: number;
}

interface Ring {
  x: number;
  dir: 1 | -1;
  hit: boolean;
}

interface Shard {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  life: number;
}

interface Flare {
  x: number;
  y: number;
  t: number;
  life: number;
  radius: number;
  rgb: string;
  /** A ring in the air rather than one lying on the floor. */
  round: boolean;
}

/**
 * Sol und Luna, die Sternzwillinge - the sun and the moon, who kept the altar
 * over the stair down for as long as there has been a stair, and who have
 * never once let the other one go.
 *
 * Two bodies, one fight. Sol is a knight in sun-gold with a crown of rays and
 * a short glaive; Luna a priestess in the colours of moonlight, floating a
 * hand's breadth over the floor. They take turns - only ever one of them
 * attacks, and the other keeps its distance and waits - and every move says
 * what it is before it happens, with a sound and with the body:
 *
 *   Sonnensprung  - Sol crouches, glowing, while a ring of sunlight follows the
 *                   hero across the floor. Then the ring stops and he bounds
 *                   onto it, and it bursts where he lands. Keep moving once he
 *                   crouches. He stands where he came down, for the window.
 *   Flammenschweif - Sol lowers his glaive; a line of embers shows where he
 *                   will run. He runs it, three hundred pixels along the floor,
 *                   and the floor behind him burns for 1.2 s. Get out of the
 *                   line - past its end, behind his back, up on a plank, or
 *                   over him as he sets off: the fire starts where he started.
 *                   He never runs at a hero closer than RUN_MIN, or one with
 *                   no room to get past the end of the line.
 *   Mondsicheln   - Luna raises her arm and a crescent grows over her hand.
 *                   She throws two, low along the floor; they slow, turn and
 *                   come home to her like boomerangs. Jump them, or swing at
 *                   one: a crescent batted back flies at her and hurts her.
 *   Eisfall       - three rings of frost on the floor around the hero, and
 *                   the icicles that fill them. Stand between them - or under
 *                   the long board, where they shatter on the wood.
 *   Finsternis    - from their second half on, the one move they make
 *                   together: both go to the middle, the moon slides over the
 *                   sun between them, and a ring of light and shadow runs out
 *                   along the floor both ways. Jump it.
 *
 * The rule of the fight is their bond: "Fällt einer, ruft ihn der andere
 * zurück." A twin brought down is not gone; it lies on the floor as a dim star,
 * and the other stops whatever it is doing, stands still and calls it back.
 * That takes seven seconds, and in those seven seconds it does nothing else -
 * it can be hit like always - though the call breaks out of it as a ring
 * along the floor every couple of seconds, each one told - and if it falls
 * too before the ring around the star is full, both are down and the fight
 * is over. If the ring fills, the
 * fallen one stands up again with half of its health. So the fight is won by
 * bringing both of them low and then one after the other, not by taking one
 * apart while the other stays whole; the bar shows both, and a bar under
 * each of them shows which one is which.
 *
 * Both of them can always be hit, from the floor - Luna's hem is five pixels
 * off it - and every move ends with the one who made it standing still for
 * REST seconds, and nothing new starts until CALM seconds after the last
 * thing that could hurt. Only Sol's running body and his landing hurt by
 * touch; everything is one heart. A parried run or landing makes him reel
 * for 1.8 s.
 *
 * Two bodies are two targets, and the first version of this fight forgot
 * it: measured with a hero who sees the fight 0.3 s late, swings only from the
 * floor and jumps only to get out of the way (tools/verify-twins.mjs), it fell
 * in 17 to 20 s, because whichever twin was waiting stood still and was cut
 * down, and every time its poise broke its move came to nothing. Now the one
 * that waits keeps its distance - and slips out of a corner past the hero -
 * and only the one in the middle of its turn can be thrown off balance. Over
 * ten fights the same hero now needs 45 to 64 s, 53 on average, and loses 0
 * to 2 of his seven hearts; one who stands still in the open loses twenty a
 * minute.
 */
export class Twins extends Enemy {
  /** The fight as a whole. The tools wait for it to be past dormant and intro. */
  private state: 'dormant' | 'intro' | 'fight' | 'dying' = 'dormant';
  private timer = 0;
  private readonly sol: Twin = makeTwin('sol');
  private readonly luna: Twin = makeTwin('luna');
  private readonly twins: Twin[];
  private floorY = 0;
  private arenaLeft = 0;
  private arenaRight = 0;
  private spawnX = 0;
  private poiseMax = TWIN_POISE;
  private phaseTwo = false;
  /** Whose move it is - one twin, both for Finsternis, or nobody between turns. */
  private acting: Twin | 'both' | null = null;
  private next: Who = 'sol';
  private gap = 0;
  /** Seconds since anything that could hurt was last out. See CALM. */
  private calm = 0;
  /** Turns since the last Finsternis. */
  private turns = 0;
  /** A twin lying on the floor, the other calling it back, and the seconds left. */
  private revive: { fallen: Twin; channeler: Twin; left: number; pulse: number; told: boolean } | null = null;
  private revivals = 0;
  /** Which twin the last overlaps() found, for the hurt() that follows it. */
  private struck: Twin | null = null;
  /** The twin the box the game sees is on. See placeBox. */
  private anchor: Twin | null = null;
  /** 0 asleep at the altar, 1 up. */
  private rise = 0;
  /** How far the moon has slid over the sun, 0..1. */
  private eclipse = 0;
  private deathX = 0;
  /** Where Sol is going to land: it follows the hero while he crouches, then stops. */
  private mark: { x: number; locked: boolean } | null = null;
  private flameStep = 0;
  private readonly crescents: Crescent[] = [];
  private readonly icicles: Icicle[] = [];
  private readonly flames: Flame[] = [];
  private readonly rings: Ring[] = [];
  private readonly shards: Shard[] = [];
  private readonly flares: Flare[] = [];

  override castLight = false;

  constructor(x: number, y: number) {
    super('twins', x, y);
    this.twins = [this.sol, this.luna];
    this.w = 72;
    this.h = BODY_H + 6;
    this.x = x + TILE / 2 - this.w / 2;
    this.hp = this.maxHp = TWIN_HP * 2;
    this.scoreValue = 1100;
    this.contactDamage = 0;
    this.aggroRange = 900;
    this.sol.facing = -1;
    this.luna.facing = 1;
  }

  get phase(): 1 | 2 {
    return this.phaseTwo ? 2 : 1;
  }

  override barName(): string {
    return 'SOL UND LUNA   ·   DIE STERNZWILLINGE';
  }

  override barPhase(): number {
    return this.phase;
  }

  /** One mark each: standing, or a star on the floor with the seconds it has left. */
  override barPips(): { pips: ('head' | 'stump' | 'sealed')[]; urgency: number[]; colors?: string[] } | null {
    if (this.state === 'dormant') return null;
    const pips = this.twins.map((t): 'head' | 'stump' | 'sealed' =>
      this.state === 'dying' ? 'sealed' : t.state === 'fallen' ? 'stump' : 'head',
    );
    const urgency = this.twins.map((t) => (t.state === 'fallen' && this.revive ? clamp(this.revive.left / REVIVE, 0, 1) : 1));
    // Sun and moon, in that order, rather than the hydra's green.
    const colors = this.twins.map((t) => (t.who === 'sol' ? '#ffcf6a' : '#cdd8ff'));
    return { pips, urgency, colors };
  }

  protected override deathColor(): string {
    return '#e3d6ff';
  }

  /* ------------------------------------------------------------- geometry */

  private rectOf(t: Twin): Rect {
    return { x: t.x - BODY_W / 2, y: t.y - BODY_H, w: BODY_W, h: BODY_H };
  }

  private crescentRect(c: Crescent): Rect {
    return { x: c.x - 13, y: c.y - 7, w: 26, h: 14 };
  }

  private other(t: Twin): Twin {
    return t === this.sol ? this.luna : this.sol;
  }

  private get mid(): number {
    return (this.arenaLeft + this.arenaRight) / 2;
  }

  /** How awake they look: dim at the altar, lit once the fight is on. */
  private get awake(): number {
    if (this.state === 'dormant') return 0.3;
    if (this.state === 'intro') return 0.3 + this.rise * 0.7;
    return 1;
  }

  private syncHp(): void {
    this.hp = Math.max(0, this.sol.hp) + Math.max(0, this.luna.hp);
  }

  /** Something of theirs that can hurt is out: a leap, a run, a crescent, fire, ice, a ring. */
  private get threat(): boolean {
    if (this.sol.state === 'leap' || this.sol.state === 'dash') return true;
    if (this.crescents.some((c) => !c.dead && c.fade <= 0 && !c.batted)) return true;
    if (this.icicles.some((i) => !i.fell && !i.cancelled)) return true;
    if (this.rings.length > 0) return true;
    return this.flames.some((f) => !f.out && f.life > 0);
  }

  /* ------------------------------------------------------------ targeting */

  /**
   * Both bodies are targets, always - only a twin lying on the floor as a star
   * is not. Whichever the blade touched is remembered for hurt(); if it
   * touched both, the one nearer the middle of the swing.
   */
  override overlaps(r: Rect): boolean {
    this.struck = null;
    if (this.state !== 'fight') return false;
    const mid = r.x + r.w / 2;
    let best: Twin | null = null;
    for (const t of this.twins) {
      if (t.state === 'fallen') continue;
      if (!rectsOverlap(this.rectOf(t), r)) continue;
      if (!best || Math.abs(t.x - mid) < Math.abs(best.x - mid)) best = t;
    }
    this.struck = best;
    return best !== null;
  }

  override hurt(amount: number, fromDir: number, world: World): void {
    void fromDir;
    const t = this.struck;
    this.struck = null;
    // A blow that arrives without a twin - a parry's shove - lands nowhere.
    if (this.dead || this.state !== 'fight' || !t) return;
    this.damage(t, amount, world);
  }

  private damage(t: Twin, amount: number, world: World): void {
    if (this.state !== 'fight' || t.state === 'fallen' || t.hp <= 0) return;
    t.hp -= amount;
    t.flash = 1;
    this.syncHp();
    const sol = t.who === 'sol';
    audio.play('bossHit', sol ? 1.0 : 1.35);
    world.particles.burst(t.x, t.y - BODY_H / 2, 10, sol ? '#ffd27a' : '#cfe0ff', { speed: 170, gravity: 300 });
    if (t.hp <= 0) {
      this.fall(t, world);
      return;
    }
    if (!this.phaseTwo && this.hp <= this.maxHp / 2) this.enterPhaseTwo(world);
    // Only a twin in the middle of its own turn can be thrown off balance: one
    // that is waiting is on its guard, and chasing it down is not the answer.
    if (this.acting !== t && this.acting !== 'both') return;
    t.poise -= amount;
    const steady = t.state === 'leap' || t.state === 'hop' || t.state === 'stagger' || t.state === 'channel' || t.state === 'rise';
    if (t.poise <= 0 && t.lock <= 0 && !steady) this.stagger(t, world, STAGGER, false);
  }

  /**
   * A parried run or landing: he reels. The blow itself is caught in strike(),
   * which sees the parry happen; this is the same thing seen from the hero's
   * side, for a parry that found him within reach.
   */
  override onParried(world: World): void {
    if (this.state !== 'fight') return;
    const s = this.sol;
    const p = world.player;
    const near = Math.abs(s.x - p.cx) < 90 && Math.abs(s.y - p.bottom) < 60;
    const landing = s.state === 'leapRest' && s.timer > REST - 0.1;
    if (near && (s.state === 'dash' || landing)) this.stagger(s, world, PARRY_STAGGER, true);
  }

  /** One blow on the hero from a twin's own body - a run or a landing. A parry against it staggers Sol. */
  private strike(t: Twin, world: World, fromX: number): void {
    const p = world.player;
    if (p.dead) return;
    const guarding = p.parryTimer > 0;
    p.hurt(1, sign(p.cx - fromX) || t.facing, world);
    if (guarding && p.parryTimer === 0 && p.parryFlash > 0.95 && t.who === 'sol') {
      this.stagger(t, world, PARRY_STAGGER, true);
    }
  }

  /**
   * Only what moves hurts: Sol's body while it runs, the fire it leaves, and
   * the ring of Finsternis. Walking into either of them standing costs
   * nothing - the window after a move is a window, not a trap.
   */
  override touchPlayer(world: World): void {
    const p = world.player;
    if (this.dead || p.dead || this.state !== 'fight') return;
    const s = this.sol;
    if (s.state === 'dash' && !s.hit && rectsOverlap(this.rectOf(s), p.rect) && (p.parryTimer > 0 || !p.isInvulnerable)) {
      s.hit = true;
      this.strike(s, world, s.x);
    }
    if (!p.isInvulnerable && p.bottom > this.floorY - 14) {
      for (const f of this.flames) {
        if (f.out || f.life <= 0.05 || Math.abs(p.cx - f.x) >= 8 + p.w / 2) continue;
        p.hurt(1, sign(p.cx - f.x) || 1, world);
        break;
      }
    }
    for (const r of this.rings) {
      if (r.hit || Math.abs(p.cx - r.x) >= 12 + p.w / 2 || p.bottom <= this.floorY - RING_H) continue;
      r.hit = true;
      if (p.parryTimer > 0 || !p.isInvulnerable) p.hurt(1, sign(p.cx - r.x) || r.dir, world);
    }
  }

  /* --------------------------------------------------------------- update */

  override update(dt: number, world: World): void {
    this.updateCommon(dt);
    if (this.floorY === 0) this.settle(world);
    const p = world.player;
    switch (this.state) {
      case 'dormant': {
        const inside = p.cx > this.arenaLeft + 16 && p.cx < this.arenaRight - 16;
        if (inside && !p.dead && Math.abs(p.cx - this.spawnX) < this.aggroRange) this.wake(world);
        break;
      }
      case 'intro':
        this.updateIntro(dt, world);
        break;
      case 'fight':
        this.updateFight(dt, world);
        break;
      case 'dying':
        this.updateDying(dt, world);
        break;
    }
    this.updateHazards(dt, world);
    for (const t of this.twins) this.easePose(t, dt);
    this.placeBox(world);
  }

  /** Where they actually are, once the game has put them down at the altar. */
  private settle(world: World): void {
    this.floorY = this.bottom;
    this.spawnX = this.cx;
    const arena = world.level.arenaAt(this.spawnX);
    this.arenaLeft = arena ? arena.left : this.spawnX - 540;
    this.arenaRight = arena ? arena.right : this.spawnX + 540;
    this.sol.x = this.spawnX - 16;
    this.sol.y = this.floorY;
    this.luna.x = this.spawnX + 16;
    this.luna.y = this.floorY - HOVER;
    this.deathX = this.spawnX;
  }

  private wake(world: World): void {
    this.engaged = true;
    // Sized up together, then halved: the hero's relics are reckoned once, for
    // the pair, the way every other boss reckons them.
    this.maxHp = TWIN_HP * 2;
    this.poiseMax = this.sizeUpFor(world, TWIN_POISE);
    this.sol.maxHp = Math.ceil(this.maxHp / 2);
    this.luna.maxHp = this.maxHp - this.sol.maxHp;
    for (const t of this.twins) {
      t.hp = t.maxHp;
      t.poise = this.poiseMax;
    }
    this.syncHp();
    this.state = 'intro';
    this.timer = INTRO;
    audio.play('magic', 0.7);
    audio.play('bossRoar', 1.25);
    world.camera.addShake(4);
  }

  /** They rise from the altar, back to back, and step apart. */
  private updateIntro(dt: number, world: World): void {
    const p = world.player;
    this.timer -= dt;
    const k = 1 - this.timer / INTRO;
    this.rise = clamp(k / 0.55, 0, 1);
    if (k > 0.5) {
      this.sol.x = approach(this.sol.x, this.spawnX - 120, 170 * dt);
      this.luna.x = approach(this.luna.x, this.spawnX + 125, 170 * dt);
    }
    if (k > 0.3) for (const t of this.twins) t.facing = p.cx >= t.x ? 1 : -1;
    this.luna.y = damp(this.luna.y, this.floorY - HOVER, 6, dt);
    if (Math.random() < 0.5) {
      const t = Math.random() < 0.5 ? this.sol : this.luna;
      world.particles.spawn({
        x: t.x + rand(-14, 14),
        y: t.y - rand(0, 40),
        vx: rand(-10, 10),
        vy: -rand(30, 80),
        gravity: -20,
        color: t === this.sol ? 'rgba(255,210,130,0.8)' : 'rgba(190,212,255,0.8)',
        size: rand(1.5, 2.5),
        life: 0.7,
        shape: 'spark',
      });
    }
    if (this.timer <= 0) {
      this.state = 'fight';
      this.rise = 1;
      this.gap = 0.5;
      this.calm = CALM;
      this.next = 'sol';
    }
  }

  private updateFight(dt: number, world: World): void {
    for (const t of this.twins) {
      t.flash = Math.max(0, t.flash - dt * 5);
      t.lock = Math.max(0, t.lock - dt);
      t.cool = Math.max(0, t.cool - dt);
    }
    this.calm = this.threat ? 0 : this.calm + dt;
    if (this.revive) this.updateRevive(dt, world);
    else if (this.acting === 'both') this.updateJoint(dt, world);
    else this.conduct(dt, world);
    this.updateSol(dt, world);
    this.updateLuna(dt, world);
    this.keepApart(dt);
    const lo = this.arenaLeft + BODY_W / 2 + 2;
    const hi = this.arenaRight - BODY_W / 2 - 2;
    for (const t of this.twins) t.x = clamp(t.x, lo, hi);
    if (this.sol.state !== 'eclipse') this.eclipse = Math.max(0, this.eclipse - dt * 2.5);
  }

  /**
   * Whose turn it is. One at a time, taking turns, and never while anything
   * of the last move is still out: a new wind-up waits for CALM seconds of
   * nothing at all, on top of the rest every move ends with.
   */
  private conduct(dt: number, world: World): void {
    if (this.acting) return;
    this.gap -= dt;
    if (this.gap > 0 || this.calm < CALM) return;
    const free = (t: Twin): boolean => t.state === 'idle';
    if (this.phaseTwo && this.turns >= 3 && free(this.sol) && free(this.luna)) {
      this.beginEclipse();
      return;
    }
    let t = this.next === 'sol' ? this.sol : this.luna;
    if (!free(t)) t = this.other(t);
    if (!free(t)) return;
    this.next = t.who === 'sol' ? 'luna' : 'sol';
    this.turns++;
    this.acting = t;
    t.hit = false;
    t.poise = this.poiseMax;
    if (t.who === 'sol') this.solMove(world);
    else this.lunaMove(world);
  }

  private endTurn(t: Twin): void {
    t.state = 'idle';
    t.glow = 0;
    if (this.acting === t || this.acting === 'both') {
      this.acting = null;
      this.gap = this.phaseTwo ? GAP_TWO : GAP;
    }
  }

  /**
   * A step back from the hero, unless the wall is already at its back: a twin
   * in a corner stays in the corner, and is had.
   */
  private backOff(t: Twin, dir: number, speed: number, dt: number): boolean {
    const room = dir > 0 ? this.arenaRight - t.x : t.x - this.arenaLeft;
    if (room <= 70) return false;
    t.x += dir * speed * dt;
    return true;
  }

  /** Two bodies on one spot read as one: the one that is waiting drifts aside. */
  private keepApart(dt: number): void {
    const s = this.sol;
    const l = this.luna;
    if (s.state === 'fallen' || l.state === 'fallen' || this.acting === 'both') return;
    const gap = l.x - s.x;
    if (Math.abs(gap) >= 46) return;
    const away = sign(gap) || 1;
    if (l.state === 'idle') l.x += away * 70 * dt;
    else if (s.state === 'idle') s.x -= away * 70 * dt;
  }

  /* ------------------------------------------------------------------ Sol */

  /**
   * Sol's move: the run if the hero stands on the floor in its range with room
   * to get out of its way ahead of him, the bound otherwise. Too close for a
   * run, he sometimes hops back first to make the room - that hop is not an
   * attack and hurts nobody.
   */
  private solMove(world: World, afterHop = false): void {
    const p = world.player;
    const s = this.sol;
    const dx = p.cx - s.x;
    const dist = Math.abs(dx);
    s.facing = dx >= 0 ? 1 : -1;
    if (dist > LEAP_REACH && s.state !== 'approach') {
      // Too far for one bound: he closes in first, which is not yet a move.
      s.state = 'approach';
      s.timer = 1.5;
      return;
    }
    const dir = s.facing;
    const ahead = dir > 0 ? this.arenaRight - p.cx : p.cx - this.arenaLeft;
    const behind = dir > 0 ? s.x - this.arenaLeft : this.arenaRight - s.x;
    const grounded = p.bottom > this.floorY - 6;
    if (!afterHop && grounded && dist < RUN_MIN && behind > 170 && ahead > DASH_LENGTH - 60 && s.last !== 'dash' && Math.random() < 0.5) {
      s.state = 'hop';
      s.fromX = s.x;
      s.toX = s.x - dir * 140;
      s.t = 0;
      s.flight = 0.36;
      s.apex = 24;
      audio.play('jump', 0.7);
      return;
    }
    const options = ['leap'];
    if (grounded && dist >= RUN_MIN && dist < 320 && ahead > DASH_LENGTH + 60 - dist) options.push('dash');
    const fresh = options.filter((o) => o !== s.last);
    const pick = afterHop && options.includes('dash') ? ['dash'] : fresh.length > 0 && Math.random() < 0.8 ? fresh : options;
    const move = pick[Math.floor(Math.random() * pick.length)];
    s.last = move;
    s.hit = false;
    if (move === 'dash') {
      s.state = 'dashWind';
      s.timer = DASH_TELL;
      s.dir = dir;
      s.fromX = s.x;
      s.toX = clamp(s.x + dir * DASH_LENGTH, this.arenaLeft + BODY_W, this.arenaRight - BODY_W);
      audio.play('tell', 0.8);
      audio.play('fireball', 0.55);
    } else {
      s.state = 'leapWind';
      s.timer = LEAP_TELL;
      this.mark = { x: clamp(p.cx, this.arenaLeft + 24, this.arenaRight - 24), locked: false };
      audio.play('tell', 0.7);
      audio.play('beamCharge', 1.3);
    }
  }

  private updateSol(dt: number, world: World): void {
    const p = world.player;
    const s = this.sol;
    const dx = p.cx - s.x;
    // Anything but a bound brings him back down to the floor: a fall, a call
    // that came while he was in the air.
    const flying = s.state === 'leap' || s.state === 'hop' || s.state === 'vault';
    if (!flying && s.y < this.floorY) {
      s.vy += 2600 * dt;
      s.y = Math.min(this.floorY, s.y + s.vy * dt);
    } else if (!flying) {
      s.vy = 0;
      s.y = this.floorY;
    }
    s.glow = Math.max(0, s.glow - dt * 2);
    switch (s.state) {
      case 'idle': {
        // Waiting his turn, he keeps to his own range: in from far off, a
        // step back from a hero who crowds him - slower than the hero runs, so
        // whoever wants him gets him, for a while. With the wall at his back
        // he vaults over the hero to the open floor.
        s.facing = dx >= 0 ? 1 : -1;
        const dist = Math.abs(dx);
        const speed = this.phaseTwo ? 135 : 120;
        if (dist > 250) s.x = approach(s.x, p.cx - s.facing * 180, speed * dt);
        else if (dist < 140 && !this.backOff(s, -s.facing, speed, dt) && dist < 100 && s.cool <= 0) {
          s.state = 'vault';
          s.fromX = s.x;
          s.toX = clamp(p.cx + s.facing * 170, this.arenaLeft + BODY_W, this.arenaRight - BODY_W);
          s.t = 0;
          s.flight = 0.55;
          s.apex = 84;
          s.cool = 3;
          audio.play('jump', 0.65);
        }
        break;
      }
      case 'vault': {
        s.t += dt;
        const u = clamp(s.t / s.flight, 0, 1);
        s.x = lerp(s.fromX, s.toX, u);
        s.y = this.floorY - 4 * s.apex * u * (1 - u);
        if (u >= 1) {
          s.y = this.floorY;
          s.state = 'idle';
        }
        break;
      }
      case 'approach':
        s.timer -= dt;
        s.facing = dx >= 0 ? 1 : -1;
        s.x = approach(s.x, p.cx - s.facing * 160, 180 * dt);
        if (Math.abs(dx) <= LEAP_REACH - 40 || s.timer <= 0) this.solMove(world);
        break;
      case 'hop': {
        s.t += dt;
        const u = clamp(s.t / s.flight, 0, 1);
        s.x = lerp(s.fromX, s.toX, u);
        s.y = this.floorY - 4 * s.apex * u * (1 - u);
        if (u >= 1) {
          s.y = this.floorY;
          this.solMove(world, true);
        }
        break;
      }
      case 'leapWind':
        s.timer -= dt;
        s.glow = 1;
        if (this.mark && !this.mark.locked) {
          this.mark.x = damp(this.mark.x, clamp(p.cx, this.arenaLeft + 24, this.arenaRight - 24), 10, dt);
        }
        if (s.timer <= 0) this.takeOff();
        break;
      case 'leap': {
        s.t += dt;
        const u = clamp(s.t / s.flight, 0, 1);
        s.x = lerp(s.fromX, s.toX, u);
        s.y = this.floorY - 4 * s.apex * u * (1 - u);
        s.glow = 1;
        if (u >= 1) this.land(world);
        break;
      }
      case 'dashWind':
        s.timer -= dt;
        s.glow = 1;
        if (s.timer <= 0) {
          s.state = 'dash';
          s.travelled = 0;
          s.hit = false;
          this.flameStep = 0;
          audio.play('dash', 0.6);
          audio.play('fireball', 0.85);
        }
        break;
      case 'dash': {
        const lo = this.arenaLeft + BODY_W / 2 + 2;
        const hi = this.arenaRight - BODY_W / 2 - 2;
        const before = s.x;
        s.x = clamp(s.x + s.dir * DASH_SPEED * dt, lo, hi);
        const moved = Math.abs(s.x - before);
        s.travelled += moved;
        s.glow = 1;
        this.flameStep += moved;
        while (this.flameStep >= FLAME_GAP) {
          this.flameStep -= FLAME_GAP;
          this.flames.push({ x: s.x - s.dir * (10 + this.flameStep), life: FIRE_LIFE, out: false, seed: rand(0, 10) });
        }
        if (world.time % 0.03 < dt) {
          world.particles.spawn({
            x: s.x - s.dir * 14,
            y: this.floorY - rand(4, 20),
            vx: -s.dir * rand(40, 120),
            vy: -rand(20, 90),
            gravity: -60,
            color: Math.random() < 0.5 ? 'rgba(255,190,90,0.85)' : 'rgba(255,120,50,0.8)',
            size: rand(2, 3.5),
            life: 0.4,
            shape: 'spark',
          });
        }
        if (s.travelled >= DASH_LENGTH || moved < DASH_SPEED * dt * 0.5) {
          s.state = 'dashRest';
          s.timer = REST;
          audio.play('slam', 1.35);
          world.camera.addShake(3);
        }
        break;
      }
      case 'leapRest':
      case 'dashRest':
        s.timer -= dt;
        if (s.timer <= 0) this.endTurn(s);
        break;
      case 'stagger':
        s.timer -= dt;
        if (s.timer <= 0) this.endTurn(s);
        break;
      case 'rise':
        s.timer -= dt;
        if (s.timer <= 0) s.state = 'idle';
        break;
      case 'channel':
        if (this.revive) s.facing = this.revive.fallen.x >= s.x ? 1 : -1;
        break;
      default:
        break;
    }
  }

  /** The ring stops where the hero is, and he goes for it. */
  private takeOff(): void {
    const s = this.sol;
    const target = this.mark ? this.mark.x : s.x;
    const reach = clamp(target - s.x, -LEAP_REACH, LEAP_REACH);
    s.fromX = s.x;
    s.toX = clamp(s.x + reach, this.arenaLeft + BODY_W, this.arenaRight - BODY_W);
    const span = Math.abs(s.toX - s.fromX);
    s.flight = clamp(0.42 + span / 1300, 0.45, 0.8);
    s.apex = clamp(64 + span * 0.14, 64, 130);
    s.t = 0;
    s.state = 'leap';
    if (span > 4) s.facing = s.toX > s.fromX ? 1 : -1;
    if (this.mark) {
      this.mark.x = s.toX;
      this.mark.locked = true;
    }
    audio.play('jump', 0.55);
    audio.play('fireball', 1.3);
  }

  private land(world: World): void {
    const s = this.sol;
    s.x = s.toX;
    s.y = this.floorY;
    s.state = 'leapRest';
    s.timer = REST;
    this.mark = null;
    this.flares.push({ x: s.x, y: this.floorY - 3, t: 0, life: 0.45, radius: LEAP_RADIUS, rgb: '255,206,120', round: false });
    audio.play('slam', 0.8);
    audio.play('burst', 1.25);
    world.camera.addShake(6);
    world.particles.burst(s.x, this.floorY - 4, 18, '#ffd27a', {
      speed: 240,
      gravity: 500,
      shape: 'spark',
      angle: -Math.PI / 2,
      spread: Math.PI,
    });
    const p = world.player;
    const under = Math.abs(p.cx - s.x) < LEAP_RADIUS && p.bottom > this.floorY - 40;
    if (!p.dead && under && (p.parryTimer > 0 || !p.isInvulnerable)) this.strike(s, world, s.x);
  }

  /* ----------------------------------------------------------------- Luna */

  /** Luna's move: the crescents for a hero on the floor in their range, the ice otherwise. */
  private lunaMove(world: World): void {
    const p = world.player;
    const l = this.luna;
    const dx = p.cx - l.x;
    const dist = Math.abs(dx);
    l.facing = dx >= 0 ? 1 : -1;
    const low = p.bottom > this.floorY - 40;
    const options = ['ice'];
    if (low && dist > 110 && dist < 560) options.push('throw');
    const fresh = options.filter((o) => o !== l.last);
    const pick = fresh.length > 0 && Math.random() < 0.8 ? fresh : options;
    const move = pick[Math.floor(Math.random() * pick.length)];
    l.last = move;
    l.hit = false;
    if (move === 'throw') {
      l.state = 'throwWind';
      l.timer = THROW_TELL;
      audio.play('tell', 1.3);
      audio.play('magic', 1.6);
    } else {
      l.state = 'iceWind';
      l.timer = ICE_TELL;
      this.markIce(world);
      audio.play('tell', 1.55);
      audio.play('magic', 1.2);
    }
  }

  private updateLuna(dt: number, world: World): void {
    const p = world.player;
    const l = this.luna;
    const dx = p.cx - l.x;
    l.glow = Math.max(0, l.glow - dt * 2);
    if (l.state !== 'fallen') l.y = damp(l.y, this.floorY - HOVER - Math.sin(this.anim * 2.2) * 2, 8, dt);
    else if (l.y < this.floorY) l.y = Math.min(this.floorY, l.y + 120 * dt);
    switch (l.state) {
      case 'idle': {
        // She keeps her distance, gliding - slower than he runs, so a hero
        // who wants her catches her, for a while. Pressed into a corner she
        // slips past him, low and quick, to the open floor.
        l.facing = dx >= 0 ? 1 : -1;
        const dist = Math.abs(dx);
        const speed = this.phaseTwo ? 150 : 135;
        if (dist < 200) {
          if (!this.backOff(l, -l.facing, speed, dt) && dist < 110 && l.cool <= 0) {
            l.state = 'slip';
            l.toX = clamp(p.cx + l.facing * 190, this.arenaLeft + BODY_W, this.arenaRight - BODY_W);
            l.cool = 3;
            audio.play('wing', 1.5);
          }
        } else if (dist > 330) l.x += sign(dx) * speed * dt;
        break;
      }
      case 'slip':
        l.x = approach(l.x, l.toX, 330 * dt);
        if (Math.abs(l.x - l.toX) < 1) l.state = 'idle';
        break;
      case 'throwWind':
        l.timer -= dt;
        l.glow = 1;
        l.facing = dx >= 0 ? 1 : -1;
        if (l.timer <= 0) this.throwCrescents(world);
        break;
      case 'throw': {
        // While they are out she keeps her distance, the way she does when
        // she waits; they find her wherever she goes.
        l.glow = 0.4;
        l.facing = dx >= 0 ? 1 : -1;
        if (Math.abs(dx) < 200) this.backOff(l, -l.facing, this.phaseTwo ? 150 : 135, dt);
        if (!this.crescents.some((c) => !c.dead)) {
          l.state = 'throwRest';
          l.timer = REST;
        }
        break;
      }
      case 'iceWind':
        l.timer -= dt;
        l.glow = 1;
        if (l.timer <= 0) {
          this.dropIce(world);
          l.state = 'iceRest';
          l.timer = REST;
        }
        break;
      case 'throwRest':
      case 'iceRest':
        l.timer -= dt;
        if (l.timer <= 0) this.endTurn(l);
        break;
      case 'stagger':
        l.timer -= dt;
        if (l.timer <= 0) this.endTurn(l);
        break;
      case 'rise':
        l.timer -= dt;
        if (l.timer <= 0) l.state = 'idle';
        break;
      case 'channel':
        if (this.revive) l.facing = this.revive.fallen.x >= l.x ? 1 : -1;
        break;
      default:
        break;
    }
  }

  /** Two crescents, low along the floor, out past the hero and home again. */
  private throwCrescents(world: World): void {
    const p = world.player;
    const l = this.luna;
    const dir: 1 | -1 = p.cx >= l.x ? 1 : -1;
    l.facing = dir;
    const speed = this.phaseTwo ? CRESCENT_SPEED * 1.1 : CRESCENT_SPEED;
    // Out to a little past where he stands, so the way out and the way home
    // both cross him.
    const reach = clamp(Math.abs(p.cx - l.x) + 90, 200, 520);
    for (let i = 0; i < 2; i++) {
      this.crescents.push({
        x: l.x + dir * 14,
        y: this.floorY - CRESCENT_Y,
        vx: dir * speed,
        vy: 0,
        dir,
        speed,
        decel: (speed * speed) / (2 * reach),
        returning: false,
        batted: false,
        dead: false,
        fade: 0,
        delay: i * 0.32,
        spin: 0,
        age: 0,
      });
    }
    l.state = 'throw';
    audio.play('swing', 1.5);
  }

  /** Three rings of frost: on the hero and either side of him, a gap to stand in between each. */
  private markIce(world: World): void {
    const p = world.player;
    const lo = this.arenaLeft + 24;
    const hi = this.arenaRight - 24;
    // Against a wall the pattern is shifted, never squeezed: the gaps stay.
    const centre = clamp(p.cx, lo + ICE_SPREAD, hi - ICE_SPREAD);
    for (const o of [-1, 0, 1]) {
      const x = centre + o * ICE_SPREAD + rand(-8, 8);
      this.icicles.push({ x, surface: this.surfaceAt(x, world), t: 0, fell: false, cancelled: false, fade: 0 });
    }
  }

  /** The first thing an icicle dropped over x meets: the long board, a plank, or the floor. */
  private surfaceAt(x: number, world: World): number {
    const tx = Math.floor(x / TILE);
    const top = Math.floor((this.floorY - 320) / TILE);
    const floorRow = Math.floor(this.floorY / TILE);
    for (let ty = top; ty < floorRow; ty++) {
      if (world.level.platformAt(tx, ty) || world.level.solidAt(tx, ty)) return ty * TILE;
    }
    return this.floorY;
  }

  /* ------------------------------------------------------------- together */

  /** Finsternis: both to the middle. */
  private beginEclipse(): void {
    this.acting = 'both';
    this.turns = 0;
    const solLeft = this.sol.x <= this.luna.x;
    this.sol.toX = this.mid + (solLeft ? -46 : 46);
    this.luna.toX = this.mid + (solLeft ? 46 : -46);
    for (const t of this.twins) {
      t.state = 'toMiddle';
      t.timer = 3;
      t.hit = false;
      t.poise = this.poiseMax;
    }
  }

  private updateJoint(dt: number, world: World): void {
    const [a, b] = this.twins;
    if (a.state === 'toMiddle' && b.state === 'toMiddle') {
      for (const t of this.twins) {
        t.x = approach(t.x, t.toX, 250 * dt);
        t.facing = this.mid >= t.x ? 1 : -1;
        t.timer -= dt;
      }
      const there = this.twins.every((t) => Math.abs(t.x - t.toX) < 1);
      if (there || a.timer <= 0) {
        for (const t of this.twins) {
          t.state = 'eclipse';
          t.timer = ECLIPSE_TELL;
          t.glow = 1;
          t.facing = this.mid >= t.x ? 1 : -1;
        }
        this.eclipse = 0;
        audio.play('tell', 0.6);
        audio.play('beamCharge', 0.75);
        world.camera.addShake(2);
      }
    } else if (a.state === 'eclipse' && b.state === 'eclipse') {
      for (const t of this.twins) {
        t.timer -= dt;
        t.glow = 1;
      }
      this.eclipse = clamp(1 - a.timer / ECLIPSE_TELL, 0, 1);
      if (a.timer <= 0) this.releaseEclipse(world);
    } else if (a.state === 'eclipseRest' && b.state === 'eclipseRest') {
      // Spent, both of them. The rings run on to the walls meanwhile, and
      // nothing new starts until they are long gone - see CALM.
      for (const t of this.twins) t.timer -= dt;
      if (a.timer <= 0 && b.timer <= 0) {
        this.endTurn(a);
        this.endTurn(b);
      }
    }
  }

  private releaseEclipse(world: World): void {
    const x = (this.sol.x + this.luna.x) / 2;
    this.rings.push({ x, dir: -1, hit: false }, { x, dir: 1, hit: false });
    for (const t of this.twins) {
      t.state = 'eclipseRest';
      t.timer = REST;
    }
    this.flares.push({ x, y: this.floorY - 70, t: 0, life: 0.5, radius: 60, rgb: '255,240,210', round: true });
    audio.play('burst', 0.7);
    audio.play('beam', 0.85);
    world.camera.addShake(6);
    world.hitStop(0.05);
  }

  /* ------------------------------------------------------- the rule, falls */

  /** A twin reels: whatever it was doing comes to nothing, and it stands open. */
  private stagger(t: Twin, world: World, seconds: number, parried: boolean): void {
    if (t.state === 'fallen' || t.state === 'channel' || t.state === 'rise') return;
    if (t.state === 'stagger') {
      t.timer = Math.max(t.timer, seconds);
      return;
    }
    if (this.acting === 'both') {
      // Finsternis does not happen with one of them reeling.
      const o = this.other(t);
      if (o.state === 'toMiddle' || o.state === 'eclipse' || o.state === 'eclipseRest') {
        o.state = 'idle';
        o.glow = 0;
      }
      this.acting = t;
    }
    if (t.who === 'luna') {
      for (const c of this.crescents) if (!c.batted && !c.dead && c.fade <= 0) c.fade = 0.3;
      for (const ic of this.icicles) {
        if (ic.fell || ic.cancelled) continue;
        ic.cancelled = true;
        ic.fade = 0.3;
      }
    } else {
      this.mark = null;
    }
    t.state = 'stagger';
    t.timer = seconds;
    t.glow = 0;
    t.poise = this.poiseMax;
    t.lock = seconds + 3;
    audio.play('clank', parried ? 0.75 : 0.95);
    audio.play('crumble', 1.4);
    world.camera.addShake(4);
    world.hitStop(0.06);
    const text = parried ? 'ER TAUMELT!' : t.who === 'sol' ? 'ER WANKT!' : 'SIE WANKT!';
    world.particles.text(t.x, t.y - BODY_H - 16, text, t.who === 'sol' ? '#ffd27a' : '#cfe0ff');
  }

  /** Everything still out comes to nothing: a fall, or the end. */
  private clearHazards(all: boolean): void {
    for (const c of this.crescents) if (!c.dead && c.fade <= 0 && (all || !c.batted)) c.fade = 0.3;
    for (const ic of this.icicles) {
      if (ic.fell || ic.cancelled) continue;
      ic.cancelled = true;
      ic.fade = 0.3;
    }
    for (const f of this.flames) {
      f.out = true;
      f.life = Math.min(f.life, 0.35);
    }
    this.rings.length = 0;
    this.mark = null;
  }

  /**
   * A twin goes down. If the other is still standing, it stops whatever it is
   * doing and calls this one back - see the class comment. If the other is
   * already a star on the floor, that was the last of them.
   */
  private fall(t: Twin, world: World): void {
    t.hp = 0;
    this.syncHp();
    const o = this.other(t);
    if (o.state === 'fallen' || o.hp <= 0) {
      this.beginDying(world);
      return;
    }
    this.clearHazards(false);
    t.state = 'fallen';
    t.glow = 0;
    t.flash = 1;
    o.state = 'channel';
    o.glow = 0;
    o.facing = t.x >= o.x ? 1 : -1;
    this.revive = { fallen: t, channeler: o, left: REVIVE, pulse: CALL_FIRST, told: false };
    this.acting = null;
    audio.play('crumble', 1.2);
    audio.play(t.who === 'sol' ? 'bossRoar' : 'screech', 1.5);
    audio.play('magic', 0.65);
    world.camera.addShake(6);
    world.hitStop(0.1);
    world.particles.burst(t.x, t.y - 20, 26, t.who === 'sol' ? '#ffd27a' : '#cfe0ff', { speed: 220, gravity: 260, shape: 'spark' });
  }

  private updateRevive(dt: number, world: World): void {
    const r = this.revive;
    if (!r) return;
    r.left -= dt;
    const c = r.channeler;
    if (world.time % 0.05 < dt) {
      // Light running from the hands that call into the star that is called.
      const u = Math.random();
      const hx = c.x + c.facing * c.hx;
      const hy = c.y + c.hy;
      world.particles.spawn({
        x: lerp(hx, r.fallen.x, u),
        y: lerp(hy, this.floorY - 9, u) - Math.sin(u * Math.PI) * 30,
        vx: rand(-10, 10),
        vy: -rand(10, 40),
        gravity: -20,
        color: c.who === 'sol' ? 'rgba(255,214,140,0.85)' : 'rgba(200,220,255,0.85)',
        size: rand(1.5, 2.5),
        life: 0.5,
        shape: 'spark',
      });
    }
    // A ring out of the caller, each one told: none so close to the end that
    // it would come out of a twin already risen.
    if (r.left > CALL_TELL + 0.4) {
      r.pulse -= dt;
      if (r.pulse <= CALL_TELL) {
        if (!r.told) {
          r.told = true;
          audio.play('tell', c.who === 'sol' ? 0.95 : 1.3);
        }
        c.glow = Math.max(c.glow, 1 - Math.max(0, r.pulse) / CALL_TELL);
      }
      if (r.pulse <= 0) {
        this.rings.push({ x: c.x, dir: -1, hit: false }, { x: c.x, dir: 1, hit: false });
        this.flares.push({ x: c.x, y: this.floorY - 40, t: 0, life: 0.4, radius: 46, rgb: c.who === 'sol' ? '255,214,140' : '200,220,255', round: true });
        audio.play('burst', 0.85);
        world.camera.addShake(3);
        r.pulse = CALL_PULSE;
        r.told = false;
      }
    }
    if (r.left <= 0) this.completeRevive(world);
  }

  /** The ring is full: the fallen twin stands again, with half of what it had. */
  private completeRevive(world: World): void {
    const r = this.revive;
    if (!r) return;
    const t = r.fallen;
    t.hp = Math.ceil(t.maxHp / 2);
    t.poise = this.poiseMax;
    t.lock = 2;
    t.state = 'rise';
    t.timer = 0.9;
    t.flash = 1;
    t.vy = 0;
    t.y = t.who === 'sol' ? this.floorY : this.floorY - HOVER;
    r.channeler.state = 'idle';
    this.revive = null;
    this.revivals++;
    this.syncHp();
    if (!this.phaseTwo) this.enterPhaseTwo(world);
    this.gap = 1.0;
    audio.play('phase', 1.15);
    audio.play('heal', 0.8);
    world.camera.addShake(4);
    world.particles.burst(t.x, t.y - 22, 30, t.who === 'sol' ? '#ffe2a0' : '#dfe8ff', { speed: 200, gravity: -60, shape: 'spark' });
    world.particles.text(t.x, t.y - BODY_H - 16, t.who === 'sol' ? 'ER STEHT WIEDER!' : 'SIE STEHT WIEDER!', '#e3d6ff');
  }

  private enterPhaseTwo(world: World): void {
    this.phaseTwo = true;
    // Finsternis is the next thing they do together.
    this.turns = 3;
    audio.play('phase', 0.9);
    world.camera.addShake(5);
    for (const t of this.twins) {
      if (t.state === 'fallen') continue;
      world.particles.burst(t.x, t.y - 22, 20, t.who === 'sol' ? '#ffe2a0' : '#dfe8ff', { speed: 200, gravity: -40, shape: 'spark' });
    }
  }

  /**
   * Both down, at once and for good: the end of the fight, whatever was going
   * on - also the way the tools fell them.
   */
  beginDying(world: World): void {
    if (this.dead || this.state === 'dying') return;
    if (this.floorY === 0) this.settle(world);
    this.engaged = true;
    this.state = 'dying';
    this.timer = DYING;
    this.revive = null;
    this.acting = null;
    this.clearHazards(true);
    for (const t of this.twins) {
      t.hp = 0;
      t.state = 'fallen';
      t.glow = 0;
    }
    this.syncHp();
    this.deathX = clamp((this.sol.x + this.luna.x) / 2, this.arenaLeft + 40, this.arenaRight - 40);
    audio.play('bossRoar', 1.3);
    audio.play('magic', 0.5);
    world.camera.addShake(9);
    world.hitStop(0.14);
  }

  /** The two stars drift together and go out as one. */
  private updateDying(dt: number, world: World): void {
    this.timer -= dt;
    const k = 1 - this.timer / DYING;
    for (const t of this.twins) {
      if (t.y < this.floorY) {
        t.vy += 2600 * dt;
        t.y = Math.min(this.floorY, t.y + t.vy * dt);
      }
      if (k > 0.25) t.x = damp(t.x, this.deathX, 2.2, dt);
    }
    if (Math.random() < 0.5) {
      const t = Math.random() < 0.5 ? this.sol : this.luna;
      world.particles.spawn({
        x: t.x + rand(-8, 8),
        y: this.floorY - 9 + rand(-6, 6),
        vx: rand(-30, 30),
        vy: -rand(40, 120),
        gravity: -30,
        color: t === this.sol ? 'rgba(255,214,140,0.9)' : 'rgba(200,220,255,0.9)',
        size: rand(1.5, 3),
        life: 0.8,
        shape: 'spark',
      });
    }
    if (this.timer <= 0) {
      this.w = BODY_W;
      this.h = BODY_H;
      this.x = this.deathX - BODY_W / 2;
      this.y = this.floorY - 30 - BODY_H / 2;
      world.particles.burst(this.deathX, this.floorY - 20, 40, '#fff1c8', { speed: 260, gravity: 120, shape: 'spark' });
      this.die(world);
      world.onBossFelled('twins', this.deathX, this.floorY - 90);
    }
  }

  /* -------------------------------------------------------------- hazards */

  /** The icicles come down, all three, the moment her wind-up is over. */
  private dropIce(world: World): void {
    const p = world.player;
    let struck = false;
    for (const ic of this.icicles) {
      if (ic.fell || ic.cancelled) continue;
      ic.fell = true;
      ic.t = ICE_TELL;
      for (let i = 0; i < 5; i++) {
        this.shards.push({ x: ic.x + rand(-4, 4), y: ic.surface - 4, vx: rand(-140, 140), vy: rand(-260, -80), rot: rand(0, 6), spin: rand(-10, 10), life: 0.6 });
      }
      world.particles.burst(ic.x, ic.surface - 4, 8, '#dff0ff', { speed: 140, gravity: 500, shape: 'spark', angle: -Math.PI / 2, spread: Math.PI });
      const under = Math.abs(p.cx - ic.x) < ICE_HALF + p.w / 2 && p.bottom <= ic.surface + 4 && p.bottom > ic.surface - 58;
      if (!struck && !p.dead && under && (p.parryTimer > 0 || !p.isInvulnerable)) {
        struck = true;
        p.hurt(1, sign(p.cx - ic.x) || 1, world);
      }
    }
    audio.play('crumble', 1.8);
    audio.play('clank', 1.9);
  }

  private updateHazards(dt: number, world: World): void {
    this.updateCrescents(dt, world);
    for (const ic of this.icicles) {
      ic.t += dt;
      if (ic.cancelled) ic.fade -= dt;
    }
    for (let i = this.icicles.length - 1; i >= 0; i--) {
      const ic = this.icicles[i];
      if ((ic.fell && ic.t > ICE_TELL + 0.5) || (ic.cancelled && ic.fade <= 0)) this.icicles.splice(i, 1);
    }
    for (const f of this.flames) f.life -= dt;
    for (let i = this.flames.length - 1; i >= 0; i--) if (this.flames[i].life <= 0) this.flames.splice(i, 1);
    for (const r of this.rings) r.x += r.dir * RING_SPEED * dt;
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      if (r.x < this.arenaLeft - 20 || r.x > this.arenaRight + 20) this.rings.splice(i, 1);
    }
    if (this.rings.length > 0 && world.time % 0.04 < dt) {
      for (const r of this.rings) {
        world.particles.spawn({
          x: r.x,
          y: this.floorY - rand(2, RING_H),
          vx: -r.dir * rand(20, 70),
          vy: -rand(10, 60),
          gravity: -30,
          color: Math.random() < 0.5 ? 'rgba(255,236,190,0.85)' : 'rgba(150,120,220,0.7)',
          size: rand(1.5, 3),
          life: 0.4,
          shape: 'spark',
        });
      }
    }
    for (const s of this.shards) {
      s.life -= dt;
      s.vy += 1100 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.rot += s.spin * dt;
    }
    for (let i = this.shards.length - 1; i >= 0; i--) if (this.shards[i].life <= 0) this.shards.splice(i, 1);
    for (const f of this.flares) f.t += dt;
    for (let i = this.flares.length - 1; i >= 0; i--) if (this.flares[i].t > this.flares[i].life) this.flares.splice(i, 1);
  }

  /**
   * The crescents: out, slowing, home again. A swing that meets one bats it
   * back - and a crescent batted back flies at the one who threw it. A parry
   * does the same; it is a blow turned aside like any other.
   */
  private updateCrescents(dt: number, world: World): void {
    const p = world.player;
    const l = this.luna;
    for (const c of this.crescents) {
      if (c.dead) continue;
      c.age += dt;
      c.spin += dt * 15 * c.dir;
      if (c.fade > 0) {
        c.fade -= dt;
        c.x += c.vx * dt;
        c.vx *= Math.pow(0.05, dt);
        c.y += 40 * dt;
        if (c.fade <= 0) c.dead = true;
        continue;
      }
      if (c.delay > 0) {
        c.delay -= dt;
        c.x = l.x + c.dir * 14;
        if (c.delay <= 0) audio.play('swing', 1.65);
        continue;
      }
      if (c.batted) {
        if (l.state === 'fallen' || this.state !== 'fight') {
          c.fade = 0.3;
          continue;
        }
        const a = Math.atan2(l.y - BODY_H / 2 - c.y, l.x - c.x);
        c.vx = Math.cos(a) * BATTED_SPEED;
        c.vy = Math.sin(a) * BATTED_SPEED;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        if (rectsOverlap(this.crescentRect(c), this.rectOf(l))) {
          c.dead = true;
          audio.play('deflect', 0.8);
          world.particles.burst(c.x, c.y, 16, '#fff4c8', { speed: 200, gravity: 120, shape: 'spark' });
          const before = this.hp;
          this.damage(l, BATTED_DAMAGE, world);
          p.onDamageDealt(Math.max(0, before - this.hp));
        }
        continue;
      }
      if (!c.returning) {
        c.vx -= c.dir * c.decel * dt;
        if (sign(c.vx) !== c.dir) c.returning = true;
      } else {
        const home = sign(l.x - c.x) || -c.dir;
        c.vx = approach(c.vx, home * c.speed, c.decel * dt);
      }
      c.x += c.vx * dt;
      c.y = this.floorY - CRESCENT_Y + Math.sin(c.age * 9) * 1.5;
      if (c.returning && Math.abs(c.x - l.x) < 14) {
        c.dead = true;
        audio.play('magic', 1.9);
        continue;
      }
      if (c.age > 6 || c.x < this.arenaLeft - 40 || c.x > this.arenaRight + 40) {
        c.fade = 0.3;
        continue;
      }
      const box = this.crescentRect(c);
      if (!p.dead && rectsOverlap(box, p.rect) && (p.parryTimer > 0 || !p.isInvulnerable)) {
        const guarding = p.parryTimer > 0;
        p.hurt(1, sign(p.cx - c.x) || sign(c.vx) || 1, world);
        if (guarding && p.parryTimer === 0 && p.parryFlash > 0.95) this.bat(c, world);
        else {
          c.dead = true;
          world.particles.burst(c.x, c.y, 10, '#cfe0ff', { speed: 150, gravity: 100, shape: 'spark' });
        }
        continue;
      }
      if (p.bladeLive && rectsOverlap(box, p.swordRect())) this.bat(c, world);
    }
    for (let i = this.crescents.length - 1; i >= 0; i--) if (this.crescents[i].dead) this.crescents.splice(i, 1);
  }

  private bat(c: Crescent, world: World): void {
    c.batted = true;
    c.returning = false;
    audio.play('deflect', 1.1);
    world.particles.burst(c.x, c.y, 10, '#fff4c8', { speed: 160, gravity: 60, shape: 'spark' });
  }

  /* ----------------------------------------------------------- the box */

  /**
   * The box the game sees. It clamps it into the arena, culls and draws by
   * it, and a parry finds whatever is within sixty pixels of its middle - and
   * a box around both of them breaks the drawing: the game only draws an
   * enemy whose box's left edge is near the screen, so with Sol at one wall
   * and Luna and the hero at the other, neither of them would be drawn at all,
   * nor any crescent or icicle near the hero. So it sits on the twin nearest
   * the hero, never more than VIEW_REACH from him, and always inside the
   * arena. The bodies themselves are this class's own business, and stay
   * inside the arena by their own clamp.
   */
  private placeBox(world: World): void {
    if (this.floorY === 0 || this.dead) return;
    if (this.state === 'dormant' || this.state === 'intro') {
      const lo = Math.min(this.sol.x, this.luna.x) - BODY_W / 2;
      const hi = Math.max(this.sol.x, this.luna.x) + BODY_W / 2;
      this.x = lo;
      this.w = hi - lo;
      this.y = this.floorY - BODY_H - 6;
      this.h = BODY_H + 6;
      return;
    }
    const p = world.player;
    let cx = this.deathX;
    let top = this.floorY - BODY_H;
    if (this.state !== 'dying') {
      const up = this.twins.filter((t) => t.state !== 'fallen');
      if (up.length > 0) {
        let a = this.anchor && up.includes(this.anchor) ? this.anchor : up[0];
        for (const t of up) if (Math.abs(t.x - p.cx) + 40 < Math.abs(a.x - p.cx)) a = t;
        this.anchor = a;
        cx = a.x;
        top = a.y - BODY_H;
      }
    }
    this.w = BODY_W;
    this.h = BODY_H;
    const x = clamp(cx - BODY_W / 2, p.cx - VIEW_REACH, p.cx + VIEW_REACH - BODY_W);
    this.x = clamp(x, this.arenaLeft, this.arenaRight - BODY_W);
    this.y = top;
  }

  /* --------------------------------------------------------------- lights */

  override lights(): GlowLight[] {
    const out: GlowLight[] = [];
    if (this.floorY === 0) return out;
    const awake = this.awake;
    for (const t of this.twins) {
      const rgb = t.who === 'sol' ? '255,186,96' : '160,196,255';
      if (t.state === 'fallen') {
        const pulse = 0.6 + Math.sin(this.anim * 4) * 0.2;
        const dying = this.state === 'dying' ? clamp(1 - this.timer / DYING, 0, 1) : 0;
        out.push({ x: t.x, y: this.floorY - 10, radius: 70 + dying * 90, rgb, strength: 0.5 * pulse + dying * 0.4, tint: 0.3 });
        continue;
      }
      out.push({ x: t.x, y: t.y - 26, radius: (125 + t.glow * 55) * awake, rgb, strength: 0.78, tint: 0.3 + t.glow * 0.1 });
    }
    for (let i = 0; i < this.flames.length; i += 4) {
      const f = this.flames[i];
      out.push({ x: f.x, y: this.floorY - 8, radius: 60, rgb: '255,140,60', strength: 0.6 * clamp(f.life / 0.35, 0, 1), tint: 0.35 });
    }
    for (const c of this.crescents) {
      if (c.dead || c.delay > 0) continue;
      out.push({ x: c.x, y: c.y, radius: 64, rgb: c.batted ? '255,240,190' : '190,215,255', strength: 0.7, tint: 0.35 });
    }
    for (const ic of this.icicles) {
      if (ic.fell || ic.cancelled) continue;
      out.push({ x: ic.x, y: ic.surface - 12, radius: 52, rgb: '170,215,255', strength: 0.55, tint: 0.3 });
      const top = this.icicleTop(ic);
      if (top !== null) out.push({ x: ic.x, y: top + 17, radius: 46, rgb: '190,225,255', strength: 0.6, tint: 0.35 });
    }
    if (this.mark) {
      out.push({ x: this.mark.x, y: this.floorY - 6, radius: 74, rgb: '255,200,110', strength: this.mark.locked ? 0.7 : 0.4, tint: 0.3 });
    }
    if (this.eclipse > 0.02) {
      out.push({ x: (this.sol.x + this.luna.x) / 2, y: this.floorY - 70, radius: 120 + 120 * this.eclipse, rgb: '255,236,200', strength: 0.8, tint: 0.4 });
    }
    for (const r of this.rings) out.push({ x: r.x, y: this.floorY - 14, radius: 90, rgb: '255,226,170', strength: 0.75, tint: 0.35 });
    return out;
  }

  /* ------------------------------------------------------------- drawing */

  /** Where the working hand is and what angle it holds things at, by state - in facing space, feet at the origin. */
  private poseOf(t: Twin): [number, number, number] {
    if (t.who === 'sol') {
      switch (t.state) {
        case 'leapWind':
          return [3, -35, -2.45];
        case 'leap':
          return t.t / Math.max(0.01, t.flight) < 0.55 ? [4, -37, -2.6] : [12, -24, 0.5];
        case 'leapRest':
          return [11, -27, 1.15];
        case 'dashWind':
          return [11, -17, 0.22];
        case 'dash':
          return [13, -18, 0.06];
        case 'dashRest':
          return [10, -24, 0.95];
        case 'stagger':
          return [6, -26, 2.1];
        case 'channel':
        case 'eclipse':
          return [4, -37, -1.62];
        case 'eclipseRest':
          return [11, -27, 1.15];
        default:
          return [9, -21, -1.42];
      }
    }
    switch (t.state) {
      case 'throwWind':
        return [9, -52, -1.3];
      case 'throw':
        return [15, -30, 0];
      case 'iceWind':
      case 'eclipse':
        return [7, -54, -1.5];
      case 'channel':
        return [15, -30, 0.1];
      case 'stagger':
        return [6, -20, 1.2];
      case 'throwRest':
      case 'iceRest':
      case 'eclipseRest':
        return [8, -24, 0.9];
      default:
        return [5, -28, 0.6];
    }
  }

  private easePose(t: Twin, dt: number): void {
    const [x, y, a] = this.poseOf(t);
    const k = t.state === 'leap' || t.state === 'dash' ? 22 : 12;
    t.hx = damp(t.hx, x, k, dt);
    t.hy = damp(t.hy, y, k, dt);
    t.ha = damp(t.ha, a, k, dt);
  }

  /*
   * Drawn for the grid (twins-art.ts). Each twin is a body sprite per pose and
   * frame - Sol's crouch in three steps, his run in two strides, his cape and
   * Luna's hem in four frames - with the working arm and what it holds laid
   * on over it, and a halo ring behind each head that brightens with every
   * wind-up: Sol's grows a second ring and rays, Luna's a ring of frost. What
   * they leave on the floor and throw through the air is drawn with the pen
   * and from sprites, in their two ramps; every glow is a light (lights()).
   * A struck twin is white for two frames.
   */
  override draw(ctx: CanvasRenderingContext2D): void {
    if (this.floorY === 0) return;
    this.drawGround(ctx);
    this.drawEclipse(ctx);
    this.drawTwin(ctx, this.luna);
    this.drawTwin(ctx, this.sol);
    this.drawAir(ctx);
    this.drawLabels(ctx);
  }

  /** What lies on the floor: marks, embers, fire, frost, the rings, the call. */
  private drawGround(ctx: CanvasRenderingContext2D): void {
    const F = this.floorY;
    const s = this.sol;
    const beat = Math.floor(this.anim * 12);
    if (this.mark) {
      // The ring of sunlight he will land on: dashes chasing round it while it
      // follows the hero, solid once it stops - and a second ring filling out
      // to meet it as he comes down.
      if (this.mark.locked) {
        const u = clamp(s.t / Math.max(0.01, s.flight), 0, 1);
        ovalRing(ctx, this.mark.x, F - 2, LEAP_RADIUS, 9, 1, SUN[4]);
        ovalRing(ctx, this.mark.x, F - 2, LEAP_RADIUS * (0.3 + u * 0.6), 3 + u * 5, 1, SUN[2]);
      } else {
        const k = clamp(1 - s.timer / LEAP_TELL, 0, 1);
        dashedOval(ctx, this.mark.x, F - 2, LEAP_RADIUS, 9, 3, 2, k > 0.5 ? SUN[3] : SUN[2], this.anim * 2);
      }
    }
    if (s.state === 'dashWind') {
      // The line he is going to run, in embers, brighter as he lowers the glaive.
      const k = clamp(1 - s.timer / DASH_TELL, 0, 1);
      const from = s.x + s.dir * 18;
      const to = s.toX + s.dir * 15;
      const n = Math.max(0, Math.floor(Math.abs(to - from) / 14));
      const hot = k > 0.5 ? 1 : 0;
      for (let i = 0; i <= n; i++) {
        const up = hash2(i, beat) > 0.5 ? 1 : 0;
        const h = (1 + up + hot) * ART;
        rect(ctx, from + s.dir * i * 14 - 2, F - h, 4, h, SUN[1 + up + hot * 2]);
      }
      poly(ctx, [to + s.dir * 8, F - 5, to - s.dir * 2, F - 11, to - s.dir * 2, F + 1], SUN[2 + hot * 2]);
    }
    for (const f of this.flames) {
      const k = clamp(f.life / 0.35, 0, 1) * (f.out ? 0.5 : 1);
      if (k <= 0.05) continue;
      const sp = flameSprite(k > 0.66 ? 2 : k > 0.33 ? 1 : 0, beat + Math.floor(f.seed * 3), f.out);
      sp.draw(ctx, f.x - (sp.w * ART) / 2, F - sp.h * ART);
    }
    for (const ic of this.icicles) {
      if (ic.fell) continue;
      // A ring of frost where it will land, and a second one closing on it:
      // the count, read off the floor.
      const k = clamp(ic.t / ICE_TELL, 0, 1);
      const y = ic.surface - 1;
      if (ic.cancelled) {
        if (ic.fade > 0.15) ovalRing(ctx, ic.x, y, ICE_HALF + 4, 5, 1, MOONLIGHT[1]);
        continue;
      }
      ovalRing(ctx, ic.x, y, ICE_HALF + 4, 5, 1, MOONLIGHT[k < 0.4 ? 2 : k < 0.75 ? 3 : 4]);
      if (k < 0.97) ovalRing(ctx, ic.x, y, (ICE_HALF + 4) * (1 - k) + 3, 5 * (1 - k) + 2, 1, FROST[3]);
      const m = frostSprite();
      m.draw(ctx, ic.x - (m.w * ART) / 2, y - ART * 1.5);
    }
    for (const f of this.flares) {
      // A ring of light going out: hot, then a step down the ramp, then gone.
      const u = clamp(f.t / f.life, 0, 1);
      if (u > 0.85) continue;
      const r = f.radius * (0.4 + u * 0.7);
      const tones = FLARE[f.rgb] ?? [SUN[4], SUN[2]];
      const color = u < 0.45 ? tones[0] : tones[1];
      const thick = u < 0.3 ? 2 : 1;
      if (f.round) ring(ctx, f.x, f.y, r, color, thick);
      else ovalRing(ctx, f.x, f.y, r, Math.max(4, r * 0.14), thick, color);
    }
    for (const r of this.rings) this.drawRing(ctx, r);
    if (this.revive) this.drawRevive(ctx);
  }

  /**
   * A ring of Finsternis, seen edge on as it runs along the floor: a wall of
   * light in front, as tall as it hurts, and the shadow dragging behind it.
   */
  private drawRing(ctx: CanvasRenderingContext2D, r: Ring): void {
    const F = this.floorY;
    const b = -r.dir;
    const d = r.dir;
    const x = Math.floor(r.x / ART) * ART;
    const top = F - RING_H;
    poly(ctx, [x + b * 6, F, x + b * 6, top + 6, ...quad(x + b * 6, top + 6, x + b * 34, F - RING_H * 0.55, x + b * 70, F, 6).slice(2)], '#1a1932');
    const flick = Math.floor(this.anim * 20) & 1;
    poly(ctx, [...quad(x + b * 16, F, x + b * 10, top, x + d * 2, top, 6), ...quad(x + d * 2, top, x + d * 8, F - RING_H * 0.5, x + d * 6, F, 6).slice(2)], SUN[3]);
    poly(ctx, [...quad(x + b * 9, F, x + b * 6, top + 5, x + d * 1, top + 4, 5), ...quad(x + d * 1, top + 4, x + d * 5, F - RING_H * 0.45, x + d * 3, F, 5).slice(2)], SUN[4 + flick]);
    rect(ctx, x - 1, top, 2, RING_H, SUN[5]);
  }

  /** The call: a ring filling round the star, and a banded tether from the hands that call. */
  private drawRevive(ctx: CanvasRenderingContext2D): void {
    const r = this.revive;
    if (!r) return;
    const c = r.channeler;
    const sol = c.who === 'sol';
    const k = clamp(1 - r.left / REVIVE, 0, 1);
    const x = Math.floor(r.fallen.x / ART) * ART + ART / 2;
    const y = this.floorY - 9;
    ring(ctx, x, y, 22, sol ? SUN[0] : MOONLIGHT[0], 2);
    if (k > 0.01) sector(ctx, x, y, 18, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k, sol ? SUN[4] : MOONLIGHT[4]);
    const [hx, hy] = this.handOf(c);
    const pts = quad(hx, hy, (hx + x) / 2, Math.min(hy, y) - 30, x, y, 14);
    beam(ctx, pts, sol ? SUN[2] : MOONLIGHT[1], sol ? SUN[3] : MOONLIGHT[2], sol ? SUN[5] : MOONLIGHT[4], -Math.floor(this.anim * 16));
  }

  /** The moon sliding over the sun, between them. */
  private drawEclipse(ctx: CanvasRenderingContext2D): void {
    if (this.eclipse <= 0.01) return;
    const k = this.eclipse;
    const x = Math.floor((this.sol.x + this.luna.x) / 2 / ART) * ART + ART / 2;
    const y = this.floorY - 70;
    const R = Math.max(ART, Math.round((14 * k + 1) / ART) * ART);
    const twinkle = Math.floor(this.anim * 8) & 1;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r0 = R + ART * 2;
      const r1 = r0 + ((i + twinkle) % 2 ? 6 : 12) * k;
      line(ctx, x + Math.cos(a) * r0, y + Math.sin(a) * r0, x + Math.cos(a) * r1, y + Math.sin(a) * r1, SUN[4], i % 2 ? 2 : 1);
    }
    disc(ctx, x, y, R, SUN[3]);
    disc(ctx, x, y, R * 0.65, SUN[4]);
    if (R >= ART * 3) disc(ctx, x, y, R * 0.3, SUN[5]);
    const from = this.luna.x >= this.sol.x ? 1 : -1;
    disc(ctx, x + Math.round(from * (1 - k) * 9) * ART, y, Math.max(ART / 2, R - ART), '#0e071b');
  }

  /** Where a twin's working hand is drawn, in the world. */
  private handOf(t: Twin): [number, number] {
    const bx = Math.floor(t.x / ART) * ART + ART / 2;
    const by = Math.floor((t.y - 1) / ART) * ART + ART / 2;
    const drop = t.who === 'sol' ? solDrop(this.solLook(t)) : 0;
    return [bx + t.facing * t.hx, by + t.hy + drop];
  }

  private drawTwin(ctx: CanvasRenderingContext2D, t: Twin): void {
    const F = this.floorY;
    if (t.state === 'fallen') {
      this.drawStar(ctx, t);
      return;
    }
    const air = Math.max(0, F - t.y);
    shadow(ctx, t.x, F, (t.who === 'sol' ? 34 : 28) * clamp(1 - air / 220, 0.35, 1), 0.32 * clamp(1 - air / 260, 0.3, 1));
    withHitFlash(ctx, solidFlash(t.flash), (c) => (t.who === 'sol' ? this.drawSol(c, t) : this.drawLuna(c, t)), {
      x: t.x - 70,
      y: t.y - 100,
      w: 140,
      h: 104,
    });
  }

  /** How low Sol is: on one knee at the altar, crouched for a bound, sagging when he reels. */
  private crouchOf(s: Twin): number {
    if (this.state === 'dormant') return 0.55;
    if (this.state === 'intro') return 0.55 * (1 - this.rise);
    switch (s.state) {
      case 'leapWind':
        return 0.6 * easeOut(clamp(1 - s.timer / LEAP_TELL, 0, 1), 2);
      case 'leapRest':
        return 0.45 * clamp((s.timer - (REST - 0.3)) / 0.3, 0, 1);
      case 'dashWind':
        return 0.25;
      case 'stagger':
        return 0.3;
      case 'channel':
        return 0.15;
      default:
        return 0;
    }
  }

  /** Sol's pose and frame, from what he is doing. */
  private solLook(s: Twin): SolLook {
    const st = s.state;
    const pose = st === 'dash' ? 'run' : st === 'leap' || st === 'hop' || st === 'vault' ? 'air' : st === 'stagger' ? 'reel' : 'stand';
    const c = this.crouchOf(s);
    const crouch = pose === 'reel' ? 2 : pose !== 'stand' ? 0 : c < 0.08 ? 0 : c < 0.22 ? 1 : c < 0.4 ? 2 : 3;
    return {
      pose,
      crouch,
      lean: pose === 'run' ? 4 : pose === 'reel' ? -4 : st === 'dashWind' ? 2 : 0,
      breath: pose === 'stand' && crouch === 0 && Math.floor(this.anim * 1.3) % 2 === 1 ? 1 : 0,
      stride: Math.floor(this.anim * 10) % 2 === 1 ? 1 : 0,
      cape: Math.floor(this.anim * 7) & 3,
      heat: s.glow > 0.6 ? 2 : s.glow > 0.05 ? 1 : 0,
      lit: this.awake > 0.65,
    };
  }

  /** The sun knight: gold over red, a crown of rays, a halo, a short glaive. */
  private drawSol(ctx: CanvasRenderingContext2D, s: Twin): void {
    const look = this.solLook(s);
    const f = s.facing;
    const bx = Math.floor(s.x / ART) * ART + ART / 2;
    const by = Math.floor((s.y - 1) / ART) * ART + ART / 2;
    // The halo, a ring with a crown of rays: short and dim at rest, long and
    // white-hot as he winds up - twinkling, the long ones and the short by turns.
    const [ox, oy] = solHead(look);
    const cx = bx + f * ox;
    const cy = by + oy;
    if (!look.lit) ring(ctx, cx, cy, 18, SUN[0], 1);
    else {
      ring(ctx, cx, cy, 18, SUN[2 + look.heat], look.heat === 2 ? 2 : 1);
      const twinkle = Math.floor(this.anim * 10) & 1;
      for (const i of [0, 4, 5, 6, 7]) {
        const a = (i / 8) * Math.PI * 2;
        const len = [2, 4, 6][look.heat] * ART - (look.heat > 0 ? ((i + twinkle) % 2) * ART * 2 : 0);
        const r0 = 20;
        line(ctx, cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len), SUN[[1, 3, 4][look.heat]], i % 2 ? 2 : 1);
      }
    }
    blit(ctx, solPart(look), bx, by, f < 0);
    // The working arm, and the glaive in its hand.
    const [sx, sy] = solShoulder(look);
    const [hx, hy] = this.handOf(s);
    line(ctx, bx + f * sx, by + sy, hx, hy, SUN[1], 2);
    blit(ctx, glaivePart(angleStep(s.ha, GLAIVE_STEPS), look.heat), hx, hy, f < 0);
  }

  /** Luna's pose and frame, from what she is doing. */
  private lunaLook(l: Twin): LunaLook {
    const bow = this.state === 'dormant' ? 1 : this.state === 'intro' ? 1 - this.rise : l.state === 'stagger' ? 0.6 : 0;
    return {
      frame: Math.floor(this.anim * 5) & 3,
      bow: bow > 0.75 ? 2 : bow > 0.3 ? 1 : 0,
      heat: l.glow > 0.6 ? 2 : l.glow > 0.05 ? 1 : 0,
      lit: this.awake > 0.65,
    };
  }

  /** The moon priestess: a bell of slate and blue, a crescent and a ring behind her head, floating. */
  private drawLuna(ctx: CanvasRenderingContext2D, l: Twin): void {
    const look = this.lunaLook(l);
    const f = l.facing;
    const bx = Math.floor(l.x / ART) * ART + ART / 2;
    const by = Math.floor((l.y - 1) / ART) * ART + ART / 2;
    const [ox, oy] = lunaHead(look);
    const cx = bx + f * ox;
    const cy = by + oy;
    // Her halo ring: slate at rest, pale as she winds up, frost-bright and
    // doubled in weight just before the move.
    if (!look.lit) ring(ctx, cx, cy, 16, MOONLIGHT[0], 1);
    else ring(ctx, cx, cy, 16, look.heat === 2 ? FROST[2] : MOONLIGHT[1 + look.heat * 2], look.heat === 2 ? 2 : 1);
    blit(ctx, lunaPart(look), bx, by, f < 0);
    // Her working arm: the sleeve from the shoulder to the hand.
    const [hx, hy] = this.handOf(l);
    const [sx, sy] = LUNA_SHOULDER;
    line(ctx, bx + f * sx, by + sy, hx, hy, MOONLIGHT[3], 2);
    rect(ctx, hx - 1, hy - 1, 4, 4, MOONLIGHT[4]);
    if (l.state === 'iceWind' || l.state === 'eclipse') {
      // Both hands up: the other one too, and frost gathering between them.
      line(ctx, bx - f * 4, by - 33, bx - f * 6, by - 53, MOONLIGHT[3], 2);
      rect(ctx, bx - f * 6 - 1, by - 55, 4, 4, MOONLIGHT[4]);
      const sp = sparkleSprite(Math.floor(this.anim * 8));
      sp.draw(ctx, bx + f * 1 - (sp.w * ART) / 2, by - 60 - (sp.h * ART) / 2);
    }
    if (l.state === 'throwWind') {
      // A crescent growing over her hand: the tell, and the throw.
      const k = clamp(1 - l.timer / THROW_TELL, 0, 1);
      blit(ctx, crescentPart(k < 0.33 ? 0 : k < 0.66 ? 1 : 2, angleStep(this.anim * 6), 'moon'), hx + f * 2, hy - 8, f < 0);
    }
  }

  /** A twin brought down: a star on the floor, turning and pulsing; two going out as one at the end. */
  private drawStar(ctx: CanvasRenderingContext2D, t: Twin): void {
    const x = t.x;
    const y = this.floorY - 9;
    const bright = Math.sin(this.anim * 4 + (t.who === 'sol' ? 0 : 2)) > 0;
    const dying = this.state === 'dying' ? clamp(1 - this.timer / DYING, 0, 1) : 0;
    const sp = starSprite(t.who, Math.floor(this.anim * (t.who === 'sol' ? 0.9 : 0.7)), bright || dying > 0.5);
    sp.draw(ctx, x - (sp.w * ART) / 2, y - (sp.h * ART) / 2);
    if (dying > 0.05) ring(ctx, x, y, 12 + dying * 22, t.who === 'sol' ? SUN[3] : MOONLIGHT[3], dying > 0.6 ? 2 : 1);
  }

  /**
   * Where an icicle's top is: it forms high over its ring a third of the way
   * into the wind-up, hangs, and falls in the last third - the tip reaches the
   * floor as the wind-up ends. Null while it has not formed, or has landed.
   */
  private icicleTop(ic: Icicle): number | null {
    const k = ic.t / ICE_TELL;
    if (ic.fell || k < 0.35) return null;
    const fall = clamp((k - 0.62) / 0.38, 0, 1);
    return ic.surface - 190 + 156 * fall * fall;
  }

  /** What flies: crescents, icicles on their way down, splinters of ice. */
  private drawAir(ctx: CanvasRenderingContext2D): void {
    for (const c of this.crescents) {
      if (c.dead || c.delay > 0) continue;
      blit(ctx, crescentPart(2, angleStep(c.spin), c.batted ? 'sun' : c.fade > 0 ? 'dim' : 'moon'), c.x, c.y);
    }
    for (const ic of this.icicles) {
      const top = this.icicleTop(ic);
      if (top === null || (ic.cancelled && ic.fade <= 0.05)) continue;
      const forming = ic.cancelled ? ic.fade < 0.15 : ic.t / ICE_TELL < 0.42;
      const sp = icicleSprite(forming);
      sp.draw(ctx, ic.x - (sp.w * ART) / 2, top);
    }
    for (const s of this.shards) {
      const o = ((Math.round(s.rot / (Math.PI / 4)) % 4) + 4) % 4;
      const [w, h] = o === 0 ? [4, 2] : o === 2 ? [2, 4] : [4, 4];
      rect(ctx, s.x - w / 2, s.y - h / 2, w, h, s.life > 0.3 ? MOONLIGHT[4] : MOONLIGHT[3]);
    }
  }

  /** Each twin's own health, on the floor under it - and the call, over the one who calls. */
  private drawLabels(ctx: CanvasRenderingContext2D): void {
    if (this.state !== 'fight') return;
    const F = this.floorY;
    for (const t of this.twins) {
      if (t.state === 'fallen') continue;
      // On whole art pixels, in the twin's own colour.
      const x = Math.floor(t.x / ART) * ART - 16;
      rect(ctx, x - 2, F + 4, 36, 6, '#0e071b');
      const fill = Math.round(16 * clamp(t.hp / t.maxHp, 0, 1)) * ART;
      if (fill > 0) rect(ctx, x, F + 6, fill, 2, t.who === 'sol' ? SUN[3] : MOONLIGHT[3]);
    }
    const r = this.revive;
    if (r) {
      const c = r.channeler;
      const text = c.who === 'luna' ? 'SIE RUFT IHN ZURÜCK!' : 'ER RUFT SIE ZURÜCK!';
      // In the pixel font, on the actors' layer, which outlines it like the
      // twins themselves; it pulses between two colours of the caller's
      // light instead of in and out of transparency.
      const bright = Math.sin(this.anim * 6) > 0;
      const color = c.who === 'luna' ? (bright ? '#ffffff' : '#c7cfdd') : bright ? '#ffeb57' : '#ffc825';
      drawText(ctx, text, c.x, c.y - BODY_H - 26 - capHeight(), { color, align: 'center' });
    }
  }
}
