import { Music, TRACK_NAMES, type TrackName } from './music';
import { Outlet, Synth } from './synth';

export type { TrackName } from './music';

export type Sfx =
  | 'swing'
  | 'charge'
  | 'chargeRelease'
  | 'parry'
  | 'hit'
  | 'jump'
  | 'doubleJump'
  | 'land'
  | 'dash'
  | 'hurt'
  | 'coin'
  | 'heal'
  | 'enemyDie'
  | 'bossHit'
  | 'bossRoar'
  | 'slam'
  | 'shoot'
  | 'checkpoint'
  | 'victory'
  | 'tell'
  | 'wardClose'
  | 'wardOpen'
  | 'explode'
  | 'fuse'
  | 'clank'
  | 'splash'
  | 'rumble'
  | 'burst'
  | 'fireball'
  | 'screech'
  | 'wing'
  | 'crumble'
  | 'beamCharge'
  | 'beam'
  | 'magic'
  | 'blip'
  | 'confirm'
  | 'death'
  | 'bossDown'
  | 'upgrade'
  | 'deflect'
  | 'phase';

type Recipe = (s: Synth, o: Outlet, t: number, p: number) => void;

/** Frequencies of a few notes the jingles are built from. */
const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const C6 = 1046.5;

/**
 * Every effect, as a recipe of layers. Most are three parts: a body that gives
 * the pitch, a burst of noise that gives the texture, and something short on
 * top for the attack. `p` is the pitch the caller asked for, times a small
 * random wobble so ten swings in a row are not ten copies of one sound.
 */
const RECIPES: Record<Sfx, Recipe> = {
  swing: (s, o, t, p) => {
    s.noise(o, t, { dur: 0.15, gain: 0.32, attack: 0.012, filter: { type: 'bandpass', f: 700 * p, f2: 3400 * p, q: 1.3 } });
    s.tone(o, t, { type: 'triangle', f: 520 * p, f2: 260 * p, dur: 0.09, gain: 0.035 });
  },
  charge: (s, o, t, p) => {
    s.tone(o, t, { type: 'sawtooth', f: 160 * p, f2: 720 * p, dur: 0.42, gain: 0.08, attack: 0.08, filter: { type: 'lowpass', f: 600, f2: 3000 } });
    s.fm(o, t, { f: 900 * p, f2: 1800 * p, ratio: 1.5, index: 1.2, dur: 0.42, gain: 0.025, attack: 0.2, wet: 0.3 });
  },
  chargeRelease: (s, o, t, p) => {
    s.noise(o, t, { dur: 0.32, gain: 0.3, attack: 0.01, filter: { type: 'bandpass', f: 500 * p, f2: 2800 * p, q: 0.9 } });
    s.tone(o, t, { type: 'sawtooth', f: 200 * p, f2: 50 * p, dur: 0.26, gain: 0.12, drive: true, filter: { type: 'lowpass', f: 1600 } });
    s.fm(o, t, { f: 620 * p, ratio: 2.76, index: 5, dur: 0.4, gain: 0.07, wet: 0.35 });
  },
  parry: (s, o, t, p) => {
    // A blade meeting a blade: bright, ringing, and a moment of air after.
    s.fm(o, t, { f: 1250 * p, ratio: 2.76, index: 7, index2: 0.1, dur: 0.6, gain: 0.13, wet: 0.45 });
    s.fm(o, t, { f: 1870 * p, ratio: 1.41, index: 3, dur: 0.35, gain: 0.06, pan: 0.2, wet: 0.3 });
    s.noise(o, t, { dur: 0.06, gain: 0.14, filter: { type: 'highpass', f: 4200 } });
    s.tone(o, t, { type: 'square', f: 2600 * p, f2: 1900 * p, dur: 0.05, gain: 0.03 });
  },
  hit: (s, o, t, p) => {
    s.noise(o, t, { dur: 0.13, gain: 0.3, filter: { type: 'lowpass', f: 3600 * p, f2: 380, q: 1 }, drive: true });
    s.tone(o, t, { type: 'sine', f: 190 * p, f2: 58, dur: 0.14, gain: 0.26 });
    s.tone(o, t, { type: 'square', f: 460 * p, f2: 140 * p, dur: 0.05, gain: 0.05 });
  },
  jump: (s, o, t, p) => {
    s.tone(o, t, { type: 'square', f: 260 * p, f2: 540 * p, dur: 0.1, gain: 0.045, filter: { type: 'lowpass', f: 1800 } });
    s.noise(o, t, { dur: 0.07, gain: 0.06, filter: { type: 'bandpass', f: 1400, f2: 2800, q: 0.8 } });
  },
  doubleJump: (s, o, t, p) => {
    s.tone(o, t, { type: 'triangle', f: 420 * p, f2: 980 * p, dur: 0.14, gain: 0.05 });
    s.fm(o, t, { f: 1400 * p, ratio: 2, index: 1, dur: 0.18, gain: 0.03, at: 0.03, wet: 0.3 });
    s.noise(o, t, { dur: 0.12, gain: 0.08, filter: { type: 'bandpass', f: 900, f2: 2600, q: 1.1 } });
  },
  land: (s, o, t, p) => {
    s.noise(o, t, { dur: 0.08, gain: 0.12, filter: { type: 'lowpass', f: 900 * p, f2: 300 } });
    s.tone(o, t, { type: 'sine', f: 110 * p, f2: 60, dur: 0.07, gain: 0.1 });
  },
  dash: (s, o, t, p) => {
    s.noise(o, t, { dur: 0.22, gain: 0.2, attack: 0.02, filter: { type: 'bandpass', f: 500 * p, f2: 2600 * p, q: 0.8 } });
    s.tone(o, t, { type: 'sawtooth', f: 180 * p, f2: 620 * p, dur: 0.14, gain: 0.025, filter: { type: 'lowpass', f: 1400 } });
  },
  hurt: (s, o, t, p) => {
    s.tone(o, t, { type: 'sawtooth', f: 400 * p, f2: 90 * p, dur: 0.32, gain: 0.13, drive: true, filter: { type: 'lowpass', f: 2200, f2: 500 } });
    s.tone(o, t, { type: 'square', f: 200 * p, f2: 70 * p, dur: 0.24, gain: 0.05 });
    s.noise(o, t, { dur: 0.16, gain: 0.16, filter: { type: 'bandpass', f: 1100, q: 0.9 } });
  },
  coin: (s, o, t, p) => {
    s.fm(o, t, { f: 1318 * p, ratio: 3.5, index: 1.4, dur: 0.22, gain: 0.11, pan: -0.1, wet: 0.3 });
    s.fm(o, t, { f: 1975 * p, ratio: 3.5, index: 1.2, dur: 0.34, gain: 0.1, at: 0.06, pan: 0.1, wet: 0.4 });
    s.tone(o, t, { type: 'triangle', f: 2637 * p, dur: 0.12, gain: 0.02, at: 0.06 });
  },
  heal: (s, o, t, p) => {
    [C5, E5, G5, C6].forEach((f, i) =>
      s.tone(o, t, { type: 'sine', f: f * p, dur: 0.34, gain: 0.07, at: i * 0.06, wet: 0.5 }),
    );
    s.fm(o, t, { f: C6 * 2 * p, ratio: 2, index: 0.8, dur: 0.6, gain: 0.025, at: 0.18, wet: 0.7 });
  },
  enemyDie: (s, o, t, p) => {
    s.noise(o, t, { dur: 0.38, gain: 0.2, filter: { type: 'bandpass', f: 900 * p, f2: 180, q: 0.8 }, drive: true });
    s.tone(o, t, { type: 'sawtooth', f: 280 * p, f2: 40, dur: 0.36, gain: 0.08, filter: { type: 'lowpass', f: 1200 } });
    s.tone(o, t, { type: 'sine', f: 900 * p, f2: 1800 * p, dur: 0.08, gain: 0.04, at: 0.02 });
  },
  bossHit: (s, o, t, p) => {
    s.noise(o, t, { dur: 0.22, gain: 0.32, filter: { type: 'lowpass', f: 2400 * p, f2: 260 }, drive: true });
    s.tone(o, t, { type: 'sine', f: 130 * p, f2: 42, dur: 0.26, gain: 0.3 });
    s.fm(o, t, { f: 320 * p, ratio: 1.73, index: 4, dur: 0.24, gain: 0.05, wet: 0.2 });
  },
  bossRoar: (s, o, t, p) => {
    s.tone(o, t, {
      type: 'sawtooth',
      f: 118 * p,
      f2: 52 * p,
      dur: 1.15,
      gain: 0.16,
      attack: 0.08,
      detune: 22,
      drive: true,
      filter: { type: 'lowpass', f: 900, f2: 260, q: 2 },
      vibrato: { rate: 9, depth: 6 },
      wet: 0.4,
    });
    s.noise(o, t, { dur: 1.2, gain: 0.18, attack: 0.1, filter: { type: 'bandpass', f: 620 * p, f2: 240 * p, q: 1.6 }, wet: 0.4 });
    s.tone(o, t, { type: 'sine', f: 58 * p, f2: 34, dur: 1.3, gain: 0.26, attack: 0.05 });
  },
  slam: (s, o, t, p) => {
    s.tone(o, t, { type: 'sine', f: 140 * p, f2: 28, dur: 0.55, gain: 0.4 });
    s.noise(o, t, { dur: 0.5, gain: 0.28, filter: { type: 'lowpass', f: 1400 * p, f2: 160 }, drive: true, wet: 0.35 });
    s.tone(o, t, { type: 'sawtooth', f: 72 * p, f2: 30, dur: 0.4, gain: 0.08, filter: { type: 'lowpass', f: 500 } });
  },
  shoot: (s, o, t, p) => {
    s.tone(o, t, { type: 'triangle', f: 900 * p, f2: 280 * p, dur: 0.16, gain: 0.07 });
    s.fm(o, t, { f: 640 * p, f2: 320 * p, ratio: 1.5, index: 3, dur: 0.18, gain: 0.045, wet: 0.25 });
  },
  checkpoint: (s, o, t, p) => {
    [C5, E5, G5].forEach((f, i) =>
      s.fm(o, t, { f: f * p, ratio: 3.51, index: 1.8, dur: 1.4, gain: 0.06, at: i * 0.07, pan: (i - 1) * 0.4, wet: 0.7 }),
    );
    s.noise(o, t, { dur: 0.9, gain: 0.04, attack: 0.3, filter: { type: 'highpass', f: 6000 }, wet: 0.8 });
  },
  victory: (s, o, t, p) => {
    const notes = [C5, E5, G5, C6];
    notes.forEach((f, i) => {
      s.tone(o, t, { type: 'square', f: f * p, dur: i === 3 ? 0.9 : 0.16, gain: 0.05, at: i * 0.13, release: i === 3 ? 0.6 : undefined, filter: { type: 'lowpass', f: 3200 }, wet: 0.35 });
      s.tone(o, t, { type: 'triangle', f: (f / 2) * p, dur: i === 3 ? 0.9 : 0.16, gain: 0.05, at: i * 0.13, wet: 0.3 });
    });
    // The last chord rings: a fifth and a third on top of the root.
    for (const f of [G5, E5 * 2]) {
      s.fm(o, t, { f: f * p, ratio: 3.51, index: 1.2, dur: 1.4, gain: 0.04, at: 0.39, wet: 0.7 });
    }
    s.noise(o, t, { dur: 1.1, gain: 0.05, at: 0.39, attack: 0.2, filter: { type: 'highpass', f: 7000 }, wet: 0.8 });
  },
  tell: (s, o, t, p) => {
    // A boss drawing breath: a rising hiss with a note inside it. Every
    // wind-up in the game says "something is coming" in the same voice.
    s.tone(o, t, { type: 'sawtooth', f: 180 * p, f2: 560 * p, dur: 0.4, gain: 0.12, attack: 0.1, filter: { type: 'bandpass', f: 500 * p, f2: 1800 * p, q: 3 }, wet: 0.3 });
    s.noise(o, t, { dur: 0.42, gain: 0.18, attack: 0.25, filter: { type: 'bandpass', f: 400 * p, f2: 2400 * p, q: 1.4 } });
  },
  wardClose: (s, o, t, p) => {
    s.tone(o, t, { type: 'sine', f: 96 * p, f2: 34, dur: 0.9, gain: 0.42 });
    s.noise(o, t, { dur: 1.0, gain: 0.26, filter: { type: 'lowpass', f: 900, f2: 140 }, drive: true, wet: 0.5 });
    s.fm(o, t, { f: 330 * p, f2: 990 * p, ratio: 1.41, index: 3, dur: 0.8, gain: 0.05, attack: 0.1, wet: 0.7 });
    s.tone(o, t, { type: 'square', f: 55 * p, dur: 0.7, gain: 0.04, filter: { type: 'lowpass', f: 400 }, wet: 0.4 });
  },
  wardOpen: (s, o, t, p) => {
    [1175, 880, 659, 440].forEach((f, i) =>
      s.fm(o, t, { f: f * p, ratio: 2.01, index: 1.4, dur: 0.9, gain: 0.08, at: i * 0.08, pan: 0.5 - i * 0.33, wet: 0.7 }),
    );
    s.noise(o, t, { dur: 0.9, gain: 0.07, attack: 0.1, filter: { type: 'highpass', f: 3800, f2: 9000 }, wet: 0.7 });
  },
  explode: (s, o, t, p) => {
    s.noise(o, t, { dur: 0.9, gain: 0.45, filter: { type: 'lowpass', f: 3200 * p, f2: 110 }, drive: true, wet: 0.3 });
    s.tone(o, t, { type: 'sine', f: 110 * p, f2: 28, dur: 0.7, gain: 0.42 });
    s.noise(o, t, { dur: 0.4, gain: 0.12, at: 0.08, filter: { type: 'bandpass', f: 2500, q: 2 } });
  },
  fuse: (s, o, t, p) => {
    s.noise(o, t, { dur: 0.3, gain: 0.05, filter: { type: 'highpass', f: 4000 * p } });
    s.tone(o, t, { type: 'square', f: 1600 * p, dur: 0.03, gain: 0.03 });
  },
  clank: (s, o, t, p) => {
    s.fm(o, t, { f: 760 * p, ratio: 3.13, index: 5, index2: 0.2, dur: 0.32, gain: 0.11, wet: 0.25 });
    s.noise(o, t, { dur: 0.05, gain: 0.12, filter: { type: 'highpass', f: 2800 } });
    s.tone(o, t, { type: 'sine', f: 220 * p, f2: 160, dur: 0.08, gain: 0.08 });
  },
  splash: (s, o, t, p) => {
    s.noise(o, t, { dur: 0.55, gain: 0.22, attack: 0.02, filter: { type: 'bandpass', f: 1500 * p, f2: 420 * p, q: 0.6 }, wet: 0.5 });
    for (let i = 0; i < 4; i++) {
      const f = (500 + Math.random() * 700) * p;
      s.tone(o, t, { type: 'sine', f, f2: f * 2.2, dur: 0.05, gain: 0.03, at: 0.05 + i * 0.06 + Math.random() * 0.03, wet: 0.5 });
    }
  },
  rumble: (s, o, t, p) => {
    s.noise(o, t, { dur: 1.0, gain: 0.26, attack: 0.2, filter: { type: 'lowpass', f: 220 * p, q: 1.2 } });
    s.tone(o, t, { type: 'sine', f: 46 * p, f2: 38 * p, dur: 1.0, gain: 0.2, attack: 0.2, vibrato: { rate: 7, depth: 3 } });
  },
  burst: (s, o, t, p) => {
    // Rock giving way and fire coming through it.
    s.noise(o, t, { dur: 0.7, gain: 0.34, filter: { type: 'lowpass', f: 2200 * p, f2: 240 }, drive: true, wet: 0.3 });
    s.tone(o, t, { type: 'sine', f: 90 * p, f2: 36, dur: 0.6, gain: 0.34 });
    for (let i = 0; i < 5; i++) {
      s.noise(o, t, { dur: 0.03, gain: 0.08, at: 0.05 + i * 0.07 + Math.random() * 0.04, filter: { type: 'bandpass', f: 1800 + Math.random() * 2000, q: 3 } });
    }
  },
  fireball: (s, o, t, p) => {
    s.noise(o, t, { dur: 0.36, gain: 0.26, attack: 0.03, filter: { type: 'bandpass', f: 500 * p, f2: 1600 * p, q: 0.9 } });
    s.tone(o, t, { type: 'sawtooth', f: 210 * p, f2: 110 * p, dur: 0.3, gain: 0.05, filter: { type: 'lowpass', f: 900 } });
  },
  screech: (s, o, t, p) => {
    s.tone(o, t, {
      type: 'sawtooth',
      f: 1500 * p,
      f2: 2300 * p,
      dur: 0.4,
      gain: 0.1,
      attack: 0.03,
      detune: 30,
      vibrato: { rate: 34, depth: 140 },
      filter: { type: 'bandpass', f: 2600 * p, q: 2.2 },
      wet: 0.4,
    });
    s.noise(o, t, { dur: 0.35, gain: 0.06, attack: 0.03, filter: { type: 'highpass', f: 3600 } });
  },
  wing: (s, o, t, p) => {
    s.noise(o, t, { dur: 0.16, gain: 0.16, attack: 0.03, filter: { type: 'lowpass', f: 800 * p, f2: 260 } });
  },
  crumble: (s, o, t, p) => {
    s.noise(o, t, { dur: 0.7, gain: 0.22, filter: { type: 'lowpass', f: 1100 * p, f2: 180 }, drive: true, wet: 0.3 });
    for (let i = 0; i < 7; i++) {
      const f = (140 + Math.random() * 260) * p;
      s.tone(o, t, { type: 'sine', f, f2: f * 0.6, dur: 0.06, gain: 0.1, at: i * 0.07 + Math.random() * 0.05 });
    }
  },
  beamCharge: (s, o, t, p) => {
    s.fm(o, t, { f: 180 * p, f2: 900 * p, ratio: 2.01, index: 2, index2: 4, dur: 0.75, gain: 0.1, attack: 0.3, wet: 0.4 });
    s.noise(o, t, { dur: 0.75, gain: 0.1, attack: 0.5, filter: { type: 'highpass', f: 2000, f2: 7000 } });
  },
  beam: (s, o, t, p) => {
    s.tone(o, t, { type: 'sawtooth', f: 110 * p, dur: 0.6, gain: 0.1, detune: 25, drive: true, filter: { type: 'lowpass', f: 1600, f2: 500 }, wet: 0.3 });
    s.noise(o, t, { dur: 0.6, gain: 0.1, filter: { type: 'bandpass', f: 2200 * p, f2: 900, q: 1.2 } });
    s.fm(o, t, { f: 880 * p, ratio: 1.5, index: 3, dur: 0.5, gain: 0.04, wet: 0.4 });
  },
  magic: (s, o, t, p) => {
    s.fm(o, t, { f: 980 * p, f2: 1500 * p, ratio: 1.5, index: 2, dur: 0.3, gain: 0.05, wet: 0.5 });
    s.tone(o, t, { type: 'triangle', f: 600 * p, f2: 1200 * p, dur: 0.22, gain: 0.04, wet: 0.3 });
  },
  blip: (s, o, t, p) => {
    s.tone(o, t, { type: 'square', f: 880 * p, dur: 0.035, gain: 0.025, filter: { type: 'lowpass', f: 2400 } });
  },
  confirm: (s, o, t, p) => {
    s.tone(o, t, { type: 'triangle', f: 660 * p, dur: 0.1, gain: 0.06 });
    s.tone(o, t, { type: 'triangle', f: 990 * p, dur: 0.22, gain: 0.06, at: 0.08, wet: 0.4 });
  },
  death: (s, o, t, p) => {
    [440, 349, 294, 220].forEach((f, i) =>
      s.tone(o, t, { type: 'sawtooth', f: f * p, dur: i === 3 ? 1.1 : 0.22, gain: 0.05, at: i * 0.17, release: i === 3 ? 0.7 : undefined, filter: { type: 'lowpass', f: 1400 }, wet: 0.6 }),
    );
    s.tone(o, t, { type: 'sine', f: 70 * p, f2: 35, dur: 1.4, gain: 0.3, wet: 0.4 });
  },
  bossDown: (s, o, t, p) => {
    s.tone(o, t, { type: 'sine', f: 90 * p, f2: 24, dur: 1.8, gain: 0.45, wet: 0.4 });
    s.noise(o, t, { dur: 2.0, gain: 0.3, filter: { type: 'lowpass', f: 2600, f2: 90 }, drive: true, wet: 0.6 });
    s.tone(o, t, { type: 'sawtooth', f: 160 * p, f2: 40 * p, dur: 1.6, gain: 0.1, detune: 20, filter: { type: 'lowpass', f: 900, f2: 200 }, wet: 0.5 });
    s.fm(o, t, { f: 220 * p, ratio: 1.41, index: 5, dur: 2.2, gain: 0.05, at: 0.3, wet: 0.8 });
  },
  upgrade: (s, o, t, p) => {
    [C5, 587.3, E5, 740, G5, 880, 988, C6].forEach((f, i) =>
      s.fm(o, t, { f: f * p, ratio: 2.01, index: 1.2, dur: 0.6, gain: 0.07, at: i * 0.06, pan: (i / 7) * 1.2 - 0.6, wet: 0.6 }),
    );
    s.noise(o, t, { dur: 1.2, gain: 0.05, attack: 0.4, filter: { type: 'highpass', f: 5000, f2: 11000 }, wet: 0.8 });
  },
  deflect: (s, o, t, p) => {
    s.fm(o, t, { f: 1500 * p, ratio: 2.4, index: 3.5, dur: 0.2, gain: 0.08, wet: 0.25 });
    s.noise(o, t, { dur: 0.05, gain: 0.1, filter: { type: 'highpass', f: 3200 } });
  },
  phase: (s, o, t, p) => {
    // A boss changing shape: a low minor stab and a door slamming under it.
    for (const f of [110, 130.8, 164.8]) {
      s.tone(o, t, { type: 'sawtooth', f: f * p, dur: 1.2, gain: 0.06, detune: 12, release: 0.8, filter: { type: 'lowpass', f: 1200, f2: 300 }, wet: 0.6 });
    }
    s.tone(o, t, { type: 'sine', f: 70 * p, f2: 30, dur: 0.9, gain: 0.35 });
    s.noise(o, t, { dur: 0.6, gain: 0.16, filter: { type: 'lowpass', f: 700, f2: 120 }, wet: 0.5 });
  },
};

/** Sounds that do not wobble in pitch: tunes and chords stay in tune. */
const STEADY = new Set<Sfx>(['victory', 'checkpoint', 'heal', 'upgrade', 'death', 'wardOpen', 'confirm', 'phase']);

/** How close together the same effect may start, seconds. */
const MIN_GAP: Partial<Record<Sfx, number>> = {
  coin: 0.04,
  hit: 0.03,
  bossHit: 0.05,
  land: 0.12,
  wing: 0.1,
  fuse: 0.12,
  splash: 0.08,
  slam: 0.06,
  blip: 0.05,
};

const STORE_SOUND = 'shadowblade.sound';
const STORE_MUSIC = 'shadowblade.music';

/**
 * The sound of the game: effects, music and the room they play in.
 *
 * Everything is synthesised at runtime (see synth.ts and music.ts) and runs
 * through one small mixing desk: effects and music on their own busses, a
 * shared reverb whose size follows the zone - a cave rings, a forest does not -
 * and a compressor at the end so a boss dying on top of a parry does not clip.
 */
export class AudioBus {
  private ctx: AudioContext | null = null;
  private synth: Synth | null = null;
  private master: GainNode | null = null;
  private sfx: Outlet | null = null;
  private musicBus: GainNode | null = null;
  private musicTone: BiquadFilterNode | null = null;
  private reverbReturn: GainNode | null = null;
  private music: Music | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly last = new Map<Sfx, number>();
  private wantedTrack: TrackName | null = null;
  private space = 0.35;
  /** All sound off (N). */
  muted = false;
  /** Music off, effects on (M). */
  musicOff = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(STORE_SOUND) === '0';
      this.musicOff = localStorage.getItem(STORE_MUSIC) === '0';
    } catch {
      // No storage: defaults it is.
    }
  }

  /** Browsers only allow audio after a user gesture, so this is called lazily. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      const ctx = new Ctor();
      this.ctx = ctx;
      this.synth = new Synth(ctx);

      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 10;
      comp.ratio.value = 4;
      comp.attack.value = 0.004;
      comp.release.value = 0.2;
      comp.connect(ctx.destination);

      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 0.8;
      master.connect(comp);
      this.master = master;

      const reverb = ctx.createConvolver();
      reverb.buffer = Synth.impulse(ctx, 2.6, 3.2);
      const reverbIn = ctx.createGain();
      reverbIn.gain.value = 1;
      const reverbReturn = ctx.createGain();
      reverbReturn.gain.value = this.space;
      reverbIn.connect(reverb).connect(reverbReturn).connect(master);
      this.reverbReturn = reverbReturn;

      const sfxBus = ctx.createGain();
      sfxBus.gain.value = 0.9;
      sfxBus.connect(master);
      const drive = ctx.createWaveShaper();
      drive.curve = Synth.driveCurve(3);
      drive.oversample = '2x';
      drive.connect(sfxBus);
      this.sfx = { dry: sfxBus, wet: reverbIn, drive };

      const musicTone = ctx.createBiquadFilter();
      musicTone.type = 'lowpass';
      musicTone.frequency.value = 20000;
      musicTone.connect(master);
      this.musicTone = musicTone;
      const musicBus = ctx.createGain();
      musicBus.gain.value = this.musicOff ? 0 : 0.55;
      musicBus.connect(musicTone);
      this.musicBus = musicBus;
      this.music = new Music(this.synth, musicBus, reverbIn);
      if (!this.musicOff) this.music.play(this.wantedTrack);

      this.timer = setInterval(() => this.tick(), 40);
    } catch {
      this.ctx = null;
      this.synth = null;
    }
  }

  /** Keeps the music scheduled. Also called from the game loop. */
  tick(): void {
    if (this.music && !this.musicOff && !this.muted) this.music.tick();
  }

  play(name: Sfx, pitch = 1): void {
    if (this.muted || !this.ctx || !this.synth || !this.sfx) return;
    const now = this.ctx.currentTime;
    const gap = MIN_GAP[name] ?? 0.018;
    const before = this.last.get(name) ?? -1;
    if (now - before < gap) return;
    this.last.set(name, now);
    const wobble = STEADY.has(name) ? 1 : 1 + (Math.random() * 2 - 1) * 0.035;
    try {
      RECIPES[name](this.synth, this.sfx, now + 0.005, pitch * wobble);
    } catch {
      // A sound that fails to build is a sound that is not heard - never a crash.
    }
  }

  /** Which piece should be playing. Cheap to call every frame. */
  setMusic(track: TrackName | null): void {
    this.wantedTrack = track;
    if (this.music && !this.musicOff && !this.muted) this.music.play(track);
  }

  get currentTrack(): TrackName | null {
    return this.music?.current ?? null;
  }

  /** How much the room rings: 0 open air, 1 a stone hall. */
  setSpace(amount: number): void {
    if (Math.abs(amount - this.space) < 0.01) return;
    this.space = amount;
    if (this.ctx && this.reverbReturn) {
      this.reverbReturn.gain.setTargetAtTime(0.2 + amount * 0.7, this.ctx.currentTime, 0.8);
    }
  }

  /** Muffles the music, for the pause screen and while a dialogue is read. */
  duck(on: boolean): void {
    if (!this.ctx || !this.musicTone) return;
    this.musicTone.frequency.setTargetAtTime(on ? 700 : 20000, this.ctx.currentTime, 0.15);
  }

  /** N: everything off and back on. Remembered across sessions. */
  toggleSound(): boolean {
    this.muted = !this.muted;
    this.remember(STORE_SOUND, !this.muted);
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.05);
    }
    if (!this.muted && this.music && !this.musicOff) this.music.play(this.wantedTrack);
    if (this.muted && this.music) this.music.play(null);
    return !this.muted;
  }

  /** M: the music alone. Remembered across sessions. */
  toggleMusic(): boolean {
    this.musicOff = !this.musicOff;
    this.remember(STORE_MUSIC, !this.musicOff);
    if (this.ctx && this.musicBus) {
      this.musicBus.gain.setTargetAtTime(this.musicOff ? 0 : 0.55, this.ctx.currentTime, 0.1);
    }
    if (this.music) this.music.play(this.musicOff || this.muted ? null : this.wantedTrack);
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
   * Renders every effect and every piece offline and measures it: how loud at
   * its loudest, how loud on average, and whether anything came out at all.
   * Nobody listens to a test run, so this is how the tools hear the game - a
   * recipe that builds nothing, or one that clips, shows up as a number.
   */
  static async probe(): Promise<{
    sfx: Record<string, { peak: number; rms: number }>;
    music: Record<string, { peak: number; rms: number }>;
  }> {
    const rate = 22050;
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
    const chain = (ctx: OfflineAudioContext): { synth: Synth; out: Outlet; reverb: GainNode } => {
      const synth = new Synth(ctx as unknown as AudioContext);
      const master = ctx.createGain();
      master.gain.value = 0.8;
      master.connect(ctx.destination);
      const reverb = ctx.createGain();
      const conv = ctx.createConvolver();
      conv.buffer = Synth.impulse(ctx as unknown as AudioContext, 1.2, 3.2);
      const ret = ctx.createGain();
      ret.gain.value = 0.5;
      reverb.connect(conv).connect(ret).connect(master);
      const bus = ctx.createGain();
      bus.gain.value = 0.9;
      bus.connect(master);
      const drive = ctx.createWaveShaper();
      drive.curve = Synth.driveCurve(3);
      drive.connect(bus);
      return { synth, out: { dry: bus, wet: reverb, drive }, reverb };
    };
    const sfx: Record<string, { peak: number; rms: number }> = {};
    for (const name of Object.keys(RECIPES) as Sfx[]) {
      const ctx = new OfflineAudioContext(2, Math.floor(rate * 2.5), rate);
      const { synth, out } = chain(ctx);
      RECIPES[name](synth, out, 0.01, 1);
      sfx[name] = measure(await ctx.startRendering());
    }
    const music: Record<string, { peak: number; rms: number }> = {};
    for (const name of TRACK_NAMES) {
      const seconds = 8;
      const ctx = new OfflineAudioContext(2, Math.floor(rate * seconds), rate);
      const { synth, out, reverb } = chain(ctx);
      const bus = ctx.createGain();
      bus.gain.value = 0.55;
      bus.connect(out.dry);
      const m = new Music(synth, bus, reverb);
      m.play(name);
      m.tick(seconds);
      music[name] = measure(await ctx.startRendering());
    }
    return { sfx, music };
  }

  /** For the verification tools: is anything actually running? */
  get running(): boolean {
    return !!this.ctx && this.ctx.state === 'running' && this.timer !== null;
  }
}

export const audio = new AudioBus();
