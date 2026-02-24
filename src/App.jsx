import { useState, useEffect, useRef, useCallback } from 'react';
import { extractNotesFromPptx } from './lib/pptxNotes';
import { readFileAsArrayBuffer } from './lib/readFile';
import { getLastDeck, saveLastDeck, clearLastDeck } from './lib/storage';
import { useDarkMode } from './hooks/useDarkMode';
import { useFullscreen } from './hooks/useFullscreen';
import { SlidePreview } from './components/SlidePreview';
import { NotesPanel, getTopLevelGroups } from './components/NotesPanel';
import './App.css';

const DEBOUNCE_SAVE_MS = 600;

function App() {
  const containerRef = useRef(null);
  const [file, setFile] = useState(null);
  const [arrayBuffer, setArrayBuffer] = useState(null);
  const [extractedSlides, setExtractedSlides] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [notesFontSize, setNotesFontSize] = useState(1.15);
  const [notesWidthPercent, setNotesWidthPercent] = useState(50);
  const [jumpInputValue, setJumpInputValue] = useState('1');
  const [savedDeck, setSavedDeck] = useState(null);
  const [resumeMode, setResumeMode] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [bulletMode, setBulletMode] = useState(false);
  const [bulletIndex, setBulletIndex] = useState(0);
  const touchStartX = useRef(0);

  const { isDark, toggle: toggleDark } = useDarkMode();
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(containerRef);

  const slideCount = extractedSlides.length;
  const currentSlide = extractedSlides[currentIndex];
  const notesBlocks = currentSlide?.notesBlocks ?? [];
  const bulletGroups = bulletMode ? getTopLevelGroups(notesBlocks) : [];
  const bulletCount = bulletGroups.length;

  useEffect(() => {
    setJumpInputValue(String(currentIndex + 1));
    if (goToPrevSlideLastBullet.current) {
      goToPrevSlideLastBullet.current = false;
      const prevSlide = extractedSlides[currentIndex];
      const prevGroups = prevSlide ? getTopLevelGroups(prevSlide.notesBlocks || []) : [];
      setBulletIndex(Math.max(0, prevGroups.length - 1));
    } else {
      setBulletIndex(0);
    }
  }, [currentIndex, extractedSlides]);

  // Load "last deck" from IndexedDB on mount
  useEffect(() => {
    getLastDeck().then((deck) => setSavedDeck(deck));
  }, []);

  // Persist current slide index when it changes (debounced)
  useEffect(() => {
    if (!slideCount || !file?.name) return;
    const t = setTimeout(() => {
      saveLastDeck(file.name, extractedSlides, currentIndex);
    }, DEBOUNCE_SAVE_MS);
    return () => clearTimeout(t);
  }, [currentIndex, file?.name, extractedSlides, slideCount]);

  const loadFile = useCallback(async (selectedFile) => {
    if (!selectedFile) return;
    setLoadError(null);
    setLoading(true);
    setFile(null);
    setArrayBuffer(null);
    setExtractedSlides([]);
    setCurrentIndex(0);
    setResumeMode(false);
    try {
      const buffer = await readFileAsArrayBuffer(selectedFile);
      let slides;
      try {
        slides = await extractNotesFromPptx(buffer);
      } catch (parseErr) {
        throw new Error(
          `Failed to parse presentation (${selectedFile.name}, ` +
          `${(buffer.byteLength / 1024).toFixed(0)} KB). ${parseErr?.message || ''}`
        );
      }
      setArrayBuffer(buffer);
      setExtractedSlides(slides);
      setFile(selectedFile);
      await saveLastDeck(selectedFile.name, slides, 0);
    } catch (err) {
      setLoadError(err?.message || 'Failed to load or parse the presentation.');
    } finally {
      setLoading(false);
    }
  }, []);

  const resumeLastDeck = useCallback(() => {
    if (!savedDeck) return;
    const rawSlides = savedDeck.slides;
    const slides = Array.isArray(rawSlides)
      ? rawSlides.map((s, i) => ({
          slideNumber: typeof s.slideNumber === 'number' ? s.slideNumber : i + 1,
          slideIndex: typeof s.slideIndex === 'number' ? s.slideIndex : i,
          notesBlocks: Array.isArray(s.notesBlocks) ? s.notesBlocks : [],
        }))
      : [];
    if (slides.length === 0) return;
    setExtractedSlides(slides);
    const lastIdx = Math.min(
      Math.max(0, savedDeck.lastSlideIndex ?? 0),
      slides.length - 1
    );
    setCurrentIndex(lastIdx);
    setJumpInputValue(String(lastIdx + 1));
    setFile(null);
    setArrayBuffer(null);
    setResumeMode(true);
    setLoadError(null);
  }, [savedDeck]);

  const clearSaved = useCallback(async () => {
    await clearLastDeck();
    setSavedDeck(null);
    if (resumeMode) {
      setExtractedSlides([]);
      setCurrentIndex(0);
      setResumeMode(false);
    }
  }, [resumeMode]);

  const goPrevSlide = useCallback(() => {
    setCurrentIndex((i) => Math.max(0, i - 1));
  }, []);

  const goNextSlide = useCallback(() => {
    setCurrentIndex((i) => Math.min(Math.max(0, slideCount - 1), i + 1));
  }, [slideCount]);

  const goToPrevSlideLastBullet = useRef(false);

  const goPrev = useCallback(() => {
    if (bulletMode && bulletCount > 0) {
      setBulletIndex((bi) => {
        if (bi > 0) return bi - 1;
        if (currentIndex > 0) {
          goToPrevSlideLastBullet.current = true;
          setCurrentIndex((i) => i - 1);
        }
        return 0;
      });
    } else {
      goPrevSlide();
    }
  }, [bulletMode, bulletCount, currentIndex, goPrevSlide]);

  const goNext = useCallback(() => {
    if (bulletMode && bulletCount > 0) {
      setBulletIndex((bi) => {
        if (bi < bulletCount - 1) return bi + 1;
        if (currentIndex < slideCount - 1) {
          setCurrentIndex((i) => i + 1);
          return 0;
        }
        return bi;
      });
    } else {
      goNextSlide();
    }
  }, [bulletMode, bulletCount, currentIndex, slideCount, goNextSlide]);

  const goToSlide = useCallback((num) => {
    const n = parseInt(num, 10);
    if (!Number.isFinite(n)) return;
    setCurrentIndex((i) => Math.max(0, Math.min(slideCount - 1, n - 1)));
  }, [slideCount]);

  // Keyboard
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.target.closest('input, textarea, [contenteditable]')) return;
      switch (e.key) {
        case 'ArrowLeft':
        case 'PageUp':
          e.preventDefault();
          goPrev();
          break;
        case 'ArrowRight':
        case 'PageDown':
        case ' ':
          e.preventDefault();
          goNext();
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goPrev, goNext]);

  // Touch swipe
  const onTouchStart = useCallback((e) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const onTouchEnd = useCallback(
    (e) => {
      const endX = e.changedTouches[0].clientX;
      const delta = touchStartX.current - endX;
      const minSwipe = 50;
      if (delta > minSwipe) goNext();
      else if (delta < -minSwipe) goPrev();
    },
    [goPrev, goNext]
  );

  const onFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) loadFile(f);
    e.target.value = '';
  };

  return (
    <div
      ref={containerRef}
      className={`app ${isDark ? 'app--dark' : ''} ${isFullscreen ? 'app--fullscreen' : ''}`}
    >
      <header className="app__header">
        <div className="app__header-inner">
          <h1 className="app__title">Presenter Notes <span className="app__version">v1.0.0</span></h1>
          <div className="app__controls">
            <label className="app__file-label">
              <span className="app__file-button">Choose file</span>
              <input
                type="file"
                accept=".pptx,.ppsx,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.presentationml.slideshow"
                onChange={onFileChange}
                className="app__file-input"
                disabled={loading}
              />
            </label>
            {savedDeck && !resumeMode && (
              <button type="button" className="app__btn app__btn--secondary" onClick={resumeLastDeck}>
                Resume last deck
              </button>
            )}
            {savedDeck && (
              <button type="button" className="app__btn app__btn--secondary" onClick={clearSaved}>
                Clear saved deck
              </button>
            )}
            <button
              type="button"
              className={`app__btn app__btn--toggle ${bulletMode ? 'app__btn--toggle-active' : ''}`}
              onClick={() => { setBulletMode((m) => !m); setBulletIndex(0); }}
              title={bulletMode ? 'Show all notes' : 'Bullet-by-bullet mode'}
              aria-pressed={bulletMode}
            >
              {bulletMode ? 'All notes' : 'Bullet mode'}
            </button>
            <label className="app__label-inline">
              <span className="app__label-text">Font</span>
              <input
                type="range"
                min="0.85"
                max="3.5"
                step="0.05"
                value={notesFontSize}
                onChange={(e) => setNotesFontSize(Number(e.target.value))}
                className="app__font-slider"
              />
            </label>
            {slideCount > 0 && (
              <label className="app__label-inline">
                <span className="app__label-text">Text width</span>
                <input
                  type="range"
                  min="35"
                  max="75"
                  step="5"
                  value={notesWidthPercent}
                  onChange={(e) => setNotesWidthPercent(Number(e.target.value))}
                  className="app__font-slider"
                />
              </label>
            )}
            <button
              type="button"
              className="app__btn app__btn--icon"
              onClick={toggleDark}
              title={isDark ? 'Light mode' : 'Dark mode'}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? '☀️' : '🌙'}
            </button>
            <button
              type="button"
              className="app__btn app__btn--icon"
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit full screen' : 'Full screen'}
              aria-label={isFullscreen ? 'Exit full screen' : 'Full screen'}
            >
              {isFullscreen ? '✕' : '⛶'}
            </button>
          </div>
        </div>
      </header>

      {loadError && (
        <div className="app__error" role="alert">
          {loadError}
        </div>
      )}

      {loading && (
        <div className="app__loading">
          <p>Loading presentation…</p>
        </div>
      )}

      {!loading && (slideCount > 0 || resumeMode) && (
        <>
          <div className="app__nav">
            <button
              type="button"
              className="app__nav-btn"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); goPrev(); }}
              disabled={currentIndex <= 0}
              aria-label="Previous slide"
            >
              ‹
            </button>
            <span className="app__nav-info">
              <input
                type="number"
                min={1}
                max={slideCount}
                value={jumpInputValue}
                onChange={(e) => setJumpInputValue(e.target.value)}
                onBlur={() => goToSlide(jumpInputValue)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    goToSlide(jumpInputValue);
                  }
                }}
                className="app__jump-input"
                aria-label="Slide number"
              />
              <span className="app__nav-sep">/</span>
              <span>{slideCount}</span>
            </span>
            <button
              type="button"
              className="app__nav-btn"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); goNext(); }}
              disabled={slideCount <= 0 || currentIndex >= slideCount - 1}
              aria-label="Next slide"
            >
              ›
            </button>
          </div>

          <main
            className="app__main"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            style={{ '--notes-width-percent': `${notesWidthPercent}%` }}
          >
            <section className="app__preview-wrap">
              <SlidePreview
                fileOrBuffer={resumeMode ? null : arrayBuffer}
                currentSlideIndex={currentIndex}
                className="app__preview"
                isResumeMode={resumeMode}
              />
            </section>
            <section className="app__notes-wrap">
              <NotesPanel
                notesBlocks={notesBlocks}
                fontSize={notesFontSize}
                className="app__notes"
                bulletMode={bulletMode}
                bulletIndex={bulletIndex}
              />
            </section>
          </main>
        </>
      )}

      {!loading && slideCount === 0 && !resumeMode && !loadError && (
        <div className="app__welcome">
          <p>Select a .pptx or .ppsx file to view presenter notes and slide preview.</p>
          {savedDeck && (
            <button type="button" className="app__btn app__btn--primary" onClick={resumeLastDeck}>
              Resume last deck: {savedDeck.deckName}
            </button>
          )}
        </div>
      )}

      {resumeMode && slideCount > 0 && (
        <p className="app__resume-hint">Resuming last deck (no file). Load a file again for slide preview.</p>
      )}
    </div>
  );
}

export default App;
