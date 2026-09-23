import { hsl } from '../core/color';
import { easeOutBack, TAU } from '../core/math';
import type { Session } from '../game/session';
import type { Skin } from '../meta/skins';
import { Background } from './background';
import { FONT, Floaters } from './floaters';
import { Fx } from './fx';
import { drawBigScore, drawTopHud, type HudView } from './hud';
import { Particles } from './particles';
import { Shake } from './shake';
import { drawTargets } from './targets';

export type Phase = 'home' | 'ready' | 'play' | 'paused' | 'dying' | 'revive' | 'results';

export interface Hint {
  text: string;
  x: number;
  y: number;
  alpha: number;
  color?: string;
  size?: number;
}

/** Everything the app feeds the renderer each frame. */
export interface ViewState {
  phase: Phase;
  beat: number;
  beatPhase: number;
  heat: number;
  fever: number;
  danger: number;
  slow: number;
  hud: number;
  dark: number;
  flash: number;
  flashColor: string;
  scoreBump: number;
  multBump: number;
  coinBump: number;
  coinsRun: number;
  best: number;
  hints: Hint[];
  countdown: number;
  countdownT: number;
}

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  w = 1;
  h = 1;
  dpr = 1;
  u = 1;
  safe = { top: 0, right: 0, bottom: 0, left: 0 };
  skin!: Skin;
  readonly bg = new Background();
  readonly particles = new Particles();
  readonly floaters = new Floaters();
  readonly shake = new Shake();
  readonly fx = new Fx(this.particles, this.floaters, this.shake);
  readonly view: ViewState = {
    phase: 'home',
    beat: 0,
    beatPhase: 0,
    heat: 0,
    fever: 0,
    danger: 0,
    slow: 0,
    hud: 0,
    dark: 0,
    flash: 0,
    flashColor: '#FFFFFF',
    scoreBump: 0,
    multBump: 0,
    coinBump: 0,
    coinsRun: 0,
    best: 0,
    hints: [],
    countdown: 0,
    countdownT: 0,
  };

  constructor(readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is not supported');
    this.ctx = ctx;
  }

  resize(w: number, h: number, dpr: number, safe: { top: number; right: number; bottom: number; left: number }): void {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.safe = safe;
    this.u = Math.min(1.7, Math.max(0.8, Math.min(w, h) / 400));
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.bg.resize(w, h);
    this.fx.u = this.u;
  }

  setSkin(skin: Skin): void {
    this.skin = skin;
    this.bg.setSkin(skin);
  }

  render(session: Session | null, time: number, dt: number): void {
    const { ctx, w, h, dpr, u, view: v, skin } = this;
    this.particles.update(dt);
    this.floaters.update(dt);
    this.shake.update(dt, u);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    this.bg.draw(ctx, time, dt, {
      beat: v.beat,
      beatPhase: v.beatPhase,
      pulse: v.phase === 'play',
      heat: v.heat,
      fever: v.fever,
      danger: v.danger,
      slow: v.slow,
      u,
    });
    this.bg.drawDanger(ctx, time, v.danger);

    const ox = this.shake.x;
    const oy = this.shake.y;
    ctx.setTransform(dpr, 0, 0, dpr, ox * dpr, oy * dpr);
    const hud: HudView = {
      w,
      h,
      u,
      safeTop: this.safe.top,
      time,
      alpha: v.hud,
      skin,
      scoreBump: v.scoreBump,
      multBump: v.multBump,
      coinBump: v.coinBump,
      coinsRun: v.coinsRun,
      best: v.best,
    };
    const inRun = v.phase === 'play' || v.phase === 'paused' || v.phase === 'dying' || v.phase === 'revive';
    if (session && inRun) drawBigScore(ctx, session, hud);
    if (session) {
      if (session.state === 'ready') this.drawRipple(session, time);
      drawTargets(ctx, session.targets, skin, {
        time,
        beat: v.beat,
        timerFrac: session.timerFrac,
        showTimer: session.rules.timer && session.state !== 'ready' && !session.feverActive,
        fever: session.feverActive,
      });
    }
    this.particles.draw(ctx, !skin.light, dpr, ox, oy);
    this.floaters.draw(ctx);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.bg.drawOverlay(ctx);
    this.drawHints(time);
    if (session && v.hud > 0.01) drawTopHud(ctx, session, hud);
    if (v.fever > 0.01) this.drawFeverFrame(time, v.fever);
    if (v.countdown > 0) this.drawCountdown();
    if (v.flash > 0.01) {
      ctx.globalAlpha = Math.min(1, v.flash);
      ctx.fillStyle = v.flashColor;
      ctx.fillRect(0, 0, w, h);
    }
    if (v.dark > 0.01) {
      ctx.globalAlpha = v.dark;
      ctx.fillStyle = skin.light ? 'rgba(20,20,40,0.45)' : 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.globalAlpha = 1;
  }

  /** "Tap me" rings around the start circle. */
  private drawRipple(s: Session, time: number): void {
    const t = s.targets.find((x) => x.main && !x.dying);
    if (!t) return;
    const { ctx } = this;
    const col = this.skin.rainbow ? hsl(time * 90, 100, 62) : this.skin.a;
    for (let i = 0; i < 2; i++) {
      const p = ((time + i * 0.8) % 1.6) / 1.6;
      ctx.globalAlpha = (1 - p) * 0.5;
      ctx.strokeStyle = col;
      ctx.lineWidth = 3 * this.u * (1 - p) + 0.5;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r * (1.05 + p * 0.9), 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private drawHints(time: number): void {
    const { ctx, u, skin } = this;
    for (const hint of this.view.hints) {
      if (hint.alpha <= 0.01) continue;
      const size = (hint.size ?? 17) * u;
      const bob = Math.sin(time * 4) * 3 * u;
      ctx.globalAlpha = hint.alpha;
      ctx.font = `700 ${size.toFixed(1)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = size * 0.28;
      ctx.strokeStyle = skin.light ? 'rgba(255,255,255,0.9)' : 'rgba(5,3,20,0.65)';
      ctx.strokeText(hint.text, hint.x, hint.y + bob);
      ctx.fillStyle = hint.color ?? skin.text;
      ctx.fillText(hint.text, hint.x, hint.y + bob);
    }
    ctx.globalAlpha = 1;
  }

  private drawFeverFrame(time: number, amount: number): void {
    const { ctx, w, h, u } = this;
    const g = ctx.createLinearGradient(0, 0, w, h);
    for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, hsl(time * 240 + i * 60, 100, 60));
    ctx.globalCompositeOperation = this.skin.light ? 'source-over' : 'lighter';
    ctx.globalAlpha = amount * (0.55 + 0.25 * Math.sin(time * 12));
    ctx.strokeStyle = g;
    ctx.lineWidth = 7 * u;
    ctx.strokeRect(0, 0, w, h);
    ctx.globalAlpha = amount * 0.25;
    ctx.lineWidth = 22 * u;
    ctx.strokeRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  private drawCountdown(): void {
    const { ctx, w, h, u, skin, view } = this;
    const t = Math.min(1, view.countdownT / 0.35);
    const s = Math.max(0.01, easeOutBack(t, 2.5));
    ctx.save();
    ctx.translate(w / 2, h * 0.45);
    ctx.scale(s, s);
    ctx.font = `700 ${(120 * u).toFixed(0)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 12 * u;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = skin.light ? 'rgba(255,255,255,0.9)' : 'rgba(5,3,20,0.6)';
    ctx.strokeText(String(view.countdown), 0, 0);
    ctx.fillStyle = skin.light ? skin.a : '#FFFFFF';
    ctx.fillText(String(view.countdown), 0, 0);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}
