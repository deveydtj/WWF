#!/usr/bin/env bash
# Build the API image, push it to ECR, and restart the game server if it is
# currently running. If the server is asleep, it pulls the new image the next
# time a player wakes it, so there is no need to start it just to deploy.
#
# The image serves /game, /join and /age-check HTML whose hashed assets come
# from S3, so this build's assets are published to S3 before the image can go
# live. After a restart it waits for the server to report healthy on exactly
# the image it just pushed, and fails loudly otherwise.
#
# Usage: scripts/deploy_api.sh [image-uri]
#   image-uri defaults to api_image in infra/live/variables.tfvars
#   PLATFORM=linux/amd64 scripts/deploy_api.sh   # only if you switched to x86 servers
set -euo pipefail
cd "$(dirname "$0")/.."

TFVARS=infra/live/variables.tfvars
tfvar() { sed -n "s/^$1 *= *\"\([^\"]*\)\".*/\1/p" "$TFVARS" | head -n 1; }
. scripts/lib/frontend_assets.sh

IMAGE="${1:-$(tfvar api_image)}"
REGION="${AWS_REGION:-$(tfvar aws_region)}"
BUCKET="${FRONTEND_BUCKET:-$(tfvar frontend_bucket)}"
DOMAIN="${SITE_DOMAIN:-$(tfvar domain)}"
PLATFORM="${PLATFORM:-linux/arm64}" # t4g servers are ARM (Graviton)
RESTART_TIMEOUT="${RESTART_TIMEOUT:-600}" # seconds to wait for pull + restart + health
POLL_SECONDS="${POLL_SECONDS:-5}"

for cmd in aws docker npm curl base64; do
  command -v "$cmd" > /dev/null || { echo "Missing required command: $cmd" >&2; exit 1; }
done
if [ -z "$IMAGE" ] || [ -z "$REGION" ] || [ -z "$BUCKET" ]; then
  echo "Set api_image, aws_region and frontend_bucket in $TFVARS (or pass the image URI)." >&2
  exit 1
fi

REGISTRY="${IMAGE%%/*}"
REPO="${IMAGE#*/}"
REPO="${REPO%%:*}"
NAME="${IMAGE##*/}"
case "$NAME" in *:*) TAG="${NAME##*:}" ;; *) TAG=latest ;; esac

echo "Image:    $IMAGE ($PLATFORM)"
echo "Region:   $REGION"

# ECR repository, keeping only the 3 newest images so storage stays ~free.
if ! aws ecr describe-repositories --region "$REGION" --repository-names "$REPO" > /dev/null 2>&1; then
  echo "Creating ECR repository $REPO"
  aws ecr create-repository --region "$REGION" --repository-name "$REPO" > /dev/null
fi
aws ecr put-lifecycle-policy --region "$REGION" --repository-name "$REPO" \
  --lifecycle-policy-text '{"rules":[{"rulePriority":1,"description":"Keep 3 newest images","selection":{"tagStatus":"any","countType":"imageCountMoreThan","countNumber":3},"action":{"type":"expire"}}]}' \
  > /dev/null

echo "Building frontend assets (bundled into the image)..."
(cd frontend && npm run build)

# The image's HTML must never reference assets that are not on S3 yet. Older
# assets stay, so pages from the previous image keep working too.
ASSETS_PUBLISHED=0
if aws s3api head-bucket --bucket "$BUCKET" --region "$REGION" > /dev/null 2>&1; then
  publish_assets
  verify_assets_in_bucket
  ASSETS_PUBLISHED=1
else
  # First-time setup pushes the image before terraform creates the bucket.
  echo "Bucket s3://$BUCKET does not exist yet; run scripts/deploy_frontend.sh after terraform apply." >&2
fi

echo "Building and pushing image..."
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REGISTRY"
docker buildx build --platform "$PLATFORM" -f docker/Dockerfile -t "$IMAGE" --push .

DIGEST=$(aws ecr describe-images --region "$REGION" --repository-name "$REPO" \
  --image-ids imageTag="$TAG" --query 'imageDetails[0].imageDigest' --output text)
case "$DIGEST" in
  sha256:*) echo "Pushed:   $DIGEST" ;;
  *) echo "Could not read the pushed image digest for $REPO:$TAG" >&2; exit 1 ;;
esac

INSTANCE_IDS=$(aws ec2 describe-instances --region "$REGION" \
  --filters "Name=tag:Name,Values=wwf-api" "Name=tag:Project,Values=WWF" "Name=instance-state-name,Values=running" \
  --query 'Reservations[].Instances[].InstanceId' --output text)

if [ -z "$INSTANCE_IDS" ] || [ "$INSTANCE_IDS" = "None" ]; then
  echo "Server is asleep; it will use the new image the next time it wakes up."
  echo "Done."
  exit 0
fi

if [ "$ASSETS_PUBLISHED" != 1 ]; then
  echo "Deploy FAILED: the server is running but this build's assets could not be published to s3://$BUCKET." >&2
  exit 1
fi

# Runs on the server: restart (which pulls the image), wait for /health, then
# confirm the running container is the image pushed above.
IFS= read -r -d '' REMOTE_SCRIPT <<EOF || true
set -u
expected='$DIGEST'
systemctl restart wwf-app || { journalctl -u wwf-app -n 40 --no-pager; exit 1; }
healthy=0
for i in \$(seq 1 60); do
  if curl -fsS -o /dev/null --max-time 5 http://127.0.0.1:5001/health; then healthy=1; break; fi
  sleep 5
done
if [ "\$healthy" != 1 ]; then
  echo "wwf-app did not become healthy within 5 minutes" >&2
  journalctl -u wwf-app -n 40 --no-pager >&2
  exit 1
fi
running=\$(docker inspect --format '{{.Image}}' wwf-api) || exit 1
if ! docker image inspect --format '{{join .RepoDigests " "}}' "\$running" | grep -q "@\$expected"; then
  echo "wwf-api is healthy but running \$running, not \$expected" >&2
  exit 1
fi
echo "wwf-api is healthy on \$expected"
EOF
ENCODED=$(printf '%s\n' "$REMOTE_SCRIPT" | base64 | tr -d '\n')
PARAMS=$(mktemp)
trap 'rm -f "$PARAMS"' EXIT
printf '{"commands":["echo %s | base64 -d | bash"],"executionTimeout":["%s"]}\n' \
  "$ENCODED" "$RESTART_TIMEOUT" > "$PARAMS"

for INSTANCE_ID in $INSTANCE_IDS; do
  echo "Server $INSTANCE_ID is running; restarting the app on the new image..."
  COMMAND_ID=$(aws ssm send-command --region "$REGION" --instance-ids "$INSTANCE_ID" \
    --document-name AWS-RunShellScript \
    --comment "WordSquad deploy" \
    --parameters "file://$PARAMS" \
    --query 'Command.CommandId' --output text)

  STATUS=Pending
  DEADLINE=$(( $(date +%s) + RESTART_TIMEOUT + 60 ))
  while :; do
    STATUS=$(aws ssm get-command-invocation --region "$REGION" \
      --command-id "$COMMAND_ID" --instance-id "$INSTANCE_ID" \
      --query Status --output text 2> /dev/null || echo Pending)
    case "$STATUS" in
      Pending|InProgress|Delayed) ;;
      *) break ;;
    esac
    if [ "$(date +%s)" -ge "$DEADLINE" ]; then
      STATUS="TimedOut (gave up waiting)"
      break
    fi
    sleep "$POLL_SECONDS"
  done

  OUTPUT=$(aws ssm get-command-invocation --region "$REGION" \
    --command-id "$COMMAND_ID" --instance-id "$INSTANCE_ID" \
    --query '[StandardOutputContent, StandardErrorContent]' --output text 2> /dev/null || true)
  [ -n "$OUTPUT" ] && printf '%s\n' "$OUTPUT"
  if [ "$STATUS" != "Success" ]; then
    echo "Deploy FAILED: restart on $INSTANCE_ID ended with status $STATUS (SSM command $COMMAND_ID)." >&2
    echo "The previous version may still be running, or the API may be down." >&2
    exit 1
  fi
done

if [ -n "$DOMAIN" ]; then
  verify_live_assets "https://$DOMAIN"
fi
echo "Done."
