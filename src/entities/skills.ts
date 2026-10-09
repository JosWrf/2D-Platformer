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
import { line as pixelLine, rect as pixelRect, ring as pixelRing } from '../render/pen';
import { ART } from '../render/pixel';
import { dirIndex } from '../render/sheet';
import { glow } from '../render/sprites';
import type { World } from '../world/context';
import { TILE } from '../world/tiles';
import { BOSS_KINDS, type EnemyKind, type GlowLight } from './enemy';
import { BLOOD, COIN, ROCK, SHARD, WEB } from './projectile-art';
import type { RelicId } from './relics';
import {
  CROWN_FIRE,
  CROWN_SHOT,
  CRYSTAL,
  FIRE_PILLAR,
  PENDULUM,
  PHANTOM,
  PILLAR_STEPS,
  SHADOW_CREST,
  SICKLE,
  STATUE,
  WATER_PILLAR,
  WISP,
} from './skill-art';

export type SkillId =
  | 'klatschsprung'
  | 'felswurf'
  | 'goldregen'
  | 'trugbild'
  | 'sonnenblick'
  | 'irrlichter'
  | 'netzschuss'
  | 'feuerwelle'
  | 'mondsichel'
  | 'springflut'
  | 'steinsturz'
  | 'pendelschlag'
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
    id: 'felswurf',
    name: 'Felswurf',
    text: 'Ein Brocken im Bogen, der dort, wo er aufschlägt, weiterrollt: 2 Schaden an allem, was er trifft.',
    color: '#d6a27a',
    from: 'Grimmzahn',
    relic: 'keilerhaut',
    cooldown: 4,
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
    id: 'trugbild',
    name: 'Trugbild',
    text: 'Ein Trugbild von dir springt nach vorn und schlägt zu: 2 Schaden an allem auf seinem Weg.',
    color: '#d9a8ff',
    from: 'Maskarill',
    relic: 'gauklerschritt',
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
    id: 'irrlichter',
    name: 'Irrlichter',
    text: 'Drei Irrlichter kreisen vier Sekunden um dich: Jedes trifft, was es berührt, für 1.',
    color: '#fff0a8',
    from: 'Nyktos',
    relic: 'lichtkern',
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
    id: 'mondsichel',
    name: 'Mondsichel',
    text: 'Eine Sichel aus Mondlicht fliegt hinaus und kehrt zurück: je 1 Schaden auf dem Hin- und dem Rückweg.',
    color: '#cdd8ff',
    from: 'Sol und Luna',
    relic: 'zwillingsstern',
    cooldown: 3,
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
    id: 'steinsturz',
    name: 'Steinsturz',
    text: 'Ein steinerner Wasserspeier stürzt auf den nächsten Feind: 3 Schaden, wo er aufschlägt.',
    color: '#b8c2d0',
    from: 'Grauwacht',
    relic: 'steinblick',
    cooldown: 4.5,
  },
  {
    id: 'pendelschlag',
    name: 'Pendelschlag',
    text: 'Ein Pendel aus Messing schwingt vor dir über den Boden: 2 Schaden an allem, was es streift.',
    color: '#f0c27a',
    from: 'Tickmar',
    relic: 'taktgeber',
    cooldown: 4,
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

/* ------------------------------------------------------------- drawing */

/*
 * Every cast is drawn on the actor layer with the hero, in hard shapes on
 * whole art pixels: what is meant to read as solid - a pillar of fire, a
 * ring of force, a brass bob - is drawn opaque and gets the outline; what is
 * light or fading is drawn translucent and comes out as an ordered pattern of
 * pixels (see settleActors), thinning as it fades.
 */

/**
 * A ring on the floor seen from the side: the band between an ellipse of
 * radii rx × ry round (cx, cy) and one `thick` art pixels smaller, on whole
 * art pixels - one run either side of the hole per row.
 */
function floorRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, color: string, thick = 1): void {
  const ax = cx / ART;
  const ay = cy / ART;
  const ox = rx / ART;
  const oy = Math.max(0.5, ry / ART);
  const ix = ox - thick;
  const iy = oy - thick;
  ctx.fillStyle = color;
  for (let row = Math.floor(ay - oy); row <= Math.ceil(ay + oy); row++) {
    const v = row + 0.5 - ay;
    if (Math.abs(v) > oy) continue;
    const outer = ox * Math.sqrt(1 - (v / oy) ** 2);
    const l = Math.ceil(ax - outer - 0.5);
    const r = Math.floor(ax + outer - 0.5);
    if (r < l) continue;
    const inner = iy > 0 && ix > 0 && Math.abs(v) < iy ? ix * Math.sqrt(1 - (v / iy) ** 2) : 0;
    if (inner < 0.5) {
      ctx.fillRect(l * ART, row * ART, (r - l + 1) * ART, ART);
      continue;
    }
    const il = Math.ceil(ax - inner - 0.5);
    const ir = Math.floor(ax + inner - 0.5);
    if (il > l) ctx.fillRect(l * ART, row * ART, (il - l) * ART, ART);
    if (r > ir) ctx.fillRect((ir + 1) * ART, row * ART, (r - ir) * ART, ART);
  }
}

/** Draws with a fade: opaque is body, below about 0.6 it is the settle pass's thinning pattern. */
function faded(ctx: CanvasRenderingContext2D, alpha: number, draw: () => void): void {
  if (alpha <= 0.02) return;
  ctx.globalAlpha = Math.min(1, alpha);
  draw();
  ctx.globalAlpha = 1;
}

/** The tallest drawn pillar no taller than h art pixels. */
function pillarStep(h: number): number {
  let best: number = PILLAR_STEPS[0];
  for (const s of PILLAR_STEPS) if (s <= h + 1) best = s;
  return best;
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

  /**
   * A ring of slime-green force opening out over the floor where he lands:
   * two art pixels thick and pale while fresh, one and darker as it spreads,
   * and a thinning pattern as it goes.
   */
  draw(ctx: CanvasRenderingContext2D): void {
    if (this.ring < 0) return;
    const k = clamp(this.ring / 0.4, 0, 1);
    const color = k < 0.35 ? '#d3fc7e' : k < 0.7 ? '#99e65f' : '#5ac54f';
    faded(ctx, k < 0.55 ? 1 : (1 - k) * 1.3, () =>
      floorRing(ctx, this.ringX, this.ringY - 2, 20 + 62 * k, 5 + 9 * k, color, k < 0.4 ? 2 : 1),
    );
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

  /**
   * The coin and the ball of silk turn over in drawn frames, the sickle of
   * blood is the blood crescent the bat lord throws, in the hero's own
   * light, and each of the five fires is a hot core in its head's colour. A
   * fire that has burst is a ring of its colour opening out, thinning away.
   */
  draw(ctx: CanvasRenderingContext2D): void {
    const fire = Math.max(0, CROWN_COLORS.indexOf(this.color));
    if (this.burst >= 0) {
      const k = clamp(this.burst / 0.3, 0, 1);
      const color = CROWN_FIRE[fire];
      glow(ctx, this.x, this.y, 18 + 30 * k, color, 0.7 * (1 - k));
      faded(ctx, 1 - k, () => pixelRing(ctx, this.x, this.y, 8 + 24 * k, color, k < 0.5 ? 2 : 1));
      return;
    }
    const turn = (rate: number, frames: number): number =>
      ((Math.floor((this.spin * rate * frames) / TAU) % frames) + frames) % frames;
    switch (this.style) {
      case 'coin':
        COIN.draw(ctx, `c${turn(2, 4)}`, this.x, this.y, 3, 3);
        break;
      case 'web':
        WEB.draw(ctx, turn(1.2, 2) === 0 ? 'w0' : 'w1', this.x, this.y, 5, 5, 1, 'friendly');
        break;
      case 'blood':
        glow(ctx, this.x, this.y, 18, '#ea323c', 0.5);
        BLOOD.draw(ctx, 'mid', this.x, this.y, 7, 5, this.vx < 0 ? -1 : 1);
        break;
      case 'crown':
        glow(ctx, this.x, this.y, 18, CROWN_FIRE[fire], 0.75);
        CROWN_SHOT.draw(ctx, 'f', this.x, this.y, 2, 2, 1, `h${fire}`);
        break;
    }
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

  /**
   * The mark is a ring on the floor drawing in and a single thread of light
   * coming down. The column itself is three hard bands - a thin pattern of
   * gold at its edges, a denser one inside, and a white core opaque enough
   * to be solid - that breathe a pixel wider and narrower, over a ring
   * burned into the floor.
   */
  draw(ctx: CanvasRenderingContext2D): void {
    const x = this.x;
    const y = this.floor;
    if (this.t < SunColumn.MARK) {
      const k = this.t / SunColumn.MARK;
      faded(ctx, 0.55 + 0.45 * k, () => floorRing(ctx, x, y - 2, 40 - 18 * k, 7 - 3 * k, '#ffc825'));
      faded(ctx, 0.3 + 0.3 * k, () => pixelRect(ctx, x - 1, y - 640, 2, 640, '#ffeb57'));
      return;
    }
    const fade = this.burning ? 1 : 1 - (this.t - SunColumn.MARK - SunColumn.BURN) / SunColumn.FADE;
    const b = Math.floor(this.t * 15) % 2 === 0 ? ART : 0;
    const top = y - 640;
    glow(ctx, x, y - 6, 60, '#ffc825', 0.6 * fade);
    // Side by side, never over each other: laid over each other, two thin
    // patterns would add up to a solid band.
    faded(ctx, 0.3 * fade, () => {
      pixelRect(ctx, x - 26 - b, top, 12, 640, '#ffc825');
      pixelRect(ctx, x + 14 + b, top, 12, 640, '#ffc825');
    });
    faded(ctx, 0.55 * fade, () => {
      pixelRect(ctx, x - 14 - b, top, 10 + b, 640, '#ffeb57');
      pixelRect(ctx, x + 4, top, 10 + b, 640, '#ffeb57');
    });
    faded(ctx, fade > 0.5 ? 1 : fade * 1.2, () => pixelRect(ctx, x - 4, top, 8, 640, '#ffffff'));
    faded(ctx, fade, () => floorRing(ctx, x, y - 2, 30, 6, '#ffeb57'));
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

  /**
   * Each pillar is a drawn flame at the height it has risen to - a handful of
   * heights, each in three flickers - opaque and outlined like anything else
   * that hurts.
   */
  draw(ctx: CanvasRenderingContext2D): void {
    for (const s of this.pillars) {
      const k = this.power(s);
      if (k <= 0.02) continue;
      const step = pillarStep((FireWave.HEIGHT * k) / ART);
      const flicker = Math.floor(s.t * 18 + s.x * 0.1) % 3;
      FIRE_PILLAR.draw(ctx, `${step}-${flicker}`, s.x, s.floor, 8, step);
    }
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

  /**
   * First the floor wells up - a strip of water on the rim, thickening, and
   * bubbles of a pixel each climbing out of it - then the spout is a drawn
   * column of water at the height it has reached.
   */
  draw(ctx: CanvasRenderingContext2D): void {
    for (const s of this.spouts) {
      if (s.t < Springtide.BUBBLE) {
        const k = s.t / Springtide.BUBBLE;
        faded(ctx, 0.3 + 0.5 * k, () => pixelRect(ctx, s.x - 16 - 6 * k, s.floor - 2, 32 + 12 * k, 2, '#0098dc'));
        ctx.fillStyle = '#94fdff';
        for (let i = 0; i < 3; i++) {
          const bx = s.x + Math.round(Math.sin(s.t * 13 + i * 2.1) * 5) * ART;
          const by = s.floor - 4 - Math.floor(((s.t * 50 + i * 7) % 12) / ART) * ART;
          ctx.fillRect(Math.floor(bx / ART) * ART, Math.floor(by / ART) * ART, ART, ART);
        }
        continue;
      }
      const k = this.power(s);
      if (k <= 0.02) continue;
      const step = pillarStep((Springtide.HEIGHT * k) / ART);
      WATER_PILLAR.draw(ctx, `${step}-${Math.floor(s.t * 16) % 2}`, s.x, s.floor, 7, step);
    }
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

  /** A crest of shadow with violet burning in its heart, flickering in four frames, thinning out at the end. */
  draw(ctx: CanvasRenderingContext2D): void {
    const k = clamp(1 - this.t / 0.9, 0, 1);
    const dir: 1 | -1 = this.dir < 0 ? -1 : 1;
    faded(ctx, k > 0.3 ? 1 : 0.4 + k * 2, () =>
      SHADOW_CREST.draw(ctx, `c${Math.floor(this.t * 14) % 4}`, this.x, this.floor, 7, 17, dir),
    );
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

  /**
   * A pool of dark on the floor where he goes down and where he comes up: a
   * flat black band on the rim with a violet lip, opening out and closing.
   */
  draw(ctx: CanvasRenderingContext2D): void {
    const pool = (x: number, y: number, k: number): void => {
      if (k <= 0) return;
      const half = 24 * k + 6;
      faded(ctx, Math.min(1, k * 1.4), () => {
        pixelRect(ctx, x - half, y - 2, half * 2, 2, '#0e071b');
        pixelRect(ctx, x - half + 4, y - 4, half * 2 - 8, 2, '#7a09fa');
      });
    };
    pool(this.fromX, this.fromY, this.risen ? 1 - (this.t - ShadeStep.SINK) / 0.4 : Math.min(1, this.t / 0.1));
    if (this.risen) pool(this.toX, this.toY, 1 - (this.t - ShadeStep.SINK) / 0.4);
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

  /** Splinters of crystal left in the charge's wake, each at one of eight angles, thinning away. */
  draw(ctx: CanvasRenderingContext2D): void {
    for (const s of this.shards) {
      if (s.life <= 0) continue;
      faded(ctx, s.life > 0.5 ? 1 : s.life * 1.6, () =>
        SHARD.draw(ctx, `d${dirIndex(Math.cos(s.a), Math.sin(s.a))}`, s.x, s.y, 3, 3),
      );
    }
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

  /** Each crystal falling point first, with a glint of cold light round it. */
  draw(ctx: CanvasRenderingContext2D): void {
    for (const d of this.drops) {
      if (d.dead) continue;
      glow(ctx, d.x, d.y, 16, '#94fdff', 0.5);
      CRYSTAL.draw(ctx, 'c', d.x, d.y, 2, 5);
    }
  }

  override lights(): GlowLight[] {
    return this.drops.filter((d) => !d.dead).map((d) => ({ x: d.x, y: d.y, radius: 60, rgb: '143,232,255', strength: 0.7, tint: 0.35 }));
  }
}

/**
 * Grimmzahn: a rock dug up and thrown. Where it comes down it rolls on along
 * the floor, over whatever is in its way, until a wall or an edge stops it.
 */
class Boulder extends SkillEffect {
  private rolling = false;
  private rolled = 0;
  private spin = 0;
  /** Seconds since it stopped, while it crumbles. */
  private stopped = -1;

  constructor(
    private x: number,
    private y: number,
    private vx: number,
    private vy: number,
  ) {
    super();
  }

  update(dt: number, world: World): void {
    if (this.stopped >= 0) {
      this.stopped += dt;
      if (this.stopped > 0.25) this.done = true;
      return;
    }
    const dir = sign(this.vx) || 1;
    this.spin += (this.vx * dt) / 12;
    if (!this.rolling) {
      this.vy += 1300 * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (solid(world, this.x + dir * 12, this.y)) {
        this.stop(world);
        return;
      }
      if (this.vy > 0 && solid(world, this.x, this.y + 12)) {
        // Down: it lands, and rolls.
        this.y = Math.floor((this.y + 12) / TILE) * TILE - 12;
        this.rolling = true;
        this.vx = dir * 280;
        audio.play('slam', 1.3);
        world.camera.addShake(2);
        world.particles.burst(this.x, this.y + 10, 10, 'rgba(150,120,90,0.9)', { speed: 140, gravity: 500, angle: -Math.PI / 2, spread: 2 });
      } else if (this.y > world.level.pixelHeight) {
        this.done = true;
        return;
      }
    } else {
      this.x += this.vx * dt;
      this.rolled += Math.abs(this.vx * dt);
      if (this.rolled > 240 || solid(world, this.x + dir * 13, this.y) || !floorAt(world, this.x, this.y + 12)) {
        this.stop(world);
        return;
      }
      if (world.time % 0.05 < dt) {
        world.particles.spawn({ x: this.x - dir * 8, y: this.y + 11, vx: -dir * 30, vy: -rand(20, 60), gravity: 300, color: 'rgba(140,110,80,0.7)', size: 2.5, life: 0.35 });
      }
    }
    strike(world, { x: this.x - 12, y: this.y - 12, w: 24, h: 24 }, 2, dir, this.struck, '#e8c09a');
  }

  private stop(world: World): void {
    this.stopped = 0;
    audio.play('crumble', 1.4);
    world.particles.burst(this.x, this.y, 14, 'rgba(160,130,100,0.9)', { speed: 160, gravity: 500, size: 3 });
  }

  /** The rock the boar throws, rolling over in eight drawn turns; crumbling, it thins away. */
  draw(ctx: CanvasRenderingContext2D): void {
    const turn = ((Math.floor((this.spin * 8) / TAU) % 8) + 8) % 8;
    faded(ctx, this.stopped >= 0 ? 1 - this.stopped / 0.25 : 1, () => ROCK.draw(ctx, `r${turn}`, this.x, this.y, 6, 6));
  }
}

/**
 * Luna: a sickle of moonlight that flies out, slows, turns, and comes back to
 * the hand that threw it - striking on the way out and again on the way back.
 */
class MoonCrescent extends SkillEffect {
  private t = 0;
  private back = false;
  /** What it has struck on its way out; on the way back it is `struck`. */
  private readonly outward = new Set<object>();
  private vx: number;
  private vy = 0;

  constructor(
    private x: number,
    private y: number,
    private readonly dir: number,
  ) {
    super();
    this.vx = dir * 600;
  }

  update(dt: number, world: World): void {
    const p = world.player;
    this.t += dt;
    if (!this.back) {
      this.vx -= this.dir * 820 * dt;
      if (sign(this.vx) !== this.dir || solid(world, this.x + this.dir * 14, this.y)) {
        this.back = true;
        audio.play('swing', 1.5);
      }
    } else {
      // Home to the hand, wherever it has got to.
      const dx = p.cx - this.x;
      const dy = p.cy - 4 - this.y;
      const len = Math.hypot(dx, dy) || 1;
      const speed = Math.min(620, 200 + this.t * 500);
      this.vx = (dx / len) * speed;
      this.vy = (dy / len) * speed;
      if (len < 18 || this.t > 2.4) {
        this.done = true;
        return;
      }
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const set = this.back ? this.struck : this.outward;
    strike(world, { x: this.x - 13, y: this.y - 13, w: 26, h: 26 }, 1, sign(this.vx) || this.dir, set, '#dfe6ff');
    if (world.time % 0.04 < dt) {
      world.particles.spawn({ x: this.x, y: this.y, vx: 0, vy: 0, gravity: 0, color: 'rgba(205,216,255,0.6)', size: 2.5, life: 0.25, shape: 'circle' });
    }
  }

  /** A sickle of moonlight wheeling through eight drawn turns, with a cold glint round it. */
  draw(ctx: CanvasRenderingContext2D): void {
    const turn = ((Math.floor((this.t * 16 * this.dir * 8) / TAU) % 8) + 8) % 8;
    glow(ctx, this.x, this.y, 22, '#c7cfdd', 0.45);
    SICKLE.draw(ctx, `m${turn}`, this.x, this.y, 6, 6);
  }

  override lights(): GlowLight[] {
    return [{ x: this.x, y: this.y, radius: 80, rgb: '190,205,255', strength: 0.7, tint: 0.35 }];
  }
}

/**
 * Tickmar: a brass pendulum swung from above and in front of the hero. It
 * comes down behind him, sweeps the floor ahead and swings up again, and
 * strikes whatever it brushes once.
 */
class Pendulum extends SkillEffect {
  private static readonly TIME = 0.55;
  private static readonly REACH = 140;
  private t = 0;
  private readonly px: number;
  private readonly py: number;
  private readonly dir: number;

  constructor(world: World) {
    super();
    const p = world.player;
    this.dir = p.facing;
    this.px = p.cx + this.dir * 70;
    this.py = p.bottom - 150;
    audio.play('swing', 0.55);
    audio.play('clank', 0.8);
  }

  private get angle(): number {
    const k = clamp(this.t / Pendulum.TIME, 0, 1);
    // Fast through the bottom, slow at the ends, like a pendulum.
    const eased = 0.5 - Math.cos(k * Math.PI) / 2;
    return (-1 + 2 * eased) * 1.15 * this.dir;
  }

  private get bob(): { x: number; y: number } {
    const a = this.angle;
    return { x: this.px + Math.sin(a) * Pendulum.REACH, y: this.py + Math.cos(a) * Pendulum.REACH };
  }

  update(dt: number, world: World): void {
    this.t += dt;
    if (this.t > Pendulum.TIME + 0.12) {
      this.done = true;
      return;
    }
    const b = this.bob;
    strike(world, { x: b.x - 18, y: b.y - 18, w: 36, h: 36 }, 2, this.dir, this.struck, '#ffe0a0');
  }

  /**
   * The arc it sweeps as a row of brass dots, the rod a line of whole
   * pixels, the bob a drawn ball of brass lit from the upper left.
   */
  draw(ctx: CanvasRenderingContext2D): void {
    const b = this.bob;
    const fade = this.t > Pendulum.TIME ? 1 - (this.t - Pendulum.TIME) / 0.12 : 1;
    faded(ctx, fade, () => {
      ctx.fillStyle = '#edab50';
      for (let i = 0; i <= 14; i++) {
        const a = Math.PI / 2 - 1.15 + (i / 14) * 2.3;
        const x = this.px + Math.cos(a) * Pendulum.REACH;
        const y = this.py + Math.sin(a) * Pendulum.REACH;
        ctx.fillRect(Math.floor(x / ART) * ART, Math.floor(y / ART) * ART, ART, ART);
      }
      pixelLine(ctx, this.px, this.py, b.x, b.y, '#8a4836');
      PENDULUM.draw(ctx, 'pivot', this.px, this.py, 2, 2);
      PENDULUM.draw(ctx, 'bob', b.x, b.y, 8, 8);
    });
  }

  override lights(): GlowLight[] {
    const b = this.bob;
    return [{ x: b.x, y: b.y, radius: 70, rgb: '240,194,122', strength: 0.6, tint: 0.3 }];
  }
}

/* ---------------------------------------------------------------- casts */

/**
 * Maskarill: a double of the hero, thrown out of him the way the jester throws
 * his - it runs on ahead, cuts whatever is in its way, and is gone. The hero
 * himself stays where he stood.
 */
class Phantom extends SkillEffect {
  private static readonly RUN = 0.3;
  private static readonly FADE = 0.3;
  private t = 0;
  private x: number;
  private readonly from: number;
  private readonly to: number;
  private readonly floor: number;
  private readonly dir: 1 | -1;
  private readonly ghosts: { x: number; life: number }[] = [];

  constructor(world: World) {
    super();
    const p = world.player;
    this.dir = p.facing;
    this.from = p.cx;
    this.x = p.cx;
    this.to = ahead(world, 210);
    this.floor = p.bottom;
    audio.play('dash', 1.25);
    audio.play('magic', 1.5);
  }

  update(dt: number, world: World): void {
    this.t += dt;
    for (const g of this.ghosts) g.life -= dt * 3.5;
    if (this.t < Phantom.RUN) {
      const k = this.t / Phantom.RUN;
      this.x = this.from + (this.to - this.from) * (1 - (1 - k) * (1 - k));
      if (world.time % 0.03 < dt) this.ghosts.push({ x: this.x, life: 0.8 });
      strike(world, { x: this.x - 20, y: this.floor - 40, w: 40, h: 42 }, 2, this.dir, this.struck, '#ecd4ff');
    } else if (this.t > Phantom.RUN + Phantom.FADE) {
      this.done = true;
    }
  }

  /**
   * The hero's double in the jester's violet, running and then cutting, with
   * the afterimages it leaves as thin patterns of pixels - a ghost drawn the
   * way a palette of a few colours draws one.
   */
  draw(ctx: CanvasRenderingContext2D): void {
    for (const g of this.ghosts) {
      if (g.life > 0) faded(ctx, g.life * 0.45, () => PHANTOM.draw(ctx, 'run', g.x, this.floor, 5, 17, this.dir));
    }
    const fade = this.t < Phantom.RUN ? 1 : clamp(1 - (this.t - Phantom.RUN) / Phantom.FADE, 0, 1);
    faded(ctx, fade, () => PHANTOM.draw(ctx, this.t > Phantom.RUN * 0.55 ? 'cut' : 'run', this.x, this.floor, 5, 17, this.dir));
  }

  override lights(): GlowLight[] {
    return [{ x: this.x, y: this.floor - 18, radius: 70, rgb: '217,168,255', strength: 0.6, tint: 0.35 }];
  }
}

/**
 * Nyktos: three lights he had swallowed, let go round the hero. They circle him
 * for four seconds, and each strikes whatever it touches once.
 */
class Wisps extends SkillEffect {
  private static readonly LIFE = 4;
  private t = 0;
  private readonly hits = [new Set<object>(), new Set<object>(), new Set<object>()];
  private readonly at: { x: number; y: number }[] = [];

  constructor(world: World) {
    super();
    this.place(world.player.cx, world.player.cy);
    audio.play('magic', 1.7);
    audio.play('beamCharge', 1.8);
  }

  private place(cx: number, cy: number): void {
    this.at.length = 0;
    for (let i = 0; i < 3; i++) {
      const a = this.t * 3.4 + (i * TAU) / 3;
      this.at.push({ x: cx + Math.cos(a) * 46, y: cy - 4 + Math.sin(a) * 30 });
    }
  }

  update(dt: number, world: World): void {
    this.t += dt;
    if (this.t >= Wisps.LIFE) {
      this.done = true;
      return;
    }
    const p = world.player;
    this.place(p.cx, p.cy);
    this.at.forEach((w, i) => {
      strike(world, { x: w.x - 10, y: w.y - 10, w: 20, h: 20 }, 1, sign(w.x - p.cx) || p.facing, this.hits[i], '#fff4c8');
    });
  }

  /** Three motes of white light with a yellow edge, twinkling between two frames. */
  draw(ctx: CanvasRenderingContext2D): void {
    const fade = clamp((Wisps.LIFE - this.t) / 0.4, 0, 1) * clamp(this.t / 0.2, 0, 1);
    this.at.forEach((w, i) => {
      glow(ctx, w.x, w.y, 16, '#ffeb57', 0.6 * fade);
      faded(ctx, fade * 1.3, () => WISP.draw(ctx, Math.floor(this.t * 10 + i) % 2 === 0 ? 'w0' : 'w1', w.x, w.y, 2, 2));
    });
  }

  override lights(): GlowLight[] {
    return this.at.map((w) => ({ x: w.x, y: w.y, radius: 64, rgb: '255,240,168', strength: 0.7, tint: 0.4 }));
  }
}

/**
 * Grauwacht: a gargoyle of stone, out of the dark above onto the nearest
 * enemy - a ring marks where, then it comes down, and everything it lands on
 * takes three.
 */
class StoneFall extends SkillEffect {
  private static readonly MARK = 0.35;
  private static readonly DROP = 280;
  private t = 0;
  private x: number;
  private y: number;
  private vy = 0;
  private readonly floor: number;
  private landed = -1;
  private readonly target: Target['thing'] | null;
  private readonly rubble: { x: number; y: number; vx: number; vy: number; life: number }[] = [];

  constructor(world: World) {
    super();
    const p = world.player;
    const t = nearest(world, 360);
    this.target = t?.thing ?? null;
    this.x = t ? t.x : ahead(world, 140);
    this.floor = floorUnder(world, this.x, (t ? t.bottom : p.bottom) - 12);
    this.y = this.floor - StoneFall.DROP;
    audio.play('rumble', 1.4);
  }

  update(dt: number, world: World): void {
    this.t += dt;
    for (const r of this.rubble) {
      r.vy += 900 * dt;
      r.x += r.vx * dt;
      r.y = Math.min(this.floor - 2, r.y + r.vy * dt);
      r.life -= dt * 1.6;
    }
    if (this.landed >= 0) {
      this.landed += dt;
      if (this.landed > 0.7) this.done = true;
      return;
    }
    if (this.t < StoneFall.MARK) {
      if (this.target && !this.target.dead) {
        const step = 150 * dt;
        this.x += clamp(this.target.cx - this.x, -step, step);
      }
      return;
    }
    this.vy = Math.min(1400, this.vy + 2200 * dt);
    this.y += this.vy * dt;
    if (this.y < this.floor) return;
    this.y = this.floor;
    this.landed = 0;
    strike(world, { x: this.x - 30, y: this.floor - 58, w: 60, h: 58 }, 3, sign(this.x - world.player.cx), this.struck, '#d8e0ea');
    audio.play('slam', 0.9);
    audio.play('crumble', 1.0);
    world.camera.addShake(5);
    for (let i = 0; i < 12; i++) this.rubble.push({ x: this.x + rand(-14, 14), y: this.floor - rand(6, 20), vx: rand(-160, 160), vy: -rand(120, 300), life: 1 });
  }

  /**
   * A ring on the floor drawing in where it will land, then the statue -
   * crouched, wings folded, head down - and the rubble it throws up, chips of
   * two art pixels that thin away.
   */
  draw(ctx: CanvasRenderingContext2D): void {
    if (this.t < StoneFall.MARK + 0.15 && this.landed < 0) {
      const k = clamp(this.t / StoneFall.MARK, 0, 1);
      faded(ctx, 0.5 + 0.5 * k, () => floorRing(ctx, this.x, this.floor - 2, 34 - 12 * k, 6 - 2 * k, '#c7cfdd'));
    }
    if (this.landed < 0.25) {
      const y = this.landed >= 0 ? this.floor : this.y;
      faded(ctx, this.landed >= 0 ? 1 - this.landed / 0.25 : 1, () => STATUE.draw(ctx, 's', this.x, y, 6, 16));
    }
    for (const r of this.rubble) {
      if (r.life <= 0) continue;
      faded(ctx, clamp(r.life * 1.4, 0, 1), () => pixelRect(ctx, r.x - 2, r.y - 2, 4, 4, '#92a1b9'));
    }
  }
}

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
    case 'felswurf':
      audio.play('jump', 0.5);
      return [new Boulder(p.cx + p.facing * 12, p.cy - 10, p.facing * 300, -380)];
    case 'mondsichel':
      audio.play('swing', 1.2);
      return [new MoonCrescent(p.cx + p.facing * 12, p.cy - 4, p.facing)];
    case 'pendelschlag':
      return [new Pendulum(world)];
    case 'goldregen':
      audio.play('coin', 0.8);
      return fan(world, 4, 0.36, 0.2, 430, (x, y, vx, vy) => new Shot(x, y, vx, vy, 500, 'coin', '#ffd866', 1, 1.2));
    case 'trugbild':
      return [new Phantom(world)];
    case 'sonnenblick':
      return [new SunColumn(world)];
    case 'irrlichter':
      return [new Wisps(world)];
    case 'steinsturz':
      return [new StoneFall(world)];
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

/**
 * Arachna's silk on whatever it binds, drawn over it while it holds: four
 * strands across it and a loop round its middle, lines of whole pixels that
 * thin into a pattern as the hold wears off.
 */
export function drawSnare(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, k: number): void {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2 + 4;
  const ry = h / 2 + 4;
  faded(ctx, 0.4 + 0.6 * clamp(k, 0, 1), () => {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI;
      pixelLine(ctx, cx - Math.cos(a) * rx, cy - Math.sin(a) * ry, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, '#c7cfdd');
    }
    floorRing(ctx, cx, cy, rx * 0.6, ry * 0.6, '#ffffff');
  });
}
