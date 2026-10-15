#!/bin/bash
set -e
cd "$(dirname "$0")"

python=python3
if [[ -x .venv/bin/python ]]; then
    python=.venv/bin/python
fi

echo "WordSquad: http://localhost:5001 (Control-C to stop)"
exec "$python" backend/server.py
