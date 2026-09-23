import { clamp, lerp, smoothstep } from '../core/math';
import type { ModeId, PowerKind } from './types';

export interface Rules {
  timer: boolean;
  missKills: boolean;
  hazards: boolean;
  powerups: boolean;
  fever: boolean;
  moving: boolean;
}

export const RULES: Record<ModeId, Rules> = {
  classic: { timer: true, missKills: true, hazards: true, powerups: true, fever: true, moving: true },
  daily: { timer: true, missKills: true, hazards: true, powerups: true, fever: true, moving: true },
  zen: { timer: false, missKills: false, hazards: false, powerups: false, fever: true, moving: true },
};

/** Multipliers applied on top of the base curves (daily modifiers tweak these). */
export interface Tuning {
  timeScale: number;
  bombRate: number;
  bombStart: number;
  goldRate: number;
  moveRate: number;
  moveStart: number;
  sizeScale: number;
  powerRate: number;
}

export const BASE_TUNING: Tuning = {
  timeScale: 1,
  bombRate: 1,
  bombStart: 18,
  goldRate: 1,
  moveRate: 1,
  moveStart: 30,
  sizeScale: 1,
  powerRate: 1,
};

export const ZEN_TUNING: Tuning = { ...BASE_TUNING, sizeScale: 1.08, moveRate: 0.6, moveStart: 45 };

export const FEVER_DURATION = 6.5;
export const MAX_MULT = 8;
/** Fraction of the radius that counts as a PERFECT (center) hit. */
export const PERFECT_FRAC = 0.42;
export const POWER_START = 10;
export const POWER_CHANCE = 0.075;
export const POWER_LIFE = 3.2;
export const POWERS: readonly PowerKind[] = ['shield', 'slow', 'double'];
export const SLOW_TIME = 6;
export const DOUBLE_TIME = 8;
export const READY_RADIUS = 58;

/** Seconds allowed to reach a static target at an average distance after `n` pops. */
export function timeLimit(n: number): number {
  return 0.62 + 1.45 * Math.exp(-n / 38);
}

/** Target radius in size units after `n` pops. */
export function targetRadius(n: number): number {
  return lerp(46, 30, smoothstep(0, 140, n));
}

export function bombRadius(n: number): number {
  return lerp(25, 21, smoothstep(0, 140, n));
}

export function goldChance(n: number): number {
  return n < 4 ? 0 : 0.065;
}

export function moveChance(n: number, t: Tuning): number {
  if (n < t.moveStart) return 0;
  return clamp((0.18 + 0.42 * smoothstep(t.moveStart, t.moveStart + 90, n)) * t.moveRate, 0, 1);
}

/** Speed of moving targets in size units per second. */
export function moveSpeed(n: number): number {
  return lerp(55, 150, smoothstep(30, 170, n));
}

/** Number of bombs to add to a wave. `roll` is a uniform random number in [0, 1). */
export function bombCount(n: number, roll: number, t: Tuning): number {
  if (n < t.bombStart) return 0;
  const p = clamp((0.3 + 0.35 * smoothstep(t.bombStart, t.bombStart + 60, n)) * t.bombRate, 0, 0.95);
  if (roll >= p) return 0;
  const extra = smoothstep(t.bombStart + 25, t.bombStart + 110, n) * 2 * Math.min(t.bombRate, 1.5);
  return 1 + Math.floor((roll / p) * (extra + 1));
}

export function multForStreak(streak: number): number {
  return Math.min(MAX_MULT, 1 + Math.floor(streak / 3));
}

/** Fever meter gained per pop. */
export function feverGain(kind: 'perfect' | 'good' | 'gold'): number {
  return kind === 'gold' ? 0.18 : kind === 'perfect' ? 0.1 : 0.035;
}
