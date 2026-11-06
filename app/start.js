// Ponto de entrada: restaura o banco do Drive (se configurado) e só então sobe o servidor.
import path from "node:path";
import { restaurarSeNecessario } from "./lib/backup.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, "data"));

try {
  const msg = await restaurarSeNecessario(DATA_DIR);
  if (msg) console.log(msg);
} catch (e) {
  console.error("Não foi possível falar com o Google Drive:", e.message);
  console.error("Confira DRIVE_ID, GOOGLE_SERVICE_ACCOUNT_JSON e se a conta de serviço foi adicionada ao Drive compartilhado.");
  process.exit(1);
}

await import("./server.js");
