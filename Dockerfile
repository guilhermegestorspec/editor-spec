# Spec Studio — imagem para produção (Render, Railway, Fly.io, VPS...)
FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
# FFmpeg, Python (Whisper/yt-dlp) e bibliotecas do Chrome headless usado pelo Remotion/HyperFrames
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg python3 python3-venv ca-certificates curl git \
      libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libgbm1 libasound2 libxrandr2 libxkbcommon0 \
      libxfixes3 libxcomposite1 libxdamage1 libpango-1.0-0 libcairo2 libcups2 libdrm2 \
      fonts-liberation fonts-noto-color-emoji fontconfig \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python em venv (Whisper + yt-dlp)
COPY requirements.txt ./
RUN python3 -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir -r requirements.txt
ENV PATH="/opt/venv/bin:$PATH" PYTHON=/opt/venv/bin/python

# Node
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npx remotion browser ensure

# Fonte Ubuntu (identidade Spec) disponível também para os renders
COPY app/public/fontes /usr/share/fonts/ubuntu
RUN fc-cache -f >/dev/null

COPY . .

# Pré-baixa o modelo Whisper padrão para a primeira legenda não demorar
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8')" || true

ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK CMD curl -fsS http://localhost:3000/healthz || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "app/server.js"]
