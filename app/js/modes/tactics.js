/**
 * tactics.js -- classic tactics solving, rated Chesstempo-style, with two framings.
 *
 * OFFENSIVE (default): the board is set to the puzzle position (quiet pre-moves `p` + the
 * blunder `m[0]`, played from `f`), oriented per ctx.config.perspective. The solver plays the
 * winning line by moving pieces on the board; opponent replies auto-play from `m`.
 *
 * DEFENSIVE (ctx.config.framing === 'defensive'): the board is set to f + p, BEFORE `m[0]`.
 * The side to move is the side about to blunder, and the user sits there. `m[0]` is presented
 * as the move "under consideration" (notation, plus a board highlight unless
 * ctx.settings.promptStyle is 'notation') -- but it is never actually played on the board.
 * The user must prove it loses by tapping the refutation `m[1]`'s from- then to-square, on a
 * board that still shows the PRE-blunder position (so the piece being moved may not even be
 * where they're tapping it from -- that's why this uses the board's raw onSquareTap primitive,
 * not the piece-aware onMove one). Only on a correct guess do `m[0]` and their `m[1]` actually
 * get played and animated; a wrong guess reveals the real line from `m[0]` onward.
 *
 * Both framings feed the same shared Glicko rating (app/js/rating.js, via ctx.rating) and
 * stats log (ctx.stats) -- exactly one recorded result per puzzle, scored on the FIRST
 * attempt only (1 clean, 0.5 with a hint, 0 for anything else), because re-scoring after a
 * retry would let the user farm rating and defeat the whole point of measuring it.
 *
 * Board-driving note: board2d.js optimistically moves the dragged piece itself whenever
 * onMove() is asked, then snaps it back if the callback resolves false; board3d.js does
 * nothing automatically at all -- moving pieces is entirely the caller's job either way.
 * Because of that asymmetry (and because promotion/castling/en-passant need the `fen`
 * reconciliation only animateMove()/setPosition() can do), onMove() here NEVER lets the
 * renderer's own optimistic path decide anything: it always returns false, and every
 * visible change -- correct, wrong, or auto-played -- goes through an explicit
 * animateMove()/setPosition() call this module makes itself. Returning false after that
 * is safe on both renderers: board2d's snap-back finds the dragged piece already gone
 * from its origin square (a no-op), and board3d never acted on the return value anyway.
 * Defensive framing never touches onMove at all -- it drives entirely off onSquareTap/
 * setSquareTapHandler, which board-interface.js documents as firing for ANY square
 * regardless of contents and independent of `interactive`, precisely so a mode can ask
 * about a square that (on the still-frozen board) doesn't hold the piece in question.
 */

import { Chess } from '../../vendor/chess.min.js';
import { seedFor } from '../mode-interface.js';

export const meta = {
  id: 'tactics',
  title: 'Tactics',
  blurb: 'Classic puzzle solving -- find the winning move, then the line that follows it.',
};

// Minimal local copy of the design system's icon sprite (see app/test/design.html),
// scoped to the handful of glyphs this mode uses. Duplicate <symbol> ids are harmless
// if the shell also injects the full sprite elsewhere in the document.
const ICON_SPRITE = `
<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
  <defs>
    <symbol id="i-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5l5 5 10-11"/></symbol>
    <symbol id="i-x" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></symbol>
    <symbol id="i-info" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.5h.01"/></symbol>
    <symbol id="i-target" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/></symbol>
    <symbol id="i-bolt" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L4 14h6l-1 8 9-12h-6z"/></symbol>
    <symbol id="i-puzzle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4h6v3a2 2 0 104 0h1v6h-3a2 2 0 100 4h3v3H9v-3a2 2 0 10-4 0H4v-6h3a2 2 0 100-4H4V7h5z"/></symbol>
  </defs>
</svg>`;

const TEMPLATE = `
  <header class="app-bar">
    <span data-shell="restart-slot"></span>
    <div class="readouts" data-shell="header"></div>
    <span data-shell="settings-slot"></span>
  </header>

  <div class="stage">
    <div class="prompt">
      <span class="prompt__side" data-el="side" data-side="white"></span>
      <span class="prompt__label" data-el="promptLabel">Loading&hellip;</span>
      <span class="prompt__move" data-el="promptMove" hidden></span>
    </div>
    <div class="board-area">
      <div class="board-frame" data-el="frame">
        <div class="board-slot" data-el="slot"></div>
      </div>
    </div>
    <div class="stage__meta">
      <span data-el="ratingMeta"><svg><use href="#i-target"/></svg> Rating <span class="u-num" data-el="rating">&ndash;</span></span>
      <span class="stage__meta-sep"></span>
      <span class="stage__meta-streak"><svg><use href="#i-bolt"/></svg> <span data-el="streakText">0</span> in a row</span>
    </div>
  </div>

  <div class="action-bar">
    <div class="action-bar__inner" style="display:grid; gap:var(--space-2);">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-2);">
        <button class="btn btn--secondary" data-action="hint">Hint</button>
        <button class="btn btn--secondary" data-action="solution">Show solution</button>
      </div>
      <button class="btn btn--primary btn--lg btn--block" data-action="next" hidden>Next puzzle</button>
      <button class="btn btn--ghost btn--block" data-action="end">End session</button>
    </div>
  </div>
`;

// The header's readout content, handed to ctx.ui.setHeader() as a DocumentFragment rather
// than built inline in TEMPLATE: setHeader's own {score,time,strikes} shape has no room for
// a Chesstempo-style rating readout or a streak, so this mode owns its header content and
// asks the shell to install it into the `[data-shell="header"]` slot adoptChrome() already
// wired up. Once installed, updates go straight through DOM refs, not repeated setHeader calls.
function buildReadoutsFragment() {
  const tmp = document.createElement('div');
  tmp.innerHTML = `
    <div class="readout">
      <span class="readout__label">Rating</span>
      <span class="readout__value u-num" data-el="userRating">&ndash;</span>
      <span class="badge badge--accent" data-el="userRatingDelta" hidden style="margin-left:4px"></span>
    </div>
    <div class="readout readout--score"><span class="readout__label">Score</span><span class="readout__value u-num" data-el="score">0</span></div>
    <div class="readout"><span class="readout__label">Streak</span><span class="readout__value u-num" data-el="streak">0</span></div>
    <div class="readout" data-el="timerReadout" hidden>
      <span class="readout__label">Time</span><span class="readout__value u-num" data-el="timer">0:00</span>
    </div>
    <div class="readout" data-el="strikesReadout" hidden>
      <span class="readout__label">Strikes</span>
      <span class="strikes" data-el="strikes"></span>
    </div>`;
  const frag = document.createDocumentFragment();
  while (tmp.firstChild) frag.appendChild(tmp.firstChild);
  return frag;
}

function parseUci(uci) {
  if (typeof uci !== 'string' || uci.length < 4) return null;
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.length >= 5 ? uci[4].toLowerCase() : undefined;
  return { from, to, promotion };
}

function guessPromotion(expectedUci, from, to) {
  if (typeof expectedUci === 'string' && expectedUci.length >= 5 && expectedUci.slice(0, 4) === from + to) {
    return expectedUci[4].toLowerCase();
  }
  return 'q';
}

const opposite = (side) => (side === 'white' ? 'black' : 'white');

/** 1-based ply number of a FEN, for deep-linking a lichess game to the right move. Mirrors
 * blunderrush.js's identical helper. */
function plyFromFen(fen) {
  const parts = String(fen).split(' ');
  const full = parseInt(parts[5], 10);
  if (!Number.isFinite(full)) return null;
  return (full - 1) * 2 + (parts[1] === 'b' ? 1 : 0);
}

function deepLink(url, fen) {
  if (!url) return '';
  const base = String(url).split('#')[0];
  const ply = plyFromFen(fen);
  return ply == null ? base : `${base}#${ply + 1}`;
}

export function createMode(ctx) {
  const root = ctx.root;
  const variant = (ctx.config && ctx.config.variant) || 'practice';
  const framing = (ctx.config && ctx.config.framing) === 'defensive' ? 'defensive' : 'offensive';
  const perspective = (ctx.config && ctx.config.perspective) === 'opponent' ? 'opponent' : 'own';
  const promptStyle = (ctx.settings && ctx.settings.promptStyle) === 'notation' ? 'notation' : 'highlight';
  const totalStrikes = (ctx.config && ctx.config.strikes) || 3;
  const totalSeconds = (ctx.config && ctx.config.seconds) || 180;

  // No wrapping element around TEMPLATE's pieces: ctx.root is handed to a mode as an
  // empty `.screen screen--play` (the fixed 3-row auto/1fr/auto grid from app.css), and
  // the shell's own chrome-adoption step looks for an existing `.app-bar` / `.stage` /
  // `.action-bar` as ctx.root's direct children -- an extra wrapper here would either
  // break that 3-row mapping or hide the pieces it's looking for. The <header
  // class="app-bar"> below includes the exact `[data-shell="restart-slot"]` /
  // `[data-shell="settings-slot"]` placeholders the shell's own fallback header uses, so
  // it adopts ours (injecting its corner buttons into the empty spans) instead of
  // prepending a duplicate bar. The icon sprite is absolutely positioned (and any
  // <style> tag is display:none), so neither consumes a grid row either.
  root.innerHTML = ICON_SPRITE + TEMPLATE;
  const wrap = root;
  const qs = (sel) => wrap.querySelector(sel);

  if (ctx.ui && typeof ctx.ui.setHeader === 'function') {
    ctx.ui.setHeader(buildReadoutsFragment());
  } else {
    const slot = qs('[data-shell="header"]');
    if (slot) slot.appendChild(buildReadoutsFragment());
  }

  const els = {
    userRating: qs('[data-el="userRating"]'),
    userRatingDelta: qs('[data-el="userRatingDelta"]'),
    score: qs('[data-el="score"]'),
    streak: qs('[data-el="streak"]'),
    streakText: qs('[data-el="streakText"]'),
    timerReadout: qs('[data-el="timerReadout"]'),
    timer: qs('[data-el="timer"]'),
    strikesReadout: qs('[data-el="strikesReadout"]'),
    strikes: qs('[data-el="strikes"]'),
    side: qs('[data-el="side"]'),
    promptLabel: qs('[data-el="promptLabel"]'),
    promptMove: qs('[data-el="promptMove"]'),
    frame: qs('[data-el="frame"]'),
    slot: qs('[data-el="slot"]'),
    ratingMeta: qs('[data-el="ratingMeta"]'),
    rating: qs('[data-el="rating"]'),
    hintBtn: qs('[data-action="hint"]'),
    solutionBtn: qs('[data-action="solution"]'),
    nextBtn: qs('[data-action="next"]'),
    endBtn: qs('[data-action="end"]'),
  };

  els.slot.appendChild(ctx.boardEl);
  if (typeof ctx.board.setInteractive === 'function') ctx.board.setInteractive(false);

  for (let i = 0; i < totalStrikes; i++) {
    const pip = document.createElement('span');
    pip.className = 'strikes__pip';
    els.strikes.appendChild(pip);
  }
  if (els.timerReadout) els.timerReadout.hidden = variant !== 'timed';
  if (els.strikesReadout) els.strikesReadout.hidden = variant !== 'survival';

  const state = {
    score: 0,
    streak: 0,
    bestStreak: 0,
    strikesSpent: 0,
    history: [],
    puzzle: null,
    chess: null,
    puzzlePositionFen: null,
    orientation: null,
    solutionIdx: 0,
    selectedFrom: null,
    hintUsed: false,
    ratingRecorded: false,
    puzzleStartedAt: 0,
    locked: true,
    resolved: null,
    destroyed: false,
    finished: false,
    // Bumped by every loadNext() call. A wrong/skipped answer's solution reveal plays out
    // move-by-move over a couple of seconds in the background (see revealRemainingSolution)
    // -- capturing this at the start of a reveal and checking it before each mutation lets
    // "Next puzzle" (shown immediately, not after the reveal finishes -- see below) jump to a
    // new puzzle without a still-running reveal corrupting it with a stray move afterward.
    puzzleGen: 0,
  };

  const timers = new Set();
  function later(ms) {
    return new Promise((resolve) => {
      const id = setTimeout(() => { timers.delete(id); resolve(); }, ms);
      timers.add(id);
    });
  }
  function clearTimers() {
    for (const id of timers) clearTimeout(id);
    timers.clear();
  }

  let verdictEl = null;
  function clearVerdict() {
    if (verdictEl) { verdictEl.remove(); verdictEl = null; }
  }
  function showVerdict(kind, text, delta) {
    clearVerdict();
    const stage = qs('.stage');
    const el = document.createElement('div');
    el.className = `verdict verdict--${kind}`;
    const icon = kind === 'correct' ? 'i-check' : kind === 'wrong' ? 'i-x' : 'i-info';
    el.innerHTML = `<svg><use href="#${icon}"/></svg> ${text}` +
      (delta ? `<span class="verdict__delta u-num">${delta}</span>` : '');
    stage.appendChild(el);
    verdictEl = el;
  }

  function markFrame(kind) {
    els.frame.classList.remove('is-correct', 'is-wrong');
    // eslint-disable-next-line no-unused-expressions
    els.frame.offsetHeight;
    els.frame.classList.add(kind === 'correct' ? 'is-correct' : 'is-wrong');
  }

  // Drag interactivity only ever applies to offensive framing (it drives onMove). Defensive
  // framing is driven by onSquareTap, which the contract says works independent of
  // `interactive` -- so it is left permanently off, and `state.locked` alone gates it.
  function setDragInteractive(value) {
    if (framing === 'offensive' && typeof ctx.board.setInteractive === 'function') {
      ctx.board.setInteractive(value);
    }
  }
  function lock() { state.locked = true; setDragInteractive(false); }
  function unlock() { state.locked = false; setDragInteractive(true); }

  function updateReadouts() {
    els.score.textContent = String(state.score);
    els.streak.textContent = String(state.streak);
    els.streakText.textContent = String(state.streak);
    const pips = els.strikes.querySelectorAll('.strikes__pip');
    pips.forEach((pip, i) => pip.classList.toggle('is-spent', i < state.strikesSpent));
  }

  function showRatingDelta(delta) {
    if (!els.userRatingDelta || !Number.isFinite(delta)) return;
    const sign = delta > 0 ? '+' : '';
    els.userRatingDelta.textContent = `${sign}${delta}`;
    els.userRatingDelta.hidden = false;
    later(2200).then(() => { if (!state.destroyed) els.userRatingDelta.hidden = true; });
  }

  /**
   * Exactly one rated + stats result per puzzle, on the first attempt: 1 for a clean solve,
   * 0.5 if a hint was used along the way, 0 for anything else (wrong, revealed, or skipped).
   * Guarded by state.ratingRecorded so a later retry can never re-score a puzzle already
   * attempted -- that would let the measurement drift upward and become meaningless.
   */
  function finalizeRating(kind) {
    if (state.ratingRecorded || !state.puzzle) return;
    state.ratingRecorded = true;
    const s = kind === 'correct' ? (state.hintUsed ? 0.5 : 1) : 0;

    if (ctx.rating && typeof ctx.rating.record === 'function') {
      let before = null;
      try { before = typeof ctx.rating.get === 'function' ? ctx.rating.get() : null; } catch { before = null; }
      const next = ctx.rating.record(state.puzzle.r, s);
      if (next && Number.isFinite(next.r)) {
        if (els.userRating) els.userRating.textContent = String(Math.round(next.r));
        if (before && Number.isFinite(before.r)) showRatingDelta(Math.round(next.r - before.r));
      }
    }
    if (ctx.stats && typeof ctx.stats.record === 'function') {
      ctx.stats.record('tactics', {
        id: state.puzzle.i,
        rating: state.puzzle.r,
        correct: kind === 'correct',
        ms: Date.now() - state.puzzleStartedAt,
        hinted: state.hintUsed,
        framing,
      });
    }
  }

  /**
   * The shell's review player payload (see app.js's REVIEW PLAYER doc comment and
   * mode-interface.js's ModeSummary). `state.puzzlePositionFen` is already the position the
   * user was actually being tested on -- computed once in loadNext(), per framing:
   *
   *   offensive: m[0] (the blunder) already played, so the fen sits right before m[1], and
   *              the remaining moves are the solution alone -- m.slice(1).
   *   defensive: m[0] is still unplayed (the board stays frozen pre-blunder the whole time),
   *              so the fen sits right before m[0], and the remaining moves are the FULL
   *              line -- m[0] the blunder, then the solution.
   *
   * Either way "the position review opens on" and "one entry per ply from there" fall
   * straight out of what setupPuzzle()/loadNext() already computed; nothing new to derive.
   * Tagging the actual blunder ply 'blunder' (defensive only -- offensive never lists it,
   * it's baked into `fen`) rather than lumping it in as 'solution' costs nothing (tag is
   * documented as purely descriptive) and makes the review player's per-ply caption
   * ("The blunder" vs "Solution") tell the truth.
   */
  function buildReview() {
    const puzzle = state.puzzle;
    if (!puzzle || typeof state.puzzlePositionFen !== 'string' || !Array.isArray(puzzle.m)) return undefined;
    const moves = (framing === 'defensive' ? puzzle.m : puzzle.m.slice(1))
      .map((uci, idx) => ({
        uci: String(uci).toLowerCase(),
        tag: framing === 'defensive' && idx === 0 ? 'blunder' : 'solution',
      }));
    return {
      fen: state.puzzlePositionFen,
      moves,
      focusPly: 0,
      orientation: state.orientation || undefined,
    };
  }

  function recordHistory(result, extra) {
    state.history.push(Object.assign({
      id: state.puzzle ? state.puzzle.i : null,
      rating: state.puzzle ? state.puzzle.r : null,
      result,
      framing,
      // Deep-linked to the puzzle position itself (the move under test), not the game's
      // start -- see deepLink()/plyFromFen() above, mirroring blunderrush.js's identical
      // pattern. puzzle.u is the plain lichess game URL; '' (not undefined) when absent, so
      // the shell's renderSummary() can cheaply check truthiness the same way it does for
      // Blunder Rush's entries.
      url: state.puzzle ? deepLink(state.puzzle.u, state.puzzlePositionFen) : '',
      review: buildReview(),
      at: Date.now(),
    }, extra || {}));
  }

  function buildSummary(headline) {
    return {
      score: state.score,
      best: state.bestStreak,
      history: state.history,
      headline: headline || `${state.score} solved — best streak ${state.bestStreak}`,
    };
  }

  function finish(headline) {
    if (state.finished) return;
    state.finished = true;
    lock();
    stopTimer();
    ctx.onFinish(buildSummary(headline));
  }

  // ---- timed / survival bookkeeping --------------------------------------
  let secondsLeft = totalSeconds;
  let timerHandle = null;
  function formatTime(s) {
    const m = Math.max(0, Math.floor(s / 60));
    const r = Math.max(0, s % 60);
    return `${m}:${String(r).padStart(2, '0')}`;
  }
  function tickTimer() {
    secondsLeft -= 1;
    els.timer.textContent = formatTime(secondsLeft);
    els.timerReadout.classList.toggle('is-warning', secondsLeft <= 60 && secondsLeft > 15);
    els.timerReadout.classList.toggle('is-critical', secondsLeft <= 15);
    if (secondsLeft <= 0) finish('Time’s up');
  }
  function startTimer() {
    if (variant !== 'timed') return;
    els.timer.textContent = formatTime(secondsLeft);
    timerHandle = setInterval(tickTimer, 1000);
  }
  function stopTimer() {
    if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
  }
  function spendStrike() {
    if (variant !== 'survival') return;
    state.strikesSpent += 1;
    updateReadouts();
    if (state.strikesSpent >= totalStrikes) finish('Out of strikes');
  }

  // ---- puzzle selection -----------------------------------------------
  // Rated play (the default) draws from ctx.rating.nextTarget(), which is what makes the
  // Glicko estimate converge; a fixed ctx.config.band is honoured ONLY when the caller set
  // one explicitly (practice at a level), never as a silent substitute for the adaptive draw.
  function pickOpts() {
    if (ctx.config && ctx.config.band != null) return { rating: ctx.config.band, spread: 150 };
    if (ctx.rating && typeof ctx.rating.nextTarget === 'function') {
      try { return ctx.rating.nextTarget(); } catch { /* fall through */ }
    }
    return { rating: 1200, spread: 150 };
  }

  // ---- puzzle setup -------------------------------------------------------
  // Always builds the chess instance up to f + p (BEFORE the blunder) and merely validates
  // (via move+undo) that m[0] is legal from there -- offensive framing then plays m[0] for
  // real immediately after; defensive framing leaves it unplayed until the user proves the
  // refutation. Either way this is the single source of truth for "is this puzzle usable".
  function setupPuzzle(puzzle) {
    if (!puzzle || typeof puzzle.f !== 'string') return null;
    let chess;
    try { chess = new Chess(puzzle.f); } catch { return null; }
    if (!chess || typeof chess.turn !== 'function') return null;

    for (const san of puzzle.p || []) {
      const mv = chess.move(san, { sloppy: true });
      if (!mv) return null;
    }
    if (!Array.isArray(puzzle.m) || puzzle.m.length < 2) return null; // need blunder + >=1 solution ply
    const blunder = parseUci(puzzle.m[0]);
    if (!blunder) return null;
    const test = chess.move({ from: blunder.from, to: blunder.to, promotion: blunder.promotion || 'q' }, { sloppy: true });
    if (!test) return null;
    chess.undo();
    return { chess };
  }

  async function playAutoMove(uci, myGen) {
    const parsed = parseUci(uci);
    if (!parsed) return false;
    // Checked synchronously, right before the mutation -- a stale reveal (the player already
    // moved on to a new puzzle) must never call .move() on the NEW puzzle's chess instance.
    if (myGen != null && myGen !== state.puzzleGen) return false;
    const mv = state.chess.move({ from: parsed.from, to: parsed.to, promotion: parsed.promotion || 'q' });
    if (!mv) return false;
    if (state.destroyed) return true;
    await ctx.board.animateMove(parsed.from, parsed.to, { fen: state.chess.fen() });
    return true;
  }

  async function revealRemainingSolution(fromIdx) {
    const myGen = state.puzzleGen;
    lock();
    ctx.board.clearHighlights();
    let idx = fromIdx != null ? fromIdx : state.solutionIdx;
    await later(500);
    while (idx < state.puzzle.m.length && !state.destroyed && state.puzzleGen === myGen) {
      const uci = state.puzzle.m[idx];
      const ok = await playAutoMove(uci, myGen);
      if (!ok) break;
      idx += 1;
      state.solutionIdx = idx;
      await later(550);
    }
  }

  function resolveCorrect() {
    state.resolved = 'correct';
    state.score += 1;
    state.streak += 1;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    updateReadouts();
    markFrame('correct');
    showVerdict('correct', 'Solved', '+1');
    recordHistory('correct');
    finalizeRating('correct');
    lock();
    els.nextBtn.hidden = false;
  }

  function handleWrong(sanAttempted) {
    state.resolved = 'wrong';
    state.streak = 0;
    updateReadouts();
    markFrame('wrong');
    showVerdict('wrong', 'Not the move — watch the line');
    recordHistory('wrong', { attempted: sanAttempted || null });
    if (ctx.ui && ctx.ui.haptic) ctx.ui.haptic('error');
    if (ctx.ui && ctx.ui.sound) ctx.ui.sound('error');
    ctx.board.flash('error');
    spendStrike();
    finalizeRating('wrong');
    // "Next puzzle" is available right away -- the multi-second move-by-move reveal below
    // is for whoever wants to watch the refutation, not a gate before moving on. See
    // revealRemainingSolution's puzzleGen guard for how it stays safe if the player leaves
    // mid-reveal.
    els.nextBtn.hidden = false;
    // Defensive framing never actually played m[0] on the board, so the reveal has to
    // start there too, not at m[1] -- otherwise the "line" would skip the blunder itself.
    revealRemainingSolution(framing === 'defensive' ? 0 : state.solutionIdx);
  }

  async function afterCorrectPly() {
    if (state.solutionIdx >= state.puzzle.m.length) { resolveCorrect(); return; }
    lock();
    await later(450);
    if (state.destroyed || state.resolved) return;
    const oppUci = state.puzzle.m[state.solutionIdx];
    const ok = await playAutoMove(oppUci);
    if (state.destroyed) return;
    if (!ok) { resolveCorrect(); return; }
    state.solutionIdx += 1;
    if (state.solutionIdx >= state.puzzle.m.length) { resolveCorrect(); return; }
    unlock();
  }

  // ---- offensive framing: live piece-drag onMove ---------------------------
  async function onBoardMove(from, to) {
    if (framing !== 'offensive' || state.locked || !state.puzzle || state.resolved) return false;
    const expectedUci = state.puzzle.m[state.solutionIdx];
    const promo = guessPromotion(expectedUci, from, to);
    const mv = state.chess.move({ from, to, promotion: promo });
    if (!mv) {
      ctx.board.flash('error');
      return false;
    }
    const playedUci = from + to + (mv.promotion || '');
    if (playedUci !== expectedUci) {
      state.chess.undo();
      handleWrong(mv.san);
      return false;
    }
    // Correct ply.
    state.solutionIdx += 1;
    ctx.board.clearHighlights();
    await ctx.board.animateMove(from, to, { fen: state.chess.fen() });
    if (state.destroyed) return false;
    markFrame('correct');
    ctx.board.flash('success');
    if (ctx.ui && ctx.ui.haptic) ctx.ui.haptic('success');
    if (ctx.ui && ctx.ui.sound) ctx.ui.sound('success');
    await afterCorrectPly();
    return false; // always -- see file header for why
  }

  /**
   * One ordinary solution ply at `state.solutionIdx`, entered by tapping two squares.
   * The tap-driven twin of onBoardMove's body — defensive framing needs it for every ply
   * after the refutation, since it never receives onMove callbacks.
   */
  async function attemptSolutionPly(from, to) {
    const expectedUci = state.puzzle.m[state.solutionIdx];
    if (!expectedUci) { resolveCorrect(); return; }
    const promo = guessPromotion(expectedUci, from, to);
    const mv = state.chess.move({ from, to, promotion: promo });
    if (!mv) {
      ctx.board.flash('error');
      unlock();
      return;
    }
    const playedUci = from + to + (mv.promotion || '');
    if (playedUci !== expectedUci) {
      state.chess.undo();
      handleWrong(mv.san);
      return;
    }
    state.solutionIdx += 1;
    ctx.board.clearHighlights();
    await ctx.board.animateMove(from, to, { fen: state.chess.fen() });
    if (state.destroyed) return;
    markFrame('correct');
    ctx.board.flash('success');
    if (ctx.ui && ctx.ui.haptic) ctx.ui.haptic('success');
    if (ctx.ui && ctx.ui.sound) ctx.ui.sound('success');
    await afterCorrectPly();
  }

  // ---- defensive framing: raw two-tap onSquareTap, board never moves until proven ---------
  function onSquareTapDefensive(sq) {
    if (framing !== 'defensive' || state.locked || !state.puzzle || state.resolved) return;
    if (state.selectedFrom === sq) {
      state.selectedFrom = null;
      ctx.board.clearHighlights('select');
      return;
    }
    if (state.selectedFrom == null) {
      state.selectedFrom = sq;
      // Echoes the user's own tap back at them; it reveals nothing about the puzzle they
      // didn't already choose themselves, so it's fine under promptStyle:'notation' too.
      ctx.board.highlight([sq], 'select');
      return;
    }
    const from = state.selectedFrom;
    const to = sq;
    state.selectedFrom = null;
    ctx.board.clearHighlights('select');
    attemptDefensive(from, to);
  }

  async function attemptDefensive(from, to) {
    lock();

    // Only the FIRST attempt is the special defensive case (prove the blunder by producing
    // the refutation). Once m[0] and m[1] are on the board, every later ply is an ordinary
    // solution move and must be handled as one.
    //
    // This is the bug the user hit as "lets me do first move but then subsequent moves don't
    // work": the code below unconditionally replays m[0], which is illegal once it has
    // already been played, so `m0move` came back null and the handler returned silently --
    // no feedback, no move, nothing. Offensive framing never hit it because it routes
    // through onBoardMove, which is index-driven; defensive framing uses the tap handler for
    // every ply and had no equivalent path.
    if (state.solutionIdx >= 2) {
      await attemptSolutionPly(from, to);
      return;
    }

    const expectedM1 = state.puzzle.m[1];
    const promo = guessPromotion(expectedM1, from, to);
    const blunder = parseUci(state.puzzle.m[0]);
    const m0move = state.chess.move({ from: blunder.from, to: blunder.to, promotion: blunder.promotion || 'q' });
    if (!m0move) { unlock(); return; } // validated at setup time; defensive guard only
    const fenAfterM0 = state.chess.fen();
    const m1move = state.chess.move({ from, to, promotion: promo });
    const playedUci = m1move ? from + to + (m1move.promotion || '') : null;

    if (m1move && playedUci === expectedM1) {
      const fenAfterM1 = state.chess.fen();
      state.solutionIdx = 2;
      await ctx.board.animateMove(blunder.from, blunder.to, { fen: fenAfterM0 });
      if (state.destroyed) return;
      await later(300);
      await ctx.board.animateMove(from, to, { fen: fenAfterM1 });
      if (state.destroyed) return;
      markFrame('correct');
      ctx.board.flash('success');
      if (ctx.ui && ctx.ui.haptic) ctx.ui.haptic('success');
      if (ctx.ui && ctx.ui.sound) ctx.ui.sound('success');
      await afterCorrectPly();
    } else {
      if (m1move) state.chess.undo();
      state.chess.undo(); // undo m[0] too -- back to the pre-blunder position we display
      handleWrong(m1move ? m1move.san : null);
    }
  }

  function showLoading() {
    els.promptLabel.textContent = 'Finding a puzzle…';
    els.rating.textContent = '–';
    if (!wrap.querySelector('[data-el="loadingSpinner"]')) {
      const spinner = document.createElement('div');
      spinner.className = 'spinner';
      spinner.dataset.el = 'loadingSpinner';
      spinner.style.position = 'absolute';
      spinner.style.top = '50%';
      spinner.style.left = '50%';
      spinner.style.transform = 'translate(-50%, -50%)';
      spinner.style.zIndex = '5';
      els.frame.appendChild(spinner);
    }
  }
  function hideLoading() {
    const spinner = wrap.querySelector('[data-el="loadingSpinner"]');
    if (spinner) spinner.remove();
  }

  function showEmpty() {
    hideLoading();
    els.promptLabel.textContent = 'No puzzle available';
    wrap.querySelector('.stage').insertAdjacentHTML('beforeend', `
      <div class="empty" data-el="emptyState">
        <svg><use href="#i-puzzle"/></svg>
        <p>Couldn’t load a puzzle for this rating band. Check your connection and try again.</p>
      </div>`);
    const retry = document.createElement('button');
    retry.className = 'btn btn--secondary';
    retry.textContent = 'Retry';
    retry.addEventListener('click', () => { loadNext(); });
    wrap.querySelector('[data-el="emptyState"]').appendChild(retry);
  }

  function clearEmpty() {
    const el = wrap.querySelector('[data-el="emptyState"]');
    if (el) el.remove();
  }

  async function loadNext(retries = 0) {
    if (state.destroyed || state.finished) return;
    // Invalidate any solution reveal still animating in the background (see
    // revealRemainingSolution/playAutoMove) so it can never call .move() against the puzzle
    // this call is about to set up.
    state.puzzleGen += 1;
    lock();
    clearVerdict();
    clearEmpty();
    els.frame.classList.remove('is-correct', 'is-wrong');
    els.nextBtn.hidden = true;
    els.promptMove.hidden = true;
    ctx.board.clearHighlights();
    ctx.board.clearArrows();
    showLoading();

    if (retries > 8) { showEmpty(); return; }

    let puzzle;
    try {
      puzzle = await ctx.data.pick(pickOpts());
    } catch {
      puzzle = null;
    }
    if (state.destroyed) return;
    if (!puzzle) { showEmpty(); return; }

    const setup = setupPuzzle(puzzle);
    if (!setup) { loadNext(retries + 1); return; }

    state.puzzle = puzzle;
    state.chess = setup.chess; // sitting at f + p, BEFORE m[0]
    state.selectedFrom = null;
    state.hintUsed = false;
    state.ratingRecorded = false;
    state.puzzleStartedAt = Date.now();
    state.resolved = null;

    let m0san = null;
    let preBlunderFen = null;
    let blunderMove = null;
    if (framing === 'offensive') {
      preBlunderFen = state.chess.fen(); // f + p, before the opponent's setup move
      blunderMove = parseUci(puzzle.m[0]);
      const played = state.chess.move({ from: blunderMove.from, to: blunderMove.to, promotion: blunderMove.promotion || 'q' });
      if (!played) { loadNext(retries + 1); return; } // defensive guard; setupPuzzle already validated this
      state.solutionIdx = 1;
      // The puzzle position -- what the user is actually being tested on -- for the deep
      // link: offensive framing shows it directly, so it's simply where state.chess sits now.
      state.puzzlePositionFen = state.chess.fen();
    } else {
      // Defensive: m[0] stays unplayed. Compute its SAN on a throwaway clone so the prompt
      // can name it without disturbing state.chess (which must stay at the pre-blunder fen).
      state.solutionIdx = 0;
      const blunder = parseUci(puzzle.m[0]);
      try {
        const scratch = new Chess(state.chess.fen());
        const mv = scratch.move({ from: blunder.from, to: blunder.to, promotion: blunder.promotion || 'q' });
        m0san = mv ? mv.san : null;
      } catch { m0san = null; }
      // Defensive framing shows the PRE-blunder position -- that's what's on screen and
      // what "the move under consideration" refers to, so that's what the deep link should
      // point at too (not the post-m[0] position, which the user never actually sees here).
      state.puzzlePositionFen = state.chess.fen();
    }

    const sideToMove = state.chess.turn() === 'w' ? 'white' : 'black';
    const orientation = perspective === 'opponent' ? opposite(sideToMove) : sideToMove;
    state.orientation = orientation;
    ctx.board.setOrientation(orientation);
    if (typeof ctx.board.randomSeat === 'function') ctx.board.randomSeat(seedFor(puzzle.i));

    if (framing === 'offensive') {
      // Show the pre-blunder position first, then animate the opponent's setup move that
      // creates the tactic -- the player should see it happen, not be dropped straight into
      // the post-blunder position with no idea what was just played.
      await ctx.board.setPosition(preBlunderFen, { animate: false });
      if (state.destroyed) return;
      hideLoading();
      els.side.dataset.side = sideToMove;
      els.rating.textContent = String(puzzle.r || '–');
      els.promptLabel.textContent = `Find the best move for ${sideToMove === 'white' ? 'White' : 'Black'}`;
      els.promptMove.hidden = true;
      lock();
      await ctx.board.animateMove(blunderMove.from, blunderMove.to, { fen: state.puzzlePositionFen });
      if (state.destroyed) return;
      if (promptStyle === 'highlight') ctx.board.highlight([blunderMove.from, blunderMove.to], 'move');
    } else {
      await ctx.board.setPosition(state.chess.fen(), { animate: false });
      if (state.destroyed) return;
      hideLoading();
      els.side.dataset.side = sideToMove;
      els.rating.textContent = String(puzzle.r || '–');
      els.promptLabel.textContent = 'Considering';
      els.promptMove.hidden = !m0san;
      els.promptMove.textContent = m0san || '';
      if (promptStyle === 'highlight' && m0san) {
        const blunder = parseUci(puzzle.m[0]);
        ctx.board.highlight([blunder.from, blunder.to], 'move');
      }
    }
    unlock();
  }

  // ---- wiring ---------------------------------------------------------
  // The BoardHandle contract fixes `onMove` as a createBoard()-time option with no
  // documented way to rebind it once ctx.board already exists -- yet a mode only
  // receives ctx.board after it is already live. app.js's ctx.board wrapper closes this
  // gap with exactly the extension this mode needs: setOnMove(fn), which repoints a
  // closure the board's own fixed onMove option already calls through (see
  // createBoardHandle() in app.js). The standalone test harness below implements the
  // same wrapper around a bare board2d.js handle, so this call works identically there.
  // setSquareTapHandler, by contrast, is a first-class part of the contract now, so
  // defensive framing wires directly to it.
  if (framing === 'offensive') {
    if (typeof ctx.board.setOnMove === 'function') {
      ctx.board.setOnMove(onBoardMove);
    } else if (typeof console !== 'undefined') {
      // eslint-disable-next-line no-console
      console.warn('[tactics] ctx.board has no setOnMove(); this mode cannot receive moves.');
    }
  } else if (typeof ctx.board.setSquareTapHandler === 'function') {
    ctx.board.setSquareTapHandler(onSquareTapDefensive);
  } else if (typeof console !== 'undefined') {
    // eslint-disable-next-line no-console
    console.warn('[tactics] ctx.board has no setSquareTapHandler(); defensive framing cannot receive taps.');
  }

  function onHint() {
    if (state.locked || !state.puzzle || state.resolved) return;
    // Defensive framing always grades m[1] (the refutation), regardless of solutionIdx,
    // which sits at 0 until m[0] is actually played.
    const idx = framing === 'defensive' ? 1 : state.solutionIdx;
    const expected = parseUci(state.puzzle.m[idx]);
    if (!expected) return;
    state.hintUsed = true;
    ctx.board.highlight([expected.from], 'hint');
    if (ctx.ui && ctx.ui.haptic) ctx.ui.haptic('tap');
  }

  function onShowSolution() {
    if (state.locked || !state.puzzle || state.resolved) return;
    state.resolved = 'skipped';
    state.streak = 0;
    updateReadouts();
    markFrame('wrong');
    showVerdict('neutral', 'Solution');
    recordHistory('skipped');
    spendStrike();
    finalizeRating('skipped');
    els.nextBtn.hidden = false; // see handleWrong -- don't gate "Next" behind the reveal
    revealRemainingSolution(framing === 'defensive' ? 0 : state.solutionIdx);
  }

  els.hintBtn.addEventListener('click', onHint);
  els.solutionBtn.addEventListener('click', onShowSolution);
  els.nextBtn.addEventListener('click', () => loadNext());
  els.endBtn.addEventListener('click', async () => {
    if (ctx.ui && typeof ctx.ui.confirm === 'function') {
      const ok = await ctx.ui.confirm({
        title: 'End this session?',
        text: `Your score of ${state.score} will be saved to the review list.`,
      });
      if (!ok) return;
    }
    finish();
  });

  updateReadouts();
  startTimer();
  loadNext();

  return {
    // Small read-only surface for the headless checks, mirroring modes/blunderrush.js's
    // `.debug`. Without it this mode could not be driven from outside: a test has no way to
    // learn which puzzle was loaded, so it cannot know which squares to tap — which is
    // exactly why the defensive multi-ply bug survived until a human hit it.
    get debug() {
      return {
        framing,
        puzzleId: state.puzzle ? state.puzzle.i : null,
        moves: state.puzzle ? state.puzzle.m.slice() : null,
        solutionIdx: state.solutionIdx,
        locked: state.locked,
        resolved: state.resolved,
        fen: state.chess ? state.chess.fen() : null,
      };
    },
    destroy() {
      state.destroyed = true;
      clearTimers();
      stopTimer();
      els.hintBtn.removeEventListener('click', onHint);
      els.solutionBtn.removeEventListener('click', onShowSolution);
      if (framing === 'defensive' && typeof ctx.board.setSquareTapHandler === 'function') {
        ctx.board.setSquareTapHandler(null);
      }
    },
    restart() {
      state.score = 0;
      state.streak = 0;
      state.bestStreak = 0;
      state.strikesSpent = 0;
      state.history = [];
      state.finished = false;
      secondsLeft = totalSeconds;
      stopTimer();
      updateReadouts();
      startTimer();
      loadNext();
    },
    pause() { stopTimer(); },
    resume() { startTimer(); },
  };
}
