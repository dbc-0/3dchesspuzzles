/**
 * stats.js — durable, bounded record keeping.
 *
 * Modes are forbidden from touching localStorage, so this is the one place
 * training history is written. A mode calls `ctx.stats.record(kind, payload)`
 * with plain JSON and can read its own history back with `query(kind)`.
 *
 * Why bounded: this is a daily-use app. An unbounded append-only log in
 * localStorage would grow for months and eventually start throwing QuotaExceeded
 * in the middle of a run. Each kind keeps its most recent MAX_PER_KIND records
 * and drops the oldest, which is exactly the window the stats screen needs
 * anyway (recent behaviour, and whether it is changing).
 *
 * Writes are coalesced: the vision drills record on every single answer, and
 * a synchronous JSON.stringify of the whole log per answer would be felt.
 */

const KEY = 'tt.stats.v1';

/**
 * The shell's one durable key/value store. Everything that must survive a
 * reload goes through here — the stats log below, and the rating engine, which
 * takes exactly this shape as its persistence shim.
 */
export const store = {
  get(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? null : JSON.parse(raw);
    } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { return false; }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  },
};
const MAX_PER_KIND = 1500;
const MAX_KINDS = 12;
const FLUSH_MS = 400;

export function createStats() {
  let log = load();
  let flushTimer = 0;
  let dirty = false;

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
      const out = {};
      for (const [kind, rows] of Object.entries(raw)) {
        if (Array.isArray(rows)) out[kind] = rows.filter((r) => r && typeof r === 'object');
      }
      return out;
    } catch { return {}; }
  }

  function flush() {
    flushTimer = 0;
    if (!dirty) return;
    dirty = false;
    try {
      localStorage.setItem(KEY, JSON.stringify(log));
    } catch {
      // Out of room: halve every kind and try once more. Losing the oldest
      // half of the history is far better than losing the ability to record.
      for (const kind of Object.keys(log)) {
        log[kind] = log[kind].slice(-Math.floor(log[kind].length / 2));
      }
      try { localStorage.setItem(KEY, JSON.stringify(log)); } catch { /* give up quietly */ }
    }
  }

  function schedule() {
    dirty = true;
    if (flushTimer) return;
    flushTimer = setTimeout(flush, FLUSH_MS);
  }

  /**
   * @param {string} kind  e.g. 'drill', 'run'
   * @param {Object} payload plain JSON; `t` (epoch ms) is added if absent
   */
  function record(kind, payload) {
    if (typeof kind !== 'string' || !kind) return null;
    if (!payload || typeof payload !== 'object') return null;

    let rows = log[kind];
    if (!rows) {
      if (Object.keys(log).length >= MAX_KINDS) return null;
      rows = log[kind] = [];
    }

    let entry;
    try { entry = JSON.parse(JSON.stringify(payload)); }
    catch { return null; }                       // not serialisable: refuse rather than corrupt
    if (entry.t == null) entry.t = Date.now();

    rows.push(entry);
    if (rows.length > MAX_PER_KIND) rows.splice(0, rows.length - MAX_PER_KIND);
    schedule();
    return entry;
  }

  /**
   * @param {string} kind
   * @param {{since?: number, limit?: number}} [opts]
   * @returns {Array} oldest first; a copy, so callers can't corrupt the log
   */
  function query(kind, opts = {}) {
    const rows = log[kind];
    if (!Array.isArray(rows)) return [];
    let out = rows;
    if (opts.since) out = out.filter((r) => (r.t || 0) >= opts.since);
    if (opts.limit && out.length > opts.limit) out = out.slice(-opts.limit);
    return out.map((r) => ({ ...r }));
  }

  function kinds() { return Object.keys(log); }

  function count(kind) { return (log[kind] || []).length; }

  function clear(kind) {
    if (kind) delete log[kind];
    else log = {};
    schedule();
    flush();
  }

  // Never lose the tail of a session to a backgrounded tab.
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });

  return { record, query, kinds, count, clear, flush };
}

/* =============================================================================
   ANALYSIS — pure functions over 'drill' records, used by the stats screen.

   A drill record looks like:
     {drill:'square', correct:true, ms:1840, elevation:31, yaw:-12,
      orientation:'black', t:1712345678901}
   ========================================================================== */

/** Camera seats, grouped the way they actually feel different to read. */
export const SEAT_BANDS = [
  { id: 'high', label: 'Near-overhead', hint: '58° and up', min: 58, max: 91 },
  { id: 'mid', label: 'Mid seat', hint: '32–58°', min: 32, max: 58 },
  { id: 'low', label: 'Low seat', hint: 'under 32°', min: -1, max: 32 },
];

export function seatBandFor(elevation) {
  const e = Number(elevation);
  if (!Number.isFinite(e)) return null;
  return SEAT_BANDS.find((b) => e >= b.min && e < b.max) || null;
}

export function median(values) {
  const nums = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = nums.length >> 1;
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

/** {n, correct, accuracy (0-100 or null), medianMs} for a set of records. */
export function summarise(rows) {
  const n = rows.length;
  const correct = rows.filter((r) => r.correct === true).length;
  return {
    n,
    correct,
    accuracy: n ? Math.round((correct / n) * 100) : null,
    medianMs: median(rows.map((r) => Number(r.ms))),
  };
}

export function groupBySeat(rows) {
  return SEAT_BANDS.map((band) => ({
    ...band,
    ...summarise(rows.filter((r) => {
      const b = seatBandFor(r.elevation);
      return b && b.id === band.id;
    })),
  }));
}

export function groupByOrientation(rows) {
  return ['white', 'black'].map((side) => ({
    id: side,
    label: side === 'white' ? 'White’s side' : 'Black’s side',
    hint: side === 'white' ? 'the familiar view' : 'board flipped',
    ...summarise(rows.filter((r) => r.orientation === side)),
  }));
}

/** Chronological buckets by day, most recent last, only days with data. */
export function bucketByDay(rows, maxBuckets = 8) {
  const byDay = new Map();
  for (const r of rows) {
    const d = new Date(r.t || 0);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(r);
  }
  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .slice(-maxBuckets)
    .map(([day, items]) => ({ day, rows: items, ...summarise(items) }));
}
