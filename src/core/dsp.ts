import { RATE, type Sample, type SampleId, SAMPLE_IDS, buildSample } from './samples';

/**
 * The sound chip: an S-DSP, the sixteen-bit sampler, as far as Web Audio goes.
 *
 *   - Eight channels for everything: six for the music, two for the effects,
 *     and the most urgent effects - a boss winding up, the hero hurt, a boss
 *     falling - may take a music channel for as long as they sound. On a
 *     channel one note at a time: the next one cuts the last.
 *   - A voice is a sample from the palette (samples.ts) at a pitch, under an
 *     envelope from the chip's own tables - an attack, a decay to a sustain
 *     level in eighths, a sustain that falls on its own - and a key-off that
 *     lets go in eight milliseconds. No filters on a voice, nothing swept,
 *     nothing doubled: a slide of pitch and a vibrato are all a voice has.
 *   - One echo unit instead of a hall: a delay of 16 ms steps, a feedback and
 *     an eight-tap filter, set per zone, switched on or off per voice. A cave
 *     rings back at you; a forest barely does.
 *   - No compressor. The channels' levels leave the headroom, and a gentle
 *     fixed low-pass at 10 kHz on the way out stands in for the smoothing a
 *     real chip does between samples.
 *
 * Everything is scheduled on the context's clock, a little ahead of time; a
 * voice's start, its envelope, its key-off and its end are all known when it
 * is set going, and every voice is stopped when it ends.
 */

/** The chip's attack times, in milliseconds: an envelope picks one. */
export const ATTACK_MS = [0, 6, 10, 16, 24, 40, 64, 100, 160, 260, 400, 640, 1000] as const;
/** Key-off: a straight fall to nothing in eight milliseconds. */
export const RELEASE = 0.008;
export const CHANNELS = 8;
/** The music's channels are 0-5; the effects' own are 6 and 7. */
export const MUSIC_CHANNELS = 6;

export interface Adsr {
  /** Index into ATTACK_MS. */
  a: number;
  /** Seconds the decay takes to fall by 1/e towards the sustain level. */
  d: number;
  /** The sustain level, in eighths of the peak: 8 is no decay at all. */
  s: number;
  /** Seconds the sustain takes to fall by 1/e; Infinity holds. */
  f: number;
}

/** The envelope's level t seconds after key-on, 0..1, as the context will compute it. */
export function envelopeAt(e: Adsr, t: number): number {
  const a = ATTACK_MS[e.a] / 1000;
  if (t <= 0) return a > 0 ? 0 : 1;
  if (t < a) return t / a;
  const s = e.s / 8;
  const d = Math.max(1e-4, e.d);
  const settle = e.s >= 8 ? 0 : d * 4;
  if (t < a + settle) return s + (1 - s) * Math.exp(-(t - a) / d);
  const held = e.s >= 8 ? 1 : s + (1 - s) * Math.exp(-settle / d);
  return e.f === Infinity ? held : held * Math.exp(-(t - a - settle) / e.f);
}

export interface Note {
  sample: SampleId;
  /** Playback rate at key-on: 1 is the sample's own pitch. */
  rate: number;
  /** A slide: the rate reached `slide` seconds after key-on, exponentially. */
  rate2?: number;
  slide?: number;
  /** A vibrato: [Hz, depth in semitones, seconds before it starts]. */
  vib?: readonly [number, number, number];
  /** Peak level, as a share of full scale. */
  vol: number;
  pan?: number;
  adsr: Adsr;
  /** Into the echo, or dry only. */
  echo?: boolean;
  /** Key-on, on the context clock, and how long until key-off. */
  at: number;
  dur: number;
}

/** Where a voice's sound goes: its dry path, and the echo send beside it. */
export interface Outlet {
  dry: AudioNode;
  wet: AudioNode;
}

interface Voice {
  src: AudioBufferSourceNode;
  env: GainNode;
  pan: StereoPannerNode;
  note: Note;
  start: number;
  /** When it is silent and stopped. */
  end: number;
  priority: number;
  owner: 'music' | 'sfx';
}

/** The echo presets: a delay in 16 ms steps, the feedback, and how loud it comes back. */
export interface EchoPreset {
  steps: number;
  feedback: number;
  level: number;
}

/**
 * The echo filter: eight taps, the low-pass most cartridges of the era used,
 * so every pass round the loop comes back a little duller.
 */
const ECHO_FIR = [12, 33, 43, 43, 19, -2, -13, -7].map((v) => v / 128);

export class Dsp {
  readonly master: GainNode;
  /** The music's level, its switch (M) and the pause's dip. */
  readonly musicBus: GainNode;
  /** A dip of the music under a boss's wind-up. */
  readonly musicDip: GainNode;
  readonly musicWet: GainNode;
  /** The effects' level and their switch (N). */
  readonly sfxBus: GainNode;
  readonly sfxWet: GainNode;
  private readonly echoIn: GainNode;
  private readonly echoDelay: DelayNode;
  private readonly echoFeedback: GainNode;
  private readonly echoReturn: GainNode;
  private echoPreset: EchoPreset | null = null;
  private readonly samples = new Map<SampleId, Sample>();
  private readonly buffers = new Map<SampleId, AudioBuffer>();
  /** Samples still to build, a few at a time, after the first key press. */
  private readonly pending: SampleId[] = [...SAMPLE_IDS];
  /** Each channel's voices, sounding and scheduled, in order. */
  private readonly voices: Voice[][] = Array.from({ length: CHANNELS }, () => []);

  constructor(readonly ctx: BaseAudioContext) {
    this.master = ctx.createGain();
    this.master.gain.value = 1;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 10000;
    lp.Q.value = Math.SQRT1_2;
    this.master.connect(lp);
    lp.connect(ctx.destination);

    this.musicDip = ctx.createGain();
    this.musicDip.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.musicDip);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);

    // The echo unit: what goes in is delayed, filtered, fed back into the
    // delay, and returned to the mix.
    this.echoIn = ctx.createGain();
    this.echoDelay = ctx.createDelay(0.5);
    this.echoDelay.delayTime.value = 0.048;
    const fir = ctx.createIIRFilter(ECHO_FIR, [1]);
    this.echoFeedback = ctx.createGain();
    this.echoFeedback.gain.value = 0;
    this.echoReturn = ctx.createGain();
    this.echoReturn.gain.value = 0;
    this.echoIn.connect(this.echoDelay);
    this.echoDelay.connect(fir);
    fir.connect(this.echoFeedback);
    this.echoFeedback.connect(this.echoDelay);
    fir.connect(this.echoReturn);
    this.echoReturn.connect(this.master);
    this.musicWet = ctx.createGain();
    this.musicWet.connect(this.echoIn);
    this.sfxWet = ctx.createGain();
    this.sfxWet.connect(this.echoIn);
  }

  /** The sample's buffer, built now if it has not been yet. */
  buffer(id: SampleId): AudioBuffer {
    const have = this.buffers.get(id);
    if (have) return have;
    const s = this.sample(id);
    const b = this.ctx.createBuffer(1, s.data.length, RATE);
    b.getChannelData(0).set(s.data);
    this.buffers.set(id, b);
    return b;
  }

  sample(id: SampleId): Sample {
    let s = this.samples.get(id);
    if (!s) {
      s = buildSample(id);
      this.samples.set(id, s);
      const i = this.pending.indexOf(id);
      if (i >= 0) this.pending.splice(i, 1);
    }
    return s;
  }

  /** Builds a few more of the palette in the background; true while any are left. */
  warm(count = 3): boolean {
    for (let n = 0; n < count && this.pending.length > 0; n++) this.buffer(this.pending[0]);
    return this.pending.length > 0;
  }

  /** The rate that plays a sample at `hz`; drums and noise take a rate directly. */
  rateFor(id: SampleId, hz: number): number {
    const f0 = this.sample(id).f0;
    return f0 > 0 ? hz / f0 : 1;
  }

  /**
   * Sets a note going on a channel. Whatever the channel holds that would
   * still sound at its key-on is cut first, so the channel never sounds two.
   */
  play(channel: number, note: Note, out: Outlet, owner: 'music' | 'sfx', priority: number): Voice | null {
    const ctx = this.ctx;
    const sample = this.sample(note.sample);
    const buffer = this.buffer(note.sample);
    this.cut(channel, note.at);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    if (sample.loopStart !== null) {
      src.loop = true;
      src.loopStart = sample.loopStart / RATE;
      src.loopEnd = buffer.duration;
    }
    const at = note.at;
    const rate = src.playbackRate;
    rate.setValueAtTime(note.rate, at);
    if (note.rate2 !== undefined && note.rate2 !== note.rate) {
      rate.exponentialRampToValueAtTime(Math.max(0.01, note.rate2), at + Math.max(0.005, note.slide ?? note.dur));
    } else if (note.vib && note.dur > note.vib[2] + 0.05) {
      // A vibrato as a curve of rates: the chip has no oscillator to spare for it.
      const [hz, depth, delay] = note.vib;
      const span = note.dur - delay;
      const points = Math.max(8, Math.ceil(span * 40));
      const curve = new Float32Array(points);
      for (let i = 0; i < points; i++) {
        const t = (i / (points - 1)) * span;
        const fadeIn = Math.min(1, t / 0.25);
        curve[i] = note.rate * Math.pow(2, (depth * fadeIn * Math.sin(2 * Math.PI * hz * t)) / 12);
      }
      rate.setValueCurveAtTime(curve, at + delay, span);
    }
    const env = ctx.createGain();
    const g = env.gain;
    const e = note.adsr;
    const peak = Math.max(0, note.vol);
    const attack = ATTACK_MS[e.a] / 1000;
    if (attack > 0) {
      g.setValueAtTime(0, at);
      g.linearRampToValueAtTime(peak, at + attack);
    } else {
      g.setValueAtTime(peak, at);
    }
    if (e.s < 8) g.setTargetAtTime((peak * e.s) / 8, at + attack, Math.max(1e-4, e.d));
    const settle = e.s >= 8 ? 0 : e.d * 4;
    if (e.f !== Infinity) g.setTargetAtTime(0, at + attack + settle, e.f);
    // Key-off: from wherever the envelope is, straight down in 8 ms. A
    // one-shot that runs out first simply ends.
    let off = at + Math.max(0.004, note.dur);
    if (sample.loopStart === null) off = Math.min(off, at + buffer.duration / Math.max(0.05, Math.min(note.rate, note.rate2 ?? note.rate)));
    const level = peak * envelopeAt(e, off - at);
    g.setValueAtTime(level, off);
    g.linearRampToValueAtTime(0, off + RELEASE);
    const end = off + RELEASE;

    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, note.pan ?? 0));
    src.connect(env);
    env.connect(pan);
    pan.connect(out.dry);
    if (note.echo) pan.connect(out.wet);
    src.start(at);
    src.stop(end);
    const voice: Voice = { src, env, pan, note, start: at, end, priority, owner };
    src.onended = () => {
      env.disconnect();
      pan.disconnect();
    };
    this.voices[channel].push(voice);
    return voice;
  }

  /**
   * Silences a channel from `at` on - or only the music's or the effects'
   * voices on it: one still sounding then lets go in the 8 ms before, and one
   * scheduled to start later never does. They stay on the channel's list
   * until prune() sees them end, so a later call still knows they sound.
   */
  cut(channel: number, at: number, owner?: 'music' | 'sfx'): void {
    const list = this.voices[channel];
    for (let i = list.length - 1; i >= 0; i--) {
      const v = list[i];
      if (owner && v.owner !== owner) continue;
      // Over by then: it stays on the list, sounding, until prune() sees it end.
      if (v.end <= at) continue;
      if (v.start >= at) {
        v.src.stop(v.start);
        v.end = v.start;
        continue;
      }
      const from = Math.max(v.start, at - RELEASE);
      const g = v.env.gain;
      g.cancelScheduledValues(from);
      g.setValueAtTime(v.note.vol * envelopeAt(v.note.adsr, from - v.start), from);
      g.linearRampToValueAtTime(0, at);
      v.src.stop(at);
      v.end = at;
    }
  }

  /** The voice that will be sounding on a channel at time t, if any. */
  holder(channel: number, t: number): { priority: number; owner: 'music' | 'sfx'; end: number } | null {
    let found: Voice | null = null;
    for (const v of this.voices[channel]) {
      if (v.start <= t && v.end > t) found = v;
    }
    return found;
  }

  /** When a channel's last scheduled voice ends. */
  busyUntil(channel: number): number {
    const list = this.voices[channel];
    let end = 0;
    for (const v of list) end = Math.max(end, v.end);
    return end;
  }

  /** Drops the voices that are over, so the lists stay short. */
  prune(now: number): void {
    for (const list of this.voices) {
      for (let i = list.length - 1; i >= 0; i--) if (list[i].end <= now) list.splice(i, 1);
    }
  }

  /** The echo for the room: changed in steps, never swept - down, the new delay, back up. */
  setEcho(p: EchoPreset, at: number): void {
    const was = this.echoPreset;
    if (was && was.steps === p.steps && was.feedback === p.feedback && was.level === p.level) return;
    this.echoPreset = p;
    const fb = this.echoFeedback.gain;
    const ret = this.echoReturn.gain;
    fb.cancelScheduledValues(at);
    ret.cancelScheduledValues(at);
    if (!was) {
      this.echoDelay.delayTime.setValueAtTime(p.steps * 0.016, at);
      fb.setValueAtTime(p.feedback, at);
      ret.setValueAtTime(p.level, at);
      return;
    }
    const from = { fb: was.feedback, ret: was.level };
    for (let k = 1; k <= 4; k++) {
      fb.setValueAtTime(from.fb * (1 - k / 4), at + k * 0.05);
      ret.setValueAtTime(from.ret * (1 - k / 4), at + k * 0.05);
    }
    const switchAt = at + 0.21;
    this.echoDelay.delayTime.setValueAtTime(p.steps * 0.016, switchAt);
    const back = switchAt + p.steps * 0.016 + 0.02;
    for (let k = 1; k <= 4; k++) {
      fb.setValueAtTime((p.feedback * k) / 4, back + k * 0.05);
      ret.setValueAtTime((p.level * k) / 4, back + k * 0.05);
    }
  }

  get echo(): EchoPreset | null {
    return this.echoPreset;
  }
}

/**
 * A gain moved in steps rather than a sweep - the way the era faded a
 * volume register - from where it is to `to`, over `seconds`.
 */
export function stepGain(param: AudioParam, from: number, to: number, at: number, seconds: number, steps = 8): void {
  param.cancelScheduledValues(at);
  param.setValueAtTime(from, at);
  for (let k = 1; k <= steps; k++) param.setValueAtTime(from + ((to - from) * k) / steps, at + (seconds * k) / steps);
}
