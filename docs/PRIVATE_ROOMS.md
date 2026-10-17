# Private rooms and streamer mode

Implements the application flow from [plan #563](https://github.com/deveydtj/WWF/issues/563). The deployed configuration and verification results are recorded below; local tests alone do not certify the deployed CDN, Redis, IAM, or origin configuration.

## Player flow

Choose **Private** in the Open/Private switch above the Create button (the button changes to **Create Private Room**). The landing page remembers the last choice in this browser. Private play opens at `/game`; the header says “Private room.” The host opens the lock button to manage admission. **Replace & copy invitation** creates a new invitation, cancels old pending requests, and copies the link without displaying it. Send it privately. An invitation expires after one hour. Each replacement invalidates the previous link; already approved friends stay admitted.

A guest opens `/join#<invitation>`. The minimal join page immediately removes the fragment, then asks for a name and the existing age check. A valid invitation creates only a pending request. The host verifies the person and approves or rejects them. Names are labels, never identity proof. Locking blocks requests and approvals until unlocked. Kicking removes membership and closes streams within the next one-second check; the same invitation can only create another explicit approval request.

Membership survives refresh and process restarts. Losing the browser session requires fresh approval. There is no host recovery by code, IP, or display name. A guest leaving revokes that membership; the host leaving deletes the room. Idle rooms expire after 30 minutes, and every room closes at the host's absolute session expiry.

Each tab keeps its room identifier in sessionStorage; it is only a selector. Two tabs can play in different private rooms. A duplicated tab can share its original room. A fresh `/game` tab without a private selector retains the ordinary default-game behavior. An invalid private selector displays an unavailable screen instead of falling back to another game. Private player identity stays in memory and is recovered from the server on reload. No invitation or host credential is stored in localStorage or sessionStorage.

The clipboard and the original invitation message can retain the invitation. Browser history/sync, extensions, and screenshots can also retain earlier copies. Concealing the game URL cannot erase those copies.

## Authorization and persistence

Private identifiers reserve lowercase `p` followed by five hexadecimal characters. Ordinary generated codes remain uppercase. Identifiers confer no access, and reading an unknown code never creates a room. Private rooms are absent from the public lobby dictionary and public persistence, so neither discovery endpoint can include them.

`__Host-wordsquad_room_session` (`wordsquad_room_session` in development) is a random 256-bit opaque browser-session cookie, HttpOnly and SameSite=Strict, and Secure in production. The separate signed age-eligibility session remains required. Stored session identifiers and invitations are SHA-256 verifiers; raw invitations are returned only by an authorized host rotation. Host authority, membership, expiry, pending requests, locks, rate counters, stream leases, and game state share an atomic storage transaction. The request derives the player from membership and rejects forged player IDs/emojis before calling game logic. Private requests never use the legacy shared-IP reconnect path.

Private mutations require an exact `Origin` and `X-WordSquad-Request: 1`. No CORS access is granted. Sensitive HTML, API responses, errors, and streams use no-store and no-referrer. Chat and admission names are rendered as text. Private game definitions use the bundled dictionary without sending private answers to a third party or dictionary logs.

Development uses `runtime/private-rooms.json`, an owner-only file replaced atomically under a process-shared file lock. Production requires shared Redis; it never falls back to files if Redis fails. Redis commits watch the transaction lease, preventing a paused worker from overwriting a later revocation after losing its lock. Private SSE reads committed shared state once per second and checks membership, expiry, and stream leases each time, so workers do not rely on process-local listeners.

The implementation serializes private operations with one storage lock and caps rooms at 100. This is a deliberate small-deployment limit. Split storage into per-room records before increasing the capacity substantially. Public rooms retain their existing persistence model; this change does not make public game state coherent across multiple workers.

## Route inventory

| Routes | Private-room policy |
| --- | --- |
| `POST /lobby` with `private: true` | Age, exact origin/custom header, shared creation limits; establishes host membership |
| `GET /lobbies`, `/lobbies/network` | Public rooms only, including callers on the host's LAN |
| `POST /private/exchange` | Age, origin/custom header, rate limit, valid unexpired invitation, unlocked/bounded pending queue; returns no game data |
| `GET /private/request?room=…` | Only this session's pending/approved status; no roster or chat |
| `GET /private/context?room=…` | Approved membership; returns only this player's ID/avatar and host status |
| `/lobby/<code>/state`, `/emoji`, `/guess`, `/hint`, `/chat` | Approved membership, server-derived actor, shared rate limit; mutations also require origin/custom header |
| `/lobby/<code>/stream` | Membership before opening and on each tick; shared connection bounds; failure/expiry/revocation closes stream |
| `/lobby/<code>/reset`, `/kick`, `/admission` | Host membership; invitation holders and ordinary members cannot manage rooms |
| `/lobby/<code>/vote-reset` | Any member can call or answer a squad vote on a live round; only the host can start the next word once a round is settled |
| `/lobby/<code>/leave` | Revokes the calling member; host leave deletes the room |
| Legacy `/state`, `/emoji`, `/guess`, `/hint`, `/chat`, `/reset`, `/stream` | Always the ordinary default lobby; cannot select a private room via client parameters |
| `/internal/purge`, `/admin/notify-update` | Dedicated `Authorization: Bearer <OPERATOR_TOKEN>`; age eligibility is not operator authorization |
| `/`, `/game`, `/lobby/<code>`, `/join`, `/age-*` | HTML/bootstrap/eligibility only; private data still requires API membership |
| Static routes, fallback, `/health` | Explicit asset roots, no private storage or credentials; health no longer reports lobby counts |

## Configuration

| Variable | Default / requirement |
| --- | --- |
| `REDIS_URL` | Required in production for private rooms; use authenticated TLS Redis (`rediss://`) on a private network with durable persistence and no eviction |
| `PUBLIC_ORIGIN` | Required HTTPS origin in production, e.g. `https://wordsquad.example`; exact origin, no trailing slash |
| `SECRET_KEY` | Existing production signing secret, at least 32 characters; same across workers |
| `OPERATOR_TOKEN` | Dedicated random service credential; absent means maintenance requests are denied |
| `PRIVATE_ROOMS_FILE` | Development only: `runtime/private-rooms.json` |
| `ROOM_SESSION_TTL` | 43200 seconds, absolute expiry |
| `ROOM_INVITE_TTL` | 3600 seconds |
| `ROOM_PENDING_TTL` | 600 seconds, never later than invitation expiry |
| `ROOM_MAX_PENDING` | 20 requests per room |
| `ROOM_MAX_MEMBERS` | 20 including host |
| `ROOM_MAX_COUNT` | 100 rooms |
| `ROOM_MAX_STREAMS` | 32 per room |
| `ROOM_STREAMS_PER_MEMBER` | 3 |
| `ROOM_MAX_CHAT_MESSAGES` | 100 retained messages per room |
| `ROOM_MAX_PAST_GAMES` | 20 retained games per room |
| `TRUSTED_PROXY_HOPS` | 0 unless the forwarding chain is restricted and verified; Terraform uses 2 for CloudFront → nginx on the game server |

Request bodies are limited to 16 KiB. Shared limits per session per minute: creation 5, invitation exchanges 30, pending polls 120, private game access 240, guesses 30. Network allowances are 30 times session allowances so shared LANs remain usable. Rate records expire after a minute and are capped at 4096; reaching the cap denies new entries. An ordinary user cannot override the network identity with an arbitrary forwarding header.

## Deployment and launch checks

Terraform forwards private paths, join pages, both session cookies, Origin, the custom request header, and operator Authorization to the API with caching disabled. The game server's security group permits only the AWS CloudFront origin-facing prefix list, nginx additionally requires a secret header that only this distribution sends, and the app container listens on localhost only. Idle lobbies are purged by the app itself during normal requests; there is no separate cleanup Lambda.

Set `private_rooms_redis_secret_arn` to an SSM SecureString parameter or Secrets Manager secret containing the Redis connection URL and `operator_secret_arn` to a separate service-token secret. Empty Redis configuration leaves private rooms unavailable in production. Terraform grants the game server's IAM role read access to exactly these ARNs; a customer-managed secret KMS key also needs an appropriate decrypt grant. No secret values belong in tfvars.

### Redis on the existing server

The live tfvars enable `enable_local_redis = true`. Terraform's
`aws_ssm_association.local_redis` runs `setup_local_redis.sh` after bootstrap,
preserving the existing instance and disk. Store this URL in the Redis secret,
replacing the password placeholder with a random 64-character hexadecimal value:

```text
rediss://:<password>@wwf-redis:6379/0?ssl_ca_certs=/etc/wwf/redis-ca.crt&ssl_check_hostname=true&socket_connect_timeout=3&socket_timeout=5
```

The script fetches the secret on the server. Redis uses a private Docker network,
password authentication, TLS with a pinned private certificate, and hostname
verification. Port 6379 is not published on the host. The private certificate
lasts ten years; rotate it and restart Redis/API before expiry. It is unrelated
to the public site's certificate.

Redis data is limited to 64 MiB with `noeviction`, inside a container capped at
192 MiB. The append-only log is synced on every write, and truncated logs are
rejected at startup. Data lives in `/opt/wwf/redis` on the encrypted root disk,
separate from public JSON data. Never copy either directory to the frontend
bucket. Redis starts before the API, and both recover on server stop/start.
An unavailable or full Redis denies private operations; it does not fall back
to a public game or local private-state files. A Redis outage leaves the public
API running.

This uses the existing small server and is intended for light use. The data
survives stop/start. Terraform blocks instance destruction, ignores automatic
AMI refreshes and retains the root disk on termination. A retained disk must be
reattached or migrated before a replacement server can use its data. After
restoring any old disk or backup, discard private-room/session state and create
new rooms so revoked memberships cannot be resurrected.

### Launch checklist

Before advertising private rooms:

1. Provision private Redis access for application roles only, TLS/authentication, durable persistence, no eviction, encryption, and restricted backups. All workers must share the same store. Do not restore old authorization snapshots: they can resurrect revoked memberships. After a disaster restore, discard private room/session state and require new rooms and approval.
2. Verify the deployed HTTPS domain forwards both cookies and required headers, never caches private responses across sessions, and has the expected Secure/HttpOnly/SameSite flags. Verify exact Origin checks and that direct-origin access is rejected by the network boundary. Verify two trusted forwarding hops with controlled requests; do not enable that setting on an unrestricted origin.
3. Publish only frontend build assets. Never upload runtime JSON, Redis dumps, environment files, or backups to the static bucket. Keep request bodies, Cookie, Authorization, and invitation responses out of application/proxy/analytics/error logging.
4. Run the HTTP and browser scenarios below against isolated deployed sessions, including two workers, restart, kick, and storage outage. Inspect deployed CDN cache behavior and IAM/storage access separately.
5. Record actual deployed results, including limitations. Posting them to issue #563 is a separate operator action.

## Local verification

```sh
.venv/bin/python -m pytest tests/test_private_rooms.py -q
WORDSQUAD_TEST_URL=http://127.0.0.1:5058 npx playwright test tests/playwright/private-rooms.spec.js tests/playwright/age-eligibility.spec.js --project=chromium --workers=1 --reporter=line
```

Use temporary GAME_FILE, LOBBIES_FILE, and PRIVATE_ROOMS_FILE paths when starting a test server. The browser checks use the built frontend and separate browser contexts. The optional Redis integration test uses `WORDSQUAD_TEST_REDIS_URL` and **deletes the two `wwf:private:*` test keys**; supply only a disposable Redis instance. It verifies access from a fresh process, persisted revocation, lost-lock commit rejection, and storage failure without file fallback.

Verification in the implementation session (2026-10-14): 328 affected Python tests passed, with two environment-dependent tests skipped. All 27 private-room HTTP checks passed with disposable Redis enabled. Six Chromium browser checks passed across the private-room and existing age-gate flows; the final private-room rerun also exercised keyboard isolation, hidden guest reset controls, and the roster's kick button. Frontend production build, CSS lint, diff whitespace check, Terraform formatting, and Terraform provider validation passed. Those checks preceded the AWS deployment.

## Deployed verification — 2026-10-16

Applied the local Redis configuration to `wordsquad.io` on the existing
`t4g.micro`, without replacing the instance or its encrypted 8 GiB root disk.
The SSM association completed successfully. Both services are active and enabled
at boot. A subsequent Terraform plan reported no changes.

Isolated HTTPS sessions verified creation, invitation exchange, pending guest
isolation, approval, host-only controls, forged identity rejection, exact Origin
and custom-header checks, invitation replacement, admission lock/unlock, and
exclusion from both public discovery endpoints. Membership cookies had Secure,
HttpOnly and SameSite=Strict flags; private responses had `no-store`.

Kicking a guest denied further state/context access and closed an already-open
event stream. Restarting both Redis and the API preserved the host's room and
identity while keeping the kicked guest revoked. Stopping Redis caused private
requests to return 503 while the public API remained available. Restarting Redis
restored private access without restarting the API. Synthetic rooms were removed,
and public room creation, avatar registration, state and leave were checked too.

Two Chromium browser scenarios passed against the deployed domain: host approval,
guest reload, concealed URLs, host/guest controls and kick; and two independent
private rooms in separate tabs. The kick test now waits for the mutation response
before checking revocation, avoiding a race with the HTTP request.

Redis rejected an incorrect password and an untrusted certificate. Inspection
confirmed no published Redis port, a 192 MiB container limit, a 64 MiB data limit,
`noeviction`, append-only persistence with `appendfsync always`, no truncated-log
loading, successful disk writes and zero evictions. After the checks the Redis
container used about 4.4 MiB, the API about 64 MiB, the server had 477 MiB available
RAM, and the disk had 4.4 GiB free. Twelve state reads across four simultaneous
clients succeeded, with the slowest taking 0.37 seconds. This is a light-use
check, not a maximum-capacity benchmark.

The affected local Python suite passed 39 tests with one optional Redis check
skipped; that optional check passed separately against disposable Redis,
including fresh-process access, revocation, lease loss and storage failure.
Shell syntax, Terraform formatting/validation and diff whitespace checks passed.
The deployment runs one API container; multiple deployed workers and a full EC2
stop/start were not exercised in these checks.

On 2026-10-17, an accidental deployment replacement deleted the original root
disk and its room state. Recovery and the new destruction/disk-retention
protections are documented in the [deployment incident report](DEPLOYMENT_INCIDENT_2026-10-17.md).
