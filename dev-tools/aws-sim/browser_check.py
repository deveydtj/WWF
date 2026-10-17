#!/usr/bin/env python3
"""Real-browser sleep/wake check: two players in one lobby, through the simulator.

Needs Python Playwright (pip install playwright && python -m playwright install chromium).
Starts its own simulator (fast timings, throwaway disk) unless --attach is given.

What it checks, for a lobby and then for the default /game board:
  1. A and B play in separate browser profiles; B sees A's guess live.
  2. Both tabs sit untouched for a minute and the server sleeps: neither tab wakes it.
  3. A player types in A and presses Enter: A calls /wake and says it's waking.
  4. Once up, both tabs reopen their live streams by themselves.
  5. Enter sends the word typed while asleep; B sees it within 3 s.
  6. A minute later B is still live (not slow-polling).
  7. A new visitor during a sleep gets the waking page, which reloads into the game.

And on the landing page:
  8. Create while the server sleeps shows the wake panel with a live countdown,
     then opens the new lobby by itself once the server is up.

    python dev-tools/aws-sim/browser_check.py [--headed] [--attach http://localhost:8080]
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from scenarios import Sim, Client, pick_word, check, note, RESULTS  # noqa: E402

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    sys.exit("Python Playwright is missing: pip install playwright && python -m playwright install chromium")


class Tab:
    """One player's browser profile with request/console bookkeeping."""

    def __init__(self, browser, base, name):
        self.name, self.base = name, base
        self.ctx = browser.new_context(base_url=base, viewport={"width": 1280, "height": 900})
        self.page = self.ctx.new_page()
        self.log = []          # responses: (t, method, path, status, ctype)
        self.sent = []         # requests:  (t, method, path)
        self.console = []
        self.errors = []
        self.page.on("response", self._on_response)
        self.page.on("request", lambda r: self.sent.append((time.time(), r.method, r.url.replace(base, ""))))
        self.guess_bodies = []
        self.page.on("request", lambda r: "/guess" in r.url and self.guess_bodies.append(r.post_data))
        self.page.on("requestfailed", lambda r: self.log.append(
            (time.time(), r.method, r.url.replace(base, ""), "failed", r.failure or "")))
        self.page.on("console", lambda m: self.console.append((time.time(), m.type, m.text)))
        self.page.on("pageerror", lambda e: self.errors.append((time.time(), str(e))))
        # Toasts fade after 2 s; keep every message the game shows.
        self.ctx.add_init_script("""
          window.__msgs = [];
          document.addEventListener('DOMContentLoaded', () => {
            for (const id of ['message', 'messagePopup']) {
              const el = document.getElementById(id);
              if (!el) continue;
              new MutationObserver(() => {
                const t = el.textContent.trim();
                if (t && window.__msgs[window.__msgs.length - 1]?.[1] !== t) window.__msgs.push([Date.now(), t]);
              }).observe(el, { childList: true, characterData: true, subtree: true });
            }
          });""")

    def _on_response(self, r):
        path = r.url.replace(self.base, "")
        self.log.append((time.time(), r.request.method, path, r.status, r.headers.get("content-type", "")))

    def api(self, method, path, body=None):
        headers = {"Origin": self.base, "Content-Type": "application/json", "X-WordSquad-Request": "1"}
        r = self.ctx.request.fetch(self.base + path, method=method, headers=headers,
                                   data=json.dumps(body) if body is not None else None)
        try:
            return r.status, r.json()
        except Exception:
            return r.status, None

    def become_player(self, emoji, lobby=None):
        self.api("POST", "/age-check", {"age": 30})
        base = f"/lobby/{lobby}" if lobby else ""
        _, data = self.api("POST", f"{base}/emoji", {"emoji": emoji})
        self.emoji, self.player_id = data["emoji"], data["player_id"]
        self.ctx.add_init_script(
            f"localStorage.setItem('myEmoji', {json.dumps(self.emoji)});"
            f"localStorage.setItem('playerId', {json.dumps(self.player_id)});")

    def board_text(self):
        try:
            return (self.page.inner_text("#board", timeout=2000) or "").replace("\n", "").lower()
        except Exception:
            return ""

    def type_guess(self, word):
        self.page.bring_to_front()
        self.page.locator("body").click(position={"x": 5, "y": 5})
        for _ in range(5):
            self.page.keyboard.press("Backspace")
        self.page.keyboard.type(word, delay=40)
        self.page.keyboard.press("Enter")

    def count(self, path_part, since=0):
        """Requests sent (EventSource responses only 'arrive' with their first event)."""
        return sum(1 for t, m, p in self.sent if path_part in p and t >= since)

    def messages(self, since=0):
        try:
            return [m for t, m in self.page.evaluate("window.__msgs || []") if t / 1000 >= since]
        except Exception:
            return []


PUMP = []   # a page to wait on: Playwright's sync API only delivers events during its own calls


def pause(seconds):
    if PUMP:
        PUMP[0].wait_for_timeout(seconds * 1000)
    else:
        time.sleep(seconds)


def title(page):
    try:
        return (page.title() or "").lower()
    except Exception:   # mid-navigation
        return "waking"


def wait_until(fn, timeout, step=0.25):
    end = time.time() + timeout
    while time.time() < end:
        v = fn()
        if v:
            return v
        pause(step)
    return None


def submit(tab, word_for):
    """Type a word and press Enter; retry with another word if the page rejects it locally."""
    for _ in range(3):
        word = word_for()
        before = time.time()
        tab.type_guess(word)
        sent = wait_until(lambda: tab.count("/guess", since=before), 4)
        if sent:
            return word, before
    return None, time.time()


def guess_status(tab, since):
    wait_until(lambda: any("/guess" in x[2] for x in tab.log if x[0] >= since), 15)
    return [x[3] for x in tab.log if x[0] >= since and "/guess" in x[2]]


def run(sim: Sim, headed: bool, path_label: str, lobby_mode: bool):
    L = f"[{path_label}]"
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=not headed)
        a, b = Tab(browser, sim.base, "A"), Tab(browser, sim.base, "B")
        PUMP[:] = [a.page]
        code = None
        if lobby_mode:
            a.api("POST", "/age-check", {"age": 30})
            _, data = a.api("POST", "/lobby", {})
            code = data["id"]
        url = f"/lobby/{code}" if code else "/game"
        a.become_player("🦊", code)
        b.become_player("🐼", code)
        for t in (a, b):
            t.page.goto(url)
        ready = wait_until(lambda: a.count("/stream") and b.count("/stream"), 20)
        pause(2)
        check(bool(ready), f"{L} both tabs loaded {url}")

        api = Client(sim.base, "probe")
        api.cookies = {c["name"]: c["value"] for c in a.ctx.cookies()}
        api.emoji, api.player_id = a.emoji, a.player_id

        def next_word():
            return pick_word(api.state(code).json)

        # 1. Awake: B sees A's guess live.
        word, before = submit(a, next_word)
        check(guess_status(a, before)[-1:] == [200], f"{L} awake: A's guess '{word}' accepted",
              f"A errors: {a.errors[-1:]}")
        got = wait_until(lambda: word and word in b.board_text(), 10)
        check(bool(got), f"{L} awake: B's open tab shows A's guess", f"B board: {b.board_text()[:60]!r}")

        # 2. Nobody touches either tab for over a minute, then the server sleeps.
        print("  ....  both tabs sit untouched for 65 s, then the server sleeps")
        pause(65)
        word_for_later = next_word()
        mark = time.time()
        sim.action("sleep")
        sim.wait_state("stopped", 60)
        pause(15)
        wakes = a.count("/wake", since=mark) + b.count("/wake", since=mark)
        check(wakes == 0, f"{L} unattended tabs don't wake the sleeping server ({wakes} /wake calls)")
        note(f"{L} while asleep B showed {b.messages(mark)}")

        # 3. A player comes back to A and submits a word while it sleeps.
        back = time.time()
        a.type_guess(word_for_later)
        woke_call = wait_until(lambda: a.count("/wake", since=back), 10)
        check(bool(woke_call), f"{L} a player's keypress makes A's tab call /wake")
        shown = wait_until(lambda: any("waking" in m.lower() for m in a.messages(back)), 10)
        check(bool(shown), f"{L} A is told the server is waking", f"A showed {a.messages(back)}")
        up = sim.wait_for(lambda st: st["instance"] == "running" and st["app_listening"]
                          and st["dns"] != "192.0.2.1" and st["nginx_up"], 120)
        check(bool(up), f"{L} server is up {time.time() - back:.0f}s after the keypress")

        # 4. Both tabs come back to live updates on their own.
        up_at = time.time()
        a_live = wait_until(lambda: a.count("/stream", since=up_at - 2), 25)
        b_live = wait_until(lambda: b.count("/stream", since=up_at - 2), 25)
        check(bool(a_live), f"{L} A reopens its live stream after the wake ({time.time() - up_at:.0f}s)")
        check(bool(b_live), f"{L} B reopens its live stream after the wake ({time.time() - up_at:.0f}s)")

        # 5. A's word was kept; Enter sends it again.
        st = api.state(code).json or {}
        note(f"{L} after wake: A is {'on' if a.emoji in st.get('active_emojis', []) else 'NOT on'} the board, "
             f"{len(st.get('guesses', []))} guesses kept")
        before = time.time()
        a.page.keyboard.press("Enter")
        status = guess_status(a, before)
        check(status[-1:] == [200], f"{L} pressing Enter again sends the word typed while asleep",
              f"/guess -> {status}, A showed {a.messages(before)}, typed {word_for_later!r}, "
              f"sent {a.guess_bodies[-2:]}")
        seen = wait_until(lambda: word_for_later in b.board_text(), 10, step=0.2)
        lag = time.time() - before
        check(bool(seen) and lag < 3, f"{L} B's open tab shows it" + (f" after {lag:.1f}s" if seen else " (not within 10s)"))

        # 6. A minute later B is still live, not slow-polling.
        print("  ....  B watches quietly for 65 s")
        pause(65)
        word3 = next_word()
        before = time.time()
        api.cookies = {c2["name"]: c2["value"] for c2 in a.ctx.cookies()}
        g3 = api.guess(word3, code)   # as A, straight to the API: only B's side is under test here
        if check((g3.json or {}).get("status") == "ok", f"{L} A's next guess accepted", repr(g3)):
            seen = wait_until(lambda: word3 in b.board_text(), 25, step=0.2)
            lag = time.time() - before
            check(bool(seen) and lag < 3, f"{L} a minute later, B's tab shows A's next guess"
                  + (f" after {lag:.1f}s" if seen else " (not within 25s)"))

        # 7. A new visitor arrives while it sleeps: the waking page brings it up.
        sim.action("sleep")
        sim.wait_state("stopped", 60)
        c = Tab(browser, sim.base, "C")
        c.ctx.add_cookies([{"name": k["name"], "value": k["value"], "url": sim.base}
                           for k in a.ctx.cookies() if k["name"] == "wordsquad_age_session"])
        arrive = time.time()
        c.page.goto(url)
        check("waking" in title(c.page), f"{L} a new visitor gets the waking page")
        woke = wait_until(lambda: c.page.url.endswith(url) and "waking" not in title(c.page)
                          and sim.status()["app_listening"], 120, step=1)
        check(bool(woke), f"{L} the waking page reloads into the game ({time.time() - arrive:.0f}s)")
        browser.close()


def run_landing(sim: Sim, headed: bool):
    L = "[landing]"
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=not headed)
        a = Tab(browser, sim.base, "A")
        PUMP[:] = [a.page]
        a.api("POST", "/age-check", {"age": 30})   # an eligible returning visitor
        a.ctx.add_init_script("localStorage.setItem('myEmoji', '🦊');")
        sim.action("sleep")
        sim.wait_state("stopped", 60)
        a.page.goto("/")
        pause(2)
        mark = time.time()
        a.page.click("#createBtn")
        shown = wait_until(lambda: a.page.is_visible("#wakePanel"), 10)
        check(bool(shown), f"{L} Create while asleep shows the wake panel")
        etas = set()

        def opened():
            if a.page.is_visible("#wakePanel"):
                etas.add(a.page.text_content("#wakeEta") or "")
            return "#lobby/" in a.page.url

        lobby = wait_until(opened, 120, step=0.5)
        clocks = sorted(e for e in etas if len(e) == 4 and e[1] == ":")
        check(len(clocks) >= 3, f"{L} the estimate counts down live ({', '.join(clocks[-1:] + clocks[:1])})",
              f"seen {sorted(etas)}")
        check(bool(lobby), f"{L} the new lobby opens by itself once the server is up "
                           f"({time.time() - mark:.0f}s)", a.page.url)
        posts = sum(1 for t, m, p in a.sent if m == "POST" and p == "/lobby" and t >= mark)
        check(posts == 1, f"{L} exactly one lobby was created ({posts})")
        browser.close()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--headed", action="store_true", help="show the browser windows")
    ap.add_argument("--attach", help="use an already running simulator")
    ap.add_argument("--only", choices=["lobby", "game", "landing"], help="run just one part")
    ap.add_argument("--port", type=int, default=18081)
    ap.add_argument("--app-port", type=int, default=15002)
    ap.add_argument("--sim-arg", action="append", default=[])
    args = ap.parse_args()
    sim = Sim(args.attach) if args.attach else Sim.launch(args.port, args.app_port,
                                                          ["--start", "running", "--idle", "300", *args.sim_arg])
    try:
        sim.ensure_awake()
        for label, lobby in (("lobby", True), ("game", False)):
            if args.only and args.only != label:
                continue
            print(f"\n▶ {label}")
            sim.ensure_awake()
            try:
                run(sim, args.headed, label, lobby)
            except Exception as err:
                import traceback
                traceback.print_exc()
                check(False, f"[{label}] browser run crashed: {err}")
        if not args.only or args.only == "landing":
            print("\n▶ landing")
            sim.ensure_awake()
            try:
                run_landing(sim, args.headed)
            except Exception as err:
                import traceback
                traceback.print_exc()
                check(False, f"[landing] browser run crashed: {err}")
    finally:
        sim.stop()
    fails = [m for k, m in RESULTS if k == "FAIL"]
    print(f"\n{sum(k == 'PASS' for k, _ in RESULTS)} passed, {len(fails)} failed")
    return len(fails)


if __name__ == "__main__":
    sys.exit(main())
