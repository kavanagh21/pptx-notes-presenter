import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Fullscreen API on a given element ref.
 * Automatically requests a Screen Wake Lock while fullscreen is active
 * so the device screen doesn't dim or lock (requires Safari 16.4+ / iPadOS 16.4+).
 *
 * Returns { isFullscreen, enter, exit, toggle, wakeLockActive }.
 */
export function useFullscreen(elementRef) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const wakeLockRef = useRef(null);

  const acquireWakeLock = useCallback(async () => {
    if (!('wakeLock' in navigator)) return;
    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen');
      setWakeLockActive(true);
      wakeLockRef.current.addEventListener('release', () => {
        wakeLockRef.current = null;
        setWakeLockActive(false);
      });
    } catch {
      // Wake lock can fail if the tab isn't visible or the API isn't allowed
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try { await wakeLockRef.current.release(); } catch { /* already released */ }
      wakeLockRef.current = null;
      setWakeLockActive(false);
    }
  }, []);

  const updateState = useCallback(() => {
    const full = !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.msFullscreenElement
    );
    setIsFullscreen(full);
  }, []);

  useEffect(() => {
    const doc = document;
    const handlers = ['fullscreenchange', 'webkitfullscreenchange', 'MSFullscreenChange'];
    handlers.forEach((e) => doc.addEventListener(e, updateState));
    return () => handlers.forEach((e) => doc.removeEventListener(e, updateState));
  }, [updateState]);

  // Acquire / release wake lock when fullscreen state changes
  useEffect(() => {
    if (isFullscreen) {
      acquireWakeLock();
    } else {
      releaseWakeLock();
    }
  }, [isFullscreen, acquireWakeLock, releaseWakeLock]);

  // Safari releases the wake lock when the tab loses visibility;
  // re-acquire it when the tab becomes visible again while still fullscreen
  useEffect(() => {
    const onVisChange = () => {
      if (document.visibilityState === 'visible' && isFullscreen && !wakeLockRef.current) {
        acquireWakeLock();
      }
    };
    document.addEventListener('visibilitychange', onVisChange);
    return () => document.removeEventListener('visibilitychange', onVisChange);
  }, [isFullscreen, acquireWakeLock]);

  // Clean up wake lock on unmount
  useEffect(() => releaseWakeLock, [releaseWakeLock]);

  const requestFullscreen = useCallback((el) => {
    if (!el) return;
    const req =
      el.requestFullscreen ||
      el.webkitRequestFullscreen ||
      el.webkitRequestFullScreen ||
      el.msRequestFullscreen;
    if (req) req.call(el);
  }, []);

  const exitFullscreen = useCallback(() => {
    const exit =
      document.exitFullscreen ||
      document.webkitExitFullscreen ||
      document.msExitFullscreen;
    if (exit) exit.call(document);
  }, []);

  const enter = useCallback(() => {
    const el = elementRef?.current;
    if (el) requestFullscreen(el);
  }, [elementRef, requestFullscreen]);

  const exit = useCallback(() => exitFullscreen(), [exitFullscreen]);

  const toggle = useCallback(() => {
    const full =
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.msFullscreenElement;
    if (full) exitFullscreen();
    else if (elementRef?.current) requestFullscreen(elementRef.current);
  }, [elementRef, requestFullscreen, exitFullscreen]);

  return { isFullscreen, enter, exit, toggle, wakeLockActive };
}
