# Multi-stage build for production
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
RUN pip install --no-cache-dir --trusted-host pypi.org --trusted-host pypi.python.org --trusted-host files.pythonhosted.org -r backend/requirements.txt

COPY backend/ ./backend/
COPY frontend/ ./frontend/
COPY data/sgb-words.txt /app/data/sgb-words.txt
COPY data/offline_definitions.json /app/data/offline_definitions.json

# Create static directory 
RUN mkdir -p ./backend/static/
# Copy frontend built assets if they exist - the server will fall back to dev assets if this fails
RUN if [ -d "./frontend/dist" ]; then cp -r ./frontend/dist/* ./backend/static/; else echo "No built frontend assets found, server will use dev assets"; fi

# Ensure runtime directory exists and correct ownership for appuser
RUN chown -R appuser:appuser /app && mkdir -p /app/runtime

EXPOSE 5001
USER appuser

ENTRYPOINT ["sh", "-c", "if [ \"$FLASK_ENV\" = \"development\" ]; then flask run --reload --host=0.0.0.0 --port=5001; else flask run --host=0.0.0.0 --port=5001; fi"]
