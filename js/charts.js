// Thin wrapper around Chart.js so every chart shares one look:
// thin bars with rounded ends, 2px lines, hairline grid, text in ink colors.

import { cssVar, fmt0 } from './util.js';
import { activityKeys } from './stats.js';

const charts = new Map();

export function destroyAll() {
  for (const c of charts.values()) c.destroy();
  charts.clear();
}

export function colorFor(key) {
  const i = activityKeys().indexOf(key);
  return i >= 0 && i < 8 ? cssVar(`--series-${i + 1}`) : cssVar('--series-other');
}

function theme() {
  return {
    ink: cssVar('--ink'),
    ink2: cssVar('--ink-2'),
    muted: cssVar('--muted'),
    grid: cssVar('--grid'),
    axis: cssVar('--axis'),
    surface: cssVar('--surface'),
    line: cssVar('--line'),
  };
}

function base(t, { longLabels, fmt = fmt0, unit = '', legend = false, stacked = false, horizontal = false, beginAtZero = true }) {
  const valueAxis = {
    stacked,
    beginAtZero,
    grid: { color: t.grid, drawTicks: false },
    border: { display: false },
    ticks: { color: t.muted, padding: 8, maxTicksLimit: 5, callback: (v) => fmt(v) },
  };
  const catAxis = {
    stacked,
    grid: { display: false },
    border: { color: t.axis },
    ticks: { color: t.muted, padding: 6, autoSkip: true, maxRotation: 0, autoSkipPadding: 8 },
  };
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 250 },
    indexAxis: horizontal ? 'y' : 'x',
    interaction: { mode: horizontal ? 'nearest' : 'index', intersect: false, axis: horizontal ? 'y' : 'x' },
    layout: { padding: { top: 4, right: horizontal ? 12 : 4 } },
    scales: horizontal ? { x: valueAxis, y: catAxis } : { x: catAxis, y: valueAxis },
    plugins: {
      legend: {
        display: legend,
        position: 'top',
        align: 'start',
        labels: { color: t.ink2, usePointStyle: true, pointStyle: 'rectRounded', boxWidth: 10, boxHeight: 10, padding: 14 },
      },
      tooltip: {
        backgroundColor: t.surface,
        titleColor: t.ink,
        bodyColor: t.ink2,
        footerColor: t.muted,
        borderColor: t.line,
        borderWidth: 1,
        padding: 10,
        cornerRadius: 8,
        boxPadding: 4,
        usePointStyle: true,
        filter: (item) => item.raw != null && item.raw !== 0,
        callbacks: {
          title: (items) => (longLabels ? longLabels[items[0].dataIndex] : items[0].label),
          label: (item) => {
            const name = item.dataset.label ? `${item.dataset.label}: ` : '';
            return ` ${name}${fmt(item.raw)}${unit ? ' ' + unit : ''}`;
          },
        },
      },
    },
  };
}

function mount(canvas, config) {
  const prev = charts.get(canvas.id);
  if (prev) prev.destroy();
  const chart = new window.Chart(canvas, config);
  charts.set(canvas.id, chart);
  return chart;
}

// Round only the top of the highest non-empty segment in each stack.
function stackTopRadius(ctx) {
  const { chart, dataIndex, datasetIndex } = ctx;
  for (let i = chart.data.datasets.length - 1; i >= 0; i--) {
    if (!chart.isDatasetVisible(i)) continue;
    if (chart.data.datasets[i].data[dataIndex]) {
      return i === datasetIndex ? { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 } : 0;
    }
  }
  return 0;
}

export function stackedBar(canvas, { labels, longLabels, series, unit, fmt }) {
  const t = theme();
  const opts = base(t, { longLabels, unit, fmt, legend: series.length > 1, stacked: true });
  opts.plugins.tooltip.callbacks.footer = (items) => {
    const total = items.reduce((s, i) => s + (i.raw || 0), 0);
    return items.length > 1 ? `Total ${fmt ? fmt(total) : fmt0(total)}${unit ? ' ' + unit : ''}` : '';
  };
  return mount(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: series.map((s) => ({
        label: s.name,
        data: s.values,
        backgroundColor: s.color,
        hoverBackgroundColor: s.color,
        borderColor: t.surface,
        borderWidth: { top: 2, left: 0, right: 0, bottom: 0 },
        borderRadius: stackTopRadius,
        borderSkipped: false,
        maxBarThickness: 24,
        categoryPercentage: 0.7,
        barPercentage: 0.9,
      })),
    },
    options: opts,
  });
}

export function bar(canvas, { labels, longLabels, values, color, unit, fmt, label }) {
  const t = theme();
  return mount(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label,
        data: values,
        backgroundColor: color,
        hoverBackgroundColor: color,
        borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 },
        borderSkipped: false,
        maxBarThickness: 24,
        categoryPercentage: 0.7,
        barPercentage: 0.9,
      }],
    },
    options: base(t, { longLabels, unit, fmt }),
  });
}

export function line(canvas, { labels, longLabels, values, color, unit, fmt, label, beginAtZero = false }) {
  const t = theme();
  const opts = base(t, { longLabels, unit, fmt, beginAtZero });
  opts.scales.y.grace = '10%';
  return mount(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label,
        data: values,
        borderColor: color,
        backgroundColor: color,
        borderWidth: 2,
        borderCapStyle: 'round',
        borderJoinStyle: 'round',
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBorderColor: t.surface,
        pointBorderWidth: 2,
        pointHitRadius: 14,
        spanGaps: true,
        tension: 0,
      }],
    },
    options: opts,
  });
}

export function stackedStatus(canvas, { labels, longLabels, series }) {
  // Same as stackedBar but for counts of days.
  return stackedBar(canvas, { labels, longLabels, series, unit: 'days' });
}

export function hbar(canvas, { labels, values, colors, unit, fmt, max }) {
  const t = theme();
  const opts = base(t, { unit, fmt, horizontal: true });
  if (max) opts.scales.x.max = max;
  opts.scales.y.grid.display = false;
  opts.scales.y.ticks.color = t.ink2;
  return mount(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        hoverBackgroundColor: colors,
        borderRadius: { topRight: 4, bottomRight: 4, topLeft: 0, bottomLeft: 0 },
        borderSkipped: false,
        maxBarThickness: 20,
      }],
    },
    options: opts,
  });
}
