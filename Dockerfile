FROM python:3.11-slim

# Dependencias del sistema + Google Chrome
RUN apt-get update && apt-get install -y \
    wget gnupg2 curl unzip \
    fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 \
    libcups2 libdbus-1-3 libgdk-pixbuf2.0-0 libnspr4 libnss3 \
    libx11-xcb1 libxcomposite1 libxdamage1 libxrandr2 libxss1 \
    libxtst6 xdg-utils ca-certificates \
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

# Selenium 4.6+ descarga ChromeDriver automáticamente (selenium-manager)
RUN python -c "from selenium import webdriver; from selenium.webdriver.chrome.options import Options; \
    o=Options(); o.add_argument('--headless=new'); o.add_argument('--no-sandbox'); \
    o.add_argument('--disable-dev-shm-usage'); d=webdriver.Chrome(options=o); d.quit(); \
    print('ChromeDriver OK')"

COPY scripts/ ./scripts/

EXPOSE 8080

CMD ["python", "scripts/server.py"]
