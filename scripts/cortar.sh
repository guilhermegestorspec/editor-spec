#!/usr/bin/env bash
# Corte preciso com FFmpeg.  Uso: scripts/cortar.sh entrada.mp4 00:00:05 00:00:20 [saida.mp4]
set -euo pipefail
in="$1"; ini="$2"; fim="$3"; out="${4:-${in%.*}_corte.mp4}"
ffmpeg -y -ss "$ini" -to "$fim" -i "$in" -c:v libx264 -crf 18 -preset medium -c:a aac -b:a 192k -movflags +faststart "$out"
echo "OK: $out"
