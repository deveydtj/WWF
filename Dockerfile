FROM python:3.12-slim
ARG WORD_LIST_PATH=/app/data/sgb-words.txt
ARG DEFN_CACHE_PATH=/app/data/offline_definitions.json
WORKDIR /app

# Create data directory first
RUN mkdir -p /app/data

# Copy requirements and install dependencies with SSL workaround
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir --trusted-host pypi.org --trusted-host pypi.python.org --trusted-host files.pythonhosted.org -r backend/requirements.txt

# Copy application files
COPY backend/ backend/
COPY data/sgb-words.txt /app/data/sgb-words.txt
COPY data/offline_definitions.json /app/data/offline_definitions.json

# Create static directory if it doesn't exist
RUN mkdir -p backend/static

ENV PYTHONUNBUFFERED=1 \
    WORD_LIST_PATH=${WORD_LIST_PATH} \
    DEFN_CACHE_PATH=${DEFN_CACHE_PATH}

EXPOSE 5001
CMD ["gunicorn", "-k", "gevent", "--timeout", "0", "-b", "0.0.0.0:5001", "backend.server:app"]
