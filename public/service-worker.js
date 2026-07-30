const NOTIFICATION_TITLE = "Makro kuharica";
const NOTIFICATION_BODY = "Ali si se danes že stehtal/a?";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() || {};
  } catch {
    payload = { body: event.data?.text() };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || NOTIFICATION_TITLE, {
      body: payload.body || NOTIFICATION_BODY,
      icon: "icon-192.png",
      badge: "icon-192.png",
      tag: "daily-weight-reminder",
      renotify: false,
      data: {
        url: payload.url || self.registration.scope,
      },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || self.registration.scope;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existingClient = clients.find((client) => client.url.startsWith(self.registration.scope));
      if (existingClient) {
        existingClient.navigate(targetUrl);
        return existingClient.focus();
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
