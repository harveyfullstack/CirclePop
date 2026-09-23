import type { DeathCause, PowerKind } from '../game/types';
import type { Voice } from '../meta/skins';
import type { AudioEngine } from './engine';
import { CHORD_ROOTS, type Music } from './music';
import { env, midiHz, noise, osc, playVoice } from './voices';

/** Pentatonic staircase: every PERFECT in a row climbs one step. */
const LADDER = [64, 67, 69, 72, 74, 76, 79, 81, 84, 86, 88, 91, 93];
const TOP = [91, 93, 96, 93];

/** Every sound in the game is synthesised here (plus three samples from the 2020 original). */
export class Sfx {
  voice: Voice = 'pop';

  constructor(
    private readonly eng: AudioEngine,
    private readonly music: Music,
  ) {}

  private ctx(): AudioContext | null {
    return this.eng.sfxOn && this.eng.usable ? this.eng.ctx : null;
  }

  private get out(): AudioNode {
    return this.eng.sfx;
  }

  noteFor(streak: number, perfect: boolean): number {
    if (!perfect || streak <= 0) return CHORD_ROOTS[this.music.chord()];
    if (streak <= LADDER.length) return LADDER[streak - 1];
    return TOP[(streak - LADDER.length) % TOP.length];
  }

  pop(streak: number, perfect: boolean, gold: boolean): void {
    const ctx = this.ctx();
    if (!ctx) return;
    const t = ctx.currentTime;
    const m = this.noteFor(streak, perfect);
    playVoice(this.eng, this.voice, midiHz(m), t, perfect ? 1 : 0.8, this.out);
    if (perfect) {
      osc(ctx, 'triangle', midiHz(m + 12), t + 0.045, 0.2, env(ctx, t + 0.045, 0.002, 0.07, 0.14, this.out));
    }
    if (gold) this.coin(0.05);
  }

  mult(mult: number): void {
    const ctx = this.ctx();
    if (!ctx) return;
    const t = ctx.currentTime + 0.06;
    const base = 72 + Math.min(mult, 8) * 2;
    [0, 4, 7].forEach((iv, i) => {
      osc(ctx, 'triangle', midiHz(base + iv), t + i * 0.05, 0.3, env(ctx, t + i * 0.05, 0.003, 0.15, 0.22, this.out));
    });
  }

  streakLost(): void {
    const ctx = this.ctx();
    if (!ctx) return;
    const t = ctx.currentTime + 0.04;
    osc(ctx, 'triangle', midiHz(76), t, 0.12, env(ctx, t, 0.002, 0.08, 0.09, this.out));
    osc(ctx, 'triangle', midiHz(71), t + 0.08, 0.16, env(ctx, t + 0.08, 0.002, 0.08, 0.13, this.out));
  }

  miss(): void {
    const ctx = this.ctx();
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = osc(ctx, 'sine', 320, t, 0.16, env(ctx, t, 0.002, 0.16, 0.12, this.out));
    o.frequency.exponentialRampToValueAtTime(140, t + 0.12);
    noise(this.eng, t, 0.08, 'bandpass', 900, 1.2, 0.12, 0.05, this.out);
  }

  power(kind: PowerKind): void {
    const ctx = this.ctx();
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = osc(ctx, 'sine', 300, t, 0.32, env(ctx, t, 0.01, 0.16, 0.28, this.out));
    o.frequency.exponentialRampToValueAtTime(1500, t + 0.25);
    const chord = kind === 'shield' ? [67, 74, 79] : kind === 'slow' ? [64, 71, 76] : [69, 76, 81];
    chord.forEach((m, i) => playVoice(this.eng, 'bell', midiHz(m), t + 0.05 + i * 0.06, 0.6, this.out));
  }

  shield(): void {
    const ctx = this.ctx();
    if (!ctx) return;
    const t = ctx.currentTime;
    const car = osc(ctx, 'sine', 180, t, 0.8, env(ctx, t, 0.002, 0.3, 0.6, this.out));
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(400, t);
    mg.gain.exponentialRampToValueAtTime(5, t + 0.5);
    mg.connect(car.frequency);
    osc(ctx, 'sine', 180 * 2.4, t, 0.8, mg);
    noise(this.eng, t, 0.4, 'highpass', 3000, 0.7, 0.2, 0.25, this.out);
  }

  bomb(): void {
    const ctx = this.ctx();
    if (!ctx) return;
    const t = ctx.currentTime;
    const f = noise(this.eng, t, 1, 'lowpass', 2600, 0.8, 0.6, 0.85, this.out);
    f.frequency.exponentialRampToValueAtTime(160, t + 0.7);
    const o = osc(ctx, 'sine', 120, t, 0.6, env(ctx, t, 0.002, 0.6, 0.5, this.out));
    o.frequency.exponentialRampToValueAtTime(36, t + 0.45);
  }

  death(cause: DeathCause): void {
    const ctx = this.ctx();
    if (!ctx) return;
    const t = ctx.currentTime;
    if (cause === 'bomb') this.bomb();
    const buzz = this.voice === 'og' ? this.eng.sample('buzz') : undefined;
    if (buzz) {
      const src = ctx.createBufferSource();
      src.buffer = buzz;
      const g = ctx.createGain();
      g.gain.value = 0.8;
      src.connect(g);
      g.connect(this.out);
      src.start(t);
      return;
    }
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1600, t);
    lp.frequency.exponentialRampToValueAtTime(300, t + 0.7);
    lp.connect(env(ctx, t, 0.01, 0.26, 0.75, this.out));
    const a = osc(ctx, 'sawtooth', 330, t, 0.85, lp);
    a.frequency.exponentialRampToValueAtTime(70, t + 0.7);
    const b = osc(ctx, 'sawtooth', 336, t, 0.85, lp);
    b.frequency.exponentialRampToValueAtTime(72, t + 0.7);
    const th = osc(ctx, 'sine', 95, t, 0.4, env(ctx, t, 0.002, 0.5, 0.3, this.out));
    th.frequency.exponentialRampToValueAtTime(40, t + 0.3);
  }

  fever(): void {
    const ctx = this.ctx();
    if (!ctx) return;
    const t = ctx.currentTime;
    // Riser → impact → chord stab.
    const f = noise(this.eng, t, 0.6, 'bandpass', 500, 2, 0.35, 0.55, this.out);
    f.frequency.exponentialRampToValueAtTime(7000, t + 0.45);
    const hit = t + 0.42;
    const k = osc(ctx, 'sine', 160, hit, 0.4, env(ctx, hit, 0.001, 0.55, 0.35, this.out));
    k.frequency.exponentialRampToValueAtTime(45, hit + 0.15);
    noise(this.eng, hit, 1.3, 'highpass', 4500, 0.6, 0.18, 1.1, this.out);
    [72, 76, 79, 84].forEach((m) => playVoice(this.eng, 'bell', midiHz(m), hit, 0.38, this.out));
  }

  feverEnd(): void {
    const ctx = this.ctx();
    if (!ctx) return;
    const t = ctx.currentTime;
    const f = noise(this.eng, t, 0.5, 'bandpass', 5000, 2, 0.18, 0.45, this.out);
    f.frequency.exponentialRampToValueAtTime(400, t + 0.45);
  }

  newBest(): void {
    const ctx = this.ctx();
    if (!ctx) return;
    const t = ctx.currentTime;
    [72, 76, 79, 84, 88].forEach((m, i) => playVoice(this.eng, 'bell', midiHz(m), t + i * 0.07, 0.7, this.out));
    const claps = this.eng.sample('claps');
    if (claps) {
      const src = ctx.createBufferSource();
      src.buffer = claps;
      const g = ctx.createGain();
      g.gain.value = 0.75;
      src.connect(g);
      g.connect(this.out);
      src.start(t + 0.1);
    }
  }

  bestPassed(): void {
    const ctx = this.ctx();
    if (!ctx) return;
    const t = ctx.currentTime + 0.05;
    [79, 84, 91].forEach((m, i) => playVoice(this.eng, 'glass', midiHz(m), t + i * 0.06, 0.5, this.out));
  }

  coin(delay = 0): void {
    const ctx = this.ctx();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    osc(ctx, 'square', midiHz(83), t, 0.08, env(ctx, t, 0.001, 0.09, 0.06, this.out));
    osc(ctx, 'square', midiHz(88), t + 0.07, 0.3, env(ctx, t + 0.07, 0.001, 0.09, 0.22, this.out));
  }

  click(): void {
    const ctx = this.ctx();
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = osc(ctx, 'sine', 1300, t, 0.06, env(ctx, t, 0.001, 0.1, 0.04, this.out));
    o.frequency.exponentialRampToValueAtTime(700, t + 0.04);
  }

  tick(urgency: number): void {
    const ctx = this.ctx();
    if (!ctx) return;
    const t = ctx.currentTime;
    osc(ctx, 'sine', 1800 + urgency * 600, t, 0.05, env(ctx, t, 0.001, 0.06 + urgency * 0.06, 0.035, this.out));
  }

  countdown(n: number): void {
    const ctx = this.ctx();
    if (!ctx) return;
    const t = ctx.currentTime;
    const f = n > 0 ? 880 : 1320;
    osc(ctx, 'triangle', f, t, 0.25, env(ctx, t, 0.003, 0.14, n > 0 ? 0.12 : 0.22, this.out));
  }

  buy(): void {
    const ctx = this.ctx();
    if (!ctx) return;
    const t = ctx.currentTime;
    [76, 79, 84, 88, 91].forEach((m, i) => playVoice(this.eng, 'marimba', midiHz(m), t + i * 0.055, 0.7, this.out));
    this.coin(0.3);
  }

  preview(voice: Voice): void {
    const ctx = this.ctx();
    if (!ctx) return;
    const t = ctx.currentTime;
    [72, 76, 79].forEach((m, i) => playVoice(this.eng, voice, midiHz(m), t + i * 0.09, 0.8, this.out));
  }

  whoosh(): void {
    const ctx = this.ctx();
    if (!ctx) return;
    const t = ctx.currentTime;
    const f = noise(this.eng, t, 0.3, 'bandpass', 600, 1.5, 0.32, 0.22, this.out);
    f.frequency.exponentialRampToValueAtTime(3000, t + 0.2);
  }
}
