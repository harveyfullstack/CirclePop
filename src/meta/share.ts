import { rgba } from '../core/color';
import type { ModeId } from '../game/types';
import { isNative } from '../platform/native';
import { FONT } from '../render/floaters';
import { blobSprite, glowSprite, makeCanvas } from '../render/sprites';
import { drawRing } from '../render/targets';
import type { Skin } from './skins';

export interface ShareInfo {
  score: number;
  isBest: boolean;
  mode: ModeId;
  pops: number;
  perfectPct: number;
  maxMult: number;
  fevers: number;
  history: string;
  dailyNo: number;
  dailyName: string;
  skin: Skin;
}

/** Wordle-style run summary: 10 segments coloured by how clean they were. */
export function emojiRow(history: string): string {
  if (!history) return '';
  const n = Math.min(10, history.length);
  let out = '';
  for (let i = 0; i < n; i++) {
    const seg = history.slice(Math.floor((i * history.length) / n), Math.floor(((i + 1) * history.length) / n));
    const perfect = [...seg].filter((c) => c === 'p' || c === 'o').length / Math.max(1, seg.length);
    out += seg.includes('o') ? '🟡' : perfect >= 0.7 ? '🟣' : perfect >= 0.4 ? '🔵' : '⚪';
  }
  return out + '💥';
}

export function shareText(i: ShareInfo): string {
  const head =
    i.mode === 'daily' ? `CirclePop Daily #${i.dailyNo} · ${i.dailyName}` : i.mode === 'zen' ? 'CirclePop Zen' : 'CirclePop';
  const lines = [
    `${head}: ${i.score}${i.isBest ? ' (new best!)' : ''}`,
    i.mode === 'zen' ? '' : emojiRow(i.history),
    `🎯 ${i.perfectPct}% perfect · ⚡ ×${i.maxMult}${i.fevers ? ` · 🔥 ${i.fevers} FEVER` : ''}`,
    'Can you beat me?',
  ];
  return lines.filter(Boolean).join('\n');
}

/** 1080×1350 (4:5) image that looks good in stories, feeds and chats. */
export function renderShareCard(i: ShareInfo): HTMLCanvasElement {
  const W = 1080;
  const H = 1350;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  const s = i.skin;
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, s.bg[0]);
  bg.addColorStop(1, s.bg[1]);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = s.light ? 'source-over' : 'lighter';
  const blobs: [number, number, number][] = [
    [0.15, 0.2, 700],
    [0.9, 0.55, 760],
    [0.35, 0.95, 720],
  ];
  blobs.forEach(([x, y, r], k) => {
    ctx.globalAlpha = s.light ? 0.5 : 0.3;
    ctx.drawImage(blobSprite(s.aurora[k]), x * W - r, y * H - r, r * 2, r * 2);
  });
  for (let k = 0; k < 40; k++) {
    const x = ((k * 367) % 1000) / 1000;
    const y = ((k * 571) % 1000) / 1000;
    const r = 6 + ((k * 13) % 10);
    ctx.globalAlpha = 0.35;
    ctx.drawImage(glowSprite(s.particles[k % s.particles.length]), x * W - r, y * H - r, r * 2, r * 2);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  // Logo.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 104px ${FONT}`;
  const lg = ctx.createLinearGradient(W / 2 - 300, 0, W / 2 + 300, 0);
  lg.addColorStop(0, s.a);
  lg.addColorStop(1, s.b);
  ctx.fillStyle = lg;
  ctx.fillText('circlepop', W / 2, 170);

  // Score framed by a giant ring.
  const cy = 640;
  const R = 300;
  drawRing(ctx, s.style, W / 2, cy, R, s.a, s.b, 0.8, s.light, 1, false);
  const digits = String(i.score).length;
  const fs = Math.min(230, (R * 1.35) / (0.62 * Math.max(2, digits)));
  ctx.font = `700 ${fs.toFixed(0)}px ${FONT}`;
  ctx.fillStyle = s.light ? s.text : '#FFFFFF';
  ctx.shadowColor = rgba(s.light ? '#FFFFFF' : '#000000', 0.45);
  ctx.shadowBlur = 30;
  ctx.fillText(String(i.score), W / 2, cy + 8);
  ctx.shadowBlur = 0;

  // Badge.
  const badge = i.isBest ? 'NEW BEST!' : i.mode === 'daily' ? `DAILY #${i.dailyNo}` : i.mode === 'zen' ? 'ZEN' : 'CLASSIC';
  ctx.font = `700 54px ${FONT}`;
  const bw = ctx.measureText(badge).width + 80;
  const by = cy + R + 110;
  ctx.fillStyle = lg;
  roundRectPath(ctx, W / 2 - bw / 2, by - 44, bw, 88, 44);
  ctx.fill();
  ctx.fillStyle = s.light ? '#FFFFFF' : '#0B0820';
  ctx.fillText(badge, W / 2, by + 3);

  ctx.font = `600 44px ${FONT}`;
  ctx.fillStyle = rgba(s.text, 0.85);
  const detail = i.mode === 'daily' ? `${i.dailyName} · ${i.pops} pops · ×${i.maxMult}` : `${i.pops} pops · ${i.perfectPct}% perfect · ×${i.maxMult}`;
  ctx.fillText(detail, W / 2, by + 110);
  ctx.font = `700 50px ${FONT}`;
  ctx.fillStyle = s.text;
  ctx.fillText('Can you beat me?', W / 2, H - 90);
  return c;
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function canvasToBlob(c: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      c.toBlob((b) => resolve(b), 'image/png');
    } catch {
      resolve(null);
    }
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export type ShareResult = 'shared' | 'copied' | 'downloaded' | 'cancelled' | 'failed';

export async function shareRun(blob: Blob | null, text: string, url: string): Promise<ShareResult> {
  const full = url ? `${text}\n${url}` : text;
  try {
    if (isNative) {
      const { Share } = await import('@capacitor/share');
      let files: string[] | undefined;
      if (blob) {
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        const res = await Filesystem.writeFile({ path: `circlepop-${Date.now()}.png`, data: await blobToBase64(blob), directory: Directory.Cache });
        files = [res.uri];
      }
      await Share.share({ title: 'CirclePop', text, url: url || undefined, files, dialogTitle: 'Share your score' });
      return 'shared';
    }
    if (blob && typeof File !== 'undefined' && typeof navigator.canShare === 'function') {
      const data: ShareData = { files: [new File([blob], 'circlepop.png', { type: 'image/png' })], text: full, title: 'CirclePop' };
      if (navigator.canShare(data)) {
        await navigator.share(data);
        return 'shared';
      }
    }
    if (typeof navigator.share === 'function') {
      await navigator.share({ text, url: url || undefined, title: 'CirclePop' });
      return 'shared';
    }
    let copied = false;
    try {
      await navigator.clipboard.writeText(full);
      copied = true;
    } catch {
      /* no clipboard */
    }
    if (blob) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'circlepop.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
    return copied ? 'copied' : 'downloaded';
  } catch (e) {
    return (e as { name?: string })?.name === 'AbortError' ? 'cancelled' : 'failed';
  }
}
