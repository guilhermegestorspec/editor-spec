// Backup do banco do sistema (usuários, clientes, lista de arquivos, tarefas) no Google Drive.
// Assim o servidor não precisa de disco persistente: ao iniciar sem banco, ele restaura do Drive.
import fs from "node:fs";
import path from "node:path";
import * as drive from "./drive.js";

const NOME = "spec-studio.db";
const INTERVALO = Number(process.env.BACKUP_INTERVALO_S || 60) * 1000;

async function pastaSistemaPorNome() {
  const raiz = await drive.acharPasta(process.env.DRIVE_PASTA_RAIZ || "Spec Studio", drive.DRIVE_ID);
  return raiz ? drive.acharPasta("_sistema", raiz) : null;
}

// Chamado ANTES de abrir o banco.
export async function restaurarSeNecessario(dataDir) {
  const alvo = path.join(dataDir, "spec.db");
  if (!drive.driveAtivo || fs.existsSync(alvo)) return null;
  const sistema = await pastaSistemaPorNome();
  const arq = sistema && (await drive.acharArquivo(NOME, sistema));
  if (!arq) return "Nenhum backup no Drive: começando com banco novo.";
  fs.mkdirSync(dataDir, { recursive: true });
  await drive.baixar(arq.id, alvo + ".restaurando");
  fs.renameSync(alvo + ".restaurando", alvo);
  return `Banco restaurado do Google Drive (backup de ${arq.modifiedTime}).`;
}

export function agendarBackups({ db, dataDir, pastaSistema }) {
  if (!drive.driveAtivo) return;
  let ultimo = -1;
  let rodando = false;
  let arquivoId = null;
  let diaDoSnapshot = null;

  const fazer = async () => {
    if (rodando) return;
    const mudancas = db.prepare("SELECT total_changes() AS n").get().n;
    const hoje = new Date().toISOString().slice(0, 10);
    if (mudancas === ultimo && diaDoSnapshot === hoje) return;
    rodando = true;
    const tmp = path.join(dataDir, `backup-${Date.now()}.db`);
    try {
      db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`); // cópia consistente
      const pasta = await pastaSistema();
      if (!arquivoId) arquivoId = (await drive.acharArquivo(NOME, pasta))?.id || null;
      const r = await drive.enviar(tmp, { nome: NOME, paiId: pasta, arquivoId });
      arquivoId = r.id;
      if (diaDoSnapshot !== hoje) {
        // uma cópia por dia, para voltar no tempo se precisar
        await drive.enviar(tmp, { nome: `spec-studio-${hoje}.db`, paiId: pasta });
        diaDoSnapshot = hoje;
      }
      ultimo = mudancas;
    } catch (e) {
      console.error("[backup] falhou:", e.message);
    } finally {
      fs.rmSync(tmp, { force: true });
      rodando = false;
    }
  };

  const t = setInterval(fazer, INTERVALO);
  t.unref();
  setTimeout(fazer, 5000).unref();
  // salva também ao desligar (deploy novo, reinício)
  for (const sinal of ["SIGTERM", "SIGINT"]) {
    process.once(sinal, async () => {
      clearInterval(t);
      ultimo = -2;
      await fazer().catch(() => {});
      process.exit(0);
    });
  }
}
