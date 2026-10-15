// Shared UI state and a tiny event-delegation layer.
// Elements declare data-action="name"; views register handlers by name.

import { todayISO } from './util.js';

export const state = {
  view: 'today',
  date: todayISO(),
  periodKind: 'week',
  periodAnchor: todayISO(),
  calMetric: 'training',
  exercise: null,
  exerciseMetric: 'top',
  tables: {}, // chart id -> true when showing the table instead
  historyFilter: 'all',
  historyQuery: '',
  historyDays: 30,
};

const handlers = { click: {}, change: {}, input: {} };

export function on(type, name, fn) {
  handlers[type][name] = fn;
}

export function initDelegation() {
  for (const type of Object.keys(handlers)) {
    document.addEventListener(type, (e) => {
      const el = e.target.closest?.('[data-action]');
      if (!el) return;
      const fn = handlers[type][el.dataset.action];
      if (fn) fn(el, e);
    });
  }
}

let renderer = () => {};
export const setRenderer = (fn) => (renderer = fn);
export const rerender = () => renderer();

export function icon(name, cls = '') {
  return `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}
