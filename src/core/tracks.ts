import type { Adsr } from './dsp';
import type { Inst, Motif, Sketch } from './compose';
import type { SampleId } from './samples';

/**
 * Every piece of music in the game, as a sketch for compose().
 *
 * Each zone has a piece and each boss a fight, and each holds to the
 * palette's rule: at most eight samples, drums included. The kit, the bass
 * and the strings are shared; what makes a piece its own is the rest. The
 * forest has the wooden flute, the ruins a choir, the caverns a glass
 * marimba and the drowned hall a harp under an "aah"; and every boss has two
 * sounds no other fight uses - Grimmzahn's taiko and low horn, Tickmar's
 * clock and music box, Vesperon's harpsichord over the throne's organ.
 *
 * Zone pieces loop after sixteen bars or more (at least forty seconds), boss
 * fights after twelve or more (at least twenty), and none of them repeats a
 * phrase of four bars unchanged.
 *
 * Every fight has a motif of its own, written by hand, that comes back at
 * least twice in each loop; the title's lute states the hero's, and Umbra,
 * the hero's shadow, quotes it on that lute and then plays it upside down.
 */

export type TrackName =
  | 'title'
  | 'forest'
  | 'ruins'
  | 'caverns'
  | 'drowned'
  | 'castle'
  | 'throne'
  | 'rift'
  | 'lair'
  | 'crystal'
  | 'bossMire'
  | 'bossShard'
  | 'bossStone'
  | 'bossFire'
  | 'bossTide'
  | 'bossBlood'
  | 'bossKnight'
  | 'bossHydra'
  | 'bossCrystal'
  | 'bossGold'
  | 'bossWeb'
  | 'bossShadow'
  | 'bossBoar'
  | 'bossTwins'
  | 'bossClock'
  | 'bossJester'
  | 'bossGloom'
  | 'bossGargoyle';

/* ------------------------------------------------------------ envelopes */

const ENV = {
  /** Plucked and struck: a quick fall, then a slow one. */
  pluck: { a: 0, d: 0.22, s: 3, f: 1.4 },
  pluckShort: { a: 0, d: 0.12, s: 2, f: 0.5 },
  /** Struck metal and glass: a long ring. */
  bell: { a: 0, d: 0.5, s: 4, f: 2.2 },
  /** Held: a soft start, then it stays. */
  pad: { a: 9, d: 1, s: 7, f: Infinity },
  padSlow: { a: 10, d: 1, s: 7, f: Infinity },
  /** A lead's note: a quick start and a little settle. */
  lead: { a: 3, d: 0.35, s: 6, f: Infinity },
  breath: { a: 5, d: 0.4, s: 6, f: Infinity },
  brass: { a: 4, d: 0.25, s: 5, f: 4 },
  stab: { a: 2, d: 0.1, s: 3, f: 0.5 },
  bass: { a: 1, d: 0.3, s: 5, f: 3 },
  organ: { a: 2, d: 1, s: 8, f: Infinity },
  /** A drum plays its sample out. */
  drum: { a: 0, d: 1, s: 8, f: Infinity },
} satisfies Record<string, Adsr>;

/* ------------------------------------------------------------ instruments */

function inst(s: SampleId, vol: number, adsr: Adsr, more: Partial<Inst> = {}): Inst {
  return { s, vol, adsr, ...more };
}

const KICK = inst('kick', 0.95, ENV.drum);
const SNARE = inst('snare', 0.62, ENV.drum);
const HAT = inst('hat', 0.32, ENV.drum, { gate: 0.5, pan: 0.2 });
const OPEN = inst('hat', 0.36, ENV.drum, { pan: 0.2 });
const TOM = inst('tom', 0.7, ENV.drum);
const TOM_HI = inst('tom', 0.6, ENV.drum, { rate: 1.4 });
const CRASH = inst('crash', 0.42, { a: 0, d: 0.5, s: 4, f: 1.2 }, { pan: -0.25 });
const BASS = inst('bass', 0.85, ENV.bass, { gate: 0.92 });
const STRINGS = inst('strings', 0.42, ENV.pad, { echo: true, pan: -0.15 });

/* ------------------------------------------------------------ rhythms */

/** Bars of a melody in four, in sixteenths; a negative number rests. */
const SONG = [
  [4, 4, 4, 4],
  [6, 2, 4, 4],
  [4, 2, 2, 8],
  [2, 2, 4, 4, 4],
  [8, 4, 4],
];
const FLOW = [
  [8, 8],
  [4, 4, 8],
  [12, 4],
  [6, 2, 8],
];
const DRIVE = [
  [2, 2, 4, 2, 2, 4],
  [4, 2, 2, 4, 4],
  [2, 2, 2, 2, 8],
  [3, 3, 2, 4, 4],
  [4, -2, 2, 4, 4],
];
const MARCH = [
  [4, 2, 2, 4, 4],
  [3, 1, 4, 4, 4],
  [4, 4, 2, 2, 4],
  [6, 2, 8],
];
const WALTZ = [
  [4, 4, 4],
  [6, 2, 4],
  [8, 4],
  [4, 2, 2, 4],
];

/* ------------------------------------------------------------ motifs */

/**
 * The hero's figure, the title's lute states it: a fifth up, a turn, a
 * step higher, and back down to the tonic.
 */
const HERO: Motif = [
  [[0, 4], [4, 4], [3, 2], [4, 2], [5, 4]],
  [[4, 8], [2, 4], [0, 4]],
];

/** Sol's call, which Luna answers upside down. */
const SOL: Motif = [[[0, 4], [2, 2], [4, 2], [5, 4], [4, 4]]];

/** A motif upside down: every step mirrored about `axis`. */
function mirror(m: Motif, axis: number): Motif {
  return m.map((bar) => bar.map(([deg, len]) => [len > 0 ? 2 * axis - deg : deg, len] as const));
}

/** A motif `k` times as slow, cut into bars of `spb` steps again. */
function stretch(m: Motif, k: number, spb: number): Motif {
  const bars: (readonly [number, number])[][] = [[]];
  let pos = 0;
  for (const [deg, len] of m.flat()) {
    let left = Math.abs(len) * k;
    while (left > 0) {
      const room = spb - pos;
      const take = Math.min(left, room);
      bars[bars.length - 1].push([deg, len > 0 ? take : -take]);
      left -= take;
      pos += take;
      if (pos === spb) {
        bars.push([]);
        pos = 0;
      }
    }
  }
  if (bars[bars.length - 1].length === 0) bars.pop();
  return bars;
}

/* ------------------------------------------------------------ the pieces */

export const SKETCHES: Record<TrackName, Sketch> = {
  /* ------------------------------------------------- the title */
  // The hero on a crag, the castle across the valley: a lute alone at
  // first, strings under it, a bell now and then high up. D minor, slow.
  title: {
    bpm: 66,
    beats: 4,
    key: 38,
    mode: 'aeolian',
    seed: 11,
    sections: [
      // The lute alone over the bass, then the strings and a bell come in.
      { chords: [0, 5, 3, 4, 0, 5, 6, 4], energy: 0, rest: ['bell', 'pad', 'arp'], motif: [0, 4] },
      { chords: [5, 3, 0, 4, 3, 6, 4, 4], energy: 2, vary: 2, motif: [2] },
    ],
    parts: [
      { name: 'lute', role: 'melody', inst: inst('lute', 0.9, ENV.pluck, { echo: true, gate: 1 }), oct: 2, rhythms: [[4, 4, 8], [2, 2, 4, 8], [6, 2, 4, 4], [8, 4, 4]], range: [-2, 7], motif: HERO },
      { name: 'arp', role: 'arp', inst: inst('lute', 0.32, ENV.pluckShort, { pan: 0.3 }), oct: 1, tones: [0, 2, 3, 1, 2, 3, 4, 3], rhythm: 'x.xxx.xxx.xxx.xx' },
      { name: 'pad', role: 'chord', inst: inst('strings', 0.28, ENV.padSlow, { echo: true, pan: -0.2 }), oct: 1, tone: 1 },
      { name: 'bell', role: 'counter', inst: inst('bell', 0.42, ENV.bell, { echo: true, pan: 0.35 }), oct: 3, per: 2 },
      { name: 'bass', role: 'bass', inst: BASS, oct: 0, patterns: ['r.......r.......', 'r.......f.......', 'r...r...f...r...', 'r.......a...a...'] },
      { name: 'toms', role: 'drums', inst: TOM, kit: { t: TOM }, patterns: ['........t.......', '................', 't.......t...t...'], fill: '........t...t.tt' },
    ],
  },

  /* ------------------------------------------------- the zones */
  // Nebelwald: the wooden flute over a picked guitar, dorian, walking pace.
  forest: {
    bpm: 84,
    beats: 4,
    key: 40,
    mode: 'dorian',
    seed: 21,
    sections: [
      { chords: [0, 3, 0, 4, 0, 3, 5, 4], energy: 1 },
      { chords: [3, 4, 0, 5, 3, 4, 6, 4], energy: 2 },
      { chords: [5, 4, 3, 4, 0, 3, 4, 0], energy: 1, vary: 3 },
    ],
    parts: [
      { name: 'flute', role: 'melody', inst: inst('flute', 0.78, ENV.breath, { echo: true, vib: [5.2, 0.25, 0.18], gate: 0.94 }), oct: 2, rhythms: SONG },
      { name: 'guitar', role: 'arp', inst: inst('pluck', 0.55, ENV.pluck, { pan: 0.3 }), oct: 1, tones: [0, 1, 2, 3, 2, 1], rhythm: 'x.x.x.x.x.x.x.x.' },
      { name: 'pad', role: 'chord', inst: STRINGS, oct: 1, tone: 2 },
      { name: 'bass', role: 'bass', inst: BASS, oct: 0, patterns: ['r-------f-------', 'r-----r-f---a---', 'r---r---f---r---', 'r-----r-f-f-a-a-'] },
      { name: 'kit', role: 'drums', inst: KICK, kit: { k: KICK, s: SNARE }, patterns: ['k.......s.......', 'k.....k.s.......', 'k.....k.s...k...'], fill: 'k.....k.s...s.ss' },
      { name: 'hats', role: 'drums', inst: HAT, kit: { h: HAT, o: OPEN }, patterns: ['h...h...h...h...', 'h.h.h.h.h.h.h.h.', 'h.h.h.h.h.h.h.o.'] },
    ],
  },

  // Versunkene Ruinen: a choir in the stone, a gong at every turn, phrygian.
  ruins: {
    bpm: 72,
    beats: 4,
    key: 40,
    mode: 'phrygian',
    seed: 31,
    sections: [
      { chords: [0, 1, 0, 6, 0, 1, 3, 0], energy: 0 },
      { chords: [3, 1, 0, 6, 5, 1, 6, 0], energy: 1 },
    ],
    parts: [
      { name: 'choir', role: 'chord', inst: inst('choirOoh', 0.62, ENV.padSlow, { echo: true, pan: -0.15 }), oct: 1, tone: 0 },
      { name: 'choir2', role: 'chord', inst: inst('choirOoh', 0.5, ENV.padSlow, { echo: true, pan: 0.2 }), oct: 1, tone: 2 },
      { name: 'line', role: 'melody', inst: inst('pluck', 0.7, ENV.pluck, { echo: true }), oct: 2, rhythms: FLOW, range: [-1, 6] },
      { name: 'bass', role: 'bass', inst: BASS, oct: 0, patterns: ['r---------------', 'r-------r-------', 'r-------f-------', 'r-------a-------'] },
      { name: 'gong', role: 'drums', inst: inst('gong', 0.75, { a: 0, d: 1.2, s: 4, f: 3 }, { echo: true }), kit: { g: inst('gong', 0.75, { a: 0, d: 1.2, s: 4, f: 3 }, { echo: true }) }, patterns: ['g...............'], phrase: 8 },
      { name: 'perc', role: 'drums', inst: TOM, kit: { t: TOM, h: HAT }, patterns: ['....h.......h...', 't...h...t...h...', 't...h.t.t...h.h.'] },
    ],
  },

  // Die Dunkelgrotte: a glass marimba and drops of water in the dark.
  caverns: {
    bpm: 76,
    beats: 4,
    key: 33,
    mode: 'aeolian',
    seed: 41,
    sections: [
      { chords: [0, 6, 5, 6, 0, 3, 4, 0], energy: 0 },
      { chords: [5, 6, 0, 4, 5, 3, 4, 4], energy: 1 },
    ],
    parts: [
      { name: 'marimba', role: 'melody', inst: inst('marimba', 0.8, ENV.bell, { echo: true, gate: 1 }), oct: 2, rhythms: [[4, 4, 8], [2, 2, 4, 8], [4, 4, 4, 4], [8, 8]] },
      { name: 'arp', role: 'arp', inst: inst('marimba', 0.45, ENV.pluckShort, { pan: 0.35 }), oct: 1, tones: [0, 2, 1, 2], rhythm: 'x...x...x...x.x.' },
      { name: 'pad', role: 'chord', inst: inst('strings', 0.34, ENV.padSlow, { echo: true, pan: -0.2 }), oct: 1, tone: 1 },
      { name: 'bass', role: 'bass', inst: BASS, oct: 0, patterns: ['r---------------', 'r-------r---f---', 'r-------r---f---', 'r-------a---a---'] },
      { name: 'drips', role: 'drums', inst: inst('drip', 0.5, ENV.drum, { echo: true }), kit: { d: inst('drip', 0.5, ENV.drum, { echo: true }), e: inst('drip', 0.42, ENV.drum, { echo: true, rate: 1.33, pan: 0.4 }) }, patterns: ['..d.......e.....', '..d...e...d...e.', '..d..e....d.e...'] },
      { name: 'kit', role: 'drums', inst: KICK, kit: { k: KICK, h: HAT }, patterns: ['k...............', 'k.......k...h...', 'k...h...k.k.h...'] },
    ],
  },

  // Die Ertrunkene Halle: a harp, a sung "aah", a bell under water. Lydian, slow.
  drowned: {
    bpm: 70,
    beats: 4,
    key: 41,
    mode: 'lydian',
    seed: 51,
    sections: [
      { chords: [0, 1, 0, 4, 0, 1, 5, 4], energy: 0 },
      { chords: [5, 4, 1, 0, 5, 1, 4, 4], energy: 1 },
    ],
    parts: [
      { name: 'harp', role: 'arp', inst: inst('harp', 0.62, ENV.pluck, { echo: true, pan: 0.25 }), oct: 1, tones: [0, 1, 2, 3, 4, 3, 2, 1], rhythm: 'x.x.x.x.x.x.x.x.' },
      { name: 'aah', role: 'chord', inst: inst('choirAah', 0.55, ENV.padSlow, { echo: true, pan: -0.2 }), oct: 1, tone: 1 },
      { name: 'aah2', role: 'chord', inst: inst('choirAah', 0.42, ENV.padSlow, { echo: true, pan: 0.15 }), oct: 1, tone: 2 },
      { name: 'bell', role: 'melody', inst: inst('bell', 0.55, ENV.bell, { echo: true, gate: 1 }), oct: 2, rhythms: [[8, 8], [12, 4], [4, 4, 8]], range: [0, 7] },
      { name: 'bass', role: 'bass', inst: BASS, oct: 0, patterns: ['r---------------', 'r-------f-------', 'r-------f-------', 'r-------a-------'] },
      { name: 'tom', role: 'drums', inst: TOM, kit: { t: TOM }, patterns: ['................', 't...............', 't.......t.......'], fill: '........t...t...' },
    ],
  },

  // Burg Nachtfall: a march for brass, the snare rolling, harmonic minor.
  castle: {
    bpm: 112,
    beats: 4,
    key: 38,
    mode: 'harmonic',
    seed: 61,
    sections: [
      { chords: [0, 4, 0, 4, 5, 3, 4, 0], energy: 1 },
      { chords: [3, 0, 3, 4, 5, 1, 4, 4], energy: 2 },
      { chords: [0, 5, 3, 4, 0, 5, 1, 4], energy: 1, vary: 4 },
    ],
    parts: [
      { name: 'brass', role: 'melody', inst: inst('brassStab', 0.72, ENV.brass, { echo: true, gate: 0.85 }), oct: 2, rhythms: MARCH },
      { name: 'strings', role: 'counter', inst: inst('strings', 0.42, ENV.lead, { echo: true, pan: -0.25 }), oct: 1, per: 2 },
      { name: 'bass', role: 'bass', inst: BASS, oct: 0, patterns: ['r.......f.......', 'r...r...f...r...', 'r.r.r.r.f.f.f.f.', 'r...r...a.a.a.a.'] },
      { name: 'snare', role: 'drums', inst: SNARE, kit: { s: SNARE, g: inst('snare', 0.36, ENV.drum), k: KICK }, patterns: ['k...s...k...s...', 'k..gs.g.k..gs.gg', 'k.ggs.ggk.ggs.gg'], fill: 'sgsgsgsgSgsgSSSS' },
      { name: 'hats', role: 'drums', inst: HAT, kit: { h: HAT, c: CRASH }, patterns: ['h...h...h...h...', 'h.h.h.h.h.h.h.h.', 'h.h.h.h.h.h.h.h.'], downbeat: 'c' },
      { name: 'pad', role: 'chord', inst: inst('strings', 0.3, ENV.pad, { echo: true, pan: 0.25 }), oct: 1, tone: 2 },
    ],
  },

  // Der Thronsaal: the pipe organ, a timpani's roll, strings. Harmonic minor.
  throne: {
    bpm: 80,
    beats: 4,
    key: 36,
    mode: 'harmonic',
    seed: 71,
    sections: [
      { chords: [0, 5, 3, 4, 0, 5, 1, 4], energy: 0 },
      { chords: [5, 3, 0, 4, 5, 6, 4, 4], energy: 1 },
    ],
    parts: [
      { name: 'organ', role: 'melody', inst: inst('organ', 0.6, ENV.organ, { echo: true, gate: 0.97 }), oct: 2, rhythms: FLOW },
      { name: 'organ2', role: 'chord', inst: inst('organ', 0.4, ENV.organ, { echo: true, pan: -0.2 }), oct: 1, tone: 1 },
      { name: 'organ3', role: 'chord', inst: inst('organ', 0.36, ENV.organ, { echo: true, pan: 0.2 }), oct: 1, tone: 2 },
      { name: 'strings', role: 'counter', inst: inst('strings', 0.36, ENV.lead, { echo: true }), oct: 1, per: 2 },
      { name: 'bass', role: 'bass', inst: inst('organ', 0.55, ENV.organ), oct: 0, patterns: ['r---------------', 'r-------f-------', 'r-------f-------', 'r-------a-------'] },
      { name: 'timpani', role: 'drums', inst: inst('timpani', 0.8, { a: 0, d: 0.6, s: 4, f: 1.5 }), kit: { t: inst('timpani', 0.8, { a: 0, d: 0.6, s: 4, f: 1.5 }), c: CRASH }, patterns: ['t...............', 't.......t.......', 't.......t...t.t.'], fill: 't.t.t.t.tttttttt', downbeat: 'c', phrase: 8 },
    ],
  },

  // Der Riss: bowed glass over a pulse, phrygian dominant, restless.
  rift: {
    bpm: 92,
    beats: 4,
    key: 40,
    mode: 'phrygianDominant',
    seed: 81,
    sections: [
      { chords: [0, 1, 0, 1, 3, 1, 0, 0], energy: 1 },
      { chords: [3, 2, 1, 0, 3, 1, 6, 0], energy: 2 },
    ],
    parts: [
      { name: 'glass', role: 'chord', inst: inst('bowedGlass', 0.5, ENV.padSlow, { echo: true, pan: -0.2 }), oct: 1, tone: 0 },
      { name: 'lead', role: 'melody', inst: inst('pulse', 0.44, ENV.lead, { echo: true, vib: [5.5, 0.2, 0.2], gate: 0.9 }), oct: 2, rhythms: SONG },
      { name: 'arp', role: 'arp', inst: inst('pulse', 0.26, ENV.pluckShort, { pan: 0.35 }), oct: 1, tones: [0, 2, 1, 3], rhythm: 'x.xx.xx.x.xx.xx.' },
      { name: 'bass', role: 'bass', inst: BASS, oct: 0, patterns: ['r.....r.r.......', 'r.r...r.r.r.....', 'r.r.r.r.r.r.f.r.', 'r.r...r.a.a.a.a.'] },
      { name: 'kit', role: 'drums', inst: KICK, kit: { k: KICK, s: SNARE }, patterns: ['k.......s.......', 'k.....k.s.......', 'k.....k.s..k..k.'], fill: 'k.....k.s.s.sss.' },
      { name: 'hats', role: 'drums', inst: HAT, kit: { h: HAT }, patterns: ['h...h...h...h...', '..h...h...h...h.', 'h.hhh.hhh.hhh.hh'] },
    ],
  },

  // Der Schlund: log drums and a pulse lead, phrygian, driving.
  lair: {
    bpm: 126,
    beats: 4,
    key: 38,
    mode: 'phrygian',
    seed: 91,
    sections: [
      { chords: [0, 1, 0, 6, 0, 1, 5, 6], energy: 1 },
      { chords: [3, 1, 0, 1, 5, 6, 1, 0], energy: 2 },
      { chords: [0, 6, 5, 1, 0, 6, 1, 1], energy: 2, vary: 5 },
    ],
    parts: [
      { name: 'lead', role: 'melody', inst: inst('pulse', 0.5, ENV.lead, { echo: true, gate: 0.85 }), oct: 2, rhythms: DRIVE },
      { name: 'logs', role: 'drums', inst: inst('logDrum', 0.7, ENV.drum), kit: { l: inst('logDrum', 0.7, ENV.drum), m: inst('logDrum', 0.6, ENV.drum, { rate: 1.5, pan: 0.3 }) }, patterns: ['l..m..l.l..m....', 'l..m..l.l..m.m..', 'l.mm.ml.l.mm.mm.'] },
      { name: 'pad', role: 'chord', inst: inst('strings', 0.34, ENV.pad, { echo: true }), oct: 1, tone: 1 },
      { name: 'bass', role: 'bass', inst: BASS, oct: 0, patterns: ['r.r.r.r.r.r.r.r.', 'r.rRr.rRr.rRr.rR', 'r.rRr.rRr.rRf.fR', 'r.r.r.r.a.a.a.a.'] },
      { name: 'kit', role: 'drums', inst: KICK, kit: { k: KICK, s: SNARE }, patterns: ['k...s...k...s...', 'k...s...k.k.s...', 'k.k.s...k.k.s.k.'], fill: 'k...s...s.s.ssss' },
      { name: 'crash', role: 'drums', inst: CRASH, kit: { c: CRASH }, patterns: ['................'], downbeat: 'c' },
    ],
  },

  // Der Kristallhort: a celesta among bells, lydian, bright.
  crystal: {
    bpm: 100,
    beats: 4,
    key: 43,
    mode: 'lydian',
    seed: 101,
    sections: [
      { chords: [0, 1, 4, 0, 5, 1, 4, 4], energy: 1 },
      { chords: [3, 1, 0, 4, 5, 6, 1, 4], energy: 2 },
      { chords: [0, 4, 5, 1, 0, 4, 1, 0], energy: 1, vary: 6 },
    ],
    parts: [
      { name: 'celesta', role: 'melody', inst: inst('celesta', 0.75, ENV.bell, { echo: true, gate: 1 }), oct: 2, rhythms: SONG },
      { name: 'bells', role: 'arp', inst: inst('bell', 0.4, ENV.bell, { echo: true, pan: 0.35 }), oct: 2, tones: [0, 1, 2, 3], rhythm: 'x...x...x...x...' },
      { name: 'pad', role: 'chord', inst: STRINGS, oct: 1, tone: 1 },
      { name: 'bass', role: 'bass', inst: BASS, oct: 0, patterns: ['r-------f-------', 'r---r---f---r---', 'r-r-r-r-f-f-r-r-', 'r---r---a---a---'] },
      { name: 'kit', role: 'drums', inst: KICK, kit: { k: KICK }, patterns: ['k.......k.......', 'k.......k.......', 'k...k...k...k...'] },
      { name: 'hats', role: 'drums', inst: HAT, kit: { h: HAT }, patterns: ['..h...h...h...h.', 'h.h.h.h.h.h.h.h.', 'hhh.hhh.hhh.hhh.'] },
    ],
  },

  /* ------------------------------------------------- the bosses */
  // Gallert: a wet, bouncing bass, bubbles bursting on the off-beats.
  bossMire: {
    bpm: 132,
    beats: 4,
    key: 43,
    mode: 'dorian',
    seed: 201,
    intro: { chords: [0], energy: 2, rest: ['lead', 'bubbles'] },
    sections: [
      { chords: [0, 0, 3, 4, 0, 0, 5, 4], energy: 1, motif: [0, 4] },
      { chords: [3, 3, 0, 0, 5, 4, 3, 4], energy: 2 },
    ],
    parts: [

      { name: 'bass', role: 'bass', inst: inst('bloopBass', 1, { a: 1, d: 0.2, s: 4, f: 2 }), oct: 0, patterns: ['r..r..r.r..r..r.', 'r.rr..r.r.rr..r.', 'r.rR..r.rRr...fR', 'r..r..r.a.a.a.a.'] },
      // Two blobs and a gap, then a bounce up and down again.
      { name: 'lead', role: 'melody', inst: inst('pulse', 0.4, ENV.lead, { echo: true, gate: 0.7 }), oct: 1, rhythms: DRIVE, range: [0, 7], motif: [[[0, 2], [0, 2], [0, -2], [4, 2], [3, 2], [2, 2], [0, 4]], [[2, 3], [3, 3], [4, 2], [6, 4], [4, 4]]] },
      { name: 'bubbles', role: 'drums', inst: inst('bubble', 0.6, ENV.drum), kit: { b: inst('bubble', 0.6, ENV.drum, { pan: -0.3 }), p: inst('bubble', 0.55, ENV.drum, { rate: 1.5, pan: 0.35 }) }, patterns: ['..b.......p.....', '..b...p...b...p.', '..b.p.p...b.p.p.'] },
      { name: 'kit', role: 'drums', inst: KICK, kit: { k: KICK, s: inst('snare', 0.5, ENV.drum) }, patterns: ['k...s...k...s...', 'k...s...k.k.s...', 'k.k.s...k.k.s.k.'], fill: 'k...s...s.s.ssss' },
      { name: 'pops', role: 'drums', inst: inst('bubble', 0.4, ENV.drum), kit: { q: inst('bubble', 0.4, ENV.drum, { rate: 0.75, pan: 0.2 }) }, patterns: ['......q.......q.', '....q.....q...q.', 'q...q.q...q...q.'] },
    ],
  },

  // Grimmzahn: taiko and a low horn, the boar's charge in the drums.
  bossBoar: {
    bpm: 140,
    beats: 4,
    key: 38,
    mode: 'phrygian',
    seed: 211,
    intro: { chords: [0], energy: 2, rest: ['horn', 'strings'] },
    sections: [
      { chords: [0, 0, 1, 0, 6, 6, 1, 0], energy: 1, motif: [0] },
      { chords: [3, 3, 1, 1, 5, 6, 1, 1], energy: 2, motif: [0] },
    ],
    parts: [

      // The boar pawing the ground: the tonic, the flat second, down to the sixth.
      { name: 'horn', role: 'melody', inst: inst('lowHorn', 0.7, ENV.brass, { echo: true, gate: 0.9 }), oct: 1, rhythms: [[8, 4, 4], [4, 4, 8], [6, 2, 8], [12, 4]], range: [-2, 5], motif: [[[0, 6], [0, 2], [1, 4], [0, 4]], [[-1, 4], [-2, 4], [0, 8]]] },
      { name: 'taiko', role: 'drums', inst: inst('taiko', 1, ENV.drum), kit: { t: inst('taiko', 1, ENV.drum), u: inst('taiko', 0.8, ENV.drum, { rate: 1.35 }) }, patterns: ['t.....t...u.....', 't.....t.u.u.t...', 't.u.t.t.u.u.t.u.'], fill: 't.u.t.u.tutututu' },
      { name: 'low', role: 'chord', inst: inst('strings', 0.42, ENV.pad, { pan: -0.2 }), oct: 0, tone: 0 },
      { name: 'bass', role: 'bass', inst: inst('bass', 1, ENV.bass, { gate: 0.92 }), oct: 0, patterns: ['r.r.r.r.r.r.r.r.', 'r.r.r.r.r.r.f.f.', 'rrr.rrr.rrr.f.f.', 'r.r.r.r.a.a.a.a.'] },
      { name: 'toms', role: 'drums', inst: TOM, kit: { t: TOM, u: TOM_HI }, patterns: ['....t.......t...', '....t.......t.u.', '..u.t...u.u.t.u.'] },
    ],
  },

  // Gierschlund: a glockenspiel counting gold, coins jingling. Lydian, greedy and bright.
  bossGold: {
    bpm: 136,
    beats: 4,
    key: 41,
    mode: 'lydian',
    seed: 221,
    intro: { chords: [0], energy: 2, rest: ['glock', 'pluck'] },
    sections: [
      { chords: [0, 1, 0, 4, 0, 1, 5, 4], energy: 1, motif: [0, 4] },
      { chords: [3, 4, 0, 5, 1, 4, 0, 4], energy: 2, motif: [6] },
    ],
    parts: [

      // Counting up the chord, the lydian fourth, and the top coin.
      { name: 'glock', role: 'melody', inst: inst('glock', 0.72, ENV.bell, { echo: true, gate: 1 }), oct: 2, rhythms: DRIVE, motif: [[[0, 2], [2, 2], [4, 2], [3, 2], [4, 4], [7, 4]]] },
      { name: 'pluck', role: 'arp', inst: inst('pluck', 0.55, ENV.pluckShort, { pan: -0.3 }), oct: 1, tones: [0, 1, 2, 1], rhythm: 'x.x.x.x.x.x.x.x.' },
      { name: 'coins', role: 'drums', inst: inst('coins', 0.5, ENV.drum, { pan: 0.35 }), kit: { c: inst('coins', 0.5, ENV.drum, { pan: 0.35 }) }, patterns: ['............c...', '......c.....c...', '....c...c...c...'] },
      { name: 'bass', role: 'bass', inst: inst('bass', 1, ENV.bass, { gate: 0.6 }), oct: 0, patterns: ['r...f...r...f...', 'r.r.f.f.r.r.f.f.', 'r.rRf.fRr.rRf.fR', 'r...f...a.a.a.a.'] },
      { name: 'kit', role: 'drums', inst: KICK, kit: { k: KICK, s: inst('snare', 0.45, ENV.drum) }, patterns: ['k.......k.......', 'k...s...k...s...', 'k...s...k.k.s...'] },
    ],
  },

  // Maskarill: a fast waltz for a calliope, the woodblock keeping time.
  bossJester: {
    bpm: 168,
    beats: 3,
    key: 38,
    mode: 'harmonic',
    seed: 231,
    intro: { chords: [4, 4], energy: 1, rest: ['calliope'] },
    sections: [
      { chords: [0, 0, 4, 4, 0, 0, 4, 0], energy: 1, motif: [0, 4] },
      { chords: [3, 3, 0, 0, 1, 4, 4, 4], energy: 2 },
      { chords: [5, 5, 3, 3, 0, 4, 0, 0], energy: 1, vary: 7, motif: [6] },
    ],
    parts: [

      // A leap to the leading note and a tumble back down.
      { name: 'calliope', role: 'melody', inst: inst('calliope', 0.66, ENV.lead, { echo: true, vib: [6.5, 0.3, 0.1], gate: 0.85 }), oct: 2, rhythms: WALTZ, motif: [[[4, 4], [6, 2], [7, 2], [4, 4]], [[2, 2], [3, 2], [4, 2], [2, 2], [0, 4]]] },
      { name: 'oompah', role: 'arp', inst: inst('pluck', 0.55, ENV.pluckShort, { pan: -0.25 }), oct: 1, tones: [1, 2, 1, 2], rhythm: '....x...x...' },
      { name: 'bass', role: 'bass', inst: inst('bass', 1, ENV.bass, { gate: 0.7 }), oct: 0, patterns: ['r...........', 'r...........', 'r.......f...', 'r...a...a...'] },
      { name: 'block', role: 'drums', inst: inst('woodblock', 0.62, ENV.drum), kit: { w: inst('woodblock', 0.62, ENV.drum, { pan: 0.3 }), v: inst('woodblock', 0.52, ENV.drum, { rate: 1.4, pan: 0.3 }) }, patterns: ['w...w...w...', 'w...w.v.w...', 'w.v.w.v.w.v.'] },
      { name: 'kit', role: 'drums', inst: KICK, kit: { k: KICK, s: SNARE }, patterns: ['k...........', 'k.......s...', 'k...s...s...'], fill: 'k...s.s.s.ss' },
      { name: 'hats', role: 'drums', inst: HAT, kit: { h: inst('hat', 0.38, ENV.drum, { gate: 0.5, pan: 0.2 }) }, patterns: ['..h...h...h.', 'h.h.h.h.h.h.', 'hhhhhhhhhhhh'] },
    ],
  },

  // Ankhor: the gong and low brass of a temple colossus, phrygian dominant.
  bossStone: {
    bpm: 96,
    beats: 4,
    key: 40,
    mode: 'phrygianDominant',
    seed: 241,
    intro: { chords: [0], energy: 0, rest: ['brass', 'strings'] },
    sections: [
      { chords: [0, 1, 0, 1, 3, 1, 0, 0], energy: 1, motif: [0, 6] },
      { chords: [3, 3, 1, 1, 6, 5, 1, 0], energy: 2 },
    ],
    parts: [
      // One heavy step: the flat second and the raised third of the temple's mode.
      { name: 'brass', role: 'melody', inst: inst('lowBrass', 0.8, ENV.brass, { echo: true, gate: 0.92 }), oct: 1, rhythms: [[8, 4, 4], [4, 4, 8], [6, 2, 4, 4], [12, 4]], range: [-1, 7], motif: [[[0, 6], [1, 2], [2, 4], [0, 4]]] },
      { name: 'gong', role: 'drums', inst: inst('gong', 0.85, { a: 0, d: 1.2, s: 4, f: 3 }, { echo: true }), kit: { g: inst('gong', 0.85, { a: 0, d: 1.2, s: 4, f: 3 }, { echo: true }) }, patterns: ['g...............'], phrase: 4 },
      { name: 'strings', role: 'chord', inst: inst('strings', 0.38, ENV.pad, { echo: true }), oct: 1, tone: 1 },
      { name: 'bass', role: 'bass', inst: BASS, oct: 0, patterns: ['r-------r-------', 'r---r---r---r---', 'r.r.r.r.r.r.r.r.', 'r---r---a---a---'] },
      { name: 'toms', role: 'drums', inst: TOM, kit: { t: TOM, u: TOM_HI }, patterns: ['t.......t.......', 't.....t.t...u...', 't.u.t.t.t.u.u.t.'], fill: 't.u.t.u.tuttuutt' },
      { name: 'crash', role: 'drums', inst: CRASH, kit: { c: CRASH }, patterns: ['................'], downbeat: 'c' },
    ],
  },

  // Nyktos: a low choir in the dark and a drone under it; almost nothing else.
  bossGloom: {
    bpm: 104,
    beats: 4,
    key: 37,
    mode: 'aeolian',
    seed: 251,
    intro: { chords: [0], energy: 0, rest: ['high'] },
    sections: [
      { chords: [0, 0, 5, 5, 0, 0, 6, 6], energy: 0, motif: [0, 4] },
      { chords: [3, 3, 0, 0, 5, 5, 4, 4], energy: 1 },
    ],
    parts: [
      // A lament: up to the minor sixth, a sigh down to the fifth, home.
      { name: 'choir', role: 'melody', inst: inst('choirLow', 0.85, ENV.padSlow, { echo: true, gate: 0.97 }), oct: 1, rhythms: [[16], [8, 8], [12, 4]], range: [0, 6], motif: [[[0, 8], [5, 8]], [[4, 12], [0, 4]]] },
      { name: 'choir2', role: 'chord', inst: inst('choirLow', 0.55, ENV.padSlow, { echo: true, pan: 0.25 }), oct: 1, tone: 2 },
      { name: 'drone', role: 'bass', inst: inst('drone', 0.95, { a: 8, d: 1, s: 8, f: Infinity }), oct: 0, patterns: ['r---------------', 'r---------------', 'r-------r-------', 'r---------------'] },
      { name: 'high', role: 'counter', inst: inst('pulse', 0.22, ENV.lead, { echo: true, pan: -0.35 }), oct: 3, per: 2 },
      { name: 'kit', role: 'drums', inst: KICK, kit: { k: KICK }, patterns: ['k.........k.....', 'k.........k.....', 'k...k.....k.k...'] },
      { name: 'hats', role: 'drums', inst: HAT, kit: { h: HAT }, patterns: ['............h...', '....h.......h...', '..h...h...h...h.'] },
    ],
  },

  // Arachna: pizzicato running along a thread, a koto above. Harmonic minor.
  bossWeb: {
    bpm: 128,
    beats: 4,
    key: 33,
    mode: 'harmonic',
    seed: 261,
    intro: { chords: [0], energy: 1, rest: ['koto', 'pad'] },
    sections: [
      { chords: [0, 4, 0, 4, 5, 3, 4, 4], energy: 1, motif: [0] },
      { chords: [3, 4, 0, 5, 3, 1, 4, 4], energy: 2, motif: [2] },
    ],
    parts: [

      { name: 'pizz', role: 'arp', inst: inst('pizz', 0.8, ENV.pluckShort, { pan: -0.3 }), oct: 0, tones: [0, 1, 2, 3, 2, 1, 2, 1], rhythm: 'xxxxxxxxxxxxxxxx' },
      // Creeping round the leading note, then up the thread.
      { name: 'koto', role: 'melody', inst: inst('koto', 0.8, ENV.pluck, { echo: true, gate: 1 }), oct: 3, rhythms: SONG, range: [-3, 5], motif: [[[0, 2], [-1, 2], [0, 2], [2, 2], [4, 4], [2, 4]]] },
      { name: 'koto2', role: 'counter', inst: inst('koto', 0.5, ENV.pluck, { echo: true, pan: 0.35 }), oct: 2, per: 2 },
      { name: 'kit', role: 'drums', inst: KICK, kit: { k: inst('kick', 0.8, ENV.drum), t: TOM }, patterns: ['k.......k.......', 'k.......k..k..t.', 'k...k...k..k.tt.'] },
      { name: 'hats', role: 'drums', inst: HAT, kit: { h: inst('hat', 0.26, ENV.drum, { gate: 0.5, pan: 0.2 }) }, patterns: ['....h.......h...', '..h...h...h...h.', '..h...h...h...h.'] },
    ],
  },

  // Ignivor: brass ground down by heat, an anvil struck on the off-beat.
  bossFire: {
    bpm: 144,
    beats: 4,
    key: 40,
    mode: 'phrygian',
    seed: 271,
    intro: { chords: [0], energy: 2, rest: ['brass', 'pad'] },
    sections: [
      { chords: [0, 1, 0, 1, 5, 6, 1, 0], energy: 1, motif: [0] },
      { chords: [3, 1, 3, 1, 5, 6, 0, 1], energy: 2, motif: [6] },
    ],
    parts: [

      // A flare: up the octave and back to the fifth, a flicker, and the flat second burning.
      { name: 'brass', role: 'melody', inst: inst('brassGrit', 0.72, ENV.brass, { echo: true, gate: 0.85 }), oct: 1, rhythms: DRIVE, range: [0, 8], motif: [[[0, 2], [7, 2], [4, 2], [5, 1], [4, 1], [1, 4], [0, 4]]] },
      { name: 'anvil', role: 'drums', inst: inst('anvil', 0.55, ENV.bell), kit: { a: inst('anvil', 0.55, ENV.bell, { pan: 0.3 }), b: inst('anvil', 0.46, ENV.bell, { rate: 1.19, pan: 0.3 }) }, patterns: ['....a.......a...', '....a.......a.b.', '..a.a...b.a.a.b.'] },
      { name: 'brass2', role: 'chord', inst: inst('brassGrit', 0.42, ENV.stab, { pan: -0.25 }), oct: 1, tone: 1, rhythm: 'x.......x...x...' },
      { name: 'bass', role: 'bass', inst: BASS, oct: 0, patterns: ['rrrrrrrrrrrrrrrr', 'rrrRrrrRrrrRrrrR', 'rrRrrrRrrrRrfrRr', 'rrrrrrrraaaaaaaa'] },
      { name: 'toms', role: 'drums', inst: TOM, kit: { t: TOM, u: TOM_HI, k: KICK }, patterns: ['k...t...k...t...', 'k.k.t...k.k.t.u.', 'k.k.t.u.k.k.t.uu'], fill: 'k.u.t.u.tutututu' },
      { name: 'crash', role: 'drums', inst: CRASH, kit: { c: CRASH }, patterns: ['................'], downbeat: 'c' },
    ],
  },

  // Sol and Luna: the warm flute calls, the cold glass harmonica answers.
  bossTwins: {
    bpm: 120,
    beats: 4,
    key: 41,
    mode: 'dorian',
    seed: 281,
    intro: { chords: [0], energy: 1, rest: ['sol', 'luna'] },
    sections: [
      { chords: [0, 3, 0, 4, 5, 3, 1, 4], energy: 1, motif: [0, 2, 4] },
      { chords: [3, 4, 5, 4, 3, 4, 0, 0], energy: 2, motif: [6] },
    ],
    parts: [

      // Sol's call rises; Luna's answer is the same call upside down, and slower.
      { name: 'sol', role: 'melody', inst: inst('flute', 0.82, ENV.breath, { echo: true, vib: [5.5, 0.25, 0.15], pan: -0.35 }), oct: 2, rhythms: SONG, bars: (b) => b % 4 < 2, motif: SOL },
      { name: 'luna', role: 'melody', inst: inst('glassHarp', 0.8, ENV.pad, { echo: true, pan: 0.35 }), oct: 2, rhythms: FLOW, bars: (b) => b % 4 >= 2, motif: stretch(mirror(SOL, 4.5), 2, 16) },
      { name: 'pad', role: 'chord', inst: inst('strings', 0.4, ENV.pad, { echo: true }), oct: 2, tone: 1 },
      { name: 'pad2', role: 'chord', inst: inst('glassHarp', 0.34, ENV.pad, { echo: true, pan: 0.3 }), oct: 1, tone: 2 },
      { name: 'bells', role: 'arp', inst: inst('bell', 0.4, ENV.bell, { echo: true }), oct: 2, tones: [0, 2, 1, 2], rhythm: 'x...x...x...x...' },
    ],
  },

  // Thalassa: the drowned crown's harp and choir, now with a pulse under them.
  bossTide: {
    bpm: 112,
    beats: 4,
    key: 38,
    mode: 'aeolian',
    seed: 291,
    intro: { chords: [0], energy: 1, rest: ['choir'] },
    sections: [
      { chords: [0, 5, 6, 4, 0, 5, 3, 4], energy: 1, motif: [0, 4] },
      { chords: [5, 6, 0, 0, 3, 4, 5, 4], energy: 2 },
    ],
    parts: [
      { name: 'harp', role: 'arp', inst: inst('harp', 0.6, ENV.pluck, { echo: true, pan: 0.3 }), oct: 1, tones: [0, 1, 2, 3, 4, 3, 2, 1], rhythm: 'xxxxxxxxxxxxxxxx' },
      // A wave: down from the fifth, back up a step, and under.
      { name: 'choir', role: 'melody', inst: inst('choirAah', 0.7, ENV.pad, { echo: true, gate: 0.95 }), oct: 2, rhythms: FLOW, motif: [[[4, 8], [3, 4], [2, 4]], [[1, 4], [2, 4], [0, 8]]] },
      { name: 'bass', role: 'bass', inst: BASS, oct: 0, patterns: ['r.......r.......', 'r...r...r...f...', 'r.r.r.r.r.r.f.f.', 'r...r...a...a...'] },
      { name: 'kit', role: 'drums', inst: KICK, kit: { k: KICK, s: SNARE }, patterns: ['k.......s.......', 'k.....k.s.......', 'k.....k.s...k...'], fill: 'k.....k.s...s.ss' },
      { name: 'crash', role: 'drums', inst: CRASH, kit: { c: CRASH }, patterns: ['................'], downbeat: 'c' },
      { name: 'aah', role: 'chord', inst: inst('choirAah', 0.4, ENV.padSlow, { echo: true, pan: -0.3 }), oct: 1, tone: 2 },
    ],
  },

  // Grauwacht: a church bell over the battlements, timpani, strings, a choir below.
  bossGargoyle: {
    bpm: 100,
    beats: 4,
    key: 36,
    mode: 'aeolian',
    seed: 301,
    intro: { chords: [0], energy: 1, rest: ['strings'] },
    sections: [
      { chords: [0, 0, 5, 5, 3, 3, 4, 4], energy: 1, motif: [0] },
      { chords: [5, 3, 0, 4, 5, 6, 4, 4], energy: 2, motif: [2] },
    ],
    parts: [

      { name: 'bell', role: 'drums', inst: inst('churchBell', 0.95, { a: 0, d: 1, s: 4, f: 3 }, { echo: true }), kit: { b: inst('churchBell', 0.95, { a: 0, d: 1, s: 4, f: 3 }, { echo: true, rate: 1.5 }), d: inst('churchBell', 0.8, { a: 0, d: 1, s: 4, f: 3 }, { echo: true }) }, patterns: ['b.......d.......', 'b.......d.......', 'b...d...b...d...'] },
      // Struck twice like the bell, up to the fifth, and three steps down.
      { name: 'strings', role: 'melody', inst: inst('strings', 0.62, ENV.lead, { echo: true, gate: 0.95 }), oct: 2, rhythms: SONG, motif: [[[0, 4], [0, 4], [4, 8]], [[3, 4], [2, 4], [1, 8]]] },
      { name: 'timpani', role: 'drums', inst: inst('timpani', 1, { a: 0, d: 0.6, s: 4, f: 1.5 }), kit: { t: inst('timpani', 1, { a: 0, d: 0.6, s: 4, f: 1.5 }), u: inst('timpani', 0.8, { a: 0, d: 0.6, s: 4, f: 1.5 }, { rate: 1.5 }), c: CRASH }, patterns: ['t.......u.......', 't...u...t...u...', 't.u.t.u.t.u.ttuu'], fill: 'tttttttttttttttt', downbeat: 'c' },
      { name: 'pad', role: 'chord', inst: inst('strings', 0.4, ENV.pad, { echo: true, pan: 0.25 }), oct: 1, tone: 1 },
      // The cathedral's choir under the bell.
      { name: 'choir', role: 'chord', inst: inst('choirOoh', 0.5, ENV.padSlow, { echo: true, pan: -0.25 }), oct: 1, tone: 2 },
    ],
  },

  // Tickmar: 120 to the minute, a tick on every beat, a music box winding.
  bossClock: {
    bpm: 120,
    beats: 4,
    key: 45,
    mode: 'harmonic',
    seed: 311,
    intro: { chords: [0], energy: 0, rest: ['box', 'pluck'] },
    sections: [
      { chords: [0, 4, 0, 4, 5, 3, 4, 0], energy: 1, motif: [0] },
      { chords: [3, 4, 5, 4, 0, 4, 1, 4], energy: 2, motif: [4] },
    ],
    parts: [
      { name: 'tick', role: 'drums', inst: inst('tick', 0.7, ENV.drum), kit: { t: inst('tick', 0.7, ENV.drum, { pan: -0.2 }), o: inst('tick', 0.55, ENV.drum, { rate: 0.75, pan: 0.2 }) }, patterns: ['t...o...t...o...', 't...o...t...o...', 't.t.o...t.t.o...'] },
      // The music box's tune: up the chord and down, then winding to the leading note.
      { name: 'box', role: 'melody', inst: inst('musicBox', 0.62, ENV.bell, { echo: true, gate: 1 }), oct: 2, rhythms: SONG, range: [0, 9], motif: [[[0, 2], [2, 2], [4, 2], [7, 2], [4, 2], [2, 2], [0, 4]], [[1, 2], [2, 2], [1, 2], [0, 2], [-1, 8]]] },
      { name: 'pluck', role: 'arp', inst: inst('pluck', 0.45, ENV.pluckShort, { pan: 0.3 }), oct: 1, tones: [0, 2, 1, 2], rhythm: 'x.x.x.x.x.x.x.x.' },
      { name: 'bass', role: 'bass', inst: BASS, oct: 0, patterns: ['r...r...r...r...', 'r...r...f...r...', 'r.r.r.r.f.f.r.r.', 'r...r...a...a...'] },
      { name: 'kit', role: 'drums', inst: KICK, kit: { k: KICK }, patterns: ['k...............', 'k.......k.......', 'k...k...k...k...'] },
      { name: 'hats', role: 'drums', inst: HAT, kit: { h: HAT }, patterns: ['................', '..h...h...h...h.', '..h...h...h...h.'] },
    ],
  },

  // Vesperon: a harpsichord's arpeggio over the throne's organ, in three, violins above.
  bossBlood: {
    bpm: 150,
    beats: 3,
    key: 38,
    mode: 'harmonic',
    seed: 321,
    intro: { chords: [4, 4], energy: 1, rest: ['organ'] },
    sections: [
      { chords: [0, 0, 5, 5, 3, 3, 4, 4], energy: 1, motif: [0] },
      { chords: [0, 3, 4, 0, 5, 1, 4, 4], energy: 2, motif: [0] },
      { chords: [5, 5, 3, 3, 1, 1, 4, 4], energy: 1, vary: 8 },
    ],
    parts: [

      { name: 'harpsichord', role: 'arp', inst: inst('harpsichord', 0.72, ENV.pluckShort, { pan: 0.3 }), oct: 2, tones: [0, 1, 2, 3, 2, 1], rhythm: 'x.x.x.x.x.x.' },
      // The organ's mordent on the octave, then a run down the scale.
      { name: 'organ', role: 'melody', inst: inst('organ', 0.62, ENV.organ, { echo: true, gate: 0.95 }), oct: 1, rhythms: WALTZ, range: [2, 10], motif: [[[7, 2], [6, 2], [7, 8]], [[4, 2], [3, 2], [2, 2], [1, 2], [0, 4]]] },
      { name: 'organ2', role: 'chord', inst: inst('organ', 0.44, ENV.organ, { echo: true, pan: -0.25 }), oct: 1, tone: 1 },
      { name: 'pedal', role: 'bass', inst: inst('organ', 0.6, ENV.organ), oct: 0, patterns: ['r-----------', 'r-------f---', 'r---f---f---', 'r---a---a---'] },
      { name: 'kit', role: 'drums', inst: KICK, kit: { k: KICK, s: inst('snare', 0.42, ENV.drum) }, patterns: ['k...........', 'k.......s...', 'k...s...s...'], fill: 'k...s...s.s.' },
      // Violins over the organ, a bar to a note.
      { name: 'violins', role: 'counter', inst: inst('strings', 0.4, ENV.lead, { echo: true, pan: 0.25 }), oct: 2, per: 1 },
    ],
  },

  // Morvain: string ostinato, orchestra hits on the downbeats, brass over it.
  bossKnight: {
    bpm: 152,
    beats: 4,
    key: 38,
    mode: 'harmonic',
    seed: 331,
    intro: { chords: [0, 4], energy: 2, rest: ['brass'] },
    sections: [
      { chords: [0, 0, 5, 4, 0, 0, 3, 4], energy: 1, motif: [0] },
      { chords: [5, 3, 0, 4, 5, 1, 4, 4], energy: 2, motif: [2] },
      { chords: [0, 4, 3, 4, 0, 5, 1, 4], energy: 2, vary: 9, motif: [0] },
    ],
    parts: [

      { name: 'ostinato', role: 'arp', inst: inst('stringsStacc', 0.55, ENV.pluckShort, { pan: -0.25 }), oct: 2, tones: [0, 0, 2, 0, 1, 0, 2, 0], rhythm: 'xxxxxxxxxxxxxxxx' },
      // A knight's call: the fifth twice, the octave, and down to the fifth again -
      // an octave over the strings' ostinato, so it carries.
      { name: 'brass', role: 'melody', inst: inst('brassStab', 0.7, ENV.brass, { echo: true, gate: 0.88 }), oct: 2, rhythms: DRIVE, range: [-2, 6], motif: [[[4, 3], [4, 1], [7, 4], [6, 2], [5, 2], [4, 4]], [[5, 4], [4, 2], [3, 2], [4, 8]]] },
      { name: 'hits', role: 'drums', inst: inst('orchHit', 0.85, ENV.drum), kit: { o: inst('orchHit', 0.85, ENV.drum, { echo: true }) }, patterns: ['o.....o...o.....', 'o.....o...o.....', 'o.....o...o...o.'], phrase: 4 },
      { name: 'bass', role: 'bass', inst: BASS, oct: 0, patterns: ['r.r.r.r.r.r.r.r.', 'rrrRrrrRrrrRrrrR', 'rrRrrrRrrrRrfrRr', 'r.r.r.r.aaaaaaaa'] },
      { name: 'kit', role: 'drums', inst: KICK, kit: { k: KICK, s: SNARE, g: inst('snare', 0.32, ENV.drum) }, patterns: ['k...s.g.k...s...', 'k..gs...k..gs.g.', 'k.ggs.g.k.ggs.gg'], fill: 'sgsgsgsgSgsgSSSS' },
      { name: 'crash', role: 'drums', inst: CRASH, kit: { c: CRASH, h: HAT }, patterns: ['h...h...h...h...', 'h.h.h.h.h.h.h.h.', 'h.h.h.h.h.h.h.h.'], downbeat: 'c' },
    ],
  },

  // Umbra: your shadow, faster still, its lead running backwards.
  bossShadow: {
    bpm: 160,
    beats: 4,
    key: 35,
    mode: 'phrygian',
    seed: 341,
    intro: { chords: [0], energy: 2, rest: ['rev', 'counter'] },
    sections: [
      { chords: [0, 3, 2, 0, 3, 0, 1, 5], energy: 1, quote: [0], motif: [4] },
      { chords: [3, 1, 0, 6, 3, 2, 6, 5], energy: 2, motif: [4] },
    ],
    parts: [

      // The hero's figure from the title, first on the hero's own lute, then upside
      // down on the shadow's lead, every note of it swelling backwards.
      { name: 'rev', role: 'melody', inst: inst('revLead', 0.7, ENV.drum, { echo: true }), oct: 2, rhythms: [[8, 8], [8, 4, 4], [4, 4, 8], [16]], range: [0, 7], motif: stretch(mirror(HERO, 3.5), 2, 16), quote: stretch(HERO, 2, 16), quoteInst: inst('lute', 0.6, ENV.pluck, { echo: true, gate: 1 }) },
      { name: 'counter', role: 'counter', inst: inst('pulse', 0.42, ENV.lead, { echo: true, pan: 0.3 }), oct: 0, per: 4 },
      { name: 'swell', role: 'drums', inst: inst('revCymbal', 0.42, ENV.drum), kit: { r: inst('revCymbal', 0.42, ENV.drum, { pan: -0.3 }) }, patterns: ['................', '................', '........r.......'], phrase: 4, fill: '........r.......' },
      { name: 'bass', role: 'bass', inst: inst('bass', 1, ENV.bass, { gate: 0.92 }), oct: 0, patterns: ['rrrrrrrrrrrrrrrr', 'rrRrrrRrrrRrrrRr', 'rrRrrrRrfrRrfrRr', 'rrrrrrrraaaaaaaa'] },
      { name: 'kit', role: 'drums', inst: KICK, kit: { k: KICK, t: TOM, u: TOM_HI }, patterns: ['k...t...k...t...', 'k.k.t...k.k.t.u.', 'k.k.t.u.k.k.t.uu'], fill: 'k.k.t.t.uuttuutt' },
      { name: 'low', role: 'chord', inst: inst('strings', 0.36, ENV.pad, { pan: -0.2 }), oct: 0, tone: 0 },
    ],
  },

  // The Splitterwächter: crystal mallets over the rift's bowed glass, a kick and a hat beneath.
  bossShard: {
    bpm: 118,
    beats: 4,
    key: 40,
    mode: 'lydian',
    seed: 351,
    intro: { chords: [0], energy: 1, rest: ['crystal'] },
    sections: [
      { chords: [0, 1, 0, 1, 4, 5, 1, 4], energy: 1, motif: [0] },
      { chords: [5, 4, 0, 1, 5, 4, 1, 1], energy: 2, motif: [2] },
    ],
    parts: [

      // A splinter flicking round the fifth, then the lydian second's chord.
      { name: 'crystal', role: 'melody', inst: inst('crystal', 0.75, ENV.bell, { echo: true, gate: 1 }), oct: 2, rhythms: SONG, motif: [[[4, 2], [3, 2], [4, 2], [7, 2], [6, 4], [4, 4]], [[1, 4], [3, 4], [5, 8]]] },
      { name: 'glass', role: 'chord', inst: inst('bowedGlass', 0.62, ENV.padSlow, { echo: true, pan: -0.2 }), oct: 2, tone: 1 },
      { name: 'glass2', role: 'chord', inst: inst('bowedGlass', 0.52, ENV.padSlow, { echo: true, pan: 0.2 }), oct: 1, tone: 2 },
      { name: 'arp', role: 'arp', inst: inst('crystal', 0.4, ENV.pluckShort, { pan: 0.35 }), oct: 2, tones: [0, 2, 1, 3], rhythm: 'x..x..x.x..x..x.' },
      { name: 'bass', role: 'bass', inst: inst('bass', 0.6, ENV.bass, { gate: 0.6 }), oct: 0, patterns: ['r.......r.......', 'r...r...r...f...', 'r.r.r.r.f.f.r.r.', 'r...r...a...a...'] },
      { name: 'kit', role: 'drums', inst: KICK, kit: { k: KICK, h: inst('hat', 0.28, ENV.drum, { gate: 0.5, pan: 0.2 }) }, patterns: ['k.......k.......', 'k...h...k...h...', 'k.h.h.h.k.h.h.h.'] },
    ],
  },

  // The Fünfkronige: five horns, a war drum. Harmonic minor.
  bossHydra: {
    bpm: 140,
    beats: 4,
    key: 36,
    mode: 'harmonic',
    seed: 361,
    intro: { chords: [0, 4], energy: 2, rest: ['horn', 'strings'] },
    sections: [
      { chords: [0, 0, 5, 5, 3, 3, 4, 4], energy: 1, motif: [0] },
      { chords: [0, 5, 3, 4, 1, 1, 4, 4], energy: 2, motif: [0] },
    ],
    parts: [

      // A horn call up the chord, and the leading note forcing its way home.
      { name: 'horn', role: 'melody', inst: inst('horn', 0.9, ENV.brass, { echo: true, gate: 0.9 }), oct: 2, rhythms: MARCH, range: [-1, 7], motif: [[[0, 2], [0, 2], [4, 4], [2, 2], [4, 2], [7, 4]], [[5, 4], [4, 4], [5, 2], [6, 2], [7, 4]]] },
      { name: 'horns', role: 'chord', inst: inst('horn', 0.66, ENV.stab, { pan: -0.3 }), oct: 1, tone: 1, rhythm: 'x.....x...x.....' },
      { name: 'horns2', role: 'chord', inst: inst('horn', 0.6, ENV.stab, { pan: 0.3 }), oct: 1, tone: 2, rhythm: 'x.....x...x.....' },
      { name: 'bass', role: 'bass', inst: inst('bass', 1, ENV.bass, { gate: 0.92 }), oct: 0, patterns: ['r.r.r.r.r.r.r.r.', 'r.rRr.rRr.rRr.rR', 'rrrRrrrRrrrRfffR', 'r.r.r.r.aaaaaaaa'] },
      { name: 'war', role: 'drums', inst: inst('warDrum', 1, ENV.drum), kit: { w: inst('warDrum', 1, ENV.drum), s: inst('snare', 0.5, ENV.drum) }, patterns: ['w.......w...s...', 'w.....w.w...s...', 'w.w...w.w.w.s.s.'], fill: 'w.w.s.s.wws.ssss' },
      { name: 'cymbals', role: 'drums', inst: CRASH, kit: { c: CRASH }, patterns: ['................'], downbeat: 'c' },
    ],
  },

  // The Prismarch: a glass bell over the hoard's celesta, lydian, with a bass and a kit under them.
  bossCrystal: {
    bpm: 126,
    beats: 4,
    key: 43,
    mode: 'lydian',
    seed: 371,
    intro: { chords: [0], energy: 1, rest: ['bell'] },
    sections: [
      { chords: [0, 1, 4, 0, 5, 1, 4, 4], energy: 1, motif: [0] },
      { chords: [3, 1, 5, 4, 3, 1, 0, 0], energy: 2, motif: [6] },
    ],
    parts: [

      // Light split into its colours: the chord up and back, then the lydian fourth.
      { name: 'bell', role: 'melody', inst: inst('glassBell', 0.75, ENV.bell, { echo: true, gate: 1 }), oct: 2, rhythms: DRIVE, motif: [[[0, 2], [4, 2], [7, 2], [4, 2], [3, 4], [2, 4]], [[1, 2], [3, 2], [5, 4], [4, 8]]] },
      { name: 'celesta', role: 'arp', inst: inst('celesta', 0.55, ENV.pluckShort, { pan: 0.3 }), oct: 2, tones: [0, 1, 2, 3, 2, 1], rhythm: 'x.x.x.x.x.x.x.x.' },
      { name: 'pad', role: 'chord', inst: inst('strings', 0.42, ENV.pad, { echo: true }), oct: 1, tone: 2 },
      { name: 'bass', role: 'bass', inst: inst('bass', 0.7, ENV.bass, { gate: 0.6 }), oct: 0, patterns: ['r.......r.......', 'r...r...r...f...', 'r.r.r.r.f.f.r.r.', 'r...r...a...a...'] },
      { name: 'chime', role: 'counter', inst: inst('celesta', 0.36, ENV.bell, { echo: true, pan: -0.35 }), oct: 2, per: 2 },
      { name: 'kit', role: 'drums', inst: KICK, kit: { k: KICK, h: inst('hat', 0.26, ENV.drum, { gate: 0.5, pan: 0.2 }) }, patterns: ['k.......k.......', 'k.......k...h...', 'k...h...k...h...'] },
    ],
  },
};

/**
 * The balance of each fight's parts, by channel: measured, every part of
 * every fight rendered alone, and set so that no two fights sound alike - the
 * mean spectrum of each more than 3 dB from any other's, where the bare
 * sketches had pairs within 2.6 - without any lead dropping more than 2 dB.
 */
const PART_GAIN: Partial<Record<TrackName, number[]>> = {
  bossMire: [1.8, 1.59, 0.5, 0.55, 0.552],
  bossBoar: [1.45, 0.614, 1.532, 1.253, 0.757],
  bossGold: [1.198, 0.584, 1.298, 0.5, 0.894],
  bossJester: [1.8, 0.788, 0.714, 1.62, 0.5, 1.044],
  bossStone: [1.285, 0.983, 0.5, 1.184, 0.65, 0.903],
  bossGloom: [2.5, 1.0, 1.263, 0.577, 0.5, 0.5],
  bossWeb: [0.5, 1.8, 1.625, 0.605, 0.5],
  bossFire: [0.78, 0.5, 0.5, 1.209, 0.72, 0.527],
  bossTwins: [0.78, 1.435, 1.8, 0.614, 0.578],
  bossTide: [0.776, 1.487, 0.851, 0.716, 0.614, 0.774],
  bossGargoyle: [1.26, 1.322, 0.523, 0.4, 0.7],
  bossClock: [1.298, 1.532, 0.552, 0.5, 0.5, 1.643],
  bossBlood: [0.45, 2.0, 0.566, 0.519, 0.4, 0.612],
  bossKnight: [0.64, 1.17, 0.5, 1.331, 1.8, 1.383],
  bossShadow: [2.1, 1.2, 0.654, 1.781, 0.7, 1.145],
  bossShard: [1.0, 1.18, 1.0, 1.1, 1.0, 0.9],
  bossHydra: [0.986, 0.727, 1.8, 1.362, 0.5, 0.833],
  bossCrystal: [1.974, 1.35, 0.455, 0.755, 1.087, 0.737],
};

function scaled(i: Inst, g: number): Inst {
  return { ...i, vol: i.vol * g };
}

for (const [name, gains] of Object.entries(PART_GAIN) as [TrackName, number[]][]) {
  SKETCHES[name].parts = SKETCHES[name].parts.map((part, ch) => {
    const g = gains[ch] ?? 1;
    if (part.role === 'drums') {
      const kit: Record<string, Inst> = {};
      for (const [k, v] of Object.entries(part.kit)) kit[k] = scaled(v, g);
      return { ...part, inst: scaled(part.inst, g), kit };
    }
    if (part.role === 'melody' && part.quoteInst) return { ...part, inst: scaled(part.inst, g), quoteInst: scaled(part.quoteInst, g) };
    return { ...part, inst: scaled(part.inst, g) };
  });
}

/**
 * Each piece's level on the music bus, measured so the zones sit at about
 * -24 LUFS and the fights at about -22 (tools/verify-audio.mjs renders and
 * checks them) - Arachna's at -23: all of her plucked parts strike together
 * on one downbeat a loop, and that peak wants the room.
 */
export const TRACK_LEVEL: Record<TrackName, number> = {
  title: 0.317,
  forest: 0.134,
  ruins: 0.131,
  caverns: 0.214,
  drowned: 0.155,
  castle: 0.18,
  throne: 0.145,
  rift: 0.182,
  lair: 0.165,
  crystal: 0.147,
  bossMire: 0.144,
  bossShard: 0.194,
  bossStone: 0.165,
  bossFire: 0.211,
  bossTide: 0.162,
  bossBlood: 0.161,
  bossKnight: 0.155,
  bossHydra: 0.136,
  bossCrystal: 0.161,
  bossGold: 0.28,
  bossWeb: 0.302,
  bossShadow: 0.121,
  bossBoar: 0.146,
  bossTwins: 0.131,
  bossClock: 0.169,
  bossJester: 0.139,
  bossGloom: 0.11,
  bossGargoyle: 0.186,
};

export const TRACK_NAMES = Object.keys(SKETCHES) as TrackName[];
