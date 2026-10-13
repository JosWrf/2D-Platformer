import { audio, type Sfx } from '../core/audio';
import { Rect, approach, clamp, rand, rectsOverlap, sign } from '../core/math';
import { PALETTE, RAMP } from '../render/palette';
import { ring as pixelRing, rect, sector } from '../render/pen';
import { ART, snap } from '../render/pixel';
import { hash2 } from '../render/sheet';
import { glow, shadow, withHitFlash } from '../render/sprites';
import { TILE } from '../world/tiles';
import type { World } from '../world/context';
import { angleStep, blit, dashedOval, ovalRing, quad, solidFlash } from './boss-art';
import { Body } from './entity';
import { bubbleSprite, gallertPart, heapTop, lipPart, mirePart } from './gallert-art';
import { BULK_H, type Tone, bodyPart, headPart, sealPart, segmentPart, stumpPart, warmHydra } from './hydra-art';
import { clusterPart, heartAt, heartPart, shardPart } from './prism-art';
import { type Pose as QueenPose, columnPart, mantlePart, queenPart } from './thalassa-art';
import { wardenPart } from './warden-art';
import {
  BAT,
  type BatFrame,
  CHARGER_FEET,
  CHARGER_SPINE,
  KLINGENLAEUFER,
  type ChargerFrame,
  MAGE,
  MAGE_H,
  MAGE_SPINE,
  type MageFrame,
  SCHILDWACHE,
  SHIELD_H,
  SHIELD_SPINE,
  type ShieldFrame,
  SKELETON,
  SKELETON_H,
  SKELETON_SPINE,
  type SkeletonFrame,
  SLIME,
  SLIME_H,
  type SlimeFrame,
  ZUNDER,
  ZUNDER_FEET,
  type ZunderFrame,
  homeZone,
  keyColor,
  paletteFor,
} from './foe-art';
import { Projectile } from './projectile';
import { type RelicId, mightOf } from './relics';

export type EnemyKind =
  | 'slime'
  | 'bat'
  | 'skeleton'
  | 'mage'
  | 'bomber'
  | 'shieldman'
  | 'charger'
  | 'gallert'
  | 'hydra'
  | 'warden'
  | 'thalassa'
  | 'prismarch'
  | 'colossus'
  | 'wyrm'
  | 'vesper'
  | 'mimic'
  | 'spider'
  | 'spiderling'
  | 'shadow'
  | 'boar'
  | 'twins'
  | 'clock'
  | 'jester'
  | 'gloom'
  | 'gargoyle';

/**
 * The kinds that are bosses rather than roster: announced, with a health bar,
 * and once beaten they stay beaten - the checkpoint rebuilds the roster around
 * them, not them.
 */
export const BOSS_KINDS: ReadonlySet<EnemyKind> = new Set<EnemyKind>([
  'gallert',
  'hydra',
  'thalassa',
  'warden',
  'prismarch',
  'colossus',
  'wyrm',
  'vesper',
  'mimic',
  'spider',
  'shadow',
  'boar',
  'twins',
  'clock',
  'jester',
  'gloom',
  'gargoyle',
]);

/**
 * What a boss becomes when the hero turns up with what the others left him.
 *
 * It started with the blade: the upgrade is worth roughly two damage a second
 * at no risk at all, and the bosses were built against a sword. Measured on the
 * knight before this: a bot that only held the attack key used to lose the
 * fight eight times over, and with the blade it killed him in fourteen seconds
 * while he got a single move off.
 *
 * Every boss leaves a relic now, so every boss takes stock of all of them,
 * once, when it wakes: more health for everything that makes the hero hit
 * harder, and a little more for everything that keeps him standing - a longer
 * fight is the only answer a boss has to a hero who heals. Poise grows faster
 * than health with the offence alone, so a stronger blade does not turn into
 * a stunlock. Nothing shifts mid-fight, and the flood blade alone still comes
 * out at the +22 % and +35 % it always did.
 */
export function bossScale(relics: ReadonlySet<RelicId>): { hp: number; poise: number } {
  const might = mightOf(relics);
  const offense = might.offense - 1;
  const defense = might.defense - 1;
  return { hp: 1 + offense + defense * 0.3, poise: 1 + offense * 1.6 };
}

/** A light in world space, as the lighting pass takes it. */
export interface GlowLight {
  x: number;
  y: number;
  radius: number;
  rgb: string;
  strength: number;
  tint?: number;
}

export abstract class Enemy extends Body {
  hp = 2;
  maxHp = 2;
  /**
   * Which spawn in the level this one came out of. The game uses it to keep a
   * boss that has fallen from being built again at the next checkpoint.
   */
  spawnKey = '';
  /**
   * True while what this one called up should leave the hero to it: a
   * summoner's swarm (keyed by the summoner's kind) holds off meanwhile.
   */
  get holdsSwarm(): boolean {
    return false;
  }
  facing: 1 | -1 = -1;
  flash = 0;
  stun = 0;
  /**
   * Arachna's silk, thrown by the hero: while this runs the game lives this
   * one slower - see SNARE_PACE in skills.ts.
   */
  snare = 0;
  contactDamage = 1;
  scoreValue = 25;
  aggroRange = 240;
  /**
   * How far outside the view it is still drawn, in pixels: further for a boss
   * with a set piece of its own that stays where it is while he goes about.
   */
  drawReach = 140;

  /**
   * A set piece of its own, drawn with the ground rather than with the
   * actors: under the light like the rest of the level, and behind every
   * actor with their outlines between. Nothing, for most.
   */
  drawSetPiece(_ctx: CanvasRenderingContext2D): void {}
  /** Enemies far off-screen are frozen to keep the big level cheap. */
  active = false;
  /**
   * How long a boss is safe from being thrown off balance again.
   *
   * Poise alone is not enough. A player who simply holds the attack key deals
   * damage faster than any wind-up takes, so break after break lands and the
   * boss never completes a single move - measured on Thalassa: two projectiles
   * in ten seconds of fighting. After a break there is a breath in which the
   * next one cannot happen, and that breath is what lets her answer.
   */
  protected poiseLock = 0;
  /** For bosses: awake and fighting. The arenas close on this. */
  engaged = false;
  anim = 0;
  readonly homeX: number;
  readonly homeY: number;

  constructor(
    readonly kind: EnemyKind,
    x: number,
    y: number,
  ) {
    super();
    this.x = x;
    this.y = y;
    this.homeX = x;
    this.homeY = y;
  }

  overlaps(r: Rect): boolean {
    return rectsOverlap(this.rect, r);
  }

  hurt(amount: number, fromDir: number, world: World): void {
    if (this.dead) return;
    this.hp -= amount;
    this.flash = 1;
    this.stun = 0.22;
    this.vx = fromDir * 190;
    this.vy = Math.min(this.vy, -140);
    if (this.hp <= 0) {
      this.die(world);
    } else {
      audio.play('hit');
    }
  }

  protected die(world: World): void {
    this.dead = true;
    audio.play(BOSS_KINDS.has(this.kind) ? 'bossDown' : 'enemyDie');
    world.addScore(this.scoreValue, this.cx, this.y, `+${this.scoreValue}`);
    world.particles.burst(this.cx, this.cy, 22, this.deathColor(), { speed: 210, gravity: 520, size: 4 });
    world.particles.burst(this.cx, this.cy, 10, '#ffffff', { speed: 120, gravity: 200, shape: 'spark' });
  }

  protected abstract deathColor(): string;

  updateCommon(dt: number): void {
    this.anim += dt;
    this.flash = Math.max(0, this.flash - dt * 5);
    this.stun = Math.max(0, this.stun - dt);
    this.poiseLock = Math.max(0, this.poiseLock - dt);
  }

  abstract update(dt: number, world: World): void;
  abstract draw(ctx: CanvasRenderingContext2D, world: World): void;

  /**
   * The lights a big enemy carries, beyond the one the game gives every enemy
   * at its centre. A boss the size of a wall lit from one point in its middle
   * is a dark wall with a bright spot in it.
   */
  lights(): GlowLight[] {
    return [];
  }

  /**
   * Drawn a second time, faintly, on top of the darkness - see
   * Game.drawCastLight. Right for a bat in an unlit corner; wrong for a boss
   * that fills half the screen and carries its own lights, which that second
   * pass only washes out.
   */
  castLight = true;

  /** The name on the boss bar, for the bosses that draw one of their own. */
  barName(): string | null {
    return null;
  }

  /** Which notch of the boss bar it is in. */
  barPhase(): number {
    return 1;
  }

  /**
   * Marks under the boss bar, for a boss that is more than one bar coming
   * down - see BossBarInfo.pips. Null for one that is not.
   */
  barPips(): { pips: ('head' | 'stump' | 'sealed')[]; urgency: number[]; colors?: string[] } | null {
    return null;
  }

  /**
   * What a parry knocks out of this enemy, beyond the damage it deals.
   *
   * Most have nothing to lose; the shield carrier loses the shield, which is
   * the whole reason the parry exists as an answer to him.
   */
  onParried(world: World): void {
    void world;
  }

  /**
   * Takes stock of the hero's blade, once, at the moment of waking: more
   * health, and a poise figure scaled the same way. See bossScale.
   */
  protected sizeUpFor(world: World, poiseBase: number): number {
    const scale = bossScale(world.player.relics);
    this.maxHp = Math.round(this.maxHp * scale.hp);
    this.hp = this.maxHp;
    return Math.round(poiseBase * scale.poise);
  }

  /** Set once a roster monster has taken stock of the hero. */
  hardened = false;

  /**
   * The roster's answer to the relics: a monster that wakes in front of a
   * hero who hits harder carries more health, in the same measure. Once, when
   * it first comes into view - the hero it meets is the hero who is there, not
   * the one who passed the last checkpoint. Bosses do this for themselves when
   * they wake; see sizeUpFor.
   */
  harden(relics: ReadonlySet<RelicId>): void {
    if (this.hardened) return;
    this.hardened = true;
    if (BOSS_KINDS.has(this.kind)) return;
    const scaled = Math.round(this.maxHp * mightOf(relics).offense);
    if (scaled <= this.maxHp) return;
    this.hp += scaled - this.maxHp;
    this.maxHp = scaled;
  }

  /**
   * True when the step ahead leads off a ledge or onto something deadly.
   *
   * Measured over the whole level: five of eighteen skeletons walked into
   * their own spikes within nine seconds of waking up, and three more walked
   * off into the void. A patrol that kills itself before the player arrives is
   * an enemy the player never meets.
   */
  protected badStepAhead(world: World, dir: number): boolean {
    const level = world.level;
    const probeX = dir > 0 ? this.x + this.w + 4 : this.x - 4;
    if (level.groundBelow(probeX, this.bottom + 2, 3) > 40) return true;
    const tx = Math.floor(probeX / 32);
    const foot = Math.floor((this.bottom + 6) / 32);
    return level.hazardAt(tx, foot) || level.hazardAt(tx, foot - 1);
  }

  /**
   * Stops a walk that would carry the enemy into spikes or off a ledge.
   *
   * Applied to the velocity just before it moves, rather than inside a patrol
   * branch: measured, the shield carrier walked into his own spikes while
   * *advancing* on the player, and a guard that lives in the patrol case never
   * sees that. Only while standing - a knockback throws them airborne, and
   * being able to punt something into a pit is worth keeping.
   */
  /**
   * True when a hop of this reach would come down on nothing, or on something
   * deadly.
   *
   * badStepAhead only looks at the very next step, which is the right question
   * for a walker and the wrong one for anything that jumps: a slime passes that
   * check standing at the rim and then lands in the pit behind it. Measured at
   * its real place in the ruins, that is exactly what happened - three tiles of
   * floor missing, spikes at the bottom, and one fewer slime in the level nine
   * seconds after the run started.
   */
  protected badLandingAhead(world: World, dir: number, reach: number): boolean {
    const level = world.level;
    const x = this.cx + dir * reach;
    if (x < 16 || x > level.pixelWidth - 16) return true;
    if (level.groundBelow(x, this.bottom + 2, 4) > 64) return true;
    const tx = Math.floor(x / 32);
    const foot = Math.floor((this.bottom + 6) / 32);
    return level.hazardAt(tx, foot) || level.hazardAt(tx, foot - 1) || level.hazardAt(tx, foot + 1);
  }

  protected holdBackAtEdges(world: World): void {
    if (!this.onGround || this.vx === 0) return;
    if (this.badStepAhead(world, Math.sign(this.vx))) this.vx = 0;
  }

  /**
   * Spikes, measured on a slightly smaller box than the body - the same
   * allowance the hero gets.
   *
   * On the full box a skeleton standing one tile from a spike died on its
   * first frame: two tenths of a pixel of drift put the corner of its box into
   * the neighbouring column.
   */
  protected touchesHazard(world: World): boolean {
    return world.level.rectHitsHazard(this.x + 4, this.y + 4, this.w - 8, this.h - 6);
  }

  /** Touch damage; called by the game each frame. */
  touchPlayer(world: World): void {
    if (this.dead || this.contactDamage <= 0) return;
    const p = world.player;
    if (p.dead || p.isInvulnerable) return;
    if (!rectsOverlap(this.rect, p.rect)) return;
    p.hurt(this.contactDamage, sign(p.cx - this.cx) || 1, world);
  }
}

/* ------------------------------------------------------------- the roster */

/**
 * A roster monster's health once it has taken a blow: a bar one art pixel
 * tall a little over its head, the lost part in a dark red. It sits on the
 * actor layer like the monster, so it gets the same outline and reads against
 * any background. `top` is where the monster's drawing ends above.
 */
function drawPips(ctx: CanvasRenderingContext2D, e: Enemy, top: number): void {
  if (e.hp >= e.maxHp || e.maxHp <= 1) return;
  const cells = Math.max(4, Math.round(e.w / ART));
  const x = snap(e.cx - (cells * ART) / 2);
  const y = snap(top - 6);
  ctx.fillStyle = '#571c27';
  ctx.fillRect(x, y, cells * ART, ART);
  const left = Math.max(1, Math.round((cells * Math.max(0, e.hp)) / e.maxHp));
  ctx.fillStyle = '#f5555d';
  ctx.fillRect(x, y, left * ART, ART);
}

/**
 * The box a roster monster's drawing stays inside while it flashes: so far
 * either side of its middle, so far above its feet (or its middle, for a
 * flyer: a negative `below` measures from there) and so far below.
 */
function flashBox(e: Enemy, side: number, above: number, below: number): { x: number; y: number; w: number; h: number } | undefined {
  if (e.flash <= 0) return undefined;
  const base = below < 0 ? e.cy : e.bottom;
  const under = Math.abs(below);
  return { x: e.cx - side, y: base - above, w: side * 2, h: above + under };
}

/**
 * The contact line under a monster that walks or hops: on the floor below
 * it, narrower and fainter the higher it is, gone more than a few tiles up.
 */
function footShadow(ctx: CanvasRenderingContext2D, world: World, e: Enemy, width: number, strength: number): void {
  const gap = world.level.groundBelow(e.cx, e.bottom - 2, 5);
  if (gap >= 5 * TILE) return;
  const k = clamp(1 - (gap - 2) / 180, 0.3, 1);
  shadow(ctx, e.cx, e.bottom - 2 + gap + 1, width * k, strength * k);
}

/* -------------------------------------------------------------------- slime */

export class Slime extends Enemy {
  private hopTimer = rand(0.4, 1.4);
  private dir: 1 | -1 = -1;

  constructor(x: number, y: number) {
    super('slime', x, y);
    this.w = 26;
    this.h = 20;
    this.hp = this.maxHp = 3;
    this.scoreValue = 25;
  }

  protected override deathColor(): string {
    return keyColor(SLIME, paletteFor(homeZone(this)), '3');
  }

  override update(dt: number, world: World): void {
    this.updateCommon(dt);
    this.vy = Math.min(760, this.vy + 1600 * dt);

    if (this.stun <= 0) {
      const player = world.player;
      const distance = player.cx - this.cx;
      if (this.onGround) {
        this.vx = approach(this.vx, 0, 900 * dt);
        this.hopTimer -= dt;
        if (this.hopTimer <= 0) {
          const chasing = Math.abs(distance) < this.aggroRange;
          this.dir = chasing ? (distance > 0 ? 1 : -1) : this.dir;
          // Where the hop would land, not where the next step would fall: see
          // badLandingAhead. If both ways are bad he hops on the spot.
          const reach = chasing ? 92 : 58;
          let vx = this.dir * (chasing ? 130 : 80);
          if (this.badLandingAhead(world, this.dir, reach)) {
            this.dir = (-this.dir) as 1 | -1;
            vx = this.badLandingAhead(world, this.dir, reach) ? 0 : this.dir * 80;
          }
          this.facing = this.dir;
          this.vy = -350;
          this.vx = vx;
          this.hopTimer = chasing ? rand(0.6, 0.95) : rand(1.1, 1.8);
          world.particles.burst(this.cx, this.bottom, 5, PALETTE.slimeDark, { speed: 60, gravity: 300, size: 3 });
        }
      }
      // Turn around at walls; the ledges are handled where the hop is decided,
      // because that is the only place the landing spot is known.
      if (this.touching.left) this.dir = 1;
      if (this.touching.right) this.dir = -1;

    }

    this.moveAndCollide(world.level, dt);
    if (this.touchesHazard(world)) this.hurt(99, 0, world);
  }

  /** When the slime last came down, for the frame it lands on; and whether it was down. */
  private landedAt = -1;
  private grounded = true;

  /**
   * Drawn frames, not a scaled blob: it gathers itself flat a moment before
   * it hops - its hop timer is running out - goes up tall and narrow, comes
   * down long, lands squashed, and wobbles between two frames while it sits.
   */
  override draw(ctx: CanvasRenderingContext2D, world: World): void {
    if (this.onGround && !this.grounded) this.landedAt = this.anim;
    this.grounded = this.onGround;
    let frame: SlimeFrame;
    if (!this.onGround) frame = this.vy < -140 ? 'rise' : this.vy > 160 ? 'fall' : 'idle0';
    else if (this.anim - this.landedAt < 0.09) frame = 'land';
    else if (this.stun <= 0 && this.hopTimer < 0.14) frame = 'crouch';
    else frame = Math.floor(this.anim * 2.6) % 2 === 0 ? 'idle0' : 'idle1';
    const palette = paletteFor(homeZone(this));
    footShadow(ctx, world, this, this.w * 1.3, 0.34);
    withHitFlash(ctx, this.flash, (c) => SLIME.draw(c, frame, this.cx, this.bottom, 9, SLIME_H, this.facing, palette), flashBox(this, 40, 34, 6));
    drawPips(ctx, this, this.bottom - (frame === 'rise' ? 28 : 22));
  }
}

/* ---------------------------------------------------------------------- bat */

/**
 * How long a bat pulls up before it dives: it stops, rises a little, its eyes
 * burn and it screeches - then it comes. It used to dive out of its hover with
 * nothing before it, a fall of 90 px in 0.37 s: from Vesperon's swarm, which
 * kept four of them over the hero, that was six hearts a fight to a hero who
 * saw everything else coming, and most of what reading him cost. Half a
 * second, like every other blow in the game: at 0.42 his bats still cost a
 * hero who read him four hearts in seven, mostly while he went in on the
 * lord lying on the roof.
 */
const BAT_TELL = 0.5;

export class Bat extends Enemy {
  private phase = rand(0, Math.PI * 2);
  private diving = false;
  private diveCooldown = rand(0.5, 2);
  /** Seconds left of the pull-up before a dive; 0 when it is not about to. */
  private tell = 0;

  constructor(x: number, y: number) {
    super('bat', x, y);
    this.w = 22;
    this.h = 16;
    this.hp = this.maxHp = 2;
    this.scoreValue = 30;
    this.aggroRange = 260;
    // It flies: a plank is not somewhere to land. They used to settle on one
    // whenever the hero was below it, and sit there bouncing.
    this.ignorePlatforms = true;
  }

  protected override deathColor(): string {
    return keyColor(BAT, paletteFor(homeZone(this)), 'd');
  }

  /**
   * Bats of one swarm - Vesperon's, which share his key - come down one at a
   * time: while one pulls up or dives, the rest keep circling. Four of them
   * diving as they pleased came down two and three at once, and no reading of
   * the one in front of the hero helped against the one behind him. Nor do
   * they come while their summoner is busy with him himself (see holdsSwarm):
   * a hero standing for the parry of a dive cannot also turn to a bat.
   */
  private waitsItsTurn(world: World): boolean {
    if (!this.spawnKey) return false;
    return world.enemies.some(
      (e) =>
        e !== this &&
        !e.dead &&
        ((e instanceof Bat && e.spawnKey === this.spawnKey && (e.tell > 0 || e.diving)) ||
          (e.kind === this.spawnKey && e.holdsSwarm)),
    );
  }

  override update(dt: number, world: World): void {
    this.updateCommon(dt);
    this.phase += dt * 3;
    const player = world.player;
    const dx = player.cx - this.cx;
    const dy = player.cy - this.cy;
    const dist = Math.hypot(dx, dy);

    if (this.stun > 0) {
      this.tell = 0;
      this.vy += 900 * dt;
    } else if (this.diving) {
      this.diveCooldown -= dt;
      if (this.diveCooldown <= 0) {
        this.diving = false;
        this.diveCooldown = rand(1.2, 2.2);
      }
    } else if (this.tell > 0) {
      // Pulling up: away from the hero and a little higher, slowing to a stop.
      this.tell -= dt;
      this.vx = approach(this.vx, -Math.sign(dx) * 30, 600 * dt);
      this.vy = approach(this.vy, -40, 600 * dt);
      if (this.tell <= 0) {
        this.tell = 0;
        this.diving = true;
        this.diveCooldown = 0.9;
        const len = dist || 1;
        this.vx = (dx / len) * 250;
        this.vy = (dy / len) * 250;
      }
    } else {
      this.diveCooldown -= dt;
      if (dist < this.aggroRange && this.diveCooldown <= 0) {
        if (this.waitsItsTurn(world)) {
          this.diveCooldown = rand(0.25, 0.5);
        } else {
          this.tell = BAT_TELL;
          audio.play('screech', 1.4);
        }
      } else {
        const targetX = dist < this.aggroRange ? player.cx - Math.sign(dx) * 70 : this.homeX;
        const targetY = (dist < this.aggroRange ? player.cy - 60 : this.homeY) + Math.sin(this.phase) * 16;
        this.vx = approach(this.vx, clamp((targetX - this.cx) * 2.2, -140, 140), 420 * dt);
        this.vy = approach(this.vy, clamp((targetY - this.cy) * 2.2, -140, 140), 420 * dt);
      }
    }

    if (Math.abs(this.vx) > 8) this.facing = this.vx > 0 ? 1 : -1;
    this.moveAndCollide(world.level, dt);
    if (this.touching.left || this.touching.right || this.touching.up || this.touching.down) {
      this.diving = false;
      this.vx *= -0.4;
      this.vy *= -0.4;
    }
    if (this.touchesHazard(world)) this.hurt(99, 0, world);
  }

  /**
   * Four wing beats while it circles. Pulling up to dive it is a different
   * shape altogether - wings flung up and wide, trembling between two frames,
   * mouth open on its fangs, eyes white-hot - with a glow round its head that
   * grows as the half second runs out; diving, it folds its wings back.
   */
  override draw(ctx: CanvasRenderingContext2D): void {
    let frame: BatFrame;
    if (this.tell > 0) frame = Math.floor(this.anim * 14) % 2 === 0 ? 'tell0' : 'tell1';
    else if (this.diving) frame = 'dive';
    else frame = BAT_BEATS[Math.floor(this.anim * 11) % 4];
    const palette = paletteFor(homeZone(this));
    const burn = this.tell > 0 ? 1 - this.tell / BAT_TELL : 0;
    if (burn > 0) glow(ctx, this.cx, this.cy - 2, 10 + burn * 12, keyColor(BAT, palette, 'e'), 0.3 + burn * 0.5);
    withHitFlash(ctx, this.flash, (c) => BAT.draw(c, frame, this.cx, this.cy, 11, 8, this.facing, palette), flashBox(this, 30, 20, -16));
    drawPips(ctx, this, this.cy - 12);
  }
}

/** The wing beat, down and up again. */
const BAT_BEATS: readonly BatFrame[] = ['fly0', 'fly1', 'fly2', 'fly3'];

/* ----------------------------------------------------------------- skeleton */

/**
 * How long a skeleton holds its sword up before the cut: half a second, like
 * every other blow in the game. It was 0.36 - to an eye 0.3 s behind, the
 * raised sword showed for six hundredths of a second before it came down, and
 * in Morvain's throne room, where they are summoned into a fight that already
 * asks for the eyes elsewhere, that was a heart now and then that nobody
 * could have read.
 */
const SKELETON_WINDUP = 0.5;

export class Skeleton extends Enemy {
  private state: 'patrol' | 'chase' | 'windup' | 'swing' | 'cooldown' = 'patrol';
  private timer = 0;
  private dir: 1 | -1 = -1;
  private hitPlayerThisSwing = false;

  constructor(x: number, y: number) {
    super('skeleton', x, y);
    this.w = 22;
    this.h = 34;
    this.hp = this.maxHp = 5;
    this.scoreValue = 60;
    this.aggroRange = 230;
  }

  protected override deathColor(): string {
    return '#c7cfdd';
  }

  override update(dt: number, world: World): void {
    this.updateCommon(dt);
    this.vy = Math.min(760, this.vy + 1700 * dt);
    const player = world.player;
    const dx = player.cx - this.cx;
    const dist = Math.abs(dx);

    if (this.stun > 0) {
      this.state = 'cooldown';
      this.timer = 0.25;
    } else {
      this.timer -= dt;
      switch (this.state) {
        case 'patrol': {
          this.facing = this.dir;
          this.vx = approach(this.vx, this.dir * 52, 700 * dt);
          if (this.touching.left) this.dir = 1;
          if (this.touching.right) this.dir = -1;
          if (this.onGround && this.badStepAhead(world, this.dir)) {
            this.dir = (-this.dir) as 1 | -1;
            // Away at once. approach() would let the old direction run on for
            // another few frames, and those frames are inside the spikes.
            this.vx = this.dir * 30;
          }
          if (dist < this.aggroRange && Math.abs(player.cy - this.cy) < 70) this.state = 'chase';
          break;
        }
        case 'chase': {
          this.dir = dx > 0 ? 1 : -1;
          this.facing = this.dir;
          this.vx = approach(this.vx, this.dir * 108, 900 * dt);
          if (dist < 46) {
            this.state = 'windup';
            this.timer = SKELETON_WINDUP;
            this.vx = 0;
          } else if (dist > this.aggroRange * 1.5) {
            this.state = 'patrol';
          }
          break;
        }
        case 'windup': {
          this.vx = approach(this.vx, 0, 1400 * dt);
          if (this.timer <= 0) {
            this.state = 'swing';
            this.timer = 0.22;
            this.hitPlayerThisSwing = false;
            this.vx = this.facing * 130;
            audio.play('swing', 0.75);
          }
          break;
        }
        case 'swing': {
          if (!this.hitPlayerThisSwing) {
            const box = this.attackRect();
            if (!player.dead && !player.isInvulnerable && player.overlaps(box)) {
              this.hitPlayerThisSwing = true;
              player.hurt(1, this.facing, world);
            }
          }
          if (this.timer <= 0) {
            this.state = 'cooldown';
            this.timer = 0.45;
          }
          break;
        }
        case 'cooldown': {
          this.vx = approach(this.vx, 0, 1200 * dt);
          if (this.timer <= 0) this.state = dist < this.aggroRange ? 'chase' : 'patrol';
          break;
        }
      }
    }

    this.holdBackAtEdges(world);
    this.moveAndCollide(world.level, dt);
    if (this.touchesHazard(world)) this.hurt(99, 0, world);
  }


  private attackRect(): Rect {
    return {
      x: this.facing > 0 ? this.x + this.w - 6 : this.x - 32,
      y: this.y + 4,
      w: 38,
      h: this.h - 6,
    };
  }

  /**
   * The sword held out at the hero while it walks; through the wind-up it is
   * straight up over the skull and the eyes glare yellow where they glowed
   * coal-red - the blade and the eyes both, so the tell reads even when the
   * blade is behind something - with a glow round the skull. The cut is one
   * frame with the smear of the blade in it, and after it the sword hangs.
   */
  override draw(ctx: CanvasRenderingContext2D, world: World): void {
    let frame: SkeletonFrame;
    switch (this.state) {
      case 'windup':
        frame = Math.floor(this.anim * 16) % 2 === 0 ? 'windup0' : 'windup1';
        break;
      case 'swing':
        frame = 'cut';
        break;
      case 'cooldown':
        frame = 'low';
        break;
      default:
        // One step for every five art pixels walked, so the feet do not slide.
        frame = Math.abs(this.vx) > 12 ? SKELETON_STEPS[Math.floor(Math.abs(this.x) / 10) % 4] : 'stand';
    }
    const palette = paletteFor(homeZone(this));
    footShadow(ctx, world, this, 28, 0.34);
    if (this.state === 'windup') glow(ctx, this.cx, this.bottom - 35, 14, '#ffd27a', 0.6);
    withHitFlash(ctx, this.flash, (c) => SKELETON.draw(c, frame, this.cx, this.bottom, SKELETON_SPINE, SKELETON_H, this.facing, palette), flashBox(this, 64, 64, 6));
    drawPips(ctx, this, this.bottom - (frame === 'windup0' || frame === 'windup1' ? 60 : 40));
  }
}

/** A walk cycle: stride, pass, the other stride, pass. */
const SKELETON_STEPS: readonly SkeletonFrame[] = ['walk0', 'walk1', 'walk2', 'walk3'];

/* --------------------------------------------------------------------- mage */

export class DarkMage extends Enemy {
  private castTimer = rand(1, 2.2);
  private floatPhase = rand(0, Math.PI * 2);
  private casting = 0;

  constructor(x: number, y: number) {
    super('mage', x, y);
    this.w = 22;
    this.h = 32;
    this.hp = this.maxHp = 4;
    this.scoreValue = 70;
    this.aggroRange = 380;
    this.contactDamage = 1;
  }

  protected override deathColor(): string {
    return keyColor(MAGE, paletteFor(homeZone(this)), 'l');
  }

  override update(dt: number, world: World): void {
    this.updateCommon(dt);
    this.floatPhase += dt * 2;
    const player = world.player;
    const dx = player.cx - this.cx;
    const dist = Math.abs(dx);
    this.facing = dx > 0 ? 1 : -1;

    if (this.stun > 0) {
      this.vy += 1200 * dt;
    } else {
      // Hovers slightly above its anchor point and keeps its distance.
      const targetY = this.homeY - 6 + Math.sin(this.floatPhase) * 7;
      this.vy = approach(this.vy, (targetY - this.y) * 3.2, 600 * dt);
      let targetVx = 0;
      if (dist < 110) targetVx = -Math.sign(dx) * 70;
      else if (dist > 240 && dist < this.aggroRange) targetVx = Math.sign(dx) * 55;
      this.vx = approach(this.vx, targetVx, 500 * dt);

      if (dist < this.aggroRange) {
        this.castTimer -= dt;
        if (this.castTimer <= 0 && this.casting <= 0) {
          this.casting = 0.45;
          this.castTimer = rand(1.9, 3.0);
        }
      }
      if (this.casting > 0) {
        this.casting -= dt;
        world.particles.spawn({
          x: this.cx + this.facing * 12,
          y: this.cy - 4,
          vx: rand(-20, 20),
          vy: rand(-30, 10),
          color: 'rgba(200,90,223,0.8)',
          gravity: -60,
          size: 3,
          life: 0.3,
          shape: 'circle',
        });
        if (this.casting <= 0) {
          const dy = player.cy - this.cy;
          const len = Math.hypot(dx, dy) || 1;
          const speed = 190;
          const p = new Projectile('orb', this.cx - 7 + this.facing * 12, this.cy - 11, (dx / len) * speed, (dy / len) * speed);
          world.spawnProjectile(p);
          audio.play('magic', 0.8);
        }
      }
    }

    this.moveAndCollide(world.level, dt);
    if (this.touchesHazard(world)) this.hurt(99, 0, world);
  }

  /**
   * The robe stirs between two frames while it hovers. Casting, the orb on
   * its staff swells into a flaring cross of white and its eyes go white in
   * the hood, with the orb's glow grown round it - the whole of the cast, so
   * the orb that follows is never a surprise.
   */
  override draw(ctx: CanvasRenderingContext2D): void {
    const casting = this.casting > 0;
    const frame: MageFrame = casting
      ? Math.floor(this.anim * 12) % 2 === 0
        ? 'cast0'
        : 'cast1'
      : Math.floor(this.anim * 2.5) % 2 === 0
        ? 'idle0'
        : 'idle1';
    const palette = paletteFor(homeZone(this));
    glow(ctx, this.cx + this.facing * 14, this.bottom - 45, casting ? 22 : 12, keyColor(MAGE, palette, 'o'), casting ? 0.7 : 0.3);
    withHitFlash(ctx, this.flash, (c) => MAGE.draw(c, frame, this.cx, this.bottom, MAGE_SPINE, MAGE_H, this.facing, palette), flashBox(this, 40, 56, 6));
    drawPips(ctx, this, this.bottom - 42);
  }
}

/* -------------------------------------------------------------------- bomber */

/** How far the burst reaches, and what it does inside that. */
const BOOM_RADIUS = 66;
const BOOM_DAMAGE = 2;

/**
 * Zunder - a sac of something that wants to go off.
 *
 * It waddles at the hero and lights itself when it gets close. What makes it
 * more than a slow slime is that killing it lights it too: a point-blank swing
 * is answered by the burst it was going to make anyway. The clean answer is to
 * put it down from a distance, which is exactly what the thrown crescent and
 * the mages' own orbs are for - so it also teaches the upgrade.
 */
export class Bomber extends Enemy {
  private state: 'walk' | 'fuse' = 'walk';
  private fuse = 0;
  private dir: 1 | -1 = -1;
  private beeped = 0;

  constructor(x: number, y: number) {
    super('bomber', x, y);
    this.w = 22;
    this.h = 22;
    this.hp = this.maxHp = 2;
    this.scoreValue = 45;
    this.aggroRange = 210;
    this.contactDamage = 0; // It does its damage by going off, not by touching.
  }

  protected override deathColor(): string {
    return '#ffa214';
  }

  /** Any death lights the fuse instead of ending it. That is the whole trick. */
  override hurt(amount: number, fromDir: number, _world: World): void {
    if (this.dead) return;
    this.hp -= amount;
    this.flash = 1;
    this.vx = fromDir * 150;
    if (this.hp > 0) {
      audio.play('hit');
      return;
    }
    this.hp = 0;
    if (this.state !== 'fuse') this.light(0.26);
  }

  private light(seconds: number): void {
    this.state = 'fuse';
    this.fuse = seconds;
    this.beeped = 0;
    audio.play('fuse');
  }

  private boom(world: World): void {
    this.dead = true;
    audio.play('explode');
    world.camera.addShake(5);
    world.particles.burst(this.cx, this.cy, 34, '#ffb066', { speed: 300, gravity: 220, size: 4 });
    world.particles.burst(this.cx, this.cy, 18, '#fff0c8', { speed: 190, shape: 'spark' });
    world.addScore(this.scoreValue, this.cx, this.y, `+${this.scoreValue}`);

    const player = world.player;
    if (!player.dead && !player.isInvulnerable) {
      const d = Math.hypot(player.cx - this.cx, player.cy - this.cy);
      if (d < BOOM_RADIUS) player.hurt(BOOM_DAMAGE, sign(player.cx - this.cx) || 1, world);
    }
    // It does not care whose side anyone is on. A skeleton standing next to it
    // when it goes off is a skeleton the player did not have to fight.
    for (const other of world.enemies) {
      if (other === this || other.dead) continue;
      const d = Math.hypot(other.cx - this.cx, other.cy - this.cy);
      if (d < BOOM_RADIUS) other.hurt(3, sign(other.cx - this.cx) || 1, world);
    }
  }

  override update(dt: number, world: World): void {
    this.updateCommon(dt);
    const player = world.player;
    const dx = player.cx - this.cx;
    const dist = Math.abs(dx);

    if (this.state === 'fuse') {
      this.fuse -= dt;
      // A rising tick, so the last moment is audible as well as visible.
      this.beeped -= dt;
      if (this.beeped <= 0) {
        this.beeped = Math.max(0.06, this.fuse * 0.35);
        audio.play('fuse', 1.3);
      }
      this.vx = approach(this.vx, 0, 600 * dt);
      this.vy += 1400 * dt;
      this.moveAndCollide(world.level, dt);
      if (this.fuse <= 0) this.boom(world);
      return;
    }

    if (this.stun <= 0) {
      if (dist < this.aggroRange && !player.dead) {
        this.dir = dx > 0 ? 1 : -1;
        this.vx = approach(this.vx, this.dir * 62, 400 * dt);
        if (dist < 46 && Math.abs(player.cy - this.cy) < 44) this.light(0.85);
      } else {
        // Idles on the spot rather than patrolling: it is a trap, and a trap
        // that wanders off is no trap.
        this.vx = approach(this.vx, 0, 400 * dt);
      }
      this.facing = this.dir;
      // Turns at a ledge or in front of spikes instead of walking into them.
      if (this.onGround && this.badStepAhead(world, this.dir)) {
        this.dir = -this.dir as 1 | -1;
        this.vx = 0;
      }
    }

    this.vy += 1400 * dt;
    this.holdBackAtEdges(world);
    this.moveAndCollide(world.level, dt);
    if (this.touchesHazard(world)) this.light(0.2);
  }

  /**
   * The tell: it swells, and a ring closes in on it. Both are needed - the
   * swell reads up close, the ring reads across the room. The swell is four
   * drawn frames, each a pixel rounder with its seams split wider on the fire
   * inside, and it shudders a pixel to and fro; the ring is one art pixel of
   * the blast's own colour round the reach of the blast, closing in.
   */
  override draw(ctx: CanvasRenderingContext2D, world: World): void {
    const lit = this.state === 'fuse';
    const heat = lit ? 1 - Math.max(0, this.fuse) / 0.9 : 0;
    let frame: ZunderFrame;
    if (lit) frame = heat < 0.25 ? 'fuse0' : heat < 0.5 ? 'fuse1' : heat < 0.75 ? 'fuse2' : 'fuse3';
    else if (Math.abs(this.vx) > 8) frame = Math.floor(Math.abs(this.x) / 8) % 2 === 0 ? 'walk0' : 'walk1';
    else frame = 'stand';
    const palette = paletteFor(homeZone(this));
    const shudder = lit && Math.floor(this.anim * 30) % 2 === 0 ? ART : 0;
    footShadow(ctx, world, this, this.w * 1.2, 0.34);
    if (lit) glow(ctx, this.cx, this.cy - 4, 18 + heat * 14, '#ffa214', 0.35 + heat * 0.4);
    withHitFlash(ctx, this.flash, (c) => ZUNDER.draw(c, frame, this.cx + shudder, this.bottom, 9, ZUNDER_FEET, this.facing, palette), flashBox(this, 28, 40, 6));
    if (lit) {
      // The closing ring, in world space so its size means distance.
      pixelRing(ctx, this.cx, this.cy, BOOM_RADIUS * (1 - heat * 0.72), `rgba(255,200,37,${(0.45 + heat * 0.15).toFixed(2)})`);
    }
    drawPips(ctx, this, this.bottom - 26);
  }
}

/* ----------------------------------------------------------------- shieldman */

/**
 * Schildwache - a tower shield with someone behind it.
 *
 * Everything that comes at the shield stops there, the thrown crescent
 * included. The answers are position and timing: get behind it, or parry the
 * thrust, which pulls the shield down for a breath. It is the one enemy in the
 * game that a player who only holds the attack key cannot beat.
 */
export class Shieldman extends Enemy {
  private state: 'patrol' | 'advance' | 'thrustWind' | 'thrust' | 'exposed' = 'patrol';
  private timer = 0;
  private dir: 1 | -1 = -1;
  private hitThisThrust = false;

  constructor(x: number, y: number) {
    super('shieldman', x, y);
    this.w = 24;
    this.h = 34;
    this.hp = this.maxHp = 6;
    this.scoreValue = 90;
    this.aggroRange = 250;
    this.contactDamage = 1;
  }

  /** True while the shield is down and hits land from any side. */
  get exposed(): boolean {
    return this.state === 'exposed';
  }

  protected override deathColor(): string {
    return '#92a1b9';
  }

  override hurt(amount: number, fromDir: number, world: World): void {
    if (this.dead) return;
    // A blow into the shield is a blow into a wall.
    const fromFront = Math.sign(fromDir) === -this.facing;
    if (fromFront && !this.exposed) {
      audio.play('clank', 0.8);
      world.particles.burst(this.cx - this.facing * 12, this.cy - 4, 8, '#dfe8ff', {
        speed: 150,
        shape: 'spark',
        angle: fromDir > 0 ? Math.PI : 0,
        spread: 1.1,
      });
      this.flash = Math.max(this.flash, 0.4);
      this.vx = fromDir * 60;
      return;
    }
    super.hurt(amount, fromDir, world);
  }

  /** A parried thrust drops the shield: that is what the parry is for. */
  override onParried(world: World): void {
    if (this.dead) return;
    this.state = 'exposed';
    this.timer = 1.8;
    this.vx = -this.facing * 120;
    audio.play('clank', 0.55);
    world.particles.burst(this.cx, this.cy, 12, '#dfe8ff', { speed: 170, shape: 'spark' });
  }

  override update(dt: number, world: World): void {
    this.updateCommon(dt);
    const player = world.player;
    const dx = player.cx - this.cx;
    const dist = Math.abs(dx);
    if (this.stun <= 0 && this.state !== 'exposed') this.facing = dist < this.aggroRange ? (dx > 0 ? 1 : -1) : this.dir;
    this.timer -= dt;

    if (this.stun <= 0) {
      switch (this.state) {
        case 'patrol': {
          this.vx = approach(this.vx, this.dir * 42, 340 * dt);
          if (this.onGround && this.badStepAhead(world, this.dir)) {
            this.dir = -this.dir as 1 | -1;
            this.vx = this.dir * 30;
          }
          if (this.touching.left || this.touching.right) this.dir = -this.dir as 1 | -1;
          if (dist < this.aggroRange && Math.abs(player.cy - this.cy) < 60) {
            this.state = 'advance';
            this.timer = 0.6;
          }
          break;
        }
        case 'advance':
          this.vx = approach(this.vx, dist > 40 ? this.facing * 52 : 0, 340 * dt);
          if (this.timer <= 0) {
            if (dist < 58) {
              this.state = 'thrustWind';
              this.timer = 0.42;
              this.hitThisThrust = false;
              audio.play('swing', 0.7);
            } else if (dist > this.aggroRange) {
              this.state = 'patrol';
            } else {
              this.timer = 0.5;
            }
          }
          break;
        case 'thrustWind':
          this.vx = approach(this.vx, -this.facing * 30, 400 * dt);
          if (this.timer <= 0) {
            this.state = 'thrust';
            this.timer = 0.24;
            this.vx = this.facing * 210;
          }
          break;
        case 'thrust': {
          const reach = {
            x: this.facing > 0 ? this.x + this.w - 4 : this.x - 22,
            y: this.y + 6,
            w: 26,
            h: 16,
          };
          if (!this.hitThisThrust && !player.dead && rectsOverlap(reach, player.rect)) {
            this.hitThisThrust = true;
            player.hurt(1, this.facing, world);
          }
          if (this.timer <= 0) {
            this.state = 'advance';
            this.timer = 0.75;
          }
          break;
        }
        case 'exposed':
          this.vx = approach(this.vx, 0, 500 * dt);
          if (this.timer <= 0) {
            this.state = 'advance';
            this.timer = 0.4;
          }
          break;
      }
    }

    this.vy += 1400 * dt;
    this.holdBackAtEdges(world);
    this.moveAndCollide(world.level, dt);
    if (this.touchesHazard(world)) this.hurt(99, 0, world);
  }

  /**
   * The shield stands in front of it - its forward side, whichever way it
   * faces - with a lit rim along the leading edge, so the guarded side is the
   * side that catches the light. The thrust is drawn as a lean back with the
   * spear drawn in, then the spear out past the shield. Parried, the shield
   * lies on the floor, the eye slit burns orange, and a glow marks it: open.
   */
  override draw(ctx: CanvasRenderingContext2D, world: World): void {
    let frame: ShieldFrame;
    switch (this.state) {
      case 'exposed':
        frame = 'open';
        break;
      case 'thrustWind':
        frame = 'wind';
        break;
      case 'thrust':
        frame = 'thrust';
        break;
      default:
        frame = Math.abs(this.vx) > 8 ? (Math.floor(Math.abs(this.x) / 9) % 2 === 0 ? 'walk0' : 'walk1') : 'stand';
    }
    const palette = paletteFor(homeZone(this));
    footShadow(ctx, world, this, 30, 0.36);
    if (this.exposed) glow(ctx, this.cx + this.facing * 2, this.bottom - 31, 12, '#ffa214', 0.6);
    withHitFlash(ctx, this.flash, (c) => SCHILDWACHE.draw(c, frame, this.cx, this.bottom, SHIELD_SPINE, SHIELD_H, this.facing, palette), flashBox(this, 72, 44, 6));
    drawPips(ctx, this, this.bottom - 40);
  }
}

/* ------------------------------------------------------------------- charger */

/**
 * Klingenläufer - it digs in, then crosses the room.
 *
 * The one enemy that punishes standing still, and the one that can be turned
 * against the level: a charge into a wall leaves it dazed and taking double for
 * a second and a half. Standing in front of a wall and stepping aside is the
 * intended answer, and it is more satisfying than trading hits.
 */
export class Charger extends Enemy {
  private state: 'patrol' | 'wind' | 'run' | 'dazed' = 'patrol';
  private timer = 0;
  private dir: 1 | -1 = -1;
  private hitThisRun = false;

  constructor(x: number, y: number) {
    super('charger', x, y);
    this.w = 26;
    this.h = 24;
    this.hp = this.maxHp = 4;
    this.scoreValue = 75;
    this.aggroRange = 270;
    this.contactDamage = 1;
  }

  protected override deathColor(): string {
    return keyColor(KLINGENLAEUFER, paletteFor(homeZone(this)), 'a');
  }

  override hurt(amount: number, fromDir: number, world: World): void {
    // Dazed against a wall is the window, so it is worth twice as much.
    super.hurt(this.state === 'dazed' ? amount * 2 : amount, fromDir, world);
  }

  override touchPlayer(world: World): void {
    if (this.state === 'run') return; // The run does its own, heavier hit.
    super.touchPlayer(world);
  }

  override update(dt: number, world: World): void {
    this.updateCommon(dt);
    const player = world.player;
    const dx = player.cx - this.cx;
    const dist = Math.abs(dx);
    this.timer -= dt;

    if (this.stun <= 0) {
      switch (this.state) {
        case 'patrol': {
          this.vx = approach(this.vx, this.dir * 46, 320 * dt);
          this.facing = this.dir;
          if (this.onGround && this.badStepAhead(world, this.dir)) {
            this.dir = -this.dir as 1 | -1;
            this.vx = this.dir * 30;
          }
          if (this.touching.left || this.touching.right) this.dir = -this.dir as 1 | -1;
          // Only charges at something roughly level with it, so a hero on a
          // ledge is not hit by something that cannot reach him.
          if (dist < this.aggroRange && Math.abs(player.bottom - this.bottom) < 40) {
            this.state = 'wind';
            this.timer = 0.45;
            this.facing = dx > 0 ? 1 : -1;
            this.dir = this.facing;
            audio.play('swing', 0.6);
          }
          break;
        }
        case 'wind':
          this.vx = approach(this.vx, -this.facing * 40, 400 * dt);
          if (world.time % 0.06 < dt) {
            world.particles.spawn({
              x: this.cx - this.facing * 12,
              y: this.bottom - 3,
              vx: -this.facing * rand(40, 110),
              vy: rand(-40, -10),
              color: 'rgba(180,150,120,0.6)',
              gravity: 260,
              size: 2.5,
              life: 0.35,
            });
          }
          if (this.timer <= 0) {
            this.state = 'run';
            this.timer = 0.62;
            this.hitThisRun = false;
            this.vx = this.facing * 420;
          }
          break;
        case 'run':
          if (this.badStepAhead(world, this.facing)) {
            // Digs its heels in at the edge. Baiting it into a wall still
            // works; running itself into the void unprompted does not.
            this.state = 'patrol';
            this.timer = 0.5;
            this.dir = -this.facing as 1 | -1;
            this.vx = this.dir * 40;
          }
          if (!this.hitThisRun && !player.dead && !player.isInvulnerable && this.overlaps(player.rect)) {
            this.hitThisRun = true;
            player.hurt(2, sign(player.cx - this.cx) || 1, world);
          }
          if (this.touching.left || this.touching.right) {
            this.state = 'dazed';
            this.timer = 1.5;
            this.vx = -this.facing * 90;
            audio.play('crumble', 1.3);
            world.camera.addShake(3);
            world.particles.burst(this.cx + this.facing * 12, this.cy, 16, '#c2a08a', {
              speed: 200,
              gravity: 300,
            });
          } else if (this.timer <= 0) {
            this.state = 'patrol';
            this.timer = 0.5;
          }
          break;
        case 'dazed':
          this.vx = approach(this.vx, 0, 400 * dt);
          if (this.timer <= 0) this.state = 'patrol';
          break;
      }
    }

    this.vy += 1400 * dt;
    this.holdBackAtEdges(world);
    this.moveAndCollide(world.level, dt);
    if (this.touchesHazard(world)) this.hurt(99, 0, world);
  }

  /**
   * It digs in before the run - haunches up, head down, the eye slit flung
   * wide and yellow, trembling between two frames - and runs with its legs
   * stretched out. Dazed against a wall it sags with its eye dull, and three
   * stars go round over its head, so the window reads without watching the
   * health bar.
   */
  override draw(ctx: CanvasRenderingContext2D, world: World): void {
    let frame: ChargerFrame;
    switch (this.state) {
      case 'dazed':
        frame = 'dazed';
        break;
      case 'wind':
        frame = Math.floor(this.anim * 18) % 2 === 0 ? 'wind0' : 'wind1';
        break;
      case 'run':
        frame = Math.floor(Math.abs(this.x) / 14) % 2 === 0 ? 'run0' : 'run1';
        break;
      default:
        frame = Math.abs(this.vx) > 8 && Math.floor(Math.abs(this.x) / 8) % 2 === 1 ? 'walk1' : 'walk0';
    }
    const palette = paletteFor(homeZone(this));
    footShadow(ctx, world, this, 34, 0.36);
    withHitFlash(ctx, this.flash, (c) => KLINGENLAEUFER.draw(c, frame, this.cx, this.bottom, CHARGER_SPINE, CHARGER_FEET, this.facing, palette), flashBox(this, 44, 34, 6));
    if (this.state === 'dazed') {
      ctx.fillStyle = '#ffeb57';
      for (let i = 0; i < 3; i++) {
        const a = this.anim * 5 + i * 2.1;
        ctx.fillRect(snap(this.cx + this.facing * 6 + Math.cos(a) * 10), snap(this.bottom - 30 + Math.sin(a) * 4), ART, ART);
      }
    }
    drawPips(ctx, this, this.bottom - 30);
  }
}

/* ------------------------------------------------------------------ warden */

/** Damage the warden shrugs off mid-move before it staggers. */
const POISE = 5;
/**
 * How long a stagger keeps it from being staggered again - longer than one
 * of its turns, and its poise does not drain meanwhile. With 2 s and a poise
 * that kept draining, the very first blow after the lock broke it again, every
 * time in the middle of the next wind-up: measured with the blade of the late
 * road, a hero who only held the attack key took it apart in 4.6 s without
 * one of its moves ever landing.
 */
const WARDEN_STAGGER_REST = 3.4;
/**
 * Health before the hero is sized up. Sixteen was a third of the knight's;
 * with the relics of the road it fell in eight seconds to a hero who read it,
 * before it had shown each of its three moves once, and a hero who only held
 * the attack key saw one move in nine seconds - which his silk caught. At 46,
 * one who stood at it swinging was through in fifteen seconds for four blows,
 * against half a minute and none for one who struck only while it stood open.
 */
const WARDEN_HP = 56;

/**
 * The Shard Warden: what the rift grew in the knight's place.
 *
 * A mini-boss rather than a second boss - a third of the knight's health and
 * three moves instead of five - but warded in like every other boss, because
 * a fight the road goes around is a fight nobody takes. What it keeps from
 * the knight is the thing that made him fair: every move is announced, and the
 * pause afterwards is long enough to answer.
 */
export class Warden extends Enemy {
  private state: 'wait' | 'stalk' | 'lungeWind' | 'lunge' | 'volleyWind' | 'slamWind' | 'slam' | 'recover' = 'wait';
  private timer = 0;
  private core = 0;
  private hitThisMove = false;
  /** Damage it can absorb mid-move before it is thrown off balance. */
  private poise = POISE;
  /** That figure, once it has seen the blade coming. */
  private poiseMax = POISE;
  /**
   * Set when a blow lands while it winds up; cleared when the next move
   * begins. The knight's rule, which it grew from him: hit it in its wind-up
   * and the blow comes early - once a move. Measured before this, a hero who
   * only held the attack key next to it was struck once in thirteen seconds,
   * because it stood in its own windows while he hit it.
   */
  private provoked = false;

  constructor(x: number, y: number) {
    super('warden', x, y);
    this.w = 46;
    this.h = 58;
    this.hp = this.maxHp = WARDEN_HP;
    this.scoreValue = 500;
    this.aggroRange = 300;
    this.contactDamage = 1;
  }

  protected override deathColor(): string {
    return '#8f5fd0';
  }

  protected override die(world: World): void {
    super.die(world);
    world.onBossFelled('warden', this.cx, this.y - 20);
  }

  /**
   * A move once started is seen through. Without this the warden is a sandbag:
   * every hit re-stunned it, so a player who simply held the attack key never
   * saw a single one of its attacks. Landing POISE damage still breaks it, and
   * a parry always does - that is what the parry is for.
   */
  override hurt(amount: number, fromDir: number, world: World): void {
    if (this.dead) return;
    this.hp -= amount;
    this.flash = 1;
    // Someone already reeling does not reel twice: see WARDEN_STAGGER_REST.
    if (this.poiseLock <= 0) this.poise -= amount;
    if (this.hp <= 0) {
      this.die(world);
      return;
    }
    audio.play('hit');
    const committed = this.state !== 'wait' && this.state !== 'stalk' && this.state !== 'recover';
    if (!committed) this.vx = fromDir * 130;
    const winding = this.state === 'slamWind' || this.state === 'lungeWind';
    if (winding && !this.provoked && this.timer > 0.14 && !(this.poise <= 0 && this.poiseLock <= 0)) {
      this.provoked = true;
      this.timer = 0.16;
      audio.play('parry', 0.6);
      world.particles.text(this.cx, this.y - 12, 'GEREIZT!', '#d9b0ff');
      world.particles.burst(this.cx, this.cy - 6, 12, '#e2c4ff', { speed: 210, shape: 'spark' });
    }
    if (this.poise <= 0 && this.poiseLock <= 0) {
      this.poise = this.poiseMax;
      this.poiseLock = WARDEN_STAGGER_REST;
      this.stun = 0.5;
      this.vx = fromDir * 150;
      world.particles.burst(this.cx, this.cy, 14, '#e2c4ff', { speed: 190, shape: 'spark' });
    }
  }

  override update(dt: number, world: World): void {
    this.updateCommon(dt);
    const player = world.player;
    const dx = player.cx - this.cx;
    const dist = Math.abs(dx);
    this.core = Math.max(0, this.core - dt * 2);

    if (!this.engaged) {
      if (dist < this.aggroRange && !player.dead) {
        this.engaged = true;
        this.poise = this.poiseMax = this.sizeUpFor(world, POISE);
        this.state = 'recover';
        this.timer = 0.9;
        world.camera.addShake(5);
      }
      this.vx = approach(this.vx, 0, 900 * dt);
      this.moveAndCollide(world.level, dt);
      return;
    }

    // A parry or a hard hit knocks it out of whatever it was doing.
    if (this.stun > 0) {
      if (this.state !== 'recover') {
        this.state = 'recover';
        this.timer = 0.75;
      }
      this.vy += 1400 * dt;
      this.moveAndCollide(world.level, dt);
      return;
    }

    if (this.state !== 'lunge') this.facing = dx > 0 ? 1 : -1;
    this.timer -= dt;

    switch (this.state) {
      case 'recover':
      case 'wait':
        this.vx = approach(this.vx, 0, 700 * dt);
        if (this.timer <= 0) {
          this.state = 'stalk';
          this.timer = rand(0.4, 0.7);
        }
        break;

      case 'stalk': {
        // Closes the distance at a walk, so its next move can be read coming.
        const want = dist > 90 ? sign(dx) * 74 : dist < 50 ? -sign(dx) * 60 : 0;
        this.vx = approach(this.vx, want, 620 * dt);
        if (this.timer <= 0) {
          this.hitThisMove = false;
          this.provoked = false;
          this.core = 1;
          if (dist < 84) {
            this.state = 'slamWind';
            this.timer = 0.5;
          } else if (dist < 210) {
            this.state = 'lungeWind';
            this.timer = 0.55;
          } else {
            this.state = 'volleyWind';
            this.timer = 0.5;
          }
          audio.play(this.state === 'slamWind' ? 'tellSlam' : this.state === 'lungeWind' ? 'tellLunge' : 'tellVolley', 0.8);
        }
        break;
      }

      case 'lungeWind':
        // Leans back into the wind-up; the core burns brighter the closer it is.
        this.vx = approach(this.vx, -this.facing * 40, 700 * dt);
        this.core = 1;
        if (this.timer <= 0) {
          this.state = 'lunge';
          this.timer = 0.36;
          this.vx = this.facing * 360;
          world.camera.addShake(3);
        }
        break;

      case 'lunge':
        if (this.timer <= 0 || this.touching.left || this.touching.right) {
          this.state = 'recover';
          this.timer = 1.15;
        }
        break;

      case 'volleyWind':
        this.vx = approach(this.vx, 0, 800 * dt);
        this.core = 1;
        if (this.timer <= 0) {
          for (let i = -1; i <= 1; i++) {
            const dy = player.cy - this.cy + i * 46;
            const len = Math.hypot(dx, dy) || 1;
            const shard = new Projectile('orb', this.cx - 7, this.cy - 14, (dx / len) * 200, (dy / len) * 200);
            world.spawnProjectile(shard);
          }
          audio.play('magic', 1.1);
          this.state = 'recover';
          this.timer = 1.25;
        }
        break;

      case 'slamWind':
        this.vx = approach(this.vx, 0, 900 * dt);
        this.core = 1;
        if (this.timer <= 0) {
          this.state = 'slam';
          this.timer = 1.1;
          this.vy = -470;
          this.vx = sign(dx) * 90;
        }
        break;

      case 'slam':
        /*
         * The landing has to be read as "on the ground and no longer rising".
         * It used to ask for a downward speed as well, and a collision zeroes
         * that in the very frame the feet touch: measured, the warden never
         * finished a slam at all - it stood in the state until a parry or a
         * poise break shook it out, and verify:warden's close-range run showed
         * it plainly, going stalk, slamWind, slam and never coming back.
         */
        if (this.onGround && this.vy >= 0) {
          world.camera.addShake(9);
          world.hitStop(0.05);
          audio.play('impactShard');
          world.particles.burst(this.cx, this.bottom, 26, '#b078ff', { speed: 260, gravity: 620, shape: 'spark' });
          if (!this.hitThisMove && Math.abs(player.cx - this.cx) < 78 && Math.abs(player.bottom - this.bottom) < 40) {
            this.hitThisMove = true;
            player.hurt(2, sign(player.cx - this.cx) || 1, world);
          }
          this.state = 'recover';
          this.timer = 1.3;
        } else if (this.timer <= 0) {
          // Belt and braces: a move can never be a place to get stuck.
          this.state = 'recover';
          this.timer = 0.9;
        }
        break;
    }

    this.vy += 1400 * dt;
    this.moveAndCollide(world.level, dt);

    // The lunge is the only move that hurts on contact for more than a brush.
    if (this.state === 'lunge' && !this.hitThisMove && !player.dead && !player.isInvulnerable && this.overlaps(player.rect)) {
      this.hitThisMove = true;
      player.hurt(2, sign(player.cx - this.cx) || 1, world);
    }

    if (this.touchesHazard(world)) this.hurt(3, 0, world);
  }

  /** Contact damage only outside the lunge, which does its own, heavier hit. */
  override touchPlayer(world: World): void {
    if (this.state === 'lunge') return;
    super.touchPlayer(world);
  }

  /** The diamond on its chest lights the rift round it, and burns before every move. */
  override lights(): GlowLight[] {
    if (this.dead || !this.engaged) return [];
    return [{ x: this.cx, y: this.bottom - 40, radius: 60 + this.core * 60, rgb: '226,196,255', strength: 0.3 + this.core * 0.45, tint: 0.3 }];
  }

  /*
   * Drawn for the grid (warden-art.ts): one sprite per lean, flare and heat -
   * rearing back for the lunge, driving into it; the shoulder shards turned
   * out and the diamond and the visor burning while it winds up, which is the
   * tell; a stride while it walks. A struck warden is white for two frames.
   */
  override draw(ctx: CanvasRenderingContext2D): void {
    shadow(ctx, this.cx, this.bottom, this.w * 0.6);
    const lean: -1 | 0 | 1 = this.state === 'lungeWind' ? -1 : this.state === 'lunge' ? 1 : 0;
    const heat: 0 | 1 | 2 = this.core > 0.7 ? 2 : this.core > 0.3 ? 1 : 0;
    const walking = this.state === 'stalk' && this.onGround && Math.abs(this.vx) > 12;
    const step = walking ? ([1, 0, 2, 0] as const)[Math.floor(Math.abs(this.x) / 12) % 4] : 0;
    withHitFlash(
      ctx,
      solidFlash(this.flash),
      (c) => blit(c, wardenPart({ lean, flare: this.core > 0.5, heat, step }), this.cx, this.bottom, this.facing < 0),
      { x: this.cx - 60, y: this.bottom - 120, w: 120, h: 126 },
    );
  }
}

/* ----------------------------------------------------------------- gallert */

/**
 * Damage he shrugs off mid-move. Fourteen, and measured rather than picked: at
 * eight, a player who simply held the attack key threw him out of every move he
 * began and took not a single scratch in the whole fight. He is the first boss
 * in the game, not a sandbag.
 */
const GALLERT_POISE = 14;

/**
 * Gallert, der Aufgequollene - what the bog at the end of the forest made out
 * of every slime that ever died in it. The first boss of the game, and
 * therefore its teacher: each of his three moves is the plain form of something
 * a later fight does harder, and none of them can kill a careful player.
 *
 *   Klatschsprung  - flattens, leaps, lands with a ring. Get out from under it.
 *                    (The warden's slam, slower and with a longer warning.)
 *   Spucke         - three blobs on a short arc, and a blob is the first thing
 *                    in the game that a swing of the blade bats out of the air.
 *                    (Which is exactly what Thalassa's flood wave later
 *                    refuses to be, and that only reads as a rule if the player
 *                    has learned the rule first.)
 *   Teilung        - he pinches two small slimes off himself, at most twice.
 *                    Clear the adds, then get back to him.
 *
 * He is worth a heart: the Herzkern he leaves behind takes the hero from six to
 * seven, for the whole rest of the run.
 */
export class Gallert extends Enemy {
  private state:
    | 'wait'
    | 'stalk'
    | 'hopWind'
    | 'hop'
    | 'spitWind'
    | 'splitWind'
    | 'recover' = 'wait';
  private timer = 0;
  /** The tell: his core lights before every move. */
  private core = 0;
  /** -1 flattened, +1 stretched. Drives the squash of the leap. */
  private squash = 0;
  private poise = GALLERT_POISE;
  private poiseMax = GALLERT_POISE;
  private lastMove = '';
  private hitThisMove = false;
  /** How many small slimes he has pinched off himself. */
  private spawned = 0;
  /** Last floor he stood on, so his shadow stays down there when he leaps. */
  private groundY = 0;
  /** How far the bog is heaped up round him, 0..1 - drawing only: it sinks while he is in the air. */
  private mire = 1;

  constructor(x: number, y: number) {
    super('gallert', x, y);
    this.w = 74;
    this.h = 52;
    /*
     * Thirty-four. He comes before everyone else, against a hero with nothing
     * but a sword, so he is the short fight that teaches the vocabulary - but
     * at twenty-two he was too short to teach it: measured with a hero who
     * reads him 0.3 s late, eight seconds, in which he showed his leap and his
     * spit once each and never split at all.
     */
    this.hp = this.maxHp = 34;
    this.scoreValue = 700;
    this.aggroRange = 300;
    this.contactDamage = 1;
  }

  get phase(): 1 | 2 {
    return this.hp <= this.maxHp / 2 ? 2 : 1;
  }

  protected override deathColor(): string {
    return '#8fd45c';
  }

  override hurt(amount: number, fromDir: number, world: World): void {
    if (this.dead) return;
    this.hp -= amount;
    this.flash = 1;
    this.poise -= amount;
    this.squash = Math.min(1, this.squash + 0.35);
    if (this.hp <= 0) {
      this.die(world);
      return;
    }
    audio.play('bossHit');
    if (this.poise <= 0 && this.poiseLock <= 0) this.wobble(world, fromDir, 2.0);
  }

  /** A parry always shakes him loose, whatever he has absorbed. */
  override onParried(world: World): void {
    if (this.dead || this.stun > 0) return;
    this.wobble(world, -this.facing, 1.1);
  }

  private wobble(world: World, fromDir: number, lock: number): void {
    this.poise = this.poiseMax;
    this.poiseLock = lock;
    this.stun = 0.5;
    this.squash = 1;
    this.vx = fromDir * 90;
    world.particles.burst(this.cx, this.cy, 18, '#b6f08a', { speed: 190, gravity: 260 });
  }

  protected override die(world: World): void {
    super.die(world);
    // The core he was holding together goes to whoever took him apart.
    world.onMireBossDefeated();
  }

  override update(dt: number, world: World): void {
    this.updateCommon(dt);
    const player = world.player;
    const dx = player.cx - this.cx;
    const dist = Math.abs(dx);
    this.core = Math.max(0, this.core - dt * 2);
    this.squash = approach(this.squash, 0, dt * 2.4);
    if (this.onGround) this.groundY = this.bottom;
    this.mire = approach(this.mire, this.onGround ? 1 : 0, dt * (this.onGround ? 2.5 : 5));

    if (!this.engaged) {
      if (dist < this.aggroRange && !player.dead) {
        this.engaged = true;
        this.poise = this.poiseMax = this.sizeUpFor(world, GALLERT_POISE);
        this.state = 'recover';
        this.timer = 1.2;
        this.squash = 1;
        world.camera.addShake(5);
      }
      this.vy += 1400 * dt;
      this.moveAndCollide(world.level, dt);
      return;
    }

    if (this.stun > 0) {
      if (this.state !== 'recover') {
        this.state = 'recover';
        this.timer = 0.8;
        this.core = 0;
      }
      this.vx = approach(this.vx, 0, 500 * dt);
      this.vy += 1400 * dt;
      this.moveAndCollide(world.level, dt);
      return;
    }

    if (this.state !== 'hop') this.facing = dx > 0 ? 1 : -1;
    this.timer -= dt;
    const quick = this.phase === 2 ? 0.85 : 1;

    switch (this.state) {
      case 'wait':
      case 'recover':
        this.vx = approach(this.vx, 0, 600 * dt);
        if (this.timer <= 0) {
          this.state = 'stalk';
          this.timer = rand(0.5, 0.85) * quick;
        }
        break;

      case 'stalk': {
        // A waddle, not a charge: he has to be readable at a walk.
        const want = dist > 120 ? sign(dx) * 52 : 0;
        this.vx = approach(this.vx, want, 380 * dt);
        this.holdBackAtEdges(world);
        if (this.timer <= 0) {
          const options = dist < 150 ? ['hopWind', 'spitWind'] : ['spitWind', 'hopWind'];
          if (this.phase === 2 && this.spawned < 2) options.push('splitWind');
          const pick = options.filter((o) => o !== this.lastMove);
          const move = pick[Math.floor(Math.random() * pick.length)] ?? options[0];
          this.lastMove = move;
          this.state = move as typeof this.state;
          // The longest warnings in the game, because he is the first thing in
          // it that announces anything at all: seven tenths of a second before
          // the leap, six before the spit.
          this.timer = move === 'hopWind' ? 0.7 : 0.6;
          this.core = 1;
          this.hitThisMove = false;
          audio.play(move === 'hopWind' ? 'tellSlam' : move === 'spitWind' ? 'tellVolley' : 'tellBeam', 0.6);
        }
        break;
      }

      case 'hopWind':
        // Flattens against the floor. Everything about the shape says up.
        this.vx = approach(this.vx, 0, 700 * dt);
        this.core = 1;
        this.squash = -1;
        if (this.timer <= 0) {
          this.state = 'hop';
          this.timer = 1.4;
          this.vy = -560;
          this.vx = clamp(dx / 0.6, -300, 300);
          this.squash = 1;
          audio.play('jump', 0.7);
        }
        break;

      case 'hop':
        // In the air he keeps his heading; landing is the dangerous part. On
        // the ground and no longer rising is the landing - asking for a
        // downward speed as well never fires, because the collision that puts
        // his feet down zeroes it in the same frame.
        if (this.onGround && this.vy >= 0) {
          this.squash = -1;
          audio.play('impactMire');
          world.camera.addShake(6);
          world.particles.burst(this.cx, this.bottom, 24, '#8fd45c', { speed: 250, gravity: 520 });
          if (
            !this.hitThisMove &&
            !player.dead &&
            Math.abs(player.cx - this.cx) < 74 &&
            Math.abs(player.bottom - this.bottom) < 44
          ) {
            this.hitThisMove = true;
            player.hurt(2, sign(player.cx - this.cx) || 1, world);
          }
          // A long breath afterwards: this is the first boss in the game and
          // the window to answer him has to be unmissable.
          this.state = 'recover';
          this.timer = 1.4 * quick;
        } else if (this.timer <= 0) {
          this.state = 'recover';
          this.timer = 0.9;
        }
        break;

      case 'spitWind':
        this.vx = approach(this.vx, 0, 700 * dt);
        this.core = 1;
        if (this.timer <= 0) {
          // Three blobs on arcs that land around the hero rather than on him:
          // the middle one is aimed, the outer two straddle it.
          const flight = 0.75;
          const originY = this.cy - 14;
          for (const spread of [-64, 0, 64]) {
            const vx = (dx + spread) / flight;
            const vy = (player.cy - originY) / flight - 0.5 * 1150 * flight;
            world.spawnProjectile(new Projectile('blob', this.cx - 8, originY, vx, vy));
          }
          this.squash = 0.6;
          audio.play('splash', 1.5);
          this.state = 'recover';
          this.timer = 1.25 * quick;
        }
        break;

      case 'splitWind':
        this.vx = approach(this.vx, 0, 700 * dt);
        this.core = 1;
        if (this.timer <= 0) {
          // Two of him, pinched off and dropped either side. They are ordinary
          // slimes: the point is that they are in the way, not that they are
          // dangerous.
          for (const side of [-1, 1]) {
            const spawn = new Slime(this.cx + side * 34, this.bottom - 26);
            spawn.y = this.bottom - spawn.h;
            spawn.active = true;
            world.spawnEnemy(spawn);
            world.particles.burst(spawn.cx, spawn.cy, 14, '#8fd45c', { speed: 200, gravity: 300 });
          }
          this.spawned += 2;
          this.squash = -0.6;
          audio.play('impactMire', 0.6);
          world.camera.addShake(4);
          this.state = 'recover';
          this.timer = 1.25 * quick;
        }
        break;
    }

    this.vy += 1400 * dt;
    this.moveAndCollide(world.level, dt);
    if (this.touchesHazard(world)) this.hurt(3, 0, world);
  }

  /** Contact hurts less than the landing, which does its own, heavier hit. */
  override touchPlayer(world: World): void {
    if (this.state === 'hop') return;
    super.touchPlayer(world);
  }

  /** His core lights the bog round him, and fills before every move. */
  override lights(): GlowLight[] {
    if (this.dead || !this.engaged) return [];
    return [{ x: this.cx, y: this.bottom - 30, radius: 70 + this.core * 50, rgb: '226,255,150', strength: 0.3 + this.core * 0.45, tint: 0.3 }];
  }

  /*
   * Drawn for the grid (gallert-art.ts): one of five drawn shapes for his
   * squash - flattened as he winds up the leap, stretched in the air - with a
   * four-frame jiggle at rest; his eyes screw shut before the leap and his
   * mouth gapes before the spit, and the core in him fills before every move.
   * He rises out of his bog: a heaving mire heap behind him and a lip of mire
   * round his foot, bones sticking out of it and bubbles coming up through
   * it, which sinks to a puddle while he is in the air and wells up again
   * where he lands. The shadow stays on the floor and shrinks while he is up
   * there, which is what says how high he is. A struck Gallert is white for
   * two frames.
   */
  override draw(ctx: CanvasRenderingContext2D): void {
    const rise = clamp((this.groundY - this.bottom) / 150, 0, 1);
    shadow(ctx, this.cx, this.groundY, this.w * 0.55 * (1 - rise * 0.45), 0.32 * (1 - rise * 0.5));
    const gy = this.groundY || this.bottom;
    const flip = this.facing < 0;
    const level = Math.round(this.mire * 4);
    const heave = Math.floor(this.anim * 4) & 3;
    blit(ctx, mirePart(level, heave), this.cx, gy, flip);
    if (level >= 2) {
      for (const [bx, phase] of [
        [-34, 0],
        [8, 3],
        [44, 5],
      ]) {
        const sp = bubbleSprite((Math.floor(this.anim * 6) + phase) % 7);
        if (!sp) continue;
        const x = this.cx + (flip ? -bx : bx);
        sp.draw(ctx, x - (sp.w * ART) / 2, gy - heapTop(bx, level, heave) - sp.h * ART + ART);
      }
    }
    const s = this.squash;
    const shape = s < -0.6 ? 0 : s < -0.2 ? 1 : s < 0.2 ? 2 : s < 0.6 ? 3 : 4;
    const jiggle = shape === 2 ? Math.floor(this.anim * 5) & 3 : 0;
    const mouth = this.state === 'spitWind' ? 'open' : this.state === 'hopWind' ? 'squint' : 'grin';
    const heat: 0 | 1 | 2 = this.core > 0.7 ? 2 : this.core > 0.3 ? 1 : 0;
    withHitFlash(
      ctx,
      solidFlash(this.flash),
      (c) => blit(c, gallertPart(shape, jiggle, mouth, heat), this.cx, this.bottom, this.facing < 0),
      { x: this.cx - 70, y: this.bottom - 110, w: 140, h: 116 },
    );
    blit(ctx, lipPart(level, heave), this.cx, gy, flip);
  }
}

/* ---------------------------------------------------------------- thalassa */

/**
 * Damage she absorbs mid-move. Far above the warden's five, and measured
 * rather than picked: a player who simply holds the attack key deals about
 * 3.6 damage a second, so at six she was thrown out of nearly every move she
 * started and landed four in a whole fight. Thirteen means mashing buys an
 * interruption now and then instead of always. The answer that always works
 * is the parry - see onParried below.
 */
const THALASSA_POISE = 13;

/** How high a column of the spring tide stands, and how wide it is. */
const GEYSER_H = 118;
const GEYSER_W = 30;
/** How long a column stands once it has come up. */
const GEYSER_LIFE = 0.5;

/**
 * One column of the spring tide: a spot on the floor that bubbles for a moment
 * before the water comes up through it. It runs on its own clock, so knocking
 * her off balance does not call the water back.
 */
interface Geyser {
  x: number;
  /** Seconds of bubbling before the water arrives. */
  wind: number;
  /** Seconds since the mark appeared. */
  t: number;
  /** Each column takes its toll once. */
  hit: boolean;
}

/**
 * Thalassa, the Drowned Crown - what was left of whoever the flooded hall was
 * built for. The boss of the middle of the game: she comes after the caves and
 * before the castle, so she has to be a step up from the roaming skeletons and
 * a step below the knight.
 *
 * The same contract as the other two: every move is announced, a move once
 * begun is seen through, and the pause afterwards is long enough to answer.
 * What is hers alone is that her moves reach across the whole floor - standing
 * far away is not a way out of this fight - and that she goes through three
 * phases instead of two:
 *
 *   1. Her three opening moves, one at a time, the way they were - plus the
 *      spring tide the moment someone parks in her reach, which is the one
 *      thing she does that a blade cannot answer.
 *   2. The flood answers twice: the surge comes in two volleys, the anchor in
 *      a pair, the tide in two ripples, and the undertow keeps its grip in
 *      mid-air. From here the tide is also one of the moves she simply picks.
 *   3. The crown calls once - a ring of five columns and the hall answering -
 *      and after that she stops resting between moves and answers with two
 *      before she breathes.
 *
 * She used to be too easy, measured rather than guessed: a player who only
 * held the attack key killed her in eleven seconds and lost between nothing
 * and four hearts. Three reasons, in the order they mattered: every one of her
 * moves could be batted out of the air by a blind swing and sent back into her
 * for two; her poise was low enough that the same swinging threw her out of
 * nearly every move she began; and what was left of her idled in recovery for
 * more than half the fight.
 */
export class Thalassa extends Enemy {
  private state:
    | 'wait'
    | 'stalk'
    | 'surgeWind'
    | 'surge'
    | 'anchorWind'
    | 'undertowWind'
    | 'undertow'
    | 'tideWind'
    | 'tide'
    | 'crown'
    | 'recover' = 'wait';
  private timer = 0;
  private crown = 0;
  private poise = THALASSA_POISE;
  /** Her poise figure, once she has seen what she is up against. */
  private poiseMax = THALASSA_POISE;
  private lastMove = '';
  /** Which move the crown is filling for - the draw code reads this. */
  private tell: 'none' | 'surge' | 'anchor' | 'undertow' | 'tide' = 'none';
  /** Volleys left in the surge she is in the middle of. */
  private surgeLeft = 0;
  /** Ripples left in the tide she is in the middle of. */
  private tideLeft = 0;
  /** True while the second half of a third-phase pair is still to come. */
  private chained = false;
  /** Her last third opens with the crown's call, and only ever once. */
  private called = false;
  private geysers: Geyser[] = [];
  /** Top of the floor she is standing on: where the tide comes up from. */
  private floorY = 0;
  /** How long he has been standing inside her reach. */
  private crowded = 0;
  /**
   * Time until the floor can be opened again. Without it the crowding rule
   * eats the fight: the tide holds her still for nearly three seconds, which
   * is long enough for a melee player to have been standing there again by the
   * time it ends, so she cast nothing else - measured at twelve tides in one
   * fight, and thirty of its ninety-seven seconds spent in them.
   */
  private tideCool = 0;

  constructor(x: number, y: number) {
    super('thalassa', x, y);
    this.w = 50;
    this.h = 62;
    /*
     * Seventy-two, up from forty-two. A player who mashes deals about 3.6
     * damage a second, which used to end her in eleven seconds - before she
     * had shown three of her moves once each. At sixty, with the relics of the
     * road, a hero who read her had her down in under thirty seconds, and one
     * who only held the attack key saw five or six moves in all: not enough of
     * her rotation to be caught by the half of it he cannot swing through.
     */
    this.hp = this.maxHp = 72;
    this.scoreValue = 1200;
    this.aggroRange = 380;
    this.contactDamage = 1;
    this.floorY = y + this.h;
  }

  /**
   * Three shapes now instead of two, and cut where the health bar already
   * draws its notches - the same marks the knight's phases use.
   */
  get phase(): 1 | 2 | 3 {
    const left = this.hp / this.maxHp;
    return left > 0.62 ? 1 : left > 0.3 ? 2 : 3;
  }

  /** How much of her old, slow rhythm is left. */
  private get quick(): number {
    return this.phase === 3 ? 0.72 : this.phase === 2 ? 0.85 : 1;
  }

  protected override deathColor(): string {
    return '#4fb3a6';
  }

  override hurt(amount: number, fromDir: number, world: World): void {
    if (this.dead) return;
    this.hp -= amount;
    this.flash = 1;
    this.poise -= amount;
    if (this.hp <= 0) {
      this.die(world);
      return;
    }
    audio.play('bossHit');
    if (this.poise <= 0 && this.poiseLock <= 0) {
      this.stagger(world, fromDir, 2.4);
    }
  }

  /**
   * A parry always breaks her, whatever her poise. That is what the parry is
   * for: standing in her reach and answering the move itself, rather than
   * hoping enough blind swings add up to an interruption.
   */
  override onParried(world: World): void {
    // Someone already reeling cannot be thrown off balance again: otherwise
    // held-down parries would keep her there.
    if (this.dead || this.stun > 0) return;
    this.stagger(world, -this.facing, 1.2);
  }

  /** Thrown off balance: whatever she was doing is dropped. */
  private stagger(world: World, fromDir: number, lock: number): void {
    this.poise = this.poiseMax;
    this.poiseLock = lock;
    this.stun = 0.5;
    this.vx = fromDir * 130;
    world.particles.burst(this.cx, this.cy, 16, '#9fe4dc', { speed: 200, shape: 'spark' });
  }

  protected override die(world: World): void {
    this.geysers.length = 0;
    super.die(world);
    // What she held goes into the blade. The game says so, not she.
    world.onDrownedCrownDefeated();
  }

  /**
   * A move has ended. In her last third she answers a second time before she
   * rests, and pays for the pair with a longer breath afterwards.
   */
  private afterMove(base: number): void {
    this.tell = 'none';
    if (this.phase === 3 && !this.chained) {
      this.chained = true;
      this.state = 'stalk';
      this.timer = 0.26;
      return;
    }
    const paired = this.chained;
    this.chained = false;
    this.state = 'recover';
    this.timer = base * (paired ? 1.2 : this.quick);
  }

  override update(dt: number, world: World): void {
    this.updateCommon(dt);
    const player = world.player;
    const dx = player.cx - this.cx;
    const dist = Math.abs(dx);
    this.crown = Math.max(0, this.crown - dt * 2);
    if (this.onGround) this.floorY = this.bottom;
    this.crowded = dist < 118 && !player.dead ? this.crowded + dt : 0;
    this.tideCool = Math.max(0, this.tideCool - dt);

    if (!this.engaged) {
      if (dist < this.aggroRange && !player.dead) {
        this.engaged = true;
        this.poise = this.poiseMax = this.sizeUpFor(world, THALASSA_POISE);
        this.state = 'recover';
        this.timer = 1.1;
        world.camera.addShake(5);
      }
      this.vy += 1400 * dt;
      this.moveAndCollide(world.level, dt);
      return;
    }

    // The water she has already called up keeps coming, stagger or not.
    this.updateTide(dt, world);

    if (this.stun > 0) {
      if (this.state !== 'recover') {
        this.state = 'recover';
        this.timer = 0.75;
        this.tell = 'none';
        this.surgeLeft = 0;
        this.tideLeft = 0;
        this.chained = false;
      }
      this.vy += 1400 * dt;
      this.moveAndCollide(world.level, dt);
      return;
    }

    this.facing = dx > 0 ? 1 : -1;

    /*
     * The crown's call opens her last third: she drops whatever she was doing,
     * rises, and the whole floor answers at once. It happens exactly once, and
     * the ring of marks comes up with it rather than after it, so the warning
     * is the move.
     */
    if (this.phase === 3 && !this.called && this.state !== 'crown') {
      this.called = true;
      this.state = 'crown';
      this.timer = 1.2;
      this.tell = 'tide';
      this.crown = 1;
      this.surgeLeft = 0;
      this.chained = false;
      this.vx = 0;
      this.geysers = this.markTide([this.cx - 152, this.cx - 68, this.cx + 68, this.cx + 152, player.cx]);
      this.tideLeft = 1;
      this.crowded = 0;
      this.tideCool = 5;
      audio.play('phase', 0.9);
      world.camera.addShake(6);
      world.particles.burst(this.cx, this.cy, 26, '#a8efe6', { speed: 230, gravity: -80, shape: 'spark' });
    }

    this.timer -= dt;

    switch (this.state) {
      case 'wait':
      case 'recover':
        this.vx = approach(this.vx, 0, 700 * dt);
        if (this.timer <= 0) {
          this.state = 'stalk';
          this.timer = rand(0.4, 0.7) * this.quick;
        }
        break;

      case 'stalk': {
        const want = dist > 130 ? sign(dx) * 58 : dist < 70 ? -sign(dx) * 58 : 0;
        this.vx = approach(this.vx, want, 480 * dt);
        if (this.timer <= 0) {
          this.crown = 1;
          const options =
            dist < 120 ? ['surgeWind', 'undertowWind'] : ['anchorWind', 'undertowWind', 'surgeWind'];
          // The tide opens the floor itself, so it answers any range.
          if (this.phase >= 2 && this.tideCool <= 0) options.push('tideWind');
          const pick = options.filter((o) => o !== this.lastMove);
          /*
           * A guest who plants himself in her reach and swings gets the floor
           * opened under him, whatever else she might have picked. Her thrown
           * and cast moves can all be answered with the blade; the tide is the
           * one that cannot, so it is the one that answers standing still.
           */
          const move =
            this.crowded > (this.phase === 1 ? 2.4 : 1.9) && this.tideCool <= 0
              ? 'tideWind'
              : (pick[Math.floor(Math.random() * pick.length)] ?? options[0]);
          this.lastMove = move;
          this.state = move as typeof this.state;
          this.tell =
            move === 'surgeWind'
              ? 'surge'
              : move === 'anchorWind'
                ? 'anchor'
                : move === 'tideWind'
                  ? 'tide'
                  : 'undertow';
          // The warning itself never shortens - only the resting does.
          this.timer = 0.55;
          audio.play(this.tell === 'surge' ? 'tellLunge' : this.tell === 'anchor' ? 'tellSlam' : 'tellBeam', 0.9);
        }
        break;
      }

      case 'surgeWind':
        // The tide surge: a wave along the floor in both directions, so the
        // answer is height, not distance.
        this.vx = approach(this.vx, 0, 900 * dt);
        this.crown = 1;
        if (this.timer <= 0) {
          this.surgeLeft = this.phase >= 2 ? 2 : 1;
          this.state = 'surge';
          this.timer = 0;
        }
        break;

      case 'surge':
        this.vx = approach(this.vx, 0, 900 * dt);
        this.crown = Math.max(this.crown, 0.75);
        if (this.timer <= 0) {
          for (const dir of [-1, 1]) {
            const wave = new Projectile('shockwave', this.cx + dir * 22, this.bottom - 30, dir * 250, 0);
            // Not something a blind swing bats away: this one is jumped, or
            // turned aside with a parry. And it comes up the hall as water,
            // not as the knight's fire.
            wave.deflectable = false;
            wave.water = true;
            world.spawnProjectile(wave);
          }
          audio.play('impactTide', 0.8);
          world.camera.addShake(this.surgeLeft > 1 ? 7 : 5);
          world.particles.burst(this.cx, this.bottom, 22, '#7fd6cc', { speed: 240, gravity: 500 });
          this.surgeLeft--;
          // A second volley far enough behind the first that one jump cannot
          // clear both: he has to land and go again.
          if (this.surgeLeft > 0) this.timer = 0.72;
          else this.afterMove(0.95);
        }
        break;

      case 'anchorWind':
        this.vx = approach(this.vx, 0, 900 * dt);
        this.crown = 1;
        if (this.timer <= 0) {
          // Thrown on an arc that lands where the hero is heading.
          // The arc is solved from the point it is actually thrown from. It
          // used to be solved from her centre and thrown from 26 px above it,
          // which put every anchor down two feet over the hero's head.
          const flight = 0.9;
          const originY = this.cy - 26;
          // From her second phase on she throws a pair: one where he stands,
          // one where he is going. Standing still stops being an answer.
          const leads = this.phase >= 2 ? [0, 0.6] : [0.25];
          for (const lead of leads) {
            const vx = (dx + player.vx * lead) / flight;
            const vy = (player.cy - originY) / flight - 0.5 * 900 * flight;
            const anchor = new Projectile('rock', this.cx - 10, originY, vx, vy);
            world.spawnProjectile(anchor);
          }
          audio.play('fireball', 0.6);
          this.afterMove(1.0);
        }
        break;

      case 'undertowWind':
        this.vx = approach(this.vx, 0, 900 * dt);
        this.crown = 1;
        if (this.timer <= 0) {
          this.state = 'undertow';
          this.timer = 1.1;
          audio.play('impactTide', 0.6);
        }
        break;

      case 'undertow': {
        // Pulls him in while orbs drift out. Running away costs ground, so the
        // fight is decided in her reach whether he likes it or not.
        this.vx = approach(this.vx, 0, 900 * dt);
        // A current he stands in, not a shove: carried along, whatever his own
        // feet are doing. It used to be added to his speed, where the floor's
        // friction took it back the very next frame - measured, a hero who
        // stood still through a whole undertow moved by nothing at all.
        const pull = this.phase === 3 ? 110 : this.phase === 2 ? 95 : 80;
        if (!player.dead && dist > 40) {
          // From her second phase the water has hold of him in the air as
          // well: jumping shortens the drag, it no longer cancels it.
          const grip = player.onGround ? 1 : this.phase >= 2 ? 0.45 : 0;
          if (grip > 0) player.carryX += -sign(dx) * pull * grip * dt;
        }
        world.particles.spawn({
          x: player.cx + rand(-20, 20),
          y: player.cy + rand(-18, 18),
          vx: -sign(dx) * rand(60, 160),
          vy: rand(-30, 30),
          color: 'rgba(140,220,215,0.6)',
          size: 2.5,
          life: 0.35,
          shape: 'spark',
        });
        if (this.timer <= 0) {
          // Aimed from the hem, not from her shoulders: one orb low along the
          // floor and one just above it, both at the hero rather than over him.
          // Later a third goes straight down the middle.
          const fan = this.phase >= 2 ? [-0.2, 0, 0.2] : [-0.12, 0.12];
          for (const up of fan) {
            const originY = this.cy + 6;
            const ady = player.cy - originY;
            const len = Math.hypot(dx, ady) || 1;
            const orb = new Projectile(
              'orb',
              this.cx - 7,
              originY,
              (dx / len) * 190,
              (ady / len) * 190 + up * 110,
            );
            // Her water again, and the same rule as the surge: jumped, or
            // turned with the guard. A blind swing used to send every one of
            // them home - they come out inside the reach of a blade held at
            // her hem, and a hero who only held the attack key was touched by
            // none of fifteen.
            orb.deflectable = false;
            world.spawnProjectile(orb);
          }
          audio.play('magic', 0.9);
          this.afterMove(1.05);
        }
        break;
      }

      case 'tideWind':
        this.vx = approach(this.vx, 0, 900 * dt);
        this.crown = 1;
        if (this.timer <= 0) {
          /*
           * Spring tide: marks on the floor, one under his feet and the rest
           * spread across the room, that bubble before the water comes up
           * through them. This is the answer to a player who parks in her
           * face and mashes - it is a move you walk out of rather than one you
           * have to guess, and it does not care where in the hall he stands.
           */
          const spots = [player.cx, this.cx - 128, this.cx + 128];
          if (this.phase === 3) {
            spots.push(player.cx + (sign(dx) || 1) * 78, this.cx);
          }
          this.geysers = this.markTide(spots);
          this.crowded = 0;
          this.tideCool = 5;
          // A second ripple later, from her second phase on. One column takes
          // a single heart however many come up at once - the hero is
          // untouchable for a moment after a hit - so a tide that punishes
          // standing still has to ask the question twice.
          this.tideLeft = this.phase >= 2 ? 2 : 1;
          audio.play('rumble', 1.4);
          this.state = 'tide';
          this.timer = 1.35;
        }
        break;

      case 'tide':
        // She holds the water up; the columns keep their own time.
        this.vx = approach(this.vx, 0, 700 * dt);
        if (this.timer <= 0) {
          this.tideLeft--;
          if (this.tideLeft > 0) {
            // The second ripple asks where he is now, not where he was.
            this.geysers.push(...this.markTide([player.cx, this.cx - 92, this.cx + 92]));
            audio.play('rumble', 1.5);
            this.timer = 1.35;
          } else {
            this.afterMove(1.0);
          }
        }
        break;

      case 'crown':
        this.vx = approach(this.vx, 0, 700 * dt);
        this.crown = 1;
        if (this.timer <= 0) this.afterMove(0.9);
        break;
    }

    this.vy += 1400 * dt;
    this.moveAndCollide(world.level, dt);
  }

  /**
   * Marks on the floor for one ripple of the tide. Two columns in the same
   * place is one wasted column, so whichever stands where an earlier one
   * already does gets pushed out of the way.
   */
  private markTide(spots: number[]): Geyser[] {
    const taken = this.geysers.filter((g) => g.t < g.wind).map((g) => g.x);
    const out: Geyser[] = [];
    for (const spot of spots) {
      let x = spot;
      for (const other of [...taken, ...out.map((g) => g.x)]) {
        const gap = x - other;
        if (Math.abs(gap) < 52) x = other + (sign(gap) || 1) * 52;
      }
      out.push({ x, wind: 0.68 + out.length * 0.09, t: 0, hit: false });
    }
    return out;
  }

  /** The columns of the spring tide, from bubble to burst. */
  private updateTide(dt: number, world: World): void {
    if (this.geysers.length === 0) return;
    const player = world.player;
    for (const g of this.geysers) {
      const before = g.t;
      g.t += dt;
      if (g.t < g.wind) {
        // Bubbles boiling up out of the floor: the warning.
        if (world.time % 0.05 < dt) {
          world.particles.spawn({
            x: g.x + rand(-GEYSER_W / 2, GEYSER_W / 2),
            y: this.floorY - 3,
            vx: rand(-16, 16),
            vy: rand(-90, -40),
            color: 'rgba(150,235,225,0.7)',
            size: 2.5,
            life: 0.42,
            shape: 'spark',
          });
        }
        continue;
      }
      if (before < g.wind) {
        audio.play('impactTide', 0.9);
        world.camera.addShake(3);
        world.particles.burst(g.x, this.floorY - 6, 14, '#a8efe6', {
          speed: 220,
          gravity: -60,
          shape: 'spark',
        });
      }
      const power = this.geyserPower(g);
      if (!g.hit && power > 0.35 && !player.dead) {
        const top = this.floorY - GEYSER_H * power;
        if (
          rectsOverlap(
            { x: g.x - GEYSER_W / 2, y: top, w: GEYSER_W, h: this.floorY - top },
            player.rect,
          )
        ) {
          g.hit = true;
          player.hurt(1, sign(player.cx - g.x) || 1, world);
        }
      }
    }
    this.geysers = this.geysers.filter((g) => g.t < g.wind + GEYSER_LIFE);
  }

  /** How much of a column stands right now: up fast, down soft. */
  private geyserPower(g: Geyser): number {
    if (g.t < g.wind) return 0;
    const rise = clamp((g.t - g.wind) / 0.12, 0, 1);
    const fall = clamp((g.wind + GEYSER_LIFE - g.t) / 0.16, 0, 1);
    return Math.min(rise, fall);
  }

  /**
   * Her light: the crown burning before every move, and each column of the
   * tide as it stands. They light the hall's floor and walls round her; she
   * is drawn as she is.
   */
  override lights(): GlowLight[] {
    const out: GlowLight[] = [];
    if (this.dead || !this.engaged) return out;
    out.push({ x: this.cx, y: this.bottom - 80, radius: 70 + this.crown * 60, rgb: '150,240,225', strength: 0.3 + this.crown * 0.45, tint: 0.3 });
    for (const g of this.geysers) {
      const power = this.geyserPower(g);
      if (power > 0.1) out.push({ x: g.x, y: this.floorY - GEYSER_H * power * 0.5, radius: 80, rgb: '150,235,225', strength: 0.5 * power, tint: 0.3 });
    }
    return out;
  }

  /*
   * Drawn for the grid (thalassa-art.ts): the water standing up behind her as
   * a mantle, then the queen herself in the pose of what she is about to do,
   * her crown at the heat of the tell - each a sprite made once per pose and
   * frame, mirrored to face the hero. A struck queen is white for two frames.
   */
  override draw(ctx: CanvasRenderingContext2D): void {
    this.drawTide(ctx);
    shadow(ctx, this.cx, this.bottom, this.w * 0.6);
    const frame = Math.floor(this.anim * 6) & 3;
    const telling = this.tell !== 'none' && this.crown > 0.05;
    const pose: QueenPose = !telling
      ? 'still'
      : this.tell === 'surge'
        ? 'surge'
        : this.tell === 'anchor'
          ? 'anchor'
          : this.tell === 'undertow'
            ? 'undertow'
            : 'raise';
    const heat = this.crown > 0.7 ? 2 : this.crown > 0.3 ? 1 : 0;
    const mirrored = this.facing < 0;
    withHitFlash(
      ctx,
      solidFlash(this.flash),
      (c) => {
        blit(c, mantlePart(frame, telling && this.tell === 'tide'), this.cx, this.bottom, mirrored);
        blit(c, queenPart(pose, frame, heat), this.cx, this.bottom, mirrored);
        this.drawTell(c);
      },
      { x: this.cx - 70, y: this.bottom - 150, w: 140, h: 160 },
    );
  }

  /**
   * What she is about to do, drawn round her as well as in her pose, so the
   * four moves can be told apart at a glance: the surge as two arcs of foam
   * running out along the floor, the undertow as water winding in at her
   * feet, the tide as water already climbing out of her raised hands.
   */
  private drawTell(ctx: CanvasRenderingContext2D): void {
    if (this.tell === 'none' || this.crown < 0.05) return;
    const x = snap(this.cx);
    const y = snap(this.bottom);
    const near = this.crown > 0.6;
    switch (this.tell) {
      case 'surge':
        for (const r of near ? [20, 32] : [20]) ovalRing(ctx, x, y - 3, r, r * 0.32, 1, RAMP.blue[6], true);
        break;
      case 'undertow':
        for (let i = 0; i < 3; i++) {
          const r = 34 - i * 9;
          dashedOval(ctx, x, y - 5, r, r * 0.3, 5, 3, i === 1 ? RAMP.blue[4] : RAMP.blue[6], this.anim * (2 + i));
        }
        break;
      case 'tide':
        // Water climbing out of her raised hands, a drop at a time.
        for (const side of [-1, 1]) {
          const hx = x + side * 12;
          const climb = Math.floor(this.anim * 14) % 3;
          for (let k = 0; k < 3; k++) rect(ctx, hx - 2, y - 92 - k * 8 - climb * 2, 4, 4, k === 2 ? RAMP.blue[6] : RAMP.blue[4]);
        }
        break;
      default:
        break;
    }
  }

  /**
   * The spring tide: marks on the floor first - a ring of foam closing in on
   * the spot over a pool of dark water - then the columns, banded water with
   * foam on their heads, standing as tall as their power says.
   */
  private drawTide(ctx: CanvasRenderingContext2D): void {
    if (this.geysers.length === 0) return;
    const F = snap(this.floorY);
    for (const g of this.geysers) {
      const x = snap(g.x);
      if (g.t < g.wind) {
        const p = clamp(g.t / g.wind, 0, 1);
        rect(ctx, x - GEYSER_W * 0.5, F - 4, GEYSER_W, 2, RAMP.blue[1]);
        ovalRing(ctx, x, F - 2, GEYSER_W * (0.9 - p * 0.3), 6 - p * 2, 1, p > 0.55 ? RAMP.blue[6] : RAMP.blue[4]);
        continue;
      }
      const power = this.geyserPower(g);
      if (power <= 0) continue;
      const h = Math.max(8, Math.round((GEYSER_H * power) / 4) * 4);
      blit(ctx, columnPart(h, (Math.floor(this.anim * 10) & 1) as 0 | 1), x, F);
    }
  }
}

/* --------------------------------------------------------------- prismarch */

/** Damage it shrugs off mid-move. Higher than the warden's: it is the last word. */
const PRISM_POISE = 7;
/**
 * How long a stagger keeps it from being staggered again, poise not draining
 * meanwhile - longer than one of its turns. With 2 s and a poise that went on
 * draining, the hero's late-road blade broke it again the moment the lock ran
 * out, every time in the middle of the next wind-up: a hero who only held the
 * attack key took its 130 health in twenty seconds and was never touched.
 */
const PRISM_STAGGER_REST = 3.2;

/**
 * Prismarch, the heart of the crystal - the bonus boss behind the world, and
 * the only thing in the game the player has to earn a fight with.
 *
 * Built on the warden's lesson rather than the knight's code: a move once begun
 * is seen through, and every one of them is announced before it lands. What
 * makes this one the harder fight is not shorter warnings but more of them at
 * once - in its second half it answers with two things instead of one.
 */
export class Prismarch extends Enemy {
  private state:
    | 'wait'
    | 'stalk'
    | 'fanWind'
    | 'rainWind'
    | 'rain'
    | 'chargeWind'
    | 'charge'
    | 'recover' = 'wait';
  private timer = 0;
  private core = 0;
  private poise = PRISM_POISE;
  /** That figure, once it has seen the blade coming. */
  private poiseMax = PRISM_POISE;
  private rainLeft = 0;
  private rainTimer = 0;
  private hitThisMove = false;
  private lastMove = '';

  constructor(x: number, y: number) {
    super('prismarch', x, y);
    this.w = 58;
    this.h = 74;
    this.hp = this.maxHp = 70;
    this.scoreValue = 3000;
    this.aggroRange = 460;
    this.contactDamage = 1;
  }

  /** Second half of the fight: shorter pauses, and the rain comes in twos. */
  get phase(): 1 | 2 {
    return this.hp <= this.maxHp / 2 ? 2 : 1;
  }

  protected override deathColor(): string {
    return '#8fe8ff';
  }

  override hurt(amount: number, fromDir: number, world: World): void {
    if (this.dead) return;
    this.hp -= amount;
    this.flash = 1;
    if (this.poiseLock <= 0) this.poise -= amount;
    if (this.hp <= 0) {
      this.die(world);
      return;
    }
    audio.play('bossHit');
    if (this.poise <= 0 && this.poiseLock <= 0) {
      this.poise = this.poiseMax;
      this.poiseLock = PRISM_STAGGER_REST;
      this.stun = 0.55;
      this.vx = fromDir * 120;
      world.particles.burst(this.cx, this.cy, 20, '#bff2ff', { speed: 220, shape: 'spark' });
    }
  }

  protected override die(world: World): void {
    super.die(world);
    world.particles.burst(this.cx, this.cy, 70, '#8fe8ff', { speed: 320, gravity: 200, size: 5 });
    world.onCrystalBossDefeated();
  }

  override update(dt: number, world: World): void {
    this.updateCommon(dt);
    const player = world.player;
    const dx = player.cx - this.cx;
    const dist = Math.abs(dx);
    this.core = Math.max(0, this.core - dt * 2);

    if (!this.engaged) {
      if (dist < this.aggroRange && !player.dead) {
        this.engaged = true;
        this.poise = this.poiseMax = this.sizeUpFor(world, PRISM_POISE);
        this.state = 'recover';
        this.timer = 1.2;
        world.camera.addShake(6);
      }
      this.moveAndCollide(world.level, dt);
      return;
    }

    if (this.stun > 0) {
      if (this.state !== 'recover') {
        this.state = 'recover';
        this.timer = 0.8;
      }
      this.vy += 1400 * dt;
      this.moveAndCollide(world.level, dt);
      return;
    }

    if (this.state !== 'charge') this.facing = dx > 0 ? 1 : -1;
    this.timer -= dt;
    const quick = this.phase === 2 ? 0.78 : 1;

    switch (this.state) {
      case 'wait':
      case 'recover':
        this.vx = approach(this.vx, 0, 800 * dt);
        if (this.timer <= 0) {
          this.state = 'stalk';
          this.timer = rand(0.45, 0.8) * quick;
        }
        break;

      case 'stalk': {
        const want = dist > 150 ? sign(dx) * 62 : dist < 80 ? -sign(dx) * 62 : 0;
        this.vx = approach(this.vx, want, 520 * dt);
        if (this.timer <= 0) {
          this.hitThisMove = false;
          this.core = 1;
          // Never the same move twice running: the fight has to keep asking a
          // different question, or it is one pattern learnt and then repeated.
          const options = dist < 150 ? ['chargeWind', 'rainWind'] : ['fanWind', 'rainWind', 'chargeWind'];
          const pick = options.filter((o) => o !== this.lastMove);
          const move = pick[Math.floor(Math.random() * pick.length)] ?? options[0];
          this.lastMove = move;
          this.state = move as typeof this.state;
          this.timer = move === 'rainWind' ? 0.6 * quick : 0.55 * quick;
          audio.play(move === 'chargeWind' ? 'tellLunge' : 'tellVolley', 1.3);
        }
        break;
      }

      case 'fanWind':
        this.vx = approach(this.vx, 0, 900 * dt);
        this.core = 1;
        if (this.timer <= 0) {
          const spread = this.phase === 2 ? 5 : 3;
          for (let i = 0; i < spread; i++) {
            const a = ((i - (spread - 1) / 2) / spread) * 1.5;
            const dy = player.cy - this.cy;
            const len = Math.hypot(dx, dy) || 1;
            const vx = ((dx / len) * Math.cos(a) - (dy / len) * Math.sin(a)) * 215;
            const vy = ((dx / len) * Math.sin(a) + (dy / len) * Math.cos(a)) * 215;
            world.spawnProjectile(new Projectile('orb', this.cx - 7, this.cy - 16, vx, vy));
          }
          audio.play('impactCrystal', 1.3);
          this.state = 'recover';
          this.timer = 1.25 * quick;
        }
        break;

      case 'rainWind':
        this.vx = approach(this.vx, 0, 900 * dt);
        this.core = 1;
        if (this.timer <= 0) {
          this.state = 'rain';
          this.rainLeft = this.phase === 2 ? 8 : 5;
          this.rainTimer = 0;
          this.timer = 3;
        }
        break;

      case 'rain':
        // Shards dropped from the ceiling, one every fifth of a second, each
        // aimed a little ahead of where the hero is standing. Running works;
        // standing still does not.
        this.vx = approach(this.vx, 0, 700 * dt);
        this.rainTimer -= dt;
        if (this.rainTimer <= 0 && this.rainLeft > 0) {
          this.rainTimer = 0.22;
          this.rainLeft--;
          const at = player.cx + player.vx * 0.28 + rand(-40, 40);
          const shard = new Projectile('rock', at - 10, world.camera.renderY - 30, 0, 190);
          world.spawnProjectile(shard);
        }
        if (this.rainLeft <= 0 && this.timer <= 2.2) {
          this.state = 'recover';
          this.timer = 1.15 * quick;
        }
        break;

      case 'chargeWind':
        this.vx = approach(this.vx, -this.facing * 50, 800 * dt);
        this.core = 1;
        if (this.timer <= 0) {
          this.state = 'charge';
          this.timer = 0.5;
          this.vx = this.facing * 390;
          world.camera.addShake(4);
        }
        break;

      case 'charge':
        if (this.timer <= 0 || this.touching.left || this.touching.right) {
          this.state = 'recover';
          this.timer = 1.3 * quick;
        }
        break;
    }

    this.vy += 1400 * dt;
    this.moveAndCollide(world.level, dt);

    if (this.state === 'charge' && !this.hitThisMove && !player.dead && !player.isInvulnerable && this.overlaps(player.rect)) {
      this.hitThisMove = true;
      player.hurt(2, sign(player.cx - this.cx) || 1, world);
    }
  }

  override touchPlayer(world: World): void {
    if (this.state === 'charge') return;
    super.touchPlayer(world);
  }

  /** Its heart lights the crystal round it, and blazes before every move. */
  override lights(): GlowLight[] {
    if (this.dead || !this.engaged) return [];
    return [{ x: this.cx, y: this.bottom - 56, radius: 80 + this.core * 70, rgb: '246,150,210', strength: 0.35 + this.core * 0.45, tint: 0.3 }];
  }

  /*
   * Drawn for the grid (prism-art.ts): the cluster at one of three drawn
   * leans, its heart over it in the beat it is at - or blazing, which is the
   * tell - and the ring of shards turning round both, the half of it behind
   * the cluster drawn first. A struck Prismarch is white for two frames.
   */
  override draw(ctx: CanvasRenderingContext2D): void {
    shadow(ctx, this.cx, this.bottom, this.w * 0.6);
    const lean: -1 | 0 | 1 = this.state === 'chargeWind' ? -1 : this.state === 'charge' ? 1 : 0;
    const blaze = this.core > 0.6;
    withHitFlash(
      ctx,
      solidFlash(this.flash),
      (c) => {
        this.drawShards(c, false);
        blit(c, clusterPart(lean), this.cx, this.bottom, this.facing < 0);
        const h = heartAt(lean);
        const beat = blaze ? 2 : ([0, 1, 2, 1] as const)[Math.floor(this.anim * 5) % 4];
        blit(c, heartPart(beat, blaze), this.cx + this.facing * h.x, this.bottom + h.y);
        this.drawShards(c, true);
      },
      { x: this.cx - 110, y: this.bottom - 150, w: 220, h: 160 },
    );
  }

  /**
   * The ring of shards turning slowly round it, each tumbling as it goes;
   * wider, and a step brighter, while the heart blazes. `front`: the half of
   * the ring that passes in front of the cluster, or the half behind.
   */
  private drawShards(ctx: CanvasRenderingContext2D, front: boolean): void {
    const rx = 62 + this.core * 16;
    for (let i = 0; i < 6; i++) {
      const a = this.anim * 0.5 + (i / 6) * Math.PI * 2;
      if (Math.sin(a) > 0 !== front) continue;
      const step = (((Math.floor(this.anim * 3 + i * 1.7)) % 8) + 8) % 8;
      blit(ctx, shardPart(step, this.core > 0.5), this.cx + Math.cos(a) * rx, this.bottom - 58 + Math.sin(a) * 18);
    }
  }
}

/* ------------------------------------------------------------------- hydra */

/** What one neck carries before the blade gets to it. */
const NECK_HP = 10;
/** Damage she shrugs off mid-move. */
const HYDRA_POISE = 8;
/** Seconds an open stump has before the head is back. */
const REGROW = 9.5;
/** How long a pool of her venom lies on the floor. */
const POOL_LIFE = 4.5;

type NeckKind = 'venom' | 'flame' | 'storm' | 'stone' | 'crown';
/** Each neck's warning by what it is about to do: spit, breathe, strike down, bite, call the storm. */
const NECK_TELL: Record<NeckKind, Sfx> = { venom: 'tellVolley', flame: 'tellBeam', storm: 'tellBeam', stone: 'tellSlam', crown: 'tellLunge' };
type NeckState = 'head' | 'stump' | 'sealed';

/**
 * One of her five necks.
 *
 * The head and the stump are two different places on purpose. A head sits where
 * it has to be cut from - the floor, a double jump, a particular step - and the
 * cut neck then droops to the height of the ledge the hero has to stand on to
 * burn it shut. So every neck asks two questions in two places, and the tower
 * is the answer to both.
 */
interface Neck {
  kind: NeckKind;
  hp: number;
  maxHp: number;
  state: NeckState;
  /** Where the head rides, from her middle and her feet. */
  hx: number;
  hy: number;
  /** Where the cut end hangs. */
  sx: number;
  sy: number;
  /** Where the neck leaves her body. */
  rootX: number;
  /** Seconds left before the head is back. */
  regrow: number;
  /** So five necks do not sway as one. */
  phase: number;
  /** Jaw, 0..1. Opens on the wind-up, which is half the tell. */
  jaw: number;
  /** Runs down after a hit, for the flash on that head alone. */
  sting: number;
}

/** A puddle of her venom, eating the floor it lies on. */
interface Pool {
  x: number;
  life: number;
  /** Seconds until the glob that made it actually lands there. */
  wait: number;
}

/** A spot the ceiling is about to drop something on. */
interface Drop {
  x: number;
  wind: number;
  t: number;
  fired: boolean;
}

/**
 * Die Fünfkronige - the hydra in the lair at the end of the rift, and the last
 * thing between the hero and the gate home.
 *
 * The fight is the old story rather than five bosses in a queue: all five heads
 * are awake and all five can be cut, but cutting one is not killing it. The
 * stump thrashes for nine seconds and then the head is back. Steel alone never
 * finishes her.
 *
 * What does is her own fire. The flame head lobs embers; an ember turned aside
 * with a parry flies dead flat and burns a stump shut for good. So the loop is
 *
 *   cut a head  ->  get to the height its stump droops to  ->  bait an ember
 *                ->  parry it into the stump
 *
 * and because a turned ember flies flat, the height the hero is standing at is
 * the height he is aiming at. Four stumps hang off four different ledges, which
 * is what the tower in her lair is for: the climb is not one phase of the fight
 * any more, it is the whole of it.
 *
 * The fifth neck is the fire itself. It can be cut like any other, but nothing
 * can burn its stump, so it simply grows back - unless the other four are
 * already sealed, in which case putting it out finishes her. A player who cuts
 * the flame head first loses nothing but time, and learns the order.
 *
 * The rest of the contract is the one every boss here keeps: each move is
 * announced, a move once begun is seen through, a parry always breaks her, and
 * nothing she does crosses the room - her longest reach is the stone breath at
 * 340 px, and beyond that she waits instead of shelling the far wall.
 */
export class Hydra extends Enemy {
  private state: 'wait' | 'idle' | 'wind' | 'act' | 'recover' | 'rise' = 'wait';
  private timer = 0;
  /** Which neck is taking its turn. */
  private acting = 0;
  private lastActing = -1;
  /** The tell. Fills before every move, on the acting head alone. */
  private glow = 0;
  private poise = HYDRA_POISE;
  private poiseMax = HYDRA_POISE;
  private hitThisMove = false;
  /** How far the stone breath has reached, 0..1. */
  private breath = 0;
  private breathDir: 1 | -1 = -1;
  /** Runs while a gust is pushing. */
  private gust = 0;
  private gustDir: 1 | -1 = 1;
  private pools: Pool[] = [];
  private drops: Drop[] = [];
  /** Top of the floor she sits on: pools and breath lie along it. */
  private floorY = 0;
  /** Underside of her lair's ceiling, found when she wakes: her rocks come off it. */
  private ceilingY = 0;
  private sway = 0;
  /** Which neck the blade is touching right now - see overlaps and hurt. */
  private struck = -1;
  /** Every head that grows back leaves her angrier, and a little quicker. */
  private fury = 0;
  /** How many heads the blade has had to take twice. Read by verify:hydra. */
  regrowths = 0;

  /**
   * Head heights are measured against what the hero can actually do, not
   * eyeballed: a standing swing covers 0 to 33 px above the floor, a held jump
   * lifts the blade to about 140 and a double jump to about 205, and a head box
   * is 44 px tall. Stump heights are measured against where he can stand: the
   * floor and the six steps put his middle 15, 111, 175, 239, 303, 367 and 431
   * px above her feet, and a stump hangs at one of those.
   */
  readonly necks: Neck[] = [
    { kind: 'venom', hp: NECK_HP, maxHp: NECK_HP, state: 'head', hx: -104, hy: -74, sx: -122, sy: -15, rootX: -30, regrow: 0, phase: 0.0, jaw: 0, sting: 0 },
    { kind: 'flame', hp: NECK_HP, maxHp: NECK_HP, state: 'head', hx: -36, hy: -104, sx: -48, sy: -104, rootX: -15, regrow: 0, phase: 1.3, jaw: 0, sting: 0 },
    { kind: 'stone', hp: NECK_HP, maxHp: NECK_HP, state: 'head', hx: 96, hy: -150, sx: 120, sy: -111, rootX: 16, regrow: 0, phase: 2.6, jaw: 0, sting: 0 },
    { kind: 'crown', hp: NECK_HP, maxHp: NECK_HP, state: 'head', hx: 52, hy: -258, sx: 64, sy: -239, rootX: 30, regrow: 0, phase: 3.9, jaw: 0, sting: 0 },
    { kind: 'storm', hp: NECK_HP, maxHp: NECK_HP, state: 'head', hx: -12, hy: -430, sx: -20, sy: -431, rootX: 0, regrow: 0, phase: 5.2, jaw: 0, sting: 0 },
  ];

  constructor(x: number, y: number) {
    super('hydra', x, y);
    this.w = 92;
    this.h = 54;
    this.hp = this.maxHp = NECK_HP * 5;
    this.scoreValue = 2500;
    this.aggroRange = 460;
    // She never hurts anyone by being stood next to: everything she does is
    // announced first.
    this.contactDamage = 0;
    this.floorY = y + this.h;
    this.ceilingY = y - 560;
  }

  /* ------------------------------------------------------------- the necks */

  /** Necks still carrying a head. */
  get heads(): Neck[] {
    return this.necks.filter((n) => n.state === 'head');
  }

  /** Stumps waiting to be burned shut, or to grow back. */
  get openStumps(): Neck[] {
    return this.necks.filter((n) => n.state === 'stump');
  }

  get sealed(): number {
    return this.necks.filter((n) => n.state === 'sealed').length;
  }

  /** For the bar: what each neck is doing, left to right. */
  get pips(): NeckState[] {
    return this.necks.map((n) => n.state);
  }

  /** And how much time each open stump has left, 0..1. */
  get pipUrgency(): number[] {
    return this.necks.map((n) => (n.state === 'stump' ? clamp(n.regrow / REGROW, 0, 1) : 1));
  }

  /** The flame neck is the fire, and the fire is the tool. */
  private get fire(): Neck {
    return this.necks[1];
  }

  /** She is finished when the four that can be burned are, and the fire is out. */
  private get finished(): boolean {
    return this.necks.every((n) => (n.kind === 'flame' ? n.state !== 'head' : n.state === 'sealed'));
  }

  /** Where a head is in the world right now. */
  headCentre(neck: Neck): { x: number; y: number } {
    const long = neck.hy < -300;
    const drift = Math.sin(this.sway * (long ? 0.8 : 1.25) + neck.phase) * (long ? 9 : 6);
    const lift = Math.cos(this.sway * 0.9 + neck.phase) * 4;
    return { x: this.cx + neck.hx + drift, y: this.bottom + neck.hy + lift };
  }

  /** Where a cut end hangs. It does not drift: it is a target to line up on. */
  stumpCentre(neck: Neck): { x: number; y: number } {
    return { x: this.cx + neck.sx, y: this.bottom + neck.sy };
  }

  headRect(neck: Neck): Rect {
    const c = this.headCentre(neck);
    return { x: c.x - 26, y: c.y - 22, w: 52, h: 44 };
  }

  /** Deliberately generous: this is what a thrown ember has to be aimed into. */
  stumpRect(neck: Neck): Rect {
    const c = this.stumpCentre(neck);
    return { x: c.x - 28, y: c.y - 28, w: 56, h: 56 };
  }

  /**
   * A sword or a crescent lands on a head, and on nothing else. Her body, her
   * necks and the stumps are not targets, in either direction - walking into
   * her costs nothing, and steel does nothing to a cut neck. Only fire closes
   * one of those.
   */
  override overlaps(r: Rect): boolean {
    this.struck = -1;
    for (const [i, neck] of this.necks.entries()) {
      if (neck.state !== 'head') continue;
      if (rectsOverlap(this.headRect(neck), r)) {
        this.struck = i;
        return true;
      }
    }
    return false;
  }

  protected override deathColor(): string {
    return '#7fd07f';
  }

  override hurt(amount: number, fromDir: number, world: World): void {
    if (this.dead || this.state === 'rise') return;
    // Whichever head the blade was touching when overlaps said yes. A blow
    // that arrives without one - a parry's shove, say - lands on the nearest.
    let neck = this.necks[this.struck];
    if (!neck || neck.state !== 'head') neck = this.heads[0];
    if (!neck) return;
    this.struck = -1;
    neck.hp -= amount;
    neck.sting = 1;
    this.flash = 1;
    this.poise -= amount;
    this.hp = Math.max(0, this.necks.reduce((sum, n) => sum + Math.max(0, n.hp), 0));
    if (neck.hp <= 0) {
      this.cutOff(neck, world);
      return;
    }
    audio.play('bossHit');
    if (this.poise <= 0 && this.poiseLock <= 0) this.reel(world, fromDir, 2.2);
  }

  /** A parry always breaks her, whatever the head has absorbed. */
  override onParried(world: World): void {
    if (this.dead || this.stun > 0 || this.state === 'rise') return;
    this.reel(world, -this.facing, 1.2);
  }

  private reel(world: World, fromDir: number, lock: number): void {
    this.poise = this.poiseMax;
    this.poiseLock = lock;
    this.stun = 0.55;
    this.glow = 0;
    void fromDir;
    const c = this.headCentre(this.necks[this.acting]);
    world.particles.burst(c.x, c.y, 18, '#c8ffb0', { speed: 210, shape: 'spark' });
  }

  /** A head comes off. It is not dead - it is counting. */
  private cutOff(neck: Neck, world: World): void {
    neck.hp = 0;
    neck.state = 'stump';
    neck.regrow = REGROW;
    neck.jaw = 0;
    const c = this.headCentre(neck);
    world.particles.burst(c.x, c.y, 38, '#9fe88a', { speed: 280, gravity: 300 });
    world.particles.burst(c.x, c.y, 20, '#d8ffcf', { speed: 180, shape: 'spark' });
    world.camera.addShake(7);
    world.hitStop(0.1);
    audio.play('bossHit', 0.7);
    world.addScore(300, c.x, c.y, '+300');
    if (this.finished) {
      this.hp = 0;
      this.die(world);
      return;
    }
    // The move that head was in the middle of is called off with it.
    if (this.necks[this.acting] === neck) {
      this.breath = 0;
      this.gust = 0;
      this.drops.length = 0;
      this.state = 'recover';
      this.timer = 0.9;
    }
    world.onHydraNeckCut(neck.kind === 'flame');
  }

  /** Her own fire, turned back into an open stump. That one is finished. */
  private cauterise(neck: Neck, world: World): void {
    neck.state = 'sealed';
    neck.regrow = 0;
    const c = this.stumpCentre(neck);
    world.particles.burst(c.x, c.y, 30, '#ffd49a', { speed: 220, gravity: -40 });
    world.particles.burst(c.x, c.y, 16, '#fff4d8', { speed: 150, shape: 'spark' });
    world.camera.addShake(6);
    world.hitStop(0.12);
    audio.play('burst', 1.2);
    world.addScore(500, c.x, c.y, '+500');
    world.onHydraNeckSealed(this.sealed);
    if (this.finished) {
      this.hp = 0;
      this.die(world);
    }
  }

  /** Nine seconds up, and the blade's work is undone. */
  private regrowNeck(neck: Neck, world: World): void {
    neck.state = 'head';
    neck.hp = Math.max(1, Math.round(neck.maxHp * 0.6));
    neck.jaw = 1;
    this.fury = Math.min(4, this.fury + 1);
    this.regrowths++;
    this.hp = Math.max(0, this.necks.reduce((sum, n) => sum + Math.max(0, n.hp), 0));
    const c = this.headCentre(neck);
    world.particles.burst(c.x, c.y, 26, '#8fe07a', { speed: 240, gravity: -60 });
    world.camera.addShake(6);
    audio.play('bossRoar', 1.1);
  }

  protected override die(world: World): void {
    this.pools.length = 0;
    this.drops.length = 0;
    this.breath = 0;
    this.gust = 0;
    super.die(world);
    world.onHydraDefeated();
  }

  /* ------------------------------------------------------------ the fight */

  override update(dt: number, world: World): void {
    this.updateCommon(dt);
    const player = world.player;
    const dx = player.cx - this.cx;
    const dist = Math.abs(dx);
    this.sway += dt;
    this.glow = Math.max(0, this.glow - dt * 2);
    if (this.onGround) this.floorY = this.bottom;
    for (const neck of this.necks) {
      neck.sting = Math.max(0, neck.sting - dt * 3);
      const wants = this.state === 'wind' && this.necks[this.acting] === neck ? 1 : 0;
      neck.jaw += (wants - neck.jaw) * Math.min(1, dt * 9);
    }

    if (!this.engaged) {
      if (dist < this.aggroRange && !player.dead) {
        this.engaged = true;
        this.measureTheRoom(world);
        world.onHydraEngaged();
        this.poise = this.poiseMax = this.sizeUpFor(world, HYDRA_POISE);
        // sizeUpFor grows the whole of her; the necks carry that between them,
        // since a neck is what the bar and the fight actually measure.
        const perNeck = Math.max(1, Math.round(this.maxHp / this.necks.length));
        for (const neck of this.necks) {
          neck.hp = neck.maxHp = perNeck;
        }
        this.state = 'rise';
        this.timer = 1.6;
        world.camera.addShake(7);
        audio.play('bossRoar');
      }
      this.vy += 1400 * dt;
      this.moveAndCollide(world.level, dt);
      return;
    }

    // Everything she has already put into the world runs on its own clock.
    this.updateStumps(dt, world);
    /*
     * Checked every frame rather than only on the cut and the seal: with the
     * fire already off and the last of the four burned shut, she is finished
     * whichever of the two happened last, and waiting for the next cut to
     * notice would leave her standing there with nothing left to fight with.
     */
    if (this.finished && !this.dead) {
      this.hp = 0;
      this.die(world);
      return;
    }
    this.updatePools(dt, world);
    this.updateDrops(dt, world);
    this.updateBreath(dt, world);
    this.updateGust(dt, world);
    if (this.dead) return;

    if (this.stun > 0) {
      if (this.state !== 'recover') {
        this.state = 'recover';
        this.timer = 0.8;
        this.hitThisMove = true;
        // The breath and the gust are the head's own, not something already
        // thrown: knocked off balance, it stops. The breath used to lie on the
        // floor through the rest of her turn and the next ones, 340 px of it,
        // for two hearts to whoever stepped into it once the next move began.
        this.breath = 0;
        this.gust = 0;
      }
      this.vy += 1400 * dt;
      this.moveAndCollide(world.level, dt);
      return;
    }

    this.facing = dx > 0 ? 1 : -1;
    this.timer -= dt;
    // Every head she has had to regrow costs her a little of her patience.
    const haste = 1 - this.fury * 0.06;

    switch (this.state) {
      case 'rise':
        this.glow = Math.min(1, this.glow + dt * 2);
        if (this.timer <= 0) {
          this.state = 'recover';
          this.timer = 0.9;
          audio.play('bossRoar', 1.2);
          world.camera.addShake(5);
        }
        break;

      case 'wait':
      case 'recover':
        if (this.timer <= 0) {
          this.state = 'idle';
          this.timer = rand(0.3, 0.55) * haste;
        }
        break;

      case 'idle':
        if (this.timer <= 0) {
          /*
           * Nothing she does carries across the room. Her longest move is the
           * stone breath at 340 px and the venom arc is shorter still, so out
           * beyond her reach she waits instead of lobbing at a dot on the far
           * wall. Measured as a real distance rather than a horizontal one:
           * while the hero is on the tower he is above her, not beside her.
           */
          if (Math.hypot(dx, player.cy - this.cy) > this.aggroRange) {
            this.timer = 0.3;
            this.glow = Math.max(this.glow, 0.15);
            break;
          }
          // Every head off at once: nothing to wind up with, so she thrashes
          // and waits for one to come back.
          if (this.heads.length === 0) {
            this.timer = 0.4;
            break;
          }
          this.acting = this.chooseNeck();
          this.state = 'wind';
          this.glow = 1;
          this.hitThisMove = false;
          // The longest warnings belong to the biggest thing in the game.
          this.timer = (this.necks[this.acting].kind === 'storm' ? 0.75 : 0.65) * haste;
          audio.play(NECK_TELL[this.necks[this.acting].kind], 0.7);
        }
        break;

      case 'wind':
        this.glow = 1;
        if (this.timer <= 0) this.beginMove(world, dx, dist);
        break;

      case 'act':
        if (this.timer <= 0) {
          this.breath = 0;
          this.state = 'recover';
          this.timer = (this.necks[this.acting].kind === 'crown' ? 1.0 : 1.15) * haste;
        }
        break;
    }

    this.vy += 1400 * dt;
    this.moveAndCollide(world.level, dt);
  }

  /**
   * Whose turn it is. Two rules on top of "not the same one twice": while a
   * stump is open the fire head gets most of the turns, because the fire is
   * what closes stumps and a hero who cannot get any is stuck watching his work
   * grow back.
   */
  private chooseNeck(): number {
    const alive = this.necks.map((n, i) => ({ n, i })).filter((e) => e.n.state === 'head');
    if (alive.length === 0) return this.acting;
    if (this.openStumps.length > 0 && this.fire.state === 'head' && Math.random() < 0.7) {
      return this.necks.indexOf(this.fire);
    }
    const fresh = alive.filter((e) => e.i !== this.lastActing);
    const pick = (fresh.length ? fresh : alive)[Math.floor(Math.random() * (fresh.length ? fresh.length : alive.length))];
    this.lastActing = pick.i;
    return pick.i;
  }

  /**
   * Where her lair's floor and ceiling are. Both are read out of the level once
   * she wakes: her rocks fall the height of the room, and the room is a room
   * rather than an open shaft.
   */
  private measureTheRoom(world: World): void {
    const level = world.level;
    this.floorY = this.bottom;
    const tx = Math.floor(this.cx / TILE);
    let ty = Math.floor((this.floorY - 1) / TILE);
    while (ty > 0 && !level.solidAt(tx, ty - 1)) ty--;
    this.ceilingY = ty * TILE;
  }

  /** How far from her middle anything she throws is allowed to land. */
  private static readonly THROW_REACH = 300;

  /* ------------------------------------------------------------- her moves */

  private beginMove(world: World, dx: number, dist: number): void {
    const player = world.player;
    const neck = this.necks[this.acting];
    const from = this.headCentre(neck);
    switch (neck.kind) {
      case 'venom': {
        // Three globs on short arcs, landing around him rather than on him.
        // The arc is solved, so where each one comes down is known here: the
        // pool is queued for that spot and that moment rather than waiting for
        // the glob to report back.
        const flight = 0.8;
        const aim = clamp(dx, -Hydra.THROW_REACH, Hydra.THROW_REACH);
        const aimY = Math.min(player.cy, this.floorY - 8);
        for (const spread of [-72, 0, 72]) {
          // Solved from the head it leaves, onto the spot its pool is queued
          // for. Solved from her middle, every glob came down a hundred pixels
          // from its pool, and the pools formed where nothing had fallen.
          const vx = (this.cx + aim + spread - from.x) / flight;
          const vy = (aimY - from.y) / flight - 0.5 * 1150 * flight;
          const glob = new Projectile('blob', from.x - 8, from.y, vx, vy);
          glob.damage = 1;
          world.spawnProjectile(glob);
          this.pools.push({ x: this.cx + aim + spread, life: POOL_LIFE, wait: flight });
        }
        audio.play('fireball', 1.2);
        this.state = 'recover';
        this.timer = 1.1;
        break;
      }
      case 'flame': {
        // The move the whole fight hangs on: fire, lobbed onto him wherever he
        // is standing, and the only thing that can shut a stump. Two of them,
        // so one can be taken on the chin and the other turned.
        this.lobEmbers(world, from, this.openStumps.length > 0 ? 2 : 1);
        this.state = 'recover';
        // Quicker back to it while a stump is open: the hero needs fire to
        // close one, and standing about waiting for a coal is not a fight.
        this.timer = this.openStumps.length > 0 ? 0.8 : 1.0;
        break;
      }
      case 'stone':
        // A sweep of the neck along the floor - and the steps get the debris,
        // so standing up there is no longer the answer it was.
        this.breathDir = dx > 0 ? 1 : -1;
        this.breath = 0.001;
        this.markDrops(world, [this.cx - 150, this.cx + 20, this.cx + 170], 0.85);
        audio.play('impactHydra');
        world.camera.addShake(5);
        this.state = 'act';
        this.timer = 1.0;
        break;
      case 'storm':
        // Rocks onto the steps, and a gust while he is between them.
        this.markDrops(world, [player.cx, player.cx + rand(-150, 150), this.cx + rand(-170, 170)]);
        if (dist > 120 || player.bottom < this.floorY - 60) {
          this.gust = 1.1;
          this.gustDir = player.cx > this.cx ? 1 : -1;
        }
        audio.play('rumble', 1.2);
        this.state = 'recover';
        this.timer = 1.2;
        break;
      case 'crown': {
        // The crowned head borrows whatever the others are doing, faster.
        const pick = Math.floor(Math.random() * 3);
        if (pick === 0) {
          const flight = 0.75;
          const aim = clamp(dx, -Hydra.THROW_REACH, Hydra.THROW_REACH);
          const aimY = Math.min(player.cy, this.floorY - 8);
          for (const spread of [-60, 60]) {
            const vx = (this.cx + aim + spread - from.x) / flight;
            const vy = (aimY - from.y) / flight - 0.5 * 1150 * flight;
            const glob = new Projectile('blob', from.x - 8, from.y, vx, vy);
            world.spawnProjectile(glob);
            this.pools.push({ x: this.cx + aim + spread, life: POOL_LIFE, wait: flight });
          }
          audio.play('fireball', 1.2);
          this.state = 'recover';
          this.timer = 0.95;
        } else if (pick === 1) {
          this.breathDir = dx > 0 ? 1 : -1;
          this.breath = 0.001;
          audio.play('impactHydra', 0.8);
          this.state = 'act';
          this.timer = 1.0;
        } else {
          this.markDrops(world, [player.cx, player.cx + rand(-120, 120)], 0.7);
          audio.play('rumble', 1.2);
          this.state = 'recover';
          this.timer = 1.0;
        }
        break;
      }
    }
  }

  /** Coals on a solved arc, so they arrive wherever he is standing. */
  private lobEmbers(world: World, from: { x: number; y: number }, count: number): void {
    const player = world.player;
    const flight = 0.85;
    for (let i = 0; i < count; i++) {
      // One coal comes down on him and the rest go wide. Two lobbed either side
      // of him is two he cannot turn: a parry box is fifty pixels across, so a
      // pair straddling him at thirty-four each just misses twice.
      const spread = i === 0 ? 0 : 78 * (i % 2 === 1 ? 1 : -1);
      const targetX = player.cx + spread;
      const vx = (targetX - from.x) / flight;
      const vy = (player.cy - 6 - from.y) / flight - 0.5 * 1000 * flight;
      const ember = new Projectile('ember', from.x - 9, from.y - 9, vx, vy);
      world.spawnProjectile(ember);
    }
    audio.play('fireball');
    world.camera.addShake(3);
  }

  /**
   * Marks on the ceiling that become falling rock. Clamped to her own stretch
   * of ceiling: she brings the room down around herself, not across it.
   */
  private markDrops(world: World, spots: number[], wind = 0.7): void {
    void world;
    for (const [i, x] of spots.entries()) {
      const at = clamp(x, this.cx - Hydra.THROW_REACH - 120, this.cx + Hydra.THROW_REACH + 120);
      this.drops.push({ x: at, wind: wind + i * 0.12, t: 0, fired: false });
    }
  }

  /* --------------------------------------------------- what she left behind */

  /**
   * The stumps: counting down, and waiting for fire. A turned ember is caught
   * here rather than by the general projectile pass, so that steel thrown at a
   * stump still does nothing and only fire closes it.
   */
  private updateStumps(dt: number, world: World): void {
    for (const neck of this.necks) {
      if (neck.state !== 'stump') continue;
      const box = this.stumpRect(neck);
      for (const p of world.projectiles) {
        if (p.dead || !p.friendly || p.kind !== 'ember') continue;
        if (!rectsOverlap(box, p.rect)) continue;
        p.dead = true;
        this.cauterise(neck, world);
        break;
      }
      if (neck.state !== 'stump') continue;
      neck.regrow -= dt;
      if (world.time % 0.09 < dt) {
        const c = this.stumpCentre(neck);
        world.particles.spawn({
          x: c.x + rand(-9, 9),
          y: c.y + rand(-6, 6),
          vx: rand(-24, 24),
          vy: rand(10, 50),
          gravity: 220,
          color: 'rgba(150,220,110,0.7)',
          size: 3,
          life: 0.5,
          shape: 'circle',
        });
      }
      if (neck.regrow <= 0) this.regrowNeck(neck, world);
    }
  }

  private updatePools(dt: number, world: World): void {
    const player = world.player;
    for (const pool of this.pools) {
      if (pool.wait > 0) {
        pool.wait -= dt;
        continue;
      }
      pool.life -= dt;
      if (world.time % 0.08 < dt) {
        world.particles.spawn({
          x: pool.x + rand(-22, 22),
          y: this.floorY - 4,
          vx: rand(-10, 10),
          vy: -rand(12, 34),
          color: 'rgba(150,225,110,0.6)',
          size: 2.5,
          life: 0.5,
          shape: 'circle',
        });
      }
      if (pool.life <= 0 || player.dead) continue;
      const box = { x: pool.x - 26, y: this.floorY - 14, w: 52, h: 16 };
      if (rectsOverlap(box, player.rect)) player.hurt(1, sign(player.cx - pool.x) || 1, world);
    }
    this.pools = this.pools.filter((p) => p.wait > 0 || p.life > 0);
  }

  private updateDrops(dt: number, world: World): void {
    if (this.drops.length === 0) return;
    for (const drop of this.drops) {
      drop.t += dt;
      if (drop.t < drop.wind) {
        if (world.time % 0.06 < dt) {
          world.particles.spawn({
            x: drop.x + rand(-14, 14),
            y: this.ceilingY + 8,
            vx: rand(-6, 6),
            vy: rand(20, 60),
            color: 'rgba(200,190,170,0.7)',
            size: 2,
            life: 0.5,
            shape: 'circle',
          });
        }
        continue;
      }
      if (!drop.fired) {
        drop.fired = true;
        const rock = new Projectile('rock', drop.x - 10, this.ceilingY + 2, 0, 120);
        world.spawnProjectile(rock);
        audio.play('impactHydra', 0.4);
      }
    }
    this.drops = this.drops.filter((d) => !d.fired || d.t < d.wind + 0.4);
  }

  private updateBreath(dt: number, world: World): void {
    if (this.breath <= 0) return;
    this.breath = Math.min(1, this.breath + dt * 2.6);
    const player = world.player;
    const reach = 340 * this.breath;
    const box = {
      x: this.breathDir > 0 ? this.cx : this.cx - reach,
      y: this.floorY - 40,
      w: reach,
      h: 40,
    };
    if (world.time % 0.04 < dt) {
      world.particles.spawn({
        x: this.cx + this.breathDir * rand(20, reach),
        y: this.floorY - rand(6, 34),
        vx: this.breathDir * rand(60, 190),
        vy: -rand(10, 60),
        color: 'rgba(190,180,160,0.6)',
        size: 3,
        life: 0.35,
        shape: 'circle',
      });
    }
    if (!this.hitThisMove && !player.dead && rectsOverlap(box, player.rect)) {
      this.hitThisMove = true;
      player.hurt(2, this.breathDir, world);
    }
  }

  private updateGust(dt: number, world: World): void {
    if (this.gust <= 0) return;
    this.gust -= dt;
    const player = world.player;
    if (player.dead) return;
    // Only in the air, and gently: it is there to make the climb a climb, not
    // to take it away from him.
    if (!player.onGround) player.vx += this.gustDir * 150 * dt;
    if (world.time % 0.05 < dt) {
      world.particles.spawn({
        x: player.cx - this.gustDir * rand(40, 160),
        y: player.cy + rand(-40, 40),
        vx: this.gustDir * rand(120, 260),
        vy: rand(-20, 20),
        color: 'rgba(200,230,255,0.5)',
        size: 2,
        life: 0.35,
        shape: 'spark',
      });
    }
  }

  /* ------------------------------------------------------------- drawing */

  /**
   * Her lights: the head winding up glows in its own colour, an open stump
   * beats, the coals in the fire's mouth never quite go out. They light the
   * ledges of her tower round them; she herself is drawn as she is.
   */
  override lights(): GlowLight[] {
    const out: GlowLight[] = [];
    if (this.dead || !this.engaged) return out;
    const acting = this.necks[this.acting];
    if (acting && acting.state === 'head' && this.glow > 0.05) {
      const c = this.headCentre(acting);
      out.push({ x: c.x, y: c.y, radius: 70 + this.glow * 40, rgb: HEAD_LIGHT[acting.kind], strength: 0.4 + this.glow * 0.4, tint: 0.3 });
    }
    for (const neck of this.necks) {
      if (neck.state === 'stump') {
        const c = this.stumpCentre(neck);
        out.push({ x: c.x, y: c.y, radius: 64, rgb: '190,255,140', strength: 0.55, tint: 0.3 });
      } else if (neck.kind === 'flame' && neck.state === 'head') {
        const c = this.headCentre(neck);
        out.push({ x: c.x + this.facing * 20, y: c.y, radius: 40, rgb: '255,170,90', strength: 0.4, tint: 0.25 });
      }
    }
    return out;
  }

  /*
   * Drawn the way a sixteen-bit boss was (hydra-art.ts): her body a sprite made
   * once, every neck a chain of segment sprites at sixteen angles laid from the
   * root up, every head a sprite of its own with three openings of the jaw.
   * Nothing is turned, scaled or faded by the canvas; a struck head and neck go
   * white for a moment, and only they.
   */
  override draw(ctx: CanvasRenderingContext2D): void {
    // What she has not been drawn with yet, made ahead a little a frame.
    warmHydra(1.5);
    this.drawPools(ctx);
    this.drawDrops(ctx);
    this.drawBreath(ctx);
    shadow(ctx, this.cx, this.bottom, this.w * 0.62);
    /*
     * Back to front by how far the neck leans out: the ones reaching across
     * her pass behind the ones on the near side, so five necks read as depth
     * instead of as a tangle. Her body goes over all of their roots.
     */
    const order = [...this.necks].sort((a, b) => this.lean(b) - this.lean(a));
    for (const neck of order) if (this.lean(neck) >= 0) this.drawNeck(ctx, neck);
    this.drawCoils(ctx);
    blit(ctx, bodyPart(Math.sin(this.sway * 1.3) > 0.2 ? 1 : 0), this.cx, this.bottom);
    for (const neck of order) if (this.lean(neck) < 0) this.drawNeck(ctx, neck);
  }

  /**
   * Her tail, in two coils either side of her on the floor: the plates of a
   * neck lying down, belly to the boards - the mass of her wider than the box
   * she is walked round on.
   */
  private drawCoils(ctx: CanvasRenderingContext2D): void {
    for (const side of [-1, 1] as const) {
      const pts = quad(this.cx + side * 40, this.bottom - 14, this.cx + side * 92, this.bottom - 4, this.cx + side * 122, this.bottom - 16, 9);
      const n = pts.length / 2;
      for (let i = 0; i < n; i++) {
        const a = Math.max(0, i - 1) * 2;
        const b = Math.min(n - 1, i + 1) * 2;
        const rq = Math.max(2, Math.round((13 - 8 * (i / (n - 1))) / 2));
        blit(ctx, segmentPart(rq, angleStep(Math.atan2(pts[b + 1] - pts[a + 1], pts[b] - pts[a])), side, 'plain'), pts[i * 2], pts[i * 2 + 1]);
      }
    }
  }

  /** How far out the neck reaches, used only to decide painting order. */
  private lean(neck: Neck): number {
    return neck.state === 'head' ? Math.abs(neck.hx) + -neck.hy * 0.25 : Math.abs(neck.sx);
  }

  /** Where the far end of a neck is, whatever is on it. */
  private endOf(neck: Neck): { x: number; y: number } {
    return neck.state === 'head' ? this.headCentre(neck) : this.stumpCentre(neck);
  }

  /**
   * The spine of a neck, as points along a quadratic curve with a radius that
   * tapers from the root to the far end - a point every six pixels or so,
   * where a segment of it is laid.
   */
  private neckSpine(neck: Neck): { x: number; y: number; r: number }[] {
    const root = { x: this.cx + neck.rootX * 1.5, y: this.bottom - BULK_H * 0.5 };
    const end = this.endOf(neck);
    const span = Math.hypot(end.x - root.x, end.y - root.y);
    const alive = neck.state === 'head';
    const bow = alive ? Math.sin(this.sway * 1.05 + neck.phase) * Math.min(26, span * 0.09) : 0;
    const mid = {
      x: (root.x + end.x) / 2 + bow - (end.x - root.x) * 0.2,
      y: (root.y + end.y) / 2 - Math.min(78, span * 0.32),
    };
    const steps = Math.max(6, Math.min(60, Math.round(span / 9)));
    const out: { x: number; y: number; r: number }[] = [];
    const thick = neck.state === 'sealed' ? 0.82 : 1;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const u = 1 - t;
      out.push({
        x: u * u * root.x + 2 * u * t * mid.x + t * t * end.x,
        y: u * u * root.y + 2 * u * t * mid.y + t * t * end.y,
        r: (17 - 9 * Math.pow(t, 0.6)) * thick,
      });
    }
    return out;
  }

  /** How a neck and its head are drawn this frame. */
  private toneOf(neck: Neck): Tone {
    if (neck.state === 'sealed') return 'sealed';
    if (neck.sting > 0.72) return 'struck';
    return this.necks[this.acting] === neck && neck.state === 'head' && this.glow > 0.4 ? 'hot' : 'plain';
  }

  /**
   * One neck: segment after segment from the root to the end, each at the
   * drawn angle nearest the curve's and as thick as the neck is there, its
   * belly stripe on the side that faces down and towards the hero all the way
   * along - then whatever is on the end of it.
   */
  private drawNeck(ctx: CanvasRenderingContext2D, neck: Neck): void {
    const spine = this.neckSpine(neck);
    const tone = this.toneOf(neck);
    const first = spine[0];
    const last = spine[spine.length - 1];
    // Which side the belly is on, once for the whole neck: the side of its
    // general run that faces down and towards whoever she is watching.
    const ax = last.x - first.x;
    const ay = last.y - first.y;
    const len = Math.hypot(ax, ay) || 1;
    const belly: 1 | -1 = (-ay / len) * this.facing * 0.45 + (ax / len) * 0.9 >= 0 ? 1 : -1;
    for (let i = 0; i < spine.length; i++) {
      const a = spine[Math.max(0, i - 1)];
      const b = spine[Math.min(spine.length - 1, i + 1)];
      const p = spine[i];
      const rq = Math.max(2, Math.min(9, Math.round(p.r / 2)));
      blit(ctx, segmentPart(rq, angleStep(Math.atan2(b.y - a.y, b.x - a.x)), belly, tone), p.x, p.y);
    }
    if (neck.state === 'head') this.drawHead(ctx, neck, tone);
    else if (neck.state === 'stump') this.drawStump(ctx, neck);
    else blit(ctx, sealPart(Math.sin(this.sway * 1.6 + neck.phase) > 0.3 ? 1 : 0), this.stumpCentre(neck).x, this.stumpCentre(neck).y);
  }

  /**
   * A serpent skull with a hinged jaw that opens while the head winds up -
   * half the tell: a head about to breathe is a head with its mouth open, its
   * throat and its eye gone white-hot. Every head watches the hero once she is
   * awake; five skulls turning with him is most of what makes her one animal.
   */
  private drawHead(ctx: CanvasRenderingContext2D, neck: Neck, tone: Tone): void {
    const at = this.headCentre(neck);
    const toward = this.engaged ? this.facing : neck.hx > 0 ? 1 : -1;
    const jaw = neck.jaw < 0.2 ? 0 : neck.jaw < 0.7 ? 1 : 2;
    blit(ctx, headPart(neck.kind, jaw, tone), at.x, at.y, toward < 0);
  }

  /**
   * A cut neck: an open wound that beats, and the seconds left drawn round it
   * as a ring that closes - pale green while there is time, beating orange
   * when there is not. The one thing in the fight the hero has to read at a
   * glance from the other end of the room, so it is loud on purpose.
   */
  private drawStump(ctx: CanvasRenderingContext2D, neck: Neck): void {
    const c = this.stumpCentre(neck);
    const left = clamp(neck.regrow / REGROW, 0, 1);
    const urgent = left < 0.34;
    const beat = Math.sin(this.sway * (urgent ? 11 : 6) + neck.phase) > 0.2 ? 1 : 0;
    blit(ctx, stumpPart(beat, neck.sting > 0.72 ? 'struck' : 'plain'), c.x, c.y);
    const colour = urgent ? (beat ? RAMP.fire[2] : RAMP.fire[1]) : RAMP.green[6];
    if (left > 0.01) sector(ctx, snap(c.x), snap(c.y), 20, 25, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left, colour);
  }

  /** Her venom on the floor: a flat puddle in bands, shrinking as it dries. */
  private drawPools(ctx: CanvasRenderingContext2D): void {
    const F = snap(this.floorY);
    for (const pool of this.pools) {
      if (pool.wait > 0) continue;
      const k = Math.min(1, pool.life / 1.2);
      const half = 28 * (0.45 + 0.55 * k);
      const x = snap(pool.x);
      rect(ctx, x - half, F - 4, half * 2, 2, RAMP.green[3]);
      rect(ctx, x - half * 0.72, F - 6, half * 1.44, 2, RAMP.green[4]);
      rect(ctx, x - half * 0.3 - 4, F - 6, half * 0.36, 2, RAMP.green[5]);
      rect(ctx, x - half * 0.86, F - 2, half * 1.72, 2, RAMP.green[2]);
    }
  }

  /**
   * Where the ceiling is about to let go. The ring on the floor is the part a
   * player reads, but half of this fight happens on the steps, where the floor
   * is off the bottom of the screen - so the column it falls down is marked
   * too, as grit trickling down it, thicker as the rock comes loose.
   */
  private drawDrops(ctx: CanvasRenderingContext2D): void {
    for (const drop of this.drops) {
      if (drop.fired) continue;
      const p = clamp(drop.t / drop.wind, 0, 1);
      const colour = p < 0.5 ? RAMP.slate[4] : RAMP.slate[6];
      const x = snap(drop.x);
      const gap = p < 0.5 ? 40 : 24;
      const fall = (drop.t * 140) % gap;
      for (let y = this.ceilingY + fall, k = 0; y < this.floorY - 8; y += gap, k++) {
        rect(ctx, x + (k & 1 ? 4 : -6), snap(y), 4, 4, colour);
      }
      ovalRing(ctx, x, this.floorY - 2, 20 * (1 - p * 0.35), 5, 1, colour);
    }
  }

  /**
   * The stone breath, pouring along the floor from her mouth outwards: a
   * ragged bank of grit in three greys, highest at her and lower as it runs
   * out. The box that hurts is the full 40 px either way - see updateBreath.
   */
  private drawBreath(ctx: CanvasRenderingContext2D): void {
    if (this.breath <= 0) return;
    const reach = 340 * this.breath;
    const F = snap(this.floorY);
    const x0 = snap(this.cx);
    const roll = Math.floor(this.anim * 20);
    for (let d = 0; d < reach; d += 4) {
      const fall = 1 - (d / 340) * 0.65;
      const n = hash2(Math.floor(d / 4) - roll * this.breathDir, 7);
      const h = Math.max(4, Math.round((38 * fall * (0.7 + n * 0.3)) / 2) * 2);
      const x = this.breathDir > 0 ? x0 + d : x0 - d - 4;
      rect(ctx, x, F - h, 4, Math.min(h, 10), RAMP.grey[6]);
      if (h > 10) rect(ctx, x, F - h + 10, 4, Math.min(h - 10, 14), RAMP.grey[5]);
      if (h > 24) rect(ctx, x, F - h + 24, 4, h - 24, RAMP.grey[4]);
    }
  }
}

/** The colour of each head's light, for the ledges round it. */
const HEAD_LIGHT: Record<NeckKind, string> = {
  venom: '170,240,110',
  flame: '255,160,80',
  storm: '140,210,255',
  stone: '220,214,200',
  crown: '255,214,110',
};


/**
 * The roster in this file. The bosses that live in files of their own are
 * built in roster.ts, which knows about both - this one cannot import them
 * without a cycle, since they are built on Enemy.
 */
export function createBaseEnemy(kind: EnemyKind, x: number, y: number): Enemy {
  switch (kind) {
    case 'slime':
      return new Slime(x, y);
    case 'bat':
      return new Bat(x, y);
    case 'skeleton':
      return new Skeleton(x, y);
    case 'mage':
      return new DarkMage(x, y);
    case 'bomber':
      return new Bomber(x, y);
    case 'shieldman':
      return new Shieldman(x, y);
    case 'charger':
      return new Charger(x, y);
    case 'warden':
      return new Warden(x, y);
    case 'gallert':
      return new Gallert(x, y);
    case 'hydra':
      return new Hydra(x, y);
    case 'thalassa':
      return new Thalassa(x, y);
    case 'prismarch':
      return new Prismarch(x, y);
    default:
      throw new Error(`${kind} is built in roster.ts`);
  }
}
