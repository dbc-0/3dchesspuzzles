/**
 * storage.js — what this device has ACTUALLY got, and how to put more there.
 *
 * WHY THIS MEASURES INSTEAD OF ASSUMING
 * -------------------------------------
 * The app's full corpus is ~53 MB (22 puzzle bands ≈ 14.5 MB, 22 game bands
 * ≈ 37.6 MB, shell + ladder ≈ 2.2 MB). WebKit's own documentation has described
 * the Cache API as capped at 50 MB per partition on iOS, while Safari 17 is
 * reported to have raised home-screen-app limits to roughly 60% of disk. Those
 * two numbers disagree, and our ceiling sits right on top of the lower one. A
 * hardcoded figure would therefore be wrong on some devices and dangerously
 * wrong on others, so NOTHING here is hardcoded:
 *
 *   * what is cached comes from enumerating the `tt-data` Cache, not from a
 *     download log we kept ourselves (a log can drift from reality after an
 *     eviction; the cache cannot),
 *   * what a download will cost comes from the `bytes` field the two data
 *     indexes already publish per band,
 *   * what will fit comes from `navigator.storage.estimate()` on THIS device.
 *
 * WHY THE PAGE OWNS THE `cache.put`, NOT THE SERVICE WORKER
 * The service worker's band handler does `cache.put(request, res.clone())`
 * WITHOUT awaiting it — fine for a lazy fetch during play, useless here: we
 * would neither know when the write landed nor ever see the QuotaExceededError
 * it rejects with, which is the single most important outcome this screen has
 * to report honestly. So a prefetch sends `X-TT-Prefetch`, sw.js passes those
 * straight through uncached, and the write happens here where it can be awaited
 * and its failure caught. Cache keys are identical either way, so a band
 * prefetched here is served to play by the ordinary cache-first path.
 *
 * Deliberately DOM-free and screen-free: app.js renders, this decides.
 */

/** Must match sw.js. Unversioned, because bands are immutable. */
export const DATA_CACHE = 'tt-data';
export const SHELL_PREFIX = 'tt-shell-';
/** Tells sw.js not to race us for the write. See sw.js's fetch handler. */
export const PREFETCH_HEADER = 'X-TT-Prefetch';

// Games are tested first, but the two cannot collide anyway: a game shard lives
// at /data/games/r<n>.json and so never matches the /data/r<n>.json shape.
const GAME_BAND_RE = /\/data\/games\/r(\d+)\.json$/;
const PUZZLE_BAND_RE = /\/data\/r(\d+)\.json$/;
const GAMES_INDEX_RE = /\/data\/games\/index\.json$/;

const KB = 1024;
const MB = 1024 * 1024;

/** Human bytes. `—` for "we genuinely do not know", never a made-up 0. */
export function fmtBytes(n) {
  const b = Number(n);
  if (n == null || !Number.isFinite(b)) return '—';
  if (b < KB) return `${Math.round(b)} B`;
  if (b < MB) return `${(b / KB).toFixed(b < 10 * KB ? 1 : 0)} KB`;
  if (b < 1024 * MB) return `${(b / MB).toFixed(b < 100 * MB ? 1 : 0)} MB`;
  return `${(b / (1024 * MB)).toFixed(1)} GB`;
}

/* =============================================================================
   READING REALITY
   ========================================================================== */

/**
 * Enumerate the DATA cache and report which bands are genuinely present.
 *
 * Returns sets of band `lo` values rather than counts, so the caller can mark
 * individual chips without a second pass, and so a band the user happened to
 * play months ago is indistinguishable from one a prefetch pulled — which is
 * correct, because to the app they are.
 */
export async function surveyCache() {
  const out = {
    supported: typeof caches !== 'undefined' && !!caches,
    puzzles: new Set(),
    games: new Set(),
    gamesIndex: false,
    entries: 0,
    shellCaches: [],
    error: null,
  };
  if (!out.supported) return out;

  try {
    out.shellCaches = (await caches.keys()).filter((k) => k.startsWith(SHELL_PREFIX));
  } catch { /* a denied or partitioned context: not fatal, just unknown */ }

  try {
    const cache = await caches.open(DATA_CACHE);
    const keys = await cache.keys();
    out.entries = keys.length;
    for (const req of keys) {
      let path;
      try { path = new URL(req.url).pathname; } catch { continue; }
      const g = GAME_BAND_RE.exec(path);
      if (g) { out.games.add(Number(g[1])); continue; }
      const p = PUZZLE_BAND_RE.exec(path);
      if (p) { out.puzzles.add(Number(p[1])); continue; }
      if (GAMES_INDEX_RE.test(path)) out.gamesIndex = true;
    }
  } catch (err) {
    out.error = String((err && err.message) || err);
  }
  return out;
}

/**
 * The device's own numbers. `quota` is whatever the browser says it is here and
 * now — it is not a constant, it moves with free disk and with how the app was
 * installed, which is exactly why this screen exists.
 */
export async function estimateStorage() {
  const out = {
    supported: false, usage: null, quota: null, free: null, cacheUsage: null, error: null,
  };
  const s = typeof navigator !== 'undefined' && navigator.storage;
  if (!s || typeof s.estimate !== 'function') return out;
  try {
    const e = await s.estimate();
    out.supported = true;
    out.usage = Number.isFinite(e.usage) ? e.usage : null;
    out.quota = Number.isFinite(e.quota) ? e.quota : null;
    if (out.usage != null && out.quota != null) out.free = Math.max(0, out.quota - out.usage);
    // Chromium only. Nice when present, absent everywhere else, never inferred.
    if (e.usageDetails && Number.isFinite(e.usageDetails.caches)) out.cacheUsage = e.usageDetails.caches;
  } catch (err) {
    out.error = String((err && err.message) || err);
  }
  return out;
}

/** Current persistence, read — never assumed from a previous request. */
export async function persistenceState() {
  const s = typeof navigator !== 'undefined' && navigator.storage;
  if (!s || typeof s.persisted !== 'function') {
    return { supported: false, canRequest: false, persisted: false };
  }
  try {
    return {
      supported: true,
      canRequest: typeof s.persist === 'function',
      persisted: await s.persisted(),
    };
  } catch (err) {
    return { supported: false, canRequest: false, persisted: false, error: String((err && err.message) || err) };
  }
}

/**
 * Ask for persistent storage and report what actually happened.
 *
 * `persist()` RESOLVING FALSE IS A REFUSAL, not an error — Chrome grants it on
 * an engagement heuristic and Safari on being added to the home screen, so a
 * plain "no" is the common case rather than the exceptional one. It is returned
 * as `refused: true` so the caller cannot accidentally paint it as success.
 */
export async function requestPersistence() {
  const s = typeof navigator !== 'undefined' && navigator.storage;
  if (!s || typeof s.persist !== 'function') {
    return { supported: false, persisted: false, refused: false, alreadyGranted: false };
  }
  let before = false;
  if (typeof s.persisted === 'function') {
    try { before = await s.persisted(); } catch { before = false; }
  }
  if (before) return { supported: true, persisted: true, refused: false, alreadyGranted: true };

  try {
    const granted = await s.persist();
    return { supported: true, persisted: !!granted, refused: !granted, alreadyGranted: false };
  } catch (err) {
    return {
      supported: true, persisted: false, refused: true, alreadyGranted: false,
      error: String((err && err.message) || err),
    };
  }
}

/* =============================================================================
   THE CATALOGUE — every band, its real size, and whether we already have it
   ========================================================================== */
const byLo = (a, b) => a.lo - b.lo;

/**
 * Join the two published indexes to the cache survey.
 *
 * `bytes` is the RAW size the build recorded, which is what the Cache stores
 * (the decoded body), so it is the right number both for "what will this cost"
 * and for "what is this band worth on disk". It is not a guess about the wire
 * size, which gzip makes much smaller and which is not what gets stored.
 */
export function buildCatalogue({ puzzleBands = [], gameBands = [], cached, base } = {}) {
  const root = base
    || (typeof document !== 'undefined' && document.baseURI)
    || (typeof location !== 'undefined' && location.href);
  const seen = cached || { puzzles: new Set(), games: new Set() };

  const one = (kind, dir, b) => {
    const lo = Number(b.lo);
    return {
      kind,
      lo,
      hi: Number.isFinite(Number(b.hi)) ? Number(b.hi) : lo + 99,
      file: b.file,
      bytes: Number(b.bytes) || 0,
      url: new URL(dir + b.file, root).href,
      cached: (kind === 'puzzle' ? seen.puzzles : seen.games).has(lo),
    };
  };

  return {
    puzzles: puzzleBands.filter((b) => b && b.file && Number.isFinite(Number(b.lo)))
      .map((b) => one('puzzle', './data/', b)).sort(byLo),
    games: gameBands.filter((b) => b && b.file && Number.isFinite(Number(b.lo)))
      .map((b) => one('game', './data/games/', b)).sort(byLo),
  };
}

/**
 * Bands the cache holds that the current index does not describe — a band that
 * was regenerated under a new name, or dropped from the build. Counted so the
 * "used" figure and the "cached bands" figure cannot silently disagree.
 */
export function orphans(catalogue, cached) {
  const known = { puzzle: new Set(catalogue.puzzles.map((b) => b.lo)), game: new Set(catalogue.games.map((b) => b.lo)) };
  return {
    puzzles: [...cached.puzzles].filter((lo) => !known.puzzle.has(lo)).sort((a, b) => a - b),
    games: [...cached.games].filter((lo) => !known.game.has(lo)).sort((a, b) => a - b),
  };
}

export function totals(items) {
  let bytes = 0; let cachedBytes = 0; let cachedCount = 0;
  for (const it of items) {
    bytes += it.bytes;
    if (it.cached) { cachedBytes += it.bytes; cachedCount += 1; }
  }
  return {
    count: items.length,
    bytes,
    cachedCount,
    cachedBytes,
    missingCount: items.length - cachedCount,
    missingBytes: Math.max(0, bytes - cachedBytes),
  };
}

/** The items a named download would actually have to fetch. */
export function selectMissing(catalogue, what) {
  const list = what === 'games' ? catalogue.games
    : what === 'all' ? [...catalogue.puzzles, ...catalogue.games]
      : catalogue.puzzles;
  return list.filter((b) => !b.cached);
}

/* =============================================================================
   PREFETCH
   ========================================================================== */

/**
 * A full disk is a NORMAL outcome here, not a crash: our ceiling is ~53 MB and
 * some devices cap the partition at 50 MB. Safari has been seen to throw a
 * plain Error rather than a named DOMException, so the message is checked too.
 */
export function isQuotaError(err) {
  if (!err) return false;
  if (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED') return true;
  if (err.code === 22 || err.code === 1014) return true;
  return /quota|storage.*full|exceeded the storage/i.test(String(err.message || ''));
}

/**
 * Fetch `items` into the DATA cache, one at a time.
 *
 * SEQUENTIAL ON PURPOSE. Bands are independent files and each one lands or does
 * not, so a serial queue means the answer to "how much of this survived?" is
 * always a clean prefix and a quota failure names the exact band that did not
 * fit. Parallel fetches would download several megabytes past the point the
 * disk filled and make the failure report a guess.
 *
 * NOTHING IS ROLLED BACK. Cancelling, a dead network and a full disk all leave
 * every band already written exactly where it is — that is the whole reason the
 * corpus is sharded, and a "clean up after yourself" step here would throw away
 * data the user deliberately downloaded.
 *
 * @param {Array} items      from selectMissing()
 * @param {object} [hooks]   { onProgress(state), onItem(item, outcome) }
 * @returns {{promise: Promise<object>, cancel: () => void}}
 */
export function createPrefetch(items, { onProgress, onItem } = {}) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let cancelled = false;

  const state = {
    total: items.length,
    totalBytes: items.reduce((n, b) => n + b.bytes, 0),
    done: 0,
    bytes: 0,
    saved: [],
    failed: [],
    cancelled: false,
    quotaHit: false,
    stoppedOn: null,
    error: null,
    running: true,
  };

  const report = (item, outcome) => {
    try { if (onItem) onItem(item, outcome, state); } catch { /* a UI slip must not stop the queue */ }
    try { if (onProgress) onProgress(state); } catch { /* ditto */ }
  };

  const promise = (async () => {
    let cache;
    try {
      cache = await caches.open(DATA_CACHE);
    } catch (err) {
      state.running = false;
      state.error = String((err && err.message) || err);
      return state;
    }

    for (const item of items) {
      if (cancelled) break;
      state.current = item;

      // Someone else may have pulled it since the survey — another tab, or the
      // run that was played while this screen was being read.
      try {
        if (await cache.match(item.url)) {
          state.done += 1; state.bytes += item.bytes; state.saved.push(item);
          report(item, 'already');
          continue;
        }
      } catch { /* fall through and fetch it */ }

      let res;
      try {
        res = await fetch(item.url, {
          // See the header comment at the top: this is what stops sw.js writing
          // the same entry underneath us with a put we cannot await or catch.
          headers: { [PREFETCH_HEADER]: '1' },
          signal: controller ? controller.signal : undefined,
        });
      } catch (err) {
        if (cancelled || (err && err.name === 'AbortError')) { state.cancelled = true; break; }
        state.done += 1;
        state.failed.push({ ...item, reason: 'network' });
        report(item, 'failed');
        continue;
      }

      if (!res || !res.ok) {
        state.done += 1;
        state.failed.push({ ...item, reason: `http ${res ? res.status : '?'}` });
        report(item, 'failed');
        continue;
      }

      try {
        await cache.put(item.url, res);
      } catch (err) {
        if (isQuotaError(err)) {
          // Out of room. Stop immediately rather than grinding through twenty
          // more bands that cannot fit either; everything already written stays.
          state.quotaHit = true;
          state.stoppedOn = item;
          state.error = String((err && err.message) || err);
          break;
        }
        state.done += 1;
        state.failed.push({ ...item, reason: 'write failed' });
        report(item, 'failed');
        continue;
      }

      state.done += 1;
      state.bytes += item.bytes;
      state.saved.push(item);
      report(item, 'saved');
    }

    state.cancelled = state.cancelled || cancelled;
    state.current = null;
    state.running = false;
    try { if (onProgress) onProgress(state); } catch { /* ignore */ }
    return state;
  })();

  return {
    state,
    promise,
    cancel() {
      if (cancelled) return;
      cancelled = true;
      state.cancelled = true;
      if (controller) controller.abort();
    },
  };
}

/** Delete every downloaded band. The shell cache is untouched. */
export async function clearDataCache() {
  if (typeof caches === 'undefined' || !caches) return false;
  try { return await caches.delete(DATA_CACHE); } catch { return false; }
}
