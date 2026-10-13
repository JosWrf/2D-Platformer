import { audio } from '../core/audio';
import { Rect, approach, clamp, damp, rand, rectsOverlap, sign } from '../core/math';
import { RAMP } from '../render/palette';
import { oval, ring } from '../render/pen';
import { ART, snap, type PixelSprite } from '../render/pixel';
import type { World } from '../world/context';
import {
  FIST,
  FIST_GHOST,
  FIST_PX,
  FIST_PY,
  HEAD,
  HEAD_CX,
  HEAD_CY,
  MOUND,
  MOUND_H,
  MOUND_W,
  PEBBLES,
  RING,
  RING_SIDE,
  SHARDS,
  SUN,
  SUN_R,
  SUN_X,
  SUN_Y,
  TORSO,
  TORSO_CX,
  TORSO_DEATH,
  TORSO_H,
  ellipseCells,
  glowColor,
  sprite,
  type Glow,
  type HeadLook,
} from './colossus-art';
import { Enemy, type GlowLight } from './enemy';
import { Projectile } from './projectile';

/**
 * Health before the blade is sized up. Between Gallert's twenty-two and
 * Thalassa's sixty: he is the fourth boss of the game, after Gallert,
 * Grimmzahn and Gierschlund.
 */
const COLOSSUS_HP = 54;
/** Damage a hand takes before it shatters and he sags forward. */
const HAND_POISE = 8;
const HAND_W = 60;
const HAND_H = 48;
const HEAD_W = 74;
const HEAD_H = 72;
/** Half the width of the sun column, the part that burns. */
const BEAM_HALF = 20;

type HandState =
  | 'rest'
  | 'hover'
  | 'lift'
  | 'track'
  | 'drop'
  | 'floor'
  | 'toEdge'
  | 'lower'
  | 'sweepWind'
  | 'sweep'
  | 'broken'
  | 'reform';

interface Shard {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  spin: number;
  rot: number;
}

interface Hand {
  side: -1 | 1;
  x: number;
  y: number;
  state: HandState;
  timer: number;
  /** What is left of its poise. */
  crack: number;
  flash: number;
  /** Its runes, which are the tell: they fill before it moves. */
  glow: number;
  /** One hurt per move. */
  hit: boolean;
  dir: number;
  /** Seconds before a queued lift starts - the second fist of a pair. */
  delay: number;
  /** How the fist is turned: 0 knuckles down, ±π/2 knuckles forward. */
  turn: number;
  shards: Shard[];
}

interface Beam {
  x: number;
  stage: 'mark' | 'burn' | 'fade';
  t: number;
}

/**
 * Ankhor, der Tempelkoloss - the guardian the ruins were built around, buried
 * to the chest in his own court with his hands still his to use.
 *
 * He does not walk, so the fight is about his hands, and every move they make
 * says what it is before it happens:
 *
 *   Faustschlag  - a fist rises over the hero and follows him, its shadow
 *                  growing on the floor, then stops dead for a breath and
 *                  comes down. Step out of the shadow. The fist then lies on
 *                  the floor long enough to be hit.
 *   Wischer      - a hand goes to the far wall, lowers to the floor and scrapes
 *                  across the whole court. Jump it, or be on a ledge.
 *   Sonnenblick  - he looks up, and the sky answers: a column of sunlight
 *                  comes down on the hero and follows him, slower than he runs.
 *   Doppelschlag - from half health on, both fists, one after the other.
 *
 * Every part of him can be hit, and every hit counts - but his face takes
 * double, and a fist that has taken enough (or has been parried) shatters.
 * Without it he sags forward, his head comes down to where a sword can reach
 * it from the floor, and that is the opening the fight is built around.
 */
export class Colossus extends Enemy {
  private state: 'dormant' | 'intro' | 'idle' | 'slam' | 'sweep' | 'gaze' | 'slumped' | 'dying' = 'dormant';
  private timer = 0;
  private readonly hands: Hand[];
  private floorY: number;
  private baseX: number;
  private arenaLeft = 0;
  private arenaRight = 0;
  private lastMove = '';
  /** 0 upright, 1 sagging forward with his head at sword height. */
  private slump = 0;
  /** 0 buried and asleep, 1 risen. */
  private rise = 0;
  private eyes = 0;
  private headFlash = 0;
  /** 1 while he looks up at the sky for the sun column. */
  private gazeUp = 0;
  private struck: 'head' | 0 | 1 | null = null;
  private poiseMax = HAND_POISE;
  private beam: Beam | null = null;
  private phaseTwo = false;
  /** Stones circling his shoulders, for the sense of something held up by will. */
  private readonly pebbles: { a: number; r: number; s: number; size: number }[] = [];

  constructor(x: number, y: number) {
    super('colossus', x, y);
    this.w = 150;
    this.h = 210;
    this.hp = this.maxHp = COLOSSUS_HP;
    this.scoreValue = 900;
    this.contactDamage = 0;
    this.aggroRange = 560;
    this.baseX = x + 16;
    this.x = this.baseX - this.w / 2;
    this.floorY = y + 32;
    this.hands = ([-1, 1] as const).map((side) => ({
      side,
      x: this.baseX + side * 168,
      y: this.floorY - HAND_H / 2,
      state: 'rest' as HandState,
      timer: 0,
      crack: HAND_POISE,
      flash: 0,
      glow: 0,
      hit: false,
      dir: 0,
      delay: 0,
      turn: 0,
      shards: [],
    }));
    for (let i = 0; i < 9; i++) {
      this.pebbles.push({ a: rand(0, Math.PI * 2), r: rand(96, 128), s: rand(0.25, 0.5) * (i % 2 ? 1 : -1), size: rand(3, 7) });
    }
  }

  get phase(): 1 | 2 {
    return this.phaseTwo ? 2 : 1;
  }

  override castLight = false;

  override barName(): string {
    return 'ANKHOR   ·   DER TEMPELKOLOSS';
  }

  override barPhase(): number {
    return this.phase;
  }

  /** How much quicker everything comes in his second half. */
  private get haste(): number {
    return this.phaseTwo ? 0.8 : 1;
  }

  protected override deathColor(): string {
    return '#c9a877';
  }

  /* ------------------------------------------------------------- geometry */

  private get headX(): number {
    return this.baseX;
  }

  private get headY(): number {
    const buried = (1 - this.rise) * 118;
    return this.floorY - 170 + buried + Math.min(1.1, this.slump) * 122 - this.gazeUp * 6;
  }

  private headRect(): Rect {
    return { x: this.headX - HEAD_W / 2, y: this.headY - HEAD_H / 2, w: HEAD_W, h: HEAD_H };
  }

  private handRect(hand: Hand): Rect {
    const sideways = Math.abs(Math.sin(hand.turn)) > 0.7;
    const w = sideways ? HAND_H : HAND_W;
    const h = sideways ? HAND_W : HAND_H;
    return { x: hand.x - w / 2, y: hand.y - h / 2, w, h };
  }

  private homeOf(hand: Hand): { x: number; y: number } {
    const low = this.state === 'slumped' ? 60 : 0;
    return {
      x: this.baseX + hand.side * 168,
      y: this.floorY - 128 + low + Math.sin(this.anim * 1.6 + hand.side) * 6,
    };
  }

  private get usableHands(): Hand[] {
    return this.hands.filter((h) => h.state !== 'broken' && h.state !== 'reform');
  }

  /* ------------------------------------------------------------ targeting */

  /**
   * His face and his hands are targets; his chest and shoulders are the wall
   * of the court. Whatever the blade touched is remembered for hurt(), the
   * same way the hydra remembers which head it was.
   */
  override overlaps(r: Rect): boolean {
    this.struck = null;
    if (this.state === 'dormant' || this.state === 'intro' || this.state === 'dying') return false;
    if (rectsOverlap(this.headRect(), r)) {
      this.struck = 'head';
      return true;
    }
    for (let i = 0; i < 2; i++) {
      const hand = this.hands[i];
      if (hand.state === 'broken' || hand.state === 'reform') continue;
      if (rectsOverlap(this.handRect(hand), r)) {
        this.struck = i as 0 | 1;
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
    // A blow that arrives without a part - a parry's shove - lands nowhere.
    if (part === null) return;
    this.flash = 1;
    if (part === 'head') {
      this.hp -= amount * 2;
      this.headFlash = 1;
      world.particles.burst(this.headX, this.headY, 12, '#f3dca8', { speed: 180, gravity: 400, size: 3 });
      audio.play('bossHit', 1.15);
    } else {
      const hand = this.hands[part];
      this.hp -= amount;
      hand.flash = 1;
      hand.crack -= amount;
      world.particles.burst(hand.x, hand.y, 8, '#b59c78', { speed: 150, gravity: 500, size: 3 });
      audio.play('bossHit', 0.75);
      if (hand.crack <= 0 && this.poiseLock <= 0 && this.hp > 0) this.shatter(hand, world);
    }
    if (this.hp <= 0) this.beginDying(world);
    else if (!this.phaseTwo && this.hp <= this.maxHp / 2) this.enterPhaseTwo(world);
  }

  /** A fist breaks apart, and he sags without it. */
  private shatter(hand: Hand, world: World): void {
    hand.state = 'broken';
    hand.timer = 6;
    hand.glow = 0;
    hand.shards = [];
    for (let i = 0; i < 9; i++) {
      hand.shards.push({
        x: hand.x + rand(-20, 20),
        y: hand.y + rand(-16, 16),
        vx: rand(-220, 220),
        vy: rand(-380, -120),
        r: rand(6, 13),
        spin: rand(-8, 8),
        rot: rand(0, 6),
      });
    }
    this.poiseLock = 4;
    this.beam = null;
    for (const other of this.hands) {
      if (other !== hand && other.state !== 'broken' && other.state !== 'reform') other.state = 'hover';
    }
    this.state = 'slumped';
    this.timer = 3.3;
    audio.play('crumble');
    audio.play('bossRoar', 0.62);
    world.camera.addShake(8);
    world.hitStop(0.09);
    world.particles.burst(hand.x, hand.y, 26, '#d8c49a', { speed: 260, gravity: 520, size: 4 });
    world.particles.text(this.headX, this.headY - 60, 'ER WANKT!', '#ffd89a');
  }

  private enterPhaseTwo(world: World): void {
    this.phaseTwo = true;
    audio.play('phase', 0.8);
    audio.play('bossRoar', 0.7);
    world.camera.addShake(7);
    world.particles.burst(this.headX, this.headY, 30, '#fff1c8', { speed: 240, gravity: -40, shape: 'spark' });
  }

  private beginDying(world: World): void {
    this.hp = 0;
    this.state = 'dying';
    this.timer = 2.6;
    this.beam = null;
    for (const hand of this.hands) {
      if (hand.state !== 'broken') {
        hand.state = 'broken';
        hand.timer = 99;
        hand.shards = Array.from({ length: 8 }, () => ({
          x: hand.x + rand(-20, 20),
          y: hand.y + rand(-16, 16),
          vx: rand(-160, 160),
          vy: rand(-300, -60),
          r: rand(6, 13),
          spin: rand(-8, 8),
          rot: rand(0, 6),
        }));
      }
    }
    audio.play('bossRoar', 0.55);
    audio.play('crumble', 0.7);
    world.camera.addShake(10);
    world.hitStop(0.14);
  }

  /** A fist comes down or across: a parry against it shatters it outright. */
  private strike(hand: Hand, world: World, damage: number): void {
    const p = world.player;
    if (hand.hit || p.dead) return;
    hand.hit = true;
    const guarding = p.parryTimer > 0;
    p.hurt(damage, sign(p.cx - hand.x) || 1, world);
    if (guarding && p.parryTimer === 0 && p.parryFlash > 0.95 && this.poiseLock <= 0) {
      this.shatter(hand, world);
    }
  }

  /** Only a fist in motion hurts. Walking into him costs nothing. */
  override touchPlayer(world: World): void {
    const p = world.player;
    if (this.dead || p.dead || p.isInvulnerable || this.state === 'dying') return;
    for (const hand of this.hands) {
      if (hand.state !== 'drop' && hand.state !== 'sweep') continue;
      if (rectsOverlap(this.handRect(hand), p.rect)) this.strike(hand, world, 2);
    }
    if (this.beam && this.beam.stage === 'burn' && Math.abs(p.cx - this.beam.x) < BEAM_HALF + p.w / 2 - 4) {
      p.hurt(1, sign(p.cx - this.beam.x) || 1, world);
    }
  }

  /* --------------------------------------------------------------- update */

  override update(dt: number, world: World): void {
    this.updateCommon(dt);
    const player = world.player;
    this.headFlash = Math.max(0, this.headFlash - dt * 5);
    for (const hand of this.hands) hand.flash = Math.max(0, hand.flash - dt * 5);
    for (const p of this.pebbles) p.a += p.s * dt;

    if (this.arenaRight === 0) {
      // Where he actually stands, now that the game has put his feet down.
      this.floorY = this.bottom;
      this.baseX = this.cx;
      for (const hand of this.hands) {
        hand.x = this.baseX + hand.side * 168;
        hand.y = this.floorY - HAND_H / 2;
      }
      const arena = world.level.arenaAt(this.baseX);
      this.arenaLeft = arena ? arena.left : this.baseX - 560;
      this.arenaRight = arena ? arena.right : this.baseX + 560;
    }

    if (this.state === 'dormant') {
      const inside = player.cx > this.arenaLeft + 16 && player.cx < this.arenaRight - 16;
      if (inside && Math.abs(player.cx - this.baseX) < this.aggroRange && !player.dead) {
        this.engaged = true;
        this.poiseMax = this.sizeUpFor(world, HAND_POISE);
        for (const hand of this.hands) hand.crack = this.poiseMax;
        this.state = 'intro';
        this.timer = 1.9;
        audio.play('rumble', 0.7);
        audio.play('bossRoar', 0.6);
        world.camera.addShake(6);
      }
      return;
    }

    if (this.state === 'dying') {
      this.timer -= dt;
      this.slump = approach(this.slump, 1.3, dt * 0.8);
      this.eyes = Math.max(0, this.eyes - dt * 0.6);
      this.updateHands(dt, world);
      if (Math.random() < 0.4) {
        world.particles.burst(this.baseX + rand(-80, 80), this.floorY - rand(10, 170), 3, '#cdb487', {
          speed: 110,
          gravity: 500,
          size: rand(2, 5),
        });
      }
      if (this.timer <= 0) {
        this.die(world);
        world.onBossFelled('colossus', this.headX, this.headY - 40);
      }
      return;
    }

    if (this.state === 'intro') {
      this.timer -= dt;
      this.rise = approach(this.rise, 1, dt / 1.5);
      this.eyes = approach(this.eyes, 1, dt);
      for (const hand of this.hands) {
        const home = this.homeOf(hand);
        hand.x = damp(hand.x, home.x, 3, dt);
        hand.y = damp(hand.y, home.y, 2.4, dt);
      }
      if (Math.random() < 0.5) {
        world.particles.burst(this.baseX + rand(-90, 90), this.floorY - 4, 2, '#9c8866', { speed: 90, gravity: 400 });
      }
      if (this.timer <= 0) {
        this.state = 'idle';
        this.timer = 0.8;
        for (const hand of this.hands) hand.state = 'hover';
      }
      return;
    }

    this.eyes = approach(this.eyes, this.state === 'slumped' ? 0.35 : 1, dt * 2);
    this.slump = damp(this.slump, this.state === 'slumped' ? 1 : 0, 4, dt);
    this.gazeUp = damp(this.gazeUp, this.state === 'gaze' && this.beam?.stage !== 'fade' ? 1 : 0, 5, dt);
    this.timer -= dt;

    switch (this.state) {
      case 'idle':
        if (this.timer <= 0) this.chooseMove(world);
        break;

      case 'slam':
      case 'sweep':
        if (this.hands.every((h) => h.state === 'hover' || h.state === 'broken' || h.state === 'reform')) {
          this.state = 'idle';
          this.timer = rand(0.45, 0.75) * this.haste;
        }
        break;

      case 'gaze':
        if (!this.beam && this.timer <= 0) {
          this.beam = { x: player.cx, stage: 'mark', t: 0 };
          audio.play('beam', 0.8);
        }
        if (this.beam) this.updateBeam(dt, world);
        break;

      case 'slumped':
        if (this.timer <= 0) {
          this.state = 'idle';
          this.timer = 0.7;
          audio.play('rumble', 1.1);
        }
        break;
    }

    this.updateHands(dt, world);
  }

  private chooseMove(world: World): void {
    const player = world.player;
    const hands = this.usableHands;
    const options: string[] = [];
    if (hands.length > 0) options.push('slam', 'sweep');
    options.push('gaze');
    if (this.phaseTwo && hands.length === 2) options.push('double', 'double');
    // A hero who stands under his face gets a fist, not a lecture.
    const close = Math.abs(player.cx - this.baseX) < 130;
    const pick = options.filter((o) => o !== this.lastMove);
    let move = pick[Math.floor(Math.random() * pick.length)] ?? 'slam';
    if (close && hands.length > 0 && this.lastMove !== 'slam' && Math.random() < 0.6) move = 'slam';
    this.lastMove = move;

    const toward = sign(player.cx - this.baseX) || 1;
    switch (move) {
      case 'slam': {
        const hand = hands.find((h) => h.side === toward) ?? hands[0];
        this.lift(hand, 0);
        this.state = 'slam';
        audio.play('tellSlam', 0.7);
        break;
      }
      case 'double':
        this.lift(hands[0], 0);
        this.lift(hands[1], 0.5 * this.haste);
        this.state = 'slam';
        audio.play('tellSlam', 0.65);
        break;
      case 'sweep': {
        // From the far side, so it crosses his chest before it reaches the
        // hero: the longest look at it anyone could ask for.
        const hand = hands.find((h) => h.side === -toward) ?? hands[0];
        hand.state = 'toEdge';
        hand.hit = false;
        hand.dir = -hand.side;
        this.state = 'sweep';
        audio.play('tellLunge', 0.55);
        break;
      }
      case 'gaze':
        this.state = 'gaze';
        this.timer = 0.85;
        this.beam = null;
        audio.play('beamCharge', 0.9);
        break;
    }
  }

  private lift(hand: Hand, delay: number): void {
    hand.state = 'lift';
    hand.delay = delay;
    hand.timer = 0.35;
    hand.hit = false;
  }

  private updateHands(dt: number, world: World): void {
    const player = world.player;
    for (const hand of this.hands) {
      if (hand.state === 'broken' || hand.state === 'reform') {
        for (const s of hand.shards) {
          if (hand.state === 'broken') {
            s.vy += 1200 * dt;
            s.x += s.vx * dt;
            s.y += s.vy * dt;
            s.rot += s.spin * dt;
            if (s.y > this.floorY - s.r * 0.6) {
              s.y = this.floorY - s.r * 0.6;
              s.vy *= -0.25;
              s.vx *= 0.6;
              s.spin *= 0.6;
            }
          } else {
            // Reforming: every piece flies back to where the fist belongs.
            const home = this.homeOf(hand);
            s.x = damp(s.x, home.x, 7, dt);
            s.y = damp(s.y, home.y, 7, dt);
            s.rot = damp(s.rot, 0, 6, dt);
          }
        }
        if (this.state === 'dying') continue;
        hand.timer -= dt;
        if (hand.state === 'broken' && hand.timer <= 0) {
          hand.state = 'reform';
          hand.timer = 0.9;
          audio.play('magic', 0.5);
        } else if (hand.state === 'reform' && hand.timer <= 0) {
          const home = this.homeOf(hand);
          hand.state = 'hover';
          hand.x = home.x;
          hand.y = home.y;
          hand.crack = this.poiseMax;
          hand.shards = [];
          hand.turn = 0;
        }
        continue;
      }

      hand.timer -= dt;
      hand.glow = Math.max(0, hand.glow - dt * 1.5);
      const home = this.homeOf(hand);
      switch (hand.state) {
        case 'rest':
          break;

        case 'hover':
          hand.x = damp(hand.x, home.x, 4, dt);
          hand.y = damp(hand.y, home.y, 4, dt);
          hand.turn = damp(hand.turn, 0, 6, dt);
          break;

        case 'lift':
          if (hand.delay > 0) {
            hand.delay -= dt;
            hand.timer = 0.35;
            hand.x = damp(hand.x, home.x, 4, dt);
            hand.y = damp(hand.y, home.y, 4, dt);
            break;
          }
          hand.x = damp(hand.x, clamp(player.cx, this.arenaLeft + 40, this.arenaRight - 40), 5, dt);
          hand.y = damp(hand.y, this.floorY - 262, 6, dt);
          hand.glow = 1;
          if (hand.timer <= 0) {
            hand.state = 'track';
            hand.timer = 0.95 * this.haste;
          }
          break;

        case 'track': {
          // It follows him, and then for the last moment it does not: that
          // stillness is the cue to move. A third of a second of it: at 0.2,
          // a hero who saw it stop 0.3 s late was under the fist when it
          // landed - the cue was shorter than the eye.
          hand.glow = 1;
          const locked = hand.timer < 0.3;
          if (!locked) {
            const want = clamp(player.cx, this.arenaLeft + 40, this.arenaRight - 40);
            hand.x = approach(hand.x, want, 430 * dt);
          } else {
            hand.x += Math.sin(this.anim * 80) * 0.8;
          }
          hand.y = damp(hand.y, this.floorY - 250, 6, dt);
          if (hand.timer <= 0) {
            hand.state = 'drop';
            hand.dir = 0;
            audio.play('fireball', 0.45);
          }
          break;
        }

        case 'drop':
          hand.dir += 3400 * dt;
          hand.y += hand.dir * dt;
          if (hand.y + HAND_H / 2 >= this.floorY) {
            hand.y = this.floorY - HAND_H / 2;
            hand.state = 'floor';
            hand.timer = 1.25 * this.haste;
            audio.play('impactStone', 0.8);
            world.camera.addShake(8);
            world.hitStop(0.04);
            world.particles.burst(hand.x, this.floorY - 4, 22, '#bfa77c', { speed: 260, gravity: 700, size: 4, angle: -Math.PI / 2, spread: Math.PI });
            world.particles.burst(hand.x, this.floorY - 4, 10, '#ffd08a', { speed: 200, gravity: 200, shape: 'spark' });
            const p = world.player;
            if (!p.dead && Math.abs(p.cx - hand.x) < HAND_W / 2 + 14 && p.bottom > this.floorY - 70) {
              this.strike(hand, world, 2);
            }
            if (this.phaseTwo) {
              for (const dir of [-1, 1]) {
                world.spawnProjectile(new Projectile('shockwave', hand.x - 13 + dir * 34, this.floorY - 30, dir * 250, 0));
              }
            }
          }
          break;

        case 'floor':
          // Lying there: the window. Its runes are out, it is just stone.
          if (hand.timer <= 0) hand.state = 'hover';
          break;

        case 'toEdge': {
          const edge = hand.side < 0 ? this.arenaLeft + 44 : this.arenaRight - 44;
          hand.x = damp(hand.x, edge, 3.2, dt);
          hand.y = damp(hand.y, this.floorY - 150, 4, dt);
          hand.turn = damp(hand.turn, (Math.PI / 2) * hand.dir, 5, dt);
          if (Math.abs(hand.x - edge) < 10) {
            hand.state = 'lower';
            hand.timer = 0.32;
          }
          break;
        }

        case 'lower':
          hand.y = damp(hand.y, this.floorY - HAND_W / 2 - 1, 10, dt);
          hand.turn = (Math.PI / 2) * hand.dir;
          if (hand.timer <= 0) {
            hand.state = 'sweepWind';
            hand.timer = 0.78 * this.haste;
            audio.play('crumble', 1.6);
          }
          break;

        case 'sweepWind':
          hand.glow = 1;
          hand.x -= hand.dir * 14 * dt;
          if (world.time % 0.06 < dt) {
            world.particles.spawn({
              x: hand.x + hand.dir * 20,
              y: this.floorY - 3,
              vx: hand.dir * rand(40, 120),
              vy: -rand(40, 120),
              color: 'rgba(200,180,140,0.7)',
              size: rand(2, 4),
              life: 0.4,
            });
          }
          if (hand.timer <= 0) {
            hand.state = 'sweep';
            audio.play('dash', 0.5);
          }
          break;

        case 'sweep': {
          hand.glow = 1;
          hand.x += hand.dir * (this.phaseTwo ? 660 : 560) * dt;
          if (world.time % 0.03 < dt) {
            world.particles.spawn({
              x: hand.x - hand.dir * 24,
              y: this.floorY - rand(2, 10),
              vx: -hand.dir * rand(20, 80),
              vy: -rand(30, 110),
              color: 'rgba(214,190,146,0.65)',
              size: rand(2, 4),
              life: 0.45,
            });
          }
          const far = hand.dir > 0 ? this.arenaRight - 40 : this.arenaLeft + 40;
          if ((hand.dir > 0 && hand.x >= far) || (hand.dir < 0 && hand.x <= far)) {
            hand.state = 'hover';
            world.camera.addShake(4);
            audio.play('impactStone', 1.2);
          }
          break;
        }
      }
    }
  }

  private updateBeam(dt: number, world: World): void {
    const beam = this.beam;
    if (!beam) return;
    const player = world.player;
    beam.t += dt;
    switch (beam.stage) {
      case 'mark':
        if (beam.t > 0.55) {
          beam.stage = 'burn';
          beam.t = 0;
          audio.play('beam');
          world.camera.addShake(4);
        }
        break;
      case 'burn': {
        // Slower than he runs. It is a reason to move, not a sentence.
        const speed = this.phaseTwo ? 185 : 150;
        beam.x = approach(beam.x, clamp(player.cx, this.arenaLeft + 20, this.arenaRight - 20), speed * dt);
        if (world.time % 0.03 < dt) {
          world.particles.spawn({
            x: beam.x + rand(-BEAM_HALF, BEAM_HALF),
            y: this.floorY - 2,
            vx: rand(-90, 90),
            vy: -rand(60, 220),
            color: Math.random() < 0.5 ? '#fff2c0' : '#ffc46a',
            gravity: 300,
            size: rand(2, 3.5),
            life: 0.5,
            shape: 'spark',
          });
        }
        if (beam.t > 1.9) {
          beam.stage = 'fade';
          beam.t = 0;
        }
        break;
      }
      case 'fade':
        if (beam.t > 0.3) {
          this.beam = null;
          this.state = 'idle';
          this.timer = 0.85 * this.haste;
        }
        break;
    }
  }

  override lights(): GlowLight[] {
    const out: GlowLight[] = [];
    const rune = this.phaseTwo ? '255,236,180' : '255,180,90';
    if (this.eyes > 0.05) out.push({ x: this.headX, y: this.headY, radius: 120 * this.eyes, rgb: rune, strength: 0.6, tint: 0.25 });
    out.push({ x: this.baseX, y: this.floorY - 88 + (1 - this.rise) * 118, radius: 150, rgb: '230,196,140', strength: 0.5, tint: 0.16 });
    for (const hand of this.hands) {
      if (hand.state === 'broken' || hand.state === 'reform') continue;
      out.push({ x: hand.x, y: hand.y, radius: 60 + hand.glow * 60, rgb: rune, strength: 0.55, tint: 0.25 });
    }
    if (this.beam) {
      const k = this.beam.stage === 'burn' ? 1 : 0.4;
      out.push({ x: this.beam.x, y: this.floorY - 30, radius: 240 * k, rgb: '255,226,150', strength: 1, tint: 0.45 });
      out.push({ x: this.beam.x, y: this.floorY - 260, radius: 180 * k, rgb: '255,226,150', strength: 0.8, tint: 0.35 });
    }
    return out;
  }

  /* -------------------------------------------------------------- drawing */

  /*
   * Drawn from parts on the art grid (colossus-art.ts): the bust rising out of
   * its rubble, the head over it, the fists, the sun column. Every part is a
   * sprite made once and blitted at whole art pixels; only the floor marks,
   * the rays and the column are laid down with the pen, as runs of pixels.
   * The light he gives off is in lights(), never painted here.
   */

  /** The sun on his chest: dark while he sleeps, bright awake, white when a fist winds up. */
  private sunLevel(): Glow {
    if (this.state === 'dormant') return 0;
    const heat = 0.35 + this.eyes * 0.35 + Math.max(...this.hands.map((h) => h.glow)) * 0.3;
    return heat >= 0.9 ? 3 : heat >= 0.6 ? 2 : 1;
  }

  /** His cracks: dark asleep, a steady glow while he fights, flaring as he breaks. */
  private crackLevel(): Glow {
    switch (this.state) {
      case 'dormant':
        return 0;
      case 'intro':
        return this.eyes > 0.5 ? 2 : 1;
      case 'slumped':
        return 1;
      case 'dying':
        return this.timer > 1.6 ? 3 : this.timer > 0.8 ? 2 : 1;
      default:
        return 2;
    }
  }

  private eyeLevel(): Glow {
    const e = this.eyes;
    return e >= 0.75 ? 3 : e >= 0.45 ? 2 : e >= 0.12 ? 1 : 0;
  }

  override draw(ctx: CanvasRenderingContext2D): void {
    const phase = this.phase;
    const x = snap(this.baseX);
    const floor = snap(this.floorY);
    // Rising, and sagging, the whole bust settles into the ground.
    const sink = Math.round(((1 - this.rise) * 118 + this.slump * 52) / ART) * ART;
    this.drawPebbles(ctx, sink, true);
    this.drawTorso(ctx, x, floor, sink, phase);
    sprite('mound', MOUND, 0, 1).draw(ctx, x - ((MOUND_W - 1) / 2) * ART, floor - MOUND_H * ART);
    this.drawPebbles(ctx, sink, false);
    this.drawHead(ctx, floor, phase);
    for (const hand of this.hands) this.drawHand(ctx, hand, floor, phase);
    this.drawBeam(ctx, floor);
  }

  /** Chest and shoulders, the cracks that open as he dies, and the sun on his breast. */
  private drawTorso(ctx: CanvasRenderingContext2D, x: number, floor: number, sink: number, phase: 1 | 2): void {
    const x0 = x - TORSO_CX * ART;
    const y0 = floor - TORSO_H * ART + sink;
    above(ctx, sprite('torso', TORSO, this.crackLevel(), phase), x0, y0, floor);
    if (this.state === 'dying') {
      const step = this.timer < 0.8 ? 2 : this.timer < 1.4 ? 1 : this.timer < 2 ? 0 : -1;
      if (step >= 0) above(ctx, sprite(`death${step}`, TORSO_DEATH[step], 3, phase), x0, y0, floor);
    }
    // Its rays turn a third of the way between two rays at a time.
    const turn = Math.floor((this.anim * 0.2) / (Math.PI / 18)) % 3;
    above(ctx, sprite(`sun${turn}`, SUN[turn], this.sunLevel(), phase), x0 + (SUN_X - SUN_R) * ART, y0 + (SUN_Y - SUN_R) * ART, floor);
  }

  /** Stones held up round his shoulders by nothing but will: the far half of their orbit behind him. */
  private drawPebbles(ctx: CanvasRenderingContext2D, sink: number, behind: boolean): void {
    if (this.rise <= 0.6 || this.state === 'dying') return;
    for (const p of this.pebbles) {
      const s = Math.sin(p.a);
      if (s < 0 !== behind) continue;
      const px = this.baseX + Math.cos(p.a) * p.r * 1.3;
      const py = this.floorY - 130 + sink + s * p.r * 0.35;
      if (py > this.floorY - 4) continue;
      const k = p.size < 4.3 ? 0 : p.size < 5.6 ? 1 : 2;
      const pebble = sprite(`pebble${k}`, PEBBLES[k], 0, 1);
      pebble.draw(ctx, px - pebble.w, py - pebble.h);
    }
  }

  private drawHead(ctx: CanvasRenderingContext2D, floor: number, phase: 1 | 2): void {
    // Looking up at the sky, or bowed with his fist gone.
    const look: HeadLook = this.gazeUp > 0.5 ? 'up' : this.slump > 0.45 ? 'down' : 'front';
    const flash = this.flash > 0 && this.headFlash > 0.78;
    const head = sprite(`head-${look}`, HEAD[look], this.eyeLevel(), phase, flash);
    const x0 = snap(this.headX) - HEAD_CX * ART;
    const y0 = snap(this.headY) - HEAD_CY * ART;
    above(ctx, head, x0, y0, floor);
    // Looking up: two rays out of his eyes, straight up into the sky.
    if (this.state === 'gaze' && this.gazeUp > 0.2) {
      const a = this.gazeUp * (this.beam ? 0.35 : 0.8);
      if (a > 0.15) {
        const bands = a > 0.5 ? GAZE_STRONG : GAZE_WEAK;
        const eye = y0 + (look === 'up' ? 18 : 19) * ART;
        for (const col of [16, 28]) {
          let y = eye;
          for (const [len, color, dashed] of bands) {
            ctx.fillStyle = color;
            if (!dashed) ctx.fillRect(x0 + col * ART, y - len * ART, ART, len * ART);
            else for (let k = 0; k + 4 <= len; k += 6) ctx.fillRect(x0 + col * ART, y - (k + 4) * ART, ART, 4 * ART);
            y -= len * ART;
          }
        }
      }
    }
  }

  private drawHand(ctx: CanvasRenderingContext2D, hand: Hand, floor: number, phase: 1 | 2): void {
    if (hand.state === 'broken' || hand.state === 'reform') {
      for (const s of hand.shards) {
        const k = s.r < 8.3 ? 0 : s.r < 10.6 ? 1 : 2;
        const turn = ((Math.round(s.rot / (Math.PI / 4)) % 8) + 8) % 8;
        const shard = sprite(`shard${k}-${turn}`, SHARDS[k][turn], 0, 1);
        shard.draw(ctx, s.x - shard.w, s.y - shard.h);
      }
      if (hand.state === 'reform') {
        // The ring of runes that calls the pieces home, closing on where the fist belongs.
        const home = this.homeOf(hand);
        const r = Math.round(8 + clamp(hand.timer / 0.9, 0, 1) * 22);
        ring(ctx, snap(home.x), snap(home.y), r * ART, glowColor('r', 3, phase));
      }
      return;
    }

    const x = snap(hand.x);
    const y = snap(hand.y);
    // Its shadow on the floor, wider the lower it comes - and while it hunts
    // the hero, a ring of light round the place it means to land.
    const height = this.floorY - (hand.y + HAND_H / 2);
    if (height > 4) {
      const k = clamp(1 - height / 300, 0.15, 1);
      const half = Math.round((HAND_W * (0.35 + k * 0.35)) / ART);
      ctx.fillStyle = RAMP.slate[0];
      ctx.fillRect(x - half * ART, floor - ART, half * 2 * ART, ART);
      if (hand.state === 'track' || hand.state === 'drop') {
        ctx.fillStyle = glowColor(hand.state === 'drop' ? 'R' : 'r', 3, phase);
        for (const [dx, dy] of ellipseCells(19, 4)) ctx.fillRect(x + dx * ART, floor - ART + dy * ART, ART, ART);
      }
    }

    const sideways = Math.abs(Math.sin(hand.turn)) > 0.7;
    const view = sideways ? 'side' : 'front';
    // Thumbs in towards him; on its side, knuckles first the way it sweeps.
    const facing: 1 | -1 = sideways ? (hand.turn > 0 ? 1 : -1) : hand.side;
    // Its rune: out while he sleeps and while it lies spent on the floor,
    // blazing while it winds up, cooling after.
    const asleep = this.state === 'dormant' || hand.state === 'floor';
    const level: Glow = asleep ? 0 : hand.glow >= 0.8 ? 3 : hand.glow >= 0.4 ? 2 : 1;
    // Locked over the hero, the last breath before it falls: it shudders.
    const fx = x + (hand.state === 'track' && hand.timer < 0.2 ? (Math.floor(this.anim * 30) % 2 === 0 ? ART : -ART) : 0);

    // Falling or sweeping, its afterimage strung out behind it.
    if (hand.state === 'sweep' || hand.state === 'drop') {
      for (let i = 2; i >= 1; i--) {
        const ox = hand.state === 'sweep' ? -hand.dir * i * 7 * ART : 0;
        const oy = hand.state === 'drop' ? -i * 7 * ART : 0;
        fist(ctx, sprite(`ghost-${view}-${i}`, FIST_GHOST[view][i - 1], level, phase), fx + ox, y + oy, facing);
      }
    }
    // The ring of runes turning round the wrist while it winds up.
    const turning = hand.glow > 0.3;
    const step = Math.floor(this.anim * 20) % 6;
    const ringAt = (front: boolean): void => {
      if (sideways) {
        const g = RING_SIDE[front ? 'front' : 'back'][step];
        sprite(`ringS${front ? 'f' : 'b'}${step}`, g, 3, phase).draw(ctx, fx - 13 * ART * facing - 5 * ART, y - 20 * ART);
      } else {
        const g = RING[front ? 'front' : 'back'][step];
        sprite(`ringF${front ? 'f' : 'b'}${step}`, g, 3, phase).draw(ctx, fx - 20 * ART, y - 18 * ART);
      }
    };
    if (turning) ringAt(false);
    const flash = this.flash > 0 && hand.flash > 0.78;
    fist(ctx, sprite(`fist-${view}`, FIST[view], level, phase, flash), fx, y, facing);
    if (turning) ringAt(true);
  }

  /**
   * The sun column: first a ring on the floor closing in and the edges of the
   * column to come running down out of the sky, then the column itself in
   * bands of the fire ramp round a white core, script sliding down it and the
   * floor burning where it stands. Its glow on the room is in lights().
   */
  private drawBeam(ctx: CanvasRenderingContext2D, floor: number): void {
    const beam = this.beam;
    if (!beam) return;
    const x = snap(beam.x);
    if (beam.stage === 'mark') {
      const p = clamp(beam.t / 0.55, 0, 1);
      ctx.fillStyle = p < 0.33 ? RAMP.rust[1] : p < 0.66 ? RAMP.fire[1] : RAMP.fire[2];
      const rx = Math.round((BEAM_HALF + 26 * (1 - p)) / ART);
      for (const [dx, dy] of ellipseCells(rx, 3)) ctx.fillRect(x + dx * ART, floor - ART + dy * ART, ART, ART);
      const half = Math.round((BEAM_HALF * p) / ART);
      if (half >= 1) {
        const run = (6 - (Math.floor(beam.t * 40) % 6)) % 6;
        for (const ex of [x - half * ART, x + (half - 1) * ART]) {
          for (let d = run; d < 300; d += 6) ctx.fillRect(ex, floor - (d + 4) * ART, ART, 4 * ART);
        }
      }
      return;
    }
    const k = beam.stage === 'fade' ? clamp(1 - beam.t / 0.3, 0, 1) : clamp(beam.t / 0.08, 0, 1);
    const half = Math.round((BEAM_HALF / ART) * k);
    if (half < 1) return;
    const top = floor - 720;
    for (let i = 0; i < BEAM_BANDS.length; i++) {
      const w = half - i * 2;
      if (w <= 0) break;
      ctx.fillStyle = BEAM_BANDS[i];
      ctx.fillRect(x - w * ART, top, w * 2 * ART, floor - top);
    }
    if (half >= 6) {
      for (let i = 0; i < 6; i++) {
        const y = snap(floor - ((beam.t * 260 + i * 110) % 660));
        ctx.fillStyle = RAMP.fire[4];
        ctx.fillRect(x - (half + 3) * ART, y, (half + 3) * 2 * ART, ART);
        ctx.fillStyle = RAMP.fire[3];
        ctx.fillRect(x - 2 * ART, y, 4 * ART, ART);
      }
    }
    // Where it meets the floor, it burns.
    oval(ctx, x, floor - ART, (half + 5) * ART, 3 * ART, RAMP.fire[2]);
    oval(ctx, x, floor - ART, (half + 1) * ART, 2 * ART, RAMP.fire[4]);
    if (half > 3) oval(ctx, x, floor - ART, (half - 3) * ART, ART * 1.4, '#ffffff');
  }
}

/** The bands of the sun column, from its edge in: orange, amber, gold, yellow, white. */
const BEAM_BANDS = [RAMP.fire[1], RAMP.fire[2], RAMP.fire[3], RAMP.fire[4], '#ffffff'];

/** The rays out of his eyes as he looks up: bands of so many art pixels from the eye up, the last dashed. */
const GAZE_STRONG: readonly (readonly [number, string, boolean])[] = [
  [6, '#ffffff', false],
  [16, RAMP.fire[4], false],
  [36, RAMP.fire[2], false],
  [60, RAMP.fire[1], true],
];
const GAZE_WEAK: readonly (readonly [number, string, boolean])[] = [
  [4, RAMP.fire[3], false],
  [12, RAMP.fire[2], false],
  [36, RAMP.fire[1], true],
];

/** A sprite's rows above the floor only: what is under the floor stays under it. */
function above(ctx: CanvasRenderingContext2D, s: PixelSprite, x: number, y: number, floor: number): void {
  const rows = Math.min(s.h, Math.floor((floor - y) / ART));
  if (rows <= 0) return;
  ctx.drawImage(s.canvas, 0, 0, s.w, rows, x, y, s.w * ART, rows * ART);
}

/** A fist frame by its point, mirrored about that column when facing left. */
function fist(ctx: CanvasRenderingContext2D, s: PixelSprite, x: number, y: number, facing: 1 | -1): void {
  const col = facing < 0 ? s.w - 1 - FIST_PX : FIST_PX;
  s.draw(ctx, x - col * ART, y - FIST_PY * ART, facing);
}
