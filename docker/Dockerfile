# Stage 1: build frontend assets
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
# Install all dependencies so the Vite bundler is available
RUN npm ci
COPY frontend/ ./
# Produce static assets under /frontend/dist. Only these files are copied
# into the runtime stage so the final image stays slim.
RUN mkdir -p /app/backend/static
RUN npm run build

# Stage 2: run Python backend
FROM python:3.12-slim
ARG WORD_LIST_PATH=/app/data/sgb-words.txt
ARG DEFN_CACHE_PATH=/app/data/offline_definitions.json
ENV PYTHONUNBUFFERED=1 \
    FLASK_APP=backend.server \
    WORD_LIST_PATH=${WORD_LIST_PATH} \
    DEFN_CACHE_PATH=${DEFN_CACHE_PATH}

# create non-root user
RUN adduser --disabled-password --gecos '' appuser && mkdir -p /app/data
WORKDIR /app

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ ./backend/
COPY data/sgb-words.txt /app/data/sgb-words.txt
COPY data/offline_definitions.json /app/data/offline_definitions.json
COPY --from=frontend-builder /app/frontend/dist/ ./backend/static/

# Ensure runtime directory exists and correct ownership for appuser
RUN chown -R appuser:appuser /app && mkdir -p /app/runtime

EXPOSE 5001
USER appuser

ENTRYPOINT ["sh", "-c", "if [ \"$FLASK_ENV\" = \"development\" ]; then flask run --reload --host=0.0.0.0 --port=5001; else flask run --host=0.0.0.0 --port=5001; fi"]
