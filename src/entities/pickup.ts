import { audio } from '../core/audio';
import { Rect, rectsOverlap } from '../core/math';
import { PALETTE } from '../render/palette';
import { ART, snap } from '../render/pixel';
import { Sheet, blank, flame, plot, rows, type Grid } from '../render/sheet';
import type { World } from '../world/context';

export type PickupKind = 'gem' | 'heart';

/* --------------------------------------------------------------- the gem */

/**
 * A gem cut as a six-sided double pyramid, turned a tenth of a sixth of a
 * turn per frame: the facets move across it and the light catches each in
 * turn, while its outline stays a gem's - it used to spin by being squashed
 * flat, down to a sliver. Every facet is lit by how squarely it faces the
 * light from the upper left and the front.
 */
function gemFrame(turn: number): string[] {
  const w = 9;
  const h = 10;
  const cells = blank(w, h);
  const r = 3.7;
  const girdle = 3;
  const tip = 9;
  const tones = 'cbahw';
  const light = [-0.5, -0.62, 0.6];
  for (let y = 0; y < tip; y++) {
    const yc = y + 0.5;
    const crown = yc < girdle;
    const half = crown ? (r * yc) / girdle : (r * (tip - yc)) / (tip - girdle);
    for (let x = 0; x < w; x++) {
      const px = x + 0.5 - w / 2;
      if (Math.abs(px) > half + 0.15) continue;
      // Which facet the pixel is on: the angle round the gem's axis.
      const s = Math.max(-1, Math.min(1, px / Math.max(0.01, half)));
      const around = Math.asin(s) - turn;
      const k = Math.floor((around + Math.PI) / (Math.PI / 3));
      const mid = k * (Math.PI / 3) - Math.PI + Math.PI / 6 + turn;
      // The facet's outward normal: round the axis at its middle, tilted up
      // on the crown and down on the pavilion.
      const tilt = crown ? 0.55 : -0.42;
      const n = [Math.sin(mid), -tilt, Math.cos(mid)];
      const len = Math.hypot(n[0], n[1], n[2]);
      const lit = (n[0] * light[0] + n[1] * light[1] + n[2] * light[2]) / len;
      const tone = lit > 0.78 ? 4 : lit > 0.5 ? 3 : lit > 0.22 ? 2 : lit > -0.1 ? 1 : 0;
      plot(cells, x, y, tones[tone]);
    }
  }
  return rows(cells);
}

export const GEM = new Sheet<string>(
  Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`g${i}`, gemFrame((i / 6) * (Math.PI / 3))])),
  { w: '#ffffff', h: '#ffeb57', a: '#ffc825', b: '#edab50', c: '#e07438' },
);

/** A glint going over the gem: a point of light that opens into a star and closes again. */
const GLINT: readonly Grid[] = [
  ['...', '.w.', '...'],
  ['.w.', 'www', '.w.'],
  ['..w..', '..w..', 'wwwww', '..w..', '..w..'],
  ['.w.', 'www', '.w.'],
];
export const GLINT_SHEET = new Sheet<string>(
  Object.fromEntries(GLINT.map((g, i) => [`s${i}`, [...g]])),
  { w: '#ffffff' },
);

/* -------------------------------------------------------------- the heart */

const HEART: Grid = [
  '.hh...aa.',
  'hwha.aaab',
  'hhaaaaaab',
  'haaaaaabb',
  '.aaaaabb.',
  '..aaabb..',
  '...abb...',
  '....b....',
];

/** The beat: a pixel fuller all round, for a tenth of a second. */
const HEART_BEAT: Grid = [
  '..hh...aa..',
  '.hwwh.aaab.',
  'hhwhaaaaabb',
  'hhaaaaaaabb',
  'haaaaaaaabb',
  '.aaaaaaabb.',
  '..aaaaabb..',
  '...aaabb...',
  '....abb....',
  '.....b.....',
];

export const HEARTS = new Sheet<'rest' | 'beat'>(
  { rest: [...HEART], beat: [...HEART_BEAT] },
  { w: '#ffffff', h: '#f68187', a: '#ea323c', b: '#891e2b' },
);

export class Pickup {
  x: number;
  y: number;
  w = 16;
  h = 16;
  dead = false;
  /** Stable id so collected pickups stay collected after a respawn. */
  id = '';
  private anim = Math.random() * 6;

  constructor(
    readonly kind: PickupKind,
    x: number,
    y: number,
  ) {
    this.x = x;
    this.y = y;
    if (kind === 'heart') {
      this.w = 20;
      this.h = 18;
    }
  }

  get rect(): Rect {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  update(dt: number, world: World): void {
    this.anim += dt;
    const player = world.player;
    // A heart on full health is worth more left where it is: picking it up
    // would spend it on nothing, and there is no way to put it back.
    if (this.kind === 'heart' && player.hp >= player.maxHp) return;
    if (!player.dead && rectsOverlap(this.rect, player.rect)) {
      this.dead = true;
      if (this.kind === 'gem') {
        audio.play('coin');
        world.addScore(50, this.x + this.w / 2, this.y, '+50');
        world.particles.burst(this.x + 8, this.y + 8, 12, PALETTE.gold, { speed: 130, gravity: 220, shape: 'spark' });
      } else {
        audio.play('heal');
        player.heal(2);
        world.particles.text(this.x + 10, this.y - 4, '+2 LEBEN', PALETTE.hearts);
        world.particles.burst(this.x + 10, this.y + 8, 16, PALETTE.hearts, { speed: 140, gravity: 180, shape: 'circle' });
      }
    }
  }

  /**
   * Hand-placed frames on the grid, no halo: the gem turns in six frames and
   * a glint runs over it now and then; the heart beats. Both float up and
   * down by whole art pixels. What light they give comes from the light
   * pass, not from a blurred disc round them.
   */
  draw(ctx: CanvasRenderingContext2D): void {
    const bob = Math.round(Math.sin(this.anim * 2.6) * 1.4) * ART;
    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2 + bob;
    if (this.kind === 'gem') {
      GEM.draw(ctx, `g${Math.floor(this.anim * 7) % 6}`, cx, cy, 4, 5);
      // A glint every couple of seconds, four frames long, up on its left shoulder.
      const glint = (this.anim * 0.6) % 1;
      if (glint < 0.16) {
        const k = Math.min(3, Math.floor((glint / 0.16) * 4));
        const s = GLINT_SHEET.sprite(`s${k}`);
        GLINT_SHEET.draw(ctx, `s${k}`, cx - 4, cy - 6, s.w >> 1, s.h >> 1);
      }
    } else {
      const beat = this.anim % 1.1 < 0.1;
      HEARTS.draw(ctx, beat ? 'beat' : 'rest', cx, cy, beat ? 5 : 4, beat ? 5 : 4);
    }
  }
}

/* ---------------------------------------------------------- checkpoint */

/*
 * A shrine of the road: a stone brazier with a rune cut into its pillar. Cold,
 * an ember glints blue in the dark of its bowl; reached, it takes fire - a
 * flame of six drawn frames - and the rune burns cyan with the word the road
 * gives back ("GESICHERT").
 */

const SHRINE_W = 14;
const SHRINE_H = 28;

const SHRINE: Grid = [
  '..............',
  '..............',
  '..............',
  '..............',
  '..............',
  '..............',
  '..............',
  '..............',
  '..............',
  '..............',
  '..............',
  '..............',
  'yyyyyyyyyyyyy.',
  'yzzzzzzzzzzzy.',
  '.ykkkkkkkkky..',
  '..yxxxxxxxy...',
  '...xxxxxxx....',
  '....ssst......',
  '....sastt.....',
  '....sssst.....',
  '....sRRst.....',
  '....sRsst.....',
  '....sRRst.....',
  '....sssst.....',
  '....sssst.....',
  '...ssssstt....',
  '..ssasssstt...',
  '.ssssssssttt..',
];

/** The bowl's ember while it is cold. */
const EMBER_COLD: Grid = ['.....e......', '....eEe.....'];

const SHRINE_KEY = {
  y: '#bf6f4a',
  z: '#edab50',
  k: '#1a1932',
  x: '#2a2f4e',
  s: '#424c6e',
  a: '#657392',
  t: '#2a2f4e',
  R: '#1a1932',
  e: '#0098dc',
  E: '#94fdff',
};

const FLAME_TONES = '123456';

function shrineFrame(lit: boolean, seed: number): string[] {
  const cells = SHRINE.map((r) => r.split(''));
  if (lit) {
    const f = flame(10, 12, seed, FLAME_TONES, 0.45);
    for (let y = 0; y < f.length; y++) {
      for (let x = 0; x < f[y].length; x++) {
        if (f[y][x] !== '.') plot(cells, x + 2, y + 1, f[y][x]);
      }
    }
    // The rune burns with it.
    for (let y = 0; y < cells.length; y++) for (let x = 0; x < SHRINE_W; x++) if (cells[y][x] === 'R') cells[y][x] = 'C';
  } else {
    EMBER_COLD.forEach((row, y) => [...row].forEach((c, x) => c !== '.' && plot(cells, x + 1, 13 + y, c)));
  }
  return rows(cells);
}

export const SHRINES = new Sheet<string>(
  {
    cold: shrineFrame(false, 0),
    ...Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`lit${i}`, shrineFrame(true, 11 + i * 7)])),
  },
  {
    ...SHRINE_KEY,
    '1': '#c64524',
    '2': '#ed7614',
    '3': '#ffa214',
    '4': '#ffc825',
    '5': '#ffeb57',
    '6': '#ffffff',
    C: '#94fdff',
  },
);

export class Checkpoint {
  x: number;
  y: number;
  w = 24;
  h = 56;
  activated = false;
  private anim = 0;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  get rect(): Rect {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  update(dt: number, world: World): boolean {
    this.anim += dt;
    if (this.activated) return false;
    if (rectsOverlap(this.rect, world.player.rect)) {
      this.activated = true;
      audio.play('checkpoint');
      world.particles.text(this.x + 12, this.y - 6, 'GESICHERT', '#8fe6ff');
      // The brazier catching: sparks thrown up out of the bowl.
      world.particles.burst(this.x + 12, this.y + 22, 26, '#ffc825', { speed: 160, gravity: 120, shape: 'spark', angle: -Math.PI / 2, spread: 2.2 });
      return true;
    }
    return false;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const frame = this.activated ? `lit${Math.floor(this.anim * 9) % 6}` : 'cold';
    SHRINES.draw(ctx, frame, snap(this.x + this.w / 2), this.y + this.h, 7, SHRINE_H);
  }
}
