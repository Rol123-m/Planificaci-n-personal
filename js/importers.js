/**
 * Planificación Personal — importers.js
 * Importación de tareas desde:
 *  - CSV (separador autodetectado , ; o tabulador; mapeo de columnas configurable;
 *    vista previa; detección de duplicados; protección contra inyección de fórmulas).
 *  - ICS / iCal (Google Calendar, Outlook, Apple Calendar; soporta eventos de día
 *    completo, con hora, TZID básico y reglas RRULE simples DAILY/WEEKLY/MONTHLY).
 *  - Respaldo JSON completo (migración entre dispositivos).
 */

import * as db from './db.js';
import { applyLocal } from './sync.js';
import { enqueueOp } from './db.js';
import { t } from './i18n.js';
import { esc, html, uuid, nowIso, clamp, csvSafe } from './utils.js';
import { openModal, toast, rerenderCurrentView } from './ui.js';

/* ============================ CSV ============================ */

function detectDelimiter(line) {
  const counts = [
    [',', (line.match(/,/g) || []).length],
    [';', (line.match(/;/g) || []).length],
    ['\t', (line.match(/\t/g) || []).length]
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

/** Parser CSV con soporte de comillas dobles. Devuelve { headers, rows }. */
export function parseCSV(text) {
  const clean = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const firstLine = clean.split('\n')[0] || '';
  const delim = detectDelimiter(firstLine);

  const rows = [];
  let cur = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      cur.push(field); field = '';
    } else if (ch === '\n') {
      cur.push(field); field = '';
      if (cur.some((c) => c.trim() !== '')) rows.push(cur);
      cur = [];
    } else field += ch;
  }
  if (field !== '' || cur.length) {
    cur.push(field);
    if (cur.some((c) => c.trim() !== '')) rows.push(cur);
  }
  const headers = rows.length ? rows[0].map((h) => h.trim()) : [];
  const dataRows = rows.slice(1).filter((r) => r.length && r.some((c) => c.trim() !== ''));
  return { headers, rows: dataRows, delimiter: delim };
}

const FIELD_TARGETS = [
  ['titulo', 'task.titulo'], ['fecha', 'task.fecha'], ['hora_inicio', 'task.horaInicio'],
  ['hora_fin', 'task.horaFin'], ['duracion_min', 'task.duracion'], ['prioridad', 'task.prioridad'],
  ['estado', 'task.estado'], ['rol', 'task.rol'], ['telefono', 'task.telefono'],
  ['email', 'task.email'], ['descripcion', 'task.desc'], ['etiquetas', 'task.etiquetas']
];

function guessMapping(headers) {
  const aliases = {
    titulo: ['titulo', 'título', 'title', 'summary', 'tarea', 'subject', 'asunto'],
    fecha: ['fecha', 'date', 'dia', 'día', 'start', 'inicio'],
    hora_inicio: ['hora_inicio', 'hora', 'time', 'start time', 'comienza', 'inicio'],
    hora_fin: ['hora_fin', 'fin', 'end', 'end time', 'termina'],
    duracion_min: ['duracion', 'duración', 'duration', 'minutos', 'min'],
    prioridad: ['prioridad', 'priority'],
    estado: ['estado', 'status', 'state'],
    rol: ['rol', 'role', 'categoría', 'category', 'calendar'],
    telefono: ['telefono', 'teléfono', 'phone', 'tel', 'mobile'],
    email: ['email', 'correo', 'mail'],
    descripcion: ['descripcion', 'descripción', 'description', 'notes', 'notas'],
    etiquetas: ['etiquetas', 'tags', 'labels']
  };
  const map = {};
  headers.forEach((h, idx) => {
    const hl = h.toLowerCase().trim();
    for (const [field, list] of Object.entries(aliases)) {
      if (list.some((a) => hl.includes(a)) && map[field] === undefined) {
        map[field] = idx;
        return;
      }
    }
  });
  return map;
}

/** Normaliza valores importados y neutraliza inyección de fórmulas. */
function normalizeImported(map, row, rolesMap) {
  const g = (field) => {
    const idx = map[field];
    if (idx === undefined || idx === null || idx === '') return '';
    return csvSafe(String(row[idx] ?? '').trim());
  };
  let fecha = g('fecha');
  if (fecha) {
    const d = new Date(fecha);
    if (!Number.isNaN(d.getTime()) && /\d{4}-\d{2}-\d{2}/.test(fecha) === false) {
      fecha = d.toISOString().slice(0, 10);
    } else if (/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(fecha)) {
      const [dd, mm, yy] = fecha.split('/').map(Number);
      const year = yy < 100 ? 2000 + yy : yy;
      fecha = `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    }
    if (!/^\d{4}-\d{2}-\d{2}/.test(fecha)) fecha = '';
  }
  const prRaw = g('prioridad').toLowerCase();
  const prioridad = prRaw.startsWith('a') || prRaw.includes('high') ? 'alta'
    : prRaw.startsWith('b') || prRaw.includes('low') ? 'baja'
    : prRaw.includes('media') || prRaw.includes('med') || prRaw.includes('normal') ? 'media' : 'media';
  const esRaw = g('estado').toLowerCase();
  const estado = esRaw.includes('hecha') || esRaw.includes('done') || esRaw.includes('comp') ? 'hecha'
    : esRaw.includes('curso') || esRaw.includes('progress') ? 'en_curso' : 'pendiente';
  const rolName = g('rol');
  const durRaw = parseInt(g('duracion_min'), 10);
  return {
    titulo: g('titulo'),
    fecha,
    hora_inicio: (g('hora_inicio') || '').slice(0, 5),
    hora_fin: (g('hora_fin') || '').slice(0, 5),
    duracion_min: durRaw > 0 ? clamp(durRaw, 5, 600) : 30,
    prioridad,
    estado,
    rol_id: rolesMap.get(rolName.toLowerCase())?.id || '',
    telefono: g('telefono'),
    email: g('email'),
    descripcion: g('descripcion'),
    etiquetas: String(g('etiquetas') || '').split(/[,;]+/).map((x) => x.trim()).filter(Boolean).join('|')
  };
}

/** Hechizo principal: abre el asistente de importación CSV. */
export function openCSVImport() {
  const m = openModal(html`
    <div class="modal-head"><h2>⤒ ${t('import.csv')}</h2></div>
    <div class="modal-body">
      <p class="muted">${t('import.encodingHint')}</p>
      <input type="file" id="csv-file" accept=".csv,text/csv" />
      <div id="csv-wizard" hidden>
        <h3 style="margin-top:1rem">${t('import.map')}</h3>
        <div id="csv-map"></div>
        <h3 style="margin-top:1rem">${t('import.preview')}</h3>
        <div id="csv-preview" style="max-height:240px;overflow:auto"></div>
        <p class="form-error" id="csv-dup-info" style="margin-top:.6rem"></p>
        <div class="field-row" style="margin-top:.6rem">
          <div>
            <label for="csv-dupmode">${t('import.mode')}</label>
            <select id="csv-dupmode">
              <option value="skip">${t('import.mode.skip')}</option>
              <option value="import">${t('import.mode.import')}</option>
            </select>
          </div>
        </div>
      </div>
      <p class="form-error" id="csv-error" hidden></p>
    </div>
    <div class="modal-foot">
      <button class="btn ghost" id="csv-cancel">${t('import.cancel')}</button>
      <button class="btn primary" id="csv-import" disabled>${t('import.confirm')}</button>
    </div>`);

  let parsed = null;
  let mapping = null;
  const fileInput = m.el.querySelector('#csv-file');

  fileInput.onchange = async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      parsed = parseCSV(text);
      if (!parsed.rows.length) throw new Error(t('import.noRows'));
      mapping = guessMapping(parsed.headers);
      buildMappingUI(m.el.querySelector('#csv-map'), parsed.headers, mapping, parsed);
      renderPreview(m.el.querySelector('#csv-preview'), parsed, mapping);
      m.el.querySelector('#csv-wizard').hidden = false;
      m.el.querySelector('#csv-import').disabled = false;
      const dupes = await countDuplicates(parsed, mapping);
      const info = m.el.querySelector('#csv-dup-info');
      info.hidden = dupes === 0;
      info.textContent = dupes ? `⚠ ${dupes} ${t('import.duplicates')}` : '';
    } catch (err) {
      const errEl = m.el.querySelector('#csv-error');
      errEl.textContent = err.message;
      errEl.hidden = false;
    }
  };

  m.el.querySelector('#csv-cancel').onclick = () => m.close();
  m.el.querySelector('#csv-import').onclick = async () => {
    if (!parsed || !mapping) return;
    const roles = await db.getAll('roles');
    const rolesMap = new Map(roles.filter((r) => !r.deleted).map((r) => [r.nombre.toLowerCase(), r]));
    const dupMode = m.el.querySelector('#csv-dupmode').value;
    const existing = (await db.getAll('tareas')).filter((x) => !x.deleted);
    let imported = 0;
    for (const row of parsed.rows) {
      const task = normalizeImported(mapping, row, rolesMap);
      if (!task.titulo) continue;
      const dup = existing.some(
        (e) => e.titulo.toLowerCase() === task.titulo.toLowerCase() && (!task.fecha || e.fecha === task.fecha)
      );
      if (dup && dupMode === 'skip') continue;
      await applyLocal('tareas', 'create', task, { flushNow: false });
      imported++;
    }
    m.close();
    toast(`${imported} ${t('import.imported')}`, 'success');
    rerenderCurrentView();
  };
}

function buildMappingUI(container, headers, mapping, parsed) {
  const rows = FIELD_TARGETS.map(([field, i18nKey]) => {
    const cur = mapping[field];
    const opts = [`<option value="">${t('import.ignore')}</option>`]
      .concat(headers.map((h, idx) => `<option value="${idx}" ${cur === idx ? 'selected' : ''}>${esc(h)}</option>`))
      .join('');
    return `<div class="field-row">
      <div><label>${t(i18nKey)}</label></div>
      <div><select data-map="${field}">${opts}</select></div>
    </div>`;
  }).join('');
  container.innerHTML = rows;
  const previewEl = () => container.closest('.modal').querySelector('#csv-preview');
  container.querySelectorAll('[data-map]').forEach((sel) => {
    sel.onchange = () => {
      const v = sel.value;
      mapping[sel.getAttribute('data-map')] = v === '' ? undefined : Number(v);
      if (previewEl()) renderPreview(previewEl(), parsed, mapping);
    };
  });
}

function renderPreview(container, parsed, mapping) {
  const rows = parsed.rows.slice(0, 10).map((r) => {
    const titulo = mapping.titulo !== undefined ? r[mapping.titulo] : '';
    const fecha = mapping.fecha !== undefined ? r[mapping.fecha] : '';
    const hora = mapping.hora_inicio !== undefined ? r[mapping.hora_inicio] : '';
    const pr = mapping.prioridad !== undefined ? r[mapping.prioridad] : '';
    return `<tr><td>${esc(titulo)}</td><td>${esc(fecha)}</td><td>${esc(hora)}</td><td>${esc(pr)}</td></tr>`;
  }).join('');
  container.innerHTML = `<table class="table">
    <thead><tr><th>${t('task.titulo')}</th><th>${t('task.fecha')}</th><th>${t('task.horaInicio')}</th><th>${t('task.prioridad')}</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

async function countDuplicates(parsed, mapping) {
  if (mapping.titulo === undefined) return 0;
  const existing = (await db.getAll('tareas')).filter((x) => !x.deleted)
    .map((x) => x.titulo.toLowerCase());
  return parsed.rows.filter((r) => existing.includes(String(r[mapping.titulo] || '').toLowerCase())).length;
}

/* ============================ ICS ============================ */

function unfoldICS(text) {
  return String(text || '').replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
}

function parseICSLines(text) {
  const lines = unfoldICS(text).split('\n');
  const events = [];
  let cur = null;
  for (const line of lines) {
    const m = line.match(/^([A-Z-]+)(?:;([^:]*))?:(.*)$/);
    if (!m) continue;
    const [, name, params, value] = m;
    if (name === 'BEGIN' && value === 'VEVENT') { cur = { raw: {} }; continue; }
    if (name === 'END' && value === 'VEVENT') { if (cur) events.push(cur); cur = null; continue; }
    if (cur) cur.raw[name] = { params: params || '', value };
  }
  return events;
}

function icsDateTimeToFields(dt) {
  // 20260101T090000Z | 20260101T090000 | 20260101
  const v = String(dt || '').trim();
  const dateOnly = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) return { fecha: `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`, hora: '' };
  const dtm = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!dtm) return { fecha: '', hora: '' };
  return {
    fecha: `${dtm[1]}-${dtm[2]}-${dtm[3]}`,
    hora: `${dtm[4]}:${dtm[5]}`,
    utc: !!dtm[7]
  };
}

function expandRRule(rrule, dtstart, horizonDays = 90) {
  const parts = {};
  String(rrule || '').split(';').forEach((p) => {
    const [k, v] = p.split('=');
    parts[k] = v;
  });
  const freq = (parts.FREQ || '').toUpperCase();
  if (!['DAILY', 'WEEKLY', 'MONTHLY'].includes(freq)) return [dtstart];
  const interval = Math.max(1, parseInt(parts.INTERVAL || '1', 10));
  const count = parseInt(parts.COUNT || '0', 10);
  const until = parts.UNTIL ? icsDateTimeToFields(parts.UNTIL) : null;
  const byDay = (parts.BYDAY || '').split(',').filter(Boolean);

  const start = new Date(`${dtstart.fecha}T${dtstart.hora || '00:00'}:00`);
  const limit = new Date();
  limit.setDate(limit.getDate() + horizonDays);
  const maxCount = count || 60;
  const out = [];

  const pushDate = (d) => {
    if (until && d > new Date(`${until.fecha}T${until.hora || '23:59'}:00`)) return false;
    out.push({ fecha: d.toISOString().slice(0, 10), hora: dtstart.hora });
    return true;
  };

  if (freq === 'DAILY') {
    for (let i = 0, n = 0; n < maxCount && start <= limit; i += interval) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      if (!pushDate(d)) break;
      n++;
    }
  } else if (freq === 'WEEKLY') {
    const dayMap = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 0 };
    const days = byDay.length ? byDay.map((d) => dayMap[d]).filter((x) => x !== undefined) : [start.getDay()];
    for (let w = 0; w * interval * 7 <= horizonDays && out.length < maxCount; w++) {
      for (const day of days.sort((a, b) => a - b)) {
        const d = new Date(start);
        const base = new Date(start);
        base.setDate(base.getDate() + w * interval * 7);
        const diff = (day - base.getDay() + 7) % 7;
        d.setDate(base.getDate() + diff);
        if (d < start || d > limit) continue;
        if (!pushDate(d)) break;
        if (out.length >= maxCount) break;
      }
    }
  } else {
    for (let i = 0; i < maxCount; i++) {
      const d = new Date(start);
      d.setMonth(d.getMonth() + i * interval);
      if (d > limit) break;
      if (!pushDate(d)) break;
    }
  }
  return out.length ? out : [dtstart];
}

/** Convierte VEVENTs en tareas (expande RRULE simples dentro de un horizonte de 90 días). */
export function parseICS(text) {
  const events = parseICSLines(text);
  const tasks = [];
  for (const ev of events) {
    const rawEv = ev.raw;
    const summary = String(rawEv.SUMMARY?.value || '(sin título)');
    const desc = String(rawEv.DESCRIPTION?.value || '').replace(/\\n/g, '\n').replace(/\\,/g, ',');
    const dtstartRaw = rawEv.DTSTART?.value || '';
    const dtstart = icsDateTimeToFields(dtstartRaw);
    if (!dtstart.fecha) continue;
    const dtend = icsDateTimeToFields(rawEv.DTEND?.value || '');
    let dur = 30;
    if (dtend.fecha === dtstart.fecha && dtend.hora) {
      const [h1, m1] = dtstart.hora.split(':').map(Number);
      const [h2, m2] = dtend.hora.split(':').map(Number);
      dur = clamp((h2 * 60 + m2) - (h1 * 60 + m1), 5, 600);
    }
    const rrule = rawEv.RRULE?.value;
    const occurrences = rrule && dtstart.hora ? expandRRule(rrule, dtstart) : [dtstart];
    for (const occ of occurrences.slice(0, 60)) {
      tasks.push({
        titulo: summary,
        descripcion: desc,
        fecha: occ.fecha,
        hora_inicio: occ.hora || '',
        hora_fin: occ.hora && dur ? '' : '',
        duracion_min: dur,
        prioridad: 'media',
        estado: 'pendiente',
        uid: String(rawEv.UID?.value || ''),
        etiquetas: 'importado'
      });
    }
  }
  return tasks;
}

/** Asistente de importación ICS. */
export function openICSImport() {
  const m = openModal(html`
    <div class="modal-head"><h2>⤒ ${t('import.ics')}</h2></div>
    <div class="modal-body">
      <input type="file" id="ics-file" accept=".ics,.ical,text/calendar" />
      <div id="ics-preview" hidden>
        <h3 style="margin-top:1rem">${t('import.preview')}</h3>
        <div style="max-height:240px;overflow:auto"><table class="table" id="ics-table"></table></div>
        <p class="form-error" id="ics-dup-info"></p>
        <div class="field-row" style="margin-top:.6rem">
          <div>
            <label for="ics-dupmode">${t('import.mode')}</label>
            <select id="ics-dupmode">
              <option value="skip">${t('import.mode.skip')}</option>
              <option value="import">${t('import.mode.import')}</option>
            </select>
          </div>
        </div>
      </div>
      <p class="form-error" id="ics-error" hidden></p>
    </div>
    <div class="modal-foot">
      <button class="btn ghost" id="ics-cancel">${t('import.cancel')}</button>
      <button class="btn primary" id="ics-import" disabled>${t('import.confirm')}</button>
    </div>`);

  let tasks = [];
  const fileInput = m.el.querySelector('#ics-file');
  fileInput.onchange = async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      tasks = parseICS(await file.text());
      if (!tasks.length) throw new Error(t('import.noRows'));
      const table = m.el.querySelector('#ics-table');
      table.innerHTML = `<thead><tr><th>${t('task.titulo')}</th><th>${t('task.fecha')}</th><th>${t('task.horaInicio')}</th></tr></thead>
        <tbody>${tasks.slice(0, 20).map((x) => `<tr><td>${esc(x.titulo)}</td><td>${esc(x.fecha)}</td><td>${esc(x.hora_inicio)}</td></tr>`).join('')}</tbody>`;
      m.el.querySelector('#ics-preview').hidden = false;
      m.el.querySelector('#ics-import').disabled = false;
      const existing = (await db.getAll('tareas')).filter((x) => !x.deleted).map((x) => x.titulo.toLowerCase());
      const dupes = tasks.filter((x) => existing.includes(x.titulo.toLowerCase())).length;
      const info = m.el.querySelector('#ics-dup-info');
      info.hidden = dupes === 0;
      info.textContent = dupes ? `⚠ ${dupes} ${t('import.duplicates')}` : '';
    } catch (err) {
      const errEl = m.el.querySelector('#ics-error');
      errEl.textContent = err.message;
      errEl.hidden = false;
    }
  };
  m.el.querySelector('#ics-cancel').onclick = () => m.close();
  m.el.querySelector('#ics-import').onclick = async () => {
    const dupMode = m.el.querySelector('#ics-dupmode').value;
    const existing = (await db.getAll('tareas')).filter((x) => !x.deleted).map((x) => x.titulo.toLowerCase());
    let imported = 0;
    for (const task of tasks) {
      if (dupMode === 'skip' && existing.includes(task.titulo.toLowerCase())) continue;
      await applyLocal('tareas', 'create', task, { flushNow: false });
      imported++;
    }
    m.close();
    toast(`${imported} ${t('import.imported')}`, 'success');
    rerenderCurrentView();
  };
}

/* ============================ Respaldo JSON ============================ */

/**
 * Restaura un respaldo JSON (generado por exporters.exportJSON).
 * Escribe las filas localmente y encola operaciones "update" para que
 * también se sincronicen con el servidor (migración entre dispositivos).
 */
export async function importJSONBackup(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  const payload = data.data || data;
  const entities = ['roles', 'tareas', 'metas', 'recordatorios', 'etiquetas', 'config'];
  let count = 0;
  for (const entity of entities) {
    const rows = payload[entity];
    if (!Array.isArray(rows)) continue;
    await db.upsertAll(entity, rows);
    for (const row of rows) {
      if (entity === 'config') {
        await enqueueOp('config', 'update', row, '');
      } else {
        await enqueueOp(entity, 'update', row, '');
      }
      count++;
    }
  }
  await db.setMeta('restore_ts', nowIso());
  rerenderCurrentView();
  return count;
}
