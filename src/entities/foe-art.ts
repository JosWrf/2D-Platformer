import { zoneAt } from '../render/palette';
import { Sheet, blank, compose, flipX, plot, rows, smear, turnCW, type Grid } from '../render/sheet';

/**
 * The roster's art: the slime, the bat, the skeleton, the mage, Zunder, the
 * Schildwache and the Klingenläufer, each as hand-placed frames of art pixels
 * (see render/sheet.ts) - a squash is a frame with the slime drawn squashed, a
 * wing beat is four frames of wings, a wind-up is a drawn pose - and each in
 * a colour of its own in every part of the road it turns up in.
 *
 * Frames face right; the sheet mirrors them about the figure's spine. No outer
 * outline is drawn here: the actor layer puts one round every body.
 */

/** The part of the road a monster lives in, for the colours it wears. */
export type FoeZone = 'forest' | 'ruins' | 'caverns' | 'drowned' | 'castle' | 'rift';

export function foeZone(x: number): FoeZone {
  switch (zoneAt(x).name) {
    case 'forest':
      return 'forest';
    case 'ruins':
      return 'ruins';
    case 'caverns':
      return 'caverns';
    case 'drowned':
      return 'drowned';
    case 'castle':
    case 'throne':
      return 'castle';
    default:
      return 'rift';
  }
}

/** The forest is every sheet's own key; the other zones are swaps of it. */
export function paletteFor(zone: FoeZone): string {
  return zone === 'forest' ? '' : zone;
}

/** One colour of a sheet's key in one of its palettes: a monster's glow is its own colour. */
export function keyColor(sheet: Sheet<string>, palette: string, letter: string): string {
  return (palette && sheet.palettes[palette]?.[letter]) || sheet.key[letter] || '#ffffff';
}

const homes = new WeakMap<object, FoeZone>();

/**
 * Where a monster belongs, by where it was first placed - worked out once.
 * A skeleton Morvain calls up wears the throne room's colours, a bat of
 * Vesperon's swarm the castle's.
 */
export function homeZone(monster: { readonly homeX: number }): FoeZone {
  let zone = homes.get(monster);
  if (!zone) {
    zone = foeZone(monster.homeX);
    homes.set(monster, zone);
  }
  return zone;
}

/* ------------------------------------------------------------------ slime */

/**
 * A slime of w×h art pixels: a dome that sags a little at the foot, lit from
 * the upper left - a rim of light along its top, a gloss spot, the dark of the
 * jelly pooling at the bottom - and two eyes towards the way it faces. Made
 * for every squash and stretch of the hop rather than scaled into them.
 */
function slimeBody(w: number, h: number, eyes = true): string[] {
  const cells = blank(w, h);
  const left: number[] = [];
  const right: number[] = [];
  for (let y = 0; y < h; y++) {
    const v = (h - y - 0.5) / h;
    const hw =
      v <= 0.24 ? (w / 2) * (0.86 + 0.58 * v) : (w / 2) * Math.sqrt(Math.max(0, 1 - ((v - 0.24) / 0.8) ** 2));
    const l = Math.round(w / 2 - hw);
    const r = Math.round(w / 2 + hw) - 1;
    left.push(l);
    right.push(r);
  }
  const inside = (x: number, y: number): boolean => y >= 0 && y < h && x >= left[y] && x <= right[y];
  for (let y = 0; y < h; y++) {
    for (let x = left[y]; x <= right[y]; x++) {
      const v = (h - y - 0.5) / h;
      const u = (x + 0.5) / w;
      let c: string;
      if (y === h - 1) c = '0';
      else if (y === h - 2 || x === right[y]) c = '1';
      else {
        const b = 0.7 * v + 0.45 * (1 - u) - 0.1;
        c = b > 0.62 ? '3' : b > 0.32 ? '2' : '1';
      }
      // The rim of light along the top and the upper left edge.
      if (!inside(x, y - 1) && y < h - 2 && u < 0.78) c = '4';
      if (x === left[y] && v > 0.45 && y < h - 2) c = '3';
      plot(cells, x, y, c);
    }
  }
  // The gloss: two pixels and one under, up and to the left.
  const gy = Math.max(1, Math.round(h * 0.22));
  const gx = Math.max(left[gy] + 1, Math.round(w * 0.26));
  plot(cells, gx, gy, '5');
  plot(cells, gx + 1, gy, '5');
  plot(cells, gx, gy + 1, '4');
  if (eyes) {
    const ey = Math.round(h * 0.42);
    const ex = Math.floor(w / 2) + 1;
    for (const x of [ex, ex + 2 + (w >= 14 ? 1 : 0)]) {
      plot(cells, x, ey, 'e');
      plot(cells, x, ey + 1, 'e');
    }
  }
  return rows(cells);
}

export type SlimeFrame = 'idle0' | 'idle1' | 'crouch' | 'rise' | 'fall' | 'land';

/** Every slime frame stands on its bottom edge, centred on the same column. */
export const SLIME_W = 18;
export const SLIME_H = 14;

function slimeOnFloor(w: number, h: number): string[] {
  const body = slimeBody(w, h);
  return compose(SLIME_W, SLIME_H, [[body, Math.floor((SLIME_W - w) / 2), SLIME_H - h]]);
}

export const SLIME = new Sheet<SlimeFrame>(
  {
    idle0: slimeOnFloor(14, 11),
    idle1: slimeOnFloor(15, 10),
    crouch: slimeOnFloor(16, 8),
    rise: slimeOnFloor(11, 14),
    fall: slimeOnFloor(12, 12),
    land: slimeOnFloor(17, 7),
  },
  {
    '0': '#134c4c',
    '1': '#1e6f50',
    '2': '#33984b',
    '3': '#5ac54f',
    '4': '#99e65f',
    '5': '#d3fc7e',
    e: '#0c2e44',
  },
  {
    ruins: { '0': '#3b1443', '1': '#622461', '2': '#93388f', '3': '#ca52c9', '4': '#f389f5', '5': '#fdd2ed', e: '#1c121c' },
    caverns: { '0': '#8e251d', '1': '#c64524', '2': '#e07438', '3': '#ffa214', '4': '#ffc825', '5': '#ffeb57', e: '#391f21' },
    drowned: { '0': '#571c27', '1': '#891e2b', '2': '#c42430', '3': '#ea323c', '4': '#f5555d', '5': '#f68187', e: '#1c121c' },
    castle: { '0': '#0c2e44', '1': '#134c4c', '2': '#1e6f50', '3': '#33984b', '4': '#5ac54f', '5': '#99e65f', e: '#0c2e44' },
    rift: { '0': '#0c2e44', '1': '#134c4c', '2': '#1e6f50', '3': '#33984b', '4': '#5ac54f', '5': '#94fdff', e: '#03193f' },
  },
);

/* -------------------------------------------------------------------- bat */

/*
 * The bat: a round body with two ears and its eyes, and wings in four beats.
 * Before it dives it pulls up - wings flung up and wide, mouth open on its
 * fangs, eyes burning white-hot - which has to read across a dark room in
 * half a second, so it is a different silhouette, not a different colour.
 */

const BAT_BODY: Grid = ['.c...c.', '.dc.cd.', 'cfddddc', 'cdededc', 'cddkddc', '.cdddc.', '..c.c..'];

/** Pulling up to dive: eyes white-hot, mouth open on two fangs. */
const BAT_BODY_TELL: Grid = [
  'c.....c',
  'dc...cd',
  'cfddddc',
  'cEEdEEc',
  'cdwkwdc',
  '.ckkkc.',
  '..c.c..',
];

/**
 * Left wings, the shoulder at the right edge: a light arm bone along the
 * leading edge and three fingers spreading the membrane, its trailing edge
 * scalloped between them.
 */
const WING_UP: Grid = [
  'g.......',
  'gg......',
  '.gbg....',
  '.gbbg...',
  '..bbbgg.',
  '..abbbbg',
  '...a.abb',
];

const WING_MID: Grid = [
  '........',
  '........',
  '....gggg',
  '.gggbbbb',
  'gbbbbbbb',
  '.ab.abbb',
  '.....a.a',
];

const WING_DOWN: Grid = [
  '........',
  '........',
  '......gg',
  '....ggbb',
  '..ggbbbb',
  '.gbbbbab',
  'gbbab...',
  'ga......',
];

/** Flung up and out, wider than any beat: the pull-up before a dive. */
const WING_SPREAD: Grid = [
  'g........',
  'gg.......',
  'gbg......',
  '.gbg.....',
  '.gbbg....',
  '..bbbgg..',
  '..abbbbgg',
  '...ab.abb',
  '......a..',
];

const WING_TUCK: Grid = [
  '........',
  '........',
  '........',
  '.....ggg',
  '...ggbbb',
  '....aabb',
  '......aa',
];

export type BatFrame = 'fly0' | 'fly1' | 'fly2' | 'fly3' | 'tell0' | 'tell1' | 'dive';

export const BAT_W = 23;
export const BAT_H = 14;

function batFrame(wing: Grid, body: Grid, wingY: number, bodyY: number): string[] {
  const ww = wing[0].length;
  return compose(BAT_W, BAT_H, [
    [wing, 8 - ww + 1, wingY],
    [flipX(wing), 14, wingY],
    [body, 8, bodyY],
  ]);
}

export const BAT = new Sheet<BatFrame>(
  {
    fly0: batFrame(WING_UP, BAT_BODY, 1, 5),
    fly1: batFrame(WING_MID, BAT_BODY, 1, 5),
    fly2: batFrame(WING_DOWN, BAT_BODY, 1, 5),
    fly3: batFrame(WING_MID, BAT_BODY, 2, 6),
    tell0: batFrame(WING_SPREAD, BAT_BODY_TELL, 0, 4),
    tell1: batFrame(WING_SPREAD, BAT_BODY_TELL, 1, 5),
    dive: batFrame(WING_TUCK, BAT_BODY, 1, 5),
  },
  {
    a: '#622461',
    b: '#93388f',
    g: '#f389f5',
    c: '#93388f',
    d: '#ca52c9',
    f: '#f389f5',
    e: '#f5555d',
    E: '#fdd2ed',
    k: '#1c121c',
    w: '#ffffff',
  },
  {
    ruins: { a: '#5d2c28', b: '#8a4836', g: '#e69c69', c: '#8a4836', d: '#bf6f4a', f: '#e69c69', e: '#ffc825' },
    caverns: { a: '#622461', b: '#93388f', g: '#fdd2ed', c: '#93388f', d: '#ca52c9', f: '#fdd2ed', e: '#ffeb57' },
    drowned: { a: '#93388f', b: '#ca52c9', g: '#fdd2ed', c: '#ca52c9', d: '#f389f5', f: '#fdd2ed', e: '#ffa214' },
    castle: { a: '#2a2f4e', b: '#424c6e', g: '#c7cfdd', c: '#657392', d: '#92a1b9', f: '#c7cfdd', e: '#ffc825' },
    rift: { a: '#134c4c', b: '#1e6f50', g: '#99e65f', c: '#1e6f50', d: '#5ac54f', f: '#99e65f', e: '#ffc825' },
  },
);

/* --------------------------------------------------------------- skeleton */

/*
 * The skeleton: cold bone under a tattered cape, a rusty sword held out
 * towards the hero. Its tell is the wind-up - the sword straight up over its
 * skull and its eyes gone from a coal-red point to a full yellow glare - and
 * its cut is one frame with the smear of the blade in it.
 */

const SK_SKULL: Grid = ['.aaaaa.', 'awaaaab', 'akkakkb', 'akeakeb', 'baakaab', '.bcbcb.'];
const SK_SKULL_GLARE: Grid = ['.aaaaa.', 'awaaaab', 'aEEaEEb', 'aEEaEEb', 'baakaab', '.bcbcb.'];

const SK_TORSO: Grid = ['.aaaaaaa.', '.abkakbc.', '..aaaab..', '..bkakb..', '...aab...', '....b....', '..baaac..'];

const SK_LEGS_STAND: Grid = ['..a...a..', '..a...a..', '..b...b..', '..c...c..', '..a...a..', '..a...a..', '..aa..aa.'];
const SK_LEGS_STRIDE: Grid = ['...a.a...', '..a...a..', '..b...b..', '.c.....c.', '.a.....a.', 'a.......a', 'aa......aa'];
const SK_LEGS_PASS: Grid = ['...a.a...', '...a.a...', '...b..b..', '...c..c..', '...a.a...', '...a.a...', '..aa.aa..'];

/** The cape hangs from the shoulders behind it, in two states of flutter. */
const SK_CAPE_A: Grid = ['.rpp', 'rppq', 'pppq', 'ppqq', 'pqq.', 'pq.q', 'q..q', 'q...'];
const SK_CAPE_B: Grid = ['.rpp', 'rppq', 'pppq', 'ppqq', 'ppq.', 'qpq.', '.q.q', '..q.'];

const SK_BACK_ARM: Grid = ['c', 'c', 'b', 'c'];

/**
 * Its sword is a real one: a blade two pixels deep - lit along its back, a
 * shade darker along its edge, a fleck of rust - ten long, behind a crossguard
 * that stands out above and below it. Held out at the hero, a hair above level.
 */
const SK_ARM_OUT: Grid = ['b...g...........', '.bhhgssssssssss.', '....gttuttttttt.', '....g...........'];
/** Sword up over the skull: the wind-up. */
const SK_ARM_UP: Grid = [
  '..s..',
  '..st.',
  '..st.',
  '..st.',
  '..st.',
  '..ut.',
  '..st.',
  '..st.',
  '..st.',
  '..st.',
  '.gggg',
  '..h..',
  '.bh..',
  'b....',
];
/** Sword down and forward, at the end of the cut. */
const SK_ARM_CUT: Grid = [
  'b...........',
  '.bh.........',
  '.ggss.......',
  '..gttss.....',
  '....uttss...',
  '......ttsss.',
  '........ttt.',
];
/** Sword lowered, the tip near the floor: the breath after the cut. */
const SK_ARM_LOW: Grid = [
  'b......',
  '.b.....',
  '..h....',
  '.ggg...',
  '..st...',
  '..st...',
  '...st..',
  '...ut..',
  '....st.',
  '....st.',
  '.....s.',
];

export type SkeletonFrame = 'stand' | 'walk0' | 'walk1' | 'walk2' | 'walk3' | 'windup0' | 'windup1' | 'cut' | 'low';

export const SKELETON_W = 30;
export const SKELETON_H = 30;
/** The spine's column in every skeleton frame. */
export const SKELETON_SPINE = 9;

function skeleton(legs: Grid, cape: Grid, arm: Grid, armX: number, armY: number, skull: Grid, bob = 0, extra: (cells: string[][]) => void = () => {}): string[] {
  const base = compose(SKELETON_W, SKELETON_H, [
    [cape, 3, 16 + bob],
    [SK_BACK_ARM, 5, 17 + bob],
    [legs, 5, 23],
    [SK_TORSO, 5, 16 + bob],
    [skull, 6, 10 + bob],
    [arm, armX, armY + bob],
  ]);
  const cells = base.map((r) => r.split(''));
  extra(cells);
  return rows(cells);
}

export const SKELETON = new Sheet<SkeletonFrame>(
  {
    stand: skeleton(SK_LEGS_STAND, SK_CAPE_A, SK_ARM_OUT, 13, 16, SK_SKULL),
    walk0: skeleton(SK_LEGS_STRIDE, SK_CAPE_A, SK_ARM_OUT, 13, 16, SK_SKULL),
    walk1: skeleton(SK_LEGS_PASS, SK_CAPE_B, SK_ARM_OUT, 13, 16, SK_SKULL, -1),
    walk2: skeleton(flipX(SK_LEGS_STRIDE), SK_CAPE_A, SK_ARM_OUT, 13, 16, SK_SKULL),
    walk3: skeleton(flipX(SK_LEGS_PASS), SK_CAPE_B, SK_ARM_OUT, 13, 16, SK_SKULL, -1),
    windup0: skeleton(SK_LEGS_STAND, SK_CAPE_B, SK_ARM_UP, 11, 2, SK_SKULL_GLARE),
    windup1: skeleton(SK_LEGS_STAND, SK_CAPE_A, SK_ARM_UP, 11, 1, SK_SKULL_GLARE),
    cut: skeleton(SK_LEGS_STRIDE, SK_CAPE_B, SK_ARM_CUT, 13, 16, SK_SKULL, 0, (cells) =>
      smear(cells, 13, 20, 11, -1.75, 0.55, 3.2, 'x', 'y'),
    ),
    low: skeleton(SK_LEGS_STAND, SK_CAPE_A, SK_ARM_LOW, 13, 16, SK_SKULL, 1),
  },
  {
    w: '#ffffff',
    a: '#c7cfdd',
    b: '#92a1b9',
    c: '#657392',
    k: '#1a1932',
    e: '#ff5000',
    E: '#ffeb57',
    p: '#3b1443',
    q: '#1c121c',
    r: '#622461',
    s: '#c7cfdd',
    t: '#92a1b9',
    u: '#8a4836',
    h: '#5d2c28',
    g: '#edab50',
    x: '#ffffff',
    y: '#92a1b9',
  },
  {
    ruins: { p: '#5d2c28', q: '#391f21', r: '#8a4836' },
    caverns: { p: '#622461', q: '#3b1443', r: '#93388f' },
    drowned: { p: '#5d2c28', q: '#391f21', r: '#8a4836' },
    castle: { p: '#2a2f4e', q: '#1a1932', r: '#424c6e' },
    rift: { p: '#1e6f50', q: '#134c4c', r: '#33984b' },
  },
);

/* ------------------------------------------------------------------- mage */

/*
 * The dark mage: a hooded robe with two eyes in the dark of the hood, a staff
 * with an orb. It floats. Its tell is the cast - the orb swells and flares
 * into a cross of white light, and the eyes in the hood go white with it.
 */

/**
 * The figure, whole: a hood with its peak bent back and its dark open towards
 * the hero, two eyes in there; a mantle over broad shoulders; the far sleeve
 * hanging at its back, the near one reaching out to the staff, the hand pale
 * round it; the robe flaring to a ragged hem that it floats on. Lit from the
 * upper left, a step lighter than the dark it stands in.
 */
const MG_FIGURE_A: Grid = [
  '..qp...............',
  '...pmp.............',
  '....pnp............',
  '....pnmp...........',
  '...pnlnmp..........',
  '...pnlnnmp.........',
  '..pnlnnnnkk........',
  '..pnlnnnkkkk.......',
  '..pnnnnkkekek......',
  '..pnnnnkkkkkk......',
  '..pmnnnnkkkp.......',
  '.pmnlnnnnnmmp......',
  'pnlllnnnnnnmmp.....',
  'pnlnnnnnnnnmnnnss..',
  'pnnpnnnnnnmmmmmss..',
  'pnnppnnnnnmpmmp....',
  'pnnppnnnnnmmpp.....',
  'pmn.pnnnnnmmmp.....',
  'pmn.pnnnnnmmmmp....',
  '.pm.pnnnnnnmmmp....',
  '.pp.pmnnnnnmmmp....',
  '...pmmnnnnnmmmmp...',
  '...pmmnnnnnmmmmp...',
  '..pmmmmnnnmmmmmmp..',
  '..ppmm.pmmm.pmmpq..',
  '...qp...pm...pq....',
];

/** The hem in its other flutter. */
const MG_FIGURE_B: Grid = [
  '..qp...............',
  '...pmp.............',
  '....pnp............',
  '....pnmp...........',
  '...pnlnmp..........',
  '...pnlnnmp.........',
  '..pnlnnnnkk........',
  '..pnlnnnkkkk.......',
  '..pnnnnkkekek......',
  '..pnnnnkkkkkk......',
  '..pmnnnnkkkp.......',
  '.pmnlnnnnnmmp......',
  'pnlllnnnnnnmmp.....',
  'pnlnnnnnnnnmnnnss..',
  'pnnpnnnnnnmmmmmss..',
  'pnnppnnnnnmpmmp....',
  'pnnppnnnnnmmpp.....',
  'pmn.pnnnnnmmmp.....',
  'pmn.pnnnnnmmmmp....',
  '.pm.pnnnnnnmmmp....',
  '.pp.pmnnnnnmmmp....',
  '...pmmnnnnnmmmmp...',
  '...pmmnnnnnmmmmp...',
  '..pmmmmnnnmmmmmmp..',
  '..pmmp.pmmm.ppmpq..',
  '...q...pm..q...q...',
];

/** The cast: the eyes in the hood gone white. */
function glare(figure: Grid): Grid {
  return figure.map((r) => r.replace(/e/g, 'E'));
}

const MG_STAFF: Grid = ['h', 'j', 'h', 'h', 'h', 'h', 'j', 'h', 'h', 'h', 'h', 'h', 'j', 'h', 'h', 'h', 'h', 'h', 'h'];

const MG_ORB: Grid = ['.OOo.', 'OWOov', 'OOoov', 'ooovv', '.ovv.'];
const MG_ORB_CAST: Grid = ['...X...', '..OWOo.', '.OWWWov', 'XWWXWWX', '.OWWWov', '..ooov.', '...X...'];
const MG_ORB_FLARE: Grid = ['...X...', '...W...', '.OWWWo.', 'XWWXWWX', '.OWWWo.', '...o...', '...X...'];

export type MageFrame = 'idle0' | 'idle1' | 'cast0' | 'cast1';

export const MAGE_W = 19;
export const MAGE_H = 26;
export const MAGE_SPINE = 7;

function mage(figure: Grid, orb: Grid, orbX: number, orbY: number): string[] {
  return compose(MAGE_W, MAGE_H, [
    [MG_STAFF, 14, 6],
    [figure, 0, 0],
    [orb, orbX, orbY],
  ]);
}

export const MAGE = new Sheet<MageFrame>(
  {
    idle0: mage(MG_FIGURE_A, MG_ORB, 12, 1),
    idle1: mage(MG_FIGURE_B, MG_ORB, 12, 1),
    cast0: mage(glare(MG_FIGURE_A), MG_ORB_CAST, 11, 0),
    cast1: mage(glare(MG_FIGURE_B), MG_ORB_FLARE, 11, 0),
  },
  {
    q: '#3b1443',
    p: '#622461',
    m: '#93388f',
    n: '#ca52c9',
    l: '#f389f5',
    k: '#0e071b',
    e: '#f389f5',
    E: '#ffffff',
    s: '#c7cfdd',
    h: '#5d2c28',
    j: '#8a4836',
    O: '#f389f5',
    W: '#fdd2ed',
    o: '#db3ffd',
    v: '#7a09fa',
    X: '#ffffff',
  },
  {
    ruins: { q: '#391f21', p: '#5d2c28', m: '#8a4836', n: '#bf6f4a', l: '#e69c69', e: '#ffc825', O: '#ffc825', W: '#ffeb57', o: '#ffa214', v: '#ed7614' },
    caverns: { e: '#ffc825', O: '#ffc825', W: '#ffeb57', o: '#ffa214', v: '#ed7614' },
    drowned: { e: '#d3fc7e', O: '#99e65f', W: '#d3fc7e', o: '#5ac54f', v: '#33984b' },
    castle: { q: '#1a1932', p: '#2a2f4e', m: '#424c6e', n: '#657392', l: '#92a1b9', e: '#94fdff', O: '#94fdff', W: '#ffffff', o: '#0cf1ff', v: '#0098dc' },
    rift: { q: '#0c2e44', p: '#134c4c', m: '#1e6f50', n: '#33984b', l: '#5ac54f', e: '#d3fc7e', O: '#99e65f', W: '#d3fc7e', o: '#5ac54f', v: '#33984b' },
  },
);

/* ------------------------------------------------------------------ Zunder */

/*
 * Zunder: a taut round sac on two stubby legs, stitched shut, a short wick on
 * top. Lit, it swells in four drawn steps - a pixel rounder each time - its
 * seams split open on the fire inside, the wick spits and its eyes go wide.
 */

export const ZUNDER_W = 18;
export const ZUNDER_H = 19;

function zunder(stage: number, lit: boolean, step: 0 | 1 | 2): string[] {
  const cells = blank(ZUNDER_W, ZUNDER_H);
  const cx = 9;
  const w = 10 + stage;
  const h = 9 + stage;
  const bottom = 15 - (step === 1 ? 1 : 0);
  const top = bottom - h;
  const ox = cx - w / 2;
  const tone = lit ? ['5', '6', '7', '8'] : ['0', '1', '2', '3'];
  for (let y = top; y < bottom; y++) {
    for (let x = Math.floor(ox); x < Math.ceil(ox + w); x++) {
      const nx = (x + 0.5 - cx) / (w / 2);
      const ny = (y + 0.5 - (top + h / 2)) / (h / 2);
      if (nx * nx + ny * ny > 1) continue;
      // Lit from the upper left.
      const light = -0.55 * nx - 0.75 * ny;
      const c = light > 0.62 ? tone[3] : light > 0.15 ? tone[2] : light > -0.45 ? tone[1] : tone[0];
      plot(cells, x, y, c);
    }
  }
  // Two seams running round it, from crown to foot.
  const seam = lit ? (stage >= 3 ? 'Y' : 'Z') : 'z';
  for (const side of [-1, 1]) {
    for (let y = top + 1; y < bottom - 1; y++) {
      const ny = (y + 0.5 - (top + h / 2)) / (h / 2);
      const x = Math.round(cx - 0.5 + side * (w / 2) * 0.45 * Math.sqrt(Math.max(0, 1 - ny * ny)));
      plot(cells, x, y, seam);
    }
  }
  // Eyes towards the front, wide once it is lit.
  const ey = top + Math.round(h * 0.38);
  if (lit) {
    for (const x of [cx + 1, cx + 3]) {
      plot(cells, x, ey, 'E');
      plot(cells, x, ey + 1, 'E');
    }
  } else {
    plot(cells, cx + 1, ey + 1, 'e');
    plot(cells, cx + 3, ey + 1, 'e');
  }
  // The wick with an ember at its end, and its spark once lit.
  plot(cells, cx - 1, top - 1, 'w');
  plot(cells, cx - 2, top - 2, lit ? 'w' : 'r');
  if (lit) {
    plot(cells, cx - 3, top - 3, 'F');
    if (stage % 2 === 1) plot(cells, cx - 3, top - 4, 'Y');
  }
  // Legs: stubs from the body down to the floor, one lifted while it steps.
  for (const [x, first] of [
    [cx - 3, true],
    [cx + 2, false],
  ] as const) {
    const foot = ZUNDER_FEET - 1 - (step !== 0 && (step === 1) === first ? 1 : 0);
    for (let y = bottom; y < foot; y++) {
      plot(cells, x, y, 'l');
      plot(cells, x + 1, y, 'l');
    }
    plot(cells, x, foot, 'L');
    plot(cells, x + 1, foot, 'L');
    plot(cells, x + 2, foot, 'L');
  }
  return rows(cells);
}

/** The row under Zunder's feet: where it stands. */
export const ZUNDER_FEET = 17;

export type ZunderFrame = 'stand' | 'walk0' | 'walk1' | 'fuse0' | 'fuse1' | 'fuse2' | 'fuse3';

export const ZUNDER = new Sheet<ZunderFrame>(
  {
    stand: zunder(0, false, 0),
    walk0: zunder(0, false, 1),
    walk1: zunder(0, false, 2),
    fuse0: zunder(0, true, 0),
    fuse1: zunder(1, true, 0),
    fuse2: zunder(2, true, 0),
    fuse3: zunder(3, true, 0),
  },
  {
    '0': '#5d2c28',
    '1': '#8a4836',
    '2': '#bf6f4a',
    '3': '#e69c69',
    '5': '#8e251d',
    '6': '#c64524',
    '7': '#e07438',
    '8': '#edab50',
    z: '#1c121c',
    Z: '#ffa214',
    Y: '#ffeb57',
    e: '#f6ca9f',
    E: '#ffffff',
    w: '#c7cfdd',
    r: '#e07438',
    F: '#ffc825',
    l: '#391f21',
    L: '#1c121c',
  },
  {
    drowned: { '0': '#891e2b', '1': '#c42430', '2': '#ea323c', '3': '#f5555d' },
    castle: { '0': '#134c4c', '1': '#1e6f50', '2': '#33984b', '3': '#5ac54f' },
  },
);

/* ------------------------------------------------------------ Schildwache */

/*
 * The Schildwache: an armoured guard behind a tower shield, a spear laid over
 * its rim. The shield stands in front and catches the light on its leading
 * edge - from the front it is a wall with an eye slit above it. Parried, the
 * shield goes down on the floor and the slit turns from cold blue to orange:
 * open.
 */

const SW_HELM: Grid = ['.cccc..', 'cbabbc.', 'cbbbbbc', 'cbbVVVc', '.cbbbc.'];
const SW_HELM_OPEN: Grid = ['.cccc..', 'cbabbc.', 'cbbbbbc', 'cbbXXXc', '.cbbbc.'];
const SW_BODY: Grid = ['.cbbbbc..', 'cbaabbbc.', 'cbabbbbcc', 'cbbbbbbcc', 'cbbbbbbc.', '.cbbbbc..', '.ccggcc..', '.cbccbc..'];
const SW_LEGS_STAND: Grid = ['.cb..bc', '.cb..bc', '.bb..bb', '.cb..bc', '.cb..bc', 'ccb..bcc'];
const SW_LEGS_STEP: Grid = ['.cb..bc', 'cb....bc', 'bb....bb', 'cb.....bc', 'cb.....bc', 'ccb.....bcc'];
const SW_LEGS_BRACE: Grid = ['.cb..bc', '.cb...bc', 'cb.....bc', 'cb......bc', 'cb......bc', 'ccb.....bcc'];

const SW_SHIELD: Grid = [
  '.RRH.',
  'RSSTH',
  'RSSTH',
  'RSSTH',
  'RSBBH',
  'RSBBH',
  'RSSTH',
  'RSSTH',
  'RSSTH',
  'RSSTH',
  'RSSTH',
  '.RSH.',
  '..R..',
];

/** The shield laid down on its side, on the floor. */
const SW_SHIELD_DOWN: Grid = turnCW(SW_SHIELD);

/** The spear: shaft and head, laid out flat, the head to the right. */
const SW_SPEAR: Grid = ['..........P.', 'hhhhhhhhhhPP', '..........P.'];

export type ShieldFrame = 'stand' | 'walk0' | 'walk1' | 'wind' | 'thrust' | 'open';

export const SHIELD_W = 34;
export const SHIELD_H = 20;
export const SHIELD_SPINE = 8;

function schildwache(legs: Grid, helm: Grid, spearX: number, lean: number, open = false): string[] {
  const parts: (readonly [Grid, number, number])[] = [];
  if (open) parts.push([SW_SHIELD_DOWN, 12, 15]);
  parts.push([legs, 5, 14], [SW_BODY, 4 + lean, 6], [helm, 5 + lean, 1]);
  if (open) {
    parts.push([SW_SPEAR, 4 + spearX, 10]);
  } else {
    parts.push([SW_SPEAR, 4 + spearX, 6], [SW_SHIELD, 12 + lean, 4]);
  }
  return compose(SHIELD_W, SHIELD_H, parts);
}

export const SCHILDWACHE = new Sheet<ShieldFrame>(
  {
    stand: schildwache(SW_LEGS_STAND, SW_HELM, 2, 0),
    walk0: schildwache(SW_LEGS_STEP, SW_HELM, 2, 0),
    walk1: schildwache(SW_LEGS_STAND, SW_HELM, 2, 0),
    wind: schildwache(SW_LEGS_BRACE, SW_HELM, -2, -1),
    thrust: schildwache(SW_LEGS_BRACE, SW_HELM, 10, 1),
    open: schildwache(SW_LEGS_STAND, SW_HELM_OPEN, 0, 0, true),
  },
  {
    a: '#92a1b9',
    b: '#424c6e',
    c: '#2a2f4e',
    g: '#edab50',
    V: '#0cf1ff',
    X: '#ffa214',
    R: '#424c6e',
    S: '#657392',
    T: '#92a1b9',
    H: '#c7cfdd',
    B: '#c7cfdd',
    h: '#8a4836',
    P: '#c7cfdd',
  },
  {
    ruins: { a: '#e69c69', b: '#8a4836', c: '#5d2c28', g: '#ffc825', R: '#5d2c28', S: '#8a4836', T: '#bf6f4a', H: '#f6ca9f', B: '#ffc825' },
    caverns: { a: '#e69c69', b: '#8a4836', c: '#5d2c28', g: '#ffc825', R: '#5d2c28', S: '#8a4836', T: '#bf6f4a', H: '#f6ca9f', B: '#ffc825' },
    drowned: { a: '#e69c69', b: '#8a4836', c: '#5d2c28', g: '#ffc825', R: '#5d2c28', S: '#8a4836', T: '#bf6f4a', H: '#f6ca9f', B: '#ffc825' },
    castle: { g: '#ffc825', S: '#424c6e', T: '#657392', R: '#2a2f4e', B: '#ffc825' },
    rift: { a: '#e69c69', b: '#8a4836', c: '#5d2c28', g: '#ffc825', R: '#5d2c28', S: '#8a4836', T: '#bf6f4a', H: '#f6ca9f', B: '#ffc825' },
  },
);

/* ---------------------------------------------------------- Klingenläufer */

/*
 * The Klingenläufer: a low, heavy runner under a ridge of plates, a blade of
 * steel for a brow. It digs in before it runs - head down, haunches up, the
 * eye slit flung wide and yellow - and runs flat out with its legs stretched.
 * Dazed against a wall it sags, its eye dull, stars over its head.
 */

const KL_BODY: Grid = [
  '.....d.d.d.....',
  '...dcdcdcdcd...',
  '..dcbbbbbbbcd..',
  '.dcbaabbbbbbcdd',
  'dcbaabbbbbbbccd',
  'dcbbbbbbbbbbccd',
  'dcbbbbbbbbbbccd',
  '.dccbbbbbbbcccd',
  '..dcccccccccdd.',
];

/** The brow blade with the eye under it, one per mood. */
function klHead(eye: string, eye2: string): Grid {
  return ['.PPH..', 'PPPHH.', 'kPPPHH', `k${eye}${eye2}PPH`, 'kkkPP.', '.kk...'];
}

const KL_LEGS_A: Grid = ['.ll...ll..ll...ll', '.LL...LL..LL...LL'];
const KL_LEGS_B: Grid = ['..ll..ll...ll..ll', '..LL...LL..LL...LL'];
const KL_LEGS_DIG: Grid = ['ll.....ll.ll.....ll', 'LL.....LL.LL.....LL'];
const KL_LEGS_RUN: Grid = ['.ll......ll.....', 'll........ll....', 'L..........LL...'];

export type ChargerFrame = 'walk0' | 'walk1' | 'wind0' | 'wind1' | 'run0' | 'run1' | 'dazed';

export const CHARGER_W = 26;
export const CHARGER_H = 15;
export const CHARGER_SPINE = 11;
/** The row under its feet. */
export const CHARGER_FEET = 14;

function klingenlaeufer(legs: Grid, legsX: number, legsY: number, bodyY: number, head: Grid, headX: number, headY: number): string[] {
  return compose(CHARGER_W, CHARGER_H, [
    [legs, legsX, legsY],
    [KL_BODY, 3, bodyY],
    [head, headX, headY],
  ]);
}

export const KLINGENLAEUFER = new Sheet<ChargerFrame>(
  {
    walk0: klingenlaeufer(KL_LEGS_A, 3, 12, 4, klHead('e', 'e'), 15, 6),
    walk1: klingenlaeufer(KL_LEGS_B, 3, 12, 3, klHead('e', 'e'), 15, 5),
    wind0: klingenlaeufer(KL_LEGS_DIG, 1, 12, 5, klHead('Y', 'Y'), 15, 8),
    wind1: klingenlaeufer(KL_LEGS_DIG, 1, 12, 6, klHead('Y', 'Y'), 15, 8),
    run0: klingenlaeufer(KL_LEGS_RUN, 3, 11, 3, klHead('Y', 'e'), 16, 6),
    run1: klingenlaeufer(KL_LEGS_A, 3, 12, 4, klHead('Y', 'e'), 16, 6),
    dazed: klingenlaeufer(KL_LEGS_A, 3, 12, 4, klHead('D', 'k'), 15, 8),
  },
  {
    a: '#e69c69',
    b: '#8a4836',
    c: '#5d2c28',
    d: '#391f21',
    k: '#1c121c',
    l: '#391f21',
    L: '#1c121c',
    P: '#92a1b9',
    H: '#ffffff',
    e: '#e07438',
    Y: '#ffeb57',
    D: '#f6ca9f',
  },
  {
    ruins: { a: '#f5555d', b: '#c42430', c: '#891e2b', d: '#571c27' },
    caverns: { a: '#e69c69', b: '#8a4836', c: '#5d2c28', d: '#391f21' },
    drowned: { a: '#f5555d', b: '#c42430', c: '#891e2b', d: '#571c27' },
    castle: { a: '#c7cfdd', b: '#657392', c: '#424c6e', d: '#2a2f4e' },
    rift: { a: '#e69c69', b: '#8a4836', c: '#5d2c28', d: '#391f21' },
  },
);
