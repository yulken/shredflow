import { useCallback, useEffect, useRef, useState } from 'react';
import { BarChart3, Eye, EyeOff } from 'lucide-react';
import { supabase, type Exercise, type PracticeSession } from '@/lib/supabase';
import { t } from '@/lib/i18n';
import { PERIODS, PERIOD_LABEL_KEYS } from '@/lib/period';
import { useChartPeriod } from '@/hooks/useChartPeriod';
import { useDayRollover } from '@/hooks/useDayRollover';
import { useRefreshOnVisible } from '@/hooks/useRefreshOnVisible';
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

  // Rows are read on mount, on the day rollover, and on return to the tab: a screen
  // left open for days would keep the snapshot it took on mount, and both the chart's
  // points and the window they are filtered through come off this state
  // (`ProgressChart` anchors its `now` per recomputation). The identity is fixed
  // (`useCallback` over nothing) so the rollover timer keeps the midnight it was
  // scheduled at - re-running it would re-anchor the deadline at the current day, and
  // the eye toggle re-renders this screen.
  const inFlight = useRef(false);
  // The visibility write is optimistic, so rows read before it landed carry the old
  // flag: a background refresh waits the write out instead of undoing the click.
  const pendingWrite = useRef(false);
  const fetchData = useCallback(async ({ background = false }: { background?: boolean } = {}) => {
    // Two triggers landing in the same instant - a focus and a midnight timer -
    // would otherwise stack two round trips over the same rows.
    if (inFlight.current || pendingWrite.current) return;
    inFlight.current = true;
    // A background refresh keeps the chart on screen. The skeleton would blank the
    // plot the user is looking at to show data that is usually about to be the same,
    // and a failed one leaves the last good rows readable.
    if (!background) setLoading(true);
    const [exercisesRes, sessionsRes] = await Promise.all([
      supabase.from('exercises').select('*').order('created_at', { ascending: true }),
      supabase.from('practice_sessions').select('*').order('created_at', { ascending: true }),
    ]);
    if (!exercisesRes.error) setExercises(exercisesRes.data || []);
    if (!sessionsRes.error) setSessions(sessionsRes.data || []);
    if (!background) setLoading(false);
    inFlight.current = false;
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // The day is the unit a session is logged in, so the day boundary is the refresh
  // boundary; `useRefreshOnVisible` covers a session logged elsewhere the same day.
  useDayRollover(fetchData);
  useRefreshOnVisible(fetchData);

  // The eye is the control: clicking it writes `dashboard_visible` and the chart
  // redraws off this same state, so the series appears/disappears before the
  // round trip finishes. The row's own onClick opens the exercise, hence the
  // stopPropagation. If the write fails the optimistic value is put back.
  const toggleOnChart = async (exercise: Exercise) => {
    const next = !exercise.dashboard_visible;
    const apply = (value: boolean) =>
      setExercises((prev) => prev.map((e) => (e.id === exercise.id ? { ...e, dashboard_visible: value } : e)));
    apply(next);
    pendingWrite.current = true;
    const { error: updateError } = await supabase.from('exercises').update({ dashboard_visible: next }).eq('id', exercise.id);
    pendingWrite.current = false;
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

      <div className="card p-4 sm:p-6">
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
          <div className="h-[260px] sm:h-[360px] rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
        ) : (
          <ProgressChart exercises={exercises} sessions={sessions} period={period} />
        )}
      </div>

      {error && <p className="text-sm text-brand-600 dark:text-brand-400">{error}</p>}

      {/* The catalog in two shapes. The table is the tabular view criterion 2 asks
          for; below `sm` its four columns do not fit a phone and drag sideways, so
          the same rows stack instead. The eye is one control written once (`EyeCell`),
          because both shapes host it. */}
      <div className="card p-4 sm:p-6 overflow-x-auto">
        {loading ? (
          <div className="h-10 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
        ) : exercises.length === 0 ? (
          <p className="py-6 text-center text-gray-400 dark:text-gray-500">{t('no_exercises_title')}</p>
        ) : (
          <>
            <div className="hidden sm:block">
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
                  {exercises.map((exercise) => (
                    <tr
                      key={exercise.id}
                      onClick={() => onSelectExercise(exercise)}
                      className="cursor-pointer border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                    >
                      {/* Title and nothing else: the tab lives on the exercise's own
                          screen, which shows the link and edits it, and this row is the
                          way there. A link here would float mid-line beside the title and
                          need its own click guard against the row's navigation. The note
                          icon that used to lead the row said nothing about the exercise. */}
                      <td className="py-3 pr-4">
                        <span className="font-medium text-gray-900 dark:text-white line-clamp-1">
                          {exercise.title}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-right font-semibold text-gray-900 dark:text-white">
                        {exercise.max_bpm ?? '\u2014'}
                      </td>
                      <td className="py-3 pr-4 text-right font-semibold text-gray-900 dark:text-white">
                        {exercise.last_bpm ?? '\u2014'}
                      </td>
                      <td className="py-3 text-right">
                        <EyeCell exercise={exercise} toggleOnChart={toggleOnChart} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Stacked: the name leads, the two stored records sit under it as chips
                (`stat_max_bpm` / `stat_last_bpm`, the same words the cards use), and the
                eye stays at the right edge where a thumb reaches it. */}
            <ul className="sm:hidden divide-y divide-gray-100 dark:divide-gray-800">
              {exercises.map((exercise) => (
                <li
                  key={exercise.id}
                  onClick={() => onSelectExercise(exercise)}
                  className="flex items-center gap-3 py-3 cursor-pointer active:scale-95 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-gray-900 dark:text-white line-clamp-1">
                      {exercise.title}
                    </span>
                    <div className="mt-1 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                      <span>{t('stat_max_bpm')} · {exercise.max_bpm ?? '\u2014'}</span>
                      <span>{t('stat_last_bpm')} · {exercise.last_bpm ?? '\u2014'}</span>
                    </div>
                  </div>
                  <EyeCell exercise={exercise} toggleOnChart={toggleOnChart} />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

// The eye has two hosts (a table cell and a stacked row), so it is written once.
// The chip stays 24px on screen, but a pseudo-element extends its touch area by
// 10px on every side: 24px is a miss under a finger, and the row underneath it is
// the thing that navigates on the same tap.
function EyeCell({
  exercise,
  toggleOnChart,
}: {
  exercise: Exercise;
  toggleOnChart: (exercise: Exercise) => Promise<void>;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void toggleOnChart(exercise);
      }}
      aria-pressed={exercise.dashboard_visible}
      aria-label={exercise.dashboard_visible ? t('visibility_hide') : t('visibility_show')}
      title={exercise.dashboard_visible ? t('visibility_hide') : t('visibility_show')}
      className={`relative inline-flex items-center justify-center h-6 w-6 rounded-lg transition-colors active:scale-95 before:absolute before:-inset-[10px] before:content-[''] ${
        exercise.dashboard_visible
          ? 'text-accent-600 dark:text-accent-400 bg-accent-100 dark:bg-accent-900/30 hover:bg-accent-200 dark:hover:bg-accent-900/50'
          : 'text-gray-400 bg-gray-100 dark:bg-gray-800 hover:text-accent-500 dark:hover:text-accent-400'
      }`}
    >
      {exercise.dashboard_visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
    </button>
  );
}
