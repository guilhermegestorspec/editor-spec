import crypto from "node:crypto";
import { db } from "./db.js";

const SESSAO_DIAS = 14;
export const COOKIE = "spec_sessao";

export function hashSenha(senha) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(senha, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function conferirSenha(senha, armazenado) {
  const [alg, saltHex, hashHex] = String(armazenado).split("$");
  if (alg !== "scrypt") return false;
  const esperado = Buffer.from(hashHex, "hex");
  const hash = crypto.scryptSync(senha, Buffer.from(saltHex, "hex"), esperado.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(hash, esperado);
}

export function validarSenha(senha) {
  if (typeof senha !== "string" || senha.length < 8) return "A senha precisa ter pelo menos 8 caracteres.";
  return null;
}

export function dominioPermitido(email) {
  const dom = (process.env.SPEC_EMAIL_DOMAIN || "").trim().toLowerCase();
  if (!dom) return true;
  return String(email).toLowerCase().endsWith("@" + dom);
}

export function criarSessao(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expira = new Date(Date.now() + SESSAO_DIAS * 86400e3).toISOString();
  db.prepare("INSERT INTO sessions (token, user_id, expira_em) VALUES (?,?,?)").run(token, userId, expira);
  db.prepare("DELETE FROM sessions WHERE expira_em < ?").run(new Date().toISOString());
  return { token, maxAge: SESSAO_DIAS * 86400e3 };
}

function lerCookie(req, nome) {
  const raw = req.headers.cookie || "";
  for (const parte of raw.split(";")) {
    const [k, ...v] = parte.trim().split("=");
    if (k === nome) return decodeURIComponent(v.join("="));
  }
  return null;
}

// ---------- chaves de integração (Claude Code / scripts) ----------
db.exec(`
CREATE TABLE IF NOT EXISTS chaves_api (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  hash TEXT NOT NULL UNIQUE,
  final TEXT NOT NULL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  ultimo_uso TEXT
);
`);
const hashChave = (k) => crypto.createHash("sha256").update(k).digest("hex");

export function criarChave(userId, nome) {
  const chave = "spec_" + crypto.randomBytes(32).toString("base64url");
  db.prepare("INSERT INTO chaves_api (user_id, nome, hash, final) VALUES (?,?,?,?)").run(userId, String(nome || "Claude Code").slice(0, 60), hashChave(chave), chave.slice(-4));
  return chave;
}

export const chaveNoCabecalho = (req) => /^Bearer spec_[\w-]{20,}$/.test(req.get?.("authorization") || req.headers.authorization || "");

function usuarioDaChave(req) {
  const chave = String(req.headers.authorization || "").slice(7);
  const row = db
    .prepare("SELECT k.id AS kid, u.id, u.nome, u.email, u.papel, u.ativo FROM chaves_api k JOIN users u ON u.id = k.user_id WHERE k.hash = ?")
    .get(hashChave(chave));
  if (!row || !row.ativo) return null;
  db.prepare("UPDATE chaves_api SET ultimo_uso = datetime('now') WHERE id = ?").run(row.kid);
  return { id: row.id, nome: row.nome, email: row.email, papel: row.papel, viaChave: true };
}

export function usuarioDaRequisicao(req) {
  if (chaveNoCabecalho(req)) return usuarioDaChave(req);
  const token = lerCookie(req, COOKIE);
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.id, u.nome, u.email, u.papel, u.ativo, s.expira_em FROM sessions s
       JOIN users u ON u.id = s.user_id WHERE s.token = ?`
    )
    .get(token);
  if (!row || !row.ativo || row.expira_em < new Date().toISOString()) return null;
  return { id: row.id, nome: row.nome, email: row.email, papel: row.papel, token };
}

export function exigirLogin(req, res, next) {
  const u = usuarioDaRequisicao(req);
  if (!u) return res.status(401).json({ erro: "Faça login para continuar." });
  req.user = u;
  next();
}

export function exigirAdmin(req, res, next) {
  if (req.user?.papel !== "admin") return res.status(403).json({ erro: "Apenas administradores." });
  next();
}

// Limite simples contra força bruta no login: 10 tentativas por 15 min por IP+email.
const tentativas = new Map();
export function podeTentarLogin(chave) {
  const agora = Date.now();
  const t = (tentativas.get(chave) || []).filter((x) => agora - x < 15 * 60e3);
  tentativas.set(chave, t);
  return t.length < 10;
}
export function registrarFalha(chave) {
  const t = tentativas.get(chave) || [];
  t.push(Date.now());
  tentativas.set(chave, t);
}
export function limparFalhas(chave) {
  tentativas.delete(chave);
}

// Modo de acesso único (ACESSO_UNICO=<email>): só essa conta existe e entra no sistema.
// Na primeira vez a conta é criada com ADMIN_PASSWORD; os demais usuários são removidos.
export const acessoUnico = () => (process.env.ACESSO_UNICO || "").trim().toLowerCase();

export function garantirAcessoUnico() {
  const email = acessoUnico();
  if (!email) return;
  let u = db.prepare("SELECT * FROM users WHERE lower(email) = ?").get(email);
  if (!u) {
    const senha = process.env.ADMIN_PASSWORD;
    if (!senha || validarSenha(senha)) {
      console.error("ACESSO_UNICO definido, mas falta ADMIN_PASSWORD (mín. 8 caracteres) para criar a conta. Nada foi alterado.");
      return;
    }
    db.prepare("INSERT INTO users (nome, email, senha_hash, papel) VALUES (?,?,?, 'admin')").run("Spec", email, hashSenha(senha));
    u = db.prepare("SELECT * FROM users WHERE lower(email) = ?").get(email);
    console.log(`Acesso único: conta ${email} criada.`);
  }
  db.prepare("UPDATE users SET papel = 'admin', ativo = 1 WHERE id = ?").run(u.id);
  const outros = db.prepare("SELECT COUNT(*) n FROM users WHERE id <> ?").get(u.id).n;
  if (outros) {
    db.prepare("DELETE FROM users WHERE id <> ?").run(u.id); // sessões, chaves e inscrições saem junto (cascade)
    console.log(`Acesso único: ${outros} outro(s) usuário(s) removido(s).`);
  }
}

// Primeiro acesso: cria o administrador a partir das variáveis de ambiente
// (ou gera uma senha e mostra no log do servidor).
export function garantirAdmin() {
  const n = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
  if (n > 0) return;
  const email = process.env.ADMIN_EMAIL || "admin@spec.local";
  const senha = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString("base64url");
  db.prepare("INSERT INTO users (nome, email, senha_hash, papel) VALUES (?,?,?, 'admin')").run(
    "Administrador",
    email,
    hashSenha(senha)
  );
  console.log("\n==============================================");
  console.log(" Primeiro administrador criado");
  console.log(`  e-mail: ${email}`);
  if (!process.env.ADMIN_PASSWORD) console.log(`  senha:  ${senha}   (troque em "Minha conta")`);
  console.log("==============================================\n");
}
