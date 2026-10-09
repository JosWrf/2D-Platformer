import { audio } from '../core/audio';
import { Rect, TAU, approach, clamp, easeOut, lerp, rand, rectsOverlap, sign } from '../core/math';
import { glow, shadow, withHitFlash } from '../render/sprites';
import type { World } from '../world/context';
import { TILE } from '../world/tiles';
import { Enemy, type GlowLight } from './enemy';

/**
 * Health before the hero is sized up; with the five relics of the road he has
 * 66. The 46 he was planned with were measured too few: a blinding is worth 13
 * to a hero who reads him, and at 46 that hero felled him in 33 to 36 s for
 * none of his hearts, three meals and three blindings and hardly a move of his
 * own in between. At 58 it is 41 to 48 s and 0 to 2 hearts (balance bench,
 * five fights).
 */
const GLOOM_HP = 58;
/**
 * What has to land on him in one meal - while he is at a crystal, swiping or
 * eating - to blind him: 7 once sized up. At 8, a hero reading him with plain
 * swings came up one short in every meal and never blinded him - 78 s a
 * fight. At 7 the blow that does it is the finisher of the second combo, 2.3 s
 * into the meal, so it takes a hero who is there from the start of it.
 */
const GLOOM_POISE = 6;
/** The smoke he holds himself in: what a blade finds of him in the light. */
const W = 56;
const H = 64;
/**
 * How far a lit crystal's light reaches, for the rule: whenever his centre is
 * inside it, he is flesh. The light pass is drawn wider (GLOW_R) so that what
 * the eye calls lit and what the rule calls lit agree at the edge, where a
 * ring of dust marks it.
 */
const LIGHT_R = 110;
const GLOW_R = 150;
/** Seconds a struck crystal shines, in each half, the last of them fading. */
const LIT_TIME = 8;
const LIT_TIME_P2 = 6;
const FADE = 1;
/** A crystal has to have been lit this long before he comes for it. */
const EAT_DELAY = 0.8;
/** An eaten crystal holds no light for a moment: it has to gather some first. */
const SPENT = 2.5;
const SEEK_SPEED = 230;
/** The swipe at a hero who stands at his meal, and its reach from his middle. */
const SWIPE_TELL = 0.5;
const SWIPE_REACH = 60;
/**
 * A hero this close to the crystal when he gets there is swiped first: one
 * standing at it, not one waiting in its light. At 90 a hero who wanted no
 * shove had to wait 98 px off and lost the first half second of every meal
 * walking in.
 */
const SWIPE_NEAR = 72;
/**
 * He comes in over the crystal this high, and swipes from there: out of reach
 * of a blade swung from the floor (the heavy strike reaches 43 px up). Coming
 * straight down onto it, he was flesh in reach for the whole descent and the
 * shove - measured, a hero who only swung at him took 18 to 21 of his 66
 * there, before the meal had even begun.
 */
const PERCH = 46;
/** How hard the shove throws a hero off the meal, whatever hide he wears. */
const SHOVE = 420;
/**
 * The meal itself: the window. 1.8 s gave a hero who sees it 0.3 s late and
 * walks in 5 to 6 damage, short of a blinding every time.
 */
const EAT_TIME = 2.4;
/** Blinded on the floor, solid whatever the light. */
const BLIND = 2.6;
/** After a blind he will not be blinded again for this long once he is up. */
const BLIND_LOCK = 5;
/**
 * Fed, he keeps away from the light a while and fights instead; blinded, he
 * flees it and comes back out of the dark with a wave. With 2.6 and 2 s here
 * he was hungry again the moment a hero relit the crystal: three moves of his
 * own in a whole fight against a reader.
 */
const SATED = 4;
const FEAR = 4.5;
/** Schattengriff: the pool follows, holds still, and the claws come. */
const GRIP_FOLLOW = 0.6;
const GRIP_HOLD = 0.35;
const GRIP_CLAW = 0.4;
/** The pool follows slower than the hero walks (235): a hero who goes, gets out. */
const GRIP_SPEED = 150;
const GRIP_W = 52;
const GRIP_H = 44;
/** Finsterwelle: up, then down onto the floor, and the dark runs out both ways. */
const RISE = 0.6;
const SAG = 1.3;
const WAVE_SPEED = 300;
const WAVE_W = 26;
const WAVE_H = 22;
/** Schattenkugeln, his second half: three orbs that drift at the hero and at the light. */
const ORB_TELL = 0.65;
const ORB_SPEED = 125;
const ORB_LIFE = 5.5;
const ORB_R = 10;
const DRIFT = 130;
/** Away from the light that blinded him: faster than the hero runs (235). */
const FLEE = 260;
/** Where he likes to hang between moves: this far from the hero, out of the light. */
const KEEP = 230;
/**
 * He never strays further than this from the hero - he hunts him, not the
 * room. It also keeps him on the screen: the crystals are drawn with him, and
 * the game only draws an enemy whose box is within 140 px of the view.
 */
const LEASH = 500;
const HINT_EVERY = 2.5;
const INTRO = 1.6;
const DYING = 2.4;

type GloomState =
  | 'dormant'
  | 'intro'
  | 'drift'
  | 'seek'
  | 'swipe'
  | 'eat'
  | 'blinded'
  | 'grip'
  | 'rise'
  | 'slam'
  | 'sag'
  | 'gather'
  | 'dying';

type Move = 'grip' | 'wave' | 'orbs';

/**
 * One of the four crystals of the grotto that still hold light - his, in the
 * sense that he feeds on them. Dark until a blade strikes one.
 */
interface Crystal {
  x: number;
  /** The floor or ledge it grows out of. */
  surface: number;
  ledge: boolean;
  /** Seconds of light left; 0 is dark. */
  lit: number;
  /** Seconds since it was lit. */
  age: number;
  /** Seconds before an eaten crystal will hold light again. */
  spent: number;
  /** Inside him, being eaten: its light holds still while it goes. */
  eaten: boolean;
  /** The swing that last struck it: one swing, one strike. */
  swing: number;
  flare: number;
  snuff: number;
}

/** The pool of the Schattengriff, under the hero. */
interface Pool {
  x: number;
  surface: number;
  t: number;
  hit: boolean;
}

/** A wave of the Finsterwelle, running along the floor. */
interface Wave {
  x: number;
  dir: 1 | -1;
  hit: boolean;
}

/** A Schattenkugel. Its target is a crystal, or the hero (-1). */
interface Orb {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  target: number;
  batted: number;
}

interface Eye {
  /** On the head, in its own space (along it, across it), or on the body. */
  head: boolean;
  x: number;
  y: number;
  size: number;
  phase: number;
  rate: number;
}

/**
 * Where his eyes are: crowded round the socket of the skull and strung along
 * the snout, and a scatter of smaller ones over the front of the smoke.
 */
const HEAD_EYES: readonly (readonly [number, number, number])[] = [
  [11, -4, 1.9],
  [15, -2.5, 1.4],
  [13, -7, 1.2],
  [8, -1.5, 1.1],
  [17, -6, 1.0],
  [22, -6.5, 1.15],
  [27, -5.5, 0.9],
  [32, -4.5, 0.85],
  [20, 3, 0.9],
  [25, 4, 0.75],
];
const BODY_EYES: readonly (readonly [number, number, number])[] = [
  [2, -58, 1.1],
  [-6, -48, 0.9],
  [6, -40, 1.2],
  [-14, -56, 0.8],
  [10, -28, 0.9],
  [-2, -30, 0.8],
  [-18, -40, 0.9],
  [14, -50, 1.0],
  [-10, -20, 0.7],
];

/** The smoke he is made of, as puffs round his middle: x, y, radius, phase. */
const PUFFS: readonly (readonly [number, number, number, number])[] = [
  [-21, -38, 15, 0.0],
  [-8, -50, 17, 1.3],
  [8, -46, 15, 2.1],
  [-14, -24, 15, 2.9],
  [3, -30, 17, 3.7],
  [15, -30, 12, 4.4],
  [-25, -20, 10, 5.2],
  [-3, -14, 13, 0.7],
  [11, -15, 10, 1.9],
  [-12, -60, 11, 2.6],
  [3, -61, 10, 3.3],
  [-27, -50, 9, 4.1],
  [18, -45, 9, 5.0],
];

/** The veins that show when he is flesh. */
const VEINS: readonly (readonly (readonly [number, number])[])[] = [
  [
    [8, -52],
    [0, -44],
    [-8, -34],
    [-12, -22],
    [-10, -9],
  ],
  [
    [0, -44],
    [-14, -47],
    [-25, -40],
  ],
  [
    [-8, -34],
    [-20, -30],
    [-29, -22],
  ],
  [
    [10, -48],
    [13, -36],
    [6, -24],
    [8, -11],
  ],
  [
    [6, -24],
    [-3, -18],
  ],
  [
    [-12, -22],
    [-21, -13],
  ],
  [
    [-4, -56],
    [-10, -64],
  ],
];

/**
 * Nyktos, der Lichtfresser - the dark in the grotto behind the cave mouth,
 * which ate the light out of every crystal in it.
 *
 * The rule: Im Licht ist er Fleisch. In the dark he is smoke, and a blade goes
 * through him - "NUR IM LICHT!", now and then, where it does. Whenever his
 * centre is inside the light of a lit crystal, he is flesh, and flesh can be
 * cut. The light he needs for that is the grotto's own: four crystals, two on
 * the floor and two on the high ledges, dark until the hero strikes one with
 * the blade. Then it shines - eight seconds, six in his second half, fading
 * over the last - and he wants it:
 *
 *   Fressen         - once a crystal has been lit 0.8 s he comes for it (the
 *                     one furthest from the hero), comes down onto it and eats
 *                     for 2.4 s: in the light, so in reach. The main window.
 *                     Seven damage in one meal and he recoils GEBLENDET onto the
 *                     floor, solid, for 2.6 s, and the crystal stays lit;
 *                     otherwise it goes dark when he is done, and stays empty
 *                     for a moment. Fed, he fights a while before he is hungry
 *                     again; blinded, he flees the light and answers with a
 *                     wave out of the dark.
 *   Hieb            - a hero standing at the crystal when he gets there is
 *                     shoved off it first (0.5 s, from over the crystal): one
 *                     heart within 60 px, and thrown clear. A parried swipe
 *                     blinds him on the spot.
 *   Schattengriff   - a hero in the dark gets a pool under his feet: it follows
 *                     him for 0.6 s, slower than he walks, holds still for
 *                     0.35, and claws come out of it. Step out.
 *   Finsterwelle    - he rises (0.6 s) and slams into the floor: a wave of dark
 *                     runs along it both ways - jump it - and puts out every
 *                     lit floor crystal it passes. The ledges keep theirs.
 *   Schattenkugeln  - his second half: three dark orbs drift at the hero and
 *                     at whatever is lit, and his next move follows straight
 *                     after them. One that reaches a lit crystal puts it out; a
 *                     swing bats one away.
 *
 * Light keeps him off: he hangs in the dark, never goes into a light except to
 * eat, and the Schattengriff cannot form in it. Nothing about him hurts that is
 * not a move - smoke is no harm to walk into, and neither is flesh that eats.
 *
 * Measured on the balance bench, with the five relics the road has handed the
 * hero by then: one who sees him 0.3 s late, swings only from the floor and
 * jumps only to dodge fells him in 41 to 48 s, four meals and three blindings,
 * for 0 to 2 of his seven hearts. One who walks up and swings fells him too -
 * the blade lights a crystal now and then by accident - but in about a minute
 * and for 14 to 16 hearts: two deaths.
 */
export class Gloom extends Enemy {
  private state: GloomState = 'dormant';
  private timer = 0;
  private floorY = 0;
  private arenaLeft = 0;
  private arenaRight = 0;
  private poiseMax = GLOOM_POISE;
  /** What has landed on him at this meal. */
  private gorge = 0;
  private phaseTwo = false;
  /** Where a blade went through him in the dark, to be said in the next update. */
  private passed: { x: number; y: number } | null = null;
  private bag: Move[] = [];
  private lastMove: Move | null = null;
  private sated = 0;
  private fear = 0;
  /** Blinded, he comes back out of the dark with the first move he can make, the wave if he can. */
  private fury = false;
  /** The orbs are out: the next move comes straight after them. */
  private chain = 0;
  /** The crystal he is going for, or eating. */
  private target = -1;
  private keepSide: 1 | -1 = 1;
  private hintTimer = 0;
  private ghostTimer = 0;
  private told = false;
  private wasSolid = false;
  /** The swipe of this meal has been let go. */
  private swung = false;
  /** Where the rise of a Finsterwelle started from. */
  private riseFrom = 0;
  /** The surface he lies on, blinded. */
  private lieY = 0;
  private readonly crystals: Crystal[] = [];
  private pool: Pool | null = null;
  private readonly waves: Wave[] = [];
  private readonly orbs: Orb[] = [];
  private readonly eyes: Eye[] = [];
  /* Animation. */
  private flesh = 0;
  private wakeT = 0;
  private hunch = 0;
  private gape = 0;
  private rise = 0;
  private squash = 0;
  private reach = 0;
  private sweep = 0;
  private heat = 0;
  private slump = 0;
  private fade = 0;
  private gulp = 0;
  private gather = 0;
  private shed = 0;

  override castLight = false;

  constructor(x: number, y: number) {
    super('gloom', x, y);
    this.w = W;
    this.h = H;
    this.hp = this.maxHp = GLOOM_HP;
    this.scoreValue = 900;
    this.aggroRange = 520;
    this.contactDamage = 0;
    this.facing = -1;
    // Every eye blinks on its own.
    let s = 1234567;
    const rnd = (): number => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
    for (const [list, head] of [
      [HEAD_EYES, true],
      [BODY_EYES, false],
    ] as const) {
      for (const [x, y, size] of list) this.eyes.push({ head, x, y, size, phase: rnd() * TAU, rate: 0.4 + rnd() * 0.9 });
    }
  }

  get phase(): 1 | 2 {
    return this.phaseTwo ? 2 : 1;
  }

  override barName(): string {
    return 'NYKTOS   ·   DER LICHTFRESSER';
  }

  override barPhase(): number {
    return this.phase;
  }

  protected override deathColor(): string {
    return '#7d6aa8';
  }

  private get haste(): number {
    return this.phaseTwo ? 0.85 : 1;
  }

  private get litTime(): number {
    return this.phaseTwo ? LIT_TIME_P2 : LIT_TIME;
  }

  /* ------------------------------------------------------------ the light */

  /** How far a crystal's light reaches right now: shrinking over its last second. */
  private reachOf(c: Crystal): number {
    if (c.lit <= 0) return 0;
    if (c.eaten) return LIGHT_R;
    return LIGHT_R * clamp(c.lit / FADE, 0, 1);
  }

  /** Whether a point is inside the light of a lit crystal. The hero's own glow is not light here. */
  private inLight(x: number, y: number): boolean {
    for (const c of this.crystals) {
      const r = this.reachOf(c);
      if (r > 0 && Math.hypot(x - c.x, y - (c.surface - 18)) < r) return true;
    }
    return false;
  }

  /**
   * The rule. Blinded he lies on the floor as flesh whatever the light; for
   * the rest, his centre decides.
   */
  get solid(): boolean {
    if (this.dead || this.state === 'dormant' || this.state === 'intro' || this.state === 'dying') return false;
    if (this.state === 'blinded') return true;
    return this.inLight(this.cx, this.cy);
  }

  /** How bright a crystal is drawn, 0 dark to 1 lit, with the flicker of its last second. */
  private glowOf(c: Crystal): number {
    if (c.lit <= 0) return 0;
    if (c.eaten) return 0.82 + Math.sin(this.anim * 9) * 0.12;
    if (c.lit < FADE) {
      const k = c.lit / FADE;
      return k * (0.7 + 0.3 * Math.abs(Math.sin(c.lit * 23)));
    }
    return 1;
  }

  /* ------------------------------------------------------------ targeting */

  /**
   * What a blade finds of him: the smoke round his middle and the head that
   * reaches out of it towards the hero. Blinded, the heap on the floor.
   */
  private hitRect(): Rect {
    if (this.state === 'blinded') return { x: this.cx - 36, y: this.bottom - 44, w: 72, h: 44 };
    return { x: this.cx - 32 + (this.facing < 0 ? -18 : 0), y: this.bottom - 68, w: 82, h: 68 };
  }

  /**
   * In the light, all of him counts. In the dark the blade goes through - and
   * so does anything thrown, which is why this answers false then instead of
   * letting a swing land on nothing: a landed swing stops the world for a
   * moment and sparks, and smoke does neither.
   */
  override overlaps(r: Rect): boolean {
    if (this.dead || this.state === 'dormant' || this.state === 'intro' || this.state === 'dying') return false;
    const body = this.hitRect();
    if (!rectsOverlap(body, r)) return false;
    if (this.solid) return true;
    this.passed = { x: clamp(r.x + r.w / 2, body.x, body.x + body.w), y: clamp(r.y + r.h / 2, body.y, body.y + body.h) };
    return false;
  }

  override hurt(amount: number, fromDir: number, world: World): void {
    if (this.dead || this.state === 'dormant' || this.state === 'intro' || this.state === 'dying') return;
    // A parry's knock reaches him without overlaps; the light decides all the same.
    if (!this.solid) return;
    this.hp -= amount;
    this.flash = 1;
    audio.play('bossHit', 1.05);
    const hx = this.cx - fromDir * 4;
    const hy = this.bottom - 34;
    world.particles.burst(hx, hy, 8, '#d8d0d6', { speed: 170, gravity: 320, size: 3 });
    world.particles.burst(hx, hy, 5, '#2a1830', { speed: 120, gravity: 420, size: 3 });
    if (this.hp <= 0) {
      this.beginDying(world);
      return;
    }
    if (!this.phaseTwo && this.hp <= this.maxHp / 2) {
      this.phaseTwo = true;
      audio.play('phase', 0.75);
      audio.play('bossRoar', 0.62);
      world.camera.addShake(6);
      for (const c of this.crystals) if (c.lit > LIT_TIME_P2) c.lit = LIT_TIME_P2;
      world.particles.burst(this.cx, this.cy, 22, 'rgba(20,10,34,0.8)', { speed: 200, gravity: -80, size: 5, shape: 'circle' });
    }
    if (this.state === 'eat' || this.state === 'swipe') {
      this.gorge += amount;
      if (this.gorge >= this.poiseMax && this.poiseLock <= 0) this.blind(world);
    }
  }

  /** A swipe caught on the hero's guard: the blade flashes in the light, into his eyes. */
  override onParried(world: World): void {
    if (this.state === 'swipe' && this.swung) this.blind(world);
  }

  private wake(world: World): void {
    this.engaged = true;
    this.poiseMax = this.sizeUpFor(world, GLOOM_POISE);
    this.state = 'intro';
    this.timer = INTRO;
    this.faceTo(world.player.cx);
    audio.play('rumble', 0.6);
    world.camera.addShake(4);
  }

  /** Starts his fall, from whatever he is doing. Ends in die and onBossFelled. */
  beginDying(world: World): void {
    if (this.dead || this.state === 'dying') return;
    this.hp = 0;
    this.state = 'dying';
    this.timer = DYING;
    this.vx = 0;
    this.vy = 0;
    this.pool = null;
    this.waves.length = 0;
    this.orbs.length = 0;
    this.target = -1;
    for (const c of this.crystals) c.eaten = false;
    audio.play('screech', 0.6);
    audio.play('bossRoar', 0.5);
    world.camera.addShake(8);
    world.hitStop(0.14);
  }

  /**
   * Only his moves hurt: the swipe at his meal (in update), the claws of the
   * pool, the waves, the orbs. The smoke itself is nothing to walk into.
   */
  override touchPlayer(world: World): void {
    const p = world.player;
    if (this.dead || p.dead || this.state === 'dormant' || this.state === 'dying') return;
    const pool = this.pool;
    if (pool && !pool.hit && this.clawsUp(pool) > 0.5 && rectsOverlap(this.clawRect(pool), p.rect)) {
      if (this.strikeHero(world, 1, sign(p.cx - pool.x) || 1)) pool.hit = true;
    }
    for (const w of this.waves) {
      if (w.hit || !rectsOverlap(this.waveRect(w), p.rect)) continue;
      if (this.strikeHero(world, 1, w.dir)) w.hit = true;
    }
    for (const o of this.orbs) {
      if (o.batted > 0 || o.life <= 0) continue;
      if (!rectsOverlap({ x: o.x - ORB_R, y: o.y - ORB_R, w: ORB_R * 2, h: ORB_R * 2 }, p.rect)) continue;
      if (this.strikeHero(world, 1, sign(o.vx) || 1)) {
        o.life = 0;
        world.particles.burst(o.x, o.y, 10, 'rgba(30,14,48,0.85)', { speed: 120, gravity: -40, size: 4, shape: 'circle' });
      }
    }
  }

  /**
   * A blow on the hero. False if it had nothing to land on: a hero still
   * reeling from the last one is left alone, and the hazard keeps its blow.
   * A roll or a guard still meets it, so a roll through counts as one.
   */
  private strikeHero(world: World, amount: number, dir: number): boolean {
    const p = world.player;
    if (p.dead) return false;
    if (p.invuln > 0 && p.dashTimer <= 0 && p.parryTimer <= 0) return false;
    p.hurt(amount, dir, world);
    return true;
  }

  /* --------------------------------------------------------------- update */

  override update(dt: number, world: World): void {
    this.updateCommon(dt);
    const p = world.player;
    if (this.arenaRight === 0) this.setUp(world);
    this.hintTimer = Math.max(0, this.hintTimer - dt);
    this.ghostTimer = Math.max(0, this.ghostTimer - dt);
    this.sated = Math.max(0, this.sated - dt);
    this.fear = Math.max(0, this.fear - dt);
    this.chain = Math.max(0, this.chain - dt);
    this.heat = Math.max(0, this.heat - dt * 2);
    this.squash = Math.max(0, this.squash - dt * 4);
    this.gulp = Math.max(0, this.gulp - dt * 3);
    this.sweep = Math.max(0, this.sweep - dt * 5);
    this.updateCrystals(dt, world);
    this.updatePool(dt, world);
    this.updateWaves(dt, world);
    this.updateOrbs(dt, world);
    if (this.passed) this.smokeThrough(world);

    let hunchTo = 0;
    let gapeTo = 0;
    let riseTo = 0;
    let reachTo = 0;
    let slumpTo = 0;
    let gatherTo = 0;
    switch (this.state) {
      case 'dormant': {
        const inside = p.cx > this.arenaLeft + 16 && p.cx < this.arenaRight - 16;
        if (inside && Math.abs(p.cx - this.cx) < this.aggroRange && !p.dead) this.wake(world);
        this.vx = 0;
        this.vy = 0;
        break;
      }

      case 'intro': {
        // Up off the floor, the eyes opening, and a scream at the one who came in.
        const before = this.timer;
        this.timer -= dt;
        this.wakeT = clamp(1 - this.timer / INTRO, 0, 1);
        if (before > 0.8 && this.timer <= 0.8) {
          audio.play('bossRoar', 0.55);
          audio.play('screech', 0.7);
          world.camera.addShake(5);
          this.heat = 1;
        }
        this.glide(this.cx, this.floorY - 70 * easeOut(this.wakeT, 2), DRIFT, dt);
        if (this.timer <= 0) this.toDrift(0.8);
        break;
      }

      case 'drift':
        this.drift(dt, world);
        break;

      case 'seek':
        this.seek(dt, world);
        hunchTo = 0.35;
        gapeTo = 0.4;
        break;

      case 'swipe': {
        // At his meal, the hero too close: an arm of smoke drawn back, and the shove.
        this.timer -= dt;
        this.hold(dt);
        hunchTo = 0.45;
        reachTo = this.swung ? 0 : 1;
        this.heat = Math.max(this.heat, 0.8);
        if (!this.swung && this.timer > SWIPE_TELL * 0.5) this.faceTo(p.cx);
        if (!this.swung && this.timer <= 0) this.letSwipe(world);
        if (this.state === 'swipe' && this.swung && this.timer <= -0.2) this.beginEat(world);
        break;
      }

      case 'eat': {
        this.timer -= dt;
        hunchTo = 1;
        gapeTo = 1;
        const c = this.crystals[this.target];
        // Down onto the crystal from where he came in - quickly, so the meal is
        // a meal in reach from its first moment - and there he stays.
        if (c) this.settle(c.x, c.surface);
        if (world.time % 0.42 < dt) {
          this.gulp = 1;
          audio.play('magic', 0.42);
        }
        if (c && world.time % 0.05 < dt) {
          // The light going into his mouth.
          const a = rand(0, TAU);
          const r = rand(14, 30);
          world.particles.spawn({
            x: c.x + Math.cos(a) * r,
            y: c.surface - 18 + Math.sin(a) * r * 0.6,
            vx: -Math.cos(a) * r * 3,
            vy: -Math.sin(a) * r * 2 - 30,
            gravity: 0,
            drag: 0.9,
            color: 'rgba(255,232,160,0.85)',
            size: rand(1.2, 2.2),
            shape: 'spark',
            life: 0.3,
          });
        }
        if (this.timer <= 0) this.finishMeal(world);
        break;
      }

      case 'blinded': {
        this.timer -= dt;
        slumpTo = 1;
        this.settle(this.cx, this.lieY);
        if (world.time % 0.3 < dt) {
          world.particles.spawn({
            x: this.cx + rand(-22, 22),
            y: this.bottom - rand(20, 36),
            vx: rand(-20, 20),
            vy: -rand(20, 50),
            gravity: -10,
            color: 'rgba(255,240,190,0.85)',
            size: rand(1.4, 2.4),
            shape: 'spark',
            life: 0.5,
          });
        }
        if (this.timer <= 0) {
          // Up and away from the light that did it, for a moment.
          this.fear = FEAR;
          this.fury = true;
          this.target = -1;
          this.toDrift(0.5);
          this.vy = -170;
          audio.play('wing', 0.55);
          audio.play('bossRoar', 1.2);
        }
        break;
      }

      case 'grip':
        // He hangs still and looks down at the pool while it works.
        this.timer -= dt;
        this.hold(dt);
        this.heat = Math.max(this.heat, 0.55);
        if (this.pool) this.faceTo(this.pool.x);
        if (this.timer <= 0) this.toDrift(rand(0.8, 1.2) * this.haste);
        break;

      case 'rise':
        this.timer -= dt;
        riseTo = 1;
        this.heat = 1;
        this.glide(this.cx, this.riseFrom - 46, 170, dt, 1400);
        if (world.time % 0.05 < dt) this.drawIn(world);
        if (this.timer <= 0) {
          this.state = 'slam';
          this.timer = 0.3;
          this.vy = 700;
          this.vx = 0;
        }
        break;

      case 'slam':
        this.timer -= dt;
        this.vx = 0;
        this.vy = Math.max(this.vy, 1150);
        riseTo = 0;
        if (this.bottom >= this.floorY - 2 || this.timer <= 0) this.impact(world);
        break;

      case 'sag':
        // Spent on the floor where he came down, smoke pouring off him.
        this.timer -= dt;
        this.glide(this.cx, this.floorY, 300, dt, 2000);
        if (world.time % 0.08 < dt) {
          world.particles.spawn({
            x: this.cx + rand(-26, 26),
            y: this.bottom - rand(6, 30),
            vx: rand(-30, 30),
            vy: -rand(10, 40),
            gravity: -30,
            color: 'rgba(12,8,22,0.7)',
            size: rand(3, 6),
            shape: 'circle',
            life: rand(0.6, 1),
          });
        }
        if (this.timer <= 0) {
          this.toDrift(rand(0.5, 0.9) * this.haste);
          this.vy = -110;
        }
        break;

      case 'gather':
        this.timer -= dt;
        this.hold(dt);
        this.heat = 1;
        gatherTo = 1;
        this.faceTo(p.cx);
        if (this.timer <= 0) this.release(world);
        break;

      case 'dying': {
        this.timer -= dt;
        this.fade = clamp(1 - this.timer / DYING, 0, 1);
        this.vx = approach(this.vx, 0, 300 * dt);
        this.vy = approach(this.vy, -24, 200 * dt);
        // The light he took goes back, crystal by crystal.
        for (const [i, c] of this.crystals.entries()) {
          if (c.lit <= 0 && this.fade > 0.18 + i * 0.16) {
            c.lit = 99;
            c.flare = 1;
            audio.play('magic', 1.1 + i * 0.12);
            world.particles.burst(c.x, c.surface - 18, 14, '#fff0b8', { speed: 160, gravity: -60, shape: 'spark' });
          }
        }
        if (world.time % 0.04 < dt) {
          world.particles.spawn({
            x: this.cx + rand(-30, 30),
            y: this.bottom - rand(10, 60),
            vx: rand(-40, 40),
            vy: -rand(40, 110),
            gravity: -40,
            color: Math.random() < 0.7 ? 'rgba(14,8,24,0.75)' : 'rgba(200,190,255,0.7)',
            size: rand(3, 6),
            shape: 'circle',
            life: rand(0.6, 1.1),
          });
        }
        if (this.timer <= 0) {
          for (const c of this.crystals) {
            world.particles.burst(c.x, c.surface - 18, 26, '#fff4c8', { speed: 190, gravity: -120, shape: 'spark' });
            world.particles.burst(c.x, c.surface - 14, 10, '#c9b26a', { speed: 120, gravity: 300, size: 3 });
          }
          this.die(world);
          world.onBossFelled('gloom', this.cx, this.y - 30);
        }
        break;
      }
    }

    this.hunch = approach(this.hunch, hunchTo, dt * 4);
    this.gape = approach(this.gape, gapeTo, dt * (gapeTo > this.gape ? 5 : 3));
    this.rise = approach(this.rise, riseTo, dt * (riseTo > this.rise ? 2.4 : 9));
    this.reach = approach(this.reach, reachTo, dt * (reachTo > this.reach ? 2.6 : 8));
    this.slump = approach(this.slump, slumpTo, dt * (slumpTo > this.slump ? 6 : 2.5));
    this.gather = approach(this.gather, gatherTo, dt * (gatherTo > this.gather ? 1.6 : 8));
    if (this.state !== 'dormant' && this.state !== 'intro') this.wakeT = 1;

    // He floats: nothing but the arena holds him.
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.x = clamp(this.x, this.arenaLeft + 6, this.arenaRight - this.w - 6);
    if (this.bottom > this.floorY) this.y = this.floorY - this.h;

    // The rule, as it is seen: flesh the moment his centre is in the light.
    const solid = this.solid;
    if (solid !== this.wasSolid && this.state !== 'dying') {
      if (solid) {
        audio.play('fuse', 0.55);
        audio.play('magic', 0.65);
        world.particles.burst(this.cx, this.cy, 16, 'rgba(230,222,228,0.85)', { speed: 150, gravity: 60, size: 3, shape: 'circle' });
        if (!this.told) {
          this.told = true;
          world.announce('IM LICHT IST ER FLEISCH', 3.6);
        }
      } else {
        audio.play('wing', 0.5);
        world.particles.burst(this.cx, this.cy, 14, 'rgba(10,6,20,0.8)', { speed: 130, gravity: -50, size: 5, shape: 'circle' });
      }
    }
    this.wasSolid = solid;
    this.flesh = approach(this.flesh, solid ? 1 : 0, dt * (solid ? 9 : 5));
    // A breath of smoke off him all the time; more of it when he is dark.
    this.shed += dt * (this.state === 'dormant' ? 4 : 14 - this.flesh * 8);
    while (this.shed > 1) {
      this.shed -= 1;
      world.particles.spawn({
        x: this.cx + rand(-24, 24),
        y: this.bottom - rand(8, 58) * (this.state === 'dormant' ? 0.4 : 1),
        vx: rand(-12, 12) - this.facing * 14,
        vy: -rand(14, 40),
        gravity: -24,
        color: 'rgba(8,5,16,0.6)',
        size: rand(3, 6),
        shape: 'circle',
        life: rand(0.6, 1.1),
        drag: 0.96,
      });
    }
  }

  /** Measures the room once: its floor, its walls, and where his four crystals stand. */
  private setUp(world: World): void {
    const arena = world.level.arenaAt(this.cx);
    this.arenaLeft = arena ? arena.left : this.cx - 560;
    this.arenaRight = arena ? arena.right : this.cx + 560;
    this.floorY = this.bottom;
    this.y = this.floorY - this.h;
    const make = (x: number, surface: number, ledge: boolean): Crystal => ({ x, surface, ledge, lit: 0, age: 0, spent: 0, eaten: false, swing: -1, flare: 0, snuff: 0 });
    // Two on the floor, a quarter of the way in from either wall.
    const width = this.arenaRight - this.arenaLeft;
    for (const k of [0.25, 0.75]) {
      const x = Math.floor((this.arenaLeft + width * k) / TILE) * TILE + TILE / 2;
      this.crystals.push(make(x, this.floorY, false));
    }
    // Two on the highest ledges: the topmost row of planks in the room, in the
    // middle of its two widest runs.
    const L = world.level;
    const tx0 = Math.ceil(this.arenaLeft / TILE);
    const tx1 = Math.floor(this.arenaRight / TILE) - 1;
    const floorRow = Math.round(this.floorY / TILE);
    for (let ty = 1; ty < floorRow - 1; ty++) {
      const runs: [number, number][] = [];
      let start = -1;
      for (let tx = tx0; tx <= tx1 + 1; tx++) {
        const plank = tx <= tx1 && L.platformAt(tx, ty);
        if (plank && start < 0) start = tx;
        if (!plank && start >= 0) {
          runs.push([start, tx - 1]);
          start = -1;
        }
      }
      if (!runs.length) continue;
      runs.sort((a, b) => b[1] - b[0] - (a[1] - a[0]));
      for (const [a, b] of runs.slice(0, 2)) this.crystals.push(make(((a + b + 1) / 2) * TILE, ty * TILE, true));
      break;
    }
    this.crystals.sort((a, b) => a.x - b.x);
  }

  private toDrift(rest: number): void {
    this.state = 'drift';
    this.timer = rest;
    this.target = -1;
  }

  private faceTo(x: number): void {
    if (Math.abs(x - this.cx) > 6) this.facing = x > this.cx ? 1 : -1;
  }

  /** Steers towards a point (his middle at tx, his bottom at tb), no faster than max. */
  private glide(tx: number, tb: number, max: number, dt: number, accel = 900): void {
    const wantVx = clamp((tx - this.cx) * 3, -max, max);
    const wantVy = clamp((tb - this.bottom) * 3, -max, max);
    this.vx = approach(this.vx, wantVx, accel * dt);
    this.vy = approach(this.vy, wantVy, accel * dt);
  }

  /**
   * Straight down onto a spot and held there: a meal or a fall that has to be
   * in reach from its first moment. The glide eases in, and eased in from his
   * perch he took a second to land - a second of every meal, measured, gone.
   */
  private settle(x: number, bottom: number): void {
    this.vx = clamp((x - this.cx) * 14, -360, 360);
    this.vy = clamp((bottom - this.bottom) * 14, -360, 360);
  }

  /** Comes to rest where he is. */
  private hold(dt: number): void {
    this.vx = approach(this.vx, 0, 1200 * dt);
    this.vy = approach(this.vy, 0, 1200 * dt);
  }

  /** The floor or plank under a point, looked for from a height. */
  private surfaceUnder(world: World, x: number, from: number): number {
    const y = from - 4;
    return Math.min(this.floorY, y + world.level.groundBelow(x, y, 8));
  }

  /* ------------------------------------------------------------- drifting */

  private drift(dt: number, world: World): void {
    const p = world.player;
    this.timer -= dt;
    this.faceTo(p.cx);
    const hungry = this.sated <= 0 && this.fear <= 0;
    if (hungry) {
      const meal = this.pickMeal(p.cx, p.bottom);
      if (meal >= 0) {
        this.beginSeek(meal);
        return;
      }
    }
    // A crystal has just come on: he turns to it and waits at the edge of its
    // light - the moment before he comes, and no move started in it.
    const fresh = hungry ? this.freshLight(p.cx) : -1;
    if (fresh >= 0) {
      const c = this.crystals[fresh];
      const side = sign(this.cx - c.x) || this.keepSide;
      const tb = c.ledge ? c.surface + 12 : this.floorY - 64;
      this.glide(c.x + side * (LIGHT_R + 34), tb, DRIFT, dt);
      this.faceTo(c.x);
      return;
    }
    // Fleeing the light that blinded him, he is quick about it: away from the
    // hero, up, and out of every light.
    if (this.fear > 0 && this.fury && this.keepSide !== (sign(this.cx - p.cx) || 1)) this.keepSide = this.keepSide > 0 ? -1 : 1;
    const spot = this.driftSpot(p.cx);
    this.glide(spot.x, spot.bottom, this.fear > 0 ? FLEE : DRIFT / this.haste, dt, this.fear > 0 ? 1600 : 900);
    if (this.timer <= 0) this.chooseMove(world);
  }

  /**
   * Where he hangs between moves: a little way off to one side of the hero,
   * out of every light, bobbing between 56 and 100 px over the floor.
   */
  private driftSpot(heroX: number): { x: number; bottom: number } {
    const lo = this.arenaLeft + W / 2 + 12;
    const hi = this.arenaRight - W / 2 - 12;
    let x = heroX + this.keepSide * KEEP;
    if (x < lo || x > hi) {
      this.keepSide = this.keepSide > 0 ? -1 : 1;
      x = heroX + this.keepSide * KEEP;
    }
    x = clamp(x, lo, hi);
    const bottom = this.floorY - (78 + Math.sin(this.anim * 0.9) * 22);
    const cy = bottom - H / 2;
    for (const c of this.crystals) {
      const r = this.reachOf(c);
      if (r <= 0) continue;
      const dy = cy - (c.surface - 18);
      const need = r + 26;
      if (Math.hypot(x - c.x, dy) < need) {
        const side = sign(x - c.x) || this.keepSide;
        x = c.x + side * (Math.sqrt(Math.max(0, need * need - dy * dy)) + 2);
      }
    }
    x = clamp(clamp(x, lo, hi), heroX - LEASH, heroX + LEASH);
    return { x, bottom };
  }

  /** The lit crystal he goes for: lit long enough, and the one furthest from the hero. */
  private pickMeal(heroX: number, heroBottom: number): number {
    let best = -1;
    let far = -1;
    for (const [i, c] of this.crystals.entries()) {
      if (c.lit <= 0 || c.eaten || c.age < EAT_DELAY || c.lit < 0.25) continue;
      if (Math.abs(c.x - heroX) > LEASH) continue;
      const d = Math.hypot(c.x - heroX, c.surface - heroBottom);
      if (d > far) {
        far = d;
        best = i;
      }
    }
    return best;
  }

  /** A crystal lit too recently to go for yet, if there is one within his reach. */
  private freshLight(heroX: number): number {
    let best = -1;
    for (const [i, c] of this.crystals.entries()) {
      if (c.lit <= 0 || c.eaten || c.age >= EAT_DELAY || Math.abs(c.x - heroX) > LEASH) continue;
      if (best < 0 || Math.abs(c.x - this.cx) < Math.abs(this.crystals[best].x - this.cx)) best = i;
    }
    return best;
  }

  private chooseMove(world: World): void {
    const p = world.player;
    const heroLit = this.inLight(p.cx, p.cy);
    const meLit = this.inLight(this.cx, this.cy);
    const allowed: Move[] = [];
    // The pool cannot form in the light, and he does not fight out of it.
    if (!heroLit && !meLit) allowed.push('grip');
    if (!meLit && p.bottom > this.floorY - 14 && Math.abs(p.cx - this.cx) > 150) allowed.push('wave');
    if (this.phaseTwo && !meLit && this.chain <= 0) allowed.push('orbs');
    if (!allowed.length) {
      this.timer = 0.3;
      return;
    }
    // Out of a blinding, he answers: the wave if he can - the crystal that
    // did it is on the floor more often than not - else what he can.
    const move = this.fury && allowed.includes('wave') ? 'wave' : this.drawMove(allowed);
    this.fury = false;
    this.chain = 0;
    this.lastMove = move;
    if (move === 'grip') this.beginGrip(world);
    else if (move === 'wave') this.beginRise();
    else this.beginGather();
  }

  /**
   * The next move of this round. A round in his first half is two grips and a
   * wave; in his second, grips, a wave and orbs. What the moment does not allow
   * waits in the bag; never the same twice running when there is a choice.
   */
  private drawMove(allowed: Move[]): Move {
    if (this.bag.length === 0) {
      this.bag = this.phaseTwo ? ['grip', 'wave', 'orbs', 'grip', 'orbs'] : ['grip', 'grip', 'wave'];
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
    }
    for (let i = this.bag.length - 1; i >= 0; i--) {
      const m = this.bag[i];
      if (allowed.includes(m) && (m !== this.lastMove || allowed.length === 1)) return this.bag.splice(i, 1)[0];
    }
    return allowed.find((m) => m !== this.lastMove) ?? allowed[0];
  }

  /* --------------------------------------------------------------- eating */

  private beginSeek(i: number): void {
    this.state = 'seek';
    this.target = i;
    this.timer = 4;
    this.heat = 1;
    audio.play('fireball', 0.4);
    audio.play('wing', 0.42);
  }

  private seek(dt: number, world: World): void {
    const c = this.crystals[this.target];
    if (!c || c.lit <= 0) {
      this.toDrift(0.4);
      return;
    }
    this.faceTo(c.x);
    this.glide(c.x, c.surface - PERCH, SEEK_SPEED / this.haste, dt, 1500);
    this.timer -= dt;
    if ((Math.abs(c.x - this.cx) < 5 && Math.abs(c.surface - PERCH - this.bottom) < 5) || this.timer <= 0) this.arrive(world);
  }

  /** Over the crystal. A hero standing at it is shoved off first; then down onto it. */
  private arrive(world: World): void {
    const c = this.crystals[this.target];
    const p = world.player;
    this.x = c.x - W / 2;
    this.y = c.surface - PERCH - H;
    this.vx = 0;
    this.vy = 0;
    this.gorge = 0;
    this.swung = false;
    c.eaten = true;
    const near = Math.abs(p.cx - c.x) < SWIPE_NEAR && p.bottom > c.surface - 60 && p.y < c.surface + 8;
    if (near) {
      this.state = 'swipe';
      this.timer = SWIPE_TELL;
      this.faceTo(p.cx);
      audio.play('tell', 1.15);
      audio.play('screech', 1.25);
    } else {
      this.beginEat(world);
    }
  }

  /** The swipe goes: one heart to a hero within its reach on the side it was drawn back. */
  private letSwipe(world: World): void {
    const p = world.player;
    this.swung = true;
    this.sweep = 1;
    audio.play('swing', 0.5);
    audio.play('wing', 0.75);
    const dx = p.cx - this.cx;
    const side = Math.sign(dx) === this.facing || Math.abs(dx) < 16;
    // It sweeps down off his perch onto whoever stands on the ground of the meal.
    const ground = this.crystals[this.target]?.surface ?? this.floorY;
    const inReach = side && Math.abs(dx) - p.w / 2 <= SWIPE_REACH && p.bottom > ground - 66 && p.y < ground + 6;
    for (let i = 0; i < 10; i++) {
      const a = -1.2 + i * 0.26;
      world.particles.spawn({
        x: this.cx + this.facing * Math.cos(a) * 44,
        y: ground - 26 + Math.sin(a) * 30,
        vx: this.facing * 140,
        vy: 40,
        gravity: 0,
        drag: 0.85,
        color: 'rgba(16,10,26,0.8)',
        size: rand(4, 6),
        shape: 'circle',
        life: 0.35,
      });
    }
    if (!inReach) return;
    const guarding = p.parryTimer > 0;
    const before = p.hp;
    this.strikeHero(world, 1, this.facing);
    // The guard only reaches what stands within sixty pixels of the hero's
    // middle; a swipe met on it can come from a little further off than that.
    if (guarding && p.parryTimer === 0 && p.parryFlash > 0.95 && this.state === 'swipe') this.blind(world);
    else if (p.hp < before) {
      // A shove, not a scratch: off the meal, boar's hide or not.
      p.vx = this.facing * SHOVE;
      p.vy = Math.min(p.vy, -200);
    }
  }

  private beginEat(world: World): void {
    const c = this.crystals[this.target];
    if (!c) {
      this.toDrift(0.4);
      return;
    }
    this.state = 'eat';
    this.timer = EAT_TIME;
    c.eaten = true;
    audio.play('beamCharge', 0.45);
    world.particles.burst(c.x, c.surface - 20, 12, '#ffe6a0', { speed: 90, gravity: -40, shape: 'spark' });
  }

  /** Done: the crystal is dark, and he is fed for a while. */
  private finishMeal(world: World): void {
    const c = this.crystals[this.target];
    if (c) {
      c.eaten = false;
      c.lit = 0;
      c.age = 0;
      c.spent = SPENT;
      c.snuff = 1;
      world.particles.burst(c.x, c.surface - 18, 18, 'rgba(12,8,22,0.85)', { speed: 120, gravity: -60, size: 5, shape: 'circle' });
    }
    this.sated = SATED;
    audio.play('rumble', 0.9);
    audio.play('fireball', 0.45);
    this.toDrift(0.7 * this.haste);
    this.vy = -130;
  }

  /** GEBLENDET: down onto the floor, flesh, and the crystal keeps its light. */
  private blind(world: World): void {
    if (this.state === 'blinded' || this.state === 'dying' || this.dead) return;
    const c = this.crystals[this.target];
    if (c) c.eaten = false;
    this.lieY = c ? c.surface : this.floorY;
    this.state = 'blinded';
    this.timer = BLIND;
    this.poiseLock = BLIND + BLIND_LOCK;
    this.gorge = 0;
    this.vx = 0;
    this.vy = 0;
    this.reach = 0;
    audio.play('screech', 0.8);
    audio.play('bossRoar', 1.45);
    world.camera.addShake(6);
    world.hitStop(0.1);
    world.particles.text(this.cx, this.bottom - 84, 'GEBLENDET!', '#fff0b0');
    world.particles.burst(this.cx, this.bottom - 40, 24, '#fff4c8', { speed: 220, gravity: 120, shape: 'spark' });
  }

  /* --------------------------------------------------------- his attacks */

  private beginGrip(world: World): void {
    const p = world.player;
    this.state = 'grip';
    this.timer = GRIP_FOLLOW + GRIP_HOLD + GRIP_CLAW + 0.25;
    this.pool = { x: p.cx, surface: this.surfaceUnder(world, p.cx, p.bottom), t: 0, hit: false };
    this.heat = 1;
    audio.play('tell', 0.72);
    audio.play('rumble', 1.1);
  }

  private updatePool(dt: number, world: World): void {
    const pool = this.pool;
    if (!pool) return;
    const p = world.player;
    const before = pool.t;
    pool.t += dt;
    if (pool.t < GRIP_FOLLOW) {
      // It follows him, slower than he walks - and it will not go into the light.
      const want = approach(pool.x, p.cx, GRIP_SPEED * dt);
      if (!this.inLight(want, pool.surface - 16) || this.inLight(pool.x, pool.surface - 16)) pool.x = want;
      pool.x = clamp(pool.x, this.arenaLeft + 20, this.arenaRight - 20);
      pool.surface = this.surfaceUnder(world, pool.x, p.bottom);
    }
    if (before < GRIP_FOLLOW && pool.t >= GRIP_FOLLOW) audio.play('blip', 0.5);
    if (before < GRIP_FOLLOW + GRIP_HOLD && pool.t >= GRIP_FOLLOW + GRIP_HOLD) {
      audio.play('swing', 0.62);
      audio.play('crumble', 1.5);
      world.particles.burst(pool.x, pool.surface - 4, 14, 'rgba(14,8,26,0.85)', { speed: 160, gravity: 200, size: 4, angle: -Math.PI / 2, spread: 1.6 });
    }
    if (pool.t > GRIP_FOLLOW + GRIP_HOLD + GRIP_CLAW + 0.35) this.pool = null;
  }

  /** How far the claws are out of the pool, 0..1. */
  private clawsUp(pool: Pool): number {
    const t = pool.t - GRIP_FOLLOW - GRIP_HOLD;
    if (t < 0) return 0;
    if (t < GRIP_CLAW) return clamp(t / 0.08, 0, 1);
    return clamp(1 - (t - GRIP_CLAW) / 0.3, 0, 1) * 0.45;
  }

  private clawRect(pool: Pool): Rect {
    const h = GRIP_H * this.clawsUp(pool);
    return { x: pool.x - GRIP_W / 2, y: pool.surface - h, w: GRIP_W, h };
  }

  private beginRise(): void {
    this.state = 'rise';
    this.timer = RISE;
    this.riseFrom = this.bottom;
    this.heat = 1;
    audio.play('tell', 0.58);
    audio.play('bossRoar', 1.5);
  }

  /** The dark pulled up into him: a breath drawn in before the slam. */
  private drawIn(world: World): void {
    const a = rand(0, TAU);
    const r = rand(40, 70);
    world.particles.spawn({
      x: this.cx + Math.cos(a) * r,
      y: this.cy + Math.sin(a) * r * 0.7,
      vx: -Math.cos(a) * r * 2.5,
      vy: -Math.sin(a) * r * 1.8,
      gravity: 0,
      drag: 0.9,
      color: 'rgba(12,6,22,0.8)',
      size: rand(3, 5),
      shape: 'circle',
      life: 0.35,
    });
  }

  /** Into the floor: the dark runs out of him both ways. */
  private impact(world: World): void {
    this.y = this.floorY - this.h;
    this.vy = 0;
    this.squash = 1;
    this.waves.push({ x: this.cx + 6, dir: 1, hit: false });
    this.waves.push({ x: this.cx - 6, dir: -1, hit: false });
    audio.play('slam', 0.62);
    audio.play('burst', 0.5);
    world.camera.addShake(6);
    world.hitStop(0.04);
    for (const dir of [-1, 1]) {
      world.particles.burst(this.cx + dir * 24, this.floorY - 6, 12, 'rgba(14,8,26,0.85)', {
        speed: 220,
        gravity: 300,
        size: 5,
        shape: 'circle',
        angle: dir > 0 ? -0.3 : Math.PI + 0.3,
        spread: 0.9,
      });
    }
    this.state = 'sag';
    this.timer = SAG;
  }

  private updateWaves(dt: number, world: World): void {
    for (const w of this.waves) {
      w.x += w.dir * WAVE_SPEED * dt;
      // What it passes on the floor goes out. The ledges are above it.
      for (const c of this.crystals) {
        if (c.ledge || c.lit <= 0 || c.eaten || Math.abs(c.x - w.x) > 12) continue;
        this.snuff(c, world);
      }
      if (world.time % 0.03 < dt) {
        world.particles.spawn({
          x: w.x - w.dir * rand(0, 16),
          y: this.floorY - rand(2, WAVE_H),
          vx: -w.dir * rand(10, 50),
          vy: -rand(20, 70),
          gravity: -20,
          color: Math.random() < 0.8 ? 'rgba(10,6,20,0.8)' : 'rgba(170,140,240,0.7)',
          size: rand(2.5, 5),
          shape: 'circle',
          life: 0.5,
        });
      }
    }
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      if (w.x < this.arenaLeft + 6 || w.x > this.arenaRight - 6) this.waves.splice(i, 1);
    }
  }

  private waveRect(w: Wave): Rect {
    return { x: w.x - WAVE_W / 2, y: this.floorY - WAVE_H, w: WAVE_W, h: WAVE_H };
  }

  private beginGather(): void {
    this.state = 'gather';
    this.timer = ORB_TELL;
    this.heat = 1;
    audio.play('tell', 1.3);
    audio.play('beamCharge', 0.55);
  }

  /** Where the orbs gather: round his head. */
  private orbSpot(i: number): { x: number; y: number } {
    const a = this.anim * 3 + (i * TAU) / 3;
    const head = this.headWorld();
    return { x: head.x + Math.cos(a) * 26, y: head.y - 10 + Math.sin(a) * 14 };
  }

  /** Three orbs: at whatever is lit, nearest first, and the rest at the hero. */
  private release(world: World): void {
    const p = world.player;
    const lit = this.crystals
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.lit > 0 && !c.eaten)
      .sort((a, b) => Math.abs(a.c.x - this.cx) - Math.abs(b.c.x - this.cx))
      .map(({ i }) => i);
    for (let i = 0; i < 3; i++) {
      const at = this.orbSpot(i);
      const target = i < 2 && i < lit.length ? lit[i] : -1;
      const tx = target >= 0 ? this.crystals[target].x : p.cx;
      const ty = target >= 0 ? this.crystals[target].surface - 18 : p.cy;
      const d = Math.hypot(tx - at.x, ty - at.y) || 1;
      this.orbs.push({ x: at.x, y: at.y, vx: ((tx - at.x) / d) * ORB_SPEED, vy: ((ty - at.y) / d) * ORB_SPEED, life: ORB_LIFE, target, batted: 0 });
    }
    audio.play('shoot', 0.55);
    audio.play('wing', 0.6);
    // And while they drift, the next move: the orbs are his second half's
    // twist, and on their own a careful hero met them one at a time.
    this.chain = 1.4;
    this.toDrift(0.35);
  }

  private updateOrbs(dt: number, world: World): void {
    const p = world.player;
    const blade = p.bladeLive ? p.swordRect() : null;
    for (const o of this.orbs) {
      o.life -= dt;
      if (o.batted > 0) {
        // Knocked away: it spins off and comes apart.
        o.batted -= dt;
        o.x += o.vx * dt;
        o.y += o.vy * dt;
        if (o.batted <= 0) {
          o.life = 0;
          world.particles.burst(o.x, o.y, 10, 'rgba(190,170,255,0.7)', { speed: 100, gravity: -20, size: 3, shape: 'circle' });
        }
        continue;
      }
      if (o.target >= 0 && this.crystals[o.target].lit <= 0) o.target = -1;
      const c = o.target >= 0 ? this.crystals[o.target] : null;
      const tx = c ? c.x : p.cx;
      const ty = c ? c.surface - 18 : p.cy;
      const d = Math.hypot(tx - o.x, ty - o.y) || 1;
      // It drifts, it does not dart: the turn is slow.
      o.vx = approach(o.vx, ((tx - o.x) / d) * ORB_SPEED, 160 * dt);
      o.vy = approach(o.vy, ((ty - o.y) / d) * ORB_SPEED, 160 * dt);
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      if (blade && rectsOverlap(blade, { x: o.x - ORB_R, y: o.y - ORB_R, w: ORB_R * 2, h: ORB_R * 2 })) {
        o.batted = 0.4;
        o.vx = p.facing * 380;
        o.vy = -70;
        audio.play('deflect', 0.7);
        world.particles.burst(o.x, o.y, 10, '#dff3ff', { speed: 150, gravity: 60, shape: 'spark' });
        continue;
      }
      for (const k of this.crystals) {
        if (k.lit <= 0 || k.eaten || Math.hypot(k.x - o.x, k.surface - 18 - o.y) > 18) continue;
        this.snuff(k, world);
        o.life = 0;
        world.particles.burst(o.x, o.y, 12, 'rgba(20,10,34,0.85)', { speed: 120, gravity: -30, size: 4, shape: 'circle' });
        break;
      }
      if (o.life <= 0 && o.life > -1) world.particles.burst(o.x, o.y, 6, 'rgba(20,10,34,0.7)', { speed: 60, gravity: -30, size: 3, shape: 'circle' });
    }
    for (let i = this.orbs.length - 1; i >= 0; i--) if (this.orbs[i].life <= 0) this.orbs.splice(i, 1);
  }

  /* ------------------------------------------------------------- crystals */

  private crystalBox(c: Crystal): Rect {
    return { x: c.x - 13, y: c.surface - 36, w: 26, h: 36 };
  }

  private updateCrystals(dt: number, world: World): void {
    const p = world.player;
    const blade = p.bladeLive && !p.dead ? p.swordRect() : null;
    for (const c of this.crystals) {
      c.flare = Math.max(0, c.flare - dt * 2.2);
      c.snuff = Math.max(0, c.snuff - dt * 1.4);
      c.spent = Math.max(0, c.spent - dt);
      if (c.lit > 0 && !c.eaten) {
        c.lit = Math.max(0, c.lit - dt);
        c.age += dt;
        if (c.lit === 0) {
          c.snuff = 0.6;
          audio.play('fuse', 0.8);
        }
      }
      if (blade && c.swing !== p.swingId && rectsOverlap(blade, this.crystalBox(c))) {
        c.swing = p.swingId;
        this.strikeCrystal(c, world);
      }
      if (c.lit > 0 && !c.eaten && world.time % 0.16 < dt) {
        world.particles.spawn({
          x: c.x + rand(-12, 12),
          y: c.surface - rand(6, 30),
          vx: rand(-8, 8),
          vy: -rand(14, 34),
          gravity: -8,
          drag: 0.98,
          color: 'rgba(255,236,170,0.8)',
          size: rand(1, 1.8),
          shape: 'circle',
          life: rand(0.9, 1.5),
        });
      }
    }
  }

  /** The blade on a crystal: it lights - unless he has it, or has just emptied it. */
  private strikeCrystal(c: Crystal, world: World): void {
    if (this.dead || this.state === 'dying' || c.eaten) return;
    const top = c.surface - 20;
    if (c.spent > 0) {
      audio.play('clank', 0.55);
      world.particles.burst(c.x, top, 6, '#6a6f86', { speed: 90, gravity: 300, shape: 'spark' });
      return;
    }
    if (c.lit > 0) {
      // Lit already: it rings, and that is all. A blade that kept topping the
      // light up kept one crystal burning for ever - measured, a hero who only
      // swung at him had a meal waiting every time he wanted one.
      audio.play('deflect', 1.4);
      world.particles.burst(c.x, top, 5, '#fff2c0', { speed: 110, gravity: 80, shape: 'spark' });
      return;
    }
    c.lit = this.litTime;
    c.age = 0;
    c.flare = 1;
    audio.play('magic', 1.3);
    audio.play('deflect', 0.72);
    world.particles.burst(c.x, top, 18, '#fff2c0', { speed: 170, gravity: 80, shape: 'spark' });
    if (!this.told && this.state !== 'dormant' && Math.hypot(c.x - this.cx, top - this.cy) < LIGHT_R + 60) {
      this.told = true;
      world.announce('IM LICHT IST ER FLEISCH', 3.6);
    }
  }

  /** Put out - by the wave or an orb. It can be struck again straight away. */
  private snuff(c: Crystal, world: World): void {
    c.lit = 0;
    c.age = 0;
    c.snuff = 1;
    audio.play('fireball', 0.55);
    world.particles.burst(c.x, c.surface - 18, 14, 'rgba(14,8,24,0.85)', { speed: 110, gravity: -50, size: 4, shape: 'circle' });
    world.particles.burst(c.x, c.surface - 18, 6, '#e8d08a', { speed: 80, gravity: 200, size: 2 });
  }

  /** A blade through him in the dark: smoke parts round it, and now and then it says why. */
  private smokeThrough(world: World): void {
    const at = this.passed;
    this.passed = null;
    if (!at || this.ghostTimer > 0) return;
    this.ghostTimer = 0.28;
    audio.play('wing', 1.15);
    world.particles.burst(at.x, at.y, 10, 'rgba(12,6,22,0.85)', { speed: 110, gravity: -40, size: 4, shape: 'circle' });
    world.particles.burst(at.x, at.y, 4, 'rgba(190,170,255,0.7)', { speed: 90, gravity: 0, shape: 'spark' });
    if (this.hintTimer <= 0) {
      this.hintTimer = HINT_EVERY;
      world.particles.text(this.cx, this.bottom - 86, 'NUR IM LICHT!', '#ffe9a8');
      // And the crystals that could give it glimmer once, so the eye goes there.
      for (const c of this.crystals) if (c.lit <= 0 && c.spent <= 0) c.flare = Math.max(c.flare, 0.5);
    }
  }

  /* ---------------------------------------------------------------- light */

  /** Roughly where his head is, in the world. */
  private headWorld(): { x: number; y: number } {
    const k = this.hunch;
    return { x: this.cx + this.facing * lerp(28, 6, k), y: this.bottom - lerp(50, 38, k) + this.slump * 22 };
  }

  override lights(): GlowLight[] {
    const out: GlowLight[] = [];
    if (this.dead || this.floorY === 0) return out;
    for (const c of this.crystals) {
      const k = this.glowOf(c);
      if (k > 0.02) {
        out.push({ x: c.x, y: c.surface - 18, radius: GLOW_R * (0.5 + 0.5 * k) + c.flare * 24, rgb: '255,222,146', strength: 0.96 * k, tint: 0.34 + c.flare * 0.1 });
      } else {
        // Dark, it still shows where it is - barely.
        out.push({ x: c.x, y: c.surface - 12, radius: 40 + c.snuff * 30 + c.flare * 50, rgb: c.flare > 0.05 ? '255,224,150' : '150,156,210', strength: 0.3 + c.flare * 0.4, tint: 0.14 + c.flare * 0.2 });
      }
    }
    if (this.fade < 0.85) {
      const head = this.headWorld();
      const awake = this.state === 'dormant' ? 0.25 : this.wakeT;
      out.push({
        x: head.x,
        y: head.y,
        radius: 34 + 26 * awake + this.heat * 24,
        rgb: '196,184,255',
        strength: (0.3 + 0.28 * awake + this.heat * 0.22) * (1 - this.fade),
        tint: 0.18 + this.heat * 0.14,
      });
    }
    if (this.pool) {
      const claws = this.clawsUp(this.pool);
      out.push({ x: this.pool.x, y: this.pool.surface - 8, radius: 62 + claws * 20, rgb: '160,120,240', strength: 0.5 + claws * 0.3, tint: 0.3 });
    }
    for (const w of this.waves) out.push({ x: w.x, y: this.floorY - 12, radius: 66, rgb: '160,120,240', strength: 0.62, tint: 0.3 });
    for (const o of this.orbs) out.push({ x: o.x, y: o.y, radius: 46, rgb: '170,130,245', strength: 0.55, tint: 0.3 });
    return out;
  }

  /* -------------------------------------------------------------- drawing */

  override draw(ctx: CanvasRenderingContext2D): void {
    if (this.floorY === 0) return;
    for (const c of this.crystals) this.drawLightEdge(ctx, c);
    for (const c of this.crystals) this.drawCrystal(ctx, c);
    this.drawPool(ctx);
    this.drawWaves(ctx);
    const lift = this.floorY - this.bottom;
    if (this.state !== 'dormant') shadow(ctx, this.cx, this.floorY, 64, 0.3 * clamp(1 - lift / 150, 0, 1));
    withHitFlash(ctx, this.flash, (ctx) => {
      ctx.save();
      ctx.translate(this.cx, this.bottom);
      ctx.scale(this.facing, 1);
      this.drawNyktos(ctx);
      ctx.restore();
    });
    if (this.state === 'eat' || this.state === 'swipe') this.drawSwallowed(ctx);
    if (this.state === 'gather') this.drawGathering(ctx);
    for (const o of this.orbs) this.drawOrb(ctx, o);
    if (this.state === 'blinded') this.drawDazzle(ctx);
  }

  /**
   * The edge of a lit crystal's light: a ring of dust where the rule ends. Only
   * the dust - a haze filled over the whole disc as well cost a fill the size
   * of the light, twice with two crystals burning, for a tint the light pass
   * already gives.
   */
  private drawLightEdge(ctx: CanvasRenderingContext2D, c: Crystal): void {
    const k = this.glowOf(c);
    if (k <= 0.05) return;
    const r = this.reachOf(c);
    const cy = c.surface - 18;
    ctx.fillStyle = `rgba(255,240,196,${(0.6 * k).toFixed(3)})`;
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * TAU + this.anim * 0.25 * (c.ledge ? -1 : 1);
      const x = c.x + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (y > c.surface - 1) continue;
      const s = i % 3 === 0 ? 2 : 1.4;
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
    }
  }

  private drawCrystal(ctx: CanvasRenderingContext2D, c: Crystal): void {
    const k = this.glowOf(c);
    const lit = Math.min(1, k + c.flare * 0.4);
    ctx.save();
    ctx.translate(c.x, c.surface);
    // The rock it grows out of.
    ctx.fillStyle = '#13111b';
    ctx.beginPath();
    ctx.ellipse(0, -1, 16, 5, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#211e2c';
    ctx.beginPath();
    ctx.ellipse(-3, -3, 10, 3, 0, Math.PI, TAU);
    ctx.fill();
    // Three shards, the tall one last.
    this.drawShard(ctx, -7, 18, 8, -0.34, lit, c.spent > 0);
    this.drawShard(ctx, 7, 15, 7, 0.4, lit, c.spent > 0);
    this.drawShard(ctx, 0, 31, 10, 0.03, lit, c.spent > 0);
    ctx.globalCompositeOperation = 'lighter';
    if (lit > 0.02) {
      glow(ctx, 0, -16, 18 + 8 * lit + c.flare * 14, `rgba(255,228,150,${(0.4 * lit).toFixed(3)})`);
      // Glints that travel up the shards.
      for (let i = 0; i < 3; i++) {
        const t = (this.anim * 0.7 + i / 3) % 1;
        const gx = [-7, 0, 7][i] + Math.sin(i * 2 + this.anim) * 1.5;
        const gy = -4 - t * [16, 28, 13][i];
        ctx.fillStyle = `rgba(255,255,236,${(lit * (1 - t) * 0.9).toFixed(3)})`;
        ctx.fillRect(gx - 0.8, gy - 2.2, 1.6, 4.4);
        ctx.fillRect(gx - 2.2, gy - 0.8, 4.4, 1.6);
      }
    } else {
      // Asleep in it, a seed of what it held: enough to say "strike here".
      const pulse = 0.5 + 0.5 * Math.sin(this.anim * 1.6 + c.x * 0.01);
      const seed = c.spent > 0 ? 0.04 : 0.12 + pulse * 0.1;
      glow(ctx, 0, -14, 9, `rgba(255,214,140,${seed.toFixed(3)})`);
    }
    if (c.flare > 0) {
      ctx.strokeStyle = `rgba(255,244,200,${(c.flare * 0.8).toFixed(3)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -16, 12 + (1 - c.flare) * 46, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
    if (c.spent > 0) {
      // Emptied: a thread of smoke still coming out of it.
      ctx.save();
      ctx.strokeStyle = `rgba(30,20,44,${(0.5 * Math.min(1, c.spent / 0.8)).toFixed(3)})`;
      ctx.lineCap = 'round';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(c.x, c.surface - 30);
      ctx.quadraticCurveTo(c.x + Math.sin(this.anim * 3) * 6, c.surface - 42, c.x + Math.sin(this.anim * 2) * 4, c.surface - 54);
      ctx.stroke();
      ctx.restore();
    }
  }

  /** One shard of a crystal: a six-sided prism standing on its base, dark slate or pale gold. */
  private drawShard(ctx: CanvasRenderingContext2D, dx: number, h: number, w: number, tilt: number, lit: number, spent: boolean): void {
    ctx.save();
    ctx.translate(dx, -2);
    ctx.rotate(tilt);
    const hw = w / 2;
    const dark = spent ? [22, 20, 30] : [30, 34, 52];
    const pale = [246, 220, 142];
    const side = mixRgb(dark, pale, lit);
    const face = mixRgb(spent ? [30, 28, 40] : [46, 52, 76], [255, 247, 214], lit);
    const edge = mixRgb(spent ? [52, 50, 64] : [86, 96, 132], [255, 255, 240], lit);
    ctx.fillStyle = side;
    ctx.beginPath();
    ctx.moveTo(-hw, 0);
    ctx.lineTo(-hw, -h * 0.7);
    ctx.lineTo(0, -h);
    ctx.lineTo(hw, -h * 0.7);
    ctx.lineTo(hw, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = face;
    ctx.beginPath();
    ctx.moveTo(-hw * 0.2, 0);
    ctx.lineTo(-hw * 0.2, -h * 0.74);
    ctx.lineTo(0, -h);
    ctx.lineTo(-hw, -h * 0.7);
    ctx.lineTo(-hw, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(-hw, -h * 0.7);
    ctx.lineTo(0, -h);
    ctx.lineTo(hw, -h * 0.7);
    ctx.stroke();
    if (spent) {
      ctx.strokeStyle = 'rgba(8,6,12,0.9)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(-hw * 0.6, -h * 0.25);
      ctx.lineTo(hw * 0.1, -h * 0.45);
      ctx.lineTo(-hw * 0.2, -h * 0.62);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** The Schattengriff: the pool, and the claws out of it. */
  private drawPool(ctx: CanvasRenderingContext2D): void {
    const pool = this.pool;
    if (!pool) return;
    const t = pool.t;
    const grow = clamp(t / 0.25, 0, 1);
    const held = t >= GRIP_FOLLOW;
    const end = t > GRIP_FOLLOW + GRIP_HOLD + GRIP_CLAW ? clamp(1 - (t - GRIP_FOLLOW - GRIP_HOLD - GRIP_CLAW) / 0.35, 0, 1) : 1;
    const rx = (24 + (held ? 8 : 4 * Math.sin(t * 12))) * grow;
    ctx.save();
    ctx.translate(pool.x, pool.surface);
    ctx.globalAlpha = end;
    ctx.fillStyle = 'rgba(3,1,7,0.94)';
    ctx.beginPath();
    ctx.ellipse(0, -1, rx, 5.5 * grow, 0, 0, TAU);
    ctx.fill();
    // The edge churns while it follows; once it stops, it beats.
    const beat = held ? 0.65 + 0.35 * Math.abs(Math.sin(t * 22)) : 0.38;
    ctx.strokeStyle = `rgba(168,128,250,${beat.toFixed(3)})`;
    ctx.lineWidth = held ? 2 : 1.4;
    ctx.beginPath();
    ctx.ellipse(0, -1, rx + 1, 6 * grow, 0, 0, TAU);
    ctx.stroke();
    // His eyes in it, looking up.
    ctx.fillStyle = 'rgba(236,228,255,0.85)';
    for (let i = 0; i < 4; i++) {
      const ex = (-12 + i * 8 + Math.sin(t * 5 + i) * 2) * grow;
      ctx.fillRect(ex - 0.8, -2 + (i % 2), 1.6, 1.4);
    }
    const up = this.clawsUp(pool);
    if (up > 0) {
      // Four claws, bone-pale out of a black root, curling in over the middle:
      // a hand closing on whoever stayed.
      for (let i = 0; i < 4; i++) {
        const bx = [-21, -8, 7, 20][i];
        const hgt = GRIP_H * up * [0.8, 1, 0.95, 0.78][i];
        const hook = bx < 0 ? 1 : -1;
        const g = ctx.createLinearGradient(0, 0, 0, -hgt);
        g.addColorStop(0, '#0b0712');
        g.addColorStop(0.45, '#4a3d5e');
        g.addColorStop(1, '#e2d8ee');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(bx - 4.5, 0);
        ctx.quadraticCurveTo(bx - 5 - hook, -hgt * 0.55, bx + hook * 3, -hgt);
        ctx.quadraticCurveTo(bx + hook * 8, -hgt * 0.9, bx + hook * 6.5, -hgt * 0.72);
        ctx.quadraticCurveTo(bx + 1.5, -hgt * 0.45, bx + 4.5, 0);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(196,166,255,0.75)';
        ctx.lineWidth = 1.1;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** The Finsterwelle: a low rolling crest of dark along the floor, rimmed in violet. */
  private drawWaves(ctx: CanvasRenderingContext2D): void {
    for (const w of this.waves) {
      const y = this.floorY;
      ctx.save();
      ctx.translate(w.x, y);
      ctx.scale(w.dir, 1);
      // What it leaves behind: a smear of dark along the floor.
      const g = ctx.createLinearGradient(-60, 0, 0, 0);
      g.addColorStop(0, 'rgba(6,3,12,0)');
      g.addColorStop(1, 'rgba(6,3,12,0.75)');
      ctx.fillStyle = g;
      ctx.fillRect(-60, -6, 60, 6);
      const wob = Math.sin(this.anim * 18 + w.x * 0.05) * 1.5;
      ctx.fillStyle = '#07040d';
      ctx.beginPath();
      ctx.moveTo(-22, 0);
      ctx.quadraticCurveTo(-12, -WAVE_H * 0.7, 2, -WAVE_H - wob);
      ctx.quadraticCurveTo(10, -WAVE_H * 0.8, 14, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(176,140,255,0.75)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-14, -WAVE_H * 0.55);
      ctx.quadraticCurveTo(-6, -WAVE_H * 0.95, 2, -WAVE_H - wob);
      ctx.quadraticCurveTo(9, -WAVE_H * 0.8, 12, -WAVE_H * 0.3);
      ctx.stroke();
      ctx.fillStyle = 'rgba(236,228,255,0.9)';
      ctx.fillRect(1, -WAVE_H * 0.6, 1.6, 1.4);
      ctx.fillRect(-6, -WAVE_H * 0.4, 1.4, 1.2);
      ctx.restore();
    }
  }

  private drawOrb(ctx: CanvasRenderingContext2D, o: Orb): void {
    const batted = o.batted > 0;
    const k = batted ? clamp(o.batted / 0.4, 0, 1) : clamp(o.life / 0.4, 0, 1);
    const r = ORB_R * (batted ? 0.6 + 0.4 * k : 1) * Math.min(1, k * 2);
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, 0, 0, r * 2.4, `rgba(150,110,240,${(0.35 * k).toFixed(3)})`);
    ctx.globalCompositeOperation = 'source-over';
    ctx.rotate(this.anim * (batted ? 14 : 3));
    ctx.fillStyle = '#08040f';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = `rgba(180,150,255,${(0.7 * k).toFixed(3)})`;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0.2, 2.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.55, 3.2, 4.9);
    ctx.stroke();
    ctx.restore();
    if (!batted) {
      // One pale eye in each, looking where it goes.
      const d = Math.hypot(o.vx, o.vy) || 1;
      ctx.fillStyle = '#f2ecff';
      ctx.beginPath();
      ctx.arc(o.x + (o.vx / d) * r * 0.45, o.y + (o.vy / d) * r * 0.45, 1.8, 0, TAU);
      ctx.fill();
    }
  }

  /** The orbs forming round his head during the tell. */
  private drawGathering(ctx: CanvasRenderingContext2D): void {
    const k = this.gather;
    for (let i = 0; i < 3; i++) {
      const at = this.orbSpot(i);
      const r = ORB_R * k;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, at.x, at.y, r * 2.6 + 4, `rgba(150,110,240,${(0.4 * k).toFixed(3)})`);
      ctx.restore();
      ctx.fillStyle = '#08040f';
      ctx.beginPath();
      ctx.arc(at.x, at.y, r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = `rgba(180,150,255,${(0.6 * k).toFixed(3)})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }

  /** The crystal's light, seen through the flesh it is going into. */
  private drawSwallowed(ctx: CanvasRenderingContext2D): void {
    const c = this.crystals[this.target];
    if (!c) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, c.x, c.surface - 22, 30 + this.gulp * 10, `rgba(255,214,130,${(0.18 + this.gulp * 0.16).toFixed(3)})`);
    glow(ctx, c.x, c.surface - 24, 11, `rgba(255,246,210,${(0.22 + this.gulp * 0.22).toFixed(3)})`);
    ctx.restore();
  }

  /** Blinded: points of light stuck in him, wheeling. */
  private drawDazzle(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const a = this.anim * 3.6 + (i * TAU) / 5;
      const x = this.cx + Math.cos(a) * 30;
      const y = this.bottom - 48 + Math.sin(a) * 7;
      const s = 2.4 + (Math.sin(a) > 0 ? 0.9 : 0);
      ctx.fillStyle = i % 2 ? 'rgba(255,236,170,0.95)' : 'rgba(255,252,230,0.95)';
      ctx.fillRect(x - s, y - 0.7, s * 2, 1.4);
      ctx.fillRect(x - 0.7, y - s, 1.4, s * 2);
    }
    ctx.restore();
  }

  /** The puffs of his body for this frame: breathing, shifting, squashed to the pose. */
  private puffs(sx: number, sy: number, lean: number): { x: number; y: number; r: number }[] {
    const t = this.anim;
    return PUFFS.map(([x, y, r, ph]) => ({
      x: x * sx + Math.sin(t * 1.3 + ph) * 2.2 + lean * (-y / 60),
      y: y * sy + Math.cos(t * 1.1 + ph * 1.7) * 1.8,
      r: r * (0.94 + Math.sin(t * 2 + ph) * 0.06) * ((sx + sy) / 2),
    }));
  }

  /** Nyktos himself, in his own space: facing right, his bottom at the origin. */
  private drawNyktos(ctx: CanvasRenderingContext2D): void {
    const awake = this.wakeT;
    const fl = this.flesh;
    const gone = 1 - this.fade;
    const sy = lerp(0.36, 1, awake) * (1 - this.slump * 0.42) * (1 + this.rise * 0.16) * (1 - this.squash * 0.28);
    const sx = lerp(1.5, 1, awake) * (1 + this.slump * 0.3) * (1 - this.rise * 0.08) * (1 + this.squash * 0.22);
    const lean = this.hunch * 7;
    const puffs = this.puffs(sx, sy, lean);
    // How far down the veil of smoke under him can trail before it meets the floor.
    const down = this.state === 'eat' || this.state === 'swipe' || this.state === 'blinded' || this.state === 'dormant' ? 0 : this.floorY - this.bottom;
    if (this.fade > 0) ctx.translate(0, -this.fade * 10);
    this.drawVeil(ctx, sx, sy, fl, gone, down);
    if (fl < 0.99) this.drawSmoke(ctx, puffs, (1 - fl) * gone, sy);
    if (fl > 0.01) this.drawFlesh(ctx, puffs, fl * gone, sy);
    if (this.reach > 0.02 || this.sweep > 0.02) this.drawArm(ctx, fl, gone);
    const head = this.headPose(sx, sy);
    this.drawHead(ctx, head, fl, gone);
    this.drawEyes(ctx, head, sx, sy, fl, awake, gone);
  }

  /**
   * What he trails instead of legs: a ragged veil of smoke, wisps of every
   * length streaming back from under him and thinning as they go. Over a meal
   * it spreads along the floor; before the slam it is drawn up into him.
   */
  private drawVeil(ctx: CanvasRenderingContext2D, sx: number, sy: number, fl: number, gone: number, down: number): void {
    const t = this.anim;
    const pull = Math.max(this.rise, this.slump * 0.8);
    const spread = Math.max(this.hunch, this.slump);
    // Going forward, it streams out behind him.
    const trail = clamp((this.vx * this.facing) / 150, -1, 1);
    // Ring by ring down the wisps, each ring one path: 7 wisps, 5 puffs each.
    for (let k = 1; k <= 5; k++) {
      const u = k / 5;
      const r = lerp(5.5, 1.6, u) * (1 - spread * 0.3);
      const smoke = new Path2D();
      const flesh = new Path2D();
      for (let i = 0; i < 7; i++) {
        const rx = (-21 + i * 7) * sx;
        const ry = (-14 + Math.abs(i - 3) * 1.5) * sy;
        const len = (16 + ((i * 5) % 4) * 6) * (1 - pull * 0.75) * lerp(0.3, 1, this.wakeT);
        const sway = Math.sin(t * 2.2 + i * 1.3 - u * 2.5) * 5 * u;
        const x = rx + sway - (6 + trail * 10) * u * u + spread * rx * 0.9 * u;
        const y = Math.min(lerp(ry + len * u, ry + 2 * u, spread), down - 2);
        smoke.moveTo(x + r, y);
        smoke.arc(x, y, r, 0, TAU);
        flesh.moveTo(x + r * 0.72, y);
        flesh.arc(x, y, r * 0.72, 0, TAU);
      }
      if (fl < 0.99) {
        ctx.fillStyle = `rgba(7,4,13,${((1 - u * 0.7) * 0.9 * (1 - fl) * gone).toFixed(3)})`;
        ctx.fill(smoke);
      }
      if (fl > 0.01) {
        // As flesh, they are thin grey feelers with dark ends.
        ctx.fillStyle = u > 0.7 ? `rgba(46,32,52,${(fl * gone).toFixed(3)})` : `rgba(124,112,128,${(fl * gone).toFixed(3)})`;
        ctx.fill(flesh);
      }
    }
  }

  /** One path of every puff, grown or shrunk: a layer of him, filled in one go. */
  private puffPath(ctx: CanvasRenderingContext2D, puffs: { x: number; y: number; r: number }[], k: number, add = 0, dx = 0, dy = 0): void {
    ctx.beginPath();
    for (const p of puffs) {
      const r = p.r * k + add;
      ctx.moveTo(p.x + dx * p.r + r, p.y + dy * p.r);
      ctx.arc(p.x + dx * p.r, p.y + dy * p.r, r, 0, TAU);
    }
  }

  /**
   * Smoke: soft at the edge and black at the heart, so it reads as something
   * that has no surface - and a faint violet rim along the top of the whole
   * mass, so the black still has a shape against black rock. Each layer is one
   * path: a gradient per puff cost a millisecond and a half a frame.
   */
  private drawSmoke(ctx: CanvasRenderingContext2D, puffs: { x: number; y: number; r: number }[], alpha: number, sy: number): void {
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    for (const [k, colour] of [
      [1.42, 'rgba(26,18,48,0.3)'],
      [1.16, 'rgba(12,8,24,0.6)'],
      [0.8, '#05030a'],
    ] as const) {
      ctx.fillStyle = colour;
      this.puffPath(ctx, puffs, k);
      ctx.fill();
    }
    // Depth: the heart of the smoke is a breath lighter than its skin.
    const g = ctx.createRadialGradient(-6, -44 * sy, 2, -4, -38 * sy, 30);
    g.addColorStop(0, 'rgba(52,40,86,0.55)');
    g.addColorStop(1, 'rgba(52,40,86,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(-4, -38 * sy, 30, 0, TAU);
    ctx.fill();
    // The rim: only the topmost puffs, where light from above would catch.
    ctx.strokeStyle = 'rgba(176,156,240,0.3)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (const p of puffs) {
      if (p.y > -46 * sy) continue;
      const a0 = Math.PI * 1.12;
      ctx.moveTo(p.x + Math.cos(a0) * p.r * 1.05, p.y + Math.sin(a0) * p.r * 1.05);
      ctx.arc(p.x, p.y, p.r * 1.05, a0, Math.PI * 1.7);
    }
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Flesh: the same lumps, grey and slack, a dark skin round them, lit from
   * above and gone dark underneath, mottled and veined - the smoke made into
   * something a blade can open.
   */
  private drawFlesh(ctx: CanvasRenderingContext2D, puffs: { x: number; y: number; r: number }[], alpha: number, sy: number): void {
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#20151f';
    this.puffPath(ctx, puffs, 1, 1.6);
    ctx.fill();
    this.puffPath(ctx, puffs, 1);
    const body = ctx.createLinearGradient(0, -70 * sy, 0, 0);
    body.addColorStop(0, '#988d99');
    body.addColorStop(0.55, '#7a6f7e');
    body.addColorStop(1, '#43384b');
    ctx.fillStyle = body;
    ctx.fill();
    ctx.clip();
    // The top of every lump catches the light; the mottling sits in the skin.
    ctx.fillStyle = 'rgba(190,180,186,0.55)';
    this.puffPath(ctx, puffs, 0.52, 0, -0.32, -0.38);
    ctx.fill();
    ctx.fillStyle = 'rgba(214,206,210,0.45)';
    this.puffPath(ctx, puffs, 0.24, 0, -0.4, -0.5);
    ctx.fill();
    ctx.fillStyle = 'rgba(60,44,66,0.3)';
    ctx.beginPath();
    for (const [i, p] of puffs.entries()) {
      const x = p.x + ((i * 5) % 7) - 3;
      const y = p.y + ((i * 3) % 5) + 2;
      ctx.moveTo(x + p.r * 0.16, y);
      ctx.arc(x, y, p.r * 0.16, 0, TAU);
    }
    ctx.fill();
    // The veins - and while he eats, the light running in them.
    const eating = this.state === 'eat' ? 0.5 + this.gulp * 0.5 : 0;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [pass, colour, width] of [
      [0, 'rgba(48,24,50,0.85)', 1.4],
      [1, `rgba(255,214,120,${(eating * 0.9).toFixed(3)})`, 0.9],
    ] as const) {
      if (pass === 1 && eating <= 0) continue;
      ctx.strokeStyle = colour;
      ctx.lineWidth = width;
      ctx.beginPath();
      for (const vein of VEINS) {
        for (const [i, [vx, vy]] of vein.entries()) {
          const x = vx + this.hunch * 7 * (-vy / 60);
          const y = vy * sy + Math.sin(this.anim * 1.1 + i) * 0.6;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  /** The arm of the swipe: drawn back over him in the tell, flung forward when it goes. */
  private drawArm(ctx: CanvasRenderingContext2D, fl: number, gone: number): void {
    const sh = { x: 12, y: -40 };
    const rest = { x: 30, y: -30 };
    const back = { x: -6, y: -88 };
    // Down off the perch to the chest of a hero on the floor under it.
    const fwd = { x: 60, y: 26 };
    let tip: { x: number; y: number };
    if (this.swung) {
      const u = easeOut(1 - this.sweep, 2);
      tip = { x: lerp(back.x, fwd.x, u), y: lerp(back.y, fwd.y, u) };
    } else {
      const k = easeOut(this.reach, 2);
      tip = { x: lerp(rest.x, back.x, k) + Math.sin(this.anim * 30) * k, y: lerp(rest.y, back.y, k) };
    }
    const mid = { x: (sh.x + tip.x) / 2 + 10, y: (sh.y + tip.y) / 2 - 8 };
    ctx.save();
    ctx.lineCap = 'round';
    const dark = `rgba(8,5,15,${((1 - fl) * gone).toFixed(3)})`;
    const pale = `rgba(150,138,152,${(fl * gone).toFixed(3)})`;
    for (const [colour, w] of [
      ['rgba(64,48,104,0.35)', 13],
      [dark, 10],
      [pale, 8],
    ] as const) {
      ctx.strokeStyle = colour;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(sh.x, sh.y);
      ctx.quadraticCurveTo(mid.x, mid.y, tip.x, tip.y);
      ctx.stroke();
    }
    // Three hooked claws at the end of it, pale: they have to be seen coming.
    const ang = Math.atan2(tip.y - mid.y, tip.x - mid.x);
    for (let i = -1; i <= 1; i++) {
      const a = ang + i * 0.42;
      ctx.strokeStyle = `rgba(236,228,250,${(0.92 * gone).toFixed(3)})`;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(tip.x, tip.y);
      ctx.quadraticCurveTo(tip.x + Math.cos(a) * 10, tip.y + Math.sin(a) * 10, tip.x + Math.cos(a + 0.9) * 13, tip.y + Math.sin(a + 0.9) * 13);
      ctx.stroke();
    }
    if (this.swung && this.sweep > 0.05) {
      // The streak it leaves through the air.
      ctx.strokeStyle = `rgba(220,210,255,${(this.sweep * 0.6).toFixed(3)})`;
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(12, -30, 48 + i * 7, -1.4, 1.0);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** Where the head is in this pose: its root, its angle, its length and its mouth. */
  private headPose(sx: number, sy: number): { bx: number; by: number; a: number; len: number; mouth: number } {
    const awake = this.wakeT;
    const idle = 0.28 + Math.sin(this.anim * 1.4) * 0.07;
    let a = lerp(0.04, idle, awake);
    a = lerp(a, 1.95, this.hunch);
    a -= this.rise * 0.6;
    a = lerp(a, 0.7, this.slump);
    const bx = lerp(12, 9, this.hunch) * sx;
    const by = lerp(-50, -56, this.hunch) * sy;
    const len = lerp(lerp(30, 40, awake), 27, this.hunch);
    const mouth = 5 + this.gape * 8 + this.rise * 4 + this.gulp * 1.5;
    return { bx, by, a, len, mouth };
  }

  /** The skull's outline in its own space: a brow, a long falling snout, a sunken cheek. */
  private headPath(ctx: CanvasRenderingContext2D, len: number): void {
    ctx.beginPath();
    ctx.moveTo(-8, -9);
    ctx.quadraticCurveTo(0, -16.5, 11, -12.5);
    ctx.quadraticCurveTo(16, -10.5, 20, -9);
    ctx.quadraticCurveTo(len * 0.7, -6.5, len, -3.6);
    ctx.quadraticCurveTo(len + 2.5, -2.5, len + 2.5, 0);
    ctx.quadraticCurveTo(len + 2.5, 2.5, len, 3.6);
    ctx.quadraticCurveTo(len * 0.66, 5, 24, 5.5);
    ctx.lineTo(20, 7.5);
    ctx.quadraticCurveTo(12, 4.5, 8, 9);
    ctx.quadraticCurveTo(0, 11.5, -8, 9);
    ctx.closePath();
  }

  /** The long gaunt head, and the round mouth at the end of it. */
  private drawHead(ctx: CanvasRenderingContext2D, head: { bx: number; by: number; a: number; len: number; mouth: number }, fl: number, gone: number): void {
    const { len, mouth } = head;
    ctx.save();
    ctx.translate(head.bx, head.by);
    ctx.rotate(head.a);
    if (fl < 0.99) {
      ctx.globalAlpha = (1 - fl) * gone;
      ctx.strokeStyle = 'rgba(64,48,104,0.32)';
      ctx.lineWidth = 6;
      this.headPath(ctx, len);
      ctx.stroke();
      ctx.fillStyle = '#05030a';
      ctx.fill();
      // The ridge of the skull, catching what light there is.
      ctx.strokeStyle = 'rgba(180,160,244,0.5)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-5, -11.5);
      ctx.quadraticCurveTo(0, -16, 11, -12.2);
      ctx.quadraticCurveTo(16, -10.2, 20, -8.7);
      ctx.quadraticCurveTo(len * 0.7, -6.2, len - 1, -3.6);
      ctx.stroke();
    }
    if (fl > 0.01) {
      ctx.globalAlpha = fl * gone;
      ctx.strokeStyle = '#20151f';
      ctx.lineWidth = 3.2;
      this.headPath(ctx, len);
      ctx.stroke();
      const g = ctx.createLinearGradient(0, -12, 0, 9);
      g.addColorStop(0, '#b6acb1');
      g.addColorStop(0.55, '#827786');
      g.addColorStop(1, '#43384c');
      ctx.fillStyle = g;
      ctx.fill();
      // Bone under thin skin: the brow, ridges down the snout, the hollow cheek.
      ctx.strokeStyle = 'rgba(46,26,48,0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const x of [len * 0.55, len * 0.7, len * 0.84]) {
        const top = -9 + ((x - 20) / Math.max(1, len - 20)) * 5;
        ctx.moveTo(x, top + 0.6);
        ctx.quadraticCurveTo(x + 1.2, top + 3, x + 0.4, top + 5);
      }
      ctx.moveTo(14, 5);
      ctx.quadraticCurveTo(18, 2, 24, 3.5);
      ctx.stroke();
    }
    // The socket the eyes crowd round: a hollow in either state.
    ctx.globalAlpha = gone;
    ctx.fillStyle = fl > 0.5 ? '#2a1726' : '#000000';
    ctx.beginPath();
    ctx.ellipse(13, -4, 6.5, 4.5, -0.15, 0, TAU);
    ctx.fill();
    // The mouth: a lamprey's round disc, ringed with teeth, wide open to eat.
    ctx.translate(len + 1.5, 0);
    ctx.fillStyle = fl > 0.5 ? '#3a2232' : '#120a14';
    ctx.beginPath();
    ctx.ellipse(0, 0, mouth * 0.45, mouth, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = fl > 0.5 ? 'rgba(32,18,30,0.9)' : 'rgba(176,156,240,0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#040106';
    ctx.beginPath();
    ctx.ellipse(0.5, 0, mouth * 0.28, mouth * 0.62, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = fl > 0.5 ? '#efe6d8' : 'rgba(232,224,244,0.9)';
    const teeth = 12;
    for (let i = 0; i < teeth; i++) {
      const ang = (i / teeth) * TAU;
      const ox = Math.cos(ang) * mouth * 0.45;
      const oy = Math.sin(ang) * mouth;
      const ix = Math.cos(ang) * mouth * 0.24;
      const iy = Math.sin(ang) * mouth * 0.56;
      const px = -Math.sin(ang) * 1.2;
      const py = Math.cos(ang) * 1.2;
      ctx.beginPath();
      ctx.moveTo(ox + px, oy + py);
      ctx.lineTo(ox - px, oy - py);
      ctx.lineTo(ix, iy);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  private drawEyes(
    ctx: CanvasRenderingContext2D,
    head: { bx: number; by: number; a: number; len: number },
    sx: number,
    sy: number,
    fl: number,
    awake: number,
    gone: number,
  ): void {
    const t = this.anim;
    const cos = Math.cos(head.a);
    const sin = Math.sin(head.a);
    const stretch = head.len / 40;
    const blinded = this.state === 'blinded';
    ctx.save();
    for (const [i, e] of this.eyes.entries()) {
      // Dying, they go out one by one.
      if (this.fade > 0 && this.fade > 0.1 + (i / this.eyes.length) * 0.8) continue;
      let x: number;
      let y: number;
      if (e.head) {
        const hx = e.x <= 18 ? e.x : 18 + (e.x - 18) * stretch;
        x = head.bx + hx * cos - e.y * sin;
        y = head.by + hx * sin + e.y * cos;
      } else {
        x = e.x * sx + this.hunch * 7 * (-e.y / 60) + Math.sin(t * 1.3 + e.phase) * 1.2;
        y = e.y * sy + Math.cos(t + e.phase) * 0.8;
      }
      const shut = blinded || Math.sin(t * e.rate + e.phase) > 0.97 || awake < 0.5 + (e.phase / TAU) * 0.5;
      if (shut) {
        ctx.strokeStyle = `rgba(200,190,230,${(0.4 * gone).toFixed(3)})`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(x - e.size, y);
        ctx.lineTo(x + e.size, y);
        ctx.stroke();
        continue;
      }
      const r = e.size * (1 + this.heat * 0.45) * (fl > 0.5 ? 0.8 : 1);
      if (fl > 0.5) {
        // In the light: wet beads, squinting against it.
        ctx.fillStyle = 'rgba(36,18,32,0.95)';
        ctx.beginPath();
        ctx.arc(x, y, r + 0.9, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#fff1e2';
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * 0.55, 0, 0, TAU);
        ctx.fill();
      } else {
        if (e.size > 1.25) {
          ctx.globalCompositeOperation = 'lighter';
          glow(ctx, x, y, r * 3.4, `rgba(200,188,255,${((0.34 + this.heat * 0.32) * gone).toFixed(3)})`);
          ctx.globalCompositeOperation = 'source-over';
        }
        ctx.fillStyle = `rgba(248,244,255,${gone.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

/** A colour between two, as a css rgb(). */
function mixRgb(a: readonly number[], b: readonly number[], t: number): string {
  const k = clamp(t, 0, 1);
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * k)},${Math.round(a[1] + (b[1] - a[1]) * k)},${Math.round(a[2] + (b[2] - a[2]) * k)})`;
}
