import { Rect, rand, rectsOverlap } from '../core/math';
import { PALETTE } from '../render/palette';
import { glow } from '../render/sprites';
import type { World } from '../world/context';
import { TILE } from '../world/tiles';
import { Body } from './entity';

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

  draw(ctx: CanvasRenderingContext2D): void {
    const cx = this.cx;
    const cy = this.cy;
    switch (this.kind) {
      case 'beam': {
        // A crescent of light, leaning the way it flies, with the tips drawn
        // back: it has to read as thrown off a blade, not as a bullet.
        const dir = Math.sign(this.vx) || 1;
        const fade = Math.max(0, Math.min(1, this.life / 0.4));
        // The first tier of the blade throws water rather than light, and a
        // smaller crescent: the eye should be able to tell them apart.
        const size = this.water ? 0.8 : 1;
        glow(
          ctx,
          cx,
          cy,
          26 * fade * size,
          this.dark
            ? `rgba(150,80,255,${(0.45 * fade).toFixed(2)})`
            : this.water
              ? `rgba(140,235,220,${(0.35 * fade).toFixed(2)})`
              : `rgba(150,230,255,${(0.4 * fade).toFixed(2)})`,
        );
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(dir * size, size);
        // The shadow's crescent is a cut of darkness with a violet edge: drawn
        // over, not added on, or it would come out as light.
        ctx.globalCompositeOperation = this.dark ? 'source-over' : 'lighter';
        const [edge, core] = this.dark ? ['#8a4cff', '#14061f'] : this.water ? ['#3fc8b8', '#dcfaf2'] : ['#5ec8ff', '#e8fbff'];
        for (const [w, alpha, color] of [
          [1, 0.5 * fade, edge],
          [0.62, 0.85 * fade, core],
        ] as const) {
          ctx.globalAlpha = alpha;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.moveTo(13 * w, 0);
          ctx.quadraticCurveTo(2 * w, -11 * w, -13 * w, -8 * w);
          ctx.quadraticCurveTo(-1 * w, 0, -13 * w, 8 * w);
          ctx.quadraticCurveTo(2 * w, 11 * w, 13 * w, 0);
          ctx.closePath();
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.restore();
        break;
      }
      case 'blob': {
        // A wobbling drop of slime, squashed along the way it is flying, with a
        // brighter skin on top so it reads as wet rather than as a rock.
        const wob = Math.sin(this.spin * 1.6) * 0.14;
        glow(ctx, cx, cy, 16, 'rgba(150,225,110,0.4)');
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(Math.atan2(this.vy, this.vx) * 0.35);
        ctx.scale(1.15 + wob, 0.85 - wob);
        ctx.fillStyle = this.friendly ? '#bdf0a0' : '#77c246';
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(220,255,190,0.75)';
        ctx.beginPath();
        ctx.ellipse(-2, -2.5, 3.4, 2.2, -0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
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
        glow(ctx, cx, cy, hot ? 26 : 20, hot ? 'rgba(255,220,140,0.6)' : 'rgba(255,130,50,0.5)');
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(Math.atan2(this.vy, this.vx));
        const len = hot ? 20 : 11;
        const tail = ctx.createLinearGradient(-len, 0, len * 0.5, 0);
        tail.addColorStop(0, 'rgba(255,120,40,0)');
        tail.addColorStop(1, hot ? 'rgba(255,238,190,0.95)' : 'rgba(255,168,70,0.9)');
        ctx.fillStyle = tail;
        ctx.beginPath();
        ctx.moveTo(-len, 0);
        ctx.lineTo(0, -7);
        ctx.lineTo(len * 0.5, 0);
        ctx.lineTo(0, 7);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = hot ? '#fffbe8' : '#ffd28a';
        ctx.beginPath();
        ctx.arc(0, 0, hot ? 5 : 4.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'magma': {
        // A clot of rock with fire showing through its cracks.
        const hot = this.friendly;
        glow(ctx, cx, cy, 22, hot ? 'rgba(255,230,160,0.55)' : 'rgba(255,110,40,0.5)');
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.spin * 0.6);
        ctx.fillStyle = hot ? '#ffe7a8' : '#3a2320';
        ctx.beginPath();
        ctx.moveTo(-8, -3);
        ctx.lineTo(-3, -8);
        ctx.lineTo(6, -6);
        ctx.lineTo(9, 2);
        ctx.lineTo(3, 8);
        ctx.lineTo(-6, 6);
        ctx.closePath();
        ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = hot ? '#fffbe8' : '#ff9a3a';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(-5, -1);
        ctx.lineTo(0, 1);
        ctx.lineTo(4, -3);
        ctx.moveTo(0, 1);
        ctx.lineTo(1, 6);
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'blood': {
        // A crescent of blood, the tips swept back the way it came from.
        const dir = Math.sign(this.vx) || 1;
        const fade = Math.max(0, Math.min(1, this.life / 0.4));
        const hot = this.friendly;
        glow(ctx, cx, cy, 24 * fade, hot ? 'rgba(255,200,215,0.45)' : 'rgba(220,30,60,0.45)');
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(dir, 1);
        for (const [w, color] of [
          [1, hot ? '#ff9fb4' : '#8a0a22'],
          [0.6, hot ? '#fff0f3' : '#ff4a68'],
        ] as const) {
          ctx.globalAlpha = fade;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.moveTo(13 * w, 0);
          ctx.quadraticCurveTo(2 * w, -11 * w, -13 * w, -9 * w);
          ctx.quadraticCurveTo(-2 * w, 0, -13 * w, 9 * w);
          ctx.quadraticCurveTo(2 * w, 11 * w, 13 * w, 0);
          ctx.closePath();
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.restore();
        break;
      }
      case 'orb': {
        const color = this.friendly ? '#8fe6ff' : '#d46bf0';
        glow(ctx, cx, cy, 18, this.friendly ? 'rgba(140,230,255,0.55)' : 'rgba(210,90,240,0.5)');
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(cx, cy, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(cx - 1.5, cy - 1.5, 2.4, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'bone': {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.spin);
        ctx.fillStyle = PALETTE.skeleton;
        ctx.fillRect(-6, -2, 12, 4);
        ctx.fillRect(-7, -4, 3, 8);
        ctx.fillRect(4, -4, 3, 8);
        ctx.restore();
        break;
      }
      case 'rock': {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.spin * 0.5);
        ctx.fillStyle = '#6b5747';
        ctx.beginPath();
        ctx.moveTo(-10, -4);
        ctx.lineTo(-3, -10);
        ctx.lineTo(8, -6);
        ctx.lineTo(10, 4);
        ctx.lineTo(1, 10);
        ctx.lineTo(-8, 6);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#8a7460';
        ctx.fillRect(-4, -4, 5, 4);
        ctx.restore();
        break;
      }
      case 'quake': {
        // Stone thrown up off the floor in a running crest, golden with the
        // light that is still in it - his fist, not the knight's fire.
        const a = Math.min(1, this.life / 0.35);
        const dir = Math.sign(this.vx) || 1;
        const base = this.y + this.h;
        glow(ctx, cx, base - 6, 30, this.dark ? 'rgba(150,90,255,0.4)' : 'rgba(255,214,140,0.4)', a);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(cx, base);
        ctx.scale(dir, 1);
        ctx.fillStyle = this.dark ? '#24123a' : '#6e5a44';
        ctx.beginPath();
        ctx.moveTo(-14, 0);
        ctx.lineTo(-6, -12 - Math.sin(this.spin * 2) * 2);
        ctx.lineTo(2, -20);
        ctx.lineTo(9, -10);
        ctx.lineTo(14, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = this.dark ? '#9a6aff' : '#e8c98e';
        ctx.beginPath();
        ctx.moveTo(-4, 0);
        ctx.lineTo(2, -13);
        ctx.lineTo(8, 0);
        ctx.closePath();
        ctx.fill();
        // Chips flying off the crest.
        ctx.fillStyle = '#b89a6a';
        for (let i = 0; i < 3; i++) {
          const t = (this.spin * 0.7 + i * 0.33) % 1;
          ctx.fillRect(-8 - t * 10, -14 - t * 10 + t * t * 18, 3, 3);
        }
        ctx.restore();
        break;
      }
      case 'shard': {
        // A violet splinter, pointing the way it flies.
        glow(ctx, cx, cy, 14, 'rgba(200,160,255,0.45)');
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(Math.atan2(this.vy, this.vx));
        ctx.fillStyle = '#c79bff';
        ctx.beginPath();
        ctx.moveTo(8, 0);
        ctx.lineTo(-2, -4);
        ctx.lineTo(-8, 0);
        ctx.lineTo(-2, 4);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#f3eaff';
        ctx.fillRect(-2, -1, 7, 2);
        ctx.restore();
        break;
      }
      case 'coin': {
        // A gold coin turning over in the air: a disc that narrows and widens.
        // One lying on the floor lies flat, and winks.
        const turn = this.resting ? 1 : Math.abs(Math.cos(this.spin * 1.4));
        if (this.resting) {
          const wink = Math.max(0, Math.sin(this.spin * 0.9));
          glow(ctx, cx, cy, 12 + wink * 6, `rgba(255,214,110,${(0.3 + wink * 0.35).toFixed(2)})`);
          ctx.save();
          ctx.translate(cx, cy + 3);
          ctx.fillStyle = '#d9a028';
          ctx.beginPath();
          ctx.ellipse(0, 0, 6.5, 2.6, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ffe08a';
          ctx.beginPath();
          ctx.ellipse(-1, -0.8, 4, 1.3, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          break;
        }
        glow(ctx, cx, cy, 14, this.friendly ? 'rgba(255,250,220,0.45)' : 'rgba(255,200,90,0.4)');
        ctx.save();
        ctx.translate(cx, cy);
        ctx.fillStyle = this.friendly ? '#fff3c4' : '#d9a028';
        ctx.beginPath();
        ctx.ellipse(0, 0, 1.5 + 5 * turn, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = this.friendly ? '#ffffff' : '#ffe08a';
        ctx.beginPath();
        ctx.ellipse(-0.8 * turn, -1, 0.8 + 2.6 * turn, 3.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'web': {
        // A clot of silk: a pale knot with loose threads trailing off it.
        glow(ctx, cx, cy, 16, 'rgba(220,232,246,0.3)');
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.spin * 0.4);
        ctx.strokeStyle = this.friendly ? 'rgba(255,255,255,0.9)' : 'rgba(226,234,244,0.85)';
        ctx.lineWidth = 1.2;
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * -9, Math.sin(a) * -9);
          ctx.lineTo(Math.cos(a) * 9, Math.sin(a) * 9);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(236,242,250,0.85)';
        ctx.beginPath();
        ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'knife': {
        // A dagger turning end over end: a silver blade, a gold guard.
        glow(ctx, cx, cy, 12, this.friendly ? 'rgba(255,250,230,0.4)' : 'rgba(220,200,255,0.3)');
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.friendly ? Math.atan2(this.vy, this.vx) : this.spin * 1.6);
        ctx.fillStyle = this.friendly ? '#fffbe8' : '#dfe4ee';
        ctx.beginPath();
        ctx.moveTo(9, 0);
        ctx.lineTo(0, -2.4);
        ctx.lineTo(0, 2.4);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#e8b84a';
        ctx.fillRect(-1.5, -3.5, 2, 7);
        ctx.fillStyle = '#7a3a8a';
        ctx.fillRect(-7, -1.2, 5.5, 2.4);
        ctx.restore();
        break;
      }
      case 'spout': {
        // A gout of rainwater, stretched along the way it falls.
        const len = Math.min(10, Math.hypot(this.vx, this.vy) / 60);
        const ang = Math.atan2(this.vy, this.vx);
        glow(ctx, cx, cy, 14, 'rgba(150,200,230,0.35)');
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(ang);
        ctx.fillStyle = 'rgba(120,180,214,0.9)';
        ctx.beginPath();
        ctx.ellipse(-len * 0.3, 0, 6 + len * 0.6, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(226,244,252,0.85)';
        ctx.beginPath();
        ctx.ellipse(1, -1.5, 3, 1.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'shockwave': {
        const a = Math.min(1, this.life / 1.5);
        const [halo, body, crest] = this.water
          ? ['rgba(110,225,215,0.4)', '#2f93a0', '#d8faf4']
          : ['rgba(255,120,60,0.45)', '#ff8a45', '#ffd08a'];
        glow(ctx, cx, this.y + this.h, 34, halo, a);
        ctx.globalAlpha = a;
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y + this.h);
        ctx.lineTo(this.x + this.w * 0.5, this.y + Math.sin(this.spin * 3) * 3);
        ctx.lineTo(this.x + this.w, this.y + this.h);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = crest;
        ctx.beginPath();
        ctx.moveTo(this.x + this.w * 0.28, this.y + this.h);
        ctx.lineTo(this.x + this.w * 0.5, this.y + this.h * 0.35);
        ctx.lineTo(this.x + this.w * 0.72, this.y + this.h);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
        break;
      }
    }
  }
}
