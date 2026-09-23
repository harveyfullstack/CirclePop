import { isNative } from './native';

export type HapticKind = 'light' | 'medium' | 'heavy' | 'success' | 'error';

const PATTERNS: Record<HapticKind, number | number[]> = {
  light: 8,
  medium: 16,
  heavy: 32,
  success: [14, 50, 22],
  error: [40, 60, 40],
};

const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
const isIOS =
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

let enabled = true;
let last = 0;
let iosSwitch: HTMLLabelElement | null = null;

export function setHaptics(on: boolean): void {
  enabled = on;
}

/**
 * iOS Safari has no Vibration API, but toggling a native `<input type=checkbox switch>` (iOS 18+)
 * plays the system selection tick. Only works inside a user gesture, which is where we call it.
 */
function iosTick(): void {
  try {
    if (!iosSwitch) {
      iosSwitch = document.createElement('label');
      iosSwitch.setAttribute('aria-hidden', 'true');
      iosSwitch.style.cssText = 'position:fixed;left:-100px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      input.tabIndex = -1;
      iosSwitch.appendChild(input);
      document.body.appendChild(iosSwitch);
    }
    iosSwitch.click();
  } catch {
    /* unsupported */
  }
}

async function nativeHaptic(kind: HapticKind): Promise<void> {
  const { Haptics, ImpactStyle, NotificationType } = await import('@capacitor/haptics');
  if (kind === 'success') return Haptics.notification({ type: NotificationType.Success });
  if (kind === 'error') return Haptics.notification({ type: NotificationType.Error });
  const style = kind === 'heavy' ? ImpactStyle.Heavy : kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light;
  return Haptics.impact({ style });
}

export function haptic(kind: HapticKind): void {
  if (!enabled) return;
  const now = performance.now();
  if ((kind === 'light' || kind === 'medium') && now - last < 35) return;
  last = now;
  if (isNative) {
    nativeHaptic(kind).catch(() => undefined);
  } else if (canVibrate) {
    try {
      navigator.vibrate(PATTERNS[kind]);
    } catch {
      /* ignored */
    }
  } else if (isIOS) {
    iosTick();
  }
}
