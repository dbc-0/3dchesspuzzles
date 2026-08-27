/**
 * Game data layer: the FULL game behind a puzzle, rating-banded and lazy.
 *
 * WHY THIS IS A SEPARATE SHARD SET FROM data.js
 * ---------------------------------------------
 * A puzzle band is ~280-780 KB and every player downloads the one they play in.
 * The games behind those puzzles are another ~1.2 MB per band, and they are only
 * ever wanted on ONE screen: review. Folding them into the puzzle shards would
 * make every single run pay for a feature most sessions never open. So they live
 * in a parallel tree — app/data/games/r<band>.json — fetched the first time the
 * user actually opens review, and only for the band being reviewed. Someone who
 * never opens review downloads none of it, not even the index.
 *
 * Deliberately the same shape as data.js: `ready()`, `ensureBand()`, per-band
 * memoisation, in-flight de-duplication, and no retry-blocking on failure. The
 * service worker keeps a fetched shard in the DATA cache, so a band you have
 * reviewed once reviews offline forever (see app/sw.js).
 *
 * RECORD SHAPE, keyed by puzzle id:
 *   m  string   the full game in SAN, space separated, from the initial position
 *   e  number[] lichess's own per-ply evaluation in centipawns, FROM WHITE'S
 *              POINT OF VIEW, index i being the position after ply i+1.
 *              Clamped to +/-2000; +/-10000 is the mate sentinel. May be shorter
 *              than the move list (lichess has no eval after the final move of a
 *              game that ended in mate) and may be empty.
 *   p  number   1-based ply of the move the puzzle turns on, so the position the
 *              puzzle is asked FROM is the one after p-1 plies. May be null.
 *
 * MISSING IS NORMAL, NOT AN ERROR. The generating fetch runs behind the shipped
 * puzzle corpus, so most ids have no record yet and whole bands do not exist.
 * Every path here returns null for that case; nothing throws, and review is
 * expected to fall back to the puzzle line it already had.
 */

const GAMES_DIR = './data/games/';

export function createGames() {
  /** @type {Map<number, Object|null>} band lo -> { puzzleId: record } */
  const loaded = new Map();
  const inflight = new Map();
  let index = null;
  let indexInflight = null;
  let indexFailed = false;

  /**
   * The band index, or null if there is no game data at all. Unlike data.js's
   * `ready()` this NEVER throws: puzzle data missing is fatal, game data missing
   * just means review shows the puzzle line.
   */
  async function ready() {
    if (index) return index;
    if (indexFailed) return null;
    if (indexInflight) return indexInflight;
    indexInflight = fetch(GAMES_DIR + 'index.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        index = json && Array.isArray(json.bands) ? json : null;
        // A 404 is permanent for this session; a network blip is not, so only a
        // well-formed "there is nothing here" latches.
        if (!index) indexFailed = true;
        indexInflight = null;
        return index;
      })
      .catch(() => { indexInflight = null; return null; });
    return indexInflight;
  }

  /** Which shard a puzzle of this rating was written into. */
  function bandFor(rating) {
    const size = (index && index.band) || 100;
    const r = Number(rating);
    if (!Number.isFinite(r)) return null;
    return Math.floor(r / size) * size;
  }

  /**
   * Fetch one band's games. Resolves to the record map, or null if that band was
   * never generated or the fetch failed. A failure is NOT memoised, so opening
   * review again after coming back online retries.
   */
  async function ensureBand(lo) {
    if (loaded.has(lo)) return loaded.get(lo);
    if (inflight.has(lo)) return inflight.get(lo);
    await ready();
    const meta = index && index.bands.find((x) => x.lo === lo);
    if (!meta) return null;
    const p = fetch(GAMES_DIR + meta.file)
      .then((r) => (r.ok ? r.json() : null))
      .then((rows) => {
        const map = rows && typeof rows === 'object' && !Array.isArray(rows) ? rows : null;
        if (map) loaded.set(lo, map);
        inflight.delete(lo);
        return map;
      })
      .catch(() => { inflight.delete(lo); return null; });
    inflight.set(lo, p);
    return p;
  }

  /** Reject anything that would make the review player build a bad line. */
  function normalise(rec) {
    if (!rec || typeof rec !== 'object') return null;
    const m = typeof rec.m === 'string' ? rec.m.trim() : '';
    if (!m) return null;
    const e = Array.isArray(rec.e) ? rec.e.map((v) => (Number.isFinite(Number(v)) ? Number(v) : null)) : [];
    const rawPly = Number(rec.p);
    return { m, e, p: Number.isFinite(rawPly) ? Math.round(rawPly) : null };
  }

  /**
   * The game behind one puzzle, or null.
   *
   * `rating` is the PUZZLE's rating (history entries carry it as `rating`), which
   * is what the shard was banded by. Without it there is no band to ask for and
   * nothing is fetched at all.
   */
  async function get(puzzleId, rating) {
    const id = puzzleId == null ? '' : String(puzzleId);
    if (!id) return null;
    if (!(await ready())) return null;

    const lo = bandFor(rating);
    if (lo != null) {
      const map = await ensureBand(lo);
      if (map && map[id]) return normalise(map[id]);
    }
    // A rating that has drifted across a band edge since the shard was built
    // would otherwise miss. Only bands ALREADY in memory are consulted — hunting
    // through the neighbours would cost another 1.2 MB to answer "no".
    for (const map of loaded.values()) {
      if (map && map[id]) return normalise(map[id]);
    }
    return null;
  }

  return {
    ready,
    ensureBand,
    get,
    bandFor,
    get index() { return index; },
    get bands() { return index ? index.bands : []; },
    get loadedBands() { return [...loaded.keys()]; },
    get loadedCount() {
      let n = 0;
      for (const map of loaded.values()) if (map) n += Object.keys(map).length;
      return n;
    },
  };
}
