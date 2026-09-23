export type ModeId = 'classic' | 'daily' | 'zen';
export type TargetKind = 'normal' | 'gold' | 'bomb' | 'power';
export type PowerKind = 'shield' | 'slow' | 'double';
export type Quality = 'perfect' | 'good';
export type DeathCause = 'miss' | 'bomb' | 'timeout' | 'quit';

export interface Target {
  id: number;
  kind: TargetKind;
  power: PowerKind | null;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Base radius in CSS pixels (hit tests use this, never the animated visual radius). */
  r: number;
  age: number;
  /** Remaining lifetime in seconds; Infinity for targets that live until popped. */
  life: number;
  maxLife: number;
  /** Popping a main target spawns the next wave and refills the timer. */
  main: boolean;
  /** 0 while alive; otherwise seconds spent fading out (not hittable). */
  dying: number;
  /** Cosmetic phase offset. */
  seed: number;
}

/** Playable area in CSS pixels. Target centres are kept inside the rect (minus their radius). */
export interface Field {
  w: number;
  h: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  /** Where the "tap to start" circle sits. */
  cx: number;
  cy: number;
  /** Size unit: 1u ≈ 1px on a ~400px wide phone. */
  u: number;
}

export type GameEvent =
  | { type: 'start' }
  | {
      type: 'pop';
      target: Target;
      quality: Quality;
      points: number;
      mult: number;
      streak: number;
      tapX: number;
      tapY: number;
      fever: boolean;
    }
  | { type: 'mult'; mult: number }
  | { type: 'streakLost'; streak: number }
  | { type: 'spawn'; target: Target }
  | { type: 'expire'; target: Target }
  | { type: 'power'; kind: PowerKind; x: number; y: number }
  | { type: 'shieldSave'; cause: DeathCause; x: number; y: number }
  | { type: 'miss'; x: number; y: number }
  | { type: 'feverStart' }
  | { type: 'feverEnd' }
  | { type: 'newBest'; score: number }
  | { type: 'death'; cause: DeathCause; x: number; y: number }
  | { type: 'revive' };
