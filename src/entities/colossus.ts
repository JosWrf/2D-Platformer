import { audio } from '../core/audio';
import { Rect, approach, clamp, damp, rand, rectsOverlap, sign } from '../core/math';
import { glow, withHitFlash } from '../render/sprites';
import type { World } from '../world/context';
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
        audio.play('tell', 0.7);
        break;
      }
      case 'double':
        this.lift(hands[0], 0);
        this.lift(hands[1], 0.5 * this.haste);
        this.state = 'slam';
        audio.play('tell', 0.65);
        break;
      case 'sweep': {
        // From the far side, so it crosses his chest before it reaches the
        // hero: the longest look at it anyone could ask for.
        const hand = hands.find((h) => h.side === -toward) ?? hands[0];
        hand.state = 'toEdge';
        hand.hit = false;
        hand.dir = -hand.side;
        this.state = 'sweep';
        audio.play('tell', 0.55);
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
          // stillness is the cue to move.
          hand.glow = 1;
          const locked = hand.timer < 0.2;
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
            audio.play('slam', 0.8);
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
            audio.play('slam', 1.2);
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

  private runeRgb(): string {
    return this.phaseTwo ? '255,238,190' : '255,178,84';
  }

  override draw(ctx: CanvasRenderingContext2D): void {
    this.drawBeam(ctx, true);
    this.drawBody(ctx);
    this.drawHead(ctx);
    for (const hand of this.hands) this.drawHand(ctx, hand);
    this.drawBeam(ctx, false);
  }

  /** The mound he stands buried in, his chest and shoulders, and the collar. */
  private drawBody(ctx: CanvasRenderingContext2D): void {
    const cx = this.baseX;
    const floor = this.floorY;
    // Sagging, the whole bust settles into the ground as the head comes down.
    const sink = (1 - this.rise) * 118 + this.slump * 52;
    const rgb = this.runeRgb();
    const wake = this.state === 'dormant' ? 0.15 : 1;
    ctx.save();

    // The mound: broken paving pushed up around him.
    ctx.fillStyle = '#2b2230';
    ctx.beginPath();
    ctx.ellipse(cx, floor + 2, 132, 20, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3d3240';
    for (let i = -5; i <= 5; i++) {
      const bx = cx + i * 23;
      const bh = 8 + ((i * 7 + 11) % 5) * 3;
      ctx.beginPath();
      ctx.moveTo(bx - 12, floor);
      ctx.lineTo(bx - 8, floor - bh);
      ctx.lineTo(bx + 9, floor - bh + 3);
      ctx.lineTo(bx + 12, floor);
      ctx.closePath();
      ctx.fill();
    }

    // Everything below the floor is under the floor.
    ctx.beginPath();
    ctx.rect(cx - 220, floor - 400, 440, 400);
    ctx.clip();
    ctx.translate(cx, floor + sink);

    // Chest and shoulders.
    const stone = ctx.createLinearGradient(0, -150, 0, 0);
    stone.addColorStop(0, '#a38c69');
    stone.addColorStop(0.45, '#6f5a45');
    stone.addColorStop(1, '#2e241d');
    ctx.fillStyle = stone;
    ctx.beginPath();
    ctx.moveTo(-70, 0);
    ctx.lineTo(-84, -64);
    ctx.quadraticCurveTo(-100, -114, -74, -128);
    ctx.quadraticCurveTo(-42, -140, -22, -140);
    ctx.lineTo(22, -140);
    ctx.quadraticCurveTo(42, -140, 74, -128);
    ctx.quadraticCurveTo(100, -114, 84, -64);
    ctx.lineTo(70, 0);
    ctx.closePath();
    ctx.fill();

    // Shade down the sides, so the chest has a front.
    const side = ctx.createLinearGradient(-90, 0, 90, 0);
    side.addColorStop(0, 'rgba(20,12,18,0.55)');
    side.addColorStop(0.28, 'rgba(20,12,18,0)');
    side.addColorStop(0.72, 'rgba(20,12,18,0)');
    side.addColorStop(1, 'rgba(20,12,18,0.6)');
    ctx.fillStyle = side;
    ctx.fill();

    // Shoulder caps, gold over lapis.
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#23365f';
      ctx.beginPath();
      ctx.ellipse(s * 76, -118, 26, 18, s * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#d9b25a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(s * 76, -118, 26, 18, s * 0.35, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();
      // The arm ends at the shoulder: a stump with a ring of runes where the
      // arm was. The hands do not need it.
      ctx.fillStyle = '#5d4b3b';
      ctx.beginPath();
      ctx.ellipse(s * 96, -96, 12, 18, s * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(${rgb},${(0.35 * wake + Math.sin(this.anim * 2 + s) * 0.1).toFixed(3)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(s * 96, -96, 9, 14, s * 0.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // The broad collar: rows of beads, lapis and gold, across the chest.
    const rows: [number, string][] = [
      [34, '#d9b25a'],
      [46, '#2b4a88'],
      [58, '#caa24c'],
      [70, '#1f3668'],
    ];
    for (const [r, color] of rows) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.ellipse(0, -140, r + 8, r * 0.62, 0, Math.PI * 0.08, Math.PI * 0.92);
      ctx.stroke();
    }
    ctx.fillStyle = '#e8c86c';
    for (let i = 0; i < 11; i++) {
      const a = Math.PI * (0.12 + (i / 10) * 0.76);
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 86, -140 + Math.sin(a) * 50, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // The sun disc on his breast: the core, and the one thing on his body
    // that brightens before he moves.
    const heat = 0.35 + this.eyes * 0.35 + Math.max(...this.hands.map((h) => h.glow)) * 0.3;
    const discY = -62;
    ctx.fillStyle = '#6a4a1c';
    ctx.beginPath();
    ctx.arc(0, discY, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, 0, discY, 56, `rgba(${rgb},${(0.45 * heat * wake).toFixed(3)})`);
    ctx.fillStyle = `rgba(${rgb},${(0.55 + heat * 0.45).toFixed(3)})`;
    ctx.globalAlpha = wake;
    ctx.beginPath();
    ctx.arc(0, discY, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(${rgb},0.8)`;
    ctx.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + this.anim * 0.2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 17, discY + Math.sin(a) * 17);
      ctx.lineTo(Math.cos(a) * 25, discY + Math.sin(a) * 25);
      ctx.stroke();
    }
    ctx.restore();

    // Cracks with the light inside him showing through.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(${rgb},${(0.5 * wake * (0.7 + heat * 0.3)).toFixed(3)})`;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    const cracks = [
      [-58, -104, -44, -80, -52, -54, -40, -30],
      [48, -110, 40, -86, 56, -64],
      [20, -30, 34, -14, 28, 0],
      [-24, -26, -36, -8],
    ];
    for (const c of cracks) {
      ctx.beginPath();
      ctx.moveTo(c[0], c[1]);
      for (let i = 2; i < c.length; i += 2) ctx.lineTo(c[i], c[i + 1]);
      ctx.stroke();
    }
    ctx.restore();

    // Moss where the rain has sat for a thousand years.
    ctx.fillStyle = 'rgba(86,120,64,0.55)';
    for (const [mx, my, mr] of [
      [-70, -122, 10],
      [62, -126, 8],
      [-80, -60, 7],
      [74, -40, 9],
    ]) {
      ctx.beginPath();
      ctx.ellipse(mx, my, mr, mr * 0.5, 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Stones held up around his shoulders by nothing but will.
    if (this.rise > 0.6 && this.state !== 'dying') {
      ctx.fillStyle = '#8a775e';
      for (const p of this.pebbles) {
        const px = cx + Math.cos(p.a) * p.r * 1.3;
        const py = floor - 130 + sink + Math.sin(p.a) * p.r * 0.35;
        if (py > floor - 4) continue;
        ctx.fillRect(px - p.size / 2, py - p.size / 2, p.size, p.size * 0.8);
      }
    }
  }

  private drawHead(ctx: CanvasRenderingContext2D): void {
    const hx = this.headX;
    const hy = this.headY;
    const rgb = this.runeRgb();
    const flash = this.flash > 0 ? this.headFlash : 0;
    withHitFlash(ctx, flash, () => {
      ctx.save();
      ctx.translate(hx, hy);
      // Sagging: the head tips forward, which on a face seen from the front
      // reads as it coming down and a little smaller.
      const tip = 1 - this.slump * 0.06;
      ctx.scale(tip, tip);
      const look = -this.gazeUp * 5;

      // Headcloth, falling in lappets past both cheeks to the shoulders.
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(-26, -40);
      ctx.quadraticCurveTo(0, -50, 26, -40);
      ctx.lineTo(40, -6);
      ctx.lineTo(44, 50);
      ctx.lineTo(24, 52);
      ctx.lineTo(22, 6);
      ctx.lineTo(-22, 6);
      ctx.lineTo(-24, 52);
      ctx.lineTo(-44, 50);
      ctx.lineTo(-40, -6);
      ctx.closePath();
      ctx.fillStyle = '#26406f';
      ctx.fill();
      ctx.clip();
      ctx.fillStyle = '#d6ae55';
      for (let y = -46; y < 56; y += 9) ctx.fillRect(-50, y, 100, 4.5);
      ctx.restore();
      ctx.strokeStyle = 'rgba(20,14,26,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-40, -6);
      ctx.lineTo(-44, 50);
      ctx.moveTo(40, -6);
      ctx.lineTo(44, 50);
      ctx.stroke();

      // The face.
      const face = ctx.createLinearGradient(0, -34, 0, 30);
      face.addColorStop(0, '#b49b75');
      face.addColorStop(1, '#6f5944');
      ctx.fillStyle = face;
      ctx.beginPath();
      ctx.moveTo(-20, -30);
      ctx.lineTo(20, -30);
      ctx.quadraticCurveTo(24, 6, 16, 22);
      ctx.quadraticCurveTo(0, 32, -16, 22);
      ctx.quadraticCurveTo(-24, 6, -20, -30);
      ctx.closePath();
      ctx.fill();
      // Band across the brow.
      ctx.fillStyle = '#d6ae55';
      ctx.fillRect(-22, -32, 44, 6);

      // Brow and nose, carved.
      ctx.fillStyle = 'rgba(40,28,24,0.55)';
      ctx.fillRect(-16, -14 + look, 12, 2.5);
      ctx.fillRect(4, -14 + look, 12, 2.5);
      ctx.fillStyle = 'rgba(40,28,24,0.35)';
      ctx.beginPath();
      ctx.moveTo(-1, -10);
      ctx.lineTo(4, 6);
      ctx.lineTo(-4, 6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(30,20,18,0.7)';
      ctx.fillRect(-7, 13, 14, 2);

      // Eyes: kohl-lined, and lit from inside when he is awake.
      for (const s of [-1, 1]) {
        const ex = s * 10;
        const ey = -7 + look;
        ctx.fillStyle = '#1b1320';
        ctx.beginPath();
        ctx.moveTo(ex - 7, ey);
        ctx.quadraticCurveTo(ex, ey - 5, ex + 7, ey);
        ctx.quadraticCurveTo(ex, ey + 4, ex - 7, ey);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#1b1320';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(ex + s * 7, ey);
        ctx.lineTo(ex + s * 12, ey + 2);
        ctx.stroke();
        if (this.eyes > 0.02) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          glow(ctx, ex, ey, 16, `rgba(${rgb},${(0.6 * this.eyes).toFixed(3)})`);
          ctx.fillStyle = `rgba(255,250,230,${(0.9 * this.eyes).toFixed(3)})`;
          ctx.beginPath();
          ctx.ellipse(ex, ey, 4.2, 1.8, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      // The braided beard.
      ctx.fillStyle = '#6f5a44';
      ctx.beginPath();
      ctx.moveTo(-6, 24);
      ctx.lineTo(6, 24);
      ctx.lineTo(5, 46);
      ctx.quadraticCurveTo(0, 50, -5, 46);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#d6ae55';
      for (let y = 29; y < 46; y += 5) ctx.fillRect(-5.5, y, 11, 1.8);

      // The cobra on his brow.
      ctx.fillStyle = '#e2bb5e';
      ctx.beginPath();
      ctx.moveTo(0, -48);
      ctx.quadraticCurveTo(7, -42, 4, -34);
      ctx.lineTo(-4, -34);
      ctx.quadraticCurveTo(-7, -42, 0, -48);
      ctx.fill();
      ctx.fillStyle = '#2b4a88';
      ctx.fillRect(-1.5, -44, 3, 7);

      // A crack across the face, with the light behind it.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(${rgb},${(0.35 + this.eyes * 0.35).toFixed(3)})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(14, -30);
      ctx.lineTo(10, -20);
      ctx.lineTo(16, -8);
      ctx.lineTo(12, 4);
      ctx.stroke();
      ctx.restore();

      // Looking up at the sky: two thin rays out of his eyes, straight up.
      if (this.state === 'gaze' && this.gazeUp > 0.2) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const a = this.gazeUp * (this.beam ? 0.35 : 0.8);
        for (const s of [-1, 1]) {
          const g = ctx.createLinearGradient(0, -600, 0, 0);
          g.addColorStop(0, `rgba(${rgb},0)`);
          g.addColorStop(1, `rgba(${rgb},${a.toFixed(3)})`);
          ctx.fillStyle = g;
          ctx.fillRect(s * 10 - 1.5, -600, 3, 594 + look);
        }
        ctx.restore();
      }
      ctx.restore();
    });
  }

  private drawHand(ctx: CanvasRenderingContext2D, hand: Hand): void {
    if (hand.state === 'broken' || hand.state === 'reform') {
      const a = hand.state === 'reform' ? 0.9 : 1;
      ctx.save();
      ctx.globalAlpha = a;
      for (const s of hand.shards) {
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.rot);
        ctx.fillStyle = '#8a7358';
        ctx.beginPath();
        ctx.moveTo(-s.r, -s.r * 0.3);
        ctx.lineTo(-s.r * 0.2, -s.r * 0.8);
        ctx.lineTo(s.r * 0.9, -s.r * 0.2);
        ctx.lineTo(s.r * 0.4, s.r * 0.7);
        ctx.lineTo(-s.r * 0.7, s.r * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#b9a07a';
        ctx.fillRect(-s.r * 0.4, -s.r * 0.5, s.r * 0.6, s.r * 0.3);
        ctx.restore();
      }
      if (hand.state === 'reform') {
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, this.homeOf(hand).x, this.homeOf(hand).y, 50, `rgba(${this.runeRgb()},0.4)`);
      }
      ctx.restore();
      return;
    }

    const rgb = this.runeRgb();
    // Its shadow, down on the floor, larger and darker the lower it is - the
    // warning the slam gives, read from where the hero stands.
    const height = this.floorY - (hand.y + HAND_H / 2);
    if (height > 4) {
      const k = clamp(1 - height / 300, 0.15, 1);
      ctx.save();
      ctx.fillStyle = `rgba(0,0,0,${(0.2 + k * 0.35).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(hand.x, this.floorY, HAND_W * (0.35 + k * 0.35), 7, 0, 0, Math.PI * 2);
      ctx.fill();
      if (hand.state === 'track' || hand.state === 'drop') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(${rgb},${(0.3 + (hand.state === 'drop' ? 0.4 : 0.2)).toFixed(3)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(hand.x, this.floorY - 1, HAND_W * 0.62, 9, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Motion: a smear behind a sweeping or falling fist.
    if (hand.state === 'sweep' || hand.state === 'drop') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 1; i <= 4; i++) {
        const ox = hand.state === 'sweep' ? -hand.dir * i * 16 : 0;
        const oy = hand.state === 'drop' ? -i * 18 : 0;
        ctx.globalAlpha = 0.14 * (5 - i) * 0.5;
        ctx.fillStyle = `rgb(${rgb})`;
        ctx.beginPath();
        ctx.ellipse(hand.x + ox, hand.y + oy, 24, 20, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    const flash = this.flash > 0 ? hand.flash : 0;
    withHitFlash(ctx, flash, () => {
      ctx.save();
      ctx.translate(hand.x, hand.y);
      ctx.rotate(hand.turn);
      // Mirrored per side so both thumbs point in towards him.
      ctx.scale(hand.side, 1);
      const bob = hand.state === 'track' && hand.timer < 0.2 ? Math.sin(this.anim * 70) * 1.2 : 0;
      ctx.translate(bob, 0);

      // Cuff at the wrist, with the ring of runes the hand answers to.
      ctx.fillStyle = '#23365f';
      ctx.fillRect(-24, -30, 48, 12);
      ctx.fillStyle = '#d9b25a';
      ctx.fillRect(-24, -30, 48, 3);
      ctx.fillRect(-24, -21, 48, 3);

      // The fist itself: back of the hand, four knuckles below.
      const g = ctx.createLinearGradient(0, -20, 0, 26);
      g.addColorStop(0, '#a38c69');
      g.addColorStop(1, '#584535');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-26, -18);
      ctx.lineTo(24, -18);
      ctx.quadraticCurveTo(30, 0, 26, 14);
      ctx.lineTo(-26, 14);
      ctx.quadraticCurveTo(-30, 0, -26, -18);
      ctx.closePath();
      ctx.fill();
      for (let i = 0; i < 4; i++) {
        const kx = -19 + i * 12.5;
        ctx.fillStyle = i % 2 ? '#8d765b' : '#9d8566';
        ctx.beginPath();
        ctx.ellipse(kx, 16, 6.8, 8.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(40,28,22,0.5)';
        ctx.fillRect(kx + 5.4, 10, 1.4, 12);
      }
      // Thumb, folded over the fingers on the inside.
      ctx.fillStyle = '#9a8264';
      ctx.beginPath();
      ctx.ellipse(-26, 4, 8, 13, -0.3, 0, Math.PI * 2);
      ctx.fill();

      // The rune on the back of the hand. Dark stone at rest, blazing when
      // the hand is about to move.
      const heat = hand.state === 'floor' ? 0.1 : 0.25 + hand.glow * 0.75;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, 0, -2, 30, `rgba(${rgb},${(0.35 * heat).toFixed(3)})`);
      ctx.strokeStyle = `rgba(${rgb},${(0.4 + heat * 0.6).toFixed(3)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-9, -2);
      ctx.quadraticCurveTo(0, -11, 9, -2);
      ctx.quadraticCurveTo(0, 5, -9, -2);
      ctx.moveTo(0, 3);
      ctx.lineTo(-3, 9);
      ctx.moveTo(4, 2);
      ctx.quadraticCurveTo(9, 6, 7, 10);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,248,220,${(0.5 + heat * 0.5).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(0, -2, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // A ring turning round the wrist while it winds up.
      if (hand.glow > 0.3) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(${rgb},${(0.5 * hand.glow).toFixed(3)})`;
        ctx.lineWidth = 1.6;
        ctx.setLineDash([5, 6]);
        ctx.lineDashOffset = -this.anim * 40;
        ctx.beginPath();
        ctx.ellipse(0, -24, 38, 10, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
      ctx.restore();
    });
  }

  /**
   * The sun column: a ring on the floor first, then the light itself. Drawn in
   * two passes - the wide glow behind him, the hot core in front - so it
   * stands in the court rather than being pasted onto it.
   */
  private drawBeam(ctx: CanvasRenderingContext2D, behind: boolean): void {
    const beam = this.beam;
    if (!beam) return;
    const x = beam.x;
    const floor = this.floorY;
    const top = floor - 720;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (beam.stage === 'mark') {
      if (behind) return ctx.restore();
      const p = clamp(beam.t / 0.55, 0, 1);
      ctx.strokeStyle = `rgba(255,220,140,${(0.3 + p * 0.5).toFixed(3)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x, floor - 2, BEAM_HALF + 26 * (1 - p), 7, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,220,140,${(0.08 + p * 0.12).toFixed(3)})`;
      ctx.fillRect(x - BEAM_HALF * p, top, BEAM_HALF * 2 * p, floor - top);
      return ctx.restore();
    }
    const k = beam.stage === 'fade' ? clamp(1 - beam.t / 0.3, 0, 1) : clamp(beam.t / 0.08, 0, 1);
    if (behind) {
      const halo = ctx.createLinearGradient(x - 70, 0, x + 70, 0);
      halo.addColorStop(0, 'rgba(255,190,90,0)');
      halo.addColorStop(0.5, `rgba(255,200,110,${(0.32 * k).toFixed(3)})`);
      halo.addColorStop(1, 'rgba(255,190,90,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(x - 70, top, 140, floor - top);
      glow(ctx, x, floor, 90, `rgba(255,210,130,${(0.5 * k).toFixed(3)})`);
      return ctx.restore();
    }
    const core = ctx.createLinearGradient(x - BEAM_HALF, 0, x + BEAM_HALF, 0);
    core.addColorStop(0, 'rgba(255,200,110,0)');
    core.addColorStop(0.3, `rgba(255,226,160,${(0.75 * k).toFixed(3)})`);
    core.addColorStop(0.5, `rgba(255,252,236,${(0.95 * k).toFixed(3)})`);
    core.addColorStop(0.7, `rgba(255,226,160,${(0.75 * k).toFixed(3)})`);
    core.addColorStop(1, 'rgba(255,200,110,0)');
    ctx.fillStyle = core;
    ctx.fillRect(x - BEAM_HALF, top, BEAM_HALF * 2, floor - top);
    // Rings of script sliding down the column.
    ctx.strokeStyle = `rgba(255,240,200,${(0.5 * k).toFixed(3)})`;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      const y = floor - ((beam.t * 260 + i * 110) % 660);
      ctx.beginPath();
      ctx.ellipse(x, y, BEAM_HALF + 8, 5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Where it meets the floor, it burns.
    ctx.fillStyle = `rgba(255,248,220,${(0.8 * k).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(x, floor - 2, BEAM_HALF + 10, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
