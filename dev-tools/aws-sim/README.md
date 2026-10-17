# AWS sleep/wake simulator

Runs the real backend and the real frontend build behind a local copy of the AWS setup, so sleep, wake and resync behaviour can be tested before deploying.

```
browser ─► :8080 "CloudFront" ─┬─► S3            frontend/dist (always up)
                               ├─► /wake         Lambda: start / stopping / 423 budget cap
                               └─► origin        EC2 state + Route 53 parking
                                     └─► nginx   activity log, /activity 204, 502 while app is down
                                           └─► app   backend.server, imported like gunicorn
```

Every part follows the files it copies:

| Piece | Copied from | What it does here |
|---|---|---|
| CloudFront | `infra/terraform/main.tf` (parsed when the simulator starts) | API path list, forwarded headers and cookies, 3 s connect timeout, 60 s read timeout. Turns 502/504 into `/waking.html` with a 503 on every API path, including `fetch()` and `EventSource`. |
| Lambda `/wake` | `origin_control_lambda.py` | Starts the box only when it is `stopped`. Returns `stopping` during shutdown and 423 while the budget cap is on. While `pending` or `running` it also returns `elapsed`, the seconds since the boot began, which drives the waiting screens' time estimate. |
| EC2 + Route 53 | Lambda DNS follow | Moves through `stopped → pending → running → stopping → stopped`. The origin is parked, so requests time out, until DNS updates after boot. |
| nginx | `user_data.sh.tftpl` | Same activity map: POSTs and `GET /game`, `/join` and `/lobby/XXXXXX` reset the idle timer. `/stream`, `GET /state` and `/health` don't. |
| systemd | `user_data.sh.tftpl` | `wwf-idle` timer, `Restart=always` after 5 s, and `docker stop -t 20` on shutdown. |
| App | `docker/Dockerfile` | Uses `gunicorn -k gevent backend.server:app` when the interpreter can import gunicorn and gevent. Otherwise `app_runner.py` imports the module the same way and serves it threaded. Either way, the `__main__` block in `server.py` does **not** run, same as production. |
| Disk | EBS root volume | Kept in `.state/`: game and lobby JSON, private-room store, `SECRET_KEY` and the activity log. Survives sleeps; `--fresh` wipes it. |

## Run it

```bash
(cd frontend && npm run build)              # S3 serves frontend/dist
python3 dev-tools/aws-sim/aws_sim.py        # starts asleep, fast timings
```

Open http://localhost:8080/ to play and http://localhost:8080/__sim for the control panel. The panel shows each hop's state and has buttons for wake, idle shutdown, force stop, deploy restart, crash, budget cap and the idle limit. It also has a timeline of every state change.

Useful flags:

- `--preset realistic`: t4g.micro-like timing (about 1 minute to wake, 15 minute idle). The default `fast` preset runs a full cycle in about 15 s with a 45 s idle limit. Any single timing can be overridden, e.g. `--idle 120` or `--boot 20`.
- `--start running`: begin awake.
- `--app-env development`: no `FLASK_ENV=production`. Use it for private rooms (file store instead of TLS Redis) and for phones on the LAN with `--host 0.0.0.0`. Production mode sets Secure cookies, which browsers only keep over plain http on `localhost`.
- `--runner gunicorn`: insist on the production server (`pip install gunicorn gevent`).
- `-v`: print every request.

## Automated checks

```bash
python3 dev-tools/aws-sim/scenarios.py            # HTTP-level, stdlib only, ~4 min
python3 dev-tools/aws-sim/scenarios.py -k lobby   # one scenario
python3 dev-tools/aws-sim/scenarios.py -k remembered_age  # persistent eligibility across visits and sleep/wake
python3 dev-tools/aws-sim/browser_check.py        # two real Chromium tabs, ~4 min
```

Both start their own simulator on separate ports with a throwaway disk. The exit code is the number of failures. `browser_check.py` needs `pip install playwright && python -m playwright install chromium`.

Age eligibility uses the real backend's signed, HttpOnly cookie with a one-year expiry. The edge forwards it unchanged, and the signing key survives sleep/wake in `.state/secret_key`. The submitted age is not stored. Clearing site cookies, using a different browser profile, or starting the simulator with `--fresh` requires a new check.

## Issues it found (fixed on 2026-10-17)

1. **`/game` broke after every boot, deploy or crash.** Gunicorn never runs the `__main__` block of `backend/server.py`, which was the only place the default board was loaded and given a word. Every `/game` guess returned a 500 and the leaderboard was wiped. Fixed by `restore_default_game()`, which runs at import; covered by `tests/test_default_game_restore.py` and the `default_game_survives_sleep` scenario.
2. **Open tabs never woke the server.** While it sleeps, every API call gets CloudFront's HTML waking page, which the game page didn't recognise, so guesses failed silently. Now `serverWake.js` recognises that reply. When a player types, taps or submits, the tab calls `/wake`, says the server is waking and keeps the typed word. A tab nobody has touched for a minute never wakes the server, so the idle shutdown still saves money.
3. **Open tabs never resumed live updates.** After any outage, tabs fell back to polling for good, up to 15 s behind. `networkManager` now reopens the live stream after the first successful fetch and stops polling once it is open.
4. **Waking during an idle shutdown took about 30 s longer.** `/wake` can only start a stopped server. `waking.html` (and the game page) now ask again after 5 s when `/wake` reports `running` or `stopping`, instead of 30 s.
5. **By design, but worth knowing:** watching doesn't count as activity. Players who only read the board let the server stop after `idle_shutdown_minutes`; only typing and tapping keep it up.

`tests/test_wake_resync.py` covers 2–4 in Node. `browser_check.py` runs them end to end in Chromium.

## Keeping it in step with production

The simulator reads CloudFront from `infra/terraform/main.tf` each time it starts: cache behaviours in order, origins, forwarded headers and cookies, timeouts and the error page. It has no fallback; if it can't read something, it stops and says what.

The rest is hand-copied into `aws_sim.py` (see the block above `SOURCE_FINGERPRINTS`): the nginx activity map, idle shutdown, systemd restart and stop timings, the app's environment, the wake Lambda and the container command. `tests/test_aws_sim_drift.py` fingerprints each of those sources and checks the key values directly. When one changes, the test fails; update the copy, then record the new fingerprints with:

```bash
python3 dev-tools/aws-sim/aws_sim.py --fingerprints
```

AWS changing its own behaviour is rare. Expect instead to add things production shows that the simulator doesn't model, such as the CloudFront `OriginDnsError` after a wake that Origin Shield addresses.

## Limits

- No CloudFront caching. S3 pages come from disk, as if a fresh invalidation has just run.
- The browser talks HTTP/1.1 to the simulator. CloudFront uses HTTP/2, so keep many open tabs in separate browser profiles to stay clear of the 6-connections-per-host limit.
- There's no TLS, Let's Encrypt, IAM or SSM. The secret comes from `.state/secret_key`.
- Redis isn't simulated. Private rooms need `--app-env development` to use the JSON file store, or `--redis-url`.
