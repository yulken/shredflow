import { useEffect, useState } from 'react';
import { DEFAULT_PERIOD, PERIOD_STORAGE_KEY, isPeriod, type Period } from '@/lib/period';

// The chart's period window, persisted like the language is: read once at mount,
// written back on change. The stored value is validated rather than trusted -
// `localStorage` is whatever a previous build left there, and a stale or hand
// edited value must not reach the chart as a filter the UI cannot name.
export function useChartPeriod() {
  const [period, setPeriodState] = useState<Period>(readStoredPeriod());

  useEffect(() => {
    try {
      localStorage.setItem(PERIOD_STORAGE_KEY, period);
    } catch {
      // storage unavailable, keep the in-memory period only
    }
  }, [period]);

  const setPeriod = (next: Period) => setPeriodState(next);

  return { period, setPeriod };
}

function readStoredPeriod(): Period {
  try {
    const stored = localStorage.getItem(PERIOD_STORAGE_KEY);
    if (isPeriod(stored)) return stored;
  } catch {
    // storage unavailable, fall through to the default
  }
  return DEFAULT_PERIOD;
}
