# Infrastructure Setup

This Terraform configuration hosts WordSquad on AWS for as little money as
possible while the player base grows. It creates:

- An S3 bucket for the static frontend, served through CloudFront with HTTPS
- An ACM certificate for the public domain (free)
- **One small EC2 server** (`t4g.micro` by default) running the API container
  behind nginx, reachable only from CloudFront
- A small Lambda (`wwf-origin-control`) that wakes the server, keeps
  `origin.<domain>` pointed at it, runs a nightly backstop stop, and acts as
  the budget kill switch
- An account-wide monthly budget with email alerts and an automatic stop at 100%

There is no load balancer, Fargate service, NAT gateway, Elastic IP or EFS.
Those all bill by the hour even with zero players; the old setup's ALB alone was
about $16/month plus public IPv4 charges.

## How the server sleeps and wakes

1. **Auto-stop.** A timer on the server checks every 5 minutes. After
   `idle_shutdown_minutes` (default 15) with no player activity, it shuts the
   server down, which **stops** (not terminates) the instance. Player activity
   means any POST to the game API, opening a game/lobby page, or typing,
   tapping or clicking on the site: the page sends a tiny `/activity` ping at
   most once a minute while someone is interacting. Health checks,
   live-update streams and lobby-list polling don't count, so a forgotten
   browser tab can't keep it running.
2. **Backstop.** Once a day (`nightly_stop_schedule`, default 09:00 UTC) the
   Lambda stops the server even if the idle timer ever breaks.
3. **Wake on visit.** Opening the landing page calls `/wake`, so the server
   is usually ready by the time a player has picked an emoji. If someone opens
   a lobby link while it sleeps, CloudFront shows `waking.html`. That page calls
   `/wake` and reloads once `/health` is OK, usually within about a minute.
4. **DNS follows the server.** The server has no Elastic IP. When it starts,
   the Lambda points `origin.<domain>` at its new public IP. When it stops,
   the Lambda parks that record on an unroutable address.
5. **Budget cap.** At 100% of `monthly_budget_usd` in actual spend, AWS Budgets
   notifies the Lambda. Budgets refreshes a few times a day, so this is a
   safety net, not a real-time meter. The Lambda stops the server and sets
   `/wwf/wake-disabled=true`, so `/wake` refuses to start it again. Run
   `scripts/emergency_cost_control.sh --resume` to allow wake-ups again.

Approximate cost (us-east-1): stopped, about $0.64/month for the 8 GB disk,
$0.50 for the Route53 zone, and cents for S3/CloudFront/Lambda. While running,
about $0.0084/hour for the server plus $0.005/hour for its public IPv4, or
about $9.80/month if it never slept. The KMS key, if you keep using it, adds
$1/month.

## Live donation total (optional)

`donations.tf` adds a Stripe webhook (Lambda function URL) that verifies
Stripe's signature, keeps a monthly total in an on-demand DynamoDB table, and
writes `donations.json` to the frontend bucket for the landing page's
server-fund card. Turn it on with `enable_donations = true`; setup steps are in
[DEPLOY_GUIDE.md](../../docs/DEPLOY_GUIDE.md#donations-live-server-fund-card).

## Usage

Publication is blocked by `privacy-publication.tf` until `privacy_operator`
contains the verified legal name, mailing address, phone, privacy email and
HTTPS website URL, and `privacy_notice_reviewed` is true. The live tfvars keep
these details empty and the review flag false until the owner supplies them.
Set the flag only after the accurate public notice is complete and reviewed.
The same gate applies to direct Terraform plans/applies and `ci-plan.sh`;
it does not check or award COPPA certification. See
[the readiness review](../../docs/COPPA_READINESS.md) for remaining work.

The API also requires `session_secret_arn`, pointing to a random signing key
of at least 32 characters. An SSM SecureString parameter is free; Secrets
Manager costs $0.40/month per secret. The server's IAM role can read exactly the
ARNs you configure. On every start it injects the value as `SECRET_KEY` and sets
`FLASK_ENV=production`. The key value must not be placed in tfvars.

CloudFront forwards `wordsquad_age_session` and routes age/game endpoints to
the server over HTTPS without caching. The server's nginx gets a Let's Encrypt
certificate for `origin.<domain>` through a Route53 DNS challenge, so no
inbound port besides 443 is opened. nginx also requires a secret header that only
this CloudFront distribution sends, so the two trusted proxy hops
(`TRUSTED_PROXY_HOPS=2`: CloudFront, then nginx) can't be spoofed by another
CloudFront distribution.

```bash
cd infra/terraform
terraform init
terraform plan  -var-file=../live/variables.tfvars   # review first
terraform apply -var-file=../live/variables.tfvars
```

Then deploy the code:

```bash
scripts/deploy_api.sh        # build arm64 image, push to ECR, restart if awake
scripts/deploy_frontend.sh   # build, upload to S3, invalidate CloudFront
```

Useful operations:

```bash
aws ssm start-session --target "$(terraform output -raw api_instance_id)"  # shell, no SSH needed
scripts/emergency_cost_control.sh           # stop now and pause wake-ups
scripts/emergency_cost_control.sh --resume  # allow wake-ups again
scripts/emergency_cost_control.sh --audit   # read-only list of anything still billing
```

Lobby state is written to `/opt/wwf/data` on the server disk, which survives
stop/start. Changing the server's `user_data` (anything in
`user_data.sh.tftpl` or the values passed to it) replaces the server on the
next apply; that is intentional so its setup always matches this repo.

If your word list or definitions cache are stored outside the image, override
`WORD_LIST_PATH` and `DEFN_CACHE_PATH` in `/usr/local/bin/wwf-prepare` (written
by `user_data.sh.tftpl`). They default to the bundled files under `/app/data`.
