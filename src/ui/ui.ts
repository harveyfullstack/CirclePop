import { hexToRgb } from '../core/color';
import { easeOutCubic } from '../core/math';
import type { ModeId, Target } from '../game/types';
import { goalProgress, missionText, MISSION_DEFS, type MissionState } from '../meta/missions';
import type { SaveData, Settings } from '../meta/save';
import { DANGER, SKINS, type Skin } from '../meta/skins';
import { blobSprite } from '../render/sprites';
import { drawBomb, drawPowerIcon, drawRing } from '../render/targets';
import { hydrateIcons, ICONS } from './icons';

export type SheetName = 'skins' | 'missions' | 'settings';

export interface UIHandlers {
  onPress(): void;
  onMode(mode: ModeId): void;
  onPause(): void;
  onResume(): void;
  onRestart(): void;
  onQuit(): void;
  onFinish(): void;
  onRevive(): void;
  onDecline(): void;
  onAgain(): void;
  onHome(): void;
  onShare(): void;
  onSheet(name: SheetName | null): void;
  onSkin(id: string): void;
  onGift(): void;
  onSetting(key: keyof Settings, value: boolean): void;
  onReset(): void;
  onHowto(open: boolean): void;
}

export interface HomeView {
  coins: number;
  best: number;
  bestLabel: string;
  mode: ModeId;
  modeInfo: string;
  note: string;
  dailyDot: boolean;
  badges: { skins: boolean; missions: boolean; gift: boolean };
}

export interface ResultsView {
  mode: ModeId;
  score: number;
  best: number;
  bestLabel: string;
  isBest: boolean;
  cause: string;
  nudge: string;
  pops: number;
  perfectPct: number;
  maxMult: number;
  coins: number;
  missions: MissionState[];
  skins: Skin[];
}

export interface GiftView {
  ready: boolean;
  amount: number;
  streak: number;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el as T;
};

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

export const COIN = '<i class="coin"></i>';

export function fmt(n: number): string {
  return Math.floor(n).toLocaleString('en-US');
}

export class UI {
  sheet: SheetName | null = null;
  howtoOpen = false;
  private reviveRaf = 0;
  private countRaf = 0;
  private resetArmed = 0;
  private skinCards = new Map<string, HTMLElement>();

  constructor(private readonly h: UIHandlers) {
    hydrateIcons(document);
    const on = (id: string, fn: () => void): void => $(id).addEventListener('click', fn);
    on('btn-pause', () => h.onPause());
    on('btn-back', () => h.onHome());
    on('btn-resume', () => h.onResume());
    on('btn-restart', () => h.onRestart());
    on('btn-quit', () => h.onQuit());
    on('btn-finish', () => h.onFinish());
    on('btn-revive', () => h.onRevive());
    on('btn-norevive', () => h.onDecline());
    on('btn-again', () => h.onAgain());
    on('btn-home', () => h.onHome());
    on('btn-share', () => h.onShare());
    on('btn-skins', () => h.onSheet('skins'));
    on('btn-missions', () => h.onSheet('missions'));
    on('btn-gift', () => h.onSheet('missions'));
    on('home-coins', () => h.onSheet('skins'));
    on('btn-settings', () => h.onSheet('settings'));
    on('btn-help', () => h.onHowto(true));
    on('btn-howto', () => h.onHowto(true));
    on('btn-howto-ok', () => h.onHowto(false));
    on('scrim', () => h.onSheet(null));
    on('pause-music', () => h.onSetting('music', $('pause-music').classList.contains('off')));
    on('pause-sfx', () => h.onSetting('sfx', $('pause-sfx').classList.contains('off')));
    on('pause-haptics', () => h.onSetting('haptics', $('pause-haptics').classList.contains('off')));
    on('btn-reset', () => this.armReset());
    document.querySelectorAll<HTMLElement>('[data-close]').forEach((b) => b.addEventListener('click', () => h.onSheet(null)));
    document.querySelectorAll<HTMLElement>('.mode').forEach((b) => b.addEventListener('click', () => h.onMode(b.dataset.mode as ModeId)));
    for (const key of ['music', 'sfx', 'haptics', 'calm'] as const) {
      $<HTMLInputElement>(`set-${key}`).addEventListener('change', (e) => h.onSetting(key, (e.target as HTMLInputElement).checked));
    }
    $('gift-card').addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) h.onGift();
    });
    // Tactile feedback on every button.
    $('ui').addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button, .set-row')) h.onPress();
    });
  }

  // ---------------------------------------------------------------- theme

  applySkin(s: Skin): void {
    const root = document.documentElement;
    const st = root.style;
    st.setProperty('--a', s.a);
    st.setProperty('--b', s.b);
    st.setProperty('--text', s.text);
    st.setProperty('--bg0', s.bg[0]);
    const [r1, g1, b1] = hexToRgb(s.a);
    const [r2, g2, b2] = hexToRgb(s.b);
    const lum = (0.2126 * (r1 + r2) + 0.7152 * (g1 + g2) + 0.0722 * (b1 + b2)) / 510;
    st.setProperty('--on-accent', lum > 0.52 ? '#0B0820' : '#FFFFFF');
    root.dataset.light = String(s.light);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', s.bg[0]);
  }

  layout(ringY: number, ringR: number): void {
    const st = document.documentElement.style;
    st.setProperty('--ring-y', `${ringY}px`);
    st.setProperty('--ring-r', `${ringR}px`);
  }

  // ---------------------------------------------------------------- screens

  private show(el: HTMLElement, on: boolean): void {
    el.classList.toggle('show', on);
  }

  showHome(on: boolean): void {
    this.show($('home'), on);
  }

  showHud(on: boolean): void {
    this.show($('hud'), on);
  }

  showReadyBar(on: boolean): void {
    this.show($('readybar'), on);
  }

  setHome(v: HomeView): void {
    this.setCoins(v.coins);
    $('home-best').innerHTML = v.best > 0 ? `${esc(v.bestLabel)} <b>${fmt(v.best)}</b>` : '';
    $('home-note').textContent = v.note;
    $('mode-info').innerHTML = v.modeInfo;
    document.querySelectorAll<HTMLElement>('.mode').forEach((b) => {
      const onMode = b.dataset.mode === v.mode;
      b.classList.toggle('on', onMode);
      b.setAttribute('aria-selected', String(onMode));
    });
    document.querySelector('.mode[data-mode="daily"]')?.classList.toggle('has-dot', v.dailyDot);
    $('btn-skins').classList.toggle('has-badge', v.badges.skins);
    $('btn-missions').classList.toggle('has-badge', v.badges.missions);
    $('btn-gift').classList.toggle('has-badge', v.badges.gift);
  }

  setCoins(n: number, bump = false): void {
    document.querySelectorAll<HTMLElement>('.coins-val').forEach((el) => {
      el.textContent = fmt(n);
    });
    if (bump) {
      const pill = $('home-coins');
      pill.classList.remove('bump');
      void pill.offsetWidth;
      pill.classList.add('bump');
    }
  }

  showPause(on: boolean, zen = false): void {
    this.show($('pause'), on);
    if (on) {
      $('btn-finish').style.display = zen ? '' : 'none';
      $('pause-sub').textContent = zen ? 'Breathe. Pop. Repeat.' : '';
    }
  }

  setSettings(s: Settings): void {
    $<HTMLInputElement>('set-music').checked = s.music;
    $<HTMLInputElement>('set-sfx').checked = s.sfx;
    $<HTMLInputElement>('set-haptics').checked = s.haptics;
    $<HTMLInputElement>('set-calm').checked = s.calm;
    $('pause-music').classList.toggle('off', !s.music);
    $('pause-sfx').classList.toggle('off', !s.sfx);
    $('pause-haptics').classList.toggle('off', !s.haptics);
  }

  setCredits(text: string): void {
    $('credits').innerHTML = text;
  }

  showRevive(cost: number, score: number, seconds: number, affordable: boolean): void {
    $('revive-cost').textContent = String(cost);
    $('revive-score').textContent = fmt(score);
    ($('btn-revive') as HTMLButtonElement).disabled = !affordable;
    this.show($('revive'), true);
    const bar = $('revive-bar');
    const total = 276.5;
    let prev = performance.now();
    let elapsed = 0;
    cancelAnimationFrame(this.reviveRaf);
    const step = (now: number): void => {
      // Clamped per-frame delta: time spent in another app does not count down the offer.
      elapsed += Math.min(100, Math.max(0, now - prev));
      prev = now;
      const k = Math.min(1, elapsed / (seconds * 1000));
      bar.style.strokeDashoffset = String(total * k);
      if (k >= 1) {
        this.h.onDecline();
        return;
      }
      this.reviveRaf = requestAnimationFrame(step);
    };
    this.reviveRaf = requestAnimationFrame(step);
  }

  hideRevive(): void {
    cancelAnimationFrame(this.reviveRaf);
    this.show($('revive'), false);
  }

  showResults(v: ResultsView): void {
    const kicker = $('res-kicker');
    kicker.textContent = v.isBest ? 'NEW BEST!' : v.mode === 'zen' ? 'SESSION COMPLETE' : 'GAME OVER';
    kicker.classList.toggle('best', v.isBest);
    $('res-cause').textContent = v.cause;
    $('res-best').textContent = v.best > 0 ? `${v.bestLabel} ${fmt(v.best)}` : '';
    $('res-nudge').textContent = v.nudge;
    $('st-pops').textContent = fmt(v.pops);
    $('st-perfect').textContent = `${v.perfectPct}%`;
    $('st-mult').textContent = `×${v.maxMult}`;
    $('res-coins').textContent = `+${fmt(v.coins)}`;
    const list = $('res-missions');
    list.innerHTML = '';
    v.missions.forEach((m, i) => {
      const li = document.createElement('li');
      li.style.animationDelay = `${0.35 + i * 0.12}s`;
      li.innerHTML = `${ICONS.check}<span>${esc(missionText(m))}</span><b>+${m.reward}${COIN}</b>`;
      list.appendChild(li);
    });
    v.skins.forEach((s, i) => {
      const li = document.createElement('li');
      li.className = 'skin';
      li.style.animationDelay = `${0.35 + (v.missions.length + i) * 0.12}s`;
      li.innerHTML = `${ICONS.palette}<span>New skin unlocked: <b>${esc(s.name)}</b></span>`;
      list.appendChild(li);
    });
    $('btn-again').classList.add('breathe');
    this.show($('results'), true);
    this.countUp($('res-score'), v.score);
  }

  hideResults(): void {
    cancelAnimationFrame(this.countRaf);
    this.show($('results'), false);
  }

  private countUp(el: HTMLElement, to: number): void {
    cancelAnimationFrame(this.countRaf);
    const start = performance.now();
    const dur = Math.min(1100, 350 + to * 4);
    const step = (now: number): void => {
      const k = Math.min(1, (now - start) / dur);
      el.textContent = fmt(Math.round(to * easeOutCubic(k)));
      if (k < 1) this.countRaf = requestAnimationFrame(step);
    };
    el.textContent = '0';
    this.countRaf = requestAnimationFrame(step);
  }

  showHowto(on: boolean, skin: Skin): void {
    this.howtoOpen = on;
    if (on) {
      document.querySelectorAll<HTMLCanvasElement>('canvas[data-demo]').forEach((c) => drawDemo(c, c.dataset.demo ?? 'ring', skin));
    }
    this.show($('howto'), on);
  }

  // ---------------------------------------------------------------- sheets

  openSheet(name: SheetName | null): void {
    this.sheet = name;
    for (const n of ['skins', 'missions', 'settings'] as const) $(`sheet-${n}`).classList.toggle('show', n === name);
    $('scrim').classList.toggle('show', name !== null);
  }

  renderSkins(save: SaveData, preview: string, confirm: string | null): void {
    const grid = $('skin-grid');
    if (!this.skinCards.size) {
      for (const s of SKINS) {
        const card = document.createElement('button');
        card.className = 'skin-card';
        card.setAttribute('aria-label', s.name);
        const c = document.createElement('canvas');
        drawSkinPreview(c, s);
        card.appendChild(c);
        card.insertAdjacentHTML('beforeend', `<h4>${esc(s.name)}</h4><div class="status"></div>`);
        card.addEventListener('click', () => this.h.onSkin(s.id));
        grid.appendChild(card);
        this.skinCards.set(s.id, card);
      }
    }
    for (const s of SKINS) {
      const card = this.skinCards.get(s.id) as HTMLElement;
      const owned = save.owned.includes(s.id);
      const equipped = save.skin === s.id;
      card.classList.toggle('equipped', equipped);
      card.classList.toggle('previewing', preview === s.id && !equipped);
      card.classList.toggle('locked', !owned);
      card.classList.toggle('confirm', confirm === s.id);
      const status = card.querySelector('.status') as HTMLElement;
      if (equipped) status.innerHTML = `${ICONS.check}Equipped`;
      else if (owned) status.textContent = preview === s.id ? 'Tap to equip' : 'Owned';
      else if (s.unlock.kind === 'coins') status.innerHTML = confirm === s.id ? `Buy for ${s.unlock.price}` : `${COIN}${fmt(s.unlock.price)}`;
      else if (s.unlock.kind === 'goal') {
        const [have, need] = goalProgress(s.unlock.goal, save);
        status.innerHTML = `${ICONS.lock}${esc(s.unlock.label)} · ${have}/${need}`;
      } else status.textContent = 'Free';
    }
  }

  shakeSkin(id: string): void {
    const card = this.skinCards.get(id);
    if (!card) return;
    card.classList.remove('shake');
    void card.offsetWidth;
    card.classList.add('shake');
  }

  renderMissions(save: SaveData, gift: GiftView): void {
    const g = $('gift-card');
    g.classList.toggle('ready', gift.ready);
    g.innerHTML = `<div class="gift-ico">${ICONS.gift}</div>
      <div class="gift-txt"><b>Daily gift</b><span>${
        gift.ready ? `Day ${gift.streak} streak · come back daily for more` : `Day ${gift.streak} claimed · next gift tomorrow`
      }</span></div>
      ${gift.ready ? `<button class="btn primary">+${gift.amount}${COIN}</button>` : `<button class="btn" disabled>${ICONS.check}</button>`}`;
    const list = $('mission-list');
    list.innerHTML = save.missions.active
      .map((m) => {
        const k = Math.min(1, m.progress / m.goal);
        const prog = MISSION_DEFS[m.kind].total ? `${fmt(m.progress)} / ${fmt(m.goal)}` : `best ${fmt(m.progress)} / ${fmt(m.goal)}`;
        return `<li class="mission"><div class="m-top"><span>${esc(missionText(m))}</span><b>+${m.reward}${COIN}</b></div>
          <div class="bar"><i style="width:${(k * 100).toFixed(1)}%"></i></div><div class="m-prog">${prog}</div></li>`;
      })
      .join('');
    const st = save.stats;
    const pct = st.pops ? Math.round((st.perfects / st.pops) * 100) : 0;
    const cells: [string, string][] = [
      [fmt(st.games), 'games'],
      [fmt(st.pops), 'pops'],
      [`${pct}%`, 'perfect'],
      [fmt(st.bestStreak), 'best streak'],
      [fmt(st.fevers), 'fevers'],
      [`${save.daily.bestStreak}`, 'daily streak'],
    ];
    $('stat-grid').innerHTML = cells.map(([b, s]) => `<div><b>${b}</b><span>${s}</span></div>`).join('');
  }

  private armReset(): void {
    const btn = $('btn-reset');
    const label = btn.querySelector('span') as HTMLElement;
    if (this.resetArmed && performance.now() - this.resetArmed < 3000) {
      this.resetArmed = 0;
      label.textContent = 'Reset progress';
      this.h.onReset();
      return;
    }
    this.resetArmed = performance.now();
    label.textContent = 'Tap again to erase everything';
    window.setTimeout(() => {
      if (this.resetArmed && performance.now() - this.resetArmed >= 2900) {
        this.resetArmed = 0;
        label.textContent = 'Reset progress';
      }
    }, 3000);
  }

  // ---------------------------------------------------------------- toasts

  toast(html: string): void {
    const box = $('toasts');
    while (box.childElementCount >= 3) box.firstElementChild?.remove();
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = html;
    box.appendChild(t);
    window.setTimeout(() => t.remove(), 3300);
  }
}

function drawSkinPreview(c: HTMLCanvasElement, s: Skin): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const size = 132;
  c.width = size * dpr;
  c.height = size * dpr;
  const ctx = c.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  const g = ctx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, s.bg[0]);
  g.addColorStop(1, s.bg[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = s.light ? 'source-over' : 'lighter';
  ctx.globalAlpha = s.light ? 0.5 : 0.35;
  ctx.drawImage(blobSprite(s.aurora[0]), -40, -50, 150, 150);
  ctx.drawImage(blobSprite(s.aurora[1]), 30, 30, 150, 150);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  const a = s.rainbow ? '#FF3D6E' : s.a;
  const b = s.rainbow ? '#3DC8FF' : s.b;
  drawRing(ctx, s.style, size / 2, size / 2, 36, a, b, 0.8, s.light);
}

function drawDemo(c: HTMLCanvasElement, kind: string, s: Skin): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const size = 60;
  c.width = size * dpr;
  c.height = size * dpr;
  const ctx = c.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const g = ctx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, s.bg[0]);
  g.addColorStop(1, s.bg[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const cx = size / 2;
  if (kind === 'bomb') {
    const t: Target = { id: 0, kind: 'bomb', power: null, x: cx, y: cx, vx: 0, vy: 0, r: 16, age: 1, life: Infinity, maxLife: Infinity, main: false, dying: 0, seed: 0 };
    drawBomb(ctx, t, 15, 0.4, s.light);
    return;
  }
  if (kind === 'power') {
    ctx.fillStyle = 'rgba(61,255,162,0.25)';
    ctx.beginPath();
    ctx.arc(cx, cx, 18, 0, Math.PI * 2);
    ctx.fill();
    drawPowerIcon(ctx, 'shield', cx, cx, 9, s.light ? '#16a36a' : '#FFFFFF');
    return;
  }
  if (kind === 'fever') {
    const colors = ['#FF3D6E', '#FFC23D', '#3DFFA2', '#3DC8FF', '#B03DFF'];
    colors.forEach((col, i) => {
      ctx.fillStyle = col;
      ctx.fillRect(8 + i * 9, 26, 8, 8);
    });
    ctx.strokeStyle = s.text;
    ctx.globalAlpha = 0.5;
    ctx.strokeRect(7.5, 25.5, 45, 9);
    ctx.globalAlpha = 1;
    return;
  }
  drawRing(ctx, s.style, cx, cx, 19, s.rainbow ? '#FF3D6E' : s.a, s.rainbow ? '#3DC8FF' : s.b, 0.8, s.light);
  if (kind === 'perfect') {
    ctx.fillStyle = DANGER;
    ctx.beginPath();
    ctx.arc(cx, cx, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = s.light ? '#111' : '#FFF';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx + 9, cx + 9);
    ctx.lineTo(cx + 3, cx + 3);
    ctx.stroke();
  }
}
