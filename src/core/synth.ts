/**
 * The building blocks every sound in the game is made of.
 *
 * There are no audio files in this game, so everything the player hears is put
 * together here out of a handful of parts: an oscillator with a pitch sweep and
 * an envelope, a burst of filtered noise, a two-operator FM voice for anything
 * metallic or bell-like, and a few drums. Each part can go through a filter,
 * sit somewhere in the stereo field and send some of itself into the hall.
 *
 * All times are in seconds on the AudioContext clock.
 */

export interface FilterSpec {
  type: BiquadFilterType;
  /** Cutoff at the start... */
  f: number;
  /** ...and where it sweeps to by the end, if anywhere. */
  f2?: number;
  q?: number;
}

export interface ToneSpec {
  type?: OscillatorType;
  /** Start and end frequency. */
  f: number;
  f2?: number;
  /** Delay from the call, seconds. */
  at?: number;
  dur: number;
  gain: number;
  attack?: number;
  /** How the pitch travels: exponential sounds natural, linear sounds synthetic. */
  glide?: 'exp' | 'lin';
  /** Cents, for a second, slightly detuned copy that thickens the voice. */
  detune?: number;
  filter?: FilterSpec;
  pan?: number;
  /** Share sent to the reverb, 0..1. */
  wet?: number;
  vibrato?: { rate: number; depth: number };
  /** Through the drive stage, for impacts that should crunch. */
  drive?: boolean;
  /**
   * Hold at full level and only let go over this many seconds at the end -
   * for pads and held notes. Without it the voice starts dying the moment it
   * has sounded, which is right for anything struck.
   */
  release?: number;
}

export interface NoiseSpec {
  at?: number;
  dur: number;
  gain: number;
  attack?: number;
  filter: FilterSpec;
  pan?: number;
  wet?: number;
  drive?: boolean;
}

export interface FmSpec {
  f: number;
  f2?: number;
  /** Modulator frequency as a multiple of the carrier's. */
  ratio: number;
  /** Modulation depth at the start, decaying towards `index2`. */
  index: number;
  index2?: number;
  at?: number;
  dur: number;
  gain: number;
  attack?: number;
  pan?: number;
  wet?: number;
  type?: OscillatorType;
}

/** A place a voice can be sent: a gain node, plus the reverb send beside it. */
export interface Outlet {
  dry: AudioNode;
  wet: AudioNode;
  drive: AudioNode;
}

const MIN = 0.0001;

export function midiToHz(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

export class Synth {
  private readonly noiseBuffer: AudioBuffer;

  constructor(readonly ctx: AudioContext) {
    // Two seconds of white noise, shared by every noise voice.
    const length = Math.floor(ctx.sampleRate * 2);
    this.noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  }

  /** A generated hall: stereo noise decaying over `seconds`. */
  static impulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        const t = i / length;
        // A little pre-delay, then a smooth tail.
        const early = i < ctx.sampleRate * 0.012 ? 0 : 1;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * early;
      }
    }
    return buffer;
  }

  /** A soft-clipping curve for the drive stage. */
  static driveCurve(amount: number): Float32Array {
    const n = 1024;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x));
    }
    return curve;
  }

  /**
   * Attack to peak, then an exponential fall to silence at `end` - or, with a
   * release, a hold at the peak and the fall only over its last stretch.
   */
  private envelope(gain: GainNode, start: number, peak: number, attack: number, end: number, release?: number): void {
    const g = gain.gain;
    const top = Math.max(MIN, peak);
    const attackEnd = start + Math.max(0.002, attack);
    g.setValueAtTime(MIN, start);
    g.exponentialRampToValueAtTime(top, attackEnd);
    if (release !== undefined && end - release > attackEnd) {
      g.setValueAtTime(top, end - release);
    }
    g.exponentialRampToValueAtTime(MIN, end);
  }

  private route(node: AudioNode, out: Outlet, pan: number | undefined, wet: number | undefined, drive?: boolean): void {
    let last: AudioNode = node;
    if (pan !== undefined && pan !== 0) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      last.connect(p);
      last = p;
    }
    last.connect(drive ? out.drive : out.dry);
    if (wet && wet > 0) {
      const send = this.ctx.createGain();
      send.gain.value = wet;
      last.connect(send);
      send.connect(out.wet);
    }
  }

  private filterNode(spec: FilterSpec, start: number, end: number): BiquadFilterNode {
    const filter = this.ctx.createBiquadFilter();
    filter.type = spec.type;
    filter.Q.value = spec.q ?? 0.8;
    filter.frequency.setValueAtTime(spec.f, start);
    if (spec.f2 !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(20, spec.f2), end);
    }
    return filter;
  }

  tone(out: Outlet, time: number, spec: ToneSpec): void {
    const ctx = this.ctx;
    const start = time + (spec.at ?? 0);
    const end = start + spec.dur;
    const gain = ctx.createGain();
    this.envelope(gain, start, spec.gain, spec.attack ?? 0.006, end, spec.release);

    let head: AudioNode = gain;
    if (spec.filter) {
      const filter = this.filterNode(spec.filter, start, end);
      filter.connect(gain);
      head = filter;
    }
    const voices = spec.detune ? [-spec.detune, spec.detune] : [0];
    for (const cents of voices) {
      const osc = ctx.createOscillator();
      osc.type = spec.type ?? 'sine';
      osc.detune.value = cents;
      osc.frequency.setValueAtTime(spec.f, start);
      if (spec.f2 !== undefined && spec.f2 !== spec.f) {
        if (spec.glide === 'lin') osc.frequency.linearRampToValueAtTime(spec.f2, end);
        else osc.frequency.exponentialRampToValueAtTime(Math.max(20, spec.f2), end);
      }
      if (spec.vibrato) {
        const lfo = ctx.createOscillator();
        const depth = ctx.createGain();
        lfo.frequency.value = spec.vibrato.rate;
        depth.gain.value = spec.vibrato.depth;
        lfo.connect(depth).connect(osc.frequency);
        lfo.start(start);
        lfo.stop(end + 0.05);
      }
      osc.connect(head);
      osc.start(start);
      osc.stop(end + 0.05);
    }
    this.route(gain, out, spec.pan, spec.wet, spec.drive);
  }

  noise(out: Outlet, time: number, spec: NoiseSpec): void {
    const ctx = this.ctx;
    const start = time + (spec.at ?? 0);
    const end = start + spec.dur;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    // Start somewhere random in the buffer, so two bursts are never the same.
    const offset = Math.random() * (this.noiseBuffer.duration - Math.min(1.9, spec.dur) - 0.05);
    const filter = this.filterNode(spec.filter, start, end);
    const gain = ctx.createGain();
    this.envelope(gain, start, spec.gain, spec.attack ?? 0.004, end);
    src.connect(filter).connect(gain);
    this.route(gain, out, spec.pan, spec.wet, spec.drive);
    src.start(start, Math.max(0, offset));
    src.stop(end + 0.05);
  }

  /** Two-operator FM: bells, blades, anything that rings. */
  fm(out: Outlet, time: number, spec: FmSpec): void {
    const ctx = this.ctx;
    const start = time + (spec.at ?? 0);
    const end = start + spec.dur;
    const carrier = ctx.createOscillator();
    carrier.type = spec.type ?? 'sine';
    const modulator = ctx.createOscillator();
    const depth = ctx.createGain();
    carrier.frequency.setValueAtTime(spec.f, start);
    modulator.frequency.setValueAtTime(spec.f * spec.ratio, start);
    if (spec.f2 !== undefined) {
      carrier.frequency.exponentialRampToValueAtTime(Math.max(20, spec.f2), end);
      modulator.frequency.exponentialRampToValueAtTime(Math.max(20, spec.f2 * spec.ratio), end);
    }
    depth.gain.setValueAtTime(spec.f * spec.index, start);
    depth.gain.exponentialRampToValueAtTime(Math.max(MIN, spec.f * (spec.index2 ?? spec.index * 0.05)), end);
    modulator.connect(depth).connect(carrier.frequency);
    const gain = ctx.createGain();
    this.envelope(gain, start, spec.gain, spec.attack ?? 0.003, end);
    carrier.connect(gain);
    this.route(gain, out, spec.pan, spec.wet);
    carrier.start(start);
    modulator.start(start);
    carrier.stop(end + 0.05);
    modulator.stop(end + 0.05);
  }

  /* ----------------------------------------------------------------- drums */

  kick(out: Outlet, time: number, gain = 0.8, tune = 1): void {
    this.tone(out, time, { type: 'sine', f: 150 * tune, f2: 42 * tune, dur: 0.32, gain, attack: 0.002 });
    this.noise(out, time, { dur: 0.018, gain: gain * 0.25, filter: { type: 'lowpass', f: 3000 } });
  }

  snare(out: Outlet, time: number, gain = 0.4, wet = 0.2): void {
    this.noise(out, time, {
      dur: 0.19,
      gain,
      filter: { type: 'bandpass', f: 2200, f2: 1400, q: 0.7 },
      wet,
    });
    this.tone(out, time, { type: 'triangle', f: 220, f2: 160, dur: 0.1, gain: gain * 0.7 });
  }

  hat(out: Outlet, time: number, gain = 0.12, open = false, pan = 0.25): void {
    this.noise(out, time, {
      dur: open ? 0.22 : 0.045,
      gain,
      filter: { type: 'highpass', f: 7200, q: 0.6 },
      pan,
    });
  }

  tom(out: Outlet, time: number, f: number, gain = 0.5, wet = 0.25): void {
    this.tone(out, time, { type: 'sine', f, f2: f * 0.55, dur: 0.42, gain, attack: 0.002, wet });
    this.noise(out, time, { dur: 0.05, gain: gain * 0.2, filter: { type: 'lowpass', f: 1400 }, wet });
  }
}
