/**
 * Light haptic feedback. Real on devices with the Vibration API (Android
 * Chrome); a silent no-op everywhere else (desktop, iOS Safari — which has no
 * web vibration). Must be called from within a user gesture, which all our call
 * sites are (knob drag, grid tap).
 */
export function hapticTick(ms = 8): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* unsupported — silent no-op */
  }
}
