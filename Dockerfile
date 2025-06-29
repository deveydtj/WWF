FROM python:3.11-slim
WORKDIR /app
COPY backend/ backend/
COPY backend/static/ backend/static/
COPY sgb-words.txt .
COPY offline_definitions.json .
RUN pip install --no-cache-dir -r backend/requirements.txt
ENV PYTHONUNBUFFERED=1
EXPOSE 5000
CMD ["gunicorn", "-k", "gevent", "--timeout", "0", "-b", "0.0.0.0:5000", "backend.server:app"]
