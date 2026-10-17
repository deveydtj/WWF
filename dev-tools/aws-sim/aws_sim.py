#!/usr/bin/env python3
"""Local stand-in for WordSquad's AWS sleep/wake stack.

Production (infra/terraform/main.tf, origin_control_lambda.py, user_data.sh.tftpl):

    browser -> CloudFront -> S3 (static site, always on)
                          -> origin.<domain>:443  (one EC2 box: nginx -> API container)
                          -> /wake                (Lambda: starts the box)

    * The box stops itself after IDLE_MINUTES with no "activity" (see the nginx map).
    * While it is stopped, origin DNS is parked on 192.0.2.1, CloudFront times out
      after 3 s, and its 502/504 custom error response serves /waking.html with a
      503 status -- for every API path, including fetch() and EventSource calls.
    * /waking.html calls /wake and polls /health, then reloads.

This script plays every one of those parts on one port so the real app and the
real frontend build can be put through sleep/wake cycles locally:

    edge (CloudFront)  routing table parsed from main.tf, header/cookie
                       whitelist, 3 s connect timeout, 60 s read timeout,
                       502/504 -> waking.html (503)
    S3                 serves frontend/dist (missing keys -> 403, like OAC)
    Lambda /wake       start / "stopping" / 423 kill-switch behaviour
    EC2                stopped -> pending -> running -> stopping -> stopped
    Route 53           origin record parked while stopped, updated after boot
    nginx              activity map + /activity 204 + 502 while the app is down
    systemd            wwf-app Restart=always (5 s), docker stop -t 20 on shutdown,
                       wwf-idle.timer idle shutdown
    API container      the real backend, imported like gunicorn does

Open http://localhost:8080/__sim for the control panel. See README.md.
"""
from __future__ import annotations

import argparse
import collections
import fnmatch
import http.client
import http.server
import json
import mimetypes
import os
import re
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.parse
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
MAIN_TF = REPO / "infra" / "terraform" / "main.tf"

# ----------------------------------------------------------------------------
# Timing presets (seconds). "realistic" approximates a t4g.micro; "fast" keeps
# the same order of events but squeezes a whole cycle into about a minute.
# ----------------------------------------------------------------------------
PRESETS = {
    "fast": dict(boot=3, dns=3, nginx=2, app_delay=2, stop=4, app_stop_grace=20,
                 idle=45, idle_check=5, idle_first_check=10, restart_sec=5, event_delay=1),
    "realistic": dict(boot=15, dns=20, nginx=25, app_delay=30, stop=40, app_stop_grace=20,
                      idle=15 * 60, idle_check=300, idle_first_check=300, restart_sec=5,
                      event_delay=2),
}

# ----------------------------------------------------------------------------
# Hand-made copies of production behaviour. Everything CloudFront does is read
# from main.tf at startup (parse_cloudfront_config); these parts can't be, so
# they are copied here. tests/test_aws_sim_drift.py fingerprints each source
# section below: when one changes, that test fails until the copy here is
# reviewed and its fingerprint updated (`python aws_sim.py --fingerprints`).
# ----------------------------------------------------------------------------

# user_data.sh.tftpl, nginx `map $wwf_activity`: what counts as a player being here.
ACTIVITY_GET_RE = re.compile(r"^/(game|join|lobby/[A-Za-z0-9]{6})/?$")
ACTIVITY_POST_EXCLUDE_RE = re.compile(r"^/(internal|admin)/")
# user_data.sh.tftpl, wwf-app.service: RestartSec=5 and ExecStop docker stop -t 20
# (PRESETS restart_sec / app_stop_grace); wwf-prepare: the app's environment
# (World._app_env); wwf-idle-check: idle = now - max(boot, activity log mtime)
# (World.tick). setup_local_redis.sh replaces the app's docker run line (it adds
# TLS Redis, which isn't simulated). origin_control_lambda.py _wake():
# Edge._lambda_wake. docker/Dockerfile ENTRYPOINT: World._app_command.
SOURCE_FINGERPRINTS = {
    "infra/terraform/user_data.sh.tftpl#nginx": "1ae3b4e4e5ba87f6",
    "infra/terraform/user_data.sh.tftpl#wwf-idle-check": "4b7be93f70da34b3",
    "infra/terraform/user_data.sh.tftpl#wwf-app.service": "aecd5e80fca453f5",
    "infra/terraform/user_data.sh.tftpl#wwf-prepare": "2a13bb004d1a972e",
    "infra/terraform/origin_control_lambda.py#_wake": "823c29d3f7264edb",
    "infra/terraform/setup_local_redis.sh#wwf-app.service.d": "77d821d425323e8e",
    "docker/Dockerfile#ENTRYPOINT": "00f8e62ac926566c",
}


def source_sections():
    """The production source each hand-made copy follows, keyed like SOURCE_FINGERPRINTS."""
    def heredoc(text, start):
        body = text.split(start, 1)[1]
        return body.split("\nEOF\n", 1)[0]

    user_data = (REPO / "infra/terraform/user_data.sh.tftpl").read_text()
    lam = (REPO / "infra/terraform/origin_control_lambda.py").read_text()
    wake = re.search(r"\ndef _wake\(.*?(?=\n(?:def |# -))", lam, re.S)
    docker = (REPO / "docker/Dockerfile").read_text()
    redis = (REPO / "infra/terraform/setup_local_redis.sh").read_text()
    return {
        "infra/terraform/user_data.sh.tftpl#nginx": heredoc(user_data, "cat > /etc/nginx/conf.d/wwf.conf <<'EOF'"),
        "infra/terraform/user_data.sh.tftpl#wwf-idle-check": heredoc(user_data, "cat > /usr/local/bin/wwf-idle-check <<'EOF'"),
        "infra/terraform/user_data.sh.tftpl#wwf-app.service": heredoc(user_data, "cat > /etc/systemd/system/wwf-app.service <<'EOF'"),
        "infra/terraform/user_data.sh.tftpl#wwf-prepare": heredoc(user_data, "cat > /usr/local/bin/wwf-prepare <<'EOF'"),
        "infra/terraform/origin_control_lambda.py#_wake": wake.group(0) if wake else "",
        "infra/terraform/setup_local_redis.sh#wwf-app.service.d": heredoc(redis, "cat > /etc/systemd/system/wwf-app.service.d/redis.conf <<'EOF'"),
        "docker/Dockerfile#ENTRYPOINT": "\n".join(l for l in docker.splitlines() if l.startswith(("ENTRYPOINT", "CMD"))),
    }


def fingerprint(text: str) -> str:
    """Whitespace-insensitive hash, so reindenting a file doesn't count as a change."""
    import hashlib
    return hashlib.sha256(" ".join(text.split()).encode()).hexdigest()[:16]


HOP_BY_HOP = {"connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te",
              "trailer", "transfer-encoding", "upgrade", "content-length"}

# What each CloudFront origin is in the simulation. A new origin in main.tf
# stops the simulator until it is added here (and to Edge._route).
KNOWN_ORIGINS = {"frontend": "S3", "api": "EC2 via nginx", "wake": "wake Lambda"}


class ConfigDrift(Exception):
    """main.tf no longer looks like what the simulator knows how to copy."""


def parse_cloudfront_config(path: Path):
    """Read the CloudFront distribution from main.tf. Raises ConfigDrift on anything unexpected.

    There is deliberately no built-in fallback: running on a stale copy would
    make the simulator agree with an AWS setup that no longer exists.
    """
    text = path.read_text()
    problems = []

    def find(label, pattern, flags=0):
        m = re.search(pattern, text, flags)
        if not m:
            problems.append(label)
        return m

    cfg = {"source": str(path.relative_to(REPO))}

    # Cache behaviours in evaluation order: (path pattern, origin id).
    behaviors = []
    starts = [m.start() for m in re.finditer(r'(?:dynamic\s+"ordered_cache_behavior"|\bordered_cache_behavior)\s*\{', text)]
    for i, start in enumerate(starts):
        block = text[start:starts[i + 1] if i + 1 < len(starts) else len(text)]
        target = re.search(r'target_origin_id\s*=\s*"([^"]+)"', block)
        if block.startswith("dynamic"):
            items = re.search(r'for_each\s*=\s*\[([^\]]*)\]', block)
            if not (items and target):
                problems.append(f"dynamic cache behaviour at offset {start}")
                continue
            behaviors += [(p, target.group(1)) for p in re.findall(r'"([^"]+)"', items.group(1))]
        else:
            pattern = re.search(r'path_pattern\s*=\s*"([^"]+)"', block)
            if not (pattern and target):
                problems.append(f"cache behaviour at offset {start}")
                continue
            behaviors.append((pattern.group(1), target.group(1)))
    default = find("default_cache_behavior target", r'default_cache_behavior\s*\{[^}]*?target_origin_id\s*=\s*"([^"]+)"', re.S)
    cfg["behaviors"] = behaviors
    cfg["default_origin"] = default.group(1) if default else None
    unknown = {o for _, o in behaviors} | {cfg["default_origin"]}
    unknown -= set(KNOWN_ORIGINS) | {None}
    if unknown:
        problems.append(f"origins the simulator doesn't model: {sorted(unknown)}")
    cfg["api_patterns"] = [p for p, o in behaviors if o == "api"]
    if not cfg["api_patterns"]:
        problems.append("API path list")

    m = find("forwarded headers", r'headers\s*=\s*\[([^\]]*X-WordSquad[^\]]*)\]')
    cfg["fwd_headers"] = re.findall(r'"([^"]+)"', m.group(1)) if m else []
    m = find("forwarded cookies", r'whitelisted_names\s*=\s*\[([^\]]*)\]')
    cfg["fwd_cookies"] = re.findall(r'"([^"]+)"', m.group(1)) if m else []
    m = find("custom error responses", r'custom_error_response"[^{]*\{\s*for_each\s*=\s*\[([^\]]*)\]')
    cfg["error_codes"] = [int(x) for x in re.findall(r"\d+", m.group(1))] if m else []
    m = find("api connection_timeout", r'origin_id\s*=\s*"api".*?connection_timeout\s*=\s*(\d+)', re.S)
    cfg["connect_timeout"] = float(m.group(1)) if m else 0
    m = find("origin_read_timeout", r'origin_read_timeout\s*=\s*(\d+)')
    cfg["read_timeout"] = float(m.group(1)) if m else 0
    m = find("waking page path", r'response_page_path\s*=\s*"([^"]+)"')
    cfg["error_page"] = m.group(1) if m else None
    if problems:
        raise ConfigDrift(f"{path.relative_to(REPO)}: could not read " + "; ".join(problems))
    return cfg


def cf_match(pattern: str, path: str) -> bool:
    """CloudFront path patterns: case-sensitive, '*' spans '/', '?' is one char."""
    return fnmatch.fnmatchcase(path, pattern)


def now() -> float:
    return time.time()


# ----------------------------------------------------------------------------
# The simulated world
# ----------------------------------------------------------------------------
class World:
    def __init__(self, args, cf):
        self.args = args
        self.cf = cf
        self.t = dict(PRESETS[args.preset])
        for key in list(self.t):
            val = getattr(args, key, None)
            if val is not None:
                self.t[key] = val
        self.lock = threading.RLock()
        self.events = collections.deque(maxlen=400)
        self.counters = collections.Counter()
        self.state = "stopped"          # EC2 instance state
        self.state_since = now()
        self.dns_ip = "192.0.2.1"       # origin.<domain> A record
        self.dns_ready_at = None
        self.nginx_up = False
        self.nginx_up_at = None
        self.app_proc: subprocess.Popen | None = None
        self.app_wanted = False
        self.app_launch_at = None
        self.app_launches = 0
        self.app_stopping = False
        self.booted_at = None
        self.launched_at = None         # EC2 LaunchTime: reset on every start
        self.next_idle_check = None
        self.last_activity_log = None   # mtime of nginx wwf-activity.log (survives reboots)
        self.kill_switch = False
        self.pending_until = None
        self.stopping_until = None
        self.shutdown_reason = None
        self.wake_count = 0
        self.state_dir = Path(args.state_dir).resolve() if args.state_dir else HERE / ".state"
        self.runtime_dir = self.state_dir / "runtime"
        self._prepare_disk(args.fresh)
        self.app_cmd, self.app_kind = self._app_command()
        self.app_log = open(self.state_dir / "app.log", "ab", buffering=0)

    # ---------- disk (the EBS root volume) ----------
    def _prepare_disk(self, fresh: bool):
        if fresh and self.state_dir.exists():
            shutil.rmtree(self.state_dir)
        self.runtime_dir.mkdir(parents=True, exist_ok=True)
        secret_file = self.state_dir / "secret_key"
        if not secret_file.exists():
            secret_file.write_text(secrets.token_hex(32))
        self.secret_key = secret_file.read_text().strip()
        act = self.state_dir / "wwf-activity.log"
        if act.exists():
            self.last_activity_log = act.stat().st_mtime

    def _touch_activity(self, line: str):
        act = self.state_dir / "wwf-activity.log"
        with open(act, "a") as fh:
            fh.write(line + "\n")
        self.last_activity_log = now()

    # ---------- app process ----------
    def _app_command(self):
        py = self.args.python
        if not py:
            venv = REPO / ".venv" / "bin" / "python"
            py = str(venv) if venv.exists() else sys.executable
        self.python = py
        port = str(self.args.app_port)
        if self.args.runner in ("auto", "gunicorn"):
            ok = subprocess.run([py, "-c", "import gunicorn, gevent"], capture_output=True).returncode == 0
            if ok:
                return ([py, "-m", "gunicorn", "-k", "gevent", "--timeout", "0",
                         "-b", f"127.0.0.1:{port}", "backend.server:app"], "gunicorn -k gevent")
            if self.args.runner == "gunicorn":
                sys.exit(f"gunicorn/gevent not importable by {py}; pip install gunicorn gevent")
        return ([py, str(HERE / "app_runner.py"), port], "werkzeug threaded (imported like gunicorn)")

    def _app_env(self):
        env = dict(os.environ)
        env.update({
            "PYTHONUNBUFFERED": "1",
            "TRUSTED_PROXY_HOPS": "2",
            "SINGLE_INSTANCE": "true",
            "GAME_FILE": str(self.runtime_dir / "game_persist.json"),
            "LOBBIES_FILE": str(self.runtime_dir / "lobbies.json"),
            "PRIVATE_ROOMS_FILE": str(self.runtime_dir / "private-rooms.json"),
            "SECRET_KEY": self.secret_key,
            "OPERATOR_TOKEN": "sim-operator-token",
        })
        if self.args.app_env == "production":
            env["FLASK_ENV"] = "production"
            env["PUBLIC_ORIGIN"] = f"http://localhost:{self.args.port}"
        else:
            env.pop("FLASK_ENV", None)
        if self.args.redis_url:
            env["REDIS_URL"] = self.args.redis_url
        return env

    def _launch_app(self):
        self.app_launches += 1
        self.app_log.write(f"\n===== app start #{self.app_launches} {time.ctime()} =====\n".encode())
        self.app_proc = subprocess.Popen(self.app_cmd, cwd=REPO, env=self._app_env(),
                                         stdout=self.app_log, stderr=subprocess.STDOUT,
                                         start_new_session=True)
        self.log("app", f"wwf-app started (pid {self.app_proc.pid}, {self.app_kind})")

    def _signal_app(self, sig):
        proc = self.app_proc
        if proc and proc.poll() is None:
            try:
                os.killpg(proc.pid, sig)
            except ProcessLookupError:
                pass

    def _stop_app_blocking(self, grace: float):
        """docker stop -t <grace>: SIGTERM, then SIGKILL."""
        proc = self.app_proc
        if not proc:
            return
        self._signal_app(signal.SIGTERM)
        try:
            proc.wait(timeout=grace)
        except subprocess.TimeoutExpired:
            self.log("app", f"app ignored SIGTERM for {grace:.0f}s; killing")
            self._signal_app(signal.SIGKILL)
            proc.wait()
        with self.lock:
            if self.app_proc is proc:
                self.app_proc = None

    def app_listening(self) -> bool:
        try:
            with socket.create_connection(("127.0.0.1", self.args.app_port), timeout=0.3):
                return True
        except OSError:
            return False

    # ---------- events ----------
    def log(self, kind: str, msg: str):
        entry = {"t": now(), "kind": kind, "msg": msg}
        with self.lock:
            self.events.append(entry)
        if kind != "req" or self.args.verbose:
            stamp = time.strftime("%H:%M:%S")
            print(f"{stamp} [{kind}] {msg}", flush=True)

    def _set_state(self, state: str):
        self.state = state
        self.state_since = now()
        self.log("ec2", f"instance -> {state}")

    # ---------- EC2 API (what the Lambda calls) ----------
    def ec2_start(self) -> str:
        with self.lock:
            if self.state == "stopped":
                self._set_state("pending")
                self.launched_at = now()
                self.pending_until = now() + self.t["boot"]
                self.wake_count += 1
                return "pending"
            if self.state == "stopping":
                raise RuntimeError("IncorrectInstanceState: instance is stopping")
            return self.state

    def ec2_stop(self, reason: str) -> bool:
        """Lambda/console stop: EC2 goes to 'stopping' at once; the OS shuts down."""
        with self.lock:
            if self.state not in ("pending", "running"):
                return False
            self.log("ec2", f"stop_instances ({reason})")
            self._begin_shutdown(reason, ec2_initiated=True)
            return True

    # ---------- shutdown ----------
    def _begin_shutdown(self, reason: str, ec2_initiated: bool):
        if self.shutdown_reason:
            return
        self.shutdown_reason = reason
        self.app_wanted = False
        if ec2_initiated or self.state == "pending":
            self._enter_stopping()
        threading.Thread(target=self._shutdown_worker, args=(ec2_initiated,), daemon=True).start()

    def _shutdown_worker(self, ec2_initiated: bool):
        # systemctl stop wwf-app (ExecStop: docker stop -t 20), then poweroff.
        self.app_stopping = True
        self._stop_app_blocking(self.t["app_stop_grace"])
        self.app_stopping = False
        with self.lock:
            self.log("app", "wwf-app stopped")
            if self.state == "running":
                self._enter_stopping()   # instance-initiated poweroff

    def _enter_stopping(self):
        self.nginx_up = False
        self._set_state("stopping")
        self.stopping_until = now() + self.t["stop"]
        # EventBridge -> Lambda parks the origin record shortly after.
        threading.Timer(self.t["event_delay"], self._park_dns).start()

    def _park_dns(self):
        with self.lock:
            self.dns_ip = "192.0.2.1"
            self.dns_ready_at = None
            self.log("dns", "origin -> 192.0.2.1 (parked)")

    # ---------- the clock ----------
    def tick(self):
        with self.lock:
            t = now()
            if self.state == "pending" and t >= self.pending_until:
                self._set_state("running")
                self.booted_at = t
                self.shutdown_reason = None
                instant = getattr(self, "instant_boot", False)
                self.instant_boot = False
                self.dns_ready_at = t + (0 if instant else self.t["dns"])
                self.nginx_up_at = t + (0 if instant else self.t["nginx"])
                self.app_wanted = True
                self.app_launch_at = t + (0 if instant else self.t["app_delay"])
                self.next_idle_check = t + self.t["idle_first_check"]
            if self.state == "running":
                if self.dns_ready_at and t >= self.dns_ready_at and self.dns_ip != "127.0.0.1":
                    self.dns_ip = "127.0.0.1"
                    self.log("dns", "origin -> instance public IP")
                if not self.nginx_up and self.nginx_up_at and t >= self.nginx_up_at and not self.shutdown_reason:
                    self.nginx_up = True
                    self.log("nginx", "nginx listening on :443")
                if self.app_wanted and self.app_proc is None and self.app_launch_at and t >= self.app_launch_at:
                    self._launch_app()
                if self.app_proc is not None and self.app_proc.poll() is not None and not self.app_stopping:
                    code = self.app_proc.returncode
                    self.app_proc = None
                    if self.app_wanted:
                        self.log("app", f"app exited with {code}; systemd restarts it in {self.t['restart_sec']}s")
                        self.app_launch_at = t + self.t["restart_sec"]
                if (self.next_idle_check and t >= self.next_idle_check and not self.shutdown_reason):
                    self.next_idle_check = t + self.t["idle_check"]
                    idle = t - max(self.booted_at, self.last_activity_log or 0)
                    if idle >= self.t["idle"]:
                        self.log("idle", f"wwf-idle: no players for {idle:.0f}s; stopping server")
                        self._begin_shutdown("idle", ec2_initiated=False)
                    else:
                        self.log("idle", f"wwf-idle check: idle {idle:.0f}s of {self.t['idle']}s")
            if self.state == "stopping" and t >= self.stopping_until and not self.app_stopping:
                self._set_state("stopped")
                self.nginx_up = False

    def run_clock(self):
        while True:
            try:
                self.tick()
            except Exception as err:  # never let the clock die
                print(f"[sim] clock error: {err}", file=sys.stderr)
            time.sleep(0.2)

    # ---------- what CloudFront sees ----------
    def origin_status(self):
        """'timeout' (parked DNS / box down), 'refused' (box up, nginx down) or 'nginx'."""
        with self.lock:
            if self.state != "running" or self.dns_ip != "127.0.0.1":
                return "timeout"
            return "nginx" if self.nginx_up else "refused"

    def status(self):
        with self.lock:
            t = now()
            idle_base = max(self.booted_at or 0, self.last_activity_log or 0)
            return {
                "now": t,
                "instance": self.state,
                "state_for": round(t - self.state_since, 1),
                "dns": self.dns_ip,
                "nginx_up": self.nginx_up,
                "app_running": self.app_proc is not None and self.app_proc.poll() is None,
                "app_listening": self.app_listening(),
                "app_pid": self.app_proc.pid if self.app_proc else None,
                "app_kind": self.app_kind,
                "app_launches": self.app_launches,
                "app_env": self.args.app_env,
                "shutting_down": bool(self.shutdown_reason),
                "kill_switch": self.kill_switch,
                "wakes": self.wake_count,
                "idle_for": round(t - idle_base, 1) if self.state == "running" else None,
                "idle_limit": self.t["idle"],
                "next_idle_check_in": round(self.next_idle_check - t, 1)
                if self.state == "running" and self.next_idle_check else None,
                "timings": self.t,
                "counters": dict(self.counters),
                "events": list(self.events)[-150:],
                "routes_from": self.cf["source"],
            }


# ----------------------------------------------------------------------------
# HTTP front door: CloudFront edge + Lambda URL + S3 + nginx + control panel
# ----------------------------------------------------------------------------
class Edge(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "CloudFront-sim"
    world: World = None  # set in main()

    def log_message(self, fmt, *args):  # quiet default logging
        pass

    # ----- plumbing -----
    def _body(self) -> bytes:
        length = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(length) if length else b""

    def _send(self, status, body: bytes, ctype="text/plain; charset=utf-8", headers=None):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, status, obj, headers=None):
        self._send(status, json.dumps(obj).encode(), "application/json", headers)

    def _note(self, outcome: str, status: int):
        w = self.world
        w.counters[outcome] += 1
        w.log("req", f"{self.command} {self.path} -> {status} {outcome}")

    def do_GET(self):
        self._route()

    def do_HEAD(self):
        self._route()

    def do_POST(self):
        self._route()

    def do_PUT(self):
        self._route()

    def do_DELETE(self):
        self._route()

    def do_PATCH(self):
        self._route()

    def do_OPTIONS(self):
        self._route()

    # ----- routing (behaviour order matches main.tf) -----
    def _route(self):
        path = urllib.parse.urlsplit(self.path).path
        try:
            if path == "/__sim" or path.startswith("/__sim/"):
                return self._control(path)
            cf = self.world.cf
            origin = next((o for p, o in cf["behaviors"] if cf_match(p, path)), cf["default_origin"])
            if origin == "wake":
                return self._lambda_wake()
            if origin == "api":
                return self._api()
            return self._s3(path)
        except (BrokenPipeError, ConnectionResetError):
            pass

    # ----- S3 -----
    def _s3(self, path):
        if self.command not in ("GET", "HEAD", "OPTIONS"):
            body = b"<Error><Code>MethodNotAllowed</Code></Error>"
            self._note("s3-405", 403)
            # CloudFront rejects other methods on this behaviour with a 403.
            return self._send(403, body, "text/html")
        key = "index.html" if path in ("", "/") else path.lstrip("/")
        root = self.world.args.static_dir.resolve()
        file = (root / urllib.parse.unquote(key)).resolve()
        if root not in file.parents and file != root or not file.is_file():
            self._note("s3-403", 403)
            return self._send(403, b"<?xml version=\"1.0\"?><Error><Code>AccessDenied</Code></Error>",
                              "application/xml")
        ctype = mimetypes.guess_type(file.name)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript",):
            ctype += "; charset=utf-8"
        self._note("s3", 200)
        self._send(200, file.read_bytes(), ctype)

    def _waking_page(self, origin_code: int, why: str):
        """CloudFront custom_error_response: 502/504 -> /waking.html as 503."""
        self._body()  # drain any request body
        if origin_code in self.world.cf["error_codes"]:
            page = (self.world.args.static_dir / self.world.cf["error_page"].lstrip("/")).read_bytes()
            self._note(f"waking-page ({why})", 503)
            return self._send(503, page, "text/html", {"Cache-Control": "no-store"})
        self._note(f"cf-{origin_code} ({why})", origin_code)
        return self._send(origin_code, b"CloudFront error", "text/html")

    # ----- Lambda function URL -----
    def _lambda_wake(self):
        w = self.world
        self._body()
        hdr = {"Cache-Control": "no-store"}
        if w.kill_switch:
            self._note("wake-disabled", 423)
            return self._json(423, {"state": "disabled", "msg": "Server paused by the monthly budget cap."}, hdr)
        state = w.state
        launched = w.launched_at
        if state == "stopped":
            try:
                state = w.ec2_start()
                launched = w.launched_at
                w.log("lambda", json.dumps({"event": "server_wake", "peer_ip": self.client_address[0],
                                            "user_agent": (self.headers.get("User-Agent") or "")[:80]}))
            except RuntimeError as err:
                w.log("lambda", f"start_instances failed: {err}")
                state = "stopping"
        elif state == "stopping":
            # The real Lambda only calls start_instances when it sees "stopped".
            pass
        code = 200 if state == "running" else 202
        self._note(f"wake:{state}", code)
        body = {"state": state}
        if state in ("pending", "running") and launched is not None:
            body["elapsed"] = max(0, int(now() - launched))
        return self._json(code, body, hdr)

    # ----- CloudFront -> origin -----
    def _api(self):
        w = self.world
        origin = w.origin_status()
        if origin == "timeout":
            # connection_attempts = 1, connection_timeout = 3
            time.sleep(w.cf["connect_timeout"])
            return self._waking_page(504, "origin unreachable")
        if origin == "refused":
            return self._waking_page(502, "nginx not up")
        return self._nginx()

    def _forward_headers(self, nginx_host: str):
        cf = self.world.cf
        out = {}
        allowed = {h.lower() for h in cf["fwd_headers"]}
        for k, v in self.headers.items():
            if k.lower() in allowed:
                out[k] = v
        cookies = []
        for part in (self.headers.get("Cookie") or "").split(";"):
            name = part.split("=", 1)[0].strip()
            if name in cf["fwd_cookies"]:
                cookies.append(part.strip())
        if cookies:
            out["Cookie"] = "; ".join(cookies)
        # CloudFront appends the viewer IP; nginx appends CloudFront's.
        xff = self.headers.get("X-Forwarded-For")
        viewer = self.client_address[0]
        chain = f"{xff}, {viewer}" if xff else viewer
        out["X-Forwarded-For"] = f"{chain}, 127.0.0.1"
        out["X-Forwarded-Proto"] = "http"   # https in production
        out["Host"] = nginx_host            # nginx: proxy_set_header Host <domain>
        out["User-Agent"] = "Amazon CloudFront"
        out["Connection"] = "close"
        return out

    def _nginx(self):
        w = self.world
        path = urllib.parse.urlsplit(self.path).path
        body = self._body()
        # access_log ... if=$wwf_activity  (resets the idle timer)
        is_activity = ((self.command == "POST" and not ACTIVITY_POST_EXCLUDE_RE.match(path))
                       or (self.command != "POST" and ACTIVITY_GET_RE.match(path)))
        if is_activity:
            w._touch_activity(f"{time.strftime('%Y-%m-%dT%H:%M:%S')} {self.command} {path}")
        if path == "/activity":
            if self.command != "POST":
                self._note("nginx-405", 405)
                return self._send(405, b"")
            self._note("nginx-activity", 204)
            self.send_response(204)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        host = self.headers.get("Host") or f"localhost:{w.args.port}"
        try:
            conn = http.client.HTTPConnection("127.0.0.1", w.args.app_port, timeout=w.cf["read_timeout"])
            conn.request(self.command, self.path, body=body or None, headers=self._forward_headers(host))
            resp = conn.getresponse()
        except ConnectionRefusedError:
            return self._waking_page(502, "app container down")   # nginx 502 Bad Gateway
        except socket.timeout:
            return self._waking_page(504, "origin read timeout")
        except OSError as err:
            return self._waking_page(502, f"app error {err.__class__.__name__}")
        if resp.status in w.cf["error_codes"]:
            resp.read()
            conn.close()
            return self._waking_page(resp.status, "app returned error code")
        self._relay(resp, conn, path)

    def _relay(self, resp, conn, path):
        w = self.world
        self.send_response(resp.status)
        length = resp.getheader("Content-Length")
        for k, v in resp.getheaders():
            if k.lower() not in HOP_BY_HOP:
                self.send_header(k, v)
        chunked = length is None and self.command != "HEAD" and resp.status not in (204, 304)
        if chunked:
            self.send_header("Transfer-Encoding", "chunked")
        elif length is not None:
            self.send_header("Content-Length", length)
        self.end_headers()
        streaming = "text/event-stream" in (resp.getheader("Content-Type") or "")
        self._note("api-stream" if streaming else "api", resp.status)
        if self.command == "HEAD":
            conn.close()
            return
        try:
            while True:
                chunk = resp.read1(65536) if hasattr(resp, "read1") else resp.read(65536)
                if not chunk:
                    break
                if chunked:
                    self.wfile.write(b"%x\r\n%s\r\n" % (len(chunk), chunk))
                else:
                    self.wfile.write(chunk)
                self.wfile.flush()
            if chunked:
                self.wfile.write(b"0\r\n\r\n")
        except socket.timeout:
            w.log("edge", f"{path}: origin silent {w.cf['read_timeout']:.0f}s; CloudFront drops the stream")
            self.close_connection = True
        except (http.client.IncompleteRead, ConnectionResetError, OSError):
            # Origin died mid-response: CloudFront truncates the viewer response.
            if streaming:
                w.log("edge", f"{path}: stream cut (origin went away)")
            self.close_connection = True
        finally:
            conn.close()

    # ----- control panel -----
    def _control(self, path):
        w = self.world
        if path in ("/__sim", "/__sim/"):
            page = (HERE / "panel.html").read_bytes()
            return self._send(200, page, "text/html; charset=utf-8", {"Cache-Control": "no-store"})
        if path == "/__sim/api/status":
            return self._json(200, w.status(), {"Cache-Control": "no-store"})
        if path == "/__sim/api/action" and self.command == "POST":
            try:
                data = json.loads(self._body() or b"{}")
            except ValueError:
                data = {}
            return self._json(200, self._action(data.get("action"), data))
        return self._json(404, {"error": "unknown sim endpoint"})

    def _action(self, action, data):
        w = self.world
        with w.lock:
            if action == "wake":
                try:
                    return {"ok": True, "state": w.ec2_start()}
                except RuntimeError as err:
                    return {"ok": False, "error": str(err)}
            if action == "sleep":          # idle timer fires now
                if w.state != "running":
                    return {"ok": False, "error": f"instance is {w.state}"}
                w.log("idle", "forced idle shutdown (control panel)")
                w._begin_shutdown("idle (forced)", ec2_initiated=False)
                return {"ok": True}
            if action == "stop":           # nightly backstop / console stop
                return {"ok": w.ec2_stop("nightly backstop (forced)")}
            if action == "crash":          # container dies; systemd restarts it
                if not w.app_proc:
                    return {"ok": False, "error": "app not running"}
                w.log("app", "crash injected: SIGKILL")
                w._signal_app(signal.SIGKILL)
                return {"ok": True}
            if action == "restart":        # deploy_api.sh: systemctl restart wwf-app
                if not w.app_proc:
                    return {"ok": False, "error": "app not running"}
                w.log("app", "systemctl restart wwf-app (deploy)")
                threading.Thread(target=self._restart_app, daemon=True).start()
                return {"ok": True}
            if action == "killswitch":
                w.kill_switch = bool(data.get("on"))
                w.log("budget", f"wake kill switch {'ON' if w.kill_switch else 'off'}")
                if w.kill_switch:
                    w.ec2_stop("budget cap reached")
                return {"ok": True, "kill_switch": w.kill_switch}
            if action == "idle":           # change the idle limit live
                w.t["idle"] = float(data.get("seconds", w.t["idle"]))
                w.log("idle", f"idle limit set to {w.t['idle']:.0f}s")
                return {"ok": True}
            if action == "activity":       # pretend a player did something
                w._touch_activity("manual")
                return {"ok": True}
            if action == "check-idle-now":
                w.next_idle_check = now()
                return {"ok": True}
        return {"ok": False, "error": f"unknown action {action!r}"}

    def _restart_app(self):
        w = self.world
        w.app_stopping = True
        w._stop_app_blocking(w.t["app_stop_grace"])
        w.app_stopping = False
        with w.lock:
            if w.app_wanted:
                w._launch_app()


class Server(http.server.ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def get_request(self):
        sock, addr = super().get_request()
        # Headers and body go out as separate writes; don't let Nagle add 40 ms.
        sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        return sock, addr


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0],
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--port", type=int, default=8080, help="edge (CloudFront) port, default 8080")
    p.add_argument("--host", default="127.0.0.1", help="bind address; 0.0.0.0 to test phones on the LAN")
    p.add_argument("--app-port", type=int, default=5001, help="port for the real app, default 5001")
    p.add_argument("--preset", choices=sorted(PRESETS), default="fast")
    p.add_argument("--start", choices=["stopped", "running"], default="stopped",
                   help="initial instance state (default: stopped, i.e. asleep)")
    p.add_argument("--app-env", choices=["production", "development"], default="production",
                   help="production = FLASK_ENV=production like AWS (Secure cookies: use "
                        "http://localhost only); development = file-backed private rooms, LAN-friendly")
    p.add_argument("--runner", choices=["auto", "gunicorn", "werkzeug"], default="auto",
                   help="auto uses gunicorn -k gevent when importable, like the container")
    p.add_argument("--python", help="interpreter for the app (default: .venv/bin/python or this one)")
    p.add_argument("--redis-url", help="optional REDIS_URL for the app")
    p.add_argument("--static-dir", type=Path, default=REPO / "frontend" / "dist",
                   help="what S3 serves (default frontend/dist; run `npm run build` first)")
    p.add_argument("--fresh", action="store_true", help="wipe the simulated disk first")
    p.add_argument("--state-dir", help="simulated disk location (default dev-tools/aws-sim/.state)")
    p.add_argument("--verbose", "-v", action="store_true", help="print every request")
    p.add_argument("--fingerprints", action="store_true",
                   help="print the fingerprints of the production sources the simulator copies, then exit")
    for key in PRESETS["fast"]:
        p.add_argument(f"--{key.replace('_', '-')}", dest=key, type=float,
                       help=f"override {key} seconds")
    args = p.parse_args(argv)


    if args.fingerprints:
        for key, text in source_sections().items():
            mark = "" if SOURCE_FINGERPRINTS.get(key) == fingerprint(text) else "   <- changed"
            print(f'    "{key}": "{fingerprint(text)}",{mark}')
        return
    try:
        cf = parse_cloudfront_config(MAIN_TF)
    except ConfigDrift as err:
        sys.exit(f"[sim] {err}\nThe simulator copies CloudFront from main.tf and won't guess. "
                 f"Update parse_cloudfront_config() in {Path(__file__).name} for the new layout.")
    if not (args.static_dir / cf["error_page"].lstrip("/")).exists():
        sys.exit(f"{args.static_dir}{cf['error_page']} not found. Build the frontend first:\n"
                 f"  (cd frontend && npm run build)")
    world = World(args, cf)
    Edge.world = world

    def shutdown(*_):
        print("\n[sim] shutting down app...", flush=True)
        world._signal_app(signal.SIGTERM)
        time.sleep(0.5)
        world._signal_app(signal.SIGKILL)
        os._exit(0)
    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    if args.start == "running":
        world.ec2_start()
        world.pending_until = now()
        world.instant_boot = True

    threading.Thread(target=world.run_clock, daemon=True).start()
    srv = Server((args.host, args.port), Edge)
    t = world.t
    print(f"""
WordSquad AWS simulator
  site          http://localhost:{args.port}/            (CloudFront)
  control panel http://localhost:{args.port}/__sim
  app           {world.app_kind}, FLASK_ENV={args.app_env}, port {args.app_port}
  routes        {len(cf['api_patterns'])} API patterns from {cf['source']}
  timings       boot {t['boot']}s, dns {t['dns']}s, nginx {t['nginx']}s, app {t['app_delay']}s,
                stop {t['stop']}s, idle {t['idle']}s (checked every {t['idle_check']}s)
  disk          {world.state_dir}  (survives sleeps; --fresh wipes it)
  instance      {world.state}
""", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
