# Spec Studio — imagem para produção (Render, Railway, Fly.io, VPS...)
FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
# FFmpeg, Python (Whisper/yt-dlp) e bibliotecas do Chrome headless usado pelo Remotion/HyperFrames
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg python3 python3-venv ca-certificates curl git \
      libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libgbm1 libasound2 libxrandr2 libxkbcommon0 \
      libxfixes3 libxcomposite1 libxdamage1 libpango-1.0-0 libcairo2 libcups2 libdrm2 \
      fonts-liberation fonts-noto-color-emoji fontconfig \
      libreoffice-writer libreoffice-calc libreoffice-impress qpdf poppler-utils pandoc \
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

# Usuário sem privilégios para rodar o sistema (o Claude Code não roda sem permissões como root)
RUN useradd --create-home --uid 10001 spec
ENV HF_HOME=/opt/hf-cache
RUN mkdir -p /opt/hf-cache && chown spec:spec /opt/hf-cache

# Pré-baixa o modelo Whisper padrão para a primeira legenda não demorar
RUN su spec -s /bin/sh -c "HF_HOME=/opt/hf-cache /opt/venv/bin/python -c \"from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8')\"" || true

ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK CMD curl -fsS http://localhost:3000/healthz || exit 1
# Começa como root só para ajustar o dono do disco /data (montado pelo provedor) e já troca para "spec".
CMD ["sh", "-c", "mkdir -p /data && find /data ! -user spec -exec chown spec:spec {} + 2>/dev/null; exec setpriv --reuid=spec --regid=spec --init-groups env HOME=/home/spec node --disable-warning=ExperimentalWarning app/start.js"]
