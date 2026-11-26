const APP_BASE = new URL('./', self.location.href);
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (_) { payload = { body: event.data?.text() || '' }; }
  const title = payload.title || '순애 길드 알림';
  const options = {
    body: payload.body || '새로운 길드 알림이 있습니다.',
    data: { url: payload.data?.url || APP_BASE.href },
    tag: payload.tag || undefined,
    renotify: false
  };
  event.waitUntil(self.registration.showNotification(title, options));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || APP_BASE.href, APP_BASE).href;
  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientsList) {
      if (client.url.startsWith(APP_BASE.href) && 'focus' in client) return client.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow(target);
  })());
});
