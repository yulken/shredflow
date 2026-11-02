import { useEffect } from 'react';

// The same-day half the day boundary cannot cover: a session logged on another
// device stays invisible to this tab until it is looked at. Only the two ways of
// looking at a tab are listened for, so a tab nobody reads spends nothing.
export function useRefreshOnVisible(refresh: () => void) {
  useEffect(() => {
    const run = () => refresh();
    const onVisibility = () => {
      // `visibilitychange` fires on going hidden too; refetching for that would
      // spend a request every time the user switches tabs away.
      if (document.visibilityState === 'visible') refresh();
    };
    // Two windows on screen: the tab is already visible, so only focus changes when
    // the user clicks back into it - the one case visibility cannot see.
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', run);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', run);
    };
  }, [refresh]);
}
