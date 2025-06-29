FROM python:3.11-slim
WORKDIR /app
COPY backend/ backend/
COPY backend/static/ backend/static/
COPY sgb-words.txt .
COPY offline_definitions.json .
RUN pip install --no-cache-dir Flask Flask-Cors
ENV PYTHONUNBUFFERED=1
CMD ["python", "backend/server.py"]
