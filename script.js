/**
 * Planificación Personal — script.js (punto de entrada)
 * Arranque de la aplicación:
 *  1. Aplica tema e idioma.
 *  2. Pantalla de acceso: Google Identity Services (ID Token), código de acceso
 *     (modo alterno) o modo demo sin cuenta.
 *  3. Tras autenticar: carga snapshot (pull), arranca sync engine, recordatorios
 *     y Service Worker, y monta el enrutador de vistas.
 *  4. Atajos de teclado y estado de sincronización en la cabecera.
 */

import * as db from './js/db.js';
import * as api from './js/api.js';
import * as sync from './js/sync.js';
import { startDemo, isDemoMode } from './js/demo.js';
import { startReminderEngine, requestPermission, registerPeriodicSync } from './js/notify.js';
import { t, applyI18n, setLocale, getLocale } from './js/i18n.js';
import { esc, html, on } from './js/utils.js';
import {
  toast, wirePopover, renderNotifTray, openConflictsModal, openTaskEditor
} from './js/ui.js';
import { renderHoy } from './js/views-hoy.js';
import { renderSemana, goToday } from './js/views-semana.js';
import { renderMes } from './js/views-mes.js';
import { renderRoles } from './js/views-roles.js';
import { renderMetas } from './js/views-metas.js';
import { renderBuscar, renderStats, renderPapelera, renderAjustes } from './js/views-extra.js';

const VIEWS = {
  hoy: renderHoy,
  semana: renderSemana,
  mes: renderMes,
  roles: renderRoles,
  metas: renderMetas,
  buscar: renderBuscar,
  stats: renderStats,
  papelera: renderPapelera,
  ajustes: renderAjustes
};

let currentView = localStorage.getItem('pp_view') || 'hoy';

/* ------------------------------------------------------------------ */
/* Tema                                                                */
/* ------------------------------------------------------------------ */

function applyTheme() {
  const pref = localStorage.getItem('pp_theme') || 'auto';
  const dark = pref === 'dark' || (pref === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}
document.addEventListener('pp:theme', applyTheme);
window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

/* ------------------------------------------------------------------ */
/* Enrutador                                                           */
/* ------------------------------------------------------------------ */

async function navigate(view) {
  if (!VIEWS[view]) view = 'hoy';
  currentView = view;
  localStorage.setItem('pp_view', view);
  document.querySelectorAll('#tabbar .tab').forEach((tab) => {
    tab.setAttribute('aria-selected', String(tab.dataset.view === view));
  });
  const root = document.getElementById('view');
  root.innerHTML = `<p class="muted center" style="margin-top:2rem">${t('common.loading')}</p>`;
  try {
    await VIEWS[view](root);
    root.focus({ preventScroll: true });
  } catch (err) {
    console.error(err);
    root.innerHTML = `<div class="card"><h2>⚠️</h2><p>${esc(err.message || 'Error')}</p></div>`;
  }
}

function wireRouter() {
  document.querySelectorAll('#tabbar .tab').forEach((tab) => {
    tab.addEventListener('click', () => navigate(tab.dataset.view));
  });
  // Re-render de la vista actual cuando algo cambia
  document.addEventListener('pp:rerender', () => navigate(currentView));
  on('pp:data', () => navigate(currentView));
}

/* ------------------------------------------------------------------ */
/* Cabecera: sync, campana, tema, idioma, cuenta                       */
/* ------------------------------------------------------------------ */

function updateSyncUI(detail) {
  const pill = document.getElementById('sync-pill');
  const label = document.getElementById('sync-label');
  const footer = document.getElementById('footer-sync-info');
  if (!pill) return;
  const s = detail.status || 'offline';
  pill.setAttribute('data-state', s === 'demo' ? 'offline' : s);
  const text = s === 'online' ? t('sync.online')
    : s === 'syncing' ? t('sync.syncing')
    : s === 'pending' ? `${detail.pending} ${t('sync.pending')}`
    : s === 'demo' ? t('sync.demo')
    : t('sync.offline');
  label.textContent = text;
  if (footer) {
    footer.textContent = detail.lastSync
      ? `${t('ajustes.lastSync')}: ${new Date(detail.lastSync).toLocaleString()}`
      : '';
  }
}

function wireHeader() {
  const pill = document.getElementById('sync-pill');
  pill.onclick = async () => {
    if (api.isDemo()) return;
    sync.syncNotify();
    const { flush } = await import('./js/sync.js');
    flush();
  };

  wirePopover('btn-bell', 'notif-tray');
  document.getElementById('btn-bell').addEventListener('click', () => renderNotifTray());
  wirePopover('btn-user', 'user-menu');

  document.getElementById('btn-theme').onclick = () => {
    const cur = localStorage.getItem('pp_theme') || 'auto';
    const next = cur === 'light' ? 'dark' : cur === 'dark' ? 'auto' : 'light';
    localStorage.setItem('pp_theme', next);
    applyTheme();
  };

  const langBtn = document.getElementById('btn-lang');
  langBtn.textContent = getLocale().toUpperCase();
  langBtn.onclick = () => {
    const next = getLocale() === 'es' ? 'en' : 'es';
    setLocale(next);
    langBtn.textContent = next.toUpperCase();
    navigate(currentView);
  };

  document.getElementById('btn-search').onclick = () => navigate('buscar');
  document.getElementById('mi-ajustes').onclick = () => navigate('ajustes');
  document.getElementById('mi-sync').onclick = () => {
    import('./js/sync.js').then(({ flush }) => flush());
  };
  document.getElementById('mi-backup').onclick = async () => {
    const ex = await import('./js/exporters.js');
    ex.exportJSON();
  };
  document.getElementById('mi-logout').onclick = logout;

  on('pp:sync', updateSyncUI);
  on('pp:conflicts', () => openConflictsModal());
  on('pp:toast', ({ detail }) => toast(detail.msg, detail.type || ''));
  on('pp:notifs', () => renderNotifTray());
  on('pp:auth-expired', () => {
    toast(t('errors.auth'), 'error', 6000);
    logout();
  });
  on('pp:demo-on', () => {
    showBanner(t('banner.demo'));
  });

  const offlineBanner = document.getElementById('offline-banner');
  const showOffline = () => {
    offlineBanner.hidden = navigator.onLine;
    if (!navigator.onLine) offlineBanner.textContent = t('banner.offline');
  };
  window.addEventListener('online', showOffline);
  window.addEventListener('offline', showOffline);
  showOffline();
}

function showBanner(text) {
  const banner = document.getElementById('offline-banner');
  banner.hidden = false;
  banner.textContent = text;
}

/* ------------------------------------------------------------------ */
/* Autenticación                                                       */
/* ------------------------------------------------------------------ */

function showAuth() {
  document.getElementById('auth-screen').hidden = false;
  document.getElementById('app').hidden = true;
}

function showApp() {
  document.getElementById('auth-screen').hidden = true;
  document.getElementById('app').hidden = false;
}

async function afterLogin(authData) {
  // authData: { user_id, session_token, email, nombre, es_admin, spreadsheet_id }
  api.setSession(authData.user_id, authData.session_token);
  await db.setMeta('userId', authData.user_id);
  await db.setMeta('session_token', authData.session_token);
  await db.setMeta('email', authData.email || '');
  await db.setMeta('nombre', authData.nombre || '');
  await db.setMeta('es_admin', authData.es_admin ? 'si' : 'no');
  await db.setMeta('demo', 'no');
  api.setDemo(false);
  if (authData.admin_email) localStorage.setItem('pp_admin_email', authData.admin_email);

  document.getElementById('menu-name').textContent = authData.nombre || '—';
  document.getElementById('menu-email').textContent = authData.email || '—';
  document.getElementById('user-initial').textContent = (authData.nombre || authData.email || '?').charAt(0).toUpperCase();

  showApp();
  applyI18n();
  await sync.pull(0); // snapshot inicial completo
  sync.startSyncEngine();
  startReminderEngine();
  navigate(currentView);
}

async function logout() {
  api.setSession('', '');
  await db.setMeta('userId', '');
  await db.setMeta('session_token', '');
  showAuth();
  await restoreAuthScreen();
}

async function restoreAuthScreen() {
  // Decidir modo demo activo
  if (await isDemoMode()) {
    api.setDemo(true);
    document.getElementById('app').hidden = false;
    document.getElementById('auth-screen').hidden = true;
    sync.startSyncEngine();
    navigate(currentView);
    showBanner(t('banner.demo'));
    return;
  }
  const token = await db.getMeta('session_token', '');
  const userId = await db.getMeta('userId', '');
  if (token && userId && api.isConfigured()) {
    // Sesión guardada: verificar con pull ligero
    try {
      api.setSession(userId, token);
      await api.call('ping');
      await afterLogin({ user_id: userId, session_token: token, email: await db.getMeta('email', ''), nombre: await db.getMeta('nombre', ''), es_admin: (await db.getMeta('es_admin', 'no')) === 'si' });
      return;
    } catch (e) {
      // sesión caducada → pantalla de acceso
    }
  }
  initGoogleButton();
}

/* ---------- Google Identity Services ---------- */

let gisReady = false;

function initGoogleButton() {
  if (window.__ppGisInit) return; // evita inicializar GIS dos veces
  window.__ppGisInit = true;
  const container = document.getElementById('gis-button');
  const errEl = document.getElementById('gis-error');
  const render = () => {
    if (!window.google?.accounts?.id) return false;
    try {
      window.google.accounts.id.initialize({
        client_id: api.getUrl() ? (window.__ppClientId || '') : '',
        callback: onGisCredential,
        auto_select: false,
        use_fedcm_for_prompt: true
      });
      if (!window.__ppClientId) {
        errEl.hidden = false;
        errEl.textContent = t('auth.loading');
        return true;
      }
      window.google.accounts.id.renderButton(container, { theme: 'outline', size: 'large', width: 300, text: 'signin_with' });
      gisReady = true;
      errEl.hidden = true;
      return true;
    } catch (e) {
      return false;
    }
  };
  if (!render()) {
    window.addEventListener('load', () => setTimeout(render, 400));
  }
}

async function onGisCredential(response) {
  try {
    // getPublicConfig también confirma el client_id esperado (aud)
    const cfg = await api.publicConfig().catch(() => ({}));
    const data = await api.call('register', {
      id_token: response.credential,
      nombre: ''
    });
    window.__ppClientId = cfg.client_id || window.__ppClientId;
    await afterLogin(data);
  } catch (err) {
    const errEl = document.getElementById('gis-error');
    errEl.hidden = false;
    errEl.textContent = err.code === 'NETWORK' ? t('errors.network') : (err.message || t('auth.error.gis'));
  }
}

/* ---------- Código de acceso (modo alterno) ---------- */

function wireAccessCode() {
  document.getElementById('access-code-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('ac-error');
    errEl.hidden = true;
    const fd = new FormData(e.target);
    try {
      const data = await api.call('register', {
        access_code: fd.get('code'),
        email: fd.get('email'),
        nombre: fd.get('nombre')
      });
      await afterLogin(data);
    } catch (err) {
      errEl.textContent = err.code === 'NETWORK' ? t('errors.network') : err.message;
      errEl.hidden = false;
    }
  });
}

/* ---------- Modo demo ---------- */

function wireDemo() {
  document.getElementById('btn-demo').onclick = async () => {
    await startDemo();
    document.getElementById('app').hidden = false;
    document.getElementById('auth-screen').hidden = true;
    document.getElementById('menu-name').textContent = 'Demo';
    document.getElementById('menu-email').textContent = 'sin sincronización';
    document.getElementById('user-initial').textContent = 'D';
    sync.startSyncEngine();
    startReminderEngine();
    navigate(currentView);
    showBanner(t('banner.demo'));
  };
}

/* ------------------------------------------------------------------ */
/* Atajos de teclado                                                   */
/* ------------------------------------------------------------------ */

function wireShortcuts() {
  let lastG = 0;
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (['input', 'textarea', 'select'].includes(tag) && e.key !== 'Escape') return;
    const now = Date.now();

    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-backdrop').forEach((m) => m.remove());
      document.querySelectorAll('.popover').forEach((p) => (p.hidden = true));
      return;
    }
    if (e.key === '/') { e.preventDefault(); navigate('buscar'); return; }
    if (e.key === '?') {
      document.getElementById('shortcuts-help').hidden = false;
      document.querySelector('#shortcuts-help .modal-close').onclick = () => {
        document.getElementById('shortcuts-help').hidden = true;
      };
      return;
    }
    if (e.key.toLowerCase() === 'n' && !document.getElementById('app').hidden) {
      e.preventDefault();
      openTaskEditor(null, { defaultFecha: new Date().toISOString().slice(0, 10) });
      return;
    }
    if (e.key.toLowerCase() === 't') { goToday(); navigate(currentView); return; }
    if (e.key.toLowerCase() === 'g') {
      lastG = now;
      return;
    }
    if (now - lastG < 1200) {
      const map = { h: 'hoy', s: 'semana', m: 'mes', r: 'roles', l: 'metas' };
      const v = map[e.key.toLowerCase()];
      if (v) navigate(v);
      lastG = 0;
    }
  });
}

/* ------------------------------------------------------------------ */
/* Arranque                                                            */
/* ------------------------------------------------------------------ */

async function bootstrap() {
  applyTheme();
  setLocale(getLocale());
  applyI18n();

  document.getElementById('btn-lang-auth').onclick = () => {
    const next = getLocale() === 'es' ? 'en' : 'es';
    setLocale(next);
    document.getElementById('btn-lang-auth').textContent = next.toUpperCase();
  };

  wireRouter();
  wireHeader();
  wireAccessCode();
  wireDemo();
  wireShortcuts();
  applyI18n();

  // Config pública (URL del backend guardada por el usuario en Ajustes)
  if (api.isConfigured()) {
    api.publicConfig().then((cfg) => {
      window.__ppClientId = cfg.client_id || '';
      initGoogleButton();
    }).catch(() => initGoogleButton());
  } else {
    // Sin backend configurado: mostrar ayuda en pantalla de acceso
    const errEl = document.getElementById('gis-error');
    errEl.hidden = false;
    errEl.textContent = t('errors.setup');
    initGoogleButton();
  }

  // Session Worker + periodic sync
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('./service-worker.js');
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            toast('🔄 ' + 'Nueva versión disponible', '', 8000, 'Recargar', () => location.reload());
          }
        });
      });
      if (reg.waiting) toast('🔄 Nueva versión disponible', '', 8000, 'Recargar', () => location.reload());
      await registerPeriodicSync();
    } catch (e) {
      console.warn('SW no registrado:', e);
    }
  }

  // ¿sesión previa o demo?
  const demo = await isDemoMode();
  if (demo) {
    api.setDemo(true);
    document.getElementById('app').hidden = false;
    document.getElementById('auth-screen').hidden = true;
    document.getElementById('menu-name').textContent = 'Demo';
    document.getElementById('user-initial').textContent = 'D';
    sync.startSyncEngine();
    navigate(currentView);
    showBanner(t('banner.demo'));
    return;
  }

  const token = await db.getMeta('session_token', '');
  const userId = await db.getMeta('userId', '');
  if (token && userId && api.isConfigured()) {
    api.setSession(userId, token);
    try {
      await api.call('ping');
      await afterLogin({
        user_id: userId,
        session_token: token,
        email: await db.getMeta('email', ''),
        nombre: await db.getMeta('nombre', ''),
        es_admin: (await db.getMeta('es_admin', 'no')) === 'si'
      });
      return;
    } catch (e) {
      /* sesión caducada */
    }
  }
  showAuth();
  initGoogleButton();
  // Recordar permiso de notificaciones si ya estaba concedido
  if (Notification?.permission === 'granted') registerPeriodicSync();
}

bootstrap();
