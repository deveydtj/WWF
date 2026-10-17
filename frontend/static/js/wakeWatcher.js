// Wait for a sleeping game server to come up, reporting what it is doing so a
// page can show progress and a live time estimate (see wakeEstimate.js).
//
// Only start this for something a player did (the landing page's Create or
// Join). It sends /wake, which starts the server.

import { WAKE_RETRY_MS, SHUTDOWN_RETRY_MS } from './serverWake.js';
import { recordWakeDuration, typicalWakeSeconds } from './wakeEstimate.js';

export const HEALTH_POLL_MS = 3000;
export const GIVE_UP_MS = 4 * 60 * 1000;

/**
 * @param {object} [options]
 * @param {(status: object) => void} [options.onChange] Called whenever the
 *   status changes: { state, bootStartedAt, stoppingSince, typical, startedAt }.
 *   state is null, 'stopping', 'pending', 'running' (booting) or 'ready'.
 * @returns {{ done: Promise<'ready'|'disabled'|'timeout'|'cancelled'>, cancel(): void }}
 */
export function watchServerWake({
  onChange = () => {},
  fetchImpl = (...args) => fetch(...args),
  now = Date.now,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
  timeoutMs = GIVE_UP_MS,
  pollMs = HEALTH_POLL_MS,
  typical = typicalWakeSeconds(),
  storage = globalThis.localStorage,
} = {}) {
  let cancelled = false;
  let lastWake = 0;
  let wakeEvery = SHUTDOWN_RETRY_MS;
  // Only learn from boots whose start we know: the server said when, or we saw it start.
  let bootStartKnown = false;
  const status = { state: null, bootStartedAt: null, stoppingSince: null, typical, startedAt: now() };
  const update = changes => {
    Object.assign(status, changes);
    onChange({ ...status });
  };

  async function wake() {
    lastWake = now();
    let response;
    try {
      response = await fetchImpl('/wake', { cache: 'no-store' });
    } catch {
      return null; // Offline, or no /wake (local development): keep polling /health.
    }
    if (response.status === 423) return 'disabled';
    const data = await response.json().catch(() => ({}));
    const state = data?.state || null;
    wakeEvery = state === 'pending' ? WAKE_RETRY_MS : SHUTDOWN_RETRY_MS;
    const changes = { state };
    if (state === 'pending' || state === 'running') {
      if (Number.isFinite(data.elapsed)) {
        changes.bootStartedAt = now() - data.elapsed * 1000;
        bootStartKnown = true;
      } else if (status.bootStartedAt == null) {
        changes.bootStartedAt = now(); // Older /wake without `elapsed`.
        bootStartKnown = state === 'pending';
      }
      changes.stoppingSince = null;
    } else if (state === 'stopping' && status.stoppingSince == null) {
      changes.stoppingSince = now();
    }
    update(changes);
    return state;
  }

  async function healthy() {
    try {
      const response = await fetchImpl('/health', { cache: 'no-store' });
      if (!response.ok) return false;
      const data = await response.json().catch(() => null);
      return data?.status === 'ok';
    } catch {
      return false;
    }
  }

  const done = (async () => {
    if (await wake() === 'disabled') return 'disabled';
    while (!cancelled) {
      if (await healthy()) {
        if (cancelled) break;
        if (bootStartKnown) recordWakeDuration((now() - status.bootStartedAt) / 1000, storage);
        update({ state: 'ready' });
        return 'ready';
      }
      if (cancelled) break;
      if (now() - status.startedAt > timeoutMs) return 'timeout';
      if (now() - lastWake >= wakeEvery && await wake() === 'disabled') return 'disabled';
      await wait(pollMs);
    }
    return 'cancelled';
  })();

  return { done, cancel() { cancelled = true; } };
}
