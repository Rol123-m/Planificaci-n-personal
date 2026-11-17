/**
 * Planificación Personal — db.js
 * Capa de persistencia local offline-first con IndexedDB.
 * Todas las operaciones devuelven Promesas.
 *
 * Almacenes:
 *  - meta        {clave, valor}            → lastSync, userId, nombre, email, theme, demo, etc.
 *  - roles/tareas/metas/recordatorios/etiquetas  → entidades sincronizadas (keyPath: id)
 *  - config      {clave, valor}            → configuración por usuario (sincronizada)
 *  - outbox      {op_id}                   → cola de operaciones pendientes de subir
 *  - history     autoIncrement             → auditoría ligera local
 *  - notifs      autoIncrement             → bandeja de notificaciones locales
 *  - conflicts   autoIncrement             → conflictos sin resolver
 */

const DB_NAME = 'planpersonal';
const DB_VERSION = 1;

import { uuid } from './utils.js';

export const ENTITY_STORES = ['roles', 'tareas', 'metas', 'recordatorios', 'etiquetas'];

let _db = null;

export function open() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // meta
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'clave' });
      }
      // entidades (keyPath id, índice por updated_at para pulls incrementales)
      for (const s of ENTITY_STORES) {
        if (!db.objectStoreNames.contains(s)) {
          const os = db.createObjectStore(s, { keyPath: 'id' });
          os.createIndex('updated_at', 'updated_at', { unique: false });
        }
      }
      if (!db.objectStoreNames.contains('config')) {
        db.createObjectStore('config', { keyPath: 'clave' });
      }
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'op_id' });
      if (!db.objectStoreNames.contains('history')) db.createObjectStore('history', { autoIncrement: true });
      if (!db.objectStoreNames.contains('notifs')) db.createObjectStore('notifs', { autoIncrement: true });
      if (!db.objectStoreNames.contains('conflicts')) db.createObjectStore('conflicts', { keyPath: 'id' });
    };
    req.onsuccess = () => {
      _db = req.result;
      _db.onversionchange = () => { _db.close(); _db = null; };
      resolve(_db);
    };
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode = 'readonly') {
  return open().then((db) => db.transaction(store, mode).objectStore(store));
}

function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/* ---------------- CRUD genérico ---------------- */

export function get(store, key) {
  return tx(store).then((os) => wrap(os.get(key)));
}

export function getAll(store) {
  return tx(store).then((os) => wrap(os.getAll()));
}

export function put(store, value) {
  return tx(store, 'readwrite').then((os) => wrap(os.put(value)));
}

export function add(store, value) {
  return tx(store, 'readwrite').then((os) => wrap(os.add(value)));
}

export function del(store, key) {
  return tx(store, 'readwrite').then((os) => wrap(os.delete(key)));
}

export function clear(store) {
  return tx(store, 'readwrite').then((os) => wrap(os.clear()));
}

export function count(store) {
  return tx(store).then((os) => wrap(os.count()));
}

/** Inserta/actualiza muchas filas de una entidad en una única transacción. */
export function upsertAll(store, rows) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, 'readwrite');
        const os = t.objectStore(store);
        for (const r of rows) os.put(r);
        t.oncomplete = () => resolve(rows.length);
        t.onerror = () => reject(t.error);
      })
  );
}

/** Borra muchas claves de una entidad en una única transacción. */
export function deleteMany(store, keys) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, 'readwrite');
        const os = t.objectStore(store);
        for (const k of keys) os.delete(k);
        t.oncomplete = () => resolve(keys.length);
        t.onerror = () => reject(t.error);
      })
  );
}

/* ---------------- Meta (preferencias locales) ---------------- */

export function getMeta(key, def = null) {
  return get('meta', key).then((row) => (row ? row.valor : def));
}

export function setMeta(key, valor) {
  return put('meta', { clave: key, valor });
}

/* ---------------- Cola de sincronización (outbox) ---------------- */

export function outboxAll() {
  return getAll('outbox').then((list) => list.sort((a, b) => (a.seq || 0) - (b.seq || 0)));
}

export function outboxCount() {
  return count('outbox');
}

/**
 * Añade una operación a la cola.  entity: roles|tareas|metas|recordatorios|etiquetas|config
 * action: create|update|delete|purge
 */
export async function enqueueOp(entity, action, data, baseTs) {
  const op = {
    op_id: uuid('op_'),
    entity,
    action,
    data,
    base_ts: baseTs || '',
    seq: Date.now() * 1000 + Math.floor(Math.random() * 999),
    created: new Date().toISOString()
  };
  await put('outbox', op);
  const n = await outboxCount();
  return { count: n, op };
}

export function removeOp(opId) {
  return del('outbox', opId);
}

/* ---------------- Vaciar todo (logout / borrar datos locales) ---------------- */

export async function wipeAll() {
  for (const s of [...ENTITY_STORES, 'config', 'outbox', 'history', 'notifs', 'conflicts', 'meta']) {
    await clear(s);
  }
}
