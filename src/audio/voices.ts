import { clamp } from '../core/math';
import type { Voice } from '../meta/skins';
import type { AudioEngine } from './engine';

export function midiHz(m: number): number {
  return 440 * 2 ** ((m - 69) / 12);
}

/** Gain node with an attack → exponential decay envelope, already connected to `out`. */
export function env(ctx: BaseAudioContext, t: number, attack: number, peak: number, decay: number, out: AudioNode): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(out);
  return g;
}

export function osc(ctx: BaseAudioContext, type: OscillatorType, f: number, t: number, dur: number, out: AudioNode): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  o.connect(out);
  o.start(t);
  o.stop(t + dur);
  return o;
}

export function noise(eng: AudioEngine, t: number, dur: number, type: BiquadFilterType, freq: number, q: number, peak: number, decay: number, out: AudioNode): BiquadFilterNode {
  const ctx = eng.ctx as AudioContext;
  const src = ctx.createBufferSource();
  src.buffer = eng.noise;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  f.Q.value = q;
  src.connect(f);
  f.connect(env(ctx, t, 0.001, peak, decay, out));
  src.start(t, Math.random() * Math.max(0, eng.noise.duration - dur), dur);
  return f;
}

/** One pitched "pop" in the skin's instrument. */
export function playVoice(eng: AudioEngine, voice: Voice, f: number, t: number, vol: number, out: AudioNode): void {
  const ctx = eng.ctx;
  if (!ctx) return;
  // Tame piercing high notes.
  const v = vol * clamp(760 / f, 0.42, 1);
  switch (voice) {
    case 'pop': {
      const o = osc(ctx, 'sine', f * 0.5, t, 0.3, env(ctx, t, 0.003, v * 0.55, 0.2, out));
      o.frequency.exponentialRampToValueAtTime(f, t + 0.035);
      const o2 = osc(ctx, 'sine', f, t, 0.12, env(ctx, t, 0.002, v * 0.16, 0.07, out));
      o2.frequency.exponentialRampToValueAtTime(f * 2, t + 0.03);
      noise(eng, t, 0.05, 'highpass', 2500, 0.7, v * 0.22, 0.025, out);
      break;
    }
    case 'drop': {
      const o = osc(ctx, 'sine', f * 0.62, t, 0.26, env(ctx, t, 0.002, v * 0.55, 0.17, out));
      o.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.08);
      osc(ctx, 'sine', f * 3, t + 0.012, 0.12, env(ctx, t + 0.012, 0.002, v * 0.1, 0.07, out));
      break;
    }
    case 'marimba': {
      osc(ctx, 'sine', f, t, 0.6, env(ctx, t, 0.002, v * 0.5, 0.5, out));
      osc(ctx, 'sine', f * 4, t, 0.15, env(ctx, t, 0.001, v * 0.2, 0.08, out));
      osc(ctx, 'sine', f * 9.9, t, 0.06, env(ctx, t, 0.001, v * 0.06, 0.025, out));
      break;
    }
    case 'bell': {
      const car = osc(ctx, 'sine', f, t, 1.3, env(ctx, t, 0.002, v * 0.34, 1.1, out));
      const mg = ctx.createGain();
      mg.gain.setValueAtTime(f * 2.4, t);
      mg.gain.exponentialRampToValueAtTime(f * 0.05, t + 0.8);
      mg.connect(car.frequency);
      osc(ctx, 'sine', f * 3.5, t, 1.3, mg);
      break;
    }
    case 'glass': {
      osc(ctx, 'sine', f * 2, t, 1.0, env(ctx, t, 0.002, v * 0.26, 0.9, out));
      osc(ctx, 'sine', f * 3.01, t, 0.7, env(ctx, t, 0.002, v * 0.12, 0.55, out));
      osc(ctx, 'triangle', f * 4.02, t, 0.4, env(ctx, t, 0.001, v * 0.06, 0.25, out));
      break;
    }
    case 'chip': {
      const o = osc(ctx, 'square', f, t, 0.18, env(ctx, t, 0.001, v * 0.26, 0.14, out));
      o.frequency.setValueAtTime(f * 2, t + 0.045);
      break;
    }
    case 'pluck': {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 5;
      lp.frequency.setValueAtTime(Math.min(12000, f * 12), t);
      lp.frequency.exponentialRampToValueAtTime(Math.max(200, f * 1.2), t + 0.22);
      lp.connect(env(ctx, t, 0.002, v * 0.22, 0.32, out));
      osc(ctx, 'sawtooth', f, t, 0.4, lp);
      osc(ctx, 'sawtooth', f * 1.006, t, 0.4, lp);
      break;
    }
    case 'og': {
      const buf = eng.sample('pop');
      if (!buf) {
        playVoice(eng, 'pop', f, t, vol, out);
        break;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = clamp(f / 523.25, 0.8, 1.7);
      const g = ctx.createGain();
      g.gain.value = vol * 0.9;
      src.connect(g);
      g.connect(out);
      src.start(t);
      break;
    }
  }
}
