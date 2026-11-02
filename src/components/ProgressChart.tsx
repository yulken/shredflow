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
import { filterSessions, tickUnit, type Period } from '@/lib/period';
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

// Guide lines, in one gray for both axes. The quiet variant halves the alpha: the
// lines still mark the subdivisions the tick unit chose, they just stop competing
// with the series.
const GRID = 'rgba(107, 114, 128, 0.12)';
const GRID_QUIET = 'rgba(107, 114, 128, 0.06)';

type Props = {
  exercises: Exercise[];
  sessions: PracticeSession[];
  period: Period;
  /** The quiet variant, for a screen that plots one series: no legend, no axis
   * title, half the guide lines and fewer tick labels. The axis itself stays - the
   * window and the scale are still read off it, only more discreetly. */
  compact?: boolean;
};

export function ProgressChart({ exercises, sessions, period, compact = false }: Props) {
  // One series per exercise with dashboard_visible = true; Y is Real BPM
  // (bpm x clicks_per_beat), matching the DB trigger's arithmetic. The period is a
  // chart-only filter: the catalog's Max/Last stay the stored trigger records.
  const { chartData, seriesSessions, hasData, hasAnySession, withYear, unit } = useMemo(() => {
    // The window is anchored here, once per recomputation: the control changes
    // `period`, a refetch changes `sessions`, and both rebuild the points.
    const now = new Date();
    const inPeriod = filterSessions(sessions, period, now);

    // The palette position comes from the whole list: visibility only decides which
    // series is drawn, so hiding one exercise does not shift the colors of the rest.
    const byCreation = [...exercises].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const paletteIndex = new Map(byCreation.map((e, i) => [e.id, i]));
    const visible = byCreation.filter((e) => e.dashboard_visible);

    const series = visible.map((exercise) =>
      inPeriod
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

    // Only the points actually drawn decide the axis wording: a series hidden by
    // `dashboard_visible`, or a day outside the period, must not change what the
    // axis says.
    const drawn = series.flat();

    return {
      chartData: { datasets },
      seriesSessions: series,
      hasData: drawn.length > 0,
      // Distinguishes "nothing logged at all" from "nothing inside this window":
      // both are empty charts, but only the second one is the period's doing.
      hasAnySession: sessions.some((s) => visible.some((e) => e.id === s.exercise_id)),
      withYear: spansMultipleYears(drawn),
      unit: tickUnit(drawn),
    };
  }, [exercises, sessions, period]);

  const options = useMemo<ChartOptions<'line'>>(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: false },
      scales: {
        x: {
          type: 'time',
          // Chart.js draws one grid line per tick, so the unit is what makes the
          // axis mark readable subdivisions: `tickUnit` grows it with the window
          // the control selected, which keeps weekly Sunday lines over a month or
          // a quarter without leaving 52 of them over a year. The quiet variant
          // steps two units at a time, halving the lines and the labels together.
          time: { unit, stepSize: compact ? 2 : 1, tooltipFormat: 'PP' },
          // No `displayFormats`: the tick callback below formats every label, and
          // `tooltipFormat` is the date-only fallback for anything that formats
          // through the scale instead.
          grid: { color: compact ? GRID_QUIET : GRID, drawTicks: false },
          ticks: {
            color: '#9ca3af',
            maxRotation: 0,
            autoSkip: true,
            padding: 8,
            font: compact ? { size: 10 } : undefined,
            callback: (v) => tickDateLabel(Number(v), dateLocale(), withYear),
          },
        },
        y: {
          // The unit name the tooltip already spells for every point, so the quiet
          // variant drops the title and keeps the numbers: the scale stays readable
          // without a label repeating what the hover says.
          title: { display: !compact, text: t('chart_y_axis'), color: '#9ca3af' },
          beginAtZero: true,
          grid: { color: compact ? GRID_QUIET : GRID },
          // A limit here caps ticks and gridlines together, so a narrow column gets
          // a few readable marks instead of a ladder.
          ticks: {
            color: '#9ca3af',
            font: compact ? { size: 10 } : undefined,
            maxTicksLimit: compact ? 4 : undefined,
          },
        },
      },
      plugins: {
        legend: {
          // The series list is a dashboard thing: a screen that plots one exercise
          // has nothing to read off it, and its tooltip already names the series.
          // Turning it off also frees the band Chart.js would reserve here, which is
          // width a narrow column spends on the plot instead.
          display: !compact,
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
  }, [seriesSessions, withYear, unit, compact]);

  if (!hasData) {
    return (
      <div className="text-center py-10">
        <p className="text-sm text-gray-400 dark:text-gray-500">
          {t(hasAnySession ? 'chart_empty_period' : 'chart_empty')}
        </p>
      </div>
    );
  }

  return (
    <div className="h-[360px]">
      <Line data={chartData} options={options} />
    </div>
  );
}
