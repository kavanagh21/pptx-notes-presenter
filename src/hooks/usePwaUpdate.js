import { useState, useCallback, useEffect } from 'react';

/**
 * PWA update hook using vite-plugin-pwa's virtual module.
 * Detects when a new version has been deployed and lets the user choose
 * when to reload — important so we don't interrupt a live presentation.
 *
 * Returns { updateAvailable, offlineReady, applyUpdate, dismissUpdate }.
 */
export function usePwaUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [updateSW, setUpdateSW] = useState(null);

  useEffect(() => {
    // Dynamic import so this doesn't break if the virtual module isn't available (e.g. dev mode)
    import('virtual:pwa-register')
      .then(({ registerSW }) => {
        const update = registerSW({
          onNeedRefresh() {
            setUpdateAvailable(true);
          },
          onOfflineReady() {
            setOfflineReady(true);
          },
        });
        setUpdateSW(() => update);
      })
      .catch(() => {
        // Not running with PWA plugin (dev mode) — ignore
      });
  }, []);

  const applyUpdate = useCallback(() => {
    if (updateSW) {
      updateSW(true);
    }
  }, [updateSW]);

  const dismissUpdate = useCallback(() => {
    setUpdateAvailable(false);
    setOfflineReady(false);
  }, []);

  return { updateAvailable, offlineReady, applyUpdate, dismissUpdate };
}
