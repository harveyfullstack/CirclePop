import { describe, expect, it } from 'vitest';
import type { RunSummary } from '../src/game/session';
import { dailyModifier, dailyNumber, dailySeed, dailyTuning, dateKey, daysBetween, DAILY_EPOCH } from '../src/meta/daily';
import { applyRun, coinsForRun, ensureMissions, giftAmount, goalProgress, newMission, unlockGoals } from '../src/meta/missions';
import { defaultSave, sanitize } from '../src/meta/save';
import { emojiRow, shareText } from '../src/meta/share';
import { SKINS, skinById } from '../src/meta/skins';

function run(p: Partial<RunSummary> = {}): RunSummary {
  return {
    mode: 'classic',
    score: 0,
    pops: 0,
    perfects: 0,
    golds: 0,
    powerups: 0,
    fevers: 0,
    bestStreak: 0,
    maxMult: 1,
    elapsed: 10,
    bonusCoins: 0,
    history: '',
    cause: 'miss',
    revived: false,
    ...p,
  };
}

/** Deterministic rng for tests. */
const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length];
};

describe('save', () => {
  it('turns garbage into a valid default save', () => {
    for (const junk of [null, undefined, 42, 'x', [], { coins: 'lots', skin: 99, owned: 'all', missions: { active: [{ kind: 'nope' }] } }]) {
      const s = sanitize(junk);
      expect(s.v).toBe(2);
      expect(s.coins).toBe(0);
      expect(s.skin).toBe('neon');
      expect(s.owned).toContain('neon');
      expect(s.missions.active).toEqual([]);
    }
  });

  it('keeps valid data, drops unknown skins and never equips an unowned skin', () => {
    const s = sanitize({ coins: 321.7, owned: ['bubbles', 'hacker-skin', 'og'], skin: 'cosmic', best: { classic: 88 }, settings: { music: false } });
    expect(s.coins).toBe(321);
    expect(s.owned.sort()).toEqual(['bubbles', 'neon', 'og']);
    expect(s.skin).toBe('neon');
    expect(s.best.classic).toBe(88);
    expect(s.settings.music).toBe(false);
    expect(s.settings.sfx).toBe(true);
  });

  it('clamps negative or non-finite numbers', () => {
    const s = sanitize({ coins: -50, best: { classic: Infinity }, stats: { games: NaN } });
    expect(s.coins).toBe(0);
    expect(s.best.classic).toBe(0);
    expect(s.stats.games).toBe(0);
  });
});

describe('missions', () => {
  it('always keeps three distinct missions', () => {
    const save = defaultSave();
    ensureMissions(save);
    expect(save.missions.active).toHaveLength(3);
    expect(new Set(save.missions.active.map((m) => m.kind)).size).toBe(3);
  });

  it('pays out completed missions and replaces them', () => {
    const save = defaultSave();
    save.missions.active = [
      { kind: 'popsRun', goal: 15, progress: 0, reward: 30 },
      { kind: 'games', goal: 3, progress: 2, reward: 30 },
      { kind: 'goldTotal', goal: 5, progress: 1, reward: 30 },
    ];
    const done = applyRun(save, run({ pops: 20, golds: 2 }), seq(0.1, 0.5, 0.9));
    expect(done.map((m) => m.kind).sort()).toEqual(['games', 'popsRun']);
    expect(save.coins).toBe(60);
    expect(save.missions.done).toBe(2);
    expect(save.missions.active).toHaveLength(3);
    const gold = save.missions.active.find((m) => m.kind === 'goldTotal');
    expect(gold?.progress).toBe(3); // cumulative
  });

  it('single-run missions track the best run, not the sum', () => {
    const save = defaultSave();
    save.missions.active = [{ kind: 'scoreRun', goal: 100, progress: 0, reward: 30 }];
    applyRun(save, run({ score: 60 }));
    applyRun(save, run({ score: 50 }));
    expect(save.missions.active.find((m) => m.kind === 'scoreRun')?.progress).toBe(60);
  });

  it('zen runs do not count', () => {
    const save = defaultSave();
    ensureMissions(save);
    const before = JSON.stringify(save.missions);
    expect(applyRun(save, run({ mode: 'zen', pops: 500, score: 9999 }))).toEqual([]);
    expect(JSON.stringify(save.missions)).toBe(before);
  });

  it('missions get harder and pay more as you complete them', () => {
    const easy = newMission(0, [], () => 0);
    const hard = newMission(30, [], () => 0);
    expect(hard.kind).toBe(easy.kind);
    expect(hard.goal).toBeGreaterThan(easy.goal);
    expect(hard.reward).toBeGreaterThan(easy.reward);
  });
});

describe('economy', () => {
  it('coins scale with pops, zen pays less', () => {
    expect(coinsForRun(run({ pops: 40, bonusCoins: 11 }))).toBe(51);
    expect(coinsForRun(run({ mode: 'zen', pops: 40 }))).toBe(8);
  });

  it('daily gift grows with the streak and caps', () => {
    expect(giftAmount(1)).toBe(25);
    expect(giftAmount(2)).toBe(40);
    expect(giftAmount(7)).toBe(giftAmount(30));
  });

  it('goal skins unlock when their goal is met', () => {
    const save = defaultSave();
    expect(unlockGoals(save)).toEqual([]);
    save.stats.games = 3;
    save.best.classic = 151;
    const got = unlockGoals(save).map((s) => s.id);
    expect(got).toEqual(expect.arrayContaining(['og', 'midas']));
    expect(unlockGoals(save)).toEqual([]);
    expect(goalProgress('fevers10', save)).toEqual([0, 10]);
  });

  it('every skin has a way to be unlocked and a unique id', () => {
    const ids = SKINS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(SKINS.filter((s) => s.unlock.kind === 'free')).toHaveLength(1);
    expect(skinById('nope').id).toBe('neon');
  });
});

describe('daily', () => {
  it('numbers days from launch and is stable per date', () => {
    expect(dailyNumber(DAILY_EPOCH)).toBe(1);
    expect(dailyNumber('2026-10-23')).toBe(31);
    expect(dailySeed('2026-10-01')).toBe(dailySeed('2026-10-01'));
    expect(dailySeed('2026-10-01')).not.toBe(dailySeed('2026-10-02'));
    expect(dailyModifier('2026-10-05').id).toBe(dailyModifier('2026-10-05').id);
    expect(dailyTuning('2026-10-05').timeScale).toBeGreaterThan(0);
  });

  it('counts days across month and year boundaries', () => {
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1);
    expect(daysBetween('', '2026-01-01')).toBe(Infinity);
    expect(dateKey(new Date(2026, 8, 3))).toBe('2026-09-03');
  });
});

describe('share', () => {
  it('builds a compact, spoiler-free summary', () => {
    expect(emojiRow('')).toBe('');
    const row = emojiRow('pppppppppp' + 'gggggggggg' + 'ppgpg');
    expect([...row].filter((c) => c === '💥')).toHaveLength(1);
    const text = shareText({
      score: 321,
      isBest: true,
      mode: 'daily',
      pops: 40,
      perfectPct: 55,
      maxMult: 4,
      fevers: 1,
      history: 'ppgpo',
      dailyNo: 7,
      dailyName: 'Hyper',
      skin: skinById('neon'),
    });
    expect(text).toContain('Daily #7');
    expect(text).toContain('321');
    expect(text).toContain('new best');
  });
});
