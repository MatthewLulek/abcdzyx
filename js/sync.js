// Optional sync between devices through a secret GitHub Gist.
// Each device keeps its own copy in localStorage; a sync pulls the gist,
// merges record-by-record (newest edit wins), and pushes the result back.

import { exportDoc, mergeDocs, normalize, replaceDoc } from './store.js';

const API = 'https://api.github.com';
const FILE = 'kettle-trail-data.json';
const DESCRIPTION = 'Kettle & Trail tracker data (managed by the app)';
const CFG_KEY = 'kettle-trail:sync';

let running = null;
let timer = null;

export function getConfig() {
  try {
    return JSON.parse(localStorage.getItem(CFG_KEY)) || {};
  } catch {
    return {};
  }
}

function setConfig(patch) {
  const next = { ...getConfig(), ...patch };
  localStorage.setItem(CFG_KEY, JSON.stringify(next));
  return next;
}

export const isConfigured = () => {
  const c = getConfig();
  return Boolean(c.token && c.gistId);
};

function emit(state, message = '') {
  window.dispatchEvent(new CustomEvent('kt:sync', { detail: { state, message } }));
}

async function gh(path, { method = 'GET', body, token = getConfig().token } = {}) {
  let res;
  try {
    res = await fetch(path.startsWith('http') ? path : API + path, {
      method,
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Could not reach GitHub. Check your connection and try again.');
  }
  if (res.status === 401) throw new Error('GitHub rejected the token. Create a new one with gist access and paste it again.');
  if (res.status === 403) throw new Error('GitHub refused the request. The token may be missing gist access, or the rate limit was hit.');
  if (res.status === 404) throw new Error('The sync gist was not found. Disconnect and connect again to create a new one.');
  if (!res.ok) throw new Error(`GitHub returned an error (${res.status}).`);
  return res.status === 204 ? null : res.json();
}

async function findGist(token) {
  for (let page = 1; page <= 10; page++) {
    const list = await gh(`/gists?per_page=100&page=${page}`, { token });
    const hit = list.find((g) => g.files && g.files[FILE]);
    if (hit) return hit.id;
    if (list.length < 100) break;
  }
  return null;
}

async function readGist(id) {
  const g = await gh(`/gists/${id}`);
  const f = g.files?.[FILE];
  if (!f) return null;
  let text = f.content;
  if (f.truncated) {
    const raw = await fetch(f.raw_url, { cache: 'no-store' });
    text = await raw.text();
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('The sync gist contains data this app cannot read.');
  }
}

const payload = (doc) => ({ files: { [FILE]: { content: JSON.stringify(doc) } } });

// True when both documents hold the same versions of everything.
function sameDoc(a, b) {
  if ((a.settings.updatedAt || 0) !== (b.settings.updatedAt || 0)) return false;
  const ka = Object.keys(a.records);
  if (ka.length !== Object.keys(b.records).length) return false;
  return ka.every((id) => b.records[id] && (b.records[id].updatedAt || 0) === (a.records[id].updatedAt || 0));
}

export async function connect(token) {
  token = token.trim();
  if (!token) throw new Error('Paste a GitHub token first.');
  emit('syncing', 'Connecting…');
  try {
    const user = await gh('/user', { token });
    let gistId = await findGist(token);
    if (!gistId) {
      const created = await gh('/gists', { method: 'POST', token, body: { description: DESCRIPTION, public: false, ...payload(exportDoc()) } });
      gistId = created.id;
    }
    setConfig({ token, gistId, login: user.login, lastError: null });
  } catch (e) {
    setConfig({ lastError: e.message });
    emit('error', e.message);
    throw e;
  }
  return syncNow();
}

export function disconnect() {
  localStorage.removeItem(CFG_KEY);
  emit('off');
}

export function syncNow() {
  if (!isConfigured()) return Promise.resolve();
  if (running) return running;
  emit('syncing', 'Syncing…');
  running = (async () => {
    try {
      const { gistId } = getConfig();
      const local = normalize(exportDoc());
      const remoteRaw = await readGist(gistId);
      const remote = normalize(remoteRaw || {});
      const merged = mergeDocs(local, remote);
      if (!sameDoc(merged, local)) replaceDoc(merged, 'sync');
      if (!remoteRaw || !sameDoc(merged, remote)) await gh(`/gists/${gistId}`, { method: 'PATCH', body: payload(merged) });
      setConfig({ lastSync: Date.now(), lastError: null });
      emit('ok', 'Synced');
    } catch (e) {
      setConfig({ lastError: e.message });
      emit('error', e.message);
    } finally {
      running = null;
    }
  })();
  return running;
}

export function scheduleSync(delay = 4000) {
  if (!isConfigured()) return;
  clearTimeout(timer);
  timer = setTimeout(syncNow, delay);
}
