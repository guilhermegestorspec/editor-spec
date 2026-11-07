// Conversas com o Assistente IA (estilo chat), uma pasta de trabalho por conversa.
// Cada mensagem da pessoa vira um "turno" do Claude Agent SDK, retomando a mesma sessão,
// então o assistente lembra do que já fez e dos arquivos que já gerou.
import fs from "node:fs";
import path from "node:path";
import { db, DATA_DIR, ROOT } from "./db.js";
import * as storage from "./storage.js";

const MODELO = process.env.CLAUDE_MODEL || "claude-opus-5-5";
const ORCAMENTO = Number(process.env.IA_ORCAMENTO_USD || 5); // por mensagem
const SIMULTANEAS = Number(process.env.IA_CONVERSAS_SIMULTANEAS || 2);
const CONFIG_CLAUDE = path.join(DATA_DIR, "claude"); // sessões do SDK sobrevivem a reinícios (com disco)

db.exec(`
CREATE TABLE IF NOT EXISTS conversas (
  id INTEGER PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL DEFAULT 'Nova conversa',
  sessao TEXT,
  status TEXT NOT NULL DEFAULT 'ociosa',
  custo REAL NOT NULL DEFAULT 0,
  criado_por INTEGER REFERENCES users(id) ON DELETE SET NULL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS mensagens (
  id INTEGER PRIMARY KEY,
  conversa_id INTEGER NOT NULL REFERENCES conversas(id) ON DELETE CASCADE,
  papel TEXT NOT NULL,           -- usuario | assistente | atividade | arquivos | erro
  texto TEXT NOT NULL DEFAULT '',
  dados TEXT,                    -- JSON (ids de arquivos, autor...)
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mensagens_conversa ON mensagens(conversa_id, id);
`);
db.prepare("UPDATE conversas SET status = 'ociosa' WHERE status <> 'ociosa'").run(); // reinício no meio de um turno

const ativos = new Map(); // conversaId -> { q, parar }
const fila = [];

export const dirConversa = (id) => path.join(DATA_DIR, "conversas", String(id));

function addMsg(conversaId, papel, texto, dados) {
  const r = db
    .prepare("INSERT INTO mensagens (conversa_id, papel, texto, dados) VALUES (?,?,?,?)")
    .run(conversaId, papel, texto || "", dados ? JSON.stringify(dados) : null);
  db.prepare("UPDATE conversas SET atualizado_em = datetime('now') WHERE id = ?").run(conversaId);
  return Number(r.lastInsertRowid);
}

export function criarConversa(clienteId, userId) {
  const r = db.prepare("INSERT INTO conversas (cliente_id, criado_por) VALUES (?, ?)").run(clienteId, userId);
  return Number(r.lastInsertRowid);
}

export function listarConversas(clienteId) {
  return db
    .prepare(
      `SELECT c.id, c.titulo, c.status, c.custo, c.atualizado_em, u.nome AS autor
       FROM conversas c LEFT JOIN users u ON u.id = c.criado_por WHERE c.cliente_id = ? ORDER BY c.atualizado_em DESC`
    )
    .all(clienteId);
}

export function lerConversa(id, desde = 0) {
  const c = db.prepare("SELECT * FROM conversas WHERE id = ?").get(id);
  if (!c) return null;
  const msgs = db.prepare("SELECT id, papel, texto, dados, criado_em FROM mensagens WHERE conversa_id = ? AND id > ? ORDER BY id").all(id, desde);
  return { conversa: c, mensagens: msgs.map((m) => ({ ...m, dados: m.dados ? JSON.parse(m.dados) : null })) };
}

export function excluirConversa(id) {
  parar(id);
  db.prepare("DELETE FROM conversas WHERE id = ?").run(id);
  fs.rmSync(dirConversa(id), { recursive: true, force: true });
}

export function parar(id) {
  const i = fila.findIndex((f) => f.conversaId === id);
  if (i >= 0) {
    fila.splice(i, 1);
    db.prepare("UPDATE conversas SET status = 'ociosa' WHERE id = ?").run(id);
    addMsg(id, "erro", "Pedido cancelado antes de começar.");
  }
  const a = ativos.get(id);
  if (a) a.parar();
}

// Recebe uma mensagem da pessoa e agenda o turno do assistente.
export function enviarMensagem({ conversaId, texto, arquivoIds = [], user }) {
  const c = db.prepare("SELECT * FROM conversas WHERE id = ?").get(conversaId);
  if (!c) throw new Error("Conversa não encontrada.");
  if (c.status !== "ociosa") throw new Error("O assistente ainda está trabalhando nesta conversa. Aguarde ou clique em Parar.");
  const anexos = arquivoIds.length
    ? db.prepare(`SELECT id, nome, pasta, tipo FROM arquivos WHERE cliente_id = ? AND id IN (${arquivoIds.map(() => "?").join(",")})`).all(c.cliente_id, ...arquivoIds)
    : [];
  addMsg(conversaId, "usuario", texto, { autor: user.nome, anexos });
  if (c.titulo === "Nova conversa") {
    const t = texto.replace(/\s+/g, " ").trim();
    db.prepare("UPDATE conversas SET titulo = ? WHERE id = ?").run(t.length > 60 ? t.slice(0, 57) + "…" : t, conversaId);
  }
  db.prepare("UPDATE conversas SET status = 'na_fila' WHERE id = ?").run(conversaId);
  fila.push({ conversaId, texto, anexos, userId: user.id });
  setImmediate(proximo);
}

function proximo() {
  while (ativos.size < SIMULTANEAS && fila.length) {
    const t = fila.shift();
    executarTurno(t).finally(() => setImmediate(proximo));
  }
}

function resumoFerramenta(b) {
  const i = b.input || {};
  const nomes = { Bash: "Executando", Read: "Lendo", Write: "Criando", Edit: "Editando", Glob: "Procurando", Grep: "Procurando", Skill: "Consultando a skill", WebFetch: "Abrindo", WebSearch: "Pesquisando", TodoWrite: "Organizando etapas", Task: "Delegando" };
  const alvo = i.description || i.skill || i.command || (i.file_path ? path.basename(i.file_path) : "") || i.pattern || i.url || i.query || "";
  return `${nomes[b.name] || b.name} ${String(alvo).replace(/\s+/g, " ").slice(0, 160)}`.trim();
}

async function executarTurno({ conversaId, texto, anexos, userId }) {
  const c = db.prepare("SELECT * FROM conversas WHERE id = ?").get(conversaId);
  if (!c) return;
  const cliente = db.prepare("SELECT * FROM clientes WHERE id = ?").get(c.cliente_id);
  const dir = dirConversa(conversaId);
  const entrada = path.join(dir, "entrada");
  const saida = path.join(dir, "saida");
  for (const d of [dir, entrada, saida, CONFIG_CLAUDE]) fs.mkdirSync(d, { recursive: true });
  if (!fs.existsSync(path.join(dir, ".claude"))) fs.symlinkSync(path.join(ROOT, ".claude"), path.join(dir, ".claude"));
  fs.copyFileSync(path.join(ROOT, "CLAUDE.md"), path.join(dir, "CLAUDE.md"));

  db.prepare("UPDATE conversas SET status = 'rodando' WHERE id = ?").run(conversaId);
  let abort = new AbortController();
  let q = null;
  let cancelado = false;
  ativos.set(conversaId, {
    parar: () => {
      cancelado = true;
      q?.interrupt?.().catch(() => {});
      setTimeout(() => abort.abort(), 4000);
    },
  });

  try {
    // Disponibiliza os anexos desta mensagem (baixa do Drive se preciso).
    const novos = [];
    const links = [];
    for (const a of anexos) {
      const arq = db.prepare("SELECT * FROM arquivos WHERE id = ?").get(a.id);
      if (!arq) continue;
      if (arq.tipo === "link") {
        links.push(`- ${arq.nome}: ${arq.url}`);
        continue;
      }
      const destino = path.join(entrada, `${arq.id}-${arq.nome}`);
      if (!fs.existsSync(destino)) {
        addMsg(conversaId, "atividade", `Preparando o arquivo ${arq.nome}`);
        const local = await storage.paraLocal(arq, dir);
        if (local.startsWith(dir)) fs.renameSync(local, destino);
        else fs.symlinkSync(local, destino);
      }
      novos.push(path.basename(destino));
    }

    const contexto = `
Você é o editor de vídeo e designer da agência Spec, conversando com a equipe pelo chat do Spec Studio.
Responda sempre em português do Brasil, de forma direta e amigável, como numa conversa.

Cliente: ${cliente.nome}
Nicho: ${cliente.nicho || "—"}
Cores: primária ${cliente.cor_primaria}, secundária ${cliente.cor_secundaria}, fundo ${cliente.cor_fundo}
Fonte: ${cliente.fonte || "—"}
Observações de marca: ${cliente.observacoes || "—"}

PASTAS
- Entrada (arquivos que a equipe anexou, somente leitura): ${entrada}
- Entregas: ${saida} — salve aqui TODA entrega final (vídeos .mp4, imagens .png/.jpg, legendas .srt).
  Ao fim de cada resposta, o que estiver em ${saida} vai para a biblioteca do cliente e aparece no chat.
  Arquivos de rascunho ficam em ${dir} (fora de "saida").
- Não altere ${ROOT} (o projeto do editor). Para Remotion crie um projeto aqui; para HyperFrames use "npx hyperframes init ... --non-interactive".

FERRAMENTAS: ffmpeg, yt-dlp, python3 ${path.join(ROOT, "scripts/legendar.py")} (Whisper), Remotion e HyperFrames
(binários em ${path.join(ROOT, "node_modules/.bin")}). Leia as skills (hyperframes, media-use, remotion-*) antes de montar vídeos.
Formatos: Meta Ads 1080x1920 / 1080x1350 / 1080x1080; YouTube 1920x1080; Shorts/TikTok 1080x1920. 30 fps, H.264, AAC, -14 LUFS.

LINKS DO GOOGLE DRIVE (brutos guardados só como link, ou colados na mensagem)
- Primeiro liste sem baixar: python3 ${path.join(ROOT, "scripts/drive_listar.py")} "<link>"
- Baixe SÓ o que o pedido precisa: python3 -m gdown "<link do arquivo>" -O ${path.join(dir, "drive")}/
- Se der erro de permissão, peça à equipe para deixar o link como "Qualquer pessoa com o link".

REFERÊNCIAS DE REDES SOCIAIS (Instagram, Facebook, YouTube, TikTok…)
- Baixe com: yt-dlp --js-runtimes node${fs.existsSync(path.join(DATA_DIR, "cookies.txt")) ? ` --cookies ${path.join(DATA_DIR, "cookies.txt")}` : ""} -o "${path.join(dir, "referencias")}/%(title).60s.%(ext)s" "<link>"
- Para analisar: extraia quadros (ffmpeg -i ref.mp4 -vf "fps=1/2,scale=480:-1" quadros/%03d.jpg) e veja-os com a ferramenta Read;
  transcreva a fala com o Whisper; meça duração, cortes (ffmpeg scene detection) e ritmo.
- Entregue a análise de forma prática: gancho dos 3 primeiros segundos, estrutura, ritmo de cortes, estilo de legenda,
  textos na tela, trilha/efeitos, CTA e o que dá para adaptar para o cliente.
- Se a rede bloquear o download (comum em servidores), diga isso e peça para a equipe enviar o vídeo como arquivo
  (pelo botão de anexar ou na pasta Referências).

CONVERSA
- Se o pedido estiver ambíguo em algo que muda o resultado (formato, duração, texto, público), pergunte antes de renderizar.
- Em ajustes ("deixa maior", "troca a cor"), reaproveite o que já fez nesta conversa e gere uma nova versão (nome com v2, v3…).
- Termine cada resposta dizendo em 1–3 frases o que entregou ou o que precisa da pessoa.
`;
    let prompt = texto;
    if (novos.length) prompt += `\n\n[Arquivos anexados nesta mensagem, em ${entrada}: ${novos.join(", ")}]`;
    if (links.length) prompt += `\n\n[Links do Google Drive anexados (não baixados ainda):\n${links.join("\n")}]`;

    const antes = new Set(fs.readdirSync(saida));
    // CHAT_SDK_TESTE: módulo simulado usado só em testes locais
    const { query } = await import(process.env.CHAT_SDK_TESTE || "@anthropic-ai/claude-agent-sdk");
    const opcoes = (resume) => ({
      cwd: dir,
      model: MODELO,
      settingSources: ["project"],
      skills: "all",
      systemPrompt: { type: "preset", preset: "claude_code", append: contexto },
      additionalDirectories: [path.join(ROOT, "node_modules"), path.join(ROOT, "scripts")],
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      maxTurns: Number(process.env.IA_MAX_TURNOS || 80),
      maxBudgetUsd: ORCAMENTO,
      abortController: abort,
      env: { ...process.env, CLAUDE_CONFIG_DIR: CONFIG_CLAUDE },
      ...(resume ? { resume } : {}),
    });

    const rodar = async (resume, textoPrompt) => {
      q = query({ prompt: textoPrompt, options: opcoes(resume) });
      let custo = 0;
      for await (const m of q) {
        if (m.type === "system" && m.subtype === "init" && m.session_id) {
          db.prepare("UPDATE conversas SET sessao = ? WHERE id = ?").run(m.session_id, conversaId);
        } else if (m.type === "assistant") {
          for (const b of m.message?.content || []) {
            if (b.type === "text" && b.text.trim()) addMsg(conversaId, "assistente", b.text.trim());
            if (b.type === "tool_use") addMsg(conversaId, "atividade", resumoFerramenta(b));
          }
        } else if (m.type === "result") {
          custo = m.total_cost_usd || 0;
          if (m.subtype !== "success" && !cancelado) {
            const motivo = { error_max_turns: "limite de etapas", error_max_budget_usd: "limite de custo por mensagem" }[m.subtype] || m.subtype;
            addMsg(conversaId, "erro", `O assistente parou antes de terminar (${motivo}). Você pode pedir para ele continuar.`);
          }
        }
      }
      db.prepare("UPDATE conversas SET custo = custo + ? WHERE id = ?").run(custo, conversaId);
    };

    try {
      await rodar(c.sessao, prompt);
    } catch (e) {
      if (!c.sessao || cancelado) throw e;
      // A sessão anterior se perdeu (ex.: servidor recriado): recomeça com o histórico resumido.
      const hist = db
        .prepare("SELECT papel, texto FROM mensagens WHERE conversa_id = ? AND papel IN ('usuario','assistente') ORDER BY id DESC LIMIT 20")
        .all(conversaId)
        .reverse()
        .map((m) => `${m.papel === "usuario" ? "Equipe" : "Você"}: ${m.texto.slice(0, 1500)}`)
        .join("\n\n");
      abort = new AbortController();
      await rodar(null, `Histórico desta conversa (continue a partir dele):\n\n${hist}\n\n---\nNova mensagem da equipe:\n${prompt}`);
    }

    // Entregas novas desta rodada vão para a biblioteca do cliente.
    const { registrarArquivo, tipoDoArquivo } = await import("./jobs.js");
    const ids = [];
    for (const f of fs.readdirSync(saida)) {
      const abs = path.join(saida, f);
      if (antes.has(f) || !fs.statSync(abs).isFile()) continue;
      const copia = path.join(dir, `.entrega-${Date.now()}-${f}`);
      fs.copyFileSync(abs, copia); // mantém o original em "saida" para ajustes futuros
      const pasta = tipoDoArquivo(f) === "imagem" ? "graficos" : "editados";
      ids.push(await registrarArquivo({ clienteId: c.cliente_id, pasta, origemPath: copia, nome: f, origem: "assistente IA", userId }));
    }
    if (ids.length) addMsg(conversaId, "arquivos", "", { ids });
    if (cancelado) addMsg(conversaId, "erro", "Você interrompeu o assistente.");
  } catch (e) {
    console.error(`[chat ${conversaId}]`, e);
    addMsg(conversaId, "erro", cancelado ? "Você interrompeu o assistente." : `Erro: ${String(e.message || e).slice(0, 400)}`);
  } finally {
    ativos.delete(conversaId);
    db.prepare("UPDATE conversas SET status = 'ociosa' WHERE id = ?").run(conversaId);
  }
}
