FROM python:3.11-slim
ARG WORD_LIST_PATH=/app/data/sgb-words.txt
ARG DEFN_CACHE_PATH=/app/data/offline_definitions.json
WORKDIR /app
COPY backend/ backend/
COPY backend/static/ backend/static/
COPY data/sgb-words.txt /app/data/sgb-words.txt
COPY data/offline_definitions.json /app/data/offline_definitions.json
RUN pip install --no-cache-dir -r backend/requirements.txt
ENV PYTHONUNBUFFERED=1 \
    WORD_LIST_PATH=${WORD_LIST_PATH} \
    DEFN_CACHE_PATH=${DEFN_CACHE_PATH}
EXPOSE 5000
CMD ["gunicorn", "-k", "gevent", "--timeout", "0", "-b", "0.0.0.0:5000", "backend.server:app"]
