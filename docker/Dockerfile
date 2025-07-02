# Stage 1: build frontend assets
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
# Install all dependencies so the Vite bundler is available
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: run Python backend
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 \
    FLASK_APP=backend.server

# create non-root user
RUN adduser --disabled-password --gecos '' appuser && mkdir -p /app
WORKDIR /app

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ ./backend/
COPY data/sgb-words.txt ./sgb-words.txt
COPY data/offline_definitions.json ./offline_definitions.json
COPY --from=frontend-builder /app/frontend/dist/ ./backend/static/

EXPOSE 5001
USER appuser

ENTRYPOINT ["sh", "-c", "if [ \"$FLASK_ENV\" = \"development\" ]; then flask run --reload --host=0.0.0.0 --port=5001; else flask run --host=0.0.0.0 --port=5001; fi"]
