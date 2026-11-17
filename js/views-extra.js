/**
 * Planificación Personal — views-extra.js
 * Vistas: Búsqueda global con filtros, Estadísticas, Papelera y Ajustes
 * (perfil, tema, idioma, notificaciones, datos/respaldo, sincronización, admin).
 */

import * as db from './db.js';
import * as api from './api.js';
import { applyLocal, flush, refreshPending } from './sync.js';
import { t, getLocale, setLocale } from './i18n.js';
import { esc, html, raw, todayISO, startOfWeek, addDays, clamp, fmtDate, priorityRank } from './utils.js';
import {
  taskRowHTML, wireTaskList, getRoles, viewTitle, rerenderCurrentView,
  openModal, confirmDialog, toast, openConflictsModal, renderNotifTray
} from './ui.js';
import { requestPermission, permissionState, registerPeriodicSync } from './notify.js';

/* ================================================================== */
/* Búsqueda global                                                     */
/* ================================================================== */

const searchState = { selectMode: false, selected: new Set() };

export async function renderBuscar(root) {
  const roles = await getRoles();
  const tags = await collectTags();
  const filters = readFilters(root);

  const all = (await db.getAll('tareas')).filter((x) => !x.deleted);
  const roleMap = new Map(roles.map((r) => [r.id, r]));

  const results = all.filter((task) => {
    const f = filters;
    if (f.text) {
      const hay = `${task.titulo} ${task.descripcion} ${task.etiquetas}`.toLowerCase();
      if (!hay.includes(f.text.toLowerCase())) return false;
    }
    if (f.rol && task.rol_id !== f.rol) return false;
    if (f.estado && task.estado !== f.estado) return false;
    if (f.prio && task.prioridad !== f.prio) return false;
    if (f.tag && !String(task.etiquetas || '').split('|').includes(f.tag)) return false;
    if (f.from && task.fecha && task.fecha < f.from) return false;
    if (f.to && task.fecha && task.fecha > f.to) return false;
    if ((f.from || f.to) && !task.fecha) return false;
    return true;
  });

  root.innerHTML = html`
    ${raw(viewTitle(t('buscar.title'), `
      <span class="muted">${results.length} ${t('buscar.results')}</span>
      <button class="btn ghost" id="btn-selmode">${searchState.selectMode ? '☑' : '☐'} ${t('buscar.selectMode')}</button>
      ${searchState.selectMode && searchState.selected.size ? `<button class="btn primary" id="btn-exp-sel">⤓ ${t('buscar.exportSelected')} (${searchState.selected.size})</button>` : ''}
    `))}
    <div class="filters">
      <input id="f-text" type="search" placeholder="${t('common.search')}…" value="${esc(filters.text)}" />
      <select id="f-rol">
        <option value="">${t('buscar.role')}: ${t('common.all')}</option>
        ${roles.map((r) => `<option value="${esc(r.id)}" ${filters.rol === r.id ? 'selected' : ''}>${esc(r.nombre)}</option>`).join('')}
      </select>
      <select id="f-estado">
        <option value="">${t('buscar.state')}: ${t('common.all')}</option>
        ${['pendiente', 'en_curso', 'hecha'].map((s) => `<option value="${s}" ${filters.estado === s ? 'selected' : ''}>${t('task.estado.' + s)}</option>`).join('')}
      </select>
      <select id="f-prio">
        <option value="">${t('buscar.priority')}: ${t('common.all')}</option>
        ${['alta', 'media', 'baja'].map((p) => `<option value="${p}" ${filters.prio === p ? 'selected' : ''}>${t('task.priority.' + p)}</option>`).join('')}
      </select>
      <select id="f-tag">
        <option value="">${t('buscar.tag')}: ${t('common.all')}</option>
        ${tags.map((tag) => `<option value="${esc(tag)}" ${filters.tag === tag ? 'selected' : ''}>#${esc(tag)}</option>`).join('')}
      </select>
      <input id="f-from" type="date" value="${esc(filters.from)}" title="${t('buscar.from')}" />
      <input id="f-to" type="date" value="${esc(filters.to)}" title="${t('buscar.to')}" />
      <button class="btn ghost tiny" id="f-clear">✕ ${t('buscar.clear')}</button>
    </div>
    <div id="search-results">
      ${results.length
        ? raw(results.map((x) => taskRowHTML(x, roleMap.get(x.rol_id), { selectMode: searchState.selectMode })).join(''))
        : `<p class="muted center">${t('common.none')}</p>`}
    </div>`;

  wireTaskList(root.querySelector('#search-results'), {
    rerender: rerenderCurrentView,
    selectMode: searchState.selectMode,
    selected: searchState.selected
  });

  // restaurar estado de checkboxes
  if (searchState.selectMode) {
    root.querySelectorAll('[data-sel]').forEach((cb) => {
      cb.checked = searchState.selected.has(cb.getAttribute('data-sel'));
    });
  }

  const rerenderSearch = () => { saveFilters(root); rerenderCurrentView(); };
  ['f-text', 'f-rol', 'f-estado', 'f-prio', 'f-tag', 'f-from', 'f-to'].forEach((id) => {
    const el = root.querySelector('#' + id);
    if (el) el.addEventListener('change', rerenderSearch);
  });
  root.querySelector('#f-clear').onclick = () => {
    sessionStorage.removeItem('pp_search_filters');
    rerenderCurrentView();
  };
  root.querySelector('#btn-selmode').onclick = () => {
    searchState.selectMode = !searchState.selectMode;
    searchState.selected.clear();
    rerenderCurrentView();
  };
  const expSel = root.querySelector('#btn-exp-sel');
  if (expSel) {
    expSel.onclick = async () => {
      const tasks = [];
      for (const id of searchState.selected) {
        const row = await db.get('tareas', id);
        if (row) tasks.push(row);
      }
      const ex = await import('./exporters.js');
      ex.exportICS(tasks, 'planificacion_seleccion');
    };
  }
}

function readFilters(root) {
  const saved = JSON.parse(sessionStorage.getItem('pp_search_filters') || '{}');
  const g = (id) => root.querySelector('#' + id)?.value ?? '';
  return {
    text: g('f-text') || saved.text || '',
    rol: g('f-rol') || saved.rol || '',
    estado: g('f-estado') || saved.estado || '',
    prio: g('f-prio') || saved.prio || '',
    tag: g('f-tag') || saved.tag || '',
    from: g('f-from') || saved.from || '',
    to: g('f-to') || saved.to || ''
  };
}

function saveFilters(root) {
  const f = {
    text: root.querySelector('#f-text')?.value || '',
    rol: root.querySelector('#f-rol')?.value || '',
    estado: root.querySelector('#f-estado')?.value || '',
    prio: root.querySelector('#f-prio')?.value || '',
    tag: root.querySelector('#f-tag')?.value || '',
    from: root.querySelector('#f-from')?.value || '',
    to: root.querySelector('#f-to')?.value || ''
  };
  sessionStorage.setItem('pp_search_filters', JSON.stringify(f));
}

async function collectTags() {
  const custom = (await db.getAll('etiquetas')).filter((x) => !x.deleted).map((x) => x.nombre);
  const tasks = (await db.getAll('tareas')).filter((x) => !x.deleted);
  const fromTasks = tasks.flatMap((x) => String(x.etiquetas || '').split('|')).filter(Boolean);
  return [...new Set(custom.concat(fromTasks))].sort();
}

/* ================================================================== */
/* Estadísticas                                                        */
/* ================================================================== */

export async function renderStats(root) {
  const roles = await getRoles();
  const all = (await db.getAll('tareas')).filter((x) => !x.deleted);
  const today = todayISO();

  const done = all.filter((x) => x.estado === 'hecha');
  const pending = all.filter((x) => x.estado !== 'hecha');
  const overdue = pending.filter((x) => x.fecha && x.fecha < today);

  // Completadas por semana (según updated_at de la versión "hecha")
  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const ws = startOfWeek(addDays(today, -7 * i));
    weeks.push({ ws, n: 0 });
  }
  for (const task of done) {
    const ts = String(task.updated_at || '').slice(0, 10);
    if (!ts) continue;
    const ws = startOfWeek(ts);
    const w = weeks.find((x) => x.ws === ws);
    if (w) w.n++;
  }
  const maxWeek = Math.max(1, ...weeks.map((w) => w.n));

  // Tiempo estimado por rol (tareas hechas)
  const byRole = roles.map((r) => ({
    role: r,
    min: done.filter((x) => x.rol_id === r.id).reduce((s, x) => s + (Number(x.duracion_min) || 0), 0)
  })).filter((x) => x.min > 0).sort((a, b) => b.min - a.min);
  const maxMin = Math.max(1, ...byRole.map((x) => x.min));

  // Pendientes por prioridad
  const byPrio = ['alta', 'media', 'baja'].map((p) => ({
    p,
    n: pending.filter((x) => (x.prioridad || 'media') === p).length
  }));
  const maxPrio = Math.max(1, ...byPrio.map((x) => x.n));

  const colorOf = (p) => (p === 'alta' ? 'var(--rose)' : p === 'media' ? 'var(--amber)' : 'var(--muted)');

  root.innerHTML = html`
    ${raw(viewTitle(t('stats.title')))}
    <div class="stat-cards">
      <div class="card stat-card"><div class="n">${done.length}</div><div class="l">${t('stats.totalDone')}</div></div>
      <div class="card stat-card"><div class="n">${pending.length}</div><div class="l">${t('stats.totalPending')}</div></div>
      <div class="card stat-card"><div class="n">${overdue.length}</div><div class="l">${t('stats.totalOverdue')}</div></div>
    </div>

    <div class="card">
      <h3>${t('stats.weekDone')}</h3>
      <div class="stat-bars">
        ${weeks.map((w) => `
          <div class="stat-bar-row">
            <span class="muted">${fmtDate(w.ws)}</span>
            <div class="stat-bar"><span style="width:${(w.n / maxWeek) * 100}%;background:var(--primary)"></span></div>
            <span class="stat-num">${w.n}</span>
          </div>`).join('')}
      </div>
    </div>

    <div class="card">
      <h3>${t('stats.timeByRole')}</h3>
      ${byRole.length ? `<div class="stat-bars">
        ${byRole.map((x) => `
          <div class="stat-bar-row">
            <span>${esc(x.role.icono || '')} ${esc(x.role.nombre)}</span>
            <div class="stat-bar"><span style="width:${(x.min / maxMin) * 100}%;background:${esc(x.role.color)}"></span></div>
            <span class="stat-num">${(x.min / 60).toFixed(1)}${t('stats.hours')}</span>
          </div>`).join('')}
      </div>` : `<p class="muted">${t('common.none')}</p>`}
    </div>

    <div class="card">
      <h3>${t('stats.byPriority')}</h3>
      <div class="stat-bars">
        ${byPrio.map((x) => `
          <div class="stat-bar-row">
            <span>${t('task.priority.' + x.p)}</span>
            <div class="stat-bar"><span style="width:${(x.n / maxPrio) * 100}%;background:${colorOf(x.p)}"></span></div>
            <span class="stat-num">${x.n}</span>
          </div>`).join('')}
      </div>
    </div>`;
}

/* ================================================================== */
/* Papelera                                                            */
/* ================================================================== */

const TRASH_ENTITIES = ['roles', 'tareas', 'metas', 'recordatorios', 'etiquetas'];

export async function renderPapelera(root) {
  const items = [];
  for (const entity of TRASH_ENTITIES) {
    const rows = (await db.getAll(entity)).filter((r) => r.deleted);
    for (const r of rows) items.push({ entity, row: r });
  }
  items.sort((a, b) => String(b.row.updated_at || '').localeCompare(String(a.row.updated_at || '')));

  const labelOf = (entity, row) =>
    row.titulo || row.nombre || `${row.fecha_hora || ''} ${row.titulo || ''}`.trim() || row.clave || row.id;

  root.innerHTML = html`
    ${raw(viewTitle(t('papelera.title'), `
      <button class="btn ghost" id="tr-restore-all">↩ ${t('papelera.restoreAll')}</button>
      <button class="btn danger" id="tr-empty">🔥 ${t('common.emptyTrash')}</button>
    `))}
    ${items.length
      ? raw(items.map((it) => `
        <div class="task-row" data-ent="${esc(it.entity)}" data-id="${esc(it.row.id)}">
          <div class="task-main">
            <div class="task-title">${esc(labelOf(it.entity, it.row))}</div>
            <div class="task-meta"><span class="chip">${esc(it.entity)}</span>
              <span class="chip">${esc(String(it.row.updated_at || '').replace('T', ' ').slice(0, 16))}</span></div>
          </div>
          <div class="task-actions">
            <button class="btn tiny" data-restore="${esc(it.row.id)}" data-restore-ent="${esc(it.entity)}">↩ ${t('common.restore')}</button>
            <button class="btn tiny danger" data-purge="${esc(it.row.id)}" data-purge-ent="${esc(it.entity)}">🗑</button>
          </div>
        </div>`).join(''))
      : `<p class="muted center">${t('papelera.empty')}</p>`}`;

  root.querySelectorAll('[data-restore]').forEach((btn) => {
    btn.onclick = async () => {
      await applyLocal(btn.getAttribute('data-restore-ent'), 'update', {
        id: btn.getAttribute('data-restore'), deleted: 0
      });
      rerenderCurrentView();
    };
  });
  root.querySelectorAll('[data-purge]').forEach((btn) => {
    btn.onclick = async () => {
      const ok = await confirmDialog(t('common.purge'), t('common.purgeConfirm'));
      if (!ok) return;
      await applyLocal(btn.getAttribute('data-purge-ent'), 'purge', { id: btn.getAttribute('data-purge') });
      rerenderCurrentView();
    };
  });
  root.querySelector('#tr-restore-all').onclick = async () => {
    for (const it of items) {
      await applyLocal(it.entity, 'update', { id: it.row.id, deleted: 0 });
    }
    rerenderCurrentView();
  };
  root.querySelector('#tr-empty').onclick = async () => {
    const ok = await confirmDialog(t('common.emptyTrash'), t('common.purgeConfirm'));
    if (!ok) return;
    for (const it of items) {
      await applyLocal(it.entity, 'purge', { id: it.row.id });
    }
    rerenderCurrentView();
  };
}

/* ================================================================== */
/* Ajustes                                                             */
/* ================================================================== */

async function setUserConfig(clave, valor) {
  const prev = await db.get('config', clave);
  if (prev) await applyLocal('config', 'update', { clave, valor, id: clave });
  else await applyLocal('config', 'create', { clave, valor, id: clave });
}

export async function renderAjustes(root) {
  const nombre = await db.getMeta('nombre', '');
  const email = await db.getMeta('email', '');
  const esAdmin = (await db.getMeta('es_admin', 'no')) === 'si' || email === (localStorage.getItem('pp_admin_email') || '');
  const theme = localStorage.getItem('pp_theme') || 'auto';
  const dayStart = localStorage.getItem('pp_day_start') || '6';
  const dayEnd = localStorage.getItem('pp_day_end') || '23';
  const pomoFocus = localStorage.getItem('pp_pomo_focus') || '25';
  const pomoRest = localStorage.getItem('pp_pomo_rest') || '5';
  const configRows = await db.getAll('config');
  const emailRem = configRows.find((c) => c.clave === 'recordatorio_email')?.valor || 'no';
  const lastSync = await db.getMeta('lastSync', 0);
  const backendUrl = api.getUrl();

  root.innerHTML = html`
    ${raw(viewTitle(t('ajustes.title')))}

    <div class="card">
      <h3>👤 ${t('ajustes.profile')}</h3>
      <p><strong>${esc(nombre || '—')}</strong><br><span class="muted">${esc(email || 'modo demo')}</span></p>
    </div>

    <div class="card">
      <h3>🎨 ${t('ajustes.appearance')}</h3>
      <div class="field-row">
        <div>
          <label for="st-theme">${t('ajustes.theme')}</label>
          <select id="st-theme">
            <option value="light" ${theme === 'light' ? 'selected' : ''}>☀️ ${t('ajustes.themeLight')}</option>
            <option value="dark" ${theme === 'dark' ? 'selected' : ''}>🌙 ${t('ajustes.themeDark')}</option>
            <option value="auto" ${theme === 'auto' ? 'selected' : ''}>⚙️ ${t('ajustes.themeAuto')}</option>
          </select>
        </div>
        <div>
          <label for="st-lang">${t('ajustes.language')}</label>
          <select id="st-lang">
            <option value="es" ${getLocale() === 'es' ? 'selected' : ''}>Español</option>
            <option value="en" ${getLocale() === 'en' ? 'selected' : ''}>English</option>
          </select>
        </div>
      </div>
      <div class="field-row">
        <div>
          <label for="st-ds">${t('ajustes.weekRange')} (inicio)</label>
          <input id="st-ds" type="number" min="0" max="12" value="${esc(dayStart)}" />
        </div>
        <div>
          <label for="st-de">${t('ajustes.weekRange')} (fin)</label>
          <input id="st-de" type="number" min="13" max="23" value="${esc(dayEnd)}" />
        </div>
      </div>
      <div class="field-row">
        <div>
          <label for="st-pf">${t('ajustes.pomodoro')} — ${t('ajustes.focus')}</label>
          <input id="st-pf" type="number" min="5" max="90" value="${esc(pomoFocus)}" />
        </div>
        <div>
          <label for="st-pr">${t('ajustes.pomodoro')} — ${t('ajustes.rest')}</label>
          <input id="st-pr" type="number" min="1" max="30" value="${esc(pomoRest)}" />
        </div>
      </div>
    </div>

    <div class="card">
      <h3>🔔 ${t('ajustes.notifications')}</h3>
      <p class="muted">${t('notify.periodicHint')}</p>
      <p>${t('ajustes.notifState')}: <strong id="st-notif-state">${esc(permissionState())}</strong></p>
      <div class="contact-actions">
        <button class="btn" id="st-perm">${t('ajustes.enableNotif')}</button>
      </div>
      <div class="field-row" style="margin-top:.7rem">
        <div>
          <label for="st-emailrem">${t('ajustes.emailReminders')}</label>
          <select id="st-emailrem">
            <option value="si" ${emailRem === 'si' ? 'selected' : ''}>${t('common.yes')}</option>
            <option value="no" ${emailRem === 'no' ? 'selected' : ''}>${t('common.no')}</option>
          </select>
        </div>
      </div>
    </div>

    <div class="card">
      <h3>🔄 ${t('ajustes.sync')}</h3>
      <label for="st-url">URL del Web App (Apps Script)</label>
      <div class="field-row">
        <input id="st-url" type="url" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(backendUrl)}" />
        <button class="btn" id="st-url-save" style="flex:none">💾</button>
      </div>
      <p>${t('ajustes.lastSync')}: <strong>${lastSync ? new Date(lastSync).toLocaleString() : t('ajustes.never')}</strong></p>
      <div class="contact-actions">
        <button class="btn" id="st-sync">🔄 ${t('ajustes.forceNow')}</button>
        <button class="btn ghost" id="st-conflicts">⚠️ ${t('ajustes.conflicts')}</button>
      </div>
    </div>

    <div class="card">
      <h3>💾 ${t('ajustes.data')}</h3>
      <div class="contact-actions">
        <button class="btn" id="st-imp-csv">⤒ ${t('import.csv')}</button>
        <button class="btn" id="st-imp-ics">⤒ ${t('import.ics')}</button>
        <button class="btn" id="st-expjson">⤓ ${t('ajustes.exportJson')}</button>
        <button class="btn" id="st-expcsv">⤓ ${t('ajustes.exportCsv')}</button>
        <label class="btn" for="st-impjson" style="cursor:pointer">⤒ ${t('ajustes.importJson')}</label>
        <input id="st-impjson" type="file" accept="application/json" style="display:none" />
      </div>
    </div>

    ${esAdmin ? `<div class="card">
      <h3>🛡 ${t('ajustes.admin')}</h3>
      <p class="muted">${t('ajustes.adminHint')}</p>
      <button class="btn" id="st-admin">👥 ${t('ajustes.admin')}</button>
      <div id="admin-box"></div>
    </div>` : ''}

    <div class="card">
      <h3>ℹ️ ${t('ajustes.about')}</h3>
      <p class="muted">${t('ajustes.aboutText')}</p>
    </div>

    <div class="card" style="border-color:var(--rose)">
      <h3>⚠️ ${t('ajustes.dangerZone')}</h3>
      <button class="btn danger" id="st-clear">${t('ajustes.clearLocal')}</button>
    </div>`;

  root.querySelector('#st-theme').onchange = (e) => {
    localStorage.setItem('pp_theme', e.target.value);
    document.dispatchEvent(new CustomEvent('pp:theme'));
  };
  root.querySelector('#st-lang').onchange = (e) => {
    setLocale(e.target.value);
    rerenderCurrentView();
  };
  root.querySelector('#st-ds').onchange = (e) => { localStorage.setItem('pp_day_start', e.target.value || '6'); };
  root.querySelector('#st-de').onchange = (e) => { localStorage.setItem('pp_day_end', e.target.value || '23'); };
  root.querySelector('#st-pf').onchange = (e) => { localStorage.setItem('pp_pomo_focus', e.target.value || '25'); };
  root.querySelector('#st-pr').onchange = (e) => { localStorage.setItem('pp_pomo_rest', e.target.value || '5'); };

  root.querySelector('#st-perm').onclick = async () => {
    const res = await requestPermission();
    root.querySelector('#st-notif-state').textContent = res;
    if (res === 'granted') {
      await registerPeriodicSync();
      toast(t('notify.granted'), 'success');
    } else if (res === 'denied') {
      toast(t('notify.denied'), 'error');
    }
  };
  root.querySelector('#st-emailrem').onchange = (e) => setUserConfig('recordatorio_email', e.target.value);

  root.querySelector('#st-url-save').onclick = () => {
    const url = root.querySelector('#st-url').value.trim();
    api.setUrl(url);
    toast(url ? 'URL ✓' : 'URL ✕', 'success');
  };
  root.querySelector('#st-sync').onclick = async () => {
    await refreshPending();
    await flush();
    toast(t('sync.syncing'), '');
  };
  root.querySelector('#st-conflicts').onclick = () => openConflictsModal();

  root.querySelector('#st-imp-csv').onclick = async () => {
    const imp = await import('./importers.js');
    imp.openCSVImport();
  };
  root.querySelector('#st-imp-ics').onclick = async () => {
    const imp = await import('./importers.js');
    imp.openICSImport();
  };
  root.querySelector('#st-expjson').onclick = async () => {
    const ex = await import('./exporters.js');
    ex.exportJSON();
  };
  root.querySelector('#st-expcsv').onclick = async () => {
    const ex = await import('./exporters.js');
    ex.exportCSV();
  };
  root.querySelector('#st-impjson').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const imp = await import('./importers.js');
    const n = await imp.importJSONBackup(file);
    toast(`${n} ✓`, 'success');
    rerenderCurrentView();
  });

  const adminBtn = root.querySelector('#st-admin');
  if (adminBtn) {
    adminBtn.onclick = async () => {
      const box = root.querySelector('#admin-box');
      box.innerHTML = `<p class="muted">${t('common.loading')}</p>`;
      try {
        const users = await api.call('adminListUsers');
        box.innerHTML = `<table class="table"><thead><tr>
          <th>Email</th><th>${t('auth.name')}</th><th>Creado</th><th>Último acceso</th>
        </tr></thead><tbody>
          ${(users.users || []).map((u) => `<tr>
            <td>${esc(u.email)}</td><td>${esc(u.nombre || '')}</td>
            <td>${esc(String(u.creado || '').slice(0, 10))}</td><td>${esc(String(u.ultimo_acceso || '').slice(0, 16).replace('T', ' '))}</td>
          </tr>`).join('')}
        </tbody></table>`;
      } catch (err) {
        box.innerHTML = `<p class="form-error">${esc(err.message)}</p>`;
      }
    };
  }

  root.querySelector('#st-clear').onclick = async () => {
    const ok = await confirmDialog(t('ajustes.clearLocal'), t('common.purgeConfirm'));
    if (!ok) return;
    await db.wipeAll();
    location.reload();
  };
}
