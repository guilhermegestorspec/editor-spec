---
name: spec-studio
description: Trabalhar para um cliente da Spec usando o Spec Studio (studio.specmarketingdigital.com.br) como central - ler a memória e a marca do cliente, baixar brutos/referências/documentos, mostrar o andamento no painel de Tarefas e entregar vídeos, artes e relatórios direto na biblioteca do cliente. Use sempre que o pedido citar um cliente da Spec, "o Studio", "a biblioteca", brutos ou entregas. Não use dentro do Assistente IA do próprio Studio (lá existe scripts/biblioteca.mjs).
---

# Spec Studio ↔ Claude Code

O processamento (FFmpeg, Whisper, Remotion, HyperFrames, análises) roda **aqui**, no Claude Code.
O Spec Studio guarda clientes, memória, brutos e entregas, e avisa no celular quando algo fica pronto.

Ferramenta: `node scripts/studio.mjs <comando>` (rode na raiz do repositório).
Autenticação: chave de integração `spec_...` injetada pelo proxy do ambiente para o host
`studio.specmarketingdigital.com.br` (ou `SPEC_STUDIO_TOKEN` local). Se der 401, peça a chave com a
ferramenta `request_credential` (host `studio.specmarketingdigital.com.br`, tipo bearer); a pessoa gera a chave em
Spec Studio → Minha conta → "Gerar chave de integração". Nunca peça a chave no chat.

## Fluxo padrão de um pedido
1. `node scripts/studio.mjs cliente "<nome>"` → leia marca + memória antes de criar qualquer coisa.
2. `T=$(node scripts/studio.mjs inicio "<cliente>" "<pedido resumido>")` → aparece ao vivo em Tarefas.
3. `node scripts/studio.mjs arquivos "<cliente>" brutos` e `node scripts/studio.mjs baixar <id> referencias/<cliente>`
   (links do Drive: liste com `scripts/drive_listar.py` e baixe só o necessário com gdown).
4. A cada fase: `node scripts/studio.mjs etapa $T "Legendando com Whisper"` (curto, em português).
5. Faça o trabalho em `out/` seguindo as convenções do CLAUDE.md (formatos, -14 LUFS, H.264).
   Agilidade: uma passada de FFmpeg quando possível, Remotion/HyperFrames só para motion, proxy 1080p de brutos 4K/HEVC.
6. Entregue: `node scripts/studio.mjs enviar "<cliente>" editados out/arquivo.mp4` (imagens → `graficos`,
   planilhas/PDF/relatórios → `documentos`).
7. `node scripts/studio.mjs fim $T ok <n_entregas>` (ou `fim $T erro`) → dispara a notificação no celular.
8. Aprendeu algo durável (resultado, preferência, decisão)? Atualize a memória:
   `node scripts/studio.mjs memoria "<cliente>" > /tmp/mem.md`, edite de forma enxuta com data, e
   `node scripts/studio.mjs memoria "<cliente>" --salvar /tmp/mem.md`.

Responda em português do Brasil e termine dizendo o que foi entregue e onde (cliente/pasta).
