// Keeps the screen on during a workout (Screen Wake Lock API).
// The browser drops the lock when the page is hidden, so it is re-requested on return.

let sentinel: WakeLockSentinel | null = null;
let wanted = false;

async function request(): Promise<void> {
  if (!wanted || sentinel || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => {
      sentinel = null;
    });
  } catch {
    // Denied (e.g. low battery mode). Not fatal.
  }
}

document.addEventListener('visibilitychange', () => void request());

export function keepScreenOn(on: boolean): void {
  wanted = on;
  if (on) void request();
  else {
    void sentinel?.release();
    sentinel = null;
  }
}
