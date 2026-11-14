// Spec Imports — site público + painel de administrador.
// Dados em SQLite (node:sqlite) e arquivos enviados em DATA_DIR/uploads.
import express from "express";
import multer from "multer";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(DIR, "data"));
const UPLOADS = path.join(DATA_DIR, "uploads");
fs.mkdirSync(UPLOADS, { recursive: true });

const ADMIN_USER = (process.env.ADMIN_USER || "admin").trim();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const PROD = process.env.NODE_ENV === "production";

/* ---------------- banco ---------------- */
const db = new DatabaseSync(path.join(DATA_DIR, "spec-imports.db"));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS carros (id TEXT PRIMARY KEY, dados TEXT NOT NULL, atualizado TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS videos (id TEXT PRIMARY KEY, dados TEXT NOT NULL, atualizado TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS config (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);
`);
const getCfg = (k, d = null) => { const r = db.prepare("SELECT valor FROM config WHERE chave=?").get(k); return r ? JSON.parse(r.valor) : d; };
const setCfg = (k, v) => db.prepare("INSERT INTO config(chave,valor) VALUES(?,?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor").run(k, JSON.stringify(v));
const listar = (t) => db.prepare(`SELECT dados FROM ${t}`).all().map(r => JSON.parse(r.dados));
const salvar = (t, obj) => db.prepare(`INSERT INTO ${t}(id,dados,atualizado) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET dados=excluded.dados, atualizado=excluded.atualizado`).run(obj.id, JSON.stringify(obj), new Date().toISOString());
const apagar = (t, id) => db.prepare(`DELETE FROM ${t} WHERE id=?`).run(id);

const CONFIG_PADRAO = {
  whatsapp: "", brl: 5.65, pyg: 6200,
  cotacaoData: "", cotacaoFonte: "Mundial Cambios", cotacaoLink: "https://mundialcambios.com.py/",
  cotacaoAuto: true
};

/* Primeira subida: estoque de demonstração (seed/estoque.json + seed/fotos) */
if (!getCfg("iniciado")) {
  const seedDir = path.join(DIR, "seed");
  const seed = JSON.parse(fs.readFileSync(path.join(seedDir, "estoque.json"), "utf8"));
  const fotosDir = path.join(seedDir, "fotos");
  if (fs.existsSync(fotosDir)) for (const f of fs.readdirSync(fotosDir)) fs.copyFileSync(path.join(fotosDir, f), path.join(UPLOADS, f));
  for (const c of seed.carros) salvar("carros", c);
  for (const v of seed.videos) salvar("videos", v);
  setCfg("site", { ...CONFIG_PADRAO, ...(seed.config || {}) });
  setCfg("iniciado", true);
  console.log(`Estoque de demonstração criado: ${seed.carros.length} carros.`);
}
let SECRET = process.env.SESSION_SECRET || getCfg("segredo");
if (!SECRET) { SECRET = crypto.randomBytes(32).toString("hex"); setCfg("segredo", SECRET); }

/* ---------------- validação ---------------- */
const txt = (v, max = 300) => (v == null ? "" : String(v)).trim().slice(0, max);
const num = (v) => { const n = Number(String(v ?? "").replace(/[^\d.]/g, "")); return Number.isFinite(n) ? n : 0; };
const slug = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
const urlOk = (u) => /^(\/uploads\/[\w.-]+|https:\/\/[^\s"'<>]+)$/.test(u);
const STATUS = ["disponivel", "reservado", "transito", "vendido"];

function limparCarro(b, id) {
  const fotos = (Array.isArray(b.fotos) ? b.fotos : []).slice(0, 30)
    .map(f => ({ url: txt(f?.url, 500), credito: txt(f?.credito, 200), creditoLink: txt(f?.creditoLink, 500) }))
    .filter(f => urlOk(f.url));
  const c = {
    id: id || `${slug(`${txt(b.marca)} ${txt(b.modelo)} ${txt(b.versao)} ${num(b.ano)}`)}-${crypto.randomBytes(2).toString("hex")}`,
    marca: txt(b.marca, 60), modelo: txt(b.modelo, 80), versao: txt(b.versao, 80), ano: Math.round(num(b.ano)),
    chassi: txt(b.chassi, 20), preco: Math.round(num(b.preco)), status: STATUS.includes(b.status) ? b.status : "disponivel",
    destaque: Math.round(num(b.destaque)) || 99,
    motor: txt(b.motor, 120), cv: Math.round(num(b.cv)), torque: txt(b.torque, 40), cambio: txt(b.cambio, 80), tracao: txt(b.tracao, 80),
    peso: txt(b.peso, 30), zero100: txt(b.zero100, 20), km: txt(b.km, 30), cor: txt(b.cor, 60),
    corHex: /^#[0-9a-f]{6}$/i.test(b.corHex) ? b.corHex : "#888888",
    volante: txt(b.volante, 40) || "Direita (JDM)", leilao: txt(b.leilao, 30),
    descricao: txt(b.descricao, 4000),
    destaques: (Array.isArray(b.destaques) ? b.destaques : String(b.destaques || "").split("\n")).map(x => txt(x, 160)).filter(Boolean).slice(0, 12),
    asa: !!b.asa, fotos
  };
  if (!c.marca || !c.modelo || !c.ano || !c.preco) throw new Error("Preencha marca, modelo, ano e preço.");
  return c;
}
function limparVideo(b, id) {
  const v = {
    id: id || crypto.randomBytes(5).toString("hex"),
    titulo: txt(b.titulo, 120), carro: txt(b.carro, 80), tipo: txt(b.tipo, 40), duracao: txt(b.duracao, 10),
    url: txt(b.url, 500), capa: txt(b.capa, 500), ordem: Math.round(num(b.ordem)) || 99
  };
  if (!v.titulo) throw new Error("Dê um título ao vídeo.");
  if (v.url && !urlOk(v.url)) throw new Error("O link do vídeo precisa começar com https://");
  if (v.capa && !urlOk(v.capa)) v.capa = "";
  return v;
}

/* ---------------- sessão ---------------- */
const assinar = (s) => crypto.createHmac("sha256", SECRET).update(s).digest("base64url");
function lerSessao(req) {
  const m = /(?:^|;\s*)si_sess=([^;]+)/.exec(req.headers.cookie || "");
  if (!m) return false;
  const [exp, sig] = decodeURIComponent(m[1]).split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const esperado = assinar(exp);
  return sig.length === esperado.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(esperado));
}
function exigeAdmin(req, res, next) {
  if (!lerSessao(req)) return res.status(401).json({ erro: "Entre no painel para continuar." });
  if (req.method !== "GET" && req.get("x-spec") !== "1") return res.status(403).json({ erro: "Pedido recusado." });
  next();
}
const tentativas = new Map();

/* ---------------- cotação automática (Mundial Cambios) ---------------- */
const br = (s) => Number(String(s).replace(/\./g, "").replace(",", "."));
async function atualizarCotacao() {
  const r = await fetch("https://mundialcambios.com.py/", {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "es-PY,es;q=0.9,pt-BR;q=0.8"
    },
    signal: AbortSignal.timeout(20000)
  });
  if (!r.ok) throw new Error(`Mundial Cambios respondeu ${r.status}`);
  const html = await r.text();
  // Primeira tabela da página = sucursal padrão (Globo Center). Coluna VENTA.
  const usd = /DOLARES AMERICANOS<\/td><td>([\d.,]+)<\/td><td>([\d.,]+)<\/td>/.exec(html);
  const real = /D&Oacute;LAR X REAL<\/span><\/td><td>([\d.,]+)<\/td><td>([\d.,]+)<\/td>/.exec(html) || /DÓLAR X REAL<\/span><\/td><td>([\d.,]+)<\/td><td>([\d.,]+)<\/td>/.exec(html);
  const quando = /ltima cotizaci(?:&#243;|ó)n:\s*([\d-]+ [\d:]+)/.exec(html);
  if (!usd || !real) throw new Error("Não encontrei a tabela de cotações na página da Mundial Cambios.");
  const pyg = br(usd[2]), brl = br(real[2]);
  if (!(pyg > 1000 && pyg < 50000 && brl > 1 && brl < 50)) throw new Error("Cotação fora do esperado; mantive a anterior.");
  let data = new Date().toLocaleString("pt-BR", { timeZone: "America/Asuncion" }).slice(0, 17);
  if (quando) { const [d, h] = quando[1].split(" "); const [a, m, dia] = d.split("-"); data = `${dia}/${m}/${a} ${h.slice(0, 5)}`; }
  const site = { ...CONFIG_PADRAO, ...getCfg("site", {}) };
  Object.assign(site, { brl, pyg, cotacaoData: data, cotacaoFonte: "Mundial Cambios", cotacaoLink: "https://mundialcambios.com.py/" });
  setCfg("site", site);
  return site;
}
async function cotacaoAgendada() {
  const site = getCfg("site", {});
  if (site.cotacaoAuto === false) return;
  try { const s = await atualizarCotacao(); console.log(`Cotação atualizada: R$ ${s.brl} · ₲ ${s.pyg} (${s.cotacaoData})`); }
  catch (e) { console.warn("Cotação:", e.message); }
}
setTimeout(cotacaoAgendada, 5000);
setInterval(cotacaoAgendada, 60 * 60 * 1000); // a cada hora

/* ---------------- app ---------------- */
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

app.get("/healthz", (req, res) => res.send("ok"));

app.get("/api/site", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ config: { ...CONFIG_PADRAO, ...getCfg("site", {}) }, carros: listar("carros"), videos: listar("videos") });
});

app.post("/api/login", (req, res) => {
  const ip = req.ip, agora = Date.now();
  const t = (tentativas.get(ip) || []).filter(x => agora - x < 10 * 60 * 1000);
  if (t.length >= 8) return res.status(429).json({ erro: "Muitas tentativas. Aguarde 10 minutos." });
  if (!ADMIN_PASSWORD) return res.status(503).json({ erro: "Defina ADMIN_PASSWORD no servidor para ativar o painel." });
  const u = txt(req.body?.usuario, 100), s = String(req.body?.senha || "");
  const hash = (x) => crypto.createHash("sha256").update(x).digest();
  const ok = u.toLowerCase() === ADMIN_USER.toLowerCase() && crypto.timingSafeEqual(hash(s), hash(ADMIN_PASSWORD));
  if (!ok) { t.push(agora); tentativas.set(ip, t); return res.status(401).json({ erro: "Usuário ou senha incorretos." }); }
  tentativas.delete(ip);
  const exp = String(agora + 7 * 24 * 3600 * 1000);
  res.set("Set-Cookie", `si_sess=${encodeURIComponent(exp + "." + assinar(exp))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}${PROD ? "; Secure" : ""}`);
  res.json({ ok: true });
});
app.post("/api/logout", (req, res) => { res.set("Set-Cookie", "si_sess=; Path=/; Max-Age=0"); res.json({ ok: true }); });
app.get("/api/me", (req, res) => res.json({ admin: lerSessao(req) }));

const A = express.Router();
A.use(exigeAdmin);
const tratar = (fn) => (req, res) => { try { res.json(fn(req)); } catch (e) { res.status(400).json({ erro: e.message }); } };
A.post("/carros", tratar(req => { const c = limparCarro(req.body); salvar("carros", c); return c; }));
A.put("/carros/:id", tratar(req => { const c = limparCarro(req.body, req.params.id); salvar("carros", c); return c; }));
A.delete("/carros/:id", tratar(req => { apagar("carros", req.params.id); return { ok: true }; }));
A.post("/videos", tratar(req => { const v = limparVideo(req.body); salvar("videos", v); return v; }));
A.put("/videos/:id", tratar(req => { const v = limparVideo(req.body, req.params.id); salvar("videos", v); return v; }));
A.delete("/videos/:id", tratar(req => { apagar("videos", req.params.id); return { ok: true }; }));
A.put("/config", tratar(req => {
  const b = req.body || {}, atual = { ...CONFIG_PADRAO, ...getCfg("site", {}) };
  const site = {
    ...atual,
    whatsapp: txt(b.whatsapp, 20).replace(/\D/g, ""),
    brl: num(b.brl) || atual.brl, pyg: num(b.pyg) || atual.pyg,
    cotacaoAuto: !!b.cotacaoAuto
  };
  if (!site.cotacaoAuto && (b.brl || b.pyg)) { site.cotacaoFonte = "Spec Imports"; site.cotacaoLink = ""; site.cotacaoData = new Date().toLocaleDateString("pt-BR"); }
  setCfg("site", site); return site;
}));
A.post("/cotacao", async (req, res) => {
  try { res.json(await atualizarCotacao()); } catch (e) { res.status(502).json({ erro: e.message }); }
});
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS,
    filename: (req, f, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(4).toString("hex")}${(path.extname(f.originalname) || "").toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 6)}`)
  }),
  limits: { fileSize: Number(process.env.UPLOAD_MAX_MB || 300) * 1024 * 1024, files: 20 },
  fileFilter: (req, f, cb) => cb(null, /^(image\/(jpeg|png|webp|avif|gif)|video\/(mp4|webm|quicktime))$/.test(f.mimetype))
});
A.post("/upload", upload.array("arquivos", 20), (req, res) => {
  const arquivos = (req.files || []).map(f => ({ url: "/uploads/" + f.filename, tipo: f.mimetype, nome: f.originalname, tamanho: f.size }));
  if (!arquivos.length) return res.status(400).json({ erro: "Envie fotos (JPG, PNG, WEBP) ou vídeos (MP4, MOV, WEBM)." });
  res.json({ arquivos });
});
app.use("/api/admin", A);
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) return res.status(400).json({ erro: err.code === "LIMIT_FILE_SIZE" ? "Arquivo grande demais." : err.message });
  console.error(err); res.status(500).json({ erro: "Erro no servidor." });
});

app.use("/uploads", express.static(UPLOADS, { maxAge: "30d", immutable: true }));
app.get("/admin", (req, res) => res.sendFile(path.join(DIR, "public", "admin.html")));
app.use(express.static(path.join(DIR, "public"), { maxAge: "1h" }));

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => console.log(`Spec Imports em http://localhost:${PORT} (painel: /admin) · dados em ${DATA_DIR}`));
