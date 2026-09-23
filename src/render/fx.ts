import { hsl } from '../core/color';
import { TAU } from '../core/math';
import { DANGER, GOLD } from '../meta/skins';
import type { Floaters, FloaterOpts } from './floaters';
import { P, type Particles } from './particles';
import type { Shake } from './shake';

const rand = (a: number, b: number): number => a + Math.random() * (b - a);

interface BurstOpts {
  kind?: P;
  drag?: number;
  grav?: number;
  alpha?: number;
}

/** High-level effect recipes built from particles, floaters and shake. */
export class Fx {
  u = 1;
  /** Reduced motion: no shake, lighter flashes. */
  calm = false;

  constructor(
    readonly particles: Particles,
    readonly floaters: Floaters,
    readonly shake: Shake,
  ) {}

  burst(x: number, y: number, n: number, colors: readonly string[], speed: [number, number], size: [number, number], life: [number, number], o: BurstOpts = {}): void {
    const u = this.u;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const sp = rand(speed[0], speed[1]) * u;
      const p = this.particles.spawn(o.kind ?? P.Glow, x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(life[0], life[1]), rand(size[0], size[1]) * u, colors[i % colors.length]);
      p.drag = o.drag ?? 3;
      p.grav = (o.grav ?? 0) * u;
      if (o.alpha !== undefined) p.alpha = o.alpha;
      if (p.kind === P.Shard || p.kind === P.Confetti) {
        p.rot = Math.random() * TAU;
        p.vr = rand(-12, 12);
        p.vflip = rand(4, 12);
        p.size2 = p.size * rand(0.5, 1.4);
      }
    }
  }

  ring(x: number, y: number, r0: number, r1: number, color: string, life: number, width: number): void {
    const p = this.particles.spawn(P.Ring, x, y, 0, 0, life, r0, color);
    p.size2 = r1;
    p.width = width;
  }

  flashDot(x: number, y: number, size: number, color: string, life = 0.16): void {
    this.particles.spawn(P.Glow, x, y, 0, 0, life, size, color);
  }

  text(t: string, x: number, y: number, o: FloaterOpts = {}): void {
    this.floaters.add(t, x, y, { ...o, size: (o.size ?? 26) * this.u });
  }

  pop(x: number, y: number, r: number, colors: readonly string[], perfect: boolean, gold: boolean, fever: boolean): void {
    const u = this.u;
    const pal = gold ? [GOLD.a, GOLD.b, '#FFFFFF', GOLD.glow] : colors;
    this.burst(x, y, perfect ? 22 : 14, pal, [160, perfect ? 540 : 380], [5, 11], [0.35, 0.75], { drag: 3.2 });
    this.burst(x, y, perfect ? 10 : 5, pal, [320, 760], [1.6, 2.8], [0.22, 0.42], { kind: P.Spark, drag: 4 });
    this.ring(x, y, r * 0.9, r * (perfect ? 2.7 : 2.0), pal[0], perfect ? 0.45 : 0.34, (perfect ? 7 : 5) * u);
    if (perfect) this.ring(x, y, r * 0.4, r * 1.7, '#FFFFFF', 0.3, 3 * u);
    this.flashDot(x, y, r * (perfect ? 2.4 : 1.8), pal[0]);
    if (gold) {
      this.burst(x, y, 10, ['#FFF6C8', GOLD.glow], [120, 420], [3, 6], [0.6, 1.1], { kind: P.Star, drag: 2.5, grav: 180 });
    }
    if (fever) {
      const hue = Math.random() * 360;
      this.burst(x, y, 10, [hsl(hue, 100, 65), hsl(hue + 120, 100, 65), hsl(hue + 240, 100, 65)], [200, 620], [4, 9], [0.4, 0.8], { drag: 2.5 });
    }
    this.shake.add(perfect ? 0.07 : 0.03);
  }

  miss(x: number, y: number, light: boolean): void {
    const u = this.u;
    this.ring(x, y, 6 * u, 34 * u, DANGER, 0.35, 4 * u);
    this.text('✕', x, y, { size: 30, color: DANGER, outline: light ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.5)', life: 0.5, vy: -20 });
  }

  shatter(x: number, y: number, r: number, colors: readonly string[]): void {
    const u = this.u;
    this.burst(x, y, 26, colors, [180, 720], [5, 11], [0.8, 1.6], { kind: P.Shard, drag: 1.2, grav: 900 });
    this.burst(x, y, 26, [DANGER, '#FFFFFF', ...colors], [100, 600], [6, 14], [0.4, 0.9], { drag: 2.5 });
    this.ring(x, y, r, r * 4, DANGER, 0.6, 10 * u);
    this.ring(x, y, r * 0.5, r * 3, '#FFFFFF', 0.4, 4 * u);
    this.shake.add(0.85);
  }

  explosion(x: number, y: number, r: number): void {
    const u = this.u;
    const fire = ['#FFE66D', '#FF9F1C', DANGER, '#FFFFFF'];
    this.burst(x, y, 40, fire, [150, 900], [8, 18], [0.4, 1.0], { drag: 2.8 });
    this.burst(x, y, 18, fire, [500, 1200], [2, 4], [0.3, 0.6], { kind: P.Spark, drag: 3 });
    this.burst(x, y, 16, ['#2a0f1a', '#5a2438', DANGER], [200, 700], [5, 10], [0.9, 1.6], { kind: P.Shard, drag: 1.2, grav: 1000 });
    this.ring(x, y, r, r * 6, '#FF9F1C', 0.55, 14 * u);
    this.ring(x, y, r * 0.5, r * 4, '#FFFFFF', 0.35, 6 * u);
    this.flashDot(x, y, r * 6, '#FFB347', 0.3);
    this.shake.add(1);
  }

  powerGrab(x: number, y: number, r: number, color: string): void {
    const u = this.u;
    this.burst(x, y, 20, [color, '#FFFFFF'], [150, 520], [5, 10], [0.4, 0.8], { drag: 3 });
    this.ring(x, y, r, r * 3, color, 0.5, 6 * u);
    this.ring(x, y, r * 3.2, r * 0.8, '#FFFFFF', 0.35, 3 * u);
    this.shake.add(0.15);
  }

  shieldBreak(x: number, y: number, color: string): void {
    const u = this.u;
    this.ring(x, y, 20 * u, 160 * u, color, 0.6, 10 * u);
    this.burst(x, y, 24, [color, '#FFFFFF'], [200, 700], [4, 9], [0.5, 1], { kind: P.Shard, drag: 2, grav: 500 });
    this.shake.add(0.45);
  }

  feverBurst(w: number, h: number): void {
    const u = this.u;
    const cx = w / 2;
    const cy = h * 0.46;
    for (let i = 0; i < 3; i++) this.ring(cx, cy, 10 * u, Math.max(w, h) * (0.4 + i * 0.2), hsl(i * 120, 100, 65), 0.6 + i * 0.15, (14 - i * 3) * u);
    const cols = [0, 50, 120, 190, 270, 320].map((hh) => hsl(hh, 100, 65));
    this.burst(cx, cy, 60, cols, [300, 1100], [6, 14], [0.6, 1.2], { drag: 2 });
    this.shake.add(0.55);
  }

  confetti(w: number, h: number, colors: readonly string[], n = 140): void {
    const u = this.u;
    for (let i = 0; i < n; i++) {
      const x = Math.random() * w;
      const y = -20 - Math.random() * h * 0.3;
      const p = this.particles.spawn(P.Confetti, x, y, rand(-80, 80) * u, rand(80, 320) * u, rand(2.2, 3.6), rand(6, 11) * u, colors[i % colors.length]);
      p.size2 = p.size * rand(0.45, 0.8);
      p.rot = Math.random() * TAU;
      p.vr = rand(-6, 6);
      p.vflip = rand(6, 14);
      p.grav = 140 * u;
      p.drag = 0.9;
    }
  }

  coins(x: number, y: number, n: number, tx: number, ty: number): void {
    const u = this.u;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + rand(-1.2, 1.2);
      const sp = rand(200, 420) * u;
      const p = this.particles.spawn(P.Coin, x, y, Math.cos(a) * sp, Math.sin(a) * sp, 1.6, 8 * u, '#FFC93D');
      p.tx = tx;
      p.ty = ty;
      p.vflip = rand(8, 14);
    }
  }
}
