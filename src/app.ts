import { AudioEngine } from './audio/engine';
import { Music } from './audio/music';
import { Sfx } from './audio/sfx';
import { shareUrl, VERSION } from './config';
import { hsl, rainbow } from './core/color';
import { clamp, damp } from './core/math';
import { READY_RADIUS } from './game/difficulty';
import { Session } from './game/session';
import type { DeathCause, Field, GameEvent, ModeId, Target } from './game/types';
import { dailyModifier, dailyNumber, dailySeed, dailyTuning, dateKey, daysBetween } from './meta/daily';
import { applyRun, coinsForRun, ensureMissions, giftAmount, REVIVE_COST, unlockGoals } from './meta/missions';
import type { SaveData, Settings, Store } from './meta/save';
import { canvasToBlob, renderShareCard, shareRun, shareText, type ShareInfo } from './meta/share';
import { DANGER, GOLD, POWER_COLORS, SKINS, skinById, type Skin } from './meta/skins';
import { haptic, setHaptics, type HapticKind } from './platform/haptics';
import { hideSplash, initNative } from './platform/native';
import { scoreY } from './render/hud';
import { Renderer, type Hint, type Phase } from './render/renderer';
import { COIN, fmt, UI, type GiftView, type SheetName } from './ui/ui';

const MULT_WORDS = ['', '', 'NICE', 'GREAT', 'AWESOME', 'AMAZING', 'INSANE', 'GODLIKE', 'LEGENDARY'];
const POWER_LABEL = { shield: 'SHIELD', slow: 'SLOW-MO', double: 'DOUBLE ×2' } as const;
const CAUSE_TEXT: Record<DeathCause, string> = {
  miss: 'You tapped outside the circle',
  bomb: 'Boom — you tapped a bomb',
  timeout: "Time's up — too slow!",
  quit: '',
};
const DEATH_TIME = 1.0;
const REVIVE_SECONDS = 4;

interface Tip {
  text: string;
  x: number;
  y: number;
  t: number;
  max: number;
  color?: string;
}

interface LastRun {
  info: ShareInfo;
  blob: Promise<Blob | null> | null;
}

function readSafeArea(): { top: number; right: number; bottom: number; left: number } {
  const el = document.createElement('div');
  el.style.cssText =
    'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
    'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(el);
  const cs = getComputedStyle(el);
  const r = {
    top: parseFloat(cs.paddingTop) || 0,
    right: parseFloat(cs.paddingRight) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
    left: parseFloat(cs.paddingLeft) || 0,
  };
  el.remove();
  return r;
}

export class App {
  private readonly renderer: Renderer;
  private readonly audio = new AudioEngine();
  private readonly music: Music;
  private readonly sfx: Sfx;
  private readonly ui: UI;
  private save: SaveData;
  private session!: Session;
  private building = false;
  private phase: Phase = 'home';
  private mode: ModeId;
  /** Equipped skin. */
  private skin: Skin;
  /** Skin on screen (differs while previewing in the shop). */
  private viewSkin: Skin;
  private field!: Field;
  private time = 0;
  private last = performance.now();
  private timeScale = 1;
  private slowmo = 0;
  private dyingT = 0;
  private scoreBump = 0;
  private multBump = 0;
  private coinBump = 0;
  private flash = 0;
  private flashColor = '#FFFFFF';
  private heat = 0;
  private feverFx = 0;
  private slowFx = 0;
  private danger = 0;
  private dark = 0;
  private hud = 0;
  private tickT = 0;
  private muffled = 18000;
  private countdown = 0;
  private countdownT = 0;
  private tip: Tip | null = null;
  private lastRun: LastRun | null = null;
  private musicStarted = false;
  private dprCap = 3;
  private frameAcc = 0;
  private frameN = 0;
  /** Frames that look like a steady 30 fps display cap (e.g. iOS Low Power Mode), not slowness. */
  private frameCapped = 0;
  private fastWindows = 0;
  private preview = '';
  private confirmSkin: string | null = null;
  private confirmT = 0;
  private today = dateKey();

  constructor(
    canvas: HTMLCanvasElement,
    private readonly store: Store,
  ) {
    this.save = store.data;
    ensureMissions(this.save);
    unlockGoals(this.save);
    this.renderer = new Renderer(canvas);
    this.music = new Music(this.audio);
    this.sfx = new Sfx(this.audio, this.music);
    const base = import.meta.env.BASE_URL;
    this.audio.preload('pop', `${base}audio/pop.wav`);
    this.audio.preload('buzz', `${base}audio/buzz.mp3`);
    this.audio.preload('claps', `${base}audio/claps.mp3`);
    this.mode = this.save.mode;
    this.skin = this.viewSkin = skinById(this.save.skin);
    this.preview = this.skin.id;
    this.ui = new UI({
      onPress: () => this.press(),
      onMode: (m) => this.setMode(m),
      onPause: () => this.pause(),
      onResume: () => this.resume(),
      onRestart: () => this.restart(),
      onQuit: () => this.quit(),
      onFinish: () => this.finishZen(),
      onRevive: () => this.acceptRevive(),
      onDecline: () => this.declineRevive(),
      onAgain: () => this.again(),
      onHome: () => this.goHome(),
      onShare: () => void this.share(),
      onSheet: (n) => this.openSheet(n),
      onSkin: (id) => this.tapSkin(id),
      onGift: () => this.claimGift(),
      onSetting: (k, v) => this.setSetting(k, v),
      onReset: () => this.resetProgress(),
      onHowto: (open) => this.howto(open),
    });
    this.ui.setCredits(`CirclePop ${VERSION} · made by CipherVision<br/>Fredoka typeface · SIL Open Font License`);
    this.applySettings();
    this.setViewSkin(this.skin);

    canvas.addEventListener('pointerdown', this.onPointer, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) document.addEventListener(ev, this.unlockAudio, true);
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault());
    document.addEventListener(
      'touchmove',
      (e) => {
        if (!(e.target as Element | null)?.closest?.('.sheet, .card')) e.preventDefault();
      },
      { passive: false },
    );
    window.addEventListener('resize', this.resize);
    window.visualViewport?.addEventListener('resize', this.resize);
    document.addEventListener('visibilitychange', () => (document.hidden ? this.onHidden() : this.onShown()));
    window.addEventListener('pagehide', () => this.store.flush());
    window.addEventListener('keydown', this.onKey);
  }

  start(): void {
    this.resize();
    this.newSession('home');
    void initNative({ onPause: () => this.onHidden(), onResume: () => this.onShown(), onBack: () => this.back() });
    void hideSplash();
    requestAnimationFrame(this.loop);
  }

  /** Test/debug hook (enabled with ?debug). */
  debug(): Record<string, unknown> {
    return {
      session: this.session,
      phase: this.phase,
      save: this.save,
      renderer: this.renderer,
      app: this,
    };
  }

  // ======================================================================= loop

  private loop = (now: number): void => {
    requestAnimationFrame(this.loop);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.05) dt = 0.05;
    this.time += dt;
    this.adaptQuality(dt);
    if (!this.musicStarted && this.audio.running) {
      this.musicStarted = true;
      this.muffled = -1;
      this.music.start();
    }

    let target = 1;
    if (this.phase === 'dying') target = 0.14;
    else if (this.slowmo > 0) {
      target = 0.3;
      this.slowmo -= dt;
    }
    this.timeScale = damp(this.timeScale, target, this.phase === 'dying' ? 14 : 7, dt);
    const gdt = dt * this.timeScale;
    const frozen = this.phase === 'paused';
    if (!frozen) this.session.update(gdt);
    if (this.phase === 'dying') {
      this.dyingT += dt;
      if (this.dyingT >= DEATH_TIME) this.afterDeath();
    }
    this.updateCountdown(dt);
    this.updateView(dt);
    this.renderer.render(this.session, this.time, frozen ? 0 : gdt);
  };

  private updateView(dt: number): void {
    const s = this.session;
    const r = this.renderer;
    const v = r.view;
    const u = r.u;
    const playing = this.phase === 'play';
    this.scoreBump = Math.max(0, this.scoreBump - dt * 4);
    this.multBump = Math.max(0, this.multBump - dt * 3);
    this.coinBump = Math.max(0, this.coinBump - dt * 4);
    this.flash = Math.max(0, this.flash - dt * 2.8);
    if (r.particles.arrived) {
      r.particles.arrived = 0;
      this.coinBump = 1;
    }
    this.heat = damp(this.heat, playing ? clamp((s.mult - 1) / 5, 0, 1) : 0, 3, dt);
    this.feverFx = damp(this.feverFx, s.feverActive && this.phase !== 'dying' ? 1 : 0, 5, dt);
    this.slowFx = damp(this.slowFx, s.slowTime > 0 && playing ? 1 : 0, 5, dt);
    const dangerTarget = playing && s.rules.timer && !s.feverActive && !s.grace ? clamp((0.36 - s.timerFrac) / 0.36, 0, 1) : 0;
    this.danger = damp(this.danger, dangerTarget, 12, dt);
    const darkTarget = this.phase === 'results' || this.phase === 'revive' ? 1 : this.phase === 'paused' && this.countdown === 0 ? 0.8 : this.phase === 'dying' ? 0.45 : 0;
    this.dark = damp(this.dark, darkTarget, 5, dt);
    const hudTarget = this.phase === 'play' || this.phase === 'ready' || this.phase === 'paused' ? 1 : 0;
    this.hud = damp(this.hud, hudTarget, 8, dt);

    // Music follows the action.
    this.music.level = playing || (this.phase === 'paused' && this.countdown > 0) ? (s.feverActive ? 3 : s.mult >= 3 || s.pops >= 40 ? 2 : 1) : 0;
    const muffle =
      this.phase === 'paused' && this.countdown === 0 ? 500 : this.phase === 'dying' ? 420 : s.slowTime > 0 && playing ? 1100 : this.phase === 'results' || this.phase === 'revive' ? 1400 : 18000;
    if (muffle !== this.muffled) {
      this.muffled = muffle;
      this.audio.muffle(muffle, 0.15);
    }

    if (dangerTarget > 0) {
      this.tickT -= dt;
      if (this.tickT <= 0) {
        this.sfx.tick(dangerTarget);
        this.tickT = 0.3 - 0.19 * dangerTarget;
      }
    } else this.tickT = 0;

    // Contextual tip for the first moving circle.
    if (playing && !this.save.tips.includes('moving')) {
      const m = s.targets.find((t) => t.main && !t.dying && (t.vx !== 0 || t.vy !== 0));
      if (m) this.showTipNear('moving', 'Heads up — they move now!', m);
    }

    const hints: Hint[] = [];
    if (this.phase === 'ready') {
      const t = s.targets.find((x) => x.main && !x.dying);
      if (t) hints.push({ text: 'TAP TO START', x: t.x, y: t.y + t.r * 1.6 + 24 * u, alpha: 0.65 + 0.35 * Math.sin(this.time * 4), size: 16 });
    }
    if (this.tip) {
      const tip = this.tip;
      tip.t -= dt;
      const a = Math.min(1, tip.t / 0.35, (tip.max - tip.t) / 0.15);
      hints.push({ text: tip.text, x: tip.x, y: tip.y, alpha: Math.max(0, a), color: tip.color, size: 18 });
      if (tip.t <= 0) this.tip = null;
    }

    const beats = this.music.beats();
    const bp = beats - Math.floor(beats);
    v.phase = this.phase;
    v.beat = Math.exp(-bp * 6);
    v.beatPhase = bp;
    v.heat = this.heat;
    v.fever = this.feverFx;
    v.danger = this.save.settings.calm ? this.danger * 0.5 : this.danger;
    v.slow = this.slowFx;
    v.hud = this.hud;
    v.dark = this.dark;
    v.flash = this.save.settings.calm ? Math.min(this.flash, 0.2) : this.flash;
    v.flashColor = this.flashColor;
    v.scoreBump = this.scoreBump;
    v.multBump = this.multBump;
    v.coinBump = this.coinBump;
    v.coinsRun = s.mode === 'zen' ? 0 : s.pops + s.bonusCoins;
    v.best = this.bestFor(s.mode);
    v.hints = hints;
    v.countdown = this.countdown;
    v.countdownT = this.countdownT;
  }

  /** Trade resolution for frame rate on slow devices, and win it back when things speed up. */
  private adaptQuality(dt: number): void {
    if (document.hidden || dt <= 0) return;
    this.frameAcc += dt;
    this.frameN++;
    if (Math.abs(dt - 1 / 30) < 0.003) this.frameCapped++;
    if (this.frameAcc < 2.5) return;
    const avg = this.frameAcc / this.frameN;
    const capped = this.frameCapped / this.frameN > 0.8;
    this.frameAcc = 0;
    this.frameN = 0;
    this.frameCapped = 0;
    const device = window.devicePixelRatio || 1;
    const current = Math.min(this.dprCap, device);
    // A locked 30 fps is a display cap: dropping resolution would not buy frames, so keep it sharp.
    const floor = capped ? Math.min(2, device) : 1.25;
    if (avg > 0.026 && current > floor) {
      this.dprCap = Math.max(floor, current - 0.5);
      this.fastWindows = 0;
      this.resize();
    } else if (avg < 0.0185 && this.dprCap < device) {
      if (++this.fastWindows >= 2) {
        this.dprCap = Math.min(3, this.dprCap + 0.5);
        this.fastWindows = 0;
        this.resize();
      }
    } else {
      this.fastWindows = 0;
    }
  }

  private resize = (): void => {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    const safe = readSafeArea();
    const dpr = Math.min(window.devicePixelRatio || 1, this.dprCap);
    this.renderer.resize(w, h, dpr, safe);
    const u = this.renderer.u;
    this.field = {
      w,
      h,
      u,
      left: safe.left + 8 * u,
      right: w - safe.right - 8 * u,
      top: safe.top + 104 * u,
      bottom: h - safe.bottom - 14 * u,
      cx: w / 2,
      cy: Math.round(h * 0.53),
    };
    this.session?.setField(this.field);
    this.ui.layout(this.field.cy, READY_RADIUS * u);
  };

  // ====================================================================== input

  private unlockAudio = (): void => {
    this.audio.unlock();
  };

  private onPointer = (e: PointerEvent): void => {
    e.preventDefault();
    this.audio.unlock();
    if (this.ui.sheet || this.ui.howtoOpen) return;
    if (this.phase !== 'home' && this.phase !== 'ready' && this.phase !== 'play') return;
    const rect = this.renderer.canvas.getBoundingClientRect();
    this.session.tap(e.clientX - rect.left, e.clientY - rect.top);
  };

  private onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' || e.key === 'p') {
      if (this.ui.howtoOpen) this.howto(false);
      else if (this.ui.sheet) this.openSheet(null);
      else if (this.phase === 'play') this.pause();
      else if (this.phase === 'paused') this.resume();
    } else if ((e.key === ' ' || e.key === 'Enter') && this.phase === 'results') {
      e.preventDefault();
      this.again();
    }
  };

  private press(): void {
    this.sfx.click();
    this.haptic('light');
  }

  private haptic(kind: HapticKind): void {
    haptic(kind);
  }

  // =================================================================== sessions

  private bestFor(mode: ModeId): number {
    if (mode === 'daily') return this.save.daily.date === this.today ? this.save.daily.best : 0;
    return mode === 'zen' ? this.save.best.zen : this.save.best.classic;
  }

  private newSession(phase: 'home' | 'ready'): void {
    this.today = dateKey();
    const mode = this.mode;
    const daily = mode === 'daily';
    this.building = true;
    this.session = new Session(
      {
        mode,
        seed: daily ? dailySeed(this.today) : (Math.random() * 0xffffffff) >>> 0,
        best: this.bestFor(mode),
        tuning: daily ? dailyTuning(this.today) : undefined,
      },
      this.field,
      (e) => this.onEvent(e),
    );
    this.building = false;
    this.phase = phase;
    this.timeScale = 1;
    this.slowmo = 0;
    this.dyingT = 0;
    this.tip = null;
    this.countdown = 0;
    this.ui.showHome(phase === 'home');
    this.ui.showHud(false);
    this.ui.showReadyBar(phase === 'ready');
    if (phase === 'home') this.refreshHome();
  }

  private setMode(m: ModeId): void {
    if (this.phase !== 'home' || m === this.mode) return;
    this.mode = m;
    this.save.mode = m;
    this.store.save();
    this.newSession('home');
    this.sfx.whoosh();
  }

  private refreshHome(): void {
    const save = this.save;
    const today = this.today;
    const mod = dailyModifier(today);
    const dailyBest = save.daily.date === today ? save.daily.best : 0;
    let modeInfo = '';
    if (this.mode === 'daily') {
      const streak = daysBetween(save.daily.last, today) <= 1 ? save.daily.streak : 0;
      modeInfo = `<b>Daily #${dailyNumber(today)} · ${mod.name}</b> — ${mod.desc}<br/>Same circles for everyone today${streak ? ` · 🔥 ${streak}-day streak` : ''}`;
    } else if (this.mode === 'zen') {
      modeInfo = 'No timer. No game over. Just pop.';
    } else {
      modeInfo = 'Pop fast · hit the center · never miss';
    }
    const affordable = SKINS.some((s) => !save.owned.includes(s.id) && s.unlock.kind === 'coins' && save.coins >= s.unlock.price);
    const giftReady = save.gift.last !== today;
    let note = '';
    if (save.legacyBest > 0 && save.stats.games === 0) note = `Welcome back! Your OG best: ${save.legacyBest} — the OG skin is yours.`;
    this.ui.setHome({
      coins: save.coins,
      best: this.mode === 'daily' ? dailyBest : this.bestFor(this.mode),
      bestLabel: this.mode === 'daily' ? "TODAY'S BEST" : this.mode === 'zen' ? 'ZEN BEST' : 'BEST',
      mode: this.mode,
      modeInfo,
      note,
      dailyDot: save.daily.last !== today,
      badges: { skins: affordable, missions: false, gift: giftReady },
    });
  }

  // ===================================================================== events

  private onEvent(e: GameEvent): void {
    if (this.building) return;
    const r = this.renderer;
    const fx = r.fx;
    const u = r.u;
    const s = this.session;
    const skin = this.viewSkin;
    switch (e.type) {
      case 'start':
        this.phase = 'play';
        this.ui.showHome(false);
        this.ui.showReadyBar(false);
        this.ui.showHud(true);
        this.tip = null;
        if (s.mode === 'zen') this.showTip('zen', 'No timer, no game over. Just vibe.', r.w / 2, this.field.top + 30 * u);
        break;
      case 'pop': {
        const t = e.target;
        const perfect = e.quality === 'perfect';
        const gold = t.kind === 'gold';
        fx.pop(t.x, t.y, t.r, this.popColors(), perfect, gold, e.fever);
        const color = gold ? GOLD.b : perfect ? (skin.light ? skin.b : '#FFFFFF') : skin.text;
        fx.text(`+${e.points}`, t.x, t.y - t.r * 0.1, { size: perfect ? 30 : 23, color, life: 0.8 });
        if (perfect) {
          const label = e.streak >= 3 ? `PERFECT ×${e.streak}` : 'PERFECT';
          fx.text(label, t.x, t.y - t.r - 12 * u, { size: 15, color: skin.light ? skin.b : skin.rainbow ? hsl(this.time * 90, 100, 70) : skin.a, life: 0.65, vy: -50 });
        }
        if (gold) {
          const [cx, cy] = this.coinTarget();
          fx.coins(t.x, t.y, 4, cx, cy);
        }
        this.sfx.pop(e.streak, perfect, gold);
        this.haptic(perfect ? 'medium' : 'light');
        this.scoreBump = 1;
        break;
      }
      case 'mult': {
        const word = MULT_WORDS[e.mult] ?? 'UNREAL';
        const size = Math.min(r.w, r.h);
        fx.text(`${word}! ×${e.mult}`, r.w / 2, scoreY(r.h) - size * 0.22, {
          size: 26 + e.mult * 2.5,
          color: skin.light ? skin.b : hsl(e.mult * 45, 100, 68),
          life: 1.1,
          vy: -30,
        });
        this.sfx.mult(e.mult);
        this.multBump = 1;
        this.haptic('medium');
        r.shake.add(0.12);
        if (e.mult === 2) this.showTip('mult', 'Perfect streak = score multiplier!', r.w / 2, scoreY(r.h) + size * 0.34);
        break;
      }
      case 'streakLost': {
        this.sfx.streakLost();
        const size = Math.min(r.w, r.h);
        const lost = Math.min(8, 1 + Math.floor(e.streak / 3));
        if (lost > 1) fx.text(`×${lost} lost`, r.w / 2, scoreY(r.h) + size * 0.3, { size: 18, color: DANGER, life: 0.9, vy: 30 });
        break;
      }
      case 'spawn':
        this.onSpawn(e.target);
        break;
      case 'expire':
        fx.ring(e.target.x, e.target.y, e.target.r, e.target.r * 0.2, POWER_COLORS[e.target.power ?? 'shield'], 0.3, 3 * u);
        break;
      case 'power': {
        const col = POWER_COLORS[e.kind];
        fx.powerGrab(e.x, e.y, 27 * u, col);
        fx.text(POWER_LABEL[e.kind], e.x, e.y - 42 * u, { size: 24, color: col, life: 1 });
        this.sfx.power(e.kind);
        this.haptic('medium');
        break;
      }
      case 'shieldSave':
        fx.shieldBreak(e.x, e.y, POWER_COLORS.shield);
        if (e.cause === 'bomb') {
          fx.explosion(e.x, e.y, 18 * u);
          this.sfx.bomb();
        }
        fx.text('SAVED!', e.x, e.y - 52 * u, { size: 30, color: POWER_COLORS.shield, life: 1.1 });
        this.sfx.shield();
        this.haptic('heavy');
        this.flash = 0.3;
        this.flashColor = POWER_COLORS.shield;
        break;
      case 'miss':
        fx.miss(e.x, e.y, skin.light);
        this.sfx.miss();
        this.haptic('light');
        break;
      case 'feverStart':
        fx.feverBurst(r.w, r.h);
        fx.text('FEVER!', r.w / 2, r.h * 0.3, { size: 66, color: '#FFFFFF', life: 1.4, vy: -20 });
        this.sfx.fever();
        this.haptic('heavy');
        this.flash = 0.45;
        this.flashColor = '#FFFFFF';
        this.showTip('fever', 'Misses are free — pop everything!', r.w / 2, r.h * 0.3 + 64 * u);
        break;
      case 'feverEnd':
        this.sfx.feverEnd();
        break;
      case 'newBest':
        fx.text('NEW BEST!', r.w / 2, scoreY(r.h) + Math.min(r.w, r.h) * 0.36, { size: 32, color: '#FFD23F', life: 1.4, vy: -25 });
        fx.confetti(r.w, r.h, this.confettiColors(), 70);
        this.sfx.bestPassed();
        this.haptic('success');
        break;
      case 'death':
        this.onDeath(e.cause, e.x, e.y);
        break;
      case 'revive': {
        const t = s.targets.find((x) => x.main && !x.dying);
        if (t) {
          fx.ring(t.x, t.y, t.r * 3, t.r, POWER_COLORS.shield, 0.5, 5 * u);
          fx.text('SECOND CHANCE', t.x, t.y - t.r - 26 * u, { size: 22, color: POWER_COLORS.shield, life: 1.4 });
        }
        break;
      }
    }
  }

  private onSpawn(t: Target): void {
    const s = this.session;
    if (s.state !== 'playing') return;
    if (t.kind === 'bomb') this.showTipNear('bomb', 'Never tap the bombs!', t, 1.3, DANGER);
    else if (t.kind === 'power') this.showTipNear('power', 'Grab the power-up!', t, 0.9, POWER_COLORS[t.power ?? 'shield']);
    else if (t.kind === 'gold') this.showTipNear('gold', 'GOLD: 5× points + coins', t, 0, GOLD.b);
    else if (t.main && s.pops === 1 && s.mode !== 'zen') this.showTipNear('perfect', 'Hit the CENTER for PERFECT', t);
  }

  private showTip(id: string, text: string, x: number, y: number, slow = 0, color?: string): boolean {
    if (this.save.tips.includes(id)) return false;
    this.save.tips.push(id);
    this.store.save();
    const u = this.renderer.u;
    const w = this.renderer.w;
    this.tip = { text, x: clamp(x, 130 * u, w - 130 * u), y, t: 2.8, max: 2.8, color };
    if (slow > 0 && !this.save.settings.calm) this.slowmo = slow;
    return true;
  }

  private showTipNear(id: string, text: string, t: Target, slow = 0, color?: string): void {
    if (this.save.tips.includes(id)) return;
    const u = this.renderer.u;
    const below = t.y + t.r * 1.55 + 22 * u;
    const above = t.y - t.r * 1.55 - 22 * u;
    const halfW = 120 * u;
    // Pick the side of the circle where the label covers the fewest other targets.
    const cost = (y: number): number => {
      let c = y > this.field.bottom - 20 * u || y < this.field.top ? 10 : 0;
      for (const o of this.session.targets) {
        if (o === t || o.dying) continue;
        if (Math.abs(o.y - y) < o.r + 16 * u && Math.abs(o.x - t.x) < halfW + o.r) c += o.main ? 3 : 1;
      }
      return c;
    };
    this.showTip(id, text, t.x, cost(below) <= cost(above) ? below : above, slow, color);
  }

  private popColors(): readonly string[] {
    if (this.viewSkin.rainbow) {
      const h = Math.random() * 360;
      return [rainbow(h, 65), rainbow(h + 90, 65), '#FFFFFF', rainbow(h + 200, 65)];
    }
    return this.viewSkin.particles;
  }

  private confettiColors(): string[] {
    return [...this.viewSkin.particles, '#FFD23F', '#FF3D6E', '#3DFFA2', '#3DC8FF'];
  }

  private coinTarget(): [number, number] {
    const r = this.renderer;
    return [r.w - 16 * r.u - 26 * r.u, r.safe.top + 33 * r.u];
  }

  // ================================================================ death & run

  private onDeath(cause: DeathCause, x: number, y: number): void {
    const r = this.renderer;
    const fx = r.fx;
    this.phase = 'dying';
    this.dyingT = 0;
    const s = this.session;
    for (const t of s.targets) {
      if (!t.dying && (t.kind === 'normal' || t.kind === 'gold')) fx.shatter(t.x, t.y, t.r, this.popColors());
      if (!t.dying) t.dying = 1e-6;
    }
    if (cause === 'bomb') fx.explosion(x, y, 26 * r.u);
    else if (cause === 'miss') fx.miss(x, y, this.viewSkin.light);
    this.sfx.death(cause);
    this.haptic('error');
    this.flash = 0.55;
    this.flashColor = DANGER;
    this.tip = null;
    this.ui.showHud(false);
  }

  private afterDeath(): void {
    const s = this.session;
    const canRevive = s.mode !== 'zen' && s.canRevive() && s.score >= 10 && this.save.coins >= REVIVE_COST;
    if (canRevive) {
      this.phase = 'revive';
      this.ui.showRevive(REVIVE_COST, s.score, REVIVE_SECONDS, true);
      this.sfx.whoosh();
    } else {
      this.finishRun();
    }
  }

  private acceptRevive(): void {
    if (this.phase !== 'revive' || this.save.coins < REVIVE_COST) return;
    this.save.coins -= REVIVE_COST;
    this.save.stats.revives++;
    this.store.save();
    this.ui.hideRevive();
    this.phase = 'play';
    this.timeScale = 1;
    this.session.revive();
    this.ui.showHud(true);
    this.sfx.power('shield');
    this.haptic('success');
  }

  private declineRevive(): void {
    if (this.phase !== 'revive') return;
    this.ui.hideRevive();
    this.finishRun();
  }

  /** Bank stats, bests, coins and missions for the current run. */
  private record(): { isBest: boolean; prevBest: number; coins: number; missions: ReturnType<typeof applyRun>; skins: Skin[] } {
    const s = this.session;
    const r = s.summary();
    const save = this.save;
    const st = save.stats;
    st.games++;
    st.pops += r.pops;
    st.perfects += r.perfects;
    st.golds += r.golds;
    st.fevers += r.fevers;
    st.powerups += r.powerups;
    st.bestStreak = Math.max(st.bestStreak, r.bestStreak);
    st.bestMult = Math.max(st.bestMult, r.maxMult);
    st.seconds += r.elapsed;
    const today = this.today;
    const prevBest = this.bestFor(s.mode);
    let isBest = false;
    if (s.mode === 'classic') {
      if (r.score > save.best.classic) {
        save.best.classic = r.score;
        isBest = true;
      }
    } else if (s.mode === 'daily') {
      if (save.daily.date !== today) {
        save.daily.date = today;
        save.daily.best = 0;
      }
      if (r.score > save.daily.best) {
        save.daily.best = r.score;
        isBest = true;
      }
      save.best.daily = Math.max(save.best.daily, r.score);
      const gap = daysBetween(save.daily.last, today);
      if (gap !== 0) {
        save.daily.streak = gap === 1 ? save.daily.streak + 1 : 1;
        save.daily.last = today;
        save.daily.bestStreak = Math.max(save.daily.bestStreak, save.daily.streak);
      }
    } else if (r.score > save.best.zen) {
      save.best.zen = r.score;
      isBest = true;
    }
    const coins = coinsForRun(r);
    save.coins += coins;
    const missions = applyRun(save, r);
    const skins = unlockGoals(save);
    this.store.save();
    return { isBest: isBest && r.score > 0, prevBest, coins, missions, skins };
  }

  private finishRun(): void {
    const s = this.session;
    const r = s.summary();
    const rec = this.record();
    const best = this.bestFor(s.mode);
    let nudge = '';
    if (rec.isBest && rec.prevBest > 0) nudge = `+${fmt(r.score - rec.prevBest)} over your old best`;
    else if (!rec.isBest && best > 0 && r.score >= best * 0.72 && s.mode !== 'zen') nudge = `So close! ${fmt(best - r.score + 1)} more to beat your best`;
    else if (s.mode === 'daily') nudge = `🔥 Daily streak: ${this.save.daily.streak} day${this.save.daily.streak === 1 ? '' : 's'}`;
    else if (!rec.isBest && r.pops > 0 && s.mode !== 'zen') nudge = r.perfects / r.pops < 0.4 ? 'Tip: aim for the center to build a multiplier' : 'Tip: fill FEVER for double points';
    this.phase = 'results';
    this.ui.showResults({
      mode: s.mode,
      score: r.score,
      best,
      bestLabel: s.mode === 'daily' ? "TODAY'S BEST" : 'BEST',
      isBest: rec.isBest,
      cause: CAUSE_TEXT[r.cause ?? 'quit'],
      nudge,
      pops: r.pops,
      perfectPct: r.pops ? Math.round((r.perfects / r.pops) * 100) : 0,
      maxMult: r.maxMult,
      coins: rec.coins,
      missions: rec.missions,
      skins: rec.skins,
    });
    if (rec.isBest) {
      this.renderer.fx.confetti(this.renderer.w, this.renderer.h, this.confettiColors(), 150);
      this.sfx.newBest();
      this.haptic('success');
    } else if (rec.missions.length || rec.skins.length) {
      this.sfx.buy();
    }
    const info: ShareInfo = {
      score: r.score,
      isBest: rec.isBest,
      mode: s.mode,
      pops: r.pops,
      perfectPct: r.pops ? Math.round((r.perfects / r.pops) * 100) : 0,
      maxMult: r.maxMult,
      fevers: r.fevers,
      history: r.history,
      dailyNo: dailyNumber(this.today),
      dailyName: dailyModifier(this.today).name,
      skin: this.skin,
    };
    const run: LastRun = { info, blob: null };
    this.lastRun = run;
    // Render the share card off the critical path so the results animation stays smooth.
    window.setTimeout(() => {
      if (this.lastRun === run && !run.blob) run.blob = canvasToBlob(renderShareCard(info));
    }, 900);
  }

  private finishZen(): void {
    if (this.phase !== 'paused' || this.session.mode !== 'zen') return;
    this.ui.showPause(false);
    this.session.finish();
    this.finishRun();
  }

  private async share(): Promise<void> {
    const run = this.lastRun;
    if (!run) return;
    if (!run.blob) run.blob = canvasToBlob(renderShareCard(run.info));
    const res = await shareRun(await run.blob, shareText(run.info), shareUrl());
    if (res === 'copied') this.ui.toast('Copied — paste it anywhere!');
    else if (res === 'downloaded') this.ui.toast('Score card saved');
    else if (res === 'failed') this.ui.toast('Sharing is not available here');
  }

  private again(): void {
    if (this.phase !== 'results') return;
    this.ui.hideResults();
    this.newSession('ready');
  }

  private goHome(): void {
    this.ui.hideResults();
    this.ui.hideRevive();
    this.ui.showPause(false);
    this.newSession('home');
  }

  // ============================================================ pause & resume

  private pause(): void {
    if (this.phase !== 'play') return;
    this.phase = 'paused';
    this.countdown = 0;
    this.ui.showPause(true, this.session.mode === 'zen');
    this.ui.setSettings(this.save.settings);
    this.ui.showHud(false);
    this.store.flush();
  }

  private resume(): void {
    if (this.phase !== 'paused' || this.countdown > 0) return;
    this.ui.showPause(false);
    if (this.session.mode === 'zen') {
      this.phase = 'play';
      this.ui.showHud(true);
      return;
    }
    this.countdown = 3;
    this.countdownT = 0;
    this.sfx.countdown(3);
  }

  private updateCountdown(dt: number): void {
    if (this.countdown <= 0) return;
    this.countdownT += dt;
    if (this.countdownT < 0.5) return;
    this.countdownT = 0;
    this.countdown--;
    this.sfx.countdown(this.countdown);
    if (this.countdown === 0) {
      this.phase = 'play';
      this.ui.showHud(true);
    }
  }

  private restart(): void {
    if (this.phase !== 'paused') return;
    this.ui.showPause(false);
    if (this.session.state !== 'ready') this.record();
    this.newSession('ready');
  }

  private quit(): void {
    if (this.phase !== 'paused') return;
    if (this.session.state !== 'ready') this.record();
    this.goHome();
  }

  private onHidden(): void {
    if (this.phase === 'paused' && this.countdown > 0) {
      // Left mid "3-2-1": come back to the pause card, not a surprise resume.
      this.countdown = 0;
      this.ui.showPause(true, this.session.mode === 'zen');
    }
    this.pause();
    this.audio.suspend();
    this.store.flush();
  }

  private onShown(): void {
    this.audio.resume();
    this.last = performance.now();
  }

  private back(): boolean {
    // Never quit mid death-animation: the run has not been banked yet.
    if (this.phase === 'dying') return true;
    if (this.ui.howtoOpen) {
      this.howto(false);
      return true;
    }
    if (this.ui.sheet) {
      this.openSheet(null);
      return true;
    }
    if (this.phase === 'play') {
      this.pause();
      return true;
    }
    if (this.phase === 'paused') {
      this.resume();
      return true;
    }
    if (this.phase === 'revive') {
      this.declineRevive();
      return true;
    }
    if (this.phase === 'results' || this.phase === 'ready') {
      this.goHome();
      return true;
    }
    return false;
  }

  // ===================================================================== meta

  private setViewSkin(s: Skin): void {
    this.viewSkin = s;
    this.renderer.setSkin(s);
    this.sfx.voice = s.voice;
    this.ui.applySkin(s);
  }

  private openSheet(name: SheetName | null): void {
    if (name === null) {
      if (!this.ui.sheet) return;
      this.ui.openSheet(null);
      this.confirmSkin = null;
      if (this.viewSkin.id !== this.skin.id) this.setViewSkin(this.skin);
      this.refreshHome();
      return;
    }
    if (this.phase !== 'home') return;
    if (name === 'skins') {
      this.preview = this.skin.id;
      this.confirmSkin = null;
      this.ui.renderSkins(this.save, this.preview, null);
    } else if (name === 'missions') {
      this.ui.renderMissions(this.save, this.giftView());
    } else {
      this.ui.setSettings(this.save.settings);
    }
    this.ui.openSheet(name);
    this.sfx.whoosh();
  }

  private tapSkin(id: string): void {
    const s = skinById(id);
    const save = this.save;
    const now = performance.now();
    if (this.viewSkin.id !== id) this.setViewSkin(s);
    this.sfx.preview(s.voice);
    if (save.owned.includes(id)) {
      if (save.skin !== id) {
        save.skin = id;
        this.skin = s;
        this.store.save();
        this.ui.toast(`${s.name} equipped`);
      }
      this.confirmSkin = null;
    } else if (s.unlock.kind === 'coins') {
      const price = s.unlock.price;
      if (save.coins < price) {
        this.ui.shakeSkin(id);
        this.ui.toast(`${COIN} ${fmt(price - save.coins)} more coins to unlock ${s.name}`);
        this.haptic('error');
        this.confirmSkin = null;
      } else if (this.confirmSkin === id && now - this.confirmT < 5000) {
        save.coins -= price;
        save.owned.push(id);
        save.skin = id;
        this.skin = s;
        this.confirmSkin = null;
        this.store.save();
        this.sfx.buy();
        this.haptic('success');
        this.ui.setCoins(save.coins, true);
        this.ui.toast(`Unlocked <b>${s.name}</b>!`);
        this.renderer.fx.confetti(this.renderer.w, this.renderer.h, this.confettiColors(), 80);
      } else {
        this.confirmSkin = id;
        this.confirmT = now;
      }
    } else if (s.unlock.kind === 'goal') {
      this.ui.toast(`🔒 ${s.unlock.label}`);
      this.confirmSkin = null;
    }
    this.preview = id;
    this.ui.renderSkins(save, this.preview, this.confirmSkin);
  }

  private giftView(): GiftView {
    const g = this.save.gift;
    const ready = g.last !== this.today;
    const streak = ready ? (daysBetween(g.last, this.today) === 1 ? g.streak + 1 : 1) : Math.max(1, g.streak);
    return { ready, amount: giftAmount(streak), streak };
  }

  private claimGift(): void {
    const v = this.giftView();
    if (!v.ready) return;
    this.save.gift = { last: this.today, streak: v.streak };
    this.save.coins += v.amount;
    this.store.save();
    this.sfx.buy();
    this.haptic('success');
    this.ui.setCoins(this.save.coins, true);
    this.ui.toast(`Daily gift: +${v.amount} ${COIN}`);
    this.ui.renderMissions(this.save, this.giftView());
  }

  private setSetting(key: keyof Settings, value: boolean): void {
    this.save.settings[key] = value;
    this.store.save();
    this.applySettings();
    this.ui.setSettings(this.save.settings);
  }

  private applySettings(): void {
    const s = this.save.settings;
    this.audio.setMusic(s.music);
    this.audio.setSfx(s.sfx);
    setHaptics(s.haptics);
    this.renderer.shake.enabled = !s.calm;
    this.renderer.fx.calm = s.calm;
    this.ui.setSettings(s);
  }

  private resetProgress(): void {
    this.store.reset();
    this.save = this.store.data;
    ensureMissions(this.save);
    this.skin = skinById(this.save.skin);
    this.mode = this.save.mode;
    this.setViewSkin(this.skin);
    this.applySettings();
    this.openSheet(null);
    this.newSession('home');
    this.ui.toast('Progress reset — fresh start!');
  }

  private howto(open: boolean): void {
    if (open && this.phase !== 'home' && this.phase !== 'paused') return;
    this.ui.showHowto(open, this.viewSkin);
  }
}
