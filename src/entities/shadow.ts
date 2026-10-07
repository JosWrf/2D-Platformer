import { audio } from '../core/audio';
import { Input, type Action } from '../core/input';
import { Rect, clamp, rand, rectsOverlap, sign } from '../core/math';
import { glow } from '../render/sprites';
import type { Boss } from './boss';
import type { World } from '../world/context';
import { Enemy, type EnemyKind, type GlowLight } from './enemy';
import { Player } from './player';
import { Projectile } from './projectile';
import { SILK_REGROW } from './relics';

/** Health per heart the hero has: the shadow is as hardy as he is. */
const HP_PER_HEART = 5;
/** Damage it takes between two of its own moves before it reels. */
const SHADOW_POISE = 7;
/** How long a reel lasts, from a broken poise and from a parry. */
const REEL = 0.9;
const PARRIED_REEL = 1.15;

type ShadowState = 'dormant' | 'rise' | 'duel' | 'reel' | 'fade' | 'dying';

/** What the shadow's hands are doing this frame. */
type Plan = 'stalk' | 'windup' | 'combo' | 'riposte' | 'charge' | 'leap' | 'volley' | 'recover' | 'guard' | 'roll' | 'step';

const ACTIONS: Action[] = ['left', 'right', 'jump', 'attack', 'parry', 'dash', 'down'];

/**
 * The world the shadow's body lives in. Its own blade has nothing in it to cut
 * - the shadow decides for itself what its sword lands on - and anything it
 * throws comes out on the other side: hostile, and in its colours.
 */
class Mirror implements World {
  readonly enemies: Enemy[] = [];
  readonly projectiles: Projectile[] = [];
  boss: Boss | null = null;

  constructor(private readonly real: World) {}

  get level(): World['level'] {
    return this.real.level;
  }
  get particles(): World['particles'] {
    return this.real.particles;
  }
  get camera(): World['camera'] {
    return this.real.camera;
  }
  get player(): World['player'] {
    return this.real.player;
  }
  get time(): number {
    return this.real.time;
  }
  hitStop(): void {
    // Its swings must not freeze the hero's world.
  }
  addScore(): void {}
  spawnEnemy(): void {}
  spawnProjectile(projectile: Projectile): void {
    projectile.friendly = false;
    projectile.dark = true;
    projectile.water = false;
    this.real.spawnProjectile(projectile);
  }
  onBossDefeated(): void {}
  onBossEngaged(): void {}
  onCrystalBossDefeated(): void {}
  onDrownedCrownDefeated(): void {}
  onMireBossDefeated(): void {}
  onHydraEngaged(): void {}
  onHydraNeckCut(): void {}
  onHydraNeckSealed(): void {}
  onHydraDefeated(): void {}
  onBossFelled(kind: EnemyKind, x: number, y: number): void {
    void kind;
    void x;
    void y;
  }
}

/**
 * Umbra, dein Schatten - what the rift makes of the hero when he walks into it:
 * his own shape, his own blade, and everything he has taken from the others.
 *
 * It is a real hero's body, driven by a mind instead of a keyboard, so it moves
 * the way he moves and swings the way he swings - the same combo, the same
 * charge ring, the same roll. And it carries his relics: the crescent if his
 * blade throws one, the quake if Ankhor's fist is his, the silk, the second
 * roll, Ignivor's ember in the heavy swings. The stronger he has become, the
 * stronger the thing he has to beat. That is the whole of this fight's answer
 * to a hero who has collected everything.
 *
 * What it does not have is patience, and what it reads is the hero's:
 *
 *   - A blade swung at it without a reason gets parried. Every swing in quick
 *     succession makes the next parry more likely; a hero who holds the attack
 *     key is turned aside again and again and answered each time.
 *   - Its own attacks are the windows. After its combo, after its heavy
 *     strike, after a roll it stands for a breath - and a parry of its blow
 *     staggers it like it staggers anything else.
 *   - From half health on it steps through the dark: it sinks into the floor
 *     and rises behind the hero, blade first. The pool it rises from shows a
 *     moment early.
 */
export class Shadow extends Enemy {
  private state: ShadowState = 'dormant';
  private timer = 0;
  private readonly body: Player;
  private readonly hands = new Input();
  private mirror: Mirror | null = null;
  private plan: Plan = 'stalk';
  private planTimer = 0;
  private presses = 0;
  private wasDown = new Set<Action>();
  private lastHeroSwing = 0;
  private heroSwings: number[] = [];
  /** True on the frame his blade starts to move. */
  private heroSwingFresh = false;
  private lastHit = -1;
  private poise = SHADOW_POISE;
  private poiseMax = SHADOW_POISE;
  private phaseTwo = false;
  /** Where it will rise when it steps through the dark. */
  private stepX = 0;
  private stepTimer = 0;
  private shieldUp = false;
  private shieldTimer = 0;
  private arenaLeft = 0;
  private arenaRight = 0;
  private floorY = 0;
  private readonly layer: HTMLCanvasElement;
  private readonly layerCtx: CanvasRenderingContext2D;
  private readonly rim: HTMLCanvasElement;
  private readonly rimCtx: CanvasRenderingContext2D;
  /** How much of it is there: it rises out of a pool and goes back into one. */
  private presence = 0;
  private stepAttack = false;
  /** The swing that answers a parry, which cuts as hard as a finisher. */
  private riposteSwing = -1;
  /** Its eyes, which flare before it commits. */
  private flare = 0;

  override castLight = false;

  constructor(x: number, y: number) {
    super('shadow', x, y);
    this.w = 18;
    this.h = 30;
    this.hp = this.maxHp = 42;
    this.scoreValue = 1400;
    this.aggroRange = 360;
    this.contactDamage = 0;
    this.body = new Player(x, y);
    this.body.facing = -1;
    this.layer = document.createElement('canvas');
    this.layer.width = 220;
    this.layer.height = 170;
    this.layerCtx = this.layer.getContext('2d') as CanvasRenderingContext2D;
    this.rim = document.createElement('canvas');
    this.rim.width = 220;
    this.rim.height = 170;
    this.rimCtx = this.rim.getContext('2d') as CanvasRenderingContext2D;
  }

  get phase(): 1 | 2 {
    return this.phaseTwo ? 2 : 1;
  }

  override barName(): string {
    return 'UMBRA   ·   DEIN SCHATTEN';
  }

  override barPhase(): number {
    return this.phase;
  }

  protected override deathColor(): string {
    return '#8a4cff';
  }

  /* ------------------------------------------------------------ targeting */

  override overlaps(r: Rect): boolean {
    if (this.state === 'dormant' || this.state === 'rise' || this.state === 'dying' || this.state === 'fade') return false;
    return rectsOverlap(this.body.rect, r);
  }

  override hurt(amount: number, fromDir: number, world: World): void {
    if (this.dead || this.state === 'dormant' || this.state === 'rise' || this.state === 'dying' || this.state === 'fade') return;
    const b = this.body;
    // Rolling, it is not there to be hit: the same roll the hero has.
    if (b.isDashing) return;
    // Its guard, if the blow comes into it.
    if (b.parryTimer > 0 && b.facing === -sign(fromDir || -b.facing)) {
      this.turnAside(world, fromDir);
      return;
    }
    if (this.shieldUp) {
      this.shieldUp = false;
      this.shieldTimer = SILK_REGROW;
      audio.play('clank', 1.5);
      world.particles.burst(b.cx, b.cy, 14, 'rgba(170,140,230,0.9)', { speed: 180, gravity: 120, shape: 'spark' });
      return;
    }
    this.shieldTimer = SILK_REGROW;
    this.hp -= amount;
    this.flash = 1;
    b.flash = 1;
    this.poise -= amount;
    audio.play('bossHit', 1.35);
    world.particles.burst(b.cx, b.cy, 10, '#8a4cff', { speed: 170, gravity: 300 });
    if (this.hp <= 0) {
      this.beginDying(world);
      return;
    }
    if (!this.phaseTwo && this.hp <= this.maxHp / 2) {
      this.phaseTwo = true;
      audio.play('phase', 0.9);
      world.camera.addShake(6);
      world.particles.burst(b.cx, b.cy, 30, '#b48cff', { speed: 240, gravity: -40, shape: 'spark' });
      // A heavier blade with it: the crescent whether he throws one or not.
      if (b.beamTier < 1) b.beamTier = 1;
    }
    if (this.poise <= 0 && this.poiseLock <= 0) this.reel(world, fromDir, REEL);
  }

  /** The hero parried its blow: it staggers, like anything else would. */
  override onParried(world: World): void {
    if (this.dead || this.state !== 'duel') return;
    this.reel(world, -this.body.facing, PARRIED_REEL);
  }

  /** It read the swing coming and turned it, and the hero pays for it. */
  private turnAside(world: World, fromDir: number): void {
    const b = this.body;
    const p = world.player;
    b.parryTimer = 0;
    b.parryFlash = 1;
    audio.play('parry', 0.85);
    audio.play('hit', 1.2);
    world.hitStop(0.1);
    world.camera.addShake(5);
    world.particles.text(b.cx, b.y - 14, 'PARIERT!', '#c9b8ff');
    world.particles.burst(b.cx - fromDir * 14, b.cy, 16, '#c9b8ff', { speed: 200, gravity: 120, shape: 'spark' });
    // His blade knocked out of line and him off his feet, for long enough
    // that the answer lands: it is a riposte, not a trade.
    p.hurtTimer = Math.max(p.hurtTimer, 0.62);
    p.attackTimer = 0;
    p.chargeTimer = 0;
    p.chargeReady = false;
    p.vx = fromDir * -110;
    p.vy = -120;
    this.setPlan('riposte', 0.6);
  }

  private reel(world: World, fromDir: number, seconds: number): void {
    const b = this.body;
    this.state = 'reel';
    this.timer = seconds;
    this.poise = this.poiseMax;
    this.poiseLock = seconds + 1.4;
    b.hurtTimer = seconds;
    b.attackTimer = 0;
    b.chargeTimer = 0;
    b.chargeReady = false;
    b.vx = fromDir * 200;
    b.vy = -180;
    audio.play('screech', 1.8);
    world.particles.text(b.cx, b.y - 18, 'ER WANKT!', '#d9ccff');
  }

  private beginDying(world: World): void {
    this.hp = 0;
    this.state = 'dying';
    this.timer = 2.2;
    this.body.attackTimer = 0;
    audio.play('bossDown', 1.4);
    audio.play('phase', 0.6);
    world.camera.addShake(7);
    world.hitStop(0.14);
  }

  /* --------------------------------------------------------------- update */

  override update(dt: number, world: World): void {
    this.updateCommon(dt);
    const p = world.player;
    const b = this.body;
    if (this.floorY === 0) {
      this.floorY = this.bottom;
      const arena = world.level.arenaAt(this.cx);
      this.arenaLeft = arena ? arena.left : this.cx - 560;
      this.arenaRight = arena ? arena.right : this.cx + 560;
      b.x = this.x;
      b.y = this.floorY - b.h;
    }
    const mirror = this.mirror ?? this.makeMirror(world);

    switch (this.state) {
      case 'dormant': {
        // A pool of dark on the floor, the shape of a man lying in it.
        const inside = p.cx > this.arenaLeft + 16 && p.cx < this.arenaRight - 16;
        if (inside && Math.abs(p.cx - b.cx) < this.aggroRange && !p.dead) this.wake(world);
        this.sync();
        return;
      }

      case 'rise':
        this.timer -= dt;
        this.presence = clamp(1 - this.timer / 1.4, 0, 1);
        b.facing = p.cx > b.cx ? 1 : -1;
        this.drive(dt, mirror, {});
        if (this.timer <= 0) {
          this.state = 'duel';
          this.presence = 1;
          this.setPlan('stalk', 0.5);
          audio.play('bossRoar', 1.6);
        }
        this.sync();
        return;

      case 'dying':
        this.timer -= dt;
        this.presence = clamp(this.timer / 2.2, 0, 1);
        this.drive(dt, mirror, {});
        if (Math.random() < 0.6) {
          world.particles.spawn({
            x: b.cx + rand(-12, 12),
            y: b.cy + rand(-16, 16),
            vx: rand(-30, 30),
            vy: -rand(30, 100),
            gravity: -30,
            color: Math.random() < 0.5 ? 'rgba(120,70,220,0.7)' : 'rgba(30,14,50,0.8)',
            size: rand(2, 4.5),
            life: 0.9,
            shape: 'circle',
          });
        }
        if (this.timer <= 0) {
          this.die(world);
          world.onBossFelled('shadow', b.cx, b.y - 20);
        }
        this.sync();
        return;

      case 'reel':
        this.timer -= dt;
        this.drive(dt, mirror, {});
        if (this.timer <= 0) {
          this.state = 'duel';
          this.setPlan('stalk', 0.25);
        }
        this.sync();
        return;

      case 'fade':
        this.updateFade(dt, world, mirror);
        this.sync();
        return;

      case 'duel':
        break;
    }

    // The silk, if he wears it: its own, grown back the way his does.
    if (b.relics.has('seidenmantel') && !this.shieldUp) {
      this.shieldTimer -= dt;
      if (this.shieldTimer <= 0) this.shieldUp = true;
    }
    this.flare = Math.max(0, this.flare - dt * 3);
    this.watchHero(world);
    const actions = this.think(dt, world);
    this.drive(dt, mirror, actions);
    this.strike(world);
    this.sync();
  }

  private makeMirror(world: World): Mirror {
    this.mirror = new Mirror(world);
    return this.mirror;
  }

  private wake(world: World): void {
    const p = world.player;
    const b = this.body;
    this.engaged = true;
    // His hearts, as its health; then the same stock every boss takes of the
    // relics he carries.
    this.maxHp = this.hp = HP_PER_HEART * p.maxHp;
    this.poise = this.poiseMax = this.sizeUpFor(world, SHADOW_POISE);
    for (const r of p.relics) b.relics.add(r);
    b.beamTier = p.beamTier;
    b.maxHp = b.hp = 999;
    this.shieldUp = b.relics.has('seidenmantel');
    this.state = 'rise';
    this.timer = 1.4;
    audio.play('rumble', 1.5);
    audio.play('magic', 0.5);
    world.camera.addShake(4);
  }

  /** The hero's swings, counted: what the shadow reads him by. */
  private watchHero(world: World): void {
    const p = world.player;
    const t = world.time;
    this.heroSwingFresh = false;
    if (p.swingId !== this.lastHeroSwing) {
      this.lastHeroSwing = p.swingId;
      this.heroSwings.push(t);
      this.heroSwingFresh = true;
      this.onHeroSwing(world);
    }
    this.heroSwings = this.heroSwings.filter((s) => t - s < 1.6);
  }

  /**
   * He swung. If the shadow is free and in reach it may turn the blow - the
   * more he has been swinging, the likelier. It never guards out of a move of
   * its own: committed is committed, for it as for him.
   */
  private onHeroSwing(world: World): void {
    const p = world.player;
    const b = this.body;
    const free =
      (this.plan === 'stalk' || this.plan === 'guard') && !b.isAttacking && !b.isDashing && b.chargeTimer <= 0 && b.hurtTimer <= 0;
    if (!free) return;
    const dist = Math.abs(p.cx - b.cx);
    if (dist > 80 || Math.abs(p.cy - b.cy) > 50) return;
    // One swing in a while might be a reading; three in a breath is a habit,
    // and a habit is what it was made from.
    const mash = Math.max(0, this.heroSwings.length - 1);
    const chance = Math.min(0.78, (this.phaseTwo ? 0.32 : 0.22) + mash * 0.22);
    if (Math.random() < chance) this.setPlan('guard', 0.3);
  }

  /** He is in reach and swinging: it waits for the blow instead of trading. */
  private get heroIsMashing(): boolean {
    return this.heroSwings.length >= 2;
  }

  private setPlan(plan: Plan, seconds: number): void {
    this.plan = plan;
    this.planTimer = seconds;
    this.presses = 0;
  }

  /** Decides what its hands do this frame. */
  private think(dt: number, world: World): Partial<Record<Action, boolean>> {
    const p = world.player;
    const b = this.body;
    const dx = p.cx - b.cx;
    const dist = Math.abs(dx);
    const toward: Action = dx > 0 ? 'right' : 'left';
    const away: Action = dx > 0 ? 'left' : 'right';
    const a: Partial<Record<Action, boolean>> = {};
    const haste = this.phaseTwo ? 0.8 : 1;
    this.planTimer -= dt;

    // Something of his coming at it along the floor or through the air -
    // from out of reach; up close it is the blade that matters.
    if ((this.plan === 'stalk' || this.plan === 'recover') && dist > 90) {
      for (const q of world.projectiles) {
        if (!q.friendly || q.dead) continue;
        const qdx = b.cx - q.cx;
        if (Math.abs(qdx) > 150 || Math.sign(q.vx) !== Math.sign(qdx) || Math.abs(q.cy - b.cy) > 50) continue;
        if (q.kind === 'quake') this.setPlan('leap', 0.5);
        else if (Math.random() < 0.5) this.setPlan('roll', 0.2);
        break;
      }
      // His heavy strike, wound up and close: out of its way.
      if (this.plan === 'stalk' && p.chargeReady && dist < 90 && Math.random() < dt * 4) this.setPlan('roll', 0.2);
    }

    switch (this.plan) {
      case 'stalk': {
        // Keep a sword's length and a bit, facing him; climb to him if he is up.
        if (dist > 64) a[toward] = true;
        else if (dist < 34) a[away] = true;
        else b.facing = dx > 0 ? 1 : -1;
        if (p.bottom < b.bottom - 50 && dist < 140 && b.onGround) a.jump = true;
        if (this.planTimer <= 0) this.choose(world, dist, haste);
        break;
      }
      case 'windup':
        // The tell before its combo: it sets its feet, and its eyes flare.
        // His own combo has no warning at all; a mirror that hit as fast as
        // he does with nothing to read first would be a coin toss.
        b.facing = dx > 0 ? 1 : -1;
        this.flare = 1;
        if (this.planTimer <= 0) this.setPlan('combo', 1);
        break;
      case 'riposte':
        // One hard cut straight out of the guard, and the guard back up. A
        // riposte that ended in a pause would hand the masher the pause.
        b.facing = dx > 0 ? 1 : -1;
        if (dist > 40) a[toward] = true;
        if (this.presses === 0 && !this.wasDown.has('attack')) {
          a.attack = true;
          this.presses = 1;
          this.riposteSwing = b.swingId + 1;
        }
        if (this.presses > 0 && b.attackTimer <= 0) this.setPlan(this.heroIsMashing ? 'guard' : 'stalk', 0.35);
        if (this.planTimer <= 0) this.setPlan('stalk', 0.2);
        break;
      case 'combo':
        // Three cuts, the same cadence he has: each press lands in the window
        // that queues the next swing.
        b.facing = dx > 0 ? 1 : -1;
        if (dist > 46) a[toward] = true;
        if (this.presses < 3 && (b.attackTimer <= 0 || b.attackTimer < 0.2) && !this.wasDown.has('attack')) {
          a.attack = true;
          this.presses++;
        }
        if (this.presses >= 3 && b.attackTimer <= 0) this.setPlan('recover', 0.65 * haste + 0.15);
        if (this.planTimer <= -1.5) this.setPlan('recover', 0.3);
        break;
      case 'charge':
        // A swing, then the blade held back until the ring closes - his own
        // tell - and loosed once it is close.
        b.facing = dx > 0 ? 1 : -1;
        a.attack = true;
        if (b.chargeReady) {
          if (dist > 52) a[toward] = true;
          else a.attack = false;
        } else if (dist < 40) {
          a[away] = true;
        }
        if (b.charged && b.attackTimer > 0) this.setPlan('recover', 0.8 * haste + 0.2);
        if (this.planTimer <= 0) this.setPlan('recover', 0.4);
        break;
      case 'leap':
        // Up, and down onto him blade first. `presses` marks that it has left
        // the ground, so landing ends the move instead of starting another.
        if (!b.onGround) this.presses = 1;
        a.jump = this.presses === 0 || b.vy < 0;
        if (dist > 20) a[toward] = true;
        if (!b.onGround && b.vy > -120 && dist < 70 && !this.wasDown.has('attack')) a.attack = true;
        if (this.presses === 1 && b.onGround && b.attackTimer <= 0) this.setPlan('recover', 0.5 * haste + 0.1);
        if (this.planTimer <= -1) this.setPlan('recover', 0.2);
        break;
      case 'volley':
        // Out of reach, it throws his own crescent back at him - standing,
        // facing him, the way he would.
        b.facing = dx > 0 ? 1 : -1;
        if (dist < 70) {
          this.setPlan('combo', 1);
          break;
        }
        if (this.presses < 2 && b.attackTimer <= 0 && !this.wasDown.has('attack')) {
          a.attack = true;
          this.presses++;
        }
        if (this.presses >= 2 && b.attackTimer <= 0) this.setPlan('recover', 0.4 * haste);
        break;
      case 'guard':
        // Squared up and waiting. The guard goes up the moment his blade
        // starts to move - see onHeroSwing - and not before, because a parry
        // held up at nothing is a parry spent.
        b.facing = dx > 0 ? 1 : -1;
        if (this.heroSwingFresh && !this.wasDown.has('parry') && b.parryTimer <= 0 && this.presses === 0) {
          a.parry = true;
          this.presses = 1;
        }
        if (this.planTimer <= 0) this.setPlan('stalk', 0.2);
        break;
      case 'roll':
        a[Math.random() < 0.6 ? away : toward] = true;
        if (!this.wasDown.has('dash') && this.presses === 0) {
          a.dash = true;
          this.presses = 1;
        }
        if (this.planTimer <= 0 && !b.isDashing) this.setPlan('recover', 0.25);
        break;
      case 'step':
        break;
      case 'recover':
        // Standing in its own follow-through: the window.
        if (this.planTimer <= 0) this.setPlan('stalk', rand(0.25, 0.55) * haste);
        break;
    }
    return a;
  }

  private choose(world: World, dist: number, haste: number): void {
    const p = world.player;
    const b = this.body;
    if (dist > 150) {
      // Too far for the blade: close in, or throw if it can.
      if (b.beamTier > 0 && Math.random() < 0.5) {
        this.setPlan('volley', 2);
        audio.play('tell', 1.5);
      } else {
        this.setPlan('stalk', 0.2);
      }
      return;
    }
    if (dist > 80) {
      this.setPlan('stalk', 0.15);
      return;
    }
    // A hero swinging away in its face gets its guard, not its blade: a trade
    // of blows is a fight he wins on hearts.
    if (this.heroIsMashing) {
      this.setPlan('guard', 0.45);
      return;
    }
    const roll = Math.random();
    if (this.phaseTwo && roll < 0.22) {
      this.beginFade(world);
      return;
    }
    if (roll < 0.55) {
      this.setPlan('windup', this.phaseTwo ? 0.3 : 0.38);
      audio.play('tell', 1.7);
    } else if (roll < 0.8) {
      this.setPlan('charge', 1.6);
    } else if (p.onGround) {
      this.setPlan('leap', 1);
    } else {
      this.setPlan('windup', this.phaseTwo ? 0.3 : 0.38);
      audio.play('tell', 1.7);
    }
    void haste;
  }

  /** Down into the floor, and up again behind him. */
  private beginFade(world: World): void {
    const p = world.player;
    this.state = 'fade';
    this.timer = 0.5;
    this.stepTimer = 0.42;
    this.stepAttack = false;
    this.stepX = clamp(p.cx - p.facing * 46, this.arenaLeft + 20, this.arenaRight - 20);
    this.setPlan('step', 1);
    audio.play('magic', 0.45);
  }

  private updateFade(dt: number, world: World, mirror: Mirror): void {
    const b = this.body;
    const p = world.player;
    this.timer -= dt;
    if (this.timer > 0) {
      // Sinking; the pool it will rise from shows already.
      this.presence = clamp(this.timer / 0.5, 0, 1);
      this.drive(dt, mirror, {});
      return;
    }
    if (!this.stepAttack) {
      this.stepAttack = true;
      b.x = this.stepX - b.w / 2;
      b.y = this.floorY - b.h;
      b.vx = 0;
      b.vy = 0;
      b.facing = p.cx > b.cx ? 1 : -1;
      audio.play('magic', 0.7);
    }
    this.stepTimer -= dt;
    this.presence = clamp(1 - this.stepTimer / 0.42, 0, 1);
    this.drive(dt, mirror, {});
    if (this.stepTimer <= 0) {
      this.state = 'duel';
      this.presence = 1;
      this.setPlan('combo', 1);
    }
  }

  /** Its hands on its own keys, and its body moved by them. */
  private drive(dt: number, mirror: Mirror, actions: Partial<Record<Action, boolean>>): void {
    const b = this.body;
    for (const act of ACTIONS) {
      const want = !!actions[act];
      // A held key stays down; a new press needs it up for a frame first.
      if (want && this.wasDown.has(act) && (act === 'attack' || act === 'parry' || act === 'dash')) {
        this.hands.forceDown(act, true);
      } else {
        this.hands.forceDown(act, want);
      }
      if (want) this.wasDown.add(act);
      else this.wasDown.delete(act);
    }
    b.update(dt, this.hands, mirror);
    this.hands.endFrame();
    // Kept inside its own floor.
    b.x = clamp(b.x, this.arenaLeft + 2, this.arenaRight - b.w - 2);
    if (b.dead) {
      b.dead = false;
      b.hp = b.maxHp;
    }
  }

  /** Whatever its blade touches, if that is the hero. */
  private strike(world: World): void {
    const b = this.body;
    const p = world.player;
    if (!b.bladeLive || b.swingId === this.lastHit || p.dead) return;
    if (!rectsOverlap(b.swordRect(), p.rect)) return;
    this.lastHit = b.swingId;
    // As hard as his own, but its heavy strike stays a two: a third of his
    // hearts on one blow would be a sentence, not a lesson.
    let damage = Math.min(b.swingDamage, b.charged ? 2 + (b.has('glutklinge') ? 1 : 0) : 3);
    // The riposte is a heavy cut whatever swing of the combo it is.
    if (b.swingId === this.riposteSwing) damage = Math.max(damage, 2);
    const before = p.hp;
    p.hurt(damage, b.facing, world);
    if (p.hp < before) {
      // His own blade, turned back on him, stops his: whatever he was
      // swinging is gone. Trading blows with his mirror is not a plan.
      p.attackTimer = 0;
      p.chargeTimer = 0;
      p.chargeReady = false;
      p.hurtTimer = Math.max(p.hurtTimer, 0.34);
      world.particles.burst(p.cx, p.cy, 10, '#8a4cff', { speed: 160, gravity: 200, shape: 'spark' });
      // Vesperon's thirst, turned on him.
      if (b.has('blutdurst')) this.hp = Math.min(this.maxHp, this.hp + 2);
    }
  }

  /** The enemy the game sees is wherever its body is. */
  private sync(): void {
    const b = this.body;
    this.x = b.x;
    this.y = b.y;
    this.w = b.w;
    this.h = b.h;
    this.facing = b.facing;
  }

  override touchPlayer(world: World): void {
    void world;
  }

  override lights(): GlowLight[] {
    const b = this.body;
    if (this.state === 'dormant') return [{ x: b.cx, y: this.floorY - 4, radius: 70, rgb: '120,70,220', strength: 0.4, tint: 0.3 }];
    const out: GlowLight[] = [{ x: b.cx, y: b.cy, radius: 90 * this.presence + 20, rgb: '140,90,255', strength: 0.45, tint: 0.3 }];
    if (this.state === 'fade') out.push({ x: this.stepX, y: this.floorY - 6, radius: 80, rgb: '160,110,255', strength: 0.6, tint: 0.35 });
    return out;
  }

  /* -------------------------------------------------------------- drawing */

  override draw(ctx: CanvasRenderingContext2D, world: World): void {
    const b = this.body;
    // The pool: where it lies, where it sinks, and where it will rise.
    if (this.state === 'dormant' || this.state === 'rise' || this.state === 'fade' || this.state === 'dying') {
      const pools = this.state === 'fade' ? [b.cx, this.stepX] : [b.cx];
      for (const [i, px] of pools.entries()) {
        const k = this.state === 'dormant' ? 1 : this.state === 'fade' ? (i === 0 ? this.presence : 1 - this.presence * 0.5) : 1 - this.presence * 0.6;
        ctx.save();
        ctx.fillStyle = `rgba(14,6,24,${(0.75 * k).toFixed(2)})`;
        ctx.beginPath();
        ctx.ellipse(px, this.floorY - 1, 26 + k * 6, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(150,100,255,${(0.45 * k).toFixed(2)})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      }
    }
    if (this.presence <= 0.02) return;

    // The hero's own drawing, into a layer of its own, then dyed: a dark
    // body with a violet edge and his eyes gone white.
    // Its own flash is in the dye below; the hero's filter would cost a layer.
    b.flash = 0;
    const L = this.layerCtx;
    const ox = 110 - b.cx;
    const oy = 100 - b.cy;
    L.setTransform(1, 0, 0, 1, 0, 0);
    L.globalCompositeOperation = 'source-over';
    L.clearRect(0, 0, 220, 170);
    L.save();
    L.translate(ox, oy);
    b.draw(L, world);
    L.restore();
    const R = this.rimCtx;
    R.setTransform(1, 0, 0, 1, 0, 0);
    R.globalCompositeOperation = 'source-over';
    R.clearRect(0, 0, 220, 170);
    R.drawImage(this.layer, 0, 0);
    R.globalCompositeOperation = 'source-atop';
    R.fillStyle = 'rgba(160,110,255,1)';
    R.fillRect(0, 0, 220, 170);
    L.globalCompositeOperation = 'source-atop';
    L.fillStyle = this.flash > 0 ? `rgba(${Math.round(30 + 200 * this.flash)},${Math.round(14 + 180 * this.flash)},${Math.round(50 + 200 * this.flash)},0.94)` : 'rgba(22,10,38,0.94)';
    L.fillRect(0, 0, 220, 170);
    L.globalCompositeOperation = 'source-over';

    const x = b.cx - 110;
    const y = b.cy - 100;
    // Rising out of the floor, or going back into it: cut at the floor line.
    const cut = this.floorY - (b.h + 26) * this.presence;
    ctx.save();
    if (this.presence < 1) {
      ctx.beginPath();
      ctx.rect(x - 10, cut, 240, this.floorY - cut + 2);
      ctx.clip();
    }
    ctx.globalAlpha = 0.85;
    for (const [rx, ry] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const) {
      ctx.drawImage(this.rim, x + rx, y + ry);
    }
    ctx.globalAlpha = 1;
    ctx.drawImage(this.layer, x, y);
    // Eyes: two points of white where his are - burning up before it commits.
    const ex = b.cx + b.facing * 2.5;
    const ey = b.bottom - 25.5;
    ctx.fillStyle = '#f4eeff';
    ctx.fillRect(ex - 1.5, ey, 3, 2);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(200,170,255,${(0.5 + this.flare * 0.5).toFixed(2)})`;
    ctx.fillRect(ex - 3 - this.flare * 3, ey - 1 - this.flare * 2, 6 + this.flare * 6, 4 + this.flare * 4);
    if (this.flare > 0.05) glow(ctx, ex, ey, 18 + this.flare * 10, `rgba(190,150,255,${(0.5 * this.flare).toFixed(2)})`);
    ctx.restore();
    // His charge ring, in its colour: the tell has to read through the dye.
    if (b.chargeTimer > 0) {
      const t = Math.min(1, b.chargeTimer / b.chargeTime);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = b.chargeReady ? 'rgba(200,160,255,0.9)' : `rgba(160,110,255,${(0.25 + t * 0.45).toFixed(2)})`;
      ctx.lineWidth = b.chargeReady ? 2.2 : 1.6;
      ctx.beginPath();
      ctx.arc(b.cx, b.cy - 2, b.chargeReady ? 26 : 46 - t * 20, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (this.shieldUp) {
      ctx.save();
      ctx.strokeStyle = 'rgba(180,150,240,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(b.cx, b.cy - 2, 15, 22, 0.4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}
