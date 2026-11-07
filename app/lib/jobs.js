// Fila de tarefas: cortes, exportação, legendas, downloads, peças gráficas e IA.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { db, DATA_DIR, ROOT } from "./db.js";
import { FORMATOS_VIDEO, FORMATOS_GRAFICO, MODELOS_WHISPER } from "./presets.js";
import { rodarAgente } from "./agent.js";
import * as storage from "./storage.js";
import * as push from "./push.js";

const PY = process.env.PYTHON || "python3";
const BIN = path.join(ROOT, "node_modules", ".bin");
const CONCORRENCIA = Number(process.env.TAREFAS_SIMULTANEAS || 1);
const MAX_LOG = 40_000;

export const TIPOS = ["cortar", "exportar", "legendar", "baixar", "grafico", "ia"];

const VIDEO_EXT = new Set([".mp4", ".mov", ".webm", ".mkv", ".m4v", ".avi"]);
const IMG_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);
const AUDIO_EXT = new Set([".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"]);

export function tipoDoArquivo(nome) {
  const ext = path.extname(nome).toLowerCase();
  if (VIDEO_EXT.has(ext)) return "video";
  if (IMG_EXT.has(ext)) return "imagem";
  if (AUDIO_EXT.has(ext)) return "audio";
  return "outro";
}

export function nomeSeguro(nome) {
  const base = path.basename(String(nome)).normalize("NFKD").replace(/[̀-ͯ]/g, "");
  return base.replace(/[^\w.\-() ]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 150) || "arquivo";
}

// `adiado`: responde na hora e manda ao Drive em segundo plano (usado nos uploads do navegador).
export async function registrarArquivo({ clienteId, pasta, origemPath, nome, origem, userId, adiado = false }) {
  const final = storage.nomeLivreLocal(clienteId, pasta, nomeSeguro(nome || path.basename(origemPath)));
  const emSegundoPlano = adiado && storage.usarEnvioAdiado();
  const { caminho, drive_id = null, tamanho } = emSegundoPlano
    ? storage.guardarPendente({ origemPath, nome: final })
    : await storage.guardar({ clienteId, pasta, origemPath, nome: final });
  const r = db
    .prepare(
      "INSERT INTO arquivos (cliente_id, pasta, nome, caminho, drive_id, tipo, tamanho, origem, criado_por, status) VALUES (?,?,?,?,?,?,?,?,?,?)"
    )
    .run(clienteId, pasta, final, caminho, drive_id, tipoDoArquivo(final), tamanho, origem || null, userId || null, emSegundoPlano ? "enviando" : "ok");
  const id = Number(r.lastInsertRowid);
  if (emSegundoPlano) storage.agendarEnvioDrive(id);
  return id;
}

function pegarArquivo(id, clienteId) {
  const a = db.prepare("SELECT * FROM arquivos WHERE id = ? AND cliente_id = ?").get(Number(id), clienteId);
  if (!a) throw new Error(`Arquivo ${id} não encontrado neste cliente.`);
  return a;
}

// ---------- validação de parâmetros (antes de ir para a fila) ----------
const TEMPO = /^\d{1,2}(:\d{2}){0,2}(\.\d+)?$/;

export function validarParams(tipo, p, clienteId) {
  if (!TIPOS.includes(tipo)) return "Tipo de tarefa desconhecido.";
  try {
    if (["cortar", "exportar", "legendar"].includes(tipo)) {
      const a = pegarArquivo(p.arquivo_id, clienteId);
      if (a.tipo !== "video" && !(tipo === "legendar" && a.tipo === "audio")) return "Escolha um arquivo de vídeo.";
    }
    if (tipo === "cortar" && (!TEMPO.test(p.inicio || "") || !TEMPO.test(p.fim || ""))) return "Use tempos como 00:00:05 ou 12.5.";
    if (tipo === "exportar" && !FORMATOS_VIDEO[p.formato]) return "Formato inválido.";
    if (tipo === "legendar" && p.modelo && !MODELOS_WHISPER.includes(p.modelo)) return "Modelo inválido.";
    if (tipo === "legendar" && p.idioma && !/^[a-z]{2}$/.test(p.idioma)) return "Idioma inválido (ex.: pt, en, es).";
    if (tipo === "baixar") {
      const u = new URL(p.url);
      if (!["http:", "https:"].includes(u.protocol)) return "URL inválida.";
      if (p.pasta && !["brutos", "editados", "graficos", "referencias", "documentos"].includes(p.pasta)) return "Pasta inválida.";
    }
    if (tipo === "grafico") {
      if (!FORMATOS_GRAFICO[p.formato]) return "Formato inválido.";
      if (!p.titulo) return "Informe o título.";
      if (p.imagem_id) {
        const a = pegarArquivo(p.imagem_id, clienteId);
        if (a.tipo !== "imagem") return "A imagem de fundo precisa ser uma imagem.";
      }
    }
    if (tipo === "ia") {
      if (!process.env.ANTHROPIC_API_KEY) return "Assistente IA desativado: configure ANTHROPIC_API_KEY no servidor.";
      if (!p.pedido || String(p.pedido).length < 5) return "Descreva o que deseja.";
      for (const id of p.arquivo_ids || []) pegarArquivo(id, clienteId);
    }
  } catch (e) {
    return e.message;
  }
  return null;
}

// ---------- fila ----------
let rodando = 0;

export function enfileirar({ clienteId, tipo, params, userId }) {
  const r = db
    .prepare("INSERT INTO tarefas (cliente_id, tipo, params, criado_por) VALUES (?,?,?,?)")
    .run(clienteId, tipo, JSON.stringify(params), userId);
  setImmediate(proxima);
  return Number(r.lastInsertRowid);
}

function anexarLog(id, texto) {
  db.prepare(
    `UPDATE tarefas SET log = substr(log || ?, -${MAX_LOG}) WHERE id = ?`
  ).run(texto, id);
}

async function proxima() {
  if (rodando >= CONCORRENCIA) return;
  const t = db.prepare("SELECT * FROM tarefas WHERE status='na_fila' ORDER BY id LIMIT 1").get();
  if (!t) return;
  rodando++;
  db.prepare("UPDATE tarefas SET status='rodando' WHERE id=?").run(t.id);
  const dir = path.join(DATA_DIR, "tarefas", String(t.id));
  fs.mkdirSync(dir, { recursive: true });
  const ctx = {
    id: t.id,
    dir,
    clienteId: t.cliente_id,
    userId: t.criado_por,
    params: JSON.parse(t.params),
    log: (s) => anexarLog(t.id, s),
    saidas: [],
  };
  try {
    await EXECUTORES[t.tipo](ctx);
    db.prepare("UPDATE tarefas SET status='ok', resultado=?, terminado_em=datetime('now') WHERE id=?").run(
      JSON.stringify({ arquivos: ctx.saidas }),
      t.id
    );
  } catch (e) {
    ctx.log(`\nERRO: ${e.message}\n`);
    db.prepare("UPDATE tarefas SET status='erro', resultado=?, terminado_em=datetime('now') WHERE id=?").run(
      JSON.stringify({ arquivos: ctx.saidas, erro: e.message }),
      t.id
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    const fim = db.prepare("SELECT t.status, c.nome FROM tarefas t LEFT JOIN clientes c ON c.id = t.cliente_id WHERE t.id = ?").get(t.id);
    const NOMES = { cortar: "Corte", exportar: "Exportação", legendar: "Legenda", baixar: "Download", grafico: "Peça gráfica", ia: "Tarefa de IA" };
    push.notificar(t.criado_por, {
      titulo: `${fim?.status === "ok" ? "✅" : "⚠️"} ${fim?.nome || "Cliente"}: ${NOMES[t.tipo] || t.tipo} ${fim?.status === "ok" ? "concluída" : "com erro"}`,
      corpo: ctx.saidas.length ? `${ctx.saidas.length} arquivo(s) pronto(s) na biblioteca.` : "Toque para ver os detalhes.",
      url: "/#/tarefas",
      tag: `tarefa-${t.id}`,
    }).catch(() => {});
    rodando--;
    setImmediate(proxima);
  }
}

export function retomarFila() {
  for (let i = 0; i < CONCORRENCIA; i++) setImmediate(proxima);
}

function executar(ctx, cmd, args, opts = {}) {
  ctx.log(`\n$ ${cmd} ${args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(" ")}\n`);
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: opts.cwd || ctx.dir, env: { ...process.env, ...opts.env } });
    const tratar = (b) => ctx.log(b.toString().replace(/\r/g, "\n"));
    p.stdout.on("data", tratar);
    p.stderr.on("data", tratar);
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} saiu com código ${code}`))));
  });
}

async function salvar(ctx, arquivoTemp, pasta, nome, origem) {
  ctx.log(`\n↑ guardando "${nome}" em ${storage.NOME_PASTA[pasta]}${storage.modo === "drive" ? " (Google Drive)" : ""}\n`);
  const id = await registrarArquivo({
    clienteId: ctx.clienteId,
    pasta,
    origemPath: arquivoTemp,
    nome,
    origem,
    userId: ctx.userId,
  });
  ctx.saidas.push(id);
  return id;
}

const base = (nome) => path.basename(nome, path.extname(nome));
const H264 = ["-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart"];

// ---------- links públicos do Google Drive (arquivo ou pasta) ----------
export const ehLinkDrive = (url) => /^https:\/\/(drive|docs)\.google\.com\//i.test(url) || /^https:\/\/drive\.usercontent\.google\.com\//i.test(url);

function listarArquivos(dir, prefixo = "") {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listarArquivos(abs, `${prefixo}${e.name} - `));
    else if (e.isFile()) out.push({ abs, nome: prefixo + e.name });
  }
  return out;
}

async function importarDoDrive(ctx, url, pasta) {
  const destino = path.join(ctx.dir, "drive");
  fs.mkdirSync(destino);
  const ehPasta = /\/folders\//.test(url);
  const baixarUm = (link, alvo) => executar(ctx, PY, ["-m", "gdown", "-q", "--no-cookies", "--retries", "3", link, "-O", alvo]);
  if (!ehPasta) {
    ctx.log("Importando arquivo público do Google Drive…\n");
    try {
      await baixarUm(url, destino + "/");
    } catch (e) {
      ctx.log('\nNão foi possível baixar. Confira se o link está como "Qualquer pessoa com o link". Arquivos muito acessados podem atingir o limite diário do Google.\n');
      throw e;
    }
  } else {
    ctx.log("Listando a pasta pública do Google Drive…\n");
    let lista = "";
    await new Promise((ok, falha) => {
      const p = spawn(PY, [path.join(ROOT, "scripts", "drive_listar.py"), url, "--json", "--profundidade", "4", "--limite", "1000"]);
      p.stdout.on("data", (b) => (lista += b));
      p.stderr.on("data", (b) => ctx.log(b.toString()));
      p.on("close", (c) => (c === 0 ? ok() : falha(new Error("Não foi possível listar a pasta (ela está pública?)"))));
    });
    const arquivos = JSON.parse(lista).filter((i) => i.tipo === "arquivo");
    ctx.log(`${arquivos.length} arquivo(s) encontrados.\n`);
    let falhas = 0;
    for (const [n, it] of arquivos.entries()) {
      ctx.log(`\n[${n + 1}/${arquivos.length}] ${it.caminho}\n`);
      const sub = path.join(destino, path.dirname(it.caminho));
      fs.mkdirSync(sub, { recursive: true });
      if (/docs\.google\.com\/(document|spreadsheets|presentation|forms)/.test(it.url)) {
        ctx.log("  (documento do Google: pulado)\n");
        continue;
      }
      try {
        await baixarUm(it.url, sub + "/");
      } catch {
        falhas++;
        ctx.log("  falhou — seguindo para o próximo\n");
      }
    }
    if (falhas) ctx.log(`\n${falhas} arquivo(s) não puderam ser baixados.\n`);
  }
  const arquivos = listarArquivos(destino);
  for (const { abs, nome } of arquivos) await salvar(ctx, abs, pasta, nome, "Google Drive (link)");
  if (!arquivos.length) throw new Error("Nenhum arquivo encontrado no link do Drive.");
  ctx.log(`\n${arquivos.length} arquivo(s) importado(s).\n`);
}

const EXECUTORES = {
  async cortar(ctx) {
    const { arquivo_id, inicio, fim } = ctx.params;
    const a = pegarArquivo(arquivo_id, ctx.clienteId);
    const out = path.join(ctx.dir, "corte.mp4");
    await executar(ctx, "ffmpeg", ["-y", "-ss", inicio, "-to", fim, "-i", (await storage.paraLocal(a, ctx.dir)), ...H264, out]);
    await salvar(ctx, out, "editados", `${base(a.nome)} - corte ${inicio.replace(/:/g, "")}-${fim.replace(/:/g, "")}.mp4`, `corte de #${a.id}`);
  },

  async exportar(ctx) {
    const { arquivo_id, formato, modo = "desfoque", normalizar = true } = ctx.params;
    const a = pegarArquivo(arquivo_id, ctx.clienteId);
    const { w, h, nome } = FORMATOS_VIDEO[formato];
    const vf =
      modo === "cortar"
        ? `[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1[v]`
        : `[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},boxblur=20:5[bg];` +
          `[0:v]scale=${w}:${h}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1[v]`;
    const out = path.join(ctx.dir, "export.mp4");
    const audio = normalizar ? ["-af", "loudnorm=I=-14:TP=-1:LRA=11", "-ar", "48000"] : [];
    await executar(ctx, "ffmpeg", ["-y", "-i", (await storage.paraLocal(a, ctx.dir)), "-filter_complex", vf, "-map", "[v]", "-map", "0:a?", "-r", "30", ...audio, ...H264, out]);
    await salvar(ctx, out, "editados", `${base(a.nome)} - ${formato} ${w}x${h}.mp4`, `${nome} de #${a.id}`);
  },

  async legendar(ctx) {
    const { arquivo_id, modelo = "small", idioma = "pt", queimar = false } = ctx.params;
    const a = pegarArquivo(arquivo_id, ctx.clienteId);
    const ext = path.extname(a.nome) || ".mp4";
    const src = path.join(ctx.dir, "fonte" + ext);
    fs.symlinkSync((await storage.paraLocal(a, ctx.dir)), src);
    await executar(ctx, PY, [path.join(ROOT, "scripts", "legendar.py"), src, "--modelo", modelo, "--idioma", idioma]);
    if (queimar && a.tipo === "video") {
      const style = "FontName=Arial,FontSize=14,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Alignment=2,MarginV=60";
      await executar(ctx, "ffmpeg", ["-y", "-i", src, "-vf", `subtitles=fonte.srt:force_style='${style}'`, ...H264, "legendado.mp4"]);
      await salvar(ctx, path.join(ctx.dir, "legendado.mp4"), "editados", `${base(a.nome)} - legendado.mp4`, `legenda de #${a.id}`);
    }
    await salvar(ctx, path.join(ctx.dir, "fonte.srt"), "editados", `${base(a.nome)}.srt`, `legenda de #${a.id}`);
    await salvar(ctx, path.join(ctx.dir, "fonte.words.json"), "editados", `${base(a.nome)}.palavras.json`, `legenda de #${a.id}`);
  },

  async baixar(ctx) {
    const { url, pasta = "referencias", link_id } = ctx.params;
    if (ehLinkDrive(url)) {
      await importarDoDrive(ctx, url, pasta);
      // link guardado que foi baixado de vez: o cartão de link sai e ficam os arquivos
      if (link_id) db.prepare("DELETE FROM arquivos WHERE id = ? AND cliente_id = ? AND tipo = 'link'").run(Number(link_id), ctx.clienteId);
      return;
    }
    const args = ["--js-runtimes", "node", "--no-playlist", "-f", "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b", "--merge-output-format", "mp4", "-o", "%(title).90s [%(id)s].%(ext)s"];
    const cookies = path.join(DATA_DIR, "cookies.txt");
    if (fs.existsSync(cookies)) args.push("--cookies", cookies);
    await executar(ctx, "yt-dlp", [...args, url]);
    for (const f of fs.readdirSync(ctx.dir)) {
      if (tipoDoArquivo(f) !== "outro") await salvar(ctx, path.join(ctx.dir, f), pasta, f, url);
    }
    if (!ctx.saidas.length) throw new Error("Nenhum vídeo foi baixado.");
  },

  async grafico(ctx) {
    const p = ctx.params;
    const c = db.prepare("SELECT * FROM clientes WHERE id=?").get(ctx.clienteId);
    const { w, h } = FORMATOS_GRAFICO[p.formato];
    let imagem = null;
    if (p.imagem_id) {
      const a = pegarArquivo(p.imagem_id, ctx.clienteId);
      imagem = "fundo" + path.extname(a.nome).toLowerCase();
      fs.copyFileSync((await storage.paraLocal(a, ctx.dir)), path.join(ctx.dir, imagem));
    }
    const props = {
      largura: w,
      altura: h,
      titulo: String(p.titulo).slice(0, 200),
      subtitulo: String(p.subtitulo || "").slice(0, 300),
      cta: String(p.cta || "").slice(0, 60),
      marca: c.nome,
      corPrimaria: c.cor_primaria,
      corSecundaria: c.cor_secundaria,
      corFundo: c.cor_fundo,
      fonte: c.fonte,
      imagem,
      layout: p.layout || "centro",
    };
    fs.writeFileSync(path.join(ctx.dir, "props.json"), JSON.stringify(props));
    const comum = ["src/remotion/index.ts", "Peca", `--props=${path.join(ctx.dir, "props.json")}`, `--public-dir=${ctx.dir}`];
    const env = process.env.REMOTION_CHROME ? { REMOTION_CHROME: process.env.REMOTION_CHROME } : {};
    const titulo = nomeSeguro(props.titulo).slice(0, 60);
    if (p.animado) {
      const out = path.join(ctx.dir, "peca.mp4");
      await executar(ctx, path.join(BIN, "remotion"), ["render", ...comum, out], { cwd: ROOT, env });
      await salvar(ctx, out, "editados", `${titulo} - ${p.formato} animado.mp4`, "anúncio animado (Remotion)");
    } else {
      const out = path.join(ctx.dir, "peca.png");
      await executar(ctx, path.join(BIN, "remotion"), ["still", ...comum, out, "--frame=60"], { cwd: ROOT, env });
      await salvar(ctx, out, "graficos", `${titulo} - ${p.formato}.png`, "peça gráfica (Remotion)");
    }
  },

  async ia(ctx) {
    const { pedido, arquivo_ids = [] } = ctx.params;
    const c = db.prepare("SELECT * FROM clientes WHERE id=?").get(ctx.clienteId);
    const entrada = path.join(ctx.dir, "entrada");
    const saida = path.join(ctx.dir, "saida");
    fs.mkdirSync(entrada);
    fs.mkdirSync(saida);
    const listados = [];
    for (const id of arquivo_ids) {
      const a = pegarArquivo(id, ctx.clienteId);
      const destino = path.join(entrada, `${a.pasta}-${a.id}-${a.nome}`);
      fs.symlinkSync((await storage.paraLocal(a, ctx.dir)), destino);
      listados.push(path.basename(destino));
    }
    await rodarAgente({ ctx, cliente: c, pedido, entrada, saida, listados });
    for (const f of fs.readdirSync(saida)) {
      const abs = path.join(saida, f);
      if (!fs.statSync(abs).isFile()) continue;
      const pasta = tipoDoArquivo(f) === "imagem" ? "graficos" : "editados";
      await salvar(ctx, abs, pasta, f, "assistente IA");
    }
    if (!ctx.saidas.length) ctx.log("\n(o assistente não gerou arquivos em saida/)\n");
  },
};
