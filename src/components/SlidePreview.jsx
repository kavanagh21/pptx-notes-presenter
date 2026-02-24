import { useState, useEffect, useRef, useCallback } from 'react';
import { pptxToHtml } from '@jvmr/pptx-to-html';

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

const FALLBACK_MSG = 'Preview unavailable for this slide (notes still available)';

/** Default slide size the library uses (we scale output to fit container) */
const LIB_WIDTH = 960;
const LIB_HEIGHT = 540;

/**
 * Renders a single slide from a PPTX using @jvmr/pptx-to-html.
 * Scales the generated HTML to fit the container for better quality.
 */
export function SlidePreview({ fileOrBuffer, currentSlideIndex, className = '', isResumeMode = false }) {
  const wrapperRef = useRef(null);
  const containerRef = useRef(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [slidesHtml, setSlidesHtml] = useState(null);
  const lastRenderedIndexRef = useRef(-1);

  const getArrayBuffer = useCallback(async () => {
    if (!fileOrBuffer) return null;
    if (fileOrBuffer instanceof ArrayBuffer) return fileOrBuffer;
    if (fileOrBuffer instanceof Blob || fileOrBuffer instanceof File) {
      return await readFileAsArrayBuffer(fileOrBuffer);
    }
    return null;
  }, [fileOrBuffer]);

  // Parse PPTX once when file/buffer changes
  useEffect(() => {
    let cancelled = false;
    setError(null);
    setSlidesHtml(null);
    lastRenderedIndexRef.current = -1;

    if (!fileOrBuffer) return;

    setLoading(true);
    getArrayBuffer()
      .then((buffer) => {
        if (!buffer || cancelled) return;
        return pptxToHtml(buffer, {
          width: LIB_WIDTH,
          height: LIB_HEIGHT,
          scaleToFit: true,
          letterbox: true,
        });
      })
      .then((htmlArray) => {
        if (cancelled) return;
        setSlidesHtml(Array.isArray(htmlArray) ? htmlArray : []);
        setLoading(false);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message || 'Failed to load preview');
          setSlidesHtml(null);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [fileOrBuffer, getArrayBuffer]);

  // Render current slide into container
  useEffect(() => {
    const container = containerRef.current;
    if (!container || slidesHtml == null) return;

    const index = Math.max(0, Math.min(currentSlideIndex, slidesHtml.length - 1));
    const html = slidesHtml[index];
    if (html) {
      container.innerHTML = html;
    } else {
      container.innerHTML = '';
    }
    lastRenderedIndexRef.current = index;
  }, [slidesHtml, currentSlideIndex]);

  // Scale the slide content to fit the wrapper (fixes poor rendering in small/large containers)
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const container = containerRef.current;
    if (!wrapper || !container || !container.firstElementChild) return;

    const updateScale = () => {
      const wrapRect = wrapper.getBoundingClientRect();
      const child = container.firstElementChild;
      if (!child) return;
      const w = child.offsetWidth || LIB_WIDTH;
      const h = child.offsetHeight || LIB_HEIGHT;
      if (w <= 0 || h <= 0) return;
      const scale = Math.min(wrapRect.width / w, wrapRect.height / h, 2);
      child.style.position = 'absolute';
      child.style.left = '50%';
      child.style.top = '50%';
      child.style.transformOrigin = 'center center';
      child.style.transform = `translate(-50%, -50%) scale(${scale})`;
    };

    updateScale();
    const ro = new ResizeObserver(updateScale);
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, [slidesHtml, currentSlideIndex]);

  if (!fileOrBuffer) {
    const msg = isResumeMode
      ? 'Resumed deck — no file loaded. Choose a file above for slide preview.'
      : 'Select a presentation to see the slide preview.';
    return (
      <div className={`slide-preview slide-preview--empty ${className}`.trim()}>
        <p className="slide-preview__placeholder">{msg}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={`slide-preview slide-preview--loading ${className}`.trim()}>
        <p className="slide-preview__placeholder">Loading preview…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`slide-preview slide-preview--error ${className}`.trim()}>
        <p className="slide-preview__fallback">{FALLBACK_MSG}</p>
      </div>
    );
  }

  return (
    <div className={`slide-preview slide-preview--ready ${className}`.trim()}>
      <div ref={wrapperRef} className="slide-preview__wrapper">
        <div
          ref={containerRef}
          className="slide-preview__content"
          aria-label={`Slide ${currentSlideIndex + 1} preview`}
        />
      </div>
    </div>
  );
}
