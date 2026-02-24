import { useState, useEffect, useCallback } from 'react';

/**
 * Fullscreen API on a given element ref.
 * Returns { isFullscreen, enter, exit, toggle }.
 */
export function useFullscreen(elementRef) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const updateState = useCallback(() => {
    const el = elementRef?.current;
    const full = !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.msFullscreenElement
    );
    setIsFullscreen(full);
  }, [elementRef]);

  useEffect(() => {
    const doc = document;
    const handlers = ['fullscreenchange', 'webkitfullscreenchange', 'MSFullscreenChange'];
    handlers.forEach((e) => doc.addEventListener(e, updateState));
    return () => handlers.forEach((e) => doc.removeEventListener(e, updateState));
  }, [updateState]);

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

  return { isFullscreen, enter, exit, toggle };
}
