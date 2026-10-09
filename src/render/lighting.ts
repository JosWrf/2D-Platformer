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
  /** How strongly it colours what it lights, on top of the cut-out; 0 disables it. */
  tint?: number;
}

/** The darkness mask is built at a quarter of the logical view: 240×135. */
const MASK = 4;

/**
 * How far the darkness pulls what is not lit down to the zone's shade, at
 * most, and how a zone's darkness (0.72 to 0.95) turns into that share.
 *
 * The darkness used to multiply everything by up to two thirds towards a
 * near-black: with skies and earth already dark, three pixels in four of
 * every frame came out under L* 10 - the earth, the sky and the hero's legs
 * all one black - and a palette with few colours at its dark end turned every
 * further step down into the same violet-black. It is a ceiling now: what is
 * brighter than the zone's shade (see shadeOf) is pulled down towards it,
 * what is darker - a night sky, a cave wall - is left exactly as it was
 * painted. Out of the light a wall can be no brighter than the night it
 * stands in; in it, it is as bright as it is.
 */
const MAX_DARK = 0.72;
const DARK_PER_ZONE = 0.8;

/**
 * The steps of a pool of light, from the middle out: as far as this share of
 * its radius, it lifts this share of the darkness (times its strength). Three
 * bands with hard edges - the way a palette of a few colours draws a light -
 * and between two of them a ring one mask pixel wide at the mean of both,
 * which the palette's ordered dither turns into a seam of mixed pixels.
 */
const HOLE_BANDS: readonly (readonly [number, number])[] = [
  [0.34, 1],
  [0.66, 0.62],
  [1, 0.26],
];

/** The lights' own colour, in two steps: a bright middle and a faint rim. */
const TINT_BANDS: readonly (readonly [number, number])[] = [
  [0.45, 1],
  [0.85, 0.38],
];

/**
 * How far a light's colour is darkened before it is laid on as a dodge: a
 * channel at full in the light raises what it lights by up to 1 / (1 - 0.4),
 * two thirds again; a channel the light has none of leaves it as it is.
 */
const DODGE = 0.4;

/**
 * Two-pass lighting. The world is drawn as usual, then a sheet of darkness is
 * laid over it with holes burned where the lights are, and finally the lit
 * spots take on the colour of what lights them. That is what turns a flat
 * night scene into pools of light in the dark.
 *
 * Both sheets are built at a quarter of the view from stamps - a pool of light
 * of each size made once as flat concentric bands, then blitted - and laid on
 * without smoothing. There is no gradient anywhere in it: a light is three
 * steps of brightness with dithered seams, at whatever size it is, and the
 * stamps cost a blit each instead of a radial gradient built every frame.
 */
export class LightPass {
  private readonly shadow: HTMLCanvasElement;
  private readonly shadowCtx: CanvasRenderingContext2D;
  /** The lights' own colour, at the mask's resolution too. */
  private readonly glow: HTMLCanvasElement;
  private readonly glowCtx: CanvasRenderingContext2D;
  private readonly w: number;
  private readonly h: number;
  private readonly holes = new Map<number, HTMLCanvasElement>();
  private readonly tints = new Map<string, HTMLCanvasElement>();

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
    const dark = Math.min(MAX_DARK, ambient * DARK_PER_ZONE);

    sc.globalCompositeOperation = 'source-over';
    sc.globalAlpha = 1;
    sc.clearRect(0, 0, w, h);
    sc.fillStyle = shadeOf(ambientTint);
    sc.globalAlpha = dark;
    sc.fillRect(0, 0, w, h);

    // Burn the lights out of the darkness, a banded stamp each.
    sc.globalCompositeOperation = 'destination-out';
    for (const light of lights) {
      const r = Math.round(light.radius / MASK);
      if (r < 1) continue;
      const x = Math.floor((light.x - camX) / MASK);
      const y = Math.floor((light.y - camY) / MASK);
      if (x + r < 0 || x - r > w || y + r < 0 || y - r > h) continue;
      sc.globalAlpha = Math.max(0, Math.min(1, light.strength));
      sc.drawImage(this.hole(r), x - r, y - r);
    }
    sc.globalCompositeOperation = 'source-over';
    sc.globalAlpha = 1;

    // No smoothing of its own: each mask pixel is two art pixels square. Laid
    // on as a ceiling (see MAX_DARK): darken keeps whichever is darker, the
    // world or the shade, channel by channel.
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = 'darken';
    ctx.drawImage(this.shadow, 0, 0, w * MASK, h * MASK);
    ctx.restore();

    // Give the lit spots their colour: drawn at the mask's resolution too, a
    // quarter of the work, and laid on in one go - as a gain, not added. Added,
    // a torch's orange laid a disc of flat grey over a night sky, because
    // warm light on top of a cold near-black is grey; laid over, it took the
    // blue out of a cave wall round a row of gems and left a grey box. As a
    // dodge with the light's colour darkened (see DODGE), each channel of what
    // is lit is raised in proportion to how bright it already is, by up to the
    // light's own hue: a lit wall turns amber, black stays black, and nothing
    // is ever made darker by a light.
    const gc = this.glowCtx;
    gc.globalCompositeOperation = 'source-over';
    gc.globalAlpha = 1;
    gc.clearRect(0, 0, w, h);
    gc.globalCompositeOperation = 'lighter';
    let any = false;
    for (const light of lights) {
      const tint = (light.tint ?? 0.22) * 2.2 * light.strength;
      if (tint <= 0.01) continue;
      const r = Math.round((light.radius * 0.85) / MASK);
      if (r < 1) continue;
      const x = Math.floor((light.x - camX) / MASK);
      const y = Math.floor((light.y - camY) / MASK);
      if (x + r < 0 || x - r > w || y + r < 0 || y - r > h) continue;
      gc.globalAlpha = Math.min(1, tint);
      gc.drawImage(this.tint(r, light.rgb), x - r, y - r);
      any = true;
    }
    gc.globalAlpha = 1;
    gc.globalCompositeOperation = 'source-over';
    if (any) {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.globalCompositeOperation = 'color-dodge';
      ctx.drawImage(this.glow, 0, 0, w * MASK, h * MASK);
      ctx.restore();
    }
  }

  /** The cut-out of a light of radius r mask pixels: banded alpha, made once. */
  private hole(r: number): HTMLCanvasElement {
    let stamp = this.holes.get(r);
    if (!stamp) {
      stamp = bandedDisc(r, HOLE_BANDS, '0,0,0');
      this.holes.set(r, stamp);
      if (this.holes.size > 80) this.holes.delete(this.holes.keys().next().value as number);
    }
    return stamp;
  }

  /** A light's own colour, darkened for the dodge, at radius r mask pixels: two flat bands, made once. */
  private tint(r: number, rgb: string): HTMLCanvasElement {
    const id = `${r}|${rgb}`;
    let stamp = this.tints.get(id);
    if (!stamp) {
      const dodge = rgb
        .split(',')
        .map((v) => Math.round(Number(v) * DODGE))
        .join(',');
      stamp = bandedDisc(r, TINT_BANDS, dodge);
      this.tints.set(id, stamp);
      if (this.tints.size > 120) this.tints.delete(this.tints.keys().next().value as string);
    }
    return stamp;
  }
}

/**
 * A disc of radius r pixels in flat concentric bands of one colour: band i
 * reaches out to bands[i][0] of the radius at alpha bands[i][1]. Where one
 * band meets the next, a ring one pixel wide takes the mean of the two, for
 * the palette's dither to make a seam of; the outer edge gets the same ring
 * at half the last band. Made once per size and colour, pixel by pixel, then
 * only ever blitted.
 */
function bandedDisc(r: number, bands: readonly (readonly [number, number])[], rgb: string): HTMLCanvasElement {
  const size = r * 2 + 1;
  const { canvas, ctx } = makeCanvas(size, size);
  const reach = bands.map(([k]) => r * k + 0.5);
  /** The alpha of a pixel at distance d: its band, or a seam between two. */
  const alphaAt = (d: number): number => {
    for (let i = 0; i < bands.length; i++) {
      if (d <= reach[i] - 1) return bands[i][1];
      if (d <= reach[i]) return (bands[i][1] + (bands[i + 1]?.[1] ?? 0)) / 2;
    }
    return 0;
  };
  for (let y = 0; y < size; y++) {
    const dy = y - r;
    let runStart = 0;
    let runAlpha = -1;
    for (let x = 0; x <= size; x++) {
      const a = x < size ? alphaAt(Math.hypot(x - r, dy)) : -1;
      if (a !== runAlpha) {
        if (runAlpha > 0) {
          ctx.fillStyle = `rgba(${rgb},${runAlpha.toFixed(3)})`;
          ctx.fillRect(runStart, y, x - runStart, 1);
        }
        runAlpha = a;
        runStart = x;
      }
    }
  }
  return canvas;
}

/**
 * The night of a zone, as the ceiling its darkness pulls towards: its tint,
 * which the zones give as a near-black, raised to a dim shade of the same hue
 * (about L* 22-27, what the art rules ask of terrain out of the light). Out
 * of the light, grass goes a muted blue-green, the caves go blue and the
 * castle maroon; what is already darker than this keeps its own colour.
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
  const k = 92 / top;
  // A floor under every channel, so a tint with no red at all does not drive
  // the reds of the world to nothing.
  const lift = (v: number): number => Math.round(14 + v * k * 0.86);
  const out = `rgb(${lift(r)},${lift(g)},${lift(b)})`;
  if (shades.size > 64) shades.clear();
  shades.set(tint, out);
  return out;
}
