FROM python:3.11-slim

# Instalar Chrome — apt resuelve sus dependencias automáticamente
RUN apt-get update && apt-get install -y \
    wget gnupg2 ca-certificates \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub \
       | gpg --dearmor > /usr/share/keyrings/google-chrome.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] \
       http://dl.google.com/linux/chrome/deb/ stable main" \
       > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY scripts/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY scripts/ ./scripts/

EXPOSE 8080

# gunicorn: 1 worker, timeout 300 s para aguantar la simulación NOAA (2-3 min)
CMD gunicorn --workers 1 --timeout 300 --bind "0.0.0.0:${PORT:-8080}" scripts.server:app
