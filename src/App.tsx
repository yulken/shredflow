import { useState } from 'react';
import { Guitar, BarChart3, Music2 } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LanguageToggle } from '@/components/LanguageToggle';
import { t } from '@/lib/i18n';
import { Dashboard } from '@/components/Dashboard';
import { ExerciseList } from '@/components/ExerciseList';
import { SessionView } from '@/components/SessionView';
import type { Exercise } from '@/lib/supabase';

// Third top-level view (D4): Dashboard is the landing screen; the brand button
// routes back to it, Exercises is reachable from the header, and drilling into
// an exercise opens the session view, which returns to the list it came from.
export default function App() {
  const { theme, toggleTheme } = useTheme();
  const { lang, toggleLanguage } = useLanguage();
  const [listView, setListView] = useState<'dashboard' | 'exercises'>('dashboard');
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);

  const openExercise = (exercise: Exercise) => setSelectedExercise(exercise);
  const backToList = () => setSelectedExercise(null);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors duration-300">
      {/* Top bar */}
      <header className="sticky top-0 z-40 glass">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
          <button
            onClick={() => { setListView('dashboard'); setSelectedExercise(null); }}
            className="flex items-center gap-2.5 group"
          >
            <div className="inline-flex items-center justify-center h-9 w-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md shadow-brand-600/20 group-hover:scale-105 transition-transform">
              <Guitar className="h-5 w-5" />
            </div>
            <span className="text-base sm:text-lg font-bold text-gray-900 dark:text-white tracking-tight">
              {t('app_brand')}
            </span>
          </button>
          <div className="flex items-center gap-2">
            <nav className="flex items-center gap-1 mr-1 sm:mr-2">
              <button
                onClick={() => { setListView('dashboard'); setSelectedExercise(null); }}
                className={`flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  listView === 'dashboard' && !selectedExercise
                    ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <BarChart3 className="h-4 w-4" />
                <span className="hidden sm:inline">{t('nav_dashboard')}</span>
              </button>
              <button
                onClick={() => { setListView('exercises'); setSelectedExercise(null); }}
                className={`flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  listView === 'exercises' && !selectedExercise
                    ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <Music2 className="h-4 w-4" />
                <span className="hidden sm:inline">{t('nav_exercises')}</span>
              </button>
            </nav>
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            <LanguageToggle lang={lang} onToggle={toggleLanguage} />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {selectedExercise ? (
          <SessionView
            exercise={selectedExercise}
            onBack={backToList}
          />
        ) : listView === 'exercises' ? (
          <ExerciseList onSelectExercise={openExercise} />
        ) : (
          <Dashboard onSelectExercise={openExercise} />
        )}
      </main>

      {/* Footer */}
      <footer className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <p className="text-center text-xs text-gray-400 dark:text-gray-600">
          {t('footer_tagline')}
        </p>
      </footer>
    </div>
  );
}
