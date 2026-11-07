#!/usr/bin/env node
// Ponte entre o Claude Code e o Spec Studio (https://studio.specmarketingdigital.com.br).
// O processamento acontece onde o Claude Code roda; o Studio guarda clientes, memória, brutos e entregas.
//
//   node scripts/studio.mjs clientes                              lista os clientes (id, nome, nicho)
//   node scripts/studio.mjs cliente <cliente>                     dados de marca + memória do cliente
//   node scripts/studio.mjs memoria <cliente> [--salvar arq.md]   lê (ou substitui) a memória do cliente
//   node scripts/studio.mjs arquivos <cliente> [pasta]            lista a biblioteca (brutos|editados|graficos|referencias|documentos)
//   node scripts/studio.mjs baixar <arquivo_id> [pasta_destino]   baixa um arquivo da biblioteca (padrão: referencias/)
//   node scripts/studio.mjs enviar <cliente> <pasta> <arquivo...> envia entregas para a biblioteca do cliente
//   node scripts/studio.mjs inicio <cliente> "<título>"           abre um item "Claude Code" no painel de Tarefas (mostra o id)
//   node scripts/studio.mjs etapa <trabalho_id> "<texto>"         atualiza a etapa mostrada ao vivo
//   node scripts/studio.mjs fim <trabalho_id> [ok|erro] [n_entregas]  conclui (dispara a notificação no celular)
//
// <cliente> = id ou parte do nome. Autenticação: cabeçalho Authorization: Bearer <chave spec_...>.
// Na nuvem do Claude Code a chave fica salva no ambiente e o proxy a injeta; localmente use SPEC_STUDIO_TOKEN.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const BASE = (process.env.SPEC_STUDIO_URL || "https://studio.specmarketingdigital.com.br").replace(/\/$/, "");
const TOKEN = process.env.SPEC_STUDIO_TOKEN || "spec_chave_injetada_pelo_proxy_do_ambiente";
const PARTE = 32 * 1024 * 1024;

function curl(args, { corpo, saida } = {}) {
  const base = ["-sS", "--retry", "3", "--retry-all-errors", "-H", `Authorization: Bearer ${TOKEN}`, "-H", "X-Spec: 1", "-w", "\n%{http_code}"];
  if (saida) base.splice(base.indexOf("-w"), 2, "-o", saida, "-w", "%{http_code}", "-L");
  const r = spawnSync("curl", [...base, ...args], { input: corpo, maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`curl falhou: ${r.stderr}`);
  const txt = r.stdout.toString();
  const i = txt.lastIndexOf("\n");
  const codigo = Number(saida ? txt : txt.slice(i + 1));
  const texto = saida ? "" : txt.slice(0, i);
  if (codigo === 401) throw new Error("Sem acesso (401): a chave de integração não está configurada ou foi revogada.");
  if (codigo >= 400) {
    let msg = texto;
    try {
      msg = JSON.parse(texto).erro || texto;
    } catch {}
    throw new Error(`Erro ${codigo}: ${msg}`.slice(0, 500));
  }
  return texto;
}
const api = (metodo, rota, json) =>
  JSON.parse(
    curl(["-X", metodo, ...(json !== undefined ? ["-H", "Content-Type: application/json", "--data-binary", "@-"] : []), `${BASE}/api${rota}`], {
      corpo: json !== undefined ? JSON.stringify(json) : undefined,
    }) || "null"
  );

function acharCliente(ref) {
  if (!ref) throw new Error("Informe o cliente (id ou nome).");
  const cs = api("GET", "/clientes");
  if (/^\d+$/.test(ref)) {
    const c = cs.find((x) => x.id === Number(ref));
    if (c) return c;
  }
  const norm = (s) => String(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const achados = cs.filter((c) => norm(c.nome).includes(norm(ref)));
  if (achados.length === 1) return achados[0];
  throw new Error(achados.length ? `Mais de um cliente com "${ref}": ${achados.map((c) => `#${c.id} ${c.nome}`).join(", ")}` : `Cliente "${ref}" não encontrado.`);
}

const tam = (b) => (!b ? "" : b > 1e9 ? (b / 1e9).toFixed(1) + " GB" : b > 1e6 ? (b / 1e6).toFixed(1) + " MB" : Math.ceil(b / 1e3) + " KB");
const [cmd, ...a] = process.argv.slice(2);

try {
  if (cmd === "clientes") {
    for (const c of api("GET", "/clientes")) console.log(`#${c.id}  ${c.nome}${c.nicho ? "  · " + c.nicho : ""}`);
  } else if (cmd === "cliente") {
    const c = acharCliente(a[0]);
    console.log(`#${c.id} ${c.nome}\nNicho: ${c.nicho || "—"}\nCores: primária ${c.cor_primaria}, secundária ${c.cor_secundaria}, fundo ${c.cor_fundo}\nFonte: ${c.fonte || "—"}\nObservações: ${c.observacoes || "—"}\n`);
    console.log(api("GET", `/clientes/${c.id}/memoria`).memoria);
  } else if (cmd === "memoria") {
    const c = acharCliente(a[0]);
    const i = a.indexOf("--salvar");
    if (i > 0) {
      api("PUT", `/clientes/${c.id}/memoria`, { memoria: fs.readFileSync(a[i + 1], "utf8") });
      console.log(`Memória de ${c.nome} atualizada.`);
    } else console.log(api("GET", `/clientes/${c.id}/memoria`).memoria);
  } else if (cmd === "arquivos") {
    const c = acharCliente(a[0]);
    const lista = api("GET", `/clientes/${c.id}/arquivos`).filter((x) => !a[1] || x.pasta === a[1]);
    console.log(
      lista.length
        ? lista.map((x) => `#${x.id}  [${x.pasta}]  ${x.nome}  ${x.tipo === "link" ? "(link do Drive: " + x.url + ")" : tam(x.tamanho)}  ${String(x.criado_em).slice(0, 10)}`).join("\n")
        : "(nenhum arquivo)"
    );
  } else if (cmd === "baixar") {
    const [x] = api("GET", `/arquivos?ids=${Number(a[0])}`);
    if (!x) throw new Error(`Arquivo #${a[0]} não encontrado.`);
    if (x.tipo === "link") {
      const c = api("GET", `/clientes/${x.cliente_id}/arquivos`).find((y) => y.id === x.id);
      console.log(`#${x.id} é um link do Google Drive: ${c?.url}\nListe com: python3 scripts/drive_listar.py "<link>" e baixe só o necessário com gdown.`);
    } else {
      const dir = path.resolve(a[1] || "referencias");
      fs.mkdirSync(dir, { recursive: true });
      const alvo = path.join(dir, x.nome);
      curl([`${BASE}/api/arquivos/${x.id}/conteudo?baixar=1`], { saida: alvo });
      console.log(alvo);
    }
  } else if (cmd === "enviar") {
    const [ref, pasta, ...arquivos] = a;
    const c = acharCliente(ref);
    if (!arquivos.length) throw new Error("Informe os arquivos.");
    for (const arq of arquivos) {
      const tamanho = fs.statSync(arq).size;
      const { id } = api("POST", `/clientes/${c.id}/envios`, { pasta, nome: path.basename(arq), tamanho, origem: "Claude Code" });
      const fd = fs.openSync(arq, "r");
      const buf = Buffer.alloc(Math.min(PARTE, Math.max(tamanho, 1)));
      for (let off = 0; off < tamanho; ) {
        const n = fs.readSync(fd, buf, 0, Math.min(PARTE, tamanho - off), off);
        const r = JSON.parse(curl(["-X", "PUT", "-H", "Content-Type: application/octet-stream", "--data-binary", "@-", `${BASE}/api/envios/${id}?offset=${off}`], { corpo: buf.subarray(0, n) }));
        off = r.recebido;
        process.stderr.write(`\r${path.basename(arq)}: ${Math.round((off / tamanho) * 100)}%`);
      }
      fs.closeSync(fd);
      const r = api("POST", `/envios/${id}/concluir`, {});
      process.stderr.write("\n");
      console.log(`#${r.id}  ${c.nome} / ${pasta} / ${path.basename(arq)}`);
    }
  } else if (cmd === "inicio") {
    const c = acharCliente(a[0]);
    console.log(api("POST", `/clientes/${c.id}/externos`, { titulo: a.slice(1).join(" ") }).id);
  } else if (cmd === "etapa") {
    api("PATCH", `/externos/${Number(a[0])}`, { etapa: a.slice(1).join(" ") });
  } else if (cmd === "fim") {
    api("PATCH", `/externos/${Number(a[0])}`, { status: a[1] || "ok", etapa: (a[1] || "ok") === "ok" ? "Concluído" : "Parou com erro", entregas: Number(a[2] || 0) });
  } else {
    console.log(fs.readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1, 15).join("\n"));
  }
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
