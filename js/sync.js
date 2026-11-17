/**
 * Planificación Personal — sync.js
 * Motor offline-first: cola de operaciones (outbox), push/pull con Apps Script,
 * detección y resolución de conflictos (last-write-wins con base_ts + revisión manual).
 *
 * Flujo de escritura offline:
 *   1) applyLocal()  → escribe inmediatamente en IndexedDB (la UI nunca espera red).
 *   2) enqueueOp()   → guarda la operación en la cola.
 *   3) flush()       → al volver la conexión, envía pushOps en lotes y descarga cambios.
 *
 * Conflictos: si el servidor tiene una fila cuyo updated_at es posterior al base_ts
 * de la operación, NO aplica el cambio y devuelve { status:'conflict', server_row }.
 * El usuario decide en la UI: conservar la mía / la del servidor / ambas.
 */

import * as db from './db.js';
import * as api from './api.js';
import { uuid, nowIso, emit, on } from './utils.js';
import { t } from './i18n.js';

export const ID_PREFIX = {
  roles: 'r_', tareas: 't_', metas: 'm_', recordatorios: 'rec_', etiquetas: 'e_', config: ''
};

export const state = {
  status: 'offline',        // online | syncing | offline | pending | demo
  pending: 0,
  lastSync: 0,
  flushing: false,
  timer: null
};

/* ------------------------------------------------------------------ */
/* Estado y avisos a la UI                                             */
/* ------------------------------------------------------------------ */

function notify() {
  const online = navigator.onLine && !api.isDemo();
  if (api.isDemo()) state.status = 'demo';
  else if (state.flushing) state.status = 'syncing';
  else if (!navigator.onLine) state.status = 'offline';
  else if (state.pending > 0) state.status = 'pending';
  else if (!api.isConfigured()) state.status = 'offline';
  else state.status = 'online';

  emit('pp:sync', {
    status: state.status,
    pending: state.pending,
    lastSync: state.lastSync
  });
}

export async function refreshPending() {
  state.pending = await db.outboxCount();
  notify();
}

/* ------------------------------------------------------------------ */
/* Escritura local + encolado                                          */
/* ------------------------------------------------------------------ */

/**
 * Aplica un cambio localmente (IndexedDB) y encola la operación para el backend.
 * action: create | update | delete | purge
 * Devuelve la fila resultante.
 */
export async function applyLocal(entity, action, data, { baseTs = null, skipQueue = false, flushNow = true } = {}) {
  const store = entity;
  let base = baseTs;

  if (action === 'purge') {
    await db.del(store, data.id);
    if (!skipQueue) await db.enqueueOp(entity, 'purge', { id: data.id }, base || '');
    await refreshPending();
    if (flushNow) scheduleFlush(1200);
    return null;
  }

  let row;
  if (action === 'create') {
    row = {
      id: data.id || uuid(ID_PREFIX[entity] || ''),
      ...data,
      creado: data.creado || nowIso(),
      updated_at: nowIso(),
      deleted: data.deleted ?? 0,
      version: data.version || 1
    };
    base = base || '';
    await db.put(store, row);
  } else if (action === 'update') {
    const prev = await db.get(store, data.id);
    if (!prev) {
      // No existía localmente: tratar como creación completa.
      return applyLocal(entity, 'create', data, { skipQueue, flushNow });
    }
    base = base ?? prev.updated_at;
    row = { ...prev, ...data, id: prev.id, creado: prev.creado, updated_at: nowIso(), version: (prev.version || 1) + 1 };
    await db.put(store, row);
  } else if (action === 'delete') {
    const prev = await db.get(store, data.id);
    base = base ?? prev?.updated_at ?? '';
    row = prev
      ? { ...prev, deleted: 1, updated_at: nowIso(), version: (prev.version || 1) + 1 }
      : { id: data.id, deleted: 1, updated_at: nowIso(), version: 1 };
    await db.put(store, row);
  } else {
    throw new Error('Acción desconocida: ' + action);
  }

  // Auditoría ligera local
  await db.add('history', {
    ts: nowIso(),
    entity,
    id: row.id,
    action,
    titulo: row.titulo || row.nombre || row.clave || '',
    fields: Object.keys(data || {}).join(',')
  });

  if (!skipQueue) {
    await db.enqueueOp(entity, action, row, base);
    await refreshPending();
    if (flushNow) scheduleFlush(1800);
  }
  emit('pp:data', { entity, id: row.id });
  return row;
}

/* ------------------------------------------------------------------ */
/* Push (outbox → servidor) y Pull (servidor → IndexedDB)              */
/* ------------------------------------------------------------------ */

let flushTimer = null;
export function scheduleFlush(delay = 1500) {
  if (api.isDemo() || !api.isConfigured()) return;
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => flush().catch(() => {}), delay);
}

export async function flush() {
  if (state.flushing || api.isDemo() || !api.isConfigured()) return notify();
  if (!navigator.onLine) return notify();
  const ops = await db.outboxAll();
  if (!ops.length) return notify();

  state.flushing = true;
  notify();
  try {
    const BATCH = 100;
    let hadConflict = false;
    let authError = false;
    for (let i = 0; i < ops.length; i += BATCH) {
      const batch = ops.slice(i, i + BATCH);
      const res = await api.call('pushOps', {
        ops: batch.map((o) => ({
          op_id: o.op_id,
          entity: o.entity,
          action: o.action,
          base_ts: o.base_ts || '',
          data: o.data
        }))
      });
      const results = res.results || [];
      for (const r of results) {
        if (r.status === 'ok') {
          await db.removeOp(r.op_id);
        } else if (r.status === 'conflict') {
          hadConflict = true;
          await db.removeOp(r.op_id);
          await db.put('conflicts', {
            id: uuid('cf_'),
            entity: r.entity,
            local: batch.find((o) => o.op_id === r.op_id)?.data || {},
            server: r.server_row,
            ts: nowIso()
          });
        } else if (r.status === 'auth') {
          authError = true;
        }
        // status 'error' → la op permanece en el outbox para reintentar
      }
    }
    await refreshPending();
    if (state.pending === 0) emit('pp:toast', { type: 'success', msg: t('sync.pushed') });
    if (hadConflict) emit('pp:conflicts', {});
    if (authError) emit('pp:auth-expired', {});
    await pull();
  } catch (err) {
    if (err && (err.code === 'AUTH' || err.code === 'SESSION')) emit('pp:auth-expired', {});
    // error de red → se reintenta en el próximo ciclo; las ops siguen en el outbox
  } finally {
    state.flushing = false;
    await refreshPending();
  }
}

/**
 * Descarga del servidor las filas con updated_at > lastSync y las combina.
 * No sobreescribe filas con operaciones pendientes en el outbox (ganan las locales).
 */
export async function pull(since) {
  if (api.isDemo() || !api.isConfigured() || !navigator.onLine) return notify();
  if (typeof since === 'undefined') {
    since = await db.getMeta('lastSync', 0);
  }
  try {
    const res = await api.call('pull', { since: Number(since) || 0 });
    const rows = res.rows || {};

    // IDs con cambios pendientes por entidad (no se sobreescriben)
    const pendingIds = {};
    const outbox = await db.outboxAll();
    for (const o of outbox) {
      if (!pendingIds[o.entity]) pendingIds[o.entity] = new Set();
      if (o.data && o.data.id) pendingIds[o.entity].add(o.data.id);
    }

    let changed = false;
    for (const entity of db.ENTITY_STORES.concat(['config'])) {
      const list = rows[entity] || [];
      if (!list.length) continue;
      const pend = pendingIds[entity] || new Set();
      const filtered = list.filter((r) => {
        const key = entity === 'config' ? r.clave : r.id;
        return !pend.has(key);
      });
      if (filtered.length) {
        await db.upsertAll(entity, filtered);
        changed = true;
      }
    }

    state.lastSync = res.ts || Math.floor(Date.now() / 1000);
    await db.setMeta('lastSync', state.lastSync);
    await refreshPending();
    if (changed) emit('pp:data', { entity: '*' });
    emit('pp:pull-done', {});
    return res;
  } catch (err) {
    if (err && (err.code === 'AUTH' || err.code === 'SESSION')) emit('pp:auth-expired', {});
    notify();
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Conflictos                                                          */
/* ------------------------------------------------------------------ */

export async function listConflicts() {
  return db.getAll('conflicts');
}

export async function resolveConflict(conflictId, choice) {
  const all = await db.getAll('conflicts');
  const c = all.find((x) => x.id === conflictId);
  if (!c) return;
  if (choice === 'mine') {
    // Re-encolar con base_ts = updated_at del servidor → ahora la local es más nueva.
    await db.enqueueOp(c.entity, 'update', c.local, c.server?.updated_at || '');
    await refreshPending();
    scheduleFlush(800);
  } else if (choice === 'server') {
    await db.put(c.entity, c.server);
    emit('pp:data', { entity: c.entity });
  } else if (choice === 'both') {
    const copy = { ...c.local, id: uuid(ID_PREFIX[c.entity] || '') };
    if (copy.titulo) copy.titulo = copy.titulo + ' (copia)';
    await applyLocal(c.entity, 'create', copy, { flushNow: false });
  }
  await db.del('conflicts', conflictId);
  emit('pp:conflicts', {});
  emit('pp:toast', { type: 'success', msg: t('sync.resolved') });
}

/* ------------------------------------------------------------------ */
/* Arranque del motor                                                  */
/* ------------------------------------------------------------------ */

export function startSyncEngine() {
  window.addEventListener('online', () => { notify(); flush().catch(() => {}); });
  window.addEventListener('offline', () => notify());

  // Ciclo regular de sincronización (60 s) mientras la app esté abierta.
  clearInterval(state.timer);
  state.timer = setInterval(() => {
    if (navigator.onLine && api.isConfigured() && !api.isDemo()) flush().catch(() => {});
  }, 60000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      notify();
      if (navigator.onLine && api.isConfigured() && !api.isDemo()) flush().catch(() => {});
    }
  });

  on('pp:sync-request', () => flush().catch(() => {}));
  notify();
}

export { notify as syncNotify };
