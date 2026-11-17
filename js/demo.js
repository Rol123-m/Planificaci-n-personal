/**
 * Planificación Personal — demo.js
 * Modo demo sin cuenta: siembra datos de ejemplo (tomados de la planificación
 * en papel del autor) en IndexedDB, sin sincronización. Sirve para probar la
 * app antes de registrarse.
 */

import * as db from './db.js';
import * as api from './api.js';
import { uuid, todayISO, startOfWeek, addDays, nowIso } from './utils.js';
import { emit } from './utils.js';

const DEMO_META = { clave: 'demo', valor: 'si' };

export async function isDemoMode() {
  const v = await db.getMeta('demo', 'no');
  return v === 'si';
}

/** Siembra datos de ejemplo (roles/tareas/metas/etiquetas) en IndexedDB. */
export async function seedDemoData() {
  const monday = startOfWeek(todayISO());
  const D = (n) => addDays(monday, n); // 0=lunes … 6=domingo
  const ts = nowIso();

  const roles = [
    { id: 'r_cristiano', nombre: 'Cristiano', color: '#16a34a', icono: '🙏', descripcion: 'Vida devocional', orden: 1 },
    { id: 'r_esposo', nombre: 'Esposo / Padre', color: '#e11d48', icono: '❤️', descripcion: 'Familia', orden: 2 },
    { id: 'r_estudiante', nombre: 'Estudiante', color: '#4f46e5', icono: '📚', descripcion: 'NOBTS · Grace · clases', orden: 3 },
    { id: 'r_pastor', nombre: 'Pastor', color: '#7c3aed', icono: '⛪', descripcion: 'Iglesia local', orden: 4 },
    { id: 'r_casa', nombre: 'Casa', color: '#d97706', icono: '🏠', descripcion: 'Hogar', orden: 5 },
    { id: 'r_vps', nombre: 'Ministerio VPS', color: '#0891b2', icono: '🌐', descripcion: 'Vivos para Servir · seminario', orden: 6 },
    { id: 'r_cuidado', nombre: 'Cuidado personal', color: '#0d9488', icono: '🌿', descripcion: 'Afilar el hacha', orden: 7 },
    { id: 'r_otras', nombre: 'Otras', color: '#64748b', icono: '📌', descripcion: '', orden: 8 }
  ].map((r, i) => ({ ...r, creado: ts, updated_at: ts, deleted: 0, version: 1 }));

  const T = (rol_id, titulo, o = {}) => ({
    id: uuid('t_'),
    rol_id,
    titulo,
    descripcion: o.desc || '',
    fecha: o.fecha || '',
    hora_inicio: o.hi || '',
    hora_fin: o.hf || '',
    duracion_min: o.dur || 30,
    prioridad: o.pr || 'media',
    estado: 'pendiente',
    recordatorio: o.rec || 'no',
    recordatorio_offset_min: o.off || 10,
    telefono: o.tel || '',
    email: o.email || '',
    etiquetas: o.et || '',
    recurring: o.rep || 'none',
    creado: ts,
    updated_at: ts,
    deleted: 0,
    version: 1
  });

  const tareas = [
    // Cristiano
    T('r_cristiano', 'Orar y leer la Biblia', { hi: '08:00', hf: '09:00', dur: 60, pr: 'alta', rec: 'si', rep: 'daily', et: 'devocional' }),
    T('r_cristiano', 'Preparar estudio del martes', { fecha: D(0), hi: '20:00', dur: 60, pr: 'media' }),
    // Esposo / familia
    T('r_esposo', 'Tiempo de calidad en familia', { fecha: D(5), hi: '16:00', hf: '18:00', dur: 120, pr: 'alta', rec: 'si', rep: 'weekly', et: 'familia' }),
    T('r_esposo', 'Tiempo de calidad con mi esposa', { dur: 60, pr: 'alta', et: 'familia' }),
    // Estudiante
    T('r_estudiante', 'Clase de historia', { fecha: D(0), hi: '20:00', dur: 60, pr: 'media', rep: 'weekly', rec: 'si', et: 'clase' }),
    T('r_estudiante', 'Clase de griego', { fecha: D(4), hi: '20:00', dur: 60, pr: 'media', rep: 'weekly', rec: 'si', et: 'clase' }),
    T('r_estudiante', 'Tareas de NOBTS', { fecha: D(2), dur: 90, pr: 'media', et: 'estudio' }),
    T('r_estudiante', 'Tareas de Grace', { fecha: D(3), dur: 90, pr: 'media', et: 'estudio' }),
    T('r_estudiante', 'Matricular en NOBTS', { fecha: D(3), hi: '14:00', dur: 10, pr: 'alta', rec: 'si', et: 'trámite' }),
    T('r_estudiante', 'Leer Introducción a 1 Pedro', { fecha: D(2), hi: '14:00', dur: 120, pr: 'media' }),
    T('r_estudiante', 'Preparar taller de música', { fecha: D(3), hi: '16:00', dur: 90, pr: 'media' }),
    T('r_estudiante', 'Preparar sermón del domingo', { fecha: D(4), hi: '09:00', hf: '11:00', dur: 120, pr: 'alta', rec: 'si', rep: 'weekly', et: 'predicación' }),
    T('r_estudiante', 'Revisión del sermón', { fecha: D(5), hi: '21:00', dur: 180, pr: 'alta', et: 'predicación' }),
    T('r_estudiante', 'Griego I (STBCOr)', { hi: '06:00', hf: '08:00', dur: 120, pr: 'alta', rec: 'si', rep: 'daily', et: 'seminario' }),
    // Pastor
    T('r_pastor', 'Culto de oración y estudio bíblico', { fecha: D(1), hi: '16:30', dur: 90, pr: 'alta', rep: 'weekly', rec: 'si' }),
    T('r_pastor', 'Reunión con el administrador', { fecha: D(1), hi: '15:30', dur: 60, pr: 'media' }),
    T('r_pastor', 'Tiempo de matrimonios', { fecha: D(2), hi: '17:00', dur: 120, pr: 'media', rep: 'weekly', rec: 'si' }),
    T('r_pastor', 'Vigilia de juveniles', { fecha: D(4), hi: '20:30', dur: 120, pr: 'media', rep: 'weekly', rec: 'si' }),
    T('r_pastor', 'Miniconfraternidad', { fecha: D(5), hi: '09:00', dur: 120, pr: 'media', rep: 'weekly' }),
    T('r_pastor', 'Taller de música', { fecha: D(5), hi: '16:30', dur: 90, pr: 'media', rep: 'weekly', rec: 'si' }),
    T('r_pastor', 'EBD', { fecha: D(6), hi: '09:30', dur: 90, pr: 'alta', rep: 'weekly', rec: 'si' }),
    T('r_pastor', 'Reunión con el equipo pastoral', { fecha: D(6), hi: '11:30', dur: 30, pr: 'media', rep: 'weekly' }),
    // Casa
    T('r_casa', 'Organizar los regueros', { hi: '17:00', dur: 30, pr: 'baja', rep: 'daily' }),
    T('r_casa', 'Cosas de la casa', { fecha: D(3), hi: '16:00', dur: 60, pr: 'baja' }),
    // Ministerio VPS
    T('r_vps', 'Curso de griego y hebreo', { fecha: D(1), hi: '10:00', hf: '11:00', dur: 60, pr: 'media', rep: 'weekly', rec: 'si', et: 'seminario' }),
    T('r_vps', 'Grabar hebreo', { fecha: D(6), hi: '10:00', dur: 60, pr: 'media', et: 'seminario' }),
    // Acciones de contacto de ejemplo (datos ficticios de prueba)
    T('r_pastor', 'Escribir a Abdiel', { fecha: D(6), hi: '10:00', dur: 15, pr: 'alta', rec: 'si', tel: '+5350000000', et: 'contacto', desc: 'Ejemplo: número ficticio; cámbialo por el real.' }),
    T('r_pastor', 'Escribir a Jarley (listas de discipulado)', { fecha: D(1), hi: '15:00', dur: 15, pr: 'media', rec: 'si', email: 'jarley@ejemplo.com', et: 'contacto', desc: 'Ejemplo: email ficticio de prueba.' }),
    T('r_pastor', 'Escribir a Héctor y a Joel', { fecha: D(6), hi: '10:20', dur: 20, pr: 'media', et: 'contacto' }),
    // Cuidado personal
    T('r_cuidado', 'Afeitarme', { fecha: D(1), hi: '14:00', dur: 15, pr: 'baja', rep: 'weekly' }),
    T('r_cuidado', 'Comprar espejuelos', { dur: 45, pr: 'alta', et: 'salud' })
  ].map((t) => ({ ...t }));

  const metas = [
    ['Montaje del sitio informativo del seminario', 'r_vps', 40],
    ['Montaje de las asignaturas del seminario', 'r_vps', 20],
    ['Comprar dominio y revisar hosting', 'r_vps', 10],
    ['Crear biblioteca y plataforma para los IB', 'r_vps', 0],
    ['Base de datos manejable para secretaría', 'r_vps', 0],
    ['Año educativo 2027', 'r_vps', 15],
    ['Planificar congreso de lenguas bíblicas', 'r_vps', 5],
    ['Terminar el libro de texto de griego y hebreo', 'r_vps', 60],
    ['Diseñar visión y misión de la iglesia', 'r_pastor', 30],
    ['Proyecto de discipulado progresivo', 'r_pastor', 25],
    ['Proyecto EBD', 'r_pastor', 10],
    ['Tiempo de calidad con mi esposa (plan mensual)', 'r_esposo', 0]
  ].map(([titulo, rol_id, progreso], i) => ({
    id: uuid('m_'),
    rol_id,
    titulo,
    descripcion: '',
    fecha_objetivo: '',
    progreso,
    estado: progreso >= 100 ? 'hecha' : 'en_curso',
    creado: ts,
    updated_at: ts,
    deleted: 0,
    version: 1
  }));

  const etiquetas = [
    ['devocional', '#16a34a'], ['familia', '#e11d48'], ['clase', '#4f46e5'],
    ['estudio', '#7c3aed'], ['predicación', '#d97706'], ['seminario', '#0891b2'],
    ['contacto', '#0d9488'], ['trámite', '#64748b'], ['salud', '#22c55e']
  ].map(([nombre, color]) => ({ id: uuid('e_'), nombre, color, creado: ts, updated_at: ts, deleted: 0, version: 1 }));

  await db.upsertAll('roles', roles);
  await db.upsertAll('tareas', tareas);
  await db.upsertAll('metas', metas);
  await db.upsertAll('etiquetas', etiquetas);
}

/** Activa el modo demo (sin backend, sin sincronización). */
export async function startDemo() {
  await seedDemoData();
  await db.setMeta('demo', 'si');
  await db.setMeta('demo_started', new Date().toISOString());
  api.setDemo(true);
  emit('pp:demo-on', {});
}
