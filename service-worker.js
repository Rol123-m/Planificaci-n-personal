/**
 * Planificación Personal — Service Worker
 * -------------------------------------------------------------
 * Estrategias:
 *  - Navegaciones (HTML):  network-first → fallback a caché (index.html).
 *  - Assets estáticos:     stale-while-revalidate (cache-first con revalidación en segundo plano).
 *  - API (script.google.com): SIEMPRE red; las peticiones fallidas las gestiona la cola
 *    de sincronización (IndexedDB + outbox) en script.js/sync.js. Nunca se cachean.
 * Extra:
 *  - Notificaciones locales y al hacer clic (notificationclick).
 *  - 'periodicsync' (Background Periodic Sync, Chrome/Edge) para revisar recordatorios
 *    con la app cerrada. En iOS/Safari se usan notificaciones locales con la app abierta.
 *  - 'push': preparado para Web Push con VAPID (requiere un emisor externo; ver
 *    docs/MEJORAS-FUTURAS.md). Si llega un push sin payload muestra uno genérico.
 */

const VERSION = 'v1.0.1';
const CACHE_STATIC = `pp-static-${VERSION}`;
const CACHE_NAV = `pp-nav-${VERSION}`;

/* Lista de archivos precacheados en la instalación (mantener en sync con los ficheros reales). */
const PRECACHE = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './script.js',
  './js/i18n.js',
  './js/utils.js',
  './js/db.js',
  './js/api.js',
  './js/sync.js',
  './js/ui.js',
  './js/demo.js',
  './js/notify.js',
  './js/importers.js',
  './js/exporters.js',
  './js/views-hoy.js',
  './js/views-semana.js',
  './js/views-mes.js',
  './js/views-roles.js',
  './js/views-metas.js',
  './js/views-extra.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_STATIC);
      // addAll es atómico: si un archivo falla, la instalación falla (nos avisa de lista desactualizada).
      await cache.addAll(PRECACHE);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== CACHE_STATIC && k !== CACHE_NAV)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/** ¿Es una petición a la API de Apps Script? */
function isApiRequest(url) {
  return url.hostname === 'script.google.com' || url.hostname === 'script.googleusercontent.com';
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch: true });
  // Revalidación en segundo plano SIEMPRE contra red (ignora la caché HTTP del
  // navegador para no volver a guardar una copia obsoleta).
  const refresh = fetch(request, { cache: 'reload' })
    .then((res) => {
      if (res && res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  if (cached) return cached;
  const network = await refresh;
  if (network && network.ok) return network;
  return new Response('Recurso no disponible offline', { status: 504, statusText: 'Offline' });
}

async function navigationHandler(request) {
  const cache = await caches.open(CACHE_NAV);
  try {
    // Timeout de red corto para saltar rápido a la caché si no hay conexión.
    const res = await Promise.race([
      fetch(request),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))
    ]);
    if (res && res.ok) {
      cache.put('./index.html', res.clone());
      return res;
    }
    throw new Error('bad response');
  } catch (err) {
    const cachedNav = await cache.match('./index.html', { ignoreSearch: true });
    if (cachedNav) return cachedNav;
    const cachedStatic = await caches.open(CACHE_STATIC);
    const fallback = await cachedStatic.match('./index.html');
    if (fallback) return fallback;
    return new Response(
      '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Sin conexión</title></head>' +
        '<body style="font-family:sans-serif;text-align:center;padding:3rem"><h1>Sin conexión</h1>' +
        '<p>Abre la app de nuevo cuando tengas internet.</p></body></html>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // POST /API → lo maneja la app (cola de sync)
  const url = new URL(req.url);
  if (isApiRequest(url)) return; // API nunca se cachea
  if (url.origin !== self.location.origin) return; // terceros (Google Identity, etc.) → red directa

  if (req.mode === 'navigate') {
    event.respondWith(navigationHandler(req));
    return;
  }
  event.respondWith(staleWhileRevalidate(req, CACHE_STATIC));
});

/* ------------------------------------------------------------------ */
/* IndexedDB (lectura de recordatorios desde el SW)                    */
/* ------------------------------------------------------------------ */

function swOpenDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('planpersonal', 1);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function swGetAll(store) {
  return swOpenDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readonly');
        const rq = tx.objectStore(store).getAll();
        rq.onsuccess = () => resolve(rq.result || []);
        rq.onerror = () => reject(rq.error);
      })
  );
}

/** Muestra las notificaciones de recordatorios que vencen en los próximos 2 min y aún no se mostraron. */
async function checkRemindersInSW() {
  try {
    const all = await swGetAll('recordatorios');
    const shown = await swGetAll('notifs');
    const shownKeys = new Set(shown.map((n) => n.key || ''));
    const now = Date.now();
    for (const r of all) {
      if (!r || r.deleted === 1 || r.enviado === 'si') continue;
      const t = new Date(r.fecha_hora).getTime();
      if (!t || Number.isNaN(t)) continue;
      const key = r.id;
      if (t <= now && now - t < 15 * 60 * 1000 && !shownKeys.has(key)) {
        await self.registration.showNotification('Recordatorio', {
          body: 'Tienes un recordatorio pendiente. Abre Planificación Personal.',
          tag: key,
          icon: './icons/icon-192.png',
          badge: './icons/icon-192.png',
          data: { url: './index.html?view=hoy' }
        });
        // marca como mostrado en la bandeja local
        const db = await swOpenDB();
        await new Promise((resolve, reject) => {
          const tx = db.transaction('notifs', 'readwrite');
          tx.objectStore('notifs').add({ key, ts: Date.now(), title: 'Recordatorio', body: '' });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      }
    }
  } catch (err) {
    // Sin datos locales aún (primera ejecución) → no pasa nada.
  }
}

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'pp-reminders') event.waitUntil(checkRemindersInSW());
});

/* ------------------------------------------------------------------ */
/* Web Push (preparado; el emisor externo es opcional)                 */
/* ------------------------------------------------------------------ */

self.addEventListener('push', (event) => {
  let data = {};
  try {
    if (event.data) data = event.data.json();
  } catch (e) {
    data = {};
  }
  const title = (data && data.title) || 'Planificación Personal';
  const body =
    (data && data.body) ||
    'Tienes recordatorios pendientes. Abre la app para revisarlos.';
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      data: { url: data.url || './index.html?view=hoy' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './index.html';
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow(url);
    })()
  );
});
