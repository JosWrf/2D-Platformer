import { RAMP } from '../render/palette';
import { PixelSprite } from '../render/pixel';
import { blank, rows, smear, tumble, type Grid } from '../render/sheet';
import { despeckle, insidePoly, line4 } from './boss-pixels';

/**
 * Grauwacht's art: the gargoyle in frames, each a pose of his rig drawn once
 * onto the art grid.
 *
 * The rig is the one his fight was built with - hip, shoulder, wing root,
 * head; wings that fold into a hood of stone or snap open on three struts,
 * haunches, forelegs, a tail - and a small painter lays its shapes out on a
 * grid of letters, one cell per art pixel: every cell whose middle falls
 * inside a shape takes that shape's letter, nothing is smoothed, and a cell
 * that a rule shaded into a lone speck is tidied away. Each frame is made
 * once; the fight only ever blits them.
 *
 * His two bodies are one set of frames in two palettes. Stone: four greys
 * cut into facets, moss where the rain sits, a glint of moon on the top
 * edges, empty sockets. Flesh: the same shapes in slate, his claws ivory, his
 * mouth dark red, and red eyes - the swap that has to read from across the
 * battlements in a single frame.
 */

/* ------------------------------------------------------------------ paints */

/*
 * Letters: A the moon along his top edges, B lit planes, C body, D shade, E
 * deep, F the crevices, the cracks of weathering and the wing's struts, W
 * the brightest points (horn tips, claw tips); M and O the near wing's skin,
 * lit along its leading edge and a step darker towards the scallops, N the
 * far wing's; K claws and fangs; Q the inside of the mouth; j the spout's
 * channel along the jaw; H G I J moss from its shadow to its brightest; U and
 * V lichen; e the eye's core, f its rim, g the ring round it that lights up
 * when he is about to strike; r and q a crack's glowing core and its dark lip.
 *
 * The two bodies are told apart by value before anything else: stone is the
 * palest thing on the battlements, flesh a step of slate darker than it and
 * still well clear of the night behind him - in the air too, against the lit
 * wall of the keep.
 */
type Paint = Readonly<Record<string, string>>;

const WHITE = '#ffffff';

/** Five greys cut into planes, a cool moon on the top edges, moss and lichen where the rain sits. */
const STONE: Paint = {
  A: RAMP.slate[6],
  B: WHITE,
  C: RAMP.grey[6],
  D: RAMP.grey[5],
  E: RAMP.grey[4],
  F: RAMP.grey[3],
  W: WHITE,
  M: RAMP.grey[6],
  O: RAMP.grey[5],
  N: RAMP.grey[5],
  K: WHITE,
  Q: RAMP.grey[2],
  j: RAMP.grey[3],
  H: RAMP.green[1],
  G: RAMP.green[2],
  I: RAMP.green[3],
  J: RAMP.green[4],
  U: RAMP.earth[5],
  V: RAMP.earth[4],
  e: RAMP.grey[1],
  f: RAMP.grey[2],
  g: RAMP.grey[4],
};

/** Water in the spout's channel while it gurgles and spits. */
const STONE_WET: Paint = { ...STONE, j: RAMP.blue[6] };

/** Half way: stone warming into flesh, the eyes kindling. */
const WARM: Paint = {
  A: WHITE,
  B: RAMP.slate[6],
  C: RAMP.slate[5],
  D: RAMP.slate[4],
  E: RAMP.slate[3],
  F: RAMP.slate[2],
  W: WHITE,
  M: RAMP.slate[5],
  O: RAMP.slate[4],
  N: RAMP.slate[4],
  K: RAMP.earth[7],
  Q: RAMP.rose[0],
  j: RAMP.slate[3],
  H: RAMP.green[1],
  G: RAMP.green[2],
  I: RAMP.green[2],
  J: RAMP.green[3],
  U: RAMP.slate[5],
  V: RAMP.slate[4],
  e: RAMP.rose[3],
  f: RAMP.rose[1],
  g: RAMP.slate[4],
};

function flesh(eye: string, rim: string, tell: boolean): Paint {
  return {
    A: RAMP.slate[6],
    B: RAMP.slate[5],
    C: RAMP.slate[4],
    D: RAMP.slate[3],
    E: RAMP.slate[2],
    F: RAMP.slate[1],
    W: RAMP.earth[7],
    M: RAMP.slate[5],
    O: RAMP.slate[4],
    N: RAMP.slate[3],
    K: RAMP.earth[7],
    Q: RAMP.rose[0],
    j: RAMP.slate[2],
    H: RAMP.green[1],
    G: RAMP.green[2],
    I: RAMP.green[2],
    J: RAMP.green[3],
    U: RAMP.slate[4],
    V: RAMP.slate[3],
    e: tell ? WHITE : eye,
    f: rim,
    g: tell ? rim : RAMP.slate[2],
  };
}

/** The flash of turning to stone: paler than stone. */
const WASH: Paint = {
  ...STONE,
  B: WHITE,
  C: RAMP.grey[6],
  D: RAMP.grey[5],
  E: RAMP.grey[4],
  F: RAMP.grey[3],
  M: RAMP.grey[6],
  O: RAMP.grey[5],
  N: RAMP.grey[5],
  K: WHITE,
  Q: RAMP.grey[4],
  j: RAMP.grey[5],
  e: RAMP.grey[3],
  f: RAMP.grey[4],
  g: RAMP.grey[5],
};

const PAINTS = {
  stone: STONE,
  stoneWet: STONE_WET,
  warm: WARM,
  flesh: flesh(RAMP.rose[5], RAMP.rose[3], false),
  fleshTell: flesh(RAMP.rose[5], RAMP.rose[3], true),
  flesh2: flesh(RAMP.fire[3], RAMP.fire[0], false),
  flesh2Tell: flesh(RAMP.fire[3], RAMP.fire[0], true),
  wash: WASH,
  flash: Object.fromEntries(Object.keys(STONE).map((k) => [k, WHITE])) as Paint,
} as const satisfies Record<string, Paint>;
export type PaintName = keyof typeof PAINTS;

/** A crack's core by how bright it glows (0 dim … 3 white hot), and the dark lip beside it. */
const CRACK_CORE = [RAMP.fire[1], RAMP.fire[2], RAMP.fire[3], RAMP.fire[4]] as const;
const CRACK_LIP = RAMP.earth[1];
export type CrackLevel = 0 | 1 | 2 | 3;

/** The colours a sprite of him is made in: one of his paints, and his cracks at a glow. */
export function keyOf(paint: PaintName, crack: CrackLevel = 3): Paint {
  return { ...PAINTS[paint], r: paint === 'flash' ? WHITE : CRACK_CORE[crack], q: paint === 'flash' ? WHITE : CRACK_LIP };
}

/* ----------------------------------------------------------------- painter */

/**
 * A grid of letters with a canvas's transform stack: shapes are given in
 * their own space and land on the cells whose middles they cover. What the
 * rig's drawing did with paths and gradients, this does with letters.
 */
class Painter {
  readonly cells: string[][];
  private m = [1, 0, 0, 1, 0, 0];
  private readonly stack: number[][] = [];

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.cells = blank(w, h);
  }

  save(): void {
    this.stack.push([...this.m]);
  }

  restore(): void {
    this.m = this.stack.pop() ?? [1, 0, 0, 1, 0, 0];
  }

  private mul(a: number, b: number, c: number, d: number, e: number, f: number): void {
    const [A, B, C, D, E, F] = this.m;
    this.m = [A * a + C * b, B * a + D * b, A * c + C * d, B * c + D * d, A * e + C * f + E, B * e + D * f + F];
  }

  translate(x: number, y: number): void {
    this.mul(1, 0, 0, 1, x, y);
  }

  turn(a: number): void {
    const c = Math.cos(a);
    const s = Math.sin(a);
    this.mul(c, s, -s, c, 0, 0);
  }

  scale(x: number, y: number): void {
    this.mul(x, 0, 0, y, 0, 0);
  }

  /** A local point on the grid. */
  map(x: number, y: number): [number, number] {
    const [a, b, c, d, e, f] = this.m;
    return [a * x + c * y + e, b * x + d * y + f];
  }

  /** The turn of the current transform, for lighting in screen space. */
  get angle(): number {
    return Math.atan2(this.m[1], this.m[0]);
  }

  /**
   * Every cell whose middle, taken back into local space, is inside: it
   * takes tone(local x, local y, cell x, cell y), or nothing if that is null.
   */
  fill(bounds: readonly number[], inside: (x: number, y: number) => boolean, tone: (x: number, y: number, gx: number, gy: number) => string | null): void {
    const [a, b, c, d, e, f] = this.m;
    const det = a * d - b * c;
    if (Math.abs(det) < 1e-9) return;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const [px, py] of [
      [bounds[0], bounds[1]],
      [bounds[2], bounds[1]],
      [bounds[0], bounds[3]],
      [bounds[2], bounds[3]],
    ]) {
      const [gx, gy] = this.map(px, py);
      x0 = Math.min(x0, gx);
      y0 = Math.min(y0, gy);
      x1 = Math.max(x1, gx);
      y1 = Math.max(y1, gy);
    }
    for (let gy = Math.max(0, Math.floor(y0)); gy <= Math.min(this.h - 1, Math.ceil(y1)); gy++) {
      for (let gx = Math.max(0, Math.floor(x0)); gx <= Math.min(this.w - 1, Math.ceil(x1)); gx++) {
        const px = gx + 0.5 - e;
        const py = gy + 0.5 - f;
        const lx = (d * px - c * py) / det;
        const ly = (-b * px + a * py) / det;
        if (!inside(lx, ly)) continue;
        const t = tone(lx, ly, gx, gy);
        if (t) this.cells[gy][gx] = t;
      }
    }
  }

  oval(cx: number, cy: number, rx: number, ry: number, tone: string | ((u: number, v: number) => string | null)): void {
    this.fill(
      [cx - rx, cy - ry, cx + rx, cy + ry],
      (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1,
      (x, y) => (typeof tone === 'string' ? tone : tone((x - cx) / rx, (y - cy) / ry)),
    );
  }

  poly(pts: readonly number[], tone: string | ((x: number, y: number) => string | null)): void {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < pts.length; i += 2) {
      x0 = Math.min(x0, pts[i]);
      x1 = Math.max(x1, pts[i]);
      y0 = Math.min(y0, pts[i + 1]);
      y1 = Math.max(y1, pts[i + 1]);
    }
    this.fill([x0, y0, x1, y1], (x, y) => insidePoly(pts, x, y), (x, y) => (typeof tone === 'string' ? tone : tone(x, y)));
  }

  /** A tapered capsule from one joint to the next. */
  limb(x1: number, y1: number, r1: number, x2: number, y2: number, r2: number, tone: string | ((t: number, side: number) => string | null)): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy || 1;
    const r = Math.max(r1, r2);
    this.fill(
      [Math.min(x1, x2) - r, Math.min(y1, y2) - r, Math.max(x1, x2) + r, Math.max(y1, y2) + r],
      (x, y) => {
        const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len2));
        const qx = x1 + dx * t - x;
        const qy = y1 + dy * t - y;
        return qx * qx + qy * qy <= (r1 + (r2 - r1) * t) ** 2;
      },
      (x, y) => {
        if (typeof tone === 'string') return tone;
        const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len2));
        const side = ((x - x1) * dy - (y - y1) * dx) / Math.sqrt(len2);
        return tone(t, side);
      },
    );
  }

  /** A polyline drawn as a chain of capsules of one width. */
  stroke(pts: readonly number[], width: number, tone: string | ((x: number, y: number) => string | null)): void {
    const r = width / 2;
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const [x1, y1, x2, y2] = [pts[i], pts[i + 1], pts[i + 2], pts[i + 3]];
      this.fill(
        [Math.min(x1, x2) - r, Math.min(y1, y2) - r, Math.max(x1, x2) + r, Math.max(y1, y2) + r],
        (x, y) => segDist(x, y, x1, y1, x2, y2) <= r,
        (x, y) => (typeof tone === 'string' ? tone : tone(x, y)),
      );
    }
  }
}

/* -------------------------------------------------------------- curves */

function quadPts(x0: number, y0: number, qx: number, qy: number, x1: number, y1: number, steps = 6): number[] {
  const out: number[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push(u * u * x0 + 2 * u * t * qx + t * t * x1, u * u * y0 + 2 * u * t * qy + t * t * y1);
  }
  return out;
}

function cubicPts(x0: number, y0: number, ax: number, ay: number, bx: number, by: number, x1: number, y1: number, steps = 8): number[] {
  const out: number[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push(
      u * u * u * x0 + 3 * u * u * t * ax + 3 * u * t * t * bx + t * t * t * x1,
      u * u * u * y0 + 3 * u * u * t * ay + 3 * u * t * t * by + t * t * t * y1,
    );
  }
  return out;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** How far a point is from a segment. */
function segDist(x: number, y: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x1 + dx * t - x, y1 + dy * t - y);
}

/** Which side of a segment's line a point is on: negative to its left, going from the first end to the second. */
function segSide(x: number, y: number, x1: number, y1: number, x2: number, y2: number): number {
  return ((x - x1) * (y2 - y1) - (y - y1) * (x2 - x1)) / (Math.hypot(x2 - x1, y2 - y1) || 1);
}

/* -------------------------------------------------------------------- rig */

/** Where things are on him, in his own space (logical px, feet at 0, 0, facing +x). */
const HIP = { x: -9, y: -18 };
const REAR_TILT = 0.62;
const SHOULDER = { x: 10, y: -36 };
const WING_ROOT = { x: -1, y: -40 };
const HEAD = { x: 20, y: -47 };
const HEAD_SCALE = 1.4;

/** A pose of the rig: what a frame is drawn from. */
export interface PoseSpec {
  spread: number;
  rear: number;
  crouch: number;
  swipe: number;
  jaw: number;
  fly: number;
  glide: number;
  head: number;
  roll: number;
  /** The wings' turn about their roots: the beat. */
  flap: number;
  /** The legs' swing while he walks. */
  gait: number;
  /** His second half: the near horn broken off. */
  broken: boolean;
}

const POSE: PoseSpec = { spread: 0.22, rear: 0, crouch: 0.1, swipe: 0, jaw: 0.32, fly: 0, glide: 0, head: 0, roll: 0, flap: 0, gait: 0, broken: false };

/** Light from the upper left, as a tone, for a normal (nx, ny) in screen space. */
function lit(nx: number, ny: number, base = 0): number {
  return -0.6 * nx - 0.8 * ny + base;
}

/** A tone from a light value: B, C, D or E. */
function band(l: number, deep = false): string {
  if (l > 0.45) return 'B';
  if (l > -0.1) return 'C';
  if (l > -0.55 || !deep) return 'D';
  return 'E';
}

/** A tone a step into shadow, for what is on his far side. */
const DARKER: Readonly<Record<string, string>> = { B: 'C', C: 'D', D: 'E', E: 'E' };

/**
 * Chiselled stone: the cells nearest each of a scatter of points make one
 * flat facet, lit as the plane of a rounded mass round (cx, cy) of radius r
 * at that point faces - with a nudge of its own, so that neighbouring planes
 * break the light the way cut stone does instead of grading it smoothly.
 */
function facets(x0: number, y0: number, x1: number, y1: number, step: number, cx: number, cy: number, r: number, bias: number, deep: boolean): (x: number, y: number) => string {
  const seeds: number[] = [];
  let k = 0;
  for (let y = y0; y <= y1; y += step * 0.86) {
    const row = Math.round((y - y0) / (step * 0.86));
    for (let x = x0 + (row % 2) * step * 0.5; x <= x1; x += step) {
      // A fixed scatter: the same stone in every frame he is drawn in.
      const jx = Math.sin(k * 12.9898) * 43758.5453;
      const jy = Math.sin(k * 78.233) * 12345.6789;
      const jl = Math.sin(k * 39.425) * 24634.6345;
      seeds.push(x + (jx - Math.floor(jx) - 0.5) * step * 0.5, y + (jy - Math.floor(jy) - 0.5) * step * 0.5, (jl - Math.floor(jl) - 0.5) * 0.16);
      k++;
    }
  }
  return (x, y) => {
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < seeds.length; i += 3) {
      const dx = x - seeds[i];
      const dy = y - seeds[i + 1];
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    const nx = (seeds[best] - cx) / r;
    const ny = (seeds[best + 1] - cy) / r;
    return band(lit(nx, ny) + bias + seeds[best + 2], deep);
  };
}

class Rig {
  /** The spout's lip, on the grid, as this pose put it. */
  mouth: [number, number] = [0, 0];

  constructor(
    private readonly g: Painter,
    private readonly p: PoseSpec,
  ) {}

  /** What rears with his shoulders, rearing. */
  private upper(fn: () => void): void {
    const g = this.g;
    if (this.p.rear <= 0) {
      fn();
      return;
    }
    g.save();
    g.translate(HIP.x, HIP.y);
    g.turn(-this.p.rear * REAR_TILT);
    g.translate(-HIP.x, -HIP.y);
    fn();
    g.restore();
  }

  draw(): void {
    const g = this.g;
    const p = this.p;
    g.save();
    g.scale(1 + p.crouch * 0.06, 1 - p.crouch * 0.16);
    this.upper(() => this.wing(true));
    this.tail();
    this.hindLeg(true);
    this.upper(() => this.arm(true));
    this.upper(() => this.torso());
    this.hindLeg(false);
    this.upper(() => {
      this.wing(false);
      this.head();
      this.arm(false);
    });
    g.restore();
  }

  /** A bat's wing: an arm bone, three struts, the skin scalloped between them. */
  private wing(far: boolean): void {
    const g = this.g;
    const p = this.p;
    const s = Math.max(0, Math.min(1.25, p.spread));
    const o = Math.min(1, s);
    g.save();
    g.translate(WING_ROOT.x + (far ? 5 : 0), WING_ROOT.y - (far ? 2 : 0));
    g.turn(p.flap * (far ? 0.85 : 1) - p.glide * 0.72 * (far ? 0.85 : 1));
    const reach = 28 + o * 8 + (s - o) * 14;
    const armA = lerp(-1.68, -2.42, o) - (s - o) * 0.4;
    const wx = Math.cos(armA) * reach;
    const wy = Math.sin(armA) * reach;
    const folded = [-4.2, -4.3, -4.41];
    const open = [-1.95, -2.7, -3.5];
    const lenF = [21, 36, 48];
    const lenO = [40, 46, 33];
    const tips: [number, number][] = [];
    for (let i = 0; i < 3; i++) {
      const a = lerp(folded[i], open[i], o) - (s - o) * 0.25;
      const len = lerp(lenF[i], lenO[i], o) * (1 + (s - o) * 0.4);
      tips.push([wx + Math.cos(a) * len, wy + Math.sin(a) * len]);
    }
    const back = { x: -14 + o * 2, y: 20 - o * 4 };
    const pts: number[] = [0, 0, wx, wy, tips[0][0], tips[0][1]];
    const scallop = (ax: number, ay: number, bx: number, by: number): void => {
      const mx = (ax + bx) / 2;
      const my = (ay + by) / 2;
      pts.push(...quadPts(ax, ay, mx + (wx - mx) * 0.32, my + (wy - my) * 0.32, bx, by));
    };
    scallop(tips[0][0], tips[0][1], tips[1][0], tips[1][1]);
    scallop(tips[1][0], tips[1][1], tips[2][0], tips[2][1]);
    scallop(tips[2][0], tips[2][1], back.x, back.y);
    // The skin: lit along the leading edge, a step darker towards the scallops.
    const lead = (x: number, y: number): number => Math.min(segDist(x, y, 0, 0, wx, wy), segDist(x, y, wx, wy, tips[0][0], tips[0][1]));
    g.poly(pts, (x, y) => (lead(x, y) < 13 ? (far ? 'N' : 'M') : far ? 'E' : 'O'));
    // The struts, grooved into the skin; the leading one carries the light.
    for (const [tx, ty] of tips.slice(1)) g.stroke([wx, wy, tx, ty], 2, far ? 'F' : 'E');
    g.stroke([wx, wy, tips[0][0], tips[0][1]], 2.4, far ? 'D' : (x, y) => (segSide(x, y, wx, wy, tips[0][0], tips[0][1]) < 0 ? 'B' : 'C'));
    g.limb(0, 0, 3.2, wx, wy, 2.4, far ? 'D' : (_t, side) => (side < -0.6 ? 'B' : 'C'));
    // The thumb claw at the wrist.
    g.poly([wx - 1, wy - 1, wx + 5, wy - 6, wx + 2, wy + 1], 'K');
    if (!far) {
      // A crack across the skin, and moss where the folded wing holds the rain.
      const cx = lerp(wx, tips[1][0], 0.45);
      const cy = lerp(wy, tips[1][1], 0.45);
      g.stroke([cx, cy, cx - 5 + o * 3, cy + 6, cx - 3 + o * 5, cy + 11], 1.7, 'F');
      if (o < 0.5) {
        this.moss(wx * 0.7, wy * 0.7 + 1, 1.2);
        this.moss(wx * 0.45 - 2, wy * 0.45 + 2, 0.8);
      }
    }
    g.restore();
  }

  /** The tail, curled on the stone behind him, a spade at the end of it. */
  private tail(): void {
    const g = this.g;
    const lift = this.p.fly * 12;
    g.stroke([-18, -12, ...cubicPts(-18, -12, -28, -8 - lift * 0.4, -34, -2 - lift, -42, -4 - lift)], 4.4, 'C');
    g.stroke([-41, -4 - lift, ...quadPts(-41, -4 - lift, -44, -6 - lift, -45, -9 - lift, 3)], 2.6, 'C');
    const tx = -46;
    const ty = -11 - lift;
    g.poly([tx - 5, ty + 2, tx, ty - 6, tx + 5, ty + 2, tx, ty + 1], 'C');
  }

  /** A haunch, a shin folded under it, a clawed foot on the stone. */
  private hindLeg(far: boolean): void {
    const g = this.g;
    const p = this.p;
    const swing = Math.sin(p.gait + (far ? Math.PI : 0)) * 0.22 * (1 - p.fly);
    g.save();
    g.translate(far ? 4 : 0, far ? -1 : 0);
    g.translate(HIP.x, HIP.y);
    g.turn(p.fly * 0.95 + swing - p.rear * 0.12);
    g.translate(-HIP.x, -HIP.y);
    const haunch = [-21, -11, ...cubicPts(-21, -11, -24, -24, -11, -30, -2, -23), ...quadPts(-2, -23, 4, -16, 0, -9), ...quadPts(0, -9, -9, -4, -21, -11)];
    const cut = facets(-24, -30, 4, -4, 9, -10, -19, 13, far ? -0.15 : 0.25, far);
    g.poly(haunch, (x, y) => (far ? DARKER[cut(x, y)] : cut(x, y)));
    g.poly([-3, -12, ...quadPts(-3, -12, 2, -6, -2, -2), -16, -1.5, ...quadPts(-16, -1.5, -19, -4, -15, -7)], far ? 'E' : 'C');
    g.oval(-8, -2.2, 8.5, 2.8, far ? 'D' : 'C');
    if (!far) this.lichen(-13, -16, 0.9);
    for (let i = 0; i < 3; i++) {
      const bx = -2 + i * 2;
      g.poly([bx - 1.6, -3.6 + i * 0.4, bx + 4, -3 + i, bx + 3.6, 0.6, bx, -0.8], 'K');
    }
    g.restore();
  }

  /** The hunched back, the shoulders, the chest in plates like courses of masonry. */
  private torso(): void {
    const g = this.g;
    const outline = [
      -21, -12,
      ...cubicPts(-21, -12, -26, -25, -18, -38, -6, -44),
      ...quadPts(-6, -44, 4, -49, 12, -43),
      ...quadPts(12, -43, 19, -36, 18, -24),
      ...quadPts(18, -24, 15, -12, 4, -9),
      ...quadPts(4, -9, -8, -6, -21, -12),
    ];
    // Cut in facets: the light by which way a plane of him faces.
    g.poly(outline, facets(-26, -50, 19, -6, 11, -3, -27, 21, 0.3, true));
    // The courses of plates down the chest.
    for (let i = 0; i < 4; i++) {
      const y = -32 + i * 5.5;
      g.stroke([15.5 - i * 1.6, y, ...quadPts(15.5 - i * 1.6, y, 11 - i * 2, y + 2.2, 6 - i * 2.4, y + 1.2, 3)], 1.6, 'D');
    }
    // The spine: a ridge of knuckles along the hunch.
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      const x = lerp(-20, 6, t);
      const y = -14 - Math.sin(t * Math.PI * 0.9 + 0.25) * 31 - t * 2;
      g.poly([x - 2.6, y + 1.8, x - 0.4, y - 3.8, x + 2.6, y + 1.4], 'C');
    }
    // A hundred winters of weather: cracks down the stone of his back and chest.
    g.stroke([-16, -36, -12, -30, -14, -24, -10, -18], 1.7, 'F');
    g.stroke([9, -40, 6, -34, 8, -29], 1.7, 'F');
    // Lichen on his flank, moss in clumps on the shoulders where the rain sits.
    this.lichen(-18, -22, 1.1);
    this.lichen(4, -14, 0.8);
    this.moss(1, -45.5, 1.5);
    this.moss(-12, -38, 1.1);
    this.moss(8, -42.5, 0.8);
  }

  /** A clump of moss: its shadow under it, its body, a lit top and a bright point. */
  private moss(x: number, y: number, s: number): void {
    const g = this.g;
    g.oval(x + 0.9 * s, y + 0.9 * s, 3.6 * s, 2 * s, 'H');
    g.oval(x, y, 3.4 * s, 2 * s, 'G');
    g.oval(x - 1 * s, y - 0.8 * s, 2.2 * s, 1.3 * s, 'I');
    g.oval(x - 1.6 * s, y - 1.2 * s, 1.6 * s, 1 * s, 'J');
  }

  /** A patch of lichen, rust-gold on the grey. */
  private lichen(x: number, y: number, s: number): void {
    const g = this.g;
    g.oval(x + 0.7 * s, y + 0.6 * s, 2.8 * s, 1.9 * s, 'V');
    g.oval(x, y, 2.4 * s, 1.6 * s, 'U');
  }

  /** A foreleg: shoulder to elbow to a paw with three hooked claws. */
  private arm(far: boolean): void {
    const g = this.g;
    const p = this.p;
    const walk = Math.sin(p.gait + (far ? Math.PI : 0)) * 0.32 * (1 - p.fly) * (1 - p.rear);
    let a1 = 1.15 + walk;
    let a2 = 1.65 + walk * 0.6;
    a1 = lerp(a1, -0.35, p.rear);
    a2 = lerp(a2, -0.95, p.rear);
    a1 = lerp(a1, 0.3, p.swipe);
    a2 = lerp(a2, 0.85, p.swipe);
    a1 = lerp(a1, lerp(0.22, 0, p.glide), p.fly);
    a2 = lerp(a2, lerp(0.12, -0.15, p.glide), p.fly);
    if (far) {
      a1 += 0.12;
      a2 += 0.1;
    }
    const sx = SHOULDER.x - (far ? 4 : 0);
    const sy = SHOULDER.y + (far ? 1 : 0);
    const ex = sx + Math.cos(a1) * 15;
    const ey = sy + Math.sin(a1) * 15;
    const wx = ex + Math.cos(a2) * 18;
    const wy = ey + Math.sin(a2) * 18;
    g.limb(sx, sy, 5.4, ex, ey, 3.6, far ? 'D' : (_t, side) => (side < -1.5 ? 'B' : 'C'));
    g.limb(ex, ey, 3.6, wx, wy, 2.6, far ? 'E' : (_t, side) => (side < -1 ? 'B' : 'C'));
    g.oval(wx, wy, 4.6, 3.6, far ? 'E' : 'C');
    const ux = Math.cos(a2);
    const uy = Math.sin(a2);
    const claw = 6.5 + p.rear * 2.5 + p.swipe * 2;
    for (let i = -1; i <= 1; i++) {
      const bx = wx + ux * 2.5 - uy * i * 2.6;
      const by = wy + uy * 2.5 + ux * i * 2.6;
      const tx = bx + ux * claw - uy * i * 1.4;
      const ty = by + uy * claw + ux * i * 1.4;
      g.poly([bx - uy * 1.4, by + ux * 1.4, tx, ty, bx + uy * 1.4, by - ux * 1.4], 'K');
    }
  }

  /** The face of a waterspout: horns swept back, a heavy brow, the mouth held open for the rain. */
  private head(): void {
    const g = this.g;
    const p = this.p;
    g.save();
    g.translate(HEAD.x, HEAD.y);
    g.turn(p.head);
    g.scale(HEAD_SCALE, HEAD_SCALE);
    this.mouth = g.map(14, 4);
    // The neck, into the shoulders.
    g.poly([-10, 2, ...quadPts(-10, 2, -9, -6, -3, -7, 3), 2, 6, ...quadPts(2, 6, -4, 9, -12, 9, 3)], 'C');
    // The far horn, behind the skull, and the ear swept back like a bat's.
    this.horn(3, -1, 'D', false);
    g.poly([-5, -3, -19, -11, -15, -6.5, -17, -3.5, -9, -1, -5, 2], 'D');
    // The skull: lit on its crown.
    g.oval(0, -1, 9.5, 8, (u, v) => band(lit(u, v) + 0.35));
    // The open mouth and the jaw hanging from its hinge.
    const jawA = 0.14 + p.jaw * 0.5;
    const jc = Math.cos(jawA);
    const js = Math.sin(jawA);
    const jaw = (x: number, y: number): [number, number] => [1 + (x - 1) * jc - (y - 3) * js, 3 + (x - 1) * js + (y - 3) * jc];
    g.poly([3, 2.5, 14.5, 1.6, ...jaw(13, 3.5), ...jaw(2, 4)], 'Q');
    g.poly([...jaw(1, 2.5), ...jaw(14, 3), ...jaw(16, 6), ...jaw(12, 7.5), ...jaw(1, 7)], 'C');
    g.stroke([...jaw(3, 4.6), ...jaw(14, 4.6)], 1.4, 'j');
    for (const fx of [5, 11.5]) g.poly([...jaw(fx - 1.2, 3.6), ...jaw(fx, 0.2), ...jaw(fx + 1.2, 3.6)], 'K');
    // Snout and upper jaw: a pug's nose turned up, the nostril flared.
    g.poly([3, -5, 12, -4.5, ...quadPts(12, -4.5, 16.5, -4, 16, 0, 3), 14.5, 2.2, 3, 3], (_x, y) => (y < -2.5 ? 'B' : 'C'));
    g.oval(14, -1.6, 1.6, 1.2, 'E');
    for (const fx of [6.5, 12.5]) g.poly([fx - 1.3, 2.4, fx, 6.6, fx + 1.3, 2.3], 'K');
    // The eye: a slanted almond under the brow - its rim, its core, and the
    // ring round it that flares when he is about to strike.
    g.poly([1, -4.8, 10.5, -6.4, 11.5, -1.2, 2.4, 0.2], 'g');
    g.poly([2.6, -3.6, 9.6, -4.6, 10, -2.2, 3.4, -1.2], 'f');
    g.poly([5.6, -4, 9.2, -4.4, 9.4, -2.6, 5.8, -2.2], 'e');
    // The brow: a heavy shelf over it, lit along its top.
    g.poly([-3, -9.5, ...quadPts(-3, -9.5, 6, -12.5, 12.5, -6.5, 4), 11, -4.6, ...quadPts(11, -4.6, 5, -7.4, -2, -6.5, 4)], (_x, y) => (y < -8.6 ? 'B' : 'D'));
    // The near horn, over everything - broken off in his second half.
    this.horn(0, 0, 'C', p.broken);
    this.moss(-3.5, -8.6, 0.8);
    g.stroke([-6, -2, -3, 1, -4, 4], 1.4, 'F');
    g.restore();
  }

  /** A horn swept up and back off the crown, ringed; snapped a third of the way up when broken. */
  private horn(ox: number, oy: number, tone: string, broken: boolean): void {
    const g = this.g;
    g.save();
    g.translate(ox, oy);
    const shape = broken
      ? [-6, -4, ...quadPts(-6, -4, -9, -10, -12, -13, 3), -10, -15.5, -8.6, -13, -6.5, -15.2, -5.5, -12.2, ...quadPts(-5.5, -12.2, -2, -10, 3, -7.5, 3)]
      : [-6, -4, ...quadPts(-6, -4, -11, -14, -21, -19), ...quadPts(-21, -19, -27, -22, -25, -29), ...quadPts(-25, -29, -23, -23, -17, -20.5), ...quadPts(-17, -20.5, -8, -15, 3, -7.5)];
    g.poly(shape, tone);
    const rings = broken ? 2 : 4;
    for (let i = 0; i < rings; i++) {
      const t = 0.18 + i * 0.17;
      const x = lerp(-2, -21, t);
      const y = lerp(-6.5, -20, t);
      g.stroke([x - 1.4, y + 2.8 - t * 1.5, x + 2.2, y - 1.8 + t], 1.4, tone === 'C' ? 'D' : 'E');
    }
    g.restore();
  }
}

/* ------------------------------------------------------------------ frames */

/** Every frame is drawn on this grid, his feet's middle at (FOOT_X, FOOT_Y) - the cell edge his soles stand on. */
const GW = 96;
const GH = 84;
/** Art cells per logical pixel of his rig: half, and a tenth more - he stands a little taller than his box. */
const SIZE = 0.55;
const FOOT_X = 54;
const FOOT_Y = 72;

export interface Frame {
  grid: Grid;
  /** The column of his middle and the row under his feet, in the frame. */
  px: number;
  py: number;
  /** The spout's lip, in the frame's cells. */
  mouth: readonly [number, number];
  /** A point of his own space (logical px, feet at 0, 0, facing +x), with what rears with his shoulders, in the frame's cells. */
  map: (lx: number, ly: number) => [number, number];
}

/**
 * The moon on the top edges and the stone's shadow along the bottom ones: a
 * cell of body with nothing over it catches the light, one with nothing
 * under it falls a step into shadow.
 */
function finish(cells: string[][]): void {
  const h = cells.length;
  const w = cells[0].length;
  const body = (c: string): boolean => 'BCDE'.includes(c);
  const out = cells.map((r) => [...r]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = cells[y][x];
      if (!body(c)) continue;
      const up = y > 0 ? cells[y - 1][x] : '.';
      const down = y < h - 1 ? cells[y + 1][x] : '.';
      if (up === '.' && c === 'B') out[y][x] = 'A';
      else if (down === '.' && (c === 'B' || c === 'C')) out[y][x] = 'D';
    }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) cells[y][x] = out[y][x];
}

/** The box round what was drawn, kept wide enough to hold the foot column, so that frames mirror about the same column. */
function bounds(cells: string[][]): [number, number, number, number] {
  let x0 = GW;
  let y0 = GH;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      if (cells[y][x] === '.') continue;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  }
  if (x1 < 0) return [FOOT_X, FOOT_Y - 1, FOOT_X, FOOT_Y - 1];
  return [Math.min(x0, FOOT_X), y0, Math.max(x1, FOOT_X), y1];
}

/** The transform a pose is drawn through, up to what rears with his shoulders: his own space onto the grid. */
function placed(p: PoseSpec, tilt: number): Painter {
  const g = new Painter(GW, GH);
  g.translate(FOOT_X, FOOT_Y);
  g.scale(SIZE, SIZE);
  g.turn(p.roll + tilt);
  return g;
}

/** A pose drawn: tilted by `tilt` (radians, nose down) about his feet. */
function draw(spec: Partial<PoseSpec>, tilt = 0): Frame {
  const p = { ...POSE, ...spec };
  const g = placed(p, tilt);
  const rig = new Rig(g, p);
  rig.draw();
  finish(g.cells);
  const cells = despeckle(rows(g.cells)).map((r) => r.split(''));
  const [x0, y0, x1, y1] = bounds(cells);
  // The same transform again, for points laid on the frame afterwards: the cracks.
  const m = placed(p, tilt);
  m.scale(1 + p.crouch * 0.06, 1 - p.crouch * 0.16);
  if (p.rear > 0) {
    m.translate(HIP.x, HIP.y);
    m.turn(-p.rear * REAR_TILT);
    m.translate(-HIP.x, -HIP.y);
  }
  return {
    grid: cells.slice(y0, y1 + 1).map((r) => r.slice(x0, x1 + 1).join('')),
    px: FOOT_X - x0,
    py: FOOT_Y - y0,
    mouth: [rig.mouth[0] - x0, rig.mouth[1] - y0],
    map: (lx, ly) => {
      const [gx, gy] = m.map(lx, ly);
      return [gx - x0, gy - y0];
    },
  };
}

/** The poses his frames are drawn from. */
const SPECS = {
  perch: {},
  sleep: { spread: 0.04, crouch: 0.16, jaw: 0.24, head: 0.14 },
  walk0: { crouch: 0.22, spread: 0.3, gait: 0 },
  walk1: { crouch: 0.22, spread: 0.3, gait: Math.PI / 2 },
  walk2: { crouch: 0.22, spread: 0.3, gait: Math.PI },
  walk3: { crouch: 0.22, spread: 0.3, gait: (3 * Math.PI) / 2 },
  rearHalf: { rear: 0.5, spread: 0.45, jaw: 0.55, head: -0.05 },
  rear: { rear: 1, spread: 0.6, jaw: 0.7, head: -0.1 },
  swipe: { rear: 0.25, swipe: 1, spread: 0.55, jaw: 0.55, head: 0.15 },
  recover: { swipe: 0.55, crouch: 0.35, spread: 0.35 },
  screech: { crouch: 0.75, spread: 1.22, jaw: 0.9, head: -0.35 },
  roar: { spread: 1.05, jaw: 0.85, head: -0.3 },
  land: { crouch: 0.55, spread: 0.65, jaw: 0.45 },
  glideWind: { crouch: 0.9, spread: 1, glide: 0.75, jaw: 0.6, head: 0.1, roll: 0.12 },
  fly0: { fly: 1, spread: 1, jaw: 0.5, roll: -0.32, head: -0.1, flap: 0 },
  fly1: { fly: 1, spread: 1, jaw: 0.5, roll: -0.32, head: -0.1, flap: 0.5 },
  fly2: { fly: 1, spread: 1, jaw: 0.5, roll: -0.32, head: -0.1, flap: 0 },
  fly3: { fly: 1, spread: 1, jaw: 0.5, roll: -0.32, head: -0.1, flap: -0.5 },
  dive0: { fly: 1, spread: 0.42, jaw: 0.8, head: 0.2, roll: 0.2 },
  dive1: { fly: 1, spread: 0.42, jaw: 0.8, head: 0.2, roll: 0.5 },
  dive2: { fly: 1, spread: 0.42, jaw: 0.8, head: 0.2, roll: 0.8 },
  glide0: { fly: 1, glide: 1, spread: 1.05, jaw: 0.6, roll: 0.42, head: -0.38, flap: 0.09 },
  glide1: { fly: 1, glide: 1, spread: 1.05, jaw: 0.6, roll: 0.42, head: -0.38, flap: -0.09 },
} as const satisfies Record<string, Partial<PoseSpec>>;
export type FrameName = keyof typeof SPECS;

const frames = new Map<string, Frame>();

/** A frame of a pose at one of four tilts (0 upright … 3 tipped 0.36 rad), his second half or not; made on first use. */
export function frameOf(name: FrameName, tilt: number, broken: boolean): Frame {
  const id = `${name}|${tilt}|${broken ? 1 : 0}`;
  let f = frames.get(id);
  if (!f) {
    f = draw({ ...SPECS[name], broken }, tilt * 0.12);
    frames.set(id, f);
  }
  return f;
}


/** His shoulder, where the swipe turns, in a frame's cells. */
export function shoulderOf(f: Frame): [number, number] {
  return f.map(SHOULDER.x, SHOULDER.y);
}

/** What his cracks may run across: stone, not claws, teeth, eyes or the mouth. */
const CRACKS_IN = 'ABCDEMNGHj';

/**
 * The cracks across a frame of him, on a grid of their own the frame's size:
 * each a line of glowing cells with a dark lip under it, and only where there
 * is stone to crack. `cracks` are polylines in his own space.
 */
export function crackGrid(f: Frame, cracks: readonly (readonly number[])[]): Grid {
  const h = f.grid.length;
  const w = f.grid[0].length;
  const cells = blank(w, h);
  const stone = (x: number, y: number): boolean => y >= 0 && y < h && x >= 0 && x < w && CRACKS_IN.includes(f.grid[y][x] ?? '.');
  for (const pts of cracks) {
    let px = 0;
    let py = 0;
    for (let i = 0; i + 1 < pts.length; i += 2) {
      const [gx, gy] = f.map(pts[i], pts[i + 1]);
      const x = Math.floor(gx);
      const y = Math.floor(gy);
      if (i > 0) for (const [cx, cy] of line4(px, py, x, y)) if (stone(cx, cy)) cells[cy][cx] = 'r';
      px = x;
      py = y;
    }
  }
  for (let y = h - 2; y >= 0; y--) {
    for (let x = 0; x < w; x++) if (cells[y][x] === 'r' && cells[y + 1][x] === '.' && stone(x, y + 1)) cells[y + 1][x] = 'q';
  }
  return rows(cells);
}

/** A frame with another grid laid over it: his cracks, for the statue that crumbles with them. */
export function overlay(f: Frame, top: Grid): Frame {
  const grid = f.grid.map((row, y) => {
    const t = top[y] ?? '';
    let out = '';
    for (let x = 0; x < row.length; x++) out += t[x] && t[x] !== '.' ? t[x] : row[x];
    return out;
  });
  return { ...f, grid };
}

/**
 * The statue coming apart, from whatever frame he died in: the grid cut into
 * blocks that drop and slide apart, the higher ones furthest, piling on the
 * floor - three steps of it.
 */
export function crumbleOf(source: Frame, step: 1 | 2 | 3): Frame {
  const k = step / 3;
  const src = source.grid;
  const h = src.length;
  const w = Math.max(...src.map((r) => r.length));
  const pad = 10;
  const cells = blank(w + pad * 2, h + 2);
  const floor = source.py;
  const B = 5;
  for (let by = 0; by < h; by += B) {
    for (let bx = 0; bx < w; bx += B) {
      const above = floor - (by + B / 2);
      const dy = Math.round(k * above * 0.75);
      const dx = Math.round(k * (bx + B / 2 - source.px) * 0.35);
      for (let y = by; y < Math.min(h, by + B); y++) {
        for (let x = bx; x < Math.min(w, bx + B); x++) {
          const c = src[y][x] ?? '.';
          if (c === '.' || c === 'e' || c === 'g') continue;
          const ty = Math.min(floor - 1, y + dy);
          cells[ty][x + dx + pad] = c === 'f' ? 'E' : c;
        }
      }
    }
  }
  return {
    grid: despeckle(rows(cells)),
    px: source.px + pad,
    py: floor,
    mouth: [source.mouth[0] + pad, source.mouth[1]],
    map: (lx, ly) => {
      const [x, y] = source.map(lx, ly);
      return [x + pad, y];
    },
  };
}

/** Chips of him on the battlements: three sizes, four turns. */
export const CHIPS: readonly (readonly Grid[])[] = [2, 3, 4].map((r) => {
  const n = r * 2 + 1;
  return Array.from({ length: 4 }, (_, k) => despeckle(rows(tumble(n, n, [-r, 0, -r * 0.3, -r, r, -r * 0.4, r * 0.6, r * 0.5], (k / 4) * Math.PI, 'EDCB'))));
});

/** The swipe's trail: a crescent of claw-light round his shoulder, 40 × 40 round its middle. */
export const SWIPE_TRAIL: Grid = (() => {
  const cells = blank(40, 40);
  smear(cells, 20, 20, 15, -0.7, 0.9, 4, 'A', 'B');
  return rows(cells);
})();
export const TRAIL_KEY: Paint = { A: RAMP.earth[7], B: RAMP.earth[6] };

/* --------------------------------------------------------------- sprites */

const sprites = new Map<string, PixelSprite>();

/** A grid of him in one of his paints, his cracks at a glow, made once. */
export function spriteOf(id: string, grid: Grid, paint: PaintName, crack: CrackLevel = 3): PixelSprite {
  const k = `${id}|${paint}|${crack}`;
  let s = sprites.get(k);
  if (!s) {
    s = new PixelSprite(grid, keyOf(paint, crack));
    sprites.set(k, s);
  }
  return s;
}

/** Lets go of the sprites made for grids whose id starts so: the cracks of a statue that has mended. */
export function forget(prefix: string): void {
  for (const k of [...sprites.keys()]) if (k.startsWith(prefix)) sprites.delete(k);
}

/* ------------------------------------------------------------- ahead */

/**
 * His frames made ahead of need, a little at a time while he sleeps on the
 * wall and wakes, so that no frame of the fight stops to lay one out: every
 * pose upright in stone and in flesh, his second half's too, and the poses he
 * can be frozen in mid-air at the tilts of his fall.
 */
const ahead: (() => void)[] = [];
let planned = false;

function plan(): void {
  const make = (name: FrameName, tilt: number, broken: boolean, paints: PaintName[]): void => {
    ahead.push(() => void frameOf(name, tilt, broken));
    for (const paint of paints) ahead.push(() => void spriteOf(`${name}|${tilt}|${broken ? 1 : 0}`, frameOf(name, tilt, broken).grid, paint));
  };
  const names = Object.keys(SPECS) as FrameName[];
  for (const name of names) make(name, 0, false, ['stone', 'flesh']);
  for (const name of names) make(name, 0, true, ['stone', 'flesh2']);
  const air: FrameName[] = ['fly0', 'fly1', 'fly2', 'fly3', 'dive0', 'dive1', 'dive2', 'glide0', 'glide1'];
  for (const tilt of [1, 2, 3]) for (const name of air) make(name, tilt, false, ['stone']);
}

/** Makes what is still to be made ahead, for up to `ms` milliseconds: called once a tick. */
export function prepare(ms: number): void {
  if (!planned) {
    planned = true;
    plan();
  }
  const t0 = performance.now();
  while (ahead.length > 0 && performance.now() - t0 < ms) ahead.shift()?.();
}

/** For previews: a paint's key, and the names of the poses. */
export function previewKey(paint: PaintName = 'stone'): Record<string, string> {
  return { ...keyOf(paint) };
}
export const FRAME_NAMES = Object.keys(SPECS) as FrameName[];
