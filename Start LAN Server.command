#!/bin/bash
# Double-click to host WordSquad for phones and other devices on the same Wi-Fi.
set -e
cd "$(dirname "$0")"

# The server serves the built copy in backend/static, so rebuild first to
# pick up any frontend edits.
if command -v npm >/dev/null 2>&1 && [[ -d frontend/node_modules ]]; then
    echo "Building the frontend…"
    (cd frontend && npm run build --silent) || echo "Build failed; serving the last build."
else
    echo "npm or frontend/node_modules not found; serving the last build."
fi

# An older server left running keeps answering on port 5001 with old code
# (for example, creating public lobbies when asked for a private room).
old_pids=$(lsof -t -nP -iTCP:5001 -sTCP:LISTEN 2>/dev/null || true)
if [[ -n "$old_pids" ]]; then
    echo ""
    echo "Another server is already using port 5001 (process $(echo $old_pids | tr '\n' ' '))."
    echo "It is probably an older WordSquad still running, and phones would reach it instead."
    read -r -p "Stop it and start the new one? [Y/n] " answer
    if [[ "$answer" =~ ^[Nn] ]]; then
        echo "Leaving it running. Close this window when you're done."
        exit 1
    fi
    kill $old_pids 2>/dev/null || true
    for attempt in {1..20}; do
        lsof -nP -iTCP:5001 -sTCP:LISTEN >/dev/null 2>&1 || break
        sleep 0.25
    done
    if lsof -nP -iTCP:5001 -sTCP:LISTEN >/dev/null 2>&1; then
        echo "Port 5001 is still busy. Quit the other server, then run this again."
        read -r -p "Press Return to close..."
        exit 1
    fi
fi

python=python3
if [[ -x .venv/bin/python ]]; then
    python=.venv/bin/python
fi

ip=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)
echo ""
echo "=================================================="
echo "  WordSquad is running."
echo "  This Mac:        http://localhost:5001"
if [[ -n "$ip" ]]; then
echo "  Phones on Wi-Fi: http://$ip:5001"
fi
echo "  Press Control-C to stop."
echo "=================================================="
echo ""
"$python" backend/server.py || { echo "Server stopped with an error."; read -r -p "Press Return to close..."; }
