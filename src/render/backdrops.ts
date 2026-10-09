import { Rng } from '../core/math';
import {
  type Abgr,
  Pix,
  abgr,
  arch,
  banner,
  bayerOn,
  brush,
  cog,
  column,
  crenels,
  crystal,
  deadTree,
  fir,
  heights,
  island,
  masonry,
  noise,
  pointed,
  reflect,
  ridge,
  spike,
  tower,
  web,
} from './pixpaint';

/*
 * The backdrops: what stands behind the play, zone by zone - a sky or a
 * hall's far wall and five or more strips of scenery at their own depths,
 * painted once into wide strips of art pixels (render/pixpaint.ts) and slid
 * past by the Background (render/background.ts).
 *
 * Everything is drawn in colours the backdrop names from the palette, with
 * every gradient, mist and fade an ordered dither baked into the strip. The
 * palette pass dithers what falls between two of its colours with a pattern
 * fixed to the world, and on a layer that moves at a fifth of the camera's
 * speed that pattern would crawl like frosted glass; baked in, it moves with
 * the layer.
 *
 * The colours go through an Ink on the way in: the light pass darkens all
 * that is drawn before it, the backdrop included, so each colour is painted
 * as whatever that darkness turns into the palette colour it was chosen as
 * (most come through it untouched and are painted as they are). The values
 * follow the art bible: the far layers light and grey with haze, each nearer
 * one darker, and the strip right behind the play darkest, so the hero
 * stands out against it however much light he carries.
 *
 * Rows are art pixels on screen with the camera resting on the main floor,
 * whose surface is then row 206: the hero stands in rows 186-206, and the
 * strip at three quarters of the camera's speed fills the band from about
 * row 160 down with dark scenery for him to stand out against.
 */

/** Turns a palette colour into what has to be painted to see it on screen. */
export type Ink = (hex: string) => Abgr;

/** One painted strip and how it moves. */
export interface Strip {
  pix: Pix;
  /** Parallax: art pixels it moves for each art pixel the camera moves. */
  k: number;
  /** Art y of the strip's top while the camera rests on the main floor. */
  y: number;
  /** Vertical parallax, if it differs from k: the sky does not climb with the hero. */
  ky?: number;
  /** Palette colour that continues the strip's body below it, if any. */
  below?: string;
  /** And above it, for a ceiling. */
  above?: string;
  /** Sideways drift in art pixels a second (mist); left at 0 in calm zones. */
  drift?: number;
  /** Pixels that wink on and off over the strip. */
  sparks?: Spark[];
  /** Drops falling down the strip. */
  drips?: Drip[];
}

/** A pixel that shows `hex` for `on` seconds of every `period`. */
export interface Spark {
  x: number;
  y: number;
  hex: string;
  period: number;
  on: number;
  phase: number;
}

/** A drop falling from `top` to `bottom` once every `period` seconds, with a splash. */
export interface Drip {
  x: number;
  top: number;
  bottom: number;
  period: number;
  phase: number;
  hex: string;
}

/** What a recipe needs to know about the zone it paints. */
export interface Look {
  /** Palette colour at the top of the sky or hall. */
  top: string;
  /** Palette colour along the horizon, or at the foot of the hall. */
  horizon: string;
  /** The far layers' body colour. */
  far: string;
  /** The near layers' body colour. */
  near: string;
  /** Mist, water light or glow: the zone's accent. */
  accent: string;
  calm: boolean;
}

/** A backdrop being painted: it yields after each strip and returns the whole. */
export type Painting = Generator<void, Art, void>;

export interface Art {
  strips: Strip[];
  /**
   * A sparse strip in front of everything, at 1.25: drawn after the light
   * pass, so painted in the palette's colours as they are.
   */
  front?: Strip;
}

/** The darkest colour of the backdrops: shade in the strips right behind the play. */
const DEEP = '#0e071b';

/* ----------------------------------------------------------------- sky */

interface SkyPlan {
  /** Bands of the top colour over the horizon's, as [rows, dither level 0-16], from the top down. */
  zenith: readonly (readonly [number, number])[];
  /** The accent glowing along the horizon, as [first row, rows, level from, level to]. */
  glow: readonly (readonly [number, number, number, number])[];
  stars: number;
  /** Rows the stars keep to. */
  starRows: number;
  starHex?: readonly [string, string];
  /** Centre and radius of the moon, and its colours: disc, seas, lit rim, haze. */
  moon?: { x: number; y: number; r: number; disc: string; sea: string; lit: string; haze?: string; crescent?: boolean };
}

/**
 * A night sky: flat bands from the top colour down to the horizon's, each a
 * step of an ordered dither - five or six, the way a palette draws a
 * gradient - the zone's accent glowing along the horizon, stars, and a moon.
 * It hangs nearly still, as far things do, and does not climb with the hero.
 */
function nightSky(look: Look, ink: Ink, rng: Rng, plan: SkyPlan): Strip {
  const p = new Pix(640, 272);
  const top = ink(look.top);
  const base = ink(look.horizon);
  p.rect(0, 0, p.w, p.h, base);
  let row = 0;
  for (const [rows, level] of plan.zenith) {
    p.dither(0, row, p.w, rows, top, level);
    row += rows;
  }
  const glow = ink(look.accent);
  for (const [from, rows, a, b] of plan.glow) p.fade(from, rows, glow, a, b);
  const [dim, bright] = plan.starHex ?? ['#424c6e', '#657392'];
  const sparks: Spark[] = [];
  for (let i = 0; i < plan.stars; i++) {
    const y = Math.floor(Math.pow(rng.next(), 1.5) * plan.starRows);
    const x = rng.int(0, p.w - 1);
    const big = rng.next() < 0.14;
    p.set(x, y, ink(big ? bright : dim));
    // A few of them twinkle - not in a calm zone, where nothing should.
    if (!look.calm && rng.next() < 0.2) {
      sparks.push({ x, y, hex: big ? '#92a1b9' : bright, period: rng.range(2.5, 6), on: 0.16, phase: rng.range(0, 6) });
    }
  }
  const moon = plan.moon;
  if (moon) {
    const { x: mx, y: my, r } = moon;
    // A ring of haze round it, then the disc, its seas, and the rim the sun
    // still catches - to the upper left, like every light in the game.
    const haze = ink(moon.haze ?? look.accent);
    for (let y = -r - 5; y <= r + 5; y++) {
      for (let x = -r - 5; x <= r + 5; x++) {
        const d = Math.sqrt(x * x + y * y);
        if (d <= r + 0.5) p.set(mx + x, my + y, base);
        else if (d < r + 5.5) p.dither(mx + x, my + y, 1, 1, haze, d < r + 2.5 ? 7 : 3);
      }
    }
    p.disc(mx, my, r, ink(moon.disc));
    const sea = ink(moon.sea);
    p.disc(mx + Math.round(r * 0.3), my + Math.round(r * 0.2), Math.round(r * 0.36), sea);
    p.disc(mx - Math.round(r * 0.35), my + Math.round(r * 0.45), Math.round(r * 0.2), sea);
    p.disc(mx + Math.round(r * 0.05), my - Math.round(r * 0.45), Math.round(r * 0.16), sea);
    const lit = ink(moon.lit);
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        const d = x * x + y * y;
        if (d <= (r + 0.5) * (r + 0.5) && d > (r - 1.2) * (r - 1.2) && x + y < -r * 0.5) p.set(mx + x, my + y, lit);
      }
    }
    if (moon.crescent) p.disc(mx + Math.round(r * 0.45), my - Math.round(r * 0.2), r, base);
  }
  return { pix: p, k: 0.02, ky: 0, y: 0, below: look.horizon, sparks };
}

/** A band of mist, densest along its middle, broken into puffs along its length. */
function mistBand(width: number, height: number, c: Abgr, peak: number, seed: number): Pix {
  const p = new Pix(width, height);
  for (let x = 0; x < width; x++) {
    const puff = noise(x, width, width / 64, seed) * 0.65 + noise(x, width, width / 16, seed + 7) * 0.35;
    for (let y = 0; y < height; y++) {
      const v = 1 - Math.abs((y + 0.5) / height - 0.5) * 2;
      const level = Math.round(peak * v * (0.35 + puff * 0.9));
      if (bayerOn(x, y, level)) p.data[y * width + x] = c;
    }
  }
  return p;
}

/** A strip's foot fading into a colour, so the next strip in front stands out against it. */
function hazeFoot(p: Pix, from: number, c: Abgr, peak: number): void {
  p.fade(from, p.h - from, c, 0, peak, 'solid');
}

/* ------------------------------------------------------------- outdoors */

/**
 * The strip right behind the play, at three quarters of the camera's speed:
 * a dark mass from about row 160 down to the floor, its top a line of
 * whatever stands there, lit along its upper edge, flecked with deeper shade.
 * However much light the hero carries, what is right behind him stays far
 * darker than he is.
 */
function nearBand(width: number, body: Abgr, rim: Abgr, shade: Abgr, seed: number, amp = 12, base = 20): Pix {
  const p = new Pix(width, 52);
  brush(p, base, amp, Math.round(width / 40), body, rim, seed);
  for (let x = 0; x < width; x++) {
    let top = 0;
    while (top < p.h && p.data[top * width + x] === 0) top++;
    for (let y = top + 2; y < p.h; y++) {
      const n = noise(x * 7 + y * 131, width * 7, width, seed + y);
      if (n < 0.07) p.set(x, y, shade);
      else if (y < top + 6 && n > 0.93) p.set(x, y, rim);
    }
  }
  return p;
}

/**
 * Nebelwald: a moonlit night over firs. Pale mountains far off, the far ranks
 * of the forest sinking into mist that drifts between them, and the near firs
 * dark right behind the play - the hero, blue and gold, stands out against them.
 */
function* forest(look: Look, ink: Ink): Painting {
  const rng = new Rng(0xf0e57);
  const far = ink(look.far);
  const near = ink(look.near);
  const mist = ink(look.accent);
  const pale = ink('#657392');
  const deep = ink(DEEP);
  const strips: Strip[] = [
    nightSky(look, ink, rng, {
      zenith: [[8, 10], [10, 6], [12, 3]],
      glow: [[74, 26, 1, 3], [100, 172, 3, 3]],
      stars: 110,
      starRows: 80,
      moon: { x: 318, y: 46, r: 10, disc: '#657392', sea: '#424c6e', lit: '#92a1b9' },
    }),
  ];

  // Mountains, far off and pale under the moon.
  const range = new Pix(512, 70);
  ridge(range, heights(512, 50, 44, [[3, 1], [8, 0.6], [24, 0.22]], 11, true), mist, pale, far);
  hazeFoot(range, 44, far, 6);
  strips.push({ pix: range, k: 0.05, y: 72, below: look.far });
  yield;

  // The far ranks of the forest, a ragged line of small firs sinking into mist.
  const ranks = new Pix(576, 56);
  for (let x = 0; x < ranks.w; x += rng.int(3, 6)) fir(ranks, x, 40, rng.int(8, 22), far, undefined, rng);
  ranks.rect(0, 40, ranks.w, 16, far);
  hazeFoot(ranks, 22, mist, 6);
  strips.push({ pix: ranks, k: 0.15, y: 116, below: look.far });
  yield;

  strips.push({ pix: mistBand(640, 22, mist, 7, 3), k: 0.2, y: 124, drift: look.calm ? 0 : 1.5 });
  yield;

  // Nearer firs in clumps, moonlit on the left.
  const mid = new Pix(704, 100);
  for (let x = rng.int(0, 9); x < mid.w; ) {
    const clump = rng.int(2, 5);
    for (let i = 0; i < clump; i++, x += rng.int(8, 15)) fir(mid, x, 92, rng.int(24, 64), near, far, rng);
    x += rng.int(16, 60);
  }
  mid.rect(0, 92, mid.w, 8, near);
  strips.push({ pix: mid, k: 0.3, y: 100, below: look.near });
  yield;

  // A few giants, right behind the play, standing up into the sky.
  const giants = new Pix(832, 196);
  for (let x = rng.int(20, 60); x < giants.w - 60; x += rng.int(170, 250)) {
    fir(giants, x, 188, rng.int(136, 182), near, far, rng);
  }
  strips.push({ pix: giants, k: 0.5, y: 18, below: look.near });
  yield;

  // The undergrowth at the hero's back: brush, a fallen trunk, stones.
  const under = nearBand(960, near, far, deep, 41, 12, 20);
  for (let i = 0; i < 4; i++) {
    const x = rng.int(0, under.w);
    const len = rng.int(26, 44);
    under.rect(x, 12, len, 6, deep);
    under.rect(x + 1, 12, len - 2, 1, near);
    under.rect(x - 1, 11, 3, 7, deep);
    under.set(x - 1, 11, near);
  }
  for (let x = rng.int(0, 60); x < under.w; x += rng.int(70, 150)) fir(under, x, 22, rng.int(18, 30), deep, near, rng);
  strips.push({ pix: under, k: 0.75, y: 156, below: DEEP });
  yield;

  return { strips, front: frontBrush(0x5ee1, '#0e071b', '#1a1932', 'fern') };
}

/**
 * Der Keilerbau: the same forest, trampled - the firs snapped and stripped,
 * the mist gone brown with the earth the boar churns up, and the ground at
 * the hero's back torn into ridges and clods.
 */
function* den(look: Look, ink: Ink): Painting {
  const rng = new Rng(0xdeb);
  const far = ink(look.far);
  const near = ink(look.near);
  const dust = ink(look.accent);
  const slate = ink(look.horizon);
  const deep = ink(DEEP);
  const strips: Strip[] = [
    nightSky(look, ink, rng, {
      zenith: [[10, 12], [12, 7], [14, 3]],
      glow: [[78, 30, 1, 3], [108, 164, 3, 3]],
      stars: 50,
      starRows: 70,
    }),
  ];
  // Low hills, brown with the churned-up earth.
  const hills = new Pix(512, 60);
  ridge(hills, heights(512, 40, 26, [[4, 1], [12, 0.4]], 21), far, dust);
  hazeFoot(hills, 30, slate, 5);
  strips.push({ pix: hills, k: 0.05, y: 94, below: look.far });
  yield;

  // Far trees, half of them snapped: a ragged line of stumps and bare crowns.
  const ranks = new Pix(576, 60);
  for (let x = 0; x < ranks.w; x += rng.int(5, 11)) {
    const h = rng.int(10, 30);
    if (rng.next() < 0.4) ranks.rect(x, 44 - Math.round(h * 0.5), 2, Math.round(h * 0.5), far);
    else fir(ranks, x, 44, h, far, undefined, rng);
  }
  ranks.rect(0, 44, ranks.w, 16, far);
  hazeFoot(ranks, 30, dust, 5);
  strips.push({ pix: ranks, k: 0.15, y: 108, below: look.far });
  yield;

  strips.push({ pix: mistBand(640, 20, dust, 6, 13), k: 0.22, y: 128, drift: look.calm ? 0 : 2 });
  yield;

  // Bare, broken trees: the bark torn off where he whets his tusks.
  const mid = new Pix(704, 110);
  for (let x = rng.int(0, 30); x < mid.w; x += rng.int(40, 90)) {
    if (rng.next() < 0.55) deadTree(mid, x, 104, rng.int(50, 96), near, rng, far);
    else {
      const h = rng.int(30, 70);
      mid.rect(x, 104 - h, 4, h, near);
      mid.rect(x, 104 - h, 1, h, far);
      for (let i = 0; i < 4; i++) mid.set(x + rng.int(0, 3), 104 - h + i, 0);
    }
  }
  mid.rect(0, 104, mid.w, 6, near);
  strips.push({ pix: mid, k: 0.3, y: 92, below: look.near });
  yield;

  // Two great trunks, one standing, one fallen across the clearing.
  const trunks = new Pix(832, 180);
  for (let x = rng.int(40, 90); x < trunks.w - 80; x += rng.int(260, 380)) {
    trunks.rect(x, 0, 12, 176, near);
    trunks.rect(x, 0, 2, 176, far);
    for (let y = 10; y < 170; y += rng.int(14, 26)) trunks.rect(x + rng.int(3, 8), y, 1, rng.int(4, 9), deep);
    for (let i = 0; i < 4; i++) trunks.line(x + 6, 160, x + 6 + rng.int(-22, 22), 176, near);
  }
  const fx = rng.int(160, 300);
  for (let i = 0; i < 8; i++) trunks.line(fx, 150 + i, fx + 150, 128 + i, near);
  trunks.line(fx, 150, fx + 150, 128, far);
  strips.push({ pix: trunks, k: 0.5, y: 30, below: look.near });
  yield;

  // Churned earth: ridges and clods right at the hero's back.
  const earth = nearBand(960, near, far, deep, 47, 14, 22);
  for (let i = 0; i < 16; i++) earth.disc(rng.int(0, earth.w), rng.int(8, 16), rng.int(1, 3), deep);
  strips.push({ pix: earth, k: 0.75, y: 156, below: DEEP });
  yield;

  return { strips, front: frontBrush(0xc10d, '#0e071b', '#391f21', 'clod') };
}

/** Versunkene Ruinen: a broken city under a violet night, an aqueduct, colonnades. */
function* ruins(look: Look, ink: Ink): Painting {
  const rng = new Rng(0x2a1);
  const pale = ink(look.far);
  const slate = ink(look.horizon);
  const near = ink(look.near);
  const plum = ink('#3b1443');
  const deep = ink(DEEP);
  const strips: Strip[] = [
    nightSky(look, ink, rng, {
      zenith: [[10, 12], [12, 8], [12, 4]],
      glow: [[76, 26, 1, 3], [102, 170, 3, 3]],
      stars: 90,
      starRows: 76,
      moon: { x: 236, y: 38, r: 9, disc: '#657392', sea: '#424c6e', lit: '#92a1b9', crescent: true },
    }),
  ];
  // The city far off, pale under the moon.
  strips.push({ pix: cityline(rng, pale, ink('#657392'), slate), k: 0.05, y: 80, below: look.horizon });
  yield;

  // The aqueduct, violet against the sky, broken where its arches fell.
  const aq = new Pix(576, 72);
  for (let x = 0; x < aq.w; x += 28) {
    if (rng.next() < 0.18) {
      aq.rect(x + 2, 40 + rng.int(0, 14), 6, 40, plum);
      continue;
    }
    arch(aq, x + 14, 26, 9, 4, 72, plum, slate);
    aq.rect(x, 12, 28, 5, plum);
    aq.rect(x, 12, 28, 1, slate);
  }
  strips.push({ pix: aq, k: 0.15, y: 100, below: '#3b1443' });
  yield;

  // A colonnade, half its columns fallen, a lintel left on a few.
  const colon = new Pix(704, 100);
  const cc = { body: near, lit: plum, shade: deep };
  for (let x = rng.int(0, 10); x < colon.w - 10; x += rng.int(26, 40)) {
    const broken = rng.next() < 0.45;
    const h = broken ? rng.int(24, 56) : rng.int(62, 74);
    column(colon, x, 96, h, rng.int(6, 8), cc, broken ? 4 : 0, rng);
    if (!broken && rng.next() < 0.5) {
      const len = rng.int(30, 44);
      colon.rect(x - 3, 96 - h - 5, len, 5, near);
      colon.rect(x - 3, 96 - h - 5, len, 1, plum);
    }
  }
  colon.rect(0, 96, colon.w, 4, near);
  strips.push({ pix: colon, k: 0.3, y: 100, below: look.near });
  yield;

  // Great arches standing alone, vines hanging from them.
  const arches = new Pix(832, 160);
  for (let x = rng.int(30, 80); x < arches.w - 90; x += rng.int(230, 330)) {
    const r = rng.int(18, 26);
    arch(arches, x, 64, r, 8, 160, near, slate);
    arches.rect(x - r - 8, 56, r * 2 + 17, 8, near);
    arches.rect(x - r - 8, 56, r * 2 + 17, 1, slate);
    for (let i = 0; i < r * 2 + 17; i++) arches.rect(x - r - 8 + i, 52 + rng.int(0, 4), 1, 4, i % 9 < 5 ? near : 0);
    for (let i = 0; i < 6; i++) {
      const vx = x - r - 6 + rng.int(0, r * 2 + 12);
      arches.rect(vx, 64, 1, rng.int(10, 40), deep);
    }
  }
  strips.push({ pix: arches, k: 0.5, y: 46, below: look.near });
  yield;

  // Fallen drums and a broken head at the hero's back.
  const rubble = nearBand(960, near, slate, deep, 77, 10, 22);
  for (let x = rng.int(0, 40); x < rubble.w; x += rng.int(90, 200)) {
    const len = rng.int(16, 30);
    rubble.rect(x, 8, len, 12, deep);
    rubble.rect(x, 8, len, 1, near);
    for (let fx = x + 3; fx < x + len; fx += 4) rubble.rect(fx, 9, 1, 11, near);
  }
  const hx = rng.int(300, 600);
  rubble.disc(hx, 12, 11, deep);
  rubble.ring(hx, 12, 11, 11, near, true);
  rubble.rect(hx - 6, 8, 3, 1, near);
  rubble.rect(hx + 2, 8, 3, 1, near);
  strips.push({ pix: rubble, k: 0.75, y: 156, below: DEEP });
  yield;

  return { strips, front: frontBrush(0x4b1, '#0e071b', '#1a1932', 'rubble') };
}

/** A far city's broken skyline: blocks, domes and towers, lit along their left edges. */
function cityline(rng: Rng, body: Abgr, lit: Abgr, haze: Abgr): Pix {
  const p = new Pix(512, 64);
  for (let x = 0; x < p.w; ) {
    const w = rng.int(10, 26);
    const h = rng.int(10, 34);
    const kind = rng.next();
    p.rect(x, 64 - h, w, h, body);
    p.rect(x, 64 - h, 1, h, lit);
    if (kind < 0.25) {
      const r = Math.floor(w / 2);
      p.disc(x + r, 64 - h, r, body);
      p.ring(x + r, 64 - h, r, r, lit, true);
    } else if (kind < 0.45) {
      const tw = rng.int(4, 6);
      const th = rng.int(8, 18);
      const tx = x + rng.int(1, w - tw);
      p.rect(tx, 64 - h - th, tw, th, body);
      p.rect(tx, 64 - h - th, 1, th, lit);
    } else if (kind < 0.7) {
      for (let i = 0; i < w; i++) p.rect(x + i, 64 - h, 1, rng.int(0, 4), 0);
    }
    for (let wy = 64 - h + 4; wy < 60; wy += 6) for (let wx = x + 3; wx < x + w - 2; wx += 4) if (rng.next() < 0.3) p.set(wx, wy, haze);
    x += w + rng.int(-4, 6);
  }
  hazeFoot(p, 34, haze, 8);
  return p;
}

/** Die Schatzkammer: the ruins' arcades, and gold heaped up under them. */
function* vault(look: Look, ink: Ink): Painting {
  const rng = new Rng(0x601d);
  const far = ink(look.far);
  const near = ink(look.near);
  const gold = ink(look.accent);
  const slate = ink(look.horizon);
  const deep = ink(DEEP);
  const strips: Strip[] = [
    nightSky(look, ink, rng, {
      zenith: [[12, 12], [12, 7], [12, 3]],
      glow: [[86, 30, 1, 3], [116, 156, 3, 3]],
      stars: 60,
      starRows: 70,
    }),
  ];
  strips.push({ pix: cityline(rng, ink('#424c6e'), ink('#657392'), slate), k: 0.05, y: 84, below: look.horizon });
  yield;

  // The treasury's arcade, deep and dark inside, lamps hung in its arches.
  const arcade = new Pix(640, 110);
  const lamps: Spark[] = [];
  for (let x = 0; x < arcade.w; x += 64) {
    arcade.rect(x, 10, 64, 100, far);
    arcade.rect(x, 10, 64, 1, gold);
    arcade.disc(x + 32, 36, 19, near);
    arcade.rect(x + 13, 36, 39, 74, near);
    arcade.ring(x + 32, 36, 20, 20, gold, true);
    arcade.rect(x + 31, 18, 1, 20, deep);
    arcade.rect(x + 30, 38, 3, 2, gold);
    if (!look.calm) lamps.push({ x: x + 31, y: 40, hex: '#edab50', period: rng.range(1.5, 3), on: rng.range(0.8, 1.3), phase: rng.range(0, 3) });
  }
  strips.push({ pix: arcade, k: 0.15, y: 92, below: look.far, sparks: lamps });
  yield;

  // Heaps of gold: dark mounds with coins glinting on them.
  const heaps = new Pix(704, 56);
  ridge(heaps, heights(704, 52, 30, [[6, 1], [22, 0.5]], 61), near, gold, deep);
  const glints: Spark[] = [];
  for (let i = 0; i < 70; i++) {
    const x = rng.int(0, heaps.w - 1);
    let y = 0;
    while (y < heaps.h && heaps.get(x, y) === 0) y++;
    y += rng.int(1, 8);
    if (y >= heaps.h) continue;
    heaps.set(x, y, gold);
    if (!look.calm && rng.next() < 0.4) glints.push({ x, y, hex: '#edab50', period: rng.range(2, 5), on: 0.14, phase: rng.range(0, 5) });
  }
  strips.push({ pix: heaps, k: 0.3, y: 104, below: look.near, sparks: glints });
  yield;

  // Urns, a chest and a statue standing in the hoard.
  const things = new Pix(832, 120);
  for (let x = rng.int(20, 60); x < things.w - 30; x += rng.int(80, 160)) {
    const kind = rng.next();
    if (kind < 0.4) {
      things.disc(x, 104, 9, near);
      things.rect(x - 4, 90, 8, 6, near);
      things.rect(x - 6, 88, 12, 2, near);
      things.ring(x, 104, 9, 9, far, true);
    } else if (kind < 0.7) {
      things.rect(x - 14, 98, 28, 18, near);
      things.rect(x - 14, 92, 28, 6, near);
      things.rect(x - 14, 92, 28, 1, far);
      things.rect(x - 2, 100, 4, 4, gold);
    } else {
      things.rect(x - 8, 30, 16, 86, near);
      things.disc(x, 22, 7, near);
      things.rect(x - 14, 40, 28, 6, near);
      things.rect(x - 8, 30, 1, 86, far);
      things.ring(x, 22, 7, 7, far, true);
    }
  }
  things.rect(0, 116, things.w, 4, near);
  strips.push({ pix: things, k: 0.5, y: 74, below: look.near });
  yield;

  const coins = nearBand(960, near, far, deep, 83, 12, 22);
  for (let i = 0; i < 30; i++) {
    const x = rng.int(0, coins.w - 1);
    let y = 0;
    while (y < coins.h && coins.get(x, y) === 0) y++;
    if (y < coins.h - 1) coins.set(x, y + 1, gold);
  }
  strips.push({ pix: coins, k: 0.75, y: 156, below: DEEP });
  yield;
  return { strips, front: frontBrush(0x90d, '#0e071b', '#391f21', 'rubble') };
}

/**
 * Das Theater: the ruins' open-air stage under a sky gone violet with smoke -
 * the tiers of the cavea far off, the stage wall, the proscenium framing the
 * stage with its red curtains drawn back, ropes from the flies, the back
 * curtain dark behind the play, and footlights along the front.
 */
function* theater(look: Look, ink: Ink): Painting {
  const rng = new Rng(0x7ea7);
  const far = ink(look.far);
  const near = ink(look.near);
  const smoke = ink(look.accent);
  const deep = ink(DEEP);
  const slate = ink(look.horizon);
  const slateLit = ink('#424c6e');
  const red = ink('#571c27');
  const redLit = ink('#891e2b');
  const strips: Strip[] = [
    nightSky(look, ink, rng, {
      zenith: [[10, 12], [12, 8], [14, 4]],
      glow: [[84, 30, 1, 3], [114, 158, 3, 3]],
      stars: 40,
      starRows: 60,
    }),
  ];
  strips.push({ pix: mistBand(640, 20, smoke, 6, 31), k: 0.04, y: 50, drift: look.calm ? 0 : 1 });
  yield;

  // The cavea: tiers of seats stepping up to an arcade along its rim.
  const cavea = new Pix(512, 70);
  for (let i = 0; i < 9; i++) cavea.rect(0, 30 + i * 4, cavea.w, 4, i % 2 ? slateLit : slate);
  for (let x = 0; x < cavea.w; x += 16) {
    cavea.rect(x, 12, 16, 18, slateLit);
    cavea.rect(x + 5, 16, 6, 14, slate);
    cavea.disc(x + 8, 16, 3, slate);
  }
  hazeFoot(cavea, 46, slate, 8);
  strips.push({ pix: cavea, k: 0.07, y: 84, below: look.horizon });
  yield;

  // The stage wall: two storeys of niches between columns.
  const frons = new Pix(576, 90);
  frons.rect(0, 14, frons.w, 76, far);
  for (let x = 0; x < frons.w; x += 36) {
    for (const top of [22, 54]) {
      frons.disc(x + 18, top + 6, 6, near);
      frons.rect(x + 12, top + 6, 13, 22, near);
      frons.rect(x + 16, top + 10, 4, 18, slate);
      frons.disc(x + 18, top + 9, 2, slate);
    }
    frons.rect(x + 3, 18, 3, 72, slate);
    frons.rect(x + 3, 18, 1, 72, slateLit);
  }
  frons.rect(0, 14, frons.w, 3, slate);
  frons.rect(0, 14, frons.w, 1, slateLit);
  frons.rect(0, 50, frons.w, 2, slate);
  strips.push({ pix: frons, k: 0.15, y: 92, below: look.far });
  yield;

  // The proscenium, framing the stage where Maskarill plays: two great piers,
  // the arch between, the valance and the curtains gathered to either side.
  const pros = new Pix(704, 220);
  const left = 83;
  const span = 420;
  for (const px of [left, left + span]) {
    pros.rect(px - 14, 0, 28, 220, near);
    pros.rect(px - 14, 0, 2, 220, slate);
    for (let y = 12; y < 220; y += 18) pros.rect(px - 12, y, 24, 1, deep);
  }
  pros.rect(left, 0, span, 26, near);
  pros.rect(left, 24, span, 2, slate);
  for (let x = left + 14; x < left + span - 14; x++) {
    const sw = Math.round(Math.abs(Math.sin(((x - left - 14) / 52) * Math.PI)) * 8);
    pros.rect(x, 26, 1, 10 + sw, (x >> 1) % 4 === 0 ? redLit : (x >> 1) % 4 === 2 ? near : red);
  }
  for (const [cx, dir] of [
    [left + 14, 1],
    [left + span - 14, -1],
  ] as const) {
    for (let r = 0; r < 190; r++) {
      const y = 26 + r;
      const gather = r < 120 ? 26 - Math.round(r * 0.13) : 10 + Math.round((r - 120) * 0.2);
      for (let i = 0; i < gather; i++) {
        const fold = (i + (r >> 4)) % 5;
        pros.set(cx + dir * i, y, fold === 0 ? redLit : fold === 3 ? near : red);
      }
    }
  }
  strips.push({ pix: pros, k: 0.3, y: -14, below: look.near, above: look.near });
  yield;

  // Ropes and sandbags from the flies, a chandelier hanging dark.
  const flies = new Pix(832, 150);
  for (let x = rng.int(20, 50); x < flies.w; x += rng.int(50, 110)) {
    const len = rng.int(40, 110);
    flies.rect(x, 0, 1, len, deep);
    if (rng.next() < 0.6) {
      flies.rect(x - 3, len, 7, 8, near);
      flies.rect(x - 3, len, 1, 8, slate);
    }
  }
  const ch = rng.int(300, 500);
  flies.rect(ch, 0, 1, 50, deep);
  flies.rect(ch - 18, 50, 37, 3, near);
  for (let i = -16; i <= 16; i += 8) {
    flies.rect(ch + i, 46, 1, 4, near);
    flies.set(ch + i, 45, ink('#8a4836'));
  }
  strips.push({ pix: flies, k: 0.5, y: 0 });
  yield;

  // The back curtain, dark, hung in deep folds behind the play.
  const back = new Pix(960, 52);
  for (let x = 0; x < back.w; x++) {
    const fold = x % 12;
    const hem = Math.round(Math.abs(Math.sin((x / 24) * Math.PI)) * 3);
    back.rect(x, 6 + hem, 1, 46 - hem, fold === 0 ? ink('#3b1443') : deep);
  }
  strips.push({ pix: back, k: 0.75, y: 156, below: DEEP });
  yield;

  return { strips, front: footlights() };
}

/** Das Tempelherz: Ankhor's court - a stepped temple with the sun on its crown, colossi and braziers. */
function* temple(look: Look, ink: Ink): Painting {
  const rng = new Rng(0x7e3);
  const pale = ink(look.far);
  const near = ink(look.near);
  const sun = ink(look.accent);
  const slate = ink(look.horizon);
  const deep = ink(DEEP);
  const strips: Strip[] = [
    nightSky(look, ink, rng, {
      zenith: [[10, 12], [12, 7], [12, 3]],
      glow: [[80, 30, 1, 3], [110, 162, 3, 3]],
      stars: 60,
      starRows: 70,
    }),
  ];
  // The temple: a stepped mount, crowned with the sun disc Ankhor wears at his heart.
  const mount = new Pix(640, 110);
  const cx = 249;
  ridge(mount, heights(640, 104, 10, [[10, 1]], 91), slate, pale);
  for (let i = 0; i < 7; i++) {
    const w = 260 - i * 34;
    mount.rect(cx - w / 2, 96 - i * 12, w, 14, pale);
    mount.rect(cx - w / 2, 96 - i * 12, w, 1, ink('#657392'));
    mount.rect(cx - w / 2, 96 - i * 12, 1, 12, ink('#657392'));
    mount.rect(cx + w / 2 - 1, 96 - i * 12 + 1, 1, 12, slate);
  }
  mount.rect(cx - 6, 30, 12, 34, slate);
  mount.ring(cx, 16, 11, 13, sun);
  mount.disc(cx, 16, 8, ink('#8a4836'));
  for (let a = 0; a < 12; a++) {
    const ang = (a / 12) * Math.PI * 2;
    mount.set(cx + Math.round(Math.cos(ang) * 16), 16 + Math.round(Math.sin(ang) * 16), sun);
  }
  strips.push({ pix: mount, k: 0.05, y: 52, below: look.horizon });
  yield;

  // Obelisks along the processional way.
  const obel = new Pix(576, 90);
  for (let x = 20; x < obel.w; x += rng.int(60, 100)) {
    const h = rng.int(44, 74);
    for (let r = 0; r < h; r++) {
      const w = Math.round(7 - (r / h) * 3);
      obel.rect(x - w, 86 - r, w * 2, 1, slate);
      obel.set(x - w, 86 - r, pale);
    }
    obel.rect(x - 2, 86 - h - 4, 4, 4, slate);
    obel.rect(x - 9, 86, 18, 4, slate);
  }
  obel.rect(0, 86, obel.w, 4, slate);
  strips.push({ pix: obel, k: 0.15, y: 92, below: look.horizon });
  yield;

  // A colonnade carrying a frieze of suns.
  const colon = new Pix(704, 100);
  const cc = { body: near, lit: slate, shade: deep };
  for (let x = 6; x < colon.w; x += 32) column(colon, x, 96, 66, 8, cc);
  colon.rect(0, 22, colon.w, 10, near);
  colon.rect(0, 22, colon.w, 1, slate);
  for (let x = 22; x < colon.w; x += 32) colon.ring(x, 27, 2, 3, sun);
  colon.rect(0, 96, colon.w, 4, near);
  strips.push({ pix: colon, k: 0.3, y: 100, below: look.near });
  yield;

  // Seated colossi, braziers between them.
  const colossi = new Pix(832, 150);
  for (let x = rng.int(40, 90); x < colossi.w - 80; x += rng.int(240, 320)) {
    colossi.rect(x - 22, 96, 44, 54, near);
    colossi.rect(x - 16, 46, 32, 52, near);
    colossi.disc(x, 34, 11, near);
    colossi.rect(x - 14, 24, 28, 8, near);
    colossi.rect(x - 22, 70, 10, 30, near);
    colossi.rect(x + 12, 70, 10, 30, near);
    colossi.rect(x - 22, 96, 1, 54, slate);
    colossi.rect(x - 16, 46, 1, 50, slate);
    colossi.ring(x, 34, 11, 11, slate, true);
    colossi.rect(x - 4, 32, 2, 1, sun);
    colossi.rect(x + 3, 32, 2, 1, sun);
    const bx = x + rng.int(70, 110);
    colossi.rect(bx - 1, 120, 2, 30, near);
    colossi.rect(bx - 8, 114, 16, 6, near);
    colossi.rect(bx - 8, 114, 16, 1, sun);
  }
  strips.push({ pix: colossi, k: 0.5, y: 56, below: look.near });
  yield;

  const steps = new Pix(960, 52);
  for (let i = 0; i < 5; i++) {
    steps.rect(0, 12 + i * 8, steps.w, 8, deep);
    steps.rect(0, 12 + i * 8, steps.w, 1, near);
  }
  for (let x = rng.int(0, 50); x < steps.w; x += rng.int(120, 260)) {
    steps.rect(x, 0, 18, 14, deep);
    steps.rect(x, 0, 18, 1, near);
    steps.rect(x, 0, 1, 14, near);
  }
  strips.push({ pix: steps, k: 0.75, y: 156, below: DEEP });
  yield;
  return { strips, front: frontBrush(0x7e4, '#0e071b', '#1a1932', 'rubble') };
}

/* ------------------------------------------------------------- caverns */

interface CavePlan {
  seed: number;
  /** Crystal colours, or none. */
  crystals?: { lit: string; body: string; dark: string; edge: string; glint: string };
  /** Glowing veins in the far wall, as [colour, core]. */
  veins?: readonly [string, string];
  /** Falls of light down the far wall (lava). */
  falls?: readonly [string, string];
  webs?: string;
}

/**
 * A cave's far wall: rock in strata, each seam with a lip that catches the
 * light from above and a shadow under it, cracks running down, the roof's
 * shadow thinning out downwards in bands. It stands in for the sky indoors.
 */
function caveWall(look: Look, ink: Ink, rng: Rng, plan: CavePlan): Strip {
  const p = new Pix(640, 300);
  const base = ink(look.horizon);
  const top = ink(look.top);
  const lip = ink(look.far);
  const seam = ink(look.top);
  p.rect(0, 0, p.w, p.h, base);
  // Strata: courses of rock of uneven height, the seams between them broken
  // here and there, each course split by joints into blocks. A block's top
  // edge catches the light from above, its underside and its right-hand
  // joint fall into shade.
  const seams: Int16Array[] = [];
  for (let y0 = 34; y0 < p.h + 20; y0 += rng.int(10, 22)) {
    const line = new Int16Array(p.w);
    const s = seams.length;
    for (let x = 0; x < p.w; x++) line[x] = y0 + Math.round((noise(x, p.w, 8, plan.seed + s) - 0.5) * 14 + (noise(x, p.w, 40, plan.seed + s + 50) - 0.5) * 4);
    seams.push(line);
  }
  for (let s = 0; s < seams.length; s++) {
    const line = seams[s];
    const below = seams[s + 1];
    for (let x = 0; x < p.w; x++) {
      if (noise(x, p.w, 32, plan.seed + s * 7) < 0.22) continue;
      p.set(x, line[x], seam);
      p.set(x, line[x] + 1, lip);
    }
    if (!below) continue;
    // Joints down to the next seam, a block's width apart.
    for (let x0 = rng.int(0, 30); x0 < p.w; x0 += rng.int(18, 90)) {
      let x = x0;
      for (let y = line[x0] + 2; y < below[x0]; y++) {
        if (rng.next() < 0.3) x += rng.int(-1, 1);
        p.set(x, y, seam);
        p.set(x - 1, y, lip);
      }
    }
  }
  // Cracks running down, and ledges of lighter rock.
  for (let i = 0; i < 14; i++) {
    let x = rng.int(0, p.w);
    for (let y = rng.int(50, 150); y < 280; y++) {
      if (rng.next() < 0.3) x += rng.int(-1, 1);
      p.set(x, y, seam);
      if (rng.next() < 0.5) p.set(x - 1, y, lip);
    }
  }
  // The roof's shadow, thinning downwards in bands.
  p.dither(0, 0, p.w, 22, top, 16);
  p.dither(0, 22, p.w, 14, top, 11);
  p.dither(0, 36, p.w, 14, top, 6);
  p.dither(0, 50, p.w, 14, top, 2);
  const sparks: Spark[] = [];
  if (plan.veins) {
    const [vein, core] = plan.veins;
    for (let i = 0; i < 12; i++) {
      let x = rng.int(0, p.w);
      let y = rng.int(80, 230);
      for (let k = 0; k < 40; k++) {
        p.set(x, y, ink(k % 5 === 2 ? core : vein));
        x += rng.int(-1, 2);
        y += rng.int(-1, 1);
      }
    }
  }
  if (plan.falls) {
    const [fall, core] = plan.falls;
    for (let i = 0; i < 2; i++) {
      const x = 120 + i * 300 + rng.int(-30, 30);
      p.rect(x - 2, 56, 5, 210, ink(fall));
      p.rect(x, 56, 1, 210, ink(core));
      for (let y = 62; y < 260; y += rng.int(8, 16)) {
        sparks.push({ x: x + rng.int(-1, 1), y, hex: '#edab50', period: rng.range(0.6, 1.2), on: 0.2, phase: rng.range(0, 1) });
      }
    }
  }
  if (plan.crystals) {
    const cr = plan.crystals;
    for (let i = 0; i < 30; i++) {
      const x = rng.int(0, p.w);
      const y = rng.int(70, 240);
      p.set(x, y, ink(cr.body));
      p.set(x + 1, y, ink(cr.body));
      p.set(x, y - 1, ink(cr.lit));
      if (rng.next() < 0.5) sparks.push({ x, y: y - 1, hex: cr.glint, period: rng.range(2, 5), on: 0.2, phase: rng.range(0, 5) });
    }
  }
  return { pix: p, k: 0.05, y: -12, below: look.horizon, above: look.top, sparks: look.calm ? [] : sparks };
}

/** A strip of roof: solid rock along the top with stalactites hanging from it. */
function caveRoof(width: number, h: number, body: Abgr, lit: Abgr, rng: Rng, longest: number, density: number): Pix {
  const p = new Pix(width, h);
  const edge = heights(width, 14, 10, [[width / 40, 1], [width / 10, 0.4]], rng.int(0, 999));
  for (let x = 0; x < width; x++) p.rect(x, 0, 1, edge[x], body);
  for (let x = rng.int(0, 10); x < width; x += rng.int(4, density)) {
    spike(p, x, edge[x] - 1, rng.int(6, longest), rng.int(3, 7), body, lit);
  }
  return p;
}

/** Stalagmites rising from a strip's foot over a line of rubble. */
function caveFloor(width: number, h: number, body: Abgr, lit: Abgr, rng: Rng, tallest: number, gap: number): Pix {
  const p = new Pix(width, h);
  brush(p, h - 4, 6, Math.max(2, Math.round(width / 40)), body, lit, rng.int(0, 999));
  for (let x = rng.int(0, 20); x < width; x += rng.int(8, gap)) {
    spike(p, x, h - 4, -rng.int(8, tallest), rng.int(5, 11), body, lit);
  }
  return p;
}

/**
 * The caves: the far wall instead of a sky, pillars where roof and floor have
 * grown together, the roof hung with stalactites, stalagmites below, crystals
 * glinting - and the darkest rock right behind the play.
 */
function* cavern(look: Look, ink: Ink, plan: CavePlan): Painting {
  const rng = new Rng(plan.seed);
  const far = ink(look.far);
  const near = ink(look.near);
  const deep = ink(DEEP);
  const strips: Strip[] = [caveWall(look, ink, rng, plan)];

  // Pillars far back, where roof and floor have grown together.
  const pillars = new Pix(576, 300);
  for (let x = rng.int(20, 60); x < pillars.w - 20; x += rng.int(90, 160)) {
    const w = rng.int(10, 18);
    for (let y = 0; y < 300; y++) {
      const s = Math.sin((y / 300) * Math.PI);
      const half = Math.round(w / 2 + (w / 2) * (1 - s) * 1.6);
      pillars.rect(x - half, y, half * 2, 1, near);
      pillars.set(x - half, y, far);
    }
  }
  strips.push({ pix: pillars, k: 0.15, y: -30 });
  yield;

  // The roof and its stalactites; the floor and its stalagmites.
  strips.push({ pix: caveRoof(704, 70, near, far, rng, 46, 18), k: 0.3, y: -8, above: look.near });
  yield;
  const floor = caveFloor(704, 60, near, far, rng, 40, 36);
  if (plan.crystals) {
    const cr = plan.crystals;
    const cc = { lit: ink(cr.lit), body: ink(cr.body), dark: ink(cr.dark), edge: ink(cr.edge) };
    for (let x = rng.int(10, 60); x < floor.w; x += rng.int(70, 150)) {
      for (let i = 0; i < 3; i++) crystal(floor, x + i * 6 - 6, 56, rng.int(10, 26), rng.int(5, 8), cc, rng.int(-4, 4));
    }
  }
  strips.push({ pix: floor, k: 0.3, y: 120, below: look.near });
  yield;

  if (plan.webs) {
    const silk = ink(plan.webs);
    const shade = ink(look.far);
    const webs = new Pix(832, 130);
    for (let x = rng.int(40, 100); x < webs.w - 60; x += rng.int(180, 280)) {
      web(webs, x, rng.int(10, 30), rng.int(30, 46), 9, 5, silk, Math.PI * 0.05, Math.PI * 0.9);
    }
    for (let x = rng.int(0, 60); x < webs.w; x += rng.int(60, 120)) {
      const len = rng.int(20, 60);
      webs.rect(x, 0, 1, len, silk);
      webs.disc(x, len + 5, 3, silk);
      webs.rect(x - 2, len + 2, 5, 9, silk);
      webs.rect(x - 2, len + 5, 5, 1, shade);
      webs.rect(x - 2, len + 8, 5, 1, shade);
    }
    strips.push({ pix: webs, k: 0.4, y: 6 });
    yield;
  }

  // Heavy formations hanging and rising right behind the play.
  const big = new Pix(832, 300);
  for (let x = rng.int(30, 80); x < big.w - 40; x += rng.int(180, 300)) {
    spike(big, x, 0, rng.int(60, 110), rng.int(16, 28), near, far);
    spike(big, x + rng.int(60, 110), 299, -rng.int(40, 90), rng.int(14, 24), deep, near);
  }
  strips.push({ pix: big, k: 0.5, y: -60 });
  yield;

  const under = nearBand(960, near, far, deep, plan.seed + 5, 12, 22);
  for (let x = rng.int(0, 30); x < under.w; x += rng.int(30, 80)) spike(under, x, 24, -rng.int(10, 24), rng.int(6, 11), deep, near);
  if (plan.crystals) {
    const cr = plan.crystals;
    const cc = { lit: ink(cr.lit), body: ink(cr.body), dark: deep, edge: ink(cr.edge) };
    for (let x = rng.int(10, 90); x < under.w; x += rng.int(140, 260)) {
      for (let i = 0; i < 4; i++) crystal(under, x + i * 5, 24, rng.int(8, 18), rng.int(5, 7), cc, rng.int(-5, 5));
    }
  }
  strips.push({ pix: under, k: 0.75, y: 156, below: DEEP });
  yield;
  return { strips, front: frontBrush(plan.seed ^ 0x51, '#0e071b', '#1a1932', 'spike') };
}

function* caves(look: Look, ink: Ink): Painting {
  return yield* cavern(look, ink, {
    seed: 0xca7e,
    crystals: { lit: '#0069aa', body: '#00396d', dark: '#1a1932', edge: '#0098dc', glint: '#00cdf9' },
  });
}

function* grotto(look: Look, ink: Ink): Painting {
  return yield* cavern(look, ink, { seed: 0x6a07 });
}

function* webCave(look: Look, ink: Ink): Painting {
  return yield* cavern(look, ink, { seed: 0x3eb, webs: '#424c6e' });
}

function* forge(look: Look, ink: Ink): Painting {
  return yield* cavern(look, ink, { seed: 0xf09e, veins: ['#8e251d', '#c64524'], falls: ['#8e251d', '#c64524'] });
}

/* --------------------------------------------------------- drowned hall */

/**
 * Die Ertrunkene Halle: a Gothic hall the water took. Tall windows in the far
 * wall, an arcade and great pillars standing in still water that mirrors
 * them - each a little lower on the screen the nearer it stands, as a water
 * plane runs away from the eye - and drops falling from the vault. A calm
 * zone, so only the drops move, and now and then a glint on the water.
 */
function* drowned(look: Look, ink: Ink, altar = false): Painting {
  const rng = new Rng(altar ? 0xa17a : 0xd70);
  const stone = ink(look.horizon);
  const seam = ink(look.top);
  const lit = ink(look.far);
  const near = ink(look.near);
  const glass = ink(look.accent);
  const slate = ink('#2a2f4e');
  const deep = ink(DEEP);
  // Still water gives the hall back almost as bright as it stands, the
  // windows' light the brightest thing in it; every third row a ripple
  // line, a step darker, breaks it into the bands water draws in.
  const tint = (c: Abgr): Abgr => (c === glass ? glass : c === stone || c === lit ? stone : c === slate ? near : c === near ? seam : deep);
  const darker = (c: Abgr): Abgr => (c === glass ? stone : c === stone ? seam : c === near ? deep : c);
  const ripple = (row: number): number => (row % 6 < 2 ? 1 : row % 6 < 4 ? 0 : -1);
  const mirror = (p: Pix, row: number, squash: number): void => {
    reflect(p, row, tint, ripple, squash);
    for (let y = row + 2; y < p.h; y += 3) for (let x = 0; x < p.w; x++) p.data[y * p.w + x] = darker(p.data[y * p.w + x]);
  };
  const waterline = (p: Pix, row: number, every: number): void => {
    for (let x = 0; x < p.w; x++) if ((x * 5) % every < 3) p.set(x, row, glass);
  };
  const strips: Strip[] = [];

  // The far wall: big blocks of masonry, tall windows lit faintly from outside.
  const wall = new Pix(640, 300);
  masonry(wall, 0, 0, wall.w, 300, 24, 12, { body: stone, mortar: seam, lit }, rng);
  wall.dither(0, 0, wall.w, 30, deep, 12);
  wall.dither(0, 30, wall.w, 16, seam, 8);
  for (let x = 40; x < wall.w; x += 120) {
    pointed(wall, x, 82, 9, 162, seam, 2, glass);
    wall.rect(x, 70, 1, 92, seam);
    wall.rect(x - 9, 118, 19, 1, seam);
  }
  if (altar) {
    // The great round window of the altar: the sun's half warm, the moon's cold.
    const cx = 246;
    const cy = 88;
    wall.disc(cx, cy, 44, seam);
    for (let y = -40; y <= 40; y++) {
      for (let x = -40; x <= 40; x++) {
        if (x * x + y * y > 40 * 40) continue;
        const ring = Math.sqrt(x * x + y * y);
        const spoke = Math.abs((Math.atan2(y, x) * 12) / Math.PI) % 2 < 0.25;
        if (spoke || Math.abs(ring - 24) < 1) continue;
        wall.set(cx + x, cy + y, x < 0 ? ink('#5d2c28') : ink('#424c6e'));
      }
    }
    wall.disc(cx, cy, 10, seam);
    wall.disc(cx - 4, cy, 5, ink('#8a4836'));
    wall.disc(cx + 4, cy, 5, ink('#657392'));
    for (let i = 0; i < 60; i++) wall.set(rng.int(0, wall.w), rng.int(2, 40), ink(rng.next() < 0.3 ? '#657392' : '#424c6e'));
  }
  const line = 162;
  mirror(wall, line, 1);
  waterline(wall, line, 7);
  wall.fade(line + 40, 300 - line - 40, seam, 2, 12);
  strips.push({ pix: wall, k: 0.05, y: -12, below: DEEP, above: DEEP });
  yield;

  // An arcade of pointed arches on slender shafts, standing in the water.
  const arcade = new Pix(576, 220);
  for (let x = 0; x < arcade.w; x += 48) {
    pointed(arcade, x + 24, 62, 16, 126, near, 4);
    arcade.rect(x + 3, 62, 1, 64, slate);
  }
  arcade.rect(0, 0, arcade.w, 22, near);
  arcade.rect(0, 21, arcade.w, 1, slate);
  mirror(arcade, 126, 1.4);
  waterline(arcade, 126, 9);
  strips.push({ pix: arcade, k: 0.15, y: 30 });
  yield;

  // Great clustered pillars, hung with chains and weed; drops fall past them.
  const pillars = new Pix(704, 300);
  for (let x = rng.int(30, 70); x < pillars.w - 30; x += rng.int(200, 280)) {
    pillars.rect(x - 9, 0, 18, 196, near);
    pillars.rect(x - 9, 0, 1, 196, slate);
    pillars.rect(x - 5, 0, 1, 196, slate);
    pillars.rect(x + 4, 0, 1, 196, deep);
    for (let i = 0; i < 3; i++) {
      const cx = x + rng.int(30, 60);
      const len = rng.int(40, 110);
      for (let y = 0; y < len; y += 2) pillars.set(cx + (y % 6 === 0 ? 1 : 0), y, deep);
    }
  }
  mirror(pillars, 196, 1.2);
  waterline(pillars, 196, 11);
  const drips: Drip[] = [];
  for (let i = 0; i < 6; i++) {
    drips.push({ x: rng.int(0, pillars.w), top: 20, bottom: 196, period: rng.range(3, 7), phase: rng.range(0, 7), hex: '#00396d' });
  }
  strips.push({ pix: pillars, k: 0.3, y: -30, drips });
  yield;

  if (altar) {
    // The twins' altar: a dais and two statues, one crowned with the sun, one with the moon.
    const dais = new Pix(832, 150);
    const ax = 300;
    dais.rect(ax - 60, 96, 120, 14, near);
    dais.rect(ax - 44, 84, 88, 12, near);
    dais.rect(ax - 60, 96, 120, 1, slate);
    dais.rect(ax - 44, 84, 88, 1, slate);
    for (const [sx, crown] of [
      [ax - 30, '#8a4836'],
      [ax + 30, '#657392'],
    ] as const) {
      dais.rect(sx - 6, 40, 12, 44, near);
      dais.disc(sx, 32, 6, near);
      dais.ring(sx, 22, 5, 6, ink(crown), true);
      dais.rect(sx - 6, 40, 1, 44, slate);
    }
    mirror(dais, 110, 1.2);
    waterline(dais, 110, 9);
    strips.push({ pix: dais, k: 0.5, y: 66 });
    yield;
  } else {
    // Broken pillars and a fallen arch, half under water.
    const broken = new Pix(832, 160);
    for (let x = rng.int(40, 90); x < broken.w - 40; x += rng.int(150, 260)) {
      const h = rng.int(30, 70);
      broken.rect(x - 9, 100 - h, 18, h, near);
      broken.rect(x - 9, 100 - h, 1, h, slate);
      for (let i = 0; i < 18; i++) broken.rect(x - 9 + i, 100 - h, 1, rng.int(0, 5), 0);
    }
    mirror(broken, 100, 1.2);
    waterline(broken, 100, 9);
    strips.push({ pix: broken, k: 0.5, y: 76 });
    yield;
  }

  // The water right behind the play: dark, ripples catching the light.
  const surface = new Pix(960, 30);
  surface.rect(0, 6, surface.w, 24, near);
  for (let x = 0; x < surface.w; x++) if ((x * 7) % 11 < 4) surface.set(x, 6, stone);
  for (let y = 9; y < 30; y += 3) for (let x = (y * 3) % 7; x < surface.w; x += rng.int(6, 16)) surface.rect(x, y, rng.int(2, 6), 1, y % 2 ? seam : deep);
  const shimmer: Spark[] = [];
  for (let i = 0; i < 12; i++) shimmer.push({ x: rng.int(0, surface.w), y: 6, hex: '#0069aa', period: rng.range(4, 8), on: 0.6, phase: rng.range(0, 8) });
  strips.push({ pix: surface, k: 0.75, y: 178, below: DEEP, sparks: shimmer });
  yield;
  return { strips };
}

function* altar(look: Look, ink: Ink): Painting {
  return yield* drowned(look, ink, true);
}

/* -------------------------------------------------------------- castle */

interface CastlePlan {
  seed: number;
  moon?: SkyPlan['moon'];
  /** Window glass, and how many are lit. */
  glass: string;
  litShare: number;
  banners: boolean;
  gargoyles?: boolean;
  bats?: boolean;
  /** The battlements at the hero's back: merlon width, gap, height. */
  merlons: readonly [number, number, number];
}

/**
 * Burg Nachtfall and its towers: the castle on its hill far off, a curtain
 * wall with towers along a ridge, tall towers close by with banners and lit
 * windows, a wall with its battlements, and the merlons right behind the play.
 */
function* fortress(look: Look, ink: Ink, plan: CastlePlan): Painting {
  const rng = new Rng(plan.seed);
  const pale = ink(look.far);
  const near = ink(look.near);
  const glow = ink(look.accent);
  const slate = ink(look.horizon);
  const deep = ink(DEEP);
  const strips: Strip[] = [
    nightSky(look, ink, rng, {
      zenith: [[10, 12], [12, 7], [14, 3]],
      glow: [[80, 30, 1, 3], [110, 162, 3, 3]],
      stars: 80,
      starRows: 74,
      moon: plan.moon,
    }),
  ];
  const sky = strips[0];
  if (plan.bats && plan.moon) {
    const { x: mx, y: my, r } = plan.moon;
    for (let i = 0; i < 7; i++) {
      const bx = mx + rng.int(-r - 20, r + 20);
      const by = my + rng.int(-r, r + 10);
      const w = rng.int(2, 3);
      sky.pix.set(bx, by, near);
      for (let k = 1; k <= w; k++) {
        sky.pix.set(bx - k, by - (k === w ? 1 : 0), near);
        sky.pix.set(bx + k, by - (k === w ? 1 : 0), near);
      }
    }
  }
  const farTower = { body: pale, lit: ink('#657392'), shade: slate, roof: pale, glass: ink(plan.glass), dark: slate };

  // The castle on its hill, far off: a crown of towers, a few lights.
  const hill = new Pix(640, 90);
  ridge(hill, heights(640, 82, 18, [[3, 1], [9, 0.4]], plan.seed + 1), slate, pale);
  const sparks: Spark[] = [];
  for (let i = 0; i < 9; i++) {
    const x = 200 + i * 14 + rng.int(-3, 3);
    const h = rng.int(20, 50);
    const lit = tower(hill, x, 82, rng.int(6, 9), h, farTower, rng, rng.next() < 0.4 ? 'spire' : 'cone', plan.litShare);
    for (const [wx, wy] of lit) if (!look.calm && rng.next() < 0.3) sparks.push({ x: wx, y: wy, hex: '#8a4836', period: rng.range(3, 6), on: 0.3, phase: rng.range(0, 6) });
  }
  hazeFoot(hill, 64, glow, 3);
  strips.push({ pix: hill, k: 0.05, y: 48, below: look.horizon, sparks });
  yield;

  // A curtain wall along the ridge, towers at intervals.
  const curtain = new Pix(576, 80);
  const midTower = { ...farTower, body: slate, roof: slate, lit: pale, shade: near, dark: near };
  curtain.rect(0, 40, curtain.w, 40, slate);
  crenels(curtain, 0, curtain.w, 40, 3, 2, 3, slate, pale);
  for (let x = 30; x < curtain.w; x += rng.int(90, 140)) tower(curtain, x, 80, 12, rng.int(50, 70), midTower, rng, 'crenel', plan.litShare);
  strips.push({ pix: curtain, k: 0.15, y: 86, below: look.horizon });
  yield;

  // Tall towers close by, banners hung from them.
  const towers = new Pix(704, 190);
  const nearTower = { ...farTower, body: near, roof: near, shade: deep, lit: slate, dark: deep };
  for (let x = rng.int(20, 60); x < towers.w - 40; x += rng.int(110, 180)) {
    const w = rng.int(16, 24);
    const h = rng.int(90, 140);
    tower(towers, x, 190, w, h, nearTower, rng, rng.next() < 0.5 ? 'cone' : 'crenel', plan.litShare);
    if (plan.banners && rng.next() < 0.7) banner(towers, x + w + 3, 190 - h + 16, 8, 30, ink('#891e2b'), ink('#3b1443'), ink('#edab50'), deep);
  }
  strips.push({ pix: towers, k: 0.3, y: 2, below: look.near });
  yield;

  // A nearer wall with its battlements, buttressed; gargoyles crouch on it.
  const wall = new Pix(832, 70);
  wall.rect(0, 26, wall.w, 44, near);
  crenels(wall, 0, wall.w, 26, 8, 6, 8, near, slate);
  for (let x = rng.int(10, 40); x < wall.w; x += rng.int(60, 100)) {
    wall.rect(x, 30, 8, 40, deep);
    wall.rect(x, 30, 1, 40, near);
  }
  if (plan.gargoyles) {
    for (let x = rng.int(20, 60); x < wall.w; x += rng.int(140, 220)) gargoyle(wall, x, 18, near, slate, deep);
  }
  strips.push({ pix: wall, k: 0.5, y: 112, below: look.near });
  yield;

  // Merlons right behind the play.
  const [m, g, h] = plan.merlons;
  const merl = new Pix(960, 52);
  merl.rect(0, 20, merl.w, 32, deep);
  crenels(merl, 0, merl.w, 20, m, g, h, deep, near);
  for (let x = 4; x < merl.w; x += m + g) merl.rect(x, 22, 1, 30, near);
  strips.push({ pix: merl, k: 0.75, y: 156, below: DEEP });
  yield;
  return { strips, front: frontBrush(plan.seed ^ 0x77, '#0e071b', '#1a1932', 'rubble') };
}

/** A gargoyle crouched on a ledge, wings folded, looking out to the left. */
function gargoyle(p: Pix, x: number, base: number, body: Abgr, lit: Abgr, dark: Abgr): void {
  p.rect(x - 4, base - 8, 9, 8, body);
  p.rect(x - 7, base - 12, 5, 5, body);
  p.rect(x - 8, base - 10, 2, 2, body);
  p.rect(x + 2, base - 16, 5, 10, body);
  p.rect(x + 5, base - 18, 3, 4, body);
  p.set(x - 6, base - 13, lit);
  p.set(x - 5, base - 13, lit);
  p.rect(x - 7, base - 12, 1, 5, lit);
  p.rect(x + 2, base - 16, 1, 6, lit);
  p.set(x - 6, base - 11, dark);
}

function* castle(look: Look, ink: Ink): Painting {
  return yield* fortress(look, ink, {
    seed: 0xca57,
    moon: { x: 360, y: 44, r: 8, disc: '#657392', sea: '#424c6e', lit: '#92a1b9', haze: '#424c6e' },
    glass: '#e07438',
    litShare: 0.45,
    banners: true,
    merlons: [10, 8, 10],
  });
}

function* battlement(look: Look, ink: Ink): Painting {
  return yield* fortress(look, ink, {
    seed: 0xba77,
    moon: { x: 270, y: 54, r: 20, disc: '#657392', sea: '#424c6e', lit: '#92a1b9', haze: '#424c6e' },
    glass: '#424c6e',
    litShare: 0.15,
    banners: false,
    gargoyles: true,
    merlons: [14, 10, 12],
  });
}

function* keep(look: Look, ink: Ink): Painting {
  return yield* fortress(look, ink, {
    seed: 0xb100d,
    moon: { x: 244, y: 56, r: 24, disc: '#891e2b', sea: '#3b1443', lit: '#c42430', haze: '#891e2b' },
    glass: '#c42430',
    litShare: 0.3,
    banners: true,
    gargoyles: true,
    bats: true,
    merlons: [10, 8, 10],
  });
}

/**
 * Der Uhrturm: the face of the great clock behind the play, and its works -
 * cogs and beams - between it and the hero.
 */
function* clock(look: Look, ink: Ink): Painting {
  const rng = new Rng(0xc10c);
  const far = ink(look.far);
  const near = ink(look.near);
  const brass = ink(look.accent);
  const slate = ink(look.horizon);
  const deep = ink(DEEP);
  const strips: Strip[] = [
    nightSky(look, ink, rng, {
      zenith: [[10, 12], [12, 7], [14, 3]],
      glow: [[86, 30, 1, 3], [116, 156, 3, 3]],
      stars: 60,
      starRows: 70,
    }),
  ];
  // The clock face: a dial ringed in brass, its hours marked, the hands at ten to twelve.
  const face = new Pix(640, 200);
  const cx = 248;
  const cy = 86;
  face.rect(cx - 70, cy - 20, 140, 200, slate);
  face.rect(cx - 70, cy - 20, 1, 200, ink('#424c6e'));
  face.disc(cx, cy, 64, slate);
  face.ring(cx, cy, 58, 60, brass);
  face.disc(cx, cy, 57, far);
  face.ring(cx, cy, 44, 44, slate);
  for (let h = 0; h < 12; h++) {
    const a = (h / 12) * Math.PI * 2;
    const len = h % 3 === 0 ? 8 : 4;
    face.line(cx + Math.cos(a) * 54, cy + Math.sin(a) * 54, cx + Math.cos(a) * (54 - len), cy + Math.sin(a) * (54 - len), brass);
  }
  const hand = (a: number, len: number, w: number): void => {
    for (let k = 0; k < w; k++) face.line(cx + k, cy, cx + k + Math.cos(a) * len, cy + Math.sin(a) * len, near);
  };
  hand(-Math.PI / 2 - Math.PI / 6, 30, 2);
  hand(-Math.PI / 2 + 0.05, 46, 1);
  face.disc(cx, cy, 3, brass);
  strips.push({ pix: face, k: 0.05, y: 14, below: look.horizon });
  yield;

  // The works: cogs meshing, a little apart.
  const works = new Pix(576, 140);
  for (let x = 30; x < works.w; x += rng.int(70, 110)) {
    const r = rng.int(12, 26);
    cog(works, x, rng.int(40, 100), r, Math.round(r * 0.8), far, brass, rng.range(0, 1));
  }
  strips.push({ pix: works, k: 0.15, y: 60 });
  yield;

  // Beams crossing, and the pendulum's rod.
  const beams = new Pix(704, 200);
  for (let x = rng.int(20, 60); x < beams.w; x += rng.int(120, 200)) {
    beams.rect(x, 0, 8, 200, near);
    beams.rect(x, 0, 1, 200, far);
    beams.line(x + 8, 60, x + 70, 130, near);
    beams.line(x + 8, 61, x + 70, 131, near);
  }
  beams.rect(0, 40, beams.w, 6, near);
  beams.rect(0, 40, beams.w, 1, far);
  const px = rng.int(200, 400);
  beams.rect(px, 46, 2, 110, near);
  beams.disc(px, 160, 9, near);
  beams.ring(px, 160, 9, 9, brass, true);
  strips.push({ pix: beams, k: 0.3, y: 0, below: look.near });
  yield;

  const big = new Pix(832, 150);
  for (let x = rng.int(40, 100); x < big.w; x += rng.int(220, 320)) cog(big, x, 110, rng.int(30, 40), 22, near, far, rng.range(0, 1));
  strips.push({ pix: big, k: 0.5, y: 50 });
  yield;

  const rail = new Pix(960, 52);
  rail.rect(0, 8, rail.w, 3, deep);
  rail.rect(0, 8, rail.w, 1, near);
  for (let x = 0; x < rail.w; x += 12) rail.rect(x, 8, 2, 20, deep);
  rail.rect(0, 22, rail.w, 30, deep);
  rail.rect(0, 22, rail.w, 1, near);
  strips.push({ pix: rail, k: 0.75, y: 156, below: DEEP });
  yield;
  return { strips, front: frontBrush(0xc1, '#0e071b', '#391f21', 'rubble') };
}

/**
 * Thronsaal: the hall of the Shadow Knight - a wall of red glass between its
 * piers, pillars hung with his banners, chandeliers burning low.
 */
function* throne(look: Look, ink: Ink): Painting {
  const rng = new Rng(0x7404e);
  const far = ink(look.far);
  const near = ink(look.near);
  const red = ink(look.accent);
  const deep = ink(DEEP);
  const top = ink(look.top);
  const base = ink(look.horizon);
  const strips: Strip[] = [];
  const wall = new Pix(640, 300);
  masonry(wall, 0, 0, wall.w, 300, 24, 12, { body: base, mortar: near, lit: ink('#5d2c28') }, rng);
  wall.dither(0, 0, wall.w, 30, top, 12);
  wall.dither(0, 30, wall.w, 16, top, 6);
  for (let x = 64; x < wall.w; x += 128) {
    pointed(wall, x, 100, 18, 200, near, 3, red);
    // Leading: the glass in panes, a rose at the head.
    for (let y = 70; y < 200; y += 10) wall.rect(x - 18, y, 37, 1, near);
    wall.rect(x, 64, 1, 136, near);
    wall.rect(x - 9, 100, 1, 100, near);
    wall.rect(x + 9, 100, 1, 100, near);
    wall.ring(x, 78, 6, 6, ink('#891e2b'));
    wall.rect(x - 17, 100, 1, 100, ink('#891e2b'));
  }
  wall.fade(224, 76, near, 4, 12);
  strips.push({ pix: wall, k: 0.05, y: -14, below: look.near, above: look.top });
  yield;

  // Pillars with his banners between them.
  const hall = new Pix(704, 300);
  for (let x = 30; x < hall.w; x += 120) {
    hall.rect(x - 9, 0, 18, 300, near);
    hall.rect(x - 9, 0, 1, 300, far);
    hall.rect(x - 12, 210, 24, 6, near);
    banner(hall, x + 46, 40, 22, 120, red, ink('#3b1443'), ink('#edab50'), deep);
  }
  strips.push({ pix: hall, k: 0.2, y: -30 });
  yield;

  // Chandeliers on their chains, candles burning.
  const lights = new Pix(832, 110);
  const sparks: Spark[] = [];
  for (let x = rng.int(80, 160); x < lights.w; x += rng.int(260, 360)) {
    lights.rect(x, 0, 1, 60, deep);
    lights.rect(x - 22, 60, 45, 3, near);
    lights.rect(x - 14, 63, 29, 2, near);
    for (let i = -20; i <= 20; i += 8) {
      lights.rect(x + i, 56, 1, 4, near);
      lights.set(x + i, 55, ink('#edab50'));
      if (!look.calm) sparks.push({ x: x + i, y: 54, hex: '#ed7614', period: rng.range(0.4, 0.9), on: 0.2, phase: rng.range(0, 1) });
    }
  }
  strips.push({ pix: lights, k: 0.35, y: -6, sparks });
  yield;

  const pillars = new Pix(832, 300);
  for (let x = rng.int(60, 120); x < pillars.w; x += rng.int(260, 340)) {
    pillars.rect(x - 11, 0, 22, 300, near);
    pillars.rect(x - 11, 0, 1, 300, far);
    pillars.rect(x + 6, 0, 1, 300, deep);
    pillars.rect(x - 15, 230, 30, 8, near);
    pillars.rect(x - 15, 230, 30, 1, far);
  }
  strips.push({ pix: pillars, k: 0.6, y: -40 });
  yield;

  // The dais steps right behind the play, their edges catching the glass's light.
  const dais = new Pix(960, 52);
  for (let i = 0; i < 4; i++) {
    dais.rect(0, 16 + i * 9, dais.w, 9, i === 0 ? base : near);
    dais.rect(0, 16 + i * 9, dais.w, 1, i === 0 ? far : base);
  }
  strips.push({ pix: dais, k: 0.75, y: 156, below: DEEP });
  yield;
  return { strips };
}

/* ---------------------------------------------------------------- rift */

/**
 * Der Riss: the world torn open on a violet void - a nebula, stars, and rock
 * adrift at every depth, the nearest torn slabs still standing on end. A calm
 * zone: nothing in it moves. Der Spiegelgrund is the same void over a floor
 * as still as a mirror, which holds all of it again upside down.
 */
function* rift(look: Look, ink: Ink, mirror = false): Painting {
  const rng = new Rng(mirror ? 0x3177 : 0x41f7);
  const pale = ink(look.far);
  const near = ink(look.near);
  const glow = ink(look.accent);
  const plum = ink(look.horizon);
  const slate = ink('#2a2f4e');
  const deep = ink(DEEP);
  const sky = nightSky(look, ink, rng, {
    zenith: [[14, 12], [14, 8], [14, 4]],
    glow: [[96, 30, 1, 3], [126, 146, 3, 3]],
    stars: 150,
    starRows: 120,
    starHex: ['#622461', '#93388f'],
  });
  // The nebula: clouds of the accent drifting across the void.
  for (let x = 0; x < sky.pix.w; x++) {
    const n = noise(x, sky.pix.w, 5, 77) * 0.7 + noise(x, sky.pix.w, 20, 78) * 0.3;
    const centre = 40 + Math.round(n * 44);
    const thick = Math.round(6 + n * 22);
    for (let y = centre - thick; y < centre + thick; y++) {
      const level = Math.round((1 - Math.abs(y - centre) / (thick + 1)) * (2 + n * 7));
      if (bayerOn(x, y, level)) sky.pix.set(x, y, glow);
    }
  }
  const strips: Strip[] = [sky];
  // On the mirror ground every strip reaches down past the mirror line, to hold its reflection.
  const isles = new Pix(512, mirror ? 260 : 120);
  const ic = { top: ink('#657392'), body: pale, lit: ink('#657392'), root: pale, shade: slate };
  for (let i = 0; i < 9; i++) island(isles, rng.int(0, isles.w), rng.int(10, 86), rng.int(10, 20), rng.int(6, 12), ic, rng);
  strips.push({ pix: isles, k: 0.05, y: 20 });
  yield;

  const mid = new Pix(576, mirror ? 260 : 140);
  const mc = { top: pale, body: slate, lit: pale, root: slate, shade: plum };
  for (let i = 0; i < 6; i++) island(mid, rng.int(0, mid.w), rng.int(10, 96), rng.int(20, 36), rng.int(10, 18), mc, rng);
  strips.push({ pix: mid, k: 0.15, y: 18 });
  yield;

  // Slabs torn up on end, a shard adrift above each.
  const slabs = new Pix(704, mirror ? 260 : 150);
  const shard = ink('#7a09fa');
  for (let x = rng.int(20, 50); x < slabs.w - 20; x += rng.int(60, 110)) {
    const h = rng.int(40, 90);
    const lean = rng.int(-6, 6);
    for (let r = 0; r < h; r++) {
      const w = Math.round(9 - (r / h) * 4);
      const sx = x + Math.round((lean * r) / h);
      slabs.rect(sx - w, 146 - r, w * 2, 1, near);
      slabs.set(sx - w, 146 - r, plum);
      slabs.set(sx + w - 1, 146 - r, deep);
    }
    const sy = 146 - h - rng.int(12, 30);
    spike(slabs, x + lean, sy, 8, 7, near, plum);
    spike(slabs, x + lean, sy, -6, 7, near, plum);
    slabs.set(x + lean, sy - 2, shard);
  }
  if (!mirror) slabs.rect(0, 146, slabs.w, 4, near);
  strips.push({ pix: slabs, k: 0.3, y: mirror ? 4 : 50, below: mirror ? undefined : look.near });
  yield;

  if (mirror) {
    // The mirror ground: everything above it again, upside down, a step
    // darker - and still, with no ripple at all. A line of light marks it.
    const line = 150;
    const still = (): number => 0;
    const dim = (c: Abgr): Abgr => (c === pale || c === glow ? plum : c === plum || c === slate ? near : deep);
    reflect(sky.pix, line, (c) => (c === glow ? near : c === plum ? near : c === ink(look.top) ? deep : plum), still, 1);
    for (const s of strips.slice(1)) reflect(s.pix, line - s.y, dim, still, 1);
    for (let x = 0; x < sky.pix.w; x++) if ((x * 3) % 7 < 4) sky.pix.set(x, line, glow);
    sky.below = DEEP;
    const rim = new Pix(960, 20);
    rim.rect(0, 10, rim.w, 10, deep);
    for (let x = 0; x < rim.w; x += rng.int(30, 80)) spike(rim, x, 12, -rng.int(4, 12), rng.int(5, 9), deep, near);
    strips.push({ pix: rim, k: 0.75, y: 190, below: DEEP });
    yield;
    return { strips, front: frontBrush(0x3178, '#0e071b', '#1a1932', 'spike') };
  }

  // Great islands hanging over the play, crystals on their backs.
  const big = new Pix(832, 120);
  const bc = { top: plum, body: near, lit: plum, root: near, shade: deep };
  for (let x = rng.int(60, 120); x < big.w - 60; x += rng.int(230, 330)) {
    const top = rng.int(10, 40);
    island(big, x, top, rng.int(44, 70), rng.int(24, 36), bc, rng);
    crystal(big, x - 8, top, rng.int(8, 14), 5, { lit: shard, body: plum, dark: near, edge: ink('#db3ffd') });
  }
  strips.push({ pix: big, k: 0.5, y: 8 });
  yield;

  const front = nearBand(960, near, plum, deep, 0x41f9, 10, 22);
  for (let x = rng.int(0, 40); x < front.w; x += rng.int(30, 90)) spike(front, x, 24, -rng.int(10, 30), rng.int(5, 11), deep, near);
  strips.push({ pix: front, k: 0.75, y: 156, below: DEEP });
  yield;
  return { strips, front: frontBrush(0x41f8, '#0e071b', '#1a1932', 'spike') };
}

function* mirror(look: Look, ink: Ink): Painting {
  return yield* rift(look, ink, true);
}

/**
 * Der Schlund der Fünfkronigen: her lair, a room inside the rift - ribs of
 * something huge for pillars, roots hanging from the roof, moss glowing green
 * in pockets, and the bones of what came in before the hero.
 */
function* lair(look: Look, ink: Ink): Painting {
  const rng = new Rng(0x1a12);
  const far = ink(look.far);
  const near = ink(look.near);
  const moss = ink(look.accent);
  const deep = ink(DEEP);
  const bone = ink('#424c6e');
  const boneLit = ink('#657392');
  const wallArt = caveWall(look, ink, rng, { seed: 0x1a13 });
  const w = wallArt.pix;
  for (let i = 0; i < 10; i++) {
    const x = rng.int(0, w.w);
    const y = rng.int(90, 220);
    for (let r = 16; r > 0; r -= 4) w.ditherDisc(x, y, r, moss, Math.round(9 - r / 2));
  }
  const strips: Strip[] = [wallArt];

  // Ribs: great curved bones rising from the floor and arching overhead.
  const ribs = new Pix(576, 300);
  for (let x = 40; x < ribs.w; x += 96) {
    for (let y = 0; y < 300; y++) {
      const bend = Math.round(Math.pow(1 - y / 300, 2) * 34);
      ribs.rect(x + bend, y, 7, 1, ink('#2a2f4e'));
      ribs.set(x + bend, y, bone);
    }
    for (let y = 20; y < 280; y += 40) ribs.rect(x + Math.round(Math.pow(1 - y / 300, 2) * 34) - 2, y, 11, 3, ink('#2a2f4e'));
  }
  strips.push({ pix: ribs, k: 0.15, y: -30 });
  yield;

  // Roots hanging still from the roof.
  const roots = caveRoof(704, 120, near, far, rng, 30, 22);
  for (let x = rng.int(0, 20); x < roots.w; x += rng.int(10, 30)) {
    let rx = x;
    const len = rng.int(30, 110);
    for (let y = 10; y < len; y++) {
      if (y % 9 === 0) rx += rng.int(-1, 1);
      roots.set(rx, y, near);
    }
  }
  strips.push({ pix: roots, k: 0.3, y: -6, above: look.near });
  yield;

  const pillars = new Pix(832, 300);
  for (let x = rng.int(60, 120); x < pillars.w; x += rng.int(200, 300)) {
    for (let y = 0; y < 300; y++) {
      const bend = Math.round(Math.pow(y / 300, 2) * 30);
      pillars.rect(x - bend, y, 12, 1, near);
      pillars.set(x - bend, y, far);
    }
  }
  strips.push({ pix: pillars, k: 0.5, y: -40 });
  yield;

  // Bones and skulls at the hero's back.
  const pile = nearBand(960, near, far, deep, 99, 12, 22);
  for (let x = rng.int(0, 60); x < pile.w; x += rng.int(60, 140)) {
    pile.disc(x, 12, 5, far);
    pile.rect(x - 4, 13, 9, 4, far);
    pile.rect(x - 3, 11, 2, 2, deep);
    pile.rect(x + 2, 11, 2, 2, deep);
    pile.ring(x, 12, 5, 5, boneLit, true);
    pile.rect(x + 10, 18, 14, 2, far);
  }
  strips.push({ pix: pile, k: 0.75, y: 156, below: DEEP });
  yield;
  return { strips, front: frontBrush(0x1a14, '#0e071b', '#1a1932', 'rubble') };
}

/** Der Kristallhort: behind the rift, a world of crystal under a deep blue night. */
function* crystalWorld(look: Look, ink: Ink): Painting {
  const rng = new Rng(0xc7157);
  const far = ink(look.far);
  const near = ink(look.near);
  const edge = ink(look.accent);
  const slate = ink(look.horizon);
  const deep = ink(DEEP);
  const strips: Strip[] = [
    nightSky(look, ink, rng, {
      zenith: [[12, 12], [14, 8], [14, 4]],
      glow: [[90, 30, 1, 3], [120, 152, 3, 3]],
      stars: 120,
      starRows: 100,
      starHex: ['#424c6e', '#0069aa'],
    }),
  ];
  const cFar = { lit: edge, body: far, dark: slate, edge: ink('#0098dc') };
  const spires = new Pix(512, 140);
  for (let x = rng.int(10, 30); x < spires.w; x += rng.int(30, 60)) crystal(spires, x, 139, rng.int(40, 120), rng.int(10, 18), cFar, rng.int(-8, 8));
  strips.push({ pix: spires, k: 0.05, y: 40, below: look.far });
  yield;

  const cMid = { lit: far, body: near, dark: deep, edge };
  const mid = new Pix(704, 120);
  for (let x = rng.int(10, 30); x < mid.w; x += rng.int(40, 80)) {
    for (let i = 0; i < 3; i++) crystal(mid, x + i * 9, 119, rng.int(24, 80), rng.int(8, 14), cMid, rng.int(-10, 10));
  }
  strips.push({ pix: mid, k: 0.3, y: 70, below: look.near });
  yield;

  const cNear = { lit: near, body: deep, dark: deep, edge: far };
  const big = new Pix(832, 300);
  for (let x = rng.int(40, 100); x < big.w; x += rng.int(200, 300)) {
    spike(big, x, 0, rng.int(60, 120), rng.int(20, 30), near, far);
    crystal(big, x + rng.int(60, 120), 299, rng.int(80, 130), rng.int(20, 28), cNear, rng.int(-10, 10));
  }
  strips.push({ pix: big, k: 0.5, y: -60 });
  yield;

  const under = nearBand(960, near, far, deep, 0xc7159, 10, 22);
  for (let x = rng.int(0, 30); x < under.w; x += rng.int(16, 50)) crystal(under, x, 24, rng.int(6, 22), rng.int(5, 9), cNear, rng.int(-4, 4));
  strips.push({ pix: under, k: 0.75, y: 156, below: DEEP });
  yield;
  return { strips, front: frontBrush(0xc7158, '#0e071b', '#1a1932', 'spike') };
}

/* ----------------------------------------------------------- foreground */

/**
 * The sparse strip in front of everything: a clump of fern or rubble every
 * few hundred pixels along the bottom edge, over the earth below the floor's
 * surface and never above it, so it frames the play without hiding any of it.
 */
function frontBrush(seed: number, bodyHex: string, litHex: string, kind: 'fern' | 'rubble' | 'spike' | 'clod'): Strip {
  const rng = new Rng(seed);
  const body = abgr(bodyHex);
  const lit = abgr(litHex);
  const p = new Pix(1280, 40);
  for (let x = rng.int(40, 140); x < p.w - 40; x += rng.int(240, 420)) {
    if (kind === 'fern') {
      for (let i = 0; i < 7; i++) {
        const a = Math.PI * (0.25 + (0.5 * i) / 6);
        const len = rng.int(14, 30);
        const ex = x + Math.cos(a) * len * 1.3;
        const ey = 40 - Math.sin(a) * len;
        p.line(x, 40, ex, ey, body);
        p.line(x + 1, 40, ex + 1, ey, body);
        for (let k = 3; k < len; k += 3) {
          const fx = x + Math.cos(a) * k * 1.3;
          const fy = 40 - Math.sin(a) * k;
          p.rect(fx - 1, fy, 3, 1, body);
        }
        if (a > Math.PI / 2) p.set(ex, ey, lit);
      }
    } else if (kind === 'spike') {
      for (let i = 0; i < 3; i++) spike(p, x + i * 9, 40, -rng.int(14, 34), rng.int(7, 12), body, lit);
    } else {
      const n = rng.int(3, 5);
      for (let i = 0; i < n; i++) {
        const r = rng.int(4, kind === 'clod' ? 7 : 9);
        const bx = x + rng.int(-14, 14);
        p.disc(bx, 40 - r + 2, r, body);
        p.rect(bx - r + 2, 40 - r * 2 + 2, Math.max(1, r - 2), 1, lit);
      }
    }
  }
  return { pix: p, k: 1.25, y: 232 };
}

/** The theatre's footlights: hooded lamps along the front of the stage, flames lit. */
function footlights(): Strip {
  const p = new Pix(1280, 40);
  const hood = abgr('#0e071b');
  const rim = abgr('#391f21');
  const flame = abgr('#ed7614');
  const heart = abgr('#ffa214');
  for (let x = 20; x < p.w; x += 64) {
    p.rect(x - 6, 20, 13, 6, hood);
    p.rect(x - 6, 20, 13, 1, rim);
    p.rect(x - 2, 26, 5, 14, hood);
    p.rect(x - 1, 17, 3, 3, flame);
    p.set(x, 18, heart);
    p.set(x, 16, flame);
  }
  return { pix: p, k: 1.25, y: 230 };
}

/* ------------------------------------------------------------- registry */

export type BackdropKind =
  | 'forest'
  | 'den'
  | 'ruins'
  | 'vault'
  | 'theater'
  | 'temple'
  | 'caves'
  | 'grotto'
  | 'web'
  | 'forge'
  | 'drowned'
  | 'altar'
  | 'castle'
  | 'battlement'
  | 'clock'
  | 'keep'
  | 'throne'
  | 'rift'
  | 'mirror'
  | 'lair'
  | 'crystal';

const RECIPES: Record<BackdropKind, (look: Look, ink: Ink) => Painting> = {
  forest,
  den,
  ruins,
  vault,
  theater,
  temple,
  caves,
  grotto,
  web: webCave,
  forge,
  drowned,
  altar,
  castle,
  battlement,
  clock,
  keep,
  throne,
  rift,
  mirror,
  lair,
  crystal: crystalWorld,
};

/**
 * A zone's backdrop, painted a strip at a time: each step of the generator
 * paints one, and its return value is the finished backdrop.
 */
export function paintBackdrop(kind: BackdropKind, look: Look, ink: Ink): Painting {
  return RECIPES[kind](look, ink);
}
