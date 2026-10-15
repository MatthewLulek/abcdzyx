// Today: pick a day, log training and food, see this week's goals.

import {
  esc, todayISO, addDays, fmtWeekday, fmtMonthDay, fmtMonthDayShort, relativeDay, num,
  fmt0, fmt1, convertWeight, startOfWeek, elevUnit,
} from './util.js';
import { recordsOn, getSettings, getDay, setDay, lastKbSession, EAT_LEVELS } from './store.js';
import { weekProgress, streaks, kbVolume, activityName } from './stats.js';
import { state, on, rerender, icon } from './ui.js';
import { openKbForm, openCardioForm } from './forms.js';
import { colorFor } from './charts.js';

/* ---------- Pieces ---------- */

function dayHeader() {
  const d = state.date;
  const rel = relativeDay(d);
  const isToday = d === todayISO();
  return `
    <div class="day-head">
      <div class="day-nav">
        <p class="day-weekday">${fmtWeekday(d)}${rel && rel !== 'Today' ? `, ${rel.toLowerCase()}` : ''}</p>
        <button class="icon-btn" data-action="day-prev" data-focus-key="day-prev" aria-label="Previous day">${icon('left')}</button>
        <button class="icon-btn" data-action="day-next" data-focus-key="day-next" aria-label="Next day" ${isToday ? 'disabled' : ''}>${icon('right')}</button>
      </div>
      <h1 class="day-date">${fmtMonthDay(d)}</h1>
      <div class="day-tools">
        <label class="date-jump"><span class="sr-only">Jump to date</span>
          <input type="date" value="${d}" max="${todayISO()}" data-action="day-pick" data-focus-key="day-pick">
        </label>
        ${isToday ? '' : '<button class="btn ghost small" data-action="day-today">Back to today</button>'}
      </div>
    </div>`;
}

function meter(label, value, goal, unit) {
  const pct = goal > 0 ? Math.min(100, (value / goal) * 100) : 0;
  const done = goal > 0 && value >= goal;
  return `
    <div class="meter-row ${done ? 'done' : ''}">
      <div class="meter-top">
        <span class="meter-label">${label}</span>
        <span class="meter-num"><b>${fmt0(value)}</b><span> / ${fmt0(goal)} ${unit}</span>${done ? icon('check', 'meter-check') : ''}</span>
      </div>
      <div class="meter" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="${goal}" aria-valuenow="${Math.round(value)}">
        <div class="meter-fill" style="width:${pct}%"></div>
      </div>
    </div>`;
}

function goalsBlock() {
  const p = weekProgress(state.date);
  const s = getSettings();
  const thisWeek = p.start === startOfWeek(todayISO(), s.weekStart);
  const st = streaks();
  return `
    <section class="goals" aria-labelledby="goals-h">
      <h2 id="goals-h">${thisWeek ? 'This week' : `Week of ${fmtMonthDayShort(p.start)}`}</h2>
      ${meter('Cardio', p.cardio.value, p.cardio.goal, 'min')}
      ${meter('Kettlebell', p.kb.value, p.kb.goal, p.kb.goal === 1 ? 'session' : 'sessions')}
      ${meter('Ate well', p.eat.value, p.eat.goal, p.eat.goal === 1 ? 'day' : 'days')}
      <a class="goals-edit" href="#settings" data-focus-key="goals-edit">Change goals</a>
    </section>
    <div class="streaks">
      <div class="streak">${icon('flame')}<b>${st.training}</b><span>${st.training === 1 ? 'day' : 'days'} training in a row</span></div>
      <div class="streak">${icon('check')}<b>${st.eating}</b><span>${st.eating === 1 ? 'day' : 'days'} eating well in a row</span></div>
    </div>`;
}

function kbEntry(r, s) {
  const vol = kbVolume(r, s.weightUnit);
  const meta = [r.duration ? `${fmt0(r.duration)} min` : null, r.rpe ? `effort ${r.rpe}` : null].filter(Boolean).join(', ');
  return `
    <article class="entry">
      <span class="swatch" style="background:${colorFor('kb')}" aria-hidden="true"></span>
      <div class="entry-main">
        <h3 class="entry-title">Session${meta ? ` <span class="entry-meta">${meta}</span>` : ''}</h3>
        <ul class="ex-lines">
          ${(r.items || []).map((it) => `<li><span>${esc(it.exercise)}</span><span class="nums">${it.weight ? `${fmt1(it.weight)} ${it.unit}, ` : ''}${it.sets} × ${it.reps}</span></li>`).join('')}
        </ul>
        ${r.notes ? `<p class="entry-notes">${esc(r.notes)}</p>` : ''}
      </div>
      <div class="entry-side">
        ${vol ? `<span class="entry-stat">${fmt0(vol)}</span><span class="entry-unit">${s.weightUnit} moved</span>` : ''}
        <button class="icon-btn" data-action="edit-kb" data-id="${r.id}" data-focus-key="edit-${r.id}" aria-label="Edit session">${icon('edit')}</button>
      </div>
    </article>`;
}

export function cardioSummary(r) {
  const parts = [`${fmt0(r.duration || 0)} min`];
  if (r.distance) parts.push(`${fmt1(r.distance)} ${r.distanceUnit || getSettings().distanceUnit}`);
  if (r.elevation) parts.push(`${fmt0(r.elevation)} ${elevUnit(r.distanceUnit || getSettings().distanceUnit)} up`);
  if (r.steps) parts.push(`${fmt0(r.steps)} ${r.activity === 'step-ups' ? 'step-ups' : 'steps'}`);
  if (r.boxHeight) parts.push(`${fmt1(r.boxHeight)} ${(r.distanceUnit || getSettings().distanceUnit) === 'km' ? 'cm' : 'in'} box`);
  if (r.load) parts.push(`+${fmt1(r.load)} ${r.loadUnit || getSettings().weightUnit}`);
  if (r.rpe) parts.push(`effort ${r.rpe}`);
  if (r.hr) parts.push(`${r.hr} bpm`);
  return parts.join(', ');
}

function cardioEntry(r) {
  return `
    <article class="entry">
      <span class="swatch" style="background:${colorFor(r.activity)}" aria-hidden="true"></span>
      <div class="entry-main">
        <h3 class="entry-title">${esc(activityName(r.activity))}${r.place ? ` <span class="entry-meta">${esc(r.place)}</span>` : ''}</h3>
        <p class="entry-detail">${cardioSummary(r)}</p>
        ${r.notes ? `<p class="entry-notes">${esc(r.notes)}</p>` : ''}
      </div>
      <div class="entry-side">
        <button class="icon-btn" data-action="edit-cardio" data-id="${r.id}" data-focus-key="edit-${r.id}" aria-label="Edit ${esc(activityName(r.activity))}">${icon('edit')}</button>
      </div>
    </article>`;
}

function kbBlock(recs, s) {
  const kb = recs.filter((r) => r.type === 'kb');
  const last = lastKbSession(state.date);
  return `
    <section class="block" aria-labelledby="kb-h">
      <div class="block-head">
        <h2 id="kb-h">Kettlebell</h2>
        <div class="block-actions">
          ${last ? `<button class="btn ghost small" data-action="repeat-kb" data-focus-key="repeat-kb" title="Copy the exercises from ${fmtMonthDayShort(last.date)}">${icon('repeat')} Repeat last</button>` : ''}
          <button class="btn primary small" data-action="add-kb" data-focus-key="add-kb">${icon('plus')} Log session</button>
        </div>
      </div>
      <div class="entries">
        ${kb.length ? kb.map((r) => kbEntry(r, s)).join('') : '<p class="empty">No kettlebell work logged for this day.</p>'}
      </div>
    </section>`;
}

function cardioBlock(recs, s) {
  const cardio = recs.filter((r) => r.type === 'cardio');
  const types = s.cardioTypes.filter((t) => !t.hidden);
  return `
    <section class="block" aria-labelledby="cardio-h">
      <div class="block-head">
        <h2 id="cardio-h">Cardio</h2>
      </div>
      <div class="quick-add" role="group" aria-label="Log cardio">
        ${types.map((t) => `<button class="chip add" data-action="add-cardio" data-activity="${esc(t.id)}" data-focus-key="add-${esc(t.id)}"><span class="chip-dot" style="background:${colorFor(t.id)}"></span>${esc(t.name)}${icon('plus')}</button>`).join('')}
      </div>
      <div class="entries">
        ${cardio.length ? cardio.map(cardioEntry).join('') : '<p class="empty">No cardio logged for this day. Tap an activity above to add one.</p>'}
      </div>
    </section>`;
}

function foodBlock(s) {
  const day = getDay(state.date);
  const habits = day.habits || {};
  const bwUnit = day.bodyweightUnit || s.weightUnit;
  const bw = day.bodyweight != null ? Number(convertWeight(day.bodyweight, bwUnit, s.weightUnit).toFixed(1)) : '';
  return `
    <section class="block" aria-labelledby="food-h">
      <div class="block-head">
        <h2 id="food-h">Food and check-in</h2>
      </div>
      <fieldset class="eat-pick">
        <legend>Did you eat well${state.date === todayISO() ? ' today' : ''}?</legend>
        <div class="segmented eat" role="group">
          ${EAT_LEVELS.map((l) => `
            <button type="button" class="seg eatbtn-${l.key} ${day.eat === l.value ? 'on' : ''}" aria-pressed="${day.eat === l.value}"
              data-action="set-eat" data-value="${l.value}" data-focus-key="eat-${l.value}">
              <span class="eat-glyph" aria-hidden="true">${l.glyph}</span>${l.label}
            </button>`).join('')}
        </div>
      </fieldset>
      ${s.habits.length ? `
      <fieldset class="habits">
        <legend>Habits</legend>
        <div class="chip-row">
          ${s.habits.map((h) => `
            <button type="button" class="chip toggle ${habits[h.id] ? 'on' : ''}" aria-pressed="${Boolean(habits[h.id])}"
              data-action="toggle-habit" data-habit="${esc(h.id)}" data-focus-key="habit-${esc(h.id)}">
              ${icon('check', 'chip-check')}${esc(h.name)}
            </button>`).join('')}
        </div>
      </fieldset>` : ''}
      <div class="checkin-grid">
        <div class="field">
          <span id="water-l">Water (glasses)</span>
          <div class="stepper" role="group" aria-labelledby="water-l">
            <button type="button" class="icon-btn" data-action="water" data-delta="-1" data-focus-key="water-minus" aria-label="One less glass">${icon('minus')}</button>
            <output class="stepper-val">${day.water ?? 0}</output>
            <button type="button" class="icon-btn" data-action="water" data-delta="1" data-focus-key="water-plus" aria-label="One more glass">${icon('plus')}</button>
          </div>
        </div>
        <label class="field"><span>Sleep (hours)</span>
          <input type="number" inputmode="decimal" min="0" max="24" step="0.25" value="${day.sleep ?? ''}" data-action="day-field" data-field="sleep" data-focus-key="sleep">
        </label>
        <label class="field"><span>Bodyweight (${s.weightUnit})</span>
          <input type="number" inputmode="decimal" min="0" step="0.1" value="${bw}" data-action="day-field" data-field="bodyweight" data-focus-key="bodyweight">
        </label>
        <div class="field">
          <span id="energy-l">Energy</span>
          <div class="segmented small" role="group" aria-labelledby="energy-l">
            ${[1, 2, 3, 4, 5].map((v) => `<button type="button" class="seg ${day.energy === v ? 'on' : ''}" aria-pressed="${day.energy === v}" data-action="set-energy" data-value="${v}" data-focus-key="energy-${v}" aria-label="Energy ${v} of 5">${v}</button>`).join('')}
          </div>
        </div>
      </div>
      <label class="field"><span>Notes</span>
        <textarea rows="2" data-action="day-field" data-field="notes" data-focus-key="day-notes" placeholder="Meals, cravings, how you felt">${esc(day.notes || '')}</textarea>
      </label>
    </section>`;
}

/* ---------- Render ---------- */

export function renderToday(root) {
  const s = getSettings();
  const recs = recordsOn(state.date);
  root.innerHTML = `
    <div class="today-grid">
      <aside class="today-side">
        ${dayHeader()}
        ${goalsBlock()}
      </aside>
      <div class="today-main">
        ${kbBlock(recs, s)}
        ${cardioBlock(recs, s)}
        ${foodBlock(s)}
      </div>
    </div>`;
}

/* ---------- Actions ---------- */

on('click', 'day-prev', () => { state.date = addDays(state.date, -1); rerender(); });
on('click', 'day-next', () => {
  if (state.date < todayISO()) { state.date = addDays(state.date, 1); rerender(); }
});
on('click', 'day-today', () => { state.date = todayISO(); rerender(); });
on('change', 'day-pick', (el) => { if (el.value) { state.date = el.value; rerender(); } });

on('click', 'add-kb', () => openKbForm({ date: state.date }));
on('click', 'repeat-kb', () => {
  const last = lastKbSession(state.date);
  if (!last) return;
  openKbForm({ date: state.date, template: { items: last.items.map((it) => ({ ...it })), duration: last.duration } });
});
on('click', 'edit-kb', (el) => openKbForm({ id: el.dataset.id }));
on('click', 'add-cardio', (el) => openCardioForm({ date: state.date, activity: el.dataset.activity }));
on('click', 'edit-cardio', (el) => openCardioForm({ id: el.dataset.id }));

on('click', 'set-eat', (el) => {
  const v = Number(el.dataset.value);
  const day = getDay(state.date);
  setDay(state.date, { eat: day.eat === v ? null : v });
});

on('click', 'toggle-habit', (el) => {
  const day = getDay(state.date);
  const habits = { ...(day.habits || {}) };
  habits[el.dataset.habit] = !habits[el.dataset.habit];
  setDay(state.date, { habits });
});

on('click', 'water', (el) => {
  const day = getDay(state.date);
  setDay(state.date, { water: Math.max(0, (day.water || 0) + Number(el.dataset.delta)) });
});

on('click', 'set-energy', (el) => {
  const v = Number(el.dataset.value);
  const day = getDay(state.date);
  setDay(state.date, { energy: day.energy === v ? null : v });
});

on('change', 'day-field', (el) => {
  const field = el.dataset.field;
  if (field === 'notes') return setDay(state.date, { notes: el.value.trim() });
  const v = num(el.value);
  if (v != null && v < 0) return;
  if (field === 'bodyweight') return setDay(state.date, { bodyweight: v, bodyweightUnit: getSettings().weightUnit });
  setDay(state.date, { [field]: v });
});
