import type { AudioEngine } from './engine';
import { env, midiHz, noise, osc } from './voices';

export const BPM = 118;
const BEAT = 60 / BPM;
const STEP = BEAT / 4;

interface Chord {
  root: number;
  pad: number[];
  arp: number[];
}

/** vi–IV–I–V in C: Am F C G, voice-led pads. */
const PROG: readonly Chord[] = [
  { root: 45, pad: [57, 60, 64], arp: [69, 72, 76, 81] },
  { root: 41, pad: [57, 60, 65], arp: [65, 69, 72, 77] },
  { root: 48, pad: [55, 60, 64], arp: [67, 72, 76, 79] },
  { root: 43, pad: [55, 59, 62], arp: [67, 71, 74, 79] },
];

/** Roots (octave 4) that a "good" pop plays so it always fits the current chord. */
export const CHORD_ROOTS = [69, 65, 72, 67] as const;

const BASS = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 2, 0];
const MENU_ARP = [0, 2, 1, 3];

/**
 * Tiny generative synth-pop loop with a look-ahead scheduler.
 * Levels: 0 menu (pad + bells) · 1 playing (+kick, bass) · 2 hot (+clap, hats, arp) · 3 FEVER (everything).
 */
export class Music {
  level = 0;
  private running = false;
  private timer = 0;
  private step = 0;
  private nextTime = 0;
  private t0 = 0;
  private readonly clock0 = performance.now() / 1000;
  private pad!: GainNode;
  private bass!: GainNode;
  private drums!: GainNode;
  private arp!: GainNode;

  constructor(private readonly eng: AudioEngine) {}

  start(): void {
    const ctx = this.eng.ctx;
    if (!ctx || this.running) return;
    if (!this.pad) {
      const bus = (gain: number): GainNode => {
        const g = ctx.createGain();
        g.gain.value = gain;
        g.connect(this.eng.music);
        return g;
      };
      this.pad = bus(1);
      this.bass = bus(1);
      this.drums = bus(1);
      this.arp = bus(1);
    }
    this.running = true;
    this.nextTime = ctx.currentTime + 0.08;
    this.t0 = this.nextTime;
    this.step = 0;
    this.tick();
  }

  stop(): void {
    this.running = false;
    window.clearTimeout(this.timer);
  }

  /** Beats elapsed (fractional), compensated for output latency so visuals land with the sound. */
  beats(): number {
    const ctx = this.eng.ctx;
    if (this.running && ctx && ctx.state === 'running') {
      const lat = (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
      return (ctx.currentTime - lat - this.t0) / BEAT;
    }
    return (performance.now() / 1000 - this.clock0) / BEAT;
  }

  /** Index into the chord progression that is sounding right now. */
  chord(): number {
    const ctx = this.eng.ctx;
    if (!this.running || !ctx) return 0;
    return Math.floor(Math.max(0, ctx.currentTime - this.t0) / (BEAT * 4)) % PROG.length;
  }

  private tick = (): void => {
    if (!this.running) return;
    const ctx = this.eng.ctx as AudioContext;
    if (this.nextTime < ctx.currentTime - 0.2) {
      // Context was suspended (backgrounded): jump ahead instead of machine-gunning notes.
      const skip = Math.ceil((ctx.currentTime - this.nextTime) / STEP);
      this.nextTime += skip * STEP;
      this.step += skip;
    }
    while (this.nextTime < ctx.currentTime + 0.12) {
      this.schedule(this.step, this.nextTime);
      this.nextTime += STEP;
      this.step++;
    }
    this.timer = window.setTimeout(this.tick, 25);
  };

  private schedule(step: number, t: number): void {
    if (!this.eng.musicOn) return;
    const s = step % 16;
    const bar = Math.floor(step / 16);
    const ch = PROG[bar % PROG.length];
    const L = this.level;
    if (s === 0) this.padChord(ch.pad, t, STEP * 16, L);
    if (L >= 1 && s % 4 === 0) {
      this.kick(t);
      this.pump(t);
    }
    if (L >= 1 && BASS[s]) this.bassNote(ch.root + (BASS[s] === 2 ? 12 : 0), t, STEP * (BASS[s] === 2 ? 1.5 : 2.4));
    if (L >= 2 && (s === 4 || s === 12)) this.clap(t);
    if (L >= 2 && s % 4 === 2) this.hat(t, 0.08, 0.04);
    if (L >= 3 && s % 2 === 1) this.hat(t, 0.045, 0.03);
    if (L >= 3 && s === 14) this.hat(t, 0.07, 0.24);
    if (L === 0 && s % 4 === 0) this.bell(ch.arp[MENU_ARP[(s / 4 + bar) % 4]] + 12, t);
    if (L >= 3) this.pluck(ch.arp[s % 4] + (s >= 8 ? 12 : 0), t, 1);
    else if (L === 2 && s % 2 === 0) this.pluck(ch.arp[(s / 2) % 4], t, 0.6);
  }

  private get ctx(): AudioContext {
    return this.eng.ctx as AudioContext;
  }

  private pump(t: number): void {
    for (const g of [this.pad.gain, this.bass.gain]) {
      g.cancelScheduledValues(t);
      g.setValueAtTime(0.35, t);
      g.linearRampToValueAtTime(1, t + 0.22);
    }
  }

  private padChord(notes: readonly number[], t: number, dur: number, L: number): void {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = L >= 3 ? 2600 : L >= 1 ? 1500 : 1000;
    lp.Q.value = 0.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.35);
    g.gain.setValueAtTime(0.05, t + dur - 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.25);
    lp.connect(g);
    g.connect(this.pad);
    for (const n of notes) {
      for (const det of [-7, 7]) {
        const o = osc(ctx, 'sawtooth', midiHz(n), t, dur + 0.3, lp);
        o.detune.value = det;
      }
    }
  }

  private kick(t: number): void {
    const ctx = this.ctx;
    const o = osc(ctx, 'sine', 150, t, 0.35, env(ctx, t, 0.001, 0.85, 0.3, this.drums));
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    // A click so phone speakers (no real bass) still feel the beat.
    noise(this.eng, t, 0.03, 'highpass', 1200, 0.7, 0.1, 0.012, this.drums);
  }

  private bassNote(m: number, t: number, dur: number): void {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    lp.Q.value = 3;
    lp.connect(env(ctx, t, 0.005, 0.24, dur, this.bass));
    osc(ctx, 'sawtooth', midiHz(m), t, dur + 0.1, lp);
  }

  private clap(t: number): void {
    for (let i = 0; i < 3; i++) {
      noise(this.eng, t + i * 0.011, 0.2, 'bandpass', 1400, 0.9, 0.28, i === 2 ? 0.13 : 0.018, this.drums);
    }
  }

  private hat(t: number, peak: number, decay: number): void {
    noise(this.eng, t, decay + 0.05, 'highpass', 7500, 0.7, peak, decay, this.drums);
  }

  private pluck(m: number, t: number, k: number): void {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3000;
    lp.connect(env(ctx, t, 0.002, 0.045 * k, 0.11, this.arp));
    osc(ctx, 'square', midiHz(m), t, 0.16, lp);
  }

  private bell(m: number, t: number): void {
    const ctx = this.ctx;
    osc(ctx, 'sine', midiHz(m), t, 1.1, env(ctx, t, 0.01, 0.05, 0.9, this.arp));
    osc(ctx, 'sine', midiHz(m) * 2, t, 0.6, env(ctx, t, 0.01, 0.015, 0.4, this.arp));
  }
}
