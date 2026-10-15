// Turns raw records into numbers for the Today and Progress screens.

import {
  addDays, addMonths, startOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear,
  eachDay, todayISO, fmtWeekdayShort, fmtMonthDayShort, fmtMonthShort, fmtMonthYear,
  convertWeight, convertDistance, convertElevation, fromISO,
} from './util.js';
import { records, recordsBetween, recordsOn, getSettings } from './store.js';

/* ---------- Per-record measures ---------- */

export const isTraining = (r) => r.type === 'kb' || r.type === 'cardio';
export const minutesOf = (r) => (isTraining(r) ? Number(r.duration) || 0 : 0);

export function kbVolume(r, unit = getSettings().weightUnit) {
  if (r.type !== 'kb') return 0;
  return (r.items || []).reduce((sum, it) => {
    const w = convertWeight(Number(it.weight) || 0, it.unit || unit, unit);
    return sum + w * (Number(it.sets) || 0) * (Number(it.reps) || 0);
  }, 0);
}

export function kbReps(r) {
  if (r.type !== 'kb') return 0;
  return (r.items || []).reduce((s, it) => s + (Number(it.sets) || 0) * (Number(it.reps) || 0), 0);
}

export function distanceOf(r, unit = getSettings().distanceUnit) {
  if (r.type !== 'cardio' || r.distance == null) return 0;
  return convertDistance(Number(r.distance) || 0, r.distanceUnit || unit, unit);
}

export function elevationOf(r, unit = getSettings().distanceUnit) {
  if (r.type !== 'cardio' || r.elevation == null) return 0;
  return convertElevation(Number(r.elevation) || 0, r.distanceUnit || unit, unit);
}

/* ---------- Periods ---------- */

export function periodFor(kind, anchor, weekStart = getSettings().weekStart) {
  if (kind === 'week') {
    const start = startOfWeek(anchor, weekStart);
    const end = addDays(start, 6);
    const sameMonth = start.slice(0, 7) === end.slice(0, 7);
    const label = sameMonth
      ? `${fmtMonthDayShort(start)} – ${Number(end.slice(8))}`
      : `${fmtMonthDayShort(start)} – ${fmtMonthDayShort(end)}`;
    return {
      kind, start, end, label: `${label}, ${end.slice(0, 4)}`,
      buckets: eachDay(start, end).map((d) => ({ key: d, start: d, end: d, label: fmtWeekdayShort(d), long: fmtMonthDayShort(d) })),
    };
  }
  if (kind === 'month') {
    const start = startOfMonth(anchor);
    const end = endOfMonth(anchor);
    return {
      kind, start, end, label: fmtMonthYear(start),
      buckets: eachDay(start, end).map((d) => ({ key: d, start: d, end: d, label: String(Number(d.slice(8))), long: `${fmtWeekdayShort(d)} ${fmtMonthDayShort(d)}` })),
    };
  }
  const start = startOfYear(anchor);
  const end = endOfYear(anchor);
  const buckets = [];
  for (let m = start; m <= end; m = addMonths(m, 1)) {
    buckets.push({ key: m.slice(0, 7), start: m, end: endOfMonth(m), label: fmtMonthShort(m), long: fmtMonthYear(m) });
  }
  return { kind: 'year', start, end, label: start.slice(0, 4), buckets };
}

export function shiftPeriod(kind, anchor, dir) {
  if (kind === 'week') return addDays(anchor, 7 * dir);
  if (kind === 'month') return addMonths(startOfMonth(anchor), dir);
  return addMonths(startOfYear(anchor), 12 * dir);
}

const groupByBucket = (period, recs) => {
  const out = period.buckets.map(() => []);
  for (const r of recs) {
    const i = period.buckets.findIndex((b) => r.date >= b.start && r.date <= b.end);
    if (i >= 0) out[i].push(r);
  }
  return out;
};

/* ---------- Summary ---------- */

export function summarize(start, end) {
  const s = getSettings();
  const recs = recordsBetween(start, end);
  const today = todayISO();
  const lastDay = end < today ? end : today;
  const elapsed = lastDay >= start ? eachDay(start, lastDay).length : 0;

  const active = new Set();
  let trainingMin = 0, cardioMin = 0, kbMin = 0, kbSessions = 0, volume = 0, reps = 0;
  let distance = 0, elevation = 0, steps = 0;
  const eat = { logged: 0, well: 0, mixed: 0, off: 0 };
  const sleep = [];
  const weights = [];

  for (const r of recs) {
    if (r.type === 'kb') {
      active.add(r.date);
      kbSessions++;
      kbMin += minutesOf(r);
      volume += kbVolume(r, s.weightUnit);
      reps += kbReps(r);
    } else if (r.type === 'cardio') {
      active.add(r.date);
      cardioMin += minutesOf(r);
      distance += distanceOf(r, s.distanceUnit);
      elevation += elevationOf(r, s.distanceUnit);
      steps += Number(r.steps) || 0;
    } else if (r.type === 'day') {
      if (r.eat != null) {
        eat.logged++;
        if (r.eat === 2) eat.well++;
        else if (r.eat === 1) eat.mixed++;
        else eat.off++;
      }
      if (r.sleep != null) sleep.push(Number(r.sleep));
      if (r.bodyweight != null) weights.push({ date: r.date, w: convertWeight(Number(r.bodyweight), r.bodyweightUnit || s.weightUnit, s.weightUnit) });
    }
  }
  trainingMin = cardioMin + kbMin;
  weights.sort((a, b) => a.date.localeCompare(b.date));
  return {
    start, end, elapsed,
    activeDays: active.size,
    trainingMin, cardioMin, kbMin, kbSessions, volume, reps,
    distance, elevation, steps,
    eat,
    sleepAvg: sleep.length ? sleep.reduce((a, b) => a + b, 0) / sleep.length : null,
    weightFirst: weights[0]?.w ?? null,
    weightLast: weights.at(-1)?.w ?? null,
  };
}

/* ---------- Series for charts ---------- */

// Activity keys in a fixed order so colors follow the activity, not its rank.
export function activityKeys() {
  return ['kb', ...getSettings().cardioTypes.map((t) => t.id)];
}

export function activityName(key) {
  if (key === 'kb') return 'Kettlebell';
  const t = getSettings().cardioTypes.find((c) => c.id === key);
  return t ? t.name : key;
}

const activityKey = (r) => (r.type === 'kb' ? 'kb' : r.activity);

export function minutesByActivity(period) {
  const groups = groupByBucket(period, recordsBetween(period.start, period.end).filter(isTraining));
  const keys = activityKeys();
  const series = keys.map((key) => ({
    key, name: activityName(key),
    values: groups.map((g) => g.filter((r) => activityKey(r) === key).reduce((s, r) => s + minutesOf(r), 0)),
  }));
  // Records for cardio types no longer in settings land in "Other".
  const other = groups.map((g) => g.filter((r) => !keys.includes(activityKey(r))).reduce((s, r) => s + minutesOf(r), 0));
  if (other.some(Boolean)) series.push({ key: 'other', name: 'Other', values: other });
  return series.filter((s) => s.values.some(Boolean));
}

export function activityTotals(period) {
  return minutesByActivity(period)
    .map((s) => ({ key: s.key, name: s.name, minutes: s.values.reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.minutes - a.minutes);
}

export function kbVolumeSeries(period) {
  const unit = getSettings().weightUnit;
  const groups = groupByBucket(period, recordsBetween(period.start, period.end).filter((r) => r.type === 'kb'));
  return groups.map((g) => ({ volume: g.reduce((s, r) => s + kbVolume(r, unit), 0), sessions: g.length }));
}

// metric: 'top' (heaviest bell), 'reps' (total reps), 'volume'
export function exerciseSeries(period, exercise, metric) {
  const unit = getSettings().weightUnit;
  const groups = groupByBucket(period, recordsBetween(period.start, period.end).filter((r) => r.type === 'kb'));
  return groups.map((g) => {
    const items = g.flatMap((r) => (r.items || []).filter((it) => it.exercise === exercise));
    if (!items.length) return null;
    if (metric === 'top') return Math.max(...items.map((it) => convertWeight(Number(it.weight) || 0, it.unit || unit, unit)));
    if (metric === 'reps') return items.reduce((s, it) => s + (it.sets || 0) * (it.reps || 0), 0);
    return items.reduce((s, it) => s + convertWeight(Number(it.weight) || 0, it.unit || unit, unit) * (it.sets || 0) * (it.reps || 0), 0);
  });
}

export function exercisesUsed() {
  const counts = new Map();
  for (const r of records()) {
    if (r.type !== 'kb') continue;
    for (const it of r.items || []) counts.set(it.exercise, (counts.get(it.exercise) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
}

export function eatingByBucket(period) {
  const groups = groupByBucket(period, recordsBetween(period.start, period.end).filter((r) => r.type === 'day' && r.eat != null));
  return groups.map((g) => ({
    well: g.filter((r) => r.eat === 2).length,
    mixed: g.filter((r) => r.eat === 1).length,
    off: g.filter((r) => r.eat === 0).length,
  }));
}

export function bodySeries(period, field) {
  const s = getSettings();
  const groups = groupByBucket(period, recordsBetween(period.start, period.end).filter((r) => r.type === 'day' && r[field] != null));
  return groups.map((g) => {
    if (!g.length) return null;
    const vals = g.map((r) => (field === 'bodyweight' ? convertWeight(Number(r.bodyweight), r.bodyweightUnit || s.weightUnit, s.weightUnit) : Number(r[field])));
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  });
}

/* ---------- Calendar data ---------- */

export function dayInfo(date) {
  const recs = recordsOn(date);
  let minutes = 0, sessions = 0;
  const kinds = new Set();
  let day = null;
  for (const r of recs) {
    if (isTraining(r)) {
      minutes += minutesOf(r);
      sessions++;
      kinds.add(activityName(activityKey(r)));
    } else if (r.type === 'day') day = r;
  }
  return { date, minutes, sessions, kinds: [...kinds], eat: day?.eat ?? null };
}

/* ---------- Goals and streaks ---------- */

export function weekProgress(date) {
  const s = getSettings();
  const start = startOfWeek(date, s.weekStart);
  const end = addDays(start, 6);
  const sum = summarize(start, end);
  return {
    start, end,
    cardio: { value: sum.cardioMin, goal: s.goals.cardioMinutes },
    kb: { value: sum.kbSessions, goal: s.goals.kbSessions },
    eat: { value: sum.eat.well, goal: s.goals.ateWellDays },
  };
}

// Weeks (starting inside the period, up to today) that hit each goal.
export function goalWeeks(period) {
  const s = getSettings();
  const today = todayISO();
  let first = startOfWeek(period.start, s.weekStart);
  if (first < period.start) first = addDays(first, 7);
  const out = { weeks: 0, cardio: 0, kb: 0, eat: 0, all: 0 };
  for (let w = first; w <= period.end && w <= today; w = addDays(w, 7)) {
    const p = weekProgress(w);
    const done = addDays(w, 6) < today; // only count finished weeks
    if (!done) continue;
    out.weeks++;
    const c = p.cardio.value >= p.cardio.goal;
    const k = p.kb.value >= p.kb.goal;
    const e = p.eat.value >= p.eat.goal;
    out.cardio += c; out.kb += k; out.eat += e; out.all += c && k && e;
  }
  return out;
}

function runLength(test, from) {
  let n = 0;
  for (let d = from; test(d); d = addDays(d, -1)) n++;
  return n;
}

export function streaks(today = todayISO()) {
  const trained = (d) => recordsOn(d).some(isTraining);
  const ateWell = (d) => recordsOn(d).some((r) => r.type === 'day' && r.eat === 2);
  // A streak stays alive until the end of today, so start counting from yesterday if today is empty.
  const tStart = trained(today) ? today : addDays(today, -1);
  const eStart = ateWell(today) ? today : addDays(today, -1);
  return { training: runLength(trained, tStart), eating: runLength(ateWell, eStart) };
}

function longestRun(dates) {
  const sorted = [...new Set(dates)].sort();
  let best = 0, cur = 0, prev = null, bestEnd = null;
  for (const d of sorted) {
    cur = prev && addDays(prev, 1) === d ? cur + 1 : 1;
    if (cur > best) { best = cur; bestEnd = d; }
    prev = d;
  }
  return { days: best, end: bestEnd };
}

/* ---------- Personal records ---------- */

export function personalRecords() {
  const s = getSettings();
  const all = records();
  const kb = all.filter((r) => r.type === 'kb');
  const cardio = all.filter((r) => r.type === 'cardio');

  const exercises = new Map();
  for (const r of kb) {
    for (const it of r.items || []) {
      const w = convertWeight(Number(it.weight) || 0, it.unit || s.weightUnit, s.weightUnit);
      const reps = (it.sets || 0) * (it.reps || 0);
      const cur = exercises.get(it.exercise) || { exercise: it.exercise, top: 0, topDate: null, reps: 0, repsDate: null, sessions: 0 };
      if (w > cur.top || (w === cur.top && cur.topDate && r.date < cur.topDate)) { cur.top = w; cur.topDate = r.date; }
      if (reps > cur.reps) { cur.reps = reps; cur.repsDate = r.date; }
      cur.sessions++;
      exercises.set(it.exercise, cur);
    }
  }

  const maxBy = (list, fn) => list.reduce((best, r) => (fn(r) > (best ? fn(best) : 0) ? r : best), null);
  const highlights = [];
  const bigSession = maxBy(kb, (r) => kbVolume(r, s.weightUnit));
  if (bigSession) highlights.push({ label: 'Biggest kettlebell session', value: kbVolume(bigSession, s.weightUnit), unit: s.weightUnit, date: bigSession.date, kind: 'volume' });

  for (const t of s.cardioTypes) {
    const list = cardio.filter((r) => r.activity === t.id);
    if (!list.length) continue;
    const longest = maxBy(list, minutesOf);
    if (longest) highlights.push({ label: `Longest ${t.name.toLowerCase()} session`, value: minutesOf(longest), unit: 'min', date: longest.date, kind: 'minutes' });
    const far = maxBy(list, (r) => distanceOf(r, s.distanceUnit));
    if (far && distanceOf(far) > 0) highlights.push({ label: `Farthest ${t.name.toLowerCase()}`, value: distanceOf(far, s.distanceUnit), unit: s.distanceUnit, date: far.date, kind: 'distance' });
    const climb = maxBy(list, (r) => elevationOf(r, s.distanceUnit));
    if (climb && elevationOf(climb) > 0) highlights.push({ label: `Most climbing, ${t.name.toLowerCase()}`, value: elevationOf(climb, s.distanceUnit), unit: s.distanceUnit === 'km' ? 'm' : 'ft', date: climb.date, kind: 'elevation' });
    const stepsBest = maxBy(list, (r) => Number(r.steps) || 0);
    if (stepsBest && stepsBest.steps) highlights.push({ label: `Most steps, ${t.name.toLowerCase()}`, value: Number(stepsBest.steps), unit: 'steps', date: stepsBest.date, kind: 'count' });
  }

  const trainRun = longestRun(all.filter(isTraining).map((r) => r.date));
  if (trainRun.days > 1) highlights.push({ label: 'Longest training streak', value: trainRun.days, unit: 'days', date: trainRun.end, kind: 'count' });
  const eatRun = longestRun(all.filter((r) => r.type === 'day' && r.eat === 2).map((r) => r.date));
  if (eatRun.days > 1) highlights.push({ label: 'Longest eating-well streak', value: eatRun.days, unit: 'days', date: eatRun.end, kind: 'count' });

  return {
    exercises: [...exercises.values()].sort((a, b) => b.sessions - a.sessions),
    highlights,
  };
}

/* ---------- Helpers for forms ---------- */

// Most-used bell weights, to offer as one-tap choices.
export function commonBells(limit = 6) {
  const counts = new Map();
  for (const r of records()) {
    if (r.type !== 'kb') continue;
    for (const it of r.items || []) {
      const key = `${it.weight}|${it.unit}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k]) => { const [w, u] = k.split('|'); return { weight: Number(w), unit: u }; })
    .sort((a, b) => convertWeight(a.weight, a.unit, 'kg') - convertWeight(b.weight, b.unit, 'kg'));
}

export function lastForExercise(exercise) {
  const kb = records().filter((r) => r.type === 'kb' && (r.items || []).some((it) => it.exercise === exercise));
  kb.sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
  const r = kb[0];
  return r ? { ...(r.items.find((it) => it.exercise === exercise)), date: r.date } : null;
}

export function daysAgoLabel(iso) {
  const diff = Math.round((fromISO(todayISO()) - fromISO(iso)) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'yesterday';
  return `${diff} days ago`;
}
