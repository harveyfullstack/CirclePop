import { glowSprite } from './sprites';

export const enum P {
  Glow,
  Spark,
  Ring,
  Confetti,
  Shard,
  Coin,
  Star,
}

export interface Particle {
  kind: P;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  /** Ring: end radius. Confetti/Shard: height. */
  size2: number;
  width: number;
  color: string;
  rot: number;
  vr: number;
  drag: number;
  grav: number;
  alpha: number;
  flip: number;
  vflip: number;
  tx: number;
  ty: number;
}

const SOLID = (k: P): boolean => k === P.Confetti || k === P.Shard || k === P.Coin;

/** Pooled particles; no allocations once warmed up. */
export class Particles {
  readonly list: Particle[] = [];
  private pool: Particle[] = [];
  /** Coins that reached their target since the last read. */
  arrived = 0;
  max = 1200;

  spawn(kind: P, x: number, y: number, vx: number, vy: number, life: number, size: number, color: string): Particle {
    let p: Particle | undefined;
    if (this.list.length >= this.max) {
      p = this.list[(Math.random() * this.list.length) | 0];
    } else {
      p = this.pool.pop();
      if (!p) p = {} as Particle;
      this.list.push(p);
    }
    p.kind = kind;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.life = life;
    p.max = life;
    p.size = size;
    p.size2 = 0;
    p.width = 0;
    p.color = color;
    p.rot = 0;
    p.vr = 0;
    p.drag = 0;
    p.grav = 0;
    p.alpha = 1;
    p.flip = 0;
    p.vflip = 0;
    p.tx = 0;
    p.ty = 0;
    return p;
  }

  clear(): void {
    while (this.list.length) this.pool.push(this.list.pop() as Particle);
  }

  update(dt: number): void {
    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.life -= dt;
      if (p.kind === P.Coin && p.max - p.life > 0.22) {
        // Home in on the coin counter.
        const dx = p.tx - p.x;
        const dy = p.ty - p.y;
        const d = Math.hypot(dx, dy);
        if (d < 14) {
          p.life = 0;
          this.arrived++;
        } else {
          const sp = 900 + (p.max - p.life) * 2600;
          const k = 1 - Math.exp(-12 * dt);
          p.vx += ((dx / d) * sp - p.vx) * k;
          p.vy += ((dy / d) * sp - p.vy) * k;
        }
      }
      if (p.life <= 0) {
        list[i] = list[list.length - 1];
        list.pop();
        this.pool.push(p);
        continue;
      }
      if (p.drag) {
        const k = Math.exp(-p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.flip += p.vflip * dt;
    }
  }

  /**
   * `dpr`, `ox`, `oy` describe the current base transform so rotated particles can use setTransform directly.
   */
  draw(ctx: CanvasRenderingContext2D, additive: boolean, dpr: number, ox: number, oy: number): void {
    const list = this.list;
    if (!list.length) return;
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!SOLID(p.kind)) continue;
      const t = p.life / p.max;
      const a = p.alpha * (t < 0.25 ? t / 0.25 : 1);
      ctx.globalAlpha = a;
      if (p.kind === P.Coin) {
        ctx.setTransform(dpr, 0, 0, dpr, ox * dpr, oy * dpr);
        drawCoin(ctx, p.x, p.y, p.size, Math.cos(p.flip));
        continue;
      }
      const c = Math.cos(p.rot);
      const s = Math.sin(p.rot);
      const sy = Math.cos(p.flip);
      ctx.setTransform(dpr * c, dpr * s, -dpr * s * sy, dpr * c * sy, (p.x + ox) * dpr, (p.y + oy) * dpr);
      ctx.fillStyle = p.color;
      if (p.kind === P.Confetti) {
        ctx.fillRect(-p.size / 2, -p.size2 / 2, p.size, p.size2);
      } else {
        ctx.beginPath();
        ctx.moveTo(0, -p.size);
        ctx.lineTo(p.size * 0.8, p.size * 0.7);
        ctx.lineTo(-p.size * 0.7, p.size * 0.5);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.setTransform(dpr, 0, 0, dpr, ox * dpr, oy * dpr);
    ctx.globalCompositeOperation = additive ? 'lighter' : 'source-over';
    ctx.lineCap = 'round';
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (SOLID(p.kind)) continue;
      const t = p.life / p.max;
      switch (p.kind) {
        case P.Glow: {
          const s = p.size * (0.35 + 0.65 * t);
          ctx.globalAlpha = p.alpha * Math.min(1, t * 1.6);
          ctx.drawImage(glowSprite(p.color), p.x - s, p.y - s, s * 2, s * 2);
          break;
        }
        case P.Star: {
          const tw = 0.6 + 0.4 * Math.sin(p.rot * 3);
          const s = p.size * (0.5 + 0.5 * t) * tw;
          ctx.globalAlpha = p.alpha * Math.min(1, t * 2);
          ctx.drawImage(glowSprite(p.color), p.x - s, p.y - s, s * 2, s * 2);
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(1, s * 0.12);
          ctx.beginPath();
          ctx.moveTo(p.x - s * 1.4, p.y);
          ctx.lineTo(p.x + s * 1.4, p.y);
          ctx.moveTo(p.x, p.y - s * 1.4);
          ctx.lineTo(p.x, p.y + s * 1.4);
          ctx.stroke();
          break;
        }
        case P.Spark: {
          ctx.globalAlpha = p.alpha * Math.min(1, t * 1.5);
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size * (0.4 + 0.6 * t);
          const k = 0.035 + 0.02 * t;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * k, p.y - p.vy * k);
          ctx.stroke();
          break;
        }
        case P.Ring: {
          const e = 1 - t;
          const k = 1 - (1 - e) * (1 - e) * (1 - e);
          const r = p.size + (p.size2 - p.size) * k;
          ctx.globalAlpha = p.alpha * t;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(0.5, p.width * t);
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        default:
          break;
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

export function drawCoin(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, squash = 1): void {
  const sx = Math.max(0.15, Math.abs(squash));
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sx, 1);
  ctx.fillStyle = '#B86E00';
  ctx.beginPath();
  ctx.arc(0, r * 0.12, r, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createLinearGradient(0, -r, 0, r);
  g.addColorStop(0, '#FFF3A6');
  g.addColorStop(0.5, '#FFC93D');
  g.addColorStop(1, '#F29A00');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(160,90,0,0.55)';
  ctx.lineWidth = r * 0.16;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.32, -r * 0.38, r * 0.22, r * 0.12, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
