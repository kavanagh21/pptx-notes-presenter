/**
 * Persist last deck's extracted notes (and metadata) in IndexedDB.
 * Does not store the full PPTX binary; only extracted notes + deck name + timestamp.
 */

const DB_NAME = 'pptx-notes-presenter';
const DB_VERSION = 1;
const STORE_NAME = 'last-deck';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

const SINGLETON_KEY = 'last';

/**
 * @typedef {Object} SavedDeck
 * @property {string} id
 * @property {string} deckName
 * @property {number} timestamp
 * @property {number} lastSlideIndex
 * @property {{ slideNumber: number, slideIndex: number, notesBlocks: object[] }[]} slides
 */

/**
 * Load the last saved deck from IndexedDB, if any.
 * @returns {Promise<SavedDeck | null>}
 */
export async function getLastDeck() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(SINGLETON_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch (e) {
    console.warn('getLastDeck failed', e);
    return null;
  }
}

/**
 * Save extracted notes and metadata (no PPTX binary).
 * @param {string} deckName
 * @param {{ slideNumber: number, slideIndex: number, notesBlocks: object[] }[]} slides
 * @param {number} lastSlideIndex
 */
export async function saveLastDeck(deckName, slides, lastSlideIndex) {
  try {
    const db = await openDB();
    const payload = {
      id: SINGLETON_KEY,
      deckName,
      timestamp: Date.now(),
      lastSlideIndex: Math.max(0, lastSlideIndex),
      slides: slides.map((s) => ({
        slideNumber: s.slideNumber,
        slideIndex: s.slideIndex,
        notesBlocks: s.notesBlocks || [],
      })),
    };
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(payload);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch (e) {
    console.warn('saveLastDeck failed', e);
  }
}

/**
 * Clear the saved deck from IndexedDB.
 */
export async function clearLastDeck() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(SINGLETON_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch (e) {
    console.warn('clearLastDeck failed', e);
  }
}
