import { isNative, platform } from './platform/native';

/** Fill these in once the store listings exist — they are used in share links. */
export const APP_STORE_URL = '';
export const PLAY_STORE_URL = '';

export const VERSION = '2.0.0';

export function shareUrl(): string {
  if (isNative) return platform === 'ios' ? APP_STORE_URL : PLAY_STORE_URL;
  const u = `${location.origin}${location.pathname}`;
  return /^https?:\/\//.test(u) && !/localhost|127\.0\.0\.1/.test(u) ? u : '';
}
