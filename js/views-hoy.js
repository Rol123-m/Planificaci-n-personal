/**
 * Planificación Personal — views-hoy.js
 * Vista "Hoy": tareas vencidas, programadas para hoy, próximo recordatorio,
 * modo enfoque (Pomodoro), completadas y tareas sin fecha.
 */

import * as db from './db.js';
import { t } from './i18n.js';
import { esc, html, raw, todayISO, fmtTime, fmtDateLong, normalizePhone } from './utils.js';
import { taskRowHTML, wireTaskList, getRoles, viewTitle, openTaskEditor, openPomodoro, rerenderCurrentView } from './ui.js';

const dayNamesShort = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export async function renderHoy(root) {
  const roles = await getRoles();
  const roleMap = new Map(roles.map((r) => [r.id, r]));
  const all = (await db.getAll('tareas')).filter((x) => !x.deleted);
  const today = todayISO();

  const vencidas = all.filter((x) => x.fecha && x.fecha < today && x.estado !== 'hecha');
  const hoy = all
    .filter((x) => x.fecha === today && x.hora_inicio)
    .sort((a, b) => (a.hora_inicio || '').localeCompare(b.hora_inicio || ''));
  const hoySinHora = all.filter((x) => x.fecha === today && !x.hora_inicio);
  const completadas = all.filter((x) => x.estado === 'hecha' && x.fecha === today);
  const sinFecha = all.filter((x) => !x.fecha).slice(0, 8);

  // Próximo recordatorio (campanita) a partir de ahora
  const recs = (await db.getAll('recordatorios')).filter((r) => !r.deleted && r.enviado !== 'si');
  const nowTs = Date.now();
  const nextRec = recs
    .map((r) => ({ ...r, ts: new Date(r.fecha_hora).getTime() }))
    .filter((r) => r.ts && r.ts >= nowTs - 60000)
    .sort((a, b) => a.ts - b.ts)[0];

  const row = (task) => taskRowHTML(task, roleMap.get(task.rol_id));
  const list = (tasks) => tasks.length ? tasks.map(row).join('') : `<p class="muted">— ${t('common.none')} —</p>`;

  root.innerHTML = html`
    ${raw(viewTitle(t('hoy.title') + ' · ' + fmtDateLong(today), `
      <button class="btn primary" id="btn-new-task">＋ ${t('task.new')}</button>
      <button class="btn ghost" id="btn-focus">⏱ ${t('hoy.focus')}</button>
    `))}
    <div class="today-grid">
      <div>
        <div class="card">
          <h3>⏰ ${t('hoy.scheduled')}</h3>
          <div class="timeline" id="hoy-list">${raw(list(hoy.concat(hoySinHora)))}</div>
          ${!hoy.length && !hoySinHora.length ? `<p class="muted">${t('hoy.noTasks')}</p>` : ''}
        </div>
        <div class="card">
          <h3>⚠️ ${t('hoy.overdue')} (${vencidas.length})</h3>
          <div id="hoy-overdue">${raw(list(vencidas.slice(0, 10)))}</div>
        </div>
      </div>
      <div>
        <div class="card">
          <h3>🔔 ${t('hoy.nextReminder')}</h3>
          ${nextRec
            ? `<p><strong>${esc(nextRec.titulo || t('notify.reminderBody'))}</strong><br>
               <span class="muted">${esc(nextRec.fecha_hora.replace('T', ' ').slice(5, 16))}</span></p>
               <div>${raw(nextRec.telefono || nextRec.email
                 ? `<div class="contact-actions">
                      ${nextRec.telefono ? `<a href="tel:${esc(normalizePhone(nextRec.telefono))}">📞 ${t('contact.call')}</a>
                      <a href="https://wa.me/${esc(normalizePhone(nextRec.telefono).replace(/^\+/, ''))}" target="_blank" rel="noopener">💬 ${t('contact.whatsapp')}</a>` : ''}
                      ${nextRec.email ? `<a href="mailto:${esc(nextRec.email)}">✉️ ${t('contact.email')}</a>` : ''}
                    </div>` : '')}</div>`
            : `<p class="muted">—</p>`}
        </div>
        <div class="card">
          <h3>⏱ ${t('hoy.focus')}</h3>
          <p class="muted">${t('hoy.focus')} — Pomodoro</p>
          <button class="btn primary" id="btn-focus-2">${t('hoy.startFocus')}</button>
        </div>
        <div class="card">
          <h3>✅ ${t('hoy.completed')} (${completadas.length})</h3>
          <div id="hoy-done">${raw(list(completadas))}</div>
        </div>
        <div class="card">
          <h3>📥 ${t('hoy.unscheduled')} (${sinFecha.length})</h3>
          <div id="hoy-inbox">${raw(list(sinFecha))}</div>
        </div>
      </div>
    </div>`;

  wireTaskList(root, { rerender: rerenderCurrentView });
  root.querySelector('#btn-new-task').onclick = () => openTaskEditor(null, { defaultFecha: today });
  const focusBtns = root.querySelectorAll('#btn-focus, #btn-focus-2');
  focusBtns.forEach((b) => {
    b.onclick = () => openPomodoro(hoy.find((x) => x.estado !== 'hecha') || all.find((x) => x.estado !== 'hecha') || null);
  });
}
