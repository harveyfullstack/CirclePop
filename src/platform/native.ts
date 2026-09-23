import { Capacitor } from '@capacitor/core';

export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform();

export interface NativeHooks {
  onPause(): void;
  onResume(): void;
  /** Return true if the back button was handled (closed a panel, paused…). */
  onBack(): boolean;
}

/** Wire up the native shell: fullscreen, lifecycle and the Android back button. No-ops on the web. */
export async function initNative(h: NativeHooks): Promise<void> {
  if (!isNative) return;
  try {
    const { StatusBar } = await import('@capacitor/status-bar');
    await StatusBar.hide();
  } catch {
    /* plugin missing */
  }
  try {
    const { App } = await import('@capacitor/app');
    await App.addListener('pause', h.onPause);
    await App.addListener('resume', h.onResume);
    await App.addListener('backButton', () => {
      if (!h.onBack()) void App.exitApp();
    });
  } catch {
    /* plugin missing */
  }
}

export async function hideSplash(): Promise<void> {
  if (!isNative) return;
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide({ fadeOutDuration: 250 });
  } catch {
    /* plugin missing */
  }
}
