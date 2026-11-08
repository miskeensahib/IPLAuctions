import { io } from 'socket.io-client';

const BASE = import.meta.env.VITE_API_URL || ''; // empty = same origin / Vite proxy

const safe = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del: (k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};
export const store = safe;

export const clientId = (() => {
  let id = safe.get('ipl.clientId');
  if (!id) { id = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()); safe.set('ipl.clientId', id); }
  return id;
})();

export const adminKey = {
  get: () => { try { return sessionStorage.getItem('ipl.adminKey') || ''; } catch { return ''; } },
  set: (v) => { try { sessionStorage.setItem('ipl.adminKey', v); } catch { /* ignore */ } },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WAKING = new Set([502, 503, 504]); // what a sleeping / just-starting server answers with

// Reads (GET) are retried automatically: a free-tier server that has gone to sleep drops the first request or answers
// 502/503 while it starts, and it is usually ready a few seconds later. Changes (POST/PUT/DELETE) are never retried,
// so nothing can be done twice. `tries` overrides the number of attempts.
export async function api(path, { method = 'GET', body, admin, tries } = {}) {
  const max = tries || (method === 'GET' ? 8 : 1);
  for (let i = 1; ; i++) {
    let res;
    try {
      res = await fetch(`${BASE}/api${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', 'x-client-id': clientId, ...(admin ? { 'x-admin-key': adminKey.get() } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      if (i < max) { await sleep(Math.min(4000, 1000 * i)); continue; }
      throw new Error('Cannot reach the server. Check your connection.');
    }
    if (WAKING.has(res.status) && i < max) { await sleep(Math.min(4000, 1000 * i)); continue; }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }
}

// Wake the backend the moment the site opens (before the user has even typed their name), so it is ready by the time
// the first screen asks for data.
export function warmUp() { fetch(`${BASE}/api/health`, { cache: 'no-store' }).catch(() => {}); }
warmUp();

// Hands this browser's teams back to the bots, drops the session (name, team/host markers, admin key, identity)
// and reloads on the login page. (All application data lives in MongoDB; the browser keeps only the session.)
export async function logout() {
  try { await fetch(`${BASE}/api/auctions/session/logout`, { method: 'POST', headers: { 'x-client-id': clientId } }); } catch { /* offline: still log out locally */ }
  try {
    Object.keys(localStorage).filter((k) => k.startsWith('ipl.')).forEach((k) => localStorage.removeItem(k));
    sessionStorage.clear();
  } catch { /* storage unavailable */ }
  window.location.assign('/');
}

// The pool has more players than one page (max 200), so walk the pages.
export async function fetchAllPlayers(query = 'sort=marquee') {
  const out = [];
  for (let page = 1; ; page++) {
    const r = await api(`/players?limit=200&page=${page}&${query}`);
    out.push(...r.items);
    if (page >= r.pages) return out;
  }
}

export const socket = io(BASE || undefined, { autoConnect: false, transports: ['websocket', 'polling'] });
