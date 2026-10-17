# Shared by scripts/deploy_frontend.sh and scripts/deploy_api.sh. Source it;
# it expects BUCKET and REGION to be set. Works with macOS's bash 3.2.
#
# Two releases serve the frontend: S3 serves the home page and every hashed
# /assets/* file, while the API image serves /game, /join and /age-check HTML.
# Open pages and the older release's HTML keep asking for older asset names,
# so hashed assets are published before any HTML that uses them and are never
# deleted by a deploy. They are small; S3 storage for them costs pennies a year.

# Asset paths (e.g. "assets/game-59W2Stwk.js") referenced by the given HTML.
asset_refs() {
  grep -hoE '(src|href)="/assets/[^"]+"' "$@" | sed -E 's/^(src|href)="\///; s/"$//' | sort -u
}

# Upload this build's hashed assets, keeping every older one.
publish_assets() {
  echo "Publishing hashed assets to s3://$BUCKET/assets (older assets are kept)..."
  aws s3 sync frontend/dist/assets "s3://$BUCKET/assets" --region "$REGION" --only-show-errors
}

# Fail unless every asset the built HTML references is in the bucket.
verify_assets_in_bucket() {
  local missing=0 html asset
  for html in frontend/dist/*.html; do
    for asset in $(asset_refs "$html"); do
      if ! aws s3api head-object --bucket "$BUCKET" --key "$asset" --region "$REGION" > /dev/null 2>&1; then
        echo "  missing from s3://$BUCKET: /$asset (needed by $(basename "$html"))" >&2
        missing=1
      fi
    done
  done
  if [ "$missing" -ne 0 ]; then
    echo "Asset check failed: the built pages reference files that are not published." >&2
    return 1
  fi
  echo "All assets referenced by the built pages are in s3://$BUCKET."
}

# Fetch live pages through CloudFront and confirm each asset they reference
# loads. Pages that need a running game server are skipped while it sleeps,
# so this never wakes it up.
verify_live_assets() {
  local site="$1" tmp page status missing=0 checked=0 asset
  tmp=$(mktemp -d)
  status=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$site/health" || true)
  local pages="/"
  if [ "$status" = "200" ]; then
    pages="/ /age-check /join /game"
  else
    echo "Game server is asleep (health $status); checking the home page only."
  fi
  for page in $pages; do
    # /game redirects to the age check without an eligible session; skip it then.
    status=$(curl -sS -o "$tmp/page.html" -w '%{http_code}' --max-time 20 "$site$page" || true)
    if [ "$status" != "200" ]; then
      [ "$page" = "/game" ] && [ "$status" = "302" ] && continue
      echo "  $site$page returned HTTP $status" >&2
      missing=1
      continue
    fi
    for asset in $(asset_refs "$tmp/page.html"); do
      checked=$((checked + 1))
      status=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$site/$asset" || true)
      if [ "$status" != "200" ]; then
        echo "  $site$page needs /$asset, which returned HTTP $status" >&2
        missing=1
      fi
    done
  done
  rm -rf "$tmp"
  if [ "$missing" -ne 0 ]; then
    echo "Live asset check failed." >&2
    return 1
  fi
  echo "Live pages load all $checked referenced assets."
}
