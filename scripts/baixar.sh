#!/usr/bin/env bash
# Baixa vídeo de referência com yt-dlp para ./referencias
# Uso: scripts/baixar.sh URL [--cookies cookies.txt]
# Obs.: YouTube/Instagram/TikTok costumam bloquear IPs de nuvem; use um cookies.txt
# exportado do seu navegador (logado) ou rode este script no seu computador.
set -euo pipefail
url="$1"; shift || true
mkdir -p referencias
yt-dlp --js-runtimes node -f "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b" --merge-output-format mp4 \
  -o "referencias/%(uploader|desconhecido)s - %(title).80s [%(id)s].%(ext)s" "$@" "$url"
