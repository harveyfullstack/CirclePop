import { hsl, rgba } from '../core/color';
import { clamp, TAU } from '../core/math';
import { DOUBLE_TIME, SLOW_TIME } from '../game/difficulty';
import type { Session } from '../game/session';
import type { PowerKind } from '../game/types';
import { POWER_COLORS, type Skin } from '../meta/skins';
import { FONT } from './floaters';
import { drawCoin } from './particles';
import { drawPowerIcon } from './targets';

type Ctx = CanvasRenderingContext2D;

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

export interface HudView {
  w: number;
  h: number;
  u: number;
  safeTop: number;
  time: number;
  alpha: number;
  skin: Skin;
  scoreBump: number;
  multBump: number;
  coinBump: number;
  coinsRun: number;
  best: number;
}

export function scoreY(h: number): number {
  return h * 0.45;
}

/** Giant score behind the circles (a nod to the original), with the multiplier pill underneath. */
export function drawBigScore(ctx: Ctx, s: Session, v: HudView): void {
  if (v.alpha <= 0.01) return;
  const { w, h, skin } = v;
  const size = clamp(Math.min(w, h) * 0.3, 96, 210);
  const y = scoreY(h);
  const txt = String(s.score);
  const sc = 1 + 0.16 * v.scoreBump;
  ctx.save();
  ctx.translate(w / 2, y);
  ctx.scale(sc, sc);
  ctx.font = `700 ${size.toFixed(0)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (s.feverActive) {
    const o = size * 0.03 + 2;
    ctx.globalCompositeOperation = skin.light ? 'source-over' : 'lighter';
    ctx.globalAlpha = v.alpha * 0.32;
    ctx.fillStyle = '#FF2A6D';
    ctx.fillText(txt, -o, 0);
    ctx.fillStyle = '#05D9E8';
    ctx.fillText(txt, o, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = v.alpha * 0.42;
    ctx.fillStyle = skin.light ? '#FFFFFF' : hsl(v.time * 200, 100, 88);
    ctx.fillText(txt, 0, 0);
  } else {
    ctx.globalAlpha = v.alpha * (0.2 + 0.3 * v.scoreBump);
    ctx.fillStyle = skin.text;
    ctx.fillText(txt, 0, 0);
  }
  ctx.restore();

  if (s.mult > 1) {
    const ms = size * 0.28 * (1 + 0.35 * v.multBump);
    const my = y + size * 0.64;
    const label = `×${s.mult}`;
    ctx.font = `700 ${ms.toFixed(1)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(label).width;
    const pw = tw + ms * 0.9;
    const ph = ms * 1.25;
    const hot = s.mult >= 5;
    const g = ctx.createLinearGradient(w / 2 - pw / 2, 0, w / 2 + pw / 2, 0);
    if (skin.rainbow || hot) {
      g.addColorStop(0, hsl(v.time * 220, 100, 60));
      g.addColorStop(1, hsl(v.time * 220 + 90, 100, 60));
    } else {
      g.addColorStop(0, skin.a);
      g.addColorStop(1, skin.b);
    }
    ctx.globalAlpha = v.alpha * 0.92;
    ctx.fillStyle = g;
    roundRect(ctx, w / 2 - pw / 2, my - ph / 2, pw, ph, ph / 2);
    ctx.fill();
    ctx.fillStyle = skin.light ? '#FFFFFF' : '#0B0820';
    ctx.fillText(label, w / 2, my + ms * 0.04);
    ctx.globalAlpha = 1;
  }
}

/** Fever meter, best score, run coins and active power-ups along the top. */
export function drawTopHud(ctx: Ctx, s: Session, v: HudView): void {
  if (v.alpha <= 0.01) return;
  const { w, u, skin } = v;
  const text = skin.text;
  const rowY = v.safeTop + 12 * u + 21 * u;

  // Fever meter.
  const bw = Math.min(w * 0.44, 220 * u);
  const bh = 10 * u;
  const bx = (w - bw) / 2;
  const by = rowY - bh / 2;
  ctx.globalAlpha = v.alpha;
  ctx.fillStyle = rgba(text, 0.14);
  roundRect(ctx, bx, by, bw, bh, bh / 2);
  ctx.fill();
  const m = clamp(s.feverMeter, 0, 1);
  if (m > 0.001) {
    const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    if (s.feverActive || skin.rainbow) {
      for (let i = 0; i <= 4; i++) g.addColorStop(i / 4, hsl(v.time * 300 + i * 70, 100, 62));
    } else {
      g.addColorStop(0, skin.a);
      g.addColorStop(1, skin.b);
    }
    ctx.fillStyle = g;
    roundRect(ctx, bx, by, Math.max(bh, bw * m), bh, bh / 2);
    ctx.fill();
    if (!s.feverActive && m > 0.7) {
      // "Almost there" shimmer.
      const sx = bx + ((v.time * 1.4) % 1) * bw * m;
      const sg = ctx.createLinearGradient(sx - 30 * u, 0, sx + 30 * u, 0);
      sg.addColorStop(0, 'rgba(255,255,255,0)');
      sg.addColorStop(0.5, 'rgba(255,255,255,0.7)');
      sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sg;
      roundRect(ctx, bx, by, bw * m, bh, bh / 2);
      ctx.fill();
    }
  }
  ctx.font = `700 ${(10 * u).toFixed(1)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const labelY = by + bh + 12 * u;
  if (s.feverActive) {
    const pulse = 1 + 0.12 * Math.abs(Math.sin(v.time * 9));
    ctx.save();
    ctx.translate(w / 2, labelY + 1 * u);
    ctx.scale(pulse, pulse);
    ctx.font = `700 ${(13 * u).toFixed(1)}px ${FONT}`;
    ctx.fillStyle = hsl(v.time * 300, 100, skin.light ? 45 : 70);
    ctx.fillText('FEVER ×2', 0, 0);
    ctx.restore();
  } else {
    ctx.globalAlpha = v.alpha * 0.55;
    ctx.fillStyle = text;
    ctx.fillText(m > 0.7 ? 'FEVER — ALMOST!' : 'FEVER', w / 2, labelY);
  }

  // Best score / new best.
  ctx.globalAlpha = v.alpha * (s.beatBest ? 1 : 0.7);
  ctx.font = `600 ${(13 * u).toFixed(1)}px ${FONT}`;
  if (s.beatBest) {
    ctx.fillStyle = skin.light ? '#E0006A' : hsl(v.time * 180, 100, 72);
    ctx.fillText('NEW BEST!', w / 2, labelY + 18 * u);
  } else if (v.best > 0) {
    ctx.fillStyle = text;
    ctx.fillText(`BEST ${v.best}`, w / 2, labelY + 18 * u);
  }

  // Coins earned this run (top right).
  if (s.mode !== 'zen') {
    const cs = 1 + 0.3 * v.coinBump;
    const cr = 9 * u * cs;
    ctx.globalAlpha = v.alpha;
    ctx.font = `700 ${(17 * u * cs).toFixed(1)}px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = text;
    const right = w - 16 * u;
    ctx.fillText(String(v.coinsRun), right, rowY + 1 * u);
    const tw = ctx.measureText(String(v.coinsRun)).width;
    drawCoin(ctx, right - tw - cr - 6 * u, rowY, cr);
  }

  // Active power-ups under the pause button.
  const chips: { kind: PowerKind; frac: number }[] = [];
  if (s.shield) chips.push({ kind: 'shield', frac: 1 });
  if (s.slowTime > 0) chips.push({ kind: 'slow', frac: s.slowTime / SLOW_TIME });
  if (s.doubleTime > 0) chips.push({ kind: 'double', frac: s.doubleTime / DOUBLE_TIME });
  let cx = 16 * u + 16 * u;
  const cy = rowY + 42 * u;
  for (const c of chips) {
    const col = POWER_COLORS[c.kind];
    const r = 15 * u;
    const warn = c.kind !== 'shield' && c.frac < 0.25 && Math.sin(v.time * 20) < 0;
    ctx.globalAlpha = v.alpha * (warn ? 0.4 : 1);
    ctx.fillStyle = rgba(col, 0.25);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 3 * u;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + TAU * c.frac);
    ctx.stroke();
    ctx.lineCap = 'butt';
    drawPowerIcon(ctx, c.kind, cx, cy, r * 0.5, skin.light ? col : '#FFFFFF');
    cx += r * 2 + 8 * u;
  }
  ctx.globalAlpha = 1;
}
