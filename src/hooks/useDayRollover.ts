import { useEffect } from 'react';
import { msUntilMidnight } from '@/lib/day';

// One refresh a day, at local midnight: the day is the unit a practice log is
// written in, so the day is the boundary the stale rows turn on.
//
// The timer re-schedules itself after each fire, so the day after the next is on
// the schedule too. `onRollover` has to be a stable identity (`useCallback` over
// nothing): re-running this effect re-anchors the deadline at the *current* day's
// midnight, so a re-render - the eye toggle re-renders the screen - would push the
// fire forward every time and never reach midnight.
//
// A machine that slept through midnight fires when it wakes rather than at midnight,
// which is the case this exists for: the tab comes back with the day already turned.
export function useDayRollover(onRollover: () => void) {
  useEffect(() => {
    let timer: number | undefined;
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
