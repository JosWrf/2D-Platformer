/**
 * What a boss teaches.
 *
 * Every boss leaves a relic (relics.ts), and the relics all run on their own:
 * a heart more, a shield that grows back, a longer parry. On top of its relic
 * every boss now leaves the hero one of its own attacks, to use himself - one
 * at a time, the one he has picked, on its own key: F (or U, C) uses it, Q (or
 * O, V) picks the next, and each runs on a cooldown of its own.
 *
 * Each is the boss's move, scaled to a hero and turned round: Gallert's slam,
 * Gierschlund's gold, Ankhor's sun, Arachna's silk, Ignivor's wave of fire,
 * Thalassa's springtide, Vesperon's sickles, Morvain's shockwaves, Umbra's
 * step through the dark, the warden's charge, the hydra's five fires and the
 * Prismarch's crystal rain. They hit the way the blade hits - the same
 * overlaps and the same hurt, so a shut lid stays shut, plates ring and only a
 * head counts - and each strikes a thing at most once per cast, unless it says
 * otherwise.
 *
 * The monsters do not reckon them the way they reckon the relics (see mightOf):
 * there is only ever one ready, it has to be waited for, and pressed every time
 * it is the strongest adds about a quarter to what the blade does on its own -
 * measured, see verify:skills.
 */
import { audio } from '../core/audio';
import { type Rect, TAU, clamp, rand, sign } from '../core/math';
import { glow } from '../render/sprites';
import type { World } from '../world/context';
import { TILE } from '../world/tiles';
import { BOSS_KINDS, type EnemyKind, type GlowLight } from './enemy';
import type { RelicId } from './relics';

export type SkillId =
  | 'klatschsprung'
  | 'goldregen'
  | 'sonnenblick'
  | 'netzschuss'
  | 'feuerwelle'
  | 'springflut'
  | 'blutsicheln'
  | 'schattenwelle'
  | 'schattensprung'
  | 'splitteransturm'
  | 'kronenfeuer'
  | 'splitterregen';

export interface Skill {
  id: SkillId;
  /** The name on the banner, in the corner and in the pause list. */
  name: string;
  /** One line of what it does, for the pause list. */
  text: string;
  /** Its colour on the HUD. */
  color: string;
  /** Who it comes from. */
  from: string;
  /** The relic it comes with: taking that relic teaches it. */
  relic: RelicId;
  /** Seconds before it can be used again. */
  cooldown: number;
}

/** In the order the road hands them out - the same as the relics. */
export const SKILLS: readonly Skill[] = [
  {
    id: 'klatschsprung',
    name: 'Klatschsprung',
    text: 'Ein Satz nach vorn (in der Luft: nach unten), und wo du landest, ein Ring: 3 Schaden.',
    color: '#8fe08a',
    from: 'Gallert',
    relic: 'herzkern',
    cooldown: 3.5,
  },
  {
    id: 'goldregen',
    name: 'Goldregen',
    text: 'Vier Münzen im Fächer nach vorn, je 1 Schaden.',
    color: '#f2c14e',
    from: 'Gierschlund',
    relic: 'goldzahn',
    cooldown: 3.5,
  },
  {
    id: 'sonnenblick',
    name: 'Sonnenblick',
    text: 'Eine Säule aus Sonnenlicht auf den nächsten Feind: Sie folgt ihm und brennt.',
    color: '#ffd98a',
    from: 'Ankhor',
    relic: 'bebenfaust',
    cooldown: 5,
  },
  {
    id: 'netzschuss',
    name: 'Netzschuss',
    text: 'Drei Ballen Seide: 1 Schaden, und wen sie treffen, der klebt eine Weile fest.',
    color: '#dfe9f4',
    from: 'Arachna',
    relic: 'seidenmantel',
    cooldown: 4.5,
  },
  {
    id: 'feuerwelle',
    name: 'Feuerwelle',
    text: 'Der Boden vor dir bricht als Feuer auf, Säule um Säule: 2 Schaden.',
    color: '#ff8a3a',
    from: 'Ignivor',
    relic: 'glutklinge',
    cooldown: 4,
  },
  {
    id: 'springflut',
    name: 'Springflut',
    text: 'Unter bis zu drei Feinden schießt das Wasser hoch: je 2 Schaden.',
    color: '#7fe3cd',
    from: 'Thalassa',
    relic: 'flutklinge',
    cooldown: 4.5,
  },
  {
    id: 'blutsicheln',
    name: 'Blutsicheln',
    text: 'Drei Sicheln aus Blut im Fächer, durch alles hindurch: je 1 Schaden.',
    color: '#ff5470',
    from: 'Vesperon',
    relic: 'blutdurst',
    cooldown: 3,
  },
  {
    id: 'schattenwelle',
    name: 'Schattenwelle',
    text: 'Die Klinge in den Boden: zwei Schockwellen, nach vorn und nach hinten, je 2 Schaden.',
    color: '#9a86e8',
    from: 'Morvain',
    relic: 'schattenschritt',
    cooldown: 3.5,
  },
  {
    id: 'schattensprung',
    name: 'Schattensprung',
    text: 'Durch die Dunkelheit hinter den nächsten Feind — und gleich ein Ladeschlag.',
    color: '#c9b8ff',
    from: 'Umbra',
    relic: 'zweiteratem',
    cooldown: 4.5,
  },
  {
    id: 'splitteransturm',
    name: 'Splitteransturm',
    text: 'Ein Sturm nach vorn in Kristall, unverwundbar: 2 Schaden an allem im Weg.',
    color: '#c79bff',
    from: 'Splitterwächter',
    relic: 'splitterparade',
    cooldown: 3,
  },
  {
    id: 'kronenfeuer',
    name: 'Kronenfeuer',
    text: 'Fünf Würfe, einer für jeden Kopf, im Bogen: je 1 Schaden, wo sie platzen.',
    color: '#8fd45c',
    from: 'Die Fünfkronige',
    relic: 'hydrablut',
    cooldown: 4.5,
  },
  {
    id: 'splitterregen',
    name: 'Splitterregen',
    text: 'Sechs Kristalle regnen auf den Feind vor dir: je 1 Schaden.',
    color: '#8fe8ff',
    from: 'Prismarch',
    relic: 'klingenwelle',
    cooldown: 5,
  },
];

export function skillInfo(id: SkillId): Skill {
  const found = SKILLS.find((k) => k.id === id);
  if (!found) throw new Error(`no skill ${id}`);
  return found;
}

/** The attack that comes with a relic, if one does. */
export function skillForRelic(id: RelicId): Skill | undefined {
  return SKILLS.find((k) => k.relic === id);
}

/**
 * How long Arachna's silk holds what it hits, and how slowly that lives while
 * it does: everything it does, its wind-ups too. A boss shakes it off sooner
 * and is slowed less - a held boss is a boss that is not fighting.
 */
export const SNARE_TIME = 2.2;
export const SNARE_TIME_BOSS = 1.1;
export const SNARE_PACE = 0.3;
export const SNARE_PACE_BOSS = 0.55;

/* ------------------------------------------------------------- striking */

/** Anything a boss attack can strike: an enemy or Morvain. */
interface Struck {
  dead: boolean;
  vulnerable?: boolean;
  hp: number;
  cx: number;
  cy: number;
  snare: number;
  overlaps(r: Rect): boolean;
  hurt(amount: number, fromDir: number, world: World): void;
}

/**
 * One blow from a boss attack on everything in a box: the same path the blade
 * takes, so whatever is armoured stays armoured. Each thing in `struck` is
 * left alone, and whatever is hit goes into it. Returns what was hit.
 */
export function strike(world: World, box: Rect, damage: number, dir: number, struck: Set<object>, color: string): Struck[] {
  const hit: Struck[] = [];
  const things: Struck[] = [...world.enemies];
  const boss = world.boss;
  if (boss && boss.vulnerable) things.push(boss);
  for (const thing of things) {
    if (thing.dead || struck.has(thing) || !thing.overlaps(box)) continue;
    struck.add(thing);
    const before = thing.hp;
    thing.hurt(damage, dir || 1, world);
    world.player.onDamageDealt(Math.max(0, before - Math.max(0, thing.hp)));
    world.particles.burst(thing.cx, thing.cy, 8 + damage * 3, color, { speed: 180, gravity: 260, shape: 'spark' });
    hit.push(thing);
  }
  if (hit.length > 0) world.hitStop(0.03);
  return hit;
}

/** Binds what the silk has hit: see SNARE_TIME. */
function snare(thing: Struck): void {
  // Morvain has no kind: he is a boss all the same.
  const kind = (thing as { kind?: EnemyKind }).kind;
  const boss = kind === undefined || BOSS_KINDS.has(kind);
  thing.snare = Math.max(thing.snare, boss ? SNARE_TIME_BOSS : SNARE_TIME);
}

interface Target {
  x: number;
  y: number;
  bottom: number;
  thing: { dead: boolean; cx: number; cy: number; bottom: number };
}

/**
 * Everything a boss attack can be aimed at: what is alive, awake if it is a
 * boss, and not behind a wall. An attack that could be called down on a boss
 * through the wall of its arena would make the arena optional.
 */
function targets(world: World): Target[] {
  const p = world.player;
  const out: Target[] = [];
  for (const e of world.enemies) {
    if (e.dead || !e.active || (BOSS_KINDS.has(e.kind) && !e.engaged)) continue;
    if (!clearPath(world, p.cx, e.cx, p.cy)) continue;
    out.push({ x: e.cx, y: e.cy, bottom: e.bottom, thing: e });
  }
  const b = world.boss;
  if (b && !b.dead && b.engaged && clearPath(world, p.cx, b.cx, p.cy)) out.push({ x: b.cx, y: b.cy, bottom: b.bottom, thing: b });
  return out;
}

/** A point straight ahead of the hero, as far as `dist` or up to the first wall. */
function ahead(world: World, dist: number): number {
  const p = world.player;
  let x = p.cx;
  for (let d = 8; d <= dist; d += 8) {
    if (solid(world, p.cx + p.facing * d, p.cy)) break;
    x = p.cx + p.facing * d;
  }
  return x;
}

/**
 * The nearest target within reach, and one ahead of the hero before one
 * behind him: an attack aimed at what he is facing is the attack he meant.
 */
function nearest(world: World, range: number): Target | null {
  const p = world.player;
  let best: Target | null = null;
  let bestD = Infinity;
  for (const t of targets(world)) {
    const dx = t.x - p.cx;
    const dy = t.y - p.cy;
    if (Math.abs(dx) > range || Math.abs(dy) > range * 0.8) continue;
    let d = Math.hypot(dx, dy);
    if (Math.abs(dx) > 12 && sign(dx) !== p.facing) d += range;
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return best;
}

/** The floor under a point: the first solid tile or board below it. */
function floorUnder(world: World, x: number, y: number): number {
  return y + world.level.groundBelow(x, y, 14);
}

/** Whether a point is inside a solid tile. */
function solid(world: World, x: number, y: number): boolean {
  return world.level.solidAt(Math.floor(x / TILE), Math.floor(y / TILE));
}

/**
 * Whether nothing solid stands between two points at one height. A ward is
 * solid while it stands, so nothing steps through the wall of a sealed arena.
 */
function clearPath(world: World, x0: number, x1: number, y: number): boolean {
  const step = 8 * sign(x1 - x0);
  if (step === 0) return true;
  for (let x = x0; (x1 - x) * step > 0; x += step) {
    if (solid(world, x, y)) return false;
  }
  return !solid(world, x1, y);
}

/** Whether there is floor to stand on at x, right under the height y. */
function floorAt(world: World, x: number, y: number): boolean {
  const tx = Math.floor(x / TILE);
  const ty = Math.floor((y + 2) / TILE);
  return world.level.solidAt(tx, ty) || world.level.platformAt(tx, ty);
}

/* ------------------------------------------------------------- effects */

/** A cast in flight: what it draws, what it lights, what it strikes. */
export abstract class SkillEffect {
  done = false;
  /** Everything this cast has struck already. */
  protected readonly struck = new Set<object>();
  abstract update(dt: number, world: World): void;
  abstract draw(ctx: CanvasRenderingContext2D): void;
  lights(): GlowLight[] {
    return [];
  }
}

/** Gallert: up and forward - or, in the air, straight down - and a ring where he lands. */
class SlamHop extends SkillEffect {
  private t = 0;
  private airborne = false;
  private ring = -1;
  private ringX = 0;
  private ringY = 0;

  constructor(world: World) {
    super();
    const p = world.player;
    if (p.onGround) {
      p.vy = -520;
      p.vx = p.facing * 250;
    } else {
      p.vy = 780;
      this.airborne = true;
    }
    audio.play('jump', 0.7);
    world.particles.burst(p.cx, p.bottom, 12, 'rgba(143,224,138,0.85)', { speed: 130, gravity: 300, angle: -Math.PI / 2, spread: 2.2 });
  }

  update(dt: number, world: World): void {
    const p = world.player;
    this.t += dt;
    if (this.ring >= 0) {
      this.ring += dt;
      if (this.ring > 0.4) this.done = true;
      return;
    }
    if (p.dead || this.t > 2.5) {
      this.done = true;
      return;
    }
    if (!p.onGround) {
      this.airborne = true;
      return;
    }
    if (!this.airborne) return;
    this.ring = 0;
    this.ringX = p.cx;
    this.ringY = p.bottom;
    strike(world, { x: p.cx - 80, y: p.bottom - 54, w: 160, h: 60 }, 3, p.facing, this.struck, '#b6f2ac');
    audio.play('slam', 1.1);
    audio.play('splash', 0.75);
    world.camera.addShake(5);
    world.particles.burst(p.cx, p.bottom - 4, 26, 'rgba(143,224,138,0.9)', { speed: 260, gravity: 520, angle: -Math.PI / 2, spread: 2.6 });
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.ring < 0) return;
    const k = clamp(this.ring / 0.4, 0, 1);
    ctx.save();
    ctx.globalAlpha = 1 - k;
    ctx.strokeStyle = '#b6f2ac';
    ctx.lineWidth = 1 + 4 * (1 - k);
    ctx.beginPath();
    ctx.ellipse(this.ringX, this.ringY - 2, 20 + 62 * k, 5 + 9 * k, 0, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = 'rgba(143,224,138,0.25)';
    ctx.fill();
    ctx.restore();
  }

  override lights(): GlowLight[] {
    if (this.ring < 0) return [];
    return [{ x: this.ringX, y: this.ringY - 10, radius: 130 * (1 - this.ring / 0.4) + 20, rgb: '143,224,138', strength: 0.8, tint: 0.35 }];
  }
}

type ShotStyle = 'coin' | 'web' | 'blood' | 'crown';

/**
 * One thing thrown: a coin, a ball of silk, a sickle of blood, one of the five
 * fires. It flies, falls if it is heavy, and stops at walls and floors.
 */
class Shot extends SkillEffect {
  private age = 0;
  private spin = rand(0, TAU);
  /** For a fire that has burst: seconds since. */
  private burst = -1;

  constructor(
    private x: number,
    private y: number,
    private vx: number,
    private vy: number,
    private readonly gravity: number,
    private readonly style: ShotStyle,
    private readonly color: string,
    private readonly damage: number,
    private life: number,
    /** Goes on through what it hits rather than stopping in it. */
    private readonly pierce = false,
  ) {
    super();
  }

  private get radius(): number {
    return this.style === 'blood' ? 11 : this.style === 'crown' ? 8 : 7;
  }

  update(dt: number, world: World): void {
    if (this.burst >= 0) {
      this.burst += dt;
      if (this.burst > 0.3) this.done = true;
      return;
    }
    this.age += dt;
    this.life -= dt;
    this.spin += dt * 12;
    if (this.life <= 0) {
      this.done = true;
      return;
    }
    this.vy += this.gravity * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (solid(world, this.x, this.y) || this.x < 0 || this.x > world.level.pixelWidth) {
      this.land(world);
      return;
    }
    const r = this.radius;
    const hit = strike(world, { x: this.x - r, y: this.y - r, w: r * 2, h: r * 2 }, this.damage, sign(this.vx), this.struck, this.color);
    if (hit.length > 0) {
      if (this.style === 'web') {
        for (const thing of hit) snare(thing);
        audio.play('splash', 1.6);
      }
      if (!this.pierce) this.land(world);
    }
    this.trail(dt, world);
  }

  /** Down on something: the fires burst, everything else is just gone. */
  private land(world: World): void {
    if (this.style !== 'crown') {
      world.particles.burst(this.x, this.y, 6, this.color, { speed: 90, gravity: 300, shape: 'spark' });
      this.done = true;
      return;
    }
    this.burst = 0;
    strike(world, { x: this.x - 24, y: this.y - 30, w: 48, h: 48 }, this.damage, sign(this.vx), this.struck, this.color);
    audio.play('burst', 1.3);
    world.camera.addShake(2);
    world.particles.burst(this.x, this.y, 16, this.color, { speed: 200, gravity: 320, shape: 'circle' });
  }

  private trail(dt: number, world: World): void {
    if (world.time % 0.04 >= dt) return;
    world.particles.spawn({
      x: this.x + rand(-3, 3),
      y: this.y + rand(-3, 3),
      vx: -this.vx * 0.05,
      vy: rand(-20, 20),
      gravity: this.style === 'crown' ? -40 : 120,
      color: this.color,
      size: rand(1.5, 3),
      life: 0.3,
      shape: this.style === 'coin' ? 'spark' : 'circle',
    });
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.burst >= 0) {
      const k = clamp(this.burst / 0.3, 0, 1);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, this.x, this.y, 18 + 30 * k, this.color, 0.7 * (1 - k));
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.translate(this.x, this.y);
    switch (this.style) {
      case 'coin': {
        // Turning over as it flies: a disc seen from its edge and its face.
        const face = Math.abs(Math.cos(this.spin));
        ctx.fillStyle = '#b8861f';
        ctx.beginPath();
        ctx.ellipse(0, 0, 1.5 + 5 * face, 6.5, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#ffd866';
        ctx.beginPath();
        ctx.ellipse(-0.5, -0.5, 1 + 4 * face, 5.4, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#fff6c8';
        ctx.fillRect(-1, -3, 1.6 * face + 0.4, 3);
        break;
      }
      case 'web': {
        ctx.rotate(this.spin * 0.3);
        ctx.fillStyle = 'rgba(232,240,248,0.9)';
        ctx.beginPath();
        ctx.arc(0, 0, 6.5, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(232,240,248,0.75)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * 5, Math.sin(a) * 5);
          ctx.lineTo(Math.cos(a) * 11, Math.sin(a) * 11);
          ctx.stroke();
        }
        break;
      }
      case 'blood': {
        // A crescent, opening forwards, along the way it flies.
        ctx.rotate(Math.atan2(this.vy, this.vx));
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, 0, 0, 20, 'rgba(255,60,90,0.5)');
        ctx.fillStyle = '#ff5470';
        ctx.beginPath();
        ctx.moveTo(4, -12);
        ctx.quadraticCurveTo(16, 0, 4, 12);
        ctx.quadraticCurveTo(9, 0, 4, -12);
        ctx.fill();
        ctx.fillStyle = '#ffd6de';
        ctx.beginPath();
        ctx.moveTo(6, -8);
        ctx.quadraticCurveTo(13, 0, 6, 8);
        ctx.quadraticCurveTo(9, 0, 6, -8);
        ctx.fill();
        break;
      }
      case 'crown': {
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, 0, 0, 18, this.color, 0.75);
        ctx.fillStyle = '#fff8e0';
        ctx.beginPath();
        ctx.arc(0, 0, 4, 0, TAU);
        ctx.fill();
        break;
      }
    }
    ctx.restore();
  }

  override lights(): GlowLight[] {
    if (this.style === 'coin' || this.style === 'web') return [];
    const rgb = this.style === 'blood' ? '255,70,100' : '255,190,110';
    return [{ x: this.x, y: this.y, radius: this.burst >= 0 ? 110 : 70, rgb, strength: 0.75, tint: 0.35 }];
  }
}

/**
 * Ankhor: a column of sunlight on the nearest enemy. A ring marks the spot,
 * then the sky answers - and the column follows what it was called down on,
 * slowly, burning everything in it every 0.3 s.
 */
class SunColumn extends SkillEffect {
  private static readonly MARK = 0.4;
  private static readonly BURN = 1.2;
  private static readonly FADE = 0.25;
  private t = 0;
  private tick = 0;
  private lit = false;
  private x: number;
  private floor: number;
  private readonly target: Target['thing'] | null;

  constructor(world: World) {
    super();
    const p = world.player;
    const t = nearest(world, 340);
    this.target = t?.thing ?? null;
    this.x = t ? t.x : ahead(world, 130);
    this.floor = floorUnder(world, this.x, (t ? t.bottom : p.bottom) - 12);
    audio.play('beamCharge', 1.2);
  }

  private get burning(): boolean {
    return this.t >= SunColumn.MARK && this.t < SunColumn.MARK + SunColumn.BURN;
  }

  update(dt: number, world: World): void {
    this.t += dt;
    if (this.t >= SunColumn.MARK + SunColumn.BURN + SunColumn.FADE) {
      this.done = true;
      return;
    }
    if (this.target && !this.target.dead) {
      const step = 160 * dt;
      this.x += clamp(this.target.cx - this.x, -step, step);
    }
    if (!this.burning) return;
    if (!this.lit) {
      this.lit = true;
      audio.play('beam', 1.3);
    }
    this.tick -= dt;
    if (this.tick > 0) return;
    this.tick = 0.3;
    this.struck.clear();
    strike(world, { x: this.x - 22, y: this.floor - 640, w: 44, h: 640 }, 1, sign(this.x - world.player.cx), this.struck, '#fff1c0');
    world.particles.burst(this.x, this.floor - 4, 8, 'rgba(255,230,160,0.9)', { speed: 140, gravity: -60, shape: 'spark', angle: -Math.PI / 2, spread: 1.4 });
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const x = this.x;
    const y = this.floor;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (this.t < SunColumn.MARK) {
      // The mark: a ring on the floor, drawing in, and a thread of light.
      const k = this.t / SunColumn.MARK;
      ctx.strokeStyle = `rgba(255,220,140,${(0.4 + 0.5 * k).toFixed(3)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x, y - 2, 40 - 18 * k, 7 - 3 * k, 0, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,230,160,${(0.15 + 0.25 * k).toFixed(3)})`;
      ctx.fillRect(x - 1, y - 640, 2, 640);
    } else {
      const fade = this.burning ? 1 : 1 - (this.t - SunColumn.MARK - SunColumn.BURN) / SunColumn.FADE;
      const wob = Math.sin(this.t * 30) * 2;
      const g = ctx.createLinearGradient(x - 26, 0, x + 26, 0);
      g.addColorStop(0, 'rgba(255,200,110,0)');
      g.addColorStop(0.3, `rgba(255,214,140,${(0.45 * fade).toFixed(3)})`);
      g.addColorStop(0.5, `rgba(255,250,225,${(0.9 * fade).toFixed(3)})`);
      g.addColorStop(0.7, `rgba(255,214,140,${(0.45 * fade).toFixed(3)})`);
      g.addColorStop(1, 'rgba(255,200,110,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 26 - wob, y - 640, 52 + wob * 2, 640);
      glow(ctx, x, y - 6, 60, `rgba(255,226,150,${(0.6 * fade).toFixed(3)})`);
      ctx.strokeStyle = `rgba(255,240,200,${(0.7 * fade).toFixed(3)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x, y - 2, 30, 6, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  override lights(): GlowLight[] {
    if (this.t < SunColumn.MARK) return [{ x: this.x, y: this.floor - 10, radius: 60, rgb: '255,220,140', strength: 0.6, tint: 0.3 }];
    return [
      { x: this.x, y: this.floor - 40, radius: 170, rgb: '255,226,150', strength: 0.9, tint: 0.45 },
      { x: this.x, y: this.floor - 220, radius: 140, rgb: '255,226,150', strength: 0.7, tint: 0.35 },
    ];
  }
}

/** Something that rises out of the floor, holds and sinks: a pillar of fire or a spout of water. */
interface Spout {
  x: number;
  floor: number;
  t: number;
}

/**
 * Ignivor: the floor ahead of the hero breaks open as fire, pillar after
 * pillar, 40 px apart, until a wall or the edge of the floor stops it. Each
 * thing in the way is struck once.
 */
class FireWave extends SkillEffect {
  private static readonly COUNT = 7;
  private static readonly EVERY = 0.05;
  private static readonly LIFE = 0.6;
  private static readonly HEIGHT = 82;
  private readonly pillars: Spout[] = [];
  private readonly dir: number;
  private readonly floor: number;
  private readonly from: number;
  private timer = 0;
  private stopped = false;

  constructor(world: World) {
    super();
    const p = world.player;
    this.dir = p.facing;
    this.from = p.cx + this.dir * 34;
    this.floor = floorUnder(world, p.cx, p.bottom - 6);
    audio.play('burst', 0.8);
    world.camera.addShake(3);
  }

  private power(s: Spout): number {
    const rise = clamp(s.t / 0.1, 0, 1);
    const fall = clamp((FireWave.LIFE - s.t) / 0.25, 0, 1);
    return Math.min(rise, fall);
  }

  update(dt: number, world: World): void {
    this.timer += dt;
    while (!this.stopped && this.pillars.length < FireWave.COUNT && this.timer >= this.pillars.length * FireWave.EVERY) {
      const x = this.from + this.dir * this.pillars.length * 40;
      if (solid(world, x, this.floor - 16) || !floorAt(world, x, this.floor)) {
        this.stopped = true;
        break;
      }
      this.pillars.push({ x, floor: this.floor, t: 0 });
      if (this.pillars.length % 2 === 1) audio.play('burst', 1.3);
      world.particles.burst(x, this.floor - 4, 8, '#ffae54', { speed: 200, gravity: 300, shape: 'spark', angle: -Math.PI / 2, spread: 1.2 });
    }
    for (const s of this.pillars) {
      s.t += dt;
      const k = this.power(s);
      if (k < 0.4) continue;
      const h = FireWave.HEIGHT * k;
      strike(world, { x: s.x - 17, y: s.floor - h, w: 34, h }, 2, this.dir, this.struck, '#ffb070');
    }
    const spawning = !this.stopped && this.pillars.length < FireWave.COUNT;
    if (!spawning && this.pillars.every((s) => s.t >= FireWave.LIFE)) this.done = true;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const s of this.pillars) {
      const k = this.power(s);
      if (k <= 0.02) continue;
      const h = FireWave.HEIGHT * k;
      const top = s.floor - h;
      const g = ctx.createLinearGradient(0, top, 0, s.floor);
      g.addColorStop(0, 'rgba(255,120,40,0)');
      g.addColorStop(0.3, `rgba(255,150,60,${(0.75 * k).toFixed(3)})`);
      g.addColorStop(1, `rgba(255,236,170,${(0.95 * k).toFixed(3)})`);
      ctx.fillStyle = g;
      const wob = Math.sin(s.t * 40 + s.x) * 4;
      ctx.beginPath();
      ctx.moveTo(s.x - 17, s.floor);
      ctx.quadraticCurveTo(s.x - 19, s.floor - h * 0.5, s.x + wob, top);
      ctx.quadraticCurveTo(s.x + 19, s.floor - h * 0.5, s.x + 17, s.floor);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = `rgba(255,252,230,${(0.7 * k).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(s.x - 6, s.floor);
      ctx.quadraticCurveTo(s.x, s.floor - h * 0.75, s.x + 6, s.floor);
      ctx.fill();
    }
    ctx.restore();
  }

  override lights(): GlowLight[] {
    const out: GlowLight[] = [];
    for (const s of this.pillars) {
      const k = this.power(s);
      if (k > 0.1) out.push({ x: s.x, y: s.floor - 40, radius: 100 * k, rgb: '255,150,60', strength: 0.8, tint: 0.4 });
    }
    return out;
  }
}

/**
 * Thalassa: the floor under up to three enemies starts to bubble, and a breath
 * later the water comes up through it in a column.
 */
class Springtide extends SkillEffect {
  private static readonly BUBBLE = 0.42;
  private static readonly SPOUT = 0.45;
  private static readonly HEIGHT = 118;
  private readonly spouts: Spout[] = [];

  constructor(world: World) {
    super();
    const p = world.player;
    const near = targets(world)
      .filter((t) => Math.abs(t.x - p.cx) < 380 && Math.abs(t.y - p.cy) < 300)
      .sort((a, b) => Math.abs(a.x - p.cx) - Math.abs(b.x - p.cx));
    const spots: { x: number; from: number }[] = [];
    for (const t of near) {
      // Two enemies side by side share a spout.
      if (spots.some((s) => Math.abs(s.x - t.x) < 30)) continue;
      spots.push({ x: t.x, from: t.bottom - 12 });
      if (spots.length === 3) break;
    }
    if (spots.length === 0) spots.push({ x: ahead(world, 120), from: p.bottom - 12 });
    for (const s of spots) this.spouts.push({ x: s.x, floor: floorUnder(world, s.x, s.from), t: 0 });
    audio.play('splash', 0.9);
  }

  private power(s: Spout): number {
    const t = s.t - Springtide.BUBBLE;
    if (t < 0) return 0;
    return Math.min(clamp(t / 0.08, 0, 1), clamp((Springtide.SPOUT - t) / 0.15, 0, 1));
  }

  update(dt: number, world: World): void {
    let live = false;
    for (const s of this.spouts) {
      const before = s.t;
      s.t += dt;
      if (before < Springtide.BUBBLE && s.t >= Springtide.BUBBLE) {
        audio.play('splash', 1.2);
        world.particles.burst(s.x, s.floor - 6, 16, 'rgba(160,240,225,0.9)', { speed: 260, gravity: 600, angle: -Math.PI / 2, spread: 0.9 });
      }
      if (s.t < Springtide.BUBBLE + Springtide.SPOUT) live = true;
      const k = this.power(s);
      if (k < 0.4) continue;
      const h = Springtide.HEIGHT * k;
      strike(world, { x: s.x - 16, y: s.floor - h, w: 32, h }, 2, sign(s.x - world.player.cx), this.struck, '#a8f2e2');
    }
    if (!live) this.done = true;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    for (const s of this.spouts) {
      if (s.t < Springtide.BUBBLE) {
        const k = s.t / Springtide.BUBBLE;
        ctx.fillStyle = `rgba(127,227,205,${(0.25 + 0.4 * k).toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(s.x, s.floor - 1, 16 + 6 * k, 4, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(210,250,240,0.8)';
        for (let i = 0; i < 3; i++) {
          const bx = s.x + Math.sin(s.t * 13 + i * 2.1) * 10;
          const by = s.floor - 3 - ((s.t * 50 + i * 7) % 12);
          ctx.beginPath();
          ctx.arc(bx, by, 1.6, 0, TAU);
          ctx.fill();
        }
        continue;
      }
      const k = this.power(s);
      if (k <= 0.02) continue;
      const h = Springtide.HEIGHT * k;
      const top = s.floor - h;
      const g = ctx.createLinearGradient(0, top, 0, s.floor);
      g.addColorStop(0, `rgba(220,255,248,${(0.9 * k).toFixed(3)})`);
      g.addColorStop(0.4, `rgba(127,227,205,${(0.8 * k).toFixed(3)})`);
      g.addColorStop(1, `rgba(40,120,140,${(0.7 * k).toFixed(3)})`);
      ctx.fillStyle = g;
      const wob = Math.sin(s.t * 36 + s.x) * 3;
      ctx.beginPath();
      ctx.moveTo(s.x - 15, s.floor);
      ctx.lineTo(s.x - 12 + wob, top + 8);
      ctx.quadraticCurveTo(s.x, top - 8, s.x + 12 + wob, top + 8);
      ctx.lineTo(s.x + 15, s.floor);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = `rgba(240,255,252,${(0.6 * k).toFixed(3)})`;
      ctx.fillRect(s.x - 3 + wob * 0.5, top + 6, 4, h - 10);
    }
    ctx.restore();
  }

  override lights(): GlowLight[] {
    return this.spouts
      .filter((s) => this.power(s) > 0.1)
      .map((s) => ({ x: s.x, y: s.floor - 50, radius: 110, rgb: '127,227,205', strength: 0.7, tint: 0.35 }));
  }
}

/**
 * Morvain: a wave of shadow along the floor. It rides the floor it starts on,
 * stops at a wall and at the edge of a drop, and strikes each thing once.
 */
class FloorWave extends SkillEffect {
  private t = 0;

  constructor(
    private x: number,
    private readonly floor: number,
    private readonly dir: number,
  ) {
    super();
  }

  update(dt: number, world: World): void {
    this.t += dt;
    this.x += this.dir * 330 * dt;
    if (this.t > 0.9 || solid(world, this.x + this.dir * 12, this.floor - 12) || !floorAt(world, this.x, this.floor)) {
      world.particles.burst(this.x, this.floor - 10, 8, 'rgba(170,150,240,0.9)', { speed: 120, gravity: 200, shape: 'spark' });
      this.done = true;
      return;
    }
    strike(world, { x: this.x - 14, y: this.floor - 34, w: 28, h: 34 }, 2, this.dir, this.struck, '#c8b8ff');
    if (world.time % 0.03 < dt) {
      world.particles.spawn({
        x: this.x + rand(-8, 8),
        y: this.floor - rand(2, 24),
        vx: -this.dir * rand(20, 60),
        vy: -rand(30, 90),
        gravity: -20,
        color: Math.random() < 0.5 ? 'rgba(154,134,232,0.8)' : 'rgba(40,30,70,0.7)',
        size: rand(2, 3.5),
        life: 0.35,
        shape: 'circle',
      });
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const k = clamp(1 - this.t / 0.9, 0, 1);
    ctx.save();
    ctx.translate(this.x, this.floor);
    ctx.scale(this.dir, 1);
    ctx.globalAlpha = 0.5 + 0.5 * k;
    ctx.fillStyle = '#2a2145';
    ctx.beginPath();
    ctx.moveTo(-22, 0);
    ctx.quadraticCurveTo(-6, -10, 2, -34);
    ctx.quadraticCurveTo(10, -16, 14, 0);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(154,134,232,0.85)';
    ctx.beginPath();
    ctx.moveTo(-12, 0);
    ctx.quadraticCurveTo(-2, -8, 3, -24);
    ctx.quadraticCurveTo(8, -10, 10, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  override lights(): GlowLight[] {
    return [{ x: this.x, y: this.floor - 16, radius: 80, rgb: '154,134,232', strength: 0.7, tint: 0.35 }];
  }
}

/**
 * Umbra: down into a pool of dark, unhurt for the moment it takes, and up
 * again out of another behind the nearest enemy - already swinging the heavy
 * strike. With nothing near, a short step forward through the dark.
 */
class ShadeStep extends SkillEffect {
  private static readonly SINK = 0.22;
  private t = 0;
  private risen = false;
  private readonly fromX: number;
  private readonly fromY: number;
  private toX = 0;
  private toY = 0;

  constructor(world: World) {
    super();
    const p = world.player;
    this.fromX = p.cx;
    this.fromY = p.bottom;
    p.invuln = Math.max(p.invuln, 0.5);
    audio.play('magic', 0.7);
    world.particles.burst(p.cx, p.bottom - 4, 14, 'rgba(120,90,200,0.9)', { speed: 90, gravity: -40, shape: 'circle' });
  }

  update(dt: number, world: World): void {
    const p = world.player;
    this.t += dt;
    if (!this.risen) {
      p.vx *= 0.5;
      if (this.t < ShadeStep.SINK) return;
      this.risen = true;
      this.rise(world);
      return;
    }
    if (this.t > ShadeStep.SINK + 0.4) this.done = true;
  }

  /** Where he comes up: past the enemy, or short of it if past is a wall. */
  private rise(world: World): void {
    const p = world.player;
    const t = nearest(world, 280);
    const options: { x: number; face: number }[] = [];
    if (t) {
      const side = sign(t.x - p.cx) || p.facing;
      options.push({ x: t.x + side * 46, face: -side }, { x: t.x - side * 46, face: side });
    } else {
      options.push({ x: p.cx + p.facing * 130, face: p.facing }, { x: p.cx + p.facing * 70, face: p.facing });
    }
    for (const o of options) {
      const x = world.level.clampX(o.x - p.w / 2, p.w);
      if (!clearPath(world, p.cx, x + p.w / 2, p.cy)) continue;
      if (world.level.rectHitsSolid(x, p.y, p.w, p.h)) continue;
      if (world.level.groundBelow(x + p.w / 2, p.bottom - 2, 5) >= 5 * TILE) continue;
      if (world.level.rectHitsHazard(x, p.y, p.w, p.h + 2 * TILE)) continue;
      p.x = x;
      p.facing = o.face > 0 ? 1 : -1;
      break;
    }
    p.vx = 0;
    p.invuln = Math.max(p.invuln, 0.25);
    this.toX = p.cx;
    this.toY = p.bottom;
    p.strikeFromShadow();
    audio.play('phase', 1.5);
    world.particles.burst(p.cx, p.bottom - 10, 20, 'rgba(201,184,255,0.9)', { speed: 160, gravity: -30, shape: 'spark' });
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const pool = (x: number, y: number, k: number): void => {
      if (k <= 0) return;
      ctx.fillStyle = `rgba(14,8,28,${(0.85 * k).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(x, y - 1, 24 * k + 6, 5, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = `rgba(201,184,255,${(0.6 * k).toFixed(3)})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    };
    ctx.save();
    pool(this.fromX, this.fromY, this.risen ? 1 - (this.t - ShadeStep.SINK) / 0.4 : Math.min(1, this.t / 0.1));
    if (this.risen) pool(this.toX, this.toY, 1 - (this.t - ShadeStep.SINK) / 0.4);
    ctx.restore();
  }
}

/**
 * The warden: a charge in crystal, the hero's own roll made longer and made
 * to cut - unhurt while it lasts, and everything in the way struck once.
 */
class CrystalCharge extends SkillEffect {
  private t = 0;
  private readonly shards: { x: number; y: number; life: number; a: number }[] = [];

  constructor(world: World) {
    super();
    const p = world.player;
    p.dashTimer = 0.3;
    p.vy = 0;
    audio.play('dash', 0.8);
    audio.play('deflect', 1.2);
  }

  update(dt: number, world: World): void {
    const p = world.player;
    this.t += dt;
    for (const s of this.shards) s.life -= dt * 2.5;
    if (this.t < 0.32) {
      strike(world, { x: p.x - 10, y: p.y - 6, w: p.w + 20, h: p.h + 10 }, 2, p.facing, this.struck, '#e2c9ff');
      if (Math.random() < 0.7) this.shards.push({ x: p.cx + rand(-8, 8), y: p.cy + rand(-12, 12), life: 1, a: rand(0, TAU) });
    } else if (this.shards.every((s) => s.life <= 0)) {
      this.done = true;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const s of this.shards) {
      if (s.life <= 0) continue;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.a);
      ctx.globalAlpha = s.life;
      ctx.fillStyle = '#c79bff';
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(3.5, 0);
      ctx.lineTo(0, 7);
      ctx.lineTo(-3.5, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
}

/**
 * The Prismarch: crystals out of the dark above, one after another, onto the
 * nearest enemy ahead - or the floor ahead, with nothing there.
 */
class CrystalRain extends SkillEffect {
  private static readonly COUNT = 6;
  private static readonly EVERY = 0.08;
  /** Where each comes down, around the mark: a pattern, not a scatter, so a cast is worth the same twice. */
  private static readonly SPREAD = [-24, 12, -6, 26, -14, 4];
  private readonly drops: { x: number; y: number; vy: number; struck: Set<object>; dead: boolean }[] = [];
  private readonly center: number;
  private readonly top: number;
  private timer = 0;

  constructor(world: World) {
    super();
    const p = world.player;
    const t = nearest(world, 360);
    this.center = t ? t.x : ahead(world, 140);
    this.top = (t ? t.y : p.cy) - 300;
    audio.play('magic', 1.4);
  }

  update(dt: number, world: World): void {
    this.timer += dt;
    while (this.drops.length < CrystalRain.COUNT && this.timer >= this.drops.length * CrystalRain.EVERY) {
      const i = this.drops.length;
      this.drops.push({ x: this.center + CrystalRain.SPREAD[i], y: this.top + rand(-30, 30), vy: 520, struck: new Set(), dead: false });
      audio.play('deflect', 1.6 + Math.random() * 0.3);
    }
    for (const d of this.drops) {
      if (d.dead) continue;
      d.vy += 900 * dt;
      d.y += d.vy * dt;
      if (solid(world, d.x, d.y + 8)) {
        d.dead = true;
        world.particles.burst(d.x, d.y + 6, 8, '#bff4ff', { speed: 130, gravity: 400, shape: 'spark', angle: -Math.PI / 2, spread: 2 });
        continue;
      }
      if (strike(world, { x: d.x - 6, y: d.y - 9, w: 12, h: 18 }, 1, sign(d.x - world.player.cx), d.struck, '#bff4ff').length > 0) d.dead = true;
      if (d.y > world.level.pixelHeight) d.dead = true;
    }
    if (this.drops.length >= CrystalRain.COUNT && this.drops.every((d) => d.dead)) this.done = true;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    for (const d of this.drops) {
      if (d.dead) continue;
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, 0, 0, 16, 'rgba(143,232,255,0.5)');
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#8fe8ff';
      ctx.beginPath();
      ctx.moveTo(0, 11);
      ctx.lineTo(5, -2);
      ctx.lineTo(0, -11);
      ctx.lineTo(-5, -2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#eafcff';
      ctx.beginPath();
      ctx.moveTo(0, 8);
      ctx.lineTo(2, -2);
      ctx.lineTo(0, -8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  override lights(): GlowLight[] {
    return this.drops.filter((d) => !d.dead).map((d) => ({ x: d.x, y: d.y, radius: 60, rgb: '143,232,255', strength: 0.7, tint: 0.35 }));
  }
}

/* ---------------------------------------------------------------- casts */

/** The hydra's five heads, one fire each, in their own colours. */
const CROWN_COLORS = ['#9fe07a', '#ff9a4a', '#d9c39a', '#9cc8ff', '#ffd866'];

/** Throws a fan of shots from the hero's hand. */
function fan(
  world: World,
  count: number,
  spread: number,
  lift: number,
  speed: number,
  make: (x: number, y: number, vx: number, vy: number, i: number) => Shot,
): SkillEffect[] {
  const p = world.player;
  const out: SkillEffect[] = [];
  for (let i = 0; i < count; i++) {
    const a = -lift + (count > 1 ? (i / (count - 1) - 0.5) * spread : 0);
    out.push(make(p.cx + p.facing * 10, p.cy - 4, Math.cos(a) * speed * p.facing, Math.sin(a) * speed, i));
  }
  return out;
}

/** The picked attack, cast: whatever it puts into the world. */
export function castSkill(id: SkillId, world: World): SkillEffect[] {
  const p = world.player;
  switch (id) {
    case 'klatschsprung':
      return [new SlamHop(world)];
    case 'goldregen':
      audio.play('coin', 0.8);
      return fan(world, 4, 0.36, 0.2, 430, (x, y, vx, vy) => new Shot(x, y, vx, vy, 500, 'coin', '#ffd866', 1, 1.2));
    case 'sonnenblick':
      return [new SunColumn(world)];
    case 'netzschuss':
      audio.play('shoot', 1.3);
      return fan(world, 3, 0.36, 0.12, 400, (x, y, vx, vy) => new Shot(x, y, vx, vy, 260, 'web', '#e8f0f8', 1, 1.1));
    case 'feuerwelle':
      return [new FireWave(world)];
    case 'springflut':
      return [new Springtide(world)];
    case 'blutsicheln':
      audio.play('swing', 0.7);
      return fan(world, 3, 0.36, 0.12, 400, (x, y, vx, vy) => new Shot(x, y, vx, vy, 0, 'blood', '#ff5470', 1, 0.8, true));
    case 'schattenwelle': {
      const floor = floorUnder(world, p.cx, p.bottom - 6);
      audio.play('slam', 0.9);
      world.camera.addShake(4);
      world.particles.burst(p.cx, floor - 4, 18, 'rgba(154,134,232,0.9)', { speed: 180, gravity: 300, angle: -Math.PI / 2, spread: 2.4 });
      return [new FloorWave(p.cx + p.facing * 16, floor, p.facing), new FloorWave(p.cx - p.facing * 16, floor, -p.facing)];
    }
    case 'schattensprung':
      return [new ShadeStep(world)];
    case 'splitteransturm':
      return [new CrystalCharge(world)];
    case 'kronenfeuer':
      audio.play('fireball', 0.9);
      return fan(world, 5, 0.8, 0.75, 400, (x, y, vx, vy, i) => new Shot(x, y, vx, vy, 900, 'crown', CROWN_COLORS[i], 1, 1.6));
    case 'splitterregen':
      return [new CrystalRain(world)];
  }
}

/** Arachna's silk on whatever it binds, drawn over it while it holds. */
export function drawSnare(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, k: number): void {
  ctx.save();
  ctx.globalAlpha = 0.35 + 0.5 * clamp(k, 0, 1);
  ctx.strokeStyle = '#e8f0f8';
  ctx.lineWidth = 1.2;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2 + 4;
  const ry = h / 2 + 4;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI;
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(a) * rx, cy - Math.sin(a) * ry);
    ctx.lineTo(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx * 0.6, ry * 0.6, 0, 0, TAU);
  ctx.stroke();
  ctx.restore();
}
