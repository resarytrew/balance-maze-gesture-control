/**
 * Ultra-realistic procedural Web Audio sound synthesizer for Balance Maze.
 * Simulates:
 * - Dual-layer heavy steel-on-lacquered-wood rolling rumble and acoustic "sing"
 * - Dual-tone collision (hard steel strike + hollow wooden cabinet resonance)
 * - Corner wall scrape / skid friction
 * - Hole lip vortex cavity resonance
 * - Felt-lined wooden tray drop
 * - Gem chime and triumphant victory fanfare
 */

class SoundEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private masterGain: GainNode | null = null;

  // Dual-layer rolling sound nodes
  private rollingGain: GainNode | null = null;
  private woodRumbleOsc: OscillatorNode | null = null;
  private woodRumbleFilter: BiquadFilterNode | null = null;
  private steelSingOsc: OscillatorNode | null = null;
  private steelSingFilter: BiquadFilterNode | null = null;

  private initContext() {
    if (this.ctx) return;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.isMuted ? 0 : 0.65;
      this.masterGain.connect(this.ctx.destination);
      this.initRollingNodes();
    } catch {
      // AudioContext unavailable
    }
  }

  private initRollingNodes() {
    if (!this.ctx || !this.masterGain) return;

    // Master rolling gain
    this.rollingGain = this.ctx.createGain();
    this.rollingGain.gain.value = 0;

    // 1. Wood body rumble (low-frequency resonance)
    this.woodRumbleOsc = this.ctx.createOscillator();
    this.woodRumbleOsc.type = 'triangle';
    this.woodRumbleOsc.frequency.value = 65;

    this.woodRumbleFilter = this.ctx.createBiquadFilter();
    this.woodRumbleFilter.type = 'bandpass';
    this.woodRumbleFilter.frequency.value = 160;
    this.woodRumbleFilter.Q.value = 1.8;

    this.woodRumbleOsc.connect(this.woodRumbleFilter);
    this.woodRumbleFilter.connect(this.rollingGain);

    // 2. Steel bearing "sing" (high metallic whisper across lacquer)
    this.steelSingOsc = this.ctx.createOscillator();
    this.steelSingOsc.type = 'sine';
    this.steelSingOsc.frequency.value = 420;

    this.steelSingFilter = this.ctx.createBiquadFilter();
    this.steelSingFilter.type = 'bandpass';
    this.steelSingFilter.frequency.value = 750;
    this.steelSingFilter.Q.value = 4.0;

    const steelAttenuator = this.ctx.createGain();
    steelAttenuator.gain.value = 0.25;

    this.steelSingOsc.connect(this.steelSingFilter);
    this.steelSingFilter.connect(steelAttenuator);
    steelAttenuator.connect(this.rollingGain);

    this.rollingGain.connect(this.masterGain);

    try {
      this.woodRumbleOsc.start();
      this.steelSingOsc.start();
    } catch {
      // ignore
    }
  }

  public resume() {
    this.initContext();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.65, this.ctx.currentTime, 0.04);
    }
  }

  public isSoundMuted(): boolean {
    return this.isMuted;
  }

  /**
   * Updates rolling acoustics continuously based on speed and skid slip.
   */
  public updateRolling(speed: number, slip = 0) {
    if (this.isMuted || !this.ctx || !this.rollingGain || !this.woodRumbleOsc || !this.woodRumbleFilter || !this.steelSingOsc) return;

    const clampedSpeed = Math.min(speed, 14);
    const targetGain = clampedSpeed > 0.12 ? Math.min(0.42, 0.05 + clampedSpeed * 0.035) : 0;
    const targetRumbleFreq = 55 + clampedSpeed * 16;
    const targetFilterFreq = 120 + clampedSpeed * 32;
    const targetSingFreq = 380 + clampedSpeed * 45 + slip * 150;

    const t = this.ctx.currentTime;
    this.rollingGain.gain.setTargetAtTime(targetGain, t, 0.06);
    this.woodRumbleOsc.frequency.setTargetAtTime(targetRumbleFreq, t, 0.06);
    this.woodRumbleFilter.frequency.setTargetAtTime(targetFilterFreq, t, 0.06);
    this.steelSingOsc.frequency.setTargetAtTime(targetSingFreq, t, 0.06);
  }

  public stopRolling() {
    if (this.rollingGain && this.ctx) {
      this.rollingGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.04);
    }
  }

  /**
   * Dual-layer impact sound (hard steel clack + hollow cabinet resonance).
   */
  public playWallThud(impactSpeed: number, isCorner = false) {
    if (this.isMuted) return;
    this.resume();
    if (!this.ctx || !this.masterGain) return;

    const intensity = Math.min(1.0, Math.max(0.12, impactSpeed / 4.5));
    const now = this.ctx.currentTime;

    // Layer 1: Steel impact click
    const clickOsc = this.ctx.createOscillator();
    const clickGain = this.ctx.createGain();
    clickOsc.type = 'triangle';
    clickOsc.frequency.setValueAtTime(isCorner ? 850 : 620, now);
    clickOsc.frequency.exponentialRampToValueAtTime(140, now + 0.025);
    clickGain.gain.setValueAtTime(intensity * 0.45, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
    clickOsc.connect(clickGain);
    clickGain.connect(this.masterGain);
    clickOsc.start(now);
    clickOsc.stop(now + 0.04);

    // Layer 2: Hollow wooden body resonance (antique soundboard)
    const bodyOsc = this.ctx.createOscillator();
    const bodyGain = this.ctx.createGain();
    const bodyFilter = this.ctx.createBiquadFilter();

    bodyOsc.type = 'triangle';
    bodyOsc.frequency.setValueAtTime(180, now);
    bodyOsc.frequency.exponentialRampToValueAtTime(55, now + 0.12);

    bodyFilter.type = 'bandpass';
    bodyFilter.frequency.setValueAtTime(220, now);
    bodyFilter.Q.setValueAtTime(3.0, now);

    bodyGain.gain.setValueAtTime(intensity * 0.5, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    bodyOsc.connect(bodyFilter);
    bodyFilter.connect(bodyGain);
    bodyGain.connect(this.masterGain);

    bodyOsc.start(now);
    bodyOsc.stop(now + 0.16);
  }

  /**
   * Sound when ball swirls around the brass rim of a hole.
   */
  public playHoleLipVortex() {
    if (this.isMuted) return;
    this.resume();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.linearRampToValueAtTime(520, now + 0.15);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.3);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.35);
  }

  /**
   * Hollow clunk into the catch tray beneath the labyrinth.
   */
  public playHoleDrop() {
    if (this.isMuted) return;
    this.resume();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;

    // Pitch drop whistle
    const fallOsc = this.ctx.createOscillator();
    const fallGain = this.ctx.createGain();
    fallOsc.type = 'sine';
    fallOsc.frequency.setValueAtTime(380, now);
    fallOsc.frequency.exponentialRampToValueAtTime(80, now + 0.35);
    fallGain.gain.setValueAtTime(0.3, now);
    fallGain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
    fallOsc.connect(fallGain);
    fallGain.connect(this.masterGain);
    fallOsc.start(now);
    fallOsc.stop(now + 0.4);

    // Catch tray thud
    const dropOsc = this.ctx.createOscillator();
    const dropGain = this.ctx.createGain();
    dropOsc.type = 'triangle';
    dropOsc.frequency.setValueAtTime(95, now + 0.28);
    dropOsc.frequency.exponentialRampToValueAtTime(38, now + 0.45);
    dropGain.gain.setValueAtTime(0.001, now);
    dropGain.gain.setValueAtTime(0.5, now + 0.28);
    dropGain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    dropOsc.connect(dropGain);
    dropGain.connect(this.masterGain);
    dropOsc.start(now + 0.28);
    dropOsc.stop(now + 0.58);
  }

  /**
   * Crystal chime.
   */
  public playGemCollect() {
    if (this.isMuted) return;
    this.resume();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const freqs = [587.33, 739.99, 880.0, 1174.66]; // D5, F#5, A5, D6 sparkling major arpeggio

    freqs.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.045);

      gain.gain.setValueAtTime(0.001, now + idx * 0.045);
      gain.gain.linearRampToValueAtTime(0.24, now + idx * 0.045 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.045 + 0.38);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(now + idx * 0.045);
      osc.stop(now + idx * 0.045 + 0.42);
    });
  }

  /**
   * Win fanfare.
   */
  public playWinFanfare() {
    if (this.isMuted) return;
    this.resume();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const chord = [293.66, 369.99, 440.0, 587.33, 739.99, 1174.66]; // D major brass

    chord.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.05);

      gain.gain.setValueAtTime(0.001, now + idx * 0.05);
      gain.gain.linearRampToValueAtTime(0.2, now + idx * 0.05 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 1.4);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(now + idx * 0.05);
      osc.stop(now + idx * 0.05 + 1.5);
    });
  }
}

export const soundEngine = new SoundEngine();
