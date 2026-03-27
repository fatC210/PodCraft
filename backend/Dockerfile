FROM python:3.11-slim

WORKDIR /app

# 安装 ffmpeg（pydub 依赖）
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# cache-bust-20260327
COPY . .

RUN mkdir -p storage data

EXPOSE 8000

CMD ["sh", "-c", "uvicorn main:app --host :: --port ${PORT:-8000}"]
