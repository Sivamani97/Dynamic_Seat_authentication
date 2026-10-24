/**
 * Web Audio API Sound Synthesizer
 * Zero external audio files or network requests required. Works fully offline.
 */

class SoundSynthesizer {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private sirenOscillator: OscillatorNode | null = null;
  private sirenGain: GainNode | null = null;

  private initCtx() {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    return this.ctx;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted) {
      this.stopSiren();
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  /**
   * Short success / scan confirmation tone (high pitch dual beep)
   */
  public playSuccessTone() {
    if (this.isMuted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
  }

  /**
   * Rejection / denial tone (low frequency buzzer)
   */
  public playErrorTone() {
    if (this.isMuted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(150, ctx.currentTime);
    osc.frequency.setValueAtTime(110, ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);
  }

  /**
   * Continuous emergency alarm siren for SOS / CRITICAL incidents
   */
  public startSiren() {
    if (this.isMuted || this.sirenOscillator) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    gain.gain.setValueAtTime(0.25, ctx.currentTime);

    // LFO frequency modulation (siren pitch wail between 650Hz and 950Hz)
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.setValueAtTime(2.5, ctx.currentTime); // 2.5 cycles/sec
    lfoGain.gain.setValueAtTime(150, ctx.currentTime); // +-150Hz
    lfo.connect(lfoGain);

    osc.frequency.setValueAtTime(800, ctx.currentTime);
    lfoGain.connect(osc.frequency);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    lfo.start(ctx.currentTime);

    this.sirenOscillator = osc;
    this.sirenGain = gain;
  }

  public stopSiren() {
    if (this.sirenOscillator) {
      try {
        this.sirenOscillator.stop();
        this.sirenOscillator.disconnect();
      } catch {}
      this.sirenOscillator = null;
      this.sirenGain = null;
    }
  }

  /**
   * Trigger haptic vibration on mobile devices
   */
  public triggerVibration(pattern: number | number[] = [150, 80, 150]) {
    if (typeof window !== "undefined" && "navigator" in window && navigator.vibrate) {
      try {
        navigator.vibrate(pattern);
      } catch {}
    }
  }
}

export const soundManager = new SoundSynthesizer();
