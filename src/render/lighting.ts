import { Camera } from '../core/camera';
import { type LightField, PaletteMap } from './palettemap';
import { ART } from './pixel';

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
 * bands with hard edges, the way a palette of a few colours draws a light.
 */
const HOLE_BANDS: readonly (readonly [number, number])[] = [
  [0.34, 1],
  [0.66, 0.62],
  [1, 0.26],
];

/**
 * Two-part lighting. The world is drawn as usual, then a sheet of darkness is
 * laid over it with holes burned where the lights are; and where the lights
 * fall, the palette pass (render/palettemap.ts) lifts what they light one or
 * two steps up its ramp, towards the light's hue. That is what turns a flat
 * night scene into pools of light in the dark - in the palette's own colours,
 * the way a sixteen-bit machine lit a scene, rather than a colour laid over it
 * that the dither turned into grey smog round a row of gems.
 *
 * The darkness is built at a quarter of the view from stamps - a pool of
 * light of each size made once as flat concentric bands, then blitted - and
 * the light field at the same resolution, so there is no gradient anywhere:
 * a light is a few steps of brightness with dithered seams.
 */
export class LightPass {
  private readonly w: number;
  private readonly h: number;
  /** How dark each quarter-pixel is this frame: 0 lit, 255 the zone's full dark. */
  private readonly dark: Uint8Array;
  /** Where the lights fall this frame, for the palette pass. */
  private readonly lit: LightField;

  constructor(viewW: number, viewH: number) {
    this.w = Math.ceil(viewW / MASK);
    this.h = Math.ceil(viewH / MASK);
    this.dark = new Uint8Array(this.w * this.h);
    this.lit = { w: this.w, h: this.h, level: new Uint8Array(this.w * this.h), family: new Uint8Array(this.w * this.h) };
  }

  /**
   * The darkness, laid over the ground layer as its zone's darkness tables
   * (render/palettemap.ts): how dark each quarter-pixel is - the zone's full
   * dark away from the lights, a band less in each band of a pool - and every
   * pixel of the ground stepped down its table by that much. What comes out
   * is the palette's own colours, banded, with no blend left over for the
   * dither to make a checker of. The painted backdrop behind is never
   * darkened: it is painted as it is meant to be seen.
   *
   * @param ambient 0 = untouched daylight, 1 = pitch black away from lights.
   * @param ambientTint colour of the darkness itself, so caves and throne room
   *   fall into their own kind of dark instead of a neutral grey.
   */
  shade(
    image: ImageData,
    camera: Camera,
    lights: readonly Light[],
    ambient: number,
    ambientTint: string,
    palette: PaletteMap,
    ground: Uint8Array,
  ): void {
    const { w, h, dark } = this;
    const camX = camera.renderX;
    const camY = camera.renderY;
    dark.fill(255);
    // Burn the lights out of the darkness, a banded stamp each.
    for (const light of lights) {
      const r = Math.round(light.radius / MASK);
      if (r < 1) continue;
      const x0 = Math.floor((light.x - camX) / MASK);
      const y0 = Math.floor((light.y - camY) / MASK);
      if (x0 + r < 0 || x0 - r >= w || y0 + r < 0 || y0 - r >= h) continue;
      const s = Math.max(0, Math.min(1, light.strength));
      const stamp = hole(r);
      const size = r * 2 + 1;
      for (let sy = 0; sy < size; sy++) {
        const y = y0 - r + sy;
        if (y < 0 || y >= h) continue;
        for (let sx = 0; sx < size; sx++) {
          const x = x0 - r + sx;
          if (x < 0 || x >= w) continue;
          const a = stamp[sy * size + sx];
          if (a === 0) continue;
          const m = y * w + x;
          dark[m] = (dark[m] * (255 - a * s)) / 255;
        }
      }
    }
    const strength = Math.min(MAX_DARK, ambient * DARK_PER_ZONE);
    palette.shade(image, Math.round(camX / ART), Math.round(camY / ART), dark, w, h, palette.darkness(shadeOf(ambientTint), strength), ground);
  }

  /**
   * Where the lights fall this frame, for the palette pass: the world's
   * lights and the glows the actors gave off as they were drawn (see
   * addGlow), each a pool of up to two steps that shrinks with its strength.
   * A light's tint is how much of a pool it makes at all: the hero's own light
   * barely lifts what is round him, a torch makes a pool, and a light with no
   * tint only cuts the darkness.
   */
  field(camera: Camera, lights: readonly Light[]): LightField {
    const lit = this.lit;
    lit.level.fill(0);
    const camX = camera.renderX;
    const camY = camera.renderY;
    for (const light of lights) {
      const amp = Math.max(0, Math.min(1, light.strength)) * Math.max(0, Math.min(1, (light.tint ?? 0.22) / 0.3));
      this.pool((light.x - camX) / MASK, (light.y - camY) / MASK, light.radius / MASK, amp, light.rgb);
    }
    for (const g of glows) this.pool(g.x / MASK, g.y / MASK, g.radius / MASK, g.strength, g.rgb);
    glows.length = 0;
    return lit;
  }

  /** One pool of light into the field, at mask coordinates. */
  private pool(cx: number, cy: number, radius: number, amp: number, rgb: string): void {
    if (amp < 0.05) return;
    const r = Math.max(1, Math.round(radius));
    const x0 = Math.floor(cx);
    const y0 = Math.floor(cy);
    const { w, h, lit } = this;
    if (x0 + r < 0 || x0 - r >= w || y0 + r < 0 || y0 - r >= h) return;
    const stamp = profile(r);
    const fam = familyOf(rgb);
    const size = r * 2 + 1;
    // Three bands at most, a quarter of a band short so the middle of a full
    // light is two steps up and not a third.
    const k = Math.min(1, amp) * 3 * 64 * 0.94;
    for (let sy = 0; sy < size; sy++) {
      const y = y0 - r + sy;
      if (y < 0 || y >= h) continue;
      for (let sx = 0; sx < size; sx++) {
        const x = x0 - r + sx;
        if (x < 0 || x >= w) continue;
        const p = stamp[sy * size + sx];
        if (p === 0) continue;
        const v = Math.min(191, Math.round((p * k) / 255));
        const m = y * w + x;
        if (v > lit.level[m]) {
          lit.level[m] = v;
          lit.family[m] = fam;
        }
      }
    }
  }

}

/* ------------------------------------------------------------- glows */

/** A glow an actor gave off while it was drawn, in screen pixels of the logical view. */
interface Glow {
  x: number;
  y: number;
  radius: number;
  rgb: string;
  strength: number;
}

const glows: Glow[] = [];

/**
 * A glow, given off by something as it is drawn (render/sprites.ts glow):
 * lit into the palette pass with the frame's lights instead of painted as a
 * disc of translucent colour on the actor layer, where the actor pass would
 * have turned it into a field of opaque dots.
 */
export function addGlow(x: number, y: number, radius: number, rgb: string, strength: number): void {
  if (glows.length < 96) glows.push({ x, y, radius, rgb, strength });
}

/** Forgets the glows of a frame that was not lit (the title, a frame drawn twice). */
export function dropGlows(): void {
  glows.length = 0;
}

/* ------------------------------------------------------------- stamps */

const holes = new Map<number, Uint8Array>();

/**
 * The cut-out of a light of radius r mask pixels, 0..255 per pixel: the
 * bands of HOLE_BANDS with hard steps between them, made once per size.
 */
function hole(r: number): Uint8Array {
  let stamp = holes.get(r);
  if (!stamp) {
    const size = r * 2 + 1;
    stamp = new Uint8Array(size * size);
    const reach = HOLE_BANDS.map(([k]) => r * k + 0.5);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = Math.hypot(x - r, y - r);
        let a = 0;
        for (let i = 0; i < HOLE_BANDS.length; i++) {
          if (d <= reach[i]) {
            a = HOLE_BANDS[i][1];
            break;
          }
        }
        stamp[y * size + x] = Math.round(a * 255);
      }
    }
    holes.set(r, stamp);
    if (holes.size > 80) holes.delete(holes.keys().next().value as number);
  }
  return stamp;
}

const profiles = new Map<number, Uint8Array>();

/**
 * How strongly a pool of light of radius r mask pixels lights each of its
 * pixels, 0..255, made once per size: full in the middle third, falling off
 * in a straight line to nothing at the edge. The palette pass cuts this into
 * its bands, with an ordered seam between two.
 */
function profile(r: number): Uint8Array {
  let p = profiles.get(r);
  if (!p) {
    const size = r * 2 + 1;
    p = new Uint8Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = Math.hypot(x - r, y - r) / (r + 0.5);
        p[y * size + x] = Math.round(Math.max(0, Math.min(1, 1.15 - d * 1.35)) * 255);
      }
    }
    profiles.set(r, p);
    if (profiles.size > 160) profiles.delete(profiles.keys().next().value as number);
  }
  return p;
}

const families = new Map<string, number>();
function familyOf(rgb: string): number {
  let f = families.get(rgb);
  if (f === undefined) {
    f = PaletteMap.familyOf(rgb);
    if (families.size > 256) families.clear();
    families.set(rgb, f);
  }
  return f;
}

/**
 * The night of a zone, as the ceiling its darkness pulls towards: its tint,
 * which the zones give as a near-black, raised to a dim shade of the same hue
 * (about L* 22-27, what the art rules ask of terrain out of the light). Out
 * of the light, grass goes a muted blue-green, the caves go blue and the
 * castle maroon; what is already darker than this keeps its own colour.
 */
const shades = new Map<string, [number, number, number]>();
function shadeOf(tint: string): [number, number, number] {
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
  const out: [number, number, number] = [lift(r), lift(g), lift(b)];
  if (shades.size > 64) shades.clear();
  shades.set(tint, out);
  return out;
}
