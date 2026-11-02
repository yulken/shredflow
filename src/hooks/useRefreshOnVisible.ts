import { useEffect } from 'react';

// The same-day half midnight cannot cover: a session logged on another device stays
// invisible until this tab is looked at. Only the two ways of looking at a tab are
// listened for, so a tab nobody reads spends nothing.
export function useRefreshOnVisible(refresh: () => void) {
  useEffect(() => {
    // Two windows on screen: the tab is already visible, so only focus changes when
    // the user clicks back into it - the one case visibility cannot see.
    const run = () => refresh();
    const onVisibility = () => {
      // `visibilitychange` fires on going hidden too; refetching for that would spend
      // a request every time the user switches tabs away.
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', run);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', run);
    };
  }, [refresh]);
}
