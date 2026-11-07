// Notificações no celular/computador (Web Push), também com o app instalado na tela de início.
// As chaves VAPID são geradas uma vez e ficam no banco (que tem backup no Drive).
import webpush from "web-push";
import { db } from "./db.js";

db.exec(`
CREATE TABLE IF NOT EXISTS config (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS push_inscricoes (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  chaves TEXT NOT NULL,
  aparelho TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

function chavesVapid() {
  const ja = db.prepare("SELECT valor FROM config WHERE chave = 'vapid'").get();
  if (ja) return JSON.parse(ja.valor);
  const novas = webpush.generateVAPIDKeys();
  db.prepare("INSERT INTO config (chave, valor) VALUES ('vapid', ?)").run(JSON.stringify(novas));
  return novas;
}

const vapid = chavesVapid();
webpush.setVapidDetails(process.env.PUBLIC_URL || "https://studio.specmarketingdigital.com.br", vapid.publicKey, vapid.privateKey);

export const chavePublica = () => vapid.publicKey;

export function inscrever(userId, sub, aparelho) {
  if (!sub?.endpoint || !/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) throw new Error("Inscrição inválida.");
  db.prepare(
    `INSERT INTO push_inscricoes (user_id, endpoint, chaves, aparelho) VALUES (?,?,?,?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, chaves = excluded.chaves, aparelho = excluded.aparelho`
  ).run(userId, sub.endpoint, JSON.stringify(sub.keys), String(aparelho || "").slice(0, 120));
}

export function cancelar(userId, endpoint) {
  db.prepare("DELETE FROM push_inscricoes WHERE user_id = ? AND endpoint = ?").run(userId, endpoint);
}

export const inscricoes = (userId) => db.prepare("SELECT COUNT(*) n FROM push_inscricoes WHERE user_id = ?").get(userId).n;

// Envia para todos os aparelhos da pessoa. Nunca derruba quem chamou.
export async function notificar(userId, { titulo, corpo, url = "/", tag }) {
  if (!userId) return;
  const subs = db.prepare("SELECT * FROM push_inscricoes WHERE user_id = ?").all(userId);
  const carga = JSON.stringify({ titulo, corpo: String(corpo || "").slice(0, 240), url, tag });
  await Promise.all(
    subs.map((s) =>
      webpush
        .sendNotification({ endpoint: s.endpoint, keys: JSON.parse(s.chaves) }, carga, { TTL: 24 * 3600, urgency: "high" })
        .catch((e) => {
          if (e.statusCode === 404 || e.statusCode === 410) db.prepare("DELETE FROM push_inscricoes WHERE id = ?").run(s.id);
          else console.error("[push]", e.statusCode || "", e.message);
        })
    )
  );
}
