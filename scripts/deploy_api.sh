#!/usr/bin/env bash
# Build the API image, push it to ECR, and restart the game server if it is
# currently running. If the server is asleep, it pulls the new image the next
# time a player wakes it, so there is no need to start it just to deploy.
#
# Usage: scripts/deploy_api.sh [image-uri]
#   image-uri defaults to api_image in infra/live/variables.tfvars
#   PLATFORM=linux/amd64 scripts/deploy_api.sh   # only if you switched to x86 servers
set -euo pipefail
cd "$(dirname "$0")/.."

TFVARS=infra/live/variables.tfvars
tfvar() { sed -n "s/^$1 *= *\"\([^\"]*\)\".*/\1/p" "$TFVARS" | head -n 1; }

IMAGE="${1:-$(tfvar api_image)}"
REGION="${AWS_REGION:-$(tfvar aws_region)}"
PLATFORM="${PLATFORM:-linux/arm64}" # t4g servers are ARM (Graviton)

for cmd in aws docker npm; do
  command -v "$cmd" > /dev/null || { echo "Missing required command: $cmd" >&2; exit 1; }
done
if [ -z "$IMAGE" ] || [ -z "$REGION" ]; then
  echo "Set api_image and aws_region in $TFVARS (or pass the image URI)." >&2
  exit 1
fi

REGISTRY="${IMAGE%%/*}"
REPO="${IMAGE#*/}"
REPO="${REPO%%:*}"

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

echo "Building and pushing image..."
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REGISTRY"
docker buildx build --platform "$PLATFORM" -f docker/Dockerfile -t "$IMAGE" --push .

INSTANCE_ID=$(aws ec2 describe-instances --region "$REGION" \
  --filters "Name=tag:Name,Values=wwf-api" "Name=tag:Project,Values=WWF" "Name=instance-state-name,Values=running" \
  --query 'Reservations[].Instances[].InstanceId' --output text)

if [ -n "$INSTANCE_ID" ] && [ "$INSTANCE_ID" != "None" ]; then
  echo "Server $INSTANCE_ID is running; restarting the app to pick up the new image..."
  aws ssm send-command --region "$REGION" --instance-ids $INSTANCE_ID \
    --document-name AWS-RunShellScript \
    --comment "WordSquad deploy" \
    --parameters 'commands=["systemctl restart wwf-app"]' \
    --query 'Command.CommandId' --output text
else
  echo "Server is asleep; it will use the new image the next time it wakes up."
fi
echo "Done."
