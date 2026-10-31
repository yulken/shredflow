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
  const { chartData, seriesSessions, hasData } = useMemo(() => {
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

    return {
      chartData: { datasets },
      seriesSessions: series,
      hasData: series.some((pts) => pts.length > 0),
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
          time: {
            tooltipFormat: 'PP p',
            displayFormats: { hour: 'PP p', day: 'PP', week: 'PP', month: 'MMM yyyy' },
          },
          grid: { color: 'rgba(107, 114, 128, 0.12)' },
          ticks: { color: '#9ca3af' },
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
          labels: {
            color: '#6b7280',
            usePointStyle: true,
            boxWidth: 8,
          },
        },
        tooltip: {
          // Tooltip shows date / base BPM / clicks / tension per point.
          callbacks: {
            title: (items) => {
              if (items.length === 0) return '';
              const x = items[0].parsed.x;
              if (typeof x !== 'number') return '';
              return new Date(x).toLocaleString(dateLocale(), {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              });
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
  }, [seriesSessions]);

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
