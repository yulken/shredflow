import { Moon, Sun } from 'lucide-react';

type Props = {
  theme: 'light' | 'dark';
  onToggle: () => void;
};

export function ThemeToggle({ theme, onToggle }: Props) {
  return (
    <button
      onClick={onToggle}
      aria-label={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
      className="relative h-10 w-10 rounded-xl flex items-center justify-center transition-colors bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
    >
      {theme === 'dark' ? (
        <Sun className="h-5 w-5 transition-transform duration-300 rotate-0 scale-100" />
      ) : (
        <Moon className="h-5 w-5 transition-transform duration-300 rotate-0 scale-100" />
      )}
    </button>
  );
}
