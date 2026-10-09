import { Camera } from '../core/camera';
import { Rng } from '../core/math';
import { ART_PALETTE } from './palette';
import { ART } from './pixel';

interface Spore {
  x: number;
  y: number;
  speed: number;
  rise: number;
  size: number;
  phase: number;
  /** Some spores sit closer to the camera and drift faster. */
  depth: number;
}

/**
 * A spore's colours, from faint to bright: the palette colours nearest to its
 * zone's spore colour at three strengths. A spore breathes by stepping along
 * them a whole colour at a time - never by a translucent alpha, which the
 * palette pass would turn into a dither that shifts as the dot moves.
 */
const ramps = new Map<string, readonly [string, string, string]>();
function rampOf(rgb: string): readonly [string, string, string] {
  let ramp = ramps.get(rgb);
  if (ramp) return ramp;
  const [r, g, b] = rgb.split(',').map((v) => Number(v.trim()));
  const nearest = (k: number): string => {
    let best = ART_PALETTE[0];
    let bestD = Infinity;
    for (const c of ART_PALETTE) {
      const pr = (c >> 16) & 255;
      const pg = (c >> 8) & 255;
      const pb = c & 255;
      const rm = (r * k + pr) / 2;
      const dr = r * k - pr;
      const dg = g * k - pg;
      const db = b * k - pb;
      const d = (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return `#${best.toString(16).padStart(6, '0')}`;
  };
  // Capped well below the hero's own brightness: decoration must never
  // outshine the things that can kill you.
  ramp = [nearest(0.3), nearest(0.5), nearest(0.72)] as const;
  ramps.set(rgb, ramp);
  return ramp;
}

/**
 * Glowing spores drifting through the level. They are drawn in front of the
 * world and after the lighting pass, so they keep their own light no matter how
 * dark the surroundings are - the one element that carries the whole mood.
 */
export class Spores {
  private readonly spores: Spore[] = [];

  constructor(
    private readonly viewW: number,
    private readonly viewH: number,
    count = 54,
  ) {
    const rng = new Rng(0x5c0e);
    for (let i = 0; i < count; i++) {
      const depth = rng.range(0.35, 1);
      this.spores.push({
        x: rng.range(0, viewW),
        y: rng.range(0, viewH),
        speed: rng.range(3, 13) * depth,
        rise: rng.range(4, 14),
        size: rng.range(0.9, 2.3) * depth,
        phase: rng.range(0, Math.PI * 2),
        depth,
      });
    }
  }

  draw(ctx: CanvasRenderingContext2D, camera: Camera, time: number, rgb: string, calm = false): void {
    const { viewW, viewH } = this;
    const [faint, mid, bright] = rampOf(rgb);
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    for (const s of this.spores) {
      // In a calm zone the field is anchored to the screen and only breathes:
      // no sideways weave, and no parallax against the camera. Fifty bright
      // dots sliding over a near-black sky while the hero runs is what the
      // "trembling background" was - measured, the spores were two thirds of
      // all the residual movement up there.
      const weave = calm ? 0 : Math.sin(time * 0.4 + s.phase) * 26;
      const drift = calm ? 0 : 0.55;
      const wrapX = (s.x - camera.x * drift * s.depth + weave - time * s.speed * (calm ? 0.4 : 1)) % viewW;
      const x = wrapX < 0 ? wrapX + viewW : wrapX;
      const wrapY = (s.y - camera.y * (calm ? 0 : 0.4) * s.depth - time * s.rise * (calm ? 0.5 : 1)) % viewH;
      const y = wrapY < 0 ? wrapY + viewH : wrapY;
      // A spore that reaches the edge is wrapped to the other side; it dims
      // out a step at a time there, so the jump is not seen.
      const edge = Math.min(x, viewW - x, y, viewH - y);
      if (edge < 14) continue;
      // Slow individual breathing keeps the field from looking like static.
      const pulse = calm ? 0.8 + Math.sin(time * 0.5 + s.phase) * 0.12 : 0.55 + Math.sin(time * 1.6 + s.phase) * 0.45;
      const level = edge < 40 ? 0 : calm ? 1 : pulse < 0.35 ? 0 : pulse < 0.8 ? 1 : 2;

      // A mote is one art pixel of its zone's colour - whole pixels, so it is
      // never re-blended at a fraction of one; a near one at the top of its
      // breath twinkles into a little cross with a brighter heart.
      const ax = Math.round(x / ART) * ART;
      const ay = Math.round(y / ART) * ART;
      if (level === 2 && s.size > 1.5) {
        ctx.fillStyle = faint;
        ctx.fillRect(ax - ART, ay, ART * 3, ART);
        ctx.fillRect(ax, ay - ART, ART, ART * 3);
      }
      ctx.fillStyle = level === 0 ? faint : level === 1 ? mid : bright;
      ctx.fillRect(ax, ay, ART, ART);
    }
    ctx.restore();
  }
}
