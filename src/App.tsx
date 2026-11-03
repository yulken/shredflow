import { useState } from 'react';
import { Guitar, BarChart3, Music2, ListMusic, Settings } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { useAuth } from '@/hooks/useAuth';
import { SettingsView } from '@/components/SettingsView';
import { AuthView } from '@/components/AuthView';
import { t } from '@/lib/i18n';
import { Dashboard } from '@/components/Dashboard';
import { ExerciseList } from '@/components/ExerciseList';
import { SessionView } from '@/components/SessionView';
import { SongList } from '@/components/SongList';
import { SongView } from '@/components/SongView';
import type { Exercise, Song } from '@/lib/supabase';

// Fourth top-level view: Dashboard is the landing screen; the brand button
// routes back to it, Exercises and Settings are reachable from the header, and
// drilling into an exercise opens the session view, which returns to the list
// it came from.
//
// The gate sits in front of all four views: with no session there is nothing to
// fetch, and the RLS policies of 20261102150000_add_user_ownership.sql refuse an
// anonymous read anyway, so the sign-in card is what answers, not an empty chart.
// Theme, language and sign-out now live in Settings - named next to the account
// they belong to - so the header carries navigation only. A signed-out visitor
// cannot reach Settings, but the auth card carries the two preference controls
// itself, and both persist in the browser, so the card still speaks the language
// the visitor last chose.
export default function App() {
  const { theme, setTheme, toggleTheme } = useTheme();
  const { lang, setLanguage, toggleLanguage } = useLanguage();
  const { session, ready, signOut } = useAuth();
  const [listView, setListView] = useState<'dashboard' | 'exercises' | 'songs' | 'settings'>('dashboard');
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  // A song is opened the same way an exercise is: one row on screen, and the nav's highlight
  // keeps pointing at the list it came from until another view is chosen.
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);

  const openExercise = (exercise: Exercise) => setSelectedExercise(exercise);
  const openSong = (song: Song) => setSelectedSong(song);
  const backToList = () => setSelectedExercise(null);
  const backToSongs = () => setSelectedSong(null);
  // Every nav choice drops both selections: the songs list and the exercises list are peers,
  // and a stale selection would keep the previous row on screen under the new tab.
  const goDashboard = () => { setListView('dashboard'); setSelectedExercise(null); setSelectedSong(null); };
  const goExercises = () => { setListView('exercises'); setSelectedExercise(null); setSelectedSong(null); };
  const goSongs = () => { setListView('songs'); setSelectedExercise(null); setSelectedSong(null); };
  const goSettings = () => { setListView('settings'); setSelectedExercise(null); setSelectedSong(null); };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors duration-300">
      {/* Top bar */}
      <header className="sticky top-0 z-40 glass">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
          <button
            onClick={goDashboard}
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
            {session && (
              <nav className="flex items-center gap-1 mr-1 sm:mr-2">
                <button
                  onClick={goDashboard}
                  className={`flex items-center gap-1.5 px-2 sm:px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    listView === 'dashboard' && !selectedExercise
                      ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  <BarChart3 className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('nav_dashboard')}</span>
                </button>
                <button
                  onClick={goExercises}
                  className={`flex items-center gap-1.5 px-2 sm:px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    listView === 'exercises' && !selectedExercise
                      ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  <Music2 className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('nav_exercises')}</span>
                </button>
                <button
                  onClick={goSongs}
                  className={`flex items-center gap-1.5 px-2 sm:px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    listView === 'songs' && !selectedSong
                      ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  <ListMusic className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('nav_songs')}</span>
                </button>
                <button
                  onClick={goSettings}
                  className={`flex items-center gap-1.5 px-2 sm:px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    listView === 'settings' && !selectedExercise
                      ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  <Settings className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('nav_settings')}</span>
                </button>
              </nav>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {!ready ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card h-44 animate-pulse">
                <div className="h-full bg-gray-100 dark:bg-gray-800 rounded-2xl" />
              </div>
            ))}
          </div>
        ) : !session ? (
          <AuthView theme={theme} toggleTheme={toggleTheme} lang={lang} toggleLanguage={toggleLanguage} />
        ) : selectedExercise ? (
          <SessionView
            exercise={selectedExercise}
            onBack={backToList}
          />
        ) : selectedSong ? (
          <SongView
            song={selectedSong}
            onBack={backToSongs}
          />
        ) : listView === 'exercises' ? (
          <ExerciseList onSelectExercise={openExercise} />
        ) : listView === 'songs' ? (
          <SongList onSelectSong={openSong} />
        ) : listView === 'settings' ? (
          <SettingsView
            theme={theme}
            setTheme={setTheme}
            lang={lang}
            setLanguage={setLanguage}
            email={session.user.email ?? ''}
            signOut={signOut}
          />
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
