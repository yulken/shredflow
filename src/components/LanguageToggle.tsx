import { Globe } from 'lucide-react';
import { LANGUAGE_NAMES } from '@/lib/i18n';

type Props = {
  lang: string;
  onToggle: () => void;
};

export function LanguageToggle({ lang, onToggle }: Props) {
  return (
    <button
      onClick={onToggle}
      aria-label={LANGUAGE_NAMES[lang] ?? lang}
      className="relative h-10 w-10 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-colors bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
    >
      <Globe className="h-4 w-4 transition-transform duration-300 rotate-0 scale-100" />
      <span className="block text-[10px] font-bold leading-none text-gray-700 dark:text-gray-300">
        {lang.toUpperCase()}
      </span>
    </button>
  );
}
