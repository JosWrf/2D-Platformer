import { audio } from '../core/audio';
import { Rect, TAU, approach, clamp, easeOut, lerp, rand, rectsOverlap, sign } from '../core/math';
import { glow, shadow } from '../render/sprites';
import type { World } from '../world/context';
import { Enemy, type GlowLight } from './enemy';
import { Projectile } from './projectile';

/**
 * Health before the hero is sized up: 230, which the relics of the road make
 * about 385. He was given 48 at first, and the reading bot felled him in 17 s,
 * before he had wound himself twice: his legs are always in reach, and by the
 * clock tower every swing also throws the water crescent and every finisher
 * carries the ember - about eight damage a second while in reach, and a hero
 * who reads him is in reach four fifths of the fight. At 150 the same bot
 * needed 40 s; at 190, 47 to 59 - and a hero who never stopped swinging at his
 * legs had him down in 41 s, having seen six moves. Each move is a bar of
 * warning and a bar of blows: what the clock has to show is moves, and 230
 * gives him one or two more of them - at 215 that hero still walked out of
 * the tower with a heart to spare as often as not.
 */
const CLOCK_HP = 230;
/**
 * The beat. 120 to the minute, the tempo of his music, and everything he does
 * lands on one of these. From half health on it quickens to 0.4 s: the bar,
 * and with it every warning, goes from 2 s to 1.6 s.
 */
const BEAT = 0.5;
const BEAT_FAST = 0.4;
/** Moves between two windings. */
const MOVES_PER_WIND = 3;
/**
 * Seconds he stands winding himself, glass up, not ticking, taking double: a
 * hero at his legs lands about 35 in it, a ninth of him.
 */
const WIND_TIME = 2.5;
/** Seconds a parried pendulum holds him up - at normal damage. */
const JAM_TIME = 1.8;
const W = 84;
const H = 120;
/** The pendulum's pivot, above the floor. */
const PIVOT_Y = 46;
/**
 * How far out the pendulum sweeps either way, from his middle. Up at the ends
 * of its swing it rides over a hero's head, so it catches one standing up to
 * about 210 px off, centre to centre, and never one on a plank.
 */
const REACH = 200;
/** What the pendulum costs whoever it catches. */
const PENDULUM_DAMAGE = 2;
const BOB_R = 15;
/** Bob centre above the floor at the bottom of a sweep, and how far it rises at the ends. */
const BOB_LOW = 18;
const BOB_LIFT = 46;
/** Rod length while it just hangs and keeps time. */
const REST_LEN = 32;
const GEAR_R = 13;
const GEAR_SPEED = 210;
const GEAR_SPEED_FAST = 240;
/** A gear sent back by a swing, on its way home - and what it does when it gets there. */
const GEAR_BACK = 470;
const GEAR_DAMAGE = 2;
/**
 * How long a gear spins on the spot of the floor it fell on before the blade
 * can catch its teeth. Without it, a hero who stood at his legs and never
 * stopped swinging sent nearly every gear home by accident - it lands a
 * stride in front of him - and the move that warns a close hero to step back
 * cost him nothing and paid him two. One a stride or more off reaches the
 * blade later than this, so a hero who stepped back while it was told bats it
 * as before.
 */
const GEAR_BITE = 0.22;
const RING_SPEED = 320;
const RING_SPEED_FAST = 360;
/** The ring is this high along the floor: an ordinary jump clears it. */
const RING_H = 26;
/** Half the width of the column a hand comes down in. */
const HAND_HALF = 12;
/** How far apart his hands' marks are put. */
const MARK_GAP = 110;
/** One step of his, per beat, while he walks. */
const STEP = 15;
/** He does not walk closer than this to the hero, centre to centre. */
const NEAR = 62;
/** The clock face: its centre above the floor, and its radius. */
const FACE_Y = 90;
const FACE_R = 25;

type Move = 'pendel' | 'gears' | 'bell' | 'hands';
type ClockState = 'dormant' | 'intro' | 'walk' | 'tell' | 'strike' | 'wind' | 'jammed' | 'dying';
type PendMode = 'rest' | 'cock' | 'sweep' | 'settle' | 'jammed';

const MOVES: readonly Move[] = ['pendel', 'gears', 'bell', 'hands'];
/** Where each move's sign sits on his dial: the bell at twelve, the gear at three, the pendulum at six, the hands at nine. */
const SIGN_ANGLE: Record<Move, number> = { bell: -Math.PI / 2, gears: 0, pendel: Math.PI / 2, hands: Math.PI };
/** The pitch each move's warning is sung at, so the four are told apart by ear too. */
const TELL_PITCH: Record<Move, number> = { pendel: 0.8, gears: 1.15, bell: 0.95, hands: 1.35 };
/** Ten past ten: where his hands rest when they are not saying anything. */
const HOUR_REST = (-5 * Math.PI) / 6;
const MINUTE_REST = -Math.PI / 6;

const BRASS_HI = '#f6d98a';
const BRASS = '#d9a548';
const BRASS_MID = '#ad7a30';
const BRASS_DARK = '#6c4518';
const BRASS_EDGE = '#3a2410';
const STEEL = '#b3bcc6';
const STEEL_DARK = '#5d6670';

type Blow = 'parried' | 'hit' | 'missed';

/**
 * One of his blows, on the hero. What came of it: turned aside by the guard,
 * landed (on him or on his silk), or nothing at all because he was still
 * blinking from the last one. Player.hurt does the parry itself - a hero who
 * faces the blow with his guard open turns it - and this only reads back what
 * it decided.
 */
function strikeHero(world: World, amount: number, dir: number): Blow {
  const p = world.player;
  if (p.dead) return 'missed';
  const guarding = p.parryTimer > 0;
  const hp = p.hp;
  const silk = p.shieldUp;
  p.hurt(amount, dir || 1, world);
  if (guarding && p.parryTimer === 0 && p.parryFlash > 0.95) return 'parried';
  return p.hp < hp || (silk && !p.shieldUp) ? 'hit' : 'missed';
}

/* ======================================================== loose clockwork */

/**
 * A piece of him that leaves him: a gear rolling at the hero, the ring of his
 * bell running along the floor, one of his hands coming down out of the dark.
 *
 * Each is a projectile for one reason only - so the game draws it, and lights
 * it, wherever it is. An enemy is drawn while its own box is on screen, and a
 * gear rolling at the hero from a clock that is not would be a gear nobody
 * sees until it hits. Everything else the game does with projectiles - hurting
 * the hero when one touches him, turning it with the blade or the guard - the
 * pieces do themselves, by the clock's rules: resting and not deflectable tells
 * the game to leave them alone, and overlaps() saying no keeps the guard from
 * catching one that is not coming at anybody.
 */
abstract class ClockPart extends Projectile {
  /** Which piece it is, for whoever looks at the projectiles from outside. */
  abstract readonly part: 'gear' | 'chime' | 'hand';

  constructor(
    protected readonly clock: Clockwork,
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    super('coin', x, y, 0, 0);
    this.w = w;
    this.h = h;
    this.life = 30;
    this.resting = true;
    this.deflectable = false;
  }

  override overlaps(): boolean {
    return false;
  }

  override deflect(): void {
    // The blade and the guard are handled where the piece is - see Cog.
  }

  /** Still on its way to the hero: the clock tells no new move while one is. */
  abstract get live(): boolean;
}

/**
 * Zahnräder: a gear out of the hatch in his belly, down onto the floor and
 * rolling at the hero. It hurts only on its way to him - one that has rolled
 * past him is leaving, and walking after it costs nothing. A swing of the
 * blade on it once it has bitten into the floor (GEAR_BITE), or the guard at
 * the moment it arrives, sends it back the way it came, faster, at him: two
 * damage where it lands.
 *
 * It hops out of the hatch and falls for 0.3 s before it rolls, and that fall
 * is the warning a hero standing close gets on top of the bar's. Measured, it
 * is enough for one who steps back while the gear's sign burns: the reading
 * bot, 185 px back and swinging on the drops, sent every gear home in eight
 * fights. Only 125 px back, it let seven through in six.
 */
class Cog extends ClockPart {
  readonly part = 'gear';
  private mode: 'drop' | 'roll' | 'back' = 'drop';
  private rot = rand(0, TAU);
  private glint = 0;
  private toward = true;
  private t = 0;
  /** Seconds on the floor. */
  private rolled = 0;

  constructor(
    clock: Clockwork,
    x: number,
    y: number,
    private readonly dir: number,
    private readonly speed: number,
    straightDown = false,
  ) {
    super(clock, x - GEAR_R, y - GEAR_R, GEAR_R * 2, GEAR_R * 2);
    // A little hop out of the hatch, then it falls.
    this.vx = straightDown ? 0 : dir * 50;
    this.vy = -90;
  }

  get live(): boolean {
    return !this.dead && this.mode !== 'back' && this.toward;
  }

  get batted(): boolean {
    return this.mode === 'back';
  }

  get rolling(): boolean {
    return this.mode === 'roll';
  }

  /** What touches the hero: the gear without the tips of its teeth. */
  private hitBox(): Rect {
    return { x: this.x + 3, y: this.y + 3, w: this.w - 6, h: this.h - 3 };
  }

  override update(dt: number, world: World): void {
    const floor = this.clock.floor;
    const p = world.player;
    this.t += dt;
    this.glint = Math.max(0, this.glint - dt * 2);
    if (this.t > 9) {
      this.shatter(world);
      return;
    }
    if (this.mode === 'drop') {
      this.vy += 1500 * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.rot += this.dir * 7 * dt;
      if (this.bottom >= floor) {
        this.y = floor - this.h;
        this.mode = 'roll';
        this.vy = 0;
        this.vx = this.dir * this.speed;
        audio.play('clank', 1.3);
        world.particles.burst(this.cx, floor - 2, 6, '#ffd08a', { speed: 110, gravity: 500, shape: 'spark', angle: -Math.PI / 2, spread: 2 });
      }
      return;
    }
    this.x += this.vx * dt;
    this.rot += (this.vx / GEAR_R) * dt;
    this.toward = sign(this.vx) === sign(p.cx - this.cx) || Math.abs(p.cx - this.cx) < 4;
    if (world.time % 0.05 < dt) {
      world.particles.spawn({
        x: this.cx - sign(this.vx) * 8,
        y: floor - 2,
        vx: -this.vx * 0.15 + rand(-20, 20),
        vy: -rand(30, 90),
        gravity: 500,
        color: this.mode === 'back' ? '#fff4c8' : '#ffc46a',
        size: rand(1.4, 2.4),
        life: 0.3,
        shape: 'spark',
      });
    }
    if (this.mode === 'roll') {
      this.rolled += dt;
      if (this.rolled >= GEAR_BITE && p.bladeLive && rectsOverlap(p.swordRect(), this.rect)) {
        this.turn(world);
      } else if (this.toward && !p.dead && rectsOverlap(this.hitBox(), p.rect)) {
        const blow = strikeHero(world, 1, sign(this.vx));
        if (blow === 'parried') this.turn(world);
        else if (blow === 'hit') {
          this.shatter(world);
          return;
        }
      }
    } else if (this.clock.takesGear(this.rect)) {
      this.clock.gearHome(world, this.cx, this.cy);
      this.shatter(world);
      return;
    }
    if (this.x < this.clock.left || this.x + this.w > this.clock.right) this.shatter(world);
  }

  /** Back the way it came, at him, whichever way the hero happened to be facing. */
  private turn(world: World): void {
    this.mode = 'back';
    this.glint = 1;
    this.vx = (sign(this.clock.cx - this.cx) || -this.dir) * GEAR_BACK;
    audio.play('deflect', 0.9);
    audio.play('clank', 1.6);
    world.hitStop(0.04);
    world.particles.burst(this.cx, this.cy, 14, '#fff2c4', { speed: 200, gravity: 200, shape: 'spark' });
  }

  private shatter(world: World): void {
    this.dead = true;
    audio.play('clank', 0.9);
    world.particles.burst(this.cx, this.cy, 10, '#d9a548', { speed: 170, gravity: 600, size: 3 });
    world.particles.burst(this.cx, this.cy, 6, '#fff0c0', { speed: 140, gravity: 300, shape: 'spark' });
  }

  override draw(ctx: CanvasRenderingContext2D): void {
    const x = this.cx;
    const y = this.cy;
    const back = this.mode === 'back';
    ctx.save();
    if (back || this.glint > 0) {
      ctx.globalCompositeOperation = 'lighter';
      // The way home, as a smear of light behind it.
      for (let i = 1; i <= 3; i++) {
        glow(ctx, x - sign(this.vx) * i * 11, y, 15 - i * 2, 'rgba(255,236,170,0.32)');
      }
      glow(ctx, x, y, 26, `rgba(255,236,170,${(0.45 + this.glint * 0.4).toFixed(3)})`);
      ctx.globalCompositeOperation = 'source-over';
    }
    drawGear(ctx, x, y, GEAR_R, 9, this.rot, back ? '#ffe7a2' : BRASS, back ? '#fff8dc' : BRASS_HI, BRASS_EDGE);
    ctx.restore();
  }
}

/**
 * Glockenschlag: one side of the ring his bell sends along the floor. Low - an
 * ordinary jump clears it - and it runs to the wall. It hurts once.
 */
class Chime extends ClockPart {
  readonly part = 'chime';
  private struck = false;
  private toward = true;
  private t = 0;

  constructor(clock: Clockwork, x: number, dir: number, speed: number) {
    super(clock, x - 8, clock.floor - RING_H, 16, RING_H);
    this.vx = dir * speed;
  }

  get live(): boolean {
    return !this.dead && !this.struck && this.toward;
  }

  /** It rises out of the floor over its first 0.15 s: a hero who jumps on the beat is over it in time. */
  private get height(): number {
    return Math.min(RING_H, 8 + ((RING_H - 8) * this.t) / 0.15);
  }

  override update(dt: number, world: World): void {
    const p = world.player;
    this.t += dt;
    this.x += this.vx * dt;
    this.h = this.height;
    this.y = this.clock.floor - this.h;
    this.toward = sign(this.vx) === sign(p.cx - this.cx);
    if (!this.struck && !p.dead && rectsOverlap(this.rect, p.rect)) {
      if (strikeHero(world, 1, sign(this.vx)) !== 'missed') this.struck = true;
    }
    if (this.x < this.clock.left - 4 || this.x + this.w > this.clock.right + 4 || this.t > 6) {
      this.dead = true;
      world.particles.burst(this.cx, this.clock.floor - 8, 8, '#ffe2a0', { speed: 90, gravity: 200, shape: 'spark' });
    }
  }

  override draw(ctx: CanvasRenderingContext2D): void {
    const dir = sign(this.vx);
    const x = this.cx;
    const floor = this.clock.floor;
    const fade = this.struck ? 0.45 : 1;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // The ring itself, and two echoes running behind it.
    for (let i = 0; i < 3; i++) {
      const bx = x - dir * i * 14;
      const k = (1 - i * 0.3) * fade;
      ctx.strokeStyle = `rgba(255,${200 + i * 15},${120 + i * 30},${(0.85 * k).toFixed(3)})`;
      ctx.lineWidth = 4 - i;
      ctx.beginPath();
      ctx.ellipse(bx - dir * 6, floor, 12, Math.max(4, this.h - i * 4), 0, dir > 0 ? -Math.PI / 2 : Math.PI / 2, dir > 0 ? Math.PI / 2 : (3 * Math.PI) / 2);
      ctx.stroke();
    }
    glow(ctx, x, floor - 10, 30, `rgba(255,214,140,${(0.4 * fade).toFixed(3)})`);
    ctx.fillStyle = `rgba(255,250,225,${(0.9 * fade).toFixed(3)})`;
    ctx.fillRect(x - 2, floor - this.h + 2, 3, this.h - 3);
    ctx.restore();
  }
}

/**
 * Zeigerstich: one of his hands. It marks a spot on the floor when the bar
 * begins, leaves the dial halfway through it, hangs point down over its mark,
 * and on the beat it comes down: everything in its column, on the floor or on
 * a plank above it, is hit. Then it stands in the floor for a beat and flies
 * home.
 */
class Spear extends ClockPart {
  readonly part = 'hand';
  stage: 'mark' | 'rise' | 'hover' | 'stab' | 'stuck' | 'home' = 'mark';
  private t = 0;
  /** The hand's tip, and where it set off from. */
  private tx: number;
  private ty: number;
  private fromX = 0;
  private fromY = 0;
  private flashT = 0;

  constructor(
    clock: Clockwork,
    readonly markX: number,
    /** The minute hand is the long one, the hour hand the short, the second hand the thin. */
    private readonly hand: 'minute' | 'hour' | 'second',
  ) {
    super(clock, markX - 24, clock.floor - 24, 48, 24);
    this.tx = clock.cx;
    this.ty = clock.floor - FACE_Y;
  }

  get live(): boolean {
    return !this.dead && (this.stage === 'mark' || this.stage === 'rise' || this.stage === 'hover');
  }

  /** Out of the dial: it is the clock's hand no longer. */
  get out(): boolean {
    return this.stage !== 'mark';
  }

  private get length(): number {
    return this.hand === 'minute' ? 64 : this.hand === 'hour' ? 50 : 58;
  }

  private get hoverY(): number {
    return this.clock.floor - 236;
  }

  lift(): void {
    this.stage = 'rise';
    this.t = 0;
    this.fromX = this.clock.cx;
    this.fromY = this.clock.floor - FACE_Y;
  }

  /** On the beat: down, through anyone standing in its column. */
  stab(world: World): void {
    this.stage = 'stab';
    this.t = 0;
    this.flashT = 1;
    this.tx = this.markX;
    this.ty = this.clock.floor + 8;
    const p = world.player;
    if (!p.dead && p.x < this.markX + HAND_HALF && p.x + p.w > this.markX - HAND_HALF && p.y < this.clock.floor) {
      strikeHero(world, 1, sign(p.cx - this.markX) || -p.facing);
    }
    world.particles.burst(this.markX, this.clock.floor - 2, 14, '#ffe2a0', { speed: 200, gravity: 600, shape: 'spark', angle: -Math.PI / 2, spread: 2.2 });
    world.particles.burst(this.markX, this.clock.floor - 2, 8, '#8a6a4a', { speed: 150, gravity: 800, size: 3, angle: -Math.PI / 2, spread: 2 });
  }

  goHome(): void {
    this.stage = 'home';
    this.t = 0;
    this.fromX = this.tx;
    this.fromY = this.ty;
  }

  override update(dt: number): void {
    this.t += dt;
    this.flashT = Math.max(0, this.flashT - dt * 3);
    switch (this.stage) {
      case 'mark':
        break;
      case 'rise': {
        const k = easeOut(clamp(this.t / 0.35, 0, 1), 2);
        this.tx = lerp(this.fromX, this.markX, k);
        this.ty = lerp(this.fromY, this.hoverY, k);
        if (this.t >= 0.35) this.stage = 'hover';
        break;
      }
      case 'hover':
        // Trembling, point down, over its mark.
        this.tx = this.markX + Math.sin(this.t * 40) * 0.8;
        this.ty = this.hoverY;
        break;
      case 'stab':
        if (this.t > 0.08) this.stage = 'stuck';
        break;
      case 'stuck':
        break;
      case 'home': {
        const k = clamp(this.t / 0.5, 0, 1);
        const e = k * k;
        this.tx = lerp(this.fromX, this.clock.cx, e);
        this.ty = lerp(this.fromY, this.clock.floor - FACE_Y, e) - Math.sin(k * Math.PI) * 60;
        if (k >= 1) this.dead = true;
        break;
      }
    }
    // The box follows the hand, so the game draws and lights it where it is.
    const markY = this.clock.floor - 24;
    if (this.stage === 'mark') {
      this.x = this.markX - 24;
      this.y = markY;
    } else {
      this.x = this.tx - 24;
      this.y = Math.min(markY, this.ty - this.length * 0.5);
    }
  }

  override draw(ctx: CanvasRenderingContext2D): void {
    const floor = this.clock.floor;
    const beat = this.clock.beatGlow;
    ctx.save();
    // The mark: a little dial on the floor, burning brighter as the bar runs out.
    if (this.stage !== 'home') {
      const urgency = this.stage === 'mark' ? 0.45 : this.stage === 'rise' || this.stage === 'hover' ? 0.8 : 0.3;
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, this.markX, floor - 3, 34, `rgba(255,190,110,${(0.3 * urgency + beat * 0.15).toFixed(3)})`);
      ctx.strokeStyle = `rgba(255,214,150,${(0.55 + urgency * 0.4).toFixed(3)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(this.markX, floor - 2, HAND_HALF + 10, 6, 0, 0, TAU);
      ctx.stroke();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        ctx.beginPath();
        ctx.moveTo(this.markX + Math.cos(a) * (HAND_HALF + 6), floor - 2 + Math.sin(a) * 3.6);
        ctx.lineTo(this.markX + Math.cos(a) * (HAND_HALF + 10), floor - 2 + Math.sin(a) * 6);
        ctx.stroke();
      }
      if (this.stage === 'hover' || this.stage === 'rise') {
        // The line it will come down along.
        const g = ctx.createLinearGradient(0, this.hoverY, 0, floor);
        g.addColorStop(0, 'rgba(255,214,150,0)');
        g.addColorStop(1, `rgba(255,214,150,${(0.16 + beat * 0.12).toFixed(3)})`);
        ctx.fillStyle = g;
        ctx.fillRect(this.markX - HAND_HALF, this.hoverY, HAND_HALF * 2, floor - this.hoverY);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    if (this.stage !== 'mark') {
      if (this.stage === 'stab' || this.flashT > 0.5) {
        // The streak it leaves coming down.
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createLinearGradient(0, this.hoverY, 0, floor);
        g.addColorStop(0, 'rgba(255,240,200,0)');
        g.addColorStop(1, `rgba(255,240,200,${(0.7 * this.flashT).toFixed(3)})`);
        ctx.fillStyle = g;
        ctx.fillRect(this.markX - 5, this.hoverY, 10, floor - this.hoverY);
        ctx.globalCompositeOperation = 'source-over';
      }
      const down = this.stage === 'home' ? Math.atan2(this.clock.floor - FACE_Y - this.ty, this.clock.cx - this.tx) : Math.PI / 2;
      drawHand(ctx, this.tx - Math.cos(down) * this.length, this.ty - Math.sin(down) * this.length, down, this.length, this.hand, 1);
    }
    ctx.restore();
  }
}

/* ================================================================ the boss */

interface Debris {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  r: number;
  kind: 'gear' | 'plate' | 'face' | 'bell';
}

/**
 * Tickmar, das Uhrwerk - the great clock of the castle, which grew tired of
 * its tower and walked down into it: a brass automaton on piston legs, a clock
 * face for a chest, gears turning in the window of his belly, a key in his
 * back, and under him the long pendulum that has kept the castle's time for a
 * hundred years.
 *
 * The rule of the fight is the one in his music: Er schlägt im Takt. He ticks
 * every half second - out loud, and on his face, where the second hand jumps
 * and the lamp on his head blinks - and nothing he does happens anywhere but on
 * a tick. Before every move he says which one, for a whole bar: four ticks
 * with the minute hand standing on that move's sign on his dial and the sign
 * burning, the ticks climbing in pitch, and the move lands on the next
 * downbeat. Whoever counts to four is never surprised:
 *
 *   Pendelschlag  - the pendulum swings out low along the floor, 200 px either
 *                   way, over and back, a beat a sweep. Jump it, stand on a
 *                   plank, or be elsewhere. A guard that meets it jams it, and
 *                   he stands stuck for 1.8 s.
 *   Zahnräder     - three gears out of his belly on three beats, rolling at the
 *                   hero. Jump them, or swing: a struck gear goes back into him
 *                   for two.
 *   Glockenschlag - the bell on his head rings, and the ring runs along the
 *                   floor both ways to the walls. Jump it. From half health it
 *                   rings twice.
 *   Zeigerstich   - his hands mark two spots on the floor when the bar begins
 *                   (three from half health), hang over them, and come down on
 *                   the beat. Be beside them.
 *
 * Between moves he walks at the hero, a step a beat, and walking does not hurt:
 * nothing about him does, except what moves at the hero. His legs are always
 * in reach of a sword swung from the floor, and they take full damage. After
 * every third move he has run down: the ticking stops, the key in his back
 * turns, the glass over his face flips up on the works, and for 2.5 s every
 * blow counts double - ER ZIEHT SICH AUF. From half health the beat quickens
 * to 0.4 s.
 *
 * Every move is told for a whole bar - 2 s, 1.6 s in his second half - and
 * every blow leaves him on a tick, never between two. He tells nothing new
 * while anything of his is still on its way to the hero, so after each attack
 * the next blow is a whole bar away at the least: 2.15 s, measured, at the
 * closest. Measured with a bot that plays the way a person does - it acts
 * on what the fight looked like 0.3 s ago, swings only from the floor, jumps
 * only to get over something and counts the bar give or take 40 ms - he falls
 * in 47 to 59 s; in eighteen fights the bot lost one heart in two of them and
 * none in the rest. Counting three times as sloppily, or seeing him 0.4 s
 * late, it lost 0 to 2. A hero who stands still where he is takes 13 to 16 in
 * the 105 s the reader takes 0 to 3 in - so he is not harmless, only fair.
 */
export class Clockwork extends Enemy {
  private state: ClockState = 'dormant';
  private timer = 0;
  /** His own time, which stands still when the game does. */
  private clock = 0;
  private floorY = 0;
  private arenaLeft = 0;
  private arenaRight = 0;

  /* -------------------------------------------------------------- the beat */
  private ticking = false;
  private beatLen = BEAT;
  private beatTimer = 0;
  /** Where in the bar the last tick fell, 0 being the downbeat. */
  private beat = 3;
  /** Ticks since the state began; its first tick is 0. */
  private inState = 0;
  /** Every tick he has ever made, and when the last one was - for the tools. */
  ticks = 0;
  lastTickAt = -1;
  /** Every blow released, and when the last one was. */
  strikes = 0;
  lastStrikeAt = -1;
  private beatCount = 0;
  private tempoPending = false;
  /** The beat picks up again with a tick on this very frame. */
  private freshBeat = false;

  /* ------------------------------------------------------------ the moves */
  private move: Move | null = null;
  private lastMove: Move | null = null;
  private movesSinceWind = 0;
  private phaseTwo = false;
  private readonly parts: ClockPart[] = [];
  private spears: Spear[] = [];

  /* ------------------------------------------------------------- pendulum */
  private pendMode: PendMode = 'rest';
  private pendT = 0;
  private pendSide = 1;
  private pendBeat = BEAT;
  /** Which sweep last landed, so one sweep hurts once. */
  private pendHit = -1;
  private bobX = 0;
  private bobY = 0;
  private cockX = 0;
  private cockY = 0;

  /* ---------------------------------------------------------------- looks */
  private lamp = 0;
  private lit = 0;
  private glass = 0;
  private keyAngle = 0;
  private minuteAngle = MINUTE_REST;
  private hammer = 0;
  private hammerRing = 0;
  private gearSpin = 0;
  private gearRate = 0;
  private hatch = 0;
  private signGlow = 0;
  private shudder = 0;
  private stepFrom = 0;
  private stepTo = 0;
  private stepT = 1;
  private stepFoot = 1;
  private struck: 'body' | null = null;
  private ratchet = 0;
  private dyingTick = 0;
  private dyingGap = 0.3;
  private debris: Debris[] = [];

  override castLight = false;

  constructor(x: number, y: number) {
    super('clock', x, y);
    this.w = W;
    this.h = H;
    this.hp = this.maxHp = CLOCK_HP;
    this.scoreValue = 1000;
    this.contactDamage = 0;
    this.aggroRange = 9999;
    this.facing = -1;
  }

  get phase(): 1 | 2 {
    return this.phaseTwo ? 2 : 1;
  }

  override barName(): string {
    return 'TICKMAR   ·   DAS UHRWERK';
  }

  override barPhase(): number {
    return this.phase;
  }

  protected override deathColor(): string {
    return '#f0c27a';
  }

  /* ------------------------------------------------- what the pieces read */

  get floor(): number {
    return this.floorY;
  }

  get left(): number {
    return this.arenaLeft;
  }

  get right(): number {
    return this.arenaRight;
  }

  /** 1 on a tick, fading over the beat: what the marks on the floor pulse with. */
  get beatGlow(): number {
    return this.lamp;
  }

  /** Winding himself: everything that lands counts double. */
  get winding(): boolean {
    return this.state === 'wind';
  }

  private get canBeHurt(): boolean {
    return !this.dead && this.state !== 'dormant' && this.state !== 'intro' && this.state !== 'dying';
  }

  /** Any of his blows still on its way to the hero. */
  get hazardsLive(): boolean {
    return this.pendMode === 'sweep' || this.parts.some((q) => q.live);
  }

  /** His body, all of it - and from the floor a sword reaches his legs. */
  private bodyRect(): Rect {
    return { x: this.x + 6, y: this.floorY - 116, w: W - 12, h: 116 };
  }

  /** A gear coming home: does it reach him? */
  takesGear(r: Rect): boolean {
    return this.canBeHurt && rectsOverlap(this.bodyRect(), r);
  }

  /** A gear the hero sent back, home in his works. */
  gearHome(world: World, x: number, y: number): void {
    if (!this.canBeHurt) return;
    const before = this.hp;
    this.takeDamage(GEAR_DAMAGE, world, x, y);
    world.player.onDamageDealt(Math.max(0, before - Math.max(0, this.hp)));
    world.particles.text(this.cx, this.floorY - 140, 'INS GETRIEBE!', '#ffe08a');
    world.camera.addShake(5);
    world.hitStop(0.06);
  }

  /* ------------------------------------------------------------ targeting */

  override overlaps(r: Rect): boolean {
    this.struck = null;
    if (!this.canBeHurt) return false;
    if (!rectsOverlap(this.bodyRect(), r)) return false;
    this.struck = 'body';
    return true;
  }

  override hurt(amount: number, fromDir: number, world: World): void {
    void fromDir;
    if (!this.canBeHurt) return;
    const part = this.struck;
    this.struck = null;
    // A blow that arrives without a part - a parry's shove - lands nowhere.
    if (part === null) return;
    this.takeDamage(amount, world, this.cx - fromDir * 30, this.floorY - 30);
  }

  /** Brass takes it: twice over while he winds himself, with the works open. */
  private takeDamage(amount: number, world: World, x: number, y: number): void {
    const dealt = this.winding ? amount * 2 : amount;
    this.hp -= dealt;
    this.flash = 1;
    audio.play('bossHit', this.winding ? 1.35 : 1.1);
    audio.play('clank', this.winding ? 1.8 : 1.45);
    world.particles.burst(x, y, 8 + dealt * 2, this.winding ? '#fff4c8' : '#ffd890', { speed: 190, gravity: 420, shape: 'spark' });
    if (this.hp <= 0) {
      this.beginDying(world);
      return;
    }
    if (!this.phaseTwo && this.hp <= this.maxHp / 2) {
      this.phaseTwo = true;
      this.tempoPending = true;
      audio.play('phase', 1.1);
      audio.play('clank', 0.6);
      world.camera.addShake(6);
      world.particles.text(this.cx, this.floorY - 150, 'DER TAKT ZIEHT AN!', '#ffd08a');
      world.particles.burst(this.cx, this.floorY - FACE_Y, 26, '#ffe2a0', { speed: 230, gravity: -40, shape: 'spark' });
    }
  }

  /**
   * The parry reaches whatever stands within 60 px of the hero, and the
   * pendulum's bob is often further out than that when it arrives - so the
   * sweep reads the guard itself, where it lands (see touchPlayer). This is
   * for the rest: a guard raised next to him against a bob that is right
   * there.
   */
  override onParried(world: World): void {
    if (this.pendMode !== 'sweep' || this.poiseLock > 0) return;
    const p = world.player;
    if (Math.hypot(this.bobX - p.cx, this.bobY - p.cy) < 60) this.jam(world);
  }

  /** The pendulum jams on a guard: he stands stuck, shaking, and takes it. */
  private jam(world: World): void {
    if (this.state === 'jammed' || this.state === 'dying') return;
    this.state = 'jammed';
    this.timer = JAM_TIME;
    this.ticking = false;
    this.pendMode = 'jammed';
    this.pendT = 0;
    this.poiseLock = JAM_TIME + 1;
    this.movesSinceWind++;
    this.move = null;
    this.shudder = 1;
    audio.play('clank', 0.6);
    audio.play('crumble', 1.5);
    world.camera.addShake(6);
    world.hitStop(0.08);
    world.particles.burst(this.cx, this.floorY - PIVOT_Y, 18, '#fff0c0', { speed: 220, gravity: 400, shape: 'spark' });
    world.particles.text(this.cx, this.floorY - 150, 'DAS PENDEL KLEMMT!', '#ffe08a');
  }

  /** Down for good: the ticking runs slow, springs go, and he comes apart. */
  beginDying(world: World): void {
    if (this.state === 'dying' || this.dead) return;
    this.hp = 0;
    this.state = 'dying';
    this.timer = 3;
    this.ticking = false;
    this.move = null;
    this.dyingTick = 0.25;
    this.dyingGap = 0.3;
    this.pendMode = 'jammed';
    for (const q of this.parts) q.dead = true;
    this.parts.length = 0;
    this.spears = [];
    audio.play('bossRoar', 1.4);
    audio.play('clank', 0.5);
    world.camera.addShake(9);
    world.hitStop(0.14);
  }

  /**
   * Nothing about him hurts by standing there - not his legs, not his body,
   * not the pendulum keeping time under him. Only a sweep does, once a sweep,
   * and the pieces that leave him look after themselves.
   */
  override touchPlayer(world: World): void {
    if (this.pendMode !== 'sweep' || this.dead) return;
    const p = world.player;
    if (p.dead) return;
    const sweep = Math.min(1, Math.floor(this.pendT / this.pendBeat));
    if (sweep === this.pendHit) return;
    // Along the way it came this frame, so a fast bob cannot step over him.
    for (let i = 0; i <= 3; i++) {
      const t = Math.max(0, this.pendT - (i * (1 / 60)) / 3);
      const b = this.bobAt(t);
      const nx = clamp(b.x, p.x, p.x + p.w);
      const ny = clamp(b.y, p.y, p.y + p.h);
      if ((nx - b.x) ** 2 + (ny - b.y) ** 2 >= BOB_R * BOB_R) continue;
      const dir = this.pendSide * (Math.sin((Math.PI * this.pendT) / this.pendBeat) >= 0 ? 1 : -1);
      // The one blow of his that costs two: a bar of warning, the bob swung
      // back for all to see, and brass the weight of a man. At one, a hero who
      // stood at his legs and never stopped swinging walked out of the tower
      // with four hearts left; his silk caught half of what reached him.
      const blow = strikeHero(world, PENDULUM_DAMAGE, dir);
      if (blow === 'parried') this.jam(world);
      else if (blow === 'hit') this.pendHit = sweep;
      return;
    }
  }

  /* --------------------------------------------------------------- update */

  override update(dt: number, world: World): void {
    this.updateCommon(dt);
    this.clock += dt;
    const player = world.player;

    if (this.arenaRight === 0) {
      this.floorY = this.bottom;
      const arena = world.level.arenaAt(this.cx);
      this.arenaLeft = arena ? arena.left : this.cx - 560;
      this.arenaRight = arena ? arena.right : this.cx + 560;
      this.bobX = this.cx;
      this.bobY = this.floorY - PIVOT_Y + REST_LEN;
    }
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const q = this.parts[i];
      if (q.dead || !world.projectiles.includes(q)) this.parts.splice(i, 1);
    }
    this.spears = this.spears.filter((s) => this.parts.includes(s));

    this.lamp = Math.max(0, this.lamp - dt * 3.5);
    this.shudder = Math.max(0, this.shudder - dt * 1.2);
    this.hammerRing = Math.max(0, this.hammerRing - dt * 2.5);

    switch (this.state) {
      case 'dormant': {
        const inside = player.cx > this.arenaLeft + 16 && player.cx < this.arenaRight - 16;
        if (inside && !player.dead) this.wake(world);
        break;
      }
      case 'intro':
        this.timer -= dt;
        this.lit = approach(this.lit, 1, dt / 1.2);
        this.keyAngle += dt * 14;
        this.ratchetSound(dt, 0.12);
        if (this.timer <= 0) this.resume();
        break;
      case 'wind':
        this.timer -= dt;
        this.glass = approach(this.glass, this.timer > 0.25 ? 1 : 0, dt * 5);
        this.keyAngle += dt * 16;
        this.gearRate = 9;
        this.ratchetSound(dt, 0.1);
        this.steam(world, 0.08, 1);
        if (this.timer <= 0) {
          this.glass = 0;
          this.resume();
        }
        break;
      case 'jammed':
        this.timer -= dt;
        this.shudder = Math.max(this.shudder, 0.5);
        if (world.time % 0.1 < dt) {
          world.particles.spawn({
            x: this.cx + rand(-6, 6),
            y: this.floorY - PIVOT_Y,
            vx: rand(-120, 120),
            vy: -rand(40, 180),
            gravity: 500,
            color: '#fff0c0',
            size: 2,
            life: 0.35,
            shape: 'spark',
          });
        }
        this.steam(world, 0.12, 0.6);
        if (this.timer <= 0) {
          if (this.movesSinceWind >= MOVES_PER_WIND) this.beginWind(world);
          else this.resume();
        }
        break;
      case 'dying':
        this.updateDying(dt, world);
        return;
      default:
        break;
    }

    if (this.ticking && this.freshBeat) {
      // Picking up after a pause: a tick now, and the next a whole beat on.
      this.freshBeat = false;
      this.onBeat(world);
      this.beatTimer = this.beatLen;
    } else if (this.ticking) {
      this.beatTimer -= dt;
      while (this.ticking && this.beatTimer <= 1e-6) {
        this.onBeat(world);
        this.beatTimer += this.beatLen;
      }
    }

    // Looks.
    if (this.state !== 'dormant') this.lit = approach(this.lit, 1, dt);
    if (this.state !== 'wind') this.glass = approach(this.glass, 0, dt * 5);
    const wantMinute = this.state === 'tell' && this.move ? SIGN_ANGLE[this.move] : MINUTE_REST;
    this.minuteAngle = approach(this.minuteAngle, wantMinute, dt * 14);
    this.signGlow = approach(this.signGlow, this.state === 'tell' ? 1 : 0, dt * (this.state === 'tell' ? 8 : 3));
    this.hatch = approach(this.hatch, this.move === 'gears' && (this.state === 'tell' || this.state === 'strike') ? 1 : 0, dt * 4);
    const wantHammer = this.state === 'tell' && this.move === 'bell' ? clamp(this.inState / 3, 0.3, 1) : 0;
    this.hammer = approach(this.hammer, wantHammer, dt * 3);
    if (this.state !== 'wind') this.gearRate = approach(this.gearRate, this.state === 'tell' && this.move === 'gears' ? 7 : 0, dt * 8);
    this.gearSpin += this.gearRate * dt;
    if (this.stepT < 1) {
      this.stepT = Math.min(1, this.stepT + dt / (this.beatLen * 0.55));
      this.x = lerp(this.stepFrom, this.stepTo, easeOut(this.stepT, 2));
      if (this.stepT >= 1) this.footDown(world);
    }
    if (this.state === 'walk' || this.state === 'tell') this.facing = player.cx >= this.cx ? 1 : -1;
    this.updatePendulum(dt);
    if (this.state !== 'dormant') this.steam(world, this.state === 'tell' ? 0.3 : 0.6, 0.35);
  }

  private wake(world: World): void {
    this.engaged = true;
    // No poise: a clock does not stagger. His openings come on his own
    // schedule - the winding - or from a guard, never from a pile of damage,
    // so this asks the hero's relics for his health alone.
    this.sizeUpFor(world, 0);
    this.state = 'intro';
    this.timer = 1.8;
    audio.play('clank', 0.7);
    audio.play('rumble', 1.3);
    world.camera.addShake(4);
    world.particles.burst(this.cx, this.floorY - 70, 18, 'rgba(230,226,220,0.6)', { speed: 120, gravity: -60, size: 4 });
  }

  /**
   * The beat picks up again on a downbeat, and the first bar of it is a walk.
   * After the intro, after the winding, after a jammed pendulum.
   */
  private resume(): void {
    this.state = 'walk';
    this.ticking = true;
    this.beat = 3;
    this.inState = -1;
    this.beatTimer = this.beatLen;
    this.freshBeat = true;
    this.move = null;
    if (this.pendMode !== 'rest') {
      // Home from wherever it was left - a jammed one from the floor.
      this.pendMode = 'settle';
      this.pendT = 0;
      this.cockX = this.bobX;
      this.cockY = this.bobY;
    }
  }

  private beginWind(world: World): void {
    this.state = 'wind';
    this.timer = WIND_TIME;
    this.ticking = false;
    this.movesSinceWind = 0;
    this.move = null;
    audio.play('clank', 0.8);
    audio.play('fuse', 0.5);
    world.particles.text(this.cx, this.floorY - 150, 'ER ZIEHT SICH AUF!', '#fff1b8');
    world.particles.burst(this.cx, this.floorY - FACE_Y, 16, '#fff1b8', { speed: 150, gravity: -30, shape: 'spark' });
  }

  /* ------------------------------------------------------------- the beat */

  private onBeat(world: World): void {
    this.beat = (this.beat + 1) % 4;
    this.inState++;
    this.beatCount++;
    this.ticks++;
    this.lastTickAt = this.clock;
    this.lamp = 1;
    if (this.beat === 0 && this.tempoPending) {
      this.tempoPending = false;
      this.beatLen = BEAT_FAST;
    }
    this.tickSound();

    switch (this.state) {
      case 'walk':
        // A hero already at his feet gets the next count-in on the next Eins;
        // one further off is walked at for a bar first. With a bar of walking
        // every time, a hero who stood at his legs and never stopped swinging
        // saw a move every six or seven seconds and lost three hearts in the
        // forty it took him - the clock was mostly walking on the spot.
        if (this.beat === 0 && (this.inState >= 4 || this.atHisFeet(world)) && !this.hazardsLive) this.beginTell(world);
        else this.step(world);
        break;
      case 'tell':
        if (this.inState >= 4) this.strike(world);
        else this.countIn(world);
        break;
      case 'strike':
        if (this.inState >= 4) this.endStrike(world);
        else this.strikeBeat(world);
        break;
      default:
        break;
    }
  }

  private tickSound(): void {
    // Tick, tick, tick, tock - and in the bar of a warning, a count-in that
    // climbs to the blow.
    if (this.state === 'tell' && this.inState >= 1 && this.inState <= 3) {
      audio.play('clank', 1.45 + this.inState * 0.15);
      audio.play('blip', 2.2 + this.inState * 0.2);
    } else {
      audio.play('blip', this.beat === 0 ? 1.4 : 2);
    }
  }

  /** Whether the hero stands where his legs can be reached from the floor. */
  private atHisFeet(world: World): boolean {
    const p = world.player;
    return !p.dead && Math.abs(p.cx - this.cx) < NEAR + 50 && p.bottom > this.floorY - 40;
  }

  /** One step at the hero, if he is not already at his feet. */
  private step(world: World): void {
    const p = world.player;
    const dx = p.cx - this.cx;
    if (Math.abs(dx) <= NEAR || p.dead) return;
    this.stepFrom = this.x;
    this.stepTo = clamp(this.x + sign(dx) * Math.min(STEP, Math.abs(dx) - NEAR), this.arenaLeft, this.arenaRight - W);
    this.stepT = 0;
    this.stepFoot = -this.stepFoot;
  }

  private footDown(world: World): void {
    audio.play('land', 0.55);
    world.particles.burst(this.cx + this.stepFoot * 20, this.floorY - 2, 5, 'rgba(200,180,150,0.6)', { speed: 70, gravity: 300, size: 2.5, angle: -Math.PI / 2, spread: 2.4 });
  }

  /**
   * Which move, out of the four. Never the same twice running, and never the
   * pendulum at a hero it cannot reach. A hero up on a plank is out of reach
   * of everything but the hands, and gets the hands, as often as he stays
   * there: a plank is somewhere to be while the pendulum swings, not a place
   * to wait the fight out.
   */
  private chooseMove(world: World): Move {
    const p = world.player;
    const dist = Math.abs(p.cx - this.cx);
    if (p.onGround && p.bottom < this.floorY - 40) return 'hands';
    let options = MOVES.filter((m) => m !== this.lastMove);
    if (dist > REACH + 30) options = options.filter((m) => m !== 'pendel');
    return options[Math.floor(Math.random() * options.length)] ?? 'bell';
  }

  /** The downbeat a warning starts on: the minute hand goes to the sign. */
  private beginTell(world: World): void {
    const p = world.player;
    const move = this.chooseMove(world);
    this.state = 'tell';
    this.inState = 0;
    this.move = move;
    this.lastMove = move;
    this.facing = p.cx >= this.cx ? 1 : -1;
    audio.play('tell', TELL_PITCH[move]);
    audio.play('clank', 1.5);
    switch (move) {
      case 'pendel':
        // Drawn back to the side away from him, and up: it comes through him
        // first on its way across.
        this.pendSide = p.cx >= this.cx ? 1 : -1;
        this.pendMode = 'cock';
        this.pendT = 0;
        this.cockX = this.bobX;
        this.cockY = this.bobY;
        break;
      case 'hands':
        this.placeMarks(world);
        break;
      default:
        break;
    }
  }

  /**
   * The marks go down as the bar begins: one where the hero stands, one a
   * stride towards the clock, and from half health one a stride the other way
   * too. Kept off the walls, so there is always floor beside each of them.
   */
  private placeMarks(world: World): void {
    const p = world.player;
    const lo = this.arenaLeft + 30;
    const hi = this.arenaRight - 30;
    const at = clamp(p.cx, lo, hi);
    const toward = sign(this.cx - at) || 1;
    const xs = [at];
    let second = at + toward * MARK_GAP;
    if (second < lo || second > hi) second = at - toward * MARK_GAP;
    xs.push(second);
    if (this.phaseTwo) {
      const third = at - toward * MARK_GAP;
      if (third >= lo && third <= hi && third !== second) xs.push(third);
    }
    const kinds: ('minute' | 'hour' | 'second')[] = ['minute', 'hour', 'second'];
    this.spears = xs.map((x, i) => new Spear(this, x, kinds[i]));
    for (const s of this.spears) {
      world.spawnProjectile(s);
      this.parts.push(s);
    }
    audio.play('magic', 0.7);
  }

  /** Beats two to four of a warning. */
  private countIn(world: World): void {
    if (this.move === 'hands' && this.inState === 2) {
      for (const s of this.spears) s.lift();
      audio.play('swing', 1.5);
      audio.play('beamCharge', 1.6);
    }
    if (this.move === 'bell') world.particles.burst(this.cx, this.floorY - H - 2, 4, '#ffe2a0', { speed: 60, gravity: 100, shape: 'spark' });
  }

  /** The downbeat after the warning: the blow. */
  private strike(world: World): void {
    this.state = 'strike';
    this.inState = 0;
    const move = this.move;
    switch (move) {
      case 'pendel':
        this.pendMode = 'sweep';
        this.pendT = 0;
        this.pendBeat = this.beatLen;
        this.pendHit = -1;
        this.released();
        audio.play('swing', 0.5);
        audio.play('dash', 0.6);
        break;
      case 'gears':
        this.dropGear(world);
        break;
      case 'bell':
        this.ring(world);
        break;
      case 'hands':
        for (const s of this.spears) s.stab(world);
        if (this.spears.length > 0) this.released();
        audio.play('slam', 1.7);
        audio.play('clank', 1.1);
        world.camera.addShake(5);
        break;
      default:
        break;
    }
  }

  /** Beats two to four of the bar the blow came on. */
  private strikeBeat(world: World): void {
    switch (this.move) {
      case 'pendel':
        if (this.inState === 1 && this.pendMode === 'sweep') {
          this.released();
          audio.play('swing', 0.55);
        }
        break;
      case 'gears':
        if (this.inState <= 2) this.dropGear(world);
        break;
      case 'bell':
        if (this.phaseTwo && this.inState === 2) this.ring(world);
        break;
      case 'hands':
        if (this.inState === 2) for (const s of this.spears) s.goHome();
        break;
      default:
        break;
    }
  }

  private endStrike(world: World): void {
    this.move = null;
    this.movesSinceWind++;
    if (this.movesSinceWind >= MOVES_PER_WIND) {
      this.beginWind(world);
      return;
    }
    this.state = 'walk';
    this.inState = 0;
    this.step(world);
  }

  /** A blow leaves him, on this tick. */
  private released(): void {
    this.strikes++;
    this.lastStrikeAt = this.clock;
  }

  private dropGear(world: World): void {
    const p = world.player;
    const dir = p.cx >= this.cx ? 1 : -1;
    this.facing = dir;
    // A stride in front of him - or, onto a hero who stands right beneath the
    // hatch, straight down. Thrown a stride out every time, the gear landed
    // behind a hero between his legs and rolled away from him: the one spot
    // the move should warn him off was the one place it never reached.
    const beneath = Math.abs(p.cx - this.cx) < 30;
    const speed = this.phaseTwo ? GEAR_SPEED_FAST : GEAR_SPEED;
    const gear = new Cog(this, beneath ? this.cx : this.cx + dir * 30, this.floorY - 52, dir, speed, beneath);
    world.spawnProjectile(gear);
    this.parts.push(gear);
    this.released();
    audio.play('clank', 1.05);
    audio.play('shoot', 0.6);
  }

  private ring(world: World): void {
    const speed = this.phaseTwo ? RING_SPEED_FAST : RING_SPEED;
    for (const dir of [-1, 1]) {
      // Out from under him, not from beside him: the rings used to start 30 px
      // either side of his middle, and a hero standing between his feet - right
      // where one who never stops swinging ends up - was between them, and the
      // bell never touched him.
      const chime = new Chime(this, this.cx + dir * 6, dir, speed);
      world.spawnProjectile(chime);
      this.parts.push(chime);
    }
    this.released();
    this.hammer = -0.4;
    this.hammerRing = 1;
    audio.play('clank', 0.5);
    audio.play('magic', 0.55);
    audio.play('slam', 1.5);
    world.camera.addShake(5);
    world.particles.burst(this.cx, this.floorY - H, 16, '#fff0c0', { speed: 180, gravity: 100, shape: 'spark' });
  }

  private ratchetSound(dt: number, every: number): void {
    this.ratchet -= dt;
    if (this.ratchet > 0) return;
    this.ratchet = every;
    audio.play('blip', 0.55);
  }

  /** Puffs from the vents on his shoulders. */
  private steam(world: World, every: number, strength: number): void {
    if (world.time % every >= 1 / 60) return;
    const side = Math.random() < 0.5 ? -1 : 1;
    world.particles.spawn({
      x: this.cx + side * 29,
      y: this.floorY - 80,
      vx: side * rand(10, 40),
      vy: -rand(40, 90) * strength - 20,
      gravity: -40,
      drag: 0.94,
      color: Math.random() < 0.5 ? 'rgba(236,232,226,0.45)' : 'rgba(210,204,196,0.35)',
      size: rand(3, 5),
      life: rand(0.5, 0.9),
      shape: 'circle',
    });
  }

  /* ------------------------------------------------------------ pendulum */

  /** The bob, a time into a sweep: low through the middle, up at either end. */
  private bobAt(t: number): { x: number; y: number } {
    const c = Math.cos((Math.PI * t) / this.pendBeat);
    return {
      // Up against a wall it swings only as far as the wall.
      x: clamp(this.cx - this.pendSide * REACH * c, this.arenaLeft + BOB_R, this.arenaRight - BOB_R),
      y: this.floorY - BOB_LOW - BOB_LIFT * Math.abs(c) ** 8,
    };
  }

  private updatePendulum(dt: number): void {
    const pivotX = this.cx;
    const pivotY = this.floorY - PIVOT_Y;
    this.pendT += dt;
    switch (this.pendMode) {
      case 'rest': {
        // Keeping time: an end of its little swing on every tick.
        const frac = this.ticking ? 1 - this.beatTimer / this.beatLen : 0.5;
        const a = this.ticking ? 0.24 * Math.cos(Math.PI * (this.beatCount + frac)) : 0;
        this.bobX = pivotX + Math.sin(a) * REST_LEN;
        this.bobY = pivotY + Math.cos(a) * REST_LEN;
        break;
      }
      case 'cock': {
        // Out and up on the far side, over the first beat of the bar, then held.
        const k = easeOut(clamp(this.pendT / (this.beatLen * 1.2), 0, 1), 2);
        const tx = clamp(pivotX - this.pendSide * REACH, this.arenaLeft + BOB_R, this.arenaRight - BOB_R);
        const ty = this.floorY - BOB_LOW - BOB_LIFT;
        this.bobX = lerp(this.cockX, tx, k) + (k >= 1 ? Math.sin(this.clock * 50) * 1.2 : 0);
        this.bobY = lerp(this.cockY, ty, k);
        break;
      }
      case 'sweep': {
        const b = this.bobAt(this.pendT);
        this.bobX = b.x;
        this.bobY = b.y;
        if (this.pendT >= this.pendBeat * 2) {
          this.pendMode = 'settle';
          this.pendT = 0;
          this.cockX = this.bobX;
          this.cockY = this.bobY;
        }
        break;
      }
      case 'settle': {
        const k = easeOut(clamp(this.pendT / (this.beatLen * 0.9), 0, 1), 2);
        this.bobX = lerp(this.cockX, pivotX, k);
        this.bobY = lerp(this.cockY, pivotY + REST_LEN, k);
        if (k >= 1) this.pendMode = 'rest';
        break;
      }
      case 'jammed':
        // Stuck where the guard caught it, down on the floor, rattling.
        this.bobY = approach(this.bobY, this.floorY - BOB_R, dt * 300);
        this.bobX += Math.sin(this.clock * 60) * 0.6;
        if (this.state !== 'jammed' && this.state !== 'dying') {
          this.pendMode = 'settle';
          this.pendT = 0;
          this.cockX = this.bobX;
          this.cockY = this.bobY;
        }
        break;
    }
    if (this.pendMode === 'cock' || this.pendMode === 'rest') {
      this.cockX = this.pendMode === 'rest' ? this.bobX : this.cockX;
      this.cockY = this.pendMode === 'rest' ? this.bobY : this.cockY;
    }
  }

  /* ---------------------------------------------------------------- dying */

  private updateDying(dt: number, world: World): void {
    this.timer -= dt;
    this.shudder = Math.max(this.shudder, 0.6);
    this.lit = Math.max(0, this.lit - dt * 0.3);
    this.updatePendulum(dt);
    // The ticks run down, further and further apart.
    this.dyingTick -= dt;
    if (this.dyingTick <= 0 && this.timer > 1.1) {
      this.dyingGap *= 1.35;
      this.dyingTick = this.dyingGap;
      this.lamp = 1;
      this.beatCount++;
      audio.play('blip', Math.max(0.6, 1.6 - this.dyingGap));
      world.particles.burst(this.cx + rand(-30, 30), this.floorY - rand(30, 100), 6, '#ffd890', { speed: 160, gravity: 500, shape: 'spark' });
    }
    this.steam(world, 0.07, 1.4);
    if (this.timer < 1.1 && this.debris.length === 0) this.comeApart(world);
    for (const d of this.debris) {
      d.vy += 1300 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.rot += d.spin * dt;
      if (d.y > this.floorY - d.r * 0.5) {
        d.y = this.floorY - d.r * 0.5;
        d.vy *= -0.3;
        d.vx *= 0.6;
        d.spin *= 0.6;
      }
    }
    if (this.timer <= 0) {
      this.die(world);
      world.onBossFelled('clock', this.cx, this.floorY - H - 20);
    }
  }

  private comeApart(world: World): void {
    audio.play('crumble', 1.1);
    audio.play('explode', 1.5);
    audio.play('bossDown', 1.2);
    world.camera.addShake(9);
    const kinds: Debris['kind'][] = ['face', 'bell', 'bell', 'gear', 'gear', 'gear', 'gear', 'plate', 'plate', 'plate', 'plate'];
    this.debris = kinds.map((kind) => ({
      x: this.cx + rand(-24, 24),
      y: this.floorY - (kind === 'face' ? FACE_Y : kind === 'bell' ? H : rand(20, 80)),
      vx: rand(-200, 200),
      vy: rand(-460, -160),
      rot: rand(0, TAU),
      spin: rand(-9, 9),
      r: kind === 'face' ? FACE_R : kind === 'bell' ? 8 : kind === 'gear' ? rand(6, 11) : rand(8, 14),
      kind,
    }));
    world.particles.burst(this.cx, this.floorY - 60, 40, '#ffd890', { speed: 280, gravity: 600, shape: 'spark' });
    world.particles.burst(this.cx, this.floorY - 60, 24, 'rgba(230,226,220,0.6)', { speed: 160, gravity: -50, size: 5 });
  }

  /* --------------------------------------------------------------- lights */

  override lights(): GlowLight[] {
    const out: GlowLight[] = [];
    if (this.debris.length > 0) {
      out.push({ x: this.cx, y: this.floorY - 20, radius: 120 * this.lit + 40, rgb: '255,196,120', strength: 0.5, tint: 0.3 });
      return out;
    }
    // Few and small: a light costs the lighting pass its whole square, twice.
    // One for all of him, from inside the dial, brighter with the works open.
    const faceY = this.floorY - FACE_Y;
    const lit = this.state === 'dormant' ? 0.3 : this.lit;
    out.push({ x: this.cx, y: faceY + 22, radius: 70 + 45 * lit + this.glass * 30, rgb: '255,204,130', strength: 0.45 + this.glass * 0.25, tint: 0.26 });
    if (this.lamp > 0.3) out.push({ x: this.cx, y: this.floorY - H - 10, radius: 34 * this.lamp, rgb: this.phaseTwo ? '255,120,80' : '255,214,140', strength: 0.55, tint: 0.4 });
    if (this.signGlow > 0.05 && this.move) {
      const a = SIGN_ANGLE[this.move];
      out.push({ x: this.cx + Math.cos(a) * 18, y: faceY + Math.sin(a) * 18, radius: 46 * this.signGlow, rgb: '255,170,80', strength: 0.6, tint: 0.5 });
    }
    if (this.pendMode === 'cock' || this.pendMode === 'sweep') out.push({ x: this.bobX, y: this.bobY, radius: 60, rgb: '255,200,120', strength: 0.6, tint: 0.3 });
    return out;
  }

  /* -------------------------------------------------------------- drawing */

  override draw(ctx: CanvasRenderingContext2D): void {
    if (this.floorY === 0) return;
    if (this.debris.length > 0) {
      this.drawDebris(ctx);
      return;
    }
    const cx = this.cx + (this.shudder > 0 ? Math.sin(this.clock * 70) * 2 * this.shudder : 0);
    const floor = this.floorY;
    shadow(ctx, this.cx, floor, W * 1.1, 0.35);
    ctx.save();
    ctx.translate(cx, floor);
    // Legs, key and belly turn with him; the pendulum, the bells and the face
    // do not - a clock that ran backwards would be a different clock.
    ctx.save();
    ctx.scale(this.facing, 1);
    this.drawLegs(ctx);
    this.drawKey(ctx);
    ctx.restore();
    this.drawPendulum(ctx, cx);
    ctx.save();
    ctx.scale(this.facing, 1);
    this.drawTorso(ctx);
    ctx.restore();
    this.drawBells(ctx);
    this.drawFace(ctx);
    if (this.flash > 0) this.drawFlash(ctx);
    ctx.restore();
  }

  /**
   * The hit flash, as light laid over his shape rather than as a canvas
   * filter: a filter is paid again for every one of the hundred-odd shapes he
   * is drawn from, and measured, it tripled what drawing him cost.
   */
  private drawFlash(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255,236,200,${(0.5 * Math.min(1, this.flash)).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(0, -FACE_Y, FACE_R + 4, 0, TAU);
    ctx.rect(-33, -70, 66, 28);
    ctx.rect(-28, -46, 16, 46);
    ctx.rect(12, -46, 16, 46);
    ctx.fill();
    ctx.restore();
  }

  private brassFill(ctx: CanvasRenderingContext2D, x0: number, x1: number): void {
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, BRASS_DARK);
    g.addColorStop(0.3, BRASS);
    g.addColorStop(0.55, BRASS_HI);
    g.addColorStop(1, BRASS_MID);
    ctx.fillStyle = g;
  }

  /** Piston legs: brass cylinders, steel rods, broad feet. */
  private drawLegs(ctx: CanvasRenderingContext2D): void {
    for (const s of [-1, 1]) {
      const stepping = this.stepT < 1 && s === this.stepFoot;
      const lift = stepping ? Math.sin(Math.PI * this.stepT) * 7 : 0;
      const lx = s * 20;
      // Rod.
      ctx.fillStyle = STEEL_DARK;
      ctx.fillRect(lx - 3, -30 - lift, 6, 23);
      ctx.fillStyle = STEEL;
      ctx.fillRect(lx - 2, -30 - lift, 2, 23);
      // Foot and ankle.
      ctx.fillStyle = BRASS_DARK;
      ctx.beginPath();
      ctx.moveTo(lx - 13, -lift);
      ctx.lineTo(lx - 11, -8 - lift);
      ctx.lineTo(lx + 11, -8 - lift);
      ctx.lineTo(lx + 14, -lift);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = BRASS_MID;
      ctx.fillRect(lx - 11, -8 - lift, 22, 2);
      ctx.fillStyle = STEEL;
      ctx.beginPath();
      ctx.arc(lx, -9 - lift, 3.5, 0, TAU);
      ctx.fill();
      // Cylinder.
      this.brassFill(ctx, lx - 8, lx + 8);
      ctx.fillRect(lx - 8, -46, 16, 20 - lift * 0.3);
      ctx.fillStyle = BRASS_EDGE;
      ctx.fillRect(lx - 8, -28 - lift * 0.3, 16, 3);
      ctx.fillStyle = BRASS_HI;
      ctx.fillRect(lx - 8, -42, 16, 2);
      ctx.fillStyle = BRASS_EDGE;
      ctx.beginPath();
      ctx.arc(lx, -35, 2, 0, TAU);
      ctx.fill();
    }
  }

  /** The key in his back: turning a notch a tick, and fast while he winds. */
  private drawKey(ctx: CanvasRenderingContext2D): void {
    const turn = this.state === 'wind' || this.state === 'intro' ? this.keyAngle : (this.beatCount * Math.PI) / 8;
    const kx = -38;
    const ky = -58;
    ctx.fillStyle = BRASS_MID;
    ctx.fillRect(kx, ky - 2.5, 8, 5);
    const spread = Math.cos(turn);
    for (const s of [-1, 1]) {
      ctx.fillStyle = s * spread > 0 ? BRASS_HI : BRASS_MID;
      ctx.beginPath();
      ctx.ellipse(kx - 4, ky + s * 8 * Math.abs(spread), 5, 7 * Math.abs(spread) + 1, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = BRASS_EDGE;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    ctx.fillStyle = BRASS_EDGE;
    ctx.beginPath();
    ctx.arc(kx - 4, ky, 2.5, 0, TAU);
    ctx.fill();
  }

  /** The hips, the belly with its window on the works, and the hatch the gears come out of. */
  private drawTorso(ctx: CanvasRenderingContext2D): void {
    // Hips.
    this.brassFill(ctx, -32, 32);
    ctx.fillRect(-32, -50, 64, 8);
    ctx.fillStyle = BRASS_EDGE;
    ctx.fillRect(-32, -43, 64, 2);
    ctx.fillStyle = BRASS_HI;
    for (const rx of [-26, -13, 13, 26]) ctx.fillRect(rx - 1, -48, 2, 2);
    // Belly.
    this.brassFill(ctx, -31, 31);
    ctx.beginPath();
    ctx.moveTo(-30, -50);
    ctx.lineTo(-33, -66);
    ctx.quadraticCurveTo(0, -72, 33, -66);
    ctx.lineTo(30, -50);
    ctx.closePath();
    ctx.fill();
    // The window, and the works turning behind it.
    ctx.fillStyle = '#1c120a';
    ctx.fillRect(-22, -63, 40, 11);
    ctx.save();
    ctx.beginPath();
    ctx.rect(-22, -63, 40, 11);
    ctx.clip();
    const spin = this.gearSpin + this.beatCount * 0.35;
    drawGear(ctx, -12, -57, 8, 8, spin, BRASS_MID, BRASS, BRASS_EDGE);
    drawGear(ctx, 2, -55, 7, 7, -spin * 1.15 + 0.2, BRASS, BRASS_HI, BRASS_EDGE);
    drawGear(ctx, 13, -60, 5, 6, spin * 1.6, BRASS_MID, BRASS, BRASS_EDGE);
    ctx.restore();
    ctx.strokeStyle = BRASS_EDGE;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-22, -63, 40, 11);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(-21, -62, 38, 2);
    // The hatch the gears drop out of: a slot that glows open.
    ctx.fillStyle = '#26170b';
    ctx.fillRect(20, -62, 9, 11);
    if (this.hatch > 0.02) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, 25, -57, 16, `rgba(255,190,100,${(0.6 * this.hatch).toFixed(3)})`);
      ctx.restore();
      ctx.fillStyle = `rgba(255,214,140,${(0.8 * this.hatch).toFixed(3)})`;
      ctx.fillRect(21, -61, 7, 9 * this.hatch);
    }
    // Vents on the shoulders, either side of the face.
    for (const s of [-1, 1]) {
      ctx.fillStyle = BRASS_DARK;
      ctx.fillRect(s * 29 - 3, -76, 6, 10);
      ctx.fillStyle = BRASS;
      ctx.fillRect(s * 29 - 4, -78, 8, 3);
    }
  }

  /** The two bells on his head, the hammer between them, and the lamp that blinks on every tick. */
  private drawBells(ctx: CanvasRenderingContext2D): void {
    const top = -FACE_Y - FACE_R + 2;
    const ring = this.hammerRing;
    for (const s of [-1, 1]) {
      const bx = s * 16 + (ring > 0 ? Math.sin(this.clock * 80 + s) * ring * 1.5 : 0);
      const by = top - 3;
      ctx.fillStyle = BRASS_DARK;
      ctx.fillRect(s * 9 - 1, top - 2, 2, 4);
      const g = ctx.createLinearGradient(bx - 9, 0, bx + 9, 0);
      g.addColorStop(0, BRASS_MID);
      g.addColorStop(0.45, BRASS_HI);
      g.addColorStop(1, BRASS_DARK);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(bx, by, 9, Math.PI, TAU);
      ctx.lineTo(bx + 10, by + 2);
      ctx.lineTo(bx - 10, by + 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = BRASS_EDGE;
      ctx.beginPath();
      ctx.arc(bx, by - 9, 1.6, 0, TAU);
      ctx.fill();
      if (ring > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(255,236,180,${(0.7 * ring).toFixed(3)})`;
        ctx.lineWidth = 1.5;
        for (let i = 1; i <= 2; i++) {
          ctx.beginPath();
          ctx.arc(bx, by - 2, 9 + i * 6 * (1.2 - ring), Math.PI * 1.05, Math.PI * 1.95);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
    // The hammer: drawn back as the bell's bar runs, and through on the blow.
    const a = this.hammer * 0.9;
    ctx.save();
    ctx.translate(0, top + 1);
    ctx.rotate(a);
    ctx.fillStyle = STEEL_DARK;
    ctx.fillRect(-1.2, -14, 2.4, 14);
    ctx.fillStyle = STEEL;
    ctx.beginPath();
    ctx.arc(0, -15, 3.6, 0, TAU);
    ctx.fill();
    ctx.restore();
    // The lamp.
    const lampY = top - 20;
    ctx.fillStyle = BRASS_DARK;
    ctx.fillRect(-2, lampY + 3, 4, 4);
    const on = this.state === 'dormant' ? 0 : this.lamp;
    const rgb = this.phaseTwo ? '255,120,80' : '255,220,140';
    ctx.fillStyle = on > 0.05 ? `rgba(${rgb},${(0.45 + on * 0.55).toFixed(3)})` : '#4a3420';
    ctx.beginPath();
    ctx.arc(0, lampY, 3.6, 0, TAU);
    ctx.fill();
    if (on > 0.05) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, 0, lampY, 14 + on * 10, `rgba(${rgb},${(0.6 * on).toFixed(3)})`);
      ctx.restore();
    }
  }

  /**
   * The face: a brass bezel, an ivory dial lit from inside, the four signs,
   * the hour and minute hands and the red second hand that jumps a quarter
   * turn a tick - on twelve for every downbeat. Drawn unmirrored, whichever
   * way he faces: a clock that ran backwards would be a different clock.
   */
  private drawFace(ctx: CanvasRenderingContext2D): void {
    const fy = -FACE_Y;
    const lit = this.state === 'dormant' ? 0.15 : this.lit;
    ctx.save();
    // Bezel.
    const bezel = ctx.createLinearGradient(-FACE_R, fy - FACE_R, FACE_R, fy + FACE_R);
    bezel.addColorStop(0, BRASS_HI);
    bezel.addColorStop(0.5, BRASS);
    bezel.addColorStop(1, BRASS_DARK);
    ctx.fillStyle = bezel;
    ctx.beginPath();
    ctx.arc(0, fy, FACE_R + 4, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = BRASS_EDGE;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // The dial - or, with the glass up while he winds, the works behind it.
    const open = this.glass;
    const dial = ctx.createRadialGradient(0, fy, 2, 0, fy, FACE_R);
    dial.addColorStop(0, `rgb(${Math.round(150 + 80 * lit)},${Math.round(132 + 78 * lit)},${Math.round(98 + 60 * lit)})`);
    dial.addColorStop(1, `rgb(${Math.round(112 + 66 * lit)},${Math.round(92 + 56 * lit)},${Math.round(62 + 36 * lit)})`);
    ctx.fillStyle = dial;
    ctx.beginPath();
    ctx.arc(0, fy, FACE_R, 0, TAU);
    ctx.fill();
    if (open > 0.02) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, fy, FACE_R - 1, 0, TAU);
      ctx.clip();
      ctx.globalAlpha = open;
      ctx.fillStyle = '#20140a';
      ctx.fillRect(-FACE_R, fy - FACE_R, FACE_R * 2, FACE_R * 2);
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, 0, fy, FACE_R + 6, 'rgba(255,200,110,0.55)');
      ctx.globalCompositeOperation = 'source-over';
      const spin = this.keyAngle * 0.6;
      drawGear(ctx, -9, fy - 7, 11, 10, spin, BRASS, BRASS_HI, BRASS_EDGE);
      drawGear(ctx, 10, fy + 2, 9, 9, -spin * 1.2, BRASS_MID, BRASS_HI, BRASS_EDGE);
      drawGear(ctx, -4, fy + 13, 7, 8, spin * 1.5, BRASS, BRASS_HI, BRASS_EDGE);
      // The spring he is winding.
      ctx.strokeStyle = STEEL;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) {
        const a = (i / 40) * Math.PI * 6 + spin;
        const r = 1 + i * 0.22;
        const px = 12 + Math.cos(a) * r;
        const py = fy - 12 + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Hour ticks.
    ctx.strokeStyle = `rgba(70,46,22,${(1 - open * 0.7).toFixed(3)})`;
    for (let i = 0; i < 12; i++) {
      if (i % 3 === 0) continue;
      const a = (i / 12) * TAU;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (FACE_R - 2), fy + Math.sin(a) * (FACE_R - 2));
      ctx.lineTo(Math.cos(a) * (FACE_R - 5), fy + Math.sin(a) * (FACE_R - 5));
      ctx.stroke();
    }

    // The four signs, and the one he is about to use burning.
    for (const m of MOVES) {
      const a = SIGN_ANGLE[m];
      const on = this.move === m && this.state === 'tell' ? this.signGlow : 0;
      const sx = Math.cos(a) * 18;
      const sy = fy + Math.sin(a) * 18;
      if (on > 0.02) {
        // Lit: a dark window round it with the sign burning in it, and a ring
        // of light that beats with the count.
        ctx.fillStyle = `rgba(40,16,4,${(0.9 * on).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(sx, sy, 7.5 * (1 + on * 0.3), 0, TAU);
        ctx.fill();
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const pulse = 0.7 + this.lamp * 0.3;
        glow(ctx, sx, sy, 13 + on * 8, `rgba(255,170,60,${(0.55 * on * pulse).toFixed(3)})`);
        ctx.restore();
        ctx.strokeStyle = `rgba(255,200,90,${(0.9 * on * pulse).toFixed(3)})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(sx, sy, 7.5 * (1 + on * 0.3) + 1, 0, TAU);
        ctx.stroke();
      }
      drawSign(ctx, m, sx, sy, 1 + on * 0.3, on > 0.3 ? '#ffd65a' : `rgba(70,42,18,${(1 - open * 0.7).toFixed(3)})`, on);
    }

    // Hands: hour, minute - unless they are out over the floor - and the second hand.
    const handsOut = this.spears.some((s) => s.out);
    if (!handsOut) {
      drawHand(ctx, 0, fy, HOUR_REST, 10, 'hour', 1);
      // The minute hand points at a sign rather than covering it.
      drawHand(ctx, 0, fy, this.minuteAngle, 12.5, 'minute', 1);
    }
    const second = (this.beat / 4) * TAU - Math.PI / 2;
    if (!handsOut || this.spears.length < 3) {
      ctx.strokeStyle = '#c0302a';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-Math.cos(second) * 5, fy - Math.sin(second) * 5);
      ctx.lineTo(Math.cos(second) * 15, fy + Math.sin(second) * 15);
      ctx.stroke();
    }
    // The hub, which lights with the lamp.
    ctx.fillStyle = BRASS_EDGE;
    ctx.beginPath();
    ctx.arc(0, fy, 3.4, 0, TAU);
    ctx.fill();
    if (this.lamp > 0.05 && this.state !== 'dormant') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, 0, fy, 9, `rgba(255,214,140,${(0.7 * this.lamp).toFixed(3)})`);
      ctx.restore();
    }

    // The glass: a sheen over the dial, or flipped up on its hinge while he winds.
    if (open < 0.98) {
      ctx.fillStyle = `rgba(255,255,255,${(0.14 * (1 - open)).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(-7, fy - 10, 13, 7, -0.5, 0, TAU);
      ctx.fill();
    }
    if (open > 0.02) {
      ctx.save();
      ctx.translate(0, fy - FACE_R - 3);
      ctx.scale(1, Math.max(0.12, 1 - open * 0.88));
      ctx.fillStyle = 'rgba(200,230,255,0.22)';
      ctx.strokeStyle = 'rgba(240,250,255,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(0, -FACE_R * open * 0.9, FACE_R, FACE_R, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  /** The pendulum: a telescoping rod from his hips, and the brass bob on it. */
  private drawPendulum(ctx: CanvasRenderingContext2D, drawnCx: number): void {
    const px = 0;
    const py = -PIVOT_Y;
    const bx = this.bobX - drawnCx;
    const by = this.bobY - this.floorY;
    const len = Math.hypot(bx - px, by - py);
    const ang = Math.atan2(by - py, bx - px);
    const sweeping = this.pendMode === 'sweep';
    if (sweeping) {
      // The blur of it going past.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 1; i <= 3; i++) {
        const b = this.bobAt(Math.max(0, this.pendT - i * 0.025));
        glow(ctx, b.x - drawnCx, b.y - this.floorY, BOB_R + 4, `rgba(255,214,140,${(0.28 - i * 0.07).toFixed(3)})`);
      }
      ctx.restore();
    }
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(ang);
    // Outer tube, then the steel rod that slides out of it.
    const tube = Math.min(len, 34);
    ctx.fillStyle = BRASS_MID;
    ctx.fillRect(0, -3, tube, 6);
    ctx.fillStyle = BRASS_HI;
    ctx.fillRect(0, -3, tube, 1.5);
    if (len > tube) {
      ctx.fillStyle = STEEL_DARK;
      ctx.fillRect(tube - 2, -1.8, len - tube + 2, 3.6);
      ctx.fillStyle = STEEL;
      ctx.fillRect(tube - 2, -1.8, len - tube + 2, 1.2);
    }
    ctx.restore();
    ctx.fillStyle = BRASS_EDGE;
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, TAU);
    ctx.fill();
    // The bob.
    const g = ctx.createRadialGradient(bx - 5, by - 5, 2, bx, by, BOB_R);
    g.addColorStop(0, BRASS_HI);
    g.addColorStop(0.6, BRASS);
    g.addColorStop(1, BRASS_DARK);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(bx, by, BOB_R, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = BRASS_EDGE;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(60,36,14,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(bx, by, BOB_R - 5, 0, TAU);
    ctx.stroke();
    if (this.pendMode === 'cock' || sweeping) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, bx, by, BOB_R + 10, `rgba(255,220,150,${sweeping ? '0.5' : (0.2 + this.lamp * 0.25).toFixed(3)})`);
      ctx.restore();
    }
  }

  private drawDebris(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    for (const d of this.debris) {
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rot);
      switch (d.kind) {
        case 'gear':
          drawGear(ctx, 0, 0, d.r, 8, 0, BRASS, BRASS_HI, BRASS_EDGE);
          break;
        case 'face':
          ctx.fillStyle = BRASS;
          ctx.beginPath();
          ctx.arc(0, 0, d.r + 3, 0, TAU);
          ctx.fill();
          ctx.fillStyle = '#cbb894';
          ctx.beginPath();
          ctx.arc(0, 0, d.r, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = 'rgba(60,40,20,0.8)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(-d.r * 0.6, -d.r * 0.2);
          ctx.lineTo(0, 0.1 * d.r);
          ctx.lineTo(d.r * 0.5, -d.r * 0.5);
          ctx.moveTo(0, 0);
          ctx.lineTo(0.2 * d.r, d.r * 0.7);
          ctx.stroke();
          break;
        case 'bell':
          ctx.fillStyle = BRASS_HI;
          ctx.beginPath();
          ctx.arc(0, 0, d.r, Math.PI, TAU);
          ctx.fill();
          break;
        default:
          ctx.fillStyle = BRASS_MID;
          ctx.fillRect(-d.r, -d.r * 0.4, d.r * 2, d.r * 0.8);
          ctx.fillStyle = BRASS_HI;
          ctx.fillRect(-d.r, -d.r * 0.4, d.r * 2, 1.5);
          break;
      }
      ctx.restore();
    }
    ctx.restore();
  }
}

/* ============================================================== drawing kit */

/** A gear: a ring of teeth, a rim, spokes and a hub. */
function drawGear(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  teeth: number,
  rot: number,
  body: string,
  light: string,
  edge: string,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = body;
  ctx.beginPath();
  const inner = r * 0.78;
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * TAU;
    const a1 = a0 + (0.5 / teeth) * TAU;
    const w = (0.12 / teeth) * TAU;
    ctx.lineTo(Math.cos(a0 - w) * inner, Math.sin(a0 - w) * inner);
    ctx.lineTo(Math.cos(a0 + w) * r, Math.sin(a0 + w) * r);
    ctx.lineTo(Math.cos(a1 - w) * r, Math.sin(a1 - w) * r);
    ctx.lineTo(Math.cos(a1 + w) * inner, Math.sin(a1 + w) * inner);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(0, 0, inner * 0.62, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = edge;
  ctx.lineWidth = Math.max(1, r * 0.12);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * inner * 0.8, Math.sin(a) * inner * 0.8);
    ctx.stroke();
  }
  ctx.fillStyle = edge;
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(1.2, r * 0.18), 0, TAU);
  ctx.fill();
  ctx.restore();
}

/**
 * A clock hand, from its pivot outwards at an angle: the minute hand long with
 * a spade tip, the hour hand short and broad, the second hand a red needle.
 */
function drawHand(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  length: number,
  kind: 'minute' | 'hour' | 'second',
  alpha: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.globalAlpha = alpha;
  const color = kind === 'second' ? '#b02a24' : '#2a1a0c';
  const width = kind === 'hour' ? length * 0.16 : kind === 'minute' ? length * 0.1 : length * 0.06;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-length * 0.12, -width * 0.5);
  ctx.lineTo(length * 0.72, -width * 0.5);
  ctx.lineTo(length * 0.8, -width * 1.6);
  ctx.lineTo(length, 0);
  ctx.lineTo(length * 0.8, width * 1.6);
  ctx.lineTo(length * 0.72, width * 0.5);
  ctx.lineTo(-length * 0.12, width * 0.5);
  ctx.closePath();
  ctx.fill();
  if (length > 30) {
    // Out over the floor, it carries a brass edge so it reads against the dark.
    ctx.strokeStyle = kind === 'second' ? '#ff9a80' : BRASS_HI;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = BRASS;
    ctx.beginPath();
    ctx.arc(length * 0.3, 0, width * 0.9, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/** The signs round his dial. */
function drawSign(ctx: CanvasRenderingContext2D, move: Move, x: number, y: number, scale: number, color: string, on: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.3;
  switch (move) {
    case 'bell':
      ctx.beginPath();
      ctx.moveTo(-4, 2.5);
      ctx.quadraticCurveTo(-4, -4, 0, -4);
      ctx.quadraticCurveTo(4, -4, 4, 2.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(-5, 2, 10, 1.4);
      ctx.beginPath();
      ctx.arc(0, 4.3, 1.2, 0, TAU);
      ctx.fill();
      break;
    case 'gears':
      drawGear(ctx, 0, 0, 4.6, 6, on * 2, color, 'rgba(0,0,0,0)', color);
      break;
    case 'pendel':
      ctx.beginPath();
      ctx.moveTo(0, -4.5);
      ctx.lineTo(1.6, 1.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(2, 2.6, 2.4, 0, TAU);
      ctx.fill();
      break;
    case 'hands':
      ctx.beginPath();
      ctx.moveTo(-1.2, -4.5);
      ctx.lineTo(1.2, -4.5);
      ctx.lineTo(1.2, 1);
      ctx.lineTo(3, 1);
      ctx.lineTo(0, 5);
      ctx.lineTo(-3, 1);
      ctx.lineTo(-1.2, 1);
      ctx.closePath();
      ctx.fill();
      break;
  }
  ctx.restore();
}
