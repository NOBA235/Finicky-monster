class SoundEngine {
  #ctx: AudioContext | null = null;
  #muted = false;

  constructor() {
    try {
      const saved = window.localStorage.getItem('finicky.sound.muted');
      if (saved === 'true') {
        this.#muted = true;
      }
    } catch {
      // Ignore storage failures in sandboxed frames
    }
  }

  isMuted(): boolean {
    return this.#muted;
  }

  setMuted(muted: boolean): void {
    this.#muted = muted;
    try {
      window.localStorage.setItem('finicky.sound.muted', String(muted));
    } catch {
      // Ignore storage failures
    }
  }

  #getContext(): AudioContext | null {
    if (this.#muted) return null;
    if (typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext;
    if (!AudioCtx) return null;
    if (!this.#ctx) {
      this.#ctx = new AudioCtx();
    }
    if (this.#ctx.state === 'suspended') {
      void this.#ctx.resume();
    }
    return this.#ctx;
  }

  #tone(
    freq: number,
    durationSec: number,
    type: OscillatorType,
    volume: number,
    delaySec = 0,
    endFreq?: number
  ): void {
    const ctx = this.#getContext();
    if (!ctx) return;

    const start = ctx.currentTime + delaySec;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (endFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), start + durationSec);
    }

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + durationSec + 0.02);
  }

  playTap(): void {
    this.#tone(520, 0.06, 'triangle', 0.08, 0, 420);
  }

  playAccept(): void {
    this.#tone(440, 0.11, 'triangle', 0.13, 0, 520);
    this.#tone(587.33, 0.13, 'triangle', 0.14, 0.08, 659.25);
    this.#tone(880, 0.18, 'sine', 0.12, 0.16);
  }

  playReject(): void {
    this.#tone(260, 0.14, 'sawtooth', 0.07, 0, 185);
    this.#tone(175, 0.2, 'triangle', 0.1, 0.09, 120);
  }

  playHypothesis(): void {
    this.#tone(392, 0.1, 'sine', 0.1, 0);
    this.#tone(523.25, 0.16, 'sine', 0.11, 0.09);
  }

  playCelebrate(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, idx) => {
      this.#tone(n, 0.22, 'triangle', 0.12, idx * 0.09);
    });
  }

  playMiss(): void {
    this.#tone(330, 0.16, 'triangle', 0.1, 0, 293.66);
    this.#tone(261.63, 0.26, 'triangle', 0.1, 0.14, 220);
  }
}

export const soundEngine = new SoundEngine();
