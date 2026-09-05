/**
 * drills.js -- board-vision exercises: square colour, square-finding, diagonals.
 *
 * WHY THIS MODE EXISTS
 * Online play only ever shows one fixed board orientation and one fixed piece style, and
 * "name a square" trainers already exist on chess.com/lichess. What doesn't exist anywhere
 * else is per-square accuracy/speed tracking with the ability to drill exactly the squares
 * that are slow or wrong -- that's this mode's actual differentiator, not the drills
 * themselves. See THE DIFFERENTIATOR below.
 *
 * ctx.config.drill selects which of the three plays: 'color' | 'square' | 'diagonal'.
 * Two further choices are INDEPENDENT of each other and of the drill -- all 3x2x3 = 18
 * combinations are meaningful and supported:
 *   ctx.config.variant       'continuous' | 'timed'            -- session SHAPE. See VARIANTS.
 *   ctx.config.selectionMode 'random' | 'auto' | 'emphasis'    -- square-picking RULE. See
 *                                                                 SELECTION MODES.
 * These were originally specified as one setting (a hot-set toggle bolted onto the
 * always-on auto-weighting); the coordinator later split them explicitly into two
 * independent dimensions, which is what's implemented here.
 *
 * THE THREE DRILLS -- deliberately different FORMS, not the same board three ways
 * -----------------------------------------------------------------------------------
 * 'color'    -- PURE RECALL, no board. A square name ("f4") appears as text; answer
 *               light/dark. A rendered board would show the answer -- the board IS the
 *               checkerboard pattern being tested, so it cannot also be the display.
 * 'square'   -- the one drill where a board is the point: a square is named, you tap it,
 *               as fast as you can. This is the only drill 2D/3D and camera seat variety
 *               apply to -- 'color' and 'diagonal' have no viewpoint to vary.
 * 'diagonal' -- PURE RECALL, no board. Two squares are named; true or false, same
 *               diagonal? (Not "which of these candidates" -- a straight yes/no per pair,
 *               which is also what keeps per-item stats tractable; see below.)
 *
 * VARIANTS -- both apply to all three drills alike
 * -----------------------------------------------------------------------------------
 * 'continuous' (the default) -- no clock, no target count. Keeps asking until the player
 *   leaves or taps "End session". Ordinary feedback pacing (a short pause on each answer
 *   so the flash/highlight actually registers). This IS what an unset ctx.config.variant
 *   gets, which matters: an earlier version of this file capped every session at a fixed
 *   question count that silently evaluated to 1 whenever `config.count` was left unset (the
 *   `Math.max(1, NaN|0) || DEFAULT` idiom: `NaN|0` is `0`, `Math.max(1,0)` is `1`, and `1`
 *   is truthy, so the `|| DEFAULT` never ran) -- since app.js never sets `config.count`,
 *   every real session hit that floor and ended after one question. Fixed by dropping
 *   count-based termination entirely; 'continuous' now has no cap unless a caller opts in
 *   with a valid `config.count` (used by this file's own test harness, never by the shell).
 * 'timed' -- a fixed TIMED_SECONDS-second clock for the whole session (not per question),
 *   shown via ctx.ui.setHeader({time}) the same way Blunder Rush shows its 5-minute clock.
 *   Score is simply the count of correct answers, same scoring as 'continuous'. "Instant
 *   advance, no ceremony" per the brief: TIMED_ADVANCE_MS replaces the longer practice-mode
 *   pause between questions, on both a correct and a wrong answer alike.
 *
 * THE DIFFERENTIATOR -- per-square stats + three selection modes
 * -----------------------------------------------------------------------------------
 * Every answer is recorded via `ctx.stats.record('drill', ...)` (never localStorage --
 * modes don't get to touch that). `loadItemStats()` reads it back via `ctx.stats.query`
 * and aggregates attempts / correct / avgMs PER SQUARE:
 *
 *   - 'color' and 'square': the item is obviously the square asked about.
 *   - 'diagonal': a question is about a PAIR, and per-pair stats would be hopelessly
 *     sparse -- up to ~1,800 distinct pairs share no file/rank/diagonal, most of which
 *     would see one attempt ever. So a pair's result is attributed to BOTH of its
 *     squares. A square that keeps coming up in slow or wrong diagonal answers -- as
 *     either the reference or the candidate -- is exactly the square worth flagging,
 *     which is the property that actually matters for "what should I drill."
 *
 * This aggregate is exactly as valid under any selection mode as any other -- a square's
 * own hit rate and latency don't change depending on how often it happened to be asked --
 * so the heatmap and loadItemStats() are NOT split by selection mode. Only aggregate
 * SESSION SCORES are, because they are not comparable across modes (see below).
 *
 * SELECTION MODES (ctx.config.selectionMode) -- pickTarget()
 * -----------------------------------------------------------------------------------
 * 'random'   -- uniform over all 64 squares. No cleverness; the honest baseline.
 * 'auto'     -- (the default) `pickWeighted()`, an always-on continuous bias toward
 *               whichever squares the per-square stats say are weak -- "the common case
 *               needs no configuration" -- with untested squares given a neutral
 *               mid-weight so they still surface for initial coverage rather than only
 *               ever revisiting known-bad squares.
 * 'emphasis' -- the player builds a HOT SET of squares via the "Weak squares" sheet (an
 *               8x8 heatmap, darker = slower/more wrong, using the design system's
 *               sequential blue ramp -- see the dataviz skill's references/palette.md
 *               "Sequential hue" -- restepped per theme so the lightest step always
 *               recedes toward that theme's own surface). The hot set does NOT restrict
 *               play to only those squares -- "show all the squares but show one from
 *               the desired training set 50% of the time" was the explicit spec, so a
 *               4-square hot set still lands ~12-13 repetitions per 100 questions while
 *               the rest of the board keeps coming up too. See HOT_SPOT_SHARE. With
 *               'emphasis' selected but no hot set built yet, this falls back to the
 *               same `pickWeighted()` 'auto' uses, on the theory that "emphasis with
 *               nothing emphasised" should degrade to the smart default, not to plain
 *               randomness.
 *
 * SCORES ARE NOT COMPARABLE ACROSS SELECTION MODES
 * Deliberately NOT labelled "harder"/"easier" anywhere -- per the user, it's a genuinely
 * open, empirical question whether 'auto' plays harder than 'random' (it keeps landing on
 * squares you're already bad at) or easier (repetition within a session, drawing
 * disproportionately from a shrinking set of your weak squares, is its own kind of easy).
 * Answering that question is the whole point of keeping 'random' and 'auto' scores
 * separate with enough history to compare trends over time -- so this file never frames
 * one as the "hard mode": see meta.selectionModes' copy, which is deliberately neutral.
 *   - 'random' and 'auto': tracked, kept SEPARATE (their own best, their own history) so
 *     the two curves can actually be compared -- collapsing them into one number would
 *     erase the exact comparison this exists to enable.
 *   - 'emphasis': NOT tracked as a comparable score at all. The hot set is arbitrary and
 *     typically different session to session (the player picks it), so a "best" against
 *     it is noise, not signal -- there's nothing stable on the other side of the
 *     comparison. The run still finishes normally and its score is still shown on
 *     screen; it just never becomes a persisted "best". Per-square correctness/latency
 *     recording is UNCHANGED in this mode (see above) -- turning that off would starve
 *     the exact heatmap 'emphasis' mode depends on to build its set from.
 * `selectionMode` and `drill` are stamped on every `ctx.stats.record('drill', ...)` call
 * (so the stats screen's existing time-window filtering can already split history by
 * mode) and on the `ModeSummary` handed to `ctx.onFinish`, along with a `trackBest`
 * boolean (false only for 'emphasis'). This module cannot itself decide how "best" is
 * bucketed or suppressed -- persistence is the shell's job -- so this is the hand-off
 * point; see INTEGRATION NOTE 5.
 *
 * ON NOT DAMPING pickWeighted(): asked to consider whether 'auto' needs an anti-
 * repetition floor so it can't degenerate onto two or three squares, and deliberately
 * NOT adding one -- see pickWeighted()'s own comment for the reasoning (in short: the
 * weight ratio is a fixed 5x, worst against best, over a 64-square pool, which bounds
 * any single square's share far short of "degenerate" even in the most adversarial case;
 * and repetition-within-a-shrinking-set is itself half of the open question above, so
 * suppressing it would prejudge the answer rather than let the player find it).
 *
 * INTEGRATION NOTES (for whoever wires the shell around this mode)
 * -----------------------------------------------------------------------------------
 * 1. Square taps (drill 'square' only). `ctx.board` (built by app.js's
 *    `createBoardHandle`) is a WRAPPER around the real board2d/board3d handle and does
 *    not currently forward `setSquareTapHandler`, so this mode reaches through the
 *    wrapper's `raw()` escape hatch (the same one `app.js` itself uses for `randomSeat`)
 *    to install the handler on the real renderer.
 * 2. Coordinates ('square' drill only). board-interface.js only accepts `coordinates`
 *    as a `createBoard()`-time option with no runtime setter, and app.js's
 *    `createBoardHandle()` always builds the board from the user's global "Coordinates"
 *    setting with no per-mode override -- this module cannot guarantee coordinates are
 *    off with the shell as it stands today. `meta.drills[].boardOptions` is a hint for
 *    a shell that grows a way to read it.
 * 3. 'color' and 'diagonal' never insert `ctx.boardEl` anywhere. app.js's `adoptChrome`
 *    only auto-inserts the board into a mode's `.stage` if that stage contains none of
 *    `.board-area, .board-frame, .blindfold` -- both of these drills render a
 *    `.board-frame > .blindfold` flashcard panel (the same structure the Visualization
 *    mode's boardless screens use, per app/test/design.html), which satisfies that
 *    guard, so the shell correctly leaves them boardless rather than forcing one in.
 * 4. TWO NEW CONFIG KEYS NEEDED FROM THE SHELL: `ctx.config.variant` ('continuous' |
 *    'timed') and `ctx.config.selectionMode` ('random' | 'auto' | 'emphasis') -- both
 *    default safely (to 'continuous' and 'auto' respectively) if absent/unrecognised, so
 *    nothing breaks before this is wired. There is currently no setup screen offering
 *    either choice -- the home screen's drill cards link straight to
 *    `#/play?mode=drills&drill=<id>` with neither param. This needs a setup step
 *    analogous to `renderRushSetup()` (`#/rush`), with pickers for both dimensions before
 *    starting, the same way Blunder Rush offers timed/survival/practice before its own
 *    `#/play`. `meta.variants` and `meta.selectionModes` below enumerate the options with
 *    display copy, for that screen to read.
 * 5. BEST-SCORE BUCKETING AND SUPPRESSION: `ctx.onFinish`'s summary carries `drill`,
 *    `selectionMode` and `trackBest` fields beyond the documented ModeSummary shape
 *    (harmless extras; nothing about the contract forbids them). Whatever persists a
 *    "best score" for this mode needs two behaviours neither of which it has today:
 *      a. Key on (drill, variant, selectionMode) together, not just mode+variant -- see
 *         THE DIFFERENTIATOR above for why 'random' vs 'auto' runs aren't comparable.
 *         Today `app.js`'s `finishRun()` keys on `` `${modeId}:${variant}` `` alone,
 *         which would conflate e.g. 'color'/random with 'square'/emphasis under one
 *         number the moment this mode gets a real setup screen exercising more than one
 *         drill/selectionMode.
 *      b. Skip writing/comparing a best ENTIRELY when `summary.trackBest === false`
 *         (true only for 'emphasis'). Today `finishRun()` calls `writeBest(key, score)`
 *         unconditionally, with no such escape hatch -- an 'emphasis' run would still
 *         get written and compared against, which is exactly what was asked not to
 *         happen (the hot set is player-chosen and typically different every session,
 *         so a "best" against it is noise). This mode still calls `ctx.onFinish` with a
 *         normal score for 'emphasis' runs -- the run finishes and shows a result same
 *         as any other -- `trackBest` only says "don't persist/compare this one."
 * -----------------------------------------------------------------------------------
 */

import { parseSquare, toSquare } from '../board-interface.js';
import { seedFor } from '../mode-interface.js';

export const meta = {
  id: 'drills',
  title: 'Exercises',
  blurb: 'Square colour, square-finding speed and diagonal recall -- with per-square '
    + 'stats, so you can see exactly which squares are slow or wrong and drill just those.',
  drills: [
    {
      id: 'color',
      title: 'Square Colour',
      desc: 'Told a square, say light or dark. Pure recall -- no board to lean on.',
      needsBoard: false,
    },
    {
      id: 'square',
      title: 'Find the Square',
      desc: 'A square is named -- tap it as fast as you can.',
      needsBoard: true,
      boardOptions: { coordinates: false },
    },
    {
      id: 'diagonal',
      title: 'Diagonals',
      desc: 'Two squares -- true or false, are they on the same diagonal?',
      needsBoard: false,
    },
  ],
  // See INTEGRATION NOTE 4 above: no setup screen reads either of these yet.
  variants: [
    { id: 'continuous', title: 'Practice', desc: 'No clock -- keep going until you stop.' },
    { id: 'timed', title: '30 Second Rush', desc: 'How many can you get in 30 seconds?' },
  ],
  // Deliberately neutral copy -- NOT "hard mode" / "easy mode". Whether 'auto' plays
  // harder than 'random' (it keeps landing on your weak squares) or easier (repetition
  // within a shrinking set) is an open, empirical question this mode exists partly to
  // let a player answer for themselves; see the file header's SELECTION MODES section.
  selectionModes: [
    { id: 'random', title: 'Random', desc: 'Every square, equally likely. The baseline.' },
    { id: 'auto', title: 'Adaptive', desc: 'Leans toward squares you’re slow or wrong on.' },
    { id: 'emphasis', title: 'Focus set', desc: 'Pick squares from your heatmap to emphasise -- the rest of the board still comes up too. Not scored against a best.' },
  ],
};

/* ============================================================================
   CONSTANTS
   ========================================================================== */
const DRILL_IDS = ['color', 'square', 'diagonal'];
const DEFAULT_DRILL = 'square';
const VARIANT_IDS = ['continuous', 'timed'];
const DEFAULT_VARIANT = 'continuous';
const SELECTION_MODE_IDS = ['random', 'auto', 'emphasis'];
const DEFAULT_SELECTION_MODE = 'auto';
const TIMED_SECONDS = 30;              // the whole-session clock for the 'timed' variant
const STREAK_FOR_MAX_DIFFICULTY = 8;   // 'square' only: streak at which the seat maxes out
const EMPTY_FEN = '8/8/8/8/8/8/8/8 w - - 0 1';
const PRACTICE_CORRECT_DELAY_MS = 550; // 'continuous': time to register a correct flash
const PRACTICE_WRONG_DELAY_MS = 1100;  // 'continuous': longer, so the reveal is actually readable
const TIMED_ADVANCE_MS = 120;          // 'timed': "instant advance, no ceremony" either way
const SLOW_MS_CEILING = 4000;          // an answer this slow or slower reads as "as weak as it gets"
const WEAK_PICK_COUNT = 8;             // squares selected by the sheet's "Weakest N" quick action
const HOT_SPOT_SHARE = 0.5;            // fraction of questions drawn from the hot set, not the whole board

const ALL_SQUARES = [];
for (let r = 0; r < 8; r++) {
  for (let f = 0; f < 8; f++) ALL_SQUARES.push(toSquare(f, r));
}

/* ============================================================================
   PURE HELPERS -- geometry, RNG, no DOM
   ========================================================================== */

/** Deterministic PRNG so a given (drill, session, question index) always reproduces. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickOne(arr, rng) { return arr[Math.floor(rng() * arr.length)]; }

function shuffled(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** a1 is a dark square. 0-indexed file/rank: (file+rank) even => dark. */
function squareColor(sq) {
  const p = parseSquare(sq);
  return (p.file + p.rank) % 2 === 0 ? 'dark' : 'light';
}

function sameDiagonal(a, b) {
  if (a === b) return false;
  const A = parseSquare(a);
  const B = parseSquare(b);
  if (!A || !B) return false;
  return Math.abs(A.file - B.file) === Math.abs(A.rank - B.rank);
}

function diagonalMates(sq) {
  return ALL_SQUARES.filter((s) => sameDiagonal(sq, s));
}

/** A decoy sharing target's file or rank is trivially, visibly not a diagonal mate --
 *  "a1 and c1" or "b4 and b7" give the answer away without any diagonal reasoning at
 *  all. A genuine near-miss instead:
 *    - shares NEITHER file nor rank (fileDiff > 0 AND rankDiff > 0) -- ruling out
 *      exactly the trivial case above;
 *    - is OFF BY ONE from a true diagonal (|file-diff - rank-diff| === 1) -- the
 *      near-parallel case that runs alongside the real diagonal and looks
 *      diagonal-ish at a glance. (Note this makes it the OPPOSITE colour from
 *      target, same as any square one step off a diagonal always is -- fileDiff +
 *      rankDiff is odd whenever their difference is 1 -- so this can't also be
 *      colour-matched; the off-by-one shape is what carries the difficulty.)
 *    - is preferred FAR from target (Chebyshev distance >= 3) -- close off-by-one
 *      squares are the easy case (the eye catches the gap immediately), far ones are
 *      the genuinely hard "runs alongside the diagonal for a while" case.
 *  Falls back to any non-same-file/rank, non-diagonal square if the near-diagonal
 *  pool is too small (never happens in practice -- every square has at least a
 *  dozen -- but kept as a last resort). */
function nearMissDecoys(target, exclude, count, rng) {
  const A = parseSquare(target);
  function diffs(s) {
    const B = parseSquare(s);
    return { fd: Math.abs(A.file - B.file), rd: Math.abs(A.rank - B.rank) };
  }
  function offDiagonalCandidate(s) {
    if (s === target || exclude.has(s)) return false;
    const { fd, rd } = diffs(s);
    if (fd === 0 || rd === 0) return false; // same file/rank -- the trivially-easy case
    return fd !== rd; // an actual diagonal mate -- never a valid "false" decoy
  }
  const nearDiagonal = ALL_SQUARES.filter((s) => offDiagonalCandidate(s) && Math.abs(diffs(s).fd - diffs(s).rd) === 1);
  const far = nearDiagonal.filter((s) => {
    const { fd, rd } = diffs(s);
    return Math.max(fd, rd) >= 3;
  });
  const source = far.length >= count ? far
    : nearDiagonal.length >= count ? nearDiagonal
      : ALL_SQUARES.filter(offDiagonalCandidate);
  return shuffled(source, rng).slice(0, count);
}

/* ============================================================================
   PER-SQUARE STATS -- the differentiator. Pure functions over ctx.stats rows.
   ========================================================================== */

/**
 * Raw 'drill' rows (as ctx.stats.query('drill', {}) returns them) -> per-square
 * {attempts, correct, pct, avgMs}. See the file header for why 'diagonal' attributes
 * a pair's result to both of its squares.
 */
function aggregateItemStats(rows, drillType) {
  const by = new Map();
  function bump(sq, correct, ms) {
    if (!sq) return;
    let s = by.get(sq);
    if (!s) { s = { attempts: 0, correct: 0, totalMs: 0, timed: 0 }; by.set(sq, s); }
    s.attempts += 1;
    if (correct) s.correct += 1;
    if (Number.isFinite(ms)) { s.totalMs += ms; s.timed += 1; }
  }
  for (const r of rows) {
    if (!r || r.drill !== drillType) continue;
    bump(r.square, r.correct === true, Number(r.ms));
    if (drillType === 'diagonal' && r.other) bump(r.other, r.correct === true, Number(r.ms));
  }
  const out = {};
  for (const [sq, s] of by) {
    out[sq] = {
      attempts: s.attempts,
      correct: s.correct,
      pct: s.attempts ? Math.round((s.correct / s.attempts) * 100) : null,
      avgMs: s.timed ? Math.round(s.totalMs / s.timed) : null,
    };
  }
  return out;
}

/**
 * 0 (mastered) .. 1 (weak). Untested squares score exactly in the MIDDLE rather than at
 * either extreme -- treating "never tried" as "weak" would flood the weighted picker
 * and the heatmap with squares that have no track record at all, and treating it as
 * "mastered" would mean a square never gets asked until something else has already
 * failed. A neutral prior gives untested squares ordinary odds of coming up, exactly
 * like a square with a middling track record.
 */
function weaknessScore(item) {
  if (!item || item.attempts === 0) return 0.5;
  const errorRate = 1 - item.correct / item.attempts;
  const slowness = item.avgMs != null ? Math.min(1, item.avgMs / SLOW_MS_CEILING) : 0;
  return Math.max(0, Math.min(1, errorRate * 0.7 + slowness * 0.3));
}

/** Relative sampling weight: 1x for a fully mastered square, up to 5x for the weakest. */
function weaknessWeight(item) { return 1 + weaknessScore(item) * 4; }

/**
 * Weighted-random square from `pool`, biased toward weaker squares. Drives the 'auto'
 * selection mode (and 'emphasis' before any hot set is built) -- see pickTarget().
 *
 * NO ANTI-REPETITION FLOOR, DELIBERATELY. The concern this would address: if a player's
 * weak squares shrink to just two or three, does 'auto' start hammering only those,
 * "degenerating"? It structurally can't go far: weaknessWeight() tops out at 5x a
 * mastered square's 1x, so even in the most adversarial case -- every OTHER square on the
 * board perfectly mastered, only one square maximally weak -- that one square's share of
 * draws is 5/(63*1+5) = 5/68 ~= 7.4%, nowhere near "two or three squares dominate."
 * Separately, whether repetition-within-a-shrinking-weak-set makes 'auto' feel easier
 * over a session is exactly the open, empirical question this mode exists to let a
 * player answer (see the file header) -- damping it to "fix" a perceived problem would
 * suppress the very effect the comparison against 'random' is supposed to surface.
 */
function pickWeighted(pool, itemStats, rng) {
  if (pool.length === 1) return pool[0];
  const weights = pool.map((sq) => weaknessWeight(itemStats[sq]));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/** The N weakest TESTED squares, worst first. Untested squares are excluded here (unlike
 *  weaknessScore's neutral prior) because "weakest" as a user-facing pick should mean
 *  "actually struggling with", not "happens to have no data yet". */
function weakestSquares(itemStats, count) {
  return ALL_SQUARES
    .filter((sq) => itemStats[sq] && itemStats[sq].attempts > 0)
    .sort((a, b) => weaknessScore(itemStats[b]) - weaknessScore(itemStats[a]))
    .slice(0, count);
}

/* ============================================================================
   HEATMAP COLOUR -- sequential (one hue, light -> dark), per the dataviz skill.
   Values are the skill's documented default sequential ramp (references/palette.md,
   "Sequential hue"), re-stepped per theme so the lightest step always recedes toward
   THAT theme's own surface rather than reusing one ramp built for a light background.
   ========================================================================== */
function isDarkTheme() {
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'dark') return true;
  if (attr === 'light') return false;
  return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

const HEAT_STEPS_LIGHT = ['#cde2fb', '#86b6ef', '#3987e5', '#184f95'];
const HEAT_TEXT_LIGHT = ['var(--text)', 'var(--text)', '#fff', '#fff'];
const HEAT_STEPS_DARK = ['#184f95', '#2a78d6', '#3987e5', '#86b6ef'];
const HEAT_TEXT_DARK = ['#fff', '#fff', '#fff', 'var(--text)'];

/** {bg, fg} for one heatmap cell. No-data squares get the design system's own neutral
 *  surface token (not a heat colour) so "untested" never gets mistaken for "best". */
function heatFor(item) {
  if (!item || item.attempts === 0) return { bg: 'var(--surface-3)', fg: 'var(--text-3)' };
  const dark = isDarkTheme();
  const steps = dark ? HEAT_STEPS_DARK : HEAT_STEPS_LIGHT;
  const texts = dark ? HEAT_TEXT_DARK : HEAT_TEXT_LIGHT;
  const idx = Math.min(3, Math.floor(weaknessScore(item) * 4));
  return { bg: steps[idx], fg: texts[idx] };
}

/* ============================================================================
   DOM HELPERS
   ========================================================================== */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/**
 * `ctx.root` arrives as the shell's empty `.screen.screen--play` element; the shell
 * prepends its own app bar afterwards if this mode renders none (adoptChrome in app.js),
 * so this mode deliberately builds none -- it drives the header purely through
 * `ctx.ui.setHeader()`. Builds exactly `.stage` then `.action-bar`, matching
 * app/test/design.html's screen--play markup.
 *
 * 'square' gets the classic `.prompt` pill + the real board. 'color'/'diagonal' get a
 * `.board-frame > .blindfold` flashcard panel instead (see the file header, integration
 * note 3) -- `boardEl` is never touched for those two.
 */
function buildLayout(root, drillType, boardEl) {
  root.replaceChildren();

  const stage = el('div', 'stage');
  let promptLabel = null;
  let promptMove = null;
  let blindEyebrow = null;
  let blindMoves = null;
  let blindHint = null;

  if (drillType === 'square') {
    const prompt = el('div', 'prompt');
    promptLabel = el('span', 'prompt__label', '');
    promptMove = el('span', 'prompt__move', '');
    prompt.append(promptLabel, promptMove);
    stage.append(prompt, boardEl);
  } else {
    const boardArea = el('div', 'board-area');
    const frame = el('div', 'board-frame');
    const blind = el('div', 'blindfold');
    blindEyebrow = el('span', 'blindfold__eyebrow', '');
    blindMoves = el('p', 'blindfold__moves', '');
    blindHint = el('p', 'blindfold__hint', '');
    blind.append(blindEyebrow, blindMoves, blindHint);
    frame.appendChild(blind);
    boardArea.appendChild(frame);
    stage.appendChild(boardArea);
  }

  const meta = el('div', 'stage__meta');
  const metaTimer = el('span', 'u-num', '0.0s');
  const sep1 = el('span', 'stage__meta-sep');
  const metaAccuracy = el('span', '', '');
  const sep2 = el('span', 'stage__meta-sep');
  const metaStreak = el('span', 'stage__meta-streak', '');
  const sep3 = el('span', 'stage__meta-sep');
  const weakLink = el('button', '', 'Weak squares');
  weakLink.type = 'button';
  weakLink.dataset.role = 'weak-link';
  weakLink.style.cssText = 'background:none;border:0;padding:0;margin:0;'
    + 'color:var(--accent);font:inherit;font-weight:var(--fw-semibold);cursor:pointer;';
  meta.append(metaTimer, sep1, metaAccuracy, sep2, metaStreak, sep3, weakLink);
  stage.appendChild(meta);

  const actionBar = el('div', 'action-bar');
  const inner = el('div', 'action-bar__inner');
  inner.style.display = 'grid';
  inner.style.gap = 'var(--space-2)';

  const answers = el('div', 'answers');
  answers.hidden = true;

  const hint = el('p', 'stage__meta', '');
  hint.style.justifyContent = 'center';
  hint.hidden = true;

  const endBtn = el('button', 'btn btn--ghost btn--block', 'End session');
  endBtn.type = 'button';

  inner.append(answers, hint, endBtn);
  actionBar.appendChild(inner);

  root.append(stage, actionBar);

  return {
    promptLabel, promptMove, blindEyebrow, blindMoves, blindHint,
    metaTimer, metaAccuracy, metaStreak, weakLink, answers, hint, endBtn,
  };
}

/**
 * Builds (but does not mount) the "Weak squares" sheet: an 8x8 heatmap of every square's
 * weakness, tap-to-toggle hot-set membership, quick actions, and Apply/Cancel. Caller
 * appends `{scrim, sheet}` into `ctx.root`; both close paths below already remove the
 * nodes themselves, so the caller only needs to append, never remove.
 *
 * The set built here is a HOT SET, not a restriction to practice -- see HOT_SPOT_SHARE in
 * buildQuestion(). It only actually steers question selection in the 'emphasis' selection
 * mode (`isEmphasis`); building one in 'random'/'auto' is harmless (still visible, still
 * savable for later) but has no effect yet, so the sheet says so rather than implying it
 * does something it doesn't. `currentSelection` is `null` (no hot set) or a Set.
 * `onCommit` receives the new hot set in the same shape (an EMPTY Set, not null, when the
 * player explicitly clears it via "Clear" -- Apply is always enabled since an explicit
 * empty selection is itself a meaningful choice: pickWeighted() takes back over in
 * 'emphasis' mode). `onCancel` fires on scrim click or Cancel with no change made.
 */
function buildWeakSquaresSheet({ itemStats, currentSelection, isEmphasis, onCommit, onCancel }) {
  const pending = new Set(currentSelection || []);

  const scrim = el('div', 'sheet-scrim');
  const sheet = el('div', 'sheet');
  sheet.dataset.role = 'weak-squares-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');

  const grabber = el('div', 'sheet__grabber');
  const body = el('div', 'sheet__body');
  const title = el('h2', 'sheet__title', 'Hot squares');
  const text = el('p', 'sheet__text', isEmphasis
    ? `Darker squares are slower or more often wrong. Tap squares to build a hot set -- `
      + `they'll come up about ${Math.round(HOT_SPOT_SHARE * 100)}% of the time; the rest of `
      + `the board keeps coming up too.`
    : `Darker squares are slower or more often wrong. This set only affects which squares `
      + `come up in Focus set mode -- switch to it at setup to put a hot set to work.`);

  const quickRow = el('div');
  quickRow.style.cssText = 'display:flex;gap:var(--space-2);flex-wrap:wrap;justify-content:center;';
  const allBtn = el('button', 'btn btn--secondary', 'All squares');
  const weakBtn = el('button', 'btn btn--secondary', `Weakest ${WEAK_PICK_COUNT}`);
  const clearBtn = el('button', 'btn btn--secondary', 'Clear');
  allBtn.type = 'button'; weakBtn.type = 'button'; clearBtn.type = 'button';
  allBtn.dataset.role = 'sheet-all'; weakBtn.dataset.role = 'sheet-weakest'; clearBtn.dataset.role = 'sheet-clear';
  quickRow.append(allBtn, weakBtn, clearBtn);

  const grid = el('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(8,1fr);gap:3px;margin-top:var(--space-3);';

  const cells = new Map();
  for (const sq of ALL_SQUARES) {
    const cell = el('button', '', sq);
    cell.type = 'button';
    cell.style.cssText = 'aspect-ratio:1/1;border-radius:var(--radius-sm);'
      + 'font-size:var(--fs-2xs);font-weight:var(--fw-semibold);border:2px solid transparent;';
    cell.dataset.square = sq;
    cells.set(sq, cell);
    cell.addEventListener('click', () => {
      if (pending.has(sq)) pending.delete(sq); else pending.add(sq);
      paintCell(sq);
      updateApplyLabel();
    });
    grid.appendChild(cell);
  }

  function paintCell(sq) {
    const cell = cells.get(sq);
    const { bg, fg } = heatFor(itemStats[sq]);
    cell.style.background = bg;
    cell.style.color = fg;
    const included = pending.has(sq);
    cell.style.borderColor = included ? 'var(--accent)' : 'transparent';
    cell.style.opacity = included ? '1' : '0.35';
    const s = itemStats[sq];
    cell.title = s && s.attempts
      ? `${sq}: ${s.pct}% correct, ${s.avgMs}ms avg over ${s.attempts} attempt${s.attempts === 1 ? '' : 's'}`
      : `${sq}: no data yet`;
    cell.setAttribute('aria-pressed', String(included));
  }
  function paintAll() { for (const sq of ALL_SQUARES) paintCell(sq); }

  const actions = el('div', 'sheet__actions');
  const applyBtn = el('button', 'btn btn--primary btn--lg btn--block', '');
  const cancelBtn = el('button', 'btn btn--ghost btn--block', 'Cancel');
  applyBtn.type = 'button'; cancelBtn.type = 'button';
  applyBtn.dataset.role = 'sheet-apply'; cancelBtn.dataset.role = 'sheet-cancel';
  actions.append(applyBtn, cancelBtn);

  function updateApplyLabel() {
    if (pending.size === 0) applyBtn.textContent = 'Use automatic weighting';
    else if (pending.size >= ALL_SQUARES.length) applyBtn.textContent = 'Practice uniformly (no bias)';
    else applyBtn.textContent = `Set ${pending.size} hot square${pending.size === 1 ? '' : 's'}`;
    // Committing an empty (or full) set is a meaningful, valid choice now -- Apply is
    // always enabled, unlike the old "restrict to selection" sheet where 0 squares meant
    // "nothing to practice" and had to be blocked.
  }

  allBtn.addEventListener('click', () => { pending.clear(); ALL_SQUARES.forEach((s) => pending.add(s)); paintAll(); updateApplyLabel(); });
  clearBtn.addEventListener('click', () => { pending.clear(); paintAll(); updateApplyLabel(); });
  weakBtn.addEventListener('click', () => {
    pending.clear();
    for (const sq of weakestSquares(itemStats, WEAK_PICK_COUNT)) pending.add(sq);
    paintAll();
    updateApplyLabel();
  });

  paintAll();
  updateApplyLabel();

  body.append(title, text, quickRow, grid);
  sheet.append(grabber, body, actions);

  function close() { scrim.remove(); sheet.remove(); }
  scrim.addEventListener('click', () => { close(); onCancel(); });
  cancelBtn.addEventListener('click', () => { close(); onCancel(); });
  applyBtn.addEventListener('click', () => {
    close();
    onCommit(new Set(pending));
  });

  return { scrim, sheet };
}

/* ============================================================================
   MODE
   ========================================================================== */
export function createMode(ctx) {
  const { root, board, boardEl } = ctx;
  const ui = ctx.ui || {};
  const config = ctx.config || {};

  const drillType = DRILL_IDS.includes(config.drill) ? config.drill : DEFAULT_DRILL;
  const usesBoard = drillType === 'square';
  const variant = VARIANT_IDS.includes(config.variant) ? config.variant : DEFAULT_VARIANT;
  const isTimed = variant === 'timed';
  const timedSeconds = Number(config.timedSeconds) > 0 ? Number(config.timedSeconds) : TIMED_SECONDS;
  // Independent of `variant` -- see the file header's SELECTION MODES section.
  const selectionMode = SELECTION_MODE_IDS.includes(config.selectionMode) ? config.selectionMode : DEFAULT_SELECTION_MODE;
  const isEmphasis = selectionMode === 'emphasis';
  // Optional, and only meaningful for 'continuous': a hard cap on question count. The real
  // shell never sets this (see the file header's account of the one-question bug); it
  // exists so this file's own test harness can bound an otherwise-infinite loop without
  // waiting on "End session". 'timed' always ends on the clock, never on a count.
  const countCap = !isTimed && Number(config.count) > 0 ? Math.floor(Number(config.count)) : null;

  const dom = buildLayout(root, drillType, boardEl);

  /** The wrapper in app.js doesn't forward setSquareTapHandler yet; reach past it.
   *  Re-resolved every question rather than cached once, so a mid-run 2D/3D swap
   *  (triggered from the settings sheet) doesn't leave this mode's tap handler wired
   *  to a destroyed renderer -- see the file header for the full story. 'square' only. */
  function currentRawBoard() {
    return typeof board.raw === 'function' ? board.raw() : board;
  }

  let destroyed = false;
  let paused = false;
  let index = 0;
  let score = 0;
  let streak = 0;
  let bestStreak = 0;
  let correctCount = 0;
  let awaiting = false;
  let current = null;
  let questionStart = 0;
  let timerHandle = null;
  let advanceHandle = null;
  let hotSet = null; // null = no hot set (pickWeighted() default); else a Set of hot squares
  const history = [];
  const sessionNonce = `${Date.now()}:${Math.random().toString(36).slice(2)}`;

  function rngFor(i) {
    return mulberry32(seedFor(`drills:${drillType}:${sessionNonce}:${i}`));
  }

  function safeCall(fn) {
    try { fn(); } catch { /* progressive enhancement only; never block on it */ }
  }

  function loadItemStats() {
    if (!ctx.stats || typeof ctx.stats.query !== 'function') return {};
    let rows = [];
    try { rows = ctx.stats.query('drill', {}) || []; } catch { rows = []; }
    return aggregateItemStats(rows, drillType);
  }

  /* ---- readouts ------------------------------------------------------------
     'timed' shows Score + a live countdown, the same shared readout shape Blunder
     Rush's timed variant uses (ctx.ui.setHeader({score, time})); 'continuous' shows
     just Score. `remainingOverride` lets the session-timer tick hand in a value it
     just computed rather than recomputing it a moment later. */
  function pushHeader(remainingOverride) {
    if (typeof ui.setHeader !== 'function') return;
    if (isTimed) {
      const remaining = remainingOverride != null ? remainingOverride : Math.max(0, (sessionDeadline - performance.now()) / 1000);
      safeCall(() => ui.setHeader({ score, time: Math.ceil(remaining) }));
    } else {
      safeCall(() => ui.setHeader({ score }));
    }
  }

  function refreshMeta() {
    const attempted = history.length;
    dom.metaAccuracy.textContent = attempted ? `${correctCount}/${attempted} correct` : 'first question';
    dom.metaStreak.textContent = streak > 0 ? `${streak} in a row` : 'no streak yet';
  }

  /* ---- per-question timer ---------------------------------------------------
     `questionStart` is the instant the question became visible -- what
     stats.record()'s `ms` is measured from (see settleAnswer). Backgrounding the
     tab mid-question must not count against that latency, so pause()/resume()
     shift `questionStart` forward by however long the app was hidden instead of
     restarting the clock. */
  let pausedAt = 0;

  function tickTimerDisplay() {
    const secs = (performance.now() - questionStart) / 1000;
    dom.metaTimer.textContent = `${secs.toFixed(1)}s`;
  }

  function startTimer() {
    stopTimer();
    questionStart = performance.now();
    dom.metaTimer.textContent = '0.0s';
    timerHandle = setInterval(tickTimerDisplay, 100);
  }

  function stopTimer() {
    if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
  }

  /* ---- whole-session timer ('timed' variant only) --------------------------
     A single TIMED_SECONDS-second clock for the whole run, separate from the
     per-question stopwatch above. Pausing (app backgrounded, or the weak-squares
     sheet open) shifts the deadline forward exactly like the per-question timer
     does, so browsing never costs race time. */
  let sessionDeadline = 0;
  let sessionTimerHandle = null;
  let sessionPausedAt = 0;

  function tickSessionTimer() {
    const remaining = Math.max(0, (sessionDeadline - performance.now()) / 1000);
    pushHeader(remaining);
    if (remaining <= 0) {
      stopSessionTimer();
      finish();
    }
  }

  function startSessionTimer() {
    stopSessionTimer();
    sessionDeadline = performance.now() + timedSeconds * 1000;
    sessionTimerHandle = setInterval(tickSessionTimer, 200);
    tickSessionTimer();
  }

  function stopSessionTimer() {
    if (sessionTimerHandle) { clearInterval(sessionTimerHandle); sessionTimerHandle = null; }
  }

  /* ---- difficulty / viewpoint ('square' only) ------------------------------ */
  /**
   * Returns the ACTUAL resulting {elevation, yaw} for this question, not the requested
   * one -- `board.setSeat()` clamps into the seat envelope and hands the clamped value
   * back, and that's what stats.record() needs. The 2D board has no camera at all, so
   * it is recorded as the true top-down view it always is (elevation 90, yaw 0) rather
   * than a fabricated angle.
   */
  function applySeat(i, rng) {
    if (i === 0) {
      safeCall(() => board.setView('top'));
      return { elevation: 90, yaw: 0 };
    }
    const hardness = Math.min(1, streak / STREAK_FOR_MAX_DIFFICULTY);
    const wantElevation = 45 - hardness * (45 - 28) + (rng() - 0.5) * 4;
    const wantYaw = (rng() * 2 - 1) * (8 + hardness * 12);
    const distance = 0.88 + rng() * (1.14 - 0.88);
    let actual = null;
    safeCall(() => {
      actual = board.setSeat({ elevation: wantElevation, yaw: wantYaw, distance }, { animate: true });
    });
    if (actual && typeof actual.elevation === 'number' && typeof actual.yaw === 'number') {
      return { elevation: round1(actual.elevation), yaw: round1(actual.yaw) };
    }
    return { elevation: 90, yaw: 0 };
  }

  function round1(n) { return Math.round(n * 10) / 10; }

  /* ---- question generation ---------------------------------------------------
     Three independent selection modes -- see the file header's SELECTION MODES section:
       'random'   -- plain uniform, no per-square memory at all.
       'emphasis' -- with a non-empty hot set, HOT_SPOT_SHARE of questions draw uniformly
                     from the hot set and the rest draw uniformly from the WHOLE board
                     (not "whole board minus hot set" -- the hot set can still come up in
                     its "other" share too, same as the spec's own arithmetic assumes).
                     With no hot set built yet, falls back to the same weighting 'auto'
                     uses -- "emphasis on nothing" degrades to the smart default.
       'auto'     -- (and 'emphasis' with an empty hot set) pickWeighted()'s continuous
                     bias toward whatever the per-square stats say is weak. */
  function pickTarget(rng) {
    if (selectionMode === 'random') {
      return pickOne(ALL_SQUARES, rng);
    }
    if (isEmphasis && hotSet && hotSet.size > 0) {
      const hot = Array.from(hotSet);
      return rng() < HOT_SPOT_SHARE ? pickOne(hot, rng) : pickOne(ALL_SQUARES, rng);
    }
    return pickWeighted(ALL_SQUARES, loadItemStats(), rng);
  }

  function buildQuestion(i, rng) {
    const target = pickTarget(rng);
    const q = { index: i, target };

    if (drillType === 'color') {
      q.correct = squareColor(target);
      // Always Light-then-Dark, left to right -- a fixed layout so the answer is
      // never findable by "which side is the button on" and the colours below
      // (white for light, black for dark) stay meaningfully attached to a side.
      q.choices = ['light', 'dark'];
    } else if (drillType === 'diagonal') {
      const truth = rng() < 0.5;
      if (truth) {
        q.other = pickOne(diagonalMates(target), rng);
      } else {
        q.other = nearMissDecoys(target, new Set([target]), 1, rng)[0];
      }
      q.truth = truth;
    }
    // 'square' needs nothing beyond `target`.
    return q;
  }

  async function nextQuestion() {
    if (destroyed || paused) return;
    if (countCap != null && index >= countCap) { finish(); return; }

    const rng = rngFor(index);
    const q = buildQuestion(index, rng);
    current = q;
    awaiting = true;

    if (drillType === 'square') {
      q.orientation = index % 2 === 0 ? 'white' : 'black';
      board.setOrientation(q.orientation);
      board.clearHighlights();
      board.clearArrows();
      await board.setPosition(EMPTY_FEN, { animate: false });
      q.seat = applySeat(index, rng);

      dom.promptLabel.textContent = 'Tap the square';
      dom.promptMove.textContent = q.target;
      dom.answers.hidden = true;
      dom.answers.replaceChildren();
      dom.hint.hidden = false;
      dom.hint.textContent = 'Tap anywhere on the board -- speed counts.';
      armSquareTap();
    } else if (drillType === 'color') {
      dom.blindEyebrow.textContent = 'Square colour';
      dom.blindMoves.textContent = q.target;
      dom.blindHint.textContent = 'Light or dark?';
      showColorChoices(q);
    } else {
      dom.blindEyebrow.textContent = 'Same diagonal?';
      dom.blindMoves.textContent = `${q.target}  &  ${q.other}`;
      dom.blindHint.textContent = 'True or false';
      showTrueFalseChoices(q);
    }

    refreshMeta();
    startTimer();
  }

  /* ---- 'square': raw board taps --------------------------------------------- */
  function onSquareTap(sq) {
    if (destroyed || paused || !awaiting || !current || drillType !== 'square') return;
    const elapsed = performance.now() - questionStart;
    settleAnswer(sq === current.target, sq, elapsed);
  }

  function armSquareTap() {
    const raw = currentRawBoard();
    if (raw && typeof raw.setSquareTapHandler === 'function') raw.setSquareTapHandler(onSquareTap);
  }

  function disarmSquareTap() {
    const raw = currentRawBoard();
    if (raw && typeof raw.setSquareTapHandler === 'function') raw.setSquareTapHandler(null);
  }

  /* ---- 'color': light/dark buttons ------------------------------------------- */
  function showColorChoices(q) {
    dom.answers.hidden = false;
    dom.answers.replaceChildren();
    q.choices.forEach((label) => {
      // White/black, not the app's generic safe/unsafe green/red -- this question has
      // nothing to do with safety, and the colours should look like the square colours
      // they name.
      const btn = el('button', `answer ${label === 'light' ? 'answer--light-square' : 'answer--dark-square'}`, label === 'light' ? 'Light' : 'Dark');
      btn.type = 'button';
      btn.dataset.choice = label;
      btn.addEventListener('click', () => onColorAnswer(label, btn));
      dom.answers.appendChild(btn);
    });
  }

  function onColorAnswer(choice, btnEl) {
    if (destroyed || paused || !awaiting || !current) return;
    const elapsed = performance.now() - questionStart;
    const correct = choice === current.correct;
    for (const b of dom.answers.children) {
      b.disabled = true;
      if (b === btnEl) b.classList.add(correct ? 'is-correct' : 'is-wrong');
      else if (b.dataset.choice === current.correct) b.classList.add('is-correct');
      else b.classList.add('is-dimmed');
    }
    settleAnswer(correct, choice, elapsed);
  }

  /* ---- 'diagonal': true/false buttons ---------------------------------------- */
  function showTrueFalseChoices(q) {
    dom.answers.hidden = false;
    dom.answers.replaceChildren();
    [{ label: 'True', val: true, cls: 'answer--safe' }, { label: 'False', val: false, cls: 'answer--unsafe' }].forEach((o) => {
      const btn = el('button', `answer ${o.cls}`, o.label);
      btn.type = 'button';
      btn.dataset.choice = String(o.val);
      btn.addEventListener('click', () => onDiagonalAnswer(o.val, btn));
      dom.answers.appendChild(btn);
    });
  }

  function onDiagonalAnswer(choice, btnEl) {
    if (destroyed || paused || !awaiting || !current) return;
    const elapsed = performance.now() - questionStart;
    const correct = choice === current.truth;
    for (const b of dom.answers.children) {
      b.disabled = true;
      const val = b.dataset.choice === 'true';
      if (b === btnEl) b.classList.add(correct ? 'is-correct' : 'is-wrong');
      else if (val === current.truth) b.classList.add('is-correct');
      else b.classList.add('is-dimmed');
    }
    settleAnswer(correct, choice, elapsed);
  }

  /* ---- grading / feedback --------------------------------------------------- */
  function settleAnswer(correct, answer, elapsedMs) {
    if (!awaiting) return;
    awaiting = false;
    stopTimer();
    if (drillType === 'square') disarmSquareTap();

    score += correct ? 1 : 0;
    streak = correct ? streak + 1 : 0;
    bestStreak = Math.max(bestStreak, streak);
    if (correct) correctCount += 1;

    const ms = Math.round(elapsedMs);
    const historyEntry = { index: current.index, drill: drillType, target: current.target, answer, correct, ms };
    if (drillType === 'diagonal') historyEntry.other = current.other;
    if (drillType === 'square') historyEntry.orientation = current.orientation;
    history.push(historyEntry);

    // The differentiator: every answer logged per-square (see the file header) so
    // loadItemStats() can drive both the automatic weighting and the weak-squares sheet.
    if (ctx.stats && typeof ctx.stats.record === 'function') {
      // selectionMode travels with every row -- see the file header's "SCORES ARE NOT
      // COMPARABLE ACROSS SELECTION MODES" section. Per-square correctness/latency is
      // unaffected by which mode picked the square, so this is recorded identically
      // regardless of mode; it's aggregate SESSION scores (in the summary, not here)
      // that need to stay separated.
      const payload = { drill: drillType, correct, ms, square: current.target, selectionMode };
      if (drillType === 'square') {
        payload.elevation = current.seat.elevation;
        payload.yaw = current.seat.yaw;
        payload.orientation = current.orientation;
      } else if (drillType === 'diagonal') {
        payload.other = current.other;
        payload.truth = current.truth;
      }
      safeCall(() => ctx.stats.record('drill', payload));
    }

    if (drillType === 'square') {
      if (correct) {
        board.flash('success');
        board.highlight([answer], 'success');
      } else {
        board.flash('error');
        board.highlight([current.target], 'hint');
      }
    }
    safeCall(() => ui.haptic(correct ? 'success' : 'error'));
    safeCall(() => ui.sound(correct ? 'correct' : 'wrong'));

    pushHeader();
    refreshMeta();
    index += 1;

    if (advanceHandle) clearTimeout(advanceHandle);
    const delay = isTimed ? TIMED_ADVANCE_MS : (correct ? PRACTICE_CORRECT_DELAY_MS : PRACTICE_WRONG_DELAY_MS);
    advanceHandle = setTimeout(() => {
      advanceHandle = null;
      nextQuestion();
    }, delay);
  }

  /* ---- weak-squares sheet ----------------------------------------------------
     Opening it pauses both clocks (per-question, and the session countdown in
     'timed'); closing WITHOUT a change resumes them, preserving elapsed/remaining
     time exactly the way pause()/resume() does (time spent browsing the sheet is
     not charged against the player). Closing WITH a committed hot set re-rolls the
     CURRENT question index against it immediately, rather than waiting for the next
     natural advance -- the point of the sheet is to feel like an immediate switch. */
  dom.weakLink.addEventListener('click', () => {
    if (destroyed) return;
    const wasAwaiting = awaiting;
    const openedAt = performance.now();
    const sessionRemainingMs = isTimed ? Math.max(0, sessionDeadline - performance.now()) : 0;
    awaiting = false;
    stopTimer();
    if (isTimed) stopSessionTimer();
    if (drillType === 'square') disarmSquareTap();
    if (advanceHandle) { clearTimeout(advanceHandle); advanceHandle = null; }

    const { scrim, sheet } = buildWeakSquaresSheet({
      itemStats: loadItemStats(),
      currentSelection: hotSet,
      isEmphasis,
      onCommit: (newHotSet) => {
        hotSet = newHotSet.size > 0 ? newHotSet : null;
        if (isTimed) {
          sessionDeadline = performance.now() + sessionRemainingMs;
          sessionTimerHandle = setInterval(tickSessionTimer, 200);
          tickSessionTimer();
        }
        nextQuestion();
      },
      onCancel: () => {
        if (isTimed) {
          sessionDeadline = performance.now() + sessionRemainingMs;
          sessionTimerHandle = setInterval(tickSessionTimer, 200);
          tickSessionTimer();
        }
        if (!wasAwaiting) return;
        awaiting = true;
        questionStart += performance.now() - openedAt;
        dom.metaTimer.textContent = `${((performance.now() - questionStart) / 1000).toFixed(1)}s`;
        timerHandle = setInterval(tickTimerDisplay, 100);
        if (drillType === 'square') armSquareTap();
      },
    });
    root.append(scrim, sheet);
  });

  /* ---- finishing ------------------------------------------------------------ */
  function cleanupTimers() {
    stopTimer();
    stopSessionTimer();
    if (advanceHandle) { clearTimeout(advanceHandle); advanceHandle = null; }
  }

  function finish() {
    cleanupTimers();
    if (drillType === 'square') disarmSquareTap();
    const attempted = history.length;
    const accuracy = attempted ? Math.round((correctCount / attempted) * 100) : 0;
    ctx.onFinish({
      score,
      history,
      headline: `${correctCount}/${attempted} correct (${accuracy}%) · best streak ${bestStreak}`,
      // Extras beyond the documented ModeSummary shape -- see INTEGRATION NOTE 5. `drill`
      // and `selectionMode` are what a composite best-score key needs beyond mode+variant;
      // `trackBest: false` for 'emphasis' says "show this result, never persist/compare
      // it as a best" -- the hot set is player-chosen and usually different every
      // session, so there is nothing stable on the other side of that comparison.
      drill: drillType,
      variant,
      selectionMode,
      trackBest: !isEmphasis,
    });
  }

  dom.endBtn.addEventListener('click', () => {
    if (history.length === 0) { finish(); return; }
    if (typeof ui.confirm === 'function') {
      Promise.resolve(ui.confirm({
        title: 'End this session?',
        text: `You have answered ${history.length} question${history.length === 1 ? '' : 's'}.`,
        confirmLabel: 'End session',
        cancelLabel: 'Keep going',
        danger: false,
      })).then((ok) => { if (ok) finish(); }).catch(() => {});
    } else {
      finish();
    }
  });

  /* ---- ModeHandle ------------------------------------------------------------ */
  if (isTimed) startSessionTimer();
  pushHeader();
  nextQuestion();

  return {
    destroy() {
      destroyed = true;
      cleanupTimers();
      if (usesBoard) {
        disarmSquareTap();
        safeCall(() => board.clearHighlights());
        safeCall(() => board.clearArrows());
      }
      // Nothing to reparent: app.js's destroyHost() runs this, then clears `root`, then
      // unconditionally calls `board.destroy()` (which tears down and, on the next play
      // session, recreates the underlying renderer from scratch) -- the board is never
      // handed live from one mode to the next, so there's no "give it back" step here.
    },
    pause() {
      paused = true;
      pausedAt = awaiting ? performance.now() : 0;
      if (isTimed) sessionPausedAt = performance.now();
      stopTimer();
      stopSessionTimer();
      if (advanceHandle) { clearTimeout(advanceHandle); advanceHandle = null; }
    },
    resume() {
      if (destroyed) return;
      paused = false;
      if (isTimed && sessionPausedAt) {
        sessionDeadline += performance.now() - sessionPausedAt;
        sessionPausedAt = 0;
        sessionTimerHandle = setInterval(tickSessionTimer, 200);
        tickSessionTimer();
      }
      if (awaiting) {
        if (pausedAt) { questionStart += performance.now() - pausedAt; pausedAt = 0; }
        timerHandle = setInterval(tickTimerDisplay, 100);
        if (drillType === 'square') armSquareTap();
        return;
      }
      nextQuestion();
    },
    restart() {
      cleanupTimers();
      if (drillType === 'square') disarmSquareTap();
      index = 0; score = 0; streak = 0; bestStreak = 0; correctCount = 0;
      history.length = 0;
      awaiting = false; current = null;
      if (isTimed) startSessionTimer();
      pushHeader();
      nextQuestion();
    },
    // Not part of the ModeHandle contract; a read-only peephole for test harnesses
    // (mirrors the convention already used by modes/blunderrush.js's `.debug`).
    get debug() {
      return {
        drillType, variant, selectionMode, index, score, streak, bestStreak, correctCount,
        awaiting, current, hotSet: hotSet ? Array.from(hotSet).sort() : null,
        timeRemaining: isTimed ? Math.max(0, (sessionDeadline - performance.now()) / 1000) : null,
      };
    },
  };
}
