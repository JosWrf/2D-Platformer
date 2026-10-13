import { audio } from '../core/audio';
import { Rect, approach, clamp, rand, rectsOverlap } from '../core/math';
import { rect, sector } from '../render/pen';
import { ART } from '../render/pixel';
import { glow, shadow, withHitFlash } from '../render/sprites';
import type { World } from '../world/context';
import { angleStep, blit, solidFlash } from './boss-art';
import { Body } from './entity';
import { Skeleton, bossScale } from './enemy';
import {
  BLOOD,
  type KnightLook,
  type KnightPose,
  SWORD_STEPS,
  armPart,
  elbowOf,
  eyesAt,
  gemAt,
  gemSprite,
  knightBody,
  shouldersOf,
  swordPart,
} from './knight-art';
import { Projectile } from './projectile';

export const BOSS_MAX_HP = 68;

/** How many summoned skeletons may stand in the arena at once. */
const MAX_MINIONS = 2;

/** Damage he takes mid-action before he loses his footing. */
const STAGGER_DAMAGE = 18;
/**
 * How long his blade needs between batting two crescents out of the air.
 *
 * Short on purpose: this is not a cooldown that decides how often he may
 * guard, it is only there so two crescents in the same moment do not throw two
 * sparks and two sounds. What decides whether the blade covers him is his own
 * state - see guardBlade. Measured with a rest of 1.15 s instead, he turned
 * aside 21 of 99 crescents and still lost his whole bar in thirty seconds to a
 * hero who never came within reach.
 */
const GUARD_REST = 0.3;

/**
 * And how long he keeps it afterwards, whatever else lands on him. Without this
 * the knight could be held on the floor for a whole fight: a hero with the
 * blade upgrade deals fourteen damage in less time than one stagger lasts, so
 * every recovery ran straight into the next one. Measured, he spent 46 % of the
 * fight benommen and answered with one move in thirteen seconds.
 */
const STAGGER_REST = 2.6;

type BossState =
  | 'dormant'
  | 'intro'
  | 'idle'
  | 'walk'
  | 'slamWindup'
  | 'slam'
  | 'dashWindup'
  | 'dash'
  | 'cast'
  | 'summon'
  | 'leap'
  | 'stagger'
  | 'dying';

export class Boss extends Body {
  readonly name = 'SCHATTENRITTER MORVAIN';
  hp = BOSS_MAX_HP;
  maxHp = BOSS_MAX_HP;
  facing: 1 | -1 = -1;
  flash = 0;
  state: BossState = 'dormant';
  engaged = false;
  vulnerable = false;
  /** Arachna's silk, thrown by the hero - see Enemy.snare. */
  snare = 0;
  anim = 0;

  private timer = 0;
  private damageSinceStagger = 0;
  /** Punishment needed for the next stagger - grows with the hero's blade. */
  private staggerAt = STAGGER_DAMAGE;
  /**
   * Set when a blow lands while he is winding up, cleared when the action ends.
   * See hurt: hitting a knight mid-swing makes the swing arrive sooner, not
   * later, and it can only be provoked once per action.
   */
  private provoked = false;
  /** Time before blind damage may put him down again. */
  private damageLock = 0;
  /** Time before another parry may, which is a much shorter leash. */
  private parryLock = 0;
  /** Set once when he wakes, so the blade is only taken stock of once. */
  private scaled = false;
  /** Time before his blade can turn aside another crescent. */
  private guardLock = 0;
  /** Decays after he has just done it; drives the spark on the blade. */
  private guardFlash = 0;
  private swordAngle = -0.6;
  private targetSwordAngle = -0.6;
  private hitPlayerThisAction = false;
  private auraPulse = 0;
  private deathTimer = 0;
  /** Paces the rumble while he collapses. */
  private rumbleTimer = 0;
  private lastAction = '';
  private readonly spawnX: number;
  private readonly spawnY: number;
  /** Skeletons raised in this fight, so the arena never fills up with them. */
  private readonly minions: Skeleton[] = [];

  constructor(x: number, y: number) {
    super();
    this.w = 62;
    this.h = 92;
    this.x = x;
    this.y = y;
    this.spawnX = x;
    this.spawnY = y;
  }

  /**
   * Back to the throne, exactly as the arena was first found. Without this the
   * knight keeps whatever spot he was lured to, and waking up next to the gate
   * slams it shut in the returning player's face.
   */
  reset(): void {
    this.x = this.spawnX;
    this.y = this.spawnY;
    this.vx = 0;
    this.vy = 0;
    this.hp = this.maxHp;
    this.facing = -1;
    this.state = 'dormant';
    this.engaged = false;
    this.vulnerable = false;
    this.dead = false;
    this.flash = 0;
    this.timer = 0;
    this.deathTimer = 0;
    this.damageSinceStagger = 0;
    this.provoked = false;
    this.damageLock = 0;
    this.parryLock = 0;
    this.guardLock = 0;
    this.guardFlash = 0;
    this.hitPlayerThisAction = false;
    this.lastAction = '';
    this.swordAngle = -0.6;
    this.targetSwordAngle = -0.6;
    // The world rebuilds its enemy list on respawn, so the old references are
    // gone - keeping them would block summoning for the rest of the run.
    this.minions.length = 0;
  }

  /** Summoned skeletons still standing; drops the ones that have fallen. */
  private livingMinions(): number {
    for (let i = this.minions.length - 1; i >= 0; i--) {
      if (this.minions[i].dead) this.minions.splice(i, 1);
    }
    return this.minions.length;
  }

  get phase(): 1 | 2 | 3 {
    const ratio = this.hp / this.maxHp;
    if (ratio > 0.62) return 1;
    if (ratio > 0.3) return 2;
    return 3;
  }

  overlaps(r: Rect): boolean {
    return rectsOverlap({ x: this.x + 8, y: this.y + 6, w: this.w - 16, h: this.h - 6 }, r);
  }

  engage(world: World): void {
    if (this.engaged) return;
    this.engaged = true;
    // He sizes up the blade coming at him, once. See bossScale.
    if (!this.scaled) {
      this.scaled = true;
      const scale = bossScale(world.player.relics);
      this.maxHp = Math.round(BOSS_MAX_HP * scale.hp);
      this.hp = this.maxHp;
      this.staggerAt = Math.round(STAGGER_DAMAGE * scale.poise);
    }
    this.state = 'intro';
    this.timer = 2.2;
    audio.play('bossRoar');
    world.camera.addShake(9);
    world.onBossEngaged();
  }

  hurt(amount: number, fromDir: number, world: World): void {
    if (this.dead || !this.vulnerable) return;
    this.hp -= amount;
    this.flash = 1;
    this.damageSinceStagger += amount;
    audio.play('bossHit');
    world.particles.burst(this.cx - fromDir * 10, this.cy, 12, '#ff8a72', { speed: 200, gravity: 380 });
    if (this.hp <= 0) {
      this.hp = 0;
      this.beginDeath(world);
      return;
    }
    if (this.damageSinceStagger >= this.staggerAt && this.damageLock <= 0) {
      this.stagger(world);
      this.vx = fromDir * 90;
      return;
    }

    /*
     * Hit him while he is drawing back and he lets it fly early.
     *
     * Measured, and the reason this exists: a hero who simply stood in his face
     * with the attack button held took him from full to nothing in seventeen
     * seconds and lost six hit points doing it, because the wind-up was a free
     * window he could stand inside and out-trade. The wind-up was already the
     * announcement - this only makes ignoring it cost something. A player who
     * reads the tell and backs off never sees it, it can be provoked once per
     * action, and a parry still breaks him out of the swing.
     */
    if (!this.provoked && (this.state === 'slamWindup' || this.state === 'dashWindup') && this.timer > 0.14) {
      this.provoked = true;
      this.timer = 0.18;
      this.flash = 1;
      audio.play('parry', 0.55);
      world.particles.text(this.cx, this.y - 12, 'GEREIZT!', '#ff9a5c');
      world.particles.burst(this.cx + this.facing * 18, this.cy - 6, 14, '#ffd166', {
        speed: 230,
        shape: 'spark',
      });
    }
  }

  /**
   * Thrown off balance - by a parry, or by taking enough punishment. This is
   * the player's window: the knight stands open until he recovers.
   */
  stagger(world: World, duration = 1.35): void {
    if (this.dead || this.state === 'stagger' || this.state === 'intro') return;
    this.damageSinceStagger = 0;
    this.state = 'stagger';
    this.timer = duration;
    this.vx = 0;
    // Whatever put him down, he keeps his feet for a while afterwards.
    this.damageLock = duration + STAGGER_REST;
    world.camera.addShake(6);
    world.particles.text(this.cx, this.y - 12, 'BENOMMEN!', '#ffd166');
  }

  /**
   * A parry always puts him down, whatever he has absorbed - that is what the
   * parry is for, and it can only come while he is actually swinging, so his
   * own rhythm limits it. The short leash is only there so a held parry through
   * a multi-hit action cannot chain two staggers out of one swing.
   */
  onParried(world: World): void {
    if (this.parryLock > 0) return;
    this.parryLock = 1.95;
    this.stagger(world);
  }

  private beginDeath(world: World): void {
    this.state = 'dying';
    this.deathTimer = 2.6;
    this.vulnerable = false;
    this.vx = 0;
    audio.play('bossRoar');
    world.camera.addShake(12);
    world.hitStop(0.35);
  }

  update(dt: number, world: World): void {
    this.anim += dt;
    this.flash = Math.max(0, this.flash - dt * 4);
    this.auraPulse += dt * (this.phase === 3 ? 5 : 2.6);
    this.swordAngle += (this.targetSwordAngle - this.swordAngle) * Math.min(1, dt * 9);

    const player = world.player;
    this.damageLock = Math.max(0, this.damageLock - dt);
    this.parryLock = Math.max(0, this.parryLock - dt);
    this.guardLock = Math.max(0, this.guardLock - dt);
    this.guardFlash = Math.max(0, this.guardFlash - dt * 3.5);

    if (this.state === 'dormant') {
      this.vy = Math.min(700, this.vy + 1800 * dt);
      this.moveAndCollide(world.level, dt);
      // Only wake once the player is actually inside the arena, or the gate
      // slams shut in front of them.
      const inArena = player.cx > world.level.arenaLeft;
      if (inArena && Math.abs(player.cx - this.cx) < 460 && !player.dead) this.engage(world);
      return;
    }

    if (this.state === 'dying') {
      this.deathTimer -= dt;
      this.vx = approach(this.vx, 0, 400 * dt);
      this.vy = Math.min(700, this.vy + 1800 * dt);
      this.moveAndCollide(world.level, dt);
      if (Math.random() < 0.5) {
        world.particles.burst(this.cx + rand(-26, 26), this.cy + rand(-34, 34), 3, '#ff6b4a', {
          speed: 90,
          gravity: -60,
          size: 4,
        });
      }
      // A rumble on a beat while he goes down, not a per-frame lottery. The
      // lottery fired about ten times a second, and every one of them was a
      // fresh impact - a second and a half of the screen being thrown around
      // right as the fight ends.
      this.rumbleTimer -= dt;
      if (this.deathTimer <= 1.6 && this.rumbleTimer <= 0) {
        this.rumbleTimer = 0.45;
        world.camera.addShake(2);
      }
      if (this.deathTimer <= 0 && !this.dead) {
        this.dead = true;
        world.camera.addShake(14);
        world.particles.burst(this.cx, this.cy, 90, '#ffd166', { speed: 340, gravity: 260, size: 5 });
        world.particles.burst(this.cx, this.cy, 50, '#ff6b4a', { speed: 240, gravity: 120, shape: 'circle' });
        world.onBossDefeated();
      }
      return;
    }

    this.vulnerable = this.state !== 'intro';
    const dx = player.cx - this.cx;
    const dist = Math.abs(dx);
    if (this.state !== 'dash' && this.state !== 'leap' && this.state !== 'stagger') {
      this.facing = dx > 0 ? 1 : -1;
    }

    this.timer -= dt;
    this.vy = Math.min(760, this.vy + 1800 * dt);

    switch (this.state) {
      case 'intro': {
        this.vx = 0;
        this.targetSwordAngle = -1.8;
        if (this.timer <= 0) {
          this.state = 'idle';
          this.timer = 0.4;
        }
        break;
      }
      case 'idle': {
        this.vx = approach(this.vx, 0, 700 * dt);
        this.targetSwordAngle = -0.5;
        if (this.timer <= 0) this.chooseAction(dist);
        break;
      }
      case 'walk': {
        const speed = this.phase === 3 ? 128 : this.phase === 2 ? 106 : 88;
        this.vx = approach(this.vx, this.facing * speed, 900 * dt);
        this.targetSwordAngle = -0.5 + Math.sin(this.anim * 6) * 0.12;
        if (this.timer <= 0 || dist < 78) {
          this.state = 'idle';
          this.timer = this.phase === 3 ? 0.3 : 0.42;
        }
        break;
      }
      case 'slamWindup': {
        this.vx = approach(this.vx, 0, 1400 * dt);
        this.targetSwordAngle = -2.5;
        if (this.timer <= 0) {
          this.state = 'slam';
          this.timer = 0.42;
          this.hitPlayerThisAction = false;
          this.targetSwordAngle = 0.75;
          this.doSlam(world);
        }
        break;
      }
      case 'slam': {
        this.vx = approach(this.vx, 0, 2200 * dt);
        if (!this.hitPlayerThisAction) this.tryMeleeHit(world, this.slamRect(), 2);
        if (this.timer <= 0) {
          this.state = 'idle';
          this.timer = this.recovery(0.15);
        }
        break;
      }
      case 'dashWindup': {
        this.vx = approach(this.vx, -this.facing * 60, 900 * dt);
        this.targetSwordAngle = -1.9;
        if (this.timer <= 0) {
          this.state = 'dash';
          this.timer = 0.55;
          this.hitPlayerThisAction = false;
          this.targetSwordAngle = 0.1;
          audio.play('swing', 0.6);
        }
        break;
      }
      case 'dash': {
        this.vx = this.facing * (this.phase === 3 ? 620 : 520);
        if (!this.hitPlayerThisAction) this.tryMeleeHit(world, this.dashRect(), 2);
        world.particles.spawn({
          x: this.cx - this.facing * 20 + rand(-8, 8),
          y: this.cy + rand(-30, 34),
          vx: -this.facing * rand(40, 120),
          vy: rand(-30, 10),
          color: 'rgba(180,50,50,0.5)',
          gravity: -40,
          size: rand(3, 6),
          life: 0.4,
          shape: 'circle',
        });
        if (this.timer <= 0 || this.touching.left || this.touching.right) {
          if (this.touching.left || this.touching.right) {
            world.camera.addShake(7);
            world.particles.burst(this.facing > 0 ? this.x + this.w : this.x, this.cy, 18, '#c8b9a0', { speed: 220 });
          }
          this.state = 'idle';
          this.timer = this.recovery(this.touching.left || this.touching.right ? 0.25 : 0.1);
        }
        break;
      }
      case 'cast': {
        this.vx = approach(this.vx, 0, 1200 * dt);
        this.targetSwordAngle = -2.2;
        if (this.timer <= 0) {
          this.castOrbs(world);
          this.state = 'idle';
          this.timer = this.recovery();
        }
        break;
      }
      case 'summon': {
        this.vx = approach(this.vx, 0, 1200 * dt);
        this.targetSwordAngle = -2.6;
        if (this.timer <= 0) {
          this.summonMinions(world);
          this.state = 'idle';
          this.timer = this.recovery(0.1);
        }
        break;
      }
      case 'leap': {
        this.targetSwordAngle = -2.2;
        if (!this.hitPlayerThisAction) this.tryMeleeHit(world, this.rect, 2);
        if (this.onGround && this.vy >= 0 && this.timer < 0.55) {
          this.doGroundPound(world);
          this.state = 'idle';
          this.timer = this.recovery(0.25);
        } else if (this.timer <= -1.6) {
          this.state = 'idle';
          this.timer = this.recovery();
        }
        break;
      }
      case 'stagger': {
        this.vx = approach(this.vx, 0, 500 * dt);
        this.targetSwordAngle = 1.2;
        if (Math.random() < 0.25) {
          world.particles.spawn({
            x: this.cx + rand(-20, 20),
            y: this.y + rand(0, 30),
            vx: rand(-30, 30),
            vy: -rand(20, 50),
            color: 'rgba(255,220,140,0.8)',
            gravity: -30,
            size: 3,
            life: 0.5,
            shape: 'circle',
          });
        }
        if (this.timer <= 0) {
          this.state = 'idle';
          this.timer = 0.45;
        }
        break;
      }
      default:
        break;
    }

    this.moveAndCollide(world.level, dt);
    this.guardBlade(world);

    // Contact damage while charging around.
    if ((this.state === 'dash' || this.state === 'leap') && !this.hitPlayerThisAction) {
      this.tryMeleeHit(world, this.rect, 2);
    }
  }

  /**
   * A knight with a greatsword, and a crescent of light coming at him: while he
   * is not committed to anything, he bats it out of the air.
   *
   * Measured, this is why the fight needed it. A hero with the upgraded blade
   * who stood 250 px away - well outside everything the knight can reach - and
   * simply swung, put 99 crescents into him and took his whole health bar off
   * in under thirty seconds without ever being in danger. More health only made
   * that longer, which is not the same as harder.
   *
   * It is not a wall, and it is not meant to retire the upgrade:
   *
   *   - only what comes at his front; a crescent thrown at his back lands,
   *   - never while he is committed to a move or reeling - dash, slam, leap and
   *     benommen are all open,
   *   - and at most once every GUARD_REST seconds, which is only there so two
   *     crescents in one moment do not throw two sparks.
   *
   * Which is the rule the rest of the fight already runs on: hit him when he is
   * open, not whenever you like. Roughly a quarter of the fight is his
   * committed frames, so roughly a quarter of a kiting player's crescents land
   * - and to raise that share he has to come close enough to read them.
   */
  private guardBlade(world: World): void {
    if (this.guardLock > 0 || this.dead) return;
    const committed =
      this.state === 'dash' ||
      this.state === 'slam' ||
      this.state === 'leap' ||
      this.state === 'stagger' ||
      this.state === 'intro' ||
      this.state === 'dormant' ||
      this.state === 'dying';
    if (committed) return;
    const box = {
      x: this.facing > 0 ? this.x + this.w - 8 : this.x - 42,
      y: this.y + 6,
      w: 50,
      h: this.h - 10,
    };
    for (const p of world.projectiles) {
      if (p.dead || !p.friendly || p.kind !== 'beam') continue;
      // Coming the same way he faces means it is coming from behind him.
      if (Math.sign(p.vx) === this.facing) continue;
      if (!p.overlaps(box)) continue;
      p.dead = true;
      this.guardLock = GUARD_REST;
      this.guardFlash = 1;
      this.targetSwordAngle = -1.15;
      audio.play('parry', 0.85);
      world.particles.burst(p.cx, p.cy, 16, '#ffe6a8', { speed: 200, shape: 'spark' });
      break;
    }
  }

  /**
   * Breathing room after an attack: the window the player can safely strike
   * in. A full three-hit combo takes 0.9s, so anything shorter leaves them
   * nothing to do but dodge.
   */
  private recovery(extra = 0): number {
    const base = this.phase === 3 ? 0.8 : this.phase === 2 ? 0.9 : 1.05;
    return base + extra;
  }

  private chooseAction(dist: number): void {
    const phase = this.phase;
    const options: string[] = [];
    // Twice as likely to close the gap as to walk it: a player who parks at the
    // far end and chips away has to be reached, not followed.
    if (dist > 150) options.push('dash', 'dash', 'walk');
    if (dist <= 150) options.push('slam', 'slam', 'dash');
    // And from far away he answers with something thrown, in every phase. He
    // used to have nothing at all for that range before his second: a hero at
    // 250 px in the first phase was in no danger whatsoever.
    if (dist > 200) options.push('cast');
    if (phase >= 2) options.push('cast');
    if (phase >= 2 && dist > 110 && this.livingMinions() < MAX_MINIONS) options.push('summon');
    if (phase >= 3) options.push('leap', 'cast', 'slam');
    // Avoid repeating the same move twice in a row.
    const filtered = options.filter((o) => o !== this.lastAction);
    const pick = (filtered.length ? filtered : options)[Math.floor(Math.random() * (filtered.length || options.length))];
    this.lastAction = pick;

    switch (pick) {
      case 'walk':
        this.state = 'walk';
        this.timer = rand(0.6, 1.3);
        break;
      case 'slam':
        this.state = 'slamWindup';
        this.timer = phase === 3 ? 0.52 : 0.62;
        this.provoked = false;
        break;
      case 'dash':
        this.state = 'dashWindup';
        this.timer = phase === 3 ? 0.44 : 0.5;
        this.provoked = false;
        break;
      case 'cast':
        this.state = 'cast';
        this.timer = 0.55;
        break;
      case 'summon':
        this.state = 'summon';
        this.timer = 0.7;
        break;
      case 'leap':
        this.state = 'leap';
        this.timer = 1.1;
        this.hitPlayerThisAction = false;
        this.vy = -720;
        this.vx = this.facing * 240;
        audio.play('jump', 0.5);
        break;
      default:
        this.state = 'idle';
        this.timer = 0.4;
    }
  }

  private slamRect(): Rect {
    return {
      x: this.facing > 0 ? this.x + this.w - 14 : this.x - 74,
      y: this.y + 20,
      w: 88,
      h: this.h - 14,
    };
  }

  private dashRect(): Rect {
    return { x: this.x - 10, y: this.y + 6, w: this.w + 20, h: this.h - 6 };
  }

  private tryMeleeHit(world: World, box: Rect, damage: number): void {
    const p = world.player;
    if (p.dead || p.isInvulnerable) return;
    if (!p.overlaps(box)) return;
    this.hitPlayerThisAction = true;
    p.hurt(damage, this.facing, world);
  }

  private doSlam(world: World): void {
    audio.play('impactKnight');
    world.camera.addShake(10);
    const groundY = this.bottom;
    world.particles.burst(this.cx + this.facing * 40, groundY, 26, '#c8b9a0', {
      speed: 240,
      gravity: 620,
      angle: -Math.PI / 2,
      spread: Math.PI * 0.9,
      size: 4,
    });
    const count = this.phase === 3 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const speed = 250 + i * 70;
      const wave = new Projectile('shockwave', this.cx + this.facing * 40, groundY - 30, this.facing * speed, 0);
      world.spawnProjectile(wave);
      if (this.phase >= 2) {
        const back = new Projectile('shockwave', this.cx - this.facing * 40, groundY - 30, -this.facing * speed, 0);
        world.spawnProjectile(back);
      }
    }
  }

  private doGroundPound(world: World): void {
    audio.play('impactKnight', 0.8);
    world.camera.addShake(13);
    world.particles.burst(this.cx, this.bottom, 40, '#c8b9a0', {
      speed: 300,
      gravity: 700,
      angle: -Math.PI / 2,
      spread: Math.PI,
      size: 5,
    });
    for (const dir of [-1, 1]) {
      world.spawnProjectile(new Projectile('shockwave', this.cx + dir * 30, this.bottom - 30, dir * 290, 0));
    }
    // Debris rains from the ceiling.
    for (let i = 0; i < 5; i++) {
      const x = world.player.cx + rand(-190, 190);
      world.spawnProjectile(new Projectile('rock', x, this.y - 220 - i * 34, rand(-20, 20), 60));
    }
  }

  private castOrbs(world: World): void {
    audio.play('shoot', 0.7);
    const count = this.phase === 3 ? 5 : 3;
    const player = world.player;
    const baseAngle = Math.atan2(player.cy - (this.cy - 10), player.cx - this.cx);
    for (let i = 0; i < count; i++) {
      const spread = 0.62;
      const a = baseAngle + (i - (count - 1) / 2) * (spread / Math.max(1, count - 1)) * 2;
      const speed = 210;
      world.spawnProjectile(
        new Projectile('orb', this.cx - 7, this.cy - 18, Math.cos(a) * speed, Math.sin(a) * speed),
      );
    }
    world.particles.burst(this.cx, this.cy - 16, 18, '#d46bf0', { speed: 160, gravity: -40, shape: 'circle' });
  }

  private summonMinions(world: World): void {
    const room = MAX_MINIONS - this.livingMinions();
    if (room <= 0) return;

    audio.play('bossRoar', 1.6);
    // With only one slot left the knight raises it on the side he faces.
    const dirs = room >= 2 ? [-1, 1] : [this.facing];
    for (const dir of dirs) {
      const x = clamp(this.cx + dir * 150, 40, world.level.pixelWidth - 60);
      const skeleton = new Skeleton(x, this.bottom - 34);
      skeleton.active = true;
      this.minions.push(skeleton);
      world.spawnEnemy(skeleton);
      world.particles.burst(x + 11, this.bottom - 8, 24, '#7a4fb5', { speed: 170, gravity: -120, shape: 'circle' });
    }
    world.particles.text(this.cx, this.y - 16, 'GEFOLGE!', '#c98bff');
  }

  /* ------------------------------------------------------------- drawing */

  /*
   * Drawn for the grid (knight-art.ts): a body sprite per pose - at rest with
   * a breath, four steps of a walk, the sword raised, crouched to charge,
   * bent into the slam, the charge itself, the leap, two sways of reeling, on
   * one knee as he falls - with a cape in four tattered frames; two arms of
   * two segments each from the shoulders to the grip; the greatsword at 32
   * drawn angles. His aura and his eyes are lights (glow() only registers a
   * light now); struck, he is white for two frames; felled, he sinks to a
   * knee and burns away from the crown down.
   */
  draw(ctx: CanvasRenderingContext2D): void {
    if (this.dead) return;
    const fade = this.state === 'dying' ? clamp(this.deathTimer / 2.6, 0, 1) : 1;
    shadow(ctx, this.cx, this.bottom + 2, this.w * 1.1, 0.4 * fade);
    // The dark aura, stronger in later phases: a light, not paint.
    const aura = this.phase === 3 ? 0.5 : this.phase === 2 ? 0.32 : 0.2;
    glow(ctx, this.cx, this.cy, 70 + Math.sin(this.auraPulse) * 8, `rgba(200,40,40,${(aura * fade).toFixed(3)})`);

    const bounds = { x: this.cx - 130, y: this.bottom - 150, w: 260, h: 156 };
    if (fade < 0.55) {
      // Burning away from the crown down, a white-hot row along the edge.
      const top = Math.floor((this.bottom - 132 * (fade / 0.55)) / ART) * ART;
      ctx.save();
      ctx.beginPath();
      ctx.rect(this.cx - 140, top, 280, this.bottom - top + 8);
      ctx.clip();
      this.drawKnight(ctx);
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.rect(this.cx - 140, top, 280, ART);
      ctx.clip();
      withHitFlash(ctx, 1, (c) => this.drawKnight(c), bounds);
      ctx.restore();
    } else {
      withHitFlash(ctx, solidFlash(this.flash), (c) => this.drawKnight(c), bounds);
    }

    if (this.state === 'slamWindup' || this.state === 'dashWindup') {
      // Where it will land, marked on the grid so the fight stays readable.
      const t = 1 - clamp(this.timer / 0.62, 0, 1);
      const box = this.state === 'slamWindup' ? this.slamRect() : { x: this.x + this.facing * 150, y: this.y, w: this.w, h: this.h };
      dashedRect(ctx, box.x, box.y, box.w, box.h, t > 0.5 ? BLOOD[3] : BLOOD[2], Math.floor(this.anim * 12));
    }
    if (this.state === 'dash') {
      // The cut he carries in front of him, as two bands of red.
      const a = this.facing > 0 ? 0 : Math.PI;
      sector(ctx, this.cx, this.cy, 64, 72, a - 0.9, a + 0.9, BLOOD[3]);
      sector(ctx, this.cx, this.cy, 58, 64, a - 0.75, a + 0.75, BLOOD[2]);
    }
  }

  /** His pose and frame, from what he is doing. */
  private knightLook(): KnightLook {
    const st = this.state;
    let pose: KnightPose = 'stand';
    let frame = Math.floor(this.anim * 1.4) & 1;
    if (st === 'walk') {
      pose = 'walk';
      frame = Math.floor(this.anim * 8) & 3;
    } else if (st === 'slamWindup' || st === 'summon' || st === 'cast' || st === 'intro') pose = 'raise';
    else if (st === 'dashWindup') pose = 'crouch';
    else if (st === 'slam') pose = 'strike';
    else if (st === 'dash') pose = 'charge';
    else if (st === 'leap') pose = 'air';
    else if (st === 'stagger') {
      pose = 'reel';
      frame = Math.sin(this.anim * 22) > 0 ? 1 : 0;
    } else if (st === 'dying') pose = 'kneel';
    return { pose, frame, cape: Math.floor(this.anim * 6) & 3 };
  }

  private drawKnight(ctx: CanvasRenderingContext2D): void {
    const look = this.knightLook();
    const f = this.facing;
    const flip = f < 0;
    const bx = Math.floor(this.cx / ART) * ART + ART / 2;
    const by = Math.floor((this.bottom - 1) / ART) * ART + ART / 2;
    const at = (x: number, y: number): [number, number] => [bx + f * x, by + y];
    // The sword: where the hands hold it - at the hip, or up at the shoulder
    // when it is raised - and which way it points.
    const a = this.state === 'dying' ? 1.2 : this.swordAngle;
    const u = clamp((-1.2 - a) / 1.2, 0, 1);
    const px = 18 - 8 * u;
    const py = -42 - 38 * u;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const step = angleStep(a, SWORD_STEPS);
    const sword = swordPart(step, this.phase === 3 ? 1 : 0, this.guardFlash > 0.35);
    const behind = a < -1.2;
    const [sfar, snear] = shouldersOf(look);
    const arm = (s: [number, number], hx: number, hy: number, far: boolean): void => {
      const [ex, ey] = elbowOf(s[0], s[1], hx, hy);
      const [ax, ay] = at(s[0], s[1]);
      const [cx, cy] = at(ex, ey);
      blit(ctx, armPart('upper', angleStep(Math.atan2(ey - s[1], ex - s[0]), SWORD_STEPS), far), ax, ay, flip);
      blit(ctx, armPart('fore', angleStep(Math.atan2(hy - ey, hx - ex), SWORD_STEPS), far), cx, cy, flip);
    };
    const [wx, wy] = at(px, py);
    if (behind) blit(ctx, sword, wx, wy, flip);
    arm(sfar, px - dx * 13, py - dy * 13, true);
    blit(ctx, knightBody(look), bx, by, flip);
    // The eyes in the slot - dim while he reels - and the gem on his breast.
    const [ex, ey] = eyesAt(look);
    const eye = this.state === 'stagger' ? BLOOD[1] : BLOOD[3];
    for (const o of [-5, 6]) {
      const [x, y] = at(ex + o, ey);
      rect(ctx, x - 2, y - 1, 4, 2, eye);
      glow(ctx, x, y, 10, 'rgba(255,70,50,0.5)');
    }
    const winding = this.state === 'slamWindup' || this.state === 'dashWindup' || this.state === 'cast' || this.state === 'summon';
    const gem = gemSprite(this.phase === 3 ? 2 : winding ? 1 : 0);
    const [gx, gy] = at(gemAt(look)[0], gemAt(look)[1]);
    gem.draw(ctx, gx - (gem.w * ART) / 2, gy - (gem.h * ART) / 2);
    if (!behind) blit(ctx, sword, wx, wy, flip);
    arm(snear, px - dx * 4, py - dy * 4, false);
  }
}

/** A rectangle's outline in dashes on whole art pixels, the dashes running round it with `phase`. */
function dashedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, phase: number): void {
  const x0 = Math.round(x / ART);
  const y0 = Math.round(y / ART);
  const x1 = Math.round((x + w) / ART) - 1;
  const y1 = Math.round((y + h) / ART) - 1;
  ctx.fillStyle = color;
  let i = phase;
  const put = (px: number, py: number): void => {
    if (i++ % 5 < 3) ctx.fillRect(px * ART, py * ART, ART, ART);
  };
  for (let px = x0; px <= x1; px++) put(px, y0);
  for (let py = y0 + 1; py <= y1; py++) put(x1, py);
  for (let px = x1 - 1; px >= x0; px--) put(px, y1);
  for (let py = y1 - 1; py > y0; py--) put(x0, py);
}
