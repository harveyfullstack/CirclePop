import { clamp, dist, TAU } from '../core/math';
import { mulberry32, pick, type Rng } from '../core/rng';
import * as D from './difficulty';
import type { DeathCause, Field, GameEvent, ModeId, PowerKind, Quality, Target, TargetKind } from './types';

export type SessionState = 'ready' | 'playing' | 'dead';

/** Seconds a retired target takes to fade out. */
export const DIE_TIME = 0.28;

export interface SessionConfig {
  mode: ModeId;
  seed: number;
  best: number;
  tuning?: D.Tuning;
}

export interface RunSummary {
  mode: ModeId;
  score: number;
  pops: number;
  perfects: number;
  golds: number;
  powerups: number;
  fevers: number;
  bestStreak: number;
  maxMult: number;
  elapsed: number;
  bonusCoins: number;
  history: string;
  cause: DeathCause | null;
  revived: boolean;
}

/** Touch radius: generous for things you want to tap, strict for bombs. */
export function hitRadius(t: Target, u: number): number {
  return t.kind === 'bomb' ? t.r * 0.78 : t.r * 1.2 + 6 * u;
}

export class Session {
  readonly mode: ModeId;
  readonly rules: D.Rules;
  readonly tuning: D.Tuning;
  field: Field;
  private readonly emit: (e: GameEvent) => void;
  /** Decides what spawns (kept separate from positions so screen size can't change the sequence). */
  private readonly rngType: Rng;
  private readonly rngPos: Rng;
  /** FEVER has its own stream: how long you stay in FEVER must not reshuffle the daily's later waves. */
  private readonly rngFever: Rng;
  private nextId = 1;

  state: SessionState = 'ready';
  targets: Target[] = [];

  score = 0;
  pops = 0;
  perfects = 0;
  golds = 0;
  powerups = 0;
  fevers = 0;
  streak = 0;
  bestStreak = 0;
  mult = 1;
  maxMult = 1;
  feverMeter = 0;
  feverTime = 0;
  timeLeft = 1;
  timeMax = 1;
  /** After a revive the timer waits for the next pop. */
  grace = false;
  /** Seconds during which misses are forgiven (just after FEVER ends). */
  missGrace = 0;
  /** Where the last pop happened, so an accidental second tap on it is not a miss. */
  private recentPop = { x: 0, y: 0, r: 0, t: -1 };
  shield = false;
  slowTime = 0;
  doubleTime = 0;
  elapsed = 0;
  bonusCoins = 0;
  best: number;
  beatBest = false;
  revived = false;
  deathCause: DeathCause | null = null;
  lastX: number;
  lastY: number;
  /** One char per pop: p = perfect, g = good, o = gold. */
  history = '';

  constructor(cfg: SessionConfig, field: Field, emit: (e: GameEvent) => void) {
    this.mode = cfg.mode;
    this.rules = D.RULES[cfg.mode];
    this.tuning = cfg.tuning ?? (cfg.mode === 'zen' ? D.ZEN_TUNING : D.BASE_TUNING);
    this.best = cfg.best;
    this.field = field;
    this.emit = emit;
    this.rngType = mulberry32(cfg.seed);
    this.rngPos = mulberry32((cfg.seed ^ 0x9e3779b9) >>> 0);
    this.rngFever = mulberry32((cfg.seed ^ 0x85ebca6b) >>> 0);
    this.lastX = field.cx;
    this.lastY = field.cy;
    this.addTarget('normal', field.cx, field.cy, D.READY_RADIUS * field.u, true);
  }

  get feverActive(): boolean {
    return this.feverTime > 0;
  }

  /** Remaining time as a 0..1 fraction (1 when the timer does not apply). */
  get timerFrac(): number {
    if (!this.rules.timer || this.feverActive || this.state === 'ready') return 1;
    return clamp(this.timeLeft / this.timeMax, 0, 1);
  }

  get perfectRate(): number {
    return this.pops ? this.perfects / this.pops : 0;
  }

  tap(x: number, y: number): void {
    if (this.state === 'dead') return;
    const hit = this.hitTest(x, y);
    if (this.state === 'ready') {
      if (hit && (hit.kind === 'normal' || hit.kind === 'gold')) {
        this.state = 'playing';
        this.emit({ type: 'start' });
        this.popTarget(hit, x, y);
      }
      return;
    }
    if (!hit) {
      if (!this.forgivable(x, y)) this.onMiss(x, y);
    } else if (hit.kind === 'bomb') this.onBomb(hit);
    else if (hit.kind === 'power') this.collectPower(hit);
    else this.popTarget(hit, x, y);
  }

  /** A tap on something that is fading away, or a double tap on the circle just popped, is not a miss. */
  private forgivable(x: number, y: number): boolean {
    const u = this.field.u;
    const rp = this.recentPop;
    if (rp.t >= 0 && this.elapsed - rp.t < 0.18 && dist(x, y, rp.x, rp.y) <= rp.r * 1.2 + 6 * u) return true;
    for (const t of this.targets) {
      if (t.dying > 0 && dist(x, y, t.x, t.y) <= Math.max(t.r, hitRadius(t, u))) return true;
    }
    return false;
  }

  /** Poppable targets win over power-ups, which win over bombs. */
  hitTest(x: number, y: number): Target | null {
    const u = this.field.u;
    let best: Target | null = null;
    let bestD = Infinity;
    for (const t of this.targets) {
      if (t.dying || (t.kind !== 'normal' && t.kind !== 'gold')) continue;
      const d = dist(x, y, t.x, t.y) / hitRadius(t, u);
      if (d <= 1 && d < bestD) {
        best = t;
        bestD = d;
      }
    }
    if (best) return best;
    for (const kind of ['power', 'bomb'] as const) {
      for (const t of this.targets) {
        if (!t.dying && t.kind === kind && dist(x, y, t.x, t.y) <= hitRadius(t, u)) return t;
      }
    }
    return null;
  }

  update(dt: number): void {
    const f = this.field;
    const playing = this.state === 'playing';
    const slow = this.slowTime > 0 ? 0.55 : 1;
    for (let i = this.targets.length - 1; i >= 0; i--) {
      const t = this.targets[i];
      t.age += dt;
      if (t.dying > 0) {
        t.dying += dt;
        if (t.dying >= DIE_TIME) this.targets.splice(i, 1);
        continue;
      }
      if (!playing) continue;
      if (t.vx !== 0 || t.vy !== 0) {
        const m = t.r * 1.05;
        t.x += t.vx * dt * slow;
        t.y += t.vy * dt * slow;
        if (t.x < f.left + m) {
          t.x = f.left + m;
          t.vx = Math.abs(t.vx);
        } else if (t.x > f.right - m) {
          t.x = f.right - m;
          t.vx = -Math.abs(t.vx);
        }
        if (t.y < f.top + m) {
          t.y = f.top + m;
          t.vy = Math.abs(t.vy);
        } else if (t.y > f.bottom - m) {
          t.y = f.bottom - m;
          t.vy = -Math.abs(t.vy);
        }
      }
      if (t.life !== Infinity) {
        t.life -= dt;
        if (t.life <= 0) {
          t.dying = 1e-6;
          this.emit({ type: 'expire', target: t });
        }
      }
    }
    if (!playing) return;
    this.elapsed += dt;
    if (this.missGrace > 0) this.missGrace = Math.max(0, this.missGrace - dt);
    if (this.slowTime > 0) this.slowTime = Math.max(0, this.slowTime - dt);
    if (this.doubleTime > 0) this.doubleTime = Math.max(0, this.doubleTime - dt);
    if (this.feverTime > 0) {
      this.feverTime -= dt;
      this.feverMeter = Math.max(0, this.feverTime / D.FEVER_DURATION);
      if (this.feverTime <= 0) this.endFever();
    } else if (this.rules.timer && !this.grace) {
      this.timeLeft -= dt * slow;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.onTimeout();
      }
    }
  }

  /** Re-layout after a resize: keep targets at the same relative spot inside the new field. */
  setField(field: Field): void {
    const old = this.field;
    this.field = field;
    for (const t of this.targets) {
      if (this.state === 'ready' && t.main) {
        t.x = field.cx;
        t.y = field.cy;
        t.r = D.READY_RADIUS * field.u;
        continue;
      }
      t.x = field.left + ((t.x - old.left) / Math.max(1, old.right - old.left)) * (field.right - field.left);
      t.y = field.top + ((t.y - old.top) / Math.max(1, old.bottom - old.top)) * (field.bottom - field.top);
      t.x = clamp(t.x, field.left + t.r, Math.max(field.left + t.r, field.right - t.r));
      t.y = clamp(t.y, field.top + t.r, Math.max(field.top + t.r, field.bottom - t.r));
    }
    this.lastX = clamp(this.lastX, field.left, field.right);
    this.lastY = clamp(this.lastY, field.top, field.bottom);
  }

  canRevive(): boolean {
    return this.state === 'dead' && !this.revived && this.deathCause !== null && this.deathCause !== 'quit';
  }

  revive(): void {
    if (!this.canRevive()) return;
    this.revived = true;
    this.state = 'playing';
    this.deathCause = null;
    this.streak = 0;
    this.mult = 1;
    this.retire('bomb');
    if (!this.targets.some((t) => t.main && !t.dying)) this.spawnWave(this.lastX, this.lastY);
    this.timeMax = Math.max(this.timeMax, 1.4);
    this.timeLeft = this.timeMax;
    this.grace = true;
    this.emit({ type: 'revive' });
  }

  /** End a run voluntarily (Zen). */
  finish(): void {
    if (this.state === 'dead') return;
    this.state = 'dead';
    this.deathCause = 'quit';
  }

  summary(): RunSummary {
    return {
      mode: this.mode,
      score: this.score,
      pops: this.pops,
      perfects: this.perfects,
      golds: this.golds,
      powerups: this.powerups,
      fevers: this.fevers,
      bestStreak: this.bestStreak,
      maxMult: this.maxMult,
      elapsed: this.elapsed,
      bonusCoins: this.bonusCoins,
      history: this.history,
      cause: this.deathCause,
      revived: this.revived,
    };
  }

  // ---------------------------------------------------------------------------

  private popTarget(t: Target, tapX: number, tapY: number): void {
    const u = this.field.u;
    const perfect = dist(tapX, tapY, t.x, t.y) <= t.r * D.PERFECT_FRAC + 3 * u;
    const quality: Quality = perfect ? 'perfect' : 'good';
    const gold = t.kind === 'gold';
    const fever = this.feverActive;
    this.pops++;
    if (perfect) {
      this.streak++;
      this.perfects++;
      if (this.streak > this.bestStreak) this.bestStreak = this.streak;
    } else if (!fever) {
      if (this.streak >= 3) this.emit({ type: 'streakLost', streak: this.streak });
      this.streak = 0;
    }
    const mult = D.multForStreak(this.streak);
    const multUp = mult > this.mult;
    this.mult = mult;
    if (mult > this.maxMult) this.maxMult = mult;

    const base = gold ? 5 : perfect ? 2 : 1;
    const points = base * mult * (this.doubleTime > 0 ? 2 : 1) * (fever ? 2 : 1);
    this.score += points;
    if (gold) {
      this.golds++;
      this.bonusCoins += 3;
    }
    this.history += gold ? 'o' : perfect ? 'p' : 'g';
    this.grace = false;
    // Where the finger actually is: new bombs keep clear of it.
    this.lastX = tapX;
    this.lastY = tapY;
    this.recentPop = { x: t.x, y: t.y, r: t.r, t: this.elapsed };
    this.removeTarget(t);

    this.emit({ type: 'pop', target: t, quality, points, mult, streak: this.streak, tapX, tapY, fever });
    if (multUp) this.emit({ type: 'mult', mult });
    if (!this.beatBest && this.best > 0 && this.score > this.best) {
      this.beatBest = true;
      this.emit({ type: 'newBest', score: this.score });
    }

    let feverNow = false;
    if (this.rules.fever && !fever) {
      // Epsilon: ten gains of 0.1 sum to 0.9999999999999999.
      this.feverMeter = Math.min(1, this.feverMeter + D.feverGain(gold ? 'gold' : quality) + 1e-9);
      feverNow = this.feverMeter >= 1 - 1e-6;
    }
    if (feverNow) this.startFever(tapX, tapY);
    else if (this.feverActive) this.spawnFeverTarget(tapX, tapY);
    else if (t.main) this.spawnWave(tapX, tapY);
  }

  private onMiss(x: number, y: number): void {
    if (this.feverActive || this.missGrace > 0) {
      this.emit({ type: 'miss', x, y });
      return;
    }
    if (!this.rules.missKills) {
      if (this.streak >= 3) this.emit({ type: 'streakLost', streak: this.streak });
      this.streak = 0;
      this.mult = 1;
      this.emit({ type: 'miss', x, y });
      return;
    }
    if (this.shield) {
      this.shield = false;
      this.emit({ type: 'shieldSave', cause: 'miss', x, y });
      return;
    }
    this.die('miss', x, y);
  }

  private onBomb(b: Target): void {
    this.removeTarget(b);
    if (this.shield) {
      this.shield = false;
      this.emit({ type: 'shieldSave', cause: 'bomb', x: b.x, y: b.y });
      return;
    }
    this.die('bomb', b.x, b.y);
  }

  private onTimeout(): void {
    const main = this.targets.find((t) => t.main && !t.dying);
    const x = main ? main.x : this.lastX;
    const y = main ? main.y : this.lastY;
    if (this.shield) {
      this.shield = false;
      this.timeLeft = this.timeMax * 0.75;
      this.emit({ type: 'shieldSave', cause: 'timeout', x, y });
      return;
    }
    this.die('timeout', x, y);
  }

  private die(cause: DeathCause, x: number, y: number): void {
    this.state = 'dead';
    this.deathCause = cause;
    this.emit({ type: 'death', cause, x, y });
  }

  private collectPower(t: Target): void {
    this.removeTarget(t);
    this.powerups++;
    const kind = t.power ?? 'shield';
    if (kind === 'shield') this.shield = true;
    else if (kind === 'slow') this.slowTime = D.SLOW_TIME;
    else this.doubleTime = D.DOUBLE_TIME;
    this.emit({ type: 'power', kind, x: t.x, y: t.y });
  }

  private startFever(fromX: number, fromY: number): void {
    this.feverTime = D.FEVER_DURATION;
    this.feverMeter = 1;
    this.fevers++;
    this.bonusCoins += 5;
    this.retire('bomb');
    this.emit({ type: 'feverStart' });
    for (let i = 0; i < 3 && this.liveMains() < 2; i++) this.spawnFeverTarget(fromX, fromY);
  }

  private endFever(): void {
    this.feverTime = 0;
    this.feverMeter = 0;
    // A finger may already be on its way to the circle that disappears: forgive misses briefly.
    this.missGrace = 0.5;
    // Keep the circle that has been on screen longest; it is the one most likely being reached for.
    const mains = this.targets.filter((t) => t.main && !t.dying).sort((a, b) => a.id - b.id);
    for (let i = 1; i < mains.length; i++) mains[i].dying = 1e-6;
    if (mains.length) this.setTimer(this.lastX, this.lastY, mains[0].x, mains[0].y, false, mains[0].kind === 'gold');
    else this.spawnWave(this.lastX, this.lastY);
    this.emit({ type: 'feverEnd' });
  }

  private spawnFeverTarget(fromX: number, fromY: number): void {
    const u = this.field.u;
    const gold = this.rngFever() < 0.12;
    const r = D.targetRadius(this.pops) * this.tuning.sizeScale * u * (gold ? 0.9 : 1);
    const [x, y] = this.findSpot(r * 1.2 + 6 * u, fromX, fromY, r * 2.2, this.rngFever);
    this.addTarget(gold ? 'gold' : 'normal', x, y, r, true);
  }

  private spawnWave(fromX: number, fromY: number): void {
    const n = this.pops;
    const T = this.tuning;
    const u = this.field.u;
    const rt = this.rngType;
    this.retire('bomb');
    // Always consume the same number of type rolls so the daily sequence stays stable.
    const gold = rt() < D.goldChance(n) * T.goldRate;
    const moving = this.rules.moving && rt() < D.moveChance(n, T);
    const bombs = this.rules.hazards ? D.bombCount(n, rt(), T) : 0;
    const powerRoll = rt();
    const powerKind = pick(rt, D.POWERS);

    const r = D.targetRadius(n) * T.sizeScale * u * (gold ? 0.9 : 1);
    const minFrom = Math.max(r * 2.4, Math.min(this.field.w, this.field.h) * 0.2);
    const [x, y] = this.findSpot(r * 1.2 + 6 * u, fromX, fromY, minFrom);
    const t = this.addTarget(gold ? 'gold' : 'normal', x, y, r, true);
    if (moving) {
      const a = this.rngPos() * TAU;
      const sp = D.moveSpeed(n) * u;
      t.vx = Math.cos(a) * sp;
      t.vy = Math.sin(a) * sp;
    }
    this.setTimer(fromX, fromY, x, y, moving, gold);
    for (let i = 0; i < bombs; i++) this.spawnBomb(t, fromX, fromY);
    const hasPower = this.targets.some((p) => p.kind === 'power' && !p.dying);
    if (this.rules.powerups && n >= D.POWER_START && !hasPower && powerRoll < D.POWER_CHANCE * T.powerRate) {
      this.spawnPower(powerKind, fromX, fromY);
    }
  }

  private setTimer(fromX: number, fromY: number, x: number, y: number, moving: boolean, gold: boolean): void {
    const f = this.field;
    const n = this.pops;
    const diag = Math.hypot(f.right - f.left, f.bottom - f.top) || 1;
    const dFrac = clamp(dist(fromX, fromY, x, y) / diag, 0, 1);
    let limit = D.timeLimit(n) * this.tuning.timeScale * (0.82 + 0.45 * dFrac);
    if (moving) limit *= 1.12;
    if (gold) limit *= 0.9;
    if (n < 3) limit *= 1.35;
    this.timeMax = this.timeLeft = limit;
  }

  /** Bombs prefer the path between the last pop and the new target, but never under the finger. */
  private spawnBomb(main: Target, fromX: number, fromY: number): void {
    const f = this.field;
    const u = f.u;
    const rng = this.rngPos;
    const rb = D.bombRadius(this.pops) * u;
    const m = rb * 1.25 + 4 * u;
    const x0 = f.left + m;
    const x1 = Math.max(x0, f.right - m);
    const y0 = f.top + m;
    const y1 = Math.max(y0, f.bottom - m);
    const dx = main.x - fromX;
    const dy = main.y - fromY;
    const len = Math.hypot(dx, dy) || 1;
    for (let i = 0; i < 18; i++) {
      let x: number;
      let y: number;
      if (i < 8) {
        const s = 0.3 + 0.45 * rng();
        const off = (rng() - 0.5) * Math.max(main.r * 5, 140 * u);
        x = fromX + dx * s - (dy / len) * off;
        y = fromY + dy * s + (dx / len) * off;
      } else {
        x = x0 + (x1 - x0) * rng();
        y = y0 + (y1 - y0) * rng();
      }
      x = clamp(x, x0, x1);
      y = clamp(y, y0, y1);
      if (dist(x, y, fromX, fromY) < rb + 46 * u) continue;
      let ok = true;
      for (const t of this.targets) {
        if (t.dying) continue;
        const need = t.kind === 'bomb' ? t.r + rb + 10 * u : hitRadius(t, u) + rb + 18 * u;
        if (dist(x, y, t.x, t.y) < need) {
          ok = false;
          break;
        }
      }
      if (ok) {
        this.addTarget('bomb', x, y, rb, false);
        return;
      }
    }
  }

  private spawnPower(kind: PowerKind, fromX: number, fromY: number): void {
    const u = this.field.u;
    const r = 27 * u;
    const [x, y] = this.findSpot(r * 1.2 + 6 * u, fromX, fromY, 60 * u);
    const t = this.addTarget('power', x, y, r, false);
    t.power = kind;
    t.life = t.maxLife = D.POWER_LIFE;
  }

  /** Random point for a circle with hit radius `hr`, away from `from` and every live target. */
  private findSpot(hr: number, fromX: number, fromY: number, minFrom: number, rng: Rng = this.rngPos): [number, number] {
    const f = this.field;
    const u = f.u;
    const m = hr + 4 * u;
    const x0 = f.left + m;
    const x1 = Math.max(x0, f.right - m);
    const y0 = f.top + m;
    const y1 = Math.max(y0, f.bottom - m);
    let bx = (x0 + x1) / 2;
    let by = (y0 + y1) / 2;
    let bestScore = -Infinity;
    for (let i = 0; i < 16; i++) {
      const x = x0 + (x1 - x0) * rng();
      const y = y0 + (y1 - y0) * rng();
      let score = dist(x, y, fromX, fromY) - minFrom;
      for (const t of this.targets) {
        if (t.dying) continue;
        score = Math.min(score, dist(x, y, t.x, t.y) - hitRadius(t, u) - hr - 10 * u);
      }
      if (score >= 0) return [x, y];
      if (score > bestScore) {
        bestScore = score;
        bx = x;
        by = y;
      }
    }
    return [bx, by];
  }

  private liveMains(): number {
    let n = 0;
    for (const t of this.targets) if (t.main && !t.dying) n++;
    return n;
  }

  private retire(kind: TargetKind): void {
    for (const t of this.targets) if (t.kind === kind && !t.dying) t.dying = 1e-6;
  }

  private addTarget(kind: TargetKind, x: number, y: number, r: number, main: boolean): Target {
    const id = this.nextId++;
    const t: Target = {
      id,
      kind,
      power: null,
      x,
      y,
      vx: 0,
      vy: 0,
      r,
      age: 0,
      life: Infinity,
      maxLife: Infinity,
      main,
      dying: 0,
      seed: (id * 2.399) % TAU,
    };
    this.targets.push(t);
    this.emit({ type: 'spawn', target: t });
    return t;
  }

  private removeTarget(t: Target): void {
    const i = this.targets.indexOf(t);
    if (i >= 0) this.targets.splice(i, 1);
  }
}
