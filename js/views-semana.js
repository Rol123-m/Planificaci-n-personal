/**
 * Planificación Personal — views-semana.js
 * Calendario semanal (días × horas) con:
 *  - Arrastrar y soltar tareas entre franjas horarias y desde la bandeja.
 *  - Bandeja de tareas sin programar.
 *  - Sugerencias inteligentes en los espacios en blanco, con explicación breve
 *    (prioridad, proximidad de la fecha límite, antigüedad, duración).
 */

import * as db from './db.js';
import { applyLocal } from './sync.js';
import { updateRemindersForTask } from './notify.js';
import { t, getLocale } from './i18n.js';
import {
  esc, html, raw, todayISO, startOfWeek, addDays, hhmmToMin, minToHhmm,
  priorityRank, diffDays, fmtDate, fmtDateLong
} from './utils.js';
import {
  taskChips, wireTaskList, getRoles, viewTitle, openTaskEditor, openMoveTo,
  rerenderCurrentView, openTaskDetail, toast
} from './ui.js';

const DAY_NAMES = {
  es: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
};

let weekStart = startOfWeek(todayISO());
const DAY_START_H = Number(localStorage.getItem('pp_day_start') || 6);
const DAY_END_H = Number(localStorage.getItem('pp_day_end') || 23);
const SLOTS = DAY_END_H - DAY_START_H; // p. ej. 6→23 = 17 franjas de 1 h

export async function renderSemana(root) {
  const roles = await getRoles();
  const roleMap = new Map(roles.map((r) => [r.id, r]));
  const weekEnd = addDays(weekStart, 6);
  const all = (await db.getAll('tareas')).filter((x) => !x.deleted);
  const today = todayISO();

  const inWeek = all.filter((x) => x.fecha >= weekStart && x.fecha <= weekEnd && x.hora_inicio);
  const unscheduled = all
    .filter((x) => !x.fecha || !x.hora_inicio)
    .sort((a, b) => priorityRank(b.prioridad) - priorityRank(a.prioridad));

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const names = DAY_NAMES[getLocale()] || DAY_NAMES.es;
  const todayIdx = days.indexOf(today);

  /* ---- cabecera ---- */
  const headerCells = names
    .map((n, i) => {
      const d = days[i];
      return `<div class="wd${d === today ? ' today' : ''}">${n}<span class="dnum">${d.slice(8)}/${d.slice(5, 7)}</span></div>`;
    })
    .join('');

  /* ---- tareas por día ---- */
  const byDay = {};
  for (const day of days) {
    byDay[day] = all
      .filter((x) => x.fecha === day && x.hora_inicio)
      .sort((a, b) => (a.hora_inicio || '').localeCompare(b.hora_inicio || ''));
  }

  /* ---- sugerencias por franja ---- */
  const suggestions = buildSuggestions(unscheduled, days, byDay);

  /* ---- rejilla ---- */
  let timeCells = '';
  for (let h = DAY_START_H; h < DAY_END_H; h++) {
    timeCells += `<div class="time-cell" style="grid-column:1;grid-row:${h - DAY_START_H + 1}">${String(h).padStart(2, '0')}:00</div>`;
  }

  let dayCols = '';
  for (let c = 0; c < 7; c++) {
    const day = days[c];
    let slots = '';
    for (let h = DAY_START_H; h < DAY_END_H; h++) {
      const hh = `${String(h).padStart(2, '0')}:00`;
      const sug = suggestions[`${day}|${hh}`];
      slots += `<div class="hour-slot empty-slot" data-day="${day}" data-hh="${hh}">
        <div class="slot-add"><button class="btn tiny ghost" data-add="${day}|${hh}" type="button">＋ ${t('week.addSlot')}</button></div>
        ${sug ? `<div class="suggestion" data-assign="${esc(sug.task.id)}|${day}|${hh}" title="${esc(sug.reason)}">
          <span><strong>${esc(sug.task.titulo)}</strong></span>
          <span class="why">💡 ${esc(sug.reason)}</span>
        </div>` : ''}
      </div>`;
    }
    const blocks = byDay[day].map((task) => taskBlockHTML(task, DAY_START_H, roleMap)).join('');
    dayCols += `<div class="day-col${day === today ? ' today' : ''}" data-col="${c}" style="grid-column:${c + 2};grid-row:1 / span ${SLOTS}">${slots}${blocks}</div>`;
  }

  /* ---- bandeja ---- */
  const trayRows = unscheduled
    .map(
      (task) => html`
      <div class="task-row" draggable="true" data-task-id="${esc(task.id)}">
        <span class="grab" aria-hidden="true">⋮⋮</span>
        <div class="task-main">
          <div class="task-title">${esc(task.titulo)}</div>
          <div class="task-meta">${raw(taskChips(task))}</div>
        </div>
        <div class="task-actions">
          <button class="icon-btn" data-move="${esc(task.id)}" title="${t('week.move')}">📅</button>
          <button class="icon-btn" data-detail="${esc(task.id)}" title="${t('common.details')}">⋯</button>
        </div>
      </div>`
    )
    .join('');

  const topSuggestions = Object.values(suggestions)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  root.innerHTML = html`
    ${raw(viewTitle(`${t('week.title')} · ${fmtDateLong(weekStart)}`, `
      <button class="btn ghost" id="wk-prev" aria-label="${t('common.prev')}">‹</button>
      <button class="btn ghost" id="wk-today">${t('week.today')}</button>
      <button class="btn ghost" id="wk-next" aria-label="${t('common.next')}">›</button>
      <button class="btn primary" id="wk-add">＋ ${t('task.new')}</button>
      <button class="btn ghost" id="wk-print">🖨 ${t('common.print')}</button>
      <button class="btn ghost" id="wk-ics">⤓ .ics</button>
    `))}

    <div class="week-header" style="grid-template-columns:52px repeat(7, minmax(64px,1fr))">
      <div></div>${raw(headerCells)}
    </div>

    <div class="week-layout">
      <aside class="tray" id="tray">
        <h3>📥 ${t('week.tray')} (${unscheduled.length})</h3>
        <p class="tray-hint">${t('week.trayHint')}</p>
        <div id="tray-list">${trayRows || `<p class="muted">${t('common.none')}</p>`}</div>
        ${topSuggestions.length ? `
        <h3 style="margin-top:1rem">💡 ${t('common.suggestions')}</h3>
        ${topSuggestions.map((s) => `
          <div class="suggestion" data-assign="${esc(s.task.id)}|move">
            <span><strong>${esc(s.task.titulo)}</strong></span>
            <span class="why">💡 ${esc(s.reason)}</span>
          </div>`).join('')}` : ''}
      </aside>

      <div class="week-grid-wrap">
        <div class="week-grid" id="week-grid" style="grid-template-columns:52px repeat(7,minmax(96px,1fr));grid-template-rows:repeat(${SLOTS},var(--hour-h))">
          ${raw(timeCells + dayCols)}
        </div>
      </div>
    </div>`;

  /* ---------------- eventos ---------------- */
  wireTaskList(root, { rerender: rerenderCurrentView });

  root.querySelector('#wk-prev').onclick = () => { weekStart = addDays(weekStart, -7); rerenderCurrentView(); };
  root.querySelector('#wk-next').onclick = () => { weekStart = addDays(weekStart, 7); rerenderCurrentView(); };
  root.querySelector('#wk-today').onclick = () => { weekStart = startOfWeek(todayISO()); rerenderCurrentView(); };
  root.querySelector('#wk-add').onclick = () => openTaskEditor(null, { defaultFecha: today });
  root.querySelector('#wk-print').onclick = async () => {
    const ex = await import('./exporters.js');
    ex.openPrintModal(weekStart, weekEnd);
  };
  root.querySelector('#wk-ics').onclick = async () => {
    const ex = await import('./exporters.js');
    ex.exportICS(inWeek, `${t('week.title')}_${weekStart}`);
  };

  // Añadir tarea en una franja concreta
  root.querySelectorAll('[data-add]').forEach((btn) => {
    btn.onclick = () => {
      const [day, hh] = btn.getAttribute('data-add').split('|');
      openTaskEditor(null, { defaultFecha: day, defaultHora: hh });
    };
  });

  // Sugerencia: asignar tarea a esa franja
  root.querySelectorAll('[data-assign]').forEach((el) => {
    el.onclick = async () => {
      const [taskId, day, hh] = el.getAttribute('data-assign').split('|');
      const task = await db.get('tareas', taskId);
      if (!task) return;
      if (day === 'move') {
        openMoveTo(task);
        return;
      }
      await assignToSlot(task, day, hh);
    };
  });

  // Mover a… desde la bandeja
  root.querySelectorAll('[data-move]').forEach((btn) => {
    btn.onclick = async () => {
      const task = await db.get('tareas', btn.getAttribute('data-move'));
      if (task) openMoveTo(task);
    };
  });

  /* drag & drop */
  const grid = root.querySelector('#week-grid');
  const tray = root.querySelector('#tray');

  root.querySelectorAll('[draggable="true"][data-task-id]').forEach((el) => {
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', el.getAttribute('data-task-id'));
      e.dataTransfer.effectAllowed = 'move';
      grid.classList.add('drag-over');
    });
    el.addEventListener('dragend', () => grid.classList.remove('drag-over'));
  });

  root.querySelectorAll('.hour-slot').forEach((slot) => {
    slot.addEventListener('dragover', (e) => { e.preventDefault(); slot.style.background = 'var(--primary-soft)'; });
    slot.addEventListener('dragleave', () => { slot.style.background = ''; });
    slot.addEventListener('drop', async (e) => {
      e.preventDefault();
      slot.style.background = '';
      const id = e.dataTransfer.getData('text/plain');
      const task = await db.get('tareas', id);
      if (task) await assignToSlot(task, slot.getAttribute('data-day'), slot.getAttribute('data-hh'));
    });
  });

  // Soltar en la bandeja = quitar fecha y hora
  tray.addEventListener('dragover', (e) => e.preventDefault());
  tray.addEventListener('drop', async (e) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    const task = await db.get('tareas', id);
    if (!task) return;
    const row = await applyLocal('tareas', 'update', { id: task.id, fecha: '', hora_inicio: '', hora_fin: '' });
    await updateRemindersForTask(row);
    rerenderCurrentView();
  });

  async function assignToSlot(task, day, hh) {
    const start = hhmmToMin(hh);
    const end = start + (task.duracion_min || 30);
    const row = await applyLocal('tareas', 'update', {
      id: task.id,
      fecha: day,
      hora_inicio: hh,
      hora_fin: end < 1440 ? minToHhmm(end) : ''
    });
    await updateRemindersForTask(row);
    toast(`${task.titulo} → ${fmtDate(day)} ${hh}`, 'success', 2200);
    rerenderCurrentView();
  }
}

/* ------------------------------------------------------------------ */
/* Bloque de tarea dentro de la rejilla                                */
/* ------------------------------------------------------------------ */

function taskBlockHTML(task, dayStartH, roleMap) {
  const role = roleMap.get(task.rol_id);
  const startMin = hhmmToMin(task.hora_inicio) ?? DAY_START_H * 60;
  const endMin = hhmmToMin(task.hora_fin) ?? startMin + (task.duracion_min || 60);
  const pxPerHour = 52;
  const top = ((Math.max(startMin, DAY_START_H * 60) - DAY_START_H * 60) / 60) * pxPerHour + 1;
  const height = Math.max(22, ((Math.min(endMin, DAY_END_H * 60) - Math.max(startMin, DAY_START_H * 60)) / 60) * pxPerHour - 3);
  const color = role?.color || 'var(--primary)';
  return html`
  <div class="week-task" draggable="true" data-task-id="${esc(task.id)}" data-detail="${esc(task.id)}"
       style="top:${top}px;height:${height}px;background:${esc(color)}">
    ${task.recordatorio === 'si' ? '<span class="wk-bell">🔔</span>' : ''}
    <div class="wk-t">${esc(task.titulo)}</div>
    ${height > 36 ? `<div class="wk-h">${esc(task.hora_inicio.slice(0, 5))}${task.estado === 'hecha' ? ' · ✓' : ''}</div>` : ''}
  </div>`;
}

/* ------------------------------------------------------------------ */
/* Motor de sugerencias inteligentes                                   */
/* ------------------------------------------------------------------ */

/**
 * Para cada franja libre de la semana devuelve la mejor tarea candidata con una
 * explicación breve del porqué. Puntuación:
 *   prioridad (alta 6 / media 4 / baja 2) + proximidad de fecha límite
 *   (+4 si vence en ≤3 días, +2 si en ≤7) + antigüedad en la bandeja (+1..3).
 */
function buildSuggestions(unscheduled, days, byDay) {
  const out = {};
  if (!unscheduled.length) return out;
  const today = todayISO();

  const scored = unscheduled
    .filter((task) => task.estado !== 'hecha' && (task.duracion_min || 30) <= 120)
    .map((task) => {
      let score = priorityRank(task.prioridad) * 2;
      const reasons = [];
      if (task.prioridad === 'alta') reasons.push(t('task.priority.alta') + ' ↑↑');
      if (task.fecha) {
        const d = diffDays(task.fecha, today);
        if (d !== null && d < 0) { score += 6; reasons.push((getLocale() === 'en' ? 'overdue' : 'vencida') + ` (${fmtDate(task.fecha)})`); }
        else if (d !== null && d <= 3) { score += 4; reasons.push((getLocale() === 'en' ? `due in ${d} d` : `vence en ${d} d`)); }
        else if (d !== null && d <= 7) { score += 2; reasons.push((getLocale() === 'en' ? `due ${fmtDate(task.fecha)}` : `límite ${fmtDate(task.fecha)}`)); }
      }
      const created = String(task.creado || '').slice(0, 10);
      const age = created ? diffDays(today, created) : 0;
      if (age && age >= 3) { score += Math.min(3, Math.floor(age / 3)); reasons.push(getLocale() === 'en' ? 'waiting in inbox' : 'espera en la bandeja'); }
      return { task, score: score + 1, reason: reasons.join(' · ') || (getLocale() === 'en' ? 'fits this free slot' : 'encaja en este espacio libre') };
    })
    .sort((a, b) => b.score - a.score);

  for (const day of days) {
    const busy = byDay[day]
      .map((x) => [hhmmToMin(x.hora_inicio) || 0, hhmmToMin(x.hora_fin) || (hhmmToMin(x.hora_inicio) || 0) + (x.duracion_min || 60)])
      .sort((a, b) => a[0] - b[0]);
    let usedReasons = 0;
    for (let h = Math.max(DAY_START_H, 8); h < Math.min(DAY_END_H, 21); h++) {
      const startMin = h * 60;
      const endMin = startMin + 60;
      const overlaps = busy.some(([s, e]) => s < endMin && e > startMin);
      if (overlaps || usedReasons >= 2) continue;
      const cand = scored.find((s) => (s.task.duracion_min || 30) <= 60 && !Object.values(out).some((o) => o.task.id === s.task.id));
      if (cand) {
        out[`${day}|${String(h).padStart(2, '0')}:00`] = cand;
        usedReasons++;
      }
    }
  }
  return out;
}

export function goToday() {
  weekStart = startOfWeek(todayISO());
}
