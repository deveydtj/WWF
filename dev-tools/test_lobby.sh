#!/bin/bash
# Simple wrapper script for running a test lobby

set -e

echo "🎮 WordSquad Test Lobby Runner"
echo "================================"
echo

# Check if Python script exists
if [ ! -f "dev-tools/run_test_lobby.py" ]; then
    echo "❌ Error: dev-tools/run_test_lobby.py not found"
    echo "Make sure you're running this from the WordSquad repository root"
    exit 1
fi

# Check Python version
if ! python3 -c "import sys; exit(0 if sys.version_info >= (3, 12) else 1)"; then
    echo "❌ Error: Python 3.12+ required"
    exit 1
fi

# Check if dependencies are installed
if ! python3 -c "import flask, flask_cors" 2>/dev/null; then
    echo "📦 Installing Python dependencies..."
    pip install -r backend/requirements.txt
fi

echo "🚀 Starting test lobby..."
echo
python3 dev-tools/run_test_lobby.py