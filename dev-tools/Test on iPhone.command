#!/bin/bash
# Rebuild the frontend, then serve WordSquad to phones on the same Wi-Fi.
set -e
cd "$(dirname "$0")/.."

echo "Building the frontend…"
(cd frontend && npm run build)

python=python3
if [[ -x .venv/bin/python ]]; then
    python=.venv/bin/python
fi

ip=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "<your-mac-ip>")
echo ""
echo "=============================================="
echo "  On your iPhone, open:  http://$ip:5001"
echo "  (same Wi-Fi as this Mac). Control-C stops."
echo "=============================================="
echo ""
exec "$python" backend/server.py
