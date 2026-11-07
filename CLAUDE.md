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
- Assistente IA = agente de performance do cliente (primeira aba). Memória permanente por cliente (`clientes.memoria`,
  editável em "Memória do cliente"; o agente lê e atualiza `MEMORIA-DO-CLIENTE.md` a cada turno). Acesso à biblioteca
  via `scripts/biblioteca.mjs` (listar/buscar/baixar, isolado por `SPEC_CLIENTE_ID`). Skills de documentos: xlsx, pdf, docx, pptx.
- Pasta "Documentos": planilhas de resultados, relatórios, briefings, PDFs.
- Chat (`app/lib/chat.js`): conversas por cliente, uma pasta de trabalho por conversa em
  `DATA_DIR/conversas/<id>`, sessão do Claude Agent SDK retomada a cada mensagem (sessões em `DATA_DIR/claude`).
  Anexos da biblioteca ou do computador; entregas em `saida/` vão para a biblioteca e aparecem no chat. Exige `ANTHROPIC_API_KEY`.
  Botão "Analisar com IA" nos arquivos abre uma conversa já com o arquivo anexado.
- Uploads em partes de 32 MB (`/api/clientes/:id/envios`), em segundo plano no navegador; com Drive, o servidor responde ao
  receber e envia ao Drive depois (status `enviando` → `ok`).
- Tarefas = painel de produção ao vivo (`/api/atividades`): no topo o que está sendo processado agora, por cliente
  (pedidos ao Assistente IA com etapa atual, tempo, tokens e custo; tarefas da fila com a última linha do log); embaixo os
  concluídos. Cada pedido ao assistente vira uma linha em `turnos` (tokens ao vivo pelas mensagens do SDK; no fim, a diferença
  do total acumulado da sessão). Contador de itens em andamento no menu.
- Assistente: modo ⚡ Rápido (effort `medium`, padrão) ou 🧠 Detalhado (`high`). Prompt com regras de agilidade
  (uma passada de FFmpeg, Remotion só para motion, proxies 1080p, sem processos pesados em paralelo).
- Memória: `app/lib/recursos.js` lê o limite do container (cgroup) e mata o processo pesado da vez (Chrome/FFmpeg/Python)
  ao passar de 90% da RAM, para o servidor não ser derrubado (oomKilled).
- Paralelismo: tarefas e conversas rodam ao mesmo tempo, sem fila de uma por vez (padrão: 4 tarefas e 3 conversas com ≤ 3 GB;
  8 e 6 em máquinas maiores; `TAREFAS_SIMULTANEAS` / `IA_CONVERSAS_SIMULTANEAS`). Tarefa interrompida pelo vigia de memória
  recomeça sozinha (até 2 vezes). FFmpeg das tarefas em `-preset veryfast -crf 20`.
- App no celular (PWA): `manifest.webmanifest`, `sw.js`, ícones em `marca/app-*.png`. Notificações Web Push
  (`app/lib/push.js`, chaves VAPID geradas e guardadas no banco) quando um pedido ao assistente ou uma tarefa termina;
  ativar em "Minha conta" ou no aviso da aba Tarefas. No iPhone exige o app adicionado à Tela de Início (iOS 16.4+).
- Aba "Usuários e acessos" (admin): criar, bloquear, trocar papel e senha. Com `ACESSO_UNICO=<email>` o sistema fica com uma
  só conta (criada com `ADMIN_PASSWORD` na primeira subida; os demais usuários são removidos e não dá para criar outros).
- **Integração com o Claude Code** (modo atual de produção): o processamento pesado roda no Claude Code; o Studio é a central.
  Skill `.claude/skills/spec-studio` + `scripts/studio.mjs` (clientes, memória, arquivos, baixar, enviar, inicio/etapa/fim no
  painel de Tarefas). Autenticação por chave `spec_...` (Minha conta → Gerar chave; tabela `chaves_api`, só o hash é guardado;
  aceita `Authorization: Bearer`, dispensa o cabeçalho CSRF). Trabalhos aparecem em Tarefas como "Claude Code" (tabela `externos`).
- Identidade visual Spec: #222222, #00F28A, branco, fonte Ubuntu; temas escuro/claro. Logos em `app/public/marca/`.
- Armazenamento: disco local por padrão; com `DRIVE_ID` + `GOOGLE_SERVICE_ACCOUNT_JSON` usa o Drive compartilhado da Spec
  (`Spec Studio/Clientes/<Cliente>/{Brutos, Vídeos editados, Gráficos, Referências}`) e faz backup/restauração do banco em `_sistema/`.
  Guia: `docs/GOOGLE-DRIVE.md`. Código: `app/lib/drive.js` (REST + upload retomável), `app/lib/storage.js`, `app/lib/backup.js`.
- Entrada: `app/start.js` (restaura o banco do Drive, depois sobe `app/server.js`).
- Deploy: `Dockerfile` + `render.yaml`. O container roda como usuário `spec` (não root), exigência do Claude Code.
