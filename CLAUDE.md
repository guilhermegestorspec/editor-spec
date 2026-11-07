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

## Spec Studio (sistema web)
Portal da equipe em `app/` (Node 22 + Express + SQLite embutido, sem build):
- `npm start` → http://localhost:3000 (dados em `DATA_DIR`, padrão `./data`).
- Login obrigatório; sem cadastro público. Admin inicial via `ADMIN_EMAIL`/`ADMIN_PASSWORD`. Domínio restrito opcional: `SPEC_EMAIL_DOMAIN`.
- Por cliente: Brutos, Vídeos editados, Gráficos, Referências e Tarefas. "Importar por link" em todas as pastas:
  link público do Google Drive (guardar só o link — sem baixar — ou baixar tudo; pastas listadas com `scripts/drive_listar.py`
  e baixadas arquivo a arquivo com gdown) ou vídeo de redes sociais via yt-dlp.
- Assistente IA em formato de chat (`app/lib/chat.js`): conversas por cliente, uma pasta de trabalho por conversa em
  `DATA_DIR/conversas/<id>`, sessão do Claude Agent SDK retomada a cada mensagem (sessões em `DATA_DIR/claude`).
  Anexos da biblioteca ou do computador; entregas em `saida/` vão para a biblioteca e aparecem no chat. Exige `ANTHROPIC_API_KEY`.
  Botão "Analisar com IA" nos arquivos abre uma conversa já com o arquivo anexado.
- Uploads em partes de 32 MB (`/api/clientes/:id/envios`), em segundo plano no navegador; com Drive, o servidor responde ao
  receber e envia ao Drive depois (status `enviando` → `ok`).
- Aba "Usuários e acessos" (admin): criar, bloquear, trocar papel e senha.
- Identidade visual Spec: #222222, #00F28A, branco, fonte Ubuntu; temas escuro/claro. Logos em `app/public/marca/`.
- Armazenamento: disco local por padrão; com `DRIVE_ID` + `GOOGLE_SERVICE_ACCOUNT_JSON` usa o Drive compartilhado da Spec
  (`Spec Studio/Clientes/<Cliente>/{Brutos, Vídeos editados, Gráficos, Referências}`) e faz backup/restauração do banco em `_sistema/`.
  Guia: `docs/GOOGLE-DRIVE.md`. Código: `app/lib/drive.js` (REST + upload retomável), `app/lib/storage.js`, `app/lib/backup.js`.
- Entrada: `app/start.js` (restaura o banco do Drive, depois sobe `app/server.js`).
- Deploy: `Dockerfile` + `render.yaml`. O container roda como usuário `spec` (não root), exigência do Claude Code.
