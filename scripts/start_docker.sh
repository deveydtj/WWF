#!/usr/bin/env bash
set -e

# Start the WordSquad server in Docker after resetting the repository to the latest commit.
# This script is intended for local development on macOS or Linux.

# Determine repository root (directory containing this script)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Ensure Docker is available
if ! command -v docker >/dev/null 2>&1; then
  echo "Error: Docker is not installed or not in PATH" >&2
  exit 1
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"

echo "Cleaning local changes on branch $BRANCH..."
# Remove uncommitted changes and untracked files
git fetch origin
git reset --hard "origin/$BRANCH"
git clean -fd

echo "Bringing up Docker Compose..."
# Stop any existing containers and rebuild the stack
docker compose down --remove-orphans
docker compose up --build
