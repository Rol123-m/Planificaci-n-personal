/**
 * Planificación Personal — exporters.js
 * Exportación:
 *  - ICS / iCal (Google Calendar, Outlook, Apple Calendar): un evento, varios o todos.
 *  - Enlaces directos "Añadir a Google Calendar" y "Añadir a Outlook Web".
 *  - PDF del calendario en tabla imprimible con selector de rango
 *    (1/2/3 días, semana completa, mes o rango personalizado) vía @media print.
 *  - CSV y respaldo JSON completo.
 */

import * as db from './db.js';
import { t } from './i18n.js';
import { esc, html, raw, downloadFile, todayISO, startOfWeek, addDays, isoToDate } from './utils.js';
import { openModal, getRoles } from './ui.js';

/* ============================ ICS ============================ */

function icsEsc(s) {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function foldLine(line) {
  // pliega líneas > 74 chars como exige RFC 5545
  if (line.length <= 74) return line;
  const parts = [];
  let rest = line;
  parts.push(rest.slice(0, 74));
  rest = rest.slice(74);
  while (rest.length) {
    parts.push(' ' + rest.slice(0, 73));
    rest = rest.slice(73);
  }
  return parts.join('\r\n');
}

function icsDateTime(fecha, hora) {
  if (!fecha) return '';
  const d = String(fecha).replace(/-/g, '');
  if (!hora) return d;
  return `${d}T${String(hora).replace(':', '')}00`;
}

function endDateTime(fecha, horaIni, durMin) {
  if (!fecha) return '';
  if (!horaIni) return fecha; // día completo
  const [h, m] = horaIni.split(':').map(Number);
  const total = h * 60 + m + (durMin || 30);
  const day = Math.floor(total / 1440);
  const rem = total % 1440;
  const endFecha = day ? addDays(fecha, day) : fecha;
  return icsDateTime(endFecha, `${String(Math.floor(rem / 60)).padStart(2, '0')}:${String(rem % 60).padStart(2, '0')}`);
}

function taskToVEVENT(task) {
  const uid = `${(task.id || 'pp').replace(/[^a-zA-Z0-9]/g, '')}@planificacion-personal`;
  const lines = [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${icsDateTime(todayISO(), '12:00')}Z`,
    task.hora_inicio
      ? `DTSTART:${icsDateTime(task.fecha, task.hora_inicio)}`
      : `DTSTART;VALUE=DATE:${icsDateTime(task.fecha)}`,
    task.hora_inicio
      ? `DTEND:${endDateTime(task.fecha, task.hora_inicio, task.duracion_min)}`
      : `DTEND;VALUE=DATE:${icsDateTime(addDays(task.fecha, 1))}`,
    `SUMMARY:${icsEsc(task.titulo)}`,
    `DESCRIPTION:${icsEsc(task.descripcion || '')}`,
    `STATUS:${task.estado === 'hecha' ? 'CONFIRMED' : 'TENTATIVE'}`,
    `TRANSP:${task.hora_inicio ? 'OPAQUE' : 'TRANSPARENT'}`,
    'END:VEVENT'
  ];
  if (task.recordatorio === 'si' && task.hora_inicio) {
    lines.splice(lines.length - 1, 0,
      'BEGIN:VALARM',
      `TRIGGER:-PT${task.recordatorio_offset_min || 10}M`,
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsEsc(task.titulo)}`,
      'END:VALARM');
  }
  return lines.map(foldLine).join('\r\n');
}

/** Descarga un archivo .ics con las tareas indicadas. */
export function exportICS(tasks, name = 'planificacion') {
  if (!tasks.length) return;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Planificacion Personal//PWA//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...tasks.filter((x) => x.fecha).map(taskToVEVENT),
    'END:VCALENDAR'
  ];
  downloadFile(`${name}.ics`, lines.join('\r\n'), 'text/calendar;charset=utf-8');
}

/* ==================== Enlaces Google / Outlook ==================== */

function toUTCString(fecha, hora) {
  // Google/Outlook esperan fechas UTC en formato YYYYMMDDTHHMMSSZ;
  // usamos hora local interpretada como flotante (sin Z) que Calendar acepta.
  const d = icsDateTime(fecha, hora || '00:00');
  return d + (hora ? 'Z' : '');
}

export function gcalLink(task) {
  const start = task.hora_inicio ? toUTCString(task.fecha, task.hora_inicio) : task.fecha.replace(/-/g, '');
  const end = task.hora_inicio
    ? toUTCString(endDateTime(task.fecha, task.hora_inicio, task.duracion_min).slice(0, 10),
        endDateTime(task.fecha, task.hora_inicio, task.duracion_min).slice(9, 14))
    : addDays(task.fecha, 1).replace(/-/g, '');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: task.titulo || '',
    dates: `${start}/${end}`,
    details: task.descripcion || ''
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function outlookLink(task) {
  const startIso = `${task.fecha}T${task.hora_inicio || '09:00'}:00`;
  const endRaw = endDateTime(task.fecha, task.hora_inicio, task.duracion_min);
  const endIso = task.hora_inicio
    ? `${endRaw.slice(0, 4)}-${endRaw.slice(4, 6)}-${endRaw.slice(6, 8)}T${endRaw.slice(9, 14)}:00`
    : `${addDays(task.fecha, 1)}T00:00:00`;
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: task.titulo || '',
    startdt: startIso,
    enddt: endIso,
    body: task.descripcion || ''
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

/** Modal de exportación de un evento individual. */
export function openExportOne(task) {
  const m = openModal(html`
    <div class="modal-head"><h2>⤓ ${t('export.title')}</h2></div>
    <div class="modal-body">
      <p><strong>${esc(task.titulo)}</strong> <span class="muted">${esc(task.fecha || '')} ${esc(task.hora_inicio || '')}</span></p>
      <p class="muted">${t('export.icsTip')}</p>
      <div class="contact-actions">
        <a href="${esc(gcalLink(task))}" target="_blank" rel="noopener">📅 ${t('export.gcalOne')}</a>
        <a href="${esc(outlookLink(task))}" target="_blank" rel="noopener">📫 ${t('export.outlook')}</a>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn ghost" id="eo-close">${t('common.close')}</button>
      <button class="btn primary" id="eo-ics">⤓ ${t('export.ics')}</button>
    </div>`);
  m.el.querySelector('#eo-close').onclick = () => m.close();
  m.el.querySelector('#eo-ics').onclick = () => { exportICS([task], task.titulo.slice(0, 30) || 'evento'); m.close(); };
}

/* ============================ PDF / impresión ============================ */

/**
 * Modal de exportación a PDF: selector de rango (1, 2, 3 días, semana, mes,
 * personalizado) → construye la tabla imprimible y llama a window.print().
 */
export function openPrintModal(from = startOfWeek(todayISO()), to = addDays(startOfWeek(todayISO()), 6)) {
  const weekStart = startOfWeek(todayISO());
  const m = openModal(html`
    <div class="modal-head"><h2>🖨 ${t('export.pdf')}</h2></div>
    <div class="modal-body">
      <label for="pr-range">${t('export.range')}</label>
      <select id="pr-range">
        <option value="d1">${t('export.day1')}</option>
        <option value="d2">${t('export.day2')}</option>
        <option value="d3">${t('export.day3')}</option>
        <option value="week">${t('export.week')}</option>
        <option value="month">${t('export.month')}</option>
        <option value="custom">${t('export.custom')}</option>
      </select>
      <div class="field-row" style="margin-top:.6rem">
        <div>
          <label for="pr-from">${t('export.from')}</label>
          <input id="pr-from" type="date" value="${esc(from)}" />
        </div>
        <div>
          <label for="pr-to">${t('export.to')}</label>
          <input id="pr-to" type="date" value="${esc(to)}" />
        </div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn ghost" id="pr-cancel">${t('common.cancel')}</button>
      <button class="btn primary" id="pr-go">${t('export.generate')}</button>
    </div>`);

  const range = m.el.querySelector('#pr-range');
  const fromIn = m.el.querySelector('#pr-from');
  const toIn = m.el.querySelector('#pr-to');
  range.onchange = () => {
    const v = range.value;
    const base = todayISO();
    if (v === 'd1') { fromIn.value = base; toIn.value = base; }
    else if (v === 'd2') { fromIn.value = base; toIn.value = addDays(base, 1); }
    else if (v === 'd3') { fromIn.value = base; toIn.value = addDays(base, 2); }
    else if (v === 'week') { fromIn.value = weekStart; toIn.value = addDays(weekStart, 6); }
    else if (v === 'month') {
      const d = isoToDate(base);
      fromIn.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
      toIn.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()).padStart(2, '0')}`;
    }
  };

  m.el.querySelector('#pr-cancel').onclick = () => m.close();
  m.el.querySelector('#pr-go').onclick = async () => {
    const f = fromIn.value || todayISO();
    const tt = toIn.value || f;
    m.close();
    await printRange(f, tt);
  };
}

export async function printRange(from, to) {
  const roles = await getRoles();
  const roleMap = new Map(roles.map((r) => [r.id, r]));
  const all = (await db.getAll('tareas')).filter((x) => !x.deleted);
  const inRange = all.filter((x) => x.fecha && x.fecha >= from && x.fecha <= to);
  const noDate = all.filter((x) => !x.fecha);

  const days = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);

  const priorityLabel = (p) => t('task.priority.' + (p || 'media'));
  const estadoLabel = (s) => t('task.estado.' + (s || 'pendiente'));

  const daySections = days
    .map((day) => {
      const tasks = inRange
        .filter((x) => x.fecha === day)
        .sort((a, b) => (a.hora_inicio || '99').localeCompare(b.hora_inicio || '99'));
      if (!tasks.length) return '';
      const rows = tasks
        .map((x) => {
          const role = roleMap.get(x.rol_id);
          return `<tr>
            <td>${esc(x.hora_inicio || '')}${x.hora_fin ? '–' + esc(x.hora_fin) : ''}</td>
            <td>${esc(x.titulo)}${x.recordatorio === 'si' ? ' 🔔' : ''}</td>
            <td>${esc(role ? role.nombre : '')}</td>
            <td>${esc(priorityLabel(x.prioridad))}</td>
            <td>${esc(estadoLabel(x.estado))}</td>
            <td>${esc([x.telefono, x.email].filter(Boolean).join(' · '))}</td>
          </tr>`;
        })
        .join('');
      return `<div class="pr-day">
        <h3>${esc(new Date(day + 'T12:00:00').toLocaleDateString(document.documentElement.lang === 'en' ? 'en-US' : 'es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</h3>
        <table class="pr-table">
          <thead><tr><th>⏰</th><th>${t('task.titulo')}</th><th>${t('task.rol')}</th><th>${t('task.prioridad')}</th><th>${t('task.estado')}</th><th>${t('task.contact')}</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
    })
    .join('');

  const noDateSection = noDate.length
    ? `<div class="pr-day">
        <h3>${t('hoy.unscheduled')}</h3>
        <table class="pr-table">
          <thead><tr><th>${t('task.titulo')}</th><th>${t('task.rol')}</th><th>${t('task.prioridad')}</th><th>${t('task.estado')}</th></tr></thead>
          <tbody>${noDate.map((x) => {
            const role = roleMap.get(x.rol_id);
            return `<tr><td>${esc(x.titulo)}</td><td>${esc(role ? role.nombre : '')}</td><td>${esc(priorityLabel(x.prioridad))}</td><td>${esc(estadoLabel(x.estado))}</td></tr>`;
          }).join('')}</tbody>
        </table>
      </div>`
    : '';

  const root = document.getElementById('print-root');
  root.innerHTML = `
    <h1 class="pr-title">Planificación Personal</h1>
    <p class="pr-sub">${esc(from)} — ${esc(to)}</p>
    ${daySections || `<p class="pr-sub">—</p>`}
    ${noDateSection}
    <p class="pr-foot">${t('export.printed')} · ${new Date().toLocaleString()}</p>`;
  setTimeout(() => window.print(), 120);
}

/* ============================ CSV y JSON ============================ */

function csvField(v) {
  const s = String(v ?? '');
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function exportCSV() {
  const roles = await getRoles();
  const roleMap = new Map(roles.map((r) => [r.id, r.nombre]));
  const tasks = (await db.getAll('tareas')).filter((x) => !x.deleted);
  const headers = ['id', 'titulo', 'fecha', 'hora_inicio', 'hora_fin', 'duracion_min', 'prioridad', 'estado', 'rol', 'telefono', 'email', 'etiquetas', 'descripcion'];
  const lines = [headers.join(',')];
  for (const x of tasks) {
    lines.push([
      x.id, x.titulo, x.fecha, x.hora_inicio, x.hora_fin, x.duracion_min, x.prioridad, x.estado,
      roleMap.get(x.rol_id) || '', x.telefono, x.email,
      String(x.etiquetas || '').split('|').join(';'), x.descripcion
    ].map(csvField).join(','));
  }
  // BOM para que Excel respete los acentos
  downloadFile(`planificacion_${todayISO()}.csv`, '\uFEFF' + lines.join('\n'), 'text/csv;charset=utf-8');
}

export async function exportJSON() {
  const data = {};
  for (const entity of ['roles', 'tareas', 'metas', 'recordatorios', 'etiquetas', 'config']) {
    data[entity] = await db.getAll(entity);
  }
  const payload = {
    app: 'Planificación Personal',
    version: 1,
    exported_at: new Date().toISOString(),
    data
  };
  downloadFile(`planificacion_respaldo_${todayISO()}.json`, JSON.stringify(payload, null, 2), 'application/json');
}
