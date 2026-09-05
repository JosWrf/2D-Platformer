import { Camera } from '../core/camera';

/** A single glowing thing in the world. */
export interface Light {
  x: number;
  y: number;
  radius: number;
  /** Core colour, given as "r,g,b" so the pass can vary the alpha. */
  rgb: string;
  /** 0..1 - how much darkness this light cuts away. */
  strength: number;
  /** Extra additive tint on top of the cut-out, 0 disables it. */
  tint?: number;
}

/**
 * Two-pass lighting. The world is drawn as usual, then a sheet of darkness is
 * laid over it with holes burned where the lights are, and finally the lit
 * spots get a breath of their own colour added back. That is what turns a flat
 * night scene into pools of light in the dark.
 */
export class LightPass {
  private readonly shadow: HTMLCanvasElement;
  private readonly shadowCtx: CanvasRenderingContext2D;

  constructor(
    private readonly viewW: number,
    private readonly viewH: number,
  ) {
    this.shadow = document.createElement('canvas');
    this.shadow.width = viewW;
    this.shadow.height = viewH;
    this.shadowCtx = this.shadow.getContext('2d') as CanvasRenderingContext2D;
  }

  /**
   * @param ambient 0 = untouched daylight, 1 = pitch black away from lights.
   * @param ambientTint colour of the darkness itself, so caves and throne room
   *   fall into their own kind of black instead of a neutral grey.
   */
  draw(
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    lights: readonly Light[],
    ambient: number,
    ambientTint: string,
  ): void {
    const { viewW, viewH } = this;
    const sc = this.shadowCtx;
    const camX = camera.renderX;
    const camY = camera.renderY;

    sc.globalCompositeOperation = 'source-over';
    sc.clearRect(0, 0, viewW, viewH);
    sc.fillStyle = ambientTint;
    sc.globalAlpha = ambient;
    sc.fillRect(0, 0, viewW, viewH);
    sc.globalAlpha = 1;

    // Burn the lights out of the darkness.
    sc.globalCompositeOperation = 'destination-out';
    for (const light of lights) {
      const x = light.x - camX;
      const y = light.y - camY;
      const r = light.radius;
      if (x + r < 0 || x - r > viewW || y + r < 0 || y - r > viewH) continue;
      const g = sc.createRadialGradient(x, y, 0, x, y, r);
      const s = Math.max(0, Math.min(1, light.strength));
      // Bright core, quick falloff: a pool of light with an edge, not a haze.
      g.addColorStop(0, `rgba(0,0,0,${s})`);
      g.addColorStop(0.28, `rgba(0,0,0,${(s * 0.86).toFixed(3)})`);
      g.addColorStop(0.62, `rgba(0,0,0,${(s * 0.34).toFixed(3)})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      sc.fillStyle = g;
      sc.fillRect(x - r, y - r, r * 2, r * 2);
    }

    ctx.drawImage(this.shadow, 0, 0);

    // Give the lit spots their colour back.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const light of lights) {
      const tint = light.tint ?? 0.22;
      if (tint <= 0) continue;
      const x = light.x - camX;
      const y = light.y - camY;
      const r = light.radius * 0.85;
      if (x + r < 0 || x - r > viewW || y + r < 0 || y - r > viewH) continue;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${light.rgb},${(tint * light.strength).toFixed(3)})`);
      g.addColorStop(0.5, `rgba(${light.rgb},${(tint * light.strength * 0.32).toFixed(3)})`);
      g.addColorStop(1, `rgba(${light.rgb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.restore();
  }
}
