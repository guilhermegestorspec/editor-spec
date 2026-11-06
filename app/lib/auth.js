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

export function usuarioDaRequisicao(req) {
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
