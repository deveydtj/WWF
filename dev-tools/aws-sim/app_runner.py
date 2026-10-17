"""Run the Flask app the way production does: by importing it.

Production runs ``gunicorn -k gevent backend.server:app`` inside the API
container. Gunicorn imports ``backend.server`` as a module, so the file's
``if __name__ == "__main__":`` block never runs. ``python backend/server.py``
(start-local.sh) does run that block, which hides any startup work that only
lives there. This runner imports the module exactly like gunicorn and then
serves it with Werkzeug's threaded server, for machines without gunicorn and
gevent installed.

Usage: python app_runner.py <port>
"""
import os
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO))
os.chdir(REPO)

from backend.server import app  # noqa: E402  (same import path as gunicorn)

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5001
    # threaded=True keeps long-lived SSE streams from blocking other requests,
    # standing in for gevent's cooperative workers.
    app.run(host="127.0.0.1", port=port, threaded=True, debug=False, use_reloader=False)
