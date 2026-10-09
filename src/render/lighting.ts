import { Camera } from '../core/camera';
import { makeCanvas } from './pixel';

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

/** The darkness mask is built at a quarter of the logical view: 240×135. */
const MASK = 4;

/**
 * The darkness at its strongest, as the share of a colour it takes away. The
 * zones ask for 0.72 to 0.95, and laid over a near-black at that strength the
 * frame came out with nine pixels in ten all but black - the earth, the sky
 * and the hero's legs all the same black. Now the darkest a zone gets takes
 * two thirds, and it takes it towards the zone's own colour (multiply), so a
 * shadow in the caves is a deep blue rather than nothing.
 */
const MAX_DARK = 0.66;

/**
 * Two-pass lighting. The world is drawn as usual, then a sheet of darkness is
 * laid over it with holes burned where the lights are, and finally the lit
 * spots get a breath of their own colour added back. That is what turns a flat
 * night scene into pools of light in the dark.
 *
 * The sheet is built at a quarter of the view and laid on without smoothing;
 * the palette the whole frame is mapped to then cuts its falloff into a few
 * bands with an ordered dither between them - pools of light with stepped
 * edges, as a palette of a few colours draws them, rather than a smooth haze.
 */
export class LightPass {
  private readonly shadow: HTMLCanvasElement;
  private readonly shadowCtx: CanvasRenderingContext2D;
  /** The lights' own colour, at the mask's resolution too. */
  private readonly glow: HTMLCanvasElement;
  private readonly glowCtx: CanvasRenderingContext2D;
  private readonly w: number;
  private readonly h: number;

  constructor(viewW: number, viewH: number) {
    this.w = Math.ceil(viewW / MASK);
    this.h = Math.ceil(viewH / MASK);
    ({ canvas: this.shadow, ctx: this.shadowCtx } = makeCanvas(this.w, this.h));
    ({ canvas: this.glow, ctx: this.glowCtx } = makeCanvas(this.w, this.h));
  }

  /**
   * @param ambient 0 = untouched daylight, 1 = pitch black away from lights.
   * @param ambientTint colour of the darkness itself, so caves and throne room
   *   fall into their own kind of dark instead of a neutral grey.
   */
  draw(
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    lights: readonly Light[],
    ambient: number,
    ambientTint: string,
  ): void {
    const { w, h } = this;
    const sc = this.shadowCtx;
    const camX = camera.renderX;
    const camY = camera.renderY;
    const dark = Math.min(MAX_DARK, ambient * 0.72);

    sc.globalCompositeOperation = 'source-over';
    sc.clearRect(0, 0, w, h);
    sc.fillStyle = shadeOf(ambientTint);
    sc.globalAlpha = dark;
    sc.fillRect(0, 0, w, h);
    sc.globalAlpha = 1;

    // Burn the lights out of the darkness.
    sc.globalCompositeOperation = 'destination-out';
    for (const light of lights) {
      const x = (light.x - camX) / MASK;
      const y = (light.y - camY) / MASK;
      const r = light.radius / MASK;
      if (x + r < 0 || x - r > w || y + r < 0 || y - r > h) continue;
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
    sc.globalCompositeOperation = 'source-over';

    // No smoothing of its own: the palette the frame is mapped to cuts it into
    // bands, with an ordered dither where one meets the next.
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(this.shadow, 0, 0, w * MASK, h * MASK);
    ctx.restore();

    // Give the lit spots their colour back: drawn at the mask's resolution
    // too, a quarter of the work, and laid on in one go.
    const gc = this.glowCtx;
    gc.globalCompositeOperation = 'source-over';
    gc.clearRect(0, 0, w, h);
    gc.globalCompositeOperation = 'lighter';
    let any = false;
    for (const light of lights) {
      const tint = (light.tint ?? 0.22) * 0.7;
      if (tint <= 0) continue;
      const x = (light.x - camX) / MASK;
      const y = (light.y - camY) / MASK;
      const r = (light.radius * 0.85) / MASK;
      if (x + r < 0 || x - r > w || y + r < 0 || y - r > h) continue;
      const g = gc.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${light.rgb},${(tint * light.strength).toFixed(3)})`);
      g.addColorStop(0.5, `rgba(${light.rgb},${(tint * light.strength * 0.32).toFixed(3)})`);
      g.addColorStop(1, `rgba(${light.rgb},0)`);
      gc.fillStyle = g;
      gc.fillRect(x - r, y - r, r * 2, r * 2);
      any = true;
    }
    if (any) {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(this.glow, 0, 0, w * MASK, h * MASK);
      ctx.restore();
    }
  }
}

/**
 * The colour a zone's darkness multiplies towards: its tint, which the zones
 * give as a near-black, raised to a deep but saturated shade of the same hue.
 * Multiplied by black, every colour is black; multiplied by this, a lit green
 * stays a dark green and the caves stay blue.
 */
const shades = new Map<string, string>();
function shadeOf(tint: string): string {
  const cached = shades.get(tint);
  if (cached) return cached;
  let r = 0;
  let g = 0;
  let b = 0;
  const m = /^#?([0-9a-f]{6})$/i.exec(tint.trim());
  if (m) {
    const v = parseInt(m[1], 16);
    r = (v >> 16) & 255;
    g = (v >> 8) & 255;
    b = v & 255;
  } else {
    const rgb = /rgba?\(([^)]+)\)/.exec(tint);
    if (rgb) [r, g, b] = rgb[1].split(',').map((s) => Number(s.trim()));
  }
  const top = Math.max(r, g, b, 1);
  const k = 78 / top;
  const out = `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`;
  shades.set(tint, out);
  return out;
}
