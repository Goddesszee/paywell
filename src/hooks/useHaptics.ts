/**
 * useHaptics — thin wrapper around navigator.vibrate.
 * Silently no-ops on browsers that don't support it (iOS, desktop).
 */

type HapticPattern = 'light' | 'medium' | 'success' | 'error' | 'warning'

const PATTERNS: Record<HapticPattern, number | number[]> = {
  light:   10,
  medium:  20,
  success: [10, 50, 10],
  error:   [30, 40, 30],
  warning: [20, 30, 20],
}

export function haptic(pattern: HapticPattern = 'light') {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(PATTERNS[pattern])
    }
  } catch {
    // ignore — some browsers throw on vibrate
  }
}

export function useHaptics() {
  return { haptic }
}
