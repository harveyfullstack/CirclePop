import { describe, expect, it } from 'vitest';
import { Session, hitRadius } from '../src/game/session';
import * as D from '../src/game/difficulty';
import type { Field, GameEvent, Target } from '../src/game/types';

function field(w = 400, h = 800): Field {
  return { w, h, left: 8, right: w - 8, top: 90, bottom: h - 16, cx: w / 2, cy: h * 0.52, u: 1 };
}

function make(opts: Partial<{ mode: 'classic' | 'daily' | 'zen'; seed: number; best: number; tuning: D.Tuning }> = {}) {
  const events: GameEvent[] = [];
  const s = new Session(
    { mode: opts.mode ?? 'classic', seed: opts.seed ?? 42, best: opts.best ?? 0, tuning: opts.tuning },
    field(),
    (e) => events.push(e),
  );
  return { s, events };
}

const mains = (s: Session): Target[] => s.targets.filter((t) => t.main && !t.dying);
const bombs = (s: Session): Target[] => s.targets.filter((t) => t.kind === 'bomb' && !t.dying);

/** Tap the centre of the first live main target. */
function popMain(s: Session, offset = 0): Target {
  const t = mains(s)[0];
  s.tap(t.x + offset, t.y);
  return t;
}

describe('Session basics', () => {
  it('ignores misses before the first pop and starts on the circle', () => {
    const { s, events } = make();
    s.tap(1, 1);
    expect(s.state).toBe('ready');
    popMain(s);
    expect(s.state).toBe('playing');
    expect(events.some((e) => e.type === 'start')).toBe(true);
    expect(s.pops).toBe(1);
    expect(s.score).toBe(2); // perfect: base 2 × mult 1
    expect(mains(s)).toHaveLength(1);
  });

  it('dies on a miss in classic', () => {
    const { s, events } = make();
    popMain(s);
    const t = mains(s)[0];
    // far away from everything
    const x = t.x < 200 ? 380 : 20;
    const y = t.y < 400 ? 780 : 100;
    s.tap(x, y);
    expect(s.state).toBe('dead');
    expect(s.deathCause).toBe('miss');
    expect(events.some((e) => e.type === 'death')).toBe(true);
  });

  it('dies when the timer runs out', () => {
    const { s } = make();
    popMain(s);
    for (let i = 0; i < 400 && s.state === 'playing'; i++) s.update(1 / 60);
    expect(s.state).toBe('dead');
    expect(s.deathCause).toBe('timeout');
  });

  it('good hits break the perfect streak and reset the multiplier', () => {
    const { s } = make();
    for (let i = 0; i < 6; i++) popMain(s);
    expect(s.streak).toBe(6);
    expect(s.mult).toBe(3);
    const t = mains(s)[0];
    s.tap(t.x + t.r * 0.9, t.y); // inside the ring but off-centre
    expect(s.state).toBe('playing');
    expect(s.streak).toBe(0);
    expect(s.mult).toBe(1);
  });

  it('zen never ends on a miss', () => {
    const { s } = make({ mode: 'zen' });
    popMain(s);
    s.tap(1, 1);
    s.tap(399, 799);
    for (let i = 0; i < 600; i++) s.update(1 / 60);
    expect(s.state).toBe('playing');
  });
});

describe('Fever', () => {
  it('triggers after exactly ten perfects, doubles targets, forgives misses, then ends', () => {
    const { s, events } = make({ tuning: { ...D.BASE_TUNING, bombStart: 999, powerRate: 0, goldRate: 0 } });
    for (let i = 0; i < 9; i++) popMain(s);
    expect(s.feverActive).toBe(false);
    popMain(s);
    expect(events.some((e) => e.type === 'feverStart')).toBe(true);
    expect(s.feverActive).toBe(true);
    expect(mains(s).length).toBe(2);
    s.tap(1, 1); // harmless during fever
    expect(s.state).toBe('playing');
    const before = s.score;
    popMain(s);
    expect(s.score - before).toBeGreaterThanOrEqual(2 * 2); // fever doubles points
    expect(mains(s).length).toBe(2);
    for (let i = 0; i < Math.ceil(D.FEVER_DURATION * 60) + 5; i++) s.update(1 / 60);
    expect(s.feverActive).toBe(false);
    expect(events.some((e) => e.type === 'feverEnd')).toBe(true);
    expect(mains(s).length).toBe(1);
    expect(s.state).toBe('playing');
  });

  it('ends fairly: tapping the circle that just vanished is not a death', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { s } = make({ seed, tuning: { ...D.BASE_TUNING, bombStart: 999, powerRate: 0, goldRate: 0 } });
      for (let i = 0; i < 10; i++) popMain(s);
      expect(s.feverActive).toBe(true);
      for (let i = 0; i < Math.ceil(D.FEVER_DURATION * 60) + 2 && s.feverActive; i++) s.update(1 / 60);
      const retired = s.targets.find((t) => t.main && t.dying > 0);
      expect(retired).toBeDefined();
      s.tap(retired!.x, retired!.y);
      expect(s.state).toBe('playing');
      s.update(0.3);
      s.tap(1, 1); // still inside the post-FEVER grace window
      expect(s.state).toBe('playing');
      s.update(0.5);
      s.tap(1, 1);
      expect(s.state).toBe('dead');
    }
  });
});

describe('Forgiveness', () => {
  it('an accidental double tap on the circle just popped is not a miss', () => {
    const { s } = make();
    popMain(s);
    const t = mains(s)[0];
    s.tap(t.x, t.y);
    s.update(0.05);
    s.tap(t.x + 3, t.y - 2); // the same finger bouncing
    expect(s.state).toBe('playing');
    s.update(0.3);
    s.tap(t.x, t.y); // much later, that spot is empty: a real miss
    expect(s.state).toBe('dead');
  });

  it('tapping a bomb or power-up while it fades out is harmless', () => {
    const { s } = make({ tuning: { ...D.BASE_TUNING, bombStart: 0, bombRate: 3 } });
    popMain(s);
    let guard = 0;
    while (bombs(s).length === 0 && guard++ < 50) popMain(s);
    const b = bombs(s)[0];
    popMain(s); // retires the bomb
    expect(b.dying).toBeGreaterThan(0);
    s.tap(b.x, b.y);
    expect(s.state).toBe('playing');
  });
});

describe('Hazards', () => {
  it('never places a bomb on top of the target or under the finger', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { s } = make({ seed, tuning: { ...D.BASE_TUNING, bombStart: 0, bombRate: 3 } });
      let lastX = s.field.cx;
      let lastY = s.field.cy;
      for (let i = 0; (i < 60 && s.state === 'playing') || i === 0; i++) {
        // Off-centre taps: the finger is not where the circle's centre was.
        const t = mains(s)[0];
        const ox = (i % 3 === 0 ? 1 : -1) * t.r * 0.9;
        s.tap(t.x + ox, t.y);
        lastX = t.x + ox;
        lastY = t.y;
        const main = mains(s)[0];
        for (const b of bombs(s)) {
          const d = Math.hypot(b.x - main.x, b.y - main.y);
          expect(d).toBeGreaterThan(hitRadius(main, 1) + b.r);
          expect(Math.hypot(b.x - lastX, b.y - lastY)).toBeGreaterThan(b.r + 40);
        }
        // keep fever from clearing the board so we check lots of waves
        s.feverMeter = 0;
      }
    }
  });

  it('bombs kill, shields save', () => {
    const { s } = make({ tuning: { ...D.BASE_TUNING, bombStart: 0, bombRate: 3 } });
    popMain(s);
    let guard = 0;
    while (bombs(s).length === 0 && guard++ < 50) popMain(s);
    const b = bombs(s)[0];
    expect(b).toBeDefined();
    s.shield = true;
    s.tap(b.x, b.y);
    expect(s.state).toBe('playing');
    expect(s.shield).toBe(false);
    guard = 0;
    while (bombs(s).length === 0 && guard++ < 50) popMain(s);
    const b2 = bombs(s)[0];
    s.tap(b2.x, b2.y);
    expect(s.state).toBe('dead');
    expect(s.deathCause).toBe('bomb');
  });

  it('revive restores play once with a grace period', () => {
    const { s } = make();
    popMain(s);
    s.tap(1, 1);
    expect(s.canRevive()).toBe(true);
    s.revive();
    expect(s.state).toBe('playing');
    expect(s.grace).toBe(true);
    for (let i = 0; i < 600; i++) s.update(1 / 60);
    expect(s.state).toBe('playing'); // timer frozen until the next pop
    popMain(s);
    s.tap(1, 1);
    expect(s.state).toBe('dead');
    expect(s.canRevive()).toBe(false);
  });
});

describe('Determinism', () => {
  it('same seed + same taps → same run', () => {
    const run = (seed: number) => {
      const { s } = make({ seed });
      const trace: string[] = [];
      for (let i = 0; i < 40 && (s.state !== 'dead'); i++) {
        const t = popMain(s, i % 4 === 0 ? 0.8 * mains(s)[0].r : 0);
        trace.push(`${t.kind}:${Math.round(t.x)},${Math.round(t.y)}`);
        s.update(0.2);
      }
      return trace.join('|') + '#' + s.score;
    };
    expect(run(7)).toBe(run(7));
    expect(run(7)).not.toBe(run(8));
  });
});

describe('Difficulty curves', () => {
  it('get harder monotonically and stay humane', () => {
    let prevT = Infinity;
    let prevR = Infinity;
    for (let n = 0; n <= 300; n += 5) {
      const t = D.timeLimit(n);
      const r = D.targetRadius(n);
      expect(t).toBeLessThanOrEqual(prevT);
      expect(r).toBeLessThanOrEqual(prevR);
      expect(t).toBeGreaterThan(0.6);
      expect(r).toBeGreaterThanOrEqual(30);
      prevT = t;
      prevR = r;
    }
    expect(D.multForStreak(0)).toBe(1);
    expect(D.multForStreak(3)).toBe(2);
    expect(D.multForStreak(1000)).toBe(D.MAX_MULT);
  });

  it('bomb counts ramp up', () => {
    expect(D.bombCount(5, 0, D.BASE_TUNING)).toBe(0);
    expect(D.bombCount(30, 0.01, D.BASE_TUNING)).toBeGreaterThanOrEqual(1);
    expect(D.bombCount(30, 0.99, D.BASE_TUNING)).toBe(0);
    expect(D.bombCount(200, 0.6, D.BASE_TUNING)).toBeGreaterThanOrEqual(2);
  });
});
