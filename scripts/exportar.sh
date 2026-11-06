#!/usr/bin/env bash
# Exporta um vídeo nos formatos de redes sociais.
# Uso: scripts/exportar.sh entrada.mp4 [vertical|horizontal|quadrado|feed|todos]
#   vertical   1080x1920 (Reels, TikTok, Shorts)
#   horizontal 1920x1080 (YouTube)
#   quadrado   1080x1080
#   feed       1080x1350 (feed do Instagram 4:5)
# Preenche com fundo desfocado em vez de cortar o conteúdo.
set -euo pipefail
in="$1"; fmt="${2:-todos}"; base="${in%.*}"
exp() {
  local nome="$1" w="$2" h="$3"
  ffmpeg -y -i "$in" -filter_complex \
    "[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},boxblur=20:5[bg];\
     [0:v]scale=${w}:${h}:force_original_aspect_ratio=decrease[fg];\
     [bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,format=yuv420p" \
    -c:v libx264 -crf 18 -preset medium -r 30 -c:a aac -b:a 192k -ar 48000 -af loudnorm=I=-14:TP=-1:LRA=11 \
    -movflags +faststart "${base}_${nome}.mp4"
  echo "OK: ${base}_${nome}.mp4"
}
case "$fmt" in
  vertical) exp vertical 1080 1920 ;;
  horizontal) exp horizontal 1920 1080 ;;
  quadrado) exp quadrado 1080 1080 ;;
  feed) exp feed 1080 1350 ;;
  todos) exp vertical 1080 1920; exp horizontal 1920 1080; exp quadrado 1080 1080; exp feed 1080 1350 ;;
  *) echo "formato desconhecido: $fmt"; exit 1 ;;
esac
