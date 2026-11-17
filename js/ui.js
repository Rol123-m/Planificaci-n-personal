/**
 * Planificación Personal — ui.js
 * Componentes de interfaz compartidos:
 *  - Toasts, modales, confirmaciones, popovers.
 *  - Editor de tareas (crear/editar), fila de tarea reutilizable, detalle con
 *    acciones rápidas de contacto (📞 Llamar, 💬 WhatsApp, ✉️ Email).
 *  - Resolución de conflictos de sincronización, bandeja de notificaciones,
 *    selector "Mover a…", Pomodoro.
 */

import * as db from './db.js';
import { applyLocal } from './sync.js';
import { updateRemindersForTask, listNotifications, clearNotifications, unreadCount } from './notify.js';
import { t, applyI18n } from './i18n.js';
import {
  esc, html, raw, uuid, todayISO, fmtDate, fmtTime, addDays,
  telLink, waLink, mailtoLink, emit
} from './utils.js';

/* ========================= Toasts ========================= */

export function toast(msg, type = '', ms = 3500, actionLabel = '', actionFn = null) {
  const root = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = html`<span>${esc(msg)}</span>${actionLabel ? `<button type="button">${esc(actionLabel)}</button>` : ''}`;
  if (actionLabel) {
    el.querySelector('button').addEventListener('click', () => { actionFn?.(); el.remove(); });
  }
  root.appendChild(el);
  setTimeout(() => el.remove(), ms);
  return el;
}

/* ========================= Modales ========================= */

export function openModal(innerHTML, { wide = false, onClose = null } = {}) {
  const root = document.getElementById('modals');
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `<div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true">
    <button class="icon-btn modal-close" type="button" aria-label="${t('common.close')}" style="position:absolute;top:.6rem;right:.6rem">✕</button>
    ${innerHTML}
  </div>`;
  root.appendChild(backdrop);
  const modal = backdrop.querySelector('.modal');
  modal.style.position = 'relative';
  const close = () => { backdrop.remove(); onClose?.(); };
  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });
  backdrop.querySelector('.modal-close').addEventListener('click', close);
  const esc_ = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc_); } };
  document.addEventListener('keydown', esc_);
  applyI18n(backdrop);
  return { el: backdrop, modal, close };
}

export function confirmDialog(title, msg) {
  return new Promise((resolve) => {
    const m = openModal(html`
      <div class="modal-head"><h2>${title}</h2></div>
      <div class="modal-body"><p>${msg}</p></div>
      <div class="modal-foot">
        <button class="btn ghost" data-a="no">${t('common.cancel')}</button>
        <button class="btn danger" data-a="yes">${t('common.confirm')}</button>
      </div>`);
    m.el.querySelector('[data-a="no"]').onclick = () => { m.close(); resolve(false); };
    m.el.querySelector('[data-a="yes"]').onclick = () => { m.close(); resolve(true); };
  });
}

/* ========================= Popovers ========================= */

export function wirePopover(btnId, menuId) {
  const btn = document.getElementById(btnId);
  const menu = document.getElementById(menuId);
  if (!btn || !menu) return;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const wasHidden = menu.hidden;
    document.querySelectorAll('.popover').forEach((p) => (p.hidden = true));
    menu.hidden = !wasHidden;
  });
  document.addEventListener('click', () => { menu.hidden = true; });
  menu.addEventListener('click', (e) => e.stopPropagation());
}

/* ========================= Datos de apoyo ========================= */

export async function getRoles() {
  const roles = await db.getAll('roles');
  return roles.filter((r) => !r.deleted).sort((a, b) => (a.orden || 0) - (b.orden || 0));
}

export function priorityChip(p) {
  return `<span class="chip ${esc(p)}">${t('task.priority.' + (p || 'media'))}</span>`;
}
export function estadoChip(s) {
  return `<span class="chip estado-${esc(s || 'pendiente')}">${t('task.estado.' + (s || 'pendiente'))}</span>`;
}

export function contactButtons(task) {
  const parts = [];
  const nombre = task.titulo || '';
  if (task.telefono) {
    parts.push(`<a href="${esc(telLink(task.telefono))}" title="${esc(task.telefono)}">📞 ${t('contact.call')}</a>`);
    parts.push(`<a href="${esc(waLink(task.telefono, nombre))}" target="_blank" rel="noopener">💬 ${t('contact.whatsapp')}</a>`);
  }
  if (task.email) {
    parts.push(`<a href="${esc(mailtoLink(task.email, nombre))}">✉️ ${t('contact.email')}</a>`);
  }
  return parts.length ? `<div class="contact-actions">${parts.join('')}</div>` : '';
}

export function taskChips(task) {
  const chips = [priorityChip(task.prioridad), estadoChip(task.estado)];
  if (task.fecha) chips.push(`<span class="chip">📅 ${esc(fmtDate(task.fecha))}${task.hora_inicio ? ' · ' + esc(fmtTime(task.hora_inicio)) : ''}</span>`);
  if (task.duracion_min) chips.push(`<span class="chip">⏱ ${esc(task.duracion_min)} min</span>`);
  if (task.recordatorio === 'si') chips.push(`<span class="chip">🔔</span>`);
  (String(task.etiquetas || '').split('|')).filter(Boolean).forEach((tag) => {
    chips.push(`<span class="chip" data-tag="${esc(tag)}">#${esc(tag)}</span>`);
  });
  return chips.join('');
}

/** Fila de tarea reutilizable en varias vistas. */
export function taskRowHTML(task, role, opts = {}) {
  const done = task.estado === 'hecha';
  const color = role?.color || 'var(--primary)';
  return html`
  <div class="task-row${done ? ' done' : ''}" data-task="${esc(task.id)}">
    ${opts.selectMode
      ? `<input type="checkbox" class="sel-check" data-sel="${esc(task.id)}" aria-label="${t('common.select')}">`
      : `<button class="btn-check" data-done="${esc(task.id)}" aria-label="${t('task.markDone')}">✓</button>`}
    <div class="task-main">
      <div class="task-title">${esc(task.titulo)}</div>
      <div class="task-meta">${raw(taskChips(task))}</div>
    </div>
    <div class="task-actions">
      ${contactButtons(task)}
      <button class="icon-btn" data-detail="${esc(task.id)}" title="${t('common.details')}" aria-label="${t('common.details')}">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 8a2 2 0 110-4 2 2 0 010 4zm0 2a2 2 0 012 2v6a2 2 0 11-4 0v-6a2 2 0 012-2z"/></svg>
      </button>
    </div>
  </div>`;
}

/** Delegación de eventos común para listas de tareas (check, detalle, selección). */
export function wireTaskList(rootEl, { rerender = null, selectMode = false, selected = null } = {}) {
  rootEl.addEventListener('click', async (e) => {
    const doneBtn = e.target.closest('[data-done]');
    const detBtn = e.target.closest('[data-detail]');
    if (doneBtn) {
      const id = doneBtn.getAttribute('data-done');
      const task = await db.get('tareas', id);
      if (task) await toggleTaskDone(task);
      rerender?.();
    } else if (detBtn) {
      const id = detBtn.getAttribute('data-detail');
      await openTaskDetail(id);
    }
  });
  if (selectMode) {
    rootEl.addEventListener('change', (e) => {
      const cb = e.target.closest('[data-sel]');
      if (cb && selected) {
        const id = cb.getAttribute('data-sel');
        if (cb.checked) selected.add(id); else selected.delete(id);
      }
    });
  }
}

/* ========================= Editor de tareas ========================= */

const OFFSET_OPTIONS = [5, 10, 15, 30, 60, 120, 180, 1440, 2880, 10080];

export async function openTaskEditor(task = null, { defaultFecha = '', defaultRol = '', defaultHora = '' } = {}) {
  const roles = await getRoles();
  const isEdit = !!task;
  const offOpts = OFFSET_OPTIONS.map(
    (o) => `<option value="${o}" ${Number(task?.recordatorio_offset_min ?? 10) === o ? 'selected' : ''}>${offsetLabel(o)}</option>`
  ).join('');

  const m = openModal(html`
    <div class="modal-head"><h2>${isEdit ? t('task.edit') : t('task.new')}</h2></div>
    <div class="modal-body">
      <form id="task-form">
        <input type="hidden" name="id" value="${esc(task?.id || '')}" />
        <label for="tf-titulo">${t('task.titulo')} *</label>
        <input id="tf-titulo" name="titulo" type="text" required maxlength="200" value="${esc(task?.titulo || '')}" />

        <label for="tf-rol">${t('task.rol')}</label>
        <select id="tf-rol" name="rol_id">
          <option value="">—</option>
          ${roles.map((r) => `<option value="${esc(r.id)}" ${task?.rol_id === r.id || (!isEdit && defaultRol === r.id) ? 'selected' : ''}>${esc((r.icono || '') + ' ' + r.nombre)}</option>`).join('')}
        </select>

        <div class="field-row">
          <div>
            <label for="tf-fecha">${t('task.fecha')}</label>
            <input id="tf-fecha" name="fecha" type="date" value="${esc(task?.fecha || defaultFecha)}" />
          </div>
          <div>
            <label for="tf-hi">${t('task.horaInicio')}</label>
            <input id="tf-hi" name="hora_inicio" type="time" value="${esc(task?.hora_inicio || defaultHora)}" />
          </div>
          <div>
            <label for="tf-hf">${t('task.horaFin')}</label>
            <input id="tf-hf" name="hora_fin" type="time" value="${esc(task?.hora_fin || '')}" />
          </div>
        </div>

        <div class="field-row">
          <div>
            <label for="tf-dur">${t('task.duracion')}</label>
            <input id="tf-dur" name="duracion_min" type="number" min="5" max="600" step="5" value="${esc(task?.duracion_min ?? 30)}" />
          </div>
          <div>
            <label for="tf-pr">${t('task.prioridad')}</label>
            <select id="tf-pr" name="prioridad">
              ${['alta', 'media', 'baja'].map((p) => `<option value="${p}" ${(task?.prioridad || 'media') === p ? 'selected' : ''}>${t('task.priority.' + p)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label for="tf-es">${t('task.estado')}</label>
            <select id="tf-es" name="estado">
              ${['pendiente', 'en_curso', 'hecha'].map((s) => `<option value="${s}" ${(task?.estado || 'pendiente') === s ? 'selected' : ''}>${t('task.estado.' + s)}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="field-row">
          <div>
            <label for="tf-rep">${t('task.recurring')}</label>
            <select id="tf-rep" name="recurring">
              ${['none', 'daily', 'weekly', 'monthly'].map((s) => `<option value="${s}" ${(task?.recurring || 'none') === s ? 'selected' : ''}>${t('task.recurring.' + s)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label for="tf-et">${t('task.etiquetas')}</label>
            <input id="tf-et" name="etiquetas" type="text" value="${esc(tagsToStr(task?.etiquetas))}" placeholder="familia, estudio" />
          </div>
        </div>

        <div class="field-row" style="align-items:end">
          <div>
            <label for="tf-rec">🔔 ${t('task.recordatorio')}</label>
            <select id="tf-rec" name="recordatorio">
              <option value="si" ${task?.recordatorio === 'si' ? 'selected' : ''}>${t('common.yes')}</option>
              <option value="no" ${(task?.recordatorio || 'no') === 'no' ? 'selected' : ''}>${t('common.no')}</option>
            </select>
          </div>
          <div>
            <label for="tf-off">${t('task.recordatorioOffset')}</label>
            <select id="tf-off" name="recordatorio_offset_min">${offOpts}</select>
          </div>
        </div>

        <div class="field-row">
          <div>
            <label for="tf-tel">📞 ${t('task.telefono')} <span class="muted">(${t('common.optional')})</span></label>
            <input id="tf-tel" name="telefono" type="tel" value="${esc(task?.telefono || '')}" placeholder="+53 5XXX XXXX" />
          </div>
          <div>
            <label for="tf-email">✉️ ${t('task.email')} <span class="muted">(${t('common.optional')})</span></label>
            <input id="tf-email" name="email" type="email" value="${esc(task?.email || '')}" />
          </div>
        </div>

        <label for="tf-desc">${t('task.desc')}</label>
        <textarea id="tf-desc" name="descripcion" maxlength="2000">${esc(task?.descripcion || '')}</textarea>

        <p class="form-error" id="tf-error" hidden></p>
      </form>
    </div>
    <div class="modal-foot">
      ${isEdit ? `<button class="btn ghost danger-text" id="tf-delete" style="margin-right:auto">🗑 ${t('common.delete')}</button>` : ''}
      <button class="btn ghost" id="tf-cancel">${t('common.cancel')}</button>
      <button class="btn primary" id="tf-save">💾 ${t('common.save')}</button>
    </div>`);

  const form = m.el.querySelector('#task-form');
  const err = m.el.querySelector('#tf-error');

  const save = async () => {
    const fd = new FormData(form);
    const titulo = String(fd.get('titulo') || '').trim();
    if (!titulo) {
      err.textContent = t('task.neededTitle');
      err.hidden = false;
      return;
    }
    const data = {
      titulo,
      rol_id: fd.get('rol_id') || '',
      fecha: fd.get('fecha') || '',
      hora_inicio: fd.get('hora_inicio') || '',
      hora_fin: fd.get('hora_fin') || '',
      duracion_min: Number(fd.get('duracion_min')) || 30,
      prioridad: fd.get('prioridad') || 'media',
      estado: fd.get('estado') || 'pendiente',
      recurring: fd.get('recurring') || 'none',
      etiquetas: strToTags(fd.get('etiquetas')),
      recordatorio: fd.get('recordatorio') || 'no',
      recordatorio_offset_min: Number(fd.get('recordatorio_offset_min')) || 10,
      telefono: String(fd.get('telefono') || '').trim(),
      email: String(fd.get('email') || '').trim(),
      descripcion: String(fd.get('descripcion') || '').trim()
    };
    try {
      let row;
      if (isEdit) {
        row = await applyLocal('tareas', 'update', { id: task.id, ...data });
      } else {
        row = await applyLocal('tareas', 'create', data);
      }
      await updateRemindersForTask(row);
      m.close();
      emit('pp:data', { entity: 'tareas' });
      document.dispatchEvent(new CustomEvent('pp:rerender'));
    } catch (e2) {
      err.textContent = e2.message || 'Error';
      err.hidden = false;
    }
  };

  m.el.querySelector('#tf-save').onclick = save;
  m.el.querySelector('#tf-cancel').onclick = () => m.close();
  form.addEventListener('submit', (e) => { e.preventDefault(); save(); });
  const delBtn = m.el.querySelector('#tf-delete');
  if (delBtn) {
    delBtn.onclick = async () => {
      const ok = await confirmDialog(t('common.delete'), t('common.deleteConfirm'));
      if (!ok) return;
      await applyLocal('tareas', 'delete', { id: task.id });
      await updateRemindersForTask({ ...task, deleted: 1 });
      m.close();
      document.dispatchEvent(new CustomEvent('pp:rerender'));
    };
  }
  m.el.querySelector('#tf-titulo').focus();
}

function offsetLabel(min) {
  if (min < 60) return `${min} min`;
  if (min < 1440) return `${min / 60} h`;
  return `${min / 1440} d`;
}

function tagsToStr(et) {
  return String(et || '').split('|').filter(Boolean).join(', ');
}
function strToTags(s) {
  return String(s || '').split(/[,;]+/).map((x) => x.trim()).filter(Boolean).join('|');
}

/* ========================= Detalle de tarea ========================= */

export async function openTaskDetail(taskId) {
  const task = await db.get('tareas', taskId);
  if (!task) return;
  const roles = await getRoles();
  const role = roles.find((r) => r.id === task.rol_id);
  const history = (await db.getAll('history'))
    .filter((h) => h.entity === 'tareas' && h.id === task.id)
    .sort((a, b) => (a.ts < b.ts ? 1 : -1))
    .slice(0, 12);

  const m = openModal(html`
    <div class="modal-head"><h2>${esc(task.titulo)}</h2></div>
    <div class="modal-body">
      <div class="task-meta" style="margin-bottom:.6rem">${raw(taskChips(task))}</div>
      ${role ? `<p><span class="chip" style="border-color:${esc(role.color)}"><span class="dot" style="background:${esc(role.color)}"></span>${esc(role.nombre)}</span></p>` : ''}
      ${task.descripcion ? `<p>${esc(task.descripcion)}</p>` : ''}
      <div style="margin:.7rem 0">${raw(contactButtons(task))}</div>

      <details ${history.length ? 'open' : ''}>
        <summary><strong>🕘 ${t('task.history')}</strong></summary>
        ${history.length
          ? `<ul class="muted">${history.map((h) => `<li>${esc(h.ts.replace('T', ' ').slice(0, 16))} · ${esc(h.action)} (${esc(h.fields || '')})</li>`).join('')}</ul>`
          : `<p class="muted">—</p>`}
      </details>
    </div>
    <div class="modal-foot" style="justify-content:flex-start;flex-wrap:wrap">
      <button class="btn" id="td-edit">✏️ ${t('common.edit')}</button>
      ${task.estado !== 'hecha'
        ? `<button class="btn success" id="td-done">✓ ${t('task.markDone')}</button>`
        : `<button class="btn" id="td-reopen">↩ ${t('task.estado.pendiente')}</button>`}
      <button class="btn" id="td-pomo">⏱ ${t('hoy.focus')}</button>
      <button class="btn ghost" id="td-export">⤓ ${t('common.export')}</button>
      <button class="btn ghost" id="td-move">📅 ${t('week.move')}</button>
      <button class="btn ghost" id="td-delete">🗑 ${t('common.delete')}</button>
    </div>`);

  m.el.querySelector('#td-edit').onclick = async () => { m.close(); await openTaskEditor(task); };
  const doneBtn = m.el.querySelector('#td-done');
  if (doneBtn) doneBtn.onclick = async () => { m.close(); await toggleTaskDone(task); };
  const reopen = m.el.querySelector('#td-reopen');
  if (reopen) reopen.onclick = async () => {
    const row = await applyLocal('tareas', 'update', { id: task.id, estado: 'pendiente' });
    await updateRemindersForTask(row);
    m.close();
    document.dispatchEvent(new CustomEvent('pp:rerender'));
  };
  m.el.querySelector('#td-pomo').onclick = () => { m.close(); openPomodoro(task); };
  m.el.querySelector('#td-export').onclick = async () => {
    m.close();
    const ex = await import('./exporters.js');
    ex.openExportOne(task);
  };
  m.el.querySelector('#td-move').onclick = () => { m.close(); openMoveTo(task); };
  m.el.querySelector('#td-delete').onclick = async () => {
    const ok = await confirmDialog(t('common.delete'), t('common.deleteConfirm'));
    if (!ok) return;
    await applyLocal('tareas', 'delete', { id: task.id });
    await updateRemindersForTask({ ...task, deleted: 1 });
    m.close();
    document.dispatchEvent(new CustomEvent('pp:rerender'));
  };
}

/* ========================= Marcar hecha + recurrencias ========================= */

export async function toggleTaskDone(task) {
  if (task.estado === 'hecha') {
    const row = await applyLocal('tareas', 'update', { id: task.id, estado: 'pendiente' });
    await updateRemindersForTask(row);
    document.dispatchEvent(new CustomEvent('pp:rerender'));
    return;
  }
  await applyLocal('tareas', 'update', { id: task.id, estado: 'hecha' });
  await updateRemindersForTask({ ...task, estado: 'hecha' });

  // Plantillas recurrentes: al completar, se crea la siguiente ocurrencia.
  if (['daily', 'weekly', 'monthly'].includes(task.recurring) && task.fecha) {
    let next = '';
    if (task.recurring === 'daily') next = addDays(task.fecha, 1);
    else if (task.recurring === 'weekly') next = addDays(task.fecha, 7);
    else if (task.recurring === 'monthly') {
      const d = new Date(task.fecha + 'T00:00:00');
      d.setMonth(d.getMonth() + 1);
      next = d.toISOString().slice(0, 10);
    }
    const copy = { ...task, id: undefined, creado: undefined, updated_at: undefined, version: 1, estado: 'pendiente', fecha: next };
    const row = await applyLocal('tareas', 'create', copy);
    await updateRemindersForTask(row);
    toast(t('task.nextCreated'), 'success');
  }
  document.dispatchEvent(new CustomEvent('pp:rerender'));
}

/* ========================= Mover a… (asignar fecha/hora) ========================= */

export function openMoveTo(task) {
  const m = openModal(html`
    <div class="modal-head"><h2>${t('week.move')}</h2></div>
    <div class="modal-body">
      <p><strong>${esc(task.titulo)}</strong></p>
      <form id="move-form">
        <label for="mv-fecha">${t('task.fecha')}</label>
        <input id="mv-fecha" name="fecha" type="date" value="${esc(task.fecha || todayISO())}" />
        <div class="field-row">
          <div>
            <label for="mv-hi">${t('task.horaInicio')}</label>
            <input id="mv-hi" name="hora_inicio" type="time" value="${esc(task.hora_inicio || '')}" />
          </div>
          <div>
            <label for="mv-hf">${t('task.horaFin')}</label>
            <input id="mv-hf" name="hora_fin" type="time" value="${esc(task.hora_fin || '')}" />
          </div>
        </div>
        <button class="btn ghost tiny" id="mv-clear" type="button" style="margin-top:.8rem">✖ ${t('task.noFecha')}</button>
      </form>
    </div>
    <div class="modal-foot">
      <button class="btn ghost" id="mv-cancel">${t('common.cancel')}</button>
      <button class="btn primary" id="mv-save">${t('week.assign')}</button>
    </div>`);
  m.el.querySelector('#mv-cancel').onclick = () => m.close();
  m.el.querySelector('#mv-clear').onclick = async () => {
    const row = await applyLocal('tareas', 'update', { id: task.id, fecha: '', hora_inicio: '', hora_fin: '' });
    await updateRemindersForTask(row);
    m.close();
    document.dispatchEvent(new CustomEvent('pp:rerender'));
  };
  m.el.querySelector('#mv-save').onclick = async () => {
    const fd = new FormData(m.el.querySelector('#move-form'));
    const row = await applyLocal('tareas', 'update', {
      id: task.id,
      fecha: fd.get('fecha') || '',
      hora_inicio: fd.get('hora_inicio') || '',
      hora_fin: fd.get('hora_fin') || ''
    });
    await updateRemindersForTask(row);
    m.close();
    document.dispatchEvent(new CustomEvent('pp:rerender'));
  };
}

/* ========================= Pomodoro ========================= */

let pomo = { timer: null, left: 0, total: 0, taskId: '' };

export function openPomodoro(task) {
  const focusMin = Number(localStorage.getItem('pp_pomo_focus') || 25);
  const restMin = Number(localStorage.getItem('pp_pomo_rest') || 5);
  const m = openModal(html`
    <div class="modal-head"><h2>${t('hoy.focus')} — ${esc(task?.titulo || '')}</h2></div>
    <div class="modal-body focus-box">
      <div class="focus-time" id="pomo-time">25:00</div>
      <div class="progress" style="max-width:260px;margin:.6rem auto"><span id="pomo-bar" style="width:0%"></span></div>
      <div style="display:flex;gap:.5rem;justify-content:center;margin-top:.8rem">
        <button class="btn primary" id="pomo-start">${t('hoy.startFocus')}</button>
        <button class="btn ghost" id="pomo-stop">${t('hoy.stopFocus')}</button>
        <button class="btn success" id="pomo-done" hidden>✓ ${t('task.markDone')}</button>
      </div>
      <p class="muted" style="margin-top:.6rem">${t('ajustes.pomodoro')}: ${focusMin} / ${restMin} min — ${t('ajustes.title')} › ${t('ajustes.pomodoro')}</p>
    </div>`);

  const timeEl = m.el.querySelector('#pomo-time');
  const barEl = m.el.querySelector('#pomo-bar');
  const doneBtn = m.el.querySelector('#pomo-done');
  const render = () => {
    const mm = String(Math.floor(pomo.left / 60)).padStart(2, '0');
    const ss = String(pomo.left % 60).padStart(2, '0');
    timeEl.textContent = `${mm}:${ss}`;
    barEl.style.width = `${100 - (pomo.left / Math.max(1, pomo.total)) * 100}%`;
  };
  const stopTimer = () => { clearInterval(pomo.timer); pomo.timer = null; };

  m.el.querySelector('#pomo-start').onclick = () => {
    stopTimer();
    pomo = { timer: null, left: focusMin * 60, total: focusMin * 60, taskId: task?.id || '' };
    render();
    pomo.timer = setInterval(() => {
      pomo.left -= 1;
      render();
      if (pomo.left <= 0) {
        stopTimer();
        doneBtn.hidden = false;
        toast('⏱ ' + t('hoy.focus') + ' ✓', 'success');
        try { navigator.vibrate?.(200); } catch (e) {}
      }
    }, 1000);
  };
  m.el.querySelector('#pomo-stop').onclick = () => { stopTimer(); pomo.left = 0; render(); };
  doneBtn.onclick = async () => {
    stopTimer();
    if (pomo.taskId) {
      const tk = await db.get('tareas', pomo.taskId);
      if (tk) await toggleTaskDone(tk);
    }
    m.close();
  };
  render();
}

/* ========================= Conflictos ========================= */

export async function openConflictsModal() {
  const { listConflicts, resolveConflict } = await import('./sync.js');
  const conflicts = await listConflicts();
  if (!conflicts.length) {
    toast(t('ajustes.conflicts') + ': 0', '');
    return;
  }
  const m = openModal(html`
    <div class="modal-head"><h2>${t('sync.conflictTitle')}</h2></div>
    <div class="modal-body">
      <p class="muted">${t('sync.conflictBody')}</p>
      ${conflicts.map((c) => {
        const lt = c.local?.titulo || c.local?.nombre || c.local?.clave || c.entity;
        const st = c.server?.titulo || c.server?.nombre || c.server?.clave || c.entity;
        return html`
        <div class="card" data-cf="${esc(c.id)}">
          <p><strong>${esc(lt)}</strong> <span class="muted">(${esc(c.entity)})</span></p>
          <p class="muted">↔ ${esc(st)} · ${esc(c.server?.updated_at || '')}</p>
          <div class="contact-actions">
            <button class="btn tiny" data-ch="mine">${t('sync.keepMine')}</button>
            <button class="btn tiny" data-ch="server">${t('sync.keepServer')}</button>
            <button class="btn tiny" data-ch="both">${t('sync.keepBoth')}</button>
          </div>
        </div>`;
      }).join('')}
    </div>`);
  m.el.querySelectorAll('[data-ch]').forEach((btn) => {
    btn.onclick = async () => {
      const cfId = btn.closest('[data-cf]').getAttribute('data-cf');
      await resolveConflict(cfId, btn.getAttribute('data-ch'));
      btn.closest('[data-cf]').remove();
      if (!m.el.querySelector('[data-cf]')) m.close();
    };
  });
}

/* ========================= Bandeja de notificaciones ========================= */

export async function renderNotifTray() {
  const tray = document.getElementById('notif-tray');
  const badge = document.getElementById('bell-badge');
  const list = await listNotifications();
  const unread = await unreadCount();
  if (badge) {
    badge.textContent = String(unread);
    badge.hidden = unread === 0;
  }
  if (!tray) return;
  tray.innerHTML = html`
    <div class="popover-head"><strong>🔔 ${t('notify.title')}</strong>
      <button class="btn tiny ghost" id="nt-clear" type="button">${t('notify.markAll')}</button>
    </div>
    <div class="notif-list">
      ${list.length
        ? list.slice(0, 20).map((n) => html`
          <div class="notif-item${n.read ? '' : ' unread'}" data-task="${esc(n.tarea_id || '')}">
            <div class="t">${esc(n.title)}</div>
            <div class="muted">${esc(n.body)}</div>
            <div class="muted">${esc(String(n.ts).replace('T', ' ').slice(0, 16))}</div>
            ${raw(contactButtons(n))}
          </div>`).join('')
        : `<div class="notif-item muted">${t('notify.trayEmpty')}</div>`}
    </div>`;
  const clearBtn = tray.querySelector('#nt-clear');
  if (clearBtn) clearBtn.onclick = async () => { await clearNotifications(); await renderNotifTray(); };
  tray.querySelectorAll('.notif-item[data-task]').forEach((item) => {
    item.addEventListener('click', async () => {
      const id = item.getAttribute('data-task');
      tray.hidden = true;
      if (id) await openTaskDetail(id);
    });
  });
  tray.querySelectorAll('.notif-item').forEach((item) => { item.classList.add('read-ok'); });
  // marcar como leídas al abrir la bandeja
  tray.addEventListener('click', async () => {
    const all = await listNotifications();
    for (const n of all) {
      if (!n.read) {
        n.read = 1;
        await db.put('notifs', n);
      }
    }
    await renderNotifTray();
  }, { once: true });
}

/* ========================= Utilidades de vista ========================= */

export function viewTitle(title, actionsHTML = '') {
  return html`<div class="section-title"><h2>${title}</h2><div>${raw(actionsHTML)}</div></div>`;
}

export function rerenderCurrentView() {
  document.dispatchEvent(new CustomEvent('pp:rerender'));
}

export { esc as _esc };
