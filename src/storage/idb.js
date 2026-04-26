// IndexedDB image storage. Sessions keep `{id, desc}` metadata in localStorage,
// the actual blob bytes live here. Wraps `idb-keyval` with a fixed
// db/store name and a tagged QuotaExceededError so callers can route to the
// `IDB_QUOTA` registry entry without re-sniffing DOMException shapes.
//
// All functions are async and return promises. The store is created lazily
// on first call (idb-keyval handles the open). On unsupported environments
// (no `indexedDB` global, e.g. some SSR or hardened private modes), the
// helpers throw a tagged `IDB_INIT_FAIL` error that the App can surface.

import {
  get as idbGet,
  set as idbSet,
  del as idbDel,
  keys as idbKeys,
  clear as idbClear,
  createStore,
} from 'idb-keyval';

const DB_NAME = 'ogOCR';
const STORE_NAME = 'images';

// Lazy store reference: createStore opens (or schedules an open of) the DB on
// first call. Defer until first use so importing this module in environments
// without `indexedDB` (Node SSR) doesn't crash on import.
let _store = null;
function store() {
  if (_store) return _store;
  if (typeof indexedDB === 'undefined') {
    const err = new Error('IndexedDB is not available in this environment.');
    err.code = 'IDB_INIT_FAIL';
    throw err;
  }
  _store = createStore(DB_NAME, STORE_NAME);
  return _store;
}

// Tag a thrown error so callers can route to a registry code without
// inspecting DOMException shape. Preserves the original as `cause`.
function wrapError(e, code) {
  const wrapped = new Error(e?.message || code);
  wrapped.code = code;
  wrapped.cause = e;
  return wrapped;
}

function isQuotaError(e) {
  if (!e) return false;
  // DOMException name path (Chrome / Firefox / Safari).
  if (e.name === 'QuotaExceededError') return true;
  // Old WebKit numeric code path.
  if (e.code === 22) return true;
  // idb-keyval bubbles through transaction.error in some flows; sniff the message
  // as a last resort so partial-quota cases still surface as IDB_QUOTA.
  if (typeof e.message === 'string' && /quota/i.test(e.message)) return true;
  return false;
}

// Read a blob by image id. Returns the stored Blob, or null if the id has no
// entry. Treats a missing IDB as "no entry" rather than throwing — callers
// that need init-fail visibility can call `setImage` first.
export async function getImage(id) {
  try {
    const value = await idbGet(id, store());
    if (value == null) return null;
    return value;
  } catch (e) {
    if (e?.code === 'IDB_INIT_FAIL') return null;
    throw wrapError(e, 'IDB_INIT_FAIL');
  }
}

// Store a blob under the given id. Throws a tagged IDB_QUOTA error if the
// browser storage is exhausted; callers should surface that via `showError`.
export async function setImage(id, blob) {
  try {
    await idbSet(id, blob, store());
  } catch (e) {
    if (isQuotaError(e)) throw wrapError(e, 'IDB_QUOTA');
    throw wrapError(e, 'IDB_INIT_FAIL');
  }
}

// Delete an entry. No-op if the key doesn't exist (idb-keyval is forgiving
// here — del on a missing key resolves rather than rejecting).
export async function deleteImage(id) {
  try {
    await idbDel(id, store());
  } catch (e) {
    // Don't fail loudly on a delete — best-effort cleanup.
    if (e?.code === 'IDB_INIT_FAIL') return;
    console.warn('idb deleteImage failed:', e);
  }
}

// List all stored image ids — useful for cleanup audits and dev tooling.
export async function listImageIds() {
  try {
    const k = await idbKeys(store());
    return Array.isArray(k) ? k : [];
  } catch (e) {
    if (e?.code === 'IDB_INIT_FAIL') return [];
    throw wrapError(e, 'IDB_INIT_FAIL');
  }
}

// Wipe the image store. Used by tests; not exposed in the UI.
export async function clearAllImages() {
  try {
    await idbClear(store());
  } catch (e) {
    if (e?.code === 'IDB_INIT_FAIL') return;
    throw wrapError(e, 'IDB_INIT_FAIL');
  }
}

// Helper: convert a Blob into a `data:` URL. RenderedDoc et al. consume the
// session as `images[i].data = "data:image/png;base64,..."`, so we materialize
// the blob into that shape on session activate.
export async function blobToDataURL(blob) {
  if (!blob) return null;
  // FileReader is jsdom-safe and handles MIME sniffing automatically.
  if (typeof FileReader !== 'undefined') {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
      reader.readAsDataURL(blob);
    });
  }
  // Fallback (no FileReader, e.g. some headless test envs). Build base64 from
  // the blob's arrayBuffer using `btoa` — present in jsdom and modern Node.
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const b64 = btoa(binary);
  const mime = blob.type || 'application/octet-stream';
  return `data:${mime};base64,${b64}`;
}

// ── Compile-block image keyspace ─────────────────────────────────────────
// Compile blocks of kind `image` (added via "send to compile") historically
// embedded a `data:` URL in `block.src`, which round-tripped through
// localStorage and could overflow the 5 MB quota the same way session
// images did pre-v4. The v1 → v2 compile migration offloads each such
// block's bytes here under a `cimg_<id>` key so `block.src` becomes a
// short reference like `idb:cimg_<id>`. Separate keyspace from session
// images (which use raw image ids) so collisions are impossible.
const COMPILE_IMAGE_PREFIX = 'cimg_';

function compileImageKey(id) {
  // Accept either a raw id ("abc123") or an already-prefixed id ("cimg_abc123")
  // so callers using helpers like `'cimg_' + newId()` and callers passing the
  // bare id behave the same.
  return id.startsWith(COMPILE_IMAGE_PREFIX) ? id : COMPILE_IMAGE_PREFIX + id;
}

// Store a compile-block image. Accepts a `data:` URL string or a Blob.
// Surfaces IDB_QUOTA / IDB_INIT_FAIL on failure (same shape as setImage).
export async function setCompileImage(id, dataUriOrBlob) {
  const blob = typeof dataUriOrBlob === 'string'
    ? await dataURLToBlob(dataUriOrBlob)
    : dataUriOrBlob;
  if (!blob) {
    const err = new Error('setCompileImage: invalid input (not a data URL or Blob).');
    err.code = 'IDB_INIT_FAIL';
    throw err;
  }
  try {
    await idbSet(compileImageKey(id), blob, store());
  } catch (e) {
    if (isQuotaError(e)) throw wrapError(e, 'IDB_QUOTA');
    throw wrapError(e, 'IDB_INIT_FAIL');
  }
}

// Retrieve a compile-block image as a Blob. Returns null when missing.
export async function getCompileImage(id) {
  try {
    const value = await idbGet(compileImageKey(id), store());
    if (value == null) return null;
    return value;
  } catch (e) {
    if (e?.code === 'IDB_INIT_FAIL') return null;
    throw wrapError(e, 'IDB_INIT_FAIL');
  }
}

// Best-effort delete; mirrors `deleteImage` semantics.
export async function deleteCompileImage(id) {
  try {
    await idbDel(compileImageKey(id), store());
  } catch (e) {
    if (e?.code === 'IDB_INIT_FAIL') return;
    console.warn('idb deleteCompileImage failed:', e);
  }
}

// Helper: parse a `data:` URL into a Blob. Used by the v3 → v4 migration
// to lift legacy embedded image bytes out of localStorage and into IDB.
export async function dataURLToBlob(dataURL) {
  if (typeof dataURL !== 'string' || !dataURL.startsWith('data:')) {
    return null;
  }
  // Prefer fetch when available — it handles both base64 and percent-encoded
  // data URLs uniformly. fetch on a data URL is synchronous in spirit and
  // doesn't hit the network.
  if (typeof fetch !== 'undefined') {
    try {
      const r = await fetch(dataURL);
      return await r.blob();
    } catch {
      // fall through to manual parse
    }
  }
  // Manual fallback: split off the header and decode base64 (we only emit
  // base64 data URLs, so we don't need the percent-encoded branch here).
  const comma = dataURL.indexOf(',');
  if (comma < 0) return null;
  const header = dataURL.slice(5, comma); // strip "data:"
  const payload = dataURL.slice(comma + 1);
  const isBase64 = /;base64/i.test(header);
  const mime = header.split(';')[0] || 'application/octet-stream';
  let bytes;
  if (isBase64) {
    const binary = atob(payload);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  } else {
    const decoded = decodeURIComponent(payload);
    bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}
