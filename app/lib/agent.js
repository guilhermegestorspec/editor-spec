// Assistente IA: roda o Claude Agent SDK com as skills do projeto
// (.claude/skills: remotion-*, hyperframes*, media-use, find-skills...)
// numa pasta isolada por tarefa.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./db.js";

const MODELO = process.env.CLAUDE_MODEL || "claude-opus-5-5";
const ORCAMENTO = Number(process.env.IA_ORCAMENTO_USD || 5);

export async function rodarAgente({ ctx, cliente, pedido, entrada, saida, listados }) {
  const { query } = await import("@anthropic-ai/claude-agent-sdk");

  // A pasta da tarefa enxerga as skills e o CLAUDE.md do editor.
  fs.symlinkSync(path.join(ROOT, ".claude"), path.join(ctx.dir, ".claude"));
  fs.copyFileSync(path.join(ROOT, "CLAUDE.md"), path.join(ctx.dir, "CLAUDE.md"));

  const contexto = `
Você é o editor de vídeo e designer da agência Spec, trabalhando para o cliente abaixo.
Responda em português do Brasil.

Cliente: ${cliente.nome}
Nicho: ${cliente.nicho || "—"}
Cores: primária ${cliente.cor_primaria}, secundária ${cliente.cor_secundaria}, fundo ${cliente.cor_fundo}
Fonte: ${cliente.fonte || "—"}
Observações de marca: ${cliente.observacoes || "—"}

Arquivos de entrada (somente leitura) em ${entrada}:
${listados.length ? listados.map((n) => "- " + n).join("\n") : "(nenhum)"}

REGRAS
- Salve TODA entrega final em ${saida} (vídeos .mp4, imagens .png/.jpg, legendas .srt). Só o que estiver lá volta para a biblioteca do cliente.
- Trabalhe dentro de ${ctx.dir}. Não altere ${ROOT} (o projeto do editor); para Remotion crie um projeto novo aqui ou use HyperFrames ("npx hyperframes init ... --non-interactive").
- Ferramentas instaladas: ffmpeg, yt-dlp, python3 ${path.join(ROOT, "scripts/legendar.py")} (Whisper), Remotion e HyperFrames (via npx, binários em ${path.join(ROOT, "node_modules/.bin")}).
- Use as skills (hyperframes, media-use, remotion-*) antes de montar vídeos. Formatos: Meta Ads 1080x1920 / 1080x1350 / 1080x1080; YouTube 1920x1080; Shorts 1080x1920.
- Ao terminar, resuma o que entregou.
`;

  ctx.log(`\n[assistente IA · ${MODELO}]\n${pedido}\n`);
  const q = query({
    prompt: pedido,
    options: {
      cwd: ctx.dir,
      model: MODELO,
      settingSources: ["project"],
      skills: "all",
      systemPrompt: { type: "preset", preset: "claude_code", append: contexto },
      additionalDirectories: [entrada, path.join(ROOT, "node_modules"), path.join(ROOT, "scripts")],
      // Servidor interno: só usuários Spec autenticados disparam tarefas.
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      maxTurns: Number(process.env.IA_MAX_TURNOS || 80),
      maxBudgetUsd: ORCAMENTO,
    },
  });

  for await (const m of q) {
    if (m.type === "assistant") {
      for (const b of m.message?.content || []) {
        if (b.type === "text" && b.text.trim()) ctx.log(`\n${b.text}\n`);
        if (b.type === "tool_use") {
          const resumo = b.input?.command || b.input?.file_path || b.input?.skill || b.input?.pattern || "";
          ctx.log(`\n› ${b.name} ${String(resumo).slice(0, 300)}\n`);
        }
      }
    } else if (m.type === "result") {
      ctx.log(`\n[fim: ${m.subtype} · custo estimado US$ ${(m.total_cost_usd || 0).toFixed(2)}]\n`);
      if (m.subtype !== "success") throw new Error(`Assistente terminou com ${m.subtype}`);
    }
  }
}
