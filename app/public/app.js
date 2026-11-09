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
  estado.timers.forEach((t) => (t && t.clear ? t.clear() : clearInterval(t)));
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
  memoria: svg('<path d="M12 4a4 4 0 00-4 4 3.5 3.5 0 00-2 6.3V17a3 3 0 003 3h6a3 3 0 003-3v-2.7A3.5 3.5 0 0016 8a4 4 0 00-4-4z"/><path d="M12 4v16M8 11h2M14 13h2"/>'),
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
  { id: "documentos", nome: "Documentos", desc: "Planilhas de resultados (Meta Ads, Google Ads, CRM), relatórios, briefings, PDFs e apresentações." },
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
        ${item("#/tarefas", "Tarefas", ic.tarefas, "tarefas").replace("</span></a>", `</span><em class="contador" id="contador-atv" hidden></em></a>`)}
        ${eu.papel === "admin" && !estado.config?.acessoUnico ? item("#/usuarios", "Usuários e acessos", ic.usuarios, "usuarios") : ""}
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
  estado.tic?.();
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
          <a class="card cliente-card" href="#/cliente/${c.id}/ia">
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
      else location.hash = `#/cliente/${r.id}/ia`;
    } catch (err) {
      const el = d.querySelector("#erro");
      el.textContent = err.message;
      el.hidden = false;
    }
  };
}

// ---------- cliente ----------
async function telaCliente(id, aba, sub) {
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
    ["ia", "Assistente IA", null],
    ...PASTAS.map((p) => [p.id, p.nome.replace("Materiais ", "").replace(/^\w/, (x) => x.toUpperCase()), conta(p.id)]),
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
  if (aba === "ia") return abaIA(alvo, c, arquivos, sub);
  if (aba === "tarefas") return listaTarefas(alvo, c.id);
  location.hash = `#/cliente/${c.id}/ia`;
}

const urlArquivo = (a, baixar) => `/api/arquivos/${a.id}/conteudo${baixar ? "?baixar=1" : ""}`;

function midia(a) {
  if (a.tipo === "link") return `<span class="tipo link-drive">${ic.link}<span>${/pasta/i.test(a.origem || "") ? "Pasta do Drive" : "Link do Drive"}</span></span>`;
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
          <input name="url" type="url" required placeholder="https://drive.google.com/… ou https://instagram.com/…"></label>
          <fieldset class="cheia escolha" id="modo-drive" hidden>
            <label class="check"><input type="radio" name="modo" value="link" checked> <span><b>Só guardar o link</b> — não baixa nada agora; o Assistente IA consulta e baixa só o que precisar</span></label>
            <label class="check"><input type="radio" name="modo" value="baixar"> <span><b>Baixar tudo agora</b> para esta pasta</span></label>
          </fieldset>
          <div class="cheia small muted" style="display:grid;gap:6px">
            <p><b style="color:var(--text)">Google Drive:</b> link de um arquivo ou de uma pasta inteira (subpastas incluídas).
              No Drive, o compartilhamento precisa estar em <b>“Qualquer pessoa com o link”</b>.</p>
            <p><b style="color:var(--text)">Vídeos:</b> YouTube, Instagram, TikTok, Vimeo ou link direto. Algumas redes bloqueiam
              downloads de servidores; nesse caso, envie o arquivo manualmente.</p>
          </div>
          <div class="acoes cheia"><button class="btn primario">Importar</button></div></form>`
      );
      const f = d.querySelector("form");
      const ehDrive = (u) => /^https:\/\/(drive|docs)\.google\.com\//i.test(u.trim());
      f.url.oninput = () => (d.querySelector("#modo-drive").hidden = !ehDrive(f.url.value));
      f.onsubmit = async (e) => {
        e.preventDefault();
        const url = f.url.value.trim();
        if (ehDrive(url) && f.modo.value === "link") {
          try {
            await api(`/clientes/${c.id}/links`, { method: "POST", body: { url, pasta } });
            d.close();
            toast("Link guardado.");
            rota();
          } catch (err) {
            toast(err.message, true);
          }
          return;
        }
        await criarTarefa(c.id, "baixar", { url, pasta }, d);
      };
    };
  if (arquivos.some((a) => a.status && a.status !== "ok")) estado.timers.push(setInterval(() => atualizarSeVisivel(c.id, pasta), 5000));
  alvo.querySelectorAll("[data-arquivo]").forEach((card) => {
    const a = arquivos.find((x) => x.id === Number(card.dataset.arquivo));
    card.querySelector(".midia").onclick = () => (a.tipo === "link" ? window.open(a.url, "_blank", "noopener") : verArquivo(a));
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
      <div class="meta">${a.tipo === "link" ? "" : tamanho(a.tamanho) + " · "}${quando(a.criado_em)}${a.autor ? " · " + esc(a.autor) : ""}${a.origem && a.origem !== "upload" ? `<br>${esc(a.origem)}` : ""}</div>
      <div class="acoes">
        ${a.tipo === "link" ? `<a class="btn pequeno" href="${esc(a.url)}" target="_blank" rel="noopener" title="Abrir no Google Drive">Abrir</a>
        <button class="btn pequeno" data-acao="baixar_link" title="Trazer os arquivos para o sistema">${ic.baixar} Baixar agora</button>` : ""}
        ${a.status === "ok" || !a.status ? `<button class="btn pequeno" data-acao="analisar" title="Conversar com o Assistente IA sobre este arquivo">${ic.ia}</button>` : ""}
        ${video ? `<button class="btn pequeno" data-acao="cortar" title="Cortar">${ic.tesoura}</button>
        <button class="btn pequeno" data-acao="exportar" title="Exportar formato">${ic.formato}</button>` : ""}
        ${video || a.tipo === "audio" ? `<button class="btn pequeno" data-acao="legendar" title="Legendas automáticas">${ic.legenda}</button>` : ""}
        ${a.tipo === "link" ? "" : `<a class="btn pequeno" href="${urlArquivo(a, true)}" title="Baixar">${ic.baixar}</a>`}
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
  if (acao === "analisar") return abrirChatCom(c, a);
  if (acao === "baixar_link") {
    if (!confirm(`Baixar o conteúdo de "${a.nome}" para ${PASTAS.find((p) => p.id === a.pasta).nome}? O cartão de link será substituído pelos arquivos.`)) return;
    return criarTarefa(c.id, "baixar", { url: a.url, pasta: a.pasta, link_id: a.id });
  }
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

function enfileirarEnvios(cliente, pasta, files, aoConcluir) {
  if (!files || !files.length) return;
  for (const file of files)
    envios.itens.push({ id: Math.random().toString(36).slice(2), clienteId: cliente.id, cliente: cliente.nome, pasta, file, nome: file.name, total: file.size, enviado: 0, status: "fila", aoConcluir });
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
    const concluido = await api(`/envios/${inicio.id}/concluir`, { method: "POST", body: {} });
    try { it.aoConcluir?.(concluido.id, it.nome); } catch {}
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
    // some sozinho alguns segundos depois de tudo enviado (falhas continuam visíveis)
    clearTimeout(envios.timerSumir);
    envios.timerSumir = setTimeout(() => {
      if (pendentesEnvio().length) return;
      envios.itens = envios.itens.filter((i) => i.status === "erro");
      desenharEnvios();
    }, 6000);
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

// ---------- assistente IA (chat) ----------
// Texto simples com um pouco de markdown (negrito, listas, código, links), sempre escapado.
function markdownLeve(t) {
  const blocos = [];
  let x = esc(t).replace(/```(?:\w+)?\n?([\s\S]*?)```/g, (_, c) => `\u0000${blocos.push(`<pre class="cod">${c}</pre>`) - 1}\u0000`);
  x = x
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>")
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  const html = x
    .split(/\n{2,}/)
    .map((par) => {
      // agrupa linhas seguidas do mesmo tipo: texto, lista com marcador, lista numerada
      const tipo = (l) => (/^\s*[-*•]\s+/.test(l) ? "ul" : /^\s*\d+[.)]\s+/.test(l) ? "ol" : /^#{1,4}\s/.test(l) ? "h" : "p");
      const grupos = [];
      for (const l of par.split("\n")) {
        const t = tipo(l);
        if (grupos.length && grupos.at(-1).t === t && t !== "h") grupos.at(-1).l.push(l);
        else grupos.push({ t, l: [l] });
      }
      return grupos
        .map((g) =>
          g.t === "ul" ? `<ul>${g.l.map((l) => `<li>${l.replace(/^\s*[-*•]\s+/, "")}</li>`).join("")}</ul>`
          : g.t === "ol" ? `<ol>${g.l.map((l) => `<li>${l.replace(/^\s*\d+[.)]\s+/, "")}</li>`).join("")}</ol>`
          : g.t === "h" ? `<p><b>${g.l[0].replace(/^#{1,4}\s+/, "")}</b></p>`
          : `<p>${g.l.join("<br>")}</p>`
        )
        .join("");
    })
    .join("");
  return html.replace(/\u0000(\d+)\u0000/g, (_, i) => blocos[i]);
}

const SUGESTOES_CHAT = [
  "Analise a planilha de resultados anexada (Meta Ads) e me diga o que está funcionando, o que pausar e onde escalar.",
  "Monte um plano de conteúdo e anúncios para os próximos 30 dias, com ganchos e formatos.",
  "Escreva 5 variações de copy para anúncio com ganchos diferentes para testar.",
  "Edite um anúncio de 30s para Reels (9:16) com o bruto anexado: cortes dinâmicos, legendas animadas e CTA no final.",
  "Corte os 3 melhores momentos do vídeo em Shorts de até 45s com legendas.",
  "Crie 3 criativos estáticos para Meta Ads (1:1, 4:5 e 9:16) com a identidade do cliente.",
  "Analise esta referência e me diga o que dá para adaptar para o cliente.",
  "Veja o que tem na pasta do Drive e separe os melhores takes.",
  "Monte um vídeo para YouTube (16:9) com abertura com a marca, legendas e trilha.",
];

async function abrirChatCom(c, a) {
  if (!estado.config.iaAtiva) return toast("Assistente IA desativado: falta configurar ANTHROPIC_API_KEY.", true);
  const r = await api(`/clientes/${c.id}/conversas`, { method: "POST", body: {} });
  const texto =
    a.tipo === "link" ? "Veja o que tem neste link do Drive e me diga o que dá para fazer com ele."
    : a.pasta === "referencias" ? "Analise esta referência (gancho, ritmo, cortes, legendas, textos, CTA) e me diga o que dá para adaptar para o cliente."
    : a.tipo === "video" ? "O que você sugere fazer com este vídeo? Me dê opções de peças antes de editar."
    : "Dê uma olhada neste arquivo e me diga como podemos usá-lo.";
  estado.rascunho = { conversa: r.id, texto, anexos: [{ id: a.id, nome: a.nome, pasta: a.pasta, tipo: a.tipo }] };
  location.hash = `#/cliente/${c.id}/ia/${r.id}`;
}

async function editarMemoria(c) {
  const r = await api(`/clientes/${c.id}/memoria`);
  const d = modal(
    `Memória do cliente · ${c.nome}`,
    `<p class="muted small">O que o agente sabe sobre ${esc(c.nome)}: negócio, público, tom de voz, campanhas, resultados e aprendizados.
      Ele lê isto em toda conversa e atualiza sozinho quando aprende algo novo. A equipe também pode editar.</p>
     <textarea id="mem" class="memoria-texto" spellcheck="false">${esc(r.memoria)}</textarea>
     <div class="acoes"><button class="btn primario" id="salvar">Salvar memória</button>
       ${r.vazia ? `<span class="muted small">Modelo inicial — preencha o que já souber.</span>` : ""}</div>`,
    { largo: true }
  );
  d.querySelector("#salvar").onclick = async () => {
    try {
      await api(`/clientes/${c.id}/memoria`, { method: "PUT", body: { memoria: d.querySelector("#mem").value } });
      d.close();
      toast("Memória salva.");
    } catch (e) {
      toast(e.message, true);
    }
  };
}

async function abaIA(alvo, c, arquivos, conversaId) {
  if (!estado.config.iaAtiva) {
    alvo.innerHTML = `<div class="vazio"><img src="marca/icone-verde.svg" alt=""><h3>Assistente IA desativado</h3><p>O administrador precisa configurar <code>ANTHROPIC_API_KEY</code> no servidor.</p></div>`;
    return;
  }
  const conversas = await api(`/clientes/${c.id}/conversas`);
  const atual = Number(conversaId) || null;
  alvo.innerHTML = `
  <div class="chat-layout">
    <aside class="chat-lista">
      <div class="chat-lista-topo">
        <button class="btn primario" id="nova-conversa">${ic.mais} Nova conversa</button>
        <button class="btn" id="memoria">${ic.memoria} Memória do cliente</button>
      </div>
      <div class="chat-itens">${
        conversas.length
          ? conversas
              .map(
                (v) => `<a href="#/cliente/${c.id}/ia/${v.id}" class="chat-item ${v.id === atual ? "ativo" : ""}">
                  <span>${esc(v.titulo)}</span>
                  <small>${v.status !== "ociosa" ? '<span class="ponto"></span> trabalhando · ' : ""}${quando(v.atualizado_em)}${v.autor ? " · " + esc(v.autor) : ""}</small></a>`
              )
              .join("")
          : `<p class="muted small" style="padding:8px">Nenhuma conversa ainda.</p>`
      }</div>
    </aside>
    <section class="chat" id="chat"></section>
  </div>`;
  alvo.querySelector("#nova-conversa").onclick = async () => {
    try {
      const r = await api(`/clientes/${c.id}/conversas`, { method: "POST", body: {} });
      location.hash = `#/cliente/${c.id}/ia/${r.id}`;
    } catch (e) {
      toast(e.message, true);
    }
  };
  alvo.querySelector("#memoria").onclick = () => editarMemoria(c);
  const painel = alvo.querySelector("#chat");
  if (!atual) {
    painel.innerHTML = `<div class="chat-boasvindas"><img src="marca/icone-verde.svg" alt="">
      <h2>Agente de performance de ${esc(c.nome)}</h2>
      <p class="muted">Converse como você conversa com um estrategista da equipe: análise de campanhas e planilhas de resultados,
      plano de mídia, roteiros, copies, criativos, edição de vídeo, relatórios e apresentações.
      Ele lembra do cliente entre as conversas (Memória do cliente) e tem acesso a toda a biblioteca.</p>
      <button class="btn primario" id="comecar">${ic.mais} Começar uma conversa</button></div>`;
    painel.querySelector("#comecar").onclick = () => alvo.querySelector("#nova-conversa").click();
    return;
  }
  return chatConversa(painel, c, arquivos, atual);
}

async function chatConversa(painel, c, arquivos, conversaId) {
  document.body.classList.add("tem-chat");
  estado.timers.push({ clear: () => document.body.classList.remove("tem-chat") });
  const st = { ultimo: 0, status: "ociosa", anexos: [], arquivosCache: new Map(), timer: null };
  const rascunho = estado.rascunho && estado.rascunho.conversa === conversaId ? estado.rascunho : null;
  estado.rascunho = null;
  if (rascunho) st.anexos = rascunho.anexos;

  painel.innerHTML = `
    <header class="chat-cab">
      <div><b id="chat-titulo"></b><small class="muted" id="chat-info"></small></div>
      <div class="acoes"><button class="btn pequeno fantasma perigo" id="chat-excluir" title="Excluir conversa">${ic.lixo}</button></div>
    </header>
    <div class="chat-msgs" id="msgs"></div>
    <div class="chat-trabalhando" id="trabalhando" hidden><span class="pontinhos"><i></i><i></i><i></i></span>
      <span id="trab-texto">O assistente está trabalhando…</span><button class="btn pequeno" id="parar">Parar</button></div>
    <form class="chat-compor" id="compor">
      <div class="chips" id="chips"></div>
      <textarea name="texto" rows="1" placeholder="Escreva o que você precisa… (Enter envia, Shift+Enter quebra linha)"></textarea>
      <div class="chat-compor-acoes">
        <div class="modo-ia" role="radiogroup" aria-label="Modo do assistente">
          <label title="Direto ao ponto: executa rápido"><input type="radio" name="modo" value="rapido"> ⚡ Rápido</label>
          <label title="Pensa mais antes de agir: estratégia, análises complexas"><input type="radio" name="modo" value="detalhado"> 🧠 Detalhado</label>
        </div>
        <button type="button" class="btn pequeno fantasma" id="anexar">${ic.mover} Anexar da biblioteca</button>
        <label class="btn pequeno fantasma">${ic.upload} Enviar do computador<input type="file" multiple hidden id="up-chat"></label>
        <button class="btn primario" id="enviar">Enviar</button>
      </div>
    </form>`;
  const msgs = painel.querySelector("#msgs");
  const form = painel.querySelector("#compor");
  const ta = form.texto;
  if (rascunho) ta.value = rascunho.texto;
  let modoSalvo = "rapido";
  try {
    modoSalvo = localStorage.getItem("spec-modo-ia") || "rapido";
  } catch {}
  form.modo.value = modoSalvo === "detalhado" ? "detalhado" : "rapido";
  form.querySelectorAll("[name=modo]").forEach((r) => (r.onchange = () => { try { localStorage.setItem("spec-modo-ia", form.modo.value); } catch {} }));

  const autoAltura = () => {
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 220) + "px";
  };
  ta.oninput = autoAltura;
  ta.onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      form.requestSubmit();
    }
  };

  const desenharChips = () => {
    painel.querySelector("#chips").innerHTML = st.anexos
      .map((a, i) => `<span class="chip">${a.tipo === "link" ? ic.link : ""}${esc(a.nome)}<button type="button" data-tirar="${i}" aria-label="Remover">${ic.x}</button></span>`)
      .join("");
    painel.querySelectorAll("[data-tirar]").forEach((b) => (b.onclick = () => (st.anexos.splice(Number(b.dataset.tirar), 1), desenharChips())));
  };
  desenharChips();

  painel.querySelector("#anexar").onclick = () => {
    const d = modal(
      "Anexar arquivos da biblioteca",
      `<input type="search" placeholder="Procurar…" id="busca">
       <div class="lista-escolha" id="lista" style="max-height:50vh">${
         arquivos.length
           ? arquivos
               .map(
                 (a) => `<label data-nome="${esc(a.nome.toLowerCase())}"><input type="checkbox" value="${a.id}" ${st.anexos.some((x) => x.id === a.id) ? "checked" : ""}>
                   <span>${esc(a.nome)} <span class="muted small">· ${PASTAS.find((p) => p.id === a.pasta).nome}${a.tipo === "link" ? " · link" : ""}</span></span></label>`
               )
               .join("")
           : `<p class="muted">Nenhum arquivo neste cliente ainda.</p>`
       }</div>
       <div class="acoes"><button class="btn primario" id="ok">Anexar selecionados</button></div>`
    );
    d.querySelector("#busca").oninput = (e) =>
      d.querySelectorAll("#lista label").forEach((l) => (l.hidden = !l.dataset.nome.includes(e.target.value.toLowerCase())));
    d.querySelector("#ok").onclick = () => {
      const ids = [...d.querySelectorAll("#lista input:checked")].map((i) => Number(i.value));
      st.anexos = arquivos.filter((a) => ids.includes(a.id)).map((a) => ({ id: a.id, nome: a.nome, pasta: a.pasta, tipo: a.tipo }));
      desenharChips();
      d.close();
    };
  };
  painel.querySelector("#up-chat").onchange = (e) => {
    const files = [...e.target.files];
    e.target.value = "";
    const midiaRe = /\.(mp4|mov|m4v|webm|mkv|avi|png|jpe?g|webp|gif|heic|mp3|wav|m4a|aac|flac|ogg)$/i;
    const midias = files.filter((f) => midiaRe.test(f.name));
    const docs = files.filter((f) => !midiaRe.test(f.name));
    toast(`Enviando ${files.length} arquivo(s); entram como anexo quando terminarem.`);
    const anexar = (pasta) => (id, nome) => {
      if (!document.body.contains(painel)) return;
      st.anexos.push({ id, nome, pasta, tipo: "" });
      desenharChips();
    };
    if (midias.length) enfileirarEnvios(c, "brutos", midias, anexar("brutos"));
    if (docs.length) enfileirarEnvios(c, "documentos", docs, anexar("documentos"));
  };

  painel.querySelector("#chat-excluir").onclick = async () => {
    if (!confirm("Excluir esta conversa? Os arquivos que ela gerou continuam na biblioteca.")) return;
    await api(`/conversas/${conversaId}`, { method: "DELETE" });
    location.hash = `#/cliente/${c.id}/ia`;
  };
  painel.querySelector("#parar").onclick = async (e) => {
    e.target.disabled = true;
    await api(`/conversas/${conversaId}/parar`, { method: "POST" }).catch(() => {});
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const texto = ta.value.trim();
    if (!texto) return;
    const btn = form.querySelector("#enviar");
    btn.disabled = true;
    try {
      const r = await api(`/conversas/${conversaId}/mensagens`, { method: "POST", body: { texto, arquivo_ids: st.anexos.map((a) => a.id), modo: form.modo.value } });
      if (r.na_fila) toast("Mensagem na fila: o assistente faz assim que terminar o pedido atual.");
      ta.value = "";
      st.anexos = [];
      desenharChips();
      autoAltura();
      await atualizar();
    } catch (err) {
      toast(err.message, true);
    } finally {
      btn.disabled = false;
    }
  };

  // ----- desenho das mensagens -----
  let grupoAtividade = null;
  const noFim = () => msgs.scrollTop + msgs.clientHeight >= msgs.scrollHeight - 80;

  async function cartoesArquivos(ids) {
    const faltam = ids.filter((i) => !st.arquivosCache.has(i));
    if (faltam.length) for (const a of await api(`/arquivos?ids=${faltam.join(",")}`)) st.arquivosCache.set(a.id, a);
    return ids
      .map((i) => st.arquivosCache.get(i))
      .filter(Boolean)
      .map(
        (a) => `<div class="chat-arquivo" data-ver="${a.id}">
          <div class="midia">${midia(a)}</div>
          <div class="info"><span class="nome">${esc(a.nome)}</span>
            <span class="meta">${PASTAS.find((p) => p.id === a.pasta)?.nome || ""} · ${tamanho(a.tamanho)}</span>
            <a class="btn pequeno" href="${urlArquivo(a, true)}">${ic.baixar} Baixar</a></div></div>`
      )
      .join("");
  }

  async function adicionar(m) {
    if (m.papel !== "atividade") grupoAtividade = null;
    if (m.papel === "usuario") {
      const anexos = m.dados?.anexos || [];
      msgs.insertAdjacentHTML(
        "beforeend",
        `<div class="msg eu"><div class="balao">${m.dados?.na_fila ? `<span class="tag-fila">⏳ enviada durante o trabalho — entra em seguida</span>` : ""}${markdownLeve(m.texto)}${
          anexos.length ? `<div class="chips">${anexos.map((a) => `<span class="chip">${esc(a.nome)}</span>`).join("")}</div>` : ""
        }</div><small>${esc(m.dados?.autor || "")} · ${quando(m.criado_em)}</small></div>`
      );
    } else if (m.papel === "assistente") {
      msgs.insertAdjacentHTML("beforeend", `<div class="msg ia"><img class="ia-avatar" src="marca/favicon.svg" alt=""><div class="balao">${markdownLeve(m.texto)}</div></div>`);
    } else if (m.papel === "atividade") {
      if (!grupoAtividade) {
        msgs.insertAdjacentHTML("beforeend", `<details class="atividades"><summary><span class="qtd">1 etapa</span> · <span class="ultima"></span></summary><ul></ul></details>`);
        grupoAtividade = msgs.lastElementChild;
        grupoAtividade.n = 0;
      }
      grupoAtividade.n++;
      grupoAtividade.querySelector(".qtd").textContent = `${grupoAtividade.n} etapa${grupoAtividade.n > 1 ? "s" : ""}`;
      grupoAtividade.querySelector(".ultima").textContent = m.texto;
      grupoAtividade.querySelector("ul").insertAdjacentHTML("beforeend", `<li>${esc(m.texto)}</li>`);
    } else if (m.papel === "arquivos") {
      msgs.insertAdjacentHTML("beforeend", `<div class="msg ia arquivos"><div class="chat-arquivos">${await cartoesArquivos(m.dados?.ids || [])}</div></div>`);
      msgs.lastElementChild.querySelectorAll("[data-ver]").forEach((el) => {
        const a = st.arquivosCache.get(Number(el.dataset.ver));
        el.querySelector(".midia").onclick = () => verArquivo(a);
      });
    } else if (m.papel === "erro") {
      msgs.insertAdjacentHTML("beforeend", `<div class="msg aviso">${esc(m.texto)}</div>`);
    }
  }

  async function atualizar() {
    const r = await api(`/conversas/${conversaId}?desde=${st.ultimo}`);
    const rolar = noFim() || st.ultimo === 0;
    painel.querySelector("#chat-titulo").textContent = r.conversa.titulo;
    const itemLista = document.querySelector(`.chat-item.ativo span`);
    if (itemLista) itemLista.textContent = r.conversa.titulo;
    painel.querySelector("#chat-info").textContent = r.conversa.custo ? ` · custo até agora US$ ${r.conversa.custo.toFixed(2)}` : "";
    for (const m of r.mensagens) {
      await adicionar(m);
      st.ultimo = m.id;
    }
    if (st.ultimo === 0 && !msgs.children.length) {
      msgs.innerHTML = `<div class="chat-vazio"><p class="muted">Sugestões para começar:</p><div class="sugestoes">${SUGESTOES_CHAT.map((x) => `<button type="button">${esc(x)}</button>`).join("")}</div></div>`;
      msgs.querySelectorAll(".sugestoes button").forEach((b) => (b.onclick = () => ((ta.value = b.textContent), autoAltura(), ta.focus())));
    } else msgs.querySelector(".chat-vazio")?.remove();
    st.status = r.conversa.status;
    const trabalhando = st.status !== "ociosa";
    painel.querySelector("#trabalhando").hidden = !trabalhando;
    const tu = r.turno;
    painel.querySelector("#trab-texto").textContent =
      st.status === "na_fila"
        ? "Na fila: outra conversa está sendo atendida…"
        : tu && tu.status === "rodando"
          ? `${tu.etapa || "Trabalhando"} · ${duracaoTxt(tu.decorrido)} · ${tokensTxt(tu.tokens)} tokens${tu.esperando ? " · +1 pedido na fila" : ""}`
          : "O assistente está trabalhando…";
    painel.querySelector("#parar").disabled = false;
    form.querySelector("#enviar").textContent = trabalhando ? "Pôr na fila" : "Enviar";
    ta.placeholder = trabalhando
      ? "O assistente está trabalhando — pode mandar mais instruções, elas entram na fila desta conversa…"
      : "Escreva o que você precisa… (Enter envia, Shift+Enter quebra linha)";
    if (rolar) msgs.scrollTop = msgs.scrollHeight;
    clearTimeout(st.timer);
    if (document.body.contains(painel)) st.timer = setTimeout(() => atualizar().catch(() => {}), trabalhando ? 1500 : 6000);
  }
  estado.timers.push({ clear: () => clearTimeout(st.timer) });
  await atualizar();
  autoAltura();
  ta.focus();
}

// ---------- app no celular (PWA) e notificações ----------
const ehIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const instalado = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const suportaPush = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function registrarSW() {
  if (!("serviceWorker" in navigator)) return null;
  estado.sw ||= navigator.serviceWorker.register("/sw.js").catch(() => null);
  return estado.sw;
}

function b64ParaBytes(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function estadoNotificacoes() {
  if (!suportaPush()) return ehIOS() && !instalado() ? "instalar" : "sem-suporte";
  if (Notification.permission === "denied") return "bloqueado";
  const reg = await registrarSW();
  const sub = reg && (await reg.pushManager.getSubscription());
  return sub && Notification.permission === "granted" ? "ativo" : "inativo";
}

async function ativarNotificacoes() {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Permissão negada. Libere as notificações do Spec Studio nas configurações do navegador/celular.");
  const reg = await registrarSW();
  await navigator.serviceWorker.ready;
  const { chave } = await api("/push");
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ParaBytes(chave) });
  await api("/push", { method: "POST", body: { inscricao: sub.toJSON(), aparelho: `${instalado() ? "app" : "navegador"} · ${navigator.userAgent.slice(0, 90)}` } });
  await api("/push/teste", { method: "POST" });
}

async function desativarNotificacoes() {
  const reg = await registrarSW();
  const sub = reg && (await reg.pushManager.getSubscription());
  if (sub) {
    await api("/push", { method: "DELETE", body: { endpoint: sub.endpoint } }).catch(() => {});
    await sub.unsubscribe();
  }
}

function botaoNotificacoesHtml() {
  return `<div class="aviso-notif" id="aviso-notif" hidden></div>`;
}

async function ligarBotaoNotificacoes(raizEl, { sempre = false } = {}) {
  const box = raizEl.querySelector("#aviso-notif");
  if (!box) return;
  const pintar = async () => {
    const e = await estadoNotificacoes();
    let dispensado = false;
    try {
      dispensado = localStorage.getItem("spec-notif-dispensado") === "1";
    } catch {}
    if (!sempre && (e === "ativo" || e === "sem-suporte" || dispensado)) return (box.hidden = true);
    box.hidden = false;
    const msg = {
      ativo: `🔔 Notificações ativas neste aparelho. <button class="btn pequeno fantasma" data-n="testar">Testar</button> <button class="btn pequeno fantasma" data-n="desativar">Desativar</button>`,
      inativo: `🔔 Receba um aviso no celular/computador quando cada tarefa terminar. <button class="btn pequeno primario" data-n="ativar">Ativar notificações</button>${sempre ? "" : ` <button class="btn pequeno fantasma" data-n="dispensar">Agora não</button>`}`,
      bloqueado: `🔕 As notificações estão bloqueadas para este site. Libere nas configurações do navegador e recarregue.${sempre ? "" : ` <button class="btn pequeno fantasma" data-n="dispensar">Ok</button>`}`,
      instalar: `📱 No iPhone, as notificações funcionam com o app instalado: toque em <b>Compartilhar</b> → <b>Adicionar à Tela de Início</b>, abra o Spec Studio pelo ícone e ative aqui.${sempre ? "" : ` <button class="btn pequeno fantasma" data-n="dispensar">Ok</button>`}`,
      "sem-suporte": `Este navegador não suporta notificações. Use Chrome, Edge, Safari (iPhone com o app instalado) ou Firefox.`,
    }[e];
    box.innerHTML = msg;
    box.querySelectorAll("[data-n]").forEach(
      (b) =>
        (b.onclick = async () => {
          b.disabled = true;
          try {
            if (b.dataset.n === "ativar") (await ativarNotificacoes(), toast("Notificações ativadas! Enviamos um teste."));
            if (b.dataset.n === "testar") (await api("/push/teste", { method: "POST" }), toast("Notificação de teste enviada."));
            if (b.dataset.n === "desativar") (await desativarNotificacoes(), toast("Notificações desativadas neste aparelho."));
            if (b.dataset.n === "dispensar") {
              try {
                localStorage.setItem("spec-notif-dispensado", "1");
              } catch {}
            }
          } catch (err) {
            toast(err.message, true);
          }
          pintar();
        })
    );
  };
  pintar().catch(() => {});
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

function duracaoTxt(seg) {
  if (seg == null || seg < 0) return "—";
  const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s2 = seg % 60;
  return h ? `${h}h${String(m).padStart(2, "0")}` : `${m}:${String(s2).padStart(2, "0")}`;
}
function tokensTxt(n) {
  if (!n) return "0";
  return n >= 1e6 ? (n / 1e6).toFixed(1).replace(".", ",") + " mi" : n >= 1e3 ? Math.round(n / 1e3) + " mil" : String(n);
}
const custoTxt = (v) => (v ? `US$ ${v.toFixed(2)}` : "—");
const STATUS_ATV = { na_fila: "Na fila", rodando: "Processando", ok: "Concluído", erro: "Erro", cancelado: "Interrompido" };

function tituloAtividade(a) {
  if (a.fonte !== "tarefa") return a.titulo;
  return `${NOME_TAREFA[a.tipo] || a.tipo}${resumoTarefa(a) ? " · " + resumoTarefa(a) : ""}`;
}
function linkAtividade(a) {
  if (a.fonte === "claude") return `#/cliente/${a.cliente_id}/editados`;
  return a.fonte === "ia" ? `#/cliente/${a.cliente_id}/ia/${a.conversa_id}` : null;
}

// Painel de produção: em andamento (ao vivo, por cliente) no topo, concluídos embaixo.
async function listaTarefas(alvo, clienteId) {
  alvo.innerHTML = `
    ${botaoNotificacoesHtml()}
    <div class="resumo-atv" id="resumo"></div>
    <h2 class="secao-titulo"><span class="ponto-vivo"></span> Em andamento agora</h2>
    <div id="andamento"></div>
    <h2 class="secao-titulo">Concluídos</h2>
    <div id="concluidos"></div>`;
  ligarBotaoNotificacoes(alvo);
  let timer = null;
  let base = Date.now();
  let dados = null;

  const cartao = (a) => {
    const seg = a.decorrido + Math.round((Date.now() - base) / 1000);
    const href = linkAtividade(a);
    return `<article class="atv ${a.status}">
      <div class="atv-topo">
        <span class="atv-tipo">${a.fonte === "claude" ? `${ic.ia} Claude Code` : a.fonte === "ia" ? `${ic.ia} Assistente IA${a.modo === "detalhado" ? " · detalhado" : ""}` : esc(NOME_TAREFA[a.tipo] || a.tipo)}</span>
        <span class="badge ${a.status}">${STATUS_ATV[a.status]}</span>
      </div>
      <b class="atv-titulo">${esc(tituloAtividade(a)).slice(0, 220)}</b>
      <div class="atv-etapa">${a.status === "rodando" ? `<span class="pontinhos"><i></i><i></i><i></i></span>` : ""}${esc(a.etapa || (a.status === "na_fila" ? "Aguardando a vez" : "")) }</div>
      <div class="atv-metricas">
        <span title="Tempo">⏱ <b data-seg="${a.status === "rodando" ? seg : ""}">${duracaoTxt(seg)}</b></span>
        ${a.fonte === "ia" ? `<span title="Tokens (entrada · cache · saída): ${a.tokens.entrada} · ${a.tokens.cache} · ${a.tokens.saida}">🔤 <b>${tokensTxt(a.tokens.total)}</b> tokens</span><span>💲 <b>${custoTxt(a.custo)}</b></span><span>${a.etapas} etapas</span>` : ""}
        <span class="muted">${esc(a.autor || "")}</span>
      </div>
      <div class="acoes">
        ${href ? `<a class="btn pequeno" href="${href}">${a.fonte === "claude" ? "Ver entregas" : "Abrir conversa"}</a>` : `<button class="btn pequeno" data-log="${a.id}">Ver log</button>`}
        ${a.fonte === "ia" ? `<button class="btn pequeno fantasma perigo" data-parar="${a.conversa_id}">Parar</button>` : ""}
      </div>
    </article>`;
  };

  const desenhar = () => {
    const d = dados;
    alvo.querySelector("#resumo").innerHTML = `
      <div class="card"><span class="muted small">Processando agora</span><b>${d.andamento.filter((a) => a.status === "rodando").length}</b><small class="muted">${d.andamento.filter((a) => a.status === "na_fila").length} na fila</small></div>
      <div class="card"><span class="muted small">Tokens hoje</span><b>${tokensTxt(d.hoje.tokens)}</b><small class="muted">${d.hoje.pedidos} pedido(s) à IA</small></div>
      <div class="card"><span class="muted small">Custo IA hoje</span><b>${custoTxt(d.hoje.custo)}</b><small class="muted">mês: ${custoTxt(d.mes.custo)} · ${tokensTxt(d.mes.tokens)} tokens</small></div>
      <div class="card"><span class="muted small">Servidor</span><b>${d.maquina.cpus} CPU · ${d.maquina.ram_gb} GB</b><small class="muted">memória disponível para edição</small></div>`;

    const and = alvo.querySelector("#andamento");
    if (!d.andamento.length) and.innerHTML = `<div class="vazio pequeno"><p class="muted">Nada sendo processado agora.</p></div>`;
    else if (clienteId) and.innerHTML = `<div class="atv-grade">${d.andamento.map(cartao).join("")}</div>`;
    else {
      const grupos = new Map();
      for (const a of d.andamento) {
        if (!grupos.has(a.cliente_id)) grupos.set(a.cliente_id, { nome: a.cliente, itens: [] });
        grupos.get(a.cliente_id).itens.push(a);
      }
      and.innerHTML = [...grupos.entries()]
        .map(([cid, g]) => `<section class="atv-grupo"><h3><a href="#/cliente/${cid}/ia">${esc(g.nome || "Cliente")}</a> <span class="muted small">${g.itens.length} item(ns)</span></h3><div class="atv-grade">${g.itens.map(cartao).join("")}</div></section>`)
        .join("");
    }

    alvo.querySelector("#concluidos").innerHTML = d.concluidos.length
      ? `<div class="card atv-lista">${d.concluidos
          .map((a) => {
            const href = linkAtividade(a);
            return `<div class="atv-linha">
              <div class="atv-linha-info">
                <span class="muted small">${a.fonte === "claude" ? "Claude Code" : a.fonte === "ia" ? "Assistente IA" : esc(NOME_TAREFA[a.tipo] || a.tipo)}${clienteId ? "" : ` · <a href="#/cliente/${a.cliente_id}/ia">${esc(a.cliente || "")}</a>`} · ${esc(a.autor || "")} · ${quando(a.terminado_em || a.criado_em)}</span>
                <b>${esc(tituloAtividade(a)).slice(0, 160)}</b>
              </div>
              <div class="atv-linha-num">
                <span class="badge ${a.status}">${STATUS_ATV[a.status] || a.status}</span>
                <span title="Duração">⏱ ${duracaoTxt(a.duracao)}</span>
                ${a.tokens ? `<span title="entrada ${a.tokens.entrada} · cache ${a.tokens.cache} · saída ${a.tokens.saida}">🔤 ${tokensTxt(a.tokens.total)}</span><span>💲 ${custoTxt(a.custo)}</span>` : ""}
                ${a.entregas ? `<span>📦 ${a.entregas}</span>` : ""}
                ${href ? `<a class="btn pequeno" href="${href}">Abrir</a>` : `<button class="btn pequeno" data-log="${a.id}">Ver</button>`}
              </div>
            </div>`;
          })
          .join("")}</div>`
      : `<div class="vazio pequeno"><p class="muted">Nada concluído ainda. Peça algo ao Assistente IA do cliente.</p></div>`;

    alvo.querySelectorAll("[data-log]").forEach((b) => (b.onclick = () => verLog(Number(b.dataset.log))));
    alvo.querySelectorAll("[data-parar]").forEach(
      (b) =>
        (b.onclick = async () => {
          if (!confirm("Parar o assistente nesta conversa?")) return;
          b.disabled = true;
          await api(`/conversas/${b.dataset.parar}/parar`, { method: "POST" }).catch(() => {});
          carregar();
        })
    );
  };

  const carregar = async () => {
    clearTimeout(timer);
    if (!document.body.contains(alvo)) return;
    try {
      dados = await api(`/atividades${clienteId ? `?cliente_id=${clienteId}` : ""}`);
      base = Date.now();
      desenhar();
    } catch {}
    timer = setTimeout(carregar, dados?.andamento.length ? 2500 : 10000);
  };
  // relógio dos itens em andamento
  const relogio = setInterval(() => {
    alvo.querySelectorAll("[data-seg]").forEach((el) => {
      if (el.dataset.seg === "") return;
      el.textContent = duracaoTxt(Number(el.dataset.seg) + Math.round((Date.now() - base) / 1000));
    });
  }, 1000);
  estado.timers.push({ clear: () => clearTimeout(timer) }, relogio);
  await carregar();
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
    </form>
    <section class="card" style="max-width:560px;margin-top:18px">
      <h3 style="margin-top:0">Notificações e app no celular</h3>
      <p class="muted small">Instale o Spec Studio no celular: no <b>iPhone</b> (Safari) toque em Compartilhar → <b>Adicionar à Tela de Início</b>;
      no <b>Android</b> (Chrome) toque no menu ⋮ → <b>Instalar app</b>. Depois abra pelo ícone e ative as notificações abaixo.</p>
      ${botaoNotificacoesHtml()}
    </section>
    <section class="card" style="max-width:560px;margin-top:18px">
      <h3 style="margin-top:0">Integração com o Claude Code</h3>
      <p class="muted small">Permite que o Claude Code (claude.ai/code ou app) leia os clientes, a memória e os brutos daqui e devolva as
      entregas direto na biblioteca, usando o processamento e a assinatura do Claude Code. A chave aparece uma única vez:
      cole-a apenas no formulário seguro que o Claude Code abrir (nunca no chat).</p>
      <div id="chaves"></div>
      <div class="acoes"><button class="btn primario" id="nova-chave">Gerar chave de integração</button></div>
    </section>`
  );
  ligarBotaoNotificacoes(el, { sempre: true });
  const listarChaves = async () => {
    const ks = await api("/chaves").catch(() => []);
    el.querySelector("#chaves").innerHTML = ks.length
      ? `<div class="atv-lista">${ks
          .map((k) => `<div class="atv-linha"><div class="atv-linha-info"><b>${esc(k.nome)} · ••••${esc(k.final)}</b>
            <span class="muted small">criada ${quando(k.criado_em)} · último uso ${k.ultimo_uso ? quando(k.ultimo_uso) : "nunca"}</span></div>
            <button class="btn pequeno fantasma perigo" data-revogar="${k.id}">Revogar</button></div>`)
          .join("")}</div>`
      : `<p class="muted small">Nenhuma chave criada.</p>`;
    el.querySelectorAll("[data-revogar]").forEach(
      (b) =>
        (b.onclick = async () => {
          if (!confirm("Revogar esta chave? O Claude Code perde o acesso até você gerar outra.")) return;
          await api(`/chaves/${b.dataset.revogar}`, { method: "DELETE" });
          listarChaves();
        })
    );
  };
  listarChaves();
  el.querySelector("#nova-chave").onclick = async () => {
    const { chave } = await api("/chaves", { method: "POST", body: { nome: "Claude Code" } });
    const d = modal(
      "Chave de integração criada",
      `<p class="muted small">Copie agora: ela não será mostrada de novo. Cole somente no formulário seguro do Claude Code.</p>
       <input readonly id="valor-chave" value="${esc(chave)}" style="font-family:monospace">
       <div class="acoes"><button class="btn primario" id="copiar">Copiar</button></div>`
    );
    d.querySelector("#copiar").onclick = async () => {
      const inp = d.querySelector("#valor-chave");
      inp.select();
      try {
        await navigator.clipboard.writeText(chave);
      } catch {
        document.execCommand("copy");
      }
      toast("Chave copiada.");
    };
    listarChaves();
  };
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
  registrarSW();
  if (!estado.contador) {
    const tic = async () => {
      if (!estado.eu || document.hidden) return;
      const r = await api("/atividades/contagem").catch(() => null);
      const el = document.getElementById("contador-atv");
      if (r && el) {
        el.hidden = !r.andamento;
        el.textContent = r.andamento;
      }
    };
    estado.tic = tic;
    estado.contador = setInterval(tic, 8000);
    tic();
  }
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
    if (partes[0] === "cliente") return await telaCliente(partes[1], partes[2] || "ia", partes[3]);
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
