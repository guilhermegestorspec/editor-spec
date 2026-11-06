// Spec Studio — editor de vídeo e designer da Spec.
import express from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { db, DATA_DIR, PASTAS } from "./lib/db.js";
import {
  COOKIE, hashSenha, conferirSenha, validarSenha, dominioPermitido, criarSessao,
  exigirLogin, exigirAdmin, garantirAdmin, podeTentarLogin, registrarFalha, limparFalhas,
} from "./lib/auth.js";
import { enfileirar, validarParams, registrarArquivo, caminhoAbsoluto, retomarFila } from "./lib/jobs.js";
import { FORMATOS_VIDEO, FORMATOS_GRAFICO, MODELOS_WHISPER } from "./lib/presets.js";

const app = express();
const PORT = Number(process.env.PORT || 3000);
const PRODUCAO = process.env.NODE_ENV === "production";
app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    "Content-Security-Policy":
      "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'",
  });
  next();
});
app.use(express.json({ limit: "1mb" }));

// Proteção CSRF: requisições que alteram dados precisam do cabeçalho X-Spec (fetch do app).
app.use("/api", (req, res, next) => {
  if (!["GET", "HEAD"].includes(req.method) && req.get("X-Spec") !== "1") {
    return res.status(403).json({ erro: "Requisição bloqueada." });
  }
  next();
});

const id = (v) => Number.parseInt(v, 10);
const erro = (res, status, msg) => res.status(status).json({ erro: msg });

// ---------- sessão ----------
app.post("/api/login", (req, res) => {
  const email = String(req.body.email || "").trim();
  const senha = String(req.body.senha || "");
  const chave = `${req.ip}|${email.toLowerCase()}`;
  if (!podeTentarLogin(chave)) return erro(res, 429, "Muitas tentativas. Aguarde 15 minutos.");
  const u = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!u || !u.ativo || !conferirSenha(senha, u.senha_hash)) {
    registrarFalha(chave);
    return erro(res, 401, "E-mail ou senha incorretos.");
  }
  limparFalhas(chave);
  db.prepare("UPDATE users SET ultimo_login = datetime('now') WHERE id = ?").run(u.id);
  const { token, maxAge } = criarSessao(u.id);
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: PRODUCAO, maxAge, path: "/" });
  res.json({ ok: true });
});

app.post("/api/logout", exigirLogin, (req, res) => {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(req.user.token);
  res.clearCookie(COOKIE, { path: "/" });
  res.json({ ok: true });
});

app.get("/api/eu", exigirLogin, (req, res) => {
  const { token, ...u } = req.user;
  res.json(u);
});

app.post("/api/eu/senha", exigirLogin, (req, res) => {
  const u = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  if (!conferirSenha(String(req.body.atual || ""), u.senha_hash)) return erro(res, 400, "Senha atual incorreta.");
  const e = validarSenha(req.body.nova);
  if (e) return erro(res, 400, e);
  db.prepare("UPDATE users SET senha_hash = ? WHERE id = ?").run(hashSenha(req.body.nova), u.id);
  db.prepare("DELETE FROM sessions WHERE user_id = ? AND token <> ?").run(u.id, req.user.token);
  res.json({ ok: true });
});

app.get("/api/config", exigirLogin, (req, res) => {
  res.json({
    formatosVideo: FORMATOS_VIDEO,
    formatosGrafico: FORMATOS_GRAFICO,
    modelosWhisper: MODELOS_WHISPER,
    iaAtiva: Boolean(process.env.ANTHROPIC_API_KEY),
    dominio: process.env.SPEC_EMAIL_DOMAIN || null,
  });
});

// ---------- usuários (admin) ----------
const CAMPOS_USER = "id, nome, email, papel, ativo, criado_em, ultimo_login";

app.get("/api/usuarios", exigirLogin, exigirAdmin, (req, res) => {
  res.json(db.prepare(`SELECT ${CAMPOS_USER} FROM users ORDER BY nome`).all());
});

app.post("/api/usuarios", exigirLogin, exigirAdmin, (req, res) => {
  const nome = String(req.body.nome || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const papel = req.body.papel === "admin" ? "admin" : "editor";
  if (!nome || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return erro(res, 400, "Informe nome e e-mail válidos.");
  if (!dominioPermitido(email)) return erro(res, 400, `Somente e-mails @${process.env.SPEC_EMAIL_DOMAIN}.`);
  const e = validarSenha(req.body.senha);
  if (e) return erro(res, 400, e);
  try {
    const r = db.prepare("INSERT INTO users (nome, email, senha_hash, papel) VALUES (?,?,?,?)").run(nome, email, hashSenha(req.body.senha), papel);
    res.json(db.prepare(`SELECT ${CAMPOS_USER} FROM users WHERE id = ?`).get(r.lastInsertRowid));
  } catch {
    erro(res, 409, "Já existe um usuário com esse e-mail.");
  }
});

function adminsAtivos() {
  return db.prepare("SELECT COUNT(*) AS n FROM users WHERE papel='admin' AND ativo=1").get().n;
}

app.patch("/api/usuarios/:id", exigirLogin, exigirAdmin, (req, res) => {
  const u = db.prepare("SELECT * FROM users WHERE id = ?").get(id(req.params.id));
  if (!u) return erro(res, 404, "Usuário não encontrado.");
  const nome = req.body.nome !== undefined ? String(req.body.nome).trim() : u.nome;
  const papel = req.body.papel !== undefined ? (req.body.papel === "admin" ? "admin" : "editor") : u.papel;
  const ativo = req.body.ativo !== undefined ? (req.body.ativo ? 1 : 0) : u.ativo;
  const perdeAdmin = u.papel === "admin" && u.ativo && (papel !== "admin" || !ativo);
  if (perdeAdmin && adminsAtivos() <= 1) return erro(res, 400, "Precisa existir pelo menos um administrador ativo.");
  if (!nome) return erro(res, 400, "Nome obrigatório.");
  db.prepare("UPDATE users SET nome=?, papel=?, ativo=? WHERE id=?").run(nome, papel, ativo, u.id);
  if (req.body.senha) {
    const e = validarSenha(req.body.senha);
    if (e) return erro(res, 400, e);
    db.prepare("UPDATE users SET senha_hash=? WHERE id=?").run(hashSenha(req.body.senha), u.id);
  }
  if (!ativo || req.body.senha) db.prepare("DELETE FROM sessions WHERE user_id = ?").run(u.id);
  res.json(db.prepare(`SELECT ${CAMPOS_USER} FROM users WHERE id = ?`).get(u.id));
});

app.delete("/api/usuarios/:id", exigirLogin, exigirAdmin, (req, res) => {
  const u = db.prepare("SELECT * FROM users WHERE id = ?").get(id(req.params.id));
  if (!u) return erro(res, 404, "Usuário não encontrado.");
  if (u.id === req.user.id) return erro(res, 400, "Você não pode excluir a si mesmo.");
  if (u.papel === "admin" && u.ativo && adminsAtivos() <= 1) return erro(res, 400, "Precisa existir pelo menos um administrador ativo.");
  db.prepare("DELETE FROM users WHERE id = ?").run(u.id);
  res.json({ ok: true });
});

// ---------- clientes ----------
const COR = /^#[0-9a-fA-F]{6}$/;
function dadosCliente(b, atual = {}) {
  const c = { ...atual };
  for (const k of ["nome", "nicho", "fonte", "observacoes"]) if (b[k] !== undefined) c[k] = String(b[k]).trim().slice(0, 2000);
  for (const k of ["cor_primaria", "cor_secundaria", "cor_fundo"]) if (b[k] !== undefined && COR.test(b[k])) c[k] = b[k];
  return c;
}

app.get("/api/clientes", exigirLogin, (req, res) => {
  res.json(
    db.prepare(
      `SELECT c.*, (SELECT COUNT(*) FROM arquivos a WHERE a.cliente_id = c.id) AS total_arquivos
       FROM clientes c ORDER BY c.nome`
    ).all()
  );
});

app.post("/api/clientes", exigirLogin, (req, res) => {
  const c = dadosCliente(req.body, { cor_primaria: "#6c5ce7", cor_secundaria: "#ffffff", cor_fundo: "#0b0b0f", fonte: "Inter" });
  if (!c.nome) return erro(res, 400, "Informe o nome do cliente.");
  const r = db
    .prepare("INSERT INTO clientes (nome, nicho, cor_primaria, cor_secundaria, cor_fundo, fonte, observacoes) VALUES (?,?,?,?,?,?,?)")
    .run(c.nome, c.nicho || null, c.cor_primaria, c.cor_secundaria, c.cor_fundo, c.fonte, c.observacoes || null);
  res.json(db.prepare("SELECT * FROM clientes WHERE id = ?").get(r.lastInsertRowid));
});

app.patch("/api/clientes/:id", exigirLogin, (req, res) => {
  const atual = db.prepare("SELECT * FROM clientes WHERE id = ?").get(id(req.params.id));
  if (!atual) return erro(res, 404, "Cliente não encontrado.");
  const c = dadosCliente(req.body, atual);
  if (!c.nome) return erro(res, 400, "Nome obrigatório.");
  db.prepare("UPDATE clientes SET nome=?, nicho=?, cor_primaria=?, cor_secundaria=?, cor_fundo=?, fonte=?, observacoes=? WHERE id=?")
    .run(c.nome, c.nicho, c.cor_primaria, c.cor_secundaria, c.cor_fundo, c.fonte, c.observacoes, atual.id);
  res.json(db.prepare("SELECT * FROM clientes WHERE id = ?").get(atual.id));
});

app.delete("/api/clientes/:id", exigirLogin, exigirAdmin, (req, res) => {
  const c = db.prepare("SELECT * FROM clientes WHERE id = ?").get(id(req.params.id));
  if (!c) return erro(res, 404, "Cliente não encontrado.");
  db.prepare("DELETE FROM clientes WHERE id = ?").run(c.id);
  fs.rmSync(path.join(DATA_DIR, "clientes", String(c.id)), { recursive: true, force: true });
  res.json({ ok: true });
});

// ---------- arquivos ----------
const upload = multer({
  dest: path.join(DATA_DIR, "uploads-tmp"),
  limits: { fileSize: Number(process.env.UPLOAD_MAX_MB || 4096) * 1024 * 1024, files: 50 },
});

function clienteOu404(req, res) {
  const c = db.prepare("SELECT * FROM clientes WHERE id = ?").get(id(req.params.id));
  if (!c) erro(res, 404, "Cliente não encontrado.");
  return c;
}

app.get("/api/clientes/:id/arquivos", exigirLogin, (req, res) => {
  const c = clienteOu404(req, res);
  if (!c) return;
  const pasta = PASTAS.includes(req.query.pasta) ? req.query.pasta : null;
  const sql = `SELECT a.id, a.pasta, a.nome, a.tipo, a.tamanho, a.origem, a.criado_em, u.nome AS autor
               FROM arquivos a LEFT JOIN users u ON u.id = a.criado_por
               WHERE a.cliente_id = ? ${pasta ? "AND a.pasta = ?" : ""} ORDER BY a.id DESC`;
  res.json(pasta ? db.prepare(sql).all(c.id, pasta) : db.prepare(sql).all(c.id));
});

app.post("/api/clientes/:id/arquivos", exigirLogin, upload.array("arquivos"), (req, res) => {
  const limpar = () => (req.files || []).forEach((f) => fs.rmSync(f.path, { force: true }));
  const c = clienteOu404(req, res);
  if (!c) return limpar();
  const pasta = req.body.pasta;
  if (!PASTAS.includes(pasta)) {
    limpar();
    return erro(res, 400, "Pasta inválida.");
  }
  const ids = (req.files || []).map((f) =>
    registrarArquivo({
      clienteId: c.id,
      pasta,
      origemPath: f.path,
      nome: Buffer.from(f.originalname, "latin1").toString("utf8"),
      origem: "upload",
      userId: req.user.id,
    })
  );
  res.json({ ids });
});

function arquivoOu404(req, res) {
  const a = db.prepare("SELECT * FROM arquivos WHERE id = ?").get(id(req.params.id));
  if (!a) erro(res, 404, "Arquivo não encontrado.");
  return a;
}

app.get("/api/arquivos/:id/conteudo", exigirLogin, (req, res) => {
  const a = arquivoOu404(req, res);
  if (!a) return;
  const abs = caminhoAbsoluto(a);
  if (!fs.existsSync(abs)) return erro(res, 404, "Arquivo ausente no disco.");
  // Só mídia comum abre no navegador; o resto (html, svg, js...) sempre baixa, e sem executar nada.
  const seguro = ["video", "audio"].includes(a.tipo) || (a.tipo === "imagem" && !/\.svg$/i.test(a.nome));
  if (req.query.baixar || !seguro) res.attachment(a.nome);
  res.sendFile(abs, {
    headers: {
      "Cache-Control": "private, max-age=3600",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
});

app.patch("/api/arquivos/:id", exigirLogin, (req, res) => {
  const a = arquivoOu404(req, res);
  if (!a) return;
  const pasta = req.body.pasta;
  if (!PASTAS.includes(pasta) || pasta === a.pasta) return erro(res, 400, "Pasta inválida.");
  const novoId = registrarArquivo({ clienteId: a.cliente_id, pasta, origemPath: caminhoAbsoluto(a), nome: a.nome, origem: a.origem, userId: a.criado_por });
  db.prepare("DELETE FROM arquivos WHERE id = ?").run(a.id);
  res.json({ id: novoId });
});

app.delete("/api/arquivos/:id", exigirLogin, (req, res) => {
  const a = arquivoOu404(req, res);
  if (!a) return;
  fs.rmSync(caminhoAbsoluto(a), { force: true });
  db.prepare("DELETE FROM arquivos WHERE id = ?").run(a.id);
  res.json({ ok: true });
});

// ---------- tarefas ----------
app.post("/api/clientes/:id/tarefas", exigirLogin, (req, res) => {
  const c = clienteOu404(req, res);
  if (!c) return;
  const { tipo, params = {} } = req.body;
  const e = validarParams(tipo, params, c.id);
  if (e) return erro(res, 400, e);
  res.json({ id: enfileirar({ clienteId: c.id, tipo, params, userId: req.user.id }) });
});

app.get("/api/tarefas", exigirLogin, (req, res) => {
  const cid = id(req.query.cliente_id);
  const sql = `SELECT t.id, t.cliente_id, c.nome AS cliente, t.tipo, t.params, t.status, t.resultado, t.criado_em, t.terminado_em, u.nome AS autor
               FROM tarefas t LEFT JOIN clientes c ON c.id = t.cliente_id LEFT JOIN users u ON u.id = t.criado_por
               ${cid ? "WHERE t.cliente_id = ?" : ""} ORDER BY t.id DESC LIMIT 50`;
  res.json(cid ? db.prepare(sql).all(cid) : db.prepare(sql).all());
});

app.get("/api/tarefas/:id", exigirLogin, (req, res) => {
  const t = db.prepare("SELECT * FROM tarefas WHERE id = ?").get(id(req.params.id));
  if (!t) return erro(res, 404, "Tarefa não encontrada.");
  res.json(t);
});

app.get("/healthz", (req, res) => res.send("ok"));
app.use(express.static(path.join(import.meta.dirname, "public"), { index: "index.html" }));

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) return erro(res, 400, `Upload: ${err.message}`);
  console.error(err);
  erro(res, 500, "Erro interno.");
});

garantirAdmin();
retomarFila();
app.listen(PORT, () => console.log(`Spec Studio rodando em http://localhost:${PORT}`));
