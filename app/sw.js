/* =============================================================================
   sw.js — offline for the app shell, and forever-offline for any puzzle band
   you have actually played.

   What went wrong last time
   -------------------------
   The old root sw.js precached one list with `cache.addAll`, and that list
   contained a 10.9 MB CSV. `addAll` is atomic: a single 404 — or a flaky byte
   on that one huge file — failed the whole install, so the app silently had NO
   offline support at all. And even when it worked, every install paid for the
   entire puzzle database up front.

   What happens now
   ----------------
   * PRECACHE  — shell, code, CSS, icons, audio, and the small data/index.json.
                 Added one at a time with allSettled, so a module that hasn't
                 landed yet (app/js/modes/*.js) cannot fail the install.
   * BANDS     — data/r<band>.json is cache-first-then-store in a separate,
                 unversioned cache. Never precached (6 MB+ across 22 bands),
                 never evicted by a shell upgrade: a band you have played once
                 works offline forever.
   * GAMES     — data/games/r<band>.json is the SAME deal for the same reason,
                 and more so: ~1.2 MB per band, wanted on exactly one screen
                 (review). Not precached, not even its index — a player who
                 never opens review must not pay a byte for it. Once review has
                 pulled a band it lives in the DATA cache, so that band reviews
                 offline forever. The games index goes in the DATA cache too,
                 not the shell: it is worthless without the shards beside it,
                 and putting it in the versioned shell cache would mean an app
                 update quietly broke offline review.
   * NAVIGATE  — served from the cached shell, revalidated in the background,
                 so launching offline is instant and a new build still lands.
   * PREFETCH  — the #/offline screen downloads bands DELIBERATELY, ahead of a
                 flight, and needs to know whether each write landed and to see
                 QuotaExceededError when the partition fills (our full corpus is
                 ~53 MB and iOS has been documented at a 50 MB cap). The band
                 handler below cannot tell it either of those things: its
                 `cache.put` is not awaited, so a rejection is invisible. So a
                 request carrying X-TT-Prefetch is passed STRAIGHT THROUGH,
                 uncached, and app/js/storage.js does the put itself where it
                 can await and catch it. Same cache, same key — a band
                 prefetched that way is served to play by the ordinary
                 cache-first path below with no idea it arrived early.
   * UPDATES   — the shell cache is versioned and old versions are deleted on
                 activate. The page can postMessage {type:'SKIP_WAITING'} to
                 take the update immediately instead of being stuck on a stale
                 build until every tab closes.
   ========================================================================== */

const VERSION = 'v5';
const SHELL_CACHE = `tt-shell-${VERSION}`;
const DATA_CACHE = 'tt-data';           // deliberately unversioned: bands are immutable
const KEEP = new Set([SHELL_CACHE, DATA_CACHE]);

const SHELL_URL = './index.html';

/** Everything the app needs to boot with no network at all. */
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',

  './css/tokens.css',
  './css/app.css',

  './js/app.js',
  './js/ui.js',
  './js/settings.js',
  './js/data.js',
  './js/games.js',
  './js/stats.js',
  './js/storage.js',
  './js/rating.js',
  './js/board2d.js',
  './js/board3d.js',
  './js/board-interface.js',
  './js/mode-interface.js',
  './js/pieces-svg.js',

  './vendor/three/three.module.min.js',
  './vendor/chess.min.js',

  // Modes are written independently and may not exist yet. Listed so they are
  // cached when they do; a 404 here costs nothing because we add individually.
  './js/modes/blunderrush.js',
  './js/modes/tactics.js',
  './js/modes/visualization.js',
  './js/modes/drills.js',

  // Small and needed at boot. The BANDS it points at are NOT precached.
  // data/games/index.json is deliberately absent: review is the only screen that
  // wants it, and review is the only thing that should ever fetch it.
  './data/index.json',
  // The ladder pack: ~150 puzzles from every band, ~250KB gzipped. Precached because
  // Blunder Rush is the primary game and its ramp sweeps the whole rating range -- without
  // this, one run pulls 6-16 per-band shards just-in-time and can stall mid-run. Small
  // enough to carry up front; the full bands stay runtime-only.
  './data/ladder.json',

  // Shared assets that live above the app directory.
  '../ding.mp3',
  '../buzz.mp3',
  '../img/icon-180.png',
  '../img/icon-192.png',
  '../img/icon-512.png',
  '../img/favicon.ico',
];

const isBandRequest = (url) => /\/data\/r\d+\.json$/.test(url.pathname);
const isGameRequest = (url) => /\/data\/games\/r\d+\.json$/.test(url.pathname);
const isGameIndex = (url) => url.pathname.endsWith('/data/games/index.json');

/* -----------------------------------------------------------------------------
   INSTALL — never atomic
   -------------------------------------------------------------------------- */
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    const results = await Promise.allSettled(PRECACHE.map(async (url) => {
      // cache: 'reload' so an install never re-caches a stale HTTP-cached copy.
      const res = await fetch(new Request(url, { cache: 'reload' }));
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      await cache.put(url, res);
    }));
    const failed = results
      .map((r, i) => (r.status === 'rejected' ? PRECACHE[i] : null))
      .filter(Boolean);
    if (failed.length) console.warn('[sw] not precached (app still works):', failed);
    // No skipWaiting() here: an update waits until the page asks for it, so a
    // run in progress is never swapped out from under the player.
  })());
});

/* -----------------------------------------------------------------------------
   ACTIVATE — drop old shell versions, keep the band cache
   -------------------------------------------------------------------------- */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith('tt-') && !KEEP.has(key))
      .map((key) => caches.delete(key)));
    if (self.registration.navigationPreload) {
      await self.registration.navigationPreload.disable();
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const type = event.data && event.data.type;
  if (type === 'SKIP_WAITING') self.skipWaiting();
  if (type === 'GET_VERSION' && event.source) {
    event.source.postMessage({ type: 'VERSION', version: VERSION, caches: [...KEEP] });
  }
});

/* -----------------------------------------------------------------------------
   FETCH
   -------------------------------------------------------------------------- */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;      // let the network handle it

  // 0. A deliberate prefetch from the offline screen. Returning without calling
  //    respondWith hands the request back to the browser untouched, so the ONLY
  //    write is the one storage.js awaits — which is how that screen can report
  //    a full disk instead of silently believing a band landed.
  if (request.headers.get('X-TT-Prefetch')) return;

  // 1. Navigations: the cached shell first, so launching offline is instant.
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigate(request));
    return;
  }

  // 2. Puzzle bands and game bands: cache-first, then store. Immutable once
  //    fetched, and both live in the unversioned DATA cache so an app update
  //    cannot take away a band you have already downloaded.
  if (isBandRequest(url) || isGameRequest(url)) {
    event.respondWith(cacheFirstThenStore(request, DATA_CACHE));
    return;
  }

  // 3. The games index: fresh when online (bands are still being generated),
  //    cached when not — in the DATA cache, beside the shards it describes.
  if (isGameIndex(url)) {
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }

  // 4. The puzzle index: fresh when online (new bands appear), cached when not.
  if (url.pathname.endsWith('/data/index.json')) {
    event.respondWith(networkFirst(request, SHELL_CACHE));
    return;
  }

  // 5. Everything else in scope: stale-while-revalidate off the shell cache.
  event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
});

async function handleNavigate(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(SHELL_URL, { ignoreSearch: true });
  const network = fetch(request)
    .then((res) => {
      if (res && res.ok) cache.put(SHELL_URL, res.clone());
      return res;
    })
    .catch(() => null);

  if (cached) {
    network.catch(() => {});            // refresh in the background
    return cached;
  }
  const res = await network;
  return res || new Response(
    '<!doctype html><meta charset="utf-8"><title>Offline</title>' +
    '<body style="font:16px system-ui;padding:2rem">Offline, and the app shell has not been cached yet.</body>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

async function cacheFirstThenStore(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    return new Response(JSON.stringify({ error: 'offline', band: request.url }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw err;
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch: true });
  const network = fetch(request)
    .then((res) => {
      if (res && res.ok && res.type === 'basic') cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);

  if (cached) {
    network.catch(() => {});
    return cached;
  }
  const res = await network;
  if (res) return res;
  return new Response('', { status: 504, statusText: 'Offline and not cached' });
}
