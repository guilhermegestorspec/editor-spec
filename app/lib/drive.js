// Cliente mínimo da API REST do Google Drive (v3) com upload retomável.
// Usa uma conta de serviço com acesso a um Drive compartilhado da Spec.
import fs from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const BASE = (process.env.DRIVE_API_BASE || "https://www.googleapis.com").replace(/\/$/, "");
const PASTA_MIME = "application/vnd.google-apps.folder";
const PEDACO = 32 * 1024 * 1024; // 32 MB (múltiplo de 256 KB, exigido pela API)

export const DRIVE_ID = process.env.DRIVE_ID || "";
export const driveAtivo = Boolean(DRIVE_ID);

let auth = null;
async function token() {
  if (process.env.DRIVE_FAKE_TOKEN) return process.env.DRIVE_FAKE_TOKEN; // testes
  if (!auth) {
    const { GoogleAuth } = await import("google-auth-library");
    const bruto = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    const opcoes = { scopes: ["https://www.googleapis.com/auth/drive"] };
    if (bruto) {
      const json = bruto.trim().startsWith("{") ? bruto : Buffer.from(bruto, "base64").toString("utf8");
      opcoes.credentials = JSON.parse(json);
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      opcoes.keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    } else {
      throw new Error("Configure GOOGLE_SERVICE_ACCOUNT_JSON com a chave da conta de serviço.");
    }
    auth = new GoogleAuth(opcoes);
  }
  const t = await auth.getAccessToken();
  return typeof t === "string" ? t : t?.token;
}

async function chamar(metodo, caminho, { query = {}, json, headers = {}, body, raw = false, tentativas = 4 } = {}) {
  const q = new URLSearchParams({ supportsAllDrives: "true", ...query });
  const url = caminho.startsWith("http") ? caminho : `${BASE}${caminho}?${q}`;
  for (let i = 0; ; i++) {
    const h = { Authorization: `Bearer ${await token()}`, ...headers };
    let corpo = body;
    if (json !== undefined) {
      h["Content-Type"] = "application/json; charset=UTF-8";
      corpo = JSON.stringify(json);
    }
    const r = await fetch(url, { method: metodo, headers: h, body: corpo, duplex: corpo && typeof corpo !== "string" ? "half" : undefined });
    // Limite de taxa ou erro temporário do Google: espera e tenta de novo.
    if ((r.status === 429 || r.status >= 500 || r.status === 403) && i < tentativas && typeof corpo !== "object") {
      const texto = r.status === 403 ? await r.clone().text() : "";
      if (r.status !== 403 || /rateLimitExceeded|userRateLimitExceeded/.test(texto)) {
        await new Promise((ok) => setTimeout(ok, 2 ** i * 1000 + Math.random() * 500));
        continue;
      }
    }
    if (raw) return r;
    if (!r.ok) throw new Error(`Google Drive ${r.status}: ${(await r.text()).slice(0, 300)}`);
    return r.status === 204 ? null : r.json();
  }
}

const aspas = (s) => String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");

export async function acharPasta(nome, paiId) {
  const r = await chamar("GET", "/drive/v3/files", {
    query: {
      q: `'${aspas(paiId)}' in parents and name = '${aspas(nome)}' and mimeType = '${PASTA_MIME}' and trashed = false`,
      fields: "files(id,name)",
      includeItemsFromAllDrives: "true",
      corpora: "drive",
      driveId: DRIVE_ID,
      pageSize: "10",
    },
  });
  return r.files?.[0]?.id || null;
}

export async function acharArquivo(nome, paiId) {
  const r = await chamar("GET", "/drive/v3/files", {
    query: {
      q: `'${aspas(paiId)}' in parents and name = '${aspas(nome)}' and trashed = false`,
      fields: "files(id,name,size,modifiedTime)",
      includeItemsFromAllDrives: "true",
      corpora: "drive",
      driveId: DRIVE_ID,
      orderBy: "modifiedTime desc",
      pageSize: "10",
    },
  });
  return r.files?.[0] || null;
}

export async function criarPasta(nome, paiId) {
  const r = await chamar("POST", "/drive/v3/files", {
    query: { fields: "id" },
    json: { name: nome, mimeType: PASTA_MIME, parents: [paiId] },
  });
  return r.id;
}

export async function garantirPasta(nome, paiId) {
  return (await acharPasta(nome, paiId)) || (await criarPasta(nome, paiId));
}

// Upload retomável em pedaços. Se `arquivoId` vier, substitui o conteúdo do arquivo existente.
export async function enviar(caminhoLocal, { nome, paiId, mime = "application/octet-stream", arquivoId = null }) {
  const total = fs.statSync(caminhoLocal).size;
  const inicio = await chamar(arquivoId ? "PATCH" : "POST", arquivoId ? `/upload/drive/v3/files/${arquivoId}` : "/upload/drive/v3/files", {
    query: { uploadType: "resumable", fields: "id,size" },
    json: arquivoId ? {} : { name: nome, parents: [paiId] },
    headers: { "X-Upload-Content-Type": mime, "X-Upload-Content-Length": String(total) },
    raw: true,
  });
  if (!inicio.ok) throw new Error(`Google Drive ${inicio.status}: ${(await inicio.text()).slice(0, 300)}`);
  const sessao = inicio.headers.get("location");
  if (!sessao) throw new Error("Google Drive não retornou a sessão de upload.");

  if (total === 0) {
    const r = await fetch(sessao, { method: "PUT", headers: { "Content-Range": "bytes */0" } });
    if (!r.ok) throw new Error(`Google Drive ${r.status} no upload`);
    return r.json();
  }

  const fd = fs.openSync(caminhoLocal, "r");
  try {
    let pos = 0;
    let falhas = 0;
    while (pos < total) {
      const tam = Math.min(PEDACO, total - pos);
      const buf = Buffer.alloc(tam);
      fs.readSync(fd, buf, 0, tam, pos);
      let r;
      try {
        r = await fetch(sessao, {
          method: "PUT",
          headers: { "Content-Length": String(tam), "Content-Range": `bytes ${pos}-${pos + tam - 1}/${total}` },
          body: buf,
        });
      } catch (e) {
        r = null;
      }
      if (r && (r.status === 200 || r.status === 201)) return r.json();
      if (r && r.status === 308) {
        const range = r.headers.get("range"); // ex.: bytes=0-33554431
        pos = range ? Number(range.split("-")[1]) + 1 : 0;
        falhas = 0;
        continue;
      }
      // Falha de rede ou 5xx: pergunta ao Google até onde recebeu e retoma.
      if (++falhas > 5) throw new Error(`Upload para o Drive falhou (${r ? r.status : "rede"}).`);
      await new Promise((ok) => setTimeout(ok, 2 ** falhas * 1000));
      const st = await fetch(sessao, { method: "PUT", headers: { "Content-Range": `bytes */${total}` } }).catch(() => null);
      if (st && (st.status === 200 || st.status === 201)) return st.json();
      if (st && st.status === 308) {
        const range = st.headers.get("range");
        pos = range ? Number(range.split("-")[1]) + 1 : 0;
      }
    }
    throw new Error("Upload para o Drive terminou sem confirmação.");
  } finally {
    fs.closeSync(fd);
  }
}

export async function baixar(arquivoId, destino) {
  const r = await chamar("GET", `/drive/v3/files/${arquivoId}`, { query: { alt: "media" }, raw: true });
  if (!r.ok) throw new Error(`Google Drive ${r.status} ao baixar`);
  await pipeline(Readable.fromWeb(r.body), fs.createWriteStream(destino));
  return destino;
}

// Repassa o arquivo para o navegador, com suporte a Range (avançar o vídeo sem baixar tudo).
export async function transmitir(arquivoId, req, res, headersExtras = {}) {
  const headers = {};
  if (req.headers.range) headers.Range = req.headers.range;
  const r = await chamar("GET", `/drive/v3/files/${arquivoId}`, { query: { alt: "media" }, headers, raw: true });
  if (!r.ok && r.status !== 206) {
    res.status(r.status === 404 ? 404 : 502).json({ erro: "Arquivo indisponível no Google Drive." });
    return;
  }
  res.status(r.status);
  for (const h of ["content-type", "content-length", "content-range"]) {
    const v = r.headers.get(h);
    if (v) res.setHeader(h, v);
  }
  res.setHeader("Accept-Ranges", "bytes");
  for (const [k, v] of Object.entries(headersExtras)) res.setHeader(k, v);
  const corpo = Readable.fromWeb(r.body);
  req.on("close", () => corpo.destroy());
  await pipeline(corpo, res).catch(() => {});
}

export const moverParaLixeira = (id) => chamar("PATCH", `/drive/v3/files/${id}`, { query: { fields: "id" }, json: { trashed: true } });
export const renomear = (id, nome) => chamar("PATCH", `/drive/v3/files/${id}`, { query: { fields: "id" }, json: { name: nome } });
export const mover = (id, de, para) =>
  chamar("PATCH", `/drive/v3/files/${id}`, { query: { fields: "id", addParents: para, removeParents: de }, json: {} });
