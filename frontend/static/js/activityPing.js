// Tells the game server "someone is still here" while a player is typing,
// tapping or clicking, so the server's idle shutdown (see infra/terraform,
// idle_shutdown_minutes) never stops it mid-game. Typing letters doesn't
// otherwise reach the server until a guess is submitted.
//
// At most one tiny request per minute, only while the player is actually
// interacting; an idle open tab sends nothing and lets the server sleep.
export const PING_INTERVAL_MS = 60 * 1000;
const EVENTS = ['keydown', 'pointerdown', 'input'];

export function startActivityPings(target = window, now = () => Date.now()) {
  let lastPing = -Infinity;
  const ping = () => {
    const time = now();
    if (time - lastPing < PING_INTERVAL_MS) return;
    lastPing = time;
    try {
      if (navigator.sendBeacon?.('/activity')) return;
    } catch { /* Fall back to fetch below. */ }
    fetch('/activity', { method: 'POST', keepalive: true, headers: { 'X-WordSquad-Request': '1' } })
      .catch(() => { /* Server asleep or offline: nothing to keep awake. */ });
  };
  for (const type of EVENTS) target.addEventListener(type, ping, { capture: true, passive: true });
  return ping;
}
