/**
 * Planificación Personal — utils.js
 * Utilidades compartidas: bus de eventos, escape de HTML, IDs, fechas,
 * enlaces de contacto (tel/WhatsApp/mailto) y misceláneos.
 * Sin dependencias externas. ES Module.
 */

/* ---------------- Bus de eventos global ---------------- */
export const bus = new EventTarget();
export const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));
export const on = (name, fn) => {
  bus.addEventListener(name, fn);
  return () => bus.removeEventListener(name, fn);
};

/* ---------------- Locale compartido ---------------- */
export let LOCALE = 'es';
export function setLocale(l) { LOCALE = l === 'en' ? 'en' : 'es'; }

/* ---------------- Escape y texto ---------------- */
export function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Sanitiza contra inyección de fórmulas de hojas de cálculo (= + - @ iniciales). */
export function csvSafe(v) {
  const s = String(v ?? '');
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

/* ---------------- IDs y tiempos ---------------- */
export function uuid(prefix = '') {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${prefix}${Date.now().toString(36)}${hex.slice(0, 10)}`;
}

export function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function debounce(fn, ms = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/* ---------------- Fechas (ISO local YYYY-MM-DD) ---------------- */
export function dateToISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayISO() {
  return dateToISO(new Date());
}

export function isoToDate(iso) {
  if (!iso) return null;
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function addDays(iso, n) {
  const d = isoToDate(iso);
  if (!d) return iso;
  d.setDate(d.getDate() + n);
  return dateToISO(d);
}

/** Lunes como primer día de la semana (coincide con la planificación en papel). */
export function startOfWeek(iso) {
  const d = isoToDate(iso);
  if (!d) return iso;
  const dow = (d.getDay() + 6) % 7; // lunes = 0 … domingo = 6
  d.setDate(d.getDate() - dow);
  return dateToISO(d);
}

export function diffDays(a, b) {
  const da = isoToDate(a);
  const dbb = isoToDate(b);
  if (!da || !dbb) return null;
  return Math.round((da - dbb) / 86400000);
}

export function fmtDate(iso, opts) {
  const d = isoToDate(iso);
  if (!d) return '';
  return d.toLocaleDateString(LOCALE, opts || { day: 'numeric', month: 'short' });
}

export function fmtDateLong(iso) {
  return fmtDate(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function fmtTime(hhmm) {
  if (!hhmm) return '';
  return String(hhmm).slice(0, 5);
}

export function hhmmToMin(hhmm) {
  if (!hhmm) return null;
  const [h, m] = String(hhmm).split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

export function minToHhmm(min) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/* ---------------- Contacto (tel / WhatsApp / mailto) ---------------- */
export function normalizePhone(tel) {
  return String(tel || '').replace(/[^\d+]/g, '');
}

export function telLink(tel) {
  const p = normalizePhone(tel);
  return p ? `tel:${p}` : '';
}

export function waLink(tel, text = '') {
  const p = normalizePhone(tel).replace(/^\+/, '');
  const t = text ? `?text=${encodeURIComponent(text)}` : '';
  return p ? `https://wa.me/${p}${t}` : '';
}

export function mailtoLink(email, subject = '', body = '') {
  const e = String(email || '').trim();
  if (!e) return '';
  const q = [];
  if (subject) q.push(`subject=${encodeURIComponent(subject)}`);
  if (body) q.push(`body=${encodeURIComponent(body)}`);
  return `mailto:${e}${q.length ? '?' + q.join('&') : ''}`;
}

/* ---------------- Descargas ---------------- */
export function downloadFile(name, content, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* ---------------- HTML helpers ---------------- */
/**
 * Tagged template para construir HTML legible.
 * CONVENCIÓN (importante):
 *  - Las cadenas interpoladas se insertan TAL CUAL (permiten componer bloques).
 *  - TODO dato de usuario debe escaparse explícitamente con esc() antes de
 *    interpolarse (así lo hacen todas las vistas).
 *  - Los números se convierten a texto.
 */
export function html(strings, ...values) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < values.length) {
      const v = values[i];
      out += v === null || v === undefined ? '' : String(v);
    }
  });
  return out;
}
/** Marcador de compatibilidad: indica que una cadena es HTML intencional. */
export const raw = (s) => String(s);

/* ---------------- Varias ---------------- */
export function sortTasks(tasks) {
  return [...tasks].sort((a, b) => {
    if (a.fecha !== b.fecha) return (a.fecha || '9999') < (b.fecha || '9999') ? -1 : 1;
    return (a.hora_inicio || '99:99') < (b.hora_inicio || '99:99') ? -1 : 1;
  });
}

export function priorityRank(p) {
  return p === 'alta' ? 3 : p === 'media' ? 2 : 1;
}

export function safeJsonParse(s, def) {
  try { return JSON.parse(s); } catch { return def; }
}
