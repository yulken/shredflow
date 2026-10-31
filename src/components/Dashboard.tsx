import { useEffect, useState } from 'react';
import { BarChart3, Music2, Eye, EyeOff } from 'lucide-react';
import { supabase, type Exercise, type PracticeSession } from '@/lib/supabase';
import { t } from '@/lib/i18n';
import { PERIODS, PERIOD_LABEL_KEYS } from '@/lib/period';
import { useChartPeriod } from '@/hooks/useChartPeriod';
import { ProgressChart } from '@/components/ProgressChart';

type Props = {
  onSelectExercise: (exercise: Exercise) => void;
};

// Standalone dashboard screen (D4): catalog table + Real-BPM chart; rows drill
// down into the exercise's session view.
export function Dashboard({ onSelectExercise }: Props) {
  // The period is a chart-only filter: it decides which points are plotted, not
  // what the catalog reports (Max/Last are the trigger's stored records). It is
  // persisted in `localStorage` like the language is, so the window a user picked
  // survives a reload.
  const { period, setPeriod } = useChartPeriod();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [sessions, setSessions] = useState<PracticeSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = async () => {
    setLoading(true);
    const [exercisesRes, sessionsRes] = await Promise.all([
      supabase.from('exercises').select('*').order('created_at', { ascending: true }),
      supabase.from('practice_sessions').select('*').order('created_at', { ascending: true }),
    ]);
    if (!exercisesRes.error) setExercises(exercisesRes.data || []);
    if (!sessionsRes.error) setSessions(sessionsRes.data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // The eye is the control: clicking it writes `dashboard_visible` and the chart
  // redraws off this same state, so the series appears/disappears before the
  // round trip finishes. The row's own onClick opens the exercise, hence the
  // stopPropagation. If the write fails the optimistic value is put back.
  const toggleOnChart = async (exercise: Exercise) => {
    const next = !exercise.dashboard_visible;
    const apply = (value: boolean) =>
      setExercises((prev) => prev.map((e) => (e.id === exercise.id ? { ...e, dashboard_visible: value } : e)));
    apply(next);
    const { error: updateError } = await supabase.from('exercises').update({ dashboard_visible: next }).eq('id', exercise.id);
    if (updateError) {
      apply(exercise.dashboard_visible);
      setError(t('error_update_exercise'));
    } else {
      setError('');
    }
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
          {t('dashboard_title')}
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">{t('dashboard_subtitle')}</p>
      </div>

      <div className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {t('chart_title')}
            </h2>
          </div>
          {/* The four windows are the whole set; `period_all` is the default, so
              the landing view stays the entire log. */}
          <div role="group" aria-label={t('chart_period_label')} className="flex flex-wrap items-center gap-1">
            {PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                aria-pressed={period === p}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  period === p
                    ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {t(PERIOD_LABEL_KEYS[p])}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <div className="h-[360px] rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
        ) : (
          <ProgressChart exercises={exercises} sessions={sessions} period={period} />
        )}
      </div>

      {error && <p className="text-sm text-brand-600 dark:text-brand-400">{error}</p>}

      <div className="card p-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-medium text-gray-400 dark:text-gray-500">
              <th className="py-2 pr-4">{t('catalog_col_exercise')}</th>
              <th className="py-2 pr-4 text-right">{t('catalog_col_max')}</th>
              <th className="py-2 pr-4 text-right">{t('catalog_col_last')}</th>
              <th className="py-2 text-right">{t('catalog_col_visible')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="py-6">
                  <div className="h-10 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
                </td>
              </tr>
            ) : exercises.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-6 text-center text-gray-400 dark:text-gray-500">
                  {t('no_exercises_title')}
                </td>
              </tr>
            ) : (
              exercises.map((exercise) => (
                <tr
                  key={exercise.id}
                  onClick={() => onSelectExercise(exercise)}
                  className="cursor-pointer border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2 min-w-0">
                      <Music2 className="h-4 w-4 text-brand-500 shrink-0" />
                      <span className="font-medium text-gray-900 dark:text-white line-clamp-1">
                        {exercise.title}
                      </span>
                      {exercise.tab_url && (
                        <a
                          href={exercise.tab_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs text-brand-600 dark:text-brand-400 hover:underline shrink-0"
                          aria-label={t('link_tab_aria')}
                        >
                          {t('field_tab_url')}
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-right font-semibold text-gray-900 dark:text-white">
                    {exercise.max_bpm ?? '\u2014'}
                  </td>
                  <td className="py-3 pr-4 text-right font-semibold text-gray-900 dark:text-white">
                    {exercise.last_bpm ?? '\u2014'}
                  </td>
                  <td className="py-3 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void toggleOnChart(exercise);
                      }}
                      aria-pressed={exercise.dashboard_visible}
                      aria-label={exercise.dashboard_visible ? t('visibility_hide') : t('visibility_show')}
                      title={exercise.dashboard_visible ? t('visibility_hide') : t('visibility_show')}
                      className={`inline-flex items-center justify-center h-6 w-6 rounded-lg transition-colors active:scale-95 ${
                        exercise.dashboard_visible
                          ? 'text-accent-600 dark:text-accent-400 bg-accent-100 dark:bg-accent-900/30 hover:bg-accent-200 dark:hover:bg-accent-900/50'
                          : 'text-gray-400 bg-gray-100 dark:bg-gray-800 hover:text-accent-500 dark:hover:text-accent-400'
                      }`}
                    >
                      {exercise.dashboard_visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
