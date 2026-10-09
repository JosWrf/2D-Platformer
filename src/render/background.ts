import { Camera } from '../core/camera';
import { type Art, type Ink, type Look, type Painting, type Strip, paintBackdrop } from './backdrops';
import { ZONES, type Zone, zoneBlend } from './palette';
import { ART, ART_H, ART_W } from './pixel';
import type { Abgr } from './pixpaint';

/** A strip of a built backdrop, ready to blit. */
interface Layer {
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
  k: number;
  ky: number;
  y: number;
  below: string | null;
  above: string | null;
  drift: number;
  sparks: { x: number; y: number; css: string; period: number; on: number; phase: number }[];
  drips: { x: number; top: number; bottom: number; period: number; phase: number; css: string }[];
}

interface Built {
  layers: Layer[];
  /** The strip in front of everything, if the zone has one (a list of none or one). */
  front: Layer[];
}

/** How many zones' backdrops are kept painted at once. */
const KEEP = 5;
/** How fast a drop falls, in art pixels a second squared. */
const GRAVITY = 260;
/** Where in a zone blend (0-1) the backdrops' dissolve starts, and how long it takes. */
const DISSOLVE_FROM = 0.35;
const DISSOLVE_SPAN = 0.3;
/** The order rows join the dissolve in, sixteen to a cycle, spread as evenly as can be. */
const ROW_ORDER = [0, 8, 4, 12, 2, 10, 6, 14, 1, 9, 5, 13, 3, 11, 7, 15];

/**
 * The parallax backdrop: a sky (or a hall's far wall) and five or more strips
 * of scenery at their own depths, painted once per zone into wide canvases of
 * art pixels (render/backdrops.ts) and slid past at whole-pixel offsets - a
 * handful of blits a frame instead of the gradients and paths it used to
 * redraw every time.
 *
 * Two zones meet over the last 700 pixels before the next one starts. In the
 * middle of that stretch the coming backdrop is laid over the going one a row
 * at a time - one row in sixteen, then two, then every other row, in an
 * ordered sequence - so every pixel on screen is still one backdrop's own
 * colour, never a blend of two, and the rows stay put on the screen while
 * the layers slide past behind them.
 */
export class Background {
  private readonly cache = new Map<string, Built>();
  private readonly keys = new Map<Zone, string>();
  /** Backdrops being painted ahead of time, a step a frame. */
  private readonly jobs = new Map<string, { ink: Ink; painting: Painting; art: Art | null; layers: Layer[] }>();
  /** The rows of the dissolve at each of its levels, made once. */
  private readonly rows: Path2D[] = [];

  constructor(
    private readonly viewW: number,
    private readonly viewH: number,
  ) {}

  draw(ctx: CanvasRenderingContext2D, camera: Camera, time: number): void {
    const focusX = camera.x + this.viewW / 2;
    const { from, to, t } = zoneBlend(focusX);
    const camX = camera.renderX / ART;
    const camY = camera.renderY / ART;
    // Where the camera rests on the main floor: every strip is placed for that
    // and drifts down from there, at its own depth, as the camera climbs.
    const restY = Math.max(0, camera.worldBounds.h - this.viewH) / ART;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = false;

    const going = this.built(from);
    const coming = t > 0 ? this.built(to) : going;
    // The dissolve takes the middle of the blend, about two hundred pixels
    // of walking: a crossing, not a long stretch of two backdrops at once.
    const d = Math.min(1, Math.max(0, (t - DISSOLVE_FROM) / DISSOLVE_SPAN));
    const level = coming === going ? 0 : Math.round(d * 16);
    // Each backdrop is laid out from where its zone begins, so a set piece -
    // a moon, a clock face - is where it was placed whichever way the hero
    // came in.
    if (level < 16) this.paint(ctx, going.layers, camX - from.start / ART, camY, restY, time);
    if (level >= 16) {
      this.paint(ctx, coming.layers, camX - to.start / ART, camY, restY, time);
    } else if (level > 0) {
      // Painted straight over the going backdrop, clipped to its rows: no
      // second canvas, no mask pass.
      ctx.save();
      ctx.clip(this.rowsAt(level));
      this.paint(ctx, coming.layers, camX - to.start / ART, camY, restY, time);
      ctx.restore();
    }
    ctx.restore();

    this.prepareNeighbours(focusX);
  }

  /**
   * The sparse strip in front of everything, at 1.25 - a few dark clumps
   * along the bottom edge. Drawn after the actors and the light pass, so it
   * is painted in the palette's own colours. Between two zones each shows
   * the clumps of whichever zone is nearer.
   */
  drawFront(ctx: CanvasRenderingContext2D, camera: Camera): void {
    const focusX = camera.x + this.viewW / 2;
    const { from, to, t } = zoneBlend(focusX);
    const zone = t > 0.5 ? to : from;
    const front = this.built(zone).front;
    if (front.length === 0) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = false;
    const restY = Math.max(0, camera.worldBounds.h - this.viewH) / ART;
    this.paint(ctx, front, camera.renderX / ART - zone.start / ART, camera.renderY / ART, restY, 0);
    ctx.restore();
  }

  /** Strips, far to near; camX is measured from where their zone begins. */
  private paint(ctx: CanvasRenderingContext2D, layers: readonly Layer[], camX: number, camY: number, restY: number, time: number): void {
    for (const layer of layers) {
      const shift = Math.round(camX * layer.k + time * layer.drift);
      const ox = ((shift % layer.w) + layer.w) % layer.w;
      const y = layer.y + Math.round((restY - camY) * layer.ky);
      if (layer.above && y > 0) {
        ctx.fillStyle = layer.above;
        ctx.fillRect(0, 0, ART_W, y);
      }
      for (let x = -ox; x < ART_W; x += layer.w) ctx.drawImage(layer.canvas, x, y);
      if (layer.below && y + layer.h < ART_H) {
        ctx.fillStyle = layer.below;
        ctx.fillRect(0, y + layer.h, ART_W, ART_H - (y + layer.h));
      }
      for (const s of layer.sparks) {
        if ((time + s.phase) % s.period >= s.on) continue;
        ctx.fillStyle = s.css;
        for (let x = s.x - ox; x < ART_W; x += layer.w) if (x >= 0) ctx.fillRect(x, y + s.y, 1, 1);
      }
      for (const d of layer.drips) {
        // A drop falls, and for a moment after it lands two pixels splash.
        const age = (time + d.phase) % d.period;
        const fall = Math.sqrt((2 * (d.bottom - d.top)) / GRAVITY);
        ctx.fillStyle = d.css;
        for (let x = d.x - ox; x < ART_W; x += layer.w) {
          if (x < 1) continue;
          if (age < fall) {
            const dy = Math.round(d.top + 0.5 * GRAVITY * age * age);
            ctx.fillRect(x, y + dy, 1, age > fall * 0.5 ? 2 : 1);
          } else if (age < fall + 0.2) {
            ctx.fillRect(x - 1, y + d.bottom - 1, 1, 1);
            ctx.fillRect(x + 1, y + d.bottom - 1, 1, 1);
          }
        }
      }
    }
  }

  /** The rows the coming backdrop shows through at a level of 0-16. */
  private rowsAt(level: number): Path2D {
    let path = this.rows[level];
    if (!path) {
      path = new Path2D();
      for (let y = 0; y < ART_H; y++) if (ROW_ORDER[y & 15] < level) path.rect(0, y, ART_W, 1);
      this.rows[level] = path;
    }
    return path;
  }

  /**
   * Paints the next zone's backdrop a little before the blend into it begins,
   * and the last one's while the hero is still near the door he came in by -
   * a strip a frame, so that crossing over never waits on a painting and no
   * single frame pays for a whole one.
   */
  private prepareNeighbours(focusX: number): void {
    let i = 0;
    while (i < ZONES.length - 1 && ZONES[i + 1].start <= focusX) i++;
    const next = ZONES[i + 1];
    if (next && next.start - focusX < 2400 && this.step(next)) return;
    const prev = ZONES[i - 1];
    if (prev && focusX - ZONES[i].start < 900) this.step(prev);
  }

  /** The key a zone's backdrop is kept under: zones that look alike share one. */
  private keyOf(zone: Zone): string {
    let key = this.keys.get(zone);
    if (key === undefined) {
      const ink = this.inkFor(zone);
      key = `${zone.backdrop}|${zone.skyTop}|${zone.skyBottom}|${zone.hillFar}|${zone.hillNear}|${zone.ambient}|${zone.calm}|${ink.factorKey}`;
      this.keys.set(zone, key);
    }
    return key;
  }

  /** A zone's backdrop, finished now if it has to be: it is wanted this frame. */
  private built(zone: Zone): Built {
    const key = this.keyOf(zone);
    const built = this.cache.get(key);
    if (built) {
      if (this.cache.size > 1) {
        // Most recently used last, so the oldest is the one let go.
        this.cache.delete(key);
        this.cache.set(key, built);
      }
      return built;
    }
    let done: Built | null = null;
    while (!done) done = this.advance(zone, key);
    return done;
  }

  /** One step towards a zone's backdrop; true if there was one to take. */
  private step(zone: Zone): boolean {
    const key = this.keyOf(zone);
    if (this.cache.has(key)) return false;
    this.advance(zone, key);
    return true;
  }

  /**
   * One step of painting: a strip of the recipe, or turning one painted strip
   * into a canvas. Returns the backdrop once it is whole.
   */
  private advance(zone: Zone, key: string): Built | null {
    let job = this.jobs.get(key);
    if (!job) {
      const look: Look = {
        top: zone.skyTop,
        horizon: zone.skyBottom,
        far: zone.hillFar,
        near: zone.hillNear,
        accent: zone.ambient,
        calm: zone.calm,
      };
      const { ink } = this.inkFor(zone);
      job = { ink, painting: paintBackdrop(zone.backdrop, look, ink), art: null, layers: [] };
      this.jobs.set(key, job);
    }
    if (!job.art) {
      const r = job.painting.next();
      if (r.done) job.art = r.value;
      return null;
    }
    if (job.layers.length < job.art.strips.length) {
      job.layers.push(layerOf(job.art.strips[job.layers.length], job.ink));
      return null;
    }
    const built: Built = { layers: job.layers, front: job.art.front ? [layerOf(job.art.front, plain)] : [] };
    this.jobs.delete(key);
    this.cache.set(key, built);
    while (this.cache.size > KEEP) this.cache.delete(this.cache.keys().next().value as string);
    return built;
  }

  /**
   * The ink for a zone: the palette's colours as they are. The backdrop is
   * painted as it is meant to be seen - the darkness of the light pass falls
   * on the ground layer in front of it, never on the painted strips (it used
   * to, and every colour had to be painted brighter by what the darkness
   * would take from it again, which a light then burned back through as a
   * halo in the sky).
   */
  private inkFor(_zone: Zone): { ink: Ink; factorKey: string } {
    return { ink: plain, factorKey: 'plain' };
  }
}

/** The palette's colours as they are. */
const plain: Ink = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return ((255 << 24) | ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255)) >>> 0;
};

function layerOf(s: Strip, ink: Ink): Layer {
  return {
    canvas: s.pix.canvas(),
    w: s.pix.w,
    h: s.pix.h,
    k: s.k,
    ky: s.ky ?? s.k,
    y: s.y,
    below: s.below ? css(ink(s.below)) : null,
    above: s.above ? css(ink(s.above)) : null,
    drift: s.drift ?? 0,
    sparks: (s.sparks ?? []).map((sp) => ({ ...sp, css: css(ink(sp.hex)) })),
    drips: (s.drips ?? []).map((d) => ({ ...d, css: css(ink(d.hex)) })),
  };
}

function css(c: Abgr): string {
  return `rgb(${c & 255},${(c >>> 8) & 255},${(c >>> 16) & 255})`;
}
