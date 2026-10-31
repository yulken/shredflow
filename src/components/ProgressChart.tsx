import { useMemo } from 'react';
import {
  Chart as ChartJS,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  TimeScale,
  Tooltip,
  type ChartOptions,
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import { Line } from 'react-chartjs-2';
import { t, dateLocale } from '@/lib/i18n';
import { tensionLabel } from '@/lib/tension';
import { realBpm } from '@/lib/bpm';
import { spansMultipleYears, tickDateLabel, tooltipDateLabel } from '@/lib/chart';
import type { Exercise, PracticeSession } from '@/lib/supabase';

// Time scale needs the date-fns adapter registered above; LinearScale covers
// the Y axis, and Line/Tooltip/Legend cover the series, tooltips and legend.
ChartJS.register(TimeScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

// Fixed palette: color is assigned by position in the created_at-sorted exercise
// list - the whole list, not the visible subset - so turning one exercise off the
// chart leaves the colors of the series that stay on it alone.
const PALETTE = [
  '#f04438',
  '#0a66d4',
  '#12b76a',
  '#f79009',
  '#7f56f9',
  '#06b6d4',
  '#e11d48',
  '#84cc16',
];

type Props = {
  exercises: Exercise[];
  sessions: PracticeSession[];
};

export function ProgressChart({ exercises, sessions }: Props) {
  // One series per exercise with dashboard_visible = true; Y is Real BPM
  // (bpm x clicks_per_beat), matching the DB trigger's arithmetic.
  const { chartData, seriesSessions, hasData, withYear } = useMemo(() => {
    // The palette position comes from the whole list: visibility only decides which
    // series is drawn, so hiding one exercise does not shift the colors of the rest.
    const byCreation = [...exercises].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const paletteIndex = new Map(byCreation.map((e, i) => [e.id, i]));
    const visible = byCreation.filter((e) => e.dashboard_visible);

    const series = visible.map((exercise) =>
      sessions
        .filter((s) => s.exercise_id === exercise.id)
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    );

    const datasets = series.map((pts, i) => {
      const index = paletteIndex.get(visible[i].id) ?? i;
      return {
        label: visible[i].title,
        data: pts.map((s) => ({ x: new Date(s.created_at), y: realBpm(s.bpm, s.clicks_per_beat) })),
        borderColor: PALETTE[index % PALETTE.length],
        backgroundColor: PALETTE[index % PALETTE.length],
        pointRadius: 3,
        pointHoverRadius: 5,
        tension: 0.3,
      };
    });

    // Only the points actually drawn decide whether a year is needed: a series
    // hidden by `dashboard_visible` must not change what the axis says.
    const drawn = series.flat();

    return {
      chartData: { datasets },
      seriesSessions: series,
      hasData: series.some((pts) => pts.length > 0),
      withYear: spansMultipleYears(drawn),
    };
  }, [exercises, sessions]);

  const options = useMemo<ChartOptions<'line'>>(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: false },
      scales: {
        x: {
          type: 'time',
          // Chart.js draws one grid line per tick, so fixing the unit to `week`
          // is what makes the axis mark weekly subdivisions only: ticks step 7
          // days instead of being auto-densed into days/hours. With no
          // `isoWeekday`, `_generate` snaps the first tick with
          // `adapter.startOf(min, 'week')`, and the date-fns adapter's `week`
          // uses `weekStartsOn: 0` - so the lines land on Sundays.
          time: { unit: 'week', stepSize: 1, tooltipFormat: 'PP' },
          // No `displayFormats`: the tick callback below formats every label, and
          // `tooltipFormat` is the date-only fallback for anything that formats
          // through the scale instead.
          grid: { color: 'rgba(107, 114, 128, 0.12)', drawTicks: false },
          ticks: {
            color: '#9ca3af',
            maxRotation: 0,
            autoSkip: true,
            padding: 8,
            callback: (v) => tickDateLabel(Number(v), dateLocale(), withYear),
          },
        },
        y: {
          title: { display: true, text: t('chart_y_axis'), color: '#9ca3af' },
          beginAtZero: true,
          grid: { color: 'rgba(107, 114, 128, 0.12)' },
          ticks: { color: '#9ca3af' },
        },
      },
      plugins: {
        legend: {
          // Lateral, top-aligned: the Y-axis title already sits on the left, so
          // the series list goes right. Vertical stacking keeps the plot wide
          // instead of trading height for a row of 7 labels under the axis.
          position: 'right',
          align: 'start',
          labels: {
            color: '#6b7280',
            usePointStyle: true,
            boxWidth: 8,
            padding: 10,
            font: { size: 11 },
          },
        },
        tooltip: {
          // Tooltip shows date / base BPM / clicks / tension per point - the date
          // only, since a practice log is a day, not a moment (`src/lib/chart.ts`).
          callbacks: {
            title: (items) => {
              if (items.length === 0) return '';
              const x = items[0].parsed.x;
              if (typeof x !== 'number') return '';
              return tooltipDateLabel(x, dateLocale(), withYear);
            },
            label: (ctx) => {
              const session = seriesSessions[ctx.datasetIndex]?.[ctx.dataIndex];
              if (!session) return ctx.dataset.label ?? '';
              return `${ctx.dataset.label}: ${ctx.parsed.y} ${t('bpm_unit')} · ${session.bpm} × ${session.clicks_per_beat} · ${tensionLabel(session.tension_level)}`;
            },
          },
        },
      },
    };
  }, [seriesSessions, withYear]);

  if (!hasData) {
    return (
      <div className="text-center py-10">
        <p className="text-sm text-gray-400 dark:text-gray-500">{t('chart_empty')}</p>
      </div>
    );
  }

  return (
    <div className="h-[360px]">
      <Line data={chartData} options={options} />
    </div>
  );
}
