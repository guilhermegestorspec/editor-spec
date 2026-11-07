// Conversas com o Assistente IA (estilo chat), uma pasta de trabalho por conversa.
// Cada mensagem da pessoa vira um "turno" do Claude Agent SDK, retomando a mesma sessão,
// então o assistente lembra do que já fez e dos arquivos que já gerou.
import fs from "node:fs";
import path from "node:path";
import { db, DATA_DIR, ROOT } from "./db.js";
import * as storage from "./storage.js";
import * as push from "./push.js";
import { CPUS, RAM_GB, MAQUINA_PEQUENA, avisosMemoria } from "./recursos.js";

const MODELO = process.env.CLAUDE_MODEL || "claude-opus-5-5";
const ORCAMENTO = Number(process.env.IA_ORCAMENTO_USD || 5); // por mensagem
// Em máquina com pouca RAM, dois agentes renderizando ao mesmo tempo estouram a memória.
const SIMULTANEAS = Number(process.env.IA_CONVERSAS_SIMULTANEAS || (MAQUINA_PEQUENA ? 1 : 2));
// "rapido": direto ao ponto (padrão). "detalhado": pensa mais antes de agir.
const ESFORCO = { rapido: process.env.IA_ESFORCO_RAPIDO || "medium", detalhado: process.env.IA_ESFORCO_DETALHADO || "high" };
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
-- cada pedido ao assistente (um turno): o que está sendo feito, tokens e custo
CREATE TABLE IF NOT EXISTS turnos (
  id INTEGER PRIMARY KEY,
  conversa_id INTEGER NOT NULL REFERENCES conversas(id) ON DELETE CASCADE,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  pedido TEXT NOT NULL DEFAULT '',
  modo TEXT NOT NULL DEFAULT 'rapido',
  status TEXT NOT NULL DEFAULT 'na_fila',   -- na_fila | rodando | ok | erro | cancelado
  etapa TEXT NOT NULL DEFAULT '',
  etapas INTEGER NOT NULL DEFAULT 0,
  tokens_entrada INTEGER NOT NULL DEFAULT 0,
  tokens_cache INTEGER NOT NULL DEFAULT 0,
  tokens_saida INTEGER NOT NULL DEFAULT 0,
  custo REAL NOT NULL DEFAULT 0,
  entregas INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  iniciado_em TEXT,
  terminado_em TEXT
);
CREATE INDEX IF NOT EXISTS idx_turnos_status ON turnos(status, id);
`);
{
  const cols = db.prepare("PRAGMA table_info(conversas)").all().map((c) => c.name);
  if (!cols.includes("custo_sessao")) db.exec("ALTER TABLE conversas ADD COLUMN custo_sessao REAL NOT NULL DEFAULT 0");
  if (!cols.includes("uso_sessao")) db.exec("ALTER TABLE conversas ADD COLUMN uso_sessao TEXT");
}
// Reinício no meio de um turno (deploy ou falta de memória): avisa na conversa e libera.
for (const c of db.prepare("SELECT id FROM conversas WHERE status IN ('rodando','na_fila')").all()) {
  db.prepare("INSERT INTO mensagens (conversa_id, papel, texto) VALUES (?, 'erro', ?)").run(
    c.id,
    "O servidor reiniciou no meio deste trabalho. Mande “continue” para o assistente retomar de onde parou."
  );
}
db.prepare("UPDATE conversas SET status = 'ociosa' WHERE status <> 'ociosa'").run();
db.prepare(
  "UPDATE turnos SET status = 'erro', etapa = 'Servidor reiniciou durante o trabalho', terminado_em = datetime('now') WHERE status IN ('rodando','na_fila')"
).run();

export const MEMORIA_MODELO = (cl) => `# Memória do cliente: ${cl.nome}

## Negócio
- Nicho: ${cl.nicho || "(preencher)"}
- Produtos/serviços e ofertas principais:
- Diferenciais:
- Região de atuação:

## Público
- Perfil, dores e desejos:
- Objeções comuns:

## Marca e tom de voz
- ${cl.observacoes || "(preencher)"}
- O que evitar:

## Campanhas e resultados
(data — plataforma — objetivo — verba — resultado — aprendizado)

## Aprendizados (o que funciona / o que não funciona)

## Preferências da equipe e do cliente

## Próximos passos
`;

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
  const turno = db
    .prepare(
      `SELECT status, etapa, modo, tokens_entrada + tokens_cache + tokens_saida AS tokens, custo,
              CAST(strftime('%s','now') - strftime('%s', COALESCE(iniciado_em, criado_em)) AS INTEGER) AS decorrido
       FROM turnos WHERE conversa_id = ? ORDER BY id DESC LIMIT 1`
    )
    .get(id);
  return { conversa: c, turno, mensagens: msgs.map((m) => ({ ...m, dados: m.dados ? JSON.parse(m.dados) : null })) };
}

export function excluirConversa(id) {
  parar(id);
  db.prepare("DELETE FROM conversas WHERE id = ?").run(id);
  fs.rmSync(dirConversa(id), { recursive: true, force: true });
}

export function parar(id) {
  const i = fila.findIndex((f) => f.conversaId === id);
  if (i >= 0) {
    const [f] = fila.splice(i, 1);
    db.prepare("UPDATE turnos SET status = 'cancelado', terminado_em = datetime('now') WHERE id = ?").run(f.turnoId);
    db.prepare("UPDATE conversas SET status = 'ociosa' WHERE id = ?").run(id);
    addMsg(id, "erro", "Pedido cancelado antes de começar.");
  }
  const a = ativos.get(id);
  if (a) a.parar();
}

// Recebe uma mensagem da pessoa e agenda o turno do assistente.
export function enviarMensagem({ conversaId, texto, arquivoIds = [], user, modo = "rapido" }) {
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
  if (!ESFORCO[modo]) modo = "rapido";
  const turnoId = Number(
    db
      .prepare("INSERT INTO turnos (conversa_id, cliente_id, user_id, pedido, modo, etapa) VALUES (?,?,?,?,?,?)")
      .run(conversaId, c.cliente_id, user.id, texto.slice(0, 500), modo, ativos.size >= SIMULTANEAS ? "Aguardando outra conversa terminar" : "Começando").lastInsertRowid
  );
  fila.push({ conversaId, texto, anexos, userId: user.id, turnoId, modo });
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

async function executarTurno({ conversaId, texto, anexos, userId, turnoId, modo = "rapido" }) {
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
  db.prepare("UPDATE turnos SET status = 'rodando', etapa = 'Preparando', iniciado_em = datetime('now') WHERE id = ?").run(turnoId);
  const etapa = (t) => db.prepare("UPDATE turnos SET etapa = ?, etapas = etapas + 1 WHERE id = ?").run(String(t).slice(0, 200), turnoId);
  const inicioMemoria = Date.now();
  let resultadoFinal = "ok";
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
        etapa(`Baixando ${arq.nome} do Drive`);
        const local = await storage.paraLocal(arq, dir);
        if (local.startsWith(dir)) fs.renameSync(local, destino);
        else fs.symlinkSync(local, destino);
      }
      novos.push(path.basename(destino));
    }

    // Memória permanente do cliente: sai do banco para um arquivo que o agente lê e atualiza.
    const arqMemoria = path.join(dir, "MEMORIA-DO-CLIENTE.md");
    const memoriaAntes = db.prepare("SELECT memoria FROM clientes WHERE id = ?").get(c.cliente_id)?.memoria || MEMORIA_MODELO(cliente);
    fs.writeFileSync(arqMemoria, memoriaAntes);
    const resumoBiblioteca = db
      .prepare("SELECT pasta, COUNT(*) n FROM arquivos WHERE cliente_id = ? GROUP BY pasta")
      .all(c.cliente_id)
      .map((r) => `${r.n} em ${r.pasta}`)
      .join(", ") || "vazia";
    const B = `node ${path.join(ROOT, "scripts/biblioteca.mjs")}`;

    const contexto = `
Você é o AGENTE DE PERFORMANCE da agência Spec Marketing Digital para o cliente abaixo — o parceiro de trabalho da equipe,
no mesmo nível de um estrategista sênior de performance + editor de vídeo + designer + analista de dados.
Você conversa com a equipe da Spec pelo chat do Spec Studio. Responda sempre em português do Brasil, direto e prático.

O QUE VOCÊ FAZ (use as skills instaladas — consulte a skill antes de cada tipo de trabalho)
- Estratégia e performance: diagnóstico de campanhas (Meta Ads, Google Ads, TikTok, YouTube), análise de métricas
  (CPM, CTR, CPC, CPA, ROAS, frequência, hook rate, hold rate), hipóteses e testes A/B, plano de mídia, funil, ofertas.
- Dados: lê exportações (CSV/XLSX/PDF) de gerenciadores de anúncio e CRM, calcula indicadores, encontra o que puxa
  resultado para cima/baixo e entrega relatórios (skills xlsx, pdf, docx, pptx).
- Criação: roteiros, ganchos, copies de anúncio, legendas de post, calendário de conteúdo, criativos estáticos,
  carrosséis, thumbnails e vídeos editados (Remotion, HyperFrames, FFmpeg, Whisper — skills remotion-*, hyperframes, media-use).
- Pesquisa: concorrentes, referências, tendências (pesquisa na web quando útil) e análise de vídeos de referência.
- Organização: transforma conversas em planos, checklists e próximos passos claros.

CLIENTE
Nome: ${cliente.nome} · Nicho: ${cliente.nicho || "—"}
Cores: primária ${cliente.cor_primaria}, secundária ${cliente.cor_secundaria}, fundo ${cliente.cor_fundo} · Fonte: ${cliente.fonte || "—"}
Observações de marca: ${cliente.observacoes || "—"}

MEMÓRIA DO CLIENTE (permanente, compartilhada entre todas as conversas): ${arqMemoria}
- LEIA esse arquivo no início de cada conversa. Ele tem o que já sabemos: negócio, público, ofertas, tom de voz,
  histórico de campanhas e resultados, aprendizados, preferências da equipe e do cliente.
- ATUALIZE quando aprender algo durável (resultado de campanha, decisão, preferência, dado do negócio, o que funcionou
  ou não). Edite de forma enxuta e organizada, mantendo as seções; registre a data (${new Date().toISOString().slice(0, 10)}) nos itens novos.
  Não registre conversa fiada nem dados sensíveis (senhas, documentos pessoais).

BIBLIOTECA DO CLIENTE (${resumoBiblioteca})
- Listar: ${B} listar [brutos|editados|graficos|referencias|documentos]   ·   Buscar: ${B} buscar "<texto>"
- Trazer um arquivo para trabalhar: ${B} baixar <id> ${path.join(dir, "biblioteca")}
- Itens do tipo link do Drive: liste com python3 ${path.join(ROOT, "scripts/drive_listar.py")} "<link>" e baixe só o necessário
  com: python3 -m gdown "<link do arquivo>" -O ${path.join(dir, "drive")}/

PASTAS DE TRABALHO
- Anexos desta conversa (somente leitura): ${entrada}
- ENTREGAS: ${saida} — salve aqui todo arquivo final (vídeo, imagem, planilha, PDF, apresentação, documento).
  Ao fim de cada resposta, o que for novo em ${saida} entra na biblioteca e aparece no chat com prévia e download.
  Rascunhos ficam em ${dir}. Não altere ${ROOT} (o sistema). Para Remotion crie um projeto aqui;
  para HyperFrames use "npx hyperframes init ... --non-interactive".

FERRAMENTAS: ffmpeg, yt-dlp, python3 ${path.join(ROOT, "scripts/legendar.py")} (Whisper), Remotion, HyperFrames
(binários em ${path.join(ROOT, "node_modules/.bin")}), Python com pandas/openpyxl quando disponíveis.
Formatos: Meta Ads 1080x1920 / 1080x1350 / 1080x1080; YouTube 1920x1080; Shorts/TikTok 1080x1920; 30 fps, H.264, AAC, -14 LUFS.

REFERÊNCIAS DE REDES SOCIAIS (Instagram, Facebook, YouTube, TikTok…)
- Baixe com: yt-dlp --js-runtimes node${fs.existsSync(path.join(DATA_DIR, "cookies.txt")) ? ` --cookies ${path.join(DATA_DIR, "cookies.txt")}` : ""} -o "${path.join(dir, "referencias")}/%(title).60s.%(ext)s" "<link>"
- Analise: quadros (ffmpeg -vf "fps=1/2,scale=480:-1") vistos com a ferramenta Read, fala transcrita com Whisper,
  cortes por detecção de cena. Entregue: gancho dos 3 primeiros segundos, estrutura, ritmo, legendas, textos na tela,
  trilha/efeitos, CTA e o que adaptar para o cliente.
- Se a rede bloquear o download (comum em servidores), diga isso e peça o vídeo como arquivo.

AGILIDADE (prioridade: entregar rápido e bem feito, sem rodeios)
- Pedido claro = execute direto. Só pergunte quando faltar algo que muda o resultado. Não descreva planos longos antes de agir.
- Consulte só a parte da skill que precisa (não leia skills inteiras nem a documentação toda) e rode comandos independentes em paralelo.
- Vídeo: prefira UMA passada de FFmpeg (cortes, reenquadre, legenda queimada, trilha, loudnorm) com -preset veryfast -crf 21.
  Use Remotion/HyperFrames só quando o pedido pedir animação/motion de verdade, e então renderize com --concurrency=${Math.max(1, Math.min(CPUS, MAQUINA_PEQUENA ? 1 : CPUS))}
  e no máximo 1080p. Confira o resultado com 3–4 quadros extraídos, não assistindo/renderizando de novo.
- Legendas: Whisper "small" (rápido); "large-v3" só se pedirem precisão máxima. Transcreva uma vez e reaproveite o .srt/.words.json.
- Trabalhe com proxies: se o bruto for 4K/HEVC (iPhone), converta antes para 1080p H.264 e use essa cópia em tudo.
- MÁQUINA: ${CPUS} CPU(s) e ${RAM_GB} GB de RAM. ${MAQUINA_PEQUENA ? "Pouca memória: NUNCA rode dois processos pesados ao mesmo tempo (render + Whisper, dois FFmpeg, Chrome + LibreOffice). " : ""}Se um processo for encerrado por falta de memória, refaça com menos paralelismo/resolução menor em vez de repetir igual.

COMO TRABALHAR
- Seja proativo como um bom estrategista: aponte riscos, oportunidades e o próximo passo, sem enrolar.
- Se faltar algo que muda o resultado (objetivo, verba, formato, público, prazo), pergunte antes de executar trabalho pesado.
- Números: mostre a conta e a fonte; não invente métricas. Separe fato, hipótese e recomendação.
- Em ajustes, reaproveite o que já fez nesta conversa e entregue nova versão (v2, v3…).
- Termine cada resposta com o que foi entregue e/ou o que você precisa da equipe.
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
      effort: ESFORCO[modo] || ESFORCO.rapido,
      abortController: abort,
      env: { ...process.env, CLAUDE_CONFIG_DIR: CONFIG_CLAUDE, SPEC_CLIENTE_ID: String(c.cliente_id), DATA_DIR },
      ...(resume ? { resume } : {}),
    });

    // Tokens e custo: ao vivo pelas mensagens do modelo; no fim, o total oficial do SDK.
    // O total do SDK é acumulado na sessão (inclui turnos anteriores ao retomar), então guardamos a diferença.
    const rodar = async (resume, textoPrompt) => {
      q = query({ prompt: textoPrompt, options: opcoes(resume) });
      const porMensagem = new Map();
      let ultimaGravacao = 0;
      const gravarAoVivo = (forcar) => {
        if (!forcar && Date.now() - ultimaGravacao < 2000) return;
        ultimaGravacao = Date.now();
        let ent = 0, cache = 0, sai = 0;
        for (const u of porMensagem.values()) {
          ent += u.input_tokens || 0;
          cache += (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
          sai += u.output_tokens || 0;
        }
        db.prepare("UPDATE turnos SET tokens_entrada = ?, tokens_cache = ?, tokens_saida = ? WHERE id = ?").run(ent, cache, sai, turnoId);
      };
      for await (const m of q) {
        if (m.type === "system" && m.subtype === "init" && m.session_id) {
          db.prepare("UPDATE conversas SET sessao = ? WHERE id = ?").run(m.session_id, conversaId);
          etapa("Pensando");
        } else if (m.type === "assistant") {
          if (m.message?.id && m.message.usage) porMensagem.set(m.message.id, m.message.usage);
          for (const b of m.message?.content || []) {
            if (b.type === "text" && b.text.trim()) {
              addMsg(conversaId, "assistente", b.text.trim());
              etapa("Escrevendo a resposta");
            }
            if (b.type === "tool_use") {
              const r = resumoFerramenta(b);
              addMsg(conversaId, "atividade", r);
              etapa(m.parent_tool_use_id ? `Subtarefa: ${r}` : r);
            }
          }
          gravarAoVivo(false);
        } else if (m.type === "result") {
          const ant = db.prepare("SELECT custo_sessao, uso_sessao FROM conversas WHERE id = ?").get(conversaId);
          const base = resume ? { custo: ant.custo_sessao || 0, ...(ant.uso_sessao ? JSON.parse(ant.uso_sessao) : {}) } : { custo: 0 };
          const total = { custo: m.total_cost_usd || 0, ent: 0, cache: 0, sai: 0 };
          for (const u of Object.values(m.modelUsage || {})) {
            total.ent += u.inputTokens || 0;
            total.cache += (u.cacheReadInputTokens || 0) + (u.cacheCreationInputTokens || 0);
            total.sai += u.outputTokens || 0;
          }
          const dif = (k) => (total[k] >= (base[k] || 0) ? total[k] - (base[k] || 0) : total[k]);
          if (total.ent + total.cache + total.sai > 0) {
            db.prepare("UPDATE turnos SET tokens_entrada = ?, tokens_cache = ?, tokens_saida = ?, custo = custo + ? WHERE id = ?").run(
              dif("ent"), dif("cache"), dif("sai"), dif("custo"), turnoId
            );
          } else {
            gravarAoVivo(true);
            db.prepare("UPDATE turnos SET custo = custo + ? WHERE id = ?").run(dif("custo"), turnoId);
          }
          db.prepare("UPDATE conversas SET custo = custo + ?, custo_sessao = ?, uso_sessao = ? WHERE id = ?").run(
            dif("custo"), total.custo, JSON.stringify({ ent: total.ent, cache: total.cache, sai: total.sai }), conversaId
          );
          if (m.subtype !== "success" && !cancelado) {
            resultadoFinal = "erro";
            const motivo = { error_max_turns: "limite de etapas", error_max_budget_usd: "limite de custo por mensagem" }[m.subtype] || m.subtype;
            addMsg(conversaId, "erro", `O assistente parou antes de terminar (${motivo}). Você pode pedir para ele continuar.`);
          }
        }
      }
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
      etapa("Retomando a conversa");
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
    db.prepare("UPDATE turnos SET entregas = ? WHERE id = ?").run(ids.length, turnoId);
    // memória atualizada pelo agente volta para o banco (e para o backup no Drive)
    const memoriaDepois = fs.existsSync(arqMemoria) ? fs.readFileSync(arqMemoria, "utf8") : memoriaAntes;
    if (memoriaDepois.trim() && memoriaDepois !== memoriaAntes) {
      db.prepare("UPDATE clientes SET memoria = ? WHERE id = ?").run(memoriaDepois.slice(0, 200000), c.cliente_id);
      addMsg(conversaId, "atividade", "Memória do cliente atualizada");
    }
    if (cancelado) addMsg(conversaId, "erro", "Você interrompeu o assistente.");
    const mortos = avisosMemoria.filter((a) => a.quando >= inicioMemoria);
    if (mortos.length) addMsg(conversaId, "atividade", `Proteção de memória acionada ${mortos.length}x (um processo pesado foi encerrado para o servidor não cair)`);
  } catch (e) {
    resultadoFinal = "erro";
    console.error(`[chat ${conversaId}]`, e);
    addMsg(conversaId, "erro", cancelado ? "Você interrompeu o assistente." : `Erro: ${String(e.message || e).slice(0, 400)}`);
  } finally {
    ativos.delete(conversaId);
    db.prepare("UPDATE conversas SET status = 'ociosa' WHERE id = ?").run(conversaId);
    const final = cancelado ? "cancelado" : resultadoFinal;
    db.prepare("UPDATE turnos SET status = ?, etapa = ?, terminado_em = datetime('now') WHERE id = ?").run(
      final, { ok: "Concluído", erro: "Parou com erro", cancelado: "Interrompido" }[final], turnoId
    );
    if (!cancelado) {
      const t = db.prepare("SELECT t.entregas, c.titulo, cl.nome FROM turnos t JOIN conversas c ON c.id = t.conversa_id JOIN clientes cl ON cl.id = t.cliente_id WHERE t.id = ?").get(turnoId);
      const resp = db.prepare("SELECT texto FROM mensagens WHERE conversa_id = ? AND papel = 'assistente' ORDER BY id DESC LIMIT 1").get(conversaId)?.texto || "";
      push.notificar(userId, {
        titulo: `${final === "ok" ? "✅" : "⚠️"} ${t?.nome || "Cliente"}: ${final === "ok" ? "assistente terminou" : "assistente parou"}`,
        corpo: (t?.entregas ? `${t.entregas} arquivo(s) entregue(s). ` : "") + resp.replace(/[#*_`>]/g, "").replace(/\s+/g, " ").slice(0, 180),
        url: `/#/cliente/${c.cliente_id}/ia/${conversaId}`,
        tag: `conversa-${conversaId}`,
      }).catch(() => {});
    }
  }
}
