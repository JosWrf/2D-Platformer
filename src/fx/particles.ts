import { rand } from '../core/math';
import { ART } from '../render/pixel';
import { parseColor } from '../render/sprites';
import { UI, paletteColor } from '../ui/kit';
import { capHeight, drawText } from '../ui/pixelfont';

/** From a word's top to where it stands: (x, y) is its foot, as it always was. */
const TEXT_RISE = capHeight();

/*
 * What a particle looks like over its life. Callers everywhere hand a spawn
 * whatever colour they like - a hex, an rgba with an alpha that meant "faint" -
 * and it used to be drawn in exactly that colour, fading out. A particle is
 * now a pixel or two in a colour of the palette, and it fades by cooling down
 * a ramp: the colour it was given picks the ramp and the step on it, and it
 * walks down from there.
 */

/** The ramps particles cool along, hottest first: palette colours only. */
const RAMPS: readonly (readonly string[])[] = [
  /* fire */ ['#ffeb57', '#ffc825', '#ffa214', '#ed7614', '#c64524', '#8e251d', '#571c27'],
  /* gold */ ['#ffeb57', '#edab50', '#e07438', '#bf6f4a', '#8a4836', '#5d2c28'],
  /* blood */ ['#f68187', '#f5555d', '#ea323c', '#c42430', '#891e2b', '#571c27', '#3b1443'],
  /* leaf */ ['#d3fc7e', '#99e65f', '#5ac54f', '#33984b', '#1e6f50', '#134c4c', '#0c2e44'],
  // Before water, so that white - a hit spark, a death spark - cools as steel.
  /* steel */ ['#ffffff', '#c7cfdd', '#92a1b9', '#657392', '#424c6e', '#2a2f4e', '#1a1932', '#0e071b'],
  /* water and ice */ ['#ffffff', '#94fdff', '#0cf1ff', '#00cdf9', '#0098dc', '#0069aa', '#00396d', '#03193f'],
  /* magic */ ['#fdd2ed', '#f389f5', '#db3ffd', '#7a09fa', '#3003d9', '#0c0293'],
  /* plum */ ['#fdd2ed', '#ca52c9', '#93388f', '#622461', '#3b1443', '#1c121c'],
  /* earth */ ['#f9e6cf', '#f6ca9f', '#e69c69', '#bf6f4a', '#8a4836', '#5d2c28', '#391f21', '#1c121c'],
];

const FIRE = 0;

/** One art pixel along each of the eight directions (see sheet.dirIndex). */
const STEP_X = [1, 1, 0, -1, -1, -1, 0, 1];
const STEP_Y = [0, 1, 1, 1, 0, -1, -1, -1];

function distance(a: readonly [number, number, number], hex: string): number {
  const v = parseInt(hex.slice(1), 16);
  const r = (v >> 16) & 255;
  const g = (v >> 8) & 255;
  const b = v & 255;
  // The redmean distance, the same the palette mapping uses.
  const rm = (a[0] + r) / 2;
  const dr = a[0] - r;
  const dg = a[1] - g;
  const db = a[2] - b;
  return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
}

const ramps = new Map<string, readonly string[]>();

/**
 * The four colours a particle of this colour goes through: a step hotter, its
 * own, and two steps cooler. A faint colour (a low alpha) starts further down
 * its ramp; a strong orange always burns on the fire ramp, whatever colour of
 * clay it happens to be nearest.
 */
function rampOf(color: string): readonly string[] {
  let out = ramps.get(color);
  if (out) return out;
  const c = parseColor(color);
  const k = 0.4 + 0.6 * Math.max(0, Math.min(1, c.a));
  const rgb: [number, number, number] = [c.r * k, c.g * k, c.b * k];
  const hi = Math.max(c.r, c.g, c.b);
  const lo = Math.min(c.r, c.g, c.b);
  const sat = hi > 0 ? (hi - lo) / hi : 0;
  const hue = hi === lo ? 0 : hi === c.r ? (60 * (c.g - c.b)) / (hi - lo) : 999;
  const fiery = hi === c.r && sat >= 0.55 && hi >= 150 && hue >= 12 && hue <= 58;
  let best = 0;
  let bestStep = 0;
  let bestD = Infinity;
  RAMPS.forEach((ramp, i) => {
    if (fiery && i !== FIRE) return;
    ramp.forEach((hex, step) => {
      const d = distance(rgb, hex);
      if (d < bestD) {
        bestD = d;
        best = i;
        bestStep = step;
      }
    });
  });
  const ramp = RAMPS[best];
  const at = (s: number): string => ramp[Math.max(0, Math.min(ramp.length - 1, s))];
  out = [at(bestStep - 1), at(bestStep), at(bestStep + 1), at(bestStep + 2)];
  if (ramps.size > 400) ramps.clear();
  ramps.set(color, out);
  return out;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
  shape: 'square' | 'circle' | 'spark';
  drag: number;
}

export interface FloatingText {
  x: number;
  y: number;
  vy: number;
  life: number;
  text: string;
  color: string;
}

export class Particles {
  readonly items: Particle[] = [];
  readonly texts: FloatingText[] = [];
  private readonly max = 900;

  spawn(p: Partial<Particle> & { x: number; y: number }): void {
    if (this.items.length >= this.max) this.items.shift();
    const life = p.life ?? rand(0.3, 0.7);
    this.items.push({
      vx: 0,
      vy: 0,
      size: 3,
      color: '#ffffff',
      gravity: 480,
      shape: 'square',
      drag: 0.9,
      ...p,
      life,
      maxLife: life,
    });
  }

  burst(
    x: number,
    y: number,
    count: number,
    color: string,
    opts: { speed?: number; gravity?: number; size?: number; shape?: Particle['shape']; spread?: number; angle?: number } = {},
  ): void {
    const speed = opts.speed ?? 140;
    const spread = opts.spread ?? Math.PI * 2;
    const base = opts.angle ?? 0;
    for (let i = 0; i < count; i++) {
      const a = base + rand(-spread / 2, spread / 2);
      const s = speed * rand(0.35, 1);
      this.spawn({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        color,
        gravity: opts.gravity ?? 460,
        size: opts.size ?? rand(2, 4),
        shape: opts.shape ?? 'square',
        life: rand(0.25, 0.65),
      });
    }
  }

  text(x: number, y: number, text: string, color = '#f2c14e'): void {
    this.texts.push({ x, y, vy: -34, life: 0.9, text, color });
  }

  update(dt: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.items.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      p.vx *= Math.pow(p.drag, dt * 60);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.texts.splice(i, 1);
        continue;
      }
      t.y += t.vy * dt;
      t.vy *= 0.94;
    }
  }

  /**
   * Every particle as one or two art pixels square on the grid, in a colour
   * of its ramp for how far through its life it is: it flashes a step
   * hotter as it is born, holds its own colour, then cools a step and
   * another before it goes - and shrinks from two pixels to one on the way.
   * Nothing is translucent and nothing is round or turned: a spark is a
   * short streak of pixels along one of the eight directions it is nearest
   * to flying in, its head a step hotter than its tail.
   */
  draw(ctx: CanvasRenderingContext2D): void {
    ctx.globalAlpha = 1;
    let fill = '';
    for (const p of this.items) {
      const ramp = rampOf(p.color);
      const age = 1 - p.life / p.maxLife;
      const step = age < 0.14 ? 0 : age < 0.55 ? 1 : age < 0.8 ? 2 : 3;
      const color = ramp[step];
      if (color !== fill) {
        ctx.fillStyle = color;
        fill = color;
      }
      const big = p.size >= 3 && age < 0.65 ? 2 : 1;
      const x = Math.floor(p.x / ART) * ART;
      const y = Math.floor(p.y / ART) * ART;
      if (p.shape === 'spark') {
        // The head here, the tail behind it along the way it flies.
        const speed = Math.abs(p.vx) + Math.abs(p.vy);
        const len = speed > 170 ? 3 : speed > 60 ? 2 : 1;
        const d = (Math.round(Math.atan2(p.vy, p.vx) / (Math.PI / 4)) + 8) % 8;
        const sx = STEP_X[d] * ART;
        const sy = STEP_Y[d] * ART;
        ctx.fillRect(x, y, ART, ART);
        if (len > 1) {
          const tail = ramp[Math.min(3, step + 1)];
          ctx.fillStyle = tail;
          fill = tail;
          for (let k = 1; k < len; k++) ctx.fillRect(x - sx * k, y - sy * k, ART, ART);
        }
      } else if (p.shape === 'circle' && big === 2 && p.size >= 4.5 && age < 0.4) {
        // A large round mote is a plus: the smallest disc there is.
        ctx.fillRect(x - ART, y, ART * 3, ART);
        ctx.fillRect(x, y - ART, ART, ART * 3);
      } else {
        const s = big * ART;
        ctx.fillRect(x - (big - 1) * ART, y - (big - 1) * ART, s, s);
      }
    }
    ctx.globalAlpha = 1;
  }

  /**
   * The words that pop out of a fight - "BENOMMEN!", "PARIERT!", "+1500" - in
   * the pixel font, outlined in ink, standing on (x, y) as they always did.
   * In their last moments they blink out instead of fading: a fade would come
   * out of the palette as a dither crawling over the letters.
   */
  drawTexts(ctx: CanvasRenderingContext2D): void {
    for (const t of this.texts) {
      if (t.life < 0.3 && Math.floor(t.life * 20) % 2 === 0) continue;
      drawText(ctx, t.text, t.x, t.y - TEXT_RISE, { color: paletteColor(t.color), outline: UI.ink, align: 'center' });
    }
  }

  clear(): void {
    this.items.length = 0;
    this.texts.length = 0;
  }
}
