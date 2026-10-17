# Release audit — October 17, 2026

Review of the recent publishing changes, production configuration, and age-check fix. All four findings are addressed by the implementation in this release. The sections below preserve the original findings and evidence; the resolution record lists the changes and subsequent verification.

Scope: commits after `0b5cc2c` through `5da040c`, the deployed but uncommitted age-check fix, and the surrounding deployment scripts. The publishing gaps predate these commits. The Daily Double hint disclosure is a new regression.

## Publishing findings

### 1. P1 — Publishing can remove assets that existing pages still need

**Location:** [scripts/deploy_frontend.sh](scripts/deploy_frontend.sh), line 40.

The frontend deployment uses `aws s3 sync --delete`, removing older hashed JavaScript and CSS files. However, `/game`, `/join`, and `/age-check` HTML comes from a separately deployed API image. Older server HTML and already-open pages can still reference the deleted files, causing blank or broken pages. An API-only deployment can create the reverse mismatch by referencing bundles that have not reached S3 yet.

**Evidence:** Clean builds of the baseline and current revision showed six assets referenced by the older game HTML missing from the newer build. Three assets referenced by the older age-check HTML were also missing.

**Recommended fix:** Publish new assets before switching API HTML, retain historical hashed assets, and coordinate frontend/API releases. Verify that the deployed HTML's asset references are available before declaring success.

### 2. P1 — The default game's reset and Next Word requests are blocked

**Locations:** [infra/terraform/main.tf](infra/terraform/main.tf), line 284; [frontend/static/js/api.js](frontend/static/js/api.js), line 66.

CloudFront's API route list omits `/vote-reset`. Ordinary `/game` play uses that endpoint for reset votes and Next Word actions. Requests instead reach the static S3 behavior, which rejects POST. Lobby-specific `/lobby/<code>/vote-reset` requests use an existing wildcard and are unaffected by this omission.

**Evidence:** An unscreened production POST returned a CloudFront `403 text/html` response. The same unscreened request against isolated Flask returned the expected JSON age-check denial. After eligibility and player registration, isolated Flask accepted the action and returned `200` with `outcome: new_word`.

**Recommended fix:** Add `/vote-reset` to the API behaviors and verify the deployed route, including both reset voting and starting the next word.

### 3. P2 — The deployment script reports success before the restart finishes

**Location:** [scripts/deploy_api.sh](scripts/deploy_api.sh), lines 56–64.

The script submits an asynchronous SSM restart command and immediately prints `Done`. A later restart failure can leave the old version running or the API unavailable despite the reported success.

**Recommended fix:** Wait for the SSM command to complete, fail on unsuccessful execution, check readiness, and confirm that the expected image is running. Keep the existing behavior of leaving a sleeping server asleep.

## Gameplay finding

### 4. P2 — A player can retrieve another player's Daily Double hint

**Location:** [backend/server.py](backend/server.py), line 657.

The state response returns a stored hint for a caller-supplied emoji without checking that the requester owns that player identity. Private-room membership checks also do not bind this GET selector to the authenticated member. This violates the requirement that only the player receiving the hint sees its letter.

**Evidence:** Isolated Flask clients reproduced both cases: an approved private-room guest retrieved the host's revealed letter, and an unrelated age-eligible browser retrieved a public player's hint without providing that player's ID. No production player data was accessed.

**Recommended fix:** Derive private hint ownership from authenticated room membership. For public games, verify the player's existing credential before including the private hint. Shared game state can remain readable without exposing the letter.

## Initial audit verification and limits

- All 12 asset references checked across the current production home, game, join, and age-check HTML were available. The production health endpoint reported Redis enabled with no warnings.
- 143 browser checks passed: 136 startup, recovery, rejoin, and theme checks across Chromium and mobile Safari, plus seven full age-check/private-room scenarios against an isolated Flask server using Chromium.
- The backend suite reported 409 passed, two failed, and five skipped. The failures were the existing `test_flask_acknowledges_activity_pings_locally` test, which expects a missing Flask handler while production nginx handles that route, and `test_container_bad_word_list`, which could not run because Docker was stopped.
- Targeted infrastructure checks reported 24 passed and the same existing activity-handler test failure.
- A full production sleep/wake cycle was not exercised. Passing checks do not close the four findings above.

## Resolution in this release

- Both deployment scripts publish hashed assets before switching HTML and retain older assets. They verify the referenced assets are available.
- API deployment waits for the remote restart, checks health, and verifies the running image matches the pushed digest.
- CloudFront routes `/vote-reset` to the API and forwards the hint-ownership header. Startup-page caching remains disabled with explicit zero TTLs.
- Private hint reads use authenticated room membership. Public hint reads require the matching player credential, passed in a header rather than the URL. Regression tests cover unauthorized reads and legitimate owners.
- The age-check parsing fix and its browser regression coverage are included in the release changes so future Git-based deployments retain the fix.
- Release verification also restored the missing local `/activity` handler and made invalid game assets exit with Gunicorn's fatal worker-boot code, preventing endless worker restarts.

Subsequent local verification: **428 backend tests passed, five skipped; 36 Chromium/mobile Safari browser checks passed.** The container's invalid-word-list test now passes. CSS lint, the production frontend build, shell syntax, Terraform formatting/validation, and whitespace checks passed. The reviewed Terraform plan contains no server, disk, database, resource creation, or destruction changes.

## Production follow-up: regional wake failure

### 5. P1 — Some CloudFront regions cannot resolve the awake server

The published site repeatedly displayed its startup page even though the API
and Redis were healthy. Minimal CloudFront diagnostics identified
`OriginDnsError` from `ORD56-P6`; the same public health request through
`IAD61-P3` returned `200`. All four authoritative Route53 servers returned the
current EC2 address. Invalidations and refreshing the origin ID did not resolve
the failure. The evidence identifies a regional CloudFront DNS failure; it does
not establish why that resolver retained the failure.

**Resolution:** Route API origin connections through Origin Shield in the
server's `us-east-1` region. The previously failing region then returned healthy
JSON, accepted age submissions and allowed game creation. API caching remains
disabled, and the existing TLS, origin authentication and session forwarding
remain in place. Origin Shield adds a usage-based request charge, with no new
always-on server; see [AWS documentation](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/origin-shield.html).

The release check had incorrectly treated a public `503` as a sleeping server
after confirming a successful restart. API deployment now requires public
health before reporting success. Regression coverage reproduces that false
success; frontend-only publishing can still verify assets while the API sleeps.

Follow-up verification: **430 backend tests passed, five skipped.** Production
age submission, game creation and board loading passed in Chromium and mobile
Safari, and all 14 asset references from live pages loaded successfully.
An actual EC2 stop/start cycle also passed: mobile Safari saw the startup page,
recovered automatically in 24 seconds, submitted age and entered a private game.
The server retained its original instance and disk. Terraform reported no
differences between the deployed infrastructure and the updated configuration.
