/**
 * Puzzle data layer: rating-banded shards, lazy-loaded and cached.
 *
 * The old app downloaded a single 10.9MB CSV before you could press Start, and parsed it
 * with PapaParse on the main thread. Here the app boots on one small band (the one you
 * actually play), and other bands stream in only when you move into them. Once a band has
 * been fetched the service worker keeps it, so it stays available offline forever.
 *
 * Nothing here knows about chess rules -- it only picks records.
 */

const DATA_DIR = './data/';
const RECENT_KEY = 'br.recent.v1';
const RECENT_MAX = 800;        // remembered ids, to avoid repeats across sessions

/**
 * The ladder: ~150 puzzles from EVERY band in one ~250KB gzipped file.
 *
 * Per-band shards assume you play within a band -- true for practice, tactics and
 * visualization. Blunder Rush is the opposite by construction: it opens at 650 and steps
 * +50 per clean solve, so one run sweeps the whole range. Measured against the real shards
 * that is 6 bands / 4.8MB for a 10-solve run and 16 bands / 10.9MB for a 30-solve one,
 * fetched JUST IN TIME as the ramp climbs -- so a slow connection stalls the game mid-run.
 * Worse than the monolith the shards replaced, since that at least waited once up front.
 *
 * So the ramp gets its own source. One fetch covers a rush of any depth with no mid-run
 * downloads. Full bands still win when they happen to be resident, for extra variety.
 */
const LADDER_URL = DATA_DIR + 'ladder.json';

export function createData() {
  /** @type {Map<number, Array>} band lo -> puzzles */
  const loaded = new Map();
  const inflight = new Map();
  let index = null;
  let recent = loadRecent();

  function loadRecent() {
    try {
      const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
      return Array.isArray(v) ? new Set(v) : new Set();
    } catch { return new Set(); }
  }

  function rememberSeen(id) {
    recent.add(id);
    if (recent.size > RECENT_MAX) {
      // drop the oldest ~quarter so this doesn't thrash on every single puzzle
      recent = new Set([...recent].slice(-Math.floor(RECENT_MAX * 0.75)));
    }
    try { localStorage.setItem(RECENT_KEY, JSON.stringify([...recent])); } catch {}
  }

  async function ready() {
    if (index) return index;
    const res = await fetch(DATA_DIR + 'index.json');
    if (!res.ok) throw new Error(`puzzle index unavailable (${res.status})`);
    index = await res.json();
    return index;
  }

  function bandFor(rating) {
    const b = index ? index.band : 100;
    return Math.floor(rating / b) * b;
  }

  /** Bands that exist, nearest first to `rating`. */
  function bandsNear(rating) {
    if (!index) return [];
    return index.bands
      .map((x) => ({ ...x, dist: Math.abs(x.lo - bandFor(rating)) }))
      .sort((a, b) => a.dist - b.dist);
  }

  async function ensureBand(lo) {
    if (loaded.has(lo)) return loaded.get(lo);
    if (inflight.has(lo)) return inflight.get(lo);
    const meta = index && index.bands.find((x) => x.lo === lo);
    if (!meta) return [];
    const p = fetch(DATA_DIR + meta.file)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => { loaded.set(lo, rows); inflight.delete(lo); return rows; })
      .catch(() => { inflight.delete(lo); return []; });
    inflight.set(lo, p);
    return p;
  }

  /**
   * Pick a puzzle near `rating`. Widens outward through neighbouring bands until it finds
   * one, so a narrow band that is exhausted or still downloading never dead-ends the game.
   */
  async function pick({ rating = 1200, spread = 150, avoidRepeats = true } = {}) {
    await ready();
    const order = bandsNear(rating);
    for (const band of order) {
      const rows = await ensureBand(band.lo);
      if (!rows.length) continue;
      let pool = rows.filter((p) => Math.abs(p.r - rating) <= spread);
      if (!pool.length) pool = rows;
      let fresh = avoidRepeats ? pool.filter((p) => !recent.has(p.i)) : pool;
      if (!fresh.length) fresh = pool;          // seen them all; allow repeats rather than stall
      const chosen = fresh[Math.floor(Math.random() * fresh.length)];
      if (chosen) { rememberSeen(chosen.i); return chosen; }
    }
    return null;
  }

  /** Warm the bands around a rating so play never blocks on a download. */
  async function prefetchAround(rating) {
    await ready();
    const near = bandsNear(rating).slice(0, 3);
    return Promise.all(near.map((b) => ensureBand(b.lo)));
  }

  let ladder = null;
  let ladderInflight = null;

  /** Load the ladder pack once. Resolves to [] on failure -- callers fall back to bands. */
  function ensureLadder() {
    if (ladder) return Promise.resolve(ladder);
    if (ladderInflight) return ladderInflight;
    ladderInflight = fetch(LADDER_URL)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => { ladder = Array.isArray(rows) ? rows : []; ladderInflight = null; return ladder; })
      .catch(() => { ladderInflight = null; return []; });
    return ladderInflight;
  }

  /**
   * Pick for a mode that SWEEPS the rating range (Blunder Rush's ramp) rather than sitting
   * in one band. Prefers a full band when one is already resident -- more variety, and free,
   * since it is already in memory -- and otherwise serves from the ladder without ever
   * triggering a band download mid-run.
   */
  async function pickLadder({ rating = 650, spread = 120, avoidRepeats = true } = {}) {
    await ready();
    const lo = bandFor(rating);
    const resident = loaded.get(lo);
    const pool = (resident && resident.length ? resident : await ensureLadder())
      .filter((p) => Math.abs(p.r - rating) <= spread);
    if (!pool.length) {
      // Nothing near this rating in the ladder either: fall back to the banded path, which
      // may download. Better a pause than a dead end.
      return pick({ rating, spread, avoidRepeats });
    }
    let fresh = avoidRepeats ? pool.filter((p) => !recent.has(p.i)) : pool;
    if (!fresh.length) fresh = pool;
    const chosen = fresh[Math.floor(Math.random() * fresh.length)];
    if (chosen) rememberSeen(chosen.i);
    return chosen || null;
  }

  return {
    ready,
    pick,
    pickLadder,
    ensureLadder,
    prefetchAround,
    ensureBand,
    bandFor,
    get index() { return index; },
    get bands() { return index ? index.bands : []; },
    get loadedCount() {
      let n = 0; for (const rows of loaded.values()) n += rows.length; return n;
    },
    clearRecent() {
      recent = new Set();
      try { localStorage.removeItem(RECENT_KEY); } catch {}
    },
  };
}
