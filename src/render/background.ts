import { hsl, mix, rgba } from '../core/color';
import { TAU } from '../core/math';
import type { Skin } from '../meta/skins';
import { blobSprite, glowSprite, scanlineTile, vignetteSprite } from './sprites';

export interface BgState {
  /** 1 on the beat, decays to 0. */
  beat: number;
  /** 0..1 position inside the current beat. */
  beatPhase: number;
  /** Draw expanding beat rings (only while playing). */
  pulse: boolean;
  /** 0..1 combo heat. */
  heat: number;
  /** 0..1 fever amount (eased in/out). */
  fever: number;
  /** 0..1 timer danger. */
  danger: number;
  /** 0..1 slow-motion tint. */
  slow: number;
  u: number;
}

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  tw: number;
  color: string;
}

interface Streak {
  a: number;
  d: number;
  v: number;
  hue: number;
}

export class Background {
  private w = 1;
  private h = 1;
  private skin: Skin | null = null;
  private grad: CanvasGradient | null = null;
  private motes: Mote[] = [];
  private streaks: Streak[] = [];
  private vig: HTMLCanvasElement | null = null;
  private scan: CanvasPattern | null = null;
  private gridOffset = 0;
  private warpSpeed = 0;
  private shooting = { x: 0, y: 0, vx: 0, vy: 0, life: 0 };

  setSkin(skin: Skin): void {
    this.skin = skin;
    this.grad = null;
    this.seedMotes();
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.grad = null;
    this.vig = null;
    this.seedMotes();
  }

  private seedMotes(): void {
    const s = this.skin;
    if (!s) return;
    const n = s.deco === 'stars' ? 80 : s.deco === 'bubbles' ? 18 : s.deco === 'dust' ? 36 : 0;
    this.motes = [];
    for (let i = 0; i < n; i++) this.motes.push(this.newMote(true));
    if (!this.streaks.length) {
      for (let i = 0; i < 56; i++) this.streaks.push({ a: Math.random() * TAU, d: Math.random() * 600, v: 0.6 + Math.random(), hue: Math.random() * 360 });
    }
  }

  private newMote(anywhere: boolean): Mote {
    const s = this.skin as Skin;
    const color = s.particles[(Math.random() * s.particles.length) | 0];
    const x = Math.random() * this.w;
    if (s.deco === 'bubbles') {
      return { x, y: anywhere ? Math.random() * this.h : this.h + 20, vx: 0, vy: -(16 + Math.random() * 36), size: 3 + Math.random() * 12, tw: Math.random() * TAU, color };
    }
    if (s.deco === 'stars') {
      return { x, y: Math.random() * this.h, vx: 0, vy: 2 + Math.random() * 5, size: 0.5 + Math.random() * 1.5, tw: Math.random() * TAU, color: Math.random() < 0.75 ? '#FFFFFF' : color };
    }
    return { x, y: anywhere ? Math.random() * this.h : this.h + 10, vx: (Math.random() - 0.5) * 8, vy: -(6 + Math.random() * 22), size: 0.8 + Math.random() * 2.2, tw: Math.random() * TAU, color };
  }

  draw(ctx: CanvasRenderingContext2D, time: number, dt: number, st: BgState): void {
    const s = this.skin;
    if (!s) return;
    const { w, h } = this;
    const u = st.u;
    const add = !s.light;

    if (!this.grad) {
      this.grad = ctx.createLinearGradient(0, 0, 0, h);
      this.grad.addColorStop(0, s.bg[0]);
      this.grad.addColorStop(1, s.bg[1]);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.grad;
    ctx.fillRect(0, 0, w, h);

    // Aurora blobs drifting slowly, breathing with the beat.
    ctx.globalCompositeOperation = add ? 'lighter' : 'source-over';
    const R = Math.max(w, h) * 0.62;
    for (let i = 0; i < 3; i++) {
      const ph = i * 2.1;
      const x = w * (0.5 + 0.42 * Math.sin(time * (0.05 + i * 0.013) + ph));
      const y = h * (0.45 + 0.38 * Math.cos(time * (0.04 + i * 0.011) + ph * 1.3));
      const r = R * (0.85 + 0.15 * Math.sin(time * 0.3 + i)) * (1 + st.beat * 0.035);
      ctx.globalAlpha = Math.min(1, (add ? 0.2 : 0.42) + st.heat * (add ? 0.16 : 0.1) + st.fever * 0.14);
      ctx.drawImage(blobSprite(s.aurora[i]), x - r, y - r, r * 2, r * 2);
    }

    this.drawDeco(ctx, s, time, dt, st, add);

    // Beat rings radiating from the center.
    if (st.pulse) {
      const p = st.beatPhase;
      const rr = (0.12 + 0.88 * p) * Math.max(w, h) * 0.72;
      ctx.globalCompositeOperation = add ? 'lighter' : 'source-over';
      ctx.globalAlpha = (1 - p) * (1 - p) * (0.07 + st.heat * 0.08 + st.fever * 0.1);
      ctx.strokeStyle = st.fever > 0.1 ? hsl(time * 240, 100, 65) : s.a;
      ctx.lineWidth = (2 + st.heat * 3) * u;
      ctx.beginPath();
      ctx.arc(w / 2, h * 0.46, rr, 0, TAU);
      ctx.stroke();
    }

    // FEVER: hyperspace streaks + color wash.
    const warpTarget = st.fever > 0.05 ? 1 : 0;
    this.warpSpeed += (warpTarget - this.warpSpeed) * Math.min(1, dt * (warpTarget ? 3 : 6));
    if (this.warpSpeed > 0.02) {
      const cx = w / 2;
      const cy = h * 0.46;
      const maxD = Math.hypot(w, h) * 0.6;
      ctx.globalCompositeOperation = add ? 'lighter' : 'source-over';
      ctx.lineCap = 'round';
      for (const k of this.streaks) {
        k.d += (120 + k.d * 2.4) * k.v * dt * this.warpSpeed;
        if (k.d > maxD) {
          k.d = 20 + Math.random() * 60;
          k.a = Math.random() * TAU;
          k.hue = Math.random() * 360;
        }
        const len = 10 + k.d * 0.22;
        const c = Math.cos(k.a);
        const sn = Math.sin(k.a);
        ctx.globalAlpha = this.warpSpeed * Math.min(1, k.d / 160) * 0.7;
        ctx.strokeStyle = hsl(k.hue + time * 120, 100, 70);
        ctx.lineWidth = (1 + k.d / maxD * 3) * u;
        ctx.beginPath();
        ctx.moveTo(cx + c * k.d, cy + sn * k.d);
        ctx.lineTo(cx + c * (k.d - len), cy + sn * (k.d - len));
        ctx.stroke();
      }
      ctx.globalAlpha = this.warpSpeed * 0.1;
      ctx.fillStyle = hsl(time * 90, 100, 55);
      ctx.fillRect(0, 0, w, h);
    }

    if (st.slow > 0.01) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = st.slow * 0.14;
      ctx.fillStyle = '#58B7FF';
      ctx.fillRect(0, 0, w, h);
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Red edges when the timer is about to run out. */
  drawDanger(ctx: CanvasRenderingContext2D, time: number, danger: number): void {
    if (danger <= 0.01) return;
    if (!this.vig) this.vig = vignetteSprite(this.w, this.h, '#FF1E3C');
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = Math.min(1, danger * (0.5 + 0.22 * Math.sin(time * 14)));
    ctx.drawImage(this.vig, 0, 0, this.w, this.h);
    ctx.globalAlpha = 1;
  }

  /** CRT scanlines for the Arcade skin; drawn over the playfield. */
  drawOverlay(ctx: CanvasRenderingContext2D): void {
    if (this.skin?.deco !== 'scan') return;
    if (!this.scan) this.scan = ctx.createPattern(scanlineTile(), 'repeat');
    if (!this.scan) return;
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = this.scan;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.globalAlpha = 1;
  }

  private drawDeco(ctx: CanvasRenderingContext2D, s: Skin, time: number, dt: number, st: BgState, add: boolean): void {
    const { w, h } = this;
    const u = st.u;
    const speed = 1 + st.heat * 1.5 + st.fever * 4;
    if (s.deco === 'grid') {
      this.drawGrid(ctx, s, dt, st);
      return;
    }
    if (!this.motes.length) return;
    ctx.globalCompositeOperation = add ? 'lighter' : 'source-over';
    if (s.deco === 'bubbles') {
      ctx.lineWidth = 1.2 * u;
      for (const m of this.motes) {
        m.y += m.vy * dt * speed;
        m.x += Math.sin(time * 1.3 + m.tw) * 12 * dt;
        if (m.y < -20) Object.assign(m, this.newMote(false));
        ctx.globalAlpha = add ? 0.22 : 0.35;
        ctx.strokeStyle = add ? '#FFFFFF' : m.color;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.size * u, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = add ? 0.35 : 0.5;
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(m.x - m.size * 0.35 * u, m.y - m.size * 0.35 * u, m.size * 0.18 * u, 0, TAU);
        ctx.fill();
      }
      return;
    }
    if (s.deco === 'stars') {
      for (const m of this.motes) {
        m.y += m.vy * dt * speed;
        if (m.y > h + 4) {
          m.y = -4;
          m.x = Math.random() * w;
        }
        const tw = 0.45 + 0.55 * Math.abs(Math.sin(time * 1.7 + m.tw));
        const r = m.size * u * (1.8 + st.beat * 0.6);
        ctx.globalAlpha = tw;
        ctx.drawImage(glowSprite(m.color), m.x - r, m.y - r, r * 2, r * 2);
      }
      // Occasional shooting star.
      const sh = this.shooting;
      if (sh.life <= 0 && Math.random() < dt * 0.12) {
        sh.x = Math.random() * w * 0.8;
        sh.y = Math.random() * h * 0.4;
        sh.vx = (500 + Math.random() * 300) * u;
        sh.vy = (180 + Math.random() * 120) * u;
        sh.life = 0.7;
      }
      if (sh.life > 0) {
        sh.life -= dt;
        sh.x += sh.vx * dt;
        sh.y += sh.vy * dt;
        const g = ctx.createLinearGradient(sh.x, sh.y, sh.x - sh.vx * 0.18, sh.y - sh.vy * 0.18);
        g.addColorStop(0, 'rgba(255,255,255,0.9)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.globalAlpha = Math.min(1, sh.life * 3);
        ctx.strokeStyle = g;
        ctx.lineWidth = 2 * u;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(sh.x, sh.y);
        ctx.lineTo(sh.x - sh.vx * 0.18, sh.y - sh.vy * 0.18);
        ctx.stroke();
      }
      return;
    }
    // Dust motes.
    for (const m of this.motes) {
      m.y += m.vy * dt * speed;
      m.x += m.vx * dt;
      if (m.y < -10) Object.assign(m, this.newMote(false));
      const tw = 0.35 + 0.45 * Math.abs(Math.sin(time * 1.3 + m.tw));
      const r = m.size * u * 2.2;
      ctx.globalAlpha = tw * (add ? 0.75 : 0.5);
      ctx.drawImage(glowSprite(m.color), m.x - r, m.y - r, r * 2, r * 2);
    }
  }

  private drawGrid(ctx: CanvasRenderingContext2D, s: Skin, dt: number, st: BgState): void {
    const { w, h } = this;
    const u = st.u;
    const horizon = h * 0.64;
    const gh = h - horizon;
    // Retro sun sitting on the horizon.
    const sr = Math.min(w * 0.34, h * 0.22);
    const sg = ctx.createLinearGradient(0, horizon - sr, 0, horizon);
    sg.addColorStop(0, s.a);
    sg.addColorStop(1, s.b);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.28 + st.beat * 0.06 + st.fever * 0.15;
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(w / 2, horizon, sr, Math.PI, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.beginPath();
    ctx.arc(w / 2, horizon, sr + 1, Math.PI, TAU);
    ctx.clip();
    for (let i = 0; i < 5; i++) {
      const y = horizon - sr * (0.08 + i * 0.13);
      ctx.fillStyle = mix(s.bg[0], s.bg[1], y / h);
      ctx.fillRect(w / 2 - sr - 2, y, sr * 2 + 4, (1.4 + i * 0.9) * u);
    }
    ctx.restore();
    // Floor.
    this.gridOffset = (this.gridOffset + dt * (0.35 + st.heat * 0.6 + st.fever * 1.8)) % 1;
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = s.b;
    ctx.lineWidth = 1.4 * u;
    for (let i = 0; i < 12; i++) {
      const z = (i + this.gridOffset) / 12;
      const y = horizon + gh * z * z;
      ctx.globalAlpha = 0.08 + 0.3 * z;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.22;
    ctx.beginPath();
    for (let i = -9; i <= 9; i++) {
      ctx.moveTo(w / 2 + i * w * 0.018, horizon);
      ctx.lineTo(w / 2 + i * w * 0.2, h);
    }
    ctx.stroke();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = rgba(s.a, 0.8);
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    ctx.lineTo(w, horizon);
    ctx.stroke();
  }
}
