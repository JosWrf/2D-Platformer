import { Outlet, Synth, midiToHz } from './synth';

/**
 * Music, written as data and played by a small step sequencer.
 *
 * Every zone has a piece of its own and every boss a fight to go with it. None
 * of it is recorded: a track is a key, a tempo, a chord per bar and a handful
 * of sixteen-step patterns, and the sequencer turns those into notes on the
 * AudioContext clock a fraction of a second ahead of time. Changing piece fades
 * the old one out while the new one comes in, so walking into a boss arena or
 * out of a zone never cuts anything off mid-note.
 *
 * Pattern strings are one character per sixteenth note, and wrap:
 *
 *   bass   x root   o octave up   f fifth   . rest
 *   arp    x the next note of the arp figure            . rest
 *   lead   0-9 a scale step above the chord's root     h hold   . rest
 *   drums  x hit   g ghost (quiet)   o open hat   l low tom   . rest
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
  | 'boss'
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
  | 'bossClock';

const SCALES = {
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  phrygianDominant: [0, 1, 4, 5, 7, 8, 10],
} as const;

interface Track {
  bpm: number;
  /** MIDI note of the tonic, in the octave the pads sit in. */
  root: number;
  scale: readonly number[];
  /** One chord per bar, as the scale step it is built on. */
  prog: number[];
  pad?: { gain: number; cutoff: number; type?: OscillatorType; wet?: number };
  bass?: { pattern: string; gain: number; style: 'soft' | 'drive' | 'pulse' };
  arp?: {
    pattern: string;
    /** Scale steps above the chord root, cycled through. */
    notes: number[];
    octave: number;
    gain: number;
    type: OscillatorType;
    decay: number;
    wet?: number;
  };
  lead?: { pattern: string; octave: number; gain: number; type: OscillatorType; wet?: number };
  /** Now and then a bell on a chord tone, high up: drips, stars, glints. */
  bells?: { chance: number; octave: number; gain: number };
  drums?: { kick?: string; snare?: string; hat?: string; tom?: string; gain?: number };
}

/* ------------------------------------------------------------------ tracks */

const TRACKS: Record<TrackName, Track> = {
  title: {
    bpm: 66,
    root: 50,
    scale: SCALES.aeolian,
    prog: [0, 5, 3, 4],
    pad: { gain: 0.05, cutoff: 1000, wet: 0.7 },
    bass: { pattern: 'x...............', gain: 0.1, style: 'soft' },
    arp: { pattern: 'x.x.x.x.x.x.x.x.', notes: [0, 2, 4, 7, 4, 2], octave: 1, gain: 0.04, type: 'triangle', decay: 0.7, wet: 0.6 },
    bells: { chance: 0.06, octave: 2, gain: 0.03 },
  },
  forest: {
    bpm: 84,
    root: 57,
    scale: SCALES.dorian,
    prog: [0, 3, 0, 6],
    pad: { gain: 0.035, cutoff: 1300, wet: 0.5 },
    bass: { pattern: 'x.......x...o...', gain: 0.1, style: 'soft' },
    arp: { pattern: 'x.x.x.x.x.x.x.x.', notes: [0, 4, 2, 4, 7, 4, 2, 4], octave: 1, gain: 0.032, type: 'triangle', decay: 0.4, wet: 0.35 },
    drums: { hat: '....x.......x..g', gain: 0.5 },
  },
  ruins: {
    bpm: 72,
    root: 52,
    scale: SCALES.phrygian,
    prog: [0, 1, 0, 6],
    pad: { gain: 0.045, cutoff: 900, wet: 0.6 },
    bass: { pattern: 'x...............', gain: 0.1, style: 'soft' },
    arp: { pattern: 'x..x..x.x..x..x.', notes: [0, 2, 4, 7, 9, 7, 4, 2], octave: 1, gain: 0.04, type: 'triangle', decay: 0.9, wet: 0.6 },
    drums: { tom: 'l...............', gain: 0.6 },
    bells: { chance: 0.03, octave: 2, gain: 0.025 },
  },
  caverns: {
    bpm: 64,
    root: 49,
    scale: SCALES.aeolian,
    prog: [0, 5, 0, 6],
    pad: { gain: 0.055, cutoff: 650, wet: 0.7 },
    bass: { pattern: 'x.......x.......', gain: 0.09, style: 'pulse' },
    arp: { pattern: 'x.......x.....x.', notes: [7, 4, 9, 2], octave: 1, gain: 0.03, type: 'sine', decay: 1.2, wet: 0.8 },
    bells: { chance: 0.1, octave: 2, gain: 0.03 },
  },
  drowned: {
    bpm: 58,
    root: 53,
    scale: SCALES.aeolian,
    prog: [0, 3, 5, 4],
    pad: { gain: 0.055, cutoff: 800, type: 'triangle', wet: 0.9 },
    bass: { pattern: 'x...............', gain: 0.09, style: 'soft' },
    bells: { chance: 0.12, octave: 1, gain: 0.035 },
  },
  castle: {
    bpm: 96,
    root: 50,
    scale: SCALES.harmonic,
    prog: [0, 5, 3, 4],
    pad: { gain: 0.035, cutoff: 1100, wet: 0.5 },
    bass: { pattern: 'x.x.x.x.x.x.x.x.', gain: 0.08, style: 'soft' },
    arp: { pattern: 'x.x.x.x.x.x.x.x.', notes: [0, 2, 4, 2], octave: 1, gain: 0.022, type: 'square', decay: 0.18, wet: 0.3 },
    drums: { tom: 'x..x..x.x.......', snare: '............g...', gain: 0.55 },
  },
  throne: {
    bpm: 56,
    root: 48,
    scale: SCALES.aeolian,
    prog: [0, 0, 5, 4],
    pad: { gain: 0.06, cutoff: 560, wet: 0.8 },
    bass: { pattern: 'x...............', gain: 0.12, style: 'soft' },
    bells: { chance: 0.04, octave: 0, gain: 0.03 },
  },
  rift: {
    bpm: 62,
    root: 59,
    scale: SCALES.aeolian,
    prog: [0, 5, 2, 6],
    pad: { gain: 0.04, cutoff: 900, type: 'triangle', wet: 0.9 },
    bass: { pattern: 'x...............', gain: 0.08, style: 'soft' },
    arp: { pattern: 'x.......x...x...', notes: [0, 4, 7, 9], octave: 1, gain: 0.028, type: 'sine', decay: 1.4, wet: 0.9 },
    bells: { chance: 0.08, octave: 1, gain: 0.03 },
  },
  lair: {
    bpm: 70,
    root: 55,
    scale: SCALES.phrygian,
    prog: [0, 1, 0, 1],
    pad: { gain: 0.04, cutoff: 700, wet: 0.6 },
    bass: { pattern: 'x.x.....x.x.....', gain: 0.1, style: 'pulse' },
    drums: { tom: 'l.........l.....', gain: 0.6 },
  },
  crystal: {
    bpm: 90,
    root: 52,
    scale: SCALES.lydian,
    prog: [0, 1, 0, 4],
    pad: { gain: 0.035, cutoff: 1500, type: 'triangle', wet: 0.7 },
    bass: { pattern: 'x.......x.......', gain: 0.08, style: 'soft' },
    arp: { pattern: 'xxxxxxxxxxxxxxxx', notes: [0, 2, 4, 7, 9, 7, 4, 2], octave: 1, gain: 0.022, type: 'sine', decay: 0.3, wet: 0.6 },
    bells: { chance: 0.08, octave: 2, gain: 0.025 },
  },

  /* Fights. Faster, with drums and a line on top. */

  boss: {
    bpm: 136,
    root: 57,
    scale: SCALES.aeolian,
    prog: [0, 5, 6, 4],
    pad: { gain: 0.035, cutoff: 1200, wet: 0.4 },
    bass: { pattern: 'x.xxx.xxx.xxx.xo', gain: 0.11, style: 'drive' },
    lead: { pattern: '0h.h2h.4hh.2h...7hh.6h.4hh.2h0h.', octave: 1, gain: 0.03, type: 'square', wet: 0.3 },
    drums: { kick: 'x.....x.x.......', snare: '....x.......x..g', hat: 'x.x.x.x.x.x.x.xo', gain: 0.9 },
  },
  bossStone: {
    bpm: 118,
    root: 52,
    scale: SCALES.phrygian,
    prog: [0, 1, 0, 6],
    pad: { gain: 0.045, cutoff: 900, wet: 0.6 },
    bass: { pattern: 'x..x..x.x..x..x.', gain: 0.12, style: 'drive' },
    lead: { pattern: '0hhh1hhh0hhh.hhh4hhh3hhh1hhh0hhh', octave: 1, gain: 0.03, type: 'sawtooth', wet: 0.5 },
    drums: { kick: 'x.......x.x.....', snare: '............x...', tom: 'x..x..l...x..l..', gain: 0.9 },
  },
  bossFire: {
    bpm: 148,
    root: 49,
    scale: SCALES.harmonic,
    prog: [0, 5, 3, 4],
    pad: { gain: 0.03, cutoff: 1400, wet: 0.35 },
    bass: { pattern: 'xoxoxoxoxoxoxoxo', gain: 0.1, style: 'drive' },
    lead: { pattern: '4h3h2h1h0hhh....7h6h4h6h7hhh....', octave: 1, gain: 0.028, type: 'sawtooth', wet: 0.3 },
    drums: { kick: 'x...x...x...x...', snare: '....x.......x..x', hat: 'xgxgxgxgxgxgxgxg', gain: 0.85 },
  },
  bossTide: {
    bpm: 116,
    root: 53,
    scale: SCALES.aeolian,
    prog: [0, 5, 3, 6],
    pad: { gain: 0.045, cutoff: 1000, type: 'triangle', wet: 0.8 },
    bass: { pattern: 'x..x..x.x..x..x.', gain: 0.11, style: 'pulse' },
    lead: { pattern: '0hh2hh4hh7hhhh..6hh4hh2hh4hhhh..', octave: 1, gain: 0.03, type: 'triangle', wet: 0.6 },
    drums: { kick: 'x.......x.......', snare: '....x.......x...', hat: '..x...x...x...x.', gain: 0.8 },
    bells: { chance: 0.12, octave: 2, gain: 0.025 },
  },
  bossBlood: {
    bpm: 128,
    root: 50,
    scale: SCALES.harmonic,
    prog: [0, 3, 4, 0],
    pad: { gain: 0.03, cutoff: 1500, type: 'square', wet: 0.6 },
    bass: { pattern: 'x.......x...x...', gain: 0.12, style: 'drive' },
    arp: { pattern: 'xxxxxxxxxxxxxxxx', notes: [0, 2, 4, 7, 4, 2, 0, 2], octave: 1, gain: 0.026, type: 'square', decay: 0.1, wet: 0.35 },
    drums: { kick: 'x.......x.x.....', snare: '....x.......x...', hat: 'x...x...x...x...', gain: 0.8 },
  },
  bossKnight: {
    bpm: 140,
    root: 48,
    scale: SCALES.harmonic,
    prog: [0, 5, 3, 4],
    pad: { gain: 0.04, cutoff: 1300, wet: 0.45 },
    bass: { pattern: 'x.xox.xox.xox.xo', gain: 0.11, style: 'drive' },
    lead: { pattern: '0h2h4h7hhh6h4h2h4hhh2h1h0hhh....', octave: 1, gain: 0.03, type: 'sawtooth', wet: 0.35 },
    drums: { kick: 'x.....x.x.....x.', snare: '....x.......x.gg', hat: 'x.x.x.x.x.x.x.x.', gain: 0.95 },
  },
  bossHydra: {
    bpm: 152,
    root: 55,
    scale: SCALES.phrygianDominant,
    prog: [0, 1, 0, 6],
    pad: { gain: 0.04, cutoff: 1100, wet: 0.5 },
    bass: { pattern: 'xoxoxoxoxoxoxoxo', gain: 0.1, style: 'drive' },
    lead: { pattern: '0h1h2hhh1h0h6hhh0h1h2h4h2h1h0hhh', octave: 1, gain: 0.03, type: 'sawtooth', wet: 0.4 },
    drums: { kick: 'x..x..x.x..x..x.', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', tom: '..............ll', gain: 0.9 },
  },
  bossCrystal: {
    bpm: 132,
    root: 52,
    scale: SCALES.aeolian,
    prog: [0, 5, 2, 6],
    pad: { gain: 0.035, cutoff: 1600, type: 'triangle', wet: 0.6 },
    bass: { pattern: 'x.xxx.xxx.xxx.xo', gain: 0.1, style: 'drive' },
    arp: { pattern: 'xxxxxxxxxxxxxxxx', notes: [0, 4, 7, 9, 7, 4], octave: 2, gain: 0.02, type: 'sine', decay: 0.25, wet: 0.6 },
    drums: { kick: 'x.......x.......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', gain: 0.85 },
  },
  /* The treasury: a jaunty, jumpy thing with coins ringing over it. */
  bossGold: {
    bpm: 132,
    root: 55,
    scale: SCALES.harmonic,
    prog: [0, 3, 4, 0],
    pad: { gain: 0.03, cutoff: 1300, wet: 0.4 },
    bass: { pattern: 'x..x..x.x..x.oo.', gain: 0.11, style: 'drive' },
    lead: { pattern: '0.2.4.7.6h4.2...0.2.4.2.1h0hh...', octave: 1, gain: 0.028, type: 'square', wet: 0.3 },
    drums: { kick: 'x.....x...x.....', snare: '....x.......x...', hat: 'x.xxx.xxx.xxx.xx', gain: 0.85 },
    bells: { chance: 0.12, octave: 2, gain: 0.025 },
  },
  /* Her chamber: a slow pulse and something picking its way along a thread. */
  bossWeb: {
    bpm: 112,
    root: 49,
    scale: SCALES.phrygian,
    prog: [0, 1, 0, 5],
    pad: { gain: 0.045, cutoff: 800, type: 'triangle', wet: 0.75 },
    bass: { pattern: 'x...x...x.x.x...', gain: 0.11, style: 'pulse' },
    arp: { pattern: 'x.xx.xx.x.xx.xx.', notes: [0, 1, 4, 7, 8, 7, 4, 1], octave: 1, gain: 0.026, type: 'triangle', decay: 0.22, wet: 0.5 },
    drums: { kick: 'x.......x.......', tom: '...l......l..l..', hat: '..g...g...g...g.', gain: 0.8 },
  },
  /* The boar: a stampede of toms under a stubborn, stamping line. */
  bossBoar: {
    bpm: 142,
    root: 50,
    scale: SCALES.dorian,
    prog: [0, 3, 0, 6],
    pad: { gain: 0.035, cutoff: 1000, wet: 0.35 },
    bass: { pattern: 'x.x.x.xox.x.x.xo', gain: 0.12, style: 'drive' },
    lead: { pattern: '0h0h3h2h0hhh....4h3h2h0h2hhh....', octave: 1, gain: 0.028, type: 'square', wet: 0.25 },
    drums: { kick: 'x...x...x.x.x...', snare: '....x.......x...', tom: 'l.l.....l.l...ll', gain: 0.95 },
  },
  /* The twins: two lines, one bright and one cold, answering each other. */
  bossTwins: {
    bpm: 126,
    root: 54,
    scale: SCALES.lydian,
    prog: [0, 4, 5, 1],
    pad: { gain: 0.04, cutoff: 1500, type: 'triangle', wet: 0.7 },
    bass: { pattern: 'x...x.x.x...x.x.', gain: 0.1, style: 'pulse' },
    lead: { pattern: '0h2h4hhh........7h6h4hhh........', octave: 1, gain: 0.028, type: 'triangle', wet: 0.5 },
    arp: { pattern: '....xxxx....xxxx', notes: [7, 4, 2, 0, 2, 4], octave: 2, gain: 0.02, type: 'sine', decay: 0.2, wet: 0.6 },
    drums: { kick: 'x.......x.......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', gain: 0.8 },
  },
  /* The clock: his tempo is the beat he strikes on - 120, a tick every half second. */
  bossClock: {
    bpm: 120,
    root: 52,
    scale: SCALES.harmonic,
    prog: [0, 5, 4, 0],
    pad: { gain: 0.035, cutoff: 1100, wet: 0.45 },
    bass: { pattern: 'x...x...x...x...', gain: 0.11, style: 'pulse' },
    arp: { pattern: 'x.x.x.x.x.x.x.x.', notes: [0, 4, 7, 4, 0, 4, 7, 9], octave: 1, gain: 0.024, type: 'square', decay: 0.08, wet: 0.3 },
    drums: { kick: 'x.......x.......', snare: '............x...', hat: 'x...x...x...x...', tom: '..............l.', gain: 0.85 },
  },
  /* The shadow: fast, and the line on top runs backwards. */
  bossShadow: {
    bpm: 144,
    root: 47,
    scale: SCALES.harmonic,
    prog: [0, 6, 5, 4],
    pad: { gain: 0.04, cutoff: 1000, wet: 0.6 },
    bass: { pattern: 'xoxox.xoxoxox.xo', gain: 0.1, style: 'drive' },
    lead: { pattern: '7h6h4h2h0hhh....2h4h6h4h2hhh1h0h', octave: 1, gain: 0.03, type: 'sawtooth', wet: 0.45 },
    drums: { kick: 'x..x....x..x....', snare: '....x.......x.gg', hat: 'x.x.x.x.x.x.x.x.', gain: 0.9 },
  },
};

/* --------------------------------------------------------------- sequencer */

/** A track that is sounding, or fading out. */
class Player {
  step = 0;
  nextTime: number;
  arpIndex = 0;
  stopAt = Infinity;
  readonly out: Outlet;

  constructor(
    readonly track: Track,
    readonly gain: GainNode,
    readonly send: GainNode,
    start: number,
  ) {
    this.nextTime = start;
    this.out = { dry: gain, wet: send, drive: gain };
  }

  get stepDur(): number {
    return 60 / this.track.bpm / 4;
  }
}

/** The scale step `degree` as a MIDI note, `octave` octaves above the root. */
function noteOf(track: Track, degree: number, octave: number): number {
  const scale = track.scale;
  const oct = Math.floor(degree / scale.length);
  const idx = ((degree % scale.length) + scale.length) % scale.length;
  return track.root + scale[idx] + 12 * (oct + octave);
}

/** Steps until the next event in a pattern, so a note lasts until the next. */
function lengthAt(pattern: string, index: number, rest = '.'): number {
  let n = 1;
  while (n < pattern.length && pattern[(index + n) % pattern.length] === rest) n++;
  return n;
}

export const TRACK_NAMES = Object.keys(TRACKS) as TrackName[];

export class Music {
  private readonly players: Player[] = [];
  current: TrackName | null = null;

  constructor(
    private readonly synth: Synth,
    private readonly bus: AudioNode,
    private readonly reverb: AudioNode,
  ) {}

  play(name: TrackName | null): void {
    if (name === this.current) return;
    this.current = name;
    const ctx = this.synth.ctx;
    const now = ctx.currentTime;
    for (const p of this.players) {
      if (p.stopAt !== Infinity) continue;
      p.gain.gain.cancelScheduledValues(now);
      p.gain.gain.setValueAtTime(p.gain.gain.value, now);
      p.gain.gain.linearRampToValueAtTime(0, now + 1.4);
      p.send.gain.cancelScheduledValues(now);
      p.send.gain.setValueAtTime(p.send.gain.value, now);
      p.send.gain.linearRampToValueAtTime(0, now + 1.4);
      p.stopAt = now + 1.5;
    }
    if (!name) return;
    const gain = ctx.createGain();
    const send = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + 1.2);
    send.gain.setValueAtTime(0, now);
    send.gain.linearRampToValueAtTime(1, now + 1.2);
    gain.connect(this.bus);
    send.connect(this.reverb);
    this.players.push(new Player(TRACKS[name], gain, send, now + 0.08));
  }

  /** Called often; schedules whatever falls into the next moment. */
  tick(lookahead = 0.2): void {
    const now = this.synth.ctx.currentTime;
    const horizon = now + lookahead;
    for (let i = this.players.length - 1; i >= 0; i--) {
      const p = this.players[i];
      if (now > p.stopAt) {
        p.gain.disconnect();
        p.send.disconnect();
        this.players.splice(i, 1);
        continue;
      }
      // A tab that was asleep comes back far behind: skip, do not catch up.
      if (p.nextTime < now - 0.25) {
        const behind = Math.ceil((now - p.nextTime) / p.stepDur);
        p.step += behind;
        p.nextTime += behind * p.stepDur;
      }
      while (p.nextTime < horizon && p.nextTime < p.stopAt) {
        this.scheduleStep(p, p.step, p.nextTime);
        p.step++;
        p.nextTime += p.stepDur;
      }
    }
  }

  private scheduleStep(p: Player, step: number, t: number): void {
    const s = this.synth;
    const tr = p.track;
    const out = p.out;
    const sd = p.stepDur;
    const bar = Math.floor(step / 16);
    const inBar = step % 16;
    const chord = tr.prog[bar % tr.prog.length];

    if (tr.pad && inBar === 0) {
      const bars = 1;
      for (const r of [0, 2, 4]) {
        s.tone(out, t, {
          type: tr.pad.type ?? 'sawtooth',
          f: midiToHz(noteOf(tr, chord + r, 0)),
          dur: sd * 16 * bars + 0.5,
          gain: tr.pad.gain,
          attack: 0.45,
          release: 0.9,
          detune: 8,
          filter: { type: 'lowpass', f: tr.pad.cutoff, q: 0.5 },
          wet: tr.pad.wet ?? 0.5,
        });
      }
    }

    if (tr.bass) {
      const pat = tr.bass.pattern;
      const ch = pat[step % pat.length];
      if (ch !== '.') {
        const degree = chord + (ch === 'f' ? 4 : 0);
        const note = noteOf(tr, degree, ch === 'o' ? 0 : -1) - 12;
        const f = midiToHz(note);
        const len = lengthAt(pat, step % pat.length) * sd;
        const g = tr.bass.gain;
        if (tr.bass.style === 'drive') {
          s.tone(out, t, {
            type: 'sawtooth',
            f,
            dur: Math.min(len, sd * 2) * 0.95,
            gain: g,
            attack: 0.004,
            filter: { type: 'lowpass', f: 1400, f2: 260, q: 3 },
          });
          s.tone(out, t, { type: 'sine', f, dur: Math.min(len, sd * 2), gain: g * 0.8, attack: 0.004 });
        } else if (tr.bass.style === 'pulse') {
          s.tone(out, t, { type: 'sine', f, dur: 0.32, gain: g * 1.1, attack: 0.01 });
          s.tone(out, t, { type: 'triangle', f: f * 2, dur: 0.18, gain: g * 0.3, attack: 0.01 });
        } else {
          s.tone(out, t, {
            type: 'triangle',
            f,
            dur: Math.min(len * 0.95, 2.4),
            gain: g,
            attack: 0.02,
            release: 0.3,
            filter: { type: 'lowpass', f: 700 },
          });
        }
      }
    }

    if (tr.arp) {
      const a = tr.arp;
      if (a.pattern[step % a.pattern.length] === 'x') {
        const r = a.notes[p.arpIndex % a.notes.length];
        p.arpIndex++;
        s.tone(out, t, {
          type: a.type,
          f: midiToHz(noteOf(tr, chord + r, a.octave)),
          dur: a.decay,
          gain: a.gain,
          attack: 0.004,
          filter: { type: 'lowpass', f: 3400 },
          wet: a.wet ?? 0.4,
        });
      }
    }

    if (tr.lead) {
      const l = tr.lead;
      const i = step % l.pattern.length;
      const ch = l.pattern[i];
      if (ch >= '0' && ch <= '9') {
        const hold = lengthAt(l.pattern, i, 'h');
        s.tone(out, t, {
          type: l.type,
          f: midiToHz(noteOf(tr, chord + Number(ch), l.octave)),
          dur: hold * sd * 0.98,
          gain: l.gain,
          attack: 0.015,
          release: Math.min(0.12, hold * sd * 0.4),
          filter: { type: 'lowpass', f: 2600, q: 0.7 },
          vibrato: hold > 2 ? { rate: 5.2, depth: 3.5 } : undefined,
          wet: l.wet ?? 0.35,
        });
      }
    }

    if (tr.bells && inBar % 2 === 0 && Math.random() < tr.bells.chance) {
      const r = [0, 2, 4, 7][Math.floor(Math.random() * 4)];
      s.fm(out, t, {
        f: midiToHz(noteOf(tr, chord + r, tr.bells.octave)),
        ratio: 3.51,
        index: 1.6,
        index2: 0.05,
        dur: 1.8,
        gain: tr.bells.gain,
        pan: Math.random() * 1.2 - 0.6,
        wet: 0.8,
      });
    }

    if (tr.drums) {
      const d = tr.drums;
      const k = d.gain ?? 1;
      const at = (pat: string | undefined): string => (pat ? pat[step % pat.length] : '.');
      const kick = at(d.kick);
      if (kick !== '.') s.kick(out, t, (kick === 'g' ? 0.3 : 0.62) * k);
      const snare = at(d.snare);
      if (snare !== '.') s.snare(out, t, (snare === 'g' ? 0.09 : 0.26) * k);
      const hat = at(d.hat);
      if (hat !== '.') s.hat(out, t, (hat === 'g' ? 0.035 : 0.07) * k, hat === 'o', inBar % 2 ? 0.3 : -0.2);
      const tom = at(d.tom);
      if (tom !== '.') s.tom(out, t, tom === 'l' ? 82 : 132, 0.34 * k);
    }
  }
}
