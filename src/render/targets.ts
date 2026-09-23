import { hsl, rgba } from '../core/color';
import { easeOutBack, TAU } from '../core/math';
import { PERFECT_FRAC } from '../game/difficulty';
import { DIE_TIME } from '../game/session';
import type { PowerKind, Target } from '../game/types';
import { DANGER, GOLD, POWER_COLORS, type RingStyle, type Skin } from '../meta/skins';
import { FONT } from './floaters';
import { glowSprite, pixelRingSprite, ringGlowSprite } from './sprites';

export interface TargetView {
  time: number;
  /** 1 on the beat, decays to 0. */
  beat: number;
  timerFrac: number;
  showTimer: boolean;
  fever: boolean;
}

type Ctx = CanvasRenderingContext2D;

/** Colors for a poppable target in the current skin (gold and rainbow override the skin). */
function targetColors(t: Target, skin: Skin, time: number): [string, string] {
  if (t.kind === 'gold') return skin.light ? [GOLD.b, '#E07B00'] : [GOLD.a, GOLD.b];
  if (skin.rainbow) {
    const h = time * 90 + t.seed * 57;
    return [hsl(h, 100, 62), hsl(h + 140, 100, 62)];
  }
  return [skin.a, skin.b];
}

export function drawTargets(ctx: Ctx, targets: readonly Target[], skin: Skin, v: TargetView): void {
  // Hazards first so the thing you want is always on top.
  for (const t of targets) if (t.kind === 'bomb') drawOne(ctx, t, skin, v);
  for (const t of targets) if (t.kind === 'power') drawOne(ctx, t, skin, v);
  for (const t of targets) if (t.kind === 'normal' || t.kind === 'gold') drawOne(ctx, t, skin, v);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function drawOne(ctx: Ctx, t: Target, skin: Skin, v: TargetView): void {
  const spawn = Math.min(1, t.age / 0.24);
  let scale = spawn < 1 ? Math.max(0, easeOutBack(spawn, 2.2)) : 1;
  let alpha = 1;
  if (t.dying > 0) {
    const k = Math.min(1, t.dying / DIE_TIME);
    scale *= 1 - 0.45 * k;
    alpha = 1 - k;
  }
  if (alpha <= 0.01 || scale <= 0.01) return;
  ctx.globalAlpha = alpha;
  if (t.kind === 'bomb') {
    const wobble = 1 + 0.05 * Math.sin(v.time * 7 + t.seed * 3);
    drawBomb(ctx, t, t.r * scale * wobble, v.time, skin.light);
    return;
  }
  if (t.kind === 'power') {
    drawPower(ctx, t, t.r * scale * (1 + 0.06 * v.beat), v.time, skin.light);
    return;
  }
  const R = t.r * scale * (0.93 + 0.07 * v.beat);
  const [a, b] = targetColors(t, skin, v.time);
  if (t.kind === 'gold') drawRays(ctx, t.x, t.y, R, v.time, skin.light);
  drawRing(ctx, skin.style, t.x, t.y, R, a, b, v.time * 1.7 + t.seed, skin.light, alpha);
  if (t.kind === 'gold') drawSparkles(ctx, t, R, v.time, skin.light);
  if (v.showTimer && t.main && t.dying === 0) drawTimer(ctx, t.x, t.y, R, v, skin, alpha);
}

/** `inner: false` skips the bullseye markings (used behind text on the share card). */
export function drawRing(ctx: Ctx, style: RingStyle, x: number, y: number, R: number, a: string, b: string, rot: number, light: boolean, alpha = 1, inner = true): void {
  switch (style) {
    case 'neon':
      return neon(ctx, x, y, R, a, b, rot, light, alpha, inner);
    case 'bubble':
      return bubble(ctx, x, y, R, a, b, rot, light, inner);
    case 'orb':
      return orb(ctx, x, y, R, a, b, light, alpha, inner);
    case 'pixel':
      return pixel(ctx, x, y, R, a, b, light, alpha);
    case 'flat':
      return flat(ctx, x, y, R, a, inner);
  }
}

function glow(ctx: Ctx, sprite: HTMLCanvasElement, x: number, y: number, S: number, amount: number, light: boolean, alpha: number): void {
  ctx.globalCompositeOperation = light ? 'source-over' : 'lighter';
  ctx.globalAlpha = alpha * amount * (light ? 0.5 : 1);
  ctx.drawImage(sprite, x - S, y - S, S * 2, S * 2);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = alpha;
}

function neon(ctx: Ctx, x: number, y: number, R: number, a: string, b: string, rot: number, light: boolean, alpha: number, inner: boolean): void {
  glow(ctx, ringGlowSprite(a), x, y, (R * 0.86) / 0.45, 0.95, light, alpha);
  const gx = Math.cos(rot) * R;
  const gy = Math.sin(rot) * R;
  const grad = ctx.createLinearGradient(x - gx, y - gy, x + gx, y + gy);
  grad.addColorStop(0, a);
  grad.addColorStop(1, b);
  ctx.strokeStyle = grad;
  ctx.lineWidth = R * 0.2;
  ctx.beginPath();
  ctx.arc(x, y, R * 0.86, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = light ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.72)';
  ctx.lineWidth = R * 0.05;
  ctx.stroke();
  if (!inner) return;
  ctx.fillStyle = rgba(a, light ? 0.14 : 0.1);
  ctx.beginPath();
  ctx.arc(x, y, R * PERFECT_FRAC, 0, TAU);
  ctx.fill();
  ctx.fillStyle = light ? b : '#FFFFFF';
  ctx.beginPath();
  ctx.arc(x, y, R * 0.1, 0, TAU);
  ctx.fill();
}

function bubble(ctx: Ctx, x: number, y: number, R: number, a: string, b: string, rot: number, light: boolean, inner: boolean): void {
  const g = ctx.createRadialGradient(x - R * 0.3, y - R * 0.35, R * 0.05, x, y, R);
  g.addColorStop(0, 'rgba(255,255,255,0.12)');
  g.addColorStop(0.62, rgba(a, light ? 0.2 : 0.13));
  g.addColorStop(0.9, rgba(b, light ? 0.6 : 0.45));
  g.addColorStop(1, light ? rgba(b, 0.9) : 'rgba(255,255,255,0.8)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, R, 0, TAU);
  ctx.fill();
  if (typeof ctx.createConicGradient === 'function') {
    const cg = ctx.createConicGradient(rot, x, y);
    cg.addColorStop(0, a);
    cg.addColorStop(0.3, light ? '#FFFFFF' : '#FFFFFF');
    cg.addColorStop(0.55, b);
    cg.addColorStop(0.8, '#FFD6F5');
    cg.addColorStop(1, a);
    ctx.strokeStyle = cg;
  } else {
    ctx.strokeStyle = a;
  }
  ctx.lineWidth = R * 0.08;
  ctx.beginPath();
  ctx.arc(x, y, R * 0.955, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.beginPath();
  ctx.ellipse(x - R * 0.4, y - R * 0.42, R * 0.2, R * 0.1, -0.75, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x - R * 0.1, y - R * 0.62, R * 0.05, 0, TAU);
  ctx.fill();
  if (!inner) return;
  const mark = light ? b : '#FFFFFF';
  ctx.strokeStyle = rgba(mark, 0.45);
  ctx.lineWidth = Math.max(1, R * 0.03);
  ctx.beginPath();
  ctx.arc(x, y, R * PERFECT_FRAC, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = rgba(mark, 0.85);
  ctx.beginPath();
  ctx.arc(x, y, R * 0.08, 0, TAU);
  ctx.fill();
}

function orb(ctx: Ctx, x: number, y: number, R: number, a: string, b: string, light: boolean, alpha: number, inner: boolean): void {
  glow(ctx, glowSprite(a), x, y, R * 1.9, 0.7, light, alpha);
  const g = ctx.createRadialGradient(x - R * 0.3, y - R * 0.34, R * 0.04, x, y, R * 0.92);
  g.addColorStop(0, '#FFFFFF');
  g.addColorStop(0.28, a);
  g.addColorStop(1, b);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, R * 0.9, 0, TAU);
  ctx.fill();
  if (!inner) return;
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = Math.max(1, R * 0.035);
  ctx.beginPath();
  ctx.arc(x, y, R * PERFECT_FRAC, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(x, y, R * 0.07, 0, TAU);
  ctx.fill();
}

function pixel(ctx: Ctx, x: number, y: number, R: number, a: string, b: string, light: boolean, alpha: number): void {
  glow(ctx, glowSprite(a), x, y, R * 1.6, 0.45, light, alpha);
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(pixelRingSprite(a, b), x - R, y - R, R * 2, R * 2);
  ctx.imageSmoothingEnabled = smooth;
}

function flat(ctx: Ctx, x: number, y: number, R: number, a: string, inner: boolean): void {
  ctx.strokeStyle = a;
  ctx.lineWidth = R * 0.22;
  ctx.beginPath();
  ctx.arc(x, y, R * 0.82, 0, TAU);
  ctx.stroke();
  if (!inner) return;
  ctx.fillStyle = rgba(a, 0.3);
  ctx.beginPath();
  ctx.arc(x, y, R * 0.08, 0, TAU);
  ctx.fill();
}

function drawTimer(ctx: Ctx, x: number, y: number, R: number, v: TargetView, skin: Skin, alpha: number): void {
  const f = v.timerFrac;
  const rr = R * 1.2;
  const lw = Math.max(2.5, R * 0.08);
  ctx.lineCap = 'round';
  ctx.lineWidth = lw;
  ctx.strokeStyle = skin.light ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.13)';
  ctx.beginPath();
  ctx.arc(x, y, rr, 0, TAU);
  ctx.stroke();
  let col = skin.timer ?? (skin.rainbow ? hsl(v.time * 90, 100, 62) : skin.a);
  if (f < 0.25) {
    col = DANGER;
    if (Math.sin(v.time * 30) < -0.2) ctx.globalAlpha = alpha * 0.45;
  } else if (f < 0.5) {
    col = '#FFB020';
  }
  ctx.strokeStyle = col;
  ctx.beginPath();
  ctx.arc(x, y, rr, -Math.PI / 2, -Math.PI / 2 + TAU * f);
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.globalAlpha = alpha;
}

function drawRays(ctx: Ctx, x: number, y: number, R: number, time: number, light: boolean): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(time * 0.7);
  const g = ctx.createRadialGradient(0, 0, R * 0.4, 0, 0, R * 2.1);
  g.addColorStop(0, rgba(GOLD.glow, 0.5));
  g.addColorStop(1, rgba(GOLD.glow, 0));
  ctx.fillStyle = g;
  ctx.globalCompositeOperation = light ? 'source-over' : 'lighter';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, R * 2.1, a - 0.1, a + 0.1);
    ctx.closePath();
  }
  ctx.fill();
  ctx.restore();
}

function drawSparkles(ctx: Ctx, t: Target, R: number, time: number, light: boolean): void {
  ctx.globalCompositeOperation = light ? 'source-over' : 'lighter';
  const base = ctx.globalAlpha;
  for (let i = 0; i < 3; i++) {
    const ph = time * 1.6 + i * 2.1 + t.seed;
    const k = (Math.sin(ph * 2.3) + 1) / 2;
    const a = ph * 0.9 + i;
    const d = R * (0.9 + 0.35 * Math.sin(ph));
    const s = R * 0.22 * k;
    ctx.globalAlpha = base * k;
    ctx.drawImage(glowSprite('#FFF6C8'), t.x + Math.cos(a) * d - s, t.y + Math.sin(a) * d - s, s * 2, s * 2);
  }
  ctx.globalAlpha = base;
  ctx.globalCompositeOperation = 'source-over';
}

export function drawBomb(ctx: Ctx, t: Target, R: number, time: number, light: boolean): void {
  const alpha = ctx.globalAlpha;
  const blink = 0.5 + 0.5 * Math.sin(time * 10 + t.seed * 3);
  glow(ctx, glowSprite(DANGER), t.x, t.y, R * 2.1, light ? 0.5 : 0.35 + 0.35 * blink, light, alpha);
  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.rotate(time * 0.9 + t.seed);
  ctx.fillStyle = DANGER;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    ctx.moveTo(Math.cos(a - 0.27) * R * 0.7, Math.sin(a - 0.27) * R * 0.7);
    ctx.lineTo(Math.cos(a) * R * 1.14, Math.sin(a) * R * 1.14);
    ctx.lineTo(Math.cos(a + 0.27) * R * 0.7, Math.sin(a + 0.27) * R * 0.7);
  }
  ctx.fill();
  const g = ctx.createRadialGradient(-R * 0.25, -R * 0.3, R * 0.05, 0, 0, R * 0.82);
  g.addColorStop(0, '#5a2438');
  g.addColorStop(1, '#16070d');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.8, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = DANGER;
  ctx.lineWidth = R * 0.08;
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = rgba(DANGER, 0.45 + 0.55 * blink);
  ctx.beginPath();
  ctx.arc(t.x, t.y, R * 0.34, 0, TAU);
  ctx.fill();
  const k = R * 0.15;
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = R * 0.09;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(t.x - k, t.y - k);
  ctx.lineTo(t.x + k, t.y + k);
  ctx.moveTo(t.x + k, t.y - k);
  ctx.lineTo(t.x - k, t.y + k);
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.globalAlpha = alpha;
}

function drawPower(ctx: Ctx, t: Target, R: number, time: number, light: boolean): void {
  const kind = t.power ?? 'shield';
  const col = POWER_COLORS[kind];
  const alpha = ctx.globalAlpha * (t.life < 1 && Math.sin(time * 28) < 0 ? 0.35 : 1);
  glow(ctx, glowSprite(col), t.x, t.y, R * 2.2, 0.6, light, alpha);
  ctx.fillStyle = rgba(col, light ? 0.3 : 0.2);
  ctx.beginPath();
  ctx.arc(t.x, t.y, R * 0.92, 0, TAU);
  ctx.fill();
  ctx.setLineDash([R * 0.38, R * 0.22]);
  ctx.lineDashOffset = -time * R * 1.6;
  ctx.strokeStyle = col;
  ctx.lineWidth = R * 0.11;
  ctx.stroke();
  ctx.setLineDash([]);
  const lifeFrac = Math.max(0, t.life / t.maxLife);
  ctx.strokeStyle = light ? rgba(col, 0.9) : 'rgba(255,255,255,0.6)';
  ctx.lineWidth = R * 0.05;
  ctx.beginPath();
  ctx.arc(t.x, t.y, R * 0.72, -Math.PI / 2, -Math.PI / 2 + TAU * lifeFrac);
  ctx.stroke();
  drawPowerIcon(ctx, kind, t.x, t.y, R * 0.42, light ? col : '#FFFFFF');
  ctx.globalAlpha = alpha;
}

export function drawPowerIcon(ctx: Ctx, kind: PowerKind, x: number, y: number, s: number, color: string): void {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  if (kind === 'shield') {
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.lineTo(x + s * 0.82, y - s * 0.62);
    ctx.lineTo(x + s * 0.82, y + s * 0.02);
    ctx.quadraticCurveTo(x + s * 0.78, y + s * 0.72, x, y + s * 1.02);
    ctx.quadraticCurveTo(x - s * 0.78, y + s * 0.72, x - s * 0.82, y + s * 0.02);
    ctx.lineTo(x - s * 0.82, y - s * 0.62);
    ctx.closePath();
    ctx.fill();
  } else if (kind === 'slow') {
    ctx.lineWidth = s * 0.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - s * 0.72, y - s * 0.95);
    ctx.lineTo(x + s * 0.72, y - s * 0.95);
    ctx.moveTo(x - s * 0.72, y + s * 0.95);
    ctx.lineTo(x + s * 0.72, y + s * 0.95);
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(x - s * 0.56, y - s * 0.82);
    ctx.lineTo(x + s * 0.56, y - s * 0.82);
    ctx.lineTo(x + s * 0.06, y);
    ctx.lineTo(x + s * 0.56, y + s * 0.82);
    ctx.lineTo(x - s * 0.56, y + s * 0.82);
    ctx.lineTo(x - s * 0.06, y);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.font = `700 ${(s * 1.6).toFixed(1)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('×2', x, y + s * 0.08);
  }
}
