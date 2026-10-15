// Data store: everything lives in one JSON document in localStorage.
// Every record carries an id and updatedAt so two devices can be merged
// (see sync.js). Deletes leave a small tombstone for the same reason.

import { uid, todayISO } from './util.js';

const KEY = 'kettle-trail:data:v1';
export const SCHEMA_VERSION = 1;

export const BUILTIN_CARDIO = [
  { id: 'step-ups', name: 'Step-ups', builtin: true },
  { id: 'walking-pad', name: 'Walking pad', builtin: true },
  { id: 'rebounding', name: 'Rebounding', builtin: true },
  { id: 'hiking', name: 'Hiking', builtin: true },
];

// Which optional fields each cardio type shows (duration, effort, heart rate
// and notes are always available). Custom types get distance.
export const CARDIO_FIELDS = {
  'step-ups': ['steps', 'boxHeight', 'load'],
  'walking-pad': ['distance', 'steps'],
  rebounding: [],
  hiking: ['distance', 'elevation', 'place'],
};
export const fieldsFor = (typeId) => CARDIO_FIELDS[typeId] ?? ['distance'];

export const DEFAULT_EXERCISES = [
  'Two-hand swing',
  'One-arm swing',
  'Goblet squat',
  'Front squat',
  'Clean',
  'Press',
  'Clean and press',
  'Push press',
  'Snatch',
  'Turkish get-up',
  'Row',
  'Deadlift',
  'Halo',
  'Windmill',
  'Farmer carry',
];

export const DEFAULT_HABITS = [
  { id: 'produce', name: 'Fruit or veg with most meals' },
  { id: 'protein', name: 'Protein at every meal' },
  { id: 'no-sugary-drinks', name: 'No sugary drinks' },
  { id: 'no-late-snacks', name: 'No late-night snacking' },
  { id: 'home-cooked', name: 'Mostly home-cooked' },
];

export const EAT_LEVELS = [
  { value: 2, key: 'well', label: 'Ate well', glyph: '✓' },
  { value: 1, key: 'mixed', label: 'Mixed', glyph: '~' },
  { value: 0, key: 'off', label: 'Off track', glyph: '✕' },
];
export const eatLevel = (v) => EAT_LEVELS.find((l) => l.value === v);

export function defaultSettings() {
  return {
    weightUnit: 'lb',
    distanceUnit: 'mi',
    weekStart: 1,
    theme: 'system',
    goals: { cardioMinutes: 150, kbSessions: 3, ateWellDays: 5 },
    exercises: [...DEFAULT_EXERCISES],
    cardioTypes: BUILTIN_CARDIO.map((t) => ({ ...t })),
    habits: DEFAULT_HABITS.map((h) => ({ ...h })),
    updatedAt: 0,
  };
}

function emptyDoc() {
  return { schema: SCHEMA_VERSION, settings: defaultSettings(), records: {} };
}

/* ---------- Load / save ---------- */

let doc = load();
let dateIndex = null;
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyDoc();
    return normalize(JSON.parse(raw));
  } catch (e) {
    console.error('Could not read saved data', e);
    return emptyDoc();
  }
}

// Fill in anything missing so older or partial documents keep working.
export function normalize(input) {
  const base = emptyDoc();
  if (!input || typeof input !== 'object') return base;
  const s = { ...base.settings, ...(input.settings || {}) };
  s.goals = { ...base.settings.goals, ...(input.settings?.goals || {}) };
  if (!Array.isArray(s.exercises)) s.exercises = base.settings.exercises;
  if (!Array.isArray(s.cardioTypes) || !s.cardioTypes.length) s.cardioTypes = base.settings.cardioTypes;
  if (!Array.isArray(s.habits)) s.habits = base.settings.habits;
  const records = {};
  for (const [id, r] of Object.entries(input.records || {})) {
    if (r && typeof r === 'object' && r.id === id && (r.deleted || r.date)) records[id] = r;
  }
  return { schema: SCHEMA_VERSION, settings: s, records };
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(doc));
    return true;
  } catch (e) {
    console.error(e);
    window.dispatchEvent(new CustomEvent('kt:storage-error', { detail: e }));
    return false;
  }
}

function changed(source = 'local') {
  dateIndex = null;
  persist();
  for (const fn of listeners) fn({ source });
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* ---------- Settings ---------- */

export const getSettings = () => doc.settings;

export function updateSettings(patch) {
  doc.settings = { ...doc.settings, ...patch, updatedAt: Date.now() };
  changed();
}

/* ---------- Records ---------- */

export function records({ includeDeleted = false } = {}) {
  const all = Object.values(doc.records);
  return includeDeleted ? all : all.filter((r) => !r.deleted);
}

export const getRecord = (id) => {
  const r = doc.records[id];
  return r && !r.deleted ? r : null;
};

function buildIndex() {
  dateIndex = new Map();
  for (const r of records()) {
    if (!dateIndex.has(r.date)) dateIndex.set(r.date, []);
    dateIndex.get(r.date).push(r);
  }
  for (const list of dateIndex.values()) list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

export function recordsOn(date) {
  if (!dateIndex) buildIndex();
  return dateIndex.get(date) || [];
}

export function recordsBetween(start, end) {
  return records().filter((r) => r.date >= start && r.date <= end);
}

export function save(record) {
  const now = Date.now();
  const id = record.id || uid();
  const prev = doc.records[id];
  doc.records[id] = {
    ...record,
    id,
    createdAt: prev?.createdAt || record.createdAt || now,
    updatedAt: now,
  };
  delete doc.records[id].deleted;
  changed();
  return doc.records[id];
}

export function remove(id) {
  if (!doc.records[id]) return;
  doc.records[id] = { id, deleted: true, updatedAt: Date.now() };
  changed();
}

// Remove records outright, leaving no tombstone (only safe when nothing has synced them).
export function purge(ids) {
  for (const id of ids) delete doc.records[id];
  changed();
}

export function removeMany(ids) {
  const now = Date.now();
  for (const id of ids) doc.records[id] = { id, deleted: true, updatedAt: now };
  changed();
}

/* ---------- Daily check-in (food, sleep, bodyweight) ---------- */

export const dayId = (date) => `day:${date}`;

export function getDay(date) {
  return (
    getRecord(dayId(date)) ||
    recordsOn(date).find((r) => r.type === 'day') || { id: dayId(date), type: 'day', date, habits: {} }
  );
}

export function setDay(date, patch) {
  const current = getDay(date);
  return save({ ...current, ...patch, type: 'day', date, id: current.id || dayId(date) });
}

export function lastKbSession(beforeOrOn = todayISO()) {
  return records()
    .filter((r) => r.type === 'kb' && r.date <= beforeOrOn)
    .sort((a, b) => (b.date + (b.createdAt || 0)).localeCompare(a.date + (a.createdAt || 0)))[0];
}

/* ---------- Whole-document operations ---------- */

export const exportDoc = () => JSON.parse(JSON.stringify(doc));

export function replaceDoc(next, source = 'local') {
  doc = normalize(next);
  changed(source);
}

// Merge two documents: newest version of every record wins, newest settings win.
export function mergeDocs(a, b) {
  const A = normalize(a);
  const B = normalize(b);
  const records = { ...A.records };
  for (const [id, r] of Object.entries(B.records)) {
    const mine = records[id];
    if (!mine || (r.updatedAt || 0) > (mine.updatedAt || 0)) records[id] = r;
  }
  const settings = (B.settings.updatedAt || 0) > (A.settings.updatedAt || 0) ? B.settings : A.settings;
  return { schema: SCHEMA_VERSION, settings, records };
}

export function importDoc(incoming, mode = 'merge') {
  const clean = normalize(incoming);
  replaceDoc(mode === 'replace' ? clean : mergeDocs(doc, clean));
  return Object.keys(clean.records).length;
}

// Tombstones every record (rather than wiping the document) so the erase
// also reaches other devices through sync.
export function eraseAll() {
  const now = Date.now();
  for (const id of Object.keys(doc.records)) doc.records[id] = { id, deleted: true, updatedAt: now };
  doc.settings = { ...defaultSettings(), theme: doc.settings.theme, updatedAt: now };
  changed();
}

export function storageBytes() {
  try {
    return (localStorage.getItem(KEY) || '').length;
  } catch {
    return 0;
  }
}
