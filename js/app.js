// Entry point: routing, rendering, theme, sync status, offline support.

import { $, $$, todayISO, toast } from './util.js';
import { subscribe, getSettings } from './store.js';
import { state, initDelegation, setRenderer } from './ui.js';
import * as sync from './sync.js';
import { renderToday } from './today.js';
import { renderProgress } from './progress.js';
import { renderHistory } from './history.js';
import { renderSettings } from './settings.js';
import { destroyAll } from './charts.js';

const VIEWS = {
  today: renderToday,
  progress: renderProgress,
  history: renderHistory,
  settings: renderSettings,
};

/* ---------- Theme ---------- */

function applyTheme() {
  const t = getSettings().theme;
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  else document.documentElement.removeAttribute('data-theme');
}

/* ---------- Render with focus kept in place ---------- */

function render({ resetScroll = false } = {}) {
  const active = document.activeElement;
  const key = active?.dataset?.focusKey;
  let selection = null;
  try {
    if (active && typeof active.selectionStart === 'number') selection = [active.selectionStart, active.selectionEnd];
  } catch { /* some input types don't support selection */ }
  const scrollY = window.scrollY;

  for (const section of $$('.view')) {
    const isActive = section.dataset.view === state.view;
    section.hidden = !isActive;
    if (!isActive) section.innerHTML = '';
  }
  if (state.view !== 'progress') destroyAll();
  VIEWS[state.view]($(`#view-${state.view}`));

  for (const a of $$('[data-view-link]')) {
    if (a.dataset.viewLink === state.view) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }

  if (resetScroll) window.scrollTo(0, 0);
  else window.scrollTo(0, scrollY);

  if (key) {
    const el = document.querySelector(`[data-focus-key="${CSS.escape(key)}"]`);
    if (el && !el.disabled) {
      el.focus({ preventScroll: true });
      if (selection) try { el.setSelectionRange(...selection); } catch { /* ignore */ }
    }
  }
}

setRenderer(() => render());

/* ---------- Routing ---------- */

function route() {
  const view = location.hash.replace('#', '') || 'today';
  const next = VIEWS[view] ? view : 'today';
  const changed = next !== state.view;
  state.view = next;
  render({ resetScroll: changed });
  if (changed) document.title = `${next === 'today' ? '' : next[0].toUpperCase() + next.slice(1) + ', '}Kettle & Trail`;
}

/* ---------- Sync status pill ---------- */

function setPill(stateName, message) {
  const pill = $('#sync-pill');
  if (!sync.isConfigured() && stateName !== 'syncing') {
    pill.hidden = true;
    return;
  }
  pill.hidden = false;
  pill.dataset.state = stateName;
  const text = { syncing: 'Syncing', ok: 'Synced', error: 'Sync issue', off: '' }[stateName] || 'Synced';
  pill.querySelector('.sync-text').textContent = text;
  pill.title = message || text;
}

window.addEventListener('kt:sync', (e) => setPill(e.detail.state, e.detail.message));
window.addEventListener('kt:storage-error', () => toast('Couldn’t save: browser storage is full. Download a backup in Settings.'));

/* ---------- Start ---------- */

let lastToday = todayISO();

function onDayRollover() {
  const now = todayISO();
  if (now !== lastToday) {
    if (state.date === lastToday) state.date = now;
    if (state.periodAnchor === lastToday) state.periodAnchor = now;
    lastToday = now;
    render();
  }
}

function start() {
  applyTheme();
  initDelegation();

  // Render on the next tick so a Tab or click that triggered the save has
  // already moved focus; render() then puts focus back on that element.
  let pending = null;
  subscribe(({ source }) => {
    applyTheme();
    clearTimeout(pending);
    pending = setTimeout(render, 0);
    if (source === 'local') sync.scheduleSync();
  });

  window.addEventListener('hashchange', route);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getSettings().theme === 'system') render();
  });

  // Charts size themselves to their boxes; redraw after big width changes.
  let lastWidth = window.innerWidth;
  window.addEventListener('resize', () => {
    if (Math.abs(window.innerWidth - lastWidth) > 120 && state.view === 'progress') {
      lastWidth = window.innerWidth;
      render();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    onDayRollover();
    const last = sync.getConfig().lastSync || 0;
    if (Date.now() - last > 30000) sync.syncNow();
  });

  route();

  if (sync.isConfigured()) {
    setPill('ok');
    sync.syncNow();
  }

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Offline support unavailable', e));
  }
}

start();
