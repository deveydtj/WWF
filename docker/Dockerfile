# Multi-stage build for production
FROM python:3.12-slim

# Install system dependencies including curl for health checks
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Security: Create non-root user first
RUN adduser --disabled-password --gecos '' --uid 1001 appuser

# Set up environment variables
ARG WORD_LIST_PATH=/app/data/sgb-words.txt
ARG DEFN_CACHE_PATH=/app/data/offline_definitions.json
ENV PYTHONUNBUFFERED=1 \
    FLASK_APP=backend.server \
    WORD_LIST_PATH=${WORD_LIST_PATH} \
    DEFN_CACHE_PATH=${DEFN_CACHE_PATH} \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Install dependencies as root
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir --trusted-host pypi.org --trusted-host pypi.python.org --trusted-host files.pythonhosted.org -r backend/requirements.txt

# Copy application files
COPY backend/ ./backend/
COPY frontend/ ./frontend/
COPY data/sgb-words.txt /app/data/sgb-words.txt
COPY data/offline_definitions.json /app/data/offline_definitions.json

# Create directories and set permissions
RUN mkdir -p ./backend/static/ /app/runtime /app/data && \
    chown -R appuser:appuser /app

# Copy built frontend assets
COPY frontend/dist/ ./backend/static/

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5001/health || exit 1

EXPOSE 5001
USER appuser

# Use gunicorn for production, flask dev server for development
ENTRYPOINT ["sh", "-c", "if [ \"$FLASK_ENV\" = \"development\" ]; then flask run --reload --host=0.0.0.0 --port=5001; else gunicorn -k gevent --timeout 0 -b 0.0.0.0:5001 backend.server:app; fi"]
