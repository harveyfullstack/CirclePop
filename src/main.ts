import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/fredoka/latin-700.css';
import './ui/styles.css';
import { App } from './app';
import { Store } from './meta/save';
import { isNative } from './platform/native';

async function loadFonts(): Promise<void> {
  if (!document.fonts?.load) return;
  const fonts = Promise.all([document.fonts.load('700 48px "Fredoka"'), document.fonts.load('600 20px "Fredoka"'), document.fonts.load('500 16px "Fredoka"')]);
  // Never block the game on a slow font — canvas text falls back to the system rounded font.
  await Promise.race([fonts, new Promise((r) => setTimeout(r, 1500))]).catch(() => undefined);
}

function registerServiceWorker(): void {
  if (!import.meta.env.PROD || isNative || !('serviceWorker' in navigator) || location.protocol !== 'https:') return;
  const register = (): void => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
  };
  // boot() awaits fonts and the save first, so `load` has usually fired already.
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

async function boot(): Promise<void> {
  const [store] = await Promise.all([Store.load(), loadFonts()]);
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const app = new App(canvas, store);
  app.start();
  if (new URLSearchParams(location.search).has('debug')) {
    (window as unknown as { __cp: () => Record<string, unknown> }).__cp = () => app.debug();
  }
  requestAnimationFrame(() => document.getElementById('boot')?.classList.add('gone'));
  registerServiceWorker();
}

void boot();
