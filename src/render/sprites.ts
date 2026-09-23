import { rgba } from '../core/color';

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const g = c.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable');
  return g;
}

const glowCache = new Map<string, HTMLCanvasElement>();
const ringCache = new Map<string, HTMLCanvasElement>();
const blobCache = new Map<string, HTMLCanvasElement>();
const pixelCache = new Map<string, HTMLCanvasElement>();
const CACHE_LIMIT = 96;

/** Callers pass palette colours, but never let a stray dynamic colour grow a cache without bound. */
function remember(cache: Map<string, HTMLCanvasElement>, key: string, c: HTMLCanvasElement): void {
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(key, c);
}

/** Soft dot with a hot center. Draw it at 2 × radius. */
export function glowSprite(color: string): HTMLCanvasElement {
  let c = glowCache.get(color);
  if (!c) {
    c = makeCanvas(64, 64);
    const g = ctx2d(c);
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.12, rgba(color, 0.95));
    grad.addColorStop(0.4, rgba(color, 0.32));
    grad.addColorStop(1, rgba(color, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    remember(glowCache, color, c);
  }
  return c;
}

/**
 * Halo for ring-shaped targets. The bright band sits at 45% of the sprite radius,
 * so for a ring of radius R draw the sprite with radius R / 0.45.
 */
export function ringGlowSprite(color: string): HTMLCanvasElement {
  let c = ringCache.get(color);
  if (!c) {
    c = makeCanvas(160, 160);
    const g = ctx2d(c);
    const grad = g.createRadialGradient(80, 80, 0, 80, 80, 80);
    grad.addColorStop(0, rgba(color, 0.07));
    grad.addColorStop(0.3, rgba(color, 0.07));
    grad.addColorStop(0.45, rgba(color, 0.55));
    grad.addColorStop(0.6, rgba(color, 0.16));
    grad.addColorStop(1, rgba(color, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, 160, 160);
    remember(ringCache, color, c);
  }
  return c;
}

/** Big soft color blob used for the aurora background. */
export function blobSprite(color: string): HTMLCanvasElement {
  let c = blobCache.get(color);
  if (!c) {
    c = makeCanvas(256, 256);
    const g = ctx2d(c);
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, rgba(color, 1));
    grad.addColorStop(0.45, rgba(color, 0.4));
    grad.addColorStop(1, rgba(color, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    remember(blobCache, color, c);
  }
  return c;
}

/** Chunky 8-bit ring. Draw with image smoothing off at 2 × radius. */
export function pixelRingSprite(a: string, b: string): HTMLCanvasElement {
  const key = a + b;
  let c = pixelCache.get(key);
  if (!c) {
    const N = 22;
    c = makeCanvas(N, N);
    const g = ctx2d(c);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const dx = x + 0.5 - N / 2;
        const dy = y + 0.5 - N / 2;
        const d = Math.hypot(dx, dy);
        if (d >= 7.4 && d <= 10.5) {
          g.fillStyle = x + y < N - 1 ? a : b;
          g.fillRect(x, y, 1, 1);
        } else if (d < 1.5) {
          g.fillStyle = '#FFFFFF';
          g.fillRect(x, y, 1, 1);
        } else if (d < 4.2 && (x + y) % 2 === 0) {
          g.fillStyle = rgba(a, 0.22);
          g.fillRect(x, y, 1, 1);
        }
      }
    }
    remember(pixelCache, key, c);
  }
  return c;
}

/** Radial vignette in `color`, rendered small and stretched to the screen. */
export function vignetteSprite(w: number, h: number, color: string): HTMLCanvasElement {
  const sw = Math.max(8, Math.round(w / 4));
  const sh = Math.max(8, Math.round(h / 4));
  const c = makeCanvas(sw, sh);
  const g = ctx2d(c);
  const r = Math.hypot(sw, sh) / 2;
  const grad = g.createRadialGradient(sw / 2, sh / 2, Math.min(sw, sh) * 0.28, sw / 2, sh / 2, r);
  grad.addColorStop(0, rgba(color, 0));
  grad.addColorStop(0.6, rgba(color, 0.35));
  grad.addColorStop(1, rgba(color, 0.95));
  g.fillStyle = grad;
  g.fillRect(0, 0, sw, sh);
  return c;
}

let scanPattern: HTMLCanvasElement | null = null;

export function scanlineTile(): HTMLCanvasElement {
  if (!scanPattern) {
    scanPattern = makeCanvas(2, 4);
    const g = ctx2d(scanPattern);
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(0, 0, 2, 1);
  }
  return scanPattern;
}
