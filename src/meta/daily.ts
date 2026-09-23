import { hashString } from '../core/rng';
import { BASE_TUNING, type Tuning } from '../game/difficulty';

/** Daily #1. */
export const DAILY_EPOCH = '2026-09-23';

export interface DailyModifier {
  id: string;
  name: string;
  desc: string;
  tuning: Partial<Tuning>;
}

export const DAILY_MODIFIERS: readonly DailyModifier[] = [
  { id: 'pure', name: 'Pure', desc: 'Classic rules. Pure skill.', tuning: {} },
  { id: 'goldrush', name: 'Gold Rush', desc: 'Gold circles everywhere', tuning: { goldRate: 4 } },
  { id: 'minefield', name: 'Minefield', desc: 'Bombs from the very start', tuning: { bombRate: 1.6, bombStart: 6 } },
  { id: 'hyper', name: 'Hyper', desc: 'The clock runs 15% faster', tuning: { timeScale: 0.85 } },
  { id: 'drift', name: 'Drift', desc: 'Circles never sit still', tuning: { moveRate: 2.5, moveStart: 3 } },
  { id: 'tiny', name: 'Tiny', desc: 'Smaller circles, bigger flex', tuning: { sizeScale: 0.82 } },
  { id: 'powerhour', name: 'Power Hour', desc: 'Power-ups rain down', tuning: { powerRate: 3.5 } },
];

/** Local calendar day as YYYY-MM-DD (everyone gets the same puzzle on the same date, like Wordle). */
export function dateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function keyToUTC(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}

export function daysBetween(a: string, b: string): number {
  if (!a || !b) return Infinity;
  return Math.round((keyToUTC(b) - keyToUTC(a)) / 86_400_000);
}

export function dailyNumber(key: string): number {
  return Math.max(1, daysBetween(DAILY_EPOCH, key) + 1);
}

export function dailySeed(key: string): number {
  return hashString(`circlepop-daily:${key}`);
}

export function dailyModifier(key: string): DailyModifier {
  if (key === DAILY_EPOCH) return DAILY_MODIFIERS[1];
  return DAILY_MODIFIERS[(hashString(`mod:${key}`) + dailyNumber(key)) % DAILY_MODIFIERS.length];
}

export function dailyTuning(key: string): Tuning {
  return { ...BASE_TUNING, ...dailyModifier(key).tuning };
}
