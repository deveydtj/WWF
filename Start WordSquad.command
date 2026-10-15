#!/bin/bash
set -e
cd "$(dirname "$0")"

python=python3
if [[ -x .venv/bin/python ]]; then
    python=.venv/bin/python
fi

url=http://localhost:5001
echo "Starting WordSquad at $url. Press Control-C to stop."
"$python" backend/server.py &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

for attempt in {1..60}; do
    if ! kill -0 "$server_pid" 2>/dev/null; then
        echo "Server could not start. Check the error above."
        read -r -p "Press Return to close..."
        exit 1
    fi
    if curl --fail --silent --output /dev/null --max-time 1 "$url"; then
        open "$url"
        wait "$server_pid"
        exit $?
    fi
    sleep 0.5
done

echo "Server did not become ready. Check the output above."
read -r -p "Press Return to close..."
exit 1
