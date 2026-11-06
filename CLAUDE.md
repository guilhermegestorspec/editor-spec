# Editor Spec — editor de vídeo oficial

Repositório usado como editor de vídeo para a Spec e seus clientes (nichos variados).
Sempre responda em português do Brasil.

## Ferramentas instaladas
| Função | Ferramenta | Como usar |
|---|---|---|
| Montagem e animação (React) | **Remotion** | `src/remotion/` · `npm run studio` · `npx remotion render src/remotion/index.ts <Comp> out/x.mp4` |
| Montagem e animação (HTML) | **HyperFrames** | projetos em `hyperframes/<nome>` · `npx hyperframes init <nome> --non-interactive` · `npx hyperframes render` |
| Cortes e exportação | **FFmpeg** | `scripts/cortar.sh`, `scripts/exportar.sh` |
| Legendas automáticas | **Whisper** (faster-whisper) | `python3 scripts/legendar.py video.mp4 [--queimar]` → `.srt` + `.words.json` |
| Baixar referências | **yt-dlp** | `scripts/baixar.sh URL [--cookies cookies.txt]` |
| Descobrir novas skills | **find-skills** | `npx skills find <termo>` |

Instalar/reinstalar tudo: `bash scripts/setup.sh`.

Skills do projeto em `.claude/skills/`: `hyperframes*`, `media-use`, `remotion-*`, `find-skills`.
Leia a skill correspondente antes de montar um vídeo com Remotion ou HyperFrames.

## Convenções
- Brutos e referências em `referencias/`; renders em `out/` (ambos fora do git).
- Cada cliente: `clientes/<cliente>/` com briefing, marca (cores, fontes, logo) e projetos.
- Formatos padrão: vertical 1080x1920 (Reels/TikTok/Shorts), horizontal 1920x1080, feed 1080x1350, quadrado 1080x1080. 30 fps, H.264, áudio AAC normalizado a -14 LUFS.
- Legendas: Whisper `small` por padrão (`large-v3` quando precisar de máxima precisão). Revisar nomes próprios.

## Observações da nuvem
- Remotion: defina `REMOTION_CHROME=/opt/pw-browsers/chromium` se o download do Chrome falhar.
- YouTube/Instagram/TikTok bloqueiam IPs de nuvem no yt-dlp: use cookies do navegador ou rode localmente. Links diretos de arquivo funcionam.
- Licença: Remotion é grátis para pessoa física e empresas de até 3 pessoas; acima disso exige licença paga (skill `remotion-license`).
