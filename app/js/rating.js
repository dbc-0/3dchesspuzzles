/**
 * Puzzle rating engine (Glicko-1), used to measure the user's board-vision deficit.
 *
 * THE EXPERIMENT
 * --------------
 * Solve ~100 tactics on a 2D board and your rating converges somewhere. Do it again on a 3D
 * board and it converges lower. That GAP, in Elo points, is the board-vision deficit -- the
 * cost of reading a position from a perspective view instead of a flat one. Watching the gap
 * close over weeks is the cleanest evidence that the training transfers.
 *
 * WHY GLICKO RATHER THAN PLAIN ELO
 * --------------------------------
 * The whole point is comparing two ratings, so we need to know when a difference is real.
 * Plain Elo gives a number with no error bar, and "2D 1600 vs 3D 1540" is meaningless if
 * both are +/- 120. Glicko carries a rating deviation (RD) that shrinks with evidence, so we
 * can report "245 +/- 70 points" and say honestly whether the gap has separated from noise.
 *
 * THE CONFOUND -- read this before interpreting any result
 * --------------------------------------------------------
 * The app defaults 3D to notation-only prompts and 2D to highlighted prompts. Those are two
 * different changes at once, so a naive 2D-vs-3D comparison measures dimensionality AND
 * prompt style together. Ratings are therefore bucketed by BOTH, and a clean comparison must
 * hold one fixed:
 *    tactics/2d/highlight  vs  tactics/3d/highlight   -> isolates dimensionality
 *    tactics/2d/highlight  vs  tactics/2d/notation    -> isolates the prompt crutch
 * `deficit()` refuses to compare buckets that differ in more than one dimension.
 *
 * Puzzle ratings come from lichess and are treated as fixed and well-established (they are
 * derived from many thousands of solve attempts), so only the user's rating moves.
 */

const q = Math.LN10 / 400;
const DEFAULT_R = 1200;
const DEFAULT_RD = 350;      // a fresh, unknown player
const MIN_RD = 45;           // never claim more certainty than this
const MAX_RD = 350;
const PUZZLE_RD = 60;        // lichess puzzle ratings are well established
const C = 34;                // RD growth per inactive day (uncertainty returns over time)

function g(rd) {
  return 1 / Math.sqrt(1 + (3 * q * q * rd * rd) / (Math.PI * Math.PI));
}

/** Expected score for a player (r, rd) facing a puzzle rated `pr`. */
export function expected(r, pr, prd = PUZZLE_RD) {
  return 1 / (1 + Math.pow(10, (-g(prd) * (r - pr)) / 400));
}

/**
 * One rated attempt.
 * @param {{r:number, rd:number}} player
 * @param {number} puzzleRating
 * @param {number} score 1 = solved cleanly, 0 = failed. Use 0.5 for solved-with-hint.
 */
export function updateOne(player, puzzleRating, score) {
  const rd = Math.min(MAX_RD, Math.max(MIN_RD, player.rd));
  const gp = g(PUZZLE_RD);
  const E = expected(player.r, puzzleRating);
  const dSq = 1 / (q * q * gp * gp * E * (1 - E));
  const denom = 1 / (rd * rd) + 1 / dSq;
  const newR = player.r + (q / denom) * gp * (score - E);
  const newRD = Math.max(MIN_RD, Math.sqrt(1 / denom));
  return { r: newR, rd: newRD };
}

/** RD grows back toward uncertainty while you aren't playing. */
export function decay(player, days) {
  if (!(days > 0)) return player;
  return { ...player, rd: Math.min(MAX_RD, Math.sqrt(player.rd ** 2 + C * C * days)) };
}

/**
 * The axes a rating is tracked along. Order is fixed -- it defines the key format, and
 * deficit() relies on positional comparison to tell which single axis is varying.
 *
 *   mode        'tactics' | 'blunderrush' | 'visualization'
 *   board       '2d' | '3d'                  -- flat vs perspective view
 *   promptStyle 'highlight' | 'notation'     -- squares given, or you find them
 *   perspective 'own' | 'opponent'           -- whose side of the board you view from
 *   framing     'offensive' | 'defensive'    -- see below
 *   plies       '0' | '2' | '4' | ...        -- how far ahead you must calculate before
 *                                               the position you actually solve
 *
 * PLIES is what makes look-ahead depth measurable. Visualization shows a position and a list
 * of moves to play forward in your head; the rating you converge to at 2 plies versus 4
 * tells you where your calculation actually breaks down. Every non-visualization mode is
 * '0' -- you solve the position in front of you -- which conveniently makes
 * visualization-at-0 directly comparable to plain tactics, since those buckets then differ
 * on `mode` alone.
 *
 * FRAMING is the most interesting axis and the reason this generalisation exists.
 *   'offensive' is what every tactics trainer drills: the opponent has ALREADY blundered,
 *      you are handed the resulting position and you find the fork. Enormously well trained
 *      in most players.
 *   'defensive' is the position BEFORE the blunder, with you to move. You have not erred
 *      yet, and the skill is seeing that the natural move loses. This is how games are
 *      actually lost, and almost nobody trains it.
 * The same puzzle can be posed either way, so the offensive-minus-defensive gap is an
 * unusually clean measurement: identical positions, one variable changed.
 *
 * The gap on any axis is expected to vary a lot between players -- someone who has ground
 * Blunder Rush and reverse-mode puzzles will show a much smaller framing gap than someone
 * raised purely on standard tactics. That per-person variation is the point.
 */
export const DIMENSIONS = ['mode', 'board', 'promptStyle', 'perspective', 'framing', 'plies'];

const DIMENSION_DEFAULTS = {
  mode: 'tactics',
  board: '2d',
  promptStyle: 'highlight',
  perspective: 'own',
  framing: 'offensive',
  plies: '0',
};

/** Canonical bucket key: one slash-joined value per axis, in DIMENSIONS order. */
export function bucketKey(spec = {}) {
  return DIMENSIONS.map((d) => spec[d] ?? DIMENSION_DEFAULTS[d]).join('/');
}

/** Parse a key back into its axes. */
export function parseBucket(key) {
  const parts = String(key).split('/');
  const out = {};
  DIMENSIONS.forEach((d, i) => { out[d] = parts[i] ?? DIMENSION_DEFAULTS[d]; });
  return out;
}

/**
 * @param {{get:(k:string)=>any, set:(k:string,v:any)=>void}} store  the shell's persistence
 */
export function createRating(store) {
  const KEY = 'br.ratings.v1';

  function all() {
    return store.get(KEY) || {};
  }

  function get(bucket) {
    const key = typeof bucket === 'string' ? bucket : bucketKey(bucket);
    const map = all();
    const rec = map[key] || { r: DEFAULT_R, rd: DEFAULT_RD, n: 0, last: null };
    if (rec.last) {
      const days = (Date.now() - rec.last) / 86400000;
      return { ...decay(rec, days), n: rec.n, last: rec.last };
    }
    return rec;
  }

  function record(bucket, puzzleRating, score) {
    const key = typeof bucket === 'string' ? bucket : bucketKey(bucket);
    const cur = get(key);
    const next = updateOne(cur, puzzleRating, score);
    const rec = { r: next.r, rd: next.rd, n: (cur.n || 0) + 1, last: Date.now() };
    const map = all();
    map[key] = rec;
    store.set(KEY, map);
    return rec;
  }

  /**
   * Which puzzle rating to serve next. Slightly above the user's rating so it stays
   * challenging, and wider while RD is high so the rating converges faster.
   */
  function nextTarget(bucket) {
    const p = get(bucket);
    const spread = Math.max(80, Math.min(300, p.rd));
    return { rating: Math.round(p.r + 40), spread: Math.round(spread) };
  }

  /**
   * Compare two buckets. Returns the gap and whether it has separated from noise.
   * Refuses comparisons that vary more than one dimension, since those are uninterpretable.
   */
  function deficit(bucketA, bucketB) {
    const ka = typeof bucketA === 'string' ? bucketA : bucketKey(bucketA);
    const kb = typeof bucketB === 'string' ? bucketB : bucketKey(bucketB);
    const pa = ka.split('/'), pb = kb.split('/');
    const differingAt = DIMENSIONS.map((_, i) => i).filter((i) => pa[i] !== pb[i]);
    if (differingAt.length !== 1) {
      return { ok: false, reason: differingAt.length === 0
        ? 'same bucket'
        : `buckets differ on ${differingAt.length} axes `
          + `(${differingAt.map((i) => DIMENSIONS[i]).join(', ')}); `
          + 'the comparison would be confounded -- hold all but one fixed' };
    }
    const a = get(ka), b = get(kb);
    const diff = a.r - b.r;
    const se = Math.sqrt(a.rd * a.rd + b.rd * b.rd);
    return {
      ok: true,
      varying: DIMENSIONS[differingAt[0]],
      from: pb[differingAt[0]],
      to: pa[differingAt[0]],
      a, b, diff,
      se,
      // ~95% interval; if it straddles zero we cannot yet claim a real difference
      low: diff - 1.96 * se,
      high: diff + 1.96 * se,
      significant: Math.abs(diff) > 1.96 * se,
      confident: a.rd < 100 && b.rd < 100,
      n: Math.min(a.n || 0, b.n || 0),
    };
  }

  return { get, record, nextTarget, deficit, all, bucketKey, DEFAULT_R };
}
