import { Rect, rectsOverlap } from '../core/math';
import { ART, PixelSprite, makeCanvas, snap } from '../render/pixel';

/** The standing stones and the cracked lintel, lit from the upper left, with runes cut in. */
const FRAME = new PixelSprite(
  [
    'LLLLLLLLLLLLLLLLLLLLLLLLLL',
    'MMMMMMMMMMMMDMMMMMMMMMMMMM',
    'SSSSSSSSSSSDSSSSSSSSSSSSSS',
    'DDDDDDDDDDDDDDDDDDDDDDDDDD',
    'LMSD..................LMSD',
    'LMSD..................LMSD',
    'LSSD..................LSSD',
    'LRSD..................LSRD',
    'LSRD..................LRSD',
    'LRSD..................LSRD',
    'LMSD..................LMSD',
    'LMSD..................LMSD',
    'LSSD..................LSSD',
    'LMSD..................LMSD',
    'LRRD..................LRRD',
    'LMSD..................LMSD',
    'LMSD..................LMSD',
    'LSSD..................LSSD',
    'LMSD..................LMSD',
    'LMSD..................LMSD',
    'LRSD..................LSRD',
    'LSRD..................LRSD',
    'LRSD..................LSRD',
    'LMSD..................LMSD',
    'LSSD..................LSSD',
    'LMSD..................LMSD',
    'LMSD..................LMSD',
    'LMSD..................LMSD',
    'LSSD..................LSSD',
    'MSSDD................DMSSD',
    'DDDDD................DDDDD',
  ],
  { L: '#657392', M: '#424c6e', S: '#2a2f4e', D: '#1a1932', R: '#7a09fa' },
);

/** The tear's colours, rim to core: deep violet out to a pale pink heart. */
const TEAR_RING = ['#3003d9', '#7a09fa', '#db3ffd', '#f389f5', '#fdd2ed'];
/** Where each ring starts, as the squared distance out from the centre (1 = the edge). */
const TEAR_EDGE = [1, 0.72, 0.46, 0.22, 0.08];

/**
 * The tear itself at three sizes - it breathes a step at a time instead of
 * swelling smoothly. Each is a set of hard elliptical rings rasterised once,
 * pixel by pixel, in the palette's own colours.
 */
const TEARS = [0.84, 0.92, 1].map((scale) => {
  const w = 18;
  const h = 27;
  const { canvas, ctx } = makeCanvas(w, h);
  const rx = 8.6 * scale;
  const ry = 12.6 * scale;
  const cx = w / 2 - 0.5;
  const cy = h / 2 - 0.5 + 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const e = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      let ring = -1;
      for (let k = 0; k < TEAR_EDGE.length; k++) if (e < TEAR_EDGE[k]) ring = k;
      if (ring < 0) continue;
      ctx.fillStyle = TEAR_RING[ring];
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return canvas;
});

/** A mote's colour over its fall into the tear: pale at first, deep violet as it goes in. */
const MOTE = ['#fdd2ed', '#f389f5', '#db3ffd', '#7a09fa'];

/**
 * The way home at the far end of the rift. Standing in it ends the run - it is
 * the goal the whole level now points at, since the knight's fall only opens
 * the road rather than finishing it.
 */
export class Portal {
  readonly w = 44;
  readonly h = 62;
  private anim = 0;

  constructor(
    readonly x: number,
    readonly y: number,
  ) {}

  get cx(): number {
    return this.x + this.w / 2;
  }

  get cy(): number {
    return this.y + this.h / 2;
  }

  get rect(): Rect {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  update(dt: number): void {
    this.anim += dt;
  }

  overlaps(r: Rect): boolean {
    return rectsOverlap(this.rect, r);
  }

  /**
   * Two standing stones under a cracked lintel, and the tear between them in
   * rings of hard colour that breathe in three steps; motes are single pixels
   * falling into it, coloured along a ramp as they go rather than fading. Its
   * glow is the light the light pass gives it.
   */
  draw(ctx: CanvasRenderingContext2D): void {
    const x0 = snap(this.x - 4);
    const y0 = snap(this.y);
    const breath = Math.min(2, Math.floor((Math.sin(this.anim * 0.9) + 1) * 1.5));
    ctx.drawImage(TEARS[breath], x0 + 4 * ART, y0 + 4 * ART, 18 * ART, 27 * ART);
    FRAME.draw(ctx, x0, y0);

    // Motes falling inwards along a slow spiral, a whole pixel at a time.
    const cx = x0 + 13 * ART;
    const cy = y0 + 18 * ART;
    for (let i = 0; i < 6; i++) {
      const a = this.anim * 0.7 + i * 1.05;
      const life = a % 1;
      const reach = 1 - life;
      const mx = Math.round(Math.cos(a * 2.3) * 10 * reach);
      const my = Math.round(Math.sin(a * 1.7) * 13 * reach);
      ctx.fillStyle = MOTE[Math.min(MOTE.length - 1, Math.floor(life * MOTE.length))];
      ctx.fillRect(cx + mx * ART, cy + my * ART, ART, ART);
    }
  }
}
