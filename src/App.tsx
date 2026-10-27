import { useState } from 'react';
import { Guitar } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LanguageToggle } from '@/components/LanguageToggle';
import { t } from '@/lib/i18n';
import { ExerciseList } from '@/components/ExerciseList';
import { SessionView } from '@/components/SessionView';
import type { Exercise } from '@/lib/supabase';

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const { lang, toggleLanguage } = useLanguage();
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors duration-300">
      {/* Top bar */}
      <header className="sticky top-0 z-40 glass">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <button
            onClick={() => setSelectedExercise(null)}
            className="flex items-center gap-2.5 group"
          >
            <div className="inline-flex items-center justify-center h-9 w-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md shadow-brand-600/20 group-hover:scale-105 transition-transform">
              <Guitar className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold text-gray-900 dark:text-white tracking-tight">
              {t('app_brand')}
            </span>
          </button>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <LanguageToggle lang={lang} onToggle={toggleLanguage} />
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {selectedExercise ? (
          <SessionView
            exercise={selectedExercise}
            onBack={() => setSelectedExercise(null)}
          />
        ) : (
          <ExerciseList onSelectExercise={setSelectedExercise} />
        )}
      </main>

      {/* Footer */}
      <footer className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <p className="text-center text-xs text-gray-400 dark:text-gray-600">
          {t('footer_tagline')}
        </p>
      </footer>
    </div>
  );
}
