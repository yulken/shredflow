import { useEffect } from 'react';
import { msUntilMidnight } from '@/lib/clock';

// One refresh a day, at local midnight: the day is the unit a session is logged in,
// so it is the boundary stale rows turn on. Cheaper than a poll, which would spend a
// request every few minutes to notice a change that happens once a day. A machine
// that slept through midnight fires when it wakes - the stale-tab case this exists for.
//
// `onRollover` must be a stable identity (`useCallback` over nothing): re-running this
// effect re-anchors the deadline at the current day's midnight, and the eye toggle
// re-renders the screen, so the fire would never arrive.
export function useDayRollover(onRollover: () => void) {
  useEffect(() => {
    let timer: number | undefined;
    // Re-schedules after each fire, so the day after the next is on the schedule too.
    const schedule = () => {
      timer = window.setTimeout(() => {
        onRollover();
        schedule();
      }, msUntilMidnight(new Date()));
    };
    schedule();
    return () => clearTimeout(timer);
  }, [onRollover]);
}
