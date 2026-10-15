// History: everything logged, newest first, with filters and search.

import { esc, fmtDateFull, relativeDay, fmt0, fmt1, convertWeight } from './util.js';
import { records, getSettings, eatLevel } from './store.js';
import { kbVolume, activityName } from './stats.js';
import { state, on, rerender, icon } from './ui.js';
import { openKbForm, openCardioForm } from './forms.js';
import { colorFor } from './charts.js';
import { cardioSummary } from './today.js';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'kb', label: 'Kettlebell' },
  { id: 'cardio', label: 'Cardio' },
  { id: 'day', label: 'Food' },
];

function daySummary(r, s) {
  const parts = [];
  const lvl = eatLevel(r.eat);
  if (lvl) parts.push(lvl.label);
  const kept = s.habits.filter((h) => r.habits?.[h.id]).length;
  if (s.habits.length && kept) parts.push(`${kept} of ${s.habits.length} habits`);
  if (r.water) parts.push(`${r.water} glasses of water`);
  if (r.sleep != null) parts.push(`${fmt1(r.sleep)} h sleep`);
  if (r.bodyweight != null) parts.push(`${fmt1(convertWeight(r.bodyweight, r.bodyweightUnit || s.weightUnit, s.weightUnit))} ${s.weightUnit}`);
  if (r.energy) parts.push(`energy ${r.energy}/5`);
  return parts.join(', ') || 'Check-in';
}

function matches(r, q, s) {
  if (!q) return true;
  const hay = [
    r.notes, r.place,
    r.type === 'cardio' ? activityName(r.activity) : '',
    ...(r.items || []).map((it) => it.exercise),
    r.type === 'day' ? 'food eating ' + daySummary(r, s) : '',
    r.type === 'kb' ? 'kettlebell' : '',
  ].join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
}

function row(r, s) {
  if (r.type === 'kb') {
    const vol = kbVolume(r, s.weightUnit);
    return `
      <li class="h-row">
        <span class="swatch" style="background:${colorFor('kb')}" aria-hidden="true"></span>
        <div class="h-main">
          <p class="h-title">Kettlebell${r.duration ? ` <span class="entry-meta">${fmt0(r.duration)} min</span>` : ''}</p>
          <p class="h-detail">${(r.items || []).map((it) => `${esc(it.exercise)} ${it.weight ? `${fmt1(it.weight)} ${it.unit} ` : ''}${it.sets}×${it.reps}`).join('; ')}${vol ? `. ${fmt0(vol)} ${s.weightUnit} moved.` : ''}</p>
          ${r.notes ? `<p class="h-notes">${esc(r.notes)}</p>` : ''}
        </div>
        <button class="icon-btn" data-action="edit-kb" data-id="${r.id}" data-focus-key="h-edit-${r.id}" aria-label="Edit kettlebell session">${icon('edit')}</button>
      </li>`;
  }
  if (r.type === 'cardio') {
    return `
      <li class="h-row">
        <span class="swatch" style="background:${colorFor(r.activity)}" aria-hidden="true"></span>
        <div class="h-main">
          <p class="h-title">${esc(activityName(r.activity))}${r.place ? ` <span class="entry-meta">${esc(r.place)}</span>` : ''}</p>
          <p class="h-detail">${cardioSummary(r)}</p>
          ${r.notes ? `<p class="h-notes">${esc(r.notes)}</p>` : ''}
        </div>
        <button class="icon-btn" data-action="edit-cardio" data-id="${r.id}" data-focus-key="h-edit-${r.id}" aria-label="Edit ${esc(activityName(r.activity))}">${icon('edit')}</button>
      </li>`;
  }
  const lvl = eatLevel(r.eat);
  return `
    <li class="h-row">
      <span class="swatch food ${lvl ? `eat-${lvl.key}` : ''}" aria-hidden="true"></span>
      <div class="h-main">
        <p class="h-title">Food and check-in</p>
        <p class="h-detail">${esc(daySummary(r, s))}</p>
        ${r.notes ? `<p class="h-notes">${esc(r.notes)}</p>` : ''}
      </div>
      <button class="icon-btn" data-action="open-day" data-date="${r.date}" data-focus-key="h-day-${r.date}" aria-label="Open check-in for ${fmtDateFull(r.date)}">${icon('edit')}</button>
    </li>`;
}

export function renderHistory(root) {
  const s = getSettings();
  const all = records()
    .filter((r) => state.historyFilter === 'all' || r.type === state.historyFilter)
    .filter((r) => matches(r, state.historyQuery.trim(), s));

  const byDate = new Map();
  for (const r of all) {
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date).push(r);
  }
  const order = { kb: 0, cardio: 1, day: 2 };
  const dates = [...byDate.keys()].sort().reverse();
  const shown = dates.slice(0, state.historyDays);

  root.innerHTML = `
    <h1 class="view-title">History</h1>
    <div class="history-tools">
      <div class="segmented" role="group" aria-label="Show">
        ${FILTERS.map((f) => `<button class="seg ${state.historyFilter === f.id ? 'on' : ''}" aria-pressed="${state.historyFilter === f.id}" data-action="history-filter" data-value="${f.id}" data-focus-key="hf-${f.id}">${f.label}</button>`).join('')}
      </div>
      <label class="search"><span class="sr-only">Search history</span>
        <input type="search" placeholder="Search exercises, trails, notes" value="${esc(state.historyQuery)}" data-action="history-search" data-focus-key="history-search">
      </label>
    </div>
    <p class="quiet history-count">${all.length ? `${all.length} ${all.length === 1 ? 'entry' : 'entries'} on ${dates.length} ${dates.length === 1 ? 'day' : 'days'}` : ''}</p>
    ${shown.length ? shown.map((d) => {
      const rel = relativeDay(d);
      return `
        <section class="h-day" aria-label="${fmtDateFull(d)}">
          <h2><a href="#today" data-action="open-day" data-date="${d}">${fmtDateFull(d)}</a>${rel ? ` <span class="quiet">${rel}</span>` : ''}</h2>
          <ul class="h-list">${byDate.get(d).sort((a, b) => order[a.type] - order[b.type]).map((r) => row(r, s)).join('')}</ul>
        </section>`;
    }).join('') : `<p class="empty">${state.historyQuery || state.historyFilter !== 'all' ? 'Nothing matches. Try a different search or filter.' : 'Nothing logged yet. Entries you add on Today will be listed here.'}</p>`}
    ${dates.length > shown.length ? `<div class="more"><button class="btn ghost" data-action="history-more">Show older days</button></div>` : ''}`;
}

on('click', 'history-filter', (el) => { state.historyFilter = el.dataset.value; state.historyDays = 30; rerender(); });
let searchTimer;
on('input', 'history-search', (el) => {
  state.historyQuery = el.value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(rerender, 200);
});
on('click', 'history-more', () => { state.historyDays += 30; rerender(); });
