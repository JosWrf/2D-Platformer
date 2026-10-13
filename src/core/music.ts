import { compose, type Ev, type Score } from './compose';
import { type Dsp, MUSIC_CHANNELS, type Outlet, stepGain } from './dsp';
import { SKETCHES, TRACK_LEVEL, TRACK_NAMES, type TrackName } from './tracks';

export { TRACK_NAMES, type TrackName } from './tracks';

/**
 * The music player: one piece at a time on the music's six channels, its
 * score (compose.ts) scheduled a moment ahead on the context's clock.
 *
 * A change of piece is the era's: the old one fades out in eight steps over
 * 0.6 s and stops, and then the new one starts - a boss's fight with a bar
 * or two of intro, then its loop. Two pieces never sound at once (the six
 * channels are all there is); only the echo of the old one rings on.
 *
 * A note never takes a channel an effect is holding: the effect keeps it
 * until it is done and the part drops those notes, the way a sound driver of
 * the era let its effects borrow a channel.
 */

/** How long the old piece takes to fade, and the steps it fades in. */
const FADE = 0.6;
const FADE_STEPS = 8;
/** How far ahead the notes are scheduled, seconds. */
const AHEAD = 0.25;

const scores = new Map<TrackName, Score>();

/** A piece's score, written out the first time it is wanted. */
export function scoreOf(name: TrackName): Score {
  let s = scores.get(name);
  if (!s) {
    s = compose(SKETCHES[name]);
    scores.set(name, s);
  }
  return s;
}

class Piece {
  /** The next event to schedule. */
  index = 0;
  /** Context time of step 0 of the current pass; it moves on by a loop at each wrap. */
  t0: number;
  stopAt = Infinity;
  readonly out: Outlet;
  readonly stepDur: number;

  constructor(
    readonly name: TrackName,
    readonly score: Score,
    readonly dry: GainNode,
    readonly wet: GainNode,
    start: number,
  ) {
    this.t0 = start;
    this.out = { dry, wet };
    this.stepDur = 60 / score.bpm / 4;
  }

  timeOf(index: number): number {
    const ev = this.score.events[index];
    return ev ? this.t0 + ev.step * this.stepDur : Infinity;
  }

  /** On to the next event, round the loop at the end. */
  advance(): void {
    this.index++;
    if (this.index >= this.score.events.length) {
      const s = this.score;
      this.t0 += (s.length - s.loopStep) * this.stepDur;
      this.index = Math.max(0, s.events.findIndex((e) => e.step >= s.loopStep));
    }
  }
}

export class Music {
  private piece: Piece | null = null;
  private readonly retiring: Piece[] = [];
  /** The piece that starts once the fade is over. */
  private next: { name: TrackName; at: number } | null = null;
  /** The piece asked for: what is playing, or what is about to. */
  current: TrackName | null = null;

  constructor(private readonly dsp: Dsp) {}

  play(name: TrackName | null): void {
    if (name === this.current) return;
    this.current = name;
    const now = this.dsp.ctx.currentTime;
    // Never over the tail of one still fading out.
    let free = now + 0.03;
    for (const r of this.retiring) free = Math.max(free, r.stopAt + 0.005);
    const old = this.piece;
    if (old) {
      // Out in steps, then every note of it stopped.
      const level = TRACK_LEVEL[old.name];
      stepGain(old.dry.gain, level, 0, now, FADE, FADE_STEPS);
      stepGain(old.wet.gain, level, 0, now, FADE, FADE_STEPS);
      old.stopAt = now + FADE;
      for (let ch = 0; ch < MUSIC_CHANNELS; ch++) this.dsp.cut(ch, old.stopAt, 'music');
      this.retiring.push(old);
      this.piece = null;
      free = old.stopAt + 0.005;
    } else if (this.next) {
      // A change asked for during a fade: the new piece still waits for the end of it.
      free = Math.max(free, this.next.at);
    }
    this.next = name ? { name, at: free } : null;
  }

  /** Schedules whatever falls into the next moment. Called often. */
  tick(lookahead = AHEAD): void {
    const ctx = this.dsp.ctx;
    const now = ctx.currentTime;
    for (let i = this.retiring.length - 1; i >= 0; i--) {
      const r = this.retiring[i];
      if (now >= r.stopAt + 0.05) {
        r.dry.disconnect();
        r.wet.disconnect();
        this.retiring.splice(i, 1);
      }
    }
    if (this.next && now + lookahead >= this.next.at) {
      const { name, at } = this.next;
      this.next = null;
      const dry = ctx.createGain();
      const wet = ctx.createGain();
      dry.gain.value = TRACK_LEVEL[name];
      wet.gain.value = TRACK_LEVEL[name];
      dry.connect(this.dsp.musicBus);
      wet.connect(this.dsp.musicWet);
      this.piece = new Piece(name, scoreOf(name), dry, wet, Math.max(at, now + 0.02));
    }
    const p = this.piece;
    if (!p) return;
    // A tab that was asleep comes back far behind: skip ahead, never catch up.
    let guard = p.score.events.length * 4;
    while (p.timeOf(p.index) < now - 0.3 && guard-- > 0) p.advance();
    const horizon = now + lookahead;
    guard = p.score.events.length * 2;
    while (p.timeOf(p.index) < horizon && guard-- > 0) {
      this.schedule(p, p.score.events[p.index], p.timeOf(p.index));
      p.advance();
    }
  }

  private schedule(p: Piece, ev: Ev, t: number): void {
    const dsp = this.dsp;
    const held = dsp.holder(ev.ch, t);
    if (held && held.owner === 'sfx') return;
    const inst = ev.inst;
    const len = ev.len * p.stepDur * (inst.gate ?? 1);
    const rate = ev.midi !== undefined ? dsp.rateFor(inst.s, 440 * Math.pow(2, (ev.midi - 69) / 12)) : (inst.rate ?? 1);
    dsp.play(
      ev.ch,
      {
        sample: inst.s,
        rate,
        vol: inst.vol * ev.vel,
        pan: inst.pan ?? 0,
        adsr: inst.adsr,
        echo: inst.echo ?? false,
        vib: inst.vib,
        at: t,
        dur: Math.max(0.02, len - 0.009),
      },
      p.out,
      'music',
      1,
    );
  }
}

/** A piece's loop and intro, in bars and seconds, and the samples it uses: for the checks. */
export function trackInfo(name: TrackName): { bars: number; seconds: number; intro: number; samples: string[] } {
  const s = scoreOf(name);
  const stepDur = 60 / s.bpm / 4;
  return { bars: s.loopBars, seconds: (s.length - s.loopStep) * stepDur, intro: s.loopStep * stepDur, samples: [...s.samples] };
}

export const ALL_TRACKS: readonly TrackName[] = TRACK_NAMES;
