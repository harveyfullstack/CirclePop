import type { RunSummary } from '../game/session';
import type { SaveData } from './save';
import { SKINS, type GoalId, type Skin } from './skins';

export type MissionKind =
  | 'popsRun'
  | 'scoreRun'
  | 'perfectStreak'
  | 'goldTotal'
  | 'feverRun'
  | 'games'
  | 'popsTotal'
  | 'powerTotal'
  | 'multReach'
  | 'daily';

export interface MissionState {
  kind: MissionKind;
  goal: number;
  progress: number;
  reward: number;
}

interface Def {
  text: (goal: number) => string;
  goals: readonly number[];
  /** Cumulative across runs (vs. best single run). */
  total: boolean;
  weight: number;
}

export const MISSION_DEFS: Record<MissionKind, Def> = {
  popsRun: { text: (g) => `Pop ${g} circles in one run`, goals: [15, 25, 40, 55, 70, 90, 110, 140], total: false, weight: 3 },
  scoreRun: { text: (g) => `Score ${g} in one run`, goals: [30, 60, 100, 160, 240, 350, 500, 700], total: false, weight: 3 },
  perfectStreak: { text: (g) => `Hit ${g} PERFECTs in a row`, goals: [3, 5, 7, 9, 12, 15, 18, 21], total: false, weight: 3 },
  goldTotal: { text: (g) => `Pop ${g} gold circles`, goals: [2, 3, 5, 7, 10, 12, 15, 20], total: true, weight: 2 },
  feverRun: { text: (g) => (g === 1 ? 'Trigger FEVER' : `Trigger FEVER ${g}× in one run`), goals: [1, 1, 2, 2, 3, 3, 4, 5], total: false, weight: 2 },
  games: { text: (g) => `Play ${g} games`, goals: [3, 5, 5, 8, 10, 10, 12, 15], total: true, weight: 1 },
  popsTotal: { text: (g) => `Pop ${g} circles in total`, goals: [100, 200, 300, 400, 600, 800, 1000, 1500], total: true, weight: 2 },
  powerTotal: { text: (g) => (g === 1 ? 'Grab a power-up' : `Grab ${g} power-ups`), goals: [1, 2, 3, 5, 6, 8, 10, 12], total: true, weight: 2 },
  multReach: { text: (g) => `Reach a ×${g} multiplier`, goals: [2, 3, 3, 4, 5, 6, 7, 8], total: false, weight: 2 },
  daily: { text: () => 'Play the Daily Challenge', goals: [1], total: true, weight: 1 },
};

const KINDS = Object.keys(MISSION_DEFS) as MissionKind[];

export function missionText(m: MissionState): string {
  return MISSION_DEFS[m.kind].text(m.goal);
}

export function tierFor(done: number): number {
  return Math.min(7, Math.floor(done / 3));
}

export function newMission(done: number, exclude: readonly MissionKind[], rng: () => number = Math.random): MissionState {
  const tier = tierFor(done);
  const pool = KINDS.filter((k) => !exclude.includes(k));
  const total = pool.reduce((s, k) => s + MISSION_DEFS[k].weight, 0);
  let r = rng() * total;
  let kind = pool[0];
  for (const k of pool) {
    r -= MISSION_DEFS[k].weight;
    if (r < 0) {
      kind = k;
      break;
    }
  }
  const def = MISSION_DEFS[kind];
  return { kind, goal: def.goals[Math.min(tier, def.goals.length - 1)], progress: 0, reward: 30 + tier * 15 };
}

export function ensureMissions(save: SaveData, rng: () => number = Math.random): void {
  while (save.missions.active.length < 3) {
    save.missions.active.push(newMission(save.missions.done, save.missions.active.map((m) => m.kind), rng));
  }
}

function valueFor(kind: MissionKind, r: RunSummary): number {
  switch (kind) {
    case 'popsRun':
    case 'popsTotal':
      return r.pops;
    case 'scoreRun':
      return r.score;
    case 'perfectStreak':
      return r.bestStreak;
    case 'goldTotal':
      return r.golds;
    case 'feverRun':
      return r.fevers;
    case 'games':
      return 1;
    case 'powerTotal':
      return r.powerups;
    case 'multReach':
      return r.maxMult;
    case 'daily':
      return r.mode === 'daily' ? 1 : 0;
  }
}

/** Apply a finished run. Completed missions are paid out, replaced, and returned for the results screen. */
export function applyRun(save: SaveData, r: RunSummary, rng: () => number = Math.random): MissionState[] {
  if (r.mode === 'zen') return [];
  const completed: MissionState[] = [];
  for (const m of save.missions.active) {
    const v = valueFor(m.kind, r);
    m.progress = MISSION_DEFS[m.kind].total ? m.progress + v : Math.max(m.progress, v);
    if (m.progress >= m.goal) completed.push(m);
  }
  for (const m of completed) {
    save.coins += m.reward;
    save.missions.done++;
    save.missions.active.splice(save.missions.active.indexOf(m), 1);
  }
  ensureMissions(save, rng);
  return completed;
}

export function coinsForRun(r: RunSummary): number {
  if (r.mode === 'zen') return Math.floor(r.pops / 5);
  return r.pops + r.bonusCoins;
}

export function goalProgress(goal: GoalId, save: SaveData): [number, number] {
  switch (goal) {
    case 'games3':
      return [save.legacyBest > 0 ? 3 : Math.min(3, save.stats.games), 3];
    case 'score150':
      return [Math.min(150, Math.max(save.best.classic, save.best.daily)), 150];
    case 'fevers10':
      return [Math.min(10, save.stats.fevers), 10];
    case 'daily5':
      return [Math.min(5, save.daily.bestStreak), 5];
  }
}

/** Grant goal-locked skins whose goal is now met; returns the new ones. */
export function unlockGoals(save: SaveData): Skin[] {
  const out: Skin[] = [];
  for (const s of SKINS) {
    if (s.unlock.kind !== 'goal' || save.owned.includes(s.id)) continue;
    const [have, need] = goalProgress(s.unlock.goal, save);
    if (have >= need) {
      save.owned.push(s.id);
      out.push(s);
    }
  }
  return out;
}

export function giftAmount(streak: number): number {
  return 25 + 15 * Math.min(Math.max(streak, 1) - 1, 6);
}

export const REVIVE_COST = 50;
