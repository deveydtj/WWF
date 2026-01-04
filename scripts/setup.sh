#!/usr/bin/env bash
set -e

# Simple environment validation for WordSquad development

check_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: $1 is not installed or not in PATH" >&2
    exit 1
  fi
}

check_python_packages() {
  missing=()
  while read -r pkg; do
    pkg="${pkg%%==*}"
    if ! python3 -m pip show "$pkg" >/dev/null 2>&1; then
      missing+=("$pkg")
    fi
  done < backend/requirements.txt
  if [ ${#missing[@]} -ne 0 ]; then
    echo "Warning: missing Python packages: ${missing[*]}" >&2
  fi
}

echo "Checking Python..."
check_cmd python3
py_version=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
if [[ $(python3 -c 'import sys;print(sys.version_info<(3,11))') == "True" ]]; then
  echo "Python 3.11+ required (found $py_version)" >&2
  exit 1
fi
check_python_packages

echo "Checking Node.js..."
check_cmd node
node_version=$(node --version | tr -d 'v')
node_major=${node_version%%.*}
if [ "$node_major" -lt 20 ]; then
  echo "Node.js 20+ required (found $node_version)" >&2
  exit 1
fi

echo "Checking asset files..."
for f in data/sgb-words.txt data/offline_definitions.json frontend/game.html; do
  if [ ! -f "$f" ]; then
    echo "Missing required asset: $f" >&2
    exit 1
  fi
done

echo "Environment looks good."
