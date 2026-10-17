// A live "time until the game server is up" estimate for the waiting screens.
//
// /wake reports the server's state and, once it is booting, `elapsed`: the
// seconds since that boot began (infra/terraform/origin_control_lambda.py).
// The expected boot length starts at about a minute and then learns from the
// wakes this browser has watched, so the estimate follows the real server.
// frontend/waking.html carries an inline copy of this (it can't load modules),
// and both share the same saved history.

export const DEFAULT_WAKE_SECONDS = 60;
// A server caught mid-shutdown has to finish stopping before it can start.
export const SHUTDOWN_SECONDS = 30;
export const WAKE_HISTORY_KEY = 'wakeDurations';
const HISTORY_SIZE = 5;
const MIN_PLAUSIBLE = 10;
const MAX_PLAUSIBLE = 300;

const plausible = seconds => Number.isFinite(seconds) && seconds >= MIN_PLAUSIBLE && seconds <= MAX_PLAUSIBLE;

export function readWakeHistory(storage = globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage?.getItem(WAKE_HISTORY_KEY) || '[]');
    return Array.isArray(saved) ? saved.filter(plausible) : [];
  } catch {
    return [];
  }
}

/** Remember how long a watched wake took (seconds), keeping the last few. */
export function recordWakeDuration(seconds, storage = globalThis.localStorage) {
  if (!plausible(seconds)) return;
  try {
    const history = [...readWakeHistory(storage), Math.round(seconds)].slice(-HISTORY_SIZE);
    storage?.setItem(WAKE_HISTORY_KEY, JSON.stringify(history));
  } catch { /* Storage blocked: keep using the default. */ }
}

/** The expected boot length: the median of recent wakes, or about a minute. */
export function typicalWakeSeconds(history = readWakeHistory()) {
  const valid = history.filter(plausible).sort((a, b) => a - b);
  if (!valid.length) return DEFAULT_WAKE_SECONDS;
  const mid = valid.length >> 1;
  return Math.round(valid.length % 2 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2);
}

/**
 * Estimate the wait from the server's state.
 * @param {object} p
 * @param {string|null} p.state 'stopping' | 'pending' | 'running' (booting) | null
 * @param {number|null} p.elapsed Seconds since the boot began.
 * @param {number} [p.stoppingFor] Seconds since a shutdown was first seen.
 * @param {number} [p.typical] Expected boot length in seconds.
 * @returns {{remaining: number|null, progress: number, overdue: boolean}}
 *   remaining is whole seconds (null when unknown); progress runs 0..1.
 */
export function estimateWake({ state, elapsed, stoppingFor = 0, typical = DEFAULT_WAKE_SECONDS }) {
  if (state === 'stopping') {
    const remaining = Math.max(typical, Math.ceil(typical + SHUTDOWN_SECONDS - stoppingFor));
    return { remaining, progress: 0.04, overdue: false };
  }
  if (!Number.isFinite(elapsed)) return { remaining: null, progress: 0, overdue: false };
  const remaining = Math.max(0, Math.ceil(typical - elapsed));
  // Fill steadily to 90% at the expected time, then creep toward 99% so the
  // bar never stalls or finishes before the server is actually up.
  const progress = elapsed <= typical
    ? 0.9 * Math.max(0, elapsed) / typical
    : 0.9 + 0.09 * (1 - Math.exp(-(elapsed - typical) / typical));
  return { remaining, progress, overdue: elapsed > typical };
}

/** 75 -> "1:15" */
export function formatClock(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
