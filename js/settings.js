// Settings: units, goals, lists, sync, backups.

import { esc, download, toast, todayISO, fmt1, num, uid } from './util.js';
import {
  getSettings, updateSettings, records, exportDoc, importDoc, eraseAll, storageBytes, eatLevel,
} from './store.js';
import { activityName } from './stats.js';
import { state, on, rerender, icon } from './ui.js';
import { colorFor } from './charts.js';
import * as sync from './sync.js';
import { loadDemo, removeDemo, hasDemo } from './demo.js';

export const APP_VERSION = '1.0.0';

const seg = (action, current, options) => `
  <div class="segmented small" role="group">
    ${options.map(([v, label]) => `<button class="seg ${String(current) === String(v) ? 'on' : ''}" aria-pressed="${String(current) === String(v)}" data-action="${action}" data-value="${v}" data-focus-key="${action}-${v}">${label}</button>`).join('')}
  </div>`;

function timeAgo(ms) {
  if (!ms) return 'never';
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(ms).toLocaleString();
}

function syncSection() {
  const cfg = sync.getConfig();
  if (sync.isConfigured()) {
    return `
      <p>Connected to GitHub as <b>${esc(cfg.login || 'you')}</b>. Your data is kept in a secret gist and merged every time you open the app or log something.</p>
      <p class="quiet">Last synced ${timeAgo(cfg.lastSync)}.</p>
      ${cfg.lastError ? `<p class="error-text" role="alert">${esc(cfg.lastError)}</p>` : ''}
      <div class="row">
        <button class="btn primary small" data-action="sync-now" data-focus-key="sync-now">Sync now</button>
        <a class="btn ghost small" href="https://gist.github.com/${esc(cfg.gistId)}" target="_blank" rel="noopener">View gist</a>
        <button class="btn danger-ghost small" data-action="sync-disconnect">Disconnect this device</button>
      </div>`;
  }
  return `
    <p>Data is saved in this browser only. To use the tracker on your phone and computer with the same data, connect a GitHub token. The app stores everything in a secret gist on your account.</p>
    <ol class="steps">
      <li>On GitHub, open <a href="https://github.com/settings/tokens/new?scopes=gist&description=Kettle%20%26%20Trail%20sync" target="_blank" rel="noopener">Settings, Developer settings, Personal access tokens</a> and create a classic token with only the <b>gist</b> scope.</li>
      <li>Paste it below on each device you use.</li>
    </ol>
    <div class="row">
      <label class="field grow"><span>GitHub token</span>
        <input type="password" id="sync-token" autocomplete="off" spellcheck="false" placeholder="ghp_…" data-focus-key="sync-token">
      </label>
      <button class="btn primary" data-action="sync-connect" data-focus-key="sync-connect">Connect</button>
    </div>
    ${cfg.lastError ? `<p class="error-text" role="alert">${esc(cfg.lastError)}</p>` : ''}
    <p class="quiet">The token is stored only in this browser. Secret gists are unlisted, not encrypted: anyone with the gist link could read it.</p>`;
}

function listEditor({ title, items, addAction, removeAction, placeholder, renderItem }) {
  return `
    <ul class="edit-list">${items.map(renderItem).join('')}</ul>
    <form class="row add-row" data-add="${addAction}">
      <label class="field grow"><span class="sr-only">${title}</span><input name="name" placeholder="${placeholder}" autocomplete="off" data-focus-key="${addAction}-input"></label>
      <button class="btn ghost small" type="submit">${icon('plus')} Add</button>
    </form>`;
}

export function renderSettings(root) {
  const s = getSettings();
  const all = records();
  const used = new Set(all.filter((r) => r.type === 'cardio').map((r) => r.activity));
  const kb = all.filter((r) => r.type === 'kb').length;
  const cardio = all.filter((r) => r.type === 'cardio').length;
  const days = all.filter((r) => r.type === 'day').length;
  const kbUnit = s.weightUnit;

  root.innerHTML = `
    <h1 class="view-title">Settings</h1>
    <div class="settings">

      <section class="set-block" aria-labelledby="set-units">
        <h2 id="set-units">Units and display</h2>
        <div class="set-row"><span>Weight</span>${seg('set-weight-unit', s.weightUnit, [['lb', 'lb'], ['kg', 'kg']])}</div>
        <div class="set-row"><span>Distance</span>${seg('set-distance-unit', s.distanceUnit, [['mi', 'mi'], ['km', 'km']])}</div>
        <div class="set-row"><span>Week starts on</span>${seg('set-week-start', s.weekStart, [[1, 'Monday'], [0, 'Sunday']])}</div>
        <div class="set-row"><span>Theme</span>${seg('set-theme', s.theme, [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']])}</div>
        <p class="quiet">Entries keep the unit they were logged in; totals and charts convert to these units.</p>
      </section>

      <section class="set-block" aria-labelledby="set-goals">
        <h2 id="set-goals">Weekly goals</h2>
        <div class="goal-inputs">
          <label class="field"><span>Cardio minutes</span><input type="number" min="0" step="5" inputmode="numeric" value="${s.goals.cardioMinutes}" data-action="set-goal" data-goal="cardioMinutes" data-focus-key="goal-cardio"></label>
          <label class="field"><span>Kettlebell sessions</span><input type="number" min="0" max="14" step="1" inputmode="numeric" value="${s.goals.kbSessions}" data-action="set-goal" data-goal="kbSessions" data-focus-key="goal-kb"></label>
          <label class="field"><span>Days eating well</span><input type="number" min="0" max="7" step="1" inputmode="numeric" value="${s.goals.ateWellDays}" data-action="set-goal" data-goal="ateWellDays" data-focus-key="goal-eat"></label>
        </div>
        <p class="quiet">150 minutes of moderate cardio a week is the common public-health guideline.</p>
      </section>

      <section class="set-block" aria-labelledby="set-ex">
        <h2 id="set-ex">Kettlebell exercises</h2>
        <p class="quiet">Suggested when you log a session. New names you type in a session are added here automatically.</p>
        ${listEditor({
          title: 'New exercise', items: s.exercises, addAction: 'add-exercise', placeholder: 'Add an exercise',
          renderItem: (e, i) => `<li><span>${esc(e)}</span><button class="icon-btn" data-action="remove-exercise" data-index="${i}" aria-label="Remove ${esc(e)}">${icon('x')}</button></li>`,
        })}
      </section>

      <section class="set-block" aria-labelledby="set-cardio">
        <h2 id="set-cardio">Cardio activities</h2>
        <p class="quiet">Hidden activities stay in your history and charts; they just leave the quick-add buttons.</p>
        ${listEditor({
          title: 'New activity', items: s.cardioTypes, addAction: 'add-cardio-type', placeholder: 'Add an activity, e.g. Running',
          renderItem: (t) => `
            <li class="${t.hidden ? 'is-hidden' : ''}">
              <span class="chip-dot" style="background:${colorFor(t.id)}"></span>
              <span>${esc(t.name)}${t.hidden ? ' <span class="quiet">(hidden)</span>' : ''}</span>
              ${!t.builtin && !used.has(t.id)
                ? `<button class="icon-btn" data-action="remove-cardio-type" data-id="${esc(t.id)}" aria-label="Remove ${esc(t.name)}">${icon('x')}</button>`
                : `<button class="btn ghost small" data-action="toggle-cardio-type" data-id="${esc(t.id)}">${t.hidden ? 'Show' : 'Hide'}</button>`}
            </li>`,
        })}
      </section>

      <section class="set-block" aria-labelledby="set-habits">
        <h2 id="set-habits">Eating habits</h2>
        <p class="quiet">Shown as checkboxes in the daily food check-in.</p>
        ${listEditor({
          title: 'New habit', items: s.habits, addAction: 'add-habit', placeholder: 'Add a habit, e.g. No fast food',
          renderItem: (h) => `<li><span>${esc(h.name)}</span><button class="icon-btn" data-action="remove-habit" data-id="${esc(h.id)}" aria-label="Remove ${esc(h.name)}">${icon('x')}</button></li>`,
        })}
      </section>

      <section class="set-block" aria-labelledby="set-sync">
        <h2 id="set-sync">Sync between devices</h2>
        ${syncSection()}
      </section>

      <section class="set-block" aria-labelledby="set-data">
        <h2 id="set-data">Backup and data</h2>
        <p>${kb} kettlebell ${kb === 1 ? 'session' : 'sessions'}, ${cardio} cardio ${cardio === 1 ? 'entry' : 'entries'}, ${days} daily ${days === 1 ? 'check-in' : 'check-ins'}. Using ${fmt1(storageBytes() / 1024)} KB of browser storage.</p>
        <div class="row wrap">
          <button class="btn ghost small" data-action="export-json">Download backup (JSON)</button>
          <button class="btn ghost small" data-action="export-csv">Download spreadsheet (CSV)</button>
          <label class="btn ghost small file-btn">Restore from backup<input type="file" accept="application/json,.json" data-action="import-json" hidden></label>
        </div>
        <div class="row wrap">
          ${hasDemo()
            ? '<button class="btn ghost small" data-action="remove-demo">Remove sample data</button>'
            : '<button class="btn ghost small" data-action="load-demo">Load sample data</button>'}
          <button class="btn danger-ghost small" data-action="erase-all">Erase all data</button>
        </div>
        <p class="quiet">Restoring merges the backup with what is already here; the newer version of each entry wins.</p>
      </section>

      <section class="set-block" aria-labelledby="set-about">
        <h2 id="set-about">About</h2>
        <p>Kettle &amp; Trail ${APP_VERSION}. Works offline once loaded. To install it, open the site on your phone and choose <b>Add to Home Screen</b> from the browser’s share menu.</p>
      </section>
    </div>`;

  root.querySelectorAll('form[data-add]').forEach((f) => {
    f.onsubmit = (e) => {
      e.preventDefault();
      const name = f.querySelector('input').value.trim();
      if (!name) return;
      addItem(f.dataset.add, name);
    };
  });
}

function addItem(kind, name) {
  const s = getSettings();
  if (kind === 'add-exercise') {
    if (s.exercises.some((e) => e.toLowerCase() === name.toLowerCase())) return toast('That exercise is already listed');
    updateSettings({ exercises: [...s.exercises, name] });
  } else if (kind === 'add-cardio-type') {
    if (s.cardioTypes.some((t) => t.name.toLowerCase() === name.toLowerCase())) return toast('That activity is already listed');
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + uid().slice(0, 4);
    updateSettings({ cardioTypes: [...s.cardioTypes, { id, name }] });
  } else if (kind === 'add-habit') {
    const id = 'h-' + uid().slice(0, 8);
    updateSettings({ habits: [...s.habits, { id, name }] });
  }
  toast(`Added ${name}`);
}

/* ---------- CSV ---------- */

function toCSV() {
  const cols = ['date', 'type', 'name', 'weight', 'weight_unit', 'sets', 'reps', 'minutes', 'distance', 'distance_unit', 'elevation', 'steps', 'effort', 'avg_hr', 'eating', 'habits_kept', 'water', 'sleep_h', 'bodyweight', 'bodyweight_unit', 'energy', 'place', 'notes'];
  const s = getSettings();
  const rows = [];
  const all = records().sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0));
  for (const r of all) {
    if (r.type === 'kb') {
      for (const it of r.items || []) rows.push({ date: r.date, type: 'kettlebell', name: it.exercise, weight: it.weight, weight_unit: it.unit, sets: it.sets, reps: it.reps, minutes: r.duration, effort: r.rpe, notes: r.notes });
    } else if (r.type === 'cardio') {
      rows.push({ date: r.date, type: 'cardio', name: activityName(r.activity), minutes: r.duration, distance: r.distance, distance_unit: r.distance != null ? r.distanceUnit : '', elevation: r.elevation, steps: r.steps, effort: r.rpe, avg_hr: r.hr, place: r.place, notes: r.notes });
    } else if (r.type === 'day') {
      rows.push({
        date: r.date, type: 'check-in', eating: eatLevel(r.eat)?.label || '',
        habits_kept: s.habits.filter((h) => r.habits?.[h.id]).map((h) => h.name).join('; '),
        water: r.water, sleep_h: r.sleep, bodyweight: r.bodyweight, bodyweight_unit: r.bodyweight != null ? r.bodyweightUnit : '', energy: r.energy, notes: r.notes,
      });
    }
  }
  const cell = (v) => {
    if (v == null) return '';
    const str = String(v);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  return [cols.join(','), ...rows.map((row) => cols.map((c) => cell(row[c])).join(','))].join('\n');
}

/* ---------- Actions ---------- */

on('click', 'set-weight-unit', (el) => updateSettings({ weightUnit: el.dataset.value }));
on('click', 'set-distance-unit', (el) => updateSettings({ distanceUnit: el.dataset.value }));
on('click', 'set-week-start', (el) => updateSettings({ weekStart: Number(el.dataset.value) }));
on('click', 'set-theme', (el) => updateSettings({ theme: el.dataset.value }));
on('change', 'set-goal', (el) => {
  const v = num(el.value);
  if (v == null || v < 0) return rerender();
  updateSettings({ goals: { ...getSettings().goals, [el.dataset.goal]: v } });
  toast('Goal updated');
});

on('click', 'remove-exercise', (el) => {
  const list = [...getSettings().exercises];
  list.splice(Number(el.dataset.index), 1);
  updateSettings({ exercises: list });
});
on('click', 'remove-cardio-type', (el) => {
  updateSettings({ cardioTypes: getSettings().cardioTypes.filter((t) => t.id !== el.dataset.id) });
});
on('click', 'toggle-cardio-type', (el) => {
  updateSettings({ cardioTypes: getSettings().cardioTypes.map((t) => (t.id === el.dataset.id ? { ...t, hidden: !t.hidden } : t)) });
});
on('click', 'remove-habit', (el) => {
  updateSettings({ habits: getSettings().habits.filter((h) => h.id !== el.dataset.id) });
});

on('click', 'sync-connect', async (el) => {
  const input = document.getElementById('sync-token');
  el.disabled = true;
  try {
    await sync.connect(input.value);
    toast('Connected. Your data is syncing.');
  } catch (e) {
    /* message is shown in the section */
  }
  rerender();
});
on('click', 'sync-now', async () => {
  await sync.syncNow();
  rerender();
});
on('click', 'sync-disconnect', () => {
  if (!confirm('Disconnect this device from sync? Your data stays here and in the gist.')) return;
  sync.disconnect();
  rerender();
});

on('click', 'export-json', () => {
  download(`kettle-trail-backup-${todayISO()}.json`, JSON.stringify(exportDoc(), null, 2));
});
on('click', 'export-csv', () => {
  download(`kettle-trail-${todayISO()}.csv`, toCSV(), 'text/csv');
});
on('change', 'import-json', async (el) => {
  const file = el.files?.[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data || typeof data !== 'object' || !data.records) throw new Error('bad');
    const n = importDoc(data, 'merge');
    toast(`Restored ${n} entries from backup`);
  } catch {
    toast('That file isn’t a Kettle & Trail backup');
  }
  el.value = '';
});
on('click', 'remove-demo', () => {
  const n = removeDemo();
  toast(`Removed ${n} sample entries`);
});
on('click', 'load-demo', () => {
  const n = loadDemo();
  toast(`Loaded ${n} sample entries. Remove them any time in Settings.`);
});
on('click', 'erase-all', () => {
  if (!confirm('Erase every entry and reset settings? This also erases it on synced devices. Download a backup first if you might want it back.')) return;
  eraseAll();
  toast('All data erased');
});
