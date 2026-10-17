#!/usr/bin/env python3
"""Scripted sleep/wake/sync checks against the AWS simulator.

Starts its own simulator (fast timings, throwaway disk, ports 18080/15001),
drives it the way browsers and the waking page do, and prints PASS / FAIL /
NOTE for each step. Stdlib only.

    python dev-tools/aws-sim/scenarios.py              # everything
    python dev-tools/aws-sim/scenarios.py -k lobby     # scenarios whose name contains "lobby"
    python dev-tools/aws-sim/scenarios.py --list
    python dev-tools/aws-sim/scenarios.py --attach http://localhost:8080   # use a sim you started

Exit code is the number of failed checks (0 = all passed).
"""
from __future__ import annotations

import argparse
import http.client
import json
import random
import socket
import subprocess
import sys
import tempfile
import threading
import time
import traceback
import urllib.parse
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
WORDS = [w.strip() for w in (REPO / "data" / "sgb-words.txt").read_text().split() if len(w.strip()) == 5]

RESULTS = []
ARGS = None


def pick_word(state):
    """A word that satisfies hard mode (greens stay put, yellows are reused)."""
    greens, present, used = {}, set(), set()
    for g in (state or {}).get("guesses", []):
        used.add(g.get("guess"))
        for i, (ch, res) in enumerate(zip(g.get("guess", ""), g.get("result", []))):
            if res == "correct":
                greens[i] = ch
            if res in ("correct", "present"):
                present.add(ch)
    options = [w for w in WORDS if w not in used and all(w[i] == c for i, c in greens.items())
               and all(c in w for c in present)]
    return random.choice(options or WORDS)


def board(state):
    """Guesses as saved to disk (the per-turn 'points' field is response-only)."""
    return [(g.get("emoji"), g.get("guess"), tuple(g.get("result", []))) for g in (state or {}).get("guesses", [])]


def say(kind, msg):
    colors = {"PASS": "\033[32m", "FAIL": "\033[31m", "NOTE": "\033[33m", "....": "\033[90m"}
    tty = sys.stdout.isatty()
    tag = f"{colors.get(kind, '')}{kind}\033[0m" if tty else kind
    print(f"  {tag}  {msg}", flush=True)


def check(ok, msg, detail=""):
    RESULTS.append(("PASS" if ok else "FAIL", msg))
    say("PASS" if ok else "FAIL", msg + (f" — {detail}" if detail and not ok else ""))
    return ok


def note(msg):
    RESULTS.append(("NOTE", msg))
    say("NOTE", msg)


# ----------------------------------------------------------------------------
# A tiny browser: one cookie jar, same-origin headers, JSON helpers
# ----------------------------------------------------------------------------
class Client:
    def __init__(self, base, name):
        u = urllib.parse.urlsplit(base)
        self.host, self.port = u.hostname, u.port or 80
        self.origin = f"{u.scheme}://{u.netloc}"
        self.name = name
        self.cookies = {}
        self.emoji = None
        self.player_id = None

    def request(self, method, path, body=None, headers=None, timeout=15):
        conn = http.client.HTTPConnection(self.host, self.port, timeout=timeout)
        h = {"Origin": self.origin, "Sec-Fetch-Site": "same-origin", "User-Agent": f"scenario-{self.name}"}
        if self.cookies:
            h["Cookie"] = "; ".join(f"{k}={v}" for k, v in self.cookies.items())
        data = None
        if body is not None:
            data = json.dumps(body).encode()
            h["Content-Type"] = "application/json"
            h["X-WordSquad-Request"] = "1"
        h.update(headers or {})
        start = time.time()
        conn.request(method, path, body=data, headers=h)
        resp = conn.getresponse()
        raw = resp.read()
        self._store_cookies(resp)
        conn.close()
        ctype = resp.getheader("Content-Type") or ""
        parsed = None
        if "json" in ctype:
            try:
                parsed = json.loads(raw)
            except ValueError:
                pass
        return Resp(resp.status, ctype, raw, parsed, time.time() - start, dict(resp.getheaders()))

    def _store_cookies(self, resp):
        for k, v in resp.getheaders():
            if k.lower() == "set-cookie":
                name, _, rest = v.partition("=")
                self.cookies[name.strip()] = rest.split(";", 1)[0]

    def get(self, path, **kw):
        return self.request("GET", path, **kw)

    def post(self, path, body=None, **kw):
        return self.request("POST", path, body if body is not None else {}, **kw)

    # game helpers
    def age_ok(self):
        r = self.post("/age-check", {"age": 30})
        return r.status == 200

    def join(self, lobby=None, emoji=None):
        base = f"/lobby/{lobby}" if lobby else ""
        r = self.post(f"{base}/emoji", {"emoji": emoji or self.emoji, "player_id": self.player_id})
        if r.json and r.json.get("player_id"):
            self.player_id = r.json["player_id"]
            self.emoji = r.json.get("emoji", emoji)
        return r

    def guess(self, word=None, lobby=None):
        if word is None:
            word = pick_word(self.state(lobby).json)
        base = f"/lobby/{lobby}" if lobby else ""
        return self.post(f"{base}/guess", {"guess": word, "emoji": self.emoji, "player_id": self.player_id})

    def state(self, lobby=None):
        base = f"/lobby/{lobby}" if lobby else ""
        q = f"?emoji={urllib.parse.quote(self.emoji)}" if self.emoji else ""
        hdr = {"X-WordSquad-Player": self.player_id} if self.player_id else {}
        return self.get(f"{base}/state{q}", headers=hdr)


class Resp:
    def __init__(self, status, ctype, raw, parsed, elapsed, headers):
        self.status, self.ctype, self.raw, self.json, self.elapsed = status, ctype, raw, parsed, elapsed
        self.headers = headers

    @property
    def is_waking_page(self):
        return self.status == 503 and "text/html" in self.ctype and b"waking" in self.raw.lower()

    def __repr__(self):
        return f"<{self.status} {self.ctype.split(';')[0]} {self.raw[:80]!r}>"


class Stream(threading.Thread):
    """An EventSource-like reader that records every message and how it ended."""

    def __init__(self, client: Client, path):
        super().__init__(daemon=True)
        self.client, self.path = client, path
        self.messages = []
        self.status = None
        self.ctype = None
        self.ended = None
        self.opened = threading.Event()
        self.closed = threading.Event()
        self._conn = None

    def run(self):
        c = self.client
        try:
            self._conn = http.client.HTTPConnection(c.host, c.port, timeout=120)
            h = {"Accept": "text/event-stream", "Cookie": "; ".join(f"{k}={v}" for k, v in c.cookies.items())}
            self._conn.request("GET", self.path, headers=h)
            resp = self._conn.getresponse()
            self.status, self.ctype = resp.status, resp.getheader("Content-Type") or ""
            self.opened.set()
            if resp.status != 200 or "event-stream" not in self.ctype:
                resp.read()
                self.ended = "rejected"
                return
            buf = b""
            while True:
                chunk = resp.read1(4096)
                if not chunk:
                    self.ended = "eof"
                    break
                buf += chunk
                while b"\n\n" in buf:
                    block, buf = buf.split(b"\n\n", 1)
                    for line in block.split(b"\n"):
                        if line.startswith(b"data: "):
                            try:
                                self.messages.append((time.time(), json.loads(line[6:])))
                            except ValueError:
                                pass
        except Exception as err:
            self.ended = f"error: {err.__class__.__name__}"
        finally:
            self.opened.set()
            self.closed.set()

    def close(self):
        try:
            self._conn.sock.shutdown(socket.SHUT_RDWR)
        except Exception:
            pass


# ----------------------------------------------------------------------------
# Simulator handle
# ----------------------------------------------------------------------------
class Sim:
    def __init__(self, base, proc=None):
        self.base, self.proc = base, proc
        self.ctl = Client(base, "control")

    @classmethod
    def launch(cls, port, app_port, extra):
        state = tempfile.mkdtemp(prefix="wwf-sim-")
        cmd = [sys.executable, str(HERE / "aws_sim.py"), "--port", str(port), "--app-port", str(app_port),
               "--fresh", "--state-dir", state, "--preset", "fast", *extra]
        log = open(Path(state).parent / f"wwf-sim-{port}.log", "w")
        proc = subprocess.Popen(cmd, stdout=log, stderr=subprocess.STDOUT)
        base = f"http://localhost:{port}"
        for _ in range(50):
            try:
                Client(base, "probe").get("/__sim/api/status", timeout=1)
                break
            except OSError:
                time.sleep(0.2)
        else:
            sys.exit(f"simulator did not start; see {log.name}")
        print(f"simulator log: {log.name}")
        return cls(base, proc)

    def status(self):
        return self.ctl.get("/__sim/api/status").json

    def action(self, action, **kw):
        return self.ctl.post("/__sim/api/action", {"action": action, **kw}).json

    def wait_for(self, pred, timeout, step=0.25):
        end = time.time() + timeout
        while time.time() < end:
            s = self.status()
            if pred(s):
                return s
            time.sleep(step)
        return None

    def wait_state(self, state, timeout=60):
        return self.wait_for(lambda s: s["instance"] == state and not s["shutting_down"]
                             if state == "running" else s["instance"] == state, timeout)

    def ensure_awake(self, timeout=60):
        if self.status()["instance"] == "stopping":
            self.wait_state("stopped", timeout)
        if self.status()["instance"] == "stopped":
            self.action("wake")
        return self.wait_for(lambda s: s["instance"] == "running" and s["app_listening"]
                             and s["dns"] != "192.0.2.1" and s["nginx_up"] and not s["shutting_down"], timeout)

    def ensure_asleep(self, timeout=60):
        s = self.status()
        if s["instance"] == "running" and not s["shutting_down"]:
            self.action("sleep")
        return self.wait_state("stopped", timeout)

    def stop(self):
        if self.proc:
            self.proc.terminate()
            try:
                self.proc.wait(5)
            except subprocess.TimeoutExpired:
                self.proc.kill()


def waking_page_flow(client: Client, budget=300):
    """Follow frontend/waking.html's logic; return seconds until it would reload.

    (browser_check.py runs the real page; this is the stdlib stand-in.)
    """
    start = time.time()
    last_wake = start
    first = client.get("/wake")
    if first.status == 423:
        return None, "paused"
    # /wake only starts a stopped server: re-ask after 5 s unless it said "pending".
    every = 30 if (first.json or {}).get("state") == "pending" else 5
    while time.time() - start < budget:
        r = client.get("/health")
        if r.status == 200 and r.json and r.json.get("status") == "ok":
            return time.time() - start, "ready"
        if time.time() - last_wake > every:
            last_wake = time.time()
            w = client.get("/wake")
            every = 30 if (w.json or {}).get("state") == "pending" else 5
        time.sleep(4)
    return None, "gave up"


# ----------------------------------------------------------------------------
# Scenarios
# ----------------------------------------------------------------------------
SCENARIOS = []


def scenario(fn):
    SCENARIOS.append(fn)
    return fn


@scenario
def cold_visit_wakes_server(sim: Sim):
    """A visitor arrives while the server sleeps; the waking page brings it up."""
    sim.ensure_asleep()
    v = Client(sim.base, "visitor")
    home = v.get("/")
    check(home.status == 200, "home page (S3) loads while the server sleeps", repr(home))
    page = v.get("/game")
    check(page.is_waking_page, f"/game shows waking.html with 503 while asleep ({page.elapsed:.1f}s)", repr(page))
    secs, how = waking_page_flow(v)
    check(how == "ready", f"waking.html flow sees /health OK after {secs or 0:.1f}s", how)
    after = v.get("/game")
    check(after.status in (200, 302), f"/game after wake -> {after.status}", repr(after))


@scenario
def remembered_age_survives_return_and_sleep(sim: Sim):
    """Persistent eligibility survives a return visit and an origin sleep/wake."""
    sim.ensure_awake()
    for age, eligibility in [(30, "eligible"), (12, "blocked")]:
        visitor = Client(sim.base, f"age-{age}")
        response = visitor.post("/age-check", {"age": age})
        cookie = response.headers.get("Set-Cookie", "")
        check("Expires=" in cookie and "HttpOnly" in cookie,
              f"age {age}: edge forwards a persistent HttpOnly cookie", cookie)
        returning = Client(sim.base, f"returning-{age}")
        returning.cookies = visitor.cookies.copy()
        check(returning.get("/age-status").json == {"eligibility": eligibility},
              f"age {age}: return visit remembers the result")
        sim.ensure_asleep()
        sim.ensure_awake()
        check(returning.get("/age-status").json == {"eligibility": eligibility},
              f"age {age}: result survives origin sleep/wake")
    fresh = Client(sim.base, "fresh-profile")
    check(fresh.get("/age-status").json == {"eligibility": "unknown"},
          "a different browser profile still requires its own age check")


@scenario
def api_calls_while_asleep_get_html(sim: Sim):
    """What fetch()/EventSource calls receive while the server sleeps."""
    p = Client(sim.base, "p")
    sim.ensure_awake()
    p.age_ok()
    p.join(emoji="🐶")
    sim.ensure_asleep()
    for method, path in [("GET", "/state"), ("POST", "/guess"), ("POST", "/state"), ("GET", "/stream"),
                         ("POST", "/emoji"), ("POST", "/lobby"), ("POST", "/activity"), ("GET", "/health")]:
        r = p.request(method, path, body={} if method == "POST" else None)
        check(r.is_waking_page and r.json is None,
              f"{method} {path} while asleep -> {r.status} HTML after {r.elapsed:.1f}s (not JSON)", repr(r))
    w = p.get("/wake")
    check(w.status == 202 and w.json == {"state": "pending", "elapsed": 0}, "/wake from asleep -> 202 pending, elapsed 0",
          repr(w))
    note("Every game API call gets the HTML waking page while asleep; the game page has to "
         "recognise it (serverWake.js) and call /wake itself when a player acts.")
    sim.ensure_awake()


@scenario
def default_game_survives_sleep(sim: Sim):
    """The /game (DEFAULT) board, scores and identity after a sleep/wake cycle."""
    sim.ensure_awake()
    p = Client(sim.base, "default")
    check(p.age_ok(), "age check passes")
    j = p.join(emoji="🦊")
    check(j.status == 200 and p.player_id, "player registered on /game", repr(j))
    word = random.choice(WORDS)
    g = p.guess(word)
    check(g.status == 200 and (g.json or {}).get("status") == "ok", f"guess '{word}' accepted", repr(g))
    before = p.state().json or {}
    sim.ensure_asleep()
    sim.ensure_awake()
    r = p.state()
    after = r.json or {}
    check(r.status == 200, "age session cookie still valid after wake (same SECRET_KEY)", repr(r))
    check(board(after) == board(before) and board(after),
          f"board kept its guesses ({len(before.get('guesses', []))} before, {len(after.get('guesses', []))} after)")
    check(p.emoji in after.get("active_emojis", []), "player still on the leaderboard after wake",
          f"active={after.get('active_emojis')}")
    g2 = p.guess()
    check(g2.status == 200 and (g2.json or {}).get("status") == "ok", "can keep guessing after wake", repr(g2))


@scenario
def lobby_survives_sleep(sim: Sim):
    """A lobby's board and players after a sleep/wake cycle (inside LOBBY_TTL)."""
    sim.ensure_awake()
    host = Client(sim.base, "host")
    host.age_ok()
    r = host.post("/lobby", {})
    code = (r.json or {}).get("id")
    if not check(bool(code), "lobby created", repr(r)):
        return
    host.join(code, "🐼")
    g = host.guess(random.choice(WORDS), code)
    check((g.json or {}).get("status") == "ok", "guess accepted in lobby", repr(g))
    before = host.state(code).json or {}
    sim.ensure_asleep()
    sim.ensure_awake()
    r2 = host.state(code)
    after = r2.json or {}
    check(r2.status == 200, f"lobby {code} still exists after wake", repr(r2))
    check(board(after) == board(before) and board(after), "lobby board identical after wake",
          f"{len(before.get('guesses', []))} -> {len(after.get('guesses', []))}")
    check(host.emoji in after.get("active_emojis", []), "host still in lobby after wake")


@scenario
def stream_across_sleep(sim: Sim):
    """What an open live-update stream sees when the server sleeps and wakes."""
    sim.ensure_awake()
    p = Client(sim.base, "streamer")
    p.age_ok()
    code = p.post("/lobby", {}).json["id"]
    p.join(code, "🐸")
    s = Stream(p, f"/lobby/{code}/stream")
    s.start()
    s.opened.wait(20)   # headers arrive with the first event or the 15 s keepalive
    check(s.status == 200 and "event-stream" in (s.ctype or ""), "stream opens while awake")
    sim.action("sleep")
    s.closed.wait(60)
    check(s.closed.is_set(), f"stream is cut when the server shuts down ({s.ended})")
    sim.wait_state("stopped")
    s2 = Stream(p, f"/lobby/{code}/stream")
    s2.start()
    s2.closed.wait(20)
    check(s2.status == 503 and "text/html" in (s2.ctype or ""),
          f"reconnecting while asleep -> {s2.status} {s2.ctype}")
    note("EventSource treats a non-200 or non-event-stream reply as fatal and stops retrying, "
         "so the page has to reopen the stream itself once the server is back (networkManager.resumeStream).")
    sim.ensure_awake()
    s3 = Stream(p, f"/lobby/{code}/stream")
    s3.start()
    s3.opened.wait(20)
    check(s3.status == 200, "a fresh stream works after wake")
    s3.close()


@scenario
def two_clients_stay_in_sync(sim: Sim):
    """Two players in a lobby: B sees A's guess live, before and after a deploy restart and a sleep."""
    sim.ensure_awake()
    a, b = Client(sim.base, "A"), Client(sim.base, "B")
    a.age_ok(), b.age_ok()
    code = a.post("/lobby", {}).json["id"]
    a.join(code, "🐯")
    b.join(code, "🐨")

    def live_update(label):
        s = Stream(b, f"/lobby/{code}/stream")
        s.start()
        time.sleep(1)   # let the stream register before A guesses
        word = pick_word(a.state(code).json)
        t0 = time.time()
        g = a.guess(word, code)
        ok = (g.json or {}).get("status") == "ok"
        deadline = time.time() + 5
        got = None
        while time.time() < deadline and not got:
            for ts, msg in s.messages:
                if any(x.get("guess") == word for x in msg.get("guesses", []) if isinstance(x, dict)):
                    got = ts - t0
            time.sleep(0.05)
        check(ok and got is not None, f"{label}: B's stream shows A's guess" +
              (f" in {got * 1000:.0f} ms" if got is not None else ""), repr(g))
        s.close()

    live_update("awake")
    launches = sim.status()["app_launches"]
    sim.action("restart")
    sim.wait_for(lambda st: st["app_launches"] > launches and st["app_listening"], 40)
    sim.ensure_awake()
    a.join(code)   # what the page does on load: reclaim emoji
    b.join(code)
    live_update("after deploy restart")
    sim.ensure_asleep()
    sim.ensure_awake()
    a.join(code)
    b.join(code)
    live_update("after sleep/wake")


@scenario
def idle_accounting(sim: Sim):
    """What keeps the server awake: watching vs. interacting."""
    sim.ensure_awake()
    original_idle = sim.status()["timings"]["idle"]
    sim.action("idle", seconds=20)
    sim.action("activity")
    watcher = Client(sim.base, "watcher")
    watcher.age_ok()
    code = watcher.post("/lobby", {}).json["id"]
    watcher.join(code, "🐙")
    sim.action("activity")
    # Watch only: SSE stream + GET polling, no input.
    s = Stream(watcher, f"/lobby/{code}/stream")
    s.start()
    t0 = time.time()
    stopped = None
    while time.time() - t0 < 60:
        watcher.state(code)
        st = sim.status()
        if st["shutting_down"] or st["instance"] != "running":
            stopped = time.time() - t0
            break
        time.sleep(2)
    check(stopped is not None, f"a tab that only watches lets the server sleep ({stopped or 0:.0f}s, limit 20s)")
    note("By design (user_data.sh nginx map): GET /state, /stream and /health don't count as activity. "
         "Two players reading the board / thinking for longer than IDLE_MINUTES get stopped mid-round.")
    s.close()
    sim.wait_state("stopped")
    sim.ensure_awake()
    sim.action("activity")
    # Interact: /activity pings like activityPing.js (at most one per minute in the real client).
    t0 = time.time()
    while time.time() - t0 < 30:
        watcher.post("/activity")
        if sim.status()["shutting_down"]:
            break
        time.sleep(5)
    st = sim.status()
    check(st["instance"] == "running" and not st["shutting_down"],
          "POST /activity pings keep it awake past the idle limit")
    sim.action("idle", seconds=original_idle)


@scenario
def wake_during_shutdown(sim: Sim):
    """Someone arrives just as the idle timer shuts the server down."""
    sim.ensure_awake()
    v = Client(sim.base, "late")
    sim.action("sleep")
    time.sleep(0.5)
    first = v.get("/wake")
    note(f"/wake during idle shutdown -> {first.status} {first.json} (EC2 still says it is running)")
    secs, how = waking_page_flow(v)
    st = sim.status()
    normal = sim.status()["timings"]
    limit = normal["stop"] + normal["boot"] + max(normal["dns"], normal["nginx"], normal["app_delay"]) + 20
    check(how == "ready" and secs < limit,
          f"waking page gets the server back soon after the shutdown ({secs or 0:.0f}s, limit {limit:.0f}s)", how)
    note(f"wake requests that started the box: {st['wakes']} total so far")


@scenario
def crash_recovers(sim: Sim):
    """The app container dies; systemd restarts it; state survives."""
    sim.ensure_awake()
    p = Client(sim.base, "crash")
    p.age_ok()
    code = p.post("/lobby", {}).json["id"]
    p.join(code, "🐵")
    p.guess(random.choice(WORDS), code)
    before = p.state(code).json
    launches = sim.status()["app_launches"]
    sim.action("crash")
    during = p.state(code)
    check(during.is_waking_page, f"requests during the crash get the waking page ({during.status})")
    ok = sim.wait_for(lambda s: s["app_launches"] > launches and s["app_listening"], 40)
    check(bool(ok), "systemd brings the app back")
    after = p.state(code).json or {}
    check(board(after) == board(before) and board(after), "lobby board survived the crash")


@scenario
def private_room_survives_sleep(sim: Sim):
    """A private (streamer) room: membership, board and live stream across a sleep."""
    own = None
    if sim.status()["app_env"] == "production":
        # Production refuses private rooms without TLS Redis (rediss://), which this
        # machine doesn't have. Use a second simulator in development mode, where the
        # same store is a locked JSON file on the simulated disk (Redis AOF in AWS).
        own = sim = Sim.launch(ARGS.port + 2, ARGS.app_port + 2, ["--app-env", "development", *ARGS.sim_arg])
        note("private rooms run on a second simulator with --app-env development (file store instead of Redis)")
    try:
        sim.ensure_awake()
        host, guest = Client(sim.base, "host"), Client(sim.base, "guest")
        host.age_ok(), guest.age_ok()
        r = host.post("/lobby", {"private": True})
        code = (r.json or {}).get("id")
        if not check(bool(code) and r.json.get("private"), "private room created", repr(r)):
            return
        host.post(f"/lobby/{code}/emoji", {"emoji": "🦉"})
        g = host.post(f"/lobby/{code}/guess", {"guess": pick_word(host.get(f"/lobby/{code}/state").json)})
        check((g.json or {}).get("status") == "ok", "host guesses in the private room", repr(g))
        before = host.get(f"/lobby/{code}/state").json
        outsider = guest.get(f"/lobby/{code}/state")
        check(outsider.status in (403, 404), f"non-member can't read the room ({outsider.status})")
        s = Stream(host, f"/lobby/{code}/stream")
        s.start()
        time.sleep(1)
        sim.ensure_asleep()
        s.closed.wait(30)
        check(s.closed.is_set(), f"private stream cut by the shutdown ({s.ended})")
        sim.ensure_awake()
        ctx = host.get(f"/private/context?room={code}")
        check(ctx.status == 200 and (ctx.json or {}).get("host"), "host's room session still valid after wake", repr(ctx))
        after = host.get(f"/lobby/{code}/state").json
        check(board(after) == board(before) and board(after), "private board identical after wake")
        s2 = Stream(host, f"/lobby/{code}/stream")
        s2.start()
        time.sleep(1)
        g2 = host.post(f"/lobby/{code}/guess", {"guess": pick_word(after)})
        got = wait(lambda: s2.messages, 5)
        check((g2.json or {}).get("status") == "ok" and got, "new private stream delivers updates after wake")
        s2.close()
        outsider = guest.get(f"/lobby/{code}/state")
        check(outsider.status in (403, 404), f"non-member still locked out after wake ({outsider.status})")
    finally:
        if own:
            own.stop()


def wait(fn, timeout, step=0.1):
    end = time.time() + timeout
    while time.time() < end:
        v = fn()
        if v:
            return v
        time.sleep(step)
    return None


@scenario
def budget_kill_switch(sim: Sim):
    """Budget cap: server stops and /wake refuses."""
    sim.ensure_awake()
    sim.action("killswitch", on=True)
    sim.wait_state("stopped")
    v = Client(sim.base, "broke")
    r = v.get("/wake")
    check(r.status == 423 and (r.json or {}).get("state") == "disabled", "/wake -> 423 while capped", repr(r))
    sim.action("killswitch", on=False)
    r = v.get("/wake")
    check(r.status == 202, "/wake works again once cleared", repr(r))
    sim.ensure_awake()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("-k", help="only run scenarios whose name contains this")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--attach", help="use an already running simulator at this URL")
    ap.add_argument("--port", type=int, default=18080)
    ap.add_argument("--app-port", type=int, default=15001)
    ap.add_argument("--sim-arg", action="append", default=[],
                    help="extra argument for aws_sim.py, e.g. --sim-arg=--runner=gunicorn")
    args = ap.parse_args()
    global ARGS
    ARGS = args
    chosen = [s for s in SCENARIOS if not args.k or args.k in s.__name__]
    if args.list:
        for s in SCENARIOS:
            print(f"{s.__name__:32} {s.__doc__}")
        return 0
    sim = Sim(args.attach) if args.attach else Sim.launch(args.port, args.app_port, args.sim_arg)
    st = sim.status()
    print(f"app: {st['app_kind']}, FLASK_ENV={st['app_env']}, routes from {st['routes_from']}\n")
    try:
        for fn in chosen:
            print(f"\n▶ {fn.__name__}: {fn.__doc__}")
            try:
                fn(sim)
            except Exception as err:
                check(False, f"{fn.__name__} crashed: {err}")
                traceback.print_exc()
    finally:
        sim.stop()
    fails = [m for k, m in RESULTS if k == "FAIL"]
    passes = sum(1 for k, _ in RESULTS if k == "PASS")
    print(f"\n{passes} passed, {len(fails)} failed")
    for m in fails:
        print(f"  FAIL  {m}")
    return len(fails)


if __name__ == "__main__":
    sys.exit(main())
