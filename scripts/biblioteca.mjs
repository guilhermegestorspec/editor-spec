#!/usr/bin/env node
// Biblioteca do cliente para o Assistente IA (roda dentro da conversa, no servidor).
//
//   node scripts/biblioteca.mjs listar [pasta]          lista arquivos do cliente (id, pasta, nome, tamanho, data)
//   node scripts/biblioteca.mjs buscar <texto>          procura pelo nome
//   node scripts/biblioteca.mjs baixar <id> [destino]   traz o arquivo para a pasta de trabalho (do disco ou do Google Drive)
//
// O cliente vem da variável SPEC_CLIENTE_ID (definida pelo sistema); não acessa outros clientes.
// Só leitura do banco: não altera nada.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(import.meta.dirname, "..", "data"));
const CLIENTE = Number(process.env.SPEC_CLIENTE_ID);
if (!CLIENTE) {
  console.error("SPEC_CLIENTE_ID não definido.");
  process.exit(2);
}
const db = new DatabaseSync(path.join(DATA_DIR, "spec.db"), { readOnly: true });
const NOMES = { brutos: "Brutos", editados: "Vídeos editados", graficos: "Gráficos", referencias: "Referências", documentos: "Documentos" };
const tam = (b) => (!b ? "" : b > 1e9 ? (b / 1e9).toFixed(1) + " GB" : b > 1e6 ? (b / 1e6).toFixed(1) + " MB" : Math.ceil(b / 1e3) + " KB");

const linha = (a) =>
  `#${a.id}  [${NOMES[a.pasta] || a.pasta}]  ${a.nome}  ${a.tipo === "link" ? "(link do Drive: " + a.url + ")" : tam(a.tamanho)}  ${a.criado_em.slice(0, 10)}${a.origem && a.origem !== "upload" ? "  · " + a.origem : ""}`;

const [cmd, arg, destino] = process.argv.slice(2);

if (cmd === "listar") {
  const rows = arg
    ? db.prepare("SELECT * FROM arquivos WHERE cliente_id = ? AND pasta = ? ORDER BY id DESC").all(CLIENTE, arg)
    : db.prepare("SELECT * FROM arquivos WHERE cliente_id = ? ORDER BY pasta, id DESC").all(CLIENTE);
  console.log(rows.length ? rows.map(linha).join("\n") : "(nenhum arquivo)");
} else if (cmd === "buscar" && arg) {
  const rows = db.prepare("SELECT * FROM arquivos WHERE cliente_id = ? AND nome LIKE ? ORDER BY id DESC").all(CLIENTE, `%${arg}%`);
  console.log(rows.length ? rows.map(linha).join("\n") : "(nada encontrado)");
} else if (cmd === "baixar" && arg) {
  const a = db.prepare("SELECT * FROM arquivos WHERE id = ? AND cliente_id = ?").get(Number(arg), CLIENTE);
  if (!a) {
    console.error(`Arquivo #${arg} não existe neste cliente.`);
    process.exit(1);
  }
  if (a.tipo === "link") {
    console.log(`#${a.id} é um link do Google Drive: ${a.url}\nListe com: python3 scripts/drive_listar.py "${a.url}"  e baixe só o necessário com gdown.`);
    process.exit(0);
  }
  const dir = path.resolve(destino || "biblioteca");
  fs.mkdirSync(dir, { recursive: true });
  const alvo = path.join(dir, a.nome);
  if (a.drive_id) {
    const drive = await import("../app/lib/drive.js");
    await drive.baixar(a.drive_id, alvo);
  } else {
    const origem = path.resolve(DATA_DIR, a.caminho);
    if (!origem.startsWith(DATA_DIR + path.sep) || !fs.existsSync(origem)) {
      console.error("Arquivo ausente no disco.");
      process.exit(1);
    }
    fs.copyFileSync(origem, alvo);
  }
  console.log(alvo);
} else {
  console.log(fs.readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1, 9).join("\n"));
}
