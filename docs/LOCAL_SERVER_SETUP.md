# Local Server Setup

This guide explains how to start the development server for WordSquad on your machine.

1. **Verify prerequisites**
   - Python 3.11 or newer
   - Node.js 20+
   - The dependencies listed in `backend/requirements.txt`
   - A modern web browser

   Run `./setup.sh` from the repository root to confirm Python, Node.js, and required assets are installed.

2. **Install Node dependencies**
   ```bash
   cd frontend
   npm ci
   cd ..
   ```
   This installs Cypress and the frontend build tooling in `frontend/node_modules`.

3. **Start the Flask API**
   ```bash
   python backend/server.py
   ```
   The server binds to port `5001`. Open <http://localhost:5001> after the startup logs appear. The API will serve the built frontend assets from `backend/static` or fall back to the source files in `frontend/`.

4. **Optional: Docker Compose**
   If Docker is available you can run the complete stack with:
   ```bash
   docker compose up --build
   ```
   This command builds the frontend, starts Redis if configured, and launches the Flask app at `http://localhost:5001`.
