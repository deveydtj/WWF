"""The live wait estimate shown while a sleeping server starts.

/wake returns `elapsed` (seconds since the boot began) while the server is
pending or running. The landing page's wake panel and waking.html turn that
into a countdown and progress bar, and learn the usual boot length from wakes
this browser has watched.
"""
import importlib.util
import json
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

ROOT = Path(__file__).resolve().parents[1]

PRELUDE = r"""
import assert from 'node:assert/strict';
const store = {};
globalThis.localStorage = { getItem: k => store[k] ?? null, setItem(k, v) { store[k] = String(v); } };
const json = (status, body) => ({ status, ok: status < 400, headers: { get: () => 'application/json' },
                                  json: async () => body });
const html503 = () => ({ status: 503, ok: false, headers: { get: () => 'text/html' },
                         json: async () => { throw new SyntaxError("Unexpected token '<'"); } });
"""


def run_node(script):
    result = subprocess.run(["node", "--input-type=module", "-e", PRELUDE + script], cwd=ROOT,
                            capture_output=True, text=True, timeout=60)
    assert result.returncode == 0, result.stderr[-3000:]


def test_estimate_counts_down_and_never_finishes_early():
    run_node(r"""
const est = await import('./frontend/static/js/wakeEstimate.js');
let e = est.estimateWake({ state: 'pending', elapsed: 15, typical: 60 });
assert.equal(e.remaining, 45);
assert.ok(Math.abs(e.progress - 0.225) < 1e-9);
assert.equal(e.overdue, false);
// Past the usual time: no negative countdown, and the bar creeps but never completes.
e = est.estimateWake({ state: 'running', elapsed: 600, typical: 60 });
assert.equal(e.remaining, 0);
assert.equal(e.overdue, true);
assert.ok(e.progress > 0.9 && e.progress < 0.99);
// Caught mid-shutdown: finish stopping, then a full boot.
e = est.estimateWake({ state: 'stopping', elapsed: null, stoppingFor: 0, typical: 60 });
assert.equal(e.remaining, 60 + est.SHUTDOWN_SECONDS);
assert.equal(est.estimateWake({ state: 'stopping', stoppingFor: 999, typical: 60 }).remaining, 60);
// Unknown start: no number to count down from.
assert.equal(est.estimateWake({ state: null, elapsed: null }).remaining, null);
assert.equal(est.formatClock(75), '1:15');
assert.equal(est.formatClock(9.2), '0:10');
""")


def test_usual_boot_length_learns_from_recent_wakes():
    run_node(r"""
const est = await import('./frontend/static/js/wakeEstimate.js');
assert.equal(est.typicalWakeSeconds(), est.DEFAULT_WAKE_SECONDS);
for (const s of [40, 44, 2, 999, 48]) est.recordWakeDuration(s);   // 2 and 999 are ignored
assert.deepEqual(est.readWakeHistory(), [40, 44, 48]);
assert.equal(est.typicalWakeSeconds(), 44);
for (const s of [50, 52, 54, 56]) est.recordWakeDuration(s);
assert.equal(est.readWakeHistory().length, 5, 'keeps only the last few');
localStorage.setItem(est.WAKE_HISTORY_KEY, 'not json');
assert.equal(est.typicalWakeSeconds(), est.DEFAULT_WAKE_SECONDS);
""")


def test_watcher_follows_the_boot_and_learns_its_length():
    run_node(r"""
const { watchServerWake } = await import('./frontend/static/js/wakeWatcher.js');
let clock = 1_000_000;
const calls = [];
const bootAt = clock - 10_000;   // someone else started it 10 s ago
const fetchImpl = async url => {
  calls.push(url);
  if (url === '/wake') return json(202, { state: clock - bootAt < 20_000 ? 'pending' : 'running',
                                          elapsed: Math.floor((clock - bootAt) / 1000) });
  return clock - bootAt >= 45_000 ? json(200, { status: 'ok' }) : html503();
};
const seen = [];
const watch = watchServerWake({ fetchImpl, now: () => clock, wait: async ms => { clock += ms; },
                                typical: 60, onChange: s => seen.push(s) });
assert.equal(await watch.done, 'ready');
assert.equal(seen[0].state, 'pending');
assert.equal(seen[0].bootStartedAt, bootAt, 'anchored to when the boot began, not when we asked');
assert.equal(seen.at(-1).state, 'ready');
assert.ok(calls.filter(u => u === '/wake').length <= 3, 'does not nag /wake while it boots');
const history = JSON.parse(localStorage.getItem('wakeDurations'));
assert.equal(history.length, 1);
assert.ok(history[0] >= 45 && history[0] <= 48, `learned ${history[0]} s`);
""")


def test_watcher_reports_the_budget_pause_and_can_be_cancelled():
    run_node(r"""
const { watchServerWake } = await import('./frontend/static/js/wakeWatcher.js');
let watch = watchServerWake({ fetchImpl: async () => json(423, { state: 'disabled' }), wait: async () => {} });
assert.equal(await watch.done, 'disabled');

let clock = 0;
watch = watchServerWake({
  fetchImpl: async url => url === '/wake' ? json(202, { state: 'pending', elapsed: 0 }) : html503(),
  now: () => clock, wait: async ms => { clock += ms; if (clock > 9000) watch.cancel(); },
});
assert.equal(await watch.done, 'cancelled');

clock = 0;
watch = watchServerWake({
  fetchImpl: async url => url === '/wake' ? json(202, { state: 'pending' }) : html503(),
  now: () => clock, wait: async ms => { clock += ms; }, timeoutMs: 30_000,
});
assert.equal(await watch.done, 'timeout');
""")


def _load_lambda(monkeypatch):
    for key in ('INSTANCE_ID', 'HOSTED_ZONE_ID', 'ORIGIN_RECORD', 'WAKE_DISABLED_PARAM'):
        monkeypatch.setenv(key, 'test-' + key.lower())
    clients = {name: Mock() for name in ('ec2', 'route53', 'ssm')}
    monkeypatch.setitem(sys.modules, 'boto3', SimpleNamespace(client=lambda name: clients[name]))
    monkeypatch.setitem(sys.modules, 'botocore', SimpleNamespace())
    monkeypatch.setitem(sys.modules, 'botocore.exceptions', SimpleNamespace(ClientError=Exception))
    path = ROOT / 'infra/terraform/origin_control_lambda.py'
    spec = importlib.util.spec_from_file_location('wake_estimate_lambda', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    clients['ssm'].get_parameter.return_value = {'Parameter': {'Value': 'false'}}
    return module, clients['ec2']


def test_wake_lambda_reports_seconds_since_the_boot_began(monkeypatch, capsys):
    module, ec2 = _load_lambda(monkeypatch)
    instance = {'State': {'Name': 'pending'},
                'LaunchTime': datetime.now(timezone.utc) - timedelta(seconds=25)}
    ec2.describe_instances.return_value = {'Reservations': [{'Instances': [instance]}]}
    event = {'requestContext': {'requestId': 'r', 'http': {}}, 'headers': {}}

    body = json.loads(module.lambda_handler(event, None)['body'])
    assert body['state'] == 'pending' and 25 <= body['elapsed'] <= 27

    # Starting it now: the boot begins at zero, whatever the old LaunchTime says.
    instance['State']['Name'] = 'stopped'
    instance['LaunchTime'] = datetime.now(timezone.utc) - timedelta(days=3)
    assert json.loads(module.lambda_handler(event, None)['body']) == {'state': 'pending', 'elapsed': 0}
    capsys.readouterr()

    # Mid-shutdown there is no boot to time; a missing LaunchTime is tolerated.
    instance['State']['Name'] = 'stopping'
    assert json.loads(module.lambda_handler(event, None)['body']) == {'state': 'stopping'}
    instance['State']['Name'] = 'running'
    del instance['LaunchTime']
    assert json.loads(module.lambda_handler(event, None)['body']) == {'state': 'running'}


def test_waking_page_counts_down_from_the_servers_boot_time():
    page = (ROOT / "frontend/waking.html").read_text()
    script = page.split("<script>")[1].split("</script>")[0]
    run_node(r"""
globalThis.window = globalThis;
let clock = 0;
const timers = [];
Date.now = () => clock;
globalThis.setTimeout = (fn, ms) => { timers.push([clock + ms, fn]); return timers.length; };
globalThis.clearTimeout = () => {};
const els = {};
globalThis.document = { getElementById: id => (els[id] ||= { textContent: '', hidden: false, style: {},
  attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener() {} }) };
globalThis.location = { reload() {} };
globalThis.fetch = async url => url === '/wake'
  ? json(202, { state: 'running', elapsed: 50 + Math.floor(clock / 1000) }) : html503();
const settle = async () => { for (let i = 0; i < 20; i++) await new Promise(r => setImmediate(r)); };
""" + script + r"""
await settle();
assert.equal(els.eta.textContent, '0:10', 'booted 50 s ago, about a minute usual');
assert.equal(els.etaLabel.textContent, 'estimated wait');
assert.equal(els.barFill.style.width, '75%');
while (clock < 11_000) {
  timers.sort((x, y) => x[0] - y[0]);
  const [at, fn] = timers.shift();
  clock = at; fn(); await settle();
}
assert.equal(els.eta.textContent, 'Any second');
""")
