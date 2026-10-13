import type { Adsr } from './dsp';
import type { SampleId } from './samples';

/**
 * The music, from a short description to every note.
 *
 * A piece is described the way a composer of the era sketched one for the
 * sound programmer: a key and a mode, a tempo, the chord of every bar,
 * section by section, and up to six parts - one per channel - each an
 * instrument from the palette and a way of playing: a melody, a line under
 * it, a broken chord, a held chord, a bass, the drums. compose() turns that
 * into a score: every note, with its channel, its pitch, its length and its
 * level, from the first bar of the intro to the end of the loop.
 *
 * The melodies are written here, from the chords, by rules a songwriter
 * would recognise: phrases of four bars, a rhythm stated and answered, the
 * strong beats on the chord, steps between them, a question that ends open
 * and an answer that comes home. They are seeded, so a piece is the same
 * every time it plays. A melody can also carry a motif written by hand, a
 * bar or two of its own: where a section asks for it, it is played as
 * written, and the rules write the rest of the line around it.
 */

export const MODES = {
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  phrygianDominant: [0, 1, 4, 5, 7, 8, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
} as const;

export type Mode = keyof typeof MODES;

/** An instrument as a part plays it: a sample, a level, an envelope, and how it sits in the mix. */
export interface Inst {
  s: SampleId;
  vol: number;
  adsr: Adsr;
  echo?: boolean;
  pan?: number;
  /** The share of a note's length before key-off; 1 holds until the next note. */
  gate?: number;
  /** [Hz, depth in semitones, delay in seconds]. */
  vib?: readonly [number, number, number];
  /** For drums and noise: the rate to play at, instead of a pitch. */
  rate?: number;
}

/** One note of a score. */
export interface Ev {
  /** Sixteenth-note steps from the start of the piece. */
  step: number;
  ch: number;
  inst: Inst;
  /** A pitched note's MIDI number; a drum plays at its instrument's rate. */
  midi?: number;
  /** Steps until key-off. */
  len: number;
  /** An accent or a ghost: multiplies the instrument's level. */
  vel: number;
}

export interface Score {
  events: Ev[];
  /** Steps in the whole piece, intro and loop. */
  length: number;
  /** Where the loop begins, after the intro. */
  loopStep: number;
  bpm: number;
  stepsPerBar: number;
  /** The bars of the loop, for the checks. */
  loopBars: number;
  /** The samples the piece uses. */
  samples: SampleId[];
}

/* ------------------------------------------------------------ the sketch */

/**
 * A motif written by hand, bar by bar: each note a scale step from the tonic
 * in the melody's octave and a length in steps (a negative length rests).
 * Where a section states it, the melody plays it as written.
 */
export type Motif = readonly (readonly (readonly [number, number])[])[];

export interface Section {
  /** The chord of each bar, as the scale step it is built on (0 is the tonic). */
  chords: number[];
  /** 0 sparse, 1 normal, 2 full: how much each part plays. */
  energy?: 0 | 1 | 2;
  /** Parts that rest through this section. */
  rest?: string[];
  /** A seed of its own for the melody, so a returning section can come back changed. */
  vary?: number;
  /** The bars (of this section) where the melody states its motif. */
  motif?: number[];
  /** The bars where it quotes its quote instead. */
  quote?: number[];
}

interface PartBase {
  name: string;
  inst: Inst;
}

/** A melody: phrases of four bars over the chords. */
export interface MelodyPart extends PartBase {
  role: 'melody';
  /** The octave the melody's middle sits in, above the key. */
  oct: number;
  /** Bar rhythms, in steps (negative: a rest); the melody states and answers them. */
  rhythms: number[][];
  /** How far it may stray from its middle, in scale steps. */
  range?: [number, number];
  /** How often a step becomes a leap. */
  leap?: number;
  /** Plays only in bars where this is true (bar index within the section): call and response. */
  bars?: (bar: number) => boolean;
  /** The piece's own figure, stated where a section asks for it. */
  motif?: Motif;
  /** Another piece's figure, quoted where a section asks for it... */
  quote?: Motif;
  /** ...on that piece's own instrument, if it has one. */
  quoteInst?: Inst;
}

/** A slower line under the melody, on the chord's tones. */
export interface CounterPart extends PartBase {
  role: 'counter';
  oct: number;
  /** Notes per bar. */
  per: number;
  /** Plays only in bars where this is true. */
  bars?: (bar: number) => boolean;
}

/** A broken chord. */
export interface ArpPart extends PartBase {
  role: 'arp';
  oct: number;
  /** Which chord tones, in order: 0 root, 1 third, 2 fifth, 3 octave, 4 the octave's third... */
  tones: number[];
  /** One character per step of a bar: x plays the next tone, . rests. */
  rhythm: string;
}

/** A held chord tone, one per bar: a pad, or one voice of one. */
export interface ChordPart extends PartBase {
  role: 'chord';
  oct: number;
  /** Which chord tone it prefers: 0 root, 1 third, 2 fifth. It moves to the nearest. */
  tone: number;
  /** One character per step: x strikes, - holds, . rests. Defaults to one long note. */
  rhythm?: string;
}

/**
 * A bass, one character per step of a bar: r the root, R its octave, f the
 * fifth, 3 the third, 7 the seventh, a a step towards the next bar's root,
 * - holds, . rests. Several patterns: by energy, and the last for the end of
 * a phrase.
 */
export interface BassPart extends PartBase {
  role: 'bass';
  oct: number;
  patterns: string[];
}

/**
 * Drums on one channel: one character per step for each kit piece, the
 * patterns by energy (0, 1, 2), and a fill for the last bar of every phrase.
 */
export interface DrumPart extends PartBase {
  role: 'drums';
  kit: Record<string, Inst>;
  patterns: string[];
  fill?: string;
  /** Bars per phrase, for the fill: 4 by default. */
  phrase?: number;
  /** A kit piece struck on the first beat of every section. */
  downbeat?: string;
}

export type Part = MelodyPart | CounterPart | ArpPart | ChordPart | BassPart | DrumPart;

export interface Sketch {
  bpm: number;
  /** Beats per bar. */
  beats: 3 | 4;
  /** MIDI number of the tonic in the bass's octave. */
  key: number;
  mode: Mode;
  seed: number;
  /** Bars played once before the loop: a count-in, a stinger. */
  intro?: Section;
  /** The loop, in order. */
  sections: Section[];
  /** At most six: one per music channel. */
  parts: Part[];
}

/* ------------------------------------------------------------ arithmetic */

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The scale step `deg` as a MIDI number, `oct` octaves above the key. */
function noteOf(sk: Sketch, deg: number, oct: number): number {
  const scale = MODES[sk.mode];
  const o = Math.floor(deg / 7);
  const i = ((deg % 7) + 7) % 7;
  return sk.key + scale[i] + 12 * (o + oct);
}

/** The chord tones on step `root`, as scale steps, spread over a few octaves. */
function chordTones(root: number): number[] {
  const out: number[] = [];
  for (let o = -2; o <= 3; o++) for (const t of [0, 2, 4]) out.push(root + t + o * 7);
  return out;
}

function nearest(options: number[], to: number, avoid?: number): number {
  let best = options[0];
  let bestD = Infinity;
  for (const o of options) {
    const d = Math.abs(o - to) + (o === avoid ? 0.6 : 0);
    if (d < bestD) {
      best = o;
      bestD = d;
    }
  }
  return best;
}

/* ------------------------------------------------------------ the parts */

interface Bar {
  /** Where the bar starts, in steps from the piece's start. */
  step: number;
  chord: number;
  next: number;
  energy: 0 | 1 | 2;
  /** Index of the bar in its section, and of its section. */
  inSection: number;
  section: number;
  sectionBars: number;
  rest: Set<string>;
  vary: number;
  /** The last bar of a phrase. */
  phraseEnd: boolean;
  /** Where in the section the melody's motif starts, and where its quote. */
  motif: readonly number[];
  quote: readonly number[];
}

/** The bar of the motif (or the quote) this bar plays, and on what, if a statement of it covers this bar. */
function motifBar(part: MelodyPart, bar: Bar): { notes: readonly (readonly [number, number])[]; inst: Inst } | null {
  for (const [m, starts, inst] of [
    [part.motif, bar.motif, part.inst],
    [part.quote, bar.quote, part.quoteInst ?? part.inst],
  ] as const) {
    if (!m) continue;
    for (const start of starts) {
      const k = bar.inSection - start;
      if (k >= 0 && k < m.length) return { notes: m[k], inst };
    }
  }
  return null;
}

function melody(sk: Sketch, part: MelodyPart, bars: Bar[], spb: number, ch: number, out: Ev[]): void {
  const [lo, hi] = part.range ?? [-3, 8];
  let prev = 2;
  // Section by section, phrase by phrase.
  let i = 0;
  while (i < bars.length) {
    const first = bars[i];
    const rnd = rng(sk.seed * 31 + first.section * 7 + first.vary * 101 + ch);
    const r0 = part.rhythms[Math.floor(rnd() * part.rhythms.length)];
    const r1 = part.rhythms[Math.floor(rnd() * part.rhythms.length)];
    const phraseLen = Math.min(4, first.sectionBars - first.inSection);
    const phraseIndex = Math.floor(first.inSection / 4);
    const contour = [rnd() < 0.5 ? 1 : -1, rnd() < 0.5 ? 1 : -1];
    for (let b = 0; b < phraseLen; b++) {
      const bar = bars[i + b];
      if (!bar || bar.rest.has(part.name) || (part.bars && !part.bars(bar.inSection))) continue;
      const written = motifBar(part, bar);
      if (written) {
        // The motif, as written: the line goes on from where it ends.
        let pos = 0;
        for (const [deg, d] of written.notes) {
          if (d > 0) {
            out.push({ step: bar.step + pos, ch, inst: written.inst, midi: noteOf(sk, deg, part.oct), len: d, vel: (pos === 0 ? 1 : 0.92) * (bar.energy === 2 ? 1 : 0.94) });
            prev = Math.max(lo, Math.min(hi, deg));
          }
          pos += Math.abs(d);
        }
        continue;
      }
      const cadence = b === phraseLen - 1;
      let rhythm = b % 2 === 0 ? r0 : r1;
      if (cadence) {
        // The phrase's last bar: its first note, then one long one.
        const firstCell = Math.abs(r0[0]) < spb ? Math.abs(r0[0]) : spb / 2;
        rhythm = [firstCell, spb - firstCell];
      }
      // Fewer notes when the section is quiet: every other short note merges.
      if (bar.energy === 0 && !cadence) {
        const merged: number[] = [];
        for (const d of rhythm) {
          if (merged.length && Math.abs(d) <= 2 && merged[merged.length - 1] > 0) merged[merged.length - 1] += Math.abs(d);
          else merged.push(d);
        }
        rhythm = merged;
      }
      let pos = 0;
      const dir0 = contour[b % 2] * (phraseIndex % 2 === 1 ? -1 : 1);
      rhythm.forEach((d, n) => {
        const len = Math.abs(d);
        if (d < 0) {
          pos += len;
          return;
        }
        const step = bar.step + pos;
        // The strong beats: one and three in four, the one in three.
        const strong = spb === 16 ? pos % 8 === 0 : pos === 0;
        const tones = chordTones(bar.chord);
        let deg: number;
        if (cadence && n === rhythm.length - 1) {
          // The answer comes home to the root; the question stops on the fifth or third.
          const home = phraseIndex % 2 === 1 || b + i === bars.length - 1 ? bar.chord : bar.chord + (rnd() < 0.5 ? 4 : 2);
          deg = nearest([home - 7, home, home + 7], prev);
        } else if (strong) {
          const dir = n === 0 ? dir0 : rnd() < 0.7 ? dir0 : -dir0;
          deg = nearest(tones, prev + dir * (rnd() < (part.leap ?? 0.2) ? 3 : 1), prev);
        } else {
          const dir = n % 2 === 0 ? dir0 : rnd() < 0.6 ? dir0 : -dir0;
          deg = prev + dir * (rnd() < (part.leap ?? 0.2) * 0.5 ? 2 : 1);
        }
        if (deg > hi) deg -= rnd() < 0.5 ? 2 : 3;
        if (deg < lo) deg += rnd() < 0.5 ? 2 : 3;
        deg = Math.max(lo - 1, Math.min(hi + 1, deg));
        prev = deg;
        out.push({ step, ch, inst: part.inst, midi: noteOf(sk, deg, part.oct), len, vel: (strong ? 1 : 0.86) * (bar.energy === 2 ? 1 : 0.94) });
        pos += len;
      });
    }
    i += phraseLen;
  }
}

function counter(sk: Sketch, part: CounterPart, bars: Bar[], spb: number, ch: number, out: Ev[]): void {
  let prev = 2;
  for (const bar of bars) {
    if (bar.rest.has(part.name) || (part.bars && !part.bars(bar.inSection))) continue;
    const per = bar.energy === 0 ? 1 : part.per;
    const len = Math.floor(spb / per);
    for (let k = 0; k < per; k++) {
      const tones = chordTones(bar.chord);
      // The third and fifth before the root: a line, not a bass.
      const want = k % 2 === 0 ? prev + (bar.inSection % 2 === 0 ? 1 : -1) : prev - 1;
      const deg = nearest(tones.filter((t) => t !== bar.chord && t !== bar.chord - 7 && t !== bar.chord + 7), want, prev);
      prev = Math.max(-2, Math.min(8, deg));
      out.push({ step: bar.step + k * len, ch, inst: part.inst, midi: noteOf(sk, prev, part.oct), len, vel: k === 0 ? 1 : 0.9 });
    }
  }
}

function arp(sk: Sketch, part: ArpPart, bars: Bar[], spb: number, ch: number, out: Ev[]): void {
  let n = 0;
  for (const bar of bars) {
    if (bar.rest.has(part.name)) continue;
    const hits: number[] = [];
    for (let s = 0; s < spb; s++) if (part.rhythm[s % part.rhythm.length] === 'x') hits.push(s);
    // Quiet sections: every other hit.
    const play = bar.energy === 0 ? hits.filter((_, k) => k % 2 === 0) : hits;
    play.forEach((s, k) => {
      const t = part.tones[n++ % part.tones.length];
      const deg = bar.chord + [0, 2, 4][t % 3] + 7 * Math.floor(t / 3);
      const next = play[k + 1] ?? spb;
      out.push({ step: bar.step + s, ch, inst: part.inst, midi: noteOf(sk, deg, part.oct), len: next - s, vel: s === 0 ? 1 : s % 4 === 0 ? 0.92 : 0.82 });
    });
  }
}

function chord(sk: Sketch, part: ChordPart, bars: Bar[], spb: number, ch: number, out: Ev[]): void {
  let prev = [0, 2, 4][part.tone];
  for (const bar of bars) {
    if (bar.rest.has(part.name)) continue;
    // Its own chord tone where that is close; otherwise whichever is nearest.
    const tones = chordTones(bar.chord);
    const own = nearest(
      tones.filter((t) => (((t - bar.chord) % 7) + 7) % 7 === [0, 2, 4][part.tone]),
      prev,
    );
    const pick = Math.abs(own - prev) <= 2 ? own : nearest(tones, prev);
    prev = pick;
    const rhythm = part.rhythm ?? 'x' + '-'.repeat(spb - 1);
    let start = -1;
    for (let s = 0; s <= spb; s++) {
      const c = s < spb ? rhythm[s % rhythm.length] : 'x';
      if (c === 'x' || c === '.' || s === spb) {
        if (start >= 0) out.push({ step: bar.step + start, ch, inst: part.inst, midi: noteOf(sk, pick, part.oct), len: s - start, vel: start === 0 ? 1 : 0.9 });
        start = c === 'x' && s < spb ? s : -1;
      }
    }
  }
}

function bass(sk: Sketch, part: BassPart, bars: Bar[], spb: number, ch: number, out: Ev[]): void {
  for (const bar of bars) {
    if (bar.rest.has(part.name)) continue;
    const pats = part.patterns;
    const pat = bar.phraseEnd && pats.length > 3 ? pats[3] : pats[Math.min(pats.length - 1, bar.energy)];
    let start = -1;
    let deg = bar.chord;
    for (let s = 0; s <= spb; s++) {
      const c = s < spb ? pat[s % pat.length] : '.';
      if (c === '-') continue;
      if (start >= 0) out.push({ step: bar.step + start, ch, inst: part.inst, midi: noteOf(sk, deg, part.oct), len: s - start, vel: start === 0 ? 1 : 0.88 });
      start = -1;
      if (s >= spb || c === '.') continue;
      start = s;
      switch (c) {
        case 'R':
          deg = bar.chord + 7;
          break;
        case 'f':
          deg = bar.chord + 4;
          break;
        case '3':
          deg = bar.chord + 2;
          break;
        case '7':
          deg = bar.chord + 6;
          break;
        case 'a':
          deg = bar.next + (bar.next > bar.chord ? -1 : 1);
          break;
        default:
          deg = bar.chord;
      }
      // The bass stays low: a root above the fifth comes down an octave.
      if (deg > 4 && c !== 'R') deg -= 7;
    }
  }
}

function drums(part: DrumPart, bars: Bar[], spb: number, ch: number, out: Ev[]): void {
  const phrase = part.phrase ?? 4;
  for (const bar of bars) {
    if (bar.rest.has(part.name)) continue;
    const fill = part.fill && (bar.inSection + 1) % phrase === 0;
    const pat = fill ? (part.fill as string) : part.patterns[Math.min(part.patterns.length - 1, bar.energy)];
    const hits: { s: number; c: string }[] = [];
    for (let s = 0; s < spb; s++) {
      const c = pat[s % pat.length];
      if (c !== '.' && c !== '-' && part.kit[c.toLowerCase()]) hits.push({ s, c });
    }
    if (part.downbeat && bar.inSection === 0 && part.kit[part.downbeat]) {
      const at = hits.findIndex((h) => h.s === 0);
      if (at >= 0) hits[at] = { s: 0, c: part.downbeat.toUpperCase() };
      else hits.unshift({ s: 0, c: part.downbeat.toUpperCase() });
    }
    hits.forEach((h, k) => {
      const next = hits[k + 1]?.s ?? spb;
      const inst = part.kit[h.c.toLowerCase()];
      // A capital is an accent; the ghost notes are the quiet ones.
      const vel = h.c === h.c.toUpperCase() && h.c !== h.c.toLowerCase() ? 1 : 0.8;
      out.push({ step: bar.step + h.s, ch, inst, len: next - h.s, vel });
    });
  }
}

/** The sketch, written out. */
export function compose(sk: Sketch): Score {
  const spb = sk.beats * 4;
  const bars: Bar[] = [];
  const sections = [...(sk.intro ? [sk.intro] : []), ...sk.sections];
  const flat: { chord: number; sec: Section; inSection: number; section: number }[] = [];
  sections.forEach((sec, si) => sec.chords.forEach((c, b) => flat.push({ chord: c, sec, inSection: b, section: si })));
  flat.forEach((f, i) => {
    const next = flat[i + 1]?.chord ?? flat[sk.intro ? sk.intro.chords.length : 0].chord;
    bars.push({
      step: i * spb,
      chord: f.chord,
      next,
      energy: f.sec.energy ?? 1,
      inSection: f.inSection,
      section: f.section,
      sectionBars: f.sec.chords.length,
      rest: new Set(f.sec.rest ?? []),
      vary: f.sec.vary ?? 0,
      phraseEnd: (f.inSection + 1) % 4 === 0,
      motif: f.sec.motif ?? [],
      quote: f.sec.quote ?? [],
    });
  });
  const events: Ev[] = [];
  sk.parts.slice(0, 6).forEach((part, ch) => {
    switch (part.role) {
      case 'melody':
        melody(sk, part, bars, spb, ch, events);
        break;
      case 'counter':
        counter(sk, part, bars, spb, ch, events);
        break;
      case 'arp':
        arp(sk, part, bars, spb, ch, events);
        break;
      case 'chord':
        chord(sk, part, bars, spb, ch, events);
        break;
      case 'bass':
        bass(sk, part, bars, spb, ch, events);
        break;
      case 'drums':
        drums(part, bars, spb, ch, events);
        break;
    }
  });
  events.sort((a, b) => a.step - b.step || a.ch - b.ch);
  const length = bars.length * spb;
  const loopStep = (sk.intro?.chords.length ?? 0) * spb;
  // A note never runs past the next one on its channel, the loop's wrap included.
  for (let ch = 0; ch < 6; ch++) {
    const mine = events.filter((e) => e.ch === ch);
    mine.forEach((e, k) => {
      const next = mine[k + 1];
      const until = next ? next.step : length + (mine.find((m) => m.step >= loopStep)?.step ?? length) - loopStep;
      e.len = Math.max(1, Math.min(e.len, until - e.step));
    });
  }
  const samples = new Set<SampleId>();
  for (const e of events) samples.add(e.inst.s);
  return { events, length, loopStep, bpm: sk.bpm, stepsPerBar: spb, loopBars: bars.length - (sk.intro?.chords.length ?? 0), samples: [...samples] };
}
