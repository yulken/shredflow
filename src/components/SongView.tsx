import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Save, History, Trash2, Clock, ExternalLink, Pencil, Ruler, Activity, ListMusic } from 'lucide-react';
import { supabase, type Song, type SongMeasureTarget, type SongProgressLog } from '@/lib/supabase';
import { t, tp, dateLocale } from '@/lib/i18n';
import { tensionLabel, tensionColor } from '@/lib/tension';
import { bpmStep } from '@/lib/bpm';
import { blockPercent, formatPercent, percentHistory, percentOf, songPercent, tempoRuns } from '@/lib/songProgress';
import { ProgressChart } from '@/components/ProgressChart';
import { useDayRollover } from '@/hooks/useDayRollover';
import { useRefreshOnVisible } from '@/hooks/useRefreshOnVisible';

type Props = {
  song: Song;
  onBack: () => void;
};

export function SongView({ song, onBack }: Props) {
  const [logs, setLogs] = useState<SongProgressLog[]>([]);
  const [targets, setTargets] = useState<SongMeasureTarget[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  // The percent is the stored column, re-read after every write: `sync_song_percent*` recomputes
  // it from the logs, so deriving it client-side here would show a number the database never
  // accepted. `songPercent` is used only for the preview, before a row exists.
  const [livePercent, setLivePercent] = useState(percentOf(song));
  const [songsterrUrl, setSongsterrUrl] = useState<string | null>(song.songsterr_url);
  const [editingUrl, setEditingUrl] = useState(false);
  const [urlDraft, setUrlDraft] = useState('');
  const [urlError, setUrlError] = useState('');

  // The log the form writes: a new row by default, the row a pencil opened when editing. Songs
  // take many rows per day, so unlike `SessionView` there is no "today's row" to edit - each row
  // is edited through its own control.
  const [editingLog, setEditingLog] = useState<SongProgressLog | null>(null);
  const [section, setSection] = useState('');
  const [startMeasure, setStartMeasure] = useState(1);
  const [endMeasure, setEndMeasure] = useState(1);
  const [bpmClean, setBpmClean] = useState(60);
  const [bpmLimit, setBpmLimit] = useState('');
  const [tension, setTension] = useState(2);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<'insert' | 'update' | null>(null);
  const [formError, setFormError] = useState('');

  // One song's rows and its percent come off one read, like the session screen's sessions plus
  // its two trigger-written stats: a log written on another device moves the points, the
  // structure's peaks and the stored percent at once, and reading only two of the three leaves
  // one card disagreeing with the chart beside it.
  const inFlight = useRef(false);
  const refreshAll = useCallback(async ({ background = false }: { background?: boolean } = {}) => {
    if (background && inFlight.current) return;
    inFlight.current = true;
    // A background refresh keeps the rows on screen instead of trading them for the skeleton,
    // and a failed one leaves the last good rows readable.
    if (!background) setLoadingHistory(true);
    const [logsRes, targetsRes, songRes] = await Promise.all([
      supabase
        .from('song_progress_logs')
        .select('*')
        .eq('song_id', song.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('song_measure_targets')
        .select('*')
        .eq('song_id', song.id)
        .order('measure_number', { ascending: true }),
      supabase.from('songs').select('percent, total_measures').eq('id', song.id).limit(1).maybeSingle(),
    ]);
    if (!logsRes.error) setLogs(logsRes.data || []);
    if (!targetsRes.error) setTargets(targetsRes.data || []);
    if (songRes.data) setLivePercent(Number(songRes.data.percent ?? 0));
    if (!background) setLoadingHistory(false);
    inFlight.current = false;
  }, [song.id]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // The day is the unit a log is dated in, so the day boundary is the refresh boundary;
  // `useRefreshOnVisible` covers a log written elsewhere the same day and the return from the
  // song list. `refreshAll` is stable while the song is the same, which is what keeps the
  // midnight the timer was scheduled at.
  useDayRollover(refreshAll);
  useRefreshOnVisible(refreshAll);

  // The Songsterr URL is the one column of the song row this screen writes; the name and the
  // length belong to the song form, and the identifiers the import needs belong to the script.
  const saveSongsterrUrl = async () => {
    let value: string | null = null;
    if (urlDraft.trim()) {
      try {
        value = new URL(urlDraft.trim()).href;
      } catch {
        setUrlError(t('error_invalid_url'));
        return;
      }
    }
    const { error } = await supabase.from('songs').update({ songsterr_url: value }).eq('id', song.id);
    if (error) {
      setUrlError(t('error_update_song'));
      return;
    }
    setSongsterrUrl(value);
    setEditingUrl(false);
    setUrlError('');
  };

  // The form's fields are the row it writes. Re-syncing is keyed on the row's identity, not on
  // the fetch, so a background refresh of the row being edited must not overwrite a draft - and
  // closing the editor returns the form to a blank new row.
  const syncedId = useRef<string | null>(null);
  useEffect(() => {
    if (editingLog?.id === syncedId.current) return;
    syncedId.current = editingLog?.id ?? null;
    if (editingLog) {
      setSection(editingLog.section);
      setStartMeasure(editingLog.start_measure);
      setEndMeasure(editingLog.end_measure);
      setBpmClean(editingLog.bpm_clean);
      setBpmLimit(editingLog.bpm_limit?.toString() ?? '');
      setTension(editingLog.tension_level);
      setNotes(editingLog.notes ?? '');
    } else {
      setSection('');
      setStartMeasure(1);
      setEndMeasure(1);
      setBpmClean(60);
      setBpmLimit('');
      setTension(2);
      setNotes('');
    }
  }, [editingLog]);

  // The draft as a row: the same shape the database stores, so the two previews below ask the
  // percent function the same question a saved row would.
  const draft: SongProgressLog = {
    id: editingLog?.id ?? 'draft',
    user_id: null,
    song_id: song.id,
    section: section.trim(),
    start_measure: startMeasure,
    end_measure: endMeasure,
    bpm_clean: bpmClean,
    bpm_limit: bpmLimit.trim() ? Math.max(1, parseInt(bpmLimit, 10) || 1) : null,
    tension_level: tension,
    notes: notes.trim() || null,
    created_at: editingLog?.created_at ?? new Date().toISOString(),
  };

  // What the block the form describes is worth now, the spreadsheet's `BPM Limpo (%)` column for
  // the row; what the song would be worth once it is written, the trigger's answer recomputed
  // over the same measures. The edit case drops the old row first, so re-writing a block at a
  // slower tempo than it holds shows the drop the database would refuse to make.
  const otherLogs = logs.filter((l) => l.id !== draft.id);
  const withDraft = [...otherLogs, draft];
  const blockPreview = blockPercent(withDraft, draft.start_measure, draft.end_measure, targets);
  const percentPreview = songPercent(song.total_measures, targets, withDraft);

  const handleSubmit = async () => {
    setFormError('');
    if (!section.trim()) {
      setFormError(t('error_section_required'));
      return;
    }
    if (endMeasure < startMeasure) {
      setFormError(t('error_measure_range'));
      return;
    }
    // The CHECK on the migration bounds the range against the song's length at the database
    // level; the same bound is checked here so the message reaches the user instead of a
    // constraint error reaching them from the write.
    if (startMeasure < 1 || endMeasure > song.total_measures) {
      setFormError(t('error_measures_out_of_range'));
      return;
    }
    if (bpmClean < 1) {
      setFormError(t('error_bpm_clean_required'));
      return;
    }
    setSaving(true);
    const fields = {
      section: section.trim(),
      start_measure: startMeasure,
      end_measure: endMeasure,
      bpm_clean: bpmClean,
      bpm_limit: draft.bpm_limit,
      tension_level: tension,
      notes: draft.notes,
    };
    // No `percent`: the column is the trigger's. A delete followed by an insert of a slower
    // block does not lower the song either - the peak over the measures stays, so the percent
    // the screen re-reads after the write is the honest number.
    const { error } = editingLog
      ? await supabase.from('song_progress_logs').update(fields).eq('id', editingLog.id)
      : await supabase.from('song_progress_logs').insert({ song_id: song.id, ...fields });
    setSaving(false);
    if (error) {
      alert(t(editingLog ? 'error_update_song_log' : 'error_save_song_log'));
      return;
    }
    await refreshAll();
    setSaved(editingLog ? 'update' : 'insert');
    setEditingLog(null);
    setTimeout(() => setSaved(null), 2500);
  };

  const handleDeleteLog = async (id: string) => {
    if (!confirm(t('confirm_delete_song_log'))) return;
    const { error } = await supabase.from('song_progress_logs').delete().eq('id', id);
    if (error) {
      alert(t('error_delete_song_log'));
      return;
    }
    // Deleting the row that led a measure's peak is the one write that can lower the stored
    // percent, so the re-read is the number the trigger recomputed, not the one on screen.
    if (editingLog?.id === id) setEditingLog(null);
    refreshAll();
  };

  // The structure as tempo runs rather than 100 rows: a tab states one tempo per stretch, and
  // a measure list that repeats "94 BPM" a hundred times says nothing a run does not.
  const runs = tempoRuns(targets);
  const lastLog = logs[0];
  const lastLogStr = lastLog
    ? new Date(lastLog.created_at).toLocaleDateString(dateLocale(), {
        day: '2-digit',
        month: 'short',
        year: new Date(lastLog.created_at).getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
      })
    : null;

  return (
    <div className="animate-fade-in">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors mb-6 group"
      >
        <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
        {t('back_to_songs')}
      </button>

      {/* `grid-cols-1` is not decorative, for the same reason the session screen carries it: the
          chart canvas holds an intrinsic width, and an implicit `auto` track could never shrink
          below it, dragging the phone page sideways. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3 space-y-6">
          <div className="card p-4 sm:p-6">
            <div className="flex items-start gap-4 mb-6">
              <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md shrink-0">
                <ListMusic className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
                  {song.title}
                </h1>
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                  {t('songs_percent_caption', { count: formatPercent(livePercent) })}
                </p>
              </div>
            </div>

            {/* The Songsterr tab. Nothing stored means nothing to open, so the control offers to
                store one here, exactly as the session screen does for an exercise's tab URL. */}
            {!editingUrl && (
              <div className="flex items-center gap-2 mb-6">
                {songsterrUrl ? (
                  <>
                    <a
                      href={songsterrUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 py-1 text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
                      aria-label={t('songsterr_link_aria')}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      {t('field_songsterr_url')}
                    </a>
                    <button
                      onClick={() => {
                        setUrlDraft(songsterrUrl);
                        setUrlError('');
                        setEditingUrl(true);
                      }}
                      className="h-9 w-9 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors active:scale-95"
                      aria-label={t('aria_edit_songsterr_url')}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => {
                      setUrlDraft('');
                      setUrlError('');
                      setEditingUrl(true);
                    }}
                    className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors active:scale-95"
                    aria-label={t('aria_add_songsterr_url')}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    {t('field_songsterr_url')}
                  </button>
                )}
              </div>
            )}

            {editingUrl && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  {t('field_songsterr_url')}
                </label>
                <input
                  value={urlDraft}
                  onChange={(e) => setUrlDraft(e.target.value)}
                  placeholder={t('placeholder_songsterr_url')}
                  className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
                />
                {urlError && <p className="text-xs text-red-500 mt-1.5">{urlError}</p>}
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={saveSongsterrUrl}
                    className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition-colors active:scale-95"
                  >
                    {t('save_button')}
                  </button>
                  <button
                    onClick={() => {
                      setEditingUrl(false);
                      setUrlError('');
                    }}
                    className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors active:scale-95"
                  >
                    {t('cancel_button')}
                  </button>
                </div>
              </div>
            )}

            {/* The headline number is the stored column, not a client-side derivation: the
                trigger owns it, and this screen re-reads it after every write. */}
            <div className="mb-6">
              <div className="flex items-end justify-between gap-3 mb-2">
                <p className="text-3xl font-bold text-gray-900 dark:text-white leading-none">
                  {formatPercent(livePercent)}
                  <span className="text-base font-semibold text-gray-400 ml-1">%</span>
                </p>
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  {t('song_stat_percent')}
                </span>
              </div>
              <div
                role="progressbar"
                aria-label={t('song_stat_percent')}
                aria-valuenow={Number(livePercent.toFixed(2))}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-2 min-w-0 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden"
              >
                <div
                  className={`h-full rounded-full ${livePercent >= 100 ? 'bg-accent-500' : 'bg-brand-500'}`}
                  style={{ width: `${Math.min(100, Math.max(livePercent, 2))}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                {t('song_percent_hint')}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 mb-6">
              <StatCard
                label={t('song_stat_measures')}
                value={song.total_measures.toString()}
                icon={<Ruler className="h-4 w-4" />}
              />
              <StatCard
                label={t('song_stat_logs')}
                value={logs.length.toString()}
                icon={<Activity className="h-4 w-4" />}
              />
              <StatCard
                label={t('song_stat_last_log')}
                value={lastLogStr ?? '\u2014'}
                icon={<Clock className="h-4 w-4" />}
              />
            </div>

            {/* The structure the tab states: tempo runs, merged from the measure targets. The
                time signature is stored and not shown - decision D3 weights every measure the
                same, so the signature is display only and repeating it would crowd the line. */}
            <div className="pt-5 border-t border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('structure_title')}
                </h2>
                <span className="ml-auto text-xs text-gray-400">
                  {tp('structure_count', song.total_measures)}
                </span>
              </div>
              {runs.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  {t('structure_missing_hint')}
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {runs.map((run) => (
                    <span
                      key={`${run.start}-${run.end}`}
                      className="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
                    >
                      {t('structure_line', {
                        count: run.start === run.end ? String(run.start) : `${run.start}\u2013${run.end}`,
                        bpm: run.bpm,
                      })}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* The log form. Songs take many rows per day, so this is not "today's record": every
              row is its own practice, and the pencil on a row loads it here as the editor. */}
          <div className="card p-4 sm:p-6">
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editingLog ? t('song_log_update_button') : t('song_log_save_button')}
              </h2>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                {t('song_limit_hint')}
              </p>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                {t('field_section')}
              </label>
              <input
                value={section}
                onChange={(e) => setSection(e.target.value)}
                placeholder={t('placeholder_section')}
                className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
              />
            </div>

            {/* The stretch, inclusive at both ends - the same bounds the migration's
                `CHECK (start_measure <= end_measure)` states. `min-w-0` on both: a number input
                carries an intrinsic width and would hold the phone page wider than the screen. */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  {t('field_start_measure')}
                </label>
                <input
                  type="number"
                  value={startMeasure}
                  onChange={(e) => setStartMeasure(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  min={1}
                  className="w-full min-w-0 px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-center font-bold focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  {t('field_end_measure')}
                </label>
                <input
                  type="number"
                  value={endMeasure}
                  onChange={(e) => setEndMeasure(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  min={1}
                  className="w-full min-w-0 px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-center font-bold focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            {/* The tempo reached cleanly: decision D4 makes this the number the percent divides
                by, so it is the field with the same controls the session screen gives its BPM. */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                {t('field_bpm_clean')}
              </label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setBpmClean((b) => bpmStep(b, -5))}
                  className="h-10 w-10 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 text-lg font-bold transition-colors active:scale-95"
                  aria-label={t('bpm_minus_five')}
                >
                  {'\u22125'}
                </button>
                <input
                  type="number"
                  value={bpmClean}
                  onChange={(e) => setBpmClean(Math.max(1, parseInt(e.target.value, 10) || 0))}
                  placeholder={t('placeholder_bpm')}
                  min={1}
                  className="min-w-0 flex-1 px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-center text-2xl font-bold focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
                />
                <button
                  onClick={() => setBpmClean((b) => bpmStep(b, 5))}
                  className="h-10 w-10 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 text-lg font-bold transition-colors active:scale-95"
                  aria-label={t('bpm_plus_five')}
                >
                  +5
                </button>
              </div>
              {/* Both previews are the arithmetic of the row being drafted, spelled the way the
                  trigger spells it: what this block is worth, and what the song would be worth
                  with it applied. Neither is the stored column, and neither is written. */}
              <p className="text-xs text-gray-400 mt-2 text-center">
                {t('song_log_target_percent', { count: formatPercent(blockPreview) })}
                {' · '}
                <span className="text-accent-500 font-medium">
                  {t('song_percent_after_log', { count: formatPercent(percentPreview) })}
                </span>
              </p>
            </div>

            {/* The tempo it stalls at: information only (decision D4), recorded beside the row
                so a later session can see where the block still breaks down. */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                {t('field_bpm_limit')}
              </label>
              <input
                type="number"
                value={bpmLimit}
                onChange={(e) => setBpmLimit(e.target.value)}
                placeholder={t('placeholder_bpm')}
                min={1}
                className="w-full min-w-0 px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
              />
            </div>

            {/* Tension: the same three levels as a practice log (decision D6), the value picked
                being the value written. */}
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

            {formError && <p className="text-sm text-red-500 mb-3">{formError}</p>}

            <button
              onClick={handleSubmit}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-medium shadow-lg shadow-brand-600/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
            >
              {saved ? (
                <>
                  <Activity className="h-5 w-5 text-accent-400" />
                  {t('song_log_saved')}
                </>
              ) : (
                <>
                  <Save className="h-5 w-5" />
                  {saving ? t('saving') : editingLog ? t('song_log_update_button') : t('song_log_save_button')}
                </>
              )}
            </button>
          </div>

        </div>

        {/* The history. A song takes many rows per day - unlike `SessionView` there is no
            "today's record" to edit - so each row carries its own pencil, which loads it into
            the form above, and its own trash. */}
        <div className="lg:col-span-2">
          <div className="card p-4 sm:p-6">
            <div className="flex items-center gap-2 mb-4">
              <History className="h-4 w-4 text-gray-400" />
              <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('history_title')}
              </h2>
              {logs.length > 0 && (
                <span className="ml-auto text-xs text-gray-400">
                  {tp('history_count', logs.length)}
                </span>
              )}
            </div>

            {loadingHistory ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
                ))}
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-10">
                <Clock className="h-10 w-10 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  {t('no_song_logs_yet')}
                </p>
              </div>
            ) : (
              // No inner scroll below `sm`: a box that scrolls inside the page traps a
              // finger's swipe, and on a phone the whole page is the scroll.
              <div className="space-y-3 sm:max-h-[600px] sm:overflow-y-auto sm:pr-1">
                {logs.map((log, idx) => {
                  const date = new Date(log.created_at);
                  const dateStr = date.toLocaleDateString(dateLocale(), {
                    day: '2-digit',
                    month: 'short',
                    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
                  });
                  const timeStr = date.toLocaleTimeString(dateLocale(), {
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  // What the block covers of the tab tempo: the spreadsheet's `BPM Limpo (%)`
                  // column, read as the model reads it (the peak over its measures), so the row
                  // agrees with the percent the trigger wrote.
                  const share = blockPercent(logs, log.start_measure, log.end_measure, targets);
                  const editing = editingLog?.id === log.id;

                  return (
                    <div
                      key={log.id}
                      className={`group relative p-4 rounded-xl border transition-colors animate-fade-in ${
                        editing
                          ? 'bg-brand-50 dark:bg-brand-900/20 border-brand-200 dark:border-brand-800'
                          : 'bg-gray-50 dark:bg-gray-800/50 border-gray-100 dark:border-gray-800 hover:border-brand-200 dark:hover:border-brand-900'
                      }`}
                      style={{ animationDelay: `${idx * 40}ms` }}
                    >
                      {/* Always visible where a finger is the only input: a hover-reveal pencil
                          is the only way to change a row, and on touch it would never appear.
                          The pseudo-element carries the tap area past the 36px chip. */}
                      <div className="absolute top-2 right-2 flex items-center gap-1 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100">
                        <button
                          onClick={() => setEditingLog(log)}
                          className="relative h-9 w-9 rounded-lg flex items-center justify-center text-gray-300 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all active:scale-95 before:absolute before:-inset-[6px] before:content-['']"
                          aria-label={t('aria_edit_song_log')}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteLog(log.id)}
                          className="relative h-9 w-9 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all active:scale-95 before:absolute before:-inset-[6px] before:content-['']"
                          aria-label={t('aria_delete_song_log')}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="flex items-start gap-3">
                        <div
                          title={t('song_log_target_percent', { count: formatPercent(share) })}
                          className="flex flex-col items-center justify-center h-12 w-14 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 shrink-0"
                        >
                          <span className="text-lg font-bold leading-none tabular-nums">{Math.round(share)}</span>
                          <span className="text-[10px] leading-none mt-0.5">%</span>
                        </div>
                        {/* `min-w-0` so a long section name truncates instead of pushing the
                            chips and the percent box off the phone page. */}
                        <div className="min-w-0 flex-1 pr-10">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">{log.section}</span>
                            {editing && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400">
                                {t('song_log_update_button')}
                              </span>
                            )}
                          </div>
                          {/* Secondary: the stretch the row covers, its share of the tab tempo,
                              and the tempo it stalls at - information only (decision D4). */}
                          <div className="text-xs text-gray-400 mt-0.5">
                            {t('song_log_range', { count: `${log.start_measure}\u2013${log.end_measure}` })} · {t('song_log_target_percent', { count: formatPercent(share) })}
                            {log.bpm_limit !== null && ` · ${t('song_log_limit', { bpm: log.bpm_limit })}`}
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">{dateStr} · {timeStr}</div>
                          <div className="flex items-center gap-1.5 mt-1">
                            <div className="flex gap-1">
                              {[1, 2, 3].map((level) => (
                                <div
                                  key={level}
                                  className={`h-1.5 w-2.5 rounded-full ${
                                    level <= log.tension_level
                                      ? log.tension_level === 1
                                        ? 'bg-accent-500'
                                        : log.tension_level === 2
                                          ? 'bg-amber-500'
                                          : 'bg-brand-500'
                                      : 'bg-gray-200 dark:bg-gray-700'
                                  }`}
                                />
                              ))}
                            </div>
                            <span className={`text-xs font-medium ${tensionColor(log.tension_level)}`}>
                              {tensionLabel(log.tension_level)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {log.notes && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 pt-2 border-t border-gray-100 dark:border-gray-800 line-clamp-2">
                          {log.notes}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* The song's own curve, beside the rows that built it: the percent axis, not the
                dashboard's BPM one (decision D1). Drawn only once something is logged, so the
                list's `no_song_logs_yet` stays the empty state. `compact` keeps the axis
                readable in a narrow column - the tooltip already says the day and the share. */}
            {logs.length > 0 && (
              <div className="mt-5 pt-5 border-t border-gray-100 dark:border-gray-800">
                <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  {t('song_chart_title')}
                </h2>
                <ProgressChart
                  percentPoints={percentHistory(song.total_measures, targets, logs, 'all', new Date())}
                  percentLabel={song.title}
                  period="all"
                  compact
                />
              </div>
            )}
          </div>
        </div>
      </div>
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
