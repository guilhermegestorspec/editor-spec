// Recursos da máquina (limites do container) e proteção contra falta de memória.
//
// No Render o container é encerrado na hora se passar do limite de RAM (oomKilled), levando junto o
// servidor e o trabalho do assistente. O vigia abaixo mata antes o processo pesado da vez
// (Chrome do Remotion, FFmpeg, Whisper...) para o servidor e a conversa sobreviverem.
import fs from "node:fs";
import os from "node:os";

const ler = (f) => {
  try {
    return fs.readFileSync(f, "utf8").trim();
  } catch {
    return null;
  }
};

function limiteMemoria() {
  if (process.env.MAQUINA_RAM_GB) return Number(process.env.MAQUINA_RAM_GB) * 1024 ** 3;
  const v2 = ler("/sys/fs/cgroup/memory.max");
  if (v2 && v2 !== "max") return Number(v2);
  const v1 = Number(ler("/sys/fs/cgroup/memory/memory.limit_in_bytes"));
  if (v1 && v1 < 2 ** 60) return v1;
  return os.totalmem();
}

function cpus() {
  if (process.env.MAQUINA_CPUS) return Number(process.env.MAQUINA_CPUS);
  const v2 = ler("/sys/fs/cgroup/cpu.max");
  if (v2 && !v2.startsWith("max")) {
    const [cota, periodo] = v2.split(" ").map(Number);
    if (cota && periodo) return Math.max(1, Math.round(cota / periodo));
  }
  const cota = Number(ler("/sys/fs/cgroup/cpu/cpu.cfs_quota_us"));
  const periodo = Number(ler("/sys/fs/cgroup/cpu/cpu.cfs_period_us"));
  if (cota > 0 && periodo > 0) return Math.max(1, Math.round(cota / periodo));
  return os.availableParallelism?.() || os.cpus().length || 1;
}

export const MEMORIA = limiteMemoria();
export const CPUS = cpus();
export const RAM_GB = Math.round((MEMORIA / 1024 ** 3) * 10) / 10;
export const MAQUINA_PEQUENA = RAM_GB <= 3;

function memoriaUsada() {
  const v2 = Number(ler("/sys/fs/cgroup/memory.current"));
  if (v2) return v2;
  const v1 = Number(ler("/sys/fs/cgroup/memory/memory.usage_in_bytes"));
  if (v1) return v1;
  return os.totalmem() - os.freemem();
}

const PESADOS = /chrom|headless_shell|ffmpeg|python|remotion|hyperframes|soffice|whisper/i;

function processosPesados() {
  const lista = [];
  for (const pid of fs.readdirSync("/proc").filter((p) => /^\d+$/.test(p))) {
    if (Number(pid) === process.pid) continue;
    const cmd = (ler(`/proc/${pid}/cmdline`) || "").replace(/\0/g, " ");
    if (!PESADOS.test(cmd)) continue;
    const rss = Number((ler(`/proc/${pid}/statm`) || "").split(" ")[1]) * 4096;
    if (rss) lista.push({ pid: Number(pid), rss, cmd });
  }
  return lista.sort((a, b) => b.rss - a.rss);
}

export const avisosMemoria = []; // lidos pelo chat para avisar o agente
export function vigiarMemoria() {
  if (process.platform !== "linux" || process.env.VIGIA_MEMORIA === "0") return;
  const limite = MEMORIA * Number(process.env.VIGIA_MEMORIA_LIMITE || 0.9);
  setInterval(() => {
    if (memoriaUsada() < limite) return;
    const alvo = processosPesados()[0];
    if (!alvo) return;
    try {
      process.kill(alvo.pid, "SIGKILL");
      const msg = `Memória quase no limite (${RAM_GB} GB): processo encerrado para proteger o servidor — ${alvo.cmd.slice(0, 120)} (${Math.round(alvo.rss / 1e6)} MB)`;
      console.warn("[memória]", msg);
      avisosMemoria.push({ quando: Date.now(), msg });
      if (avisosMemoria.length > 20) avisosMemoria.shift();
    } catch {}
  }, 1500).unref();
}

export function resumoMaquina() {
  return { cpus: CPUS, ram_gb: RAM_GB };
}
