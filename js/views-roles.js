/**
 * Planificación Personal — views-roles.js
 * Pestaña de Roles: CRUD completo de roles (nombre, color, icono, descripción)
 * y CRUD de tareas dentro de cada rol.
 */

import * as db from './db.js';
import { applyLocal } from './sync.js';
import { t } from './i18n.js';
import { esc, html, raw, uuid, nowIso, todayISO } from './utils.js';
import {
  taskRowHTML, wireTaskList, getRoles, viewTitle, openTaskEditor,
  rerenderCurrentView, openModal, confirmDialog, toast
} from './ui.js';
import { updateRemindersForTask } from './notify.js';

const PALETTE = ['#4f46e5', '#2563eb', '#0891b2', '#0d9488', '#16a34a', '#65a30d', '#d97706', '#e11d48', '#7c3aed', '#64748b'];

export async function renderRoles(root) {
  const roles = await getRoles();
  const all = await db.getAll('tareas');
  const tasksByRole = {};
  for (const task of all) {
    if (task.deleted) continue;
    const key = task.rol_id || '_';
    (tasksByRole[key] = tasksByRole[key] || []).push(task);
  }

  const cards = roles
    .map((role) => {
      const tasks = (tasksByRole[role.id] || []).sort(
        (a, b) =>
          (a.estado === 'hecha') - (b.estado === 'hecha') ||
          (a.fecha || '9999').localeCompare(b.fecha || '9999') ||
          (a.hora_inicio || '99').localeCompare(b.hora_inicio || '99')
      );
      const pending = tasks.filter((x) => x.estado !== 'hecha').length;
      return html`
      <div class="card role-card" data-role="${esc(role.id)}" style="border-top-color:${esc(role.color || '#4f46e5')}">
        <div class="role-head">
          <h3><span class="role-emoji">${esc(role.icono || '')}</span> ${esc(role.nombre)}</h3>
          <div>
            <button class="icon-btn" data-edit-role="${esc(role.id)}" title="${t('roles.edit')}" aria-label="${t('roles.edit')}">✏️</button>
            <button class="icon-btn" data-del-role="${esc(role.id)}" title="${t('common.delete')}" aria-label="${t('common.delete')}">🗑</button>
          </div>
        </div>
        ${role.descripcion ? `<p class="muted">${esc(role.descripcion)}</p>` : ''}
        <p class="role-count">${pending}/${tasks.length} ${t('roles.count')}</p>
        <div class="role-tasks" data-role-tasks="${esc(role.id)}">
          ${tasks.length
            ? raw(tasks.map((x) => taskRowHTML(x, role)).join(''))
            : `<p class="muted">${t('roles.noTasks')}</p>`}
        </div>
        <button class="btn tiny primary" data-add-task="${esc(role.id)}" style="margin-top:.5rem">＋ ${t('roles.addTask')}</button>
      </div>`;
    })
    .join('');

  root.innerHTML = html`
    ${raw(viewTitle(t('roles.title'), `
      <button class="btn primary" id="btn-new-role">＋ ${t('roles.new')}</button>
      <button class="btn ghost" id="btn-new-task-any">＋ ${t('task.new')}</button>
    `))}
    <div class="grid-cards" id="roles-grid">${raw(cards)}</div>
    ${!roles.length ? `<p class="muted center">${t('common.none')}</p>` : ''}`;

  wireTaskList(root, { rerender: rerenderCurrentView });

  root.querySelector('#btn-new-role').onclick = () => openRoleEditor(null);
  root.querySelector('#btn-new-task-any').onclick = () => openTaskEditor(null, { defaultFecha: todayISO() });

  root.querySelectorAll('[data-add-task]').forEach((btn) => {
    btn.onclick = () => openTaskEditor(null, { defaultRol: btn.getAttribute('data-add-task') });
  });
  root.querySelectorAll('[data-edit-role]').forEach((btn) => {
    btn.onclick = async () => {
      const role = await db.get('roles', btn.getAttribute('data-edit-role'));
      if (role) openRoleEditor(role);
    };
  });
  root.querySelectorAll('[data-del-role]').forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.getAttribute('data-del-role');
      const ok = await confirmDialog(t('roles.deleted'), t('common.deleteConfirm'));
      if (!ok) return;
      await applyLocal('roles', 'delete', { id });
      rerenderCurrentView();
    };
  });
}

/** Modal de creación/edición de rol. */
export function openRoleEditor(role = null) {
  const isEdit = !!role;
  const colors = PALETTE.map(
    (c) => `<option value="${c}" ${role?.color === c ? 'selected' : ''}>${c}</option>`
  ).join('');

  const m = openModal(html`
    <div class="modal-head"><h2>${isEdit ? t('roles.edit') : t('roles.new')}</h2></div>
    <div class="modal-body">
      <form id="role-form">
        <input type="hidden" name="id" value="${esc(role?.id || '')}" />
        <label for="rf-name">${t('roles.name')} *</label>
        <input id="rf-name" name="nombre" type="text" required maxlength="80" value="${esc(role?.nombre || '')}" />
        <div class="field-row">
          <div>
            <label for="rf-color">${t('roles.color')}</label>
            <select id="rf-color" name="color">${colors}</select>
          </div>
          <div>
            <label for="rf-icon">${t('roles.icon')}</label>
            <input id="rf-icon" name="icono" type="text" maxlength="4" value="${esc(role?.icono || '')}" placeholder="📚" />
          </div>
        </div>
        <label for="rf-desc">${t('roles.desc')}</label>
        <textarea id="rf-desc" name="descripcion" maxlength="500">${esc(role?.descripcion || '')}</textarea>
        <p class="form-error" id="rf-error" hidden></p>
      </form>
    </div>
    <div class="modal-foot">
      <button class="btn ghost" id="rf-cancel">${t('common.cancel')}</button>
      <button class="btn primary" id="rf-save">💾 ${t('common.save')}</button>
    </div>`);

  const save = async () => {
    const form = m.el.querySelector('#role-form');
    const fd = new FormData(form);
    const nombre = String(fd.get('nombre') || '').trim();
    if (!nombre) {
      const err = m.el.querySelector('#rf-error');
      err.textContent = t('task.neededTitle');
      err.hidden = false;
      return;
    }
    const data = {
      nombre,
      color: fd.get('color') || '#4f46e5',
      icono: String(fd.get('icono') || '').trim(),
      descripcion: String(fd.get('descripcion') || '').trim(),
      orden: role?.orden ?? 99
    };
    if (isEdit) await applyLocal('roles', 'update', { id: role.id, ...data });
    else await applyLocal('roles', 'create', data);
    m.close();
    rerenderCurrentView();
  };

  m.el.querySelector('#rf-save').onclick = save;
  m.el.querySelector('#rf-cancel').onclick = () => m.close();
  m.el.querySelector('#role-form').addEventListener('submit', (e) => { e.preventDefault(); save(); });
}
