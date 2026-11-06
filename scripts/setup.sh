#!/usr/bin/env bash
# Instala tudo do editor (idempotente). Rode na raiz do repositório: bash scripts/setup.sh
set -euo pipefail
cd "$(dirname "$0")/.."
command -v ffmpeg >/dev/null || { apt-get update -qq && apt-get install -y -qq ffmpeg; }
pip install -q -r requirements.txt
npm ci --no-audit --no-fund || npm install --no-audit --no-fund
echo "Editor Spec pronto: ffmpeg, yt-dlp, faster-whisper, remotion, hyperframes."
