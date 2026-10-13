import type { Adsr } from './dsp';
import type { SampleId } from './samples';

/**
 * Every sound effect, as a few notes on one or two channels.
 *
 * On the chip an effect is what a piece of music is, only shorter: samples
 * from the palette at a pitch, under an envelope, one after another on a
 * channel - a sword's swing is a burst of the shift register's noise sliding
 * down, a coin two quick notes of the pulse, a boss winding up a growl that
 * climbs. An effect takes at most two channels (the set pieces - a boss
 * falling, the end of the run - up to four, from the music's), sounds for
 * well under a second unless it is one of those, and sits in a class that
 * sets how loud it is and whether it may ring in the room's echo.
 *
 * The eighteen boss attacks the hero learns each open with a sound made of
 * their boss's own two instruments, so Felswurf is Grimmzahn's taiko and
 * horn and Goldregen Gierschlund's coins and glockenspiel.
 */

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
  | 'slam'
  | 'shoot'
  | 'checkpoint'
  | 'victory'
  | 'tellLunge'
  | 'tellVolley'
  | 'tellSlam'
  | 'tellBeam'
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
  | 'tellClock'
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
  | 'phase'
  | 'select'
  | 'deny'
  | 'ready'
  | 'castKlatschsprung'
  | 'castFelswurf'
  | 'castGoldregen'
  | 'castTrugbild'
  | 'castSonnenblick'
  | 'castIrrlichter'
  | 'castNetzschuss'
  | 'castFeuerwelle'
  | 'castMondsichel'
  | 'castSpringflut'
  | 'castSteinsturz'
  | 'castPendelschlag'
  | 'castBlutsicheln'
  | 'castSchattenwelle'
  | 'castSchattensprung'
  | 'castSplitteransturm'
  | 'castKronenfeuer'
  | 'castSplitterregen'
  | 'impactMire'
  | 'impactBoar'
  | 'impactGold'
  | 'impactJester'
  | 'impactStone'
  | 'impactGloom'
  | 'impactWeb'
  | 'impactFire'
  | 'impactTwins'
  | 'impactTide'
  | 'impactGargoyle'
  | 'impactClock'
  | 'impactBlood'
  | 'impactKnight'
  | 'impactShadow'
  | 'impactShard'
  | 'impactHydra'
  | 'impactCrystal'
  | 'voiceBoar'
  | 'voiceKnight'
  | 'voiceClock'
  | 'voiceStone'
  | 'voiceHydra'
  | 'voiceGargoyle'
  | 'voiceGloom'
  | 'voiceJester'
  | 'voiceMimic'
  | 'voiceShadow'
  | 'voiceSpider'
  | 'voiceSol'
  | 'voiceLuna'
  | 'voiceVesper'
  | 'voiceWyrm';

/** One note of an effect. */
export interface Hit {
  s: SampleId;
  /** A pitched sample's frequency, Hz; or `r`, a drum's or a noise's rate. */
  hz?: number;
  r?: number;
  /** Slides to this multiple of its starting pitch... */
  to?: number;
  /** ...over this many seconds (its whole length if not given). */
  slide?: number;
  /** Seconds after the effect starts. */
  at?: number;
  /** Key-on, seconds. */
  dur: number;
  /** Level, 0..1 of the effect's. */
  v?: number;
  env?: Adsr;
  pan?: number;
  vib?: readonly [number, number, number];
  /** Which of the effect's channels: 0 or 1 (2 and 3 for a set piece). */
  ch?: number;
  /** Starts this far into the sample, seconds of it. */
  from?: number;
}

/**
 * How loud an effect is and what it may do, by what it is: the interface,
 * the hero's own moves, blows landing, a boss's warnings and roars, the big
 * moments, and the world's noises.
 */
export type SfxClass = 'ui' | 'hero' | 'hit' | 'tell' | 'set' | 'world';

export interface SfxDef {
  hits: Hit[];
  cls: SfxClass;
  /** Who wins a channel: 0..9. */
  pri: number;
  /** Fine level, on top of the class's. */
  level?: number;
  /**
   * Pitch never wobbles: tunes stay in tune, and a boss's own sounds stay on
   * the pitches its music plays them at, never a few cents beside them.
   */
  steady?: boolean;
  /** The least time between two of it, seconds. */
  gap?: number;
  /** Rings in the room's echo where the room has one (set pieces always do). */
  echo?: boolean;
  /**
   * May take the music's channel when both of its own are busy - without
   * outranking anything: a cue the player must hear, never at the cost of a
   * boss's warning.
   */
  urgent?: boolean;
}

/** A note's frequency by name: 'C5', 'F#4', 'Bb3'. */
export function hz(name: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) return 440;
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1] as 'C'];
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  const midi = 12 * (Number(m[3]) + 1) + base + acc;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/* ------------------------------------------------------------ envelopes */

const E = {
  click: { a: 0, d: 0.02, s: 1, f: 0.05 },
  short: { a: 0, d: 0.05, s: 3, f: 0.12 },
  blip: { a: 0, d: 0.04, s: 4, f: 0.15 },
  tone: { a: 1, d: 0.1, s: 6, f: 0.6 },
  hold: { a: 1, d: 0.3, s: 7, f: Infinity },
  swell: { a: 7, d: 0.3, s: 7, f: Infinity },
  slowSwell: { a: 9, d: 0.3, s: 8, f: Infinity },
  ring: { a: 0, d: 0.25, s: 4, f: 0.8 },
  longRing: { a: 0, d: 0.5, s: 4, f: 1.6 },
  drum: { a: 0, d: 1, s: 8, f: Infinity },
  noise: { a: 0, d: 0.06, s: 4, f: 0.2 },
  whoosh: { a: 2, d: 0.05, s: 5, f: 0.15 },
} satisfies Record<string, Adsr>;

/* ------------------------------------------------------------ the effects */

export const SFX: Record<Sfx, SfxDef> = {
  /* ------------------------------------------------- the interface */
  blip: { cls: 'ui', pri: 3, steady: true, gap: 0.04, hits: [{ s: 'pulseHi', hz: hz('A6'), dur: 0.035, env: E.blip }] },
  // A boss attack picked: two notes, pitched by its place in the list.
  select: {
    cls: 'ui',
    pri: 6,
    urgent: true,
    steady: true,
    hits: [
      { s: 'pulseHi', hz: hz('C6'), dur: 0.045, env: E.blip },
      { s: 'pulseHi', hz: hz('G6'), at: 0.05, dur: 0.08, env: E.blip },
    ],
  },
  // Not ready yet: a buzz, twice, falling - above the music's bass, where it is heard.
  deny: {
    cls: 'ui',
    pri: 6,
    urgent: true,
    steady: true,
    gap: 0.15,
    hits: [
      { s: 'pulse', hz: hz('Bb4'), to: 0.84, dur: 0.11, env: E.tone },
      { s: 'pulse', hz: hz('Bb4'), to: 0.84, at: 0.13, dur: 0.1, env: E.tone },
    ],
  },
  // Ready again: three notes up a chord.
  ready: {
    cls: 'ui',
    pri: 6,
    urgent: true,
    steady: true,
    hits: [
      { s: 'celesta', hz: hz('C6'), dur: 0.05, env: E.ring },
      { s: 'celesta', hz: hz('E6'), at: 0.055, dur: 0.05, env: E.ring },
      { s: 'celesta', hz: hz('G6'), at: 0.11, dur: 0.14, env: E.ring },
    ],
  },
  confirm: {
    cls: 'ui',
    pri: 5,
    steady: true,
    hits: [
      { s: 'bell', hz: hz('E5'), dur: 0.08, env: E.ring },
      { s: 'bell', hz: hz('B5'), at: 0.08, dur: 0.18, env: E.ring },
    ],
  },

  /* ------------------------------------------------- the hero */
  // The blade through the air: the register's noise, sliding down.
  swing: { cls: 'hero', pri: 4, gap: 0.03, hits: [{ s: 'noiseHi', r: 1.15, to: 0.55, dur: 0.1, env: E.whoosh }] },
  charge: {
    cls: 'hero',
    pri: 4,
    hits: [
      { s: 'pulse', hz: hz('A3'), to: 2.5, slide: 0.45, dur: 0.48, env: E.swell, vib: [11, 0.3, 0.05], v: 0.7 },
      { s: 'noiseMid', r: 0.6, to: 1.8, dur: 0.48, env: E.swell, v: 0.4, ch: 1 },
    ],
  },
  chargeRelease: {
    cls: 'hero',
    pri: 5,
    hits: [
      { s: 'noiseHi', r: 1.3, to: 0.45, dur: 0.16, env: E.whoosh },
      { s: 'slap', r: 0.8, dur: 0.1, env: E.drum, ch: 1 },
    ],
  },
  parry: {
    cls: 'hit',
    pri: 7,
    echo: true,
    hits: [
      { s: 'anvil', hz: 1500, dur: 0.22, env: E.ring },
      { s: 'slap', r: 1.4, dur: 0.06, env: E.drum, ch: 1 },
    ],
  },
  // The classic jump: a square wave flicked up an octave.
  jump: { cls: 'hero', pri: 3, gap: 0.05, hits: [{ s: 'pulse', hz: hz('D4'), to: 2, slide: 0.07, dur: 0.085, env: E.short }] },
  doubleJump: {
    cls: 'hero',
    pri: 3,
    hits: [
      { s: 'pulse', hz: hz('A4'), to: 2, slide: 0.06, dur: 0.07, env: E.short },
      { s: 'noiseHi', r: 0.9, to: 1.4, dur: 0.07, env: E.short, v: 0.4, ch: 1 },
    ],
  },
  land: { cls: 'hero', pri: 2, gap: 0.12, hits: [{ s: 'kick', r: 1.5, dur: 0.07, env: E.drum, v: 0.8 }] },
  dash: { cls: 'hero', pri: 4, hits: [{ s: 'noiseMid', r: 0.7, to: 2.2, dur: 0.16, env: E.whoosh }] },

  /* ------------------------------------------------- blows */
  hit: {
    cls: 'hit',
    pri: 6,
    gap: 0.03,
    hits: [
      { s: 'slap', r: 1, dur: 0.1, env: E.drum },
      { s: 'kick', r: 1.7, dur: 0.06, env: E.drum, v: 0.7, ch: 1 },
    ],
  },
  bossHit: {
    cls: 'hit',
    pri: 6,
    gap: 0.05,
    hits: [
      { s: 'slap', r: 0.85, dur: 0.12, env: E.drum },
      { s: 'kick', r: 0.95, dur: 0.16, env: E.drum, ch: 1 },
    ],
  },
  // The hero hurt: a square wave falling an octave over a hard slap.
  hurt: {
    cls: 'hit',
    pri: 8,
    hits: [
      { s: 'pulse', hz: hz('C5'), to: 0.5, dur: 0.22, env: E.tone },
      { s: 'slap', r: 0.7, dur: 0.12, env: E.drum, ch: 1 },
    ],
  },
  deflect: {
    cls: 'hit',
    pri: 5,
    hits: [
      { s: 'anvil', hz: 2100, dur: 0.1, env: E.ring, v: 0.8 },
      { s: 'noiseHi', r: 1.3, to: 0.6, dur: 0.06, env: E.short, v: 0.5, ch: 1 },
    ],
  },
  clank: {
    cls: 'hit',
    pri: 5,
    echo: true,
    hits: [
      { s: 'anvil', hz: 1240, dur: 0.3, env: E.ring },
      { s: 'slap', r: 1.2, dur: 0.05, env: E.drum, v: 0.7, ch: 1 },
    ],
  },
  enemyDie: {
    cls: 'hit',
    pri: 5,
    hits: [
      { s: 'pulse', hz: hz('A4'), to: 0.25, dur: 0.3, env: E.tone, v: 0.8 },
      { s: 'noiseMid', r: 1.2, to: 0.4, dur: 0.32, env: E.noise, ch: 1 },
    ],
  },

  /* ------------------------------------------------- a boss's warnings */
  // Four kinds, one per kind of attack, each a sound of its own, pitched per boss.
  // A lunge or a charge: a growl climbing.
  tellLunge: {
    cls: 'tell',
    pri: 8,
    echo: true,
    hits: [
      { s: 'growl', hz: 98, to: 2.2, dur: 0.34, env: E.hold },
      { s: 'noiseMid', r: 0.6, to: 1.6, dur: 0.34, env: E.swell, v: 0.55, ch: 1 },
    ],
  },
  // A volley or a throw: three quick notes locking on.
  tellVolley: {
    cls: 'tell',
    pri: 8,
    echo: true,
    hits: [
      { s: 'pulseHi', hz: hz('E5'), dur: 0.05, env: E.blip },
      { s: 'pulseHi', hz: hz('B5'), at: 0.075, dur: 0.05, env: E.blip },
      { s: 'pulseHi', hz: hz('E6'), at: 0.15, dur: 0.12, env: E.tone },
      { s: 'noiseHi', r: 0.7, to: 1.3, at: 0.15, dur: 0.12, env: E.short, v: 0.35, ch: 1 },
    ],
  },
  // A slam: a drum struck twice and the ground's rumble rising under it.
  tellSlam: {
    cls: 'tell',
    pri: 8,
    echo: true,
    hits: [
      { s: 'tom', r: 0.62, dur: 0.12, env: E.drum },
      { s: 'tom', r: 0.62, at: 0.13, dur: 0.22, env: E.drum },
      { s: 'noiseLo', r: 0.6, to: 1.7, dur: 0.38, env: E.swell, ch: 1 },
    ],
  },
  // A beam, a wave, a spell: a tone swelling up with a shiver in it.
  tellBeam: {
    cls: 'tell',
    pri: 8,
    echo: true,
    hits: [
      { s: 'pulse', hz: hz('A4'), to: 2.6, slide: 0.4, dur: 0.42, env: E.swell, vib: [14, 0.45, 0.02] },
      { s: 'noiseHi', r: 0.5, to: 1.4, dur: 0.42, env: E.swell, v: 0.4, ch: 1 },
    ],
  },
  // Tickmar's count-in: the anvil struck and a tone climbing over it, one
  // beat of it at a time, each a step higher than the last.
  tellClock: {
    cls: 'tell',
    pri: 7,
    steady: true,
    echo: true,
    gap: 0.1,
    hits: [
      { s: 'anvil', hz: 1240, dur: 0.3, env: E.ring },
      { s: 'pulseHi', hz: 2640, to: 1.12, dur: 0.12, env: E.tone, v: 0.6, ch: 1 },
    ],
  },
  // A bat's shriek: a thin tone shaking and falling. (The bosses each have a voice of their own.)
  screech: {
    cls: 'tell',
    pri: 7,
    echo: true,
    gap: 0.1,
    hits: [
      { s: 'pulseHi', hz: 1700, to: 0.7, dur: 0.32, env: E.hold, vib: [24, 0.8, 0.01] },
      { s: 'noiseHi', r: 1.1, to: 0.7, dur: 0.32, env: E.hold, v: 0.45, ch: 1 },
    ],
  },

  /* ------------------------------------------------- the big moments */
  victory: {
    cls: 'set',
    pri: 9,
    steady: true,
    hits: [
      { s: 'brassStab', hz: hz('C4'), dur: 0.12, env: E.tone },
      { s: 'brassStab', hz: hz('E4'), at: 0.14, dur: 0.12, env: E.tone },
      { s: 'brassStab', hz: hz('G4'), at: 0.28, dur: 0.12, env: E.tone },
      { s: 'brassStab', hz: hz('C5'), at: 0.42, dur: 0.85, env: E.hold, vib: [5.5, 0.25, 0.25] },
      { s: 'celesta', hz: hz('E6'), at: 0.42, dur: 0.8, env: E.longRing, ch: 1 },
      { s: 'strings', hz: hz('C4'), at: 0.42, dur: 0.85, env: E.hold, v: 0.7, ch: 2 },
      { s: 'crash', r: 1, at: 0.42, dur: 0.85, env: E.longRing, v: 0.6, ch: 3 },
    ],
  },
  bossDown: {
    cls: 'set',
    pri: 9,
    hits: [
      { s: 'orchHit', r: 0.8, dur: 0.45, env: E.drum },
      { s: 'noiseLo', r: 1.6, to: 0.35, dur: 1.1, env: { a: 0, d: 0.4, s: 5, f: 0.8 }, ch: 1 },
      { s: 'crash', r: 0.8, dur: 1.0, env: E.longRing, v: 0.7, ch: 2 },
      { s: 'bell', hz: hz('G5'), at: 0.35, dur: 0.15, env: E.ring, v: 0.6, ch: 3 },
      { s: 'bell', hz: hz('D5'), at: 0.5, dur: 0.15, env: E.ring, v: 0.6, ch: 3 },
      { s: 'bell', hz: hz('G4'), at: 0.65, dur: 0.6, env: E.longRing, v: 0.6, ch: 3 },
    ],
  },
  death: {
    cls: 'set',
    pri: 9,
    steady: true,
    hits: [
      { s: 'pulse', hz: hz('E5'), dur: 0.14, env: E.tone },
      { s: 'pulse', hz: hz('C5'), at: 0.15, dur: 0.14, env: E.tone },
      { s: 'pulse', hz: hz('A4'), at: 0.3, dur: 0.14, env: E.tone },
      { s: 'pulse', hz: hz('E4'), at: 0.45, to: 0.5, dur: 0.6, env: E.hold },
      { s: 'noiseLo', r: 1, to: 0.5, dur: 0.9, env: E.noise, v: 0.7, ch: 1 },
    ],
  },
  checkpoint: {
    cls: 'set',
    pri: 7,
    steady: true,
    hits: [
      { s: 'glock', hz: hz('C6'), dur: 0.09, env: E.ring },
      { s: 'glock', hz: hz('E6'), at: 0.09, dur: 0.09, env: E.ring },
      { s: 'glock', hz: hz('G6'), at: 0.18, dur: 0.5, env: E.longRing },
      { s: 'strings', hz: hz('C5'), at: 0.18, dur: 0.5, env: E.swell, v: 0.5, ch: 1 },
    ],
  },
  upgrade: {
    cls: 'set',
    pri: 9,
    steady: true,
    hits: [
      { s: 'bell', hz: hz('C5'), dur: 0.07, env: E.ring },
      { s: 'bell', hz: hz('E5'), at: 0.07, dur: 0.07, env: E.ring },
      { s: 'bell', hz: hz('G5'), at: 0.14, dur: 0.07, env: E.ring },
      { s: 'bell', hz: hz('C6'), at: 0.21, dur: 0.7, env: E.longRing },
      { s: 'strings', hz: hz('C4'), at: 0.21, dur: 0.75, env: E.swell, v: 0.7, ch: 1 },
      { s: 'brassStab', hz: hz('G4'), at: 0.21, dur: 0.6, env: E.hold, v: 0.6, ch: 2 },
      { s: 'crash', r: 1.1, at: 0.21, dur: 0.7, env: E.longRing, v: 0.5, ch: 3 },
    ],
  },
  wardOpen: {
    cls: 'set',
    pri: 7,
    steady: true,
    hits: [
      { s: 'bell', hz: hz('E5'), dur: 0.1, env: E.ring },
      { s: 'bell', hz: hz('B5'), at: 0.1, dur: 0.4, env: E.longRing },
      { s: 'noiseHi', r: 0.5, to: 1.6, dur: 0.5, env: E.swell, v: 0.5, ch: 1 },
    ],
  },
  wardClose: {
    cls: 'set',
    pri: 8,
    hits: [
      { s: 'kick', r: 0.55, dur: 0.3, env: E.drum },
      { s: 'noiseLo', r: 1.4, to: 0.5, dur: 0.6, env: E.noise, ch: 1 },
      { s: 'tom', r: 0.5, at: 0.02, dur: 0.4, env: E.drum, v: 0.7, ch: 2 },
    ],
  },
  phase: {
    cls: 'set',
    pri: 8,
    steady: true,
    hits: [
      { s: 'noiseMid', r: 0.5, to: 1.8, dur: 0.35, env: E.swell, v: 0.7 },
      { s: 'orchHit', r: 1, at: 0.35, dur: 0.4, env: E.drum, ch: 1 },
      { s: 'crash', r: 1, at: 0.35, dur: 0.5, env: E.longRing, v: 0.5, ch: 2 },
    ],
  },

  /* ------------------------------------------------- the world */
  // A gem: the classic two notes, quick and high.
  coin: {
    cls: 'world',
    pri: 3,
    gap: 0.04,
    steady: true,
    hits: [
      { s: 'pulseHi', hz: hz('B5'), dur: 0.04, env: E.blip },
      { s: 'pulseHi', hz: hz('E6'), at: 0.045, dur: 0.11, env: E.ring },
    ],
  },
  heal: {
    cls: 'world',
    pri: 5,
    steady: true,
    hits: [
      { s: 'bell', hz: hz('C5'), dur: 0.06, env: E.ring },
      { s: 'bell', hz: hz('E5'), at: 0.06, dur: 0.06, env: E.ring },
      { s: 'bell', hz: hz('G5'), at: 0.12, dur: 0.25, env: E.ring },
    ],
  },
  slam: {
    cls: 'hit',
    pri: 6,
    gap: 0.06,
    echo: true,
    hits: [
      { s: 'kick', r: 0.62, dur: 0.24, env: E.drum },
      { s: 'noiseLo', r: 1.5, to: 0.6, dur: 0.3, env: E.noise, ch: 1 },
    ],
  },
  shoot: { cls: 'world', pri: 4, hits: [{ s: 'pulse', hz: hz('A5'), to: 0.5, dur: 0.09, env: E.short }] },
  explode: {
    cls: 'hit',
    pri: 7,
    echo: true,
    hits: [
      { s: 'kick', r: 0.5, dur: 0.3, env: E.drum },
      { s: 'noiseLo', r: 1.8, to: 0.45, dur: 0.55, env: E.noise, ch: 1 },
    ],
  },
  fuse: { cls: 'world', pri: 2, gap: 0.12, hits: [{ s: 'noiseHi', r: 1.25, to: 1.1, dur: 0.22, env: E.hold, v: 0.6 }] },
  splash: {
    cls: 'world',
    pri: 4,
    gap: 0.08,
    echo: true,
    hits: [
      { s: 'noiseMid', r: 1.5, to: 0.6, dur: 0.24, env: E.noise },
      { s: 'drip', r: 0.9, dur: 0.1, env: E.drum, v: 0.6, ch: 1 },
    ],
  },
  rumble: {
    cls: 'world',
    pri: 5,
    echo: true,
    hits: [
      { s: 'noiseLo', r: 0.7, to: 0.5, dur: 0.6, env: E.hold },
      { s: 'tom', r: 0.45, dur: 0.4, env: E.drum, v: 0.8, ch: 1 },
    ],
  },
  burst: {
    cls: 'hit',
    pri: 5,
    hits: [
      { s: 'slap', r: 0.9, dur: 0.08, env: E.drum },
      { s: 'noiseMid', r: 1.6, to: 0.5, dur: 0.2, env: E.noise, ch: 1 },
    ],
  },
  fireball: {
    cls: 'world',
    pri: 4,
    hits: [
      { s: 'noiseMid', r: 1.1, to: 0.6, dur: 0.28, env: E.whoosh },
      { s: 'kick', r: 1.9, dur: 0.06, env: E.drum, v: 0.6, ch: 1 },
    ],
  },
  wing: { cls: 'world', pri: 2, gap: 0.1, hits: [{ s: 'noiseMid', r: 0.9, to: 0.55, dur: 0.09, env: E.whoosh, v: 0.8 }] },
  crumble: {
    cls: 'world',
    pri: 4,
    hits: [
      { s: 'noiseLo', r: 1.4, to: 0.6, dur: 0.38, env: E.noise },
      { s: 'slap', r: 0.7, dur: 0.05, env: E.drum, v: 0.7, ch: 1 },
      { s: 'slap', r: 0.6, at: 0.09, dur: 0.05, env: E.drum, v: 0.6, ch: 1 },
      { s: 'slap', r: 0.5, at: 0.19, dur: 0.06, env: E.drum, v: 0.5, ch: 1 },
    ],
  },
  beamCharge: {
    cls: 'world',
    pri: 5,
    echo: true,
    hits: [
      { s: 'pulse', hz: hz('A3'), to: 4, slide: 0.5, dur: 0.52, env: E.swell, vib: [16, 0.4, 0.02], v: 0.8 },
      { s: 'noiseHi', r: 0.5, to: 1.5, dur: 0.52, env: E.swell, v: 0.4, ch: 1 },
    ],
  },
  beam: {
    cls: 'world',
    pri: 5,
    echo: true,
    hits: [
      { s: 'pulseHi', hz: hz('E6'), dur: 0.45, env: E.hold, vib: [20, 0.5, 0.01], v: 0.7 },
      { s: 'noiseHi', r: 1.1, dur: 0.45, env: E.hold, v: 0.5, ch: 1 },
    ],
  },
  magic: {
    cls: 'world',
    pri: 4,
    echo: true,
    hits: [
      { s: 'celesta', hz: hz('E6'), dur: 0.05, env: E.ring, v: 0.8 },
      { s: 'celesta', hz: hz('A6'), at: 0.05, dur: 0.05, env: E.ring, v: 0.8 },
      { s: 'celesta', hz: hz('E7'), at: 0.1, dur: 0.2, env: E.ring, v: 0.8 },
      { s: 'noiseHi', r: 0.8, to: 1.3, dur: 0.3, env: E.swell, v: 0.3, ch: 1 },
    ],
  },

  /* ------------------------------------------------- the eighteen attacks */
  // Gallert's: a bubble bursts and the bloop of his bass jumps up.
  castKlatschsprung: {
    cls: 'hero',
    pri: 5,
    steady: true,
    hits: [
      { s: 'bloopBass', hz: 98, to: 2.5, slide: 0.18, dur: 0.2, env: E.tone },
      { s: 'bubble', r: 1.1, dur: 0.12, env: E.drum, ch: 1 },
    ],
  },
  // Grimmzahn's: the taiko and a blast of the low horn.
  castFelswurf: {
    cls: 'hero',
    pri: 5,
    steady: true,
    hits: [
      { s: 'taiko', r: 1.1, dur: 0.3, env: E.drum },
      { s: 'lowHorn', hz: hz('D3'), to: 1.5, slide: 0.2, dur: 0.24, env: E.tone, ch: 1 },
    ],
  },
  // Gierschlund's: his coins thrown, and the glockenspiel.
  castGoldregen: {
    cls: 'hero',
    pri: 5,
    steady: true,
    hits: [
      { s: 'coins', r: 1, dur: 0.35, env: E.drum },
      { s: 'glock', hz: hz('E6'), dur: 0.06, env: E.ring, ch: 1 },
      { s: 'glock', hz: hz('B6'), at: 0.06, dur: 0.16, env: E.ring, ch: 1 },
    ],
  },
  // Maskarill's: a woodblock and a trill of the calliope.
  castTrugbild: {
    cls: 'hero',
    pri: 5,
    steady: true,
    hits: [
      { s: 'woodblock', r: 1.2, dur: 0.06, env: E.drum },
      { s: 'calliope', hz: hz('A5'), dur: 0.05, env: E.blip, ch: 1 },
      { s: 'calliope', hz: hz('C6'), at: 0.06, dur: 0.05, env: E.blip, ch: 1 },
      { s: 'calliope', hz: hz('E6'), at: 0.12, dur: 0.12, env: E.tone, ch: 1 },
    ],
  },
  // Ankhor's: a stroke of the gong under the low brass.
  castSonnenblick: {
    cls: 'hero',
    pri: 5,
    steady: true,
    echo: true,
    hits: [
      { s: 'gong', hz: 220, dur: 0.45, env: E.ring },
      { s: 'lowBrass', hz: hz('E3'), dur: 0.35, env: E.swell, ch: 1 },
    ],
  },
  // Nyktos's: the low choir breathing in, and the drone under it.
  castIrrlichter: {
    cls: 'hero',
    pri: 5,
    steady: true,
    echo: true,
    hits: [
      { s: 'choirLow', hz: hz('C#4'), to: 1.5, dur: 0.4, env: E.swell },
      { s: 'drone', hz: hz('C#2'), dur: 0.4, env: E.swell, ch: 1 },
    ],
  },
  // Arachna's: three plucks and the koto.
  castNetzschuss: {
    cls: 'hero',
    pri: 5,
    steady: true,
    hits: [
      { s: 'pizz', hz: hz('A4'), dur: 0.05, env: E.short },
      { s: 'pizz', hz: hz('C5'), at: 0.05, dur: 0.05, env: E.short },
      { s: 'pizz', hz: hz('E5'), at: 0.1, dur: 0.06, env: E.short },
      { s: 'koto', hz: hz('A5'), at: 0.05, dur: 0.25, env: E.ring, ch: 1 },
    ],
  },
  // Ignivor's: the anvil, and the brass ground down.
  castFeuerwelle: {
    cls: 'hero',
    pri: 5,
    steady: true,
    hits: [
      { s: 'anvil', hz: 700, dur: 0.25, env: E.ring },
      { s: 'brassGrit', hz: hz('E3'), to: 1.4, slide: 0.25, dur: 0.3, env: E.tone, ch: 1 },
    ],
  },
  // Sol's flute and Luna's glass, together for once.
  castMondsichel: {
    cls: 'hero',
    pri: 5,
    steady: true,
    echo: true,
    hits: [
      { s: 'flute', hz: hz('D6'), to: 0.75, dur: 0.22, env: E.tone },
      { s: 'glassHarp', hz: hz('A5'), dur: 0.3, env: E.ring, ch: 1 },
    ],
  },
  // Thalassa's: a sweep of the harp and the "aah".
  castSpringflut: {
    cls: 'hero',
    pri: 5,
    echo: true,
    steady: true,
    hits: [
      { s: 'harp', hz: hz('D4'), dur: 0.04, env: E.short },
      { s: 'harp', hz: hz('F4'), at: 0.04, dur: 0.04, env: E.short },
      { s: 'harp', hz: hz('A4'), at: 0.08, dur: 0.04, env: E.short },
      { s: 'harp', hz: hz('D5'), at: 0.12, dur: 0.2, env: E.ring },
      { s: 'choirAah', hz: hz('A4'), dur: 0.35, env: E.swell, ch: 1 },
    ],
  },
  // Grauwacht's: the church bell and a timpani stroke.
  castSteinsturz: {
    cls: 'hero',
    pri: 5,
    steady: true,
    echo: true,
    hits: [
      { s: 'churchBell', hz: 330, dur: 0.4, env: E.ring },
      { s: 'timpani', hz: 98, dur: 0.3, env: E.ring, ch: 1 },
    ],
  },
  // Tickmar's: tick, tock, and the music box's note.
  castPendelschlag: {
    cls: 'hero',
    pri: 5,
    steady: true,
    hits: [
      { s: 'tick', r: 1, dur: 0.05, env: E.drum },
      { s: 'tick', r: 0.75, at: 0.12, dur: 0.05, env: E.drum },
      { s: 'musicBox', hz: hz('A6'), dur: 0.3, env: E.ring, ch: 1 },
    ],
  },
  // Vesperon's: a flourish on the harpsichord and the organ's chord.
  castBlutsicheln: {
    cls: 'hero',
    pri: 5,
    steady: true,
    hits: [
      { s: 'harpsichord', hz: hz('D5'), dur: 0.04, env: E.short },
      { s: 'harpsichord', hz: hz('F5'), at: 0.04, dur: 0.04, env: E.short },
      { s: 'harpsichord', hz: hz('A5'), at: 0.08, dur: 0.12, env: E.ring },
      { s: 'organ', hz: hz('D4'), dur: 0.3, env: E.hold, ch: 1 },
    ],
  },
  // Morvain's: an orchestra hit over his strings.
  castSchattenwelle: {
    cls: 'hero',
    pri: 5,
    steady: true,
    hits: [
      { s: 'orchHit', r: 1.1, dur: 0.3, env: E.drum },
      { s: 'stringsStacc', hz: hz('D3'), dur: 0.08, env: E.short, ch: 1 },
      { s: 'stringsStacc', hz: hz('D3'), at: 0.1, dur: 0.08, env: E.short, ch: 1 },
    ],
  },
  // Umbra's: everything backwards - a swell that stops dead.
  castSchattensprung: {
    cls: 'hero',
    pri: 5,
    steady: true,
    hits: [
      { s: 'revCymbal', r: 1.0, dur: 0.3, env: E.drum },
      { s: 'revLead', hz: hz('B4'), dur: 0.3, env: E.drum, ch: 1 },
    ],
  },
  // The Splitterwächter's: crystal struck, glass bowed.
  castSplitteransturm: {
    cls: 'hero',
    pri: 5,
    steady: true,
    hits: [
      { s: 'crystal', hz: hz('E6'), dur: 0.25, env: E.ring },
      { s: 'bowedGlass', hz: hz('B4'), to: 2, dur: 0.3, env: E.tone, ch: 1 },
    ],
  },
  // The Fünfkronige's: a horn's call and the war drum.
  castKronenfeuer: {
    cls: 'hero',
    pri: 5,
    steady: true,
    hits: [
      { s: 'warDrum', r: 1.1, dur: 0.35, env: E.drum },
      { s: 'horn', hz: hz('G3'), to: 1.5, slide: 0.15, dur: 0.3, env: E.tone, ch: 1 },
    ],
  },
  // The Prismarch's: the glass bell and a run of the celesta.
  castSplitterregen: {
    cls: 'hero',
    pri: 5,
    echo: true,
    steady: true,
    hits: [
      { s: 'glassBell', hz: hz('D6'), dur: 0.3, env: E.ring },
      { s: 'celesta', hz: hz('A5'), dur: 0.04, env: E.short, ch: 1 },
      { s: 'celesta', hz: hz('D6'), at: 0.05, dur: 0.15, env: E.ring, ch: 1 },
    ],
  },

  /* ------------------------------------------------- each boss's own blow */
  // Where a boss's blow lands, a sound of its own two instruments - the
  // families its fight and the attack it teaches are made of - instead of
  // the same thud for every one of them. Played at one pitch, as the era's
  // drivers played their effects.
  impactMire: {
    cls: 'hit',
    pri: 6,
    steady: true,
    echo: true,
    gap: 0.08,
    hits: [
      { s: 'bloopBass', hz: 98, to: 0.55, dur: 0.24, env: E.tone },
      { s: 'bubble', r: 0.7, dur: 0.12, env: E.drum, ch: 1 },
    ],
  },
  impactBoar: {
    cls: 'hit',
    pri: 6,
    steady: true,
    echo: true,
    gap: 0.08,
    hits: [
      { s: 'taiko', r: 0.85, dur: 0.35, env: E.drum },
      { s: 'lowHorn', hz: hz('D2'), to: 0.8, dur: 0.18, env: E.tone, ch: 1 },
    ],
  },
  impactGold: {
    cls: 'hit',
    pri: 6,
    steady: true,
    echo: true,
    gap: 0.08,
    hits: [
      { s: 'coins', r: 0.7, dur: 0.3, env: E.drum },
      { s: 'glock', hz: hz('E5'), dur: 0.18, env: E.ring, ch: 1 },
    ],
  },
  impactJester: {
    cls: 'hit',
    pri: 6,
    steady: true,
    echo: true,
    gap: 0.06,
    hits: [
      { s: 'woodblock', r: 0.8, dur: 0.06, env: E.drum },
      { s: 'calliope', hz: hz('A4'), to: 0.75, dur: 0.14, env: E.tone, ch: 1 },
    ],
  },
  impactStone: {
    cls: 'hit',
    pri: 6,
    steady: true,
    echo: true,
    gap: 0.08,
    hits: [
      { s: 'gong', hz: 110, dur: 0.45, env: E.ring },
      { s: 'lowBrass', hz: hz('E2'), to: 0.85, dur: 0.22, env: E.tone, ch: 1 },
    ],
  },
  impactGloom: {
    cls: 'hit',
    pri: 6,
    steady: true,
    echo: true,
    gap: 0.08,
    hits: [
      { s: 'drone', hz: hz('C#2'), to: 0.7, dur: 0.3, env: E.tone },
      { s: 'choirLow', hz: hz('C#3'), to: 0.6, dur: 0.3, env: E.tone, ch: 1 },
    ],
  },
  impactWeb: {
    cls: 'hit',
    pri: 6,
    steady: true,
    echo: true,
    gap: 0.08,
    hits: [
      { s: 'pizz', hz: hz('A2'), dur: 0.2, env: E.ring },
      { s: 'koto', hz: hz('E4'), to: 0.75, dur: 0.2, env: E.ring, ch: 1 },
    ],
  },
  impactFire: {
    cls: 'hit',
    pri: 6,
    steady: true,
    echo: true,
    gap: 0.08,
    hits: [
      { s: 'anvil', hz: 520, dur: 0.25, env: E.ring },
      { s: 'brassGrit', hz: hz('E2'), to: 0.8, dur: 0.22, env: E.tone, ch: 1 },
    ],
  },
  impactTwins: {
    cls: 'hit',
    pri: 6,
    steady: true,
    echo: true,
    gap: 0.08,
    hits: [
      { s: 'flute', hz: hz('D6'), to: 0.5, dur: 0.16, env: E.tone },
      { s: 'glassHarp', hz: hz('A5'), dur: 0.3, env: E.ring, ch: 1 },
    ],
  },
  impactTide: {
    cls: 'hit',
    pri: 6,
    steady: true,
    echo: true,
    gap: 0.08,
    hits: [
      { s: 'harp', hz: hz('D3'), dur: 0.25, env: E.ring },
      { s: 'choirAah', hz: hz('A3'), to: 0.8, dur: 0.25, env: E.tone, ch: 1 },
    ],
  },
  impactGargoyle: {
    cls: 'hit',
    pri: 6,
    steady: true,
    echo: true,
    gap: 0.08,
    hits: [
      { s: 'churchBell', hz: 196, dur: 0.4, env: E.ring },
      { s: 'timpani', hz: 82, dur: 0.3, env: E.ring, ch: 1 },
    ],
  },
  impactClock: {
    cls: 'hit',
    pri: 6,
    steady: true,
    echo: true,
    gap: 0.06,
    hits: [
      { s: 'tick', r: 0.6, dur: 0.05, env: E.drum },
      { s: 'musicBox', hz: hz('A5'), dur: 0.3, env: E.ring, ch: 1 },
    ],
  },
  impactBlood: {
    cls: 'hit',
    pri: 6,
    steady: true,
    echo: true,
    gap: 0.08,
    hits: [
      { s: 'harpsichord', hz: hz('D3'), dur: 0.2, env: E.ring },
      { s: 'organ', hz: hz('D3'), dur: 0.22, env: E.hold, ch: 1 },
    ],
  },
  impactKnight: {
    cls: 'hit',
    pri: 6,
    steady: true,
    echo: true,
    gap: 0.08,
    hits: [
      { s: 'orchHit', r: 0.85, dur: 0.4, env: E.drum },
      { s: 'stringsStacc', hz: hz('D2'), dur: 0.12, env: E.short, ch: 1 },
    ],
  },
  // Umbra's runs backwards too, but only its last moment: a short swell
  // that stops dead, so the dead stop is the blow.
  impactShadow: {
    cls: 'hit',
    pri: 6,
    steady: true,
    echo: true,
    gap: 0.08,
    hits: [
      { s: 'revCymbal', from: 0.31, dur: 0.16, env: E.drum },
      { s: 'revLead', hz: hz('B3'), from: 0.38, dur: 0.18, env: E.drum, ch: 1 },
    ],
  },
  impactShard: {
    cls: 'hit',
    pri: 6,
    steady: true,
    echo: true,
    gap: 0.08,
    hits: [
      { s: 'crystal', hz: hz('E5'), dur: 0.25, env: E.ring },
      { s: 'bowedGlass', hz: hz('B3'), to: 0.7, dur: 0.25, env: E.tone, ch: 1 },
    ],
  },
  impactHydra: {
    cls: 'hit',
    pri: 6,
    steady: true,
    echo: true,
    gap: 0.08,
    hits: [
      { s: 'warDrum', r: 1, dur: 0.35, env: E.drum },
      { s: 'horn', hz: hz('C3'), to: 0.85, dur: 0.22, env: E.tone, ch: 1 },
    ],
  },
  impactCrystal: {
    cls: 'hit',
    pri: 6,
    steady: true,
    echo: true,
    gap: 0.08,
    hits: [
      { s: 'glassBell', hz: hz('D5'), dur: 0.3, env: E.ring },
      { s: 'celesta', hz: hz('A5'), dur: 0.2, env: E.ring, ch: 1 },
    ],
  },

  /* ------------------------------------------------- each boss's own voice */
  // A boss roars, shrieks or laughs with its own instruments too, the ones
  // its fight and its blows are made of - not one growl for all of them.
  // Grimmzahn: a grunt through the low horn, the growl under it.
  voiceBoar: {
    cls: 'tell',
    pri: 7,
    steady: true,
    echo: true,
    gap: 0.12,
    hits: [
      { s: 'growl', hz: 82, to: 0.7, dur: 0.5, env: E.hold, vib: [6, 0.7, 0.04] },
      { s: 'lowHorn', hz: hz('D2'), to: 0.75, dur: 0.45, env: E.hold, ch: 1 },
    ],
  },
  // Morvain: a war cry, brass over the orchestra's blow.
  voiceKnight: {
    cls: 'tell',
    pri: 7,
    steady: true,
    echo: true,
    gap: 0.12,
    hits: [
      { s: 'orchHit', r: 0.7, dur: 0.45, env: E.drum },
      { s: 'brassStab', hz: hz('A2'), to: 0.85, dur: 0.5, env: E.hold, vib: [5, 0.4, 0.12], ch: 1 },
    ],
  },
  // Tickmar: the works grinding, a music box running down.
  voiceClock: {
    cls: 'tell',
    pri: 7,
    steady: true,
    echo: true,
    gap: 0.12,
    hits: [
      { s: 'tick', r: 0.8, dur: 0.05, env: E.drum },
      { s: 'tick', r: 0.7, at: 0.09, dur: 0.05, env: E.drum },
      { s: 'tick', r: 0.6, at: 0.18, dur: 0.05, env: E.drum },
      { s: 'musicBox', hz: hz('A5'), to: 0.5, dur: 0.5, env: E.hold, vib: [9, 0.5, 0.05], ch: 1 },
    ],
  },
  // Ankhor: stone on stone, the low brass groaning.
  voiceStone: {
    cls: 'tell',
    pri: 7,
    steady: true,
    echo: true,
    gap: 0.12,
    hits: [
      { s: 'lowBrass', hz: hz('E2'), to: 0.7, dur: 0.6, env: E.hold, vib: [4, 0.5, 0.1] },
      { s: 'gong', hz: 75, dur: 0.6, env: E.ring, ch: 1 },
    ],
  },
  // The Fünfkronige: a horn call from five throats, the war drum under it.
  voiceHydra: {
    cls: 'tell',
    pri: 7,
    steady: true,
    echo: true,
    gap: 0.12,
    hits: [
      { s: 'horn', hz: hz('C3'), to: 0.8, dur: 0.55, env: E.hold, vib: [6, 0.5, 0.08] },
      { s: 'warDrum', r: 0.8, dur: 0.45, env: E.drum, ch: 1 },
    ],
  },
  // Grauwacht: a stone throat with the choir's moan in it.
  voiceGargoyle: {
    cls: 'tell',
    pri: 7,
    steady: true,
    echo: true,
    gap: 0.12,
    hits: [
      { s: 'choirOoh', hz: hz('E3'), to: 0.7, dur: 0.5, env: E.hold, vib: [7, 0.6, 0.04] },
      { s: 'timpani', hz: 65, dur: 0.45, env: E.ring, ch: 1 },
    ],
  },
  // Nyktos: the low choir sinking, the drone under it.
  voiceGloom: {
    cls: 'tell',
    pri: 7,
    steady: true,
    echo: true,
    gap: 0.12,
    hits: [
      { s: 'choirLow', hz: hz('C#3'), to: 0.6, dur: 0.6, env: E.hold, vib: [5, 0.5, 0.1] },
      { s: 'drone', hz: hz('C#2'), to: 0.8, dur: 0.6, env: E.hold, ch: 1 },
    ],
  },
  // Maskarill: a laugh down the calliope, the woodblock clacking.
  voiceJester: {
    cls: 'tell',
    pri: 7,
    steady: true,
    echo: true,
    gap: 0.12,
    hits: [
      { s: 'calliope', hz: hz('A5'), dur: 0.07, env: E.short },
      { s: 'calliope', hz: hz('F5'), at: 0.09, dur: 0.07, env: E.short },
      { s: 'calliope', hz: hz('D5'), at: 0.18, dur: 0.07, env: E.short },
      { s: 'calliope', hz: hz('A4'), at: 0.27, dur: 0.14, env: E.short },
      { s: 'woodblock', r: 1.2, dur: 0.05, env: E.drum, ch: 1 },
      { s: 'woodblock', r: 1.0, at: 0.18, dur: 0.05, env: E.drum, ch: 1 },
    ],
  },
  // Gierschlund: a greedy snarl with the gold rattling in it.
  voiceMimic: {
    cls: 'tell',
    pri: 7,
    steady: true,
    echo: true,
    gap: 0.12,
    hits: [
      { s: 'growl', hz: 100, to: 0.8, dur: 0.45, env: E.hold, vib: [9, 0.8, 0.02] },
      { s: 'coins', r: 0.55, dur: 0.35, env: E.drum, ch: 1 },
    ],
  },
  // Umbra: a roar run backwards - it swells, and stops dead.
  voiceShadow: {
    cls: 'tell',
    pri: 7,
    steady: true,
    echo: true,
    gap: 0.12,
    hits: [
      { s: 'revLead', hz: hz('B2'), from: 0.34, dur: 0.5, env: E.drum },
      { s: 'revCymbal', r: 0.8, from: 0.11, dur: 0.5, env: E.drum, ch: 1 },
    ],
  },
  // Arachna: a hiss, the koto's string scraped down.
  voiceSpider: {
    cls: 'tell',
    pri: 7,
    steady: true,
    echo: true,
    gap: 0.12,
    hits: [
      { s: 'noiseHi', r: 0.9, to: 0.7, dur: 0.35, env: E.hold, v: 0.6 },
      { s: 'koto', hz: hz('E5'), to: 0.55, dur: 0.3, env: E.hold, vib: [20, 0.6, 0.01], ch: 1 },
    ],
  },
  // Sol: a bright cry on the flute.
  voiceSol: {
    cls: 'tell',
    pri: 7,
    steady: true,
    echo: true,
    gap: 0.12,
    hits: [
      { s: 'flute', hz: hz('D6'), to: 0.75, dur: 0.4, env: E.hold, vib: [12, 0.6, 0.02] },
      { s: 'noiseMid', r: 1.1, to: 0.8, dur: 0.25, env: E.noise, v: 0.4, ch: 1 },
    ],
  },
  // Luna: a cold shriek on the glass harmonica, rising.
  voiceLuna: {
    cls: 'tell',
    pri: 7,
    steady: true,
    echo: true,
    gap: 0.12,
    hits: [
      { s: 'glassHarp', hz: hz('A5'), to: 1.25, dur: 0.4, env: E.hold, vib: [14, 0.5, 0.02] },
      { s: 'noiseHi', r: 1.0, to: 1.1, dur: 0.25, env: E.noise, v: 0.3, ch: 1 },
    ],
  },
  // Vesperon: his bats' shriek over a harpsichord's trill.
  voiceVesper: {
    cls: 'tell',
    pri: 7,
    steady: true,
    echo: true,
    gap: 0.12,
    hits: [
      { s: 'pulseHi', hz: 1600, to: 0.75, dur: 0.3, env: E.hold, vib: [24, 0.8, 0.01] },
      { s: 'harpsichord', hz: hz('D5'), dur: 0.06, env: E.short, ch: 1 },
      { s: 'harpsichord', hz: hz('C#5'), at: 0.07, dur: 0.06, env: E.short, ch: 1 },
      { s: 'harpsichord', hz: hz('D5'), at: 0.14, dur: 0.06, env: E.short, ch: 1 },
      { s: 'harpsichord', hz: hz('C#5'), at: 0.21, dur: 0.06, env: E.short, ch: 1 },
    ],
  },
  // Ignivor: a roar of ground brass, fire rushing under it.
  voiceWyrm: {
    cls: 'tell',
    pri: 7,
    steady: true,
    echo: true,
    gap: 0.12,
    hits: [
      { s: 'brassGrit', hz: hz('E2'), to: 0.7, dur: 0.6, env: E.hold, vib: [7, 0.6, 0.05] },
      { s: 'noiseLo', r: 1.3, to: 0.6, dur: 0.6, env: E.hold, v: 0.8, ch: 1 },
    ],
  },
};

export const SFX_NAMES = Object.keys(SFX) as Sfx[];

/** The levels the classes sit at (peak of a voice), before each effect's own fine level. */
export const CLASS_LEVEL: Record<SfxClass, number> = {
  ui: 0.16,
  hero: 0.2,
  hit: 0.3,
  tell: 0.34,
  set: 0.3,
  world: 0.22,
};

/**
 * Each effect's fine level, measured: every one alone in the forest, its
 * loudest 400 ms against its class's band - the interface around -30 LUFS,
 * the hero's moves -27, blows -22, a boss's warnings -19, the big moments
 * -15 - and set so it lands there.
 */
const TRIM: Partial<Record<Sfx, number>> = {
  blip: 1.023,
  select: 0.638,
  deny: 0.631,
  ready: 0.403,
  confirm: 0.741,
  swing: 0.631,
  charge: 0.462,
  chargeRelease: 0.569,
  parry: 1.445,
  jump: 1.245,
  doubleJump: 1.035,
  land: 1.641,
  dash: 0.556,
  hit: 1.72,
  bossHit: 1.32,
  hurt: 0.989,
  deflect: 1.245,
  clank: 1.303,
  enemyDie: 0.484,
  tellLunge: 0.733,
  tellVolley: 0.741,
  tellSlam: 0.501,
  tellBeam: 0.519,
  screech: 0.452,
  victory: 0.989,
  bossDown: 0.966,
  death: 0.989,
  checkpoint: 1.148,
  upgrade: 1.175,
  wardOpen: 0.977,
  wardClose: 1.084,
  phase: 1.135,
  coin: 0.525,
  heal: 0.759,
  slam: 0.692,
  shoot: 1.023,
  explode: 0.767,
  fuse: 0.432,
  splash: 0.562,
  rumble: 0.495,
  burst: 0.61,
  fireball: 0.543,
  wing: 0.668,
  crumble: 0.668,
  beamCharge: 0.733,
  beam: 0.631,
  magic: 0.668,
  castKlatschsprung: 0.813,
  castFelswurf: 0.708,
  castGoldregen: 0.646,
  castTrugbild: 0.631,
  castSonnenblick: 0.582,
  castIrrlichter: 0.684,
  castNetzschuss: 1.059,
  castFeuerwelle: 0.902,
  castMondsichel: 0.513,
  castSpringflut: 0.479,
  castSteinsturz: 0.966,
  castPendelschlag: 0.495,
  castBlutsicheln: 0.733,
  castSchattenwelle: 1.479,
  castSchattensprung: 1.397,
  castSplitteransturm: 0.741,
  castKronenfeuer: 0.631,
  castSplitterregen: 0.501,
  impactMire: 0.827,
  impactBoar: 1.089,
  impactGold: 0.747,
  impactJester: 0.862,
  impactStone: 0.901,
  impactGloom: 1.104,
  impactWeb: 0.985,
  impactFire: 1.091,
  impactTwins: 0.569,
  impactTide: 0.66,
  impactGargoyle: 0.981,
  impactClock: 0.623,
  impactBlood: 0.797,
  impactKnight: 1.716,
  impactShadow: 0.741,
  impactShard: 1.087,
  impactHydra: 0.795,
  impactCrystal: 0.644,
  voiceBoar: 0.724,
  voiceKnight: 0.997,
  voiceClock: 0.598,
  voiceStone: 0.815,
  voiceHydra: 0.658,
  voiceGargoyle: 0.67,
  voiceGloom: 0.894,
  voiceJester: 0.925,
  voiceMimic: 0.867,
  voiceShadow: 0.72,
  voiceSpider: 0.721,
  voiceSol: 0.583,
  voiceLuna: 0.6,
  voiceVesper: 0.648,
  voiceWyrm: 0.563,
};
for (const [name, level] of Object.entries(TRIM) as [Sfx, number][]) SFX[name].level = (SFX[name].level ?? 1) * level;
