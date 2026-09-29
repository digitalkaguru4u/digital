/* Digital Guru CRM service worker — shows push notifications and opens the right page on click. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'Digital Guru CRM', body: event.data && event.data.text() }; }
  const title = data.title || 'Digital Guru CRM';
  event.waitUntil((async () => {
    await self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/admin/logo-192.png',
      badge: '/admin/logo-192.png',
      tag: data.tag || undefined,
      renotify: !!data.tag,
      data: { url: data.url || '/admin/' },
      requireInteraction: data.type === 'followup_reminder',
    });
    // let open CRM tabs refresh their bell immediately
    const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    tabs.forEach((c) => c.postMessage({ type: 'dg-notification', payload: data }));
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/admin/', self.location.origin).href;
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const crm = tabs.find((c) => c.url.includes('/admin'));
    if (crm) { await crm.focus(); return crm.navigate(url); }
    return self.clients.openWindow(url);
  })());
});
