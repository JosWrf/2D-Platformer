type Sfx =
  | 'swing'
  | 'hit'
  | 'jump'
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
  | 'victory';

interface Voice {
  type: OscillatorType;
  from: number;
  to: number;
  duration: number;
  gain: number;
  noise?: boolean;
}

const VOICES: Record<Sfx, Voice[]> = {
  swing: [{ type: 'triangle', from: 880, to: 220, duration: 0.13, gain: 0.16, noise: true }],
  hit: [
    { type: 'square', from: 420, to: 90, duration: 0.1, gain: 0.2 },
    { type: 'sawtooth', from: 180, to: 60, duration: 0.16, gain: 0.12 },
  ],
  jump: [{ type: 'square', from: 300, to: 620, duration: 0.12, gain: 0.13 }],
  dash: [{ type: 'sawtooth', from: 200, to: 700, duration: 0.16, gain: 0.1, noise: true }],
  hurt: [{ type: 'sawtooth', from: 320, to: 70, duration: 0.28, gain: 0.2 }],
  coin: [
    { type: 'square', from: 880, to: 1320, duration: 0.07, gain: 0.11 },
    { type: 'square', from: 1320, to: 1760, duration: 0.1, gain: 0.09 },
  ],
  heal: [
    { type: 'sine', from: 520, to: 880, duration: 0.18, gain: 0.14 },
    { type: 'sine', from: 780, to: 1180, duration: 0.22, gain: 0.1 },
  ],
  enemyDie: [{ type: 'sawtooth', from: 240, to: 40, duration: 0.3, gain: 0.16, noise: true }],
  bossHit: [{ type: 'square', from: 260, to: 70, duration: 0.16, gain: 0.2 }],
  bossRoar: [
    { type: 'sawtooth', from: 120, to: 48, duration: 0.9, gain: 0.24 },
    { type: 'square', from: 74, to: 36, duration: 1.1, gain: 0.16 },
  ],
  slam: [
    { type: 'sine', from: 160, to: 30, duration: 0.4, gain: 0.28 },
    { type: 'sawtooth', from: 90, to: 24, duration: 0.5, gain: 0.16, noise: true },
  ],
  shoot: [{ type: 'triangle', from: 620, to: 180, duration: 0.16, gain: 0.12 }],
  checkpoint: [
    { type: 'sine', from: 520, to: 780, duration: 0.16, gain: 0.12 },
    { type: 'sine', from: 780, to: 1040, duration: 0.24, gain: 0.1 },
  ],
  victory: [
    { type: 'square', from: 523, to: 523, duration: 0.16, gain: 0.12 },
    { type: 'square', from: 659, to: 659, duration: 0.16, gain: 0.12 },
    { type: 'square', from: 784, to: 784, duration: 0.16, gain: 0.12 },
    { type: 'square', from: 1046, to: 1046, duration: 0.4, gain: 0.14 },
  ],
};

/**
 * Tiny synthesised sound engine - the game ships without any binary assets, so
 * every effect is generated from oscillators and a noise buffer at runtime.
 */
export class AudioBus {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  muted = false;

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
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const length = Math.floor(this.ctx.sampleRate * 0.4);
      const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buffer;
    } catch {
      this.ctx = null;
    }
  }

  play(name: Sfx, pitch = 1): void {
    if (this.muted || !this.ctx || !this.master) return;
    const ctx = this.ctx;
    const voices = VOICES[name];
    let offset = 0;
    for (const voice of voices) {
      const start = ctx.currentTime + offset;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(voice.gain, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + voice.duration);
      gain.connect(this.master);

      const osc = ctx.createOscillator();
      osc.type = voice.type;
      osc.frequency.setValueAtTime(voice.from * pitch, start);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, voice.to * pitch), start + voice.duration);
      osc.connect(gain);
      osc.start(start);
      osc.stop(start + voice.duration + 0.02);

      if (voice.noise && this.noiseBuffer) {
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1200 * pitch;
        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(voice.gain * 0.5, start);
        noiseGain.gain.exponentialRampToValueAtTime(0.0001, start + voice.duration);
        src.connect(filter).connect(noiseGain).connect(this.master);
        src.start(start);
        src.stop(start + voice.duration);
      }
      if (name === 'victory') offset += voice.duration * 0.9;
    }
  }
}

export const audio = new AudioBus();
