import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Screen Wake Lock hook — keeps the device screen on.
 * Works independently of fullscreen, which is important for PWA standalone mode
 * on iPad where the Fullscreen API doesn't apply.
 *
 * Returns { wakeLockActive, wakeLockSupported, toggle, request, release }.
 */
export function useWakeLock() {
  const supported = 'wakeLock' in navigator;
  const [active, setActive] = useState(false);
  const lockRef = useRef(null);
  const wantedRef = useRef(false);

  const acquire = useCallback(async () => {
    if (!supported || lockRef.current) return;
    try {
      lockRef.current = await navigator.wakeLock.request('screen');
      setActive(true);
      lockRef.current.addEventListener('release', () => {
        lockRef.current = null;
        setActive(false);
      });
    } catch {
      // Can fail if tab not visible or permission denied
    }
  }, [supported]);

  const release = useCallback(async () => {
    wantedRef.current = false;
    if (lockRef.current) {
      try { await lockRef.current.release(); } catch { /* already released */ }
      lockRef.current = null;
      setActive(false);
    }
  }, []);

  const request = useCallback(() => {
    wantedRef.current = true;
    acquire();
  }, [acquire]);

  const toggle = useCallback(() => {
    if (wantedRef.current) {
      release();
    } else {
      request();
    }
  }, [request, release]);

  // Safari/iOS releases the wake lock when the tab loses visibility.
  // Re-acquire when becoming visible again if the user still wants it.
  useEffect(() => {
    const onVisChange = () => {
      if (document.visibilityState === 'visible' && wantedRef.current && !lockRef.current) {
        acquire();
      }
    };
    document.addEventListener('visibilitychange', onVisChange);
    return () => document.removeEventListener('visibilitychange', onVisChange);
  }, [acquire]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (lockRef.current) {
        try { lockRef.current.release(); } catch { /* ignore */ }
      }
    };
  }, []);

  return {
    wakeLockActive: active,
    wakeLockSupported: supported,
    toggle,
    request,
    release,
  };
}
