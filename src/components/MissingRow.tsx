import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { t } from '@/lib/i18n';

// A detail route that found no row. The URL named an id, and the read answered with
// nothing - a row deleted while the tab was open, an id typed from memory, or a row
// that belongs to another account and is therefore invisible to the SELECT policy of
// `20261102150000_add_user_ownership.sql`. Those three are one card, because the app
// has no way to tell them apart from a read and the reader's next step is the same.
//
// The way out is a link to the list rather than a browser back: an address that names
// no row is usually the one the reader typed, and a back button on top of it returns
// to the same dead address.
type Props = {
  // Dictionary keys, not copy: the same card answers for an exercise and for a song,
  // and the wording belongs to the dictionaries.
  missingKey: string;
  backKey: string;
  backTo: string;
};

export function MissingRow({ missingKey, backKey, backTo }: Props) {
  return (
    <div className="max-w-md mx-auto animate-fade-in">
      <div className="card p-8 sm:p-12 text-center">
        <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-brand-100 dark:bg-brand-900/30 text-brand-500 mb-4">
          <AlertTriangle className="h-8 w-8" />
        </div>
        <p className="text-gray-500 dark:text-gray-400 mb-6">{t(missingKey)}</p>
        <Link
          to={backTo}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-medium transition-colors active:scale-95"
        >
          <ArrowLeft className="h-5 w-5" />
          {t(backKey)}
        </Link>
      </div>
    </div>
  );
}
