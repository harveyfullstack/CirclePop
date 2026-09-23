import { easeOutBack } from '../core/math';

export const FONT = '"Fredoka", ui-rounded, "SF Pro Rounded", system-ui, sans-serif';

export interface Floater {
  text: string;
  x: number;
  y: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  outline: string;
  rot: number;
}

export interface FloaterOpts {
  size?: number;
  color?: string;
  outline?: string;
  life?: number;
  vy?: number;
  rot?: number;
}

/** Punchy text that pops in, floats up and fades ("PERFECT", "+6", "×3!"). */
export class Floaters {
  readonly list: Floater[] = [];

  add(text: string, x: number, y: number, o: FloaterOpts = {}): Floater {
    const f: Floater = {
      text,
      x,
      y,
      vy: o.vy ?? -70,
      life: o.life ?? 0.9,
      max: o.life ?? 0.9,
      size: o.size ?? 26,
      color: o.color ?? '#FFFFFF',
      outline: o.outline ?? 'rgba(10,6,30,0.55)',
      rot: o.rot ?? 0,
    };
    if (this.list.length > 40) this.list.shift();
    this.list.push(f);
    return f;
  }

  clear(): void {
    this.list.length = 0;
  }

  update(dt: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.list.splice(i, 1);
        continue;
      }
      f.y += f.vy * dt;
      f.vy *= Math.exp(-2.6 * dt);
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (!this.list.length) return;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const f of this.list) {
      const t = 1 - f.life / f.max;
      const pop = t < 0.16 ? Math.max(0.01, easeOutBack(t / 0.16, 2.4)) : 1;
      const fade = f.life < f.max * 0.35 ? f.life / (f.max * 0.35) : 1;
      const size = f.size * pop;
      ctx.globalAlpha = fade;
      ctx.font = `700 ${size.toFixed(1)}px ${FONT}`;
      if (f.rot) {
        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.rotate(f.rot);
        ctx.lineWidth = size * 0.16;
        ctx.strokeStyle = f.outline;
        ctx.strokeText(f.text, 0, 0);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, 0, 0);
        ctx.restore();
      } else {
        ctx.lineWidth = size * 0.16;
        ctx.strokeStyle = f.outline;
        ctx.strokeText(f.text, f.x, f.y);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, f.y);
      }
    }
    ctx.globalAlpha = 1;
  }
}
