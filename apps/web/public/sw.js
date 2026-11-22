/*
 * PR 357: the smallest possible service worker. It exists so the browser offers installation and so a launch without a
 * network shows a notice instead of a browser error page. It caches only the files listed in SHELL (a notice page and an
 * icon). It never caches or answers an API call, a photo, a script, or any page of the application, and it ignores every
 * request that is not a same-origin page navigation, so no personal data can ever reach this cache.
 * A new version is installed in the background and takes over the next time the app is opened (no skipWaiting, no
 * clients.claim), so a session being filled in is never reloaded under the person's hands.
 */
const CACHE = 'lms-shell-v1';
const SHELL = ['/offline.html', '/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('lms-shell-') && key !== CACHE).map((key) => caches.delete(key)))),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.mode !== 'navigate') return;
  if (new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(request).catch(() => caches.match('/offline.html').then((cached) => cached ?? Response.error())));
});
