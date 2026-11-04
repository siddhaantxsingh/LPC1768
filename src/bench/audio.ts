import type { BoardSnapshot } from '../sim/board/machine';

/**
 * Sound for the bench: the on-board buzzer, relay clicks, a quiet DC-motor hum,
 * and an optional "probe speaker" that plays a scope channel (for PWM buzzers).
 */
class AudioEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  buzzOsc: OscillatorNode | null = null;
  buzzGain: GainNode | null = null;
  buzzFilter: BiquadFilterNode | null = null;
  humOsc: OscillatorNode | null = null;
  humGain: GainNode | null = null;
  probeOsc: OscillatorNode | null = null;
  probeGain: GainNode | null = null;
  muted = true;
  volume = 0.6;
  private lastRelay: boolean | null = null;
  private lastClick = 0;
  private probe: { freq: number; duty: number } | null = null;

  constructor() {
    try { this.muted = localStorage.getItem('bench:muted') !== '0'; } catch { /* storage blocked */ }
  }

  private ensure() {
    if (this.ctx) return this.ctx;
    const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
    if (!AC) return null;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(ctx.destination);

    // buzzer: a square wave softened by a band-pass, like a small piezo/magnetic transducer
    this.buzzOsc = ctx.createOscillator();
    this.buzzOsc.type = 'square';
    this.buzzOsc.frequency.value = 2400;
    this.buzzFilter = ctx.createBiquadFilter();
    this.buzzFilter.type = 'bandpass';
    this.buzzFilter.frequency.value = 2600;
    this.buzzFilter.Q.value = 0.9;
    this.buzzGain = ctx.createGain();
    this.buzzGain.gain.value = 0;
    this.buzzOsc.connect(this.buzzFilter).connect(this.buzzGain).connect(this.master);
    this.buzzOsc.start();

    // motor hum
    this.humOsc = ctx.createOscillator();
    this.humOsc.type = 'sawtooth';
    this.humOsc.frequency.value = 60;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    this.humOsc.connect(lp).connect(this.humGain).connect(this.master);
    this.humOsc.start();

    // probe speaker
    this.probeOsc = ctx.createOscillator();
    this.probeOsc.type = 'square';
    this.probeGain = ctx.createGain();
    this.probeGain.gain.value = 0;
    const plp = ctx.createBiquadFilter();
    plp.type = 'lowpass';
    plp.frequency.value = 5000;
    this.probeOsc.connect(plp).connect(this.probeGain).connect(this.master);
    this.probeOsc.start();
    return ctx;
  }

  resume() {
    const ctx = this.ensure();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  setMuted(m: boolean) {
    this.muted = m;
    try { localStorage.setItem('bench:muted', m ? '1' : '0'); } catch { /* ignore */ }
    if (!m) this.resume();
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.02);
  }

  silence() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.buzzGain?.gain.setTargetAtTime(0, t, 0.01);
    this.humGain?.gain.setTargetAtTime(0, t, 0.03);
    this.probeGain?.gain.setTargetAtTime(0, t, 0.01);
    this.lastRelay = null;
  }

  setProbe(p: { freq: number; duty: number } | null) { this.probe = p; }

  update(s: BoardSnapshot, _speed: number) {
    if (!this.ctx || this.muted) { this.lastRelay = s.relay; return; }
    const t = this.ctx.currentTime;
    // buzzer
    const b = s.buzzer;
    if (b.mode === 'tone' && b.freq > 20 && b.freq < 12000) {
      this.buzzOsc!.frequency.setTargetAtTime(b.freq, t, 0.005);
      this.buzzFilter!.frequency.setTargetAtTime(Math.max(600, b.freq * 1.4), t, 0.01);
      this.buzzGain!.gain.setTargetAtTime(0.22, t, 0.006);
    } else if (b.mode === 'dc' && b.duty > 0.05) {
      // a DC-driven active buzzer oscillates at its own resonance
      this.buzzOsc!.frequency.setTargetAtTime(2400, t, 0.005);
      this.buzzFilter!.frequency.setTargetAtTime(2600, t, 0.01);
      this.buzzGain!.gain.setTargetAtTime(0.18 * Math.min(1, b.duty * 1.2), t, 0.006);
    } else this.buzzGain!.gain.setTargetAtTime(0, t, 0.008);

    // relay click on every change, rate-limited (a real relay cannot follow faster than ~20 Hz)
    if (this.lastRelay !== null && s.relay !== this.lastRelay && performance.now() - this.lastClick > 45) {
      this.click(s.relay);
      this.lastClick = performance.now();
    }
    this.lastRelay = s.relay;

    // DC motor hum
    const sp = Math.abs(s.dc.speed);
    this.humOsc!.frequency.setTargetAtTime(40 + sp * 140, t, 0.05);
    this.humGain!.gain.setTargetAtTime(sp > 0.02 ? 0.03 + sp * 0.05 : 0, t, 0.08);

    // probe speaker
    if (this.probe && this.probe.freq > 20 && this.probe.freq < 12000 && this.probe.duty > 0 && this.probe.duty < 1) {
      this.probeOsc!.frequency.setTargetAtTime(this.probe.freq, t, 0.005);
      this.probeGain!.gain.setTargetAtTime(0.12, t, 0.01);
    } else this.probeGain!.gain.setTargetAtTime(0, t, 0.01);
  }

  private click(on: boolean) {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * 0.025);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const env = Math.exp(-i / (len * (on ? 0.12 : 0.08)));
      d[i] = (Math.random() * 2 - 1) * env * (i < 40 ? 1 : 0.55);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = on ? 1800 : 2600;
    f.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.value = 0.5;
    src.connect(f).connect(g).connect(this.master!);
    src.start();
  }
}

export const audio = new AudioEngine();
