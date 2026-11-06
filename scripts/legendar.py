#!/usr/bin/env python3
"""Legendas automáticas com Whisper (faster-whisper).

Uso:
  python3 scripts/legendar.py video.mp4                    # gera video.srt (pt)
  python3 scripts/legendar.py video.mp4 --modelo small --idioma en
  python3 scripts/legendar.py video.mp4 --queimar          # também gera video_legendado.mp4
Modelos: tiny, base, small (padrão), medium, large-v3 (mais preciso, mais lento).
"""
import argparse, json, subprocess, sys
from pathlib import Path


def ts(s: float) -> str:
    ms = int(round(s * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    sec, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{sec:02},{ms:03}"


def main():
    p = argparse.ArgumentParser()
    p.add_argument("arquivo")
    p.add_argument("--modelo", default="small")
    p.add_argument("--idioma", default="pt")
    p.add_argument("--queimar", action="store_true", help="queima a legenda no vídeo com FFmpeg")
    a = p.parse_args()

    from faster_whisper import WhisperModel

    src = Path(a.arquivo)
    model = WhisperModel(a.modelo, device="auto", compute_type="int8")
    segs, info = model.transcribe(str(src), language=a.idioma, word_timestamps=True, vad_filter=True)

    srt, words = [], []
    for i, s in enumerate(segs, 1):
        srt.append(f"{i}\n{ts(s.start)} --> {ts(s.end)}\n{s.text.strip()}\n")
        words += [{"text": w.word.strip(), "start": w.start, "end": w.end} for w in (s.words or [])]

    out = src.with_suffix(".srt")
    out.write_text("\n".join(srt), encoding="utf-8")
    # palavras com tempo: útil para legendas animadas no Remotion/HyperFrames
    src.with_suffix(".words.json").write_text(json.dumps(words, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"OK: {out} ({len(srt)} blocos, idioma {info.language})")

    if a.queimar:
        dst = src.with_name(src.stem + "_legendado.mp4")
        style = "FontName=Arial,FontSize=14,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Alignment=2,MarginV=60"
        subprocess.run(["ffmpeg", "-y", "-i", str(src), "-vf", f"subtitles={out}:force_style='{style}'",
                        "-c:a", "copy", str(dst)], check=True)
        print(f"OK: {dst}")


if __name__ == "__main__":
    sys.exit(main())
