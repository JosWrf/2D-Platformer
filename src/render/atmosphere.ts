import { Camera } from '../core/camera';
import { Rng } from '../core/math';

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
      const halo = s.size * 7;

      const g = ctx.createRadialGradient(x, y, 0, x, y, halo);
      g.addColorStop(0, `rgba(${rgb},${(0.34 * pulse * fade).toFixed(3)})`);
      g.addColorStop(0.4, `rgba(${rgb},${(0.14 * pulse * fade).toFixed(3)})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - halo, y - halo, halo * 2, halo * 2);

      // Capped well below the hero's own brightness: decoration must never
      // outshine the things that can kill you.
      ctx.globalAlpha = (0.3 + pulse * 0.3) * fade;
      ctx.fillStyle = '#ffe6b4';
      // The centre is on a whole pixel, so the disc is blended the same way in
      // every frame. It is the sub-pixel centre that made the field crawl, not
      // the soft edge - and a hard square instead of a disc reads as a speck of
      // dirt rather than a mote.
      ctx.beginPath();
      ctx.arc(x, y, s.size * 0.85, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
}
