// Progress: week / month / year views with charts, calendar and records.

import {
  esc, todayISO, addDays, eachDay, startOfWeek, fmt0, fmt1, fmtCompact, fmtHours,
  fmtDateFull, fmtMonthShort, fmtWeekdayShort, daysBetween,
} from './util.js';
import { getSettings, records, recordsBetween, EAT_LEVELS, eatLevel } from './store.js';
import {
  periodFor, shiftPeriod, summarize, minutesByActivity, activityTotals, kbVolumeSeries,
  exerciseSeries, exercisesUsed, eatingByBucket, bodySeries, dayInfo, goalWeeks, personalRecords,
} from './stats.js';
import * as charts from './charts.js';
import { state, on, rerender, icon } from './ui.js';
import { cssVar } from './util.js';

const KIND_NOUN = { week: 'week', month: 'month', year: 'year' };

/* ---------- Comparison with the previous period ---------- */

function comparisonRanges(period) {
  const prev = periodFor(period.kind, shiftPeriod(period.kind, period.start, -1));
  const today = todayISO();
  // For the period in progress, compare against the same number of days last time.
  if (period.start <= today && today <= period.end) {
    const n = daysBetween(period.start, today);
    const prevEnd = addDays(prev.start, n);
    return { cur: [period.start, today], prev: [prev.start, prevEnd < prev.end ? prevEnd : prev.end], partial: true };
  }
  return { cur: [period.start, period.end], prev: [prev.start, prev.end], partial: false };
}

function delta(cur, prev, kind, partial) {
  if (!prev && !cur) return '';
  const when = partial ? `same point last ${KIND_NOUN[kind]}` : `last ${KIND_NOUN[kind]}`;
  if (!prev) return `<span class="delta flat">Nothing logged last ${KIND_NOUN[kind]}</span>`;
  const pct = ((cur - prev) / prev) * 100;
  if (Math.abs(pct) < 1) return `<span class="delta flat">No change vs ${when}</span>`;
  const up = pct > 0;
  return `<span class="delta ${up ? 'up' : 'down'}"><span aria-hidden="true">${up ? '▲' : '▼'}</span> ${fmt0(Math.abs(pct))}% vs ${when}</span>`;
}

function scoreboard(period) {
  const s = getSettings();
  const r = comparisonRanges(period);
  const cur = summarize(...r.cur);
  const prev = summarize(...r.prev);
  const full = summarize(period.start, period.end);
  const tiles = [
    { label: 'Active days', value: `${full.activeDays}`, unit: `of ${full.elapsed || period.buckets.length}`, d: delta(cur.activeDays, prev.activeDays, period.kind, r.partial) },
    { label: 'Training time', value: fmtHours(full.trainingMin), unit: '', d: delta(cur.trainingMin, prev.trainingMin, period.kind, r.partial) },
    { label: 'Kettlebell volume', value: fmtCompact(full.volume), unit: s.weightUnit, d: delta(cur.volume, prev.volume, period.kind, r.partial) },
    { label: 'Distance', value: fmt1(full.distance), unit: s.distanceUnit, d: delta(cur.distance, prev.distance, period.kind, r.partial) },
    { label: 'Ate well', value: `${full.eat.well}`, unit: full.eat.logged ? `of ${full.eat.logged} logged days` : 'days', d: delta(cur.eat.well, prev.eat.well, period.kind, r.partial) },
  ];
  if (period.kind !== 'week') {
    const gw = goalWeeks(period);
    tiles.push({ label: 'Weeks on goal', value: `${gw.all}`, unit: `of ${gw.weeks} finished`, d: gw.weeks ? `<span class="delta flat">Cardio ${gw.cardio}, bells ${gw.kb}, eating ${gw.eat}</span>` : '' });
  }
  return `
    <div class="scoreboard" role="list">
      ${tiles.map((t) => `
        <div class="score" role="listitem">
          <span class="score-label">${t.label}</span>
          <span class="score-value">${t.value}${t.unit ? ` <small>${t.unit}</small>` : ''}</span>
          ${t.d || '<span class="delta flat">&nbsp;</span>'}
        </div>`).join('')}
    </div>`;
}

/* ---------- Panels ---------- */

function table(headers, rows) {
  return `
    <div class="table-wrap"><table>
      <thead><tr>${headers.map((h, i) => `<th scope="col" class="${i ? 'num' : ''}">${h}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${r.map((c, i) => (i ? `<td class="num">${c}</td>` : `<th scope="row">${c}</th>`)).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
}

function panel({ id, title, sub = '', body, tableHtml = null, controls = '', wide = false, tall = false }) {
  const asTable = tableHtml && state.tables[id];
  return `
    <section class="panel ${wide ? 'wide' : ''}" aria-labelledby="${id}-h">
      <div class="panel-head">
        <div>
          <h2 id="${id}-h">${title}</h2>
          ${sub ? `<p class="panel-sub">${sub}</p>` : ''}
        </div>
        <div class="panel-tools">
          ${controls}
          ${tableHtml ? `<button class="icon-btn ${asTable ? 'on' : ''}" data-action="toggle-table" data-chart="${id}" data-focus-key="tbl-${id}" aria-pressed="${Boolean(asTable)}" title="${asTable ? 'Show chart' : 'Show as table'}" aria-label="${asTable ? 'Show chart' : 'Show as table'}">${icon(asTable ? 'chart' : 'table')}</button>` : ''}
        </div>
      </div>
      ${asTable ? tableHtml : body ?? `<div class="chart-box ${tall ? 'tall' : ''}"><canvas id="${id}" role="img" aria-label="${esc(title)} chart"></canvas></div>`}
    </section>`;
}

const showChart = (id) => !state.tables[id] && document.getElementById(id);

/* ---------- Calendar ---------- */

function heatLevel(min) {
  if (!min) return 0;
  if (min < 20) return 1;
  if (min < 45) return 2;
  if (min < 75) return 3;
  return 4;
}

function cellTitle(info) {
  const training = info.minutes
    ? `${fmt0(info.minutes)} min training (${info.kinds.join(', ')})`
    : info.sessions ? `trained (${info.kinds.join(', ')})` : 'no training';
  const lvl = eatLevel(info.eat);
  return `${fmtDateFull(info.date)}: ${training}, ${lvl ? lvl.label.toLowerCase() : 'eating not logged'}`;
}

function calCell(date, metric, small) {
  const today = todayISO();
  const future = date > today;
  const info = dayInfo(date);
  let cls = 'cal-cell';
  let inner = small ? '' : `<span class="cal-num">${Number(date.slice(8))}</span>`;
  if (!future) {
    if (metric === 'training') cls += ` heat-${heatLevel(info.minutes)}`;
    else {
      const lvl = eatLevel(info.eat);
      if (lvl) {
        cls += ` eat-${lvl.key}`;
        if (!small) inner += `<span class="cal-glyph" aria-hidden="true">${lvl.glyph}</span>`;
      } else cls += ' heat-0';
    }
  } else cls += ' future';
  if (date === today) cls += ' today';
  return `<button type="button" class="${cls}" data-action="cal-day" data-date="${date}" data-focus-key="cal-${date}" title="${esc(cellTitle(info))}" aria-label="${esc(cellTitle(info))}" ${future ? 'disabled' : ''}>${inner}</button>`;
}

function calendar(period) {
  const s = getSettings();
  const metric = state.calMetric;
  const weekdayHeads = eachDay(startOfWeek('2026-01-05', s.weekStart), addDays(startOfWeek('2026-01-05', s.weekStart), 6)).map(fmtWeekdayShort);
  let grid;
  if (period.kind === 'year') {
    const start = startOfWeek(period.start, s.weekStart);
    const end = period.end;
    const weeks = [];
    for (let w = start; w <= end; w = addDays(w, 7)) weeks.push(w);
    const months = weeks.map((w, i) => {
      const firstOfMonthInWeek = eachDay(w, addDays(w, 6)).find((d) => d.slice(8) === '01' && d.slice(0, 4) === period.start.slice(0, 4));
      return firstOfMonthInWeek ? `<span style="grid-column:${i + 1}">${fmtMonthShort(firstOfMonthInWeek)}</span>` : '';
    }).join('');
    const cells = weeks.map((w) => eachDay(w, addDays(w, 6)).map((d) =>
      d < period.start || d > period.end ? '<span class="cal-cell blank"></span>' : calCell(d, metric, true)).join('')).join('');
    grid = `
      <div class="year-scroll" data-scroll-end>
        <div class="year-grid" style="--weeks:${weeks.length}">
          <div class="year-months">${months}</div>
          <div class="year-days">${weekdayHeads.map((d, i) => `<span>${i % 2 === 0 ? d : ''}</span>`).join('')}</div>
          <div class="year-cells">${cells}</div>
        </div>
      </div>`;
  } else {
    const start = startOfWeek(period.start, s.weekStart);
    const days = [];
    for (let d = start; d <= period.end || days.length % 7; d = addDays(d, 1)) days.push(d);
    grid = `
      <div class="month-grid">
        ${weekdayHeads.map((d) => `<span class="cal-head">${d}</span>`).join('')}
        ${days.map((d) => (d < period.start || d > period.end ? '<span class="cal-cell blank"></span>' : calCell(d, metric, false))).join('')}
      </div>`;
  }

  const legend = metric === 'training'
    ? `<div class="cal-legend"><span>Less</span>${[0, 1, 2, 3, 4].map((l) => `<span class="cal-key heat-${l}" title="${['None', 'Under 20 min', '20–44 min', '45–74 min', '75+ min'][l]}"></span>`).join('')}<span>More</span><span class="quiet">Squares shade by training minutes.</span></div>`
    : `<div class="cal-legend">${EAT_LEVELS.map((l) => `<span class="cal-key eat-${l.key}"><span aria-hidden="true">${l.glyph}</span></span><span>${l.label}</span>`).join('')}<span class="cal-key heat-0"></span><span>Not logged</span></div>`;

  const controls = `
    <div class="segmented small" role="group" aria-label="Calendar shows">
      <button class="seg ${metric === 'training' ? 'on' : ''}" aria-pressed="${metric === 'training'}" data-action="cal-metric" data-value="training" data-focus-key="calm-t">Training</button>
      <button class="seg ${metric === 'eating' ? 'on' : ''}" aria-pressed="${metric === 'eating'}" data-action="cal-metric" data-value="eating" data-focus-key="calm-e">Eating</button>
    </div>`;

  return panel({
    id: 'cal',
    title: period.kind === 'year' ? 'Year at a glance' : 'Calendar',
    sub: 'Tap a day for details.',
    controls,
    wide: period.kind === 'year',
    body: `${grid}${legend}<p class="cal-info" id="cal-info" aria-live="polite"></p>`,
  });
}

/* ---------- Main render ---------- */

function emptyState() {
  return `
    <div class="empty-hero">
      <h2>Your charts will show up here</h2>
      <p>Log a few kettlebell sessions, cardio, or eating check-ins on the Today screen. Weekly, monthly and yearly views fill in as you go.</p>
      <div class="row">
        <a class="btn primary" href="#today">Log something today</a>
        <button class="btn ghost" data-action="load-demo">Preview with sample data</button>
      </div>
    </div>`;
}

export function renderProgress(root) {
  charts.destroyAll();
  const s = getSettings();
  const period = periodFor(state.periodKind, state.periodAnchor);
  const today = todayISO();
  const isCurrent = period.start <= today && today <= period.end;
  const labels = period.buckets.map((b) => b.label);
  const longLabels = period.buckets.map((b) => b.long);
  const hasAny = records().length > 0;

  const head = `
    <div class="progress-head">
      <h1 class="view-title">Progress</h1>
      <div class="segmented" role="group" aria-label="Period">
        ${['week', 'month', 'year'].map((k) => `<button class="seg ${state.periodKind === k ? 'on' : ''}" aria-pressed="${state.periodKind === k}" data-action="period-kind" data-value="${k}" data-focus-key="pk-${k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}
      </div>
      <div class="period-nav">
        <button class="icon-btn" data-action="period-shift" data-dir="-1" data-focus-key="ps-prev" aria-label="Previous ${state.periodKind}">${icon('left')}</button>
        <span class="period-label" aria-live="polite">${period.label}</span>
        <button class="icon-btn" data-action="period-shift" data-dir="1" data-focus-key="ps-next" aria-label="Next ${state.periodKind}" ${isCurrent || period.start > today ? 'disabled' : ''}>${icon('right')}</button>
        ${isCurrent ? '' : `<button class="btn ghost small" data-action="period-now">This ${state.periodKind}</button>`}
      </div>
    </div>`;

  if (!hasAny) {
    root.innerHTML = head + emptyState();
    return;
  }

  // Data
  const mins = minutesByActivity(period);
  const totals = activityTotals(period);
  const vol = kbVolumeSeries(period);
  const used = exercisesUsed();
  if (!state.exercise || !used.includes(state.exercise)) state.exercise = used[0] || null;
  const exUnit = state.exerciseMetric === 'reps' ? 'reps' : s.weightUnit;
  const exValues = state.exercise ? exerciseSeries(period, state.exercise, state.exerciseMetric) : [];
  const eat = eatingByBucket(period);
  const sum = summarize(period.start, period.end);
  const bw = bodySeries(period, 'bodyweight');
  const sleep = bodySeries(period, 'sleep');
  const pr = personalRecords();

  // Habit adherence across logged days in the period
  const dayRecs = recordsBetween(period.start, period.end).filter((r) => r.type === 'day');
  const habitRates = s.habits.map((h) => ({ name: h.name, n: dayRecs.filter((r) => r.habits?.[h.id]).length }));

  const bucketWord = period.kind === 'year' ? 'month' : 'day';
  const panels = [];

  panels.push(panel({
    id: 'c-minutes', title: 'Training time', wide: true,
    sub: `Minutes per ${bucketWord}, by activity. ${fmtHours(sum.trainingMin)} total.`,
    tableHtml: table([bucketWord === 'month' ? 'Month' : 'Day', ...mins.map((m) => m.name), 'Total'],
      period.buckets.map((b, i) => [b.long, ...mins.map((m) => fmt0(m.values[i])), fmt0(mins.reduce((t, m) => t + m.values[i], 0))])),
    body: mins.length ? null : '<p class="empty">No training logged in this period.</p>',
  }));

  panels.push(calendar(period));

  panels.push(panel({
    id: 'c-mix', title: 'Activity mix', sub: 'Total minutes by activity.',
    tableHtml: table(['Activity', 'Minutes'], totals.map((t) => [esc(t.name), fmt0(t.minutes)])),
    body: totals.length ? null : '<p class="empty">Nothing logged yet in this period.</p>',
  }));

  panels.push(panel({
    id: 'c-volume', title: 'Kettlebell volume',
    sub: `Weight × reps per ${bucketWord}, in ${s.weightUnit}. ${sum.kbSessions} ${sum.kbSessions === 1 ? 'session' : 'sessions'}, ${fmt0(sum.reps)} reps.`,
    tableHtml: table([bucketWord === 'month' ? 'Month' : 'Day', `Volume (${s.weightUnit})`, 'Sessions'], period.buckets.map((b, i) => [b.long, fmt0(vol[i].volume), vol[i].sessions])),
    body: sum.kbSessions ? null : '<p class="empty">No kettlebell sessions in this period.</p>',
  }));

  if (used.length) {
    const controls = `
      <label class="sr-only" for="ex-pick">Exercise</label>
      <select id="ex-pick" class="select small" data-action="pick-exercise" data-focus-key="ex-pick">${used.map((e) => `<option ${e === state.exercise ? 'selected' : ''}>${esc(e)}</option>`).join('')}</select>
      <label class="sr-only" for="ex-metric">Measure</label>
      <select id="ex-metric" class="select small" data-action="pick-ex-metric" data-focus-key="ex-metric">
        <option value="top" ${state.exerciseMetric === 'top' ? 'selected' : ''}>Heaviest bell</option>
        <option value="reps" ${state.exerciseMetric === 'reps' ? 'selected' : ''}>Total reps</option>
        <option value="volume" ${state.exerciseMetric === 'volume' ? 'selected' : ''}>Volume</option>
      </select>`;
    panels.push(panel({
      id: 'c-exercise', title: 'Exercise progress', controls,
      sub: `${esc(state.exercise)}, ${state.exerciseMetric === 'top' ? `heaviest bell per ${bucketWord}` : state.exerciseMetric === 'reps' ? `total reps per ${bucketWord}` : `volume per ${bucketWord}`}.`,
      tableHtml: table([bucketWord === 'month' ? 'Month' : 'Day', exUnit], period.buckets.map((b, i) => [b.long, exValues[i] == null ? '–' : fmt1(exValues[i])])),
      body: exValues.some((v) => v != null) ? null : `<p class="empty">No ${esc(state.exercise)} in this period.</p>`,
    }));
  }

  // Eating
  const split = sum.eat;
  const splitBar = split.logged
    ? `<div class="split" role="img" aria-label="${split.well} ate well, ${split.mixed} mixed, ${split.off} off track">
        ${EAT_LEVELS.map((l) => { const n = split[l.key]; return n ? `<span class="split-seg eat-${l.key}" style="flex:${n}"></span>` : ''; }).join('')}
      </div>
      <ul class="split-legend">
        ${EAT_LEVELS.map((l) => `<li><span class="cal-key eat-${l.key}"><span aria-hidden="true">${l.glyph}</span></span>${l.label} <b>${split[l.key]}</b></li>`).join('')}
      </ul>`
    : '<p class="empty">No eating check-ins in this period.</p>';
  panels.push(panel({
    id: 'c-habits', title: 'Eating',
    sub: split.logged ? `${fmt0((split.well / split.logged) * 100)}% of logged days were good eating days.` : '',
    tableHtml: split.logged ? table(['Habit', 'Days', 'Share of logged days'], habitRates.map((h) => [esc(h.name), h.n, `${fmt0((h.n / dayRecs.length) * 100)}%`])) : null,
    body: state.tables['c-habits'] ? null : `${splitBar}${split.logged && s.habits.length ? `<h3 class="mini-h">Habits kept, out of ${dayRecs.length} check-in ${dayRecs.length === 1 ? 'day' : 'days'}</h3><div class="chart-box short"><canvas id="c-habits" role="img" aria-label="Habits kept chart"></canvas></div>` : ''}`,
  }));

  if (period.kind === 'year' && split.logged) {
    panels.push(panel({
      id: 'c-eat-months', title: 'Eating by month', sub: 'Days in each rating.',
      tableHtml: table(['Month', ...EAT_LEVELS.map((l) => l.label)], period.buckets.map((b, i) => [b.long, eat[i].well, eat[i].mixed, eat[i].off])),
    }));
  }

  if (bw.some((v) => v != null)) {
    const first = sum.weightFirst, last = sum.weightLast;
    const change = first != null && last != null ? last - first : 0;
    panels.push(panel({
      id: 'c-bw', title: 'Bodyweight',
      sub: first != null ? `${period.kind === 'year' ? 'Monthly' : 'Daily'} average, ${s.weightUnit}. ${change ? `${change > 0 ? '+' : ''}${fmt1(change)} ${s.weightUnit} over the ${KIND_NOUN[period.kind]}.` : ''}` : '',
      tableHtml: table([bucketWord === 'month' ? 'Month' : 'Day', s.weightUnit], period.buckets.map((b, i) => [b.long, bw[i] == null ? '–' : fmt1(bw[i])])),
    }));
  }

  if (sleep.some((v) => v != null)) {
    panels.push(panel({
      id: 'c-sleep', title: 'Sleep',
      sub: sum.sleepAvg != null ? `Average ${fmt1(sum.sleepAvg)} hours a night.` : '',
      tableHtml: table([bucketWord === 'month' ? 'Month' : 'Day', 'Hours'], period.buckets.map((b, i) => [b.long, sleep[i] == null ? '–' : fmt1(sleep[i])])),
    }));
  }

  // Personal records (all time)
  const prBody = `
    ${pr.exercises.length ? `
      <div class="table-wrap"><table>
        <thead><tr><th scope="col">Exercise</th><th scope="col" class="num">Heaviest bell</th><th scope="col" class="num">Most reps in a session</th><th scope="col" class="num">Times logged</th></tr></thead>
        <tbody>${pr.exercises.map((e) => `
          <tr><th scope="row">${esc(e.exercise)}</th>
          <td class="num">${e.top ? `${fmt1(e.top)} ${s.weightUnit}<small>${fmtDateFull(e.topDate)}</small>` : '–'}</td>
          <td class="num">${fmt0(e.reps)}<small>${fmtDateFull(e.repsDate)}</small></td>
          <td class="num">${e.sessions}</td></tr>`).join('')}
        </tbody></table></div>` : ''}
    ${pr.highlights.length ? `<ul class="pr-list">${pr.highlights.map((h) => `
      <li><span class="pr-label">${esc(h.label)}</span><span class="pr-value">${h.kind === 'distance' ? fmt1(h.value) : fmt0(h.value)} <small>${h.unit}</small></span><span class="pr-date">${fmtDateFull(h.date)}</span></li>`).join('')}</ul>` : ''}`;
  panels.push(panel({ id: 'pr', title: 'Personal records', sub: 'All time.', wide: true, body: prBody }));

  const ORDER = ['c-minutes', 'cal', 'c-habits', 'c-eat-months', 'c-mix', 'c-volume', 'c-exercise', 'c-bw', 'c-sleep', 'pr'];
  const idOf = (html) => html.match(/aria-labelledby="(.+?)-h"/)[1];
  panels.sort((a, b) => ORDER.indexOf(idOf(a)) - ORDER.indexOf(idOf(b)));
  root.innerHTML = `${head}${scoreboard(period)}<div class="panel-grid">${panels.join('')}</div>`;

  // Charts (skipped where the table view is on or the panel is empty)
  if (showChart('c-minutes') && mins.length) {
    charts.stackedBar(document.getElementById('c-minutes'), {
      labels, longLabels, unit: 'min',
      series: mins.map((m) => ({ name: m.name, values: m.values, color: charts.colorFor(m.key) })),
    });
  }
  if (showChart('c-mix') && totals.length) {
    const box = document.getElementById('c-mix').parentElement;
    box.style.height = `${Math.max(120, totals.length * 40 + 40)}px`;
    charts.hbar(document.getElementById('c-mix'), {
      labels: totals.map((t) => t.name), values: totals.map((t) => t.minutes),
      colors: totals.map((t) => charts.colorFor(t.key)), unit: 'min',
    });
  }
  if (showChart('c-volume') && sum.kbSessions) {
    charts.bar(document.getElementById('c-volume'), {
      labels, longLabels, values: vol.map((v) => Math.round(v.volume)), color: charts.colorFor('kb'),
      unit: s.weightUnit, fmt: fmtCompact, label: 'Volume',
    });
  }
  if (showChart('c-exercise') && exValues.some((v) => v != null)) {
    charts.line(document.getElementById('c-exercise'), {
      labels, longLabels, values: exValues.map((v) => (v == null ? null : Math.round(v * 10) / 10)),
      color: charts.colorFor('kb'), unit: exUnit, fmt: state.exerciseMetric === 'volume' ? fmtCompact : fmt1,
      label: state.exercise,
    });
  }
  if (showChart('c-habits') && split.logged && s.habits.length) {
    const box = document.getElementById('c-habits').parentElement;
    box.style.height = `${Math.max(120, habitRates.length * 36 + 40)}px`;
    charts.hbar(document.getElementById('c-habits'), {
      labels: habitRates.map((h) => h.name), values: habitRates.map((h) => h.n),
      colors: habitRates.map(() => cssVar('--good')), unit: 'days', max: dayRecs.length,
    });
  }
  if (showChart('c-eat-months')) {
    charts.stackedStatus(document.getElementById('c-eat-months'), {
      labels, longLabels,
      series: [
        { name: 'Ate well', values: eat.map((e) => e.well), color: cssVar('--good') },
        { name: 'Mixed', values: eat.map((e) => e.mixed), color: cssVar('--warn') },
        { name: 'Off track', values: eat.map((e) => e.off), color: cssVar('--bad') },
      ],
    });
  }
  if (showChart('c-bw')) {
    charts.line(document.getElementById('c-bw'), {
      labels, longLabels, values: bw.map((v) => (v == null ? null : Math.round(v * 10) / 10)),
      color: cssVar('--series-7'), unit: s.weightUnit, fmt: fmt1, label: 'Bodyweight',
    });
  }
  if (showChart('c-sleep')) {
    charts.bar(document.getElementById('c-sleep'), {
      labels, longLabels, values: sleep.map((v) => (v == null ? null : Math.round(v * 10) / 10)),
      color: cssVar('--series-7'), unit: 'h', fmt: fmt1, label: 'Sleep',
    });
  }

  const scroller = root.querySelector('[data-scroll-end]');
  if (scroller) scroller.scrollLeft = scroller.scrollWidth;
}

/* ---------- Actions ---------- */

on('click', 'period-kind', (el) => { state.periodKind = el.dataset.value; rerender(); });
on('click', 'period-shift', (el) => {
  const next = shiftPeriod(state.periodKind, state.periodAnchor, Number(el.dataset.dir));
  if (next > todayISO() && Number(el.dataset.dir) > 0) {
    const p = periodFor(state.periodKind, next);
    if (p.start > todayISO()) return;
  }
  state.periodAnchor = next;
  rerender();
});
on('click', 'period-now', () => { state.periodAnchor = todayISO(); rerender(); });
on('click', 'toggle-table', (el) => { state.tables[el.dataset.chart] = !state.tables[el.dataset.chart]; rerender(); });
on('click', 'cal-metric', (el) => { state.calMetric = el.dataset.value; rerender(); });
on('change', 'pick-exercise', (el) => { state.exercise = el.value; rerender(); });
on('change', 'pick-ex-metric', (el) => { state.exerciseMetric = el.value; rerender(); });

on('click', 'cal-day', (el) => {
  const info = dayInfo(el.dataset.date);
  const out = document.getElementById('cal-info');
  if (!out) return;
  document.querySelectorAll('.cal-cell.picked').forEach((c) => c.classList.remove('picked'));
  el.classList.add('picked');
  out.innerHTML = `${esc(cellTitle(info))}. <a href="#today" data-action="open-day" data-date="${info.date}">Open this day</a>`;
});
on('click', 'open-day', (el, e) => {
  e.preventDefault();
  state.date = el.dataset.date;
  location.hash = '#today';
});
