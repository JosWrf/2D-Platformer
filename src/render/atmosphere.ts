import { Camera } from '../core/camera';
import { Rng } from '../core/math';
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
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const s of this.spores) {
      // In a calm zone the field is anchored to the screen and only breathes:
      // no sideways weave, and no parallax against the camera. Fifty bright
      // dots sliding over a near-black sky while the hero runs is what the
      // "trembling background" was - measured, the spores were two thirds of
      // all the residual movement up there.
      const weave = calm ? 0 : Math.sin(time * 0.4 + s.phase) * 26;
      const drift = calm ? 0 : 0.55;
      const wrapX = (s.x - camera.x * drift * s.depth + weave - time * s.speed * (calm ? 0.4 : 1)) % viewW;
      // Whole pixels. A two-pixel dot at a fractional position is re-blended
      // every frame, and fifty of them doing that against a near-black sky is
      // a field of static - which is what the background trembling was.
      const x = Math.round(wrapX < 0 ? wrapX + viewW : wrapX);
      const wrapY = (s.y - camera.y * (calm ? 0 : 0.4) * s.depth - time * s.rise * (calm ? 0.5 : 1)) % viewH;
      const y = Math.round(wrapY < 0 ? wrapY + viewH : wrapY);
      // A spore that reaches the edge is wrapped to the other side; fading it
      // out there keeps the jump from being seen.
      const edge = Math.min(x, viewW - x, y, viewH - y);
      const fade = edge >= 40 ? 1 : Math.max(0, edge / 40);
      if (fade <= 0) continue;
      // Slow individual breathing keeps the field from looking like static.
      const pulse = calm ? 0.8 + Math.sin(time * 0.5 + s.phase) * 0.12 : 0.55 + Math.sin(time * 1.6 + s.phase) * 0.45;

      // A mote is one art pixel of its zone's colour; a near one at the top of
      // its breath twinkles into a little cross with a pale heart. No halo: a
      // soft glow is the one thing a palette of a few colours cannot draw, and
      // fifty of them were half a millisecond of every frame.
      const ax = Math.round(x / ART) * ART;
      const ay = Math.round(y / ART) * ART;
      // Capped well below the hero's own brightness: decoration must never
      // outshine the things that can kill you.
      ctx.globalAlpha = Math.min(1, (0.35 + pulse * 0.45) * fade);
      ctx.fillStyle = `rgb(${rgb})`;
      if (s.size > 1.5 && pulse > 0.8) {
        ctx.fillRect(ax - ART, ay, ART * 3, ART);
        ctx.fillRect(ax, ay - ART, ART, ART * 3);
        ctx.fillStyle = '#f9e6cf';
      }
      ctx.fillRect(ax, ay, ART, ART);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
}
