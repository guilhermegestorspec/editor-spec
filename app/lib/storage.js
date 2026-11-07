// Armazenamento dos arquivos: disco local (padrão) ou Google Drive compartilhado (DRIVE_ID).
//
// No Drive a estrutura fica legível para a equipe:
//   <Drive compartilhado>/Spec Studio/Clientes/<Cliente>/{Brutos, Vídeos editados, Gráficos, Referências}
//   <Drive compartilhado>/Spec Studio/_sistema/  (backup do banco do sistema)
import fs from "node:fs";
import path from "node:path";
import { db, DATA_DIR, clienteDir } from "./db.js";
import * as drive from "./drive.js";

export const modo = drive.driveAtivo ? "drive" : "local";
export const NOME_PASTA = { brutos: "Brutos", editados: "Vídeos editados", graficos: "Gráficos", referencias: "Referências", documentos: "Documentos" };
const RAIZ_NOME = process.env.DRIVE_PASTA_RAIZ || "Spec Studio";

const MIME = {
  ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".mkv": "video/x-matroska", ".m4v": "video/x-m4v",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".flac": "audio/flac", ".ogg": "audio/ogg", ".aac": "audio/aac",
  ".srt": "application/x-subrip", ".json": "application/json", ".pdf": "application/pdf", ".txt": "text/plain",
};
export const mimeDe = (nome) => MIME[path.extname(nome).toLowerCase()] || "application/octet-stream";

// ---------- IDs de pastas do Drive (cache no banco) ----------
const lerId = (chave) => db.prepare("SELECT drive_id FROM drive_pastas WHERE chave = ?").get(chave)?.drive_id;
const gravarId = (chave, id) => db.prepare("INSERT OR REPLACE INTO drive_pastas (chave, drive_id) VALUES (?, ?)").run(chave, id);
const travas = new Map();

async function pastaCache(chave, nome, paiId) {
  const ja = lerId(chave);
  if (ja) return ja;
  // evita criar a mesma pasta duas vezes em uploads simultâneos
  if (!travas.has(chave)) {
    travas.set(
      chave,
      drive.garantirPasta(nome, paiId).then((id) => (gravarId(chave, id), id)).finally(() => travas.delete(chave))
    );
  }
  return travas.get(chave);
}

export const pastaRaiz = () => pastaCache("raiz", RAIZ_NOME, drive.DRIVE_ID);
const pastaClientes = async () => pastaCache("clientes", "Clientes", await pastaRaiz());
export const pastaSistema = async () => pastaCache("sistema", "_sistema", await pastaRaiz());

function nomePastaCliente(clienteId) {
  const c = db.prepare("SELECT nome FROM clientes WHERE id = ?").get(clienteId);
  return `${(c?.nome || "Cliente").replace(/[\/\\]/g, "-").trim()} (#${clienteId})`;
}
const pastaCliente = async (clienteId) => pastaCache(`cliente:${clienteId}`, nomePastaCliente(clienteId), await pastaClientes());
const pastaDoTipo = async (clienteId, pasta) =>
  pastaCache(`cliente:${clienteId}:${pasta}`, NOME_PASTA[pasta], await pastaCliente(clienteId));

// ---------- operações ----------

// Guarda o arquivo temporário `origemPath` (que é consumido) e devolve onde ficou.
export async function guardar({ clienteId, pasta, origemPath, nome }) {
  const tamanho = fs.statSync(origemPath).size;
  if (modo === "drive") {
    try {
      const r = await drive.enviar(origemPath, { nome, paiId: await pastaDoTipo(clienteId, pasta), mime: mimeDe(nome) });
      return { caminho: "", drive_id: r.id, tamanho };
    } finally {
      fs.rmSync(origemPath, { force: true });
    }
  }
  const dir = clienteDir(clienteId, pasta);
  const destino = path.join(dir, nome);
  try {
    fs.renameSync(origemPath, destino);
  } catch {
    fs.copyFileSync(origemPath, destino);
    fs.rmSync(origemPath, { force: true });
  }
  return { caminho: path.relative(DATA_DIR, destino), drive_id: null, tamanho };
}

export function nomeLivreLocal(clienteId, pasta, nome) {
  // No Drive nomes repetidos são permitidos; no disco evitamos sobrescrever.
  const ext = path.extname(nome);
  const base = path.basename(nome, ext);
  const usados = new Set(db.prepare("SELECT nome FROM arquivos WHERE cliente_id = ? AND pasta = ?").all(clienteId, pasta).map((r) => r.nome));
  let cand = nome;
  for (let i = 2; usados.has(cand) || (modo === "local" && fs.existsSync(path.join(clienteDir(clienteId, pasta), cand))); i++)
    cand = `${base} (${i})${ext}`;
  return cand;
}

function caminhoLocal(a) {
  const abs = path.resolve(DATA_DIR, a.caminho);
  if (!abs.startsWith(DATA_DIR + path.sep)) throw new Error("caminho inválido");
  return abs;
}

// Devolve um caminho local legível do arquivo (baixa do Drive para `dirTemp` se preciso).
export async function paraLocal(a, dirTemp) {
  if (!a.drive_id) return caminhoLocal(a);
  const destino = path.join(dirTemp, `drive-${a.id}${path.extname(a.nome).toLowerCase()}`);
  if (!fs.existsSync(destino)) await drive.baixar(a.drive_id, destino);
  return destino;
}

export async function servir(a, req, res, headers) {
  if (a.drive_id) return drive.transmitir(a.drive_id, req, res, headers);
  const abs = caminhoLocal(a);
  if (!fs.existsSync(abs)) return res.status(404).json({ erro: "Arquivo ausente no disco." });
  res.sendFile(abs, { headers });
}

export async function remover(a) {
  if (a.drive_id) return drive.moverParaLixeira(a.drive_id); // fica 30 dias na lixeira do Drive
  fs.rmSync(caminhoLocal(a), { force: true });
}

// Move de pasta mantendo o mesmo registro.
export async function moverPasta(a, novaPasta, novoNome) {
  if (a.drive_id) {
    await drive.mover(a.drive_id, await pastaDoTipo(a.cliente_id, a.pasta), await pastaDoTipo(a.cliente_id, novaPasta));
    if (novoNome !== a.nome) await drive.renomear(a.drive_id, novoNome);
    return { caminho: "" };
  }
  const destino = path.join(clienteDir(a.cliente_id, novaPasta), novoNome);
  fs.renameSync(caminhoLocal(a), destino);
  return { caminho: path.relative(DATA_DIR, destino) };
}

export async function renomearCliente(clienteId) {
  const id = lerId(`cliente:${clienteId}`);
  if (modo === "drive" && id) await drive.renomear(id, nomePastaCliente(clienteId));
}

export async function removerCliente(clienteId) {
  if (modo === "drive") {
    const id = lerId(`cliente:${clienteId}`);
    if (id) await drive.moverParaLixeira(id);
    db.prepare("DELETE FROM drive_pastas WHERE chave = ? OR chave LIKE ?").run(`cliente:${clienteId}`, `cliente:${clienteId}:%`);
  }
  fs.rmSync(path.join(DATA_DIR, "clientes", String(clienteId)), { recursive: true, force: true });
}

// Confere a conexão na inicialização, para o erro aparecer logo no log.
export async function verificar() {
  if (modo !== "drive") return "Armazenamento: disco local (" + DATA_DIR + ")";
  const raiz = await pastaRaiz();
  await pastaClientes();
  return `Armazenamento: Google Drive compartilhado ${drive.DRIVE_ID} (pasta "${RAIZ_NOME}" ${raiz})`;
}

// ---------- envio para o Drive em segundo plano ----------
// O upload do navegador termina assim que o servidor recebe o arquivo; a ida ao Drive acontece depois,
// sem prender a pessoa na tela. Enquanto isso o arquivo é servido do disco temporário.
const PENDENTES = path.join(DATA_DIR, "pendentes");
const SIMULTANEOS = Number(process.env.DRIVE_ENVIOS_SIMULTANEOS || 2);
const filaEnvio = [];
const tentativas = new Map();
let enviandoAgora = 0;

export function usarEnvioAdiado() {
  return modo === "drive";
}

export function guardarPendente({ origemPath, nome }) {
  fs.mkdirSync(PENDENTES, { recursive: true });
  const destino = path.join(PENDENTES, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${nome}`);
  try {
    fs.renameSync(origemPath, destino);
  } catch {
    fs.copyFileSync(origemPath, destino);
    fs.rmSync(origemPath, { force: true });
  }
  return { caminho: path.relative(DATA_DIR, destino), tamanho: fs.statSync(destino).size };
}

export function agendarEnvioDrive(id) {
  if (!filaEnvio.includes(id)) filaEnvio.push(id);
  setImmediate(processarEnvios);
}

function processarEnvios() {
  while (enviandoAgora < SIMULTANEOS && filaEnvio.length) {
    const id = filaEnvio.shift();
    enviandoAgora++;
    enviarUm(id).finally(() => {
      enviandoAgora--;
      setImmediate(processarEnvios);
    });
  }
}

async function enviarUm(id) {
  const a = db.prepare("SELECT * FROM arquivos WHERE id = ?").get(id);
  if (!a || a.status === "ok" || a.drive_id) return;
  const abs = caminhoLocal(a);
  try {
    const r = await drive.enviar(abs, { nome: a.nome, paiId: await pastaDoTipo(a.cliente_id, a.pasta), mime: mimeDe(a.nome) });
    const atual = db.prepare("SELECT id FROM arquivos WHERE id = ?").get(id);
    if (!atual) {
      // excluído enquanto subia: não deixa lixo no Drive
      await drive.moverParaLixeira(r.id).catch(() => {});
    } else {
      db.prepare("UPDATE arquivos SET drive_id = ?, caminho = '', status = 'ok' WHERE id = ?").run(r.id, id);
    }
    tentativas.delete(id);
    // mantém a cópia local por alguns minutos (tarefas podem estar lendo o arquivo)
    setTimeout(() => fs.rmSync(abs, { force: true }), 10 * 60e3).unref();
  } catch (e) {
    const n = (tentativas.get(id) || 0) + 1;
    tentativas.set(id, n);
    console.error(`[drive] envio do arquivo ${id} falhou (tentativa ${n}):`, e.message);
    db.prepare("UPDATE arquivos SET status = 'erro_envio' WHERE id = ?").run(id);
    setTimeout(() => agendarEnvioDrive(id), Math.min(60e3 * n, 15 * 60e3)).unref();
  }
}

// Na inicialização: retoma envios interrompidos e limpa temporários órfãos.
export function retomarEnviosDrive() {
  if (modo !== "drive") return;
  const pend = db.prepare("SELECT id, caminho FROM arquivos WHERE status <> 'ok' AND drive_id IS NULL").all();
  const usados = new Set(db.prepare("SELECT caminho FROM arquivos WHERE caminho LIKE 'pendentes/%'").all().map((r) => path.resolve(DATA_DIR, r.caminho)));
  if (fs.existsSync(PENDENTES))
    for (const f of fs.readdirSync(PENDENTES)) {
      const abs = path.join(PENDENTES, f);
      if (!usados.has(abs)) fs.rmSync(abs, { force: true });
    }
  for (const r of pend) {
    if (r.caminho && fs.existsSync(path.resolve(DATA_DIR, r.caminho))) agendarEnvioDrive(r.id);
  }
  if (pend.length) console.log(`[drive] retomando ${pend.length} envio(s) pendente(s)`);
}
