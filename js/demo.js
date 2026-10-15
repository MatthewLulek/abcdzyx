// Sample data so the charts have something to show before real data exists.
// Every sample record id starts with "demo-" so it can be removed cleanly.

import { addDays, todayISO, fromISO, round } from './util.js';
import { records, importDoc, removeMany, purge, exportDoc } from './store.js';
import { isConfigured } from './sync.js';

export const DEMO_PREFIX = 'demo-';
export const hasDemo = () => records().some((r) => r.id.startsWith(DEMO_PREFIX));

function rng(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

export function loadDemo(days = 280) {
  const rand = rng(42);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const between = (a, b) => a + rand() * (b - a);
  const today = todayISO();
  const start = addDays(today, -days);
  const recs = {};
  let n = 0;
  const add = (r) => {
    const id = `${DEMO_PREFIX}${n++}`;
    const t = fromISO(r.date).getTime();
    recs[id] = { ...r, id, createdAt: t + n, updatedAt: Date.now() };
  };

  for (let i = 0; i <= days; i++) {
    const date = addDays(start, i);
    const dow = fromISO(date).getDay();
    const progress = i / days; // 0 -> 1 over the period
    const lazyWeek = Math.floor(i / 7) % 9 === 4; // the occasional off week

    // Kettlebell: Mon / Wed / Fri
    if ([1, 3, 5].includes(dow) && rand() > (lazyWeek ? 0.7 : 0.12)) {
      const swing = progress < 0.35 ? 16 : progress < 0.7 ? 20 : 24;
      const press = progress < 0.5 ? 12 : 16;
      const items = [
        { exercise: 'Two-hand swing', weight: swing, unit: 'kg', sets: 5, reps: Math.round(between(15, 20)) },
        { exercise: 'Goblet squat', weight: swing, unit: 'kg', sets: 4, reps: Math.round(between(8, 12)) },
      ];
      if (dow !== 3) items.push({ exercise: 'Press', weight: press, unit: 'kg', sets: 4, reps: Math.round(between(5, 8)) });
      if (dow === 3) items.push({ exercise: 'Turkish get-up', weight: press, unit: 'kg', sets: 3, reps: 2 });
      if (rand() > 0.6) items.push({ exercise: 'Row', weight: swing, unit: 'kg', sets: 3, reps: 10 });
      add({ type: 'kb', date, duration: Math.round(between(25, 45)), rpe: Math.round(between(6, 9)), items, notes: '' });
    }

    // Walking pad most weekdays
    if (dow >= 1 && dow <= 5 && rand() > (lazyWeek ? 0.6 : 0.3)) {
      const duration = Math.round(between(25, 60));
      const distance = round(duration * between(0.042, 0.052), 2);
      add({ type: 'cardio', activity: 'walking-pad', date, duration, distance, distanceUnit: 'mi', steps: Math.round(distance * between(2050, 2250)), rpe: 3 });
    }

    // Step-ups Tue / Thu
    if ([2, 4].includes(dow) && rand() > 0.3) {
      const duration = Math.round(between(12, 25));
      add({ type: 'cardio', activity: 'step-ups', date, duration, steps: Math.round(duration * between(22, 28)), boxHeight: 16, rpe: Math.round(between(6, 8)) });
    }

    // Rebounding a couple of times a week
    if ([2, 6].includes(dow) && rand() > 0.4) {
      add({ type: 'cardio', activity: 'rebounding', date, duration: Math.round(between(10, 20)), rpe: 5 });
    }

    // Hikes on Saturdays and some Sundays
    if ((dow === 6 && rand() > 0.45) || (dow === 0 && rand() > 0.8)) {
      const distance = round(between(3, 9), 1);
      add({
        type: 'cardio', activity: 'hiking', date,
        duration: Math.round(distance * between(22, 30)),
        distance, distanceUnit: 'mi',
        elevation: Math.round(distance * between(120, 260)),
        place: pick(['Wissahickon Valley', 'Green Lane Park', 'Valley Forge', 'French Creek', 'Ricketts Glen']),
        rpe: Math.round(between(5, 8)),
      });
    }

    // Daily check-in
    if (date <= today && rand() > 0.08) {
      const r = rand() + (dow === 0 || dow === 6 ? -0.15 : 0) + progress * 0.15;
      const eat = r > 0.45 ? 2 : r > 0.15 ? 1 : 0;
      const habits = {
        produce: eat === 2 || rand() > 0.6,
        protein: rand() > 0.25,
        'no-sugary-drinks': eat > 0 && rand() > 0.2,
        'no-late-snacks': eat === 2 ? rand() > 0.2 : rand() > 0.7,
        'home-cooked': rand() > 0.35,
      };
      add({
        type: 'day', date, eat, habits,
        water: Math.round(between(4, 10)),
        sleep: round(between(6, 8.5) * 2, 0) / 2,
        bodyweight: dow === 1 || rand() > 0.7 ? round(186 - progress * 7 + between(-1.2, 1.2), 1) : null,
        bodyweightUnit: 'lb',
        energy: Math.round(between(2, 5)),
      });
    }
  }

  // Day records normally use the id "day:DATE"; keep demo ones distinct so they never
  // overwrite a real check-in, and skip dates that already have one.
  const real = new Set(records().filter((r) => r.type === 'day').map((r) => r.date));
  for (const [id, r] of Object.entries(recs)) if (r.type === 'day' && real.has(r.date)) delete recs[id];

  importDoc({ settings: exportDoc().settings, records: recs }, 'merge');
  return Object.keys(recs).length;
}

export function removeDemo() {
  const ids = records().filter((r) => r.id.startsWith(DEMO_PREFIX)).map((r) => r.id);
  // With sync on, other devices need tombstones to learn about the removal.
  if (isConfigured()) removeMany(ids);
  else purge(ids);
  return ids.length;
}
