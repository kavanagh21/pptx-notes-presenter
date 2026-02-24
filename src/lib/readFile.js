/**
 * Robust file reading for iOS Safari + all other browsers.
 *
 * iOS Safari has known bugs where FileReader.readAsArrayBuffer() can return
 * detached or corrupt buffers. We try three strategies in order and validate
 * the result before accepting it.
 */

function validateBuffer(buf, expectedSize, label) {
  if (!buf || buf.byteLength === 0) {
    throw new Error(
      `File read produced 0 bytes. The file may not have finished downloading ` +
      `from iCloud. [${label}]`
    );
  }
  if (expectedSize > 0 && buf.byteLength !== expectedSize) {
    throw new Error(
      `File read size mismatch: expected ${expectedSize} bytes but got ${buf.byteLength}. ` +
      `The file may be incomplete or the read was truncated. [${label}]`
    );
  }
  const header = new Uint8Array(buf, 0, Math.min(4, buf.byteLength));
  if (header[0] !== 0x50 || header[1] !== 0x4B) {
    throw new Error(
      `File does not start with ZIP signature (PK). ` +
      `Got header bytes [${header.join(',')}], size ${buf.byteLength} bytes. ` +
      `Make sure the file is a .pptx or .ppsx. [${label}]`
    );
  }
}

function readViaArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('readAsArrayBuffer failed'));
    reader.readAsArrayBuffer(file);
  });
}

function readViaDataURL(file) {
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
    reader.readAsDataURL(file);
  });
}

function readViaResponse(file) {
  return new Response(file).arrayBuffer();
}

/**
 * Read a File/Blob into a validated ArrayBuffer (must be a ZIP/PPTX).
 * Tries multiple reading strategies to work around iOS Safari bugs.
 */
export async function readFileAsArrayBuffer(file) {
  const expectedSize = file.size || 0;

  if (expectedSize === 0) {
    throw new Error(
      `The selected file "${file.name}" reports 0 bytes. ` +
      `It may still be downloading from iCloud — wait for the download to finish, then try again.`
    );
  }

  const strategies = [
    { fn: readViaDataURL, label: 'readAsDataURL' },
    { fn: readViaArrayBuffer, label: 'readAsArrayBuffer' },
    { fn: readViaResponse, label: 'Response API' },
  ];

  let lastError;
  for (const { fn, label } of strategies) {
    try {
      const buf = await fn(file);
      validateBuffer(buf, expectedSize, label);
      return buf;
    } catch (err) {
      console.warn(`[pptx] ${label} failed:`, err.message);
      lastError = err;
    }
  }
  throw new Error(
    `Could not read "${file.name}" as a valid .pptx after trying all methods. ` +
    `Expected ${expectedSize} bytes. ` +
    `Last error: ${lastError?.message || 'unknown'}`
  );
}
