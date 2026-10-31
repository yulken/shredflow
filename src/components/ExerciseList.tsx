import { useEffect, useState } from 'react';
import { Plus, Music2, Pencil, Trash2, X, Activity, Gauge, Clock, ExternalLink, Eye, EyeOff, TrendingUp } from 'lucide-react';
import { supabase, type Exercise } from '@/lib/supabase';
import { t, tp, categories, CATEGORY_CANONICAL, categoryLabel } from '@/lib/i18n';

type Props = {
  onSelectExercise: (exercise: Exercise) => void;
};

export function ExerciseList({ onSelectExercise }: Props) {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const [sessionCounts, setSessionCounts] = useState<Record<string, number>>({});

  const fetchExercises = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('exercises')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao carregar exercícios:', error);
    } else {
      setExercises(data || []);
      // Fetch session counts for each exercise
      if (data && data.length > 0) {
        const counts: Record<string, number> = {};
        const { data: sessions } = await supabase
          .from('practice_sessions')
          .select('exercise_id');
        (sessions || []).forEach((s: { exercise_id: string }) => {
          counts[s.exercise_id] = (counts[s.exercise_id] || 0) + 1;
        });
        setSessionCounts(counts);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchExercises();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm(t('confirm_delete_exercise'))) {
      return;
    }
    const { error } = await supabase.from('exercises').delete().eq('id', id);
    if (error) {
      alert(t('error_delete_exercise'));
      return;
    }
    fetchExercises();
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
            {t('exercises_title')}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {t('exercises_subtitle')}
          </p>
        </div>
        <button
          onClick={() => { setEditingExercise(null); setShowForm(true); }}
          className="flex items-center gap-2 px-5 py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-medium shadow-lg shadow-brand-600/20 transition-all hover:scale-105 active:scale-95"
        >
          <Plus className="h-5 w-5" />
          {t('new_exercise_button')}
        </button>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card h-44 animate-pulse">
              <div className="h-full bg-gray-100 dark:bg-gray-800 rounded-2xl" />
            </div>
          ))}
        </div>
      ) : exercises.length === 0 ? (
        <div className="card p-12 text-center animate-scale-in">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-brand-100 dark:bg-brand-900/30 text-brand-500 mb-4">
            <Music2 className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            {t('no_exercises_title')}
          </h3>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            {t('no_exercises_text')}
          </p>
          <button
            onClick={() => { setEditingExercise(null); setShowForm(true); }}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-medium transition-colors"
          >
            <Plus className="h-5 w-5" />
            {t('add_exercise_button')}
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {exercises.map((exercise, idx) => (
            <div
              key={exercise.id}
              className="card p-5 group hover:shadow-md transition-all hover:-translate-y-0.5 animate-fade-in cursor-pointer"
              style={{ animationDelay: `${idx * 50}ms` }}
              onClick={() => onSelectExercise(exercise)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="inline-flex items-center justify-center h-11 w-11 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md">
                  <Music2 className="h-5 w-5" />
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingExercise(exercise); setShowForm(true); }}
                    className="h-8 w-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
                    aria-label={t('tooltip_edit')}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(exercise.id); }}
                    className="h-8 w-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    aria-label={t('tooltip_delete')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1 line-clamp-1">
                {exercise.title}
              </h3>
              {exercise.description && (
                <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-3">
                  {exercise.description}
                </p>
              )}

              <div className="flex items-center gap-2 mb-3">
                {exercise.tab_url && (
                  <a
                    href={exercise.tab_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1 text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
                    aria-label={t('link_tab_aria')}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {t('field_tab_url')}
                  </a>
                )}
                {!exercise.dashboard_visible && (
                  <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 ml-auto">
                    <EyeOff className="h-3 w-3" />
                    {t('badge_off_chart')}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                {exercise.category && (
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                    {categoryLabel(exercise.category)}
                  </span>
                )}
                {exercise.target_bpm && (
                  <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <Gauge className="h-3.5 w-3.5" />
                    {t('goal_line', { bpm: exercise.target_bpm })}
                  </span>
                )}
                {exercise.max_bpm !== null && (
                  <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <TrendingUp className="h-3.5 w-3.5" />
                    {t('stat_max_bpm')} · {exercise.max_bpm}
                  </span>
                )}
                {exercise.last_bpm !== null && (
                  <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <Clock className="h-3.5 w-3.5" />
                    {t('stat_last_bpm')} · {exercise.last_bpm}
                  </span>
                )}
                <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 ml-auto">
                  <Activity className="h-3.5 w-3.5" />
                  {tp('sessions_count', sessionCounts[exercise.id] || 0)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <ExerciseForm
          exercise={editingExercise}
          onClose={() => { setShowForm(false); setEditingExercise(null); }}
          onSaved={() => { setShowForm(false); setEditingExercise(null); fetchExercises(); }}
        />
      )}
    </div>
  );
}

function ExerciseForm({
  exercise,
  onClose,
  onSaved,
}: {
  exercise: Exercise | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(exercise?.title || '');
  const [description, setDescription] = useState(exercise?.description || '');
  const [category, setCategory] = useState(exercise?.category || '');
  const [targetBpm, setTargetBpm] = useState(exercise?.target_bpm?.toString() || '');
  const [tabUrl, setTabUrl] = useState(exercise?.tab_url || '');
  const [visible, setVisible] = useState(exercise ? exercise.dashboard_visible : true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError(t('error_title_required'));
      return;
    }
    // Normalized at write time: new URL() validates and canonicalizes; the
    // card renders the stored value verbatim as an external link.
    let tabUrlValue: string | null = null;
    if (tabUrl.trim()) {
      try {
        tabUrlValue = new URL(tabUrl.trim()).href;
      } catch {
        setError(t('error_invalid_url'));
        return;
      }
    }
    setSaving(true);
    setError('');

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      category: category.trim() || null,
      target_bpm: targetBpm ? parseInt(targetBpm, 10) : null,
      tab_url: tabUrlValue,
      dashboard_visible: visible,
    };

    if (exercise) {
      const { error } = await supabase.from('exercises').update(payload).eq('id', exercise.id);
      if (error) setError(t('error_update_exercise'));
    } else {
      const { error } = await supabase.from('exercises').insert(payload);
      if (error) setError(t('error_create_exercise'));
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
      <div className="relative w-full sm:max-w-lg card rounded-t-3xl sm:rounded-3xl p-6 max-h-[90vh] overflow-y-auto animate-slide-up sm:animate-scale-in">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            {exercise ? t('form_title_edit') : t('form_title_new')}
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
              {t('field_description')}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('placeholder_description')}
              rows={3}
              className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              {t('field_category')}
            </label>
            <div className="flex flex-wrap gap-2">
              {categories().map((label, i) => {
                const canonical = CATEGORY_CANONICAL[i];
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setCategory(category === canonical ? '' : canonical)}
                    className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                      category === canonical
                        ? 'bg-brand-600 text-white shadow-md shadow-brand-600/20'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              {t('field_bpm_target')}
            </label>
            <input
              type="number"
              value={targetBpm}
              onChange={(e) => setTargetBpm(e.target.value)}
              placeholder={t('placeholder_bpm')}
              min={1}
              max={400}
              className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              {t('field_tab_url')}
            </label>
            <input
              type="text"
              value={tabUrl}
              onChange={(e) => setTabUrl(e.target.value)}
              placeholder={t('placeholder_tab_url')}
              className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              {t('field_visibility')}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[true, false].map((value) => (
                <button
                  key={String(value)}
                  type="button"
                  onClick={() => setVisible(value)}
                  className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-colors active:scale-95 ${
                    visible === value
                      ? 'bg-brand-600 hover:bg-brand-700 text-white shadow-md'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {value ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  {value ? t('visibility_show') : t('visibility_hide')}
                </button>
              ))}
            </div>
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
              {saving ? t('saving') : exercise ? t('save_button') : t('create_button')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
