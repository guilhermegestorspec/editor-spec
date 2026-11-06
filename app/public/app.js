// Spec Studio — interface (sem build, JS puro).
const raiz = document.getElementById("raiz");
const estado = { eu: null, config: null, clientes: [], timers: [] };

// ---------- utilitários ----------
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

async function api(caminho, opcoes = {}) {
  const init = { method: opcoes.method || "GET", headers: { "X-Spec": "1" }, credentials: "same-origin" };
  if (opcoes.body instanceof FormData) init.body = opcoes.body;
  else if (opcoes.body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(opcoes.body);
  }
  const r = await fetch("/api" + caminho, init);
  const dados = await r.json().catch(() => ({}));
  if (r.status === 401 && caminho !== "/login") {
    estado.eu = null;
    location.hash = "#/login";
    throw new Error(dados.erro || "Sessão expirada.");
  }
  if (!r.ok) throw new Error(dados.erro || `Erro ${r.status}`);
  return dados;
}

function toast(msg, erro = false) {
  const t = document.createElement("div");
  t.className = "toast" + (erro ? " erro" : "");
  t.textContent = msg;
  document.body.append(t);
  setTimeout(() => t.remove(), 4200);
}

function tamanho(b) {
  if (!b) return "";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (b >= 1024 && i < u.length - 1) (b /= 1024), i++;
  return `${b.toFixed(i ? 1 : 0)} ${u[i]}`;
}

function quando(iso) {
  if (!iso) return "—";
  const d = new Date(iso.replace(" ", "T") + (iso.includes("Z") ? "" : "Z"));
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function limparTimers() {
  estado.timers.forEach(clearInterval);
  estado.timers = [];
}

function modal(titulo, conteudoHtml, { largo = false } = {}) {
  const d = document.createElement("dialog");
  if (largo) d.classList.add("largo");
  d.innerHTML = `<div class="cab"><h2>${esc(titulo)}</h2><button class="btn fantasma pequeno" data-fechar aria-label="Fechar">${ic.x}</button></div><div class="corpo">${conteudoHtml}</div>`;
  document.body.append(d);
  d.addEventListener("close", () => d.remove());
  d.querySelector("[data-fechar]").onclick = () => d.close();
  d.addEventListener("click", (e) => e.target === d && d.close());
  d.showModal();
  return d;
}

// ---------- ícones (traço, 24px) ----------
const svg = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const ic = {
  clientes: svg('<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 12l9 4 9-4"/><path d="M3 17l9 4 9-4"/>'),
  tarefas: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h6M7 17h8"/>'),
  usuarios: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 010 7M18.5 14.8c1.6.8 2.7 2.6 3 5.2"/>'),
  conta: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.2-6 8-6s7 2 8 6"/>'),
  sair: svg('<path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3"/><path d="M10 17l-5-5 5-5M5 12h11"/>'),
  mais: svg('<path d="M12 5v14M5 12h14"/>'),
  upload: svg('<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3"/>'),
  baixar: svg('<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 20h16"/>'),
  lixo: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  tesoura: svg('<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.6 7.6L20 18M8.6 16.4L20 6"/>'),
  formato: svg('<rect x="3" y="6" width="10" height="12" rx="1.5"/><rect x="15" y="3" width="6" height="18" rx="1.5"/>'),
  legenda: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 15h4M13 15h4M7 11h10"/>'),
  ia: svg('<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/>'),
  mover: svg('<path d="M3 7h6l2 2h10v10a1 1 0 01-1 1H4a1 1 0 01-1-1z"/><path d="M12 13h5M15 11l2 2-2 2"/>'),
  link: svg('<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>'),
};

const logo = (alt = "Spec marketing digital", sem = "") =>
  `<img class="logo-escuro" src="marca/logo-branco${sem}.svg" alt="${alt}"><img class="logo-claro" src="marca/logo-preto${sem}.svg" alt="${alt}">`;

const PASTAS = [
  { id: "brutos", nome: "Materiais brutos", desc: "Gravações e arquivos originais enviados pelo cliente ou pela equipe." },
  { id: "editados", nome: "Vídeos editados", desc: "Cortes, exportações, legendas e entregas finais." },
  { id: "graficos", nome: "Materiais gráficos", desc: "Posts, stories, thumbnails e banners." },
  { id: "referencias", nome: "Referências", desc: "Opcional: vídeos e imagens de inspiração (upload ou link)." },
];
const NOME_TAREFA = { cortar: "Corte", exportar: "Exportação", legendar: "Legendas", baixar: "Importação", grafico: "Peça gráfica", ia: "Assistente IA" };
const STATUS = { na_fila: "Na fila", rodando: "Processando", ok: "Concluída", erro: "Erro" };

// ---------- tema ----------
function temaAtual() {
  return document.documentElement.getAttribute("data-theme") || "auto";
}
function definirTema(t) {
  if (t === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
  try { localStorage.setItem("spec-tema", t); } catch {}
  document.querySelectorAll(".tema button").forEach((b) => b.classList.toggle("ativo", b.dataset.tema === t));
}
const seletorTema = () =>
  `<div class="tema" role="group" aria-label="Tema">${[["dark", "Escuro"], ["light", "Claro"], ["auto", "Auto"]]
    .map(([v, n]) => `<button type="button" data-tema="${v}" class="${temaAtual() === v ? "ativo" : ""}">${n}</button>`)
    .join("")}</div>`;
document.addEventListener("click", (e) => {
  const b = e.target.closest(".tema button");
  if (b) definirTema(b.dataset.tema);
});

// ---------- login ----------
function ondas() {
  let p = "";
  for (let i = 0; i < 9; i++) {
    const y = 60 + i * 48;
    p += `<path d="M-20 ${y} C 160 ${y - 70}, 300 ${y + 90 + i * 6}, 470 ${y + 20} S 760 ${y - 60 - i * 4}, 920 ${y + 30}"/>`;
  }
  return `<svg class="ondas" viewBox="0 0 900 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${p}</svg>`;
}

function telaLogin() {
  limparTimers();
  raiz.innerHTML = `
  <main class="login">
    <section class="login-arte">
      ${ondas()}
      <img src="marca/logo-branco.svg" alt="Spec marketing digital">
      <p class="pilares">Diferente <b>·</b> Confiável <b>·</b> Entusiasmo <b>·</b> Efetividade</p>
    </section>
    <section class="login-form">
      <form class="login-card" id="f-login">
        <span class="rotulo">Spec Studio</span>
        <h1>Editor e designer da Spec</h1>
        <p class="muted">Acesso exclusivo da equipe Spec.</p>
        <label>E-mail <input name="email" type="email" autocomplete="username" required autofocus></label>
        <label>Senha <input name="senha" type="password" autocomplete="current-password" required></label>
        <p class="erro-msg" id="erro" hidden></p>
        <button class="btn primario" type="submit">Entrar</button>
        <div>${seletorTema()}</div>
      </form>
    </section>
  </main>`;
  document.getElementById("f-login").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      await api("/login", { method: "POST", body: { email: f.get("email"), senha: f.get("senha") } });
      await iniciar();
      location.hash = "#/clientes";
    } catch (err) {
      const el = document.getElementById("erro");
      el.textContent = err.message;
      el.hidden = false;
    } finally {
      btn.disabled = false;
    }
  };
}

// ---------- casca do app ----------
function casca(ativo, conteudo) {
  const eu = estado.eu;
  const item = (href, nome, icone, id) =>
    `<a href="${href}" class="${ativo === id ? "ativo" : ""}">${icone}<span>${nome}</span></a>`;
  raiz.innerHTML = `
  <div class="app" id="app">
    <aside class="sidebar">
      <div class="marca">${logo("Spec", "-sem-tag")}<small>Studio</small></div>
      <nav class="nav">
        ${item("#/clientes", "Clientes", ic.clientes, "clientes")}
        ${item("#/tarefas", "Tarefas", ic.tarefas, "tarefas")}
        ${eu.papel === "admin" ? item("#/usuarios", "Usuários e acessos", ic.usuarios, "usuarios") : ""}
        ${item("#/conta", "Minha conta", ic.conta, "conta")}
      </nav>
      <div class="rodape">
        ${seletorTema()}
        <div class="usuario"><span class="avatar">${esc(eu.nome[0] || "?").toUpperCase()}</span>
          <div><b>${esc(eu.nome)}</b><span>${eu.papel === "admin" ? "Administrador" : "Editor"}</span></div></div>
        <button class="btn fantasma" id="sair">${ic.sair} Sair</button>
      </div>
    </aside>
    <div>
      <div class="barra-movel"><img class="logo-escuro" src="marca/logo-branco-sem-tag.svg" alt="Spec"><img class="logo-claro" src="marca/logo-preto-sem-tag.svg" alt="Spec">
        <button class="btn fantasma" id="abrir-menu" aria-label="Menu">${ic.menu}</button></div>
      <main class="main" id="conteudo">${conteudo}</main>
    </div>
  </div>`;
  document.getElementById("sair").onclick = async () => {
    await api("/logout", { method: "POST" }).catch(() => {});
    estado.eu = null;
    location.hash = "#/login";
  };
  const app = document.getElementById("app");
  document.getElementById("abrir-menu").onclick = (e) => {
    e.stopPropagation();
    app.classList.toggle("menu-aberto");
  };
  document.querySelector(".main").addEventListener("click", () => app.classList.remove("menu-aberto"));
  return document.getElementById("conteudo");
}

// ---------- clientes ----------
async function telaClientes() {
  const el = casca("clientes", `<p class="muted">Carregando…</p>`);
  estado.clientes = await api("/clientes");
  el.innerHTML = `
    <div class="topo">
      <div class="titulo"><span class="rotulo">Carteira</span><h1>Clientes</h1></div>
      <button class="btn primario" id="novo">${ic.mais} Novo cliente</button>
    </div>
    ${
      estado.clientes.length
        ? `<div class="grade-clientes">${estado.clientes
            .map(
              (c) => `
          <a class="card cliente-card" href="#/cliente/${c.id}/brutos">
            <div class="inicial" style="background:${esc(c.cor_primaria)};color:${esc(c.cor_fundo)}">${esc(c.nome[0]).toUpperCase()}</div>
            <div><h3>${esc(c.nome)}</h3><p class="muted small">${esc(c.nicho || "Sem nicho definido")}</p></div>
            <div class="acoes" style="justify-content:space-between">
              <div class="faixa"><span style="background:${esc(c.cor_primaria)}"></span><span style="background:${esc(c.cor_secundaria)}"></span><span style="background:${esc(c.cor_fundo)}"></span></div>
              <span class="badge">${c.total_arquivos} arquivo${c.total_arquivos === 1 ? "" : "s"}</span>
            </div>
          </a>`
            )
            .join("")}</div>`
        : `<div class="vazio"><img src="marca/icone-verde.svg" alt=""><h3>Nenhum cliente ainda</h3><p>Cadastre o primeiro cliente para organizar brutos, editados, gráficos e referências.</p></div>`
    }`;
  document.getElementById("novo").onclick = () => formCliente();
}

function formCliente(c = null) {
  const v = c || { nome: "", nicho: "", cor_primaria: "#00f28a", cor_secundaria: "#ffffff", cor_fundo: "#222222", fonte: "Ubuntu", observacoes: "" };
  const d = modal(
    c ? "Editar cliente" : "Novo cliente",
    `<form class="grid-form" id="f-cliente">
      <label class="cheia">Nome <input name="nome" required value="${esc(v.nome)}"></label>
      <label>Nicho <input name="nicho" placeholder="Ex.: odontologia, moda, imobiliária" value="${esc(v.nicho || "")}"></label>
      <label>Fonte da marca <input name="fonte" value="${esc(v.fonte || "")}"></label>
      <label>Cor primária <input type="color" name="cor_primaria" value="${esc(v.cor_primaria)}"></label>
      <label>Cor secundária <input type="color" name="cor_secundaria" value="${esc(v.cor_secundaria)}"></label>
      <label>Cor de fundo <input type="color" name="cor_fundo" value="${esc(v.cor_fundo)}"></label>
      <label class="cheia">Observações de marca (tom de voz, público, o que evitar)
        <textarea name="observacoes">${esc(v.observacoes || "")}</textarea></label>
      <p class="erro-msg cheia" id="erro" hidden></p>
      <div class="acoes cheia"><button class="btn primario">Salvar</button></div>
    </form>`
  );
  d.querySelector("form").onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    try {
      const r = c ? await api(`/clientes/${c.id}`, { method: "PATCH", body }) : await api("/clientes", { method: "POST", body });
      d.close();
      if (c) rota();
      else location.hash = `#/cliente/${r.id}/brutos`;
    } catch (err) {
      const el = d.querySelector("#erro");
      el.textContent = err.message;
      el.hidden = false;
    }
  };
}

// ---------- cliente ----------
async function telaCliente(id, aba) {
  const el = casca("clientes", `<p class="muted">Carregando…</p>`);
  const clientes = await api("/clientes");
  const c = clientes.find((x) => x.id === Number(id));
  if (!c) {
    el.innerHTML = `<div class="vazio"><h3>Cliente não encontrado</h3><a class="btn" href="#/clientes">Voltar</a></div>`;
    return;
  }
  const arquivos = await api(`/clientes/${c.id}/arquivos`);
  const conta = (p) => arquivos.filter((a) => a.pasta === p).length;
  const abas = [
    ...PASTAS.map((p) => [p.id, p.nome.replace("Materiais ", "").replace(/^\w/, (x) => x.toUpperCase()), conta(p.id)]),
    ["criar", "Criar peça", null],
    ["ia", "Assistente IA", null],
    ["tarefas", "Tarefas", null],
  ];
  el.innerHTML = `
    <div class="topo">
      <div class="titulo">
        <a href="#/clientes" class="small">← Clientes</a>
        <h1>${esc(c.nome)}</h1>
        <p class="muted">${esc(c.nicho || "Sem nicho definido")}</p>
      </div>
      <div class="acoes">
        <button class="btn" id="editar">Marca e dados</button>
        ${estado.eu.papel === "admin" ? `<button class="btn perigo" id="excluir">${ic.lixo} Excluir</button>` : ""}
      </div>
    </div>
    <nav class="abas">${abas
      .map(([k, n, q]) => `<a href="#/cliente/${c.id}/${k}" class="${aba === k ? "ativo" : ""}">${n}${q !== null ? `<span class="cont">${q}</span>` : ""}</a>`)
      .join("")}</nav>
    <section id="aba"></section>`;
  document.getElementById("editar").onclick = () => formCliente(c);
  const ex = document.getElementById("excluir");
  if (ex)
    ex.onclick = async () => {
      if (!confirm(`Excluir ${c.nome} e TODOS os arquivos dele? Isso não pode ser desfeito.`)) return;
      await api(`/clientes/${c.id}`, { method: "DELETE" });
      location.hash = "#/clientes";
    };
  const alvo = document.getElementById("aba");
  if (PASTAS.some((p) => p.id === aba)) return abaPasta(alvo, c, aba, arquivos.filter((a) => a.pasta === aba));
  if (aba === "criar") return abaCriar(alvo, c, arquivos);
  if (aba === "ia") return abaIA(alvo, c, arquivos);
  if (aba === "tarefas") return listaTarefas(alvo, c.id);
  location.hash = `#/cliente/${c.id}/brutos`;
}

const urlArquivo = (a, baixar) => `/api/arquivos/${a.id}/conteudo${baixar ? "?baixar=1" : ""}`;

function midia(a) {
  if (a.tipo === "imagem") return `<img src="${urlArquivo(a)}" alt="" loading="lazy">`;
  if (a.tipo === "video") return `<video src="${urlArquivo(a)}#t=0.5" preload="metadata" muted playsinline></video><span class="play"></span>`;
  const ext = a.nome.split(".").pop();
  return `<span class="tipo">${esc(a.tipo === "audio" ? "áudio" : ext)}</span>`;
}

function abaPasta(alvo, c, pasta, arquivos) {
  const info = PASTAS.find((p) => p.id === pasta);
  alvo.innerHTML = `
    <div style="display:grid;gap:18px">
      <p class="muted">${info.desc}</p>
      <div class="dropzone" id="drop">
        ${ic.upload.replace("<svg", '<svg width="22" height="22"')}
        <span>Arraste arquivos aqui ou</span>
        <label class="btn primario" style="display:inline-flex">Escolher arquivos<input type="file" multiple hidden id="inp"></label>
        <button class="btn" id="por-link">${ic.link} Importar por link</button>
      </div>
      ${
        arquivos.length
          ? `<div class="grade-arquivos">${arquivos.map((a) => cartaoArquivo(a)).join("")}</div>`
          : `<div class="vazio"><p>Nenhum arquivo em ${info.nome.toLowerCase()}.</p></div>`
      }
    </div>`;

  const enviar = (files) => enfileirarEnvios(c, pasta, files);
  document.getElementById("inp").onchange = (e) => enviar(e.target.files);
  const drop = document.getElementById("drop");
  drop.ondragover = (e) => (e.preventDefault(), drop.classList.add("sobre"));
  drop.ondragleave = () => drop.classList.remove("sobre");
  drop.ondrop = (e) => {
    e.preventDefault();
    drop.classList.remove("sobre");
    enviar(e.dataTransfer.files);
  };
  const porLink = document.getElementById("por-link");
  if (porLink)
    porLink.onclick = () => {
      const d = modal(
        `Importar para ${info.nome}`,
        `<form class="grid-form" id="f"><label class="cheia">Link
          <input name="url" type="url" required placeholder="https://drive.google.com/…"></label>
          <div class="cheia small muted" style="display:grid;gap:6px">
            <p><b style="color:var(--text)">Google Drive:</b> link de um arquivo ou de uma pasta inteira (subpastas incluídas).
              No Drive, o compartilhamento precisa estar em <b>“Qualquer pessoa com o link”</b>.</p>
            <p><b style="color:var(--text)">Vídeos:</b> YouTube, Instagram, TikTok, Vimeo ou link direto. Algumas redes bloqueiam
              downloads de servidores; nesse caso, envie o arquivo manualmente.</p>
          </div>
          <div class="acoes cheia"><button class="btn primario">Importar</button></div></form>`
      );
      d.querySelector("form").onsubmit = async (e) => {
        e.preventDefault();
        await criarTarefa(c.id, "baixar", { url: new FormData(e.target).get("url"), pasta }, d);
      };
    };
  if (arquivos.some((a) => a.status && a.status !== "ok")) estado.timers.push(setInterval(() => atualizarSeVisivel(c.id, pasta), 5000));
  alvo.querySelectorAll("[data-arquivo]").forEach((card) => {
    const a = arquivos.find((x) => x.id === Number(card.dataset.arquivo));
    card.querySelector(".midia").onclick = () => verArquivo(a);
    card.querySelectorAll("[data-acao]").forEach((b) => (b.onclick = () => acaoArquivo(b.dataset.acao, a, c)));
  });
}

function cartaoArquivo(a) {
  const video = a.tipo === "video";
  return `<article class="card arquivo" data-arquivo="${a.id}">
    <div class="midia" title="Abrir">${midia(a)}</div>
    <div class="info">
      <div class="nome">${esc(a.nome)}</div>
      ${a.status === "enviando" ? `<span class="badge rodando">Subindo para o Google Drive…</span>` : ""}
      ${a.status === "erro_envio" ? `<span class="badge na_fila">Reenviando ao Google Drive…</span>` : ""}
      <div class="meta">${tamanho(a.tamanho)} · ${quando(a.criado_em)}${a.autor ? " · " + esc(a.autor) : ""}${a.origem && a.origem !== "upload" ? `<br>${esc(a.origem)}` : ""}</div>
      <div class="acoes">
        ${video ? `<button class="btn pequeno" data-acao="cortar" title="Cortar">${ic.tesoura}</button>
        <button class="btn pequeno" data-acao="exportar" title="Exportar formato">${ic.formato}</button>` : ""}
        ${video || a.tipo === "audio" ? `<button class="btn pequeno" data-acao="legendar" title="Legendas automáticas">${ic.legenda}</button>` : ""}
        <a class="btn pequeno" href="${urlArquivo(a, true)}" title="Baixar">${ic.baixar}</a>
        <button class="btn pequeno" data-acao="mover" title="Mover de pasta">${ic.mover}</button>
        <button class="btn pequeno perigo" data-acao="excluir" title="Excluir">${ic.lixo}</button>
      </div>
    </div>
  </article>`;
}

function verArquivo(a) {
  let corpo;
  if (a.tipo === "video") corpo = `<video src="${urlArquivo(a)}" controls autoplay playsinline></video>`;
  else if (a.tipo === "imagem") corpo = `<img src="${urlArquivo(a)}" alt="${esc(a.nome)}">`;
  else if (a.tipo === "audio") corpo = `<audio src="${urlArquivo(a)}" controls autoplay style="width:100%"></audio>`;
  else corpo = `<p class="muted">Pré-visualização indisponível.</p>`;
  modal(a.nome, `${corpo}<div class="acoes"><a class="btn primario" href="${urlArquivo(a, true)}">${ic.baixar} Baixar</a></div>`, { largo: true });
}

async function criarTarefa(clienteId, tipo, params, dialogo) {
  try {
    const r = await api(`/clientes/${clienteId}/tarefas`, { method: "POST", body: { tipo, params } });
    dialogo?.close();
    toast(`${NOME_TAREFA[tipo]} enviada para a fila (#${r.id}). Acompanhe em Tarefas.`);
    return r;
  } catch (err) {
    toast(err.message, true);
  }
}

function acaoArquivo(acao, a, c) {
  const cfg = estado.config;
  if (acao === "excluir") {
    if (!confirm(`Excluir "${a.nome}"?`)) return;
    return api(`/arquivos/${a.id}`, { method: "DELETE" }).then(rota).catch((e) => toast(e.message, true));
  }
  if (acao === "mover") {
    const d = modal(
      "Mover arquivo",
      `<form class="grid-form"><label class="cheia">Para a pasta <select name="pasta">${PASTAS.filter((p) => p.id !== a.pasta)
        .map((p) => `<option value="${p.id}">${p.nome}</option>`)
        .join("")}</select></label><div class="acoes cheia"><button class="btn primario">Mover</button></div></form>`
    );
    d.querySelector("form").onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api(`/arquivos/${a.id}`, { method: "PATCH", body: { pasta: new FormData(e.target).get("pasta") } });
        d.close();
        rota();
      } catch (err) {
        toast(err.message, true);
      }
    };
    return;
  }
  if (acao === "cortar") {
    const d = modal(
      "Cortar vídeo",
      `<video src="${urlArquivo(a)}" controls playsinline id="v"></video>
      <form class="grid-form">
        <label>Início <input name="inicio" value="00:00:00" required pattern="[0-9:.]+"></label>
        <label>Fim <input name="fim" value="00:00:15" required pattern="[0-9:.]+"></label>
        <div class="acoes cheia">
          <button type="button" class="btn" data-marcar="inicio">Marcar início no ponto atual</button>
          <button type="button" class="btn" data-marcar="fim">Marcar fim no ponto atual</button>
          <button class="btn primario">Cortar</button>
        </div>
      </form>`,
      { largo: true }
    );
    const v = d.querySelector("#v");
    const fmt = (s) => new Date(s * 1000).toISOString().slice(11, 22);
    d.querySelectorAll("[data-marcar]").forEach((b) => (b.onclick = () => (d.querySelector(`[name=${b.dataset.marcar}]`).value = fmt(v.currentTime))));
    d.querySelector("form").onsubmit = (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      criarTarefa(c.id, "cortar", { arquivo_id: a.id, ...f }, d);
    };
    return;
  }
  if (acao === "exportar") {
    const d = modal(
      "Exportar para formato",
      `<form class="grid-form">
        <label class="cheia">Formato <select name="formato">${Object.entries(cfg.formatosVideo)
          .map(([k, f]) => `<option value="${k}">${esc(f.nome)} — ${f.w}x${f.h}</option>`)
          .join("")}</select></label>
        <label class="cheia">Enquadramento <select name="modo">
          <option value="desfoque">Encaixar com fundo desfocado (não corta nada)</option>
          <option value="cortar">Preencher cortando as bordas</option></select></label>
        <label class="check cheia"><input type="checkbox" name="normalizar" checked> Normalizar áudio (-14 LUFS, padrão das redes)</label>
        <div class="acoes cheia"><button class="btn primario">Exportar</button></div>
      </form>`
    );
    d.querySelector("form").onsubmit = (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      criarTarefa(c.id, "exportar", { arquivo_id: a.id, formato: f.get("formato"), modo: f.get("modo"), normalizar: f.get("normalizar") === "on" }, d);
    };
    return;
  }
  if (acao === "legendar") {
    const d = modal(
      "Legendas automáticas (Whisper)",
      `<form class="grid-form">
        <label>Idioma <select name="idioma"><option value="pt">Português</option><option value="en">Inglês</option><option value="es">Espanhol</option></select></label>
        <label>Precisão <select name="modelo">${cfg.modelosWhisper
          .map((m) => `<option ${m === "small" ? "selected" : ""}>${m}</option>`)
          .join("")}</select></label>
        <p class="muted small cheia">tiny/base: rápido · small: equilibrado · medium/large-v3: máxima precisão (mais lento).</p>
        ${a.tipo === "video" ? `<label class="check cheia"><input type="checkbox" name="queimar" checked> Gerar também o vídeo com a legenda aplicada</label>` : ""}
        <div class="acoes cheia"><button class="btn primario">Gerar legendas</button></div>
      </form>`
    );
    d.querySelector("form").onsubmit = (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      criarTarefa(c.id, "legendar", { arquivo_id: a.id, idioma: f.get("idioma"), modelo: f.get("modelo"), queimar: f.get("queimar") === "on" }, d);
    };
  }
}

// ---------- envios em segundo plano ----------
// Os uploads ficam fora da tela atual: dá para trocar de aba, de cliente ou de página do sistema
// e eles continuam. Só fechar/recarregar a aba do navegador interrompe (o sistema avisa).
const envios = { itens: [], ativos: 0, max: 3, minimizado: false, timerDesenho: null, timerLista: null };
const pendentesEnvio = () => envios.itens.filter((i) => i.status === "fila" || i.status === "enviando");

function enfileirarEnvios(cliente, pasta, files) {
  if (!files || !files.length) return;
  for (const file of files)
    envios.itens.push({ id: Math.random().toString(36).slice(2), clienteId: cliente.id, cliente: cliente.nome, pasta, file, nome: file.name, total: file.size, enviado: 0, status: "fila" });
  envios.minimizado = false;
  processarEnvios();
}

function processarEnvios() {
  while (envios.ativos < envios.max) {
    const it = envios.itens.find((i) => i.status === "fila");
    if (!it) break;
    enviarItem(it);
  }
  desenharEnvios();
}

// Envia em partes: cada parte tem até 5 tentativas; se a conexão cair, retoma de onde parou.
function putParte(url, blob, onProgresso, registrar) {
  return new Promise((ok, falha) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("X-Spec", "1");
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgresso(e.loaded);
    xhr.onload = () => {
      let dados = {};
      try { dados = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status === 200 || xhr.status === 409) return ok(dados);
      const err = new Error(dados.erro || `Erro ${xhr.status}`);
      err.definitivo = xhr.status === 400 || xhr.status === 401 || xhr.status === 404 || xhr.status === 413;
      falha(err);
    };
    xhr.onerror = () => falha(new Error("Falha de conexão"));
    xhr.onabort = () => falha(Object.assign(new Error("Cancelado"), { definitivo: true }));
    registrar(xhr);
    xhr.send(blob);
  });
}

async function enviarItem(it) {
  envios.ativos++;
  it.status = "enviando";
  it.cancelado = false;
  let erro = null;
  try {
    const inicio = await api(`/clientes/${it.clienteId}/envios`, { method: "POST", body: { pasta: it.pasta, nome: it.nome, tamanho: it.file.size } });
    const parte = inicio.parte;
    let pos = 0;
    while (pos < it.file.size) {
      const blob = it.file.slice(pos, pos + parte);
      let tentativa = 0;
      for (;;) {
        if (it.cancelado) throw Object.assign(new Error("Cancelado"), { definitivo: true });
        try {
          const r = await putParte(
            `/api/envios/${inicio.id}?offset=${pos}`,
            blob,
            (n) => {
              it.enviado = pos + n;
              agendarDesenho();
            },
            (xhr) => (it.abortar = () => xhr.abort())
          );
          pos = r.recebido; // o servidor diz até onde recebeu (resolve respostas perdidas)
          it.enviado = pos;
          it.tentando = false;
          break;
        } catch (e) {
          if (e.definitivo || ++tentativa > 5) throw e;
          it.tentando = true;
          agendarDesenho();
          await new Promise((ok) => setTimeout(ok, Math.min(2000 * 2 ** tentativa, 30000)));
        }
      }
      agendarDesenho();
    }
    await api(`/envios/${inicio.id}/concluir`, { method: "POST", body: {} });
  } catch (e) {
    erro = e.message || "Falha no envio";
  }
  envios.ativos--;
  it.status = erro ? "erro" : "ok";
  it.erro = erro;
  it.abortar = null;
  if (!erro) {
    it.file = null;
    it.enviado = it.total;
    atualizarSeVisivel(it.clienteId, it.pasta);
  }
  if (!pendentesEnvio().length) {
    const ok = envios.itens.filter((i) => i.status === "ok").length;
    const falhas = envios.itens.filter((i) => i.status === "erro").length;
    toast(falhas ? `${ok} enviado(s), ${falhas} com erro.` : `${ok} arquivo(s) enviado(s).`, falhas > 0);
  }
  processarEnvios();
}

function atualizarSeVisivel(clienteId, pasta) {
  // só recarrega a lista se a pessoa estiver olhando exatamente essa pasta
  if (location.hash !== `#/cliente/${clienteId}/${pasta}`) return;
  if (document.querySelector("dialog[open]")) return;
  clearTimeout(envios.timerLista);
  envios.timerLista = setTimeout(() => location.hash === `#/cliente/${clienteId}/${pasta}` && rota(), 800);
}

function agendarDesenho() {
  if (envios.timerDesenho) return;
  envios.timerDesenho = setTimeout(() => {
    envios.timerDesenho = null;
    desenharEnvios();
  }, 250);
}

function desenharEnvios() {
  let painel = document.getElementById("envios");
  if (!envios.itens.length) return painel?.remove();
  if (!painel) {
    painel = document.createElement("section");
    painel.id = "envios";
    painel.className = "envios";
    document.body.append(painel);
    painel.addEventListener("click", (e) => {
      const b = e.target.closest("[data-env]");
      if (!b) return;
      const it = envios.itens.find((i) => i.id === b.dataset.id);
      const acao = b.dataset.env;
      if (acao === "min") envios.minimizado = !envios.minimizado;
      if (acao === "limpar") envios.itens = pendentesEnvio();
      if (acao === "cancelar" && it) {
        if (it.status === "enviando") (it.cancelado = true), it.abortar && it.abortar();
        else if (it.status === "fila") (it.status = "erro"), (it.erro = "Cancelado");
      }
      if (acao === "repetir" && it && it.file) (it.status = "fila"), (it.enviado = 0), (it.erro = null);
      processarEnvios();
    });
  }
  const pend = pendentesEnvio();
  const total = envios.itens.reduce((t, i) => t + (i.total || 0), 0) || 1;
  const feito = envios.itens.reduce((t, i) => t + (i.status === "ok" ? i.total : i.enviado || 0), 0);
  const pct = Math.round((feito / total) * 100);
  const titulo = pend.length ? `Enviando ${pend.length} arquivo${pend.length > 1 ? "s" : ""} · ${pct}%` : "Envios concluídos";
  painel.innerHTML = `
    <div class="env-cab">
      <b>${titulo}</b>
      <div class="acoes">
        ${pend.length ? "" : `<button class="btn pequeno fantasma" data-env="limpar">Limpar</button>`}
        <button class="btn pequeno fantasma" data-env="min" aria-label="${envios.minimizado ? "Expandir" : "Minimizar"}">${envios.minimizado ? "▴" : "▾"}</button>
      </div>
    </div>
    <div class="progresso"><div style="width:${pct}%"></div></div>
    ${
      envios.minimizado
        ? ""
        : `<ul class="env-lista">${envios.itens
            .slice()
            .reverse()
            .map((i) => {
              const p = i.status === "ok" ? 100 : Math.round(((i.enviado || 0) / (i.total || 1)) * 100);
              const st = { fila: "Na fila", enviando: i.tentando ? "Reconectando…" : `${p}%`, ok: "Enviado", erro: esc(i.erro || "Erro") }[i.status];
              return `<li>
                <div class="env-nome"><span>${esc(i.nome)}</span><small>${esc(i.cliente)} · ${esc(PASTAS.find((x) => x.id === i.pasta)?.nome || i.pasta)}</small></div>
                <div class="env-status ${i.status}">${st}
                  ${i.status === "fila" || i.status === "enviando" ? `<button class="btn pequeno fantasma" data-env="cancelar" data-id="${i.id}" aria-label="Cancelar">${ic.x}</button>` : ""}
                  ${i.status === "erro" && i.file ? `<button class="btn pequeno fantasma" data-env="repetir" data-id="${i.id}">Tentar de novo</button>` : ""}
                </div>
                ${i.status === "enviando" ? `<div class="progresso fino"><div style="width:${p}%"></div></div>` : ""}
              </li>`;
            })
            .join("")}</ul>`
    }`;
}

window.addEventListener("beforeunload", (e) => {
  if (pendentesEnvio().length) {
    e.preventDefault();
    e.returnValue = "";
  }
});

// ---------- criar peça ----------
function abaCriar(alvo, c, arquivos) {
  const cfg = estado.config;
  const imagens = arquivos.filter((a) => a.tipo === "imagem");
  alvo.innerHTML = `
  <div class="dupla">
    <form class="card grid-form" id="f-peca">
      <span class="rotulo cheia">Peça com a marca do cliente</span>
      <label class="cheia">Formato <select name="formato">${Object.entries(cfg.formatosGrafico)
        .map(([k, f]) => `<option value="${k}">${esc(f.nome)}</option>`)
        .join("")}</select></label>
      <label class="cheia">Título <input name="titulo" required maxlength="200" value="Sua chamada principal aqui"></label>
      <label class="cheia">Subtítulo <input name="subtitulo" maxlength="300" value="Uma frase de apoio curta e direta."></label>
      <label>Botão / CTA <input name="cta" maxlength="60" value="Saiba mais"></label>
      <label>Layout <select name="layout"><option value="centro">Centralizado</option><option value="esquerda">Alinhado à esquerda</option><option value="base">Texto na base</option></select></label>
      <label class="cheia">Imagem de fundo (da biblioteca) <select name="imagem_id"><option value="">Sem imagem — usar cores da marca</option>${imagens
        .map((a) => `<option value="${a.id}">${esc(a.nome)}</option>`)
        .join("")}</select></label>
      <label class="check cheia"><input type="checkbox" name="animado"> Versão animada em vídeo (anúncio de 3s em MP4)</label>
      <div class="acoes cheia"><button class="btn primario">${ic.mais} Gerar peça</button>
        <span class="muted small">PNG vai para Gráficos; animado vai para Editados.</span></div>
    </form>
    <div class="card" style="display:grid;gap:12px">
      <span class="rotulo">Pré-visualização aproximada</span>
      <div class="previa" id="previa"></div>
      <p class="muted small">A arte final é renderizada pelo Remotion com as cores de ${esc(c.nome)}. Para peças mais elaboradas, use o Assistente IA.</p>
    </div>
  </div>`;
  const f = document.getElementById("f-peca");
  const atualizar = () => {
    const v = Object.fromEntries(new FormData(f));
    const { w, h } = cfg.formatosGrafico[v.formato];
    const p = document.getElementById("previa");
    p.style.aspectRatio = `${w}/${h}`;
    p.style.maxWidth = `${Math.min(520 * (w / h), 640)}px`;
    p.style.background = c.cor_fundo;
    p.style.color = c.cor_secundaria;
    p.style.backgroundImage = v.imagem_id ? `linear-gradient(rgba(0,0,0,.25), rgba(0,0,0,.65)), url(/api/arquivos/${v.imagem_id}/conteudo)` : "";
    p.style.textAlign = v.layout === "centro" ? "center" : "left";
    p.style.alignContent = v.layout === "base" ? "end" : "center";
    p.innerHTML = `<span class="p-marca" style="color:${esc(c.cor_primaria)}">${esc(c.nome)}</span>
      <div class="p-titulo">${esc(v.titulo)}</div>${v.subtitulo ? `<div class="p-sub">${esc(v.subtitulo)}</div>` : ""}
      ${v.cta ? `<div class="p-cta" style="background:${esc(c.cor_primaria)};color:${esc(c.cor_fundo)};${v.layout === "centro" ? "justify-self:center" : ""}">${esc(v.cta)}</div>` : ""}`;
  };
  f.oninput = atualizar;
  atualizar();
  f.onsubmit = (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f));
    criarTarefa(c.id, "grafico", { ...v, imagem_id: v.imagem_id ? Number(v.imagem_id) : null, animado: v.animado === "on" });
  };
}

// ---------- assistente IA ----------
function abaIA(alvo, c, arquivos) {
  const ativa = estado.config.iaAtiva;
  const sugestoes = [
    "Edite um anúncio de 30s para Meta Ads (Reels 9:16) a partir do bruto selecionado, com cortes dinâmicos, legendas animadas e CTA no final.",
    "Crie um vídeo para YouTube 16:9 com abertura com a marca do cliente, legendas e trilha de fundo.",
    "Corte os 3 melhores momentos do bruto em Shorts de até 45s com legendas.",
    "Crie um carrossel de 5 lâminas 4:5 para Instagram sobre o tema do vídeo selecionado.",
    "Crie 3 variações de criativo estático para Meta Ads (1:1, 4:5 e 9:16) com a identidade do cliente.",
    "Analise a referência selecionada e reproduza o estilo de edição no nosso bruto.",
  ];
  alvo.innerHTML = `
  <div class="dupla">
    <form class="card grid-form" id="f-ia">
      <span class="rotulo cheia">Pedido ao editor IA</span>
      ${ativa ? "" : `<p class="erro-msg cheia">O assistente está desativado: o administrador precisa configurar ANTHROPIC_API_KEY no servidor.</p>`}
      <label class="cheia">O que você quer produzir?
        <textarea name="pedido" required minlength="5" placeholder="Descreva a peça: formato, duração, objetivo, estilo, texto, CTA…"></textarea></label>
      <div class="sugestoes cheia">${sugestoes.map((s) => `<button type="button">${esc(s)}</button>`).join("")}</div>
      <div class="acoes cheia"><button class="btn primario" ${ativa ? "" : "disabled"}>${ic.ia} Enviar para o assistente</button></div>
      <p class="muted small cheia">O assistente usa as skills instaladas (Remotion, HyperFrames, FFmpeg, Whisper, yt-dlp) e a marca do cliente. As entregas voltam para Editados ou Gráficos.</p>
    </form>
    <div class="card" style="display:grid;gap:10px">
      <span class="rotulo">Arquivos de entrada</span>
      ${
        arquivos.length
          ? `<div class="lista-escolha">${arquivos
              .map((a) => `<label><input type="checkbox" value="${a.id}"> <span>${esc(a.nome)} <span class="muted small">· ${PASTAS.find((p) => p.id === a.pasta).nome}</span></span></label>`)
              .join("")}</div>`
          : `<p class="muted">Envie brutos ou referências primeiro.</p>`
      }
    </div>
  </div>`;
  const f = document.getElementById("f-ia");
  f.querySelectorAll(".sugestoes button").forEach((b) => (b.onclick = () => (f.pedido.value = b.textContent)));
  f.onsubmit = async (e) => {
    e.preventDefault();
    const ids = [...alvo.querySelectorAll(".lista-escolha input:checked")].map((i) => Number(i.value));
    const r = await criarTarefa(c.id, "ia", { pedido: f.pedido.value, arquivo_ids: ids });
    if (r) location.hash = `#/cliente/${c.id}/tarefas`;
  };
}

// ---------- tarefas ----------
function resumoTarefa(t) {
  const p = JSON.parse(t.params || "{}");
  if (t.tipo === "exportar") return estado.config.formatosVideo[p.formato]?.nome || p.formato;
  if (t.tipo === "cortar") return `${p.inicio} → ${p.fim}`;
  if (t.tipo === "legendar") return `${p.idioma} · ${p.modelo}${p.queimar ? " · aplicada" : ""}`;
  if (t.tipo === "baixar") return p.url;
  if (t.tipo === "grafico") return `${p.titulo} · ${p.formato}${p.animado ? " · animado" : ""}`;
  if (t.tipo === "ia") return p.pedido;
  return "";
}

async function listaTarefas(alvo, clienteId) {
  const desenhar = async () => {
    const tarefas = await api(`/tarefas${clienteId ? `?cliente_id=${clienteId}` : ""}`);
    alvo.innerHTML = tarefas.length
      ? `<div class="card rolagem" style="padding:14px 8px"><table class="tabela">
        <thead><tr><th>#</th><th>Tipo</th>${clienteId ? "" : "<th>Cliente</th>"}<th>Detalhes</th><th>Status</th><th>Quem</th><th>Quando</th><th></th></tr></thead>
        <tbody>${tarefas
          .map(
            (t) => `<tr>
            <td class="muted">${t.id}</td><td><b>${NOME_TAREFA[t.tipo] || t.tipo}</b></td>
            ${clienteId ? "" : `<td><a href="#/cliente/${t.cliente_id}/editados">${esc(t.cliente)}</a></td>`}
            <td style="max-width:340px" class="small">${esc(resumoTarefa(t)).slice(0, 160)}</td>
            <td><span class="badge ${t.status}">${STATUS[t.status]}</span></td>
            <td class="small">${esc(t.autor || "")}</td><td class="small muted">${quando(t.criado_em)}</td>
            <td><button class="btn pequeno" data-log="${t.id}">Ver</button></td></tr>`
          )
          .join("")}</tbody></table></div>`
      : `<div class="vazio"><p>Nenhuma tarefa ainda. Use as ações nos arquivos, “Criar peça” ou o Assistente IA.</p></div>`;
    alvo.querySelectorAll("[data-log]").forEach((b) => (b.onclick = () => verLog(Number(b.dataset.log))));
    return tarefas.some((t) => ["na_fila", "rodando"].includes(t.status));
  };
  const ativo = await desenhar();
  if (ativo) estado.timers.push(setInterval(desenhar, 4000));
}

async function verLog(id) {
  const t = await api(`/tarefas/${id}`);
  const d = modal(`Tarefa #${id} · ${NOME_TAREFA[t.tipo]}`, `<div class="acoes"><span class="badge ${t.status}" id="st">${STATUS[t.status]}</span><span id="res"></span></div><pre class="log" id="log"></pre>`, { largo: true });
  const pintar = (t) => {
    const pre = d.querySelector("#log");
    const noFim = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 30;
    pre.textContent = t.log || "(aguardando…)";
    if (noFim) pre.scrollTop = pre.scrollHeight;
    const st = d.querySelector("#st");
    st.className = `badge ${t.status}`;
    st.textContent = STATUS[t.status];
    const r = t.resultado ? JSON.parse(t.resultado) : null;
    if (r?.arquivos?.length)
      d.querySelector("#res").innerHTML = r.arquivos.map((i) => `<a class="btn pequeno" href="/api/arquivos/${i}/conteudo?baixar=1">${ic.baixar} arquivo ${i}</a>`).join(" ");
  };
  pintar(t);
  const timer = setInterval(async () => {
    if (!d.open) return clearInterval(timer);
    const n = await api(`/tarefas/${id}`).catch(() => null);
    if (n) pintar(n);
    if (n && !["na_fila", "rodando"].includes(n.status)) clearInterval(timer);
  }, 2500);
  d.addEventListener("close", () => clearInterval(timer));
}

async function telaTarefas() {
  const el = casca("tarefas", `<div class="topo"><div class="titulo"><span class="rotulo">Produção</span><h1>Tarefas</h1></div></div><section id="lista"></section>`);
  await listaTarefas(el.querySelector("#lista"), null);
}

// ---------- usuários ----------
async function telaUsuarios() {
  if (estado.eu.papel !== "admin") return (location.hash = "#/clientes");
  const el = casca("usuarios", `<p class="muted">Carregando…</p>`);
  const us = await api("/usuarios");
  const dom = estado.config.dominio;
  el.innerHTML = `
    <div class="topo">
      <div class="titulo"><span class="rotulo">Acessos</span><h1>Usuários e acessos</h1>
        <p class="muted">Somente pessoas cadastradas aqui entram no Spec Studio${dom ? ` (e-mails @${esc(dom)})` : ""}. Não há cadastro público.</p></div>
      <button class="btn primario" id="novo">${ic.mais} Novo usuário</button>
    </div>
    <div class="card rolagem" style="padding:14px 8px"><table class="tabela">
      <thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Status</th><th>Último acesso</th><th></th></tr></thead>
      <tbody>${us
        .map(
          (u) => `<tr><td><b>${esc(u.nome)}</b>${u.id === estado.eu.id ? ' <span class="badge">você</span>' : ""}</td><td>${esc(u.email)}</td>
          <td>${u.papel === "admin" ? "Administrador" : "Editor"}</td>
          <td><span class="badge ${u.ativo ? "ok" : "erro"}">${u.ativo ? "Ativo" : "Bloqueado"}</span></td>
          <td class="small muted">${quando(u.ultimo_login)}</td>
          <td><button class="btn pequeno" data-editar="${u.id}">Editar</button></td></tr>`
        )
        .join("")}</tbody></table></div>
    <div class="card small muted"><b style="color:var(--text)">Papéis</b><br>
      <b>Administrador</b>: tudo, inclusive gerenciar usuários e excluir clientes. <b>Editor</b>: clientes, arquivos, edições, peças e assistente IA.</div>`;
  document.getElementById("novo").onclick = () => formUsuario();
  el.querySelectorAll("[data-editar]").forEach((b) => (b.onclick = () => formUsuario(us.find((u) => u.id === Number(b.dataset.editar)))));
}

function formUsuario(u = null) {
  const d = modal(
    u ? `Editar ${u.nome}` : "Novo usuário",
    `<form class="grid-form">
      <label class="cheia">Nome <input name="nome" required value="${esc(u?.nome || "")}"></label>
      <label class="cheia">E-mail <input name="email" type="email" required value="${esc(u?.email || "")}" ${u ? "disabled" : ""}></label>
      <label>Papel <select name="papel"><option value="editor">Editor</option><option value="admin" ${u?.papel === "admin" ? "selected" : ""}>Administrador</option></select></label>
      <label>${u ? "Nova senha (opcional)" : "Senha inicial"} <input name="senha" type="text" minlength="8" ${u ? "" : "required"} autocomplete="new-password" placeholder="mín. 8 caracteres"></label>
      ${u ? `<label class="check cheia"><input type="checkbox" name="ativo" ${u.ativo ? "checked" : ""}> Acesso liberado</label>` : ""}
      <p class="erro-msg cheia" id="erro" hidden></p>
      <div class="acoes cheia"><button class="btn primario">Salvar</button>
        ${u && u.id !== estado.eu.id ? `<button type="button" class="btn perigo" id="del">${ic.lixo} Excluir usuário</button>` : ""}</div>
    </form>`
  );
  const f = d.querySelector("form");
  f.onsubmit = async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f));
    try {
      if (u) await api(`/usuarios/${u.id}`, { method: "PATCH", body: { nome: v.nome, papel: v.papel, ativo: v.ativo === "on", senha: v.senha || undefined } });
      else await api("/usuarios", { method: "POST", body: v });
      d.close();
      toast("Usuário salvo.");
      rota();
    } catch (err) {
      const el = d.querySelector("#erro");
      el.textContent = err.message;
      el.hidden = false;
    }
  };
  const del = d.querySelector("#del");
  if (del)
    del.onclick = async () => {
      if (!confirm(`Excluir ${u.nome}?`)) return;
      try {
        await api(`/usuarios/${u.id}`, { method: "DELETE" });
        d.close();
        rota();
      } catch (err) {
        toast(err.message, true);
      }
    };
}

// ---------- minha conta ----------
function telaConta() {
  const el = casca(
    "conta",
    `<div class="topo"><div class="titulo"><span class="rotulo">Conta</span><h1>Minha conta</h1><p class="muted">${esc(estado.eu.email)}</p></div></div>
    <form class="card grid-form" id="f" style="max-width:560px">
      <label class="cheia">Senha atual <input name="atual" type="password" required autocomplete="current-password"></label>
      <label class="cheia">Nova senha <input name="nova" type="password" minlength="8" required autocomplete="new-password"></label>
      <p class="erro-msg cheia" id="erro" hidden></p>
      <div class="acoes cheia"><button class="btn primario">Trocar senha</button></div>
    </form>`
  );
  el.querySelector("#f").onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api("/eu/senha", { method: "POST", body: Object.fromEntries(new FormData(e.target)) });
      e.target.reset();
      toast("Senha alterada. Outras sessões foram encerradas.");
    } catch (err) {
      const er = el.querySelector("#erro");
      er.textContent = err.message;
      er.hidden = false;
    }
  };
}

// ---------- roteador ----------
async function iniciar() {
  estado.eu = await api("/eu");
  estado.config = await api("/config");
}

async function rota() {
  limparTimers();
  const partes = location.hash.replace(/^#\/?/, "").split("/");
  if (partes[0] === "login" || !estado.eu) {
    if (!estado.eu) {
      try {
        await iniciar();
        if (partes[0] === "login") return (location.hash = "#/clientes");
      } catch {
        return telaLogin();
      }
    } else return (location.hash = "#/clientes");
  }
  try {
    if (partes[0] === "cliente") return await telaCliente(partes[1], partes[2] || "brutos");
    if (partes[0] === "tarefas") return await telaTarefas();
    if (partes[0] === "usuarios") return await telaUsuarios();
    if (partes[0] === "conta") return telaConta();
    if (partes[0] !== "clientes") return (location.hash = "#/clientes");
    return await telaClientes();
  } catch (e) {
    if (estado.eu) toast(e.message, true);
  }
}

window.addEventListener("hashchange", rota);
rota();
