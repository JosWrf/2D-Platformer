/**
 * The sound's palette: every instrument and every noise the game plays, as a
 * sample.
 *
 * The pictures keep to a palette of sixty-four colours on a 480×270 grid; the
 * sound keeps to the rules of a sixteen-bit sampler (an S-DSP: see dsp.ts),
 * and this is its sample ROM. Nothing is recorded. At the first key press
 * each sample is built here in plain arithmetic - partials added up, a string
 * plucked, a shift register clocked for noise - at 32 000 frames a second,
 * then put through the cartridge's own compression (BRR: four bits a frame,
 * sixteen frames to a block, each block with its own range and predictor),
 * which gives every sample the slight grit of the era, and smoothed the way
 * the S-DSP's Gaussian interpolation smooths a sample on its way out.
 *
 * The rules the palette keeps, as the graphics keep theirs:
 *
 *   - no more than 64 samples, and no more than 512 k frames between them;
 *   - a one-shot is at most 16 000 frames (half a second); an instrument that
 *     rings for longer is an attack of at most 8 192 frames and a loop of at
 *     most 4 096, and its envelope does the rest;
 *   - every loop holds a whole number of cycles of every partial in it, so it
 *     repeats without a seam at any pitch;
 *   - noise is a 15-bit shift register clocked at one of a few rates, never
 *     white noise through a filter.
 *
 * Each piece of music draws on at most eight of them (tracks.ts), and every
 * boss's piece has two that are its own: the drums, the bass and the strings
 * are shared; the taiko is Grimmzahn's and the music box Tickmar's.
 */

/** The frame rate of the whole sound: the S-DSP's 32 kHz. */
export const RATE = 32000;

export type SampleId =
  // The drum kit and the noise, shared.
  | 'kick'
  | 'snare'
  | 'hat'
  | 'tom'
  | 'crash'
  | 'noiseHi'
  | 'noiseMid'
  | 'noiseLo'
  // Shared instruments.
  | 'bass'
  | 'strings'
  | 'pulse'
  | 'pulseHi'
  | 'bell'
  | 'pluck'
  // Each zone's own.
  | 'lute'
  | 'choirOoh'
  | 'marimba'
  | 'drip'
  | 'brassStab'
  | 'logDrum'
  // Each boss's own two - some of them a zone's as well.
  | 'bloopBass'
  | 'bubble'
  | 'taiko'
  | 'lowHorn'
  | 'glock'
  | 'coins'
  | 'calliope'
  | 'woodblock'
  | 'gong'
  | 'lowBrass'
  | 'choirLow'
  | 'drone'
  | 'pizz'
  | 'koto'
  | 'brassGrit'
  | 'anvil'
  | 'flute'
  | 'glassHarp'
  | 'harp'
  | 'choirAah'
  | 'churchBell'
  | 'timpani'
  | 'tick'
  | 'musicBox'
  | 'harpsichord'
  | 'organ'
  | 'orchHit'
  | 'stringsStacc'
  | 'revLead'
  | 'revCymbal'
  | 'crystal'
  | 'bowedGlass'
  | 'horn'
  | 'warDrum'
  | 'glassBell'
  | 'celesta'
  // The effects' own.
  | 'growl'
  | 'slap';

export interface Sample {
  readonly id: SampleId;
  /** The frames, at RATE, after the compression and the smoothing. */
  readonly data: Float32Array;
  /** Where the loop starts, in frames; it runs to the end. Null for a one-shot. */
  readonly loopStart: number | null;
  /** The pitch it sounds at played at its own rate, in Hz; 0 for a drum or a noise. */
  readonly f0: number;
}

/* ------------------------------------------------------------ arithmetic */

/** A small, seeded random source, so the same palette comes out every time. */
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

const TAU = Math.PI * 2;
const SINE_SIZE = 4096;
const SINE = new Float32Array(SINE_SIZE + 1);
for (let i = 0; i <= SINE_SIZE; i++) SINE[i] = Math.sin((i / SINE_SIZE) * TAU);

/** sin(2π·phase) from a table: phase in cycles. */
function sin1(phase: number): number {
  const p = (phase - Math.floor(phase)) * SINE_SIZE;
  const i = p | 0;
  const f = p - i;
  return SINE[i] + (SINE[i + 1] - SINE[i]) * f;
}

/** The nearest frequency to f that fits a whole number of cycles into `frames`. */
function fit(f: number, frames: number): number {
  const step = RATE / frames;
  return Math.max(1, Math.round(f / step)) * step;
}

/**
 * The S-DSP's noise: a 15-bit shift register, stepped `clock` times a second
 * and held between steps, as a stream of ±1.
 */
function lfsr(frames: number, clock: number, seed = 0x4000): Float32Array {
  const out = new Float32Array(frames);
  let reg = seed & 0x7fff || 1;
  let acc = 0;
  for (let i = 0; i < frames; i++) {
    acc += clock;
    while (acc >= RATE) {
      acc -= RATE;
      const bit = (reg ^ (reg >> 1)) & 1;
      reg = (reg >> 1) | (bit << 14);
    }
    out[i] = reg & 1 ? 1 : -1;
  }
  return out;
}

/** A one-pole low-pass over a buffer, in place: for shaping a sample as it is built, never a voice. */
function soften(x: Float32Array, cutoff: number): Float32Array {
  const a = Math.exp((-TAU * cutoff) / RATE);
  let y = 0;
  for (let i = 0; i < x.length; i++) {
    y = (1 - a) * x[i] + a * y;
    x[i] = y;
  }
  return x;
}

/** A one-pole high-pass over a buffer, in place. */
function thin(x: Float32Array, cutoff: number): Float32Array {
  const a = Math.exp((-TAU * cutoff) / RATE);
  let lp = 0;
  for (let i = 0; i < x.length; i++) {
    lp = (1 - a) * x[i] + a * lp;
    x[i] -= lp;
  }
  return x;
}

/** Scales a buffer so its loudest frame is `peak`. */
function normalise(x: Float32Array, peak = 0.95): Float32Array {
  let m = 0;
  for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]));
  if (m > 0) {
    const k = peak / m;
    for (let i = 0; i < x.length; i++) x[i] *= k;
  }
  return x;
}

/* ------------------------------------------------------------ the builders */

interface Partial {
  /** Frequency as a multiple of f0 (any ratio: it is fitted to the loop). */
  ratio: number;
  amp: number;
  /** Seconds this partial takes to fall by 1/e through the attack; it holds what is left in the loop. */
  decay?: number;
  /** A brighter, faster-falling part of the same partial at the very start: the strike. */
  strike?: number;
}

interface Tone {
  data: Float32Array;
  loopStart: number;
  f0: number;
}

interface ToneOptions {
  /** A breath, a bow or a pick: shift-register noise in the attack only. */
  noise?: number;
  noiseClock?: number;
  noiseDecay?: number;
  /** Seconds to rise from nothing at the very start. */
  rise?: number;
  /** A wobble of pitch in the attack only, [rate Hz, depth as a fraction]: a held note's own vibrato is the voice's. */
  vibrato?: [number, number];
}

/**
 * An instrument made of partials: an attack of `attack` frames, in which each
 * partial may fall from a struck level (`decay`, `strike`), then a loop of
 * `loop` frames in which every partial holds the level the attack left it at
 * and runs a whole number of cycles - so the loop's end meets its start, and
 * the voice's envelope does the long fade a real instrument would.
 */
function tone(f0: number, parts: Partial[], attack: number, loop: number, opts: ToneOptions = {}): Tone {
  const base = fit(f0, loop);
  const total = attack + loop;
  const out = new Float32Array(total);
  // Every partial fitted to the loop; one that would land on another's
  // frequency is dropped rather than doubled.
  const used = new Set<number>();
  const rise = Math.max(1, (opts.rise ?? 0.003) * RATE);
  const vib = opts.vibrato;
  for (const p of parts) {
    const f = fit(base * p.ratio, loop);
    if (p.amp <= 0 || f >= RATE * 0.42 || used.has(f)) continue;
    used.add(f);
    const tau = (p.decay ?? Infinity) * RATE;
    const strikeTau = Math.max(1, (tau === Infinity ? 0.05 * RATE : tau) * 0.25);
    const strike = p.strike ?? 0;
    const inc = f / RATE;
    let phase = 0;
    for (let i = 0; i < total; i++) {
      const t = Math.min(i, attack);
      const level = (tau === Infinity ? 1 : Math.exp(-t / tau)) + strike * Math.exp(-t / strikeTau);
      const env = i < rise ? i / rise : 1;
      out[i] += p.amp * level * env * sin1(phase);
      const wob = vib && i < attack ? vib[1] * Math.sin((TAU * vib[0] * i) / RATE) * (1 - i / attack) : 0;
      phase += inc * (1 + wob);
    }
  }
  if (opts.noise && attack > 0) {
    const n = soften(lfsr(attack, opts.noiseClock ?? 6000, 0x2b1d), 3500);
    const d = (opts.noiseDecay ?? 0.03) * RATE;
    // Gone by the loop: it fades out over the attack's last eighth too.
    const last = attack * 0.875;
    for (let i = 0; i < attack; i++) {
      const fade = i < last ? 1 : 1 - (i - last) / (attack - last);
      out[i] += opts.noise * n[i] * Math.exp(-i / d) * fade * (i < rise ? i / rise : 1);
    }
  }
  return { data: out, loopStart: attack, f0: base };
}

/** Additive one-shot: partials with their own decays, no loop. */
function oneShot(frames: number, voices: { f: number; f2?: number; amp: number; decay: number; glide?: number }[]): Float32Array {
  const out = new Float32Array(frames);
  for (const v of voices) {
    let phase = 0;
    const tau = v.decay * RATE;
    const glide = (v.glide ?? 0.05) * RATE;
    for (let i = 0; i < frames; i++) {
      const f = v.f2 === undefined ? v.f : v.f2 + (v.f - v.f2) * Math.exp(-i / glide);
      out[i] += v.amp * Math.exp(-i / tau) * sin1(phase);
      phase += f / RATE;
    }
  }
  return out;
}

/** Noise for a one-shot: the shift register at `clock`, softened above `soft` Hz, falling with `decay` seconds. */
function noiseBurst(frames: number, clock: number, decay: number, soft: number, seed: number, attack = 0.001): Float32Array {
  const n = soften(lfsr(frames, clock, seed), soft);
  const tau = decay * RATE;
  const rise = Math.max(1, attack * RATE);
  for (let i = 0; i < frames; i++) n[i] *= Math.exp(-i / tau) * Math.min(1, i / rise);
  return n;
}

/** Adds b into a, scaled. */
function mix(a: Float32Array, b: Float32Array, k = 1): Float32Array {
  for (let i = 0; i < Math.min(a.length, b.length); i++) a[i] += b[i] * k;
  return a;
}

/** A gentle fade over the last frames of a one-shot, so it never ends on a step. */
function tailOff(x: Float32Array, frames = 256): Float32Array {
  const n = Math.min(frames, x.length);
  for (let i = 0; i < n; i++) x[x.length - 1 - i] *= i / n;
  return x;
}

/* -------------------------------------------------- the cartridge's own grit */

/**
 * BRR, the S-DSP's sample format, there and back: sixteen frames to a block,
 * each stored as four-bit steps from one of four predictors at one of
 * thirteen ranges. The steps are what a sample of the era sounds like - a
 * faint grain under the quiet parts - and a loop of whole blocks keeps them
 * in step with it.
 */
function brr(x: Float32Array): Float32Array {
  const out = new Float32Array(x.length);
  let p1 = 0;
  let p2 = 0;
  const predict = [(a: number) => 0 * a, (a: number) => a * (15 / 16), (a: number, b: number) => a * (61 / 32) - b * (15 / 16), (a: number, b: number) => a * (115 / 64) - b * (13 / 16)];
  for (let start = 0; start < x.length; start += 16) {
    const end = Math.min(x.length, start + 16);
    let best: { err: number; frames: number[]; q1: number; q2: number } | null = null;
    for (let f = 0; f < 4; f++) {
      // The range from this predictor's largest residual, as the encoder of the era would.
      let a = p1;
      let b = p2;
      let worst = 0;
      for (let i = start; i < end; i++) {
        const v = x[i] * 32767;
        const r = v - (f === 0 ? 0 : f === 1 ? predict[1](a, b) : predict[f](a, b));
        worst = Math.max(worst, Math.abs(r));
        b = a;
        a = v;
      }
      let shift = 0;
      while (shift < 12 && worst / 2 ** shift > 7) shift++;
      // Decode with that range: the error the four bits leave.
      a = p1;
      b = p2;
      const frames: number[] = [];
      let err = 0;
      for (let i = start; i < end; i++) {
        const v = x[i] * 32767;
        const pred = predict[f](a, b);
        const q = Math.max(-8, Math.min(7, Math.round((v - pred) / 2 ** shift)));
        const y = Math.max(-32768, Math.min(32767, pred + q * 2 ** shift));
        err += (y - v) ** 2;
        frames.push(y);
        b = a;
        a = y;
      }
      if (!best || err < best.err) best = { err, frames, q1: a, q2: b };
    }
    if (!best) break;
    for (let i = 0; i < best.frames.length; i++) out[start + i] = best.frames[i] / 32767;
    p1 = best.q1;
    p2 = best.q2;
  }
  return out;
}

/**
 * The S-DSP's Gaussian interpolation at a sample's own rate: each frame
 * 0.64 of itself and 0.18 of each neighbour - the muffle every sample of
 * the era has. (A loop's first frame is smoothed with its last.)
 */
function gauss(x: Float32Array, loopStart: number | null): Float32Array {
  const out = new Float32Array(x.length);
  const n = x.length;
  for (let i = 0; i < n; i++) {
    const prev = i > 0 ? x[i - 1] : 0;
    let next: number;
    if (i < n - 1) next = x[i + 1];
    else next = loopStart !== null ? x[loopStart] : 0;
    const before = i === loopStart && loopStart !== null && loopStart > 0 ? x[i - 1] : prev;
    out[i] = 0.18 * before + 0.64 * x[i] + 0.18 * next;
  }
  return out;
}

/* ------------------------------------------------------------ the palette */

interface Built {
  data: Float32Array;
  loopStart?: number;
  f0?: number;
}

/** Vowel formants for the choirs: centre, width, level. */
const VOWELS = {
  ooh: [
    [320, 90, 1],
    [800, 120, 0.25],
    [2500, 200, 0.03],
  ],
  aah: [
    [750, 110, 1],
    [1200, 140, 0.55],
    [2600, 220, 0.12],
  ],
  oh: [
    [450, 100, 1],
    [850, 120, 0.4],
    [2600, 200, 0.05],
  ],
} as const;

/** Harmonic amplitudes shaped by formants: a sung vowel over a pulse of the glottis. */
function vowel(f0: number, shape: keyof typeof VOWELS, count: number, tilt = 1.2): Partial[] {
  const parts: Partial[] = [];
  for (let k = 1; k <= count; k++) {
    const f = f0 * k;
    let level = 0.04;
    for (const [c, w, a] of VOWELS[shape]) level += a * Math.exp(-(((f - c) / (w * 2)) ** 2));
    parts.push({ ratio: k, amp: level / k ** (tilt * 0.5) });
  }
  return parts;
}

/** Harmonics of a sawtooth up to a cutoff, falling as 1/k^tilt. */
function sawParts(f0: number, top: number, tilt = 1, odd = false): Partial[] {
  const parts: Partial[] = [];
  for (let k = 1; f0 * k < top; k++) {
    if (odd && k % 2 === 0) continue;
    parts.push({ ratio: k, amp: 1 / k ** tilt });
  }
  return parts;
}

/** A plucked string's harmonics: plucked at `pos` along it, the high ones dying first. */
function stringParts(f0: number, top: number, pos: number, life: number, bright = 1): Partial[] {
  const parts: Partial[] = [];
  for (let k = 1; f0 * k < top; k++) {
    const amp = Math.abs(Math.sin(Math.PI * k * pos)) / k ** (1.1 / bright);
    parts.push({ ratio: k, amp, decay: life / (1 + (k - 1) * 0.6) });
  }
  return parts;
}

/**
 * Everything the palette holds, and how each is made. Pitched samples sit in
 * the middle of the range they are played in, so no note is pushed more than
 * an octave or so from where it was built.
 */
const BUILD: Record<SampleId, () => Built> = {
  /* ------------------------------------------------- drums and noise */
  kick: () => {
    const x = oneShot(7000, [
      { f: 150, f2: 46, amp: 1, decay: 0.16, glide: 0.035 },
      { f: 300, f2: 92, amp: 0.25, decay: 0.03, glide: 0.02 },
    ]);
    mix(x, noiseBurst(7000, 6000, 0.004, 3000, 0x3a1), 0.35);
    return { data: tailOff(x) };
  },
  snare: () => {
    const x = oneShot(7200, [
      { f: 210, f2: 180, amp: 0.7, decay: 0.05 },
      { f: 330, f2: 300, amp: 0.3, decay: 0.03 },
    ]);
    mix(x, noiseBurst(7200, 8000, 0.07, 5500, 0x5ac3), 0.9);
    return { data: tailOff(x) };
  },
  hat: () => {
    const n = thin(noiseBurst(9000, 10000, 0.06, 6200, 0x7e11), 2500);
    return { data: tailOff(n) };
  },
  tom: () => {
    const x = oneShot(12000, [
      { f: 150, f2: 105, amp: 1, decay: 0.2, glide: 0.08 },
      { f: 240, f2: 170, amp: 0.25, decay: 0.08 },
    ]);
    mix(x, noiseBurst(12000, 5000, 0.01, 2500, 0x1f3), 0.3);
    return { data: tailOff(x) };
  },
  crash: () => {
    // An attack of noise over a cluster of bright metal, then the metal held.
    const t = tone(
      420,
      [1, 1.47, 2.09, 2.56, 3.2, 3.93, 4.71, 5.6, 6.8, 8.1, 9.3, 11.2, 13.4, 15.8].map((r, i) => ({ ratio: r, amp: 0.5 / (1 + i * 0.25), decay: 0.25 })),
      6144,
      4096,
      { noise: 1.2, noiseClock: 10000, noiseDecay: 0.08 },
    );
    return { data: soften(thin(t.data, 900), 7000), loopStart: t.loopStart };
  },
  noiseHi: () => ({ data: soften(lfsr(4096, 8000, 0x51f), 6500), loopStart: 0 }),
  noiseMid: () => ({ data: soften(lfsr(4096, 3000, 0x2c3), 4000), loopStart: 0 }),
  noiseLo: () => ({ data: soften(lfsr(4096, 1000, 0x6b5), 1600), loopStart: 0 }),

  /* ------------------------------------------------- shared instruments */
  bass: () => tone(110, stringParts(110, 2400, 0.22, 0.35, 0.8), 3072, 2048, { noise: 0.15, noiseDecay: 0.006 }),
  strings: () => tone(220, sawParts(220, 4400, 1.05), 4096, 4096, { noise: 0.06, noiseDecay: 0.08, rise: 0.02 }),
  pulse: () => {
    // A 25 % pulse, band-limited.
    const parts: Partial[] = [];
    for (let k = 1; 440 * k < 6400; k++) parts.push({ ratio: k, amp: Math.abs(Math.sin(Math.PI * k * 0.25)) / k });
    return tone(440, parts, 512, 2048);
  },
  // The same pulse built an octave and a half higher, with only the partials
  // that stay under the top of the band when it is played up there.
  pulseHi: () =>
    tone(
      1760,
      [1, 2, 3].map((k) => ({ ratio: k, amp: Math.abs(Math.sin(Math.PI * k * 0.25)) / k })),
      512,
      1024,
    ),
  bell: () =>
    tone(
      880,
      [
        { ratio: 1, amp: 1, decay: 2 },
        { ratio: 2.0, amp: 0.5, decay: 0.6 },
        { ratio: 2.76, amp: 0.45, decay: 0.3, strike: 1 },
        { ratio: 5.4, amp: 0.2, decay: 0.12, strike: 1 },
      ],
      4096,
      2048,
    ),
  pluck: () => tone(330, stringParts(330, 5200, 0.18, 0.4, 1), 4096, 2048, { noise: 0.12, noiseDecay: 0.004 }),

  /* ------------------------------------------------- the zones' own */
  lute: () => tone(262, stringParts(262, 4800, 0.12, 0.6, 0.9), 6144, 2048, { noise: 0.1, noiseDecay: 0.005 }),
  choirOoh: () => tone(262, vowel(262, 'ooh', 14, 1.1), 3072, 4096, { rise: 0.08, noise: 0.05, noiseDecay: 0.1 }),
  marimba: () =>
    tone(
      523,
      [
        { ratio: 1, amp: 1, decay: 0.6 },
        { ratio: 3.93, amp: 0.4, decay: 0.12, strike: 1 },
        { ratio: 9.2, amp: 0.12, decay: 0.03, strike: 1 },
      ],
      4096,
      2048,
    ),
  drip: () => {
    // The pitch of a drop rises as it falls into the water.
    const y = new Float32Array(4000);
    let phase = 0;
    for (let i = 0; i < 4000; i++) {
      const f = 700 + 1300 * (1 - Math.exp(-i / (0.02 * RATE)));
      y[i] = Math.exp(-i / (0.035 * RATE)) * sin1(phase) * Math.min(1, i / 20);
      phase += f / RATE;
    }
    return { data: tailOff(y) };
  },
  brassStab: () => tone(294, sawParts(294, 4200, 0.85), 2048, 2048, { rise: 0.012, noise: 0.08, noiseDecay: 0.02 }),
  logDrum: () => {
    const x = oneShot(9000, [
      { f: 196, amp: 1, decay: 0.12 },
      { f: 196 * 2.94, amp: 0.4, decay: 0.05 },
      { f: 196 * 4.1, amp: 0.15, decay: 0.02 },
    ]);
    mix(x, noiseBurst(9000, 5000, 0.004, 2600, 0x4c1), 0.4);
    return { data: tailOff(x) };
  },

  /* ------------------------------------------------- the bosses' own */
  // A round, wet bass: few partials, and a bloop of pitch in the attack.
  bloopBass: () => tone(98, [{ ratio: 1, amp: 1 }, { ratio: 2, amp: 0.35 }, { ratio: 3, amp: 0.12 }], 2048, 2048, { vibrato: [14, 0.08] }),
  bubble: () => {
    const y = new Float32Array(3600);
    let phase = 0;
    for (let i = 0; i < y.length; i++) {
      const f = 380 * Math.exp((i / RATE) * 18);
      y[i] = Math.sin(Math.min(1, i / 200) * Math.PI * 0.5) * Math.exp(-i / (0.03 * RATE)) * sin1(phase);
      phase += Math.min(f, 3000) / RATE;
    }
    return { data: tailOff(y) };
  },
  taiko: () => {
    const x = oneShot(15000, [
      { f: 90, f2: 62, amp: 1, decay: 0.24, glide: 0.06 },
      { f: 140, f2: 104, amp: 0.4, decay: 0.12 },
      { f: 230, amp: 0.15, decay: 0.05 },
    ]);
    mix(x, noiseBurst(15000, 4000, 0.012, 2200, 0x2f7), 0.55);
    return { data: tailOff(x, 1200) };
  },
  lowHorn: () => tone(147, sawParts(147, 2600, 1.5), 3072, 4096, { rise: 0.05, noise: 0.04, noiseDecay: 0.04 }),
  glock: () =>
    tone(
      1047,
      [
        { ratio: 1, amp: 1, decay: 1.2 },
        { ratio: 2.76, amp: 0.4, decay: 0.12, strike: 1 },
        { ratio: 5.4, amp: 0.2, decay: 0.04, strike: 1 },
      ],
      4096,
      2048,
    ),
  coins: () => {
    const r = rng(77);
    const x = new Float32Array(12000);
    for (let n = 0; n < 6; n++) {
      const at = Math.floor(n * 1400 + r() * 500);
      const f = 2200 + r() * 1800;
      const one = oneShot(12000 - at, [
        { f, amp: 0.6, decay: 0.05 },
        { f: f * 1.51, amp: 0.3, decay: 0.03 },
      ]);
      for (let i = 0; i < one.length; i++) x[at + i] += one[i] * (1 - n * 0.1);
    }
    return { data: tailOff(x) };
  },
  calliope: () => {
    // A steam pipe: mostly odd harmonics, a hiss of steam at the start.
    const parts: Partial[] = sawParts(523, 6000, 1.6, true);
    parts.push({ ratio: 2, amp: 0.12 });
    return tone(523, parts, 2048, 2048, { rise: 0.02, noise: 0.15, noiseClock: 7000, noiseDecay: 0.05 });
  },
  woodblock: () => {
    const x = oneShot(3000, [
      { f: 880, amp: 1, decay: 0.025 },
      { f: 1320, amp: 0.4, decay: 0.012 },
    ]);
    mix(x, noiseBurst(3000, 8000, 0.002, 4000, 0x111), 0.3);
    return { data: tailOff(x) };
  },
  gong: () =>
    tone(
      110,
      [1, 1.52, 2.01, 2.43, 2.93, 3.38, 4.07, 4.6, 5.3, 6.1, 7.2, 8.4].map((r, i) => ({
        ratio: r,
        amp: 0.6 / (1 + i * 0.3),
        decay: 1.4 / (1 + i * 0.2),
        strike: i > 4 ? 1.5 : 0.3,
      })),
      8192,
      4096,
      { noise: 0.3, noiseClock: 4000, noiseDecay: 0.03 },
    ),
  lowBrass: () => tone(110, sawParts(110, 2200, 1.2), 3072, 4096, { rise: 0.035, noise: 0.05, noiseDecay: 0.03 }),
  choirLow: () => tone(131, vowel(131, 'oh', 20, 1.3), 3072, 4096, { rise: 0.1, noise: 0.04, noiseDecay: 0.1 }),
  drone: () =>
    tone(
      65.4,
      [
        { ratio: 1, amp: 1 },
        { ratio: 2, amp: 0.5 },
        { ratio: 3, amp: 0.3 },
        { ratio: 4.02, amp: 0.15 },
        { ratio: 5, amp: 0.1 },
      ],
      2048,
      4096,
      { rise: 0.2 },
    ),
  pizz: () => tone(392, stringParts(392, 4800, 0.2, 0.18, 1), 8192, 1024, { noise: 0.1, noiseDecay: 0.003 }),
  koto: () => tone(392, stringParts(392, 5600, 0.08, 0.5, 1.3), 6144, 2048, { noise: 0.15, noiseDecay: 0.004 }),
  brassGrit: () => {
    // A brass with its odd harmonics pushed: the grind of something too hot.
    const parts = sawParts(196, 5200, 0.7).map((p) => ({ ...p, amp: p.amp * (p.ratio % 2 === 1 ? 1.3 : 0.6) }));
    return tone(196, parts, 2048, 2048, { rise: 0.01, noise: 0.1, noiseDecay: 0.02 });
  },
  anvil: () =>
    tone(
      620,
      [
        { ratio: 1, amp: 1, decay: 0.8, strike: 0.5 },
        { ratio: 2.31, amp: 0.6, decay: 0.4, strike: 1 },
        { ratio: 3.87, amp: 0.4, decay: 0.2, strike: 1 },
        { ratio: 5.22, amp: 0.25, decay: 0.08, strike: 1 },
        { ratio: 7.1, amp: 0.15, decay: 0.04 },
      ],
      6144,
      2048,
      { noise: 0.4, noiseClock: 9000, noiseDecay: 0.004 },
    ),
  flute: () =>
    tone(
      587,
      [
        { ratio: 1, amp: 1 },
        { ratio: 2, amp: 0.22 },
        { ratio: 3, amp: 0.08 },
        { ratio: 4, amp: 0.03 },
      ],
      3072,
      2048,
      { rise: 0.04, noise: 0.18, noiseClock: 6000, noiseDecay: 0.06 },
    ),
  glassHarp: () =>
    tone(
      784,
      [
        { ratio: 1, amp: 1 },
        { ratio: 2, amp: 0.15 },
        { ratio: 3, amp: 0.05 },
      ],
      4096,
      2048,
      { rise: 0.12 },
    ),
  harp: () => tone(392, stringParts(392, 5000, 0.3, 0.9, 0.8), 6144, 2048, { noise: 0.05, noiseDecay: 0.003 }),
  choirAah: () => tone(330, vowel(330, 'aah', 14, 1.0), 3072, 4096, { rise: 0.09, noise: 0.05, noiseDecay: 0.1 }),
  churchBell: () =>
    tone(
      196,
      [
        { ratio: 0.5, amp: 0.7, decay: 4 },
        { ratio: 1, amp: 1, decay: 3 },
        { ratio: 1.19, amp: 0.6, decay: 2 },
        { ratio: 1.5, amp: 0.4, decay: 1.2 },
        { ratio: 2, amp: 0.5, decay: 0.9, strike: 0.5 },
        { ratio: 2.52, amp: 0.25, decay: 0.4, strike: 1 },
        { ratio: 3.01, amp: 0.15, decay: 0.2, strike: 1 },
        { ratio: 4.1, amp: 0.1, decay: 0.1 },
      ],
      8192,
      4096,
      { noise: 0.15, noiseClock: 6000, noiseDecay: 0.006 },
    ),
  timpani: () =>
    tone(
      98,
      [
        { ratio: 1, amp: 1, decay: 0.9 },
        { ratio: 1.5, amp: 0.5, decay: 0.5 },
        { ratio: 1.98, amp: 0.3, decay: 0.3 },
        { ratio: 2.44, amp: 0.15, decay: 0.15, strike: 1 },
      ],
      6144,
      4096,
      { noise: 0.35, noiseClock: 3000, noiseDecay: 0.015 },
    ),
  tick: () => {
    const x = oneShot(1800, [
      { f: 2400, amp: 0.7, decay: 0.006 },
      { f: 3700, amp: 0.4, decay: 0.004 },
      { f: 1200, amp: 0.4, decay: 0.01 },
    ]);
    mix(x, noiseBurst(1800, 10000, 0.002, 6000, 0x99), 0.4);
    return { data: tailOff(x, 64) };
  },
  musicBox: () =>
    tone(
      1568,
      [
        { ratio: 1, amp: 1, decay: 1.6 },
        { ratio: 3.0, amp: 0.15, decay: 0.2, strike: 1 },
        { ratio: 5.9, amp: 0.08, decay: 0.05, strike: 1 },
      ],
      4096,
      1024,
      { noise: 0.1, noiseClock: 10000, noiseDecay: 0.002 },
    ),
  // Plucked near the end of the string: every harmonic, bright, and the jack's click.
  harpsichord: () => tone(262, stringParts(262, 6000, 0.07, 0.5, 1.6), 6144, 2048, { noise: 0.2, noiseClock: 9000, noiseDecay: 0.003 }),
  organ: () =>
    tone(
      262,
      [
        { ratio: 0.5, amp: 0.5 },
        { ratio: 1, amp: 1 },
        { ratio: 1.5, amp: 0.3 },
        { ratio: 2, amp: 0.55 },
        { ratio: 3, amp: 0.3 },
        { ratio: 4, amp: 0.25 },
        { ratio: 6, amp: 0.1 },
        { ratio: 8, amp: 0.08 },
      ],
      1024,
      4096,
      { rise: 0.03, noise: 0.06, noiseDecay: 0.03 },
    ),
  orchHit: () => {
    // Brass and strings struck together on one chord, gone in half a second.
    const x = new Float32Array(15000);
    const size = 2048;
    for (const [f, a] of [
      [131, 1],
      [196, 0.8],
      [262, 0.8],
      [311, 0.6],
      [392, 0.5],
    ] as const) {
      // One cycle of the note's harmonics, then read round and round.
      const cycle = new Float32Array(size + 1);
      for (let k = 1; f * k < 5000; k++) for (let j = 0; j <= size; j++) cycle[j] += sin1((j * k) / size) / k ** 0.9;
      let phase = 0;
      for (let i = 0; i < x.length; i++) {
        const env = Math.min(1, i / 60) * Math.exp(-i / (0.14 * RATE));
        const p = phase * size;
        const j = p | 0;
        x[i] += a * env * (cycle[j] + (cycle[j + 1] - cycle[j]) * (p - j));
        phase += f / RATE;
        if (phase >= 1) phase -= 1;
      }
    }
    mix(x, noiseBurst(15000, 7000, 0.03, 4000, 0x7a3), 0.6);
    return { data: tailOff(x, 2000) };
  },
  stringsStacc: () => tone(196, sawParts(196, 4400, 0.95), 2048, 2048, { rise: 0.006, noise: 0.25, noiseClock: 8000, noiseDecay: 0.015 }),
  revLead: () => {
    // A bright lead note backwards: it swells and stops dead.
    const fwd = tone(440, stringParts(440, 5200, 0.25, 0.25, 1.1), 15000, 1024).data.subarray(0, 15000);
    const y = new Float32Array(15000);
    for (let i = 0; i < 15000; i++) y[i] = fwd[14999 - i];
    return { data: tailOff(y, 64), f0: fit(440, 1024) };
  },
  revCymbal: () => {
    const fwd = noiseBurst(15000, 11000, 0.18, 6500, 0x3c9);
    const y = new Float32Array(15000);
    for (let i = 0; i < 15000; i++) y[i] = fwd[14999 - i];
    return { data: tailOff(thin(y, 1500), 64) };
  },
  crystal: () =>
    tone(
      1319,
      [
        { ratio: 1, amp: 1, decay: 1 },
        { ratio: 2.41, amp: 0.5, decay: 0.3, strike: 1 },
        { ratio: 4.3, amp: 0.3, decay: 0.08, strike: 1 },
      ],
      4096,
      2048,
    ),
  bowedGlass: () =>
    tone(
      523,
      [
        { ratio: 1, amp: 1 },
        { ratio: 2.0, amp: 0.3 },
        { ratio: 2.95, amp: 0.25 },
        { ratio: 4.1, amp: 0.1 },
      ],
      4096,
      4096,
      { rise: 0.15 },
    ),
  horn: () => tone(196, sawParts(196, 3200, 1.45), 3072, 4096, { rise: 0.04, noise: 0.04, noiseDecay: 0.04 }),
  warDrum: () => {
    const x = oneShot(15500, [
      { f: 70, f2: 50, amp: 1, decay: 0.3, glide: 0.08 },
      { f: 112, f2: 84, amp: 0.4, decay: 0.15 },
    ]);
    mix(x, noiseBurst(15500, 3000, 0.02, 1800, 0x5f1), 0.6);
    return { data: tailOff(x, 1500) };
  },
  glassBell: () =>
    tone(
      1175,
      [
        { ratio: 1, amp: 1, decay: 1.5 },
        { ratio: 2.32, amp: 0.4, decay: 0.5, strike: 0.5 },
        { ratio: 4.25, amp: 0.25, decay: 0.12, strike: 1 },
      ],
      4096,
      2048,
    ),
  celesta: () =>
    tone(
      1047,
      [
        { ratio: 1, amp: 1, decay: 0.8 },
        { ratio: 2, amp: 0.25, decay: 0.2 },
        { ratio: 4.0, amp: 0.15, decay: 0.05, strike: 1 },
      ],
      4096,
      2048,
      { noise: 0.05, noiseDecay: 0.002 },
    ),

  /* ------------------------------------------------- the effects' own */
  growl: () => {
    // A throat: a low buzz with rough, beating partials.
    const parts: Partial[] = [];
    for (let k = 1; 82 * k < 3600; k++) parts.push({ ratio: k + (k % 3 === 0 ? 0.03 : 0), amp: (1 / k ** 0.8) * (k % 2 ? 1 : 0.7) });
    return tone(82, parts, 2048, 4096, { noise: 0.3, noiseClock: 2500, noiseDecay: 0.2, rise: 0.02 });
  },
  slap: () => {
    const x = noiseBurst(3200, 9000, 0.018, 5500, 0x2d1, 0.0005);
    mix(x, oneShot(3200, [{ f: 260, f2: 160, amp: 0.6, decay: 0.02 }]), 1);
    return { data: tailOff(x, 128) };
  },
};

/** One sample, built, compressed the cartridge's way and smoothed the S-DSP's. */
export function buildSample(id: SampleId): Sample {
  const b = BUILD[id]();
  const loopStart = b.loopStart ?? null;
  const data = normalise(gauss(brr(normalise(b.data, 0.95)), loopStart), 0.95);
  if (loopStart !== null && loopStart >= SEAM) seal(data, loopStart);
  return { id, data, loopStart, f0: b.f0 ?? 0 };
}

/** Frames over which a loop's end is drawn onto the frames before its start. */
const SEAM = 64;

/**
 * Closes the loop after the compression: the frames leading up to the loop's
 * end are blended into the ones leading up to its start, which the loop's end
 * stands in for every time it wraps - the four-bit steps otherwise leave a
 * tick there, once a loop.
 */
function seal(x: Float32Array, loopStart: number): void {
  const end = x.length;
  if (end - loopStart < SEAM * 2) return;
  for (let k = 1; k <= SEAM; k++) {
    const w = 1 - (k - 1) / SEAM;
    x[end - k] = x[end - k] * (1 - w) + x[loopStart - k] * w;
  }
}

/** For the checks: every id in the palette. */
export const SAMPLE_IDS = Object.keys(BUILD) as SampleId[];
