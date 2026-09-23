const rgbCache = new Map<string, [number, number, number]>();

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hh = (((h % 360) + 360) % 360) / 360;
  const ss = s / 100;
  const ll = l / 100;
  if (ss === 0) {
    const v = Math.round(ll * 255);
    return [v, v, v];
  }
  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
  const p = 2 * ll - q;
  const ch = (t: number): number => {
    let k = t;
    if (k < 0) k += 1;
    if (k > 1) k -= 1;
    if (k < 1 / 6) return p + (q - p) * 6 * k;
    if (k < 1 / 2) return q;
    if (k < 2 / 3) return p + (q - p) * (2 / 3 - k) * 6;
    return p;
  };
  return [Math.round(ch(hh + 1 / 3) * 255), Math.round(ch(hh) * 255), Math.round(ch(hh - 1 / 3) * 255)];
}

/** Parse `#rgb`, `#rrggbb`, `rgb()/rgba()` or `hsl()/hsla()` into 0–255 channels (white if unparseable). */
export function hexToRgb(color: string): [number, number, number] {
  let c = rgbCache.get(color);
  if (!c) {
    const s = color.trim();
    if (s[0] === '#') {
      let h = s.slice(1);
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      const n = parseInt(h.slice(0, 6), 16);
      c = Number.isNaN(n) ? [255, 255, 255] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    } else {
      const nums = (s.match(/-?[\d.]+/g) ?? []).map(Number);
      if (s.startsWith('hsl') && nums.length >= 3) c = hslToRgb(nums[0], nums[1], nums[2]);
      else if (s.startsWith('rgb') && nums.length >= 3) c = [nums[0], nums[1], nums[2]];
      else c = [255, 255, 255];
    }
    if (rgbCache.size > 512) rgbCache.clear();
    rgbCache.set(color, c);
  }
  return c;
}

export function rgba(color: string, a: number): string {
  const [r, g, b] = hexToRgb(color);
  return `rgba(${r},${g},${b},${a < 0 ? 0 : a > 1 ? 1 : a.toFixed(3)})`;
}

export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return `rgb(${Math.round(r1 + (r2 - r1) * k)},${Math.round(g1 + (g2 - g1) * k)},${Math.round(b1 + (b2 - b1) * k)})`;
}

/** CSS hsl string — only for fill/stroke styles. Use `rainbow()` for anything cached (sprites, rgba). */
export function hsl(h: number, s: number, l: number, a = 1): string {
  return `hsla(${((h % 360) + 360) % 360},${s}%,${l}%,${a})`;
}

const HUE_STEPS = 24;
const rainbowCache = new Map<number, string>();

/** Fully saturated colour as hex, quantised to 24 hues so sprite caches stay bounded. */
export function rainbow(h: number, l = 62): string {
  const i = ((Math.round(h / (360 / HUE_STEPS)) % HUE_STEPS) + HUE_STEPS) % HUE_STEPS;
  const key = i * 1000 + Math.round(l);
  let hex = rainbowCache.get(key);
  if (!hex) {
    const [r, g, b] = hslToRgb((i * 360) / HUE_STEPS, 100, l);
    hex = `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
    rainbowCache.set(key, hex);
  }
  return hex;
}
