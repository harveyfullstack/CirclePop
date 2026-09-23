import type { ModeId } from '../game/types';
import { isNative } from '../platform/native';
import type { MissionKind, MissionState } from './missions';
import { DEFAULT_SKIN, SKINS } from './skins';

export const SAVE_KEY = 'circlepop.save.v2';
/** The 2020 version stored a bare number here. */
export const LEGACY_KEY = 'highscore';

export interface Settings {
  music: boolean;
  sfx: boolean;
  haptics: boolean;
  /** Reduced motion: no screen shake or flashes. */
  calm: boolean;
}

export interface Stats {
  games: number;
  pops: number;
  perfects: number;
  golds: number;
  fevers: number;
  powerups: number;
  bestStreak: number;
  bestMult: number;
  seconds: number;
  revives: number;
}

export interface SaveData {
  v: 2;
  saved: number;
  coins: number;
  best: { classic: number; daily: number; zen: number };
  daily: { date: string; best: number; streak: number; last: string; bestStreak: number };
  skin: string;
  owned: string[];
  mode: ModeId;
  settings: Settings;
  stats: Stats;
  missions: { done: number; active: MissionState[] };
  gift: { last: string; streak: number };
  tips: string[];
  legacyBest: number;
}

const prefersCalm = (): boolean => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

export function defaultSave(): SaveData {
  return {
    v: 2,
    saved: 0,
    coins: 0,
    best: { classic: 0, daily: 0, zen: 0 },
    daily: { date: '', best: 0, streak: 0, last: '', bestStreak: 0 },
    skin: DEFAULT_SKIN,
    owned: [DEFAULT_SKIN],
    mode: 'classic',
    settings: { music: true, sfx: true, haptics: true, calm: typeof window !== 'undefined' && prefersCalm() },
    stats: { games: 0, pops: 0, perfects: 0, golds: 0, fevers: 0, powerups: 0, bestStreak: 0, bestMult: 1, seconds: 0, revives: 0 },
    missions: { done: 0, active: [] },
    gift: { last: '', streak: 0 },
    tips: [],
    legacyBest: 0,
  };
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, d: number, min = 0, max = 1e12): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d;
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
const str = (v: unknown, d: string): string => (typeof v === 'string' ? v : d);

const MISSION_KINDS: readonly MissionKind[] = ['popsRun', 'scoreRun', 'perfectStreak', 'goldTotal', 'feverRun', 'games', 'popsTotal', 'powerTotal', 'multReach', 'daily'];

/** Turn anything (old, partial or corrupted JSON) into a valid save. Never throws. */
export function sanitize(raw: unknown): SaveData {
  const d = defaultSave();
  if (!isObj(raw)) return d;
  d.saved = num(raw.saved, 0);
  d.coins = Math.floor(num(raw.coins, 0));
  if (isObj(raw.best)) {
    d.best.classic = num(raw.best.classic, 0);
    d.best.daily = num(raw.best.daily, 0);
    d.best.zen = num(raw.best.zen, 0);
  }
  if (isObj(raw.daily)) {
    d.daily.date = str(raw.daily.date, '');
    d.daily.best = num(raw.daily.best, 0);
    d.daily.streak = num(raw.daily.streak, 0);
    d.daily.last = str(raw.daily.last, '');
    d.daily.bestStreak = num(raw.daily.bestStreak, 0);
  }
  const ids = new Set(SKINS.map((s) => s.id));
  if (Array.isArray(raw.owned)) d.owned = [...new Set([DEFAULT_SKIN, ...raw.owned.filter((x): x is string => typeof x === 'string' && ids.has(x))])];
  const skin = str(raw.skin, DEFAULT_SKIN);
  d.skin = ids.has(skin) && d.owned.includes(skin) ? skin : DEFAULT_SKIN;
  const mode = str(raw.mode, 'classic');
  d.mode = mode === 'daily' || mode === 'zen' ? mode : 'classic';
  if (isObj(raw.settings)) {
    d.settings.music = bool(raw.settings.music, true);
    d.settings.sfx = bool(raw.settings.sfx, true);
    d.settings.haptics = bool(raw.settings.haptics, true);
    d.settings.calm = bool(raw.settings.calm, d.settings.calm);
  }
  if (isObj(raw.stats)) {
    const s = raw.stats;
    for (const k of Object.keys(d.stats) as (keyof Stats)[]) d.stats[k] = num(s[k], d.stats[k]);
  }
  if (isObj(raw.missions)) {
    d.missions.done = num(raw.missions.done, 0);
    if (Array.isArray(raw.missions.active)) {
      d.missions.active = raw.missions.active
        .filter((m): m is Obj => isObj(m) && MISSION_KINDS.includes(m.kind as MissionKind))
        .slice(0, 3)
        .map((m) => ({ kind: m.kind as MissionKind, goal: Math.max(1, num(m.goal, 1)), progress: num(m.progress, 0), reward: num(m.reward, 30) }));
    }
  }
  if (isObj(raw.gift)) {
    d.gift.last = str(raw.gift.last, '');
    d.gift.streak = num(raw.gift.streak, 0);
  }
  if (Array.isArray(raw.tips)) d.tips = raw.tips.filter((t): t is string => typeof t === 'string').slice(0, 64);
  d.legacyBest = num(raw.legacyBest, 0);
  return d;
}

function parse(json: string | null): unknown {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export class Store {
  private timer = 0;

  private constructor(public data: SaveData) {}

  static async load(): Promise<Store> {
    let raw = parse(readLocal(SAVE_KEY));
    if (isNative) {
      // iOS may purge WebView storage; Preferences (UserDefaults / SharedPreferences) is the durable copy.
      try {
        const { Preferences } = await import('@capacitor/preferences');
        const r = parse((await Preferences.get({ key: SAVE_KEY })).value);
        if (isObj(r) && (!isObj(raw) || num(r.saved, 0) > num(raw.saved, 0))) raw = r;
      } catch {
        /* plugin missing */
      }
    }
    const fresh = !isObj(raw);
    const data = sanitize(raw);
    if (fresh) {
      const legacy = parseInt(readLocal(LEGACY_KEY) ?? '', 10);
      if (legacy > 0) {
        data.legacyBest = legacy;
        if (!data.owned.includes('og')) data.owned.push('og');
      }
    }
    return new Store(data);
  }

  /** Persist soon (coalesces bursts of changes). */
  save(): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.flush(), 120);
  }

  flush(): void {
    window.clearTimeout(this.timer);
    this.data.saved = Date.now();
    const json = JSON.stringify(this.data);
    try {
      localStorage.setItem(SAVE_KEY, json);
    } catch {
      /* private mode / quota */
    }
    if (isNative) {
      import('@capacitor/preferences')
        .then(({ Preferences }) => Preferences.set({ key: SAVE_KEY, value: json }))
        .catch(() => undefined);
    }
  }

  reset(): void {
    const keepLegacy = this.data.legacyBest;
    this.data = defaultSave();
    this.data.legacyBest = keepLegacy;
    if (keepLegacy > 0) this.data.owned.push('og');
    this.flush();
  }
}
