/**
 * Extract speaker notes from a PPTX file (client-side, JSZip + DOMParser).
 * Preserves paragraphs, bullet lists (level + bullet char), and filters placeholders.
 */

import JSZip from 'jszip';

const PLACEHOLDER_PHRASES = [
  'click to add notes',
  'click to add text',
  'add notes',
];

function isPlaceholderText(text) {
  const t = (text || '').trim().toLowerCase();
  return PLACEHOLDER_PHRASES.some((p) => t === p || t.startsWith(p));
}

/**
 * Get list level (0-based) from a:pPr. OOXML uses lvl attribute (0-based).
 * @param {Element} pPr - a:pPr element or null
 * @returns {number}
 */
function getLevel(pPr) {
  if (!pPr) return 0;
  const lvl = pPr.getAttribute('lvl');
  return lvl !== null && lvl !== '' ? Math.max(0, parseInt(lvl, 10)) : 0;
}

/**
 * Check if paragraph has bullet/list styling. a:pPr can have buChar, buLet, buNum, etc.
 * @param {Element} pPr - a:pPr element or null
 * @returns {boolean}
 */
function hasBullet(pPr) {
  if (!pPr) return false;
  const ns = pPr.getAttribute('marL') !== null; // often list items have marL
  const buChar = pPr.getAttribute('buChar');
  const buLet = pPr.getAttribute('buLet');
  const buNum = pPr.getAttribute('buNum');
  const buBlip = pPr.getAttribute('buBlip');
  return buChar != null || buLet != null || buNum != null || buBlip != null || ns;
}

/**
 * Get bullet character from a:pPr if present. Default to •.
 * @param {Element} pPr - a:pPr element or null
 * @returns {string}
 */
function getBulletChar(pPr) {
  if (!pPr) return '•';
  const c = pPr.getAttribute('buChar');
  if (c != null && c !== '') return c;
  const buLet = pPr.getAttribute('buLet');
  if (buLet != null && buLet !== '') return buLet;
  return '•';
}

/**
 * Find all descendant elements with the given local name (namespace-agnostic).
 * @param {Element} root
 * @param {string} localName
 * @returns {Element[]}
 */
function getElementsByLocalName(root, localName) {
  const out = [];
  const walk = (el) => {
    if (el.nodeType !== Node.ELEMENT_NODE) return;
    if (el.localName === localName) out.push(el);
    for (const child of el.children) walk(child);
  };
  walk(root);
  return out;
}

/**
 * Extract text from a paragraph element (a:p). Concatenates all a:r/a:t and a:br.
 * Uses localName only so namespace doesn't matter.
 * @param {Element} p - paragraph element
 * @returns {string}
 */
function getParagraphText(p) {
  const parts = [];
  const walk = (node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const local = node.localName;
      if (local === 't') {
        parts.push(node.textContent || '');
      } else if (local === 'br' || local === 'ln') {
        parts.push('\n');
      } else {
        for (const child of node.childNodes) walk(child);
      }
    } else if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent || '');
    }
  };
  walk(p);
  let out = parts.join('').replace(/\n+/g, ' ').trim();
  if (out === '' && p.textContent) {
    out = p.textContent.replace(/\s+/g, ' ').trim();
  }
  return out;
}

/**
 * Get the txBody element that belongs to the notes "body" placeholder (the one with actual notes text).
 * In notes slides there is often sldImg (thumbnail) and body (notes text). We want body.
 * @param {Element} root - documentElement of notes slide
 * @returns {Element|null} - txBody of body placeholder, or null
 */
/**
 * Get the placeholder type for a shape, or '' if none.
 * @param {Element} sp
 * @returns {string}
 */
function getPlaceholderType(sp) {
  const nvSpPr = getElementsByLocalName(sp, 'nvSpPr')[0];
  if (!nvSpPr) return '';
  const ph = getElementsByLocalName(nvSpPr, 'ph')[0];
  if (!ph) return '';
  return (ph.getAttribute('type') || '').toLowerCase();
}

/**
 * Get the txBody that belongs to the notes "body" placeholder.
 * Falls back to any shape that is NOT sldImg or sldNum.
 * @param {Element} root
 * @returns {Element|null}
 */
function findNotesBodyTxBody(root) {
  const shapes = getElementsByLocalName(root, 'sp');
  for (const sp of shapes) {
    if (getPlaceholderType(sp) === 'body') {
      const txBody = getElementsByLocalName(sp, 'txBody')[0];
      if (txBody) return txBody;
    }
  }
  for (const sp of shapes) {
    const phType = getPlaceholderType(sp);
    if (phType === 'sldimg' || phType === 'sldnum' || phType === 'dt' || phType === 'hdr' || phType === 'ftr') continue;
    const txBody = getElementsByLocalName(sp, 'txBody')[0];
    if (txBody) return txBody;
  }
  return null;
}

/**
 * Parse one notes slide XML string into structured notes blocks.
 * Prefers the "body" placeholder shape (actual notes); falls back to all txBodies.
 * @param {Document} doc - Parsed document (from DOMParser)
 * @returns {{ text: string, level: number, isBullet: boolean }[]}
 */
function parseNotesSlideXml(doc) {
  const blocks = [];
  const root = doc.documentElement;

  let txBodies = [];
  const bodyTxBody = findNotesBodyTxBody(root);
  if (bodyTxBody) {
    txBodies = [bodyTxBody];
  } else {
    txBodies = getElementsByLocalName(root, 'txBody');
  }

  for (const txBody of txBodies) {
    const paragraphs = getElementsByLocalName(txBody, 'p');
    for (const p of paragraphs) {
      const text = getParagraphText(p);
      if (text === '') {
        blocks.push({ text: '', level: 0, isBullet: false });
        continue;
      }
      if (isPlaceholderText(text)) continue;

      const pPrList = getElementsByLocalName(p, 'pPr');
      const pPr = pPrList.length ? pPrList[0] : null;
      const level = getLevel(pPr);
      const isBullet = hasBullet(pPr);
      const bulletChar = getBulletChar(pPr);
      blocks.push({
        text,
        level,
        isBullet,
        bulletChar: isBullet ? bulletChar : undefined,
      });
    }
  }

  return blocks;
}

/**
 * Resolve a relative path from a base directory.
 * If target starts with '/' treat it as absolute from zip root (strip the leading slash).
 * @param {string} baseDir - e.g. "ppt/slides/"
 * @param {string} target  - e.g. "../notesSlides/notesSlide1.xml"
 * @returns {string}
 */
function resolveRelativePath(baseDir, target) {
  if (target.startsWith('/')) return target.slice(1);
  const baseParts = baseDir.replace(/\/$/, '').split('/').filter(Boolean);
  const targetParts = target.split('/').filter(Boolean);
  for (const p of targetParts) {
    if (p === '..') baseParts.pop();
    else if (p !== '.') baseParts.push(p);
  }
  return baseParts.join('/');
}

/**
 * Parse all Relationship elements from a .rels XML string.
 * Returns array of { type, target } with target resolved against baseDir.
 * @param {string} xmlString
 * @param {string} baseDir
 * @returns {{ type: string, target: string }[]}
 */
function parseRelsArray(xmlString, baseDir) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'text/xml');
  const out = [];
  const rels = getElementsByLocalName(doc.documentElement, 'Relationship');
  for (const r of rels) {
    const type = r.getAttribute('Type') || '';
    let target = r.getAttribute('Target') || '';
    if (!target) continue;
    target = resolveRelativePath(baseDir, target);
    out.push({ type, target });
  }
  return out;
}

/**
 * Build a map: slidePath (normalised, e.g. "ppt/slides/slide3.xml") → notesPath.
 *
 * Strategy: scan from the NOTES side. Each notesSlide.xml.rels contains a
 * relationship of type ".../slide" pointing back to the slide it belongs to.
 * This is the authoritative link. We build the reverse map from that.
 *
 * @param {JSZip} zip
 * @returns {Promise<Record<string, string>>}  slidePath → notesPath
 */
async function buildSlideToNotesMap(zip) {
  const map = {};
  const notesPaths = Object.keys(zip.files).filter(
    (f) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/i.test(f)
  );

  for (const notesPath of notesPaths) {
    const relsPath = notesPath.replace(
      /^(ppt\/notesSlides\/)(notesSlide\d+\.xml)$/i,
      '$1_rels/$2.rels'
    );
    const relsEntry = zip.file(relsPath);
    if (!relsEntry) continue;

    const baseDir = notesPath.replace(/[^/]+$/, '');
    const rels = parseRelsArray(await relsEntry.async('string'), baseDir);

    for (const rel of rels) {
      if (rel.type.indexOf('/slide') !== -1 && rel.type.indexOf('notesSlide') === -1) {
        const slidePath = rel.target.startsWith('ppt/')
          ? rel.target
          : 'ppt/' + rel.target;
        const normSlide = slidePath.toLowerCase();
        const normNotes = notesPath.toLowerCase();
        map[normSlide] = notesPath;
        break;
      }
    }
  }

  return map;
}

/**
 * Get notes paths in the SAME order as @jvmr/pptx-to-html renders slides:
 * file-number order (slide1.xml, slide2.xml, ...).
 *
 * Uses the reverse-lookup map (notesSlide.rels → slide) as the primary source,
 * so the mapping is always correct regardless of file numbering.
 *
 * @param {JSZip} zip
 * @returns {Promise<{ slideCount: number, notesPathsByDisplayIndex: (string|null)[] }>}
 */
async function getNotesPathsInSlideFileOrder(zip) {
  const slidePaths = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)\.xml$/)?.[1] || '0', 10);
      const numB = parseInt(b.match(/slide(\d+)\.xml$/)?.[1] || '0', 10);
      return numA - numB;
    });

  const slideToNotes = await buildSlideToNotesMap(zip);

  const notesPathsByDisplayIndex = slidePaths.map((slidePath) => {
    const norm = slidePath.toLowerCase();
    return slideToNotes[norm] || null;
  });

  if (typeof console !== 'undefined') {
    console.log('[pptx-notes] slide→notes mapping:',
      slidePaths.map((s, i) => `${s}  →  ${notesPathsByDisplayIndex[i] || '(none)'}`));
  }

  return { slideCount: slidePaths.length, notesPathsByDisplayIndex };
}

/**
 * Extract notes from the entire PPTX.
 * Notes are ordered to match @jvmr/pptx-to-html: slide1.xml, slide2.xml, ... so
 * notes[i] and the preview slide at index i always refer to the same slide.
 * @param {ArrayBuffer} arrayBuffer - Raw .pptx file content
 * @returns {Promise<{ slideNumber: number, notesBlocks: { text: string, level: number, isBullet: boolean, bulletChar?: string }[] }[]>}
 */
export async function extractNotesFromPptx(arrayBuffer) {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const parser = new DOMParser();
  const { slideCount, notesPathsByDisplayIndex } = await getNotesPathsInSlideFileOrder(zip);
  const result = [];

  for (let i = 0; i < slideCount; i++) {
    const oneBased = i + 1;
    const path = notesPathsByDisplayIndex[i] || null;
    const entry = path ? zip.file(path) : null;
    let notesBlocks = [];

    if (entry) {
      try {
        const xmlString = await entry.async('string');
        const doc = parser.parseFromString(xmlString, 'text/xml');
        notesBlocks = parseNotesSlideXml(doc);
      } catch (err) {
        console.warn('Failed to parse notes for slide', oneBased, err);
      }
    }

    result.push({
      slideNumber: oneBased,
      slideIndex: i,
      notesBlocks,
    });
  }

  return result;
}

/**
 * Convert notesBlocks to a single string with newlines and bullets (for plain display).
 * @param {{ text: string, level: number, isBullet: boolean, bulletChar?: string }[]} blocks
 * @param {number} spacesPerLevel
 * @returns {string}
 */
export function notesBlocksToText(blocks, spacesPerLevel = 2) {
  if (!blocks || blocks.length === 0) return '';
  return blocks
    .map((b) => {
      if (b.text === '') return '';
      const indent = ' '.repeat(b.level * spacesPerLevel);
      const prefix = b.isBullet ? (b.bulletChar || '•') + ' ' : '';
      return indent + prefix + b.text;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
