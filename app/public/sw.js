// Service worker do Spec Studio: permite instalar como app e receber notificações.
// Não guarda páginas nem dados em cache (o sistema é sempre online).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { corpo: e.data && e.data.text() };
  }
  e.waitUntil(
    self.registration.showNotification(d.titulo || "Spec Studio", {
      body: d.corpo || "",
      icon: "/marca/app-192.png",
      badge: "/marca/badge-96.png",
      tag: d.tag || undefined,
      renotify: !!d.tag,
      data: { url: d.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "/", self.location.origin).href;
  e.waitUntil(
    (async () => {
      const abertas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of abertas) {
        if (new URL(c.url).origin === self.location.origin) {
          await c.focus();
          return c.navigate ? c.navigate(url) : null;
        }
      }
      return self.clients.openWindow(url);
    })()
  );
});
