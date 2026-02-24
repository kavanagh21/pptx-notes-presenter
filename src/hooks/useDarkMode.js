import { useState, useEffect } from 'react';

const STORAGE_KEY = 'pptx-notes-presenter-dark';

function getSystemPreference() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function getStored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'true') return true;
    if (v === 'false') return false;
  } catch (_) {}
  return null;
}

function setStored(isDark) {
  try {
    localStorage.setItem(STORAGE_KEY, isDark ? 'true' : 'false');
  } catch (_) {}
}

/**
 * Dark mode with:
 * - Default from system (prefers-color-scheme) on first load
 * - User choice persisted in localStorage and overriding thereafter
 */
export function useDarkMode() {
  const [isDark, setIsDark] = useState(() => {
    const stored = getStored();
    if (stored !== null) return stored;
    return getSystemPreference();
  });

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', isDark ? 'dark' : 'light');
    setStored(isDark);
  }, [isDark]);

  const toggle = () => setIsDark((prev) => !prev);

  return { isDark, setDark: setIsDark, toggle };
}
