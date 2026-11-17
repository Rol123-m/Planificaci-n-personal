/**
 * Planificación Personal — views-metas.js
 * Funciones y objetivos a largo plazo: CRUD, progreso (%), fecha objetivo,
 * rol asociado y conversión de una meta en tareas concretas.
 */

import * as db from './db.js';
import { applyLocal } from './sync.js';
import { t } from './i18n.js';
import { esc, html, raw, todayISO, clamp } from './utils.js';
import { getRoles, viewTitle, rerenderCurrentView, openModal, confirmDialog, toast } from './ui.js';

export async function renderMetas(root) {
  const roles = await getRoles();
  const roleMap = new Map(roles.map((r) => [r.id, r]));
  const metas = (await db.getAll('metas')).filter((x) => !x.deleted);

  const groups = roles.concat([{ id: '_', nombre: t('common.all'), color: '#64748b', icono: '📌' }])
    .filter((r) => r.id === '_' || metas.some((m) => m.rol_id === r.id))
    .map((role) => {
      const list = metas.filter((m) => (m.rol_id || '_') === role.id);
      return html`
      <div class="metas-group">
        <h3><span style="color:${esc(role.color || '#64748b')}">■</span> ${esc(role.icono || '')} ${esc(role.nombre)} (${list.length})</h3>
        ${list.length
          ? raw(list.map((meta) => metaRowHTML(meta, roleMap)).join(''))
          : `<p class="muted">—</p>`}
      </div>`;
    });

  root.innerHTML = html`
    ${raw(viewTitle(t('metas.title'), `
      <button class="btn primary" id="btn-new-meta">＋ ${t('metas.new')}</button>
    `))}
    ${raw(groups.join(''))}
    ${!metas.length ? `<p class="muted center">${t('common.none')}</p>` : ''}
  `;

  root.querySelector('#btn-new-meta').onclick = () => openMetaEditor(null);

  root.querySelectorAll('[data-edit-meta]').forEach((btn) => {
    btn.onclick = async () => {
      const meta = await db.get('metas', btn.getAttribute('data-edit-meta'));
      if (meta) openMetaEditor(meta);
    };
  });
  root.querySelectorAll('[data-del-meta]').forEach((btn) => {
    btn.onclick = async () => {
      const ok = await confirmDialog(t('common.delete'), t('common.deleteConfirm'));
      if (!ok) return;
      await applyLocal('metas', 'delete', { id: btn.getAttribute('data-del-meta') });
      rerenderCurrentView();
    };
  });
  root.querySelectorAll('[data-convert]').forEach((btn) => {
    btn.onclick = async () => {
      const meta = await db.get('metas', btn.getAttribute('data-convert'));
      if (meta) openConvertModal(meta);
    };
  });
}

function metaRowHTML(meta, roleMap) {
  const role = roleMap.get(meta.rol_id);
  const pct = clamp(Number(meta.progreso) || 0, 0, 100);
  return html`
  <div class="meta-row" data-meta="${esc(meta.id)}">
    <div class="meta-main">
      <div class="task-title">${esc(meta.titulo)}</div>
      <div class="task-meta">
        ${role ? `<span class="chip"><span class="dot" style="background:${esc(role.color)}"></span>${esc(role.nombre)}</span>` : ''}
        ${meta.fecha_objetivo ? `<span class="chip">🎯 ${esc(meta.fecha_objetivo)}</span>` : ''}
        <span class="chip">${esc(pct)}%</span>
      </div>
    </div>
    <div class="meta-progress">
      <div class="progress"><span style="width:${pct}%"></span></div>
    </div>
    <div class="task-actions">
      <button class="icon-btn" data-convert="${esc(meta.id)}" title="${t('metas.convert')}">⚙️</button>
      <button class="icon-btn" data-edit-meta="${esc(meta.id)}" title="${t('common.edit')}">✏️</button>
      <button class="icon-btn" data-del-meta="${esc(meta.id)}" title="${t('common.delete')}">🗑</button>
    </div>
  </div>`;
}

export function openMetaEditor(meta = null) {
  return (async () => {
    const roles = await getRoles();
    const isEdit = !!meta;
    const m = openModal(html`
      <div class="modal-head"><h2>${isEdit ? t('metas.edit') : t('metas.new')}</h2></div>
      <div class="modal-body">
        <form id="meta-form">
          <input type="hidden" name="id" value="${esc(meta?.id || '')}" />
          <label for="mf-title">${t('task.titulo')} *</label>
          <input id="mf-title" name="titulo" type="text" required maxlength="200" value="${esc(meta?.titulo || '')}" />
          <label for="mf-rol">${t('task.rol')}</label>
          <select id="mf-rol" name="rol_id">
            <option value="">—</option>
            ${roles.map((r) => `<option value="${esc(r.id)}" ${meta?.rol_id === r.id ? 'selected' : ''}>${esc((r.icono || '') + ' ' + r.nombre)}</option>`).join('')}
          </select>
          <div class="field-row">
            <div>
              <label for="mf-fecha">${t('metas.objetivo')}</label>
              <input id="mf-fecha" name="fecha_objetivo" type="date" value="${esc(meta?.fecha_objetivo || '')}" />
            </div>
            <div>
              <label for="mf-prog">${t('metas.progreso')} (0–100)</label>
              <input id="mf-prog" name="progreso" type="number" min="0" max="100" step="5" value="${esc(meta?.progreso ?? 0)}" />
            </div>
            <div>
              <label for="mf-est">${t('metas.estado')}</label>
              <select id="mf-est" name="estado">
                ${['pendiente', 'en_curso', 'hecha'].map((s) => `<option value="${s}" ${(meta?.estado || 'pendiente') === s ? 'selected' : ''}>${t('task.estado.' + s)}</option>`).join('')}
              </select>
            </div>
          </div>
          <label for="mf-desc">${t('task.desc')}</label>
          <textarea id="mf-desc" name="descripcion" maxlength="2000">${esc(meta?.descripcion || '')}</textarea>
          <p class="form-error" id="mf-error" hidden></p>
        </form>
      </div>
      <div class="modal-foot">
        <button class="btn ghost" id="mf-cancel">${t('common.cancel')}</button>
        <button class="btn primary" id="mf-save">💾 ${t('common.save')}</button>
      </div>`);

    const save = async () => {
      const fd = new FormData(m.el.querySelector('#meta-form'));
      const titulo = String(fd.get('titulo') || '').trim();
      if (!titulo) {
        const err = m.el.querySelector('#mf-error');
        err.textContent = t('task.neededTitle');
        err.hidden = false;
        return;
      }
      const data = {
        titulo,
        rol_id: fd.get('rol_id') || '',
        fecha_objetivo: fd.get('fecha_objetivo') || '',
        progreso: clamp(Number(fd.get('progreso')) || 0, 0, 100),
        estado: fd.get('estado') || 'pendiente',
        descripcion: String(fd.get('descripcion') || '').trim()
      };
      if (isEdit) await applyLocal('metas', 'update', { id: meta.id, ...data });
      else await applyLocal('metas', 'create', data);
      m.close();
      rerenderCurrentView();
    };
    m.el.querySelector('#mf-save').onclick = save;
    m.el.querySelector('#mf-cancel').onclick = () => m.close();
    m.el.querySelector('#meta-form').addEventListener('submit', (e) => { e.preventDefault(); save(); });
  })();
}

/** Convierte una meta en tareas concretas (una por línea: "título, 60 min"). */
export function openConvertModal(meta) {
  return (async () => {
    const roles = await getRoles();
    const m = openModal(html`
      <div class="modal-head"><h2>⚙️ ${t('metas.convert')}</h2></div>
      <div class="modal-body">
        <p><strong>${esc(meta.titulo)}</strong> — <span class="muted">${t('metas.convertHint')}</span></p>
        <label for="cv-rol">${t('task.rol')}</label>
        <select id="cv-rol">
          ${roles.map((r) => `<option value="${esc(r.id)}" ${meta.rol_id === r.id ? 'selected' : ''}>${esc((r.icono || '') + ' ' + r.nombre)}</option>`).join('')}
        </select>
        <label for="cv-list">${t('metas.convertBtn')}</label>
        <textarea id="cv-list" rows="6" placeholder="${t('metas.convertPlace')}"></textarea>
      </div>
      <div class="modal-foot">
        <button class="btn ghost" id="cv-cancel">${t('common.cancel')}</button>
        <button class="btn primary" id="cv-go">${t('metas.convertBtn')}</button>
      </div>`);

    m.el.querySelector('#cv-cancel').onclick = () => m.close();
    m.el.querySelector('#cv-go').onclick = async () => {
      const rolId = m.el.querySelector('#cv-rol').value;
      const lines = String(m.el.querySelector('#cv-list').value || '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      let created = 0;
      for (const line of lines) {
        const match = line.match(/^(.*?)[,\s]+(\d{1,3})\s*(min|m)?\.?$/i);
        const titulo = (match ? match[1] : line).trim();
        const dur = match ? Number(match[2]) : 30;
        if (!titulo) continue;
        await applyLocal('tareas', 'create', {
          titulo,
          rol_id: rolId || meta.rol_id || '',
          duracion_min: clamp(dur, 5, 600),
          prioridad: 'media',
          estado: 'pendiente',
          descripcion: `Meta: ${meta.titulo}`,
          etiquetas: 'meta'
        });
        created++;
      }
      m.close();
      toast(`${created} ${t('metas.created')}`, 'success');
      rerenderCurrentView();
    };
  })();
}
