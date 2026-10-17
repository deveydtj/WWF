# Deployment Guide

This guide outlines the steps to deploy the WordSquad infrastructure and API using Terraform and GitHub Actions.

## Prerequisites

**The live deployment temporarily defers the privacy publication gate** with
`enforce_privacy_publication_gate = false`, at the owner's request. This does
not mark the privacy notice as reviewed. The gate is enabled by default.

When the gate is enabled, publication requires the legal operator
name, mailing address, phone number, privacy email, and live HTTPS website URL.
Fill in `privacy_operator` in `infra/live/variables.tfvars`, complete an accurate
public privacy notice, and set `privacy_notice_reviewed = true` only after that
notice is reviewed. Terraform preconditions enforce this for the AWS plan/apply
path, including `infra/terraform/ci-plan.sh`. Missing details or a false review
flag cause a hard failure. Run a fresh plan after these prerequisites are ready.
This gate does not establish COPPA certification; the additional unresolved
requirements are recorded in [COPPA_READINESS.md](COPPA_READINESS.md).

The 13+ age screen uses a signed browser-session cookie. Before deployment,
store a random `SECRET_KEY` of at least 32 characters in AWS Secrets Manager
or SSM, and supply its ARN as `session_secret_arn` in the live tfvars. Terraform
grants the server's IAM role read access to exactly that ARN.
Terraform supplies the secret to the container without putting its value in
the server configuration, and sets `FLASK_ENV=production` for HTTPS-only cookies.
An empty ARN blocks API deployment; a missing or short key prevents startup.
Local development uses a temporary random key if none is supplied.

CloudFront routes age checks and game/API paths to the game server over HTTPS,
forwards the age-session cookie, and disables caching for those paths. Keep
these settings when updating the CDN; otherwise eligibility may fail or
responses may be shared incorrectly. Verify the screen on the deployed HTTPS
domain before publication, including direct lobby links, chat and session expiry.

## Low-cost layout

To keep the monthly bill near zero until there are regular players, the API
runs on **one small EC2 server that stops itself when nobody is playing** and
starts again when someone visits. There is no load balancer, Fargate, NAT
gateway, Elastic IP or EFS. Those bill around the clock, and the old ALB setup
kept billing even after the tasks scaled to zero. See
[infra/terraform/README.md](../infra/terraform/README.md) for exactly how
sleep/wake works and what it costs.

| State | Approximate cost |
| --- | --- |
| Server asleep | ~$1.15/mo (8 GB disk + Route53 zone), plus cents of S3/CloudFront |
| Server awake | + ~$0.0134/hour (t4g.micro + its public IPv4) |
| Awake all month | ~$11/mo; the $10 budget cap stops it before that |

The first visitor after a nap waits about a minute while the server boots.
The landing page starts the wake-up as soon as it loads.

API origin connections use CloudFront Origin Shield in `us-east-1` to avoid
the regional DNS failure observed during the October 17 rollout. API caching
remains disabled. Origin Shield adds a usage-based request charge; see
[AWS pricing](https://aws.amazon.com/cloudfront/pricing/). It adds no always-on
server and does not change idle shutdown or the monthly budget cap.

- [Terraform](https://www.terraform.io/downloads.html) 1.4 or newer
- AWS account with permissions to create S3, CloudFront, EC2, IAM, Lambda,
  Route53 records, Budgets and SSM parameters
- Docker with `buildx` (Docker Desktop on Apple Silicon builds the ARM image natively)
- AWS CLI v2 configured with your credentials
- A Route53 hosted zone for the domain

## Step-by-Step Deployment

### Step 1: AWS Prerequisites

1. **Configure AWS CLI**
   ```bash
   aws configure
   aws sts get-caller-identity
   ```

2. **Store the session signing key** as a free SSM SecureString:
   ```bash
   aws ssm put-parameter --name /wwf/secret-key --type SecureString \
     --value "$(openssl rand -hex 32)"
   aws ssm get-parameter --name /wwf/secret-key --query Parameter.ARN --output text
   ```
   Put the printed ARN in `session_secret_arn`. Do the same for the operator
   token and Redis URL if you use private rooms.

3. **Remove the old setup.** The previous ALB + ECS + EFS stack keeps billing
   while it exists, even when scaled to zero. Run the read-only check below and
   delete anything it lists from the old stack (ALB, target groups, ECS
   service/cluster, EFS, old log groups):
   ```bash
   scripts/emergency_cost_control.sh --audit
   ```

### Step 2: Network

Use the default VPC (or any VPC) and pick **one public subnet**, meaning its
route table has a route to an internet gateway. No NAT gateway is needed.

### Step 3: Configure Terraform Variables

Update `infra/live/variables.tfvars`:
```hcl
aws_region         = "us-east-1"
frontend_bucket    = "your-unique-frontend-bucket-name"
domain             = "your-actual-domain.com"
hosted_zone_id     = "Z..."
vpc_id             = "vpc-..."
subnet_id          = "subnet-..."   # one public subnet
api_image          = "ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/wwf-api:latest"
session_secret_arn = "arn:aws:ssm:us-east-1:ACCOUNT:parameter/wwf/secret-key"
monthly_budget_usd = 10
budget_alert_email = "you@example.com"
```
Optional knobs: `instance_type`, `idle_shutdown_minutes`,
`nightly_stop_schedule`, `acme_email`.

### Step 4: Push the API image first

The server pulls the image on boot, so push it before the first apply:
```bash
scripts/deploy_api.sh
```

### Step 5: Apply

```bash
cd infra/terraform
terraform init
terraform plan  -var-file=../live/variables.tfvars   # review the plan
terraform apply -var-file=../live/variables.tfvars
```
State is local (`backend.tf`). Keep `terraform.tfstate` safe, or switch the
backend to S3 (an on-demand DynamoDB lock table costs nothing at this scale).

### Step 6: Upload the frontend

```bash
scripts/deploy_frontend.sh
```
This also uploads `waking.html`, the page CloudFront shows while the server
starts.

## Donations (live server-fund card)

The landing page's "Server fund" card can update itself whenever someone
donates through Stripe. The ring and totals grow live, and a donor who comes back
from Stripe watches their donation fill the ring. How it works:

```
Stripe Payment Link → Stripe webhook → wwf-donations Lambda → DynamoDB (monthly total)
                                                            → s3://<bucket>/donations.json
landing page card ← CloudFront /donations.json (cached ≤ 10 s)
```

It never wakes the game server and costs fractions of a cent at this scale.
Only amounts are stored and published: no names, emails or messages.
Totals reset each month (UTC) and show the amount donated, before Stripe's fees.
The goal defaults to `monthly_budget_usd`, so the card shows how much of this
month's server bill is covered.

**One-time setup** (try it all in Stripe *test mode* first):

1. **Payment Link.** In the Stripe Dashboard, create a Payment Link for a
   product such as "Server fund" with *Let customers choose what to pay*
   (USD). Under *After payment*, choose to redirect customers to
   `https://<your-domain>/?donated=1`. Copy the link (`https://buy.stripe.com/...`).
2. **Terraform.** In `infra/live/variables.tfvars`, set:
   ```hcl
   enable_donations        = true
   stripe_payment_link_url = "https://buy.stripe.com/..."
   ```
   Then plan and apply, and copy the `stripe_webhook_url` output.
3. **Webhook.** In Stripe go to Developers → Webhooks (called "Event
   destinations" in newer dashboards) and add an endpoint with that URL and
   these events: `checkout.session.completed`,
   `checkout.session.async_payment_succeeded`, `charge.refunded`. Copy its
   signing secret (`whsec_...`).
4. **Store the secret** (free SSM SecureString; it never goes in Terraform):
   ```bash
   aws ssm put-parameter --name /wwf/stripe-webhook-secret --type SecureString \
     --overwrite --value 'whsec_...'
   ```
   Until this exists the webhook answers 503 and Stripe retries, so nothing is lost.
5. **Test.** Open the test-mode Payment Link, pay with Stripe's test card
   `4242 4242 4242 4242`, and watch the card update. Clear the test totals
   before going live (below).

**Going live:** switch the Payment Link URL in tfvars to your live-mode link,
create the same webhook endpoint in live mode, and overwrite the SSM parameter
with the live `whsec_...`. To clear test donations from the current month:
```bash
aws dynamodb delete-item --table-name wwf-donations --key '{"pk":{"S":"month#'"$(date -u +%Y-%m)"'"}}'
aws lambda invoke --function-name wwf-donations --payload '{"action":"publish"}' \
  --cli-binary-format raw-in-base64-out /dev/null
```

Refunds made in Stripe subtract from the month the donation counted toward.
`scripts/deploy_frontend.sh` never touches `donations.json`.

## Day-to-day

- **Deploy backend changes:** `scripts/deploy_api.sh`. It publishes the
  build's hashed assets to S3 before pushing the image, then restarts the app
  if the server is awake and waits until it is healthy on the pushed image.
  It exits non-zero ("Deploy FAILED") if the restart, health check or image
  check fails. A sleeping server stays asleep and pulls the image on wake-up.
- **Deploy frontend changes:** `scripts/deploy_frontend.sh`. Hashed assets go
  up before any page and are never deleted, so `/game`, `/join` and
  `/age-check` HTML from the running image (and pages already open) keep
  loading. It finishes by loading the live pages and every asset they
  reference (pages served by a sleeping server are skipped, never woken).
- **Changes to both:** either order is safe; each script publishes the assets
  its own HTML needs before that HTML goes live.
- **Shell on the server:** `aws ssm start-session --target <api_instance_id>`
  (no SSH key or open port)
- **Server logs:** in that shell, `journalctl -u wwf-app -u nginx -u wwf-idle`
- **Emergency stop:** `scripts/emergency_cost_control.sh` (stops the server and
  pauses wake-ups); `--resume` undoes it
- **Something still billing?** `scripts/emergency_cost_control.sh --audit`

## Post-Deployment Checks

1. Visit the domain and confirm the landing page loads.
2. Open `https://your-domain.com/health`. While the server is asleep you'll see
   the waking page first, then the JSON health result.
3. Wait past `idle_shutdown_minutes` without playing and confirm in the EC2
   console that `wwf-api` is **Stopped**.
4. Open a lobby link and confirm the waking page brings the game back.

## Troubleshooting

- **Waking page never finishes:** connect with Session Manager and check
  `journalctl -u wwf-cert -u nginx -u wwf-app`. On first boot the server
  requests its Let's Encrypt certificate, which needs the Route53 permissions
  Terraform grants. A missing or unreadable `session_secret_arn` stops the app
  from starting.
- **Server won't stay stopped:** check `scripts/emergency_cost_control.sh --audit`
  for leftovers from the old ALB/ECS stack, and `journalctl -u wwf-idle` on the
  server. The nightly backstop also stops it once a day.
- **Wake-ups refused ("taking a short break"):** the budget cap tripped or the
  emergency stop ran. Run `scripts/emergency_cost_control.sh --resume`.
- **Image architecture errors (`exec format error`):** the default server is
  ARM (t4g). `scripts/deploy_api.sh` builds `linux/arm64`; keep them matched.
- **Subnet issues:** the subnet must be public (route to an internet gateway)
  and auto-assign or allow a public IPv4.

Refer to `infra/terraform/README.md` for details on the Terraform modules.

### Private rooms and streamer mode

See [PRIVATE_ROOMS.md](PRIVATE_ROOMS.md) for the access model, required shared Redis and operator secrets, limits, proxy configuration, and launch verification. Production private rooms fail closed without Redis and an HTTPS `PUBLIC_ORIGIN`. Terraform accepts secret ARNs (SSM or Secrets Manager) via `private_rooms_redis_secret_arn` and `operator_secret_arn` and grants the server read access to them. Maintenance clients now need a dedicated bearer token. The CloudFront-only security group, the origin secret header in nginx and the trusted proxy-hop setting are deployed together.

The live configuration enables `enable_local_redis`. Its SSM association installs
authenticated TLS Redis on the existing server, with 64 MiB for data, a 192 MiB
container limit, no eviction, and an append-only log synced on every write to
the encrypted root disk. Redis has no public port and restarts with the server.
This avoids an additional database instance. Server termination or replacement
requires a migration plan; stop/start preserves the data.
