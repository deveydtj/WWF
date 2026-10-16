#!/usr/bin/env bash
# Build the static frontend, upload it to the S3 bucket and refresh CloudFront.
# Works whether the game server is awake or asleep (S3 is always on).
#
# Usage: scripts/deploy_frontend.sh
#   CF_DISTRIBUTION_ID=E123... scripts/deploy_frontend.sh   # skip the terraform lookup
set -euo pipefail
cd "$(dirname "$0")/.."

TFVARS=infra/live/variables.tfvars
tfvar() { sed -n "s/^$1 *= *\"\([^\"]*\)\".*/\1/p" "$TFVARS" | head -n 1; }

BUCKET="${FRONTEND_BUCKET:-$(tfvar frontend_bucket)}"
REGION="${AWS_REGION:-$(tfvar aws_region)}"

for cmd in aws npm; do
  command -v "$cmd" > /dev/null || { echo "Missing required command: $cmd" >&2; exit 1; }
done

DIST_ID="${CF_DISTRIBUTION_ID:-}"
if [ -z "$DIST_ID" ]; then
  DIST_ID=$(cd infra/terraform && terraform output -raw cloudfront_distribution_id 2> /dev/null || true)
fi
if [ -z "$BUCKET" ] || [ -z "$DIST_ID" ]; then
  echo "Need frontend_bucket in $TFVARS and a CloudFront distribution ID" >&2
  echo "(set CF_DISTRIBUTION_ID or run after terraform apply)." >&2
  exit 1
fi

echo "Building frontend..."
(cd frontend && npm run build)

if [ ! -f frontend/dist/waking.html ]; then
  echo "frontend/dist/waking.html is missing; CloudFront needs it while the server sleeps." >&2
  exit 1
fi

echo "Uploading to s3://$BUCKET ..."
# donations.json is written by the donations Lambda; never delete or overwrite it.
aws s3 sync frontend/dist "s3://$BUCKET" --region "$REGION" --delete --exclude donations.json

# One "/*" path counts as a single invalidation (the first 1,000/month are free).
echo "Refreshing CloudFront cache..."
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*" \
  --query 'Invalidation.Id' --output text
echo "Done."
