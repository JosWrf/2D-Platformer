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

  draw(ctx: CanvasRenderingContext2D, camera: Camera, time: number, rgb: string): void {
    const { viewW, viewH } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const s of this.spores) {
      const wrapX = (s.x - camera.x * 0.55 * s.depth + Math.sin(time * 0.4 + s.phase) * 26 - time * s.speed) % viewW;
      const x = wrapX < 0 ? wrapX + viewW : wrapX;
      const wrapY = (s.y - camera.y * 0.4 * s.depth - time * s.rise) % viewH;
      const y = wrapY < 0 ? wrapY + viewH : wrapY;
      // Slow individual breathing keeps the field from looking like static.
      const pulse = 0.55 + Math.sin(time * 1.6 + s.phase) * 0.45;
      const halo = s.size * 7;

      const g = ctx.createRadialGradient(x, y, 0, x, y, halo);
      g.addColorStop(0, `rgba(${rgb},${(0.5 * pulse).toFixed(3)})`);
      g.addColorStop(0.4, `rgba(${rgb},${(0.14 * pulse).toFixed(3)})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - halo, y - halo, halo * 2, halo * 2);

      ctx.globalAlpha = 0.55 + pulse * 0.45;
      ctx.fillStyle = '#fff6d8';
      ctx.beginPath();
      ctx.arc(x, y, s.size * 0.85, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
}
