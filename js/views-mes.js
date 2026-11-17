/**
 * Planificación Personal — views-mes.js
 * Calendario mensual: visión general de las tareas, incluidas las que están
 * más allá de la semana actual. Clic en un día → detalle de tareas del día.
 */

import * as db from './db.js';
import { t } from './i18n.js';
import { esc, html, raw, todayISO, startOfWeek, addDays, isoToDate, fmtDateLong } from './utils.js';
import { taskRowHTML, wireTaskList, getRoles, viewTitle, openTaskEditor, rerenderCurrentView } from './ui.js';
import { openModal, toast } from './ui.js';

const MONTH_NAMES = {
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
};
const DAY_HEADERS = {
  es: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
};

let curDate = todayISO();

export async function renderMes(root) {
  const roles = await getRoles();
  const roleMap = new Map(roles.map((r) => [r.id, r]));
  const all = (await db.getAll('tareas')).filter((x) => !x.deleted);
  const today = todayISO();

  const d = isoToDate(curDate);
  const year = d.getFullYear();
  const month = d.getMonth();
  const firstOfMonth = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lastOfMonth = `${year}-${String(month + 1).padStart(2, '0')}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, '0')}`;
  const gridStart = startOfWeek(firstOfMonth);

  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const names = DAY_HEADERS[(document.documentElement.lang || 'es') === 'en' ? 'en' : 'es'] || DAY_HEADERS.es;

  const headerHTML = names.map((n) => `<span>${n}</span>`).join('');

  const cellsHTML = cells
    .map((day) => {
      const inMonth = isoToDate(day).getMonth() === month;
      const tasks = all
        .filter((x) => x.fecha === day)
        .sort((a, b) => (a.hora_inicio || '').localeCompare(b.hora_inicio || ''));
      const show = tasks.slice(0, 3);
      const dots = show
        .map((x) => {
          const color = roleMap.get(x.rol_id)?.color || 'var(--primary)';
          return `<span class="md-task" style="background:${esc(color)}" title="${esc(x.titulo)}">${esc(x.titulo)}</span>`;
        })
        .join('');
      const more = tasks.length > 3 ? `<span class="md-more">+${tasks.length - 3} ${t('mes.more')}</span>` : '';
      return `<div class="month-day${inMonth ? '' : ' out'}${day === today ? ' today' : ''}" data-day="${day}"
        role="button" tabindex="0" aria-label="${esc(day)}">
        <span class="md-num">${day.slice(8)}</span>
        <div class="md-dots">${dots}${more}</div>
      </div>`;
    })
    .join('');

  const title = `${MONTH_NAMES[document.documentElement.lang === 'en' ? 'en' : 'es']?.[month] || month + 1} ${year}`;

  root.innerHTML = html`
    ${raw(viewTitle(`${t('mes.title')} — ${title}`, `
      <button class="btn ghost" id="m-prev" aria-label="${t('common.prev')}">‹</button>
      <button class="btn ghost" id="m-today">${t('week.today')}</button>
      <button class="btn ghost" id="m-next" aria-label="${t('common.next')}">›</button>
      <button class="btn primary" id="m-add">＋ ${t('task.new')}</button>
      <button class="btn ghost" id="m-print">🖨 ${t('common.print')}</button>
      <button class="btn ghost" id="m-ics">⤓ .ics</button>
    `))}
    <div class="month-header">${raw(headerHTML)}</div>
    <div class="month-grid">${raw(cellsHTML)}</div>`;

  root.querySelector('#m-prev').onclick = () => {
    const dd = isoToDate(curDate);
    dd.setMonth(dd.getMonth() - 1);
    curDate = dd.toISOString().slice(0, 10);
    rerenderCurrentView();
  };
  root.querySelector('#m-next').onclick = () => {
    const dd = isoToDate(curDate);
    dd.setMonth(dd.getMonth() + 1);
    curDate = dd.toISOString().slice(0, 10);
    rerenderCurrentView();
  };
  root.querySelector('#m-today').onclick = () => { curDate = todayISO(); rerenderCurrentView(); };
  root.querySelector('#m-add').onclick = () => openTaskEditor(null, { defaultFecha: today });
  root.querySelector('#m-print').onclick = async () => {
    const ex = await import('./exporters.js');
    ex.openPrintModal(firstOfMonth, lastOfMonth);
  };
  root.querySelector('#m-ics').onclick = async () => {
    const ex = await import('./exporters.js');
    ex.exportICS(all.filter((x) => x.fecha >= firstOfMonth && x.fecha <= lastOfMonth), `${t('mes.title')}_${firstOfMonth.slice(0, 7)}`);
  };

  root.querySelectorAll('.month-day').forEach((cell) => {
    const open = () => openDayModal(cell.getAttribute('data-day'), roleMap);
    cell.onclick = open;
    cell.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
  });
}

/** Modal con el detalle de las tareas de un día concreto. */
export async function openDayModal(day, roleMap) {
  const map = roleMap || new Map((await getRoles()).map((r) => [r.id, r]));
  const tasks = (await db.getAll('tareas'))
    .filter((x) => !x.deleted && x.fecha === day)
    .sort((a, b) => (a.hora_inicio || '').localeCompare(b.hora_inicio || ''));

  const m = openModal(html`
    <div class="modal-head"><h2>📅 ${fmtDateLong(day)}</h2></div>
    <div class="modal-body" id="day-tasks">
      ${tasks.length
        ? raw(tasks.map((x) => taskRowHTML(x, map.get(x.rol_id))).join(''))
        : `<p class="muted">${t('common.none')}</p>`}
    </div>
    <div class="modal-foot">
      <button class="btn ghost" id="dm-ics">⤓ .ics</button>
      <button class="btn ghost" id="dm-print">🖨 ${t('common.print')}</button>
      <button class="btn primary" id="dm-add">＋ ${t('task.new')}</button>
    </div>`);

  wireTaskList(m.el, { rerender: () => { m.close(); rerenderCurrentView(); } });
  m.el.querySelector('#dm-add').onclick = () => { m.close(); openTaskEditor(null, { defaultFecha: day }); };
  m.el.querySelector('#dm-ics').onclick = async () => {
    const ex = await import('./exporters.js');
    ex.exportICS(tasks, day);
    toast('ICS ✓', 'success', 1500);
  };
  m.el.querySelector('#dm-print').onclick = async () => {
    const ex = await import('./exporters.js');
    m.close();
    ex.openPrintModal(day, day);
  };
}
