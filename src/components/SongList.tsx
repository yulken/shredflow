import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, ListMusic, Pencil, Trash2, X, Activity, Check, Ruler } from 'lucide-react';
import { supabase, type Song } from '@/lib/supabase';
import { t, tp, dateLocale } from '@/lib/i18n';
import { isSameLocalDay } from '@/lib/clock';
import { formatPercent, percentOf } from '@/lib/songProgress';
import { SONG_ORDERS, SONG_ORDER_LABEL_KEYS, orderedSongs } from '@/lib/songOrder';
import { useSongOrder } from '@/hooks/useSongOrder';
import { useDayRollover } from '@/hooks/useDayRollover';
import { useRefreshOnVisible } from '@/hooks/useRefreshOnVisible';

type Props = {
  onSelectSong: (song: Song) => void;
};

export function SongList({ onSelectSong }: Props) {
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingSong, setEditingSong] = useState<Song | null>(null);
  const [logCounts, setLogCounts] = useState<Record<string, number>>({});
  const [lastLogs, setLastLogs] = useState<Record<string, string>>({});
  // Whether the song already has a log on the current day. Derived from the logs, never
  // stored on the song: unlike `practice_sessions`, a song takes many rows per day, so the
  // fact is "some row today", not "the day's row".
  const [practicedToday, setPracticedToday] = useState<Record<string, boolean>>({});
  // Which order the cards are shown in - a preference of this screen, persisted like the
  // chart's period, never a field of the song.
  const { order, setOrder } = useSongOrder();

  // Rows, counts and the newest log come off one read, so a refresh is one round trip. The
  // identity is fixed (`useCallback` over nothing): the midnight timer re-anchors its
  // deadline whenever the callback changes, and the form modal re-renders this screen.
  const inFlight = useRef(false);
  const fetchData = useCallback(async ({ background = false }: { background?: boolean } = {}) => {
    // Two background triggers can land in the same instant - a focus and the midnight timer.
    // The explicit re-read after a save or a delete always runs: the percent and the chips the
    // card has to show are the ones just written by the trigger.
    if (background && inFlight.current) return;
    inFlight.current = true;
    // A background refresh keeps the cards on screen: the skeleton would blank the list to
    // show data that is usually about to be the same, and a failed one leaves the last good
    // rows readable.
    if (!background) setLoading(true);
    // Creation order is not what the screen shows, but the read still needs one: the newest
    // created row is the last tie-break an order has - the one among songs never logged.
    const { data, error } = await supabase
      .from('songs')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao carregar músicas:', error);
    } else {
      setSongs(data || []);
      // Log count and newest log per song, from one read: the card footer shows both, and the
      // REST API cannot order a song by its log rows.
      if (data && data.length > 0) {
        const counts: Record<string, number> = {};
        const lasts: Record<string, string> = {};
        const { data: logs } = await supabase
          .from('song_progress_logs')
          .select('song_id, created_at');
        (logs || []).forEach((l: { song_id: string; created_at: string }) => {
          counts[l.song_id] = (counts[l.song_id] || 0) + 1;
          // ISO timestamps sort as strings, so this picks the newest log.
          if (!lasts[l.song_id] || l.created_at > lasts[l.song_id]) {
            lasts[l.song_id] = l.created_at;
          }
        });
        setLogCounts(counts);
        setLastLogs(lasts);
        // The day's log, asked against one clock read so every song compares to the same
        // instant: the day is the boundary the rollover refresh turns on.
        const now = new Date();
        const todays: Record<string, boolean> = {};
        for (const id of Object.keys(lasts)) {
          todays[id] = isSameLocalDay(new Date(lasts[id]), now);
        }
        setPracticedToday(todays);
      }
    }
    if (!background) setLoading(false);
    inFlight.current = false;
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Past midnight the check would name yesterday, and a log written elsewhere the same day is
  // the other half of the same staleness - both refreshes are the exercise list's.
  useDayRollover(fetchData);
  useRefreshOnVisible(fetchData);

  const handleDelete = async (id: string) => {
    if (!confirm(t('confirm_delete_song'))) return;
    // `song_measure_targets` and `song_progress_logs` hang off the song with ON DELETE
    // CASCADE, so removing the row removes its structure and its history in one statement.
    const { error } = await supabase.from('songs').delete().eq('id', id);
    if (error) {
      alert(t('error_delete_song'));
      return;
    }
    fetchData();
  };

  // The cards in the order the control names. Counts and newest log arrive with the rows in
  // one read, so the sort is over data already in state; it copies, leaving the fetch's array
  // as it was returned.
  const rows = orderedSongs(songs, order, logCounts, lastLogs);

  return (
    <div className="animate-fade-in">
      {/* Wraps below sm: the title, the order control and the button do not share 360px. */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 sm:mb-8">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
            {t('songs_title')}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {t('songs_subtitle')}
          </p>
          {/* The structure is not typed here: it comes from the tab, measure by measure, and
              a hand-typed 100 rows would be a worse import than the script. */}
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500 font-mono">
            {t('songs_import_hint')}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <div role="group" aria-label={t('list_order_label')} className="flex flex-wrap items-center gap-1">
            {SONG_ORDERS.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setOrder(o)}
                aria-pressed={order === o}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  order === o
                    ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {t(SONG_ORDER_LABEL_KEYS[o])}
              </button>
            ))}
          </div>
          <button
            onClick={() => { setEditingSong(null); setShowForm(true); }}
            className="flex shrink-0 items-center gap-2 px-4 py-2.5 sm:px-5 sm:py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-medium shadow-lg shadow-brand-600/20 transition-all hover:scale-105 active:scale-95"
          >
            <Plus className="h-5 w-5" />
            {t('new_song_button')}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card h-44 animate-pulse">
              <div className="h-full bg-gray-100 dark:bg-gray-800 rounded-2xl" />
            </div>
          ))}
        </div>
      ) : songs.length === 0 ? (
        <div className="card p-8 sm:p-12 text-center animate-scale-in">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-brand-100 dark:bg-brand-900/30 text-brand-500 mb-4">
            <ListMusic className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            {t('no_songs_title')}
          </h3>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            {t('no_songs_text')}
          </p>
          <button
            onClick={() => { setEditingSong(null); setShowForm(true); }}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-medium transition-colors"
          >
            <Plus className="h-5 w-5" />
            {t('add_song_button')}
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((song, idx) => {
            const percent = percentOf(song);
            // Newest log formatted like the session history reads it: day + short month,
            // year only when it is not the current year.
            const lastDate = lastLogs[song.id] ? new Date(lastLogs[song.id]) : null;
            const practiced = practicedToday[song.id] ?? false;
            const lastDateStr = lastDate
              ? lastDate.toLocaleDateString(dateLocale(), {
                  day: '2-digit',
                  month: 'short',
                  year: lastDate.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
                })
              : null;
            return (
              // Hover effects only where hovering is a real input: on touch `:hover` sticks
              // after the tap and the card would stay lifted.
              <div
                key={song.id}
                className="card p-4 sm:p-5 group transition-all animate-fade-in cursor-pointer active:scale-[0.99] [@media(hover:hover)]:hover:shadow-md [@media(hover:hover)]:hover:-translate-y-0.5"
                style={{ animationDelay: `${idx * 50}ms` }}
                onClick={() => onSelectSong(song)}
              >
                <div className="flex items-start justify-between gap-3 mb-1">
                  <h3 className="min-w-0 flex-1 text-lg font-semibold text-gray-900 dark:text-white line-clamp-2">
                    {song.title}
                  </h3>
                  {/* Visible wherever there is no hover to reveal them: edit and delete are
                      the only way to change or remove a song on this screen. */}
                  <div className="flex gap-2 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100">
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingSong(song); setShowForm(true); }}
                      className="relative h-9 w-9 rounded-lg flex items-center justify-center text-gray-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors active:scale-95 before:absolute before:-inset-[2px] before:content-['']"
                      aria-label={t('tooltip_edit')}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(song.id); }}
                      className="relative h-9 w-9 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors active:scale-95 before:absolute before:-inset-[2px] before:content-['']"
                      aria-label={t('tooltip_delete')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* The song's own headline number: the stored percent, which the trigger wrote
                    from the logs. A bar, not just digits, because the question is how much of
                    the song is left - the fill is the answer beside the number it spells. */}
                <div className="flex items-center gap-2 mb-3">
                  <div
                    role="progressbar"
                    aria-label={t('song_stat_percent')}
                    aria-valuenow={Number(percent.toFixed(2))}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="h-2 min-w-0 flex-1 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden"
                  >
                    <div
                      className={`h-full rounded-full ${percent >= 100 ? 'bg-accent-500' : 'bg-brand-500'}`}
                      style={{ width: `${Math.min(100, Math.max(percent, 2))}%` }}
                    />
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-gray-600 dark:text-gray-300">
                    {t('songs_percent_caption', { count: formatPercent(percent) })}
                  </span>
                </div>

                {/* Footer on one wrapping row: the chips stay left, the log block hangs right
                    over the divider, so a phone wraps it onto the next line as one unit. */}
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    {/* The day's log, bare icon like the exercise card's: status, not a
                        control - the card already navigates on the same tap. */}
                    {practiced && (
                      <span
                        role="img"
                        aria-label={t('practiced_today')}
                        title={t('practiced_today')}
                        className="text-accent-600 dark:text-accent-500"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                      <Ruler className="h-3.5 w-3.5" />
                      {t('song_stat_measures')} · {song.total_measures}
                    </span>
                  </div>
                  <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <Activity className="h-3.5 w-3.5" />
                    {tp('song_logs_count', logCounts[song.id] || 0)}
                    {lastDateStr && <>· {t('song_stat_last_log')} {lastDateStr}</>}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <SongForm
          song={editingSong}
          onClose={() => { setShowForm(false); setEditingSong(null); }}
          onSaved={() => { setShowForm(false); setEditingSong(null); fetchData(); }}
        />
      )}
    </div>
  );
}

/**
 * The song's own row: name, tab link, length. The structure is not here - measure targets
 * come from `scripts/import-songsterr.mjs`, and `percent` is written by the triggers, so
 * neither is a field this form may send. `total_measures` is the denominator the percent
 * divides by, which is why editing a song that already has logs changes the value it means.
 */
function SongForm({
  song,
  onClose,
  onSaved,
}: {
  song: Song | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(song?.title || '');
  const [songsterrUrl, setSongsterrUrl] = useState(song?.songsterr_url || '');
  const [totalMeasures, setTotalMeasures] = useState(song?.total_measures?.toString() || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError(t('error_title_required'));
      return;
    }
    let urlValue: string | null = null;
    if (songsterrUrl.trim()) {
      // Normalized at write time: new URL() validates and canonicalizes, the same rule the
      // exercise form follows, so the link the song screen renders is a URL not typed text.
      try {
        urlValue = new URL(songsterrUrl.trim()).href;
      } catch {
        setError(t('error_invalid_url'));
        return;
      }
    }
    const measures = parseInt(totalMeasures, 10);
    if (!Number.isFinite(measures) || measures < 1) {
      setError(t('error_total_measures'));
      return;
    }
    setSaving(true);
    setError('');

    // No `percent`: the column belongs to `sync_song_percent*`, the way `max_bpm`/`last_bpm`
    // belong to `sync_exercise_bpm_records`. The Songsterr identifiers stay out of the form
    // too - only the import script writes them, and a hand-typed value would claim a revision
    // that was never read.
    const payload = {
      title: title.trim(),
      songsterr_url: urlValue,
      total_measures: measures,
    };

    if (song) {
      const { error } = await supabase.from('songs').update(payload).eq('id', song.id);
      if (error) setError(t('error_update_song'));
    } else {
      const { error } = await supabase.from('songs').insert(payload);
      if (error) setError(t('error_create_song'));
    }

    setSaving(false);
    if (!error) onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div className="relative w-full sm:max-w-lg card rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 max-h-[90vh] overflow-y-auto animate-slide-up sm:animate-scale-in">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            {song ? t('form_title_edit_song') : t('form_title_new_song')}
          </h2>
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label={t('aria_close_form')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              {t('field_title')}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('placeholder_title')}
              autoFocus
              className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              {t('field_songsterr_url')}
            </label>
            <input
              type="text"
              value={songsterrUrl}
              onChange={(e) => setSongsterrUrl(e.target.value)}
              placeholder={t('placeholder_songsterr_url')}
              className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              {t('field_total_measures')}
            </label>
            {/* `min-w-0`: a number input carries an intrinsic width (the default `size` of 20
                characters), which at a phone's card width would push the page sideways. */}
            <input
              type="number"
              value={totalMeasures}
              onChange={(e) => setTotalMeasures(e.target.value)}
              placeholder={t('placeholder_bpm')}
              min={1}
              className="w-full min-w-0 px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
            />
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-5 py-3 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              {t('cancel_button')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-5 py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-medium shadow-lg shadow-brand-600/20 transition-all disabled:opacity-50"
            >
              {saving ? t('saving') : song ? t('save_button') : t('create_button')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
