import { EN } from './locales/en';
import { ES } from './locales/es';
import { PT } from './locales/pt';

export type Locale = {
  code: string;
  nativeName: string;
  dateLocale: string;
  categories: string[];
  strings: Record<string, string>;
};

export const LANGUAGES = ['en', 'pt', 'es'];
export const LANGUAGE_NAMES: Record<string, string> = { en: 'English', pt: 'Portugu\u00e9s', es: 'Espa\u00f1ol' };

const templates: Record<string, Locale> = { en: EN, es: ES, pt: PT };
const DEFAULT_LANG = 'en';
const REFERENCE_LANG = 'en';

const initialLang = (): string => {
  try {
    const stored = localStorage.getItem('lang');
    if (stored && templates[stored]) return stored;
  } catch {
    // storage unavailable, fall through
  }
  if (typeof window !== 'undefined') {
    const fromUrl = new URLSearchParams(window.location.search).get('lang');
    if (fromUrl && templates[fromUrl]) return fromUrl;
    const browser = (navigator.language || '').toLowerCase();
    for (const code of LANGUAGES) {
      if (browser.startsWith(code)) return code;
    }
  }
  return DEFAULT_LANG;
};

let current = initialLang();

export function getLang(): string {
  return current;
}

export function setLang(code: string) {
  if (templates[code]) current = code;
}

// The toggle walks LANGUAGES in order and wraps, so the cycle is en -> pt -> es -> en.
export function nextLanguage(code: string): string {
  const at = LANGUAGES.indexOf(code);
  return LANGUAGES[(at + 1) % LANGUAGES.length];
}

export function t(key: string, params: Record<string, unknown> = {}): string {
  let raw = templates[current].strings[key];
  if (raw === undefined) {
    if (current !== REFERENCE_LANG) {
      console.warn(`i18n: key '${key}' missing in '${current}', falling back to '${REFERENCE_LANG}'`);
    }
    raw = templates[REFERENCE_LANG].strings[key] ?? key;
  }
  return raw.replace(/\{(\w+)\}/g, (_, name) => (name in params ? String(params[name]) : `{${name}}`));
}

export function tp(key: string, count: number, params: Record<string, unknown> = {}): string {
  return t(`${key}${count === 1 ? '_one' : '_other'}`, { ...params, count });
}

export function dateLocale(): string {
  return templates[current].dateLocale;
}

export function categories(): string[] {
  return templates[current].categories;
}

// Canonical category values as stored in the DB (they were originally entered
// in Portuguese). Display labels come from each locale's `categories` list,
// matched by index, so localized UIs never split existing rows.
export const CATEGORY_CANONICAL = ['T\u00e9cnica', 'Velocidade', 'Aquecimento', 'Acordes', 'Escalas', 'Improvisa\u00e7\u00e1on', 'Ritmo', 'Estudo'];

const fold = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export function categoryLabel(canonical: string | null): string {
  if (!canonical) return '';
  const list = templates[current].categories;
  for (let i = 0; i < CATEGORY_CANONICAL.length; i++) {
    if (fold(CATEGORY_CANONICAL[i]) === fold(canonical)) return list[i] ?? canonical;
  }
  return canonical;
}

export function categoryValue(label: string): string {
  const list = templates[current].categories;
  for (let i = 0; i < list.length; i++) {
    if (fold(list[i]) === fold(label)) return CATEGORY_CANONICAL[i];
  }
  return label;
}
