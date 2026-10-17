// The game server stops itself when nobody is playing (infra/terraform,
// idle_shutdown_minutes). While it is stopped or starting, CloudFront answers
// every game request with waking.html and a 503 instead of JSON. These helpers
// recognise that answer and ask /wake to start the server again.
//
// Only call requestWake() for something a player did. A tab left open with
// nobody using it must not wake the server, or the server would never sleep.

// After a start request, give the server time to boot before asking again.
export const WAKE_RETRY_MS = 30 * 1000;
// /wake only starts a stopped server. During an idle shutdown it answers
// "running" or "stopping", so ask again soon instead of waiting 30 s.
export const SHUTDOWN_RETRY_MS = 5 * 1000;

/** True for CloudFront's "waking up" page (not the app's own JSON 503s). */
export function isWakingPage(response) {
  if (!response || response.status !== 503) return false;
  const type = response.headers?.get?.('content-type') || '';
  return type.includes('text/html');
}

let nextWakeAt = 0;
let paused = false;

/**
 * Ask the server to start, at most once per retry window.
 * @returns {Promise<string|null>} The wake state ('pending', 'stopping',
 *   'running', 'disabled'), or null when skipped or unreachable.
 */
export async function requestWake({ now = Date.now, fetchImpl = (...args) => fetch(...args) } = {}) {
  if (paused || now() < nextWakeAt) return null;
  nextWakeAt = now() + WAKE_RETRY_MS;
  let state = null;
  try {
    const response = await fetchImpl('/wake', { cache: 'no-store' });
    if (response.status === 423) {
      paused = true; // Budget cap: wakes stay off until the owner clears it.
      return 'disabled';
    }
    state = (await response.json().catch(() => ({}))).state || null;
  } catch { /* Offline or no /wake (local development). */ }
  if (state !== 'pending') nextWakeAt = now() + SHUTDOWN_RETRY_MS;
  return state;
}

/** Whether the budget cap has paused wake-ups for this page. */
export function wakePaused() {
  return paused;
}

export function resetWakeStateForTests() {
  nextWakeAt = 0;
  paused = false;
}
