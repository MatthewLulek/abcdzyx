// Logging forms, shown in a bottom sheet (<dialog>).

import { esc, num, todayISO, toast, fmt1, elevUnit } from './util.js';
import { save, remove, getSettings, getRecord, fieldsFor, updateSettings } from './store.js';
import { lastForExercise, daysAgoLabel, commonBells } from './stats.js';
import { icon } from './ui.js';

const dialog = () => document.getElementById('sheet');
const form = () => document.getElementById('sheet-form');

function openSheet(html, { onSubmit, onReady }) {
  const f = form();
  f.innerHTML = html;
  f.onsubmit = (e) => {
    e.preventDefault();
    const err = onSubmit(f);
    const box = f.querySelector('.form-error');
    if (err) {
      box.textContent = err;
      box.hidden = false;
      return;
    }
    dialog().close();
  };
  f.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => dialog().close()));
  onReady?.(f);
  dialog().showModal();
  // Focus the first empty required-ish input, not the date.
  const first = f.querySelector('[data-autofocus]') || f.querySelector('input:not([type=date])');
  first?.focus({ preventScroll: true });
}

// Close when tapping the backdrop.
document.addEventListener('click', (e) => {
  const d = dialog();
  if (d?.open && e.target === d) d.close();
});

const rpeOptions = (selected) =>
  ['<option value="">–</option>']
    .concat(Array.from({ length: 10 }, (_, i) => i + 1).map((v) => `<option value="${v}" ${Number(selected) === v ? 'selected' : ''}>${v}</option>`))
    .join('');

const head = (title) => `
  <header class="sheet-head">
    <h2 id="sheet-title">${title}</h2>
    <button type="button" class="icon-btn" data-close aria-label="Close">${icon('x')}</button>
  </header>`;

const foot = (editing, saveLabel) => `
  <p class="form-error" role="alert" hidden></p>
  <footer class="sheet-foot">
    ${editing ? '<button type="button" class="btn danger-ghost" data-delete>Delete</button>' : ''}
    <span class="spacer"></span>
    <button type="button" class="btn ghost" data-close>Cancel</button>
    <button type="submit" class="btn primary">${saveLabel}</button>
  </footer>`;

function wireDelete(f, record, label) {
  const btn = f.querySelector('[data-delete]');
  if (!btn) return;
  btn.onclick = () => {
    if (!confirm(`Delete this ${label}?`)) return;
    remove(record.id);
    dialog().close();
    toast(`Deleted ${label}`);
  };
}

/* ---------- Kettlebell session ---------- */

function exRow(item = {}, defaultUnit) {
  const unit = item.unit || defaultUnit;
  return `
    <div class="ex-row">
      <label class="field ex-name"><span>Exercise</span>
        <input name="exercise" list="ex-options" autocomplete="off" value="${esc(item.exercise || '')}" placeholder="e.g. Two-hand swing">
      </label>
      <label class="field ex-weight"><span>Bell</span>
        <span class="unit-input">
          <input name="weight" type="number" inputmode="decimal" min="0" step="0.5" list="bell-weights" value="${item.weight ?? ''}">
          <select name="unit" aria-label="Weight unit">
            <option value="kg" ${unit === 'kg' ? 'selected' : ''}>kg</option>
            <option value="lb" ${unit === 'lb' ? 'selected' : ''}>lb</option>
          </select>
        </span>
      </label>
      <label class="field ex-num"><span>Sets</span><input name="sets" type="number" inputmode="numeric" min="1" step="1" value="${item.sets ?? ''}"></label>
      <label class="field ex-num"><span>Reps</span><input name="reps" type="number" inputmode="numeric" min="1" step="1" value="${item.reps ?? ''}"></label>
      <button type="button" class="icon-btn ex-remove" data-remove-ex aria-label="Remove exercise">${icon('x')}</button>
      <p class="ex-hint" aria-live="polite"></p>
    </div>`;
}

function updateHint(row) {
  const name = row.querySelector('[name=exercise]').value.trim();
  const hint = row.querySelector('.ex-hint');
  const last = name ? lastForExercise(name) : null;
  hint.textContent = last ? `Last time: ${fmt1(last.weight)} ${last.unit}, ${last.sets} × ${last.reps} (${daysAgoLabel(last.date)})` : '';
  const w = row.querySelector('[name=weight]');
  if (last && !w.value) {
    w.value = last.weight;
    row.querySelector('[name=unit]').value = last.unit;
    if (!row.querySelector('[name=sets]').value) row.querySelector('[name=sets]').value = last.sets;
    if (!row.querySelector('[name=reps]').value) row.querySelector('[name=reps]').value = last.reps;
  }
}

export function openKbForm({ date = todayISO(), id = null, template = null } = {}) {
  const s = getSettings();
  const record = id ? getRecord(id) : null;
  const src = record || template || {};
  const items = src.items?.length ? src.items : [{}];
  const bells = commonBells();
  const defaultUnit = bells[0]?.unit || 'kg';
  const exercises = [...new Set([...s.exercises])];

  openSheet(
    `${head(record ? 'Edit kettlebell session' : 'Kettlebell session')}
    <div class="sheet-body">
      <div class="field-row three">
        <label class="field"><span>Date</span><input type="date" name="date" value="${esc(record?.date || date)}" max="2100-12-31"></label>
        <label class="field"><span>Minutes</span><input type="number" name="duration" inputmode="numeric" min="0" step="1" value="${src.duration ?? ''}" placeholder="30"></label>
        <label class="field"><span>Effort (1–10)</span><select name="rpe">${rpeOptions(src.rpe)}</select></label>
      </div>
      <fieldset class="ex-fieldset">
        <legend>Exercises</legend>
        <div class="ex-list">${items.map((it) => exRow(it, defaultUnit)).join('')}</div>
        <button type="button" class="btn ghost small" data-add-ex>${icon('plus')} Add exercise</button>
      </fieldset>
      ${bells.length ? `<div class="bell-quick"><span class="quiet">Your usual bells</span>${bells.map((b) => `<button type="button" class="chip" data-bell="${b.weight}|${b.unit}">${fmt1(b.weight)} ${b.unit}</button>`).join('')}</div>` : ''}
      <label class="field"><span>Notes</span><textarea name="notes" rows="2" placeholder="How did it feel?">${esc(record?.notes || '')}</textarea></label>
      <datalist id="ex-options">${exercises.map((e) => `<option value="${esc(e)}">`).join('')}</datalist>
      <datalist id="bell-weights">${[4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48].map((w) => `<option value="${w}">`).join('')}</datalist>
    </div>
    ${foot(Boolean(record), record ? 'Save changes' : 'Save session')}`,
    {
      onReady(f) {
        const list = f.querySelector('.ex-list');
        let lastFocusedRow = list.querySelector('.ex-row');
        f.querySelector('[data-add-ex]').onclick = () => {
          list.insertAdjacentHTML('beforeend', exRow({}, defaultUnit));
          lastFocusedRow = list.lastElementChild;
          lastFocusedRow.querySelector('input').focus();
        };
        list.addEventListener('click', (e) => {
          const btn = e.target.closest('[data-remove-ex]');
          if (!btn) return;
          if (list.children.length > 1) btn.closest('.ex-row').remove();
          else btn.closest('.ex-row').querySelectorAll('input').forEach((i) => (i.value = ''));
        });
        list.addEventListener('change', (e) => {
          if (e.target.name === 'exercise') updateHint(e.target.closest('.ex-row'));
        });
        list.addEventListener('focusin', (e) => {
          lastFocusedRow = e.target.closest('.ex-row') || lastFocusedRow;
        });
        f.querySelectorAll('[data-bell]').forEach((b) => {
          b.onclick = () => {
            const [w, u] = b.dataset.bell.split('|');
            const row = lastFocusedRow || list.querySelector('.ex-row');
            row.querySelector('[name=weight]').value = w;
            row.querySelector('[name=unit]').value = u;
          };
        });
        list.querySelectorAll('.ex-row').forEach((row) => {
          const name = row.querySelector('[name=exercise]').value.trim();
          const last = name ? lastForExercise(name) : null;
          if (last) row.querySelector('.ex-hint').textContent = `Last time: ${fmt1(last.weight)} ${last.unit}, ${last.sets} × ${last.reps} (${daysAgoLabel(last.date)})`;
        });
        wireDelete(f, record, 'session');
      },
      onSubmit(f) {
        const date = f.date.value;
        if (!date) return 'Pick a date.';
        const items = [...f.querySelectorAll('.ex-row')]
          .map((row) => ({
            exercise: row.querySelector('[name=exercise]').value.trim(),
            weight: num(row.querySelector('[name=weight]').value),
            unit: row.querySelector('[name=unit]').value,
            sets: num(row.querySelector('[name=sets]').value),
            reps: num(row.querySelector('[name=reps]').value),
          }))
          .filter((it) => it.exercise || it.weight || it.sets || it.reps);
        if (!items.length) return 'Add at least one exercise.';
        const bad = items.find((it) => !it.exercise || !it.sets || !it.reps);
        if (bad) return 'Each exercise needs a name, sets and reps.';
        if (items.some((it) => it.weight != null && it.weight < 0)) return 'Bell weight can’t be negative.';
        // Remember new exercise names for next time.
        const known = new Set(s.exercises.map((e) => e.toLowerCase()));
        const added = items.map((it) => it.exercise).filter((n) => !known.has(n.toLowerCase()));
        if (added.length) updateSettings({ exercises: [...s.exercises, ...new Set(added)] });
        save({
          ...(record || {}),
          type: 'kb',
          date,
          duration: num(f.duration.value),
          rpe: num(f.rpe.value),
          items: items.map((it) => ({ ...it, weight: it.weight ?? 0 })),
          notes: f.notes.value.trim(),
        });
        toast(record ? 'Session updated' : 'Kettlebell session saved');
        return null;
      },
    },
  );
}

/* ---------- Cardio ---------- */

function cardioFields(typeId, rec, s) {
  const fields = fieldsFor(typeId);
  const dist = rec.distanceUnit || s.distanceUnit;
  const metric = dist === 'km';
  const out = [];
  if (fields.includes('distance')) out.push(`<label class="field"><span>Distance (${dist})</span><input name="distance" type="number" inputmode="decimal" min="0" step="0.01" value="${rec.distance ?? ''}"></label>`);
  if (fields.includes('steps')) out.push(`<label class="field"><span>${typeId === 'step-ups' ? 'Step-ups (count)' : 'Steps'}</span><input name="steps" type="number" inputmode="numeric" min="0" step="1" value="${rec.steps ?? ''}"></label>`);
  if (fields.includes('boxHeight')) out.push(`<label class="field"><span>Box height (${metric ? 'cm' : 'in'})</span><input name="boxHeight" type="number" inputmode="decimal" min="0" step="0.5" value="${rec.boxHeight ?? ''}"></label>`);
  if (fields.includes('load')) out.push(`<label class="field"><span>Added load (${rec.loadUnit || s.weightUnit})</span><input name="load" type="number" inputmode="decimal" min="0" step="0.5" value="${rec.load ?? ''}" placeholder="Vest or bells"></label>`);
  if (fields.includes('elevation')) out.push(`<label class="field"><span>Elevation gain (${elevUnit(dist)})</span><input name="elevation" type="number" inputmode="numeric" min="0" step="1" value="${rec.elevation ?? ''}"></label>`);
  if (fields.includes('place')) out.push(`<label class="field wide"><span>Trail or place</span><input name="place" type="text" value="${esc(rec.place || '')}" autocomplete="off"></label>`);
  return out.join('');
}

export function openCardioForm({ date = todayISO(), id = null, activity = null } = {}) {
  const s = getSettings();
  const record = id ? getRecord(id) : null;
  const types = s.cardioTypes.filter((t) => !t.hidden || t.id === record?.activity);
  let current = record?.activity || activity || types[0]?.id;
  const draft = { ...(record || {}) };

  openSheet(
    `${head(record ? 'Edit cardio' : 'Cardio')}
    <div class="sheet-body">
      <fieldset class="activity-pick">
        <legend>Activity</legend>
        <div class="chip-row">
          ${types.map((t) => `<label class="chip radio"><input type="radio" name="activity" value="${esc(t.id)}" ${t.id === current ? 'checked' : ''}><span>${esc(t.name)}</span></label>`).join('')}
        </div>
      </fieldset>
      <div class="field-row three">
        <label class="field"><span>Date</span><input type="date" name="date" value="${esc(record?.date || date)}"></label>
        <label class="field"><span>Minutes</span><input type="number" name="duration" inputmode="numeric" min="1" step="1" value="${record?.duration ?? ''}" data-autofocus></label>
        <label class="field"><span>Effort (1–10)</span><select name="rpe">${rpeOptions(record?.rpe)}</select></label>
      </div>
      <div class="field-row three" id="cardio-extra">${cardioFields(current, draft, s)}</div>
      <div class="field-row three">
        <label class="field"><span>Avg heart rate</span><input name="hr" type="number" inputmode="numeric" min="30" max="230" step="1" value="${record?.hr ?? ''}" placeholder="bpm"></label>
      </div>
      <label class="field"><span>Notes</span><textarea name="notes" rows="2">${esc(record?.notes || '')}</textarea></label>
    </div>
    ${foot(Boolean(record), record ? 'Save changes' : 'Save cardio')}`,
    {
      onReady(f) {
        f.querySelectorAll('[name=activity]').forEach((r) => {
          r.onchange = () => {
            // Keep anything already typed when switching activity.
            for (const k of ['distance', 'steps', 'boxHeight', 'load', 'elevation', 'place']) {
              const el = f.querySelector(`[name=${k}]`);
              if (el) draft[k] = el.value;
            }
            current = r.value;
            f.querySelector('#cardio-extra').innerHTML = cardioFields(current, draft, s);
          };
        });
        wireDelete(f, record, 'cardio entry');
      },
      onSubmit(f) {
        const date = f.date.value;
        const duration = num(f.duration.value);
        if (!date) return 'Pick a date.';
        if (!current) return 'Pick an activity.';
        if (!duration || duration <= 0) return 'Enter how many minutes.';
        const val = (k) => (f.querySelector(`[name=${k}]`) ? num(f.querySelector(`[name=${k}]`).value) : null);
        const rec = {
          ...(record || {}),
          type: 'cardio',
          activity: current,
          date,
          duration,
          rpe: num(f.rpe.value),
          hr: num(f.hr.value),
          distance: val('distance'),
          steps: val('steps'),
          boxHeight: val('boxHeight'),
          load: val('load'),
          elevation: val('elevation'),
          place: f.querySelector('[name=place]')?.value.trim() || null,
          notes: f.notes.value.trim(),
        };
        rec.distanceUnit = record?.distanceUnit || s.distanceUnit;
        if (rec.load != null) rec.loadUnit = record?.loadUnit || s.weightUnit;
        for (const k of Object.keys(rec)) if (rec[k] === null || rec[k] === '') delete rec[k];
        if (['distance', 'steps', 'elevation', 'load', 'boxHeight'].some((k) => rec[k] != null && rec[k] < 0)) return 'Numbers can’t be negative.';
        save(rec);
        toast(record ? 'Cardio updated' : 'Cardio saved');
        return null;
      },
    },
  );
}
