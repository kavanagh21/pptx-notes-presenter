/**
 * Robust file reading for iOS Safari + all other browsers.
 *
 * On iPad, files picked from cloud storage (OneDrive, iCloud Drive, Google
 * Drive, Dropbox) go through iOS's File Provider system.  The provider is
 * supposed to download the file before handing it to the browser, but in
 * practice it can hand over a truncated or placeholder blob.  We work around
 * this with:
 *   1. file.slice(0, file.size) — forces the OS to materialise the data
 *   2. Multiple read strategies (DataURL → ArrayBuffer → Response)
 *   3. Retry with a delay — gives the File Provider more time
 *   4. Validation after every read (size check + ZIP magic bytes)
 */

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1500;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function validateBuffer(buf, expectedSize, label) {
  if (!buf || buf.byteLength === 0) {
    throw new Error(
      `File read produced 0 bytes — the file may still be downloading ` +
      `from cloud storage. [${label}]`
    );
  }
  if (expectedSize > 0 && buf.byteLength !== expectedSize) {
    throw new Error(
      `Size mismatch: expected ${expectedSize} bytes, got ${buf.byteLength}. ` +
      `The file may be incomplete. [${label}]`
    );
  }
  const header = new Uint8Array(buf, 0, Math.min(4, buf.byteLength));
  if (header[0] !== 0x50 || header[1] !== 0x4B) {
    throw new Error(
      `Not a ZIP file (header [${header.join(',')}], ${buf.byteLength} bytes). [${label}]`
    );
  }
}

function readBlobAsArrayBuffer(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('readAsArrayBuffer failed'));
    reader.readAsArrayBuffer(blob);
  });
}

function readBlobAsDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const dataUrl = reader.result;
        const base64 = dataUrl.split(',')[1];
        if (!base64) {
          reject(new Error('readAsDataURL produced empty base64'));
          return;
        }
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        resolve(bytes.buffer);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error || new Error('readAsDataURL failed'));
    reader.readAsDataURL(blob);
  });
}

function readBlobViaResponse(blob) {
  return new Response(blob).arrayBuffer();
}

/**
 * Try all reading strategies against a single Blob and return the first
 * buffer that passes validation.
 */
async function tryAllStrategies(blob, expectedSize) {
  const strategies = [
    { fn: readBlobAsDataURL, label: 'DataURL' },
    { fn: readBlobAsArrayBuffer, label: 'ArrayBuffer' },
    { fn: readBlobViaResponse, label: 'Response' },
  ];

  let lastError;
  for (const { fn, label } of strategies) {
    try {
      const buf = await fn(blob);
      validateBuffer(buf, expectedSize, label);
      return buf;
    } catch (err) {
      console.warn(`[pptx] ${label} failed:`, err.message);
      lastError = err;
    }
  }
  throw lastError || new Error('All read strategies failed');
}

/**
 * Read a File/Blob into a validated ArrayBuffer (must be a ZIP/PPTX).
 *
 * On iOS with cloud providers like OneDrive, the first read can return
 * incomplete data.  We materialise the file with slice(), then retry with
 * increasing delays if the initial attempt fails.
 */
export async function readFileAsArrayBuffer(file) {
  const expectedSize = file.size || 0;

  if (expectedSize === 0) {
    throw new Error(
      `"${file.name}" is 0 bytes. If the file is stored in OneDrive or ` +
      `iCloud, open the Files app, wait for it to finish downloading ` +
      `(the cloud icon should disappear), then try again.`
    );
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // file.slice() forces iOS File Provider to materialise the full blob
      const materialized = file.slice(0, file.size, file.type || 'application/octet-stream');
      return await tryAllStrategies(materialized, expectedSize);
    } catch (err) {
      const isLast = attempt === MAX_RETRIES - 1;
      if (isLast) {
        throw new Error(
          `Could not read "${file.name}" as a valid .pptx ` +
          `(${expectedSize} bytes, ${MAX_RETRIES} attempts). ` +
          `If the file is in OneDrive or another cloud service, ` +
          `save a copy to "On My iPad" in the Files app first, ` +
          `then select that local copy. ` +
          `Detail: ${err.message}`
        );
      }
      console.warn(
        `[pptx] Attempt ${attempt + 1} failed, retrying in ${RETRY_DELAY_MS}ms…`,
        err.message
      );
      await sleep(RETRY_DELAY_MS);
    }
  }
}
