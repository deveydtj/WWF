"""Game tabs and the waking page across a server sleep/wake.

The server stops itself when idle; while it is down CloudFront answers every
game request with waking.html (503, text/html). These tests run the real
frontend modules in Node with fake fetch/EventSource/timers and check that:

* a player's action wakes the server, but an unattended tab never does;
* a tab whose live stream died reopens it once the server answers again;
* API calls report a sleeping server instead of throwing on the HTML reply;
* waking.html re-sends /wake quickly when it arrived during a shutdown.
"""
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Minimal browser globals so the game modules import under Node.
PRELUDE = r"""
import assert from 'node:assert/strict';
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.sessionStorage = globalThis.localStorage;
const noopList = { add() {}, remove() {}, toggle() {}, contains: () => false };
globalThis.document = {
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  addEventListener() {}, documentElement: { style: { setProperty() {} }, classList: noopList },
  body: { classList: noopList },
};
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });

const html503 = () => ({ status: 503, ok: false, headers: { get: () => 'text/html' },
                         json: async () => { throw new SyntaxError("Unexpected token '<'"); } });
const json = (status, body) => ({ status, ok: status < 400, headers: { get: () => 'application/json' },
                                  json: async () => body });
const calls = [];
let reply = () => json(200, {});
globalThis.fetch = async (url, opts = {}) => { calls.push([opts.method || 'GET', url]); return reply(url, opts); };
const wakeCalls = () => calls.filter(([, url]) => url === '/wake').length;
const tick = () => new Promise(resolve => setImmediate(resolve));
const element = () => ({ textContent: '', style: {}, addEventListener() {} });
const messages = { messageEl: element(), messagePopup: element() };
"""


def run_node(script):
    result = subprocess.run(["node", "--input-type=module", "-e", PRELUDE + script], cwd=ROOT,
                            capture_output=True, text=True, timeout=60)
    assert result.returncode == 0, result.stderr[-3000:]


def test_wake_requests_are_recognised_and_rate_limited():
    run_node(r"""
const wake = await import('./frontend/static/js/serverWake.js');
assert.equal(wake.isWakingPage(html503()), true);
assert.equal(wake.isWakingPage(json(503, { msg: 'Private rooms temporarily unavailable' })), false);
assert.equal(wake.isWakingPage(json(200, {})), false);

let clock = 0;
const now = () => clock;
reply = () => json(202, { state: 'pending' });
assert.equal(await wake.requestWake({ now }), 'pending');
clock += 10_000;
assert.equal(await wake.requestWake({ now }), null, 'booting: no second start request within 30 s');
assert.equal(wakeCalls(), 1);

// Arrived during an idle shutdown: /wake can't start it yet, so retry after 5 s.
wake.resetWakeStateForTests();
reply = () => json(200, { state: 'running' });
assert.equal(await wake.requestWake({ now }), 'running');
clock += wake.SHUTDOWN_RETRY_MS;
reply = () => json(202, { state: 'stopping' });
assert.equal(await wake.requestWake({ now }), 'stopping');
assert.equal(wakeCalls(), 3);

// Budget cap: stop asking.
wake.resetWakeStateForTests();
reply = () => json(423, { state: 'disabled' });
assert.equal(await wake.requestWake({ now }), 'disabled');
clock += 60_000;
assert.equal(await wake.requestWake({ now }), null);
assert.equal(wake.wakePaused(), true);
""")


def test_api_calls_report_a_sleeping_server_instead_of_throwing():
    run_node(r"""
const api = await import('./frontend/static/js/api.js');
reply = (url) => url === '/wake' ? json(202, { state: 'pending' }) : html503();
const guess = await api.sendGuess('crane', '🦊', 'p1', 'ABC123');
assert.equal(guess.status, 'error');
assert.equal(guess.waking, true);
await tick();
assert.equal(wakeCalls(), 1, 'submitting a guess is a player action, so it wakes the server');

// Any other non-JSON reply (e.g. an HTML 500) becomes an error message, not an exception.
reply = () => ({ status: 500, ok: false, headers: { get: () => 'text/html' },
                 json: async () => { throw new SyntaxError('bad'); } });
const chat = await api.sendChatMessage('hi', '🦊', 'p1', 'ABC123');
assert.equal(chat.status, 'error');
assert.ok(!chat.waking);

reply = () => html503();
await assert.rejects(api.getState('🦊', 'ABC123', 'p1'), err => err.status === 503 && err.waking === true);
""")


def test_unattended_tab_never_wakes_the_server_but_a_player_does():
    run_node(r"""
const { resetWakeStateForTests } = await import('./frontend/static/js/serverWake.js');
const nm = (await import('./frontend/static/js/networkManager.js')).default;
nm.initialize({ onStateUpdate() {}, messageHandlers: messages });
reply = (url) => url === '/wake' ? json(202, { state: 'pending' }) : html503();

// Nobody has touched the tab for over a minute: poll, but don't wake.
nm.lastActivity = Date.now() - 5 * 60 * 1000;
await nm.fetchState('🦊', 'ABC123');
await nm.fetchState('🦊', 'ABC123');
await tick();
assert.equal(nm.serverAsleep, true);
assert.equal(wakeCalls(), 0);

// A player types or taps: wake it.
resetWakeStateForTests();
nm.onActivity('🦊', 'p1', 'ABC123');
await tick(); await tick();
assert.equal(wakeCalls(), 1);
nm.cleanup();
""")


def test_tab_reopens_its_live_stream_after_the_server_returns():
    run_node(r"""
const streams = [];
globalThis.EventSource = class {
  constructor(url) { this.url = url; this.closed = false; streams.push(this); }
  close() { this.closed = true; }
};
const nm = (await import('./frontend/static/js/networkManager.js')).default;
const updates = [];
nm.initialize({ onStateUpdate: s => updates.push(s), messageHandlers: messages });
nm.initEventStream('ABC123', '🦊');
assert.equal(streams.length, 1);

// Server goes away: the stream errors and the tab falls back to polling.
streams[0].onerror();
assert.equal(nm.eventSource, null);
assert.ok(nm.pollTimer, 'polling covers the outage');

reply = () => html503();
nm.lastStreamAttempt = 0;
await nm.fetchState('🦊', 'ABC123');
assert.equal(streams.length, 1, 'no stream while the server is still down');

// Server is back: the next successful fetch reopens the stream...
reply = () => json(200, { guesses: [] });
await nm.fetchState('🦊', 'ABC123');
assert.equal(streams.length, 2);
assert.equal(streams[1].url, '/lobby/ABC123/stream');
assert.equal(nm.eventSource, streams[1]);
// ...and polling stops once it is live.
streams[1].onopen();
assert.equal(nm.pollTimer, null);
assert.equal(updates.length, 1);
nm.cleanup();
""")


def test_waking_page_retries_quickly_when_it_arrives_mid_shutdown():
    """Run waking.html's script with fake timers: /wake says 'stopping' first."""
    page = (ROOT / "frontend/waking.html").read_text()
    script = page.split("<script>")[1].split("</script>")[0]
    run_node(r"""
let clock = 0;
const timers = [];
Date.now = () => clock;
globalThis.setTimeout = (fn, ms) => { timers.push([clock + ms, fn]); return timers.length; };
globalThis.clearTimeout = () => {};
const els = {};
document.getElementById = id => (els[id] ||= { textContent: '', hidden: true, style: {}, attrs: {},
                                              setAttribute(k, v) { this.attrs[k] = v; }, addEventListener() {} });
let reloaded = false;
globalThis.location = { reload() { reloaded = true; } };
window.location = globalThis.location;
const wakeTimes = [];
let startedAt = null;   // when /wake actually started the server
reply = (url) => {
  if (url === '/wake') {
    wakeTimes.push(clock);
    if (clock < 12_000) return json(202, { state: 'stopping' });   // idle shutdown still finishing
    startedAt ??= clock;
    return json(202, { state: startedAt === clock ? 'pending' : 'running' });
  }
  const up = startedAt !== null && clock - startedAt >= 20_000;
  return up ? json(200, { status: 'ok' }) : html503();
};
const settle = async () => { for (let i = 0; i < 20; i++) await tick(); };
""" + script + r"""
await settle();
const etaSeen = new Set();
for (let step = 0; step < 600 && !reloaded; step++) {
  timers.sort((x, y) => x[0] - y[0]);
  const [at, fn] = timers.shift();
  clock = at;
  fn();
  await settle();
  etaSeen.add(els.eta.textContent);
}
assert.ok(wakeTimes.length >= 2);
assert.ok(wakeTimes[1] - wakeTimes[0] <= 9_000, `second /wake after ${wakeTimes[1] - wakeTimes[0]} ms`);
assert.ok(startedAt <= 20_000, `server only started at ${startedAt} ms`);
assert.ok(reloaded, 'reloads once /health is ok');
// The estimate counts down live while it waits.
const clocks = [...etaSeen].filter(text => /^\d:\d\d$/.test(text));
assert.ok(clocks.length >= 10, `countdown values seen: ${[...etaSeen].join(', ')}`);
// Once the start request is in, it stops nagging every 5 s... until "running" comes back.
assert.ok(wakeTimes.length < 12, `${wakeTimes.length} wake requests`);
""")
