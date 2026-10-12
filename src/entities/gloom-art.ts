import { RAMP } from '../render/palette';
import { PixelSprite } from '../render/pixel';
import { blank, hash2, rows, smear, type Grid } from '../render/sheet';
import { despeckle, insidePoly, line4, turned } from './boss-pixels';

/**
 * Nyktos's art: the light-eater in parts laid on the art grid once each and
 * blitted - a body of smoke in six frames of its slow churning, a head at
 * sixteen angles, and what he leaves in the grotto: the crystals he eats, the
 * pool of the Schattengriff and its claws, the wave, the orbs.
 *
 * His body is a heap of round lumps, each lit from above on its own and laid
 * over the one behind it, so the smoke is a cumulus with hard edges instead of
 * a blur, and a veil of wisps hangs under it. Smoke and flesh are the same
 * shapes in two paints: in the dark a cold violet-grey, its maw and sockets
 * the darkest thing on him and his eyes the brightest; in the light a slack
 * grey hide, veined, warm where the crystal's light catches it.
 */

/* ------------------------------------------------------------------ paints */

/*
 * Letters: R the lit rim along his top, L lit, M body, S shade, D deep (the
 * gaps, the wisps' ends, the lip of the maw), V void (the maw, the sockets),
 * T teeth and claws, W veins, X mottling.
 */
type Paint = Readonly<Record<string, string>>;

const WHITE = '#ffffff';

const SMOKE: Paint = {
  R: RAMP.slate[5],
  L: RAMP.slate[4],
  M: RAMP.slate[3],
  S: RAMP.slate[2],
  D: RAMP.slate[1],
  V: RAMP.slate[0],
  T: RAMP.slate[6],
  W: RAMP.slate[2],
  X: RAMP.slate[3],
};

/** Half way between the two: the moment the light takes him, or lets him go. */
const HALF: Paint = {
  R: RAMP.slate[6],
  L: RAMP.slate[5],
  M: RAMP.slate[4],
  S: RAMP.slate[3],
  D: RAMP.slate[1],
  V: RAMP.slate[0],
  T: RAMP.slate[6],
  W: RAMP.plum[1],
  X: RAMP.slate[3],
};

const FLESH: Paint = {
  R: RAMP.earth[7],
  L: RAMP.grey[6],
  M: RAMP.grey[5],
  S: RAMP.grey[4],
  D: RAMP.plum[0],
  V: RAMP.rose[0],
  T: RAMP.earth[7],
  W: RAMP.rose[0],
  X: RAMP.grey[4],
};

const PAINTS = {
  smoke: SMOKE,
  half: HALF,
  flesh: FLESH,
  /** Eating: the light he swallows running in his veins. */
  fleshEat: { ...FLESH, W: RAMP.fire[3] } as Paint,
  flash: Object.fromEntries(Object.keys(SMOKE).map((k) => [k, WHITE])) as Paint,
} as const satisfies Record<string, Paint>;
export type PaintName = keyof typeof PAINTS;

/** The colours a part of him is drawn in, by letter. */
export function tone(paint: PaintName, letter: string): string {
  return PAINTS[paint][letter];
}

/** The pool, the wave and the orbs: his dark, rimmed in violet. */
export const SHADOW = {
  void: RAMP.slate[0],
  deep: RAMP.slate[1],
  rim: RAMP.plum[3],
  rimDim: RAMP.plum[2],
  eye: RAMP.slate[6],
  bone: RAMP.slate[6],
} as const;

/* -------------------------------------------------------------- the body */

/** The lumps of smoke he is made of, round his middle: x, y, radius, phase (logical px, his bottom's middle at 0, 0). */
const PUFFS: readonly (readonly [number, number, number, number])[] = [
  [-21, -38, 15, 0.0],
  [-8, -50, 17, 1.3],
  [8, -46, 15, 2.1],
  [-14, -24, 15, 2.9],
  [3, -30, 17, 3.7],
  [15, -30, 12, 4.4],
  [-25, -20, 10, 5.2],
  [-3, -14, 13, 0.7],
  [11, -15, 10, 1.9],
  [-12, -60, 11, 2.6],
  [3, -61, 10, 3.3],
  [-27, -50, 9, 4.1],
  [18, -45, 9, 5.0],
];

/** The veins that show when he is flesh. */
const VEINS: readonly (readonly number[])[] = [
  [8, -52, 0, -44, -8, -34, -12, -22, -10, -9],
  [0, -44, -14, -47, -25, -40],
  [-8, -34, -20, -30, -29, -22],
  [10, -48, 13, -36, 6, -24, 8, -11],
  [-12, -22, -21, -13],
];

/** How many frames his churning takes, and how long each holds. */
export const CHURN = 6;
export const CHURN_TIME = 0.26;

/** A body frame's grid: his bottom's middle at cell (OX, OY). */
const BW = 56;
const BH = 54;
const OX = 28;
const OY = 46;

/** What the veil under him does: hang, lie spread on the floor, or draw up into him. */
export type Veil = 'hang' | 'floor' | 'pulled';

export interface BodySpec {
  /** His width and height, as the pose stretches them. */
  sx: number;
  sy: number;
  /** How far his top leans forward (logical px at the top of him). */
  lean: number;
  /** The frame of the churn, 0 … CHURN - 1. */
  k: number;
  veil: Veil;
  flesh: boolean;
  /** Coming apart as he dies: 0 whole … 4 nearly gone. */
  gone: number;
}

export interface Part {
  grid: Grid;
  /** The cell of the point it hangs from: his bottom's middle for the body, the root of the neck for the head. */
  ox: number;
  oy: number;
}

/** Where a lump of him is in a frame of the churn, in art cells from his bottom's middle. */
function puffAt(p: readonly number[], s: BodySpec): [number, number, number] {
  const th = (s.k / CHURN) * Math.PI * 2;
  const [x, y, r, ph] = p;
  return [
    (x * s.sx + Math.sin(th + ph) * 2.2 + s.lean * (-y / 60)) / 2,
    (y * s.sy + Math.cos(th + ph * 1.7) * 1.8) / 2,
    (r * (0.95 + Math.sin(th + ph) * 0.05) * ((s.sx + s.sy) / 2)) / 2,
  ];
}

/** The lumps of a frame, for his eyes to sit on: centres in art cells. */
export function bodyEyeAt(x: number, y: number, s: BodySpec): [number, number] {
  const th = (s.k / CHURN) * Math.PI * 2;
  return [(x * s.sx + s.lean * (-y / 60) + Math.sin(th + x) * 1.2) / 2, (y * s.sy + Math.cos(th + y) * 0.8) / 2];
}

/** A tone for a cell of a lump, by which way that part of it faces: lit from above and a little from the left. */
function lumpTone(nx: number, ny: number): string {
  const l = -0.5 * nx - 0.86 * ny;
  if (l > -0.6) return 'L';
  if (l > -0.86) return 'M';
  return 'S';
}

function buildBody(s: BodySpec): Part {
  const cells = blank(BW, BH);
  const th = (s.k / CHURN) * Math.PI * 2;
  const set = (x: number, y: number, c: string): void => {
    const gx = Math.floor(x) + OX;
    const gy = Math.floor(y) + OY;
    if (gx >= 0 && gy >= 0 && gx < BW && gy < BH) cells[gy][gx] = c;
  };
  // The veil first: seven wisps, thinning as they go.
  const spread = s.veil === 'floor' ? 1 : 0;
  const pull = s.veil === 'pulled' ? 1 : 0;
  for (let i = 0; i < 7; i++) {
    const rx = (-21 + i * 7) * s.sx;
    const ry = (-14 + Math.abs(i - 3) * 1.5) * s.sy;
    const len = (16 + ((i * 5) % 4) * 6) * (1 - pull * 0.75);
    for (let k = 1; k <= 6; k++) {
      const u = k / 6;
      const r = (u < 0.5 ? 2.4 : u < 0.84 ? 1.6 : 1) * (1 - spread * 0.3);
      const sway = Math.sin(th + i * 1.3 - u * 2.5) * 5 * u;
      const x = (rx + sway - 6 * u * u + spread * rx * 0.9 * u) / 2;
      const y = Math.min(spread ? ry + 2 * u : ry + len * u, spread ? -1 : 99) / 2;
      const c = u > 0.8 ? 'D' : u > 0.55 ? 'S' : 'M';
      for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
        for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) if (dx * dx + dy * dy <= r * r) set(x + dx, y + dy, c);
      }
    }
  }
  // The lumps, back to front: the higher ones behind, the lower ones laid over them.
  const lumps = PUFFS.map((p) => puffAt(p, s)).sort((a, b) => a[1] - b[1]);
  for (const [cx, cy, r] of lumps) {
    const inside = (x: number, y: number): boolean => ((x + 0.5 - cx) / r) ** 2 + ((y + 0.5 - cy) / r) ** 2 <= 1;
    const under = (x: number, y: number): boolean => (cells[y + OY]?.[x + OX] ?? '.') !== '.';
    const lump: [number, number, string][] = [];
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if (!inside(x, y)) continue;
        const nx = (x + 0.5 - cx) / r;
        const ny = (y + 0.5 - cy) / r;
        // Where its edge lies over a lump behind it, a crease: each lump reads as its own.
        const edge = ny > 0.25 && ((!inside(x + 1, y) && under(x + 1, y)) || (!inside(x - 1, y) && under(x - 1, y)) || (!inside(x, y + 1) && under(x, y + 1)));
        lump.push([x, y, edge ? 'S' : lumpTone(nx, ny)]);
      }
    }
    for (const [x, y, c] of lump) set(x, y, c);
  }
  if (s.flesh) {
    // Mottling in the hide, and the veins.
    PUFFS.forEach((p, i) => {
      const [cx, cy, r] = puffAt(p, s);
      const x = Math.floor(cx + ((i * 5) % 7) / 2 - 1.5);
      const y = Math.floor(cy + ((i * 3) % 5) / 2 + 1);
      const w = r > 7 ? 2 : 1;
      for (let dx = 0; dx < w + 1; dx++) for (let dy = 0; dy < w; dy++) if (cells[y + dy + OY]?.[x + dx + OX] === 'L' || cells[y + dy + OY]?.[x + dx + OX] === 'M') set(x + dx, y + dy, 'X');
    });
    for (const v of VEINS) {
      for (let i = 0; i + 3 < v.length; i += 2) {
        const at = (j: number): [number, number] => [Math.floor((v[j] + s.lean * (-v[j + 1] / 60)) / 2), Math.floor((v[j + 1] * s.sy) / 2)];
        const [x0, y0] = at(i);
        const [x1, y1] = at(i + 2);
        for (const [x, y] of line4(x0, y0, x1, y1)) if ('LMSX'.includes(cells[y + OY]?.[x + OX] ?? '.')) set(x, y, 'W');
      }
    }
  }
  // The rim: the top of him catches what light there is.
  for (let y = BH - 1; y >= 1; y--) {
    for (let x = 0; x < BW; x++) if (cells[y][x] === 'L' && cells[y - 1][x] === '.') cells[y][x] = 'R';
  }
  if (s.gone > 0) {
    // Coming apart: lumps of him let go, the edges first.
    for (let y = 0; y < BH; y++) {
      for (let x = 0; x < BW; x++) {
        if (cells[y][x] === '.') continue;
        const block = hash2(x >> 1, (y >> 1) + 97);
        const edge = y > 0 && y < BH - 1 && x > 0 && x < BW - 1 && [cells[y - 1][x], cells[y + 1][x], cells[y][x - 1], cells[y][x + 1]].includes('.') ? 0.15 : 0;
        if (block + edge < s.gone * 0.22) cells[y][x] = '.';
      }
    }
  }
  return { grid: despeckle(rows(cells)), ox: OX, oy: OY };
}

/* -------------------------------------------------------------- the head */

/** The head turns in sixteen steps. */
export const HEAD_STEPS = 16;
/** Its lengths: hunched and stretched out. */
export const HEAD_LENS = [30, 38] as const;
/** How wide the maw is open, in four steps. */
export const MOUTHS = [5, 9, 13, 17] as const;

/** The skull's outline in its own space (along it, across it): a brow, a long falling snout, a sunken cheek. */
function skull(len: number): number[] {
  const q = (x0: number, y0: number, qx: number, qy: number, x1: number, y1: number, n = 4): number[] => {
    const out: number[] = [];
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const u = 1 - t;
      out.push(u * u * x0 + 2 * u * t * qx + t * t * x1, u * u * y0 + 2 * u * t * qy + t * t * y1);
    }
    return out;
  };
  return [
    -8, -9,
    ...q(-8, -9, 0, -16.5, 11, -12.5),
    ...q(11, -12.5, 16, -10.5, 20, -9),
    ...q(20, -9, len * 0.7, -6.5, len, -3.6),
    ...q(len, -3.6, len + 2.5, -2.5, len + 2.5, 0, 2),
    ...q(len + 2.5, 0, len + 2.5, 2.5, len, 3.6, 2),
    ...q(len, 3.6, len * 0.66, 5, 24, 5.5),
    20, 7.5,
    ...q(20, 7.5, 12, 4.5, 8, 9),
    ...q(8, 9, 0, 11.5, -8, 9),
  ];
}

/** The head's grid is this size, the root of the neck at its middle. */
const HS = 52;

function buildHead(step: number, len: number, mouth: number, flesh: boolean): Part {
  const a = (step / HEAD_STEPS) * Math.PI * 2;
  const cells = blank(HS, HS);
  const c = Math.cos(a);
  const s = Math.sin(a);
  /** A cell's middle, back in the head's own space (logical px). */
  const local = (gx: number, gy: number): [number, number] => {
    const x = (gx + 0.5 - HS / 2) * 2;
    const y = (gy + 0.5 - HS / 2) * 2;
    return [x * c + y * s, -x * s + y * c];
  };
  const outline = skull(len);
  const mx = len + 1.5;
  for (let gy = 0; gy < HS; gy++) {
    for (let gx = 0; gx < HS; gx++) {
      const [x, y] = local(gx, gy);
      const ox = (x - mx) / (mouth * 0.45);
      const oy = y / mouth;
      const inMouth = ox * ox + oy * oy <= 1;
      if (!insidePoly(outline, x, y) && !inMouth) continue;
      let t = y < -5.5 ? 'L' : y < 3 ? 'M' : 'S';
      // The ridges of bone down the snout, and the hollow of the cheek.
      if (flesh && x > len * 0.5 && x < len - 1 && Math.abs(((x - len * 0.55) % (len * 0.15)) - 0.5) < 0.9 && y > -7 && y < -1) t = 'S';
      if (y > 2 && y < 4.5 && x > 13 && x < 24 && Math.abs(y - (3 + (x - 13) * 0.05)) < 1) t = 'S';
      // The socket the eyes crowd round.
      const ex = (x - 13) / 6.5;
      const ey = (y + 4) / 4.5;
      if (ex * ex + ey * ey <= 1) t = 'V';
      if (inMouth) {
        // A lamprey's round maw, ringed with teeth.
        const ix = (x - mx - 0.5) / (mouth * 0.28);
        const iy = y / (mouth * 0.62);
        const d = ix * ix + iy * iy;
        if (d <= 1) t = 'V';
        else {
          const ang = Math.atan2(oy, ox);
          const tooth = Math.abs(((ang / (Math.PI * 2)) * 12 + 12.5) % 1 - 0.5) < 0.22;
          t = tooth && d < 2.2 ? 'T' : 'D';
        }
      }
      cells[gy][gx] = t;
    }
  }
  // A line round the back of the skull, where it lies over the smoke it grows out of.
  const out = cells.map((r) => [...r]);
  for (let gy = 1; gy < HS - 1; gy++) {
    for (let gx = 1; gx < HS - 1; gx++) {
      if (cells[gy][gx] === '.' || local(gx, gy)[0] > 17) continue;
      if (cells[gy - 1][gx] === '.' || cells[gy + 1][gx] === '.' || cells[gy][gx - 1] === '.' || cells[gy][gx + 1] === '.') out[gy][gx] = 'D';
    }
  }
  // The brow's ridge catches the light.
  for (let gy = HS - 1; gy >= 1; gy--) {
    for (let gx = 0; gx < HS; gx++) if (out[gy][gx] === 'L' && out[gy - 1][gx] === '.') out[gy][gx] = 'R';
  }
  return { grid: despeckle(rows(out)), ox: HS / 2, oy: HS / 2 };
}

/** Where an eye on the head is in a head part's cells, for an eye at (along, across) on a head of `len`. */
export function headEyeAt(step: number, len: number, x: number, y: number): [number, number] {
  const a = (step / HEAD_STEPS) * Math.PI * 2;
  const hx = x <= 18 ? x : 18 + (x - 18) * (len / 40);
  const [px, py] = turned([hx, y], a);
  return [px / 2, py / 2];
}

/** The tip of the maw, for what comes out of it: in art cells from the root of the neck. */
export function mouthAt(step: number, len: number): [number, number] {
  const [px, py] = turned([len + 1.5, 0], (step / HEAD_STEPS) * Math.PI * 2);
  return [px / 2, py / 2];
}

/* ------------------------------------------------------------ crystals */

/** The rock a crystal grows out of and its three shards, dark or lit (1 … 3), or emptied. */
export type CrystalLook = 0 | 1 | 2 | 3 | 'spent';

const SHARDS: readonly (readonly [number, number, number, number])[] = [
  [-7, 18, 8, -0.34],
  [7, 15, 7, 0.4],
  [0, 31, 10, 0.03],
];

/** A crystal's grid: its foot's middle at (CX, CY). */
const CW = 22;
const CH = 20;
const CX = 11;
const CY = 19;

const CRYSTAL_TONES: Readonly<Record<string, readonly [string, string, string]>> = {
  // side, face, edge
  spent: [RAMP.slate[1], RAMP.slate[2], RAMP.slate[3]],
  0: [RAMP.slate[3], RAMP.slate[4], RAMP.slate[5]],
  1: [RAMP.earth[4], RAMP.rust[3], RAMP.fire[3]],
  2: [RAMP.rust[3], RAMP.fire[3], RAMP.fire[4]],
  3: [RAMP.fire[3], RAMP.fire[4], WHITE],
};

function buildCrystal(look: CrystalLook): PixelSprite {
  const cells = blank(CW, CH);
  const key: Record<string, string> = { a: RAMP.slate[2], b: RAMP.slate[3] };
  const [side, face, edge] = CRYSTAL_TONES[String(look)];
  key.s = side;
  key.f = face;
  key.e = edge;
  key.k = RAMP.slate[0];
  for (let gy = 0; gy < CH; gy++) {
    for (let gx = 0; gx < CW; gx++) {
      const x = (gx + 0.5 - CX) * 2;
      const y = (gy + 0.5 - CY) * 2;
      // The rock: a low mound, darker below.
      if ((x / 13) ** 2 + ((y + 1) / 3.6) ** 2 <= 1) cells[gy][gx] = y < -1 ? 'b' : 'a';
    }
  }
  for (const [dx, h, w, tilt] of SHARDS) {
    const hw = w / 2;
    const body = turned([-hw, 0, -hw, -h * 0.7, 0, -h, hw, -h * 0.7, hw, 0], tilt, dx, -2);
    const lit = turned([-hw * 0.2, 0, -hw * 0.2, -h * 0.74, 0, -h, -hw, -h * 0.7, -hw, 0], tilt, dx, -2);
    const tip = turned([-hw, -h * 0.7, 0, -h, hw, -h * 0.7], tilt, dx, -2);
    for (let gy = 0; gy < CH; gy++) {
      for (let gx = 0; gx < CW; gx++) {
        const x = (gx + 0.5 - CX) * 2;
        const y = (gy + 0.5 - CY) * 2;
        if (!insidePoly(body, x, y)) continue;
        cells[gy][gx] = insidePoly(lit, x, y) ? 'f' : 's';
      }
    }
    // The edge along the top of the shard: the cells nearest the tip's two slopes.
    for (let i = 0; i + 3 < tip.length; i += 2) {
      const x0 = Math.floor(tip[i] / 2 + CX);
      const y0 = Math.floor(tip[i + 1] / 2 + CY);
      const x1 = Math.floor(tip[i + 2] / 2 + CX);
      const y1 = Math.floor(tip[i + 3] / 2 + CY);
      for (const [x, y] of line4(x0, y0, x1, y1)) if (cells[y]?.[x] === 's' || cells[y]?.[x] === 'f') cells[y][x] = 'e';
    }
    if (look === 'spent') {
      // Emptied: a crack down the tall one.
      const crack = turned([-hw * 0.6, -h * 0.25, hw * 0.1, -h * 0.45, -hw * 0.2, -h * 0.62], tilt, dx, -2);
      if (h > 20) {
        for (let i = 0; i + 3 < crack.length; i += 2) {
          for (const [x, y] of line4(Math.floor(crack[i] / 2 + CX), Math.floor(crack[i + 1] / 2 + CY), Math.floor(crack[i + 2] / 2 + CX), Math.floor(crack[i + 3] / 2 + CY))) {
            if (cells[y]?.[x] && cells[y][x] !== '.') cells[y][x] = 'k';
          }
        }
      }
    }
  }
  return new PixelSprite(despeckle(rows(cells)), key);
}

const crystals = new Map<string, PixelSprite>();

/** A crystal as it looks, made once: its foot's middle at cell (CRYSTAL_X, CRYSTAL_Y). */
export function crystalSprite(look: CrystalLook): PixelSprite {
  const k = String(look);
  let s = crystals.get(k);
  if (!s) {
    s = buildCrystal(look);
    crystals.set(k, s);
  }
  return s;
}
export const CRYSTAL_X = CX;
export const CRYSTAL_Y = CY;

/* ------------------------------------------------------ a light's edge */

/** How many steps a light's ring turns through from one dash to the next. */
export const RING_PHASES = 6;

/** The dashes round a light of radius r cells: a period of the pattern, in radians. */
export function ringPeriod(r: number): number {
  return (Math.PI * 2) / Math.max(12, Math.round(r * 0.6));
}

const lightRings = new Map<string, PixelSprite>();

/**
 * The edge of a crystal's light, radius r cells, its middle at the middle of
 * the sprite: a ring of long dashes two cells deep, warm inside and a step
 * darker outside - the light stepping down the palette into the dark. Cut off
 * at the floor the crystal stands on, nine cells under the middle.
 */
export function lightRing(r: number, phase: number, bright: boolean): PixelSprite {
  const k = `${r}|${phase}|${bright ? 1 : 0}`;
  let s = lightRings.get(k);
  if (!s) {
    const n = r * 2 + 5;
    const c = r + 2;
    const cells = blank(n, n);
    const period = ringPeriod(r);
    const turn = (phase / RING_PHASES) * period;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const dx = x + 0.5 - c;
        const dy = y + 0.5 - c;
        if (dy > 8.5) continue;
        const d = Math.hypot(dx, dy);
        const ring = Math.abs(d - r) < 0.55 ? 'o' : Math.abs(d - (r - 1)) < 0.55 ? 'i' : '';
        if (!ring) continue;
        const a = (((Math.atan2(dy, dx) + turn) % period) + period) % period;
        if (a < period * 0.72) cells[y][x] = ring;
      }
    }
    s = new PixelSprite(rows(cells), { o: RAMP.earth[3], i: bright ? RAMP.earth[4] : RAMP.earth[3] });
    lightRings.set(k, s);
  }
  return s;
}

/* ------------------------------------------------------- the dark's moves */

/** The four claws of the Schattengriff at a height (0 … 3), hooking in over the pool's middle. */
function buildClaw(step: number, hook: 1 | -1): PixelSprite {
  const hgt = 44 * ((step + 1) / 4);
  const w = 8;
  const h = Math.ceil(hgt / 2) + 2;
  const cells = blank(w, h);
  const q = (x0: number, y0: number, qx: number, qy: number, x1: number, y1: number): number[] => {
    const out: number[] = [];
    for (let i = 1; i <= 5; i++) {
      const t = i / 5;
      const u = 1 - t;
      out.push(u * u * x0 + 2 * u * t * qx + t * t * x1, u * u * y0 + 2 * u * t * qy + t * t * y1);
    }
    return out;
  };
  const pts = [-4.5, 0, ...q(-4.5, 0, -5 - hook, -hgt * 0.55, hook * 3, -hgt), ...q(hook * 3, -hgt, hook * 8, -hgt * 0.9, hook * 6.5, -hgt * 0.72), ...q(hook * 6.5, -hgt * 0.72, 1.5, -hgt * 0.45, 4.5, 0)];
  for (let gy = 0; gy < h; gy++) {
    for (let gx = 0; gx < w; gx++) {
      const x = (gx + 0.5 - w / 2) * 2;
      const y = (gy + 0.5 - h) * 2;
      if (!insidePoly(pts, x, y)) continue;
      const up = -y / hgt;
      cells[gy][gx] = up > 0.62 ? 'T' : up > 0.3 ? 'M' : 'V';
    }
  }
  return new PixelSprite(despeckle(rows(cells)), { T: SHADOW.bone, M: RAMP.slate[3], V: SHADOW.void });
}

const claws = new Map<string, PixelSprite>();

/** A claw out of the pool: its foot's middle at the bottom middle of the sprite. */
export function clawSprite(step: number, hook: 1 | -1): PixelSprite {
  const k = `${step}|${hook}`;
  let s = claws.get(k);
  if (!s) {
    s = buildClaw(step, hook);
    claws.set(k, s);
  }
  return s;
}

/** The Finsterwelle: a crest of dark rolling forward (to the right), rimmed in violet, with two eyes in it and a smear behind. Four frames of its wobble. */
function buildWave(k: number): Part {
  const w = 22;
  const h = 13;
  const ox = 15;
  const cells = blank(w, h);
  const wob = Math.sin((k / 4) * Math.PI * 2) * 1.5;
  const WH = 22;
  const q = (x0: number, y0: number, qx: number, qy: number, x1: number, y1: number): number[] => {
    const out: number[] = [];
    for (let i = 1; i <= 6; i++) {
      const t = i / 6;
      const u = 1 - t;
      out.push(u * u * x0 + 2 * u * t * qx + t * t * x1, u * u * y0 + 2 * u * t * qy + t * t * y1);
    }
    return out;
  };
  const crest = [-22, 0, ...q(-22, 0, -12, -WH * 0.7, 2, -WH - wob), ...q(2, -WH - wob, 10, -WH * 0.8, 14, 0)];
  const rim = [-14, -WH * 0.55, ...q(-14, -WH * 0.55, -6, -WH * 0.95, 2, -WH - wob), ...q(2, -WH - wob, 9, -WH * 0.8, 12, -WH * 0.3)];
  for (let gy = 0; gy < h; gy++) {
    for (let gx = 0; gx < w; gx++) {
      const x = (gx + 0.5 - ox) * 2;
      const y = (gy + 0.5 - h) * 2;
      if (insidePoly(crest, x, y)) cells[gy][gx] = 'V';
    }
  }
  // The smear it leaves along the floor, thinning behind it.
  for (let gx = 0; gx < ox - 6; gx++) {
    const rowsDeep = gx > (ox - 6) * 0.5 ? 2 : 1;
    for (let r = 0; r < rowsDeep; r++) if (cells[h - 1 - r][gx] === '.') cells[h - 1 - r][gx] = 'D';
  }
  for (let i = 0; i + 3 < rim.length; i += 2) {
    const x0 = Math.floor(rim[i] / 2 + ox);
    const y0 = Math.floor(rim[i + 1] / 2 + h);
    const x1 = Math.floor(rim[i + 2] / 2 + ox);
    const y1 = Math.floor(rim[i + 3] / 2 + h);
    for (const [x, y] of line4(x0, y0, x1, y1)) if (cells[y]?.[x] === 'V') cells[y][x] = 'P';
  }
  // Two eyes in it.
  for (const [ex, ey] of [
    [1, -WH * 0.6],
    [-6, -WH * 0.4],
  ]) {
    const gx = Math.floor(ex / 2 + ox);
    const gy = Math.floor(ey / 2 + h);
    if (cells[gy]?.[gx] === 'V' && cells[gy][gx + 1] === 'V') {
      cells[gy][gx] = 'E';
      cells[gy][gx + 1] = 'E';
    }
  }
  return { grid: rows(cells), ox, oy: h };
}

const waves: Part[] = [];

/** A frame of the wave: its foot at (ox, oy). */
export function waveFrame(k: number): Part {
  waves[k] ??= buildWave(k);
  return waves[k];
}
export const WAVE_KEY: Paint = { V: SHADOW.void, D: SHADOW.deep, P: SHADOW.rim, E: SHADOW.eye };

/**
 * An orb of the dark, radius r art cells: a black ball with violet arcs
 * round it turned one of eight ways - or, gathering, a whole ring.
 */
function buildOrb(r: number, turn: number, whole: boolean): PixelSprite {
  const n = r * 2 + 3;
  const c = n / 2;
  const cells = blank(n, n);
  const a0 = (turn / 8) * Math.PI * 2;
  const inArc = (a: number, from: number, to: number): boolean => {
    const t = (((a - a0 - from) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return t <= to - from;
  };
  for (let gy = 0; gy < n; gy++) {
    for (let gx = 0; gx < n; gx++) {
      const dx = gx + 0.5 - c;
      const dy = gy + 0.5 - c;
      const d = Math.hypot(dx, dy);
      if (d > r + 0.5) continue;
      const a = Math.atan2(dy, dx);
      let t = 'V';
      if (d > r - 0.6 && (whole || inArc(a, 0.2, 2.2))) t = 'P';
      else if (!whole && r >= 3 && Math.abs(d - r * 0.55) < 0.55 && inArc(a, 3.2, 4.9)) t = 'Q';
      cells[gy][gx] = t;
    }
  }
  return new PixelSprite(rows(cells), { V: SHADOW.void, P: SHADOW.rim, Q: SHADOW.rimDim });
}

const orbs = new Map<string, PixelSprite>();

/** An orb: its middle at the middle of the sprite. */
export function orbSprite(r: number, turn: number, whole = false): PixelSprite {
  const k = `${r}|${turn}|${whole ? 1 : 0}`;
  let s = orbs.get(k);
  if (!s) {
    s = buildOrb(r, turn, whole);
    orbs.set(k, s);
  }
  return s;
}

/** The streak of the swipe: three arcs of claw-light round his shoulder, (SWIPE_C, SWIPE_C) its middle. */
export const SWIPE_C = 34;
let swipe: PixelSprite | null = null;

export function swipeSprite(): PixelSprite {
  if (!swipe) {
    const cells = blank(SWIPE_C * 2, SWIPE_C * 2);
    smear(cells, SWIPE_C, SWIPE_C, 27, -1.4, 1.0, 6, 'A', 'B');
    swipe = new PixelSprite(rows(cells), { A: WHITE, B: RAMP.slate[5] });
  }
  return swipe;
}

/* --------------------------------------------------------------- caches */

const bodies = new Map<string, PixelSprite>();
const heads = new Map<string, PixelSprite>();
const parts = new Map<string, Part>();

/** A body frame, made on first use. */
export function bodyPart(s: BodySpec): Part {
  const k = `${s.sx}|${s.sy}|${s.lean}|${s.k}|${s.veil}|${s.flesh ? 1 : 0}|${s.gone}`;
  let p = parts.get(k);
  if (!p) {
    p = buildBody(s);
    parts.set(k, p);
  }
  return p;
}

export function bodySprite(s: BodySpec, paint: PaintName): { sprite: PixelSprite; part: Part } {
  const part = bodyPart(s);
  const k = `${s.sx}|${s.sy}|${s.lean}|${s.k}|${s.veil}|${s.flesh ? 1 : 0}|${s.gone}|${paint}`;
  let sprite = bodies.get(k);
  if (!sprite) {
    sprite = new PixelSprite(part.grid, PAINTS[paint]);
    bodies.set(k, sprite);
  }
  return { sprite, part };
}

/** A head, made on first use: the root of the neck at (ox, oy). */
export function headSprite(step: number, len: number, mouth: number, flesh: boolean, paint: PaintName): { sprite: PixelSprite; part: Part } {
  const pk = `${step}|${len}|${mouth}|${flesh ? 1 : 0}`;
  let part = parts.get(`head|${pk}`);
  if (!part) {
    part = buildHead(step, len, mouth, flesh);
    parts.set(`head|${pk}`, part);
  }
  const k = `${pk}|${paint}`;
  let sprite = heads.get(k);
  if (!sprite) {
    sprite = new PixelSprite(part.grid, PAINTS[paint]);
    heads.set(k, sprite);
  }
  return { sprite, part };
}

/* ------------------------------------------------------------- ahead */

/**
 * What he is mostly seen as, made ahead of need a little at a time while he
 * sleeps and wakes, so that no frame of the fight stops to lay out a body:
 * the churn of his drifting, seeking, eating, swiping, lying blinded, rising
 * and slamming, and his head at the angles those hold it at.
 */
const ahead: (() => void)[] = [];
let planned = false;

function plan(): void {
  const poses: [number, number, number, Veil, boolean, PaintName[]][] = [
    [1, 1, 0, 'hang', false, ['smoke']],
    [1, 1, 0, 'floor', false, ['smoke']],
    [1, 1, 3.5, 'hang', false, ['smoke']],
    [1, 1, 7, 'floor', true, ['fleshEat', 'flesh']],
    [1, 1, 3.5, 'floor', true, ['flesh']],
    [1.25, 0.625, 0, 'floor', true, ['flesh']],
    [0.875, 1.125, 0, 'pulled', false, ['smoke']],
    [1.25, 0.75, 0, 'floor', false, ['smoke']],
  ];
  for (const [sx, sy, lean, veil, flesh, paints] of poses) {
    for (let k = 0; k < CHURN; k++) for (const paint of paints) ahead.push(() => void bodySprite({ sx, sy, lean, k, veil, flesh, gone: 0 }, paint));
  }
  for (const step of [1, 0, 2, 15, 3]) for (const mouth of [5, 9, 13]) ahead.push(() => void headSprite(step, HEAD_LENS[1], mouth, false, 'smoke'));
  for (const step of [5, 4, 3]) for (const mouth of [13, 17]) ahead.push(() => void headSprite(step, HEAD_LENS[0], mouth, true, 'fleshEat'));
  for (const step of [2, 3]) for (const mouth of [9, 13]) ahead.push(() => void headSprite(step, HEAD_LENS[1], mouth, true, 'flesh'));
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

/** For previews. */
export function previewKey(paint: PaintName): Record<string, string> {
  return { ...PAINTS[paint] };
}
export function previewBody(s: BodySpec): Grid {
  return buildBody(s).grid;
}
export function previewHead(step: number, len: number, mouth: number, flesh: boolean): Grid {
  return buildHead(step, len, mouth, flesh).grid;
}
