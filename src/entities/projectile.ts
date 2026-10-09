import { Rect, clamp, rand, rectsOverlap } from '../core/math';
import { PALETTE } from '../render/palette';
import { dirIndex } from '../render/sheet';
import { glow } from '../render/sprites';
import type { World } from '../world/context';
import { TILE } from '../world/tiles';
import { Body } from './entity';
import {
  BEAM,
  BLOB,
  BLOOD,
  BONE,
  COIN,
  type CrestFrame,
  EMBER,
  FIRE_CREST,
  KNIFE,
  MAGMA,
  ORB,
  QUAKE,
  ROCK,
  SHARD,
  SPOUT,
  WATER_CREST,
  WEB,
} from './projectile-art';

export type ProjectileKind =
  | 'orb'
  | 'bone'
  | 'shockwave'
  | 'rock'
  | 'beam'
  | 'blob'
  | 'ember'
  | 'magma'
  | 'blood'
  | 'quake'
  | 'shard'
  | 'coin'
  | 'web'
  | 'knife'
  | 'spout';

export class Projectile extends Body {
  friendly = false;
  /**
   * Whether a swing of the blade turns it aside. True for everything thrown or
   * cast - that is what the blade is for. Thalassa's flood waves set it false:
   * a wall of water is not something a blind swing can bat away, it has to be
   * jumped or parried. Measured on her before that: a player who simply held
   * the attack key swatted every wave she made and sent it back into her for
   * two, which is why he could kill her without being touched once.
   */
  deflectable = true;
  /**
   * Drawn as water rather than as force. Thalassa's flood waves set it: they
   * used to come up the hall in the knight's fire colours, which looked wrong
   * in a drowned choir and, once they stopped being deflectable, read as the
   * same thing his are.
   */
  water = false;
  /**
   * Thrown by the hero's shadow: his own crescent and his own quake, in its
   * colours. The same shapes have to read as the enemy's when they come at him.
   */
  dark = false;
  /**
   * What this one passes through without harm: whatever the swing that threw
   * it has already struck. Ankhor's quake carries the heavy strike further;
   * it is not a second blow on the thing the blade just hit. Measured with it
   * landing on top: the heavy strike went from 3.4 to 6.6 damage a second
   * standing in reach, which is not a longer arm but a second one.
   */
  spare: ReadonlySet<object> | null = null;
  /**
   * A coin of Gierschlund's that has come down and lies on the floor: it
   * hurts nobody there, and a swing sends it back. They used to burst on the
   * floor like everything else, and the only time a blade could turn one was
   * the single frame it spent in front of the hero before it hit him from
   * above - measured, a bot swinging at every coin that came near batted back
   * none of forty-five.
   */
  resting = false;
  /**
   * Whether it can touch the hero now. A coin at rest cannot; nor can one of
   * the Fünfkronige's embers on its way up: lobbed at a hero on the steps
   * beside her fire head, the rising coal crossed his height a quarter of a
   * second after it left her mouth - before an eye could have seen it go. It
   * burns on the way down, onto where it was aimed.
   */
  get harmless(): boolean {
    return this.resting || (this.kind === 'ember' && !this.friendly && this.vy < 0);
  }
  damage = 1;
  life = 4;
  spin = 0;
  private age = 0;

  constructor(
    public kind: ProjectileKind,
    x: number,
    y: number,
    vx: number,
    vy: number,
  ) {
    super();
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    switch (kind) {
      case 'orb':
        this.w = 14;
        this.h = 14;
        break;
      case 'bone':
        this.w = 12;
        this.h = 12;
        break;
      case 'shockwave':
        this.w = 26;
        this.h = 30;
        this.life = 2.6;
        this.damage = 2;
        break;
      case 'rock':
        this.w = 20;
        this.h = 20;
        this.damage = 2;
        break;
      case 'beam':
        // The crescent thrown off an upgraded blade. Short-lived on purpose:
        // it is a reach extension, not a gun.
        this.w = 30;
        this.h = 20;
        this.life = 0.62;
        this.damage = 1;
        break;
      case 'blob':
        // Slime, spat on an arc. Slower and fatter than a bone, and worth one
        // heart: it is the first thing in the game a player learns to bat out
        // of the air with the blade.
        this.w = 16;
        this.h = 16;
        this.life = 3;
        this.damage = 1;
        break;
      case 'ember':
        // The hydra's fire, lobbed on a solved arc. It is her attack and the
        // hero's only tool at once - see deflect.
        this.w = 18;
        this.h = 18;
        this.life = 3.2;
        this.damage = 2;
        break;
      case 'magma':
        // Ignivor's spit: a clot of molten rock on an arc. Where it lands it
        // keeps burning - the wyrm watches for that and leaves a pool.
        this.w = 18;
        this.h = 18;
        this.life = 3.2;
        this.damage = 1;
        break;
      case 'blood':
        // Vesperon's crescent: thrown flat, curving a little towards the hero.
        this.w = 26;
        this.h = 16;
        this.life = 2.6;
        this.damage = 1;
        break;
      case 'quake':
        // Ankhor's fist in the hero's hands: a wave of broken stone along the
        // floor. Short - it is the heavy strike reaching further, not a gun.
        this.w = 26;
        this.h = 24;
        this.life = 0.8;
        this.damage = 2;
        break;
      case 'shard':
        // The warden's splinters, thrown off a parry.
        this.w = 12;
        this.h = 10;
        this.life = 0.42;
        this.damage = 1;
        break;
      case 'coin':
        // Gierschlund's gold, spat in a fan. Heavy, so the arc is short.
        this.w = 12;
        this.h = 12;
        this.life = 3;
        this.damage = 1;
        break;
      case 'web':
        // A ball of Arachna's silk. Where it comes down, the floor goes
        // sticky; whoever it comes down on is stuck in it for a moment - it
        // binds, it does not wound.
        this.w = 16;
        this.h = 16;
        this.life = 3;
        this.damage = 0;
        break;
      case 'knife':
        // One of Maskarill's knives, thrown turning end over end on an arc. A
        // swing sends it back, flat, to the hand that threw it.
        this.w = 16;
        this.h = 12;
        this.life = 3;
        this.damage = 1;
        break;
      case 'spout':
        // A gout of water from a gargoyle's mouth, on an arc.
        this.w = 14;
        this.h = 14;
        this.life = 3;
        this.damage = 1;
        this.water = true;
        break;
    }
  }

  overlaps(r: Rect): boolean {
    return rectsOverlap(this.rect, r);
  }

  deflect(dir: number): void {
    this.friendly = true;
    if (this.kind === 'coin') {
      // Off the floor at knee height and flat back the way it came, to the
      // mouth that spat it.
      if (this.resting) this.y -= 14;
      this.resting = false;
      this.vx = 430 * dir;
      this.vy = 0;
      this.life = Math.max(this.life, 1.4);
      this.damage = 2;
      return;
    }
    if (this.kind === 'ember') {
      /*
       * Her fire flies flat once it has been turned. That is the whole of the
       * aiming in her fight: whatever height the hero parries at is the height
       * the ember travels at, so where he is standing is where he is aiming.
       * An arc would make lining a stump up a matter of luck.
       */
      this.vx = 420 * dir;
      this.vy = 0;
      this.life = Math.max(this.life, 1.6);
      this.damage = 2;
      return;
    }
    this.vx = Math.abs(this.vx || 260) * dir * 1.5;
    this.vy *= 0.3;
    this.damage = 2;
  }

  update(dt: number, world: World): void {
    this.age += dt;
    this.life -= dt;
    this.spin += dt * 9;
    if (this.life <= 0) {
      this.dead = true;
      return;
    }

    if (this.kind === 'orb') {
      // Gentle homing while it is still an enemy projectile.
      if (!this.friendly && this.age < 1.1) {
        const dx = world.player.cx - this.cx;
        const dy = world.player.cy - this.cy;
        const len = Math.hypot(dx, dy) || 1;
        this.vx += (dx / len) * 190 * dt;
        this.vy += (dy / len) * 190 * dt;
      }
      if (world.time % 0.05 < dt) {
        world.particles.spawn({
          x: this.cx,
          y: this.cy,
          vx: 0,
          vy: 0,
          gravity: -20,
          color: this.friendly ? 'rgba(160,230,255,0.7)' : 'rgba(200,90,230,0.7)',
          size: 4,
          life: 0.3,
          shape: 'circle',
        });
      }
    } else if (this.kind === 'bone' || this.kind === 'rock') {
      this.vy += 900 * dt;
    } else if (this.kind === 'coin') {
      if (!this.friendly && !this.resting) this.vy += 950 * dt;
      if (world.time % 0.07 < dt) {
        world.particles.spawn({
          x: this.cx + rand(-3, 3),
          y: this.cy + rand(-3, 3),
          vx: 0,
          vy: rand(-10, 10),
          gravity: 60,
          color: this.friendly ? 'rgba(255,250,220,0.7)' : 'rgba(255,214,110,0.7)',
          size: 1.8,
          life: 0.25,
          shape: 'spark',
        });
      }
    } else if (this.kind === 'web') {
      if (!this.friendly) this.vy += 700 * dt;
    } else if (this.kind === 'knife') {
      // Turning over as it falls; sent back, it flies flat.
      if (!this.friendly) this.vy += 760 * dt;
    } else if (this.kind === 'spout') {
      this.vy += 900 * dt;
      if (world.time % 0.03 < dt) {
        world.particles.spawn({
          x: this.cx + rand(-3, 3),
          y: this.cy + rand(-3, 3),
          vx: -this.vx * 0.08,
          vy: rand(-20, 20),
          gravity: 500,
          color: 'rgba(160,210,230,0.65)',
          size: rand(1.5, 3),
          life: 0.3,
          shape: 'circle',
        });
      }
    } else if (this.kind === 'shard') {
      if (world.time % 0.03 < dt) {
        world.particles.spawn({
          x: this.cx,
          y: this.cy,
          vx: -this.vx * 0.06,
          vy: rand(-14, 14),
          color: 'rgba(210,170,255,0.7)',
          size: 2,
          life: 0.18,
          shape: 'spark',
        });
      }
    } else if (this.kind === 'ember') {
      // Falls until it is turned; a turned ember carries its own fire.
      if (!this.friendly) this.vy += 1000 * dt;
      if (world.time % 0.04 < dt) {
        world.particles.spawn({
          x: this.cx + rand(-5, 5),
          y: this.cy + rand(-5, 5),
          vx: rand(-14, 14),
          vy: -rand(20, 60),
          gravity: -40,
          color: this.friendly ? 'rgba(255,226,150,0.75)' : 'rgba(255,150,60,0.7)',
          size: 3,
          life: 0.32,
          shape: 'circle',
        });
      }
    } else if (this.kind === 'magma') {
      if (!this.friendly) this.vy += 980 * dt;
      if (world.time % 0.035 < dt) {
        world.particles.spawn({
          x: this.cx + rand(-4, 4),
          y: this.cy + rand(-4, 4),
          vx: rand(-20, 20),
          vy: -rand(10, 50),
          gravity: -30,
          color: this.friendly ? 'rgba(255,236,170,0.75)' : Math.random() < 0.5 ? 'rgba(255,120,40,0.75)' : 'rgba(90,60,50,0.6)',
          size: rand(2, 3.5),
          life: 0.4,
          shape: 'circle',
        });
      }
    } else if (this.kind === 'blood') {
      // A slight pull towards the hero while it is still his.
      if (!this.friendly && this.age < 0.9) {
        const dy = world.player.cy - this.cy;
        this.vy += Math.sign(dy) * Math.min(Math.abs(dy) * 3, 260) * dt;
      }
      if (world.time % 0.04 < dt) {
        world.particles.spawn({
          x: this.cx - Math.sign(this.vx) * 10,
          y: this.cy + rand(-4, 4),
          vx: -this.vx * 0.05,
          vy: rand(-10, 30),
          gravity: 200,
          color: this.friendly ? 'rgba(255,210,220,0.7)' : 'rgba(200,20,50,0.7)',
          size: rand(1.5, 3),
          life: 0.35,
          shape: 'circle',
        });
      }
    } else if (this.kind === 'blob') {
      // Heavier than it looks, so the arc is short and readable.
      this.vy += 1150 * dt;
      if (world.time % 0.06 < dt) {
        world.particles.spawn({
          x: this.cx + rand(-4, 4),
          y: this.cy + rand(-4, 4),
          vx: -this.vx * 0.05,
          vy: rand(-10, 20),
          color: 'rgba(150,220,110,0.55)',
          size: 2.5,
          life: 0.3,
          shape: 'circle',
        });
      }
    } else if (this.kind === 'beam') {
      // Flies flat and thins out as it goes, so its reach can be read.
      if (world.time % 0.03 < dt) {
        world.particles.spawn({
          x: this.cx - Math.sign(this.vx) * 8,
          y: this.cy,
          vx: -this.vx * 0.08,
          vy: rand(-24, 24),
          color: this.water ? 'rgba(170,240,225,0.6)' : 'rgba(190,240,255,0.6)',
          size: 2.5,
          life: 0.22,
          shape: 'spark',
        });
      }
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (this.kind === 'shockwave' || this.kind === 'quake') {
      // Rides along the floor and dies against a wall.
      const level = world.level;
      if (level.rectHitsSolid(this.x, this.y, this.w, this.h)) {
        this.dead = true;
        world.particles.burst(this.cx, this.cy, 12, this.hitColor(), { speed: 150 });
      }
      const drop = world.level.groundBelow(this.cx, this.y + this.h - 4, 3);
      if (drop > 6) this.y += Math.min(drop, 260 * dt);
    } else if (world.level.rectHitsSolid(this.x, this.y, this.w, this.h)) {
      if (this.kind === 'coin' && !this.friendly && this.vy > 0 && this.settle(world)) return;
      this.dead = true;
      world.particles.burst(this.cx, this.cy, 10, this.hitColor(), { speed: 130 });
    }

    if (this.x < -80 || this.x > world.level.pixelWidth + 80 || this.y > world.level.pixelHeight + 80) {
      this.dead = true;
    }
  }

  /**
   * A coin coming down onto a floor lies there instead of bursting - see
   * resting. False if what it hit was not a floor it can lie on.
   */
  private settle(world: World): boolean {
    const top = Math.floor((this.y + this.h) / TILE) * TILE;
    if (world.level.rectHitsSolid(this.x, top - this.h, this.w, this.h)) return false;
    this.y = top - this.h;
    this.vx = 0;
    this.vy = 0;
    this.resting = true;
    this.life = Math.min(this.life, 1.3);
    world.particles.burst(this.cx, this.y + this.h - 2, 6, '#ffd36a', { speed: 90, gravity: 400, shape: 'spark' });
    return true;
  }

  private hitColor(): string {
    switch (this.kind) {
      case 'orb':
        return this.friendly ? '#8fe6ff' : PALETTE.mage;
      case 'bone':
        return PALETTE.skeleton;
      case 'rock':
        return '#8a7460';
      case 'beam':
        return '#bff0ff';
      case 'blob':
        return this.friendly ? '#bdf0a0' : '#8fd45c';
      case 'ember':
        return this.friendly ? '#ffe9b0' : '#ff9a44';
      case 'magma':
        return this.friendly ? '#ffe9b0' : '#ff7a2a';
      case 'blood':
        return this.friendly ? '#ffd0dc' : '#d0203c';
      case 'shockwave':
        return this.water ? '#9fe4dc' : '#ff9a5c';
      case 'quake':
        return '#e8c98e';
      case 'shard':
        return '#d6b8ff';
      case 'coin':
        return '#ffd36a';
      case 'web':
        return '#e6eef8';
      case 'knife':
        return '#e8ecf4';
      case 'spout':
        return '#a8d8ec';
      default:
        return '#ff9a5c';
    }
  }

  /**
   * Every kind as frames of art pixels (see projectile-art.ts): what turns over
   * in the air turns over in drawn frames, what points the way it flies has a
   * frame for each of the eight ways, and the crescents that thin out at the
   * end of their flight do it in smaller frames, not in alpha. A glow goes
   * round what burns or shines; on the actor layer it comes out as a thin
   * pattern of pixels, never as a halo with a dark rim.
   */
  draw(ctx: CanvasRenderingContext2D): void {
    const cx = this.cx;
    const cy = this.cy;
    const dir: 1 | -1 = this.vx < 0 ? -1 : 1;
    const turn = (rate: number, frames: number): number =>
      ((Math.floor((this.spin * rate * frames) / (Math.PI * 2)) % frames) + frames) % frames;
    switch (this.kind) {
      case 'beam': {
        // A crescent of light, leaning the way it flies, with the tips drawn
        // back: it has to read as thrown off a blade, not as a bullet. The
        // first tier of the blade throws water rather than light, and a
        // smaller crescent: the eye should be able to tell them apart.
        const fade = clamp(this.life / 0.4, 0, 1);
        const frame = this.water ? (fade > 0.5 ? 'mid' : 'small') : fade > 0.66 ? 'big' : fade > 0.33 ? 'mid' : 'small';
        const glowColor = this.dark ? '#db3ffd' : this.water ? '#94fdff' : '#0cf1ff';
        glow(ctx, cx, cy, (this.water ? 18 : 22) * (0.5 + fade * 0.5), glowColor, 0.45 * fade);
        BEAM.draw(ctx, frame, cx, cy, 7, 5, dir, this.dark ? 'dark' : this.water ? 'water' : '');
        break;
      }
      case 'blob': {
        // A drop of slime, drawn stretched along the way it is going.
        const ax = Math.abs(this.vx);
        const ay = Math.abs(this.vy);
        const frame = ax > ay * 1.6 ? 'wide' : ay > ax * 1.6 ? 'tall' : 'round';
        BLOB.draw(ctx, frame, cx, cy, 4, 4, dir, this.friendly ? 'friendly' : '');
        break;
      }
      case 'ember': {
        /*
         * Two readings of the same thing: hers is a falling coal trailing
         * smoke, the turned one is a white-hot bolt with a tail. A player has
         * to be able to tell at a glance whether the fire on screen is still a
         * threat or already a tool.
         */
        const hot = this.friendly;
        glow(ctx, cx, cy, hot ? 24 : 18, hot ? '#ffeb57' : '#ffa214', 0.55);
        const w = hot ? 13 : 11;
        EMBER.draw(ctx, `${hot ? 'f' : 'h'}${dirIndex(this.vx, this.vy)}`, cx, cy, w >> 1, w >> 1, 1);
        break;
      }
      case 'magma': {
        // A clot of rock with fire showing through its cracks, turning over.
        const hot = this.friendly;
        glow(ctx, cx, cy, 18, hot ? '#ffeb57' : '#ed7614', 0.45);
        MAGMA.draw(ctx, `m${turn(0.6, 8)}`, cx, cy, 4, 4, 1, hot ? 'friendly' : '');
        break;
      }
      case 'blood': {
        // A crescent of blood, the tips swept back the way it came from.
        const fade = clamp(this.life / 0.4, 0, 1);
        glow(ctx, cx, cy, 20 * (0.5 + fade * 0.5), this.friendly ? '#fdd2ed' : '#ea323c', 0.45 * fade);
        BLOOD.draw(ctx, fade > 0.66 ? 'big' : fade > 0.33 ? 'mid' : 'small', cx, cy, 7, 5, dir, this.friendly ? 'friendly' : '');
        break;
      }
      case 'orb': {
        glow(ctx, cx, cy, 18, this.friendly ? '#94fdff' : '#db3ffd', 0.55);
        ORB.draw(ctx, `o${turn(1.4, 4)}` as 'o0', cx, cy, 3, 3, 1, this.friendly ? 'friendly' : '');
        break;
      }
      case 'bone': {
        BONE.draw(ctx, `b${turn(2, 4)}` as 'b0', cx, cy, 3, 3, 1);
        break;
      }
      case 'rock': {
        ROCK.draw(ctx, `r${turn(0.5, 8)}`, cx, cy, 6, 6, 1);
        break;
      }
      case 'quake': {
        // Stone thrown up off the floor in a running crest, golden with the
        // light that is still in it - his fist, not the knight's fire.
        const a = Math.min(1, this.life / 0.35);
        const base = this.y + this.h;
        glow(ctx, cx, base - 8, 26, this.dark ? '#db3ffd' : '#ffc825', 0.45 * a);
        const frame = a > 0.66 ? (['q0', 'q1', 'q2'] as const)[turn(1.5, 3)] : a > 0.33 ? 's0' : 's1';
        QUAKE.draw(ctx, frame, cx, base, 6, 12, dir, this.dark ? 'dark' : '');
        break;
      }
      case 'shard': {
        // A violet splinter, pointing the way it flies.
        glow(ctx, cx, cy, 12, '#f389f5', 0.45);
        SHARD.draw(ctx, `d${dirIndex(this.vx, this.vy)}`, cx, cy, 3, 3, 1);
        break;
      }
      case 'coin': {
        // A gold coin turning over in the air, face, edge and face; one lying
        // on the floor lies flat, and now and then a glint goes over it.
        if (this.resting) {
          const wink = Math.sin(this.spin * 0.9) > 0.55;
          if (wink) glow(ctx, cx, cy, 12, '#ffeb57', 0.5);
          COIN.draw(ctx, wink ? 'wink' : 'flat', cx, this.y + this.h, 3, 6, 1);
          break;
        }
        COIN.draw(ctx, `c${turn(1.4 * 2, 4)}`, cx, cy, 3, 3, 1, this.friendly ? 'friendly' : '');
        break;
      }
      case 'web': {
        // A clot of silk: a pale knot with loose threads, turning as it goes.
        WEB.draw(ctx, turn(0.4 * 4, 2) === 0 ? 'w0' : 'w1', cx, cy, 5, 5, 1, this.friendly ? 'friendly' : '');
        break;
      }
      case 'knife': {
        // A dagger turning end over end; sent back, it flies flat, point first.
        const d = this.friendly ? dirIndex(this.vx, this.vy) : turn(1.6, 8);
        KNIFE.draw(ctx, `k${d}`, cx, cy, 4, 3, 1);
        break;
      }
      case 'spout': {
        // A gout of rainwater, stretched along the way it falls.
        SPOUT.draw(ctx, `s${dirIndex(this.vx, this.vy)}`, cx, cy, 5, 5, 1);
        break;
      }
      case 'shockwave': {
        const a = Math.min(1, this.life / 1.5);
        const base = this.y + this.h;
        glow(ctx, cx, base - 6, 28, this.water ? '#94fdff' : '#ffa214', 0.45 * a);
        const sheet = this.water ? WATER_CREST : FIRE_CREST;
        const k = turn(1.5, 4);
        const frame: CrestFrame = a > 0.6 ? (['f0', 'f1', 'f2', 'f3'] as const)[k] : a > 0.3 ? (k % 2 === 0 ? 'm0' : 'm1') : k % 2 === 0 ? 'l0' : 'l1';
        sheet.draw(ctx, frame, cx, base, 6, 15, dir);
        break;
      }
    }
  }
}
