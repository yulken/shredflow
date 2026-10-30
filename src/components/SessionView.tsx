import { useEffect, useState } from 'react';
import { ArrowLeft, Save, Gauge, History, Activity, Trash2, Clock, TrendingUp } from 'lucide-react';
import { supabase, type Exercise, type PracticeSession } from '@/lib/supabase';
import { t, tp, dateLocale } from '@/lib/i18n';
import { tensionTier, tensionLabel, tensionColor } from '@/lib/tension';
import { bpmStep, realBpm } from '@/lib/bpm';

type Props = {
  exercise: Exercise;
  onBack: () => void;
};

export function SessionView({ exercise, onBack }: Props) {
  const [tension, setTension] = useState(2);
  const [bpm, setBpm] = useState(60);
  const [clicks, setClicks] = useState(1);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sessions, setSessions] = useState<PracticeSession[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  // Real BPM is bpm × clicks_per_beat, mirroring the Supabase trigger
  // (sync_exercise_bpm_records) so the UI and the DB never disagree.
  const realOf = (session: PracticeSession) => realBpm(session.bpm, session.clicks_per_beat);
  // Max/Last come from the DB: the sync_exercise_bpm_records trigger writes them
  // on each session insert, so a save re-reads the exercise row rather than
  // deriving the stats client-side. The `??` fallbacks cover rows seeded before
  // the migration ran.
  const [liveStats, setLiveStats] = useState<{ max_bpm: number | null; last_bpm: number | null }>(
    { max_bpm: exercise.max_bpm, last_bpm: exercise.last_bpm },
  );

  const fetchSessions = async () => {
    setLoadingHistory(true);
    const { data, error } = await supabase
      .from('practice_sessions')
      .select('*')
      .eq('exercise_id', exercise.id)
      .order('created_at', { ascending: false });
    if (!error) setSessions(data || []);
    setLoadingHistory(false);
  };

  useEffect(() => {
    fetchSessions();
  }, [exercise.id]);

  const refreshLiveStats = async () => {
    const { data } = await supabase
      .from('exercises')
      .select('max_bpm, last_bpm')
      .eq('id', exercise.id)
      .limit(1)
      .maybeSingle();
    if (data) setLiveStats({ max_bpm: data.max_bpm, last_bpm: data.last_bpm });
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from('practice_sessions').insert({
      exercise_id: exercise.id,
      tension_level: tension,
      bpm,
      clicks_per_beat: clicks,
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (error) {
      alert(t('error_save_session'));
      return;
    }
    await refreshLiveStats();
    setSaved(true);
    setNotes('');
    setTension(2);
    setBpm(60);
    setClicks(1);
    fetchSessions();
    setTimeout(() => setSaved(false), 2500);
  };

  const handleDeleteSession = async (id: string) => {
    if (!confirm(t('confirm_delete_session'))) return;
    const { error } = await supabase.from('practice_sessions').delete().eq('id', id);
    if (error) {
      alert(t('error_delete_session'));
      return;
    }
    fetchSessions();
  };

  // Stat cards: count and average come from the fetched sessions (client-side
  // aggregation over stored bpm × clicks is arithmetic); record and last read
  // the DB-written liveStats, deriving only as a fallback for pre-migration rows.
  const avgReal = sessions.length > 0
    ? Math.round(sessions.reduce((sum, s) => sum + realOf(s), 0) / sessions.length)
    : null;
  const recordReal = liveStats.max_bpm ?? (sessions.length > 0 ? Math.max(...sessions.map(realOf)) : null);
  const lastReal = liveStats.last_bpm ?? (sessions.length > 0 ? realOf(sessions[0]) : null);
  const today = new Date();

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors mb-6 group"
      >
        <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
        {t('back_to_exercises')}
      </button>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Session form + stats */}
        <div className="lg:col-span-3 space-y-6">
          <div className="card p-6">
            <div className="flex items-start gap-4 mb-6">
              <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md shrink-0">
                <Gauge className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
                  {exercise.title}
                </h1>
                {exercise.category && (
                  <span className="inline-block mt-1 text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                    {categoryLabel(exercise.category)}
                  </span>
                )}
              </div>
            </div>

            {exercise.description && (
              <p className="text-gray-500 dark:text-gray-400 mb-6 text-sm leading-relaxed">
                {exercise.description}
              </p>
            )}

            {/* Stats: sessions / average (Real BPM) / record / last. Record and
                last read the DB-written stats, not a client-side derivation. */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 mb-6">
              <StatCard
                label={t('stat_sessions')}
                value={sessions.length.toString()}
                icon={<Activity className="h-4 w-4" />}
              />
              <StatCard
                label={t('stat_avg_bpm')}
                value={avgReal !== null ? avgReal.toString() : '\u2014'}
                icon={<TrendingUp className="h-4 w-4" />}
              />
              <StatCard
                label={t('stat_record_bpm')}
                value={recordReal !== null ? recordReal.toString() : '\u2014'}
                icon={<Gauge className="h-4 w-4" />}
              />
              <StatCard
                label={t('stat_last_bpm')}
                value={lastReal !== null ? lastReal.toString() : '\u2014'}
                icon={<Clock className="h-4 w-4" />}
              />
            </div>

            {/* Tension selector: three named levels (1-3); legacy 1-10 values
                normalize through tensionTier at display time. */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('tension_label')}
                </label>
                <span className={`text-sm font-semibold ${tensionColor(tension)}`}>
                  {tensionLabel(tension)}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3].map((level) => (
                  <button
                    key={level}
                    onClick={() => setTension(level)}
                    className={`flex items-center justify-center py-2.5 rounded-xl text-sm font-semibold transition-colors active:scale-95 ${
                      tension === level
                        ? level === 1
                          ? 'bg-accent-500 hover:bg-accent-600 text-white shadow-md'
                          : level === 2
                            ? 'bg-amber-500 hover:bg-amber-600 text-white'
                            : 'bg-brand-500 hover:bg-brand-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {tensionLabel(level)}
                  </button>
                ))}
              </div>
            </div>

            {/* BPM input */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                {t('bpm_achieved')}
              </label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setBpm((b) => bpmStep(b, -1))}
                  className="h-12 w-12 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 text-xl font-bold transition-colors active:scale-95"
                  aria-label={t('bpm_minus_one')}
                >
                  \u22121
                </button>
                <input
                  type="number"
                  value={bpm}
                  onChange={(e) => setBpm(Math.max(1, parseInt(e.target.value, 10) || 0))}
                  className="flex-1 px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-center text-2xl font-bold focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
                />
                <button
                  onClick={() => setBpm((b) => bpmStep(b, 1))}
                  className="h-12 w-12 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 text-xl font-bold transition-colors active:scale-95"
                  aria-label={t('bpm_plus_one')}
                >
                  +1
                </button>
              </div>
              <div className="flex items-center gap-3 mt-4">
                <button
                  onClick={() => setBpm((b) => bpmStep(b, -5))}
                  className="h-10 w-10 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 text-lg font-bold transition-colors active:scale-95"
                  aria-label={t('bpm_minus_five')}
                >
                  \u22125
                </button>
                <input
                  type="range"
                  min={1}
                  max={300}
                  value={Math.min(300, bpm)}
                  onChange={(e) => setBpm(Math.max(1, Math.min(300, Math.round(Number(e.target.value) || 1))))}
                  className="w-full h-2 rounded-full appearance-none cursor-pointer bpm-slider"
                  style={{
                    background: `linear-gradient(to right, #f04438 ${((Math.min(300, bpm) - 1) / 299) * 100}%, #e5e7eb ${((Math.min(300, bpm) - 1) / 299) * 100}%)`,
                  }}
                />
                <button
                  onClick={() => setBpm((b) => bpmStep(b, 5))}
                  className="h-10 w-10 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 text-lg font-bold transition-colors active:scale-95"
                  aria-label={t('bpm_plus_five')}
                >
                  +5
                </button>
              </div>
              {exercise.target_bpm && (
                <p className="text-xs text-gray-400 mt-2 text-center">
                  {t('goal_line', { bpm: exercise.target_bpm })}
                  {bpm >= exercise.target_bpm && (
                    <span className="text-accent-500 font-medium ml-1">{t('goal_reached')}</span>
                  )}
                </p>
              )}
            </div>

            {/* Clicks per beat (metronome subdivisions): the spec examples
                1 / 2 / 4 / 6; one exercise can mix subdivisions per session. */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                {t('field_clicks')}
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 4, 6].map((value) => (
                  <button
                    key={value}
                    onClick={() => setClicks(value)}
                    className={`flex items-center justify-center py-2.5 rounded-xl text-sm font-semibold transition-colors active:scale-95 ${
                      clicks === value
                        ? 'bg-brand-600 hover:bg-brand-700 text-white shadow-md'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>

  /* __PART4__ */
