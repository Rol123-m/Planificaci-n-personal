/**
 * Planificación Personal — api.js
 * Cliente del backend Google Apps Script.
 *
 * Detalles clave:
 *  - Las peticiones se envían por POST con Content-Type "text/plain;charset=utf-8".
 *    Es un "simple request" CORS: evita el preflight OPTIONS que Apps Script no soporta.
 *  - El backend siempre responde { ok: true|false, data?, error?, ts }.
 *  - La URL del Web App se guarda en localStorage (la pega el usuario en Ajustes la primera vez).
 */

const LS_URL = 'pp_api_url';

const state = {
  url: localStorage.getItem(LS_URL) || 'https://script.google.com/macros/s/AKfycbyvU57I4H3MuFzq2ibpm8SCquwvIIEwQzzdZfDAVyTP14kyT3MW0z_PLe0WikkAzyX4jA/exec',
  userId: '',
  token: '',
  demo: false
};

export function getUrl() { return state.url; }

export function setUrl(url) {
  state.url = String(url || '').trim();
  if (state.url) localStorage.setItem(LS_URL, state.url);
  else localStorage.removeItem(LS_URL);
}

export function setSession(userId, token) {
  state.userId = userId || '';
  state.token = token || '';
}

export function setDemo(on) { state.demo = !!on; }
export function isDemo() { return state.demo; }
export function isConfigured() { return !!state.url; }

/** Configuración pública del backend (modos de acceso habilitados). */
export async function publicConfig() {
  if (!state.url) throw new Error('NO_URL');
  const res = await request({ action: 'getPublicConfig' });
  return res;
}

/** Llamada autenticada. Lanza Error con .code y .message. */
export async function call(action, payload = {}) {
  if (state.demo) throw Object.assign(new Error('DEMO_MODE'), { code: 'DEMO' });
  if (!state.url) throw Object.assign(new Error('Backend no configurado'), { code: 'NO_URL' });
  const body = {
    action,
    user_id: state.userId,
    session_token: state.token,
    ...payload
  };
  const res = await request(body);
  return res;
}

async function request(body, { timeoutMs = 30000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(state.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow',
      signal: ctrl.signal
    });
  } catch (err) {
    clearTimeout(timer);
    throw Object.assign(new Error('No hay conexión con el servidor'), {
      code: 'NETWORK', cause: err
    });
  }
  clearTimeout(timer);

  let json;
  try {
    json = await res.json();
  } catch (err) {
    throw Object.assign(new Error('Respuesta no válida del backend (¿URL correcta?)'), {
      code: 'BAD_RESPONSE', status: res.status
    });
  }
  if (!json || typeof json.ok !== 'boolean') {
    throw Object.assign(new Error('Formato de respuesta incorrecto'), { code: 'BAD_FORMAT' });
  }
  if (!json.ok) {
    const e = json.error || {};
    throw Object.assign(new Error(e.message || 'Error del servidor'), {
      code: e.code || 'API_ERROR', status: res.status
    });
  }
  return json.data;
}
