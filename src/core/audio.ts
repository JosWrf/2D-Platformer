import { CHANNELS, Dsp, type EchoPreset, RELEASE, stepGain } from './dsp';
import { Music, TRACK_NAMES, trackInfo, type TrackName } from './music';
import { RATE, SAMPLE_IDS, buildSample } from './samples';
import { CLASS_LEVEL, SFX, SFX_NAMES, type Sfx } from './sfx';

export type { TrackName } from './music';
export type { Sfx } from './sfx';

/** The music's level on the desk, and how far the pause and a dialogue push it down (-8 dB). */
const MUSIC_LEVEL = 1;
const DUCKED = 0.4;
/** Under a boss's wind-up the music steps down 4 dB for 0.3 s, so the warning is heard. */
const DIP = 0.63;
const DIP_TIME = 0.3;

/** The effects switch (N), and the music switch (M), as remembered. */
const STORE_SFX = 'shadowblade.sfx';
const STORE_MUSIC = 'shadowblade.music';
/** Where N used to remember "all sound off", music included: read once, then gone. */
const STORE_LEGACY = 'shadowblade.sound';

/**
 * The rooms' echo: a short, quiet slap in the open, a longer one in a cave,
 * a long low one in the rift, and the drowned hall's, which keeps answering.
 */
const ROOMS = {
  open: { steps: 3, feedback: 0.25, level: 0.2 },
  cave: { steps: 7, feedback: 0.45, level: 0.26 },
  rift: { steps: 10, feedback: 0.4, level: 0.15 },
  hall: { steps: 13, feedback: 0.57, level: 0.28 },
} satisfies Record<string, EchoPreset>;

type Room = keyof typeof ROOMS;

const ZONE_ROOM: Record<string, Room> = {
  forest: 'open',
  ruins: 'open',
  castle: 'open',
  crystalworld: 'open',
  caverns: 'cave',
  throne: 'cave',
  lair: 'cave',
  rift: 'rift',
  riftend: 'rift',
  drowned: 'hall',
};

/** Effect channels: their own two, and the music's last ones for the urgent and the big. */
const SFX_CHANNELS = [7, 6];
const URGENT_CHANNELS = [7, 6, 5];
const SET_CHANNELS = [7, 6, 5, 4];

/**
 * The sound of the game: the chip (dsp.ts), its palette (samples.ts), the
 * effects (sfx.ts) and the music (music.ts, tracks.ts), behind the few
 * calls the game makes - play an effect, want a piece, say which room the
 * hero is in, dim the music for the pause - and the two switches.
 */
export class AudioBus {
  private ctx: BaseAudioContext | null = null;
  private dsp: Dsp | null = null;
  private music: Music | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly last = new Map<Sfx, number>();
  private wantedTrack: TrackName | null = null;
  private room: Room = 'open';
  private ducked = false;
  /** The effects off, the music playing on (N). */
  sfxOff = false;
  /** The music off, the effects playing on (M). */
  musicOff = false;

  constructor() {
    try {
      // N once switched everything off, music too: whoever chose that gets
      // both off now.
      if (localStorage.getItem(STORE_LEGACY) === '0') {
        localStorage.setItem(STORE_SFX, '0');
        localStorage.setItem(STORE_MUSIC, '0');
      }
      localStorage.removeItem(STORE_LEGACY);
      this.sfxOff = localStorage.getItem(STORE_SFX) === '0';
      this.musicOff = localStorage.getItem(STORE_MUSIC) === '0';
    } catch {
      // No storage: defaults it is.
    }
  }

  /** Every effect's name and every piece's: for the tools. */
  get sfxNames(): readonly Sfx[] {
    return SFX_NAMES;
  }

  get trackNames(): readonly TrackName[] {
    return TRACK_NAMES;
  }

  trackInfo(name: TrackName): ReturnType<typeof trackInfo> {
    return trackInfo(name);
  }

  /** Browsers only allow audio after a user gesture, so this is called lazily. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx instanceof AudioContext && this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      let ctx: AudioContext;
      try {
        // The chip's own rate: nothing above 16 kHz exists to be heard.
        ctx = new Ctor({ sampleRate: RATE });
      } catch {
        ctx = new Ctor();
      }
      this.attach(ctx);
      this.timer = setInterval(() => this.tick(), 40);
    } catch {
      this.ctx = null;
      this.dsp = null;
      this.music = null;
    }
  }

  /** Builds the desk on a context: the chip, its buses at their switches' levels, the room, the music. */
  private attach(ctx: BaseAudioContext): void {
    this.ctx = ctx;
    const dsp = new Dsp(ctx);
    this.dsp = dsp;
    dsp.musicBus.gain.value = this.musicOff ? 0 : MUSIC_LEVEL * (this.ducked ? DUCKED : 1);
    dsp.musicWet.gain.value = this.musicOff ? 0 : 1;
    dsp.sfxBus.gain.value = this.sfxOff ? 0 : 1;
    dsp.sfxWet.gain.value = this.sfxOff ? 0 : 1;
    dsp.setEcho(ROOMS[this.room], ctx.currentTime);
    this.music = new Music(dsp);
    if (!this.musicOff) this.music.play(this.wantedTrack);
    this.music.tick();
  }

  /** Keeps the music scheduled and the palette building. Also called from the game loop. */
  tick(): void {
    if (!this.dsp || !this.ctx) return;
    this.dsp.warm(1);
    this.dsp.prune(this.ctx.currentTime);
    if (this.music) this.music.tick();
  }

  /**
   * An effect: its notes on a channel or two of the chip, taking free ones
   * first, then the ones holding the least important sound - never one that
   * matters more than it does.
   */
  play(name: Sfx, pitch = 1): void {
    const dsp = this.dsp;
    const ctx = this.ctx;
    if (this.sfxOff || !dsp || !ctx) return;
    const def = SFX[name];
    if (!def) return;
    const now = ctx.currentTime;
    const before = this.last.get(name) ?? -1;
    if (now - before < (def.gap ?? 0.018)) return;
    this.last.set(name, now);
    const p = pitch * (def.steady ? 1 : 1 + (Math.random() * 2 - 1) * 0.035);
    // Long enough ahead for whatever the channel holds to let go first.
    const t0 = now + RELEASE + 0.006;
    let layers = 0;
    for (const h of def.hits) layers = Math.max(layers, (h.ch ?? 0) + 1);
    const allowed = def.cls === 'set' ? SET_CHANNELS : def.pri >= 7 || def.urgent ? URGENT_CHANNELS : SFX_CHANNELS;
    const assign: number[] = [];
    for (let l = 0; l < layers; l++) {
      let best = -1;
      let bestPri = Infinity;
      let bestEnd = Infinity;
      for (const ch of allowed) {
        if (assign.includes(ch)) continue;
        const held = dsp.holder(ch, t0);
        // A sound struck this same moment keeps its channel against one that
        // matters no more than it does: one of them is heard, not neither.
        const pri = held ? held.priority + (held.start >= t0 ? 0.5 : 0) : -1;
        const end = held ? held.end : 0;
        if (pri < bestPri || (pri === bestPri && end < bestEnd)) {
          best = ch;
          bestPri = pri;
          bestEnd = end;
        }
      }
      if (best < 0 || bestPri > def.pri) break;
      assign.push(best);
    }
    if (assign.length === 0) return;
    const echo = def.cls === 'set' || (!!def.echo && this.room !== 'open');
    const level = CLASS_LEVEL[def.cls] * (def.level ?? 1);
    const out = { dry: dsp.sfxBus, wet: dsp.sfxWet };
    for (const h of def.hits) {
      const ch = assign[h.ch ?? 0];
      if (ch === undefined) continue;
      const rate = h.hz !== undefined ? dsp.rateFor(h.s, h.hz * p) : (h.r ?? 1) * p;
      dsp.play(
        ch,
        {
          sample: h.s,
          rate,
          rate2: h.to !== undefined ? rate * h.to : undefined,
          slide: h.slide ?? h.dur,
          vib: h.vib,
          vol: level * (h.v ?? 1),
          pan: h.pan ?? 0,
          adsr: h.env ?? { a: 0, d: 1, s: 8, f: Infinity },
          echo,
          at: t0 + (h.at ?? 0),
          dur: h.dur,
          from: h.from,
        },
        out,
        'sfx',
        def.pri,
      );
    }
    if (def.cls === 'tell' && !this.musicOff) {
      // The music steps aside for a boss's warning, then comes back.
      const g = dsp.musicDip.gain;
      g.cancelScheduledValues(t0);
      g.setValueAtTime(DIP, t0);
      g.setValueAtTime((DIP + 1) / 2, t0 + DIP_TIME);
      g.setValueAtTime(1, t0 + DIP_TIME + 0.05);
    }
  }

  /** Which piece should be playing. Cheap to call every frame. */
  setMusic(track: TrackName | null): void {
    this.wantedTrack = track;
    if (this.music && !this.musicOff) this.music.play(track);
  }

  get currentTrack(): TrackName | null {
    return this.musicOff ? null : (this.music?.current ?? null);
  }

  /** The room the hero is in, by zone name: it sets the echo. */
  setRoom(zone: string): void {
    const room = ZONE_ROOM[zone] ?? 'open';
    if (room === this.room) return;
    this.room = room;
    if (this.dsp && this.ctx) this.dsp.setEcho(ROOMS[room], this.ctx.currentTime);
  }

  /** The music pushed down 8 dB, for the pause screen, a dialogue and a fall: in steps, not a sweep. */
  duck(on: boolean): void {
    if (on === this.ducked) return;
    this.ducked = on;
    if (!this.dsp || !this.ctx || this.musicOff) return;
    const g = this.dsp.musicBus.gain;
    stepGain(g, MUSIC_LEVEL * (on ? 1 : DUCKED), MUSIC_LEVEL * (on ? DUCKED : 1), this.ctx.currentTime, 0.12, 4);
  }

  /** N: the effects alone, off and back on - the music plays on. Remembered across sessions. */
  toggleSfx(): boolean {
    this.sfxOff = !this.sfxOff;
    this.remember(STORE_SFX, !this.sfxOff);
    if (this.ctx && this.dsp) {
      const now = this.ctx.currentTime;
      const to = this.sfxOff ? 0 : 1;
      stepGain(this.dsp.sfxBus.gain, 1 - to, to, now, 0.05, 4);
      stepGain(this.dsp.sfxWet.gain, 1 - to, to, now, 0.05, 4);
      if (this.sfxOff) for (let ch = 0; ch < CHANNELS; ch++) this.dsp.cut(ch, now + RELEASE + 0.002, 'sfx');
    }
    return !this.sfxOff;
  }

  /** M: the music alone, off and back on - the effects play on. Remembered across sessions. */
  toggleMusic(): boolean {
    this.musicOff = !this.musicOff;
    this.remember(STORE_MUSIC, !this.musicOff);
    if (this.ctx && this.dsp) {
      const now = this.ctx.currentTime;
      const level = MUSIC_LEVEL * (this.ducked ? DUCKED : 1);
      // Gone within a tenth of a second, its echo send with it.
      stepGain(this.dsp.musicBus.gain, this.musicOff ? level : 0, this.musicOff ? 0 : level, now, 0.1, 4);
      stepGain(this.dsp.musicWet.gain, this.musicOff ? 1 : 0, this.musicOff ? 0 : 1, now, 0.1, 4);
    }
    if (this.music) this.music.play(this.musicOff ? null : this.wantedTrack);
    return !this.musicOff;
  }

  private remember(key: string, on: boolean): void {
    try {
      localStorage.setItem(key, on ? '1' : '0');
    } catch {
      // Private browsing: the switch just will not survive a reload.
    }
  }

  /**
   * Renders every effect and every piece offline, through the same desk, and
   * measures it: how loud at its loudest, how loud on average, and whether
   * anything came out at all. Nobody listens to a test run, so this is how
   * the tools hear the game - a recipe that builds nothing, or one that
   * clips, shows up as a number.
   */
  static async probe(seconds = 8): Promise<{
    sfx: Record<string, { peak: number; rms: number }>;
    music: Record<string, { peak: number; rms: number }>;
  }> {
    const measure = (buffer: AudioBuffer): { peak: number; rms: number } => {
      let peak = 0;
      let sum = 0;
      let n = 0;
      for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
        const data = buffer.getChannelData(ch);
        for (let i = 0; i < data.length; i++) {
          const v = Math.abs(data[i]);
          if (v > peak) peak = v;
          sum += v * v;
          n++;
        }
      }
      return { peak: Number(peak.toFixed(3)), rms: Number(Math.sqrt(sum / Math.max(1, n)).toFixed(4)) };
    };
    const bench = (length: number): { bus: AudioBus; ctx: OfflineAudioContext } => {
      const ctx = new OfflineAudioContext(2, Math.floor(RATE * length), RATE);
      const bus = new AudioBus();
      bus.sfxOff = false;
      bus.musicOff = false;
      bus.attach(ctx);
      return { bus, ctx };
    };
    const sfx: Record<string, { peak: number; rms: number }> = {};
    for (const name of SFX_NAMES) {
      const { bus, ctx } = bench(2.5);
      bus.play(name, 1);
      sfx[name] = measure(await ctx.startRendering());
    }
    const music: Record<string, { peak: number; rms: number }> = {};
    for (const name of TRACK_NAMES) {
      const { bus, ctx } = bench(seconds);
      bus.setMusic(name);
      bus.music?.tick(seconds);
      music[name] = measure(await ctx.startRendering());
    }
    return { sfx, music };
  }

  /**
   * The palette's rules, counted: how many samples, how many frames between
   * them, the longest one-shot, loop and attack - and every piece's samples,
   * its loop in bars and seconds. For the checks (tools/verify-audio.mjs).
   */
  static palette(): {
    samples: number;
    frames: number;
    longestOneShot: number;
    longestLoop: number;
    longestAttack: number;
    tracks: Record<string, ReturnType<typeof trackInfo>>;
  } {
    let frames = 0;
    let longestOneShot = 0;
    let longestLoop = 0;
    let longestAttack = 0;
    for (const id of SAMPLE_IDS) {
      const s = buildSample(id);
      frames += s.data.length;
      if (s.loopStart === null) longestOneShot = Math.max(longestOneShot, s.data.length);
      else {
        longestLoop = Math.max(longestLoop, s.data.length - s.loopStart);
        longestAttack = Math.max(longestAttack, s.loopStart);
      }
    }
    const tracks: Record<string, ReturnType<typeof trackInfo>> = {};
    for (const name of TRACK_NAMES) tracks[name] = trackInfo(name);
    return { samples: SAMPLE_IDS.length, frames, longestOneShot, longestLoop, longestAttack, tracks };
  }

  /** For the verification tools: is anything actually running? */
  get running(): boolean {
    return !!this.ctx && this.ctx instanceof AudioContext && this.ctx.state === 'running' && this.timer !== null;
  }
}

export const audio = new AudioBus();
