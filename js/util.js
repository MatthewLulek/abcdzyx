// Small helpers shared across the app: dates, units, formatting, DOM.

/* ---------- Dates (local, stored as "YYYY-MM-DD") ---------- */

export const pad = (n) => String(n).padStart(2, '0');

export function toISO(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Parse at local noon so DST shifts never move the day.
export function fromISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export const todayISO = () => toISO(new Date());

export function addDays(iso, n) {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function addMonths(iso, n) {
  const d = fromISO(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toISO(d);
}

export function daysBetween(a, b) {
  return Math.round((fromISO(b) - fromISO(a)) / 86400000);
}

// weekStart: 1 = Monday, 0 = Sunday
export function startOfWeek(iso, weekStart = 1) {
  const d = fromISO(iso);
  const diff = (d.getDay() - weekStart + 7) % 7;
  return addDays(iso, -diff);
}

export function startOfMonth(iso) {
  return iso.slice(0, 8) + '01';
}

export function endOfMonth(iso) {
  const d = fromISO(iso);
  return toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12));
}

export function startOfYear(iso) {
  return iso.slice(0, 4) + '-01-01';
}

export function endOfYear(iso) {
  return iso.slice(0, 4) + '-12-31';
}

export function eachDay(start, end) {
  const out = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

const fmt = (opts) => new Intl.DateTimeFormat(undefined, opts);
const F = {
  weekdayLong: fmt({ weekday: 'long' }),
  weekdayShort: fmt({ weekday: 'short' }),
  monthDay: fmt({ month: 'long', day: 'numeric' }),
  monthDayShort: fmt({ month: 'short', day: 'numeric' }),
  monthYear: fmt({ month: 'long', year: 'numeric' }),
  monthShort: fmt({ month: 'short' }),
  full: fmt({ weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
  fullNoYear: fmt({ weekday: 'short', month: 'short', day: 'numeric' }),
};

export const fmtWeekday = (iso) => F.weekdayLong.format(fromISO(iso));
export const fmtWeekdayShort = (iso) => F.weekdayShort.format(fromISO(iso));
export const fmtMonthDay = (iso) => F.monthDay.format(fromISO(iso));
export const fmtMonthDayShort = (iso) => F.monthDayShort.format(fromISO(iso));
export const fmtMonthYear = (iso) => F.monthYear.format(fromISO(iso));
export const fmtMonthShort = (iso) => F.monthShort.format(fromISO(iso));
export function fmtDateFull(iso) {
  return iso.slice(0, 4) === todayISO().slice(0, 4)
    ? F.fullNoYear.format(fromISO(iso))
    : F.full.format(fromISO(iso));
}

export function relativeDay(iso) {
  const diff = daysBetween(todayISO(), iso);
  if (diff === 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  if (diff === 1) return 'Tomorrow';
  return null;
}

/* ---------- Units ---------- */

export const KG_PER_LB = 0.45359237;
export const KM_PER_MI = 1.609344;

export function convertWeight(value, from, to) {
  if (value == null || from === to) return value;
  return from === 'kg' ? value / KG_PER_LB : value * KG_PER_LB;
}

export function convertDistance(value, from, to) {
  if (value == null || from === to) return value;
  return from === 'km' ? value / KM_PER_MI : value * KM_PER_MI;
}

// Elevation follows the distance system: mi -> ft, km -> m
export function convertElevation(value, fromDist, toDist) {
  if (value == null || fromDist === toDist) return value;
  return fromDist === 'km' ? value * 3.28084 : value / 3.28084;
}

export const elevUnit = (distUnit) => (distUnit === 'km' ? 'm' : 'ft');

/* ---------- Numbers ---------- */

export function num(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function round(n, dp = 0) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

const nf0 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

export const fmt0 = (n) => nf0.format(n);
export const fmt1 = (n) => nf1.format(n);
export const fmt2 = (n) => nf2.format(n);

export function fmtCompact(n) {
  const a = Math.abs(n);
  if (a >= 1e6) return nf1.format(n / 1e6) + 'M';
  if (a >= 1e4) return nf0.format(n / 1e3) + 'K';
  if (a >= 1e3) return nf1.format(n / 1e3) + 'K';
  return nf0.format(n);
}

export function fmtMinutes(min) {
  if (!min) return '0 min';
  if (min < 60) return `${fmt0(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function fmtHours(min) {
  return min >= 600 ? `${fmt0(min / 60)} h` : min >= 60 ? `${fmt1(min / 60)} h` : `${fmt0(min)} min`;
}

/* ---------- DOM ---------- */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function download(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

let toastTimer;
export function toast(message) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
