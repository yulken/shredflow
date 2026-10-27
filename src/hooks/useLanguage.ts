import { useEffect, useState } from 'react';
import { getLang, setLang, LANGUAGES, t } from '@/lib/i18n';

export function useLanguage() {
  const [lang, setLangState] = useState<string>(getLang());

  useEffect(() => {
    const code = getLang();
    try {
      localStorage.setItem('lang', code);
    } catch {
      // storage unavailable, keep in-memory language only
    }
    document.documentElement.lang = code;
    document.title = t('page_title');
  }, [lang]);

  const toggleLanguage = () => {
    const next = LANGUAGES[(LANGUAGES.indexOf(lang) + 1) % LANGUAGES.length];
    setLang(next);
    setLangState(next);
  };

  return { lang, toggleLanguage };
}
