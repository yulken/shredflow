import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Save, Gauge, History, Activity, Trash2, Clock, TrendingUp } from 'lucide-react';
import { supabase, type Exercise, type PracticeSession } from '@/lib/supabase';
import { t, tp, dateLocale, categoryLabel } from '@/lib/i18n';
import { tensionLabel, tensionColor } from '@/lib/tension';
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

  const fetchSessions = useCallback(async () => {
    setLoadingHistory(true);
    const { data, error } = await supabase
      .from('practice_sessions')
      .select('*')
      .eq('exercise_id', exercise.id)
      .order('created_at', { ascending: false });
    if (!error) setSessions(data || []);
    setLoadingHistory(false);
  }, [exercise.id]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

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

            {/* Tension selector: the three levels (1-3) exactly as the schema
                stores them - the value picked is the value written. */}
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
                  {'\u22121'}
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
                  {'\u22125'}
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

            {/* Notes */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                {t('notes_label')}
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('placeholder_notes')}
                rows={3}
                className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all resize-none"
              />
            </div>

            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-medium shadow-lg shadow-brand-600/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
            >
              {saved ? (
                <>
                  <Activity className="h-5 w-5 text-accent-400" />
                  {t('save_success')}
                </>
              ) : (
                <>
                  <Save className="h-5 w-5" />
                  {saving ? t('saving') : t('save_session_button')}
                </>
              )}
            </button>
          </div>
        </div>

        {/* History */}
        <div className="lg:col-span-2">
          <div className="card p-6 sticky top-6">
            <div className="flex items-center gap-2 mb-5">
              <History className="h-5 w-5 text-gray-400" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t('history_title')}
              </h2>
              {sessions.length > 0 && (
                <span className="ml-auto text-xs text-gray-400">
                  {tp('history_count', sessions.length)}
                </span>
              )}
            </div>

            {loadingHistory ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
                ))}
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-10">
                <Clock className="h-10 w-10 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  {t('no_sessions_yet')}
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                {sessions.map((session, idx) => {
                  const date = new Date(session.created_at);
                  const dateStr = date.toLocaleDateString(dateLocale(), {
                    day: '2-digit',
                    month: 'short',
                    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
                  });
                  const timeStr = date.toLocaleTimeString(dateLocale(), {
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  // Record badge compares against the Real-BPM record written
                  // by the trigger (liveStats), not the base BPM.
                  const isRecord = recordReal !== null && realOf(session) === recordReal;

                  return (
                    <div
                      key={session.id}
                      className="group relative p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 hover:border-brand-200 dark:hover:border-brand-900 transition-colors animate-fade-in"
                      style={{ animationDelay: `${idx * 40}ms` }}
                    >
                      <button
                        onClick={() => handleDeleteSession(session.id)}
                        className="absolute top-2 right-2 h-7 w-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-all"
                        aria-label={t('aria_delete_session')}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>

                      <div className="flex items-center gap-3 mb-2">
                        <div
                          title={t('real_bpm_label')}
                          className={`flex flex-col items-center justify-center h-12 w-12 rounded-lg ${
                            isRecord
                              ? 'bg-accent-100 dark:bg-accent-900/30 text-accent-600 dark:text-accent-400'
                              : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                          }`}
                        >
                          <span className="text-lg font-bold leading-none">{realOf(session)}</span>
                          <span className="text-[10px] leading-none mt-0.5">{t('bpm_unit')}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400">
                              {dateStr} · {timeStr}
                            </span>
                            {isRecord && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-accent-100 dark:bg-accent-900/30 text-accent-600 dark:text-accent-400">
                                {t('record_badge')}
                              </span>
                            )}
                          </div>
                          {/* Secondary: base BPM × clicks_per_beat, the inputs
                              the Real BPM headline is derived from. */}
                          <div className="text-xs text-gray-400 mt-0.5">
                            {session.bpm} {t('bpm_unit')} · ×{session.clicks_per_beat}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1">
                            <div className="flex gap-1">
                              {[1, 2, 3].map((level) => (
                                <div
                                  key={level}
                                  className={`h-1.5 w-2.5 rounded-full ${
                                    level <= session.tension_level
                                      ? session.tension_level === 1
                                        ? 'bg-accent-500'
                                        : session.tension_level === 2
                                          ? 'bg-amber-500'
                                          : 'bg-brand-500'
                                      : 'bg-gray-200 dark:bg-gray-700'
                                  }`}
                                />
                              ))}
                            </div>
                            <span className={`text-xs font-medium ${tensionColor(session.tension_level)}`}>
                              {tensionLabel(session.tension_level)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {session.notes && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 pt-2 border-t border-gray-100 dark:border-gray-800 line-clamp-2">
                          {session.notes}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* BPM slider styling */}
      <style>{`
        .bpm-slider::-webkit-slider-thumb {
          appearance: none;
          width: 26px;
          height: 26px;
          border-radius: 50%;
          background: white;
          border: 3px solid #f04438;
          cursor: grab;
          box-shadow: 0 2px 10px rgba(0,0,0,0.18);
          transition: transform 0.15s;
        }
        .bpm-slider::-webkit-slider-thumb:hover {
          transform: scale(1.1);
        }
        .bpm-slider::-webkit-slider-thumb:active {
          cursor: grabbing;
          transform: scale(1.2);
        }
        .bpm-slider::-moz-range-thumb {
          width: 26px;
          height: 26px;
          border-radius: 50%;
          background: white;
          border: 3px solid #f04438;
          cursor: grab;
          box-shadow: 0 2px 10px rgba(0,0,0,0.18);
        }
      `}</style>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800">
      <div className="flex items-center gap-1.5 text-gray-400 mb-2">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}

