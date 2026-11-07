// Banco SQLite embutido no Node (node:sqlite) — sem dependência nativa.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(import.meta.dirname, "..", "..");
export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, "data"));
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, "spec.db"));
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  senha_hash TEXT NOT NULL,
  papel TEXT NOT NULL DEFAULT 'editor' CHECK (papel IN ('admin','editor')),
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  ultimo_login TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expira_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  nicho TEXT,
  cor_primaria TEXT DEFAULT '#6c5ce7',
  cor_secundaria TEXT DEFAULT '#ffffff',
  cor_fundo TEXT DEFAULT '#0b0b0f',
  fonte TEXT DEFAULT 'Inter',
  observacoes TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS arquivos (
  id INTEGER PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  pasta TEXT NOT NULL CHECK (pasta IN ('brutos','editados','graficos','referencias')),
  nome TEXT NOT NULL,
  caminho TEXT NOT NULL,
  tipo TEXT,
  tamanho INTEGER,
  origem TEXT,
  criado_por INTEGER REFERENCES users(id) ON DELETE SET NULL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS drive_pastas (
  chave TEXT PRIMARY KEY,
  drive_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tarefas (
  id INTEGER PRIMARY KEY,
  cliente_id INTEGER REFERENCES clientes(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  params TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'na_fila',
  log TEXT NOT NULL DEFAULT '',
  resultado TEXT,
  criado_por INTEGER REFERENCES users(id) ON DELETE SET NULL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  terminado_em TEXT
);
`);

// Migrações simples
const colunas = db.prepare("PRAGMA table_info(arquivos)").all().map((c) => c.name);
if (!colunas.includes("drive_id")) db.exec("ALTER TABLE arquivos ADD COLUMN drive_id TEXT");
// status: ok | enviando (recebido pelo servidor, subindo para o Drive) | erro_envio (vai tentar de novo)
// url: arquivos guardados só como link (ex.: pasta do Drive do cliente), sem baixar
if (!colunas.includes("url")) db.exec("ALTER TABLE arquivos ADD COLUMN url TEXT");
if (!colunas.includes("status")) db.exec("ALTER TABLE arquivos ADD COLUMN status TEXT NOT NULL DEFAULT 'ok'");

// Tarefas que estavam rodando quando o servidor caiu não vão terminar.
db.prepare("UPDATE tarefas SET status='erro', log=log||'\n[servidor reiniciado durante a tarefa]' WHERE status IN ('rodando')").run();

export const PASTAS = ["brutos", "editados", "graficos", "referencias"];

export function clienteDir(clienteId, pasta) {
  const d = path.join(DATA_DIR, "clientes", String(clienteId), pasta);
  fs.mkdirSync(d, { recursive: true });
  return d;
}
