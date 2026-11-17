/**
 * Planificación Personal — notify.js
 * Recordatorios y notificaciones:
 *  - Crea/actualiza filas de "recordatorios" a partir de tareas con campanita.
 *  - Revisa cada 30 s los recordatorios vencidos y muestra notificaciones locales
 *    (Service Worker), con acciones de contacto cuando la tarea tiene teléfono/email.
 *  - Registra Periodic Background Sync cuando el navegador lo soporta (Chrome/Edge).
 *  - Los recordatorios por email los envía el backend (Apps Script, MailApp).
 */

import * as db from './db.js';
import { applyLocal } from './sync.js';
import { uuid, nowIso, hhmmToMin, addDays, emit, esc } from './utils.js';
import { t } from './i18n.js';

/* ------------------------------------------------------------------ */
/* Permisos                                                            */
/* ------------------------------------------------------------------ */

export async function requestPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  try {
    const res = await Notification.requestPermission();
    return res;
  } catch (e) {
    return 'denied';
  }
}

export function permissionState() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

/** Registra Periodic Background Sync (si existe) para revisar recordatorios en segundo plano. */
export async function registerPeriodicSync() {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg && 'periodicSync' in reg) {
      const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
      if (status.state === 'granted') {
        await reg.periodicSync.register('pp-reminders', { minInterval: 15 * 60 * 1000 });
      }
    }
  } catch (e) {
    /* No soportado: las notificaciones locales siguen funcionando con la app abierta. */
  }
}

/* ------------------------------------------------------------------ */
/* Recordatorios derivados de tareas                                   */
/* ------------------------------------------------------------------ */

function reminderDateTime(fecha, hhmm, offsetMin) {
  if (!fecha || !hhmm) return '';
  const mins = (hhmmToMin(hhmm) ?? 0) - (Number(offsetMin) || 0);
  const day = mins < 0 ? addDays(fecha, -1) : fecha;
  const m = ((mins % 1440) + 1440) % 1440;
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `${day}T${hh}:${mm}`;
}

/**
 * Sincroniza los recordatorios de una tarea: borra los pendientes anteriores
 * y crea uno nuevo si la campanita está activa y la tarea tiene fecha y hora.
 */
export async function updateRemindersForTask(task) {
  const all = await db.getAll('recordatorios');
  const prev = all.filter((r) => r.tarea_id === task.id && r.enviado !== 'si' && !r.deleted);
  for (const r of prev) {
    await applyLocal('recordatorios', 'delete', { id: r.id }, { flushNow: false });
  }
  if (task.recordatorio !== 'si' || !task.fecha || !task.hora_inicio || task.estado === 'hecha' || task.deleted) return;

  const fechaHora = reminderDateTime(task.fecha, task.hora_inicio, task.recordatorio_offset_min);
  if (!fechaHora) return;
  await applyLocal('recordatorios', 'create', {
    id: uuid('rec_'),
    tarea_id: task.id,
    fecha_hora: fechaHora,
    canal: 'local',
    enviado: 'no',
    titulo: task.titulo,
    telefono: task.telefono || '',
    email: task.email || ''
  }, { flushNow: false });
}

/* ------------------------------------------------------------------ */
/* Comprobación periódica y notificaciones locales                     */
/* ------------------------------------------------------------------ */

let timer = null;

function taskUrl(id) {
  return `./index.html?view=hoy&task=${encodeURIComponent(id)}`;
}

async function fireNotification(rec) {
  const reg = (await navigator.serviceWorker?.getRegistration()) || null;
  const body = `${t('notify.reminderBody')}: ${rec.titulo || ''}`;
  const options = {
    body,
    tag: rec.id,
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    data: { url: taskUrl(rec.tarea_id), taskId: rec.tarea_id, phone: rec.telefono || '', email: rec.email || '' }
  };
  try {
    if (reg) await reg.showNotification(t('notify.title'), options);
    else if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(t('notify.title'), options);
    }
  } catch (e) {
    /* ignorar */
  }

  // Bandeja interna de notificaciones
  await db.add('notifs', {
    key: rec.id,
    ts: nowIso(),
    title: t('notify.title'),
    body,
    tarea_id: rec.tarea_id,
    telefono: rec.telefono || '',
    email: rec.email || '',
    read: 0
  });
  emit('pp:notifs', {});

  // Marca el recordatorio como enviado (se sincroniza al backend)
  const full = await db.get('recordatorios', rec.id);
  if (full) await applyLocal('recordatorios', 'update', { id: rec.id, enviado: 'si' }, { flushNow: false });
}

export async function checkDueReminders() {
  if (Notification && Notification.permission !== 'granted') {
    // Aunque no haya permiso, marcamos vencidos para no acumular.
    return;
  }
  const all = await db.getAll('recordatorios');
  const notifs = await db.getAll('notifs');
  const shown = new Set(notifs.map((n) => n.key));
  const now = Date.now();

  for (const r of all) {
    if (!r || r.deleted || r.enviado === 'si') continue;
    const tt = new Date(r.fecha_hora).getTime();
    if (!tt || Number.isNaN(tt)) continue;
    if (tt <= now && now - tt < 12 * 60 * 60 * 1000 && !shown.has(r.id)) {
      await fireNotification(r);
    }
  }
}

export function startReminderEngine() {
  if (timer) clearInterval(timer);
  timer = setInterval(() => checkDueReminders().catch(() => {}), 30000);
  checkDueReminders().catch(() => {});
}

/* ------------------------------------------------------------------ */
/* Bandeja de notificaciones                                           */
/* ------------------------------------------------------------------ */

export async function listNotifications() {
  const list = await db.getAll('notifs');
  return list.sort((a, b) => (a.ts < b.ts ? 1 : -1));
}

export async function clearNotifications() {
  await db.clear('notifs');
  emit('pp:notifs', {});
}

export async function unreadCount() {
  const list = await db.getAll('notifs');
  return list.filter((n) => !n.read).length;
}
