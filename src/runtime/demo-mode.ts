'use client';
// Demo mode: set by the native iPad shell (window.__STILL_HERE_DEMO__) or `?demo=1` in Safari.
// Pre-selects the demo-friendly setup (Live AI, cloud consent, natural voice) so nobody has to
// tick boxes on stage. It never bypasses review or the separate confirmation.

declare global {
  interface Window { __STILL_HERE_DEMO__?: boolean }
}

export function isDemoMode(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.__STILL_HERE_DEMO__ === true) return true;
  try {
    return new URLSearchParams(window.location.search).has('demo');
  } catch {
    return false;
  }
}

/** True inside the native iPad shell, where media autoplay and camera access are pre-granted. */
export function inNativeShell(): boolean {
  return typeof window !== 'undefined' && window.__STILL_HERE_DEMO__ === true;
}
