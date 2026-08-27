/**
 * visualization.js -- blindfold / visualization trainer, rated Chesstempo-style.
 *
 * There is nothing to memorise here and nothing is ever hidden. The board shows the
 * position at the start of the (ply-limited) quiet window for the WHOLE exercise and never
 * changes on its own. A banner above it lists the moves from there in algebraic notation --
 * the visible tail of the quiet pre-moves `p`, plus the blunder `m[0]` converted to SAN --
 * and the user plays them forward in their head. To answer, they tap the square the piece
 * they want to move is (mentally) on, then the square they want to move it to -- even though,
 * on the board in front of them, the piece in question may not be sitting on that square at
 * all (it only moved there in their head, via the listed moves). That gap is exactly why this
 * uses the board's raw onSquareTap primitive, which board-interface.js documents as firing for
 * ANY square regardless of contents, rather than the piece-aware onMove one, which would
 * refuse a "move" starting from a square with nothing on it. A tap on the already-selected
 * from-square cancels the selection. A correct guess appends the move (in SAN) to the
 * displayed list -- the board still does not move immediately. A wrong guess gives feedback
 * and lets the user try again; the board still does not move, and there is no attempt limit.
 * Only the reveal -- automatic after a correct guess, or immediate via the explicit Reveal
 * button -- actually animates the board, move by move, so the user can check their mental
 * image against the real position.
 *
 * Because the board displays an EARLIER position than the one being solved, the side to move
 * in the solved position cannot be read off the board the way it normally could (it depends
 * on the parity of the ply count between the shown position and the puzzle position). This
 * mode states it explicitly in the prompt, and orients the board to that solving side (not
 * to whichever side happens to be on move in the position actually displayed).
 *
 * Rated play (ctx.rating) scores strictly on the FIRST attempt: a puzzle solved after any
 * wrong guess, or bailed out via Reveal, records 0 -- retrying is good practice but must
 * never inflate the measurement. See rating.js's doc comment for why that matters.
 *
 * ctx.config.plies is a real, user-set difficulty control now (a rating axis in its own
 * right -- rating.js buckets by it, so visualization at 0 plies is directly comparable to
 * plain tactics). Defaulting to 0 when unset keeps that comparison meaningful even for a
 * caller that hasn't wired the new selector yet. The requested ply count is honoured exactly:
 * a puzzle whose verified-quiet window can't support it is skipped and another is drawn,
 * rather than silently serving fewer plies than the bucket claims -- the whole rating
 * measurement depends on every recorded result actually having played out at the configured
 * depth. It is deliberately NOT driven through mode-interface.js's chooseWindow() -- that
 * function returns a random draw each call, which is the opposite of what a fixed, honoured
 * setting needs to be.
 *
 * Board-driving note: this mode never asks the user to drag pieces, so it never touches
 * ctx.board's onMove/interactive -- only setPosition/animateMove/setOrientation/highlight
 * and, for answering, setSquareTapHandler, all part of the documented BoardHandle contract.
 * board3d.js resolves onSquareTap against the board PLANE, not against piece meshes,
 * specifically so a tap on a square that looks empty in a stale position still resolves --
 * see its pickPlaneSquare()/pickSquare() split.
 */

import { Chess } from '../../vendor/chess.min.js';
import { seedFor } from '../mode-interface.js';

export const meta = {
  id: 'visualization',
  title: 'Visualization',
  blurb: 'Read the moves, hold the position in your head, then find the tactic blindfold.',
};

const ICON_SPRITE = `
<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
  <defs>
    <symbol id="i-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5l5 5 10-11"/></symbol>
    <symbol id="i-x" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></symbol>
    <symbol id="i-info" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.5h.01"/></symbol>
    <symbol id="i-target" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/></symbol>
    <symbol id="i-bolt" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L4 14h6l-1 8 9-12h-6z"/></symbol>
    <symbol id="i-eye-off" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 5.3A9.6 9.6 0 0112 5c5.5 0 9 6 9 6a15 15 0 01-3.2 3.9"/><path d="M6.3 6.5A15 15 0 003 11s3.5 6 9 6a9.3 9.3 0 004.2-1"/><path d="M9.9 9.9a3 3 0 004.2 4.2"/></symbol>
    <symbol id="i-puzzle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4h6v3a2 2 0 104 0h1v6h-3a2 2 0 100 4h3v3H9v-3a2 2 0 10-4 0H4v-6h3a2 2 0 100-4H4V7h5z"/></symbol>
  </defs>
</svg>`;

// The move-list banner reuses the design system's `.blindfold__*` typography classes, but
// NOT the `.blindfold` class itself: that class is sized to fill an entire `.board-slot`
// (it was designed to replace the board). This mode needs the opposite -- the board stays
// up and tappable the whole time (see the answering mechanism in the file header) -- so the
// banner is its own compact card that sits above `.board-area`, sized to its content.
const TEMPLATE = `
  <style>
    .mv-banner {
      width: 100%; max-width: var(--board-max); margin-inline: auto;
      padding: var(--space-3) var(--space-4);
      border-radius: var(--radius-lg);
      background: var(--surface-2);
      border: var(--border-width) solid var(--border);
      text-align: center;
      display: grid; gap: var(--space-2);
    }
  </style>
  <header class="app-bar">
    <span data-shell="restart-slot"></span>
    <div class="readouts" data-shell="header"></div>
    <span data-shell="settings-slot"></span>
  </header>

  <div class="stage">
    <div class="prompt">
      <span class="prompt__side" data-el="side" data-side="white"></span>
      <span class="prompt__label" data-el="promptLabel">Loading&hellip;</span>
    </div>
    <div class="mv-banner" data-el="banner" hidden>
      <span class="blindfold__eyebrow">
        <svg style="width:14px;height:14px;vertical-align:-2px"><use href="#i-eye-off"/></svg>
        <span data-el="pliesLabel">0 plies ahead</span>
      </span>
      <p class="blindfold__moves" data-el="moveList"></p>
      <p class="blindfold__hint" data-el="blindfoldHint">Play these forward in your head, then tap the from-square, then the to-square.</p>
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
      <button class="btn btn--secondary btn--block" data-action="reveal">Reveal</button>
      <button class="btn btn--primary btn--lg btn--block" data-action="next" hidden>Next puzzle</button>
      <button class="btn btn--ghost btn--block" data-action="end">End session</button>
    </div>
  </div>
`;

// See tactics.js for why this exists: setHeader's own {score,time,strikes} shape has no
// room for a Chesstempo-style rating readout or a streak.
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

/** Replays f -> p -> m[0] -> m[1..] once, recording every ply and the fen after it. */
function buildWalkthrough(puzzle) {
  if (!puzzle || typeof puzzle.f !== 'string') return null;
  let chess;
  try { chess = new Chess(puzzle.f); } catch { return null; }
  if (!chess || typeof chess.turn !== 'function') return null;

  const fens = [chess.fen()];
  const moves = [];
  for (const san of puzzle.p || []) {
    const mv = chess.move(san, { sloppy: true });
    if (!mv) return null;
    moves.push({ san: mv.san, from: mv.from, to: mv.to, promotion: mv.promotion || null });
    fens.push(chess.fen());
  }
  const preCount = moves.length;

  const rawMoves = puzzle.m || [];
  if (rawMoves.length < 2) return null; // need the blunder plus at least one solution ply
  for (const uci of rawMoves) {
    const parsed = parseUci(uci);
    if (!parsed) return null;
    const mv = chess.move({ from: parsed.from, to: parsed.to, promotion: parsed.promotion || 'q' });
    if (!mv) return null;
    moves.push({ san: mv.san, from: mv.from, to: mv.to, promotion: mv.promotion || null });
    fens.push(chess.fen());
  }
  return { fens, moves, preCount };
}

function formatMoveList(fen, sanList) {
  const parts = String(fen).split(' ');
  let turn = parts[1] === 'b' ? 'b' : 'w';
  let moveNum = parseInt(parts[5], 10) || 1;
  const out = [];
  let first = true;
  for (const san of sanList) {
    if (turn === 'w') out.push(`${moveNum}.${san}`);
    else out.push(first ? `${moveNum}…${san}` : san);
    first = false;
    if (turn === 'b') moveNum += 1;
    turn = turn === 'w' ? 'b' : 'w';
  }
  return out.join(' ');
}

export function createMode(ctx) {
  const root = ctx.root;
  const variant = (ctx.config && ctx.config.variant) || 'practice';
  const perspective = (ctx.config && ctx.config.perspective) === 'opponent' ? 'opponent' : 'own';
  const totalStrikes = (ctx.config && ctx.config.strikes) || 3;
  const totalSeconds = (ctx.config && ctx.config.seconds) || 180;
  // A real, honoured difficulty setting now -- rating.js buckets by it, so the default (when
  // a caller hasn't wired the setup-screen selector yet) is 0, not "as many as the puzzle
  // supports": 0 plies is the one value directly comparable to plain tactics.
  const requestedPlies = ctx.config && Number.isFinite(ctx.config.plies) ? Math.max(0, ctx.config.plies | 0) : 0;

  // See tactics.js's identical comment: ctx.root is an empty `.screen screen--play`, and
  // the shell's chrome-adoption step looks for `.app-bar` / `.stage` / `.action-bar` as its
  // direct children, adopting an existing app-bar (via the restart/settings-slot spans)
  // rather than prepending a duplicate one.
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
    frame: qs('[data-el="frame"]'),
    slot: qs('[data-el="slot"]'),
    banner: qs('[data-el="banner"]'),
    pliesLabel: qs('[data-el="pliesLabel"]'),
    moveList: qs('[data-el="moveList"]'),
    blindfoldHint: qs('[data-el="blindfoldHint"]'),
    ratingMeta: qs('[data-el="ratingMeta"]'),
    rating: qs('[data-el="rating"]'),
    revealBtn: qs('[data-action="reveal"]'),
    nextBtn: qs('[data-action="next"]'),
    endBtn: qs('[data-action="end"]'),
  };

  els.slot.appendChild(ctx.boardEl);
  // Never draggable: answers are entered by tapping squares on a deliberately stale board
  // (see the file header), and a normal interactive board would try to lift a piece off a
  // square it thinks is empty. onSquareTap fires independent of `interactive` regardless.
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
    walk: null,
    orientation: null,
    startIndex: 0,
    displayedSan: [],
    selectedFrom: null,
    erred: false,
    ratingRecorded: false,
    puzzleStartedAt: 0,
    solving: false,
    resolved: null,
    destroyed: false,
    finished: false,
  };

  const timers = new Set();
  function later(ms) {
    return new Promise((resolve) => {
      const id = setTimeout(() => { timers.delete(id); resolve(); }, ms);
      timers.add(id);
    });
  }
  function clearTimers() { for (const id of timers) clearTimeout(id); timers.clear(); }

  let verdictEl = null;
  function clearVerdict() { if (verdictEl) { verdictEl.remove(); verdictEl = null; } }
  function showVerdict(kind, text, delta) {
    clearVerdict();
    const stage = qs('.stage');
    const el = document.createElement('div');
    el.className = `verdict verdict--${kind}`;
    const icon = kind === 'correct' ? 'i-check' : kind === 'wrong' ? 'i-x' : 'i-info';
    el.innerHTML = `<svg><use href="#${icon}"/></svg> ${text}` + (delta ? `<span class="verdict__delta u-num">${delta}</span>` : '');
    stage.appendChild(el);
    verdictEl = el;
  }
  function markFrame(kind) {
    els.frame.classList.remove('is-correct', 'is-wrong');
    // eslint-disable-next-line no-unused-expressions
    els.frame.offsetHeight;
    els.frame.classList.add(kind === 'correct' ? 'is-correct' : 'is-wrong');
  }

  /**
   * `--stage-reserve` (tokens.css) is what the board formula subtracts from the stage's
   * height before sizing itself, so it has to equal everything in the stage that ISN'T the
   * board -- and the token's built-in 64px default only accounts for a single prompt line.
   * This mode also stacks the move-list banner above the board, which GROWS as correct
   * guesses are appended to it and can wrap to more lines on a narrow phone, so trusting the
   * constant clips the bottom of the board off the stage. Measuring instead -- and
   * re-measuring on every content change, not just once at mount -- keeps the board
   * shrinking to fit. Mirrors blunderrush.js's identical fix for its history strip; see that
   * file for the longer version of this comment. (Two modes hitting the same fixed-constant
   * trap independently suggests this really belongs in the shell or the design system rather
   * than being re-implemented per mode -- flagged in the task report.)
   */
  function syncStageReserve() {
    const stage = qs('.stage');
    if (!stage) return;
    const area = stage.querySelector('.board-area');
    if (!area) return;
    const cs = getComputedStyle(stage);
    const gap = parseFloat(cs.rowGap) || 0;
    let extra = 0;
    let siblings = 0;
    for (const child of stage.children) {
      if (child === area || child.hidden) continue;
      if (getComputedStyle(child).position === 'absolute') continue; // the verdict floats
      extra += child.getBoundingClientRect().height;
      siblings += 1;
    }
    // +1 for sub-pixel rounding, same as blunderrush.js: fractional heights round up against
    // us often enough to leave the stage one pixel over and clip the board's bottom edge.
    const reserve = Math.ceil(extra + gap * siblings) + 1;
    if (reserve > 0 && `${reserve}px` !== stage.style.getPropertyValue('--stage-reserve')) {
      stage.style.setProperty('--stage-reserve', `${reserve}px`);
      if (typeof ctx.board.resize === 'function') ctx.board.resize();
    }
  }

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
   * Exactly one rated + stats result per puzzle. Strict first-attempt scoring: 1 only if the
   * puzzle was solved with no wrong guess along the way, 0 for a reveal or any wrong guess
   * (even if the user went on to find it after retrying) -- see the file header for why.
   */
  function finalizeRating(kind) {
    if (state.ratingRecorded || !state.puzzle) return;
    state.ratingRecorded = true;
    const s = (kind === 'correct' && !state.erred) ? 1 : 0;

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
      ctx.stats.record('visualization', {
        id: state.puzzle.i,
        rating: state.puzzle.r,
        correct: s === 1,
        ms: Date.now() - state.puzzleStartedAt,
        // Always equal to requestedPlies: loadNext() skips any puzzle whose verified-quiet
        // window can't support the configured depth, so this is never a silent shortfall.
        plies: requestedPlies,
      });
    }
  }

  /**
   * The shell's review player payload (see app.js's REVIEW PLAYER doc comment and
   * mode-interface.js's ModeSummary). This is the mode the task called out as mattering
   * most: review is where the user finally SEES the line they had to hold in their head, so
   * every visualised ply -- quiet window, the blunder, and the solution -- has to be there
   * and in order, starting from exactly the position the board was showing (the window
   * start, `walk.fens[startIndex]`), not the puzzle's own `f`.
   *
   * `walk` already IS that replay (buildWalkthrough() plays f -> p -> m[0] -> m[1..] once,
   * recording the fen after every ply), so this only has to slice it from `startIndex`
   * onward and tag each ply by where it falls relative to `preCount` (end of the quiet
   * pre-moves) -- quiet, then the one blunder ply, then solution. SAN is supplied (not left
   * for the shell to derive) because it's already sitting on each move from that same
   * chess.js replay, off the same vendor/chess.min.js the shell itself imports, so it can
   * never disagree.
   */
  function buildReview() {
    const walk = state.walk;
    if (!walk) return undefined;
    const startIndex = state.startIndex;
    const moves = walk.moves.slice(startIndex).map((mv, i) => {
      const idx = startIndex + i;
      const tag = idx < walk.preCount ? 'quiet' : idx === walk.preCount ? 'blunder' : 'solution';
      return { uci: mv.from + mv.to + (mv.promotion || ''), san: mv.san, tag };
    });
    return {
      fen: walk.fens[startIndex],
      moves,
      focusPly: 0,
      orientation: state.orientation || undefined,
    };
  }

  function recordHistory(result, extra) {
    // Deep-linked to the puzzle position (right before the graded move, m[1]) -- the
    // tactical moment itself, not the displayed (earlier) position or the game's start.
    // Mirrors blunderrush.js's deepLink()/plyFromFen() pattern; puzzle.u is the plain
    // lichess game URL, '' (not undefined) when absent.
    const puzzlePositionFen = state.walk ? state.walk.fens[state.walk.preCount + 1] : null;
    state.history.push(Object.assign({
      id: state.puzzle ? state.puzzle.i : null,
      rating: state.puzzle ? state.puzzle.r : null,
      result,
      url: state.puzzle ? deepLink(state.puzzle.u, puzzlePositionFen) : '',
      review: buildReview(),
      at: Date.now(),
    }, extra || {}));
  }

  function buildSummary(headline) {
    return {
      score: state.score,
      best: state.bestStreak,
      history: state.history,
      headline: headline || `${state.score} visualised correctly — best streak ${state.bestStreak}`,
    };
  }

  function finish(headline) {
    if (state.finished) return;
    state.finished = true;
    stopTimer();
    ctx.onFinish(buildSummary(headline));
  }

  // ---- timed / survival ---------------------------------------------------
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
  function stopTimer() { if (timerHandle) { clearInterval(timerHandle); timerHandle = null; } }
  function spendStrike() {
    if (variant !== 'survival') return;
    state.strikesSpent += 1;
    updateReadouts();
    if (state.strikesSpent >= totalStrikes) finish('Out of strikes');
  }

  // ---- puzzle selection -----------------------------------------------
  function pickOpts() {
    if (ctx.config && ctx.config.band != null) return { rating: ctx.config.band, spread: 150 };
    if (ctx.rating && typeof ctx.rating.nextTarget === 'function') {
      try { return ctx.rating.nextTarget(); } catch { /* fall through */ }
    }
    return { rating: 1200, spread: 150 };
  }

  /** How many trailing pre-moves this puzzle's engine-verified quiet window actually covers. */
  function maxWindowFor(puzzle) {
    return Math.max(0, Math.min(puzzle.d | 0, (puzzle.p || []).length));
  }

  // ---- phases ---------------------------------------------------------
  // The board (`.board-slot`) is ALWAYS visible, for the whole exercise -- there is nothing
  // to peek at and dismiss; the starting position just stays up while the user reads the
  // move list and answers. Only the banner's contents and the action buttons change.
  function showSolving() {
    els.banner.hidden = false;
    els.revealBtn.hidden = false;
    els.nextBtn.hidden = true;
    state.solving = true;
  }
  function showDone() {
    state.solving = false;
    els.revealBtn.hidden = true;
    els.nextBtn.hidden = false;
  }

  function hideLoading() {
    const spinner = wrap.querySelector('[data-el="loadingSpinner"]');
    if (spinner) spinner.remove();
  }
  function showLoading() {
    els.promptLabel.textContent = 'Finding a puzzle…';
    els.rating.textContent = '–';
    els.banner.hidden = true;
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
  function showEmpty() {
    hideLoading();
    els.promptLabel.textContent = 'No puzzle available';
    els.banner.hidden = true;
    els.revealBtn.hidden = true;
    wrap.querySelector('.stage').insertAdjacentHTML('beforeend', `
      <div class="empty" data-el="emptyState">
        <svg><use href="#i-puzzle"/></svg>
        <p>Couldn’t load a puzzle for this rating band. Check your connection and try again.</p>
      </div>`);
    const retry = document.createElement('button');
    retry.className = 'btn btn--secondary';
    retry.textContent = 'Retry';
    retry.addEventListener('click', () => loadNext());
    wrap.querySelector('[data-el="emptyState"]').appendChild(retry);
  }
  function clearEmpty() {
    const el = wrap.querySelector('[data-el="emptyState"]');
    if (el) el.remove();
  }

  async function revealSequence() {
    const walk = state.walk;
    const fromIndex = state.startIndex;
    await ctx.board.setPosition(walk.fens[fromIndex], { animate: false });
    if (state.destroyed) return;
    for (let i = fromIndex; i < walk.moves.length; i++) {
      if (state.destroyed) return;
      const mv = walk.moves[i];
      // eslint-disable-next-line no-await-in-loop
      await ctx.board.animateMove(mv.from, mv.to, { fen: walk.fens[i + 1] });
      if (state.destroyed) return;
      // eslint-disable-next-line no-await-in-loop
      await later(400);
    }
    if (state.destroyed) return;
    showDone();
  }

  // ---- answering: raw two-tap onSquareTap, board never moves until reveal -----------------
  function onSquareTap(sq) {
    if (!state.solving || !state.walk || state.resolved) return;
    if (state.selectedFrom === sq) {
      state.selectedFrom = null;
      ctx.board.clearHighlights('select');
      return;
    }
    if (state.selectedFrom == null) {
      state.selectedFrom = sq;
      // Echoes the user's own tap back at them -- reveals nothing they didn't already
      // choose, so this is shown regardless of promptStyle.
      ctx.board.highlight([sq], 'select');
      return;
    }
    const from = state.selectedFrom;
    const to = sq;
    state.selectedFrom = null;
    ctx.board.clearHighlights('select');
    evaluateAttempt(from, to);
  }

  function evaluateAttempt(from, to) {
    const walk = state.walk;
    const correct = walk.moves[walk.preCount + 1];
    // Matched on from/to only: a two-square tap has no way to name a promotion piece, and
    // guessPromotion() (used only when the reveal actually plays the move) already defaults
    // to whatever the solution's own promotion piece is whenever from/to match it.
    const isMatch = from === correct.from && to === correct.to;

    if (isMatch) {
      state.displayedSan.push(correct.san);
      els.moveList.textContent = formatMoveList(walk.fens[state.startIndex], state.displayedSan);
      syncStageReserve(); // the appended move can grow the banner by a line -- re-measure now
      state.resolved = 'correct';
      markFrame('correct');
      const clean = !state.erred;
      if (clean) {
        state.score += 1;
        state.streak += 1;
        state.bestStreak = Math.max(state.bestStreak, state.streak);
        showVerdict('correct', 'Found it', '+1');
      } else {
        state.streak = 0;
        showVerdict('correct', 'Found it — after a miss, so it won’t count toward rating');
      }
      updateReadouts();
      recordHistory('correct', { erred: state.erred });
      if (ctx.ui && ctx.ui.haptic) ctx.ui.haptic('success');
      if (ctx.ui && ctx.ui.sound) ctx.ui.sound('success');
      finalizeRating('correct');
      els.revealBtn.hidden = true;
      later(500).then(() => { if (!state.destroyed) revealSequence(); });
    } else {
      state.erred = true;
      markFrame('wrong');
      showVerdict('wrong', 'Not quite — try again');
      recordHistory('wrong', { attempted: `${from}${to}` });
      if (ctx.ui && ctx.ui.haptic) ctx.ui.haptic('error');
      if (ctx.ui && ctx.ui.sound) ctx.ui.sound('error');
      ctx.board.flash('error');
      spendStrike();
      // No reveal, no advance -- board stays frozen and the user can try another pair.
      later(650).then(() => { if (!state.destroyed && !state.resolved) clearVerdict(); });
    }
  }

  function onReveal() {
    if (state.resolved || !state.walk) return;
    state.resolved = 'skipped';
    state.streak = 0;
    updateReadouts();
    showVerdict('neutral', 'Solution');
    recordHistory('skipped');
    markFrame('wrong');
    spendStrike();
    finalizeRating('skipped');
    els.revealBtn.hidden = true;
    revealSequence();
  }

  async function loadNext(retries = 0) {
    if (state.destroyed || state.finished) return;
    clearVerdict();
    clearEmpty();
    els.frame.classList.remove('is-correct', 'is-wrong');
    showLoading();
    els.revealBtn.hidden = true;
    els.nextBtn.hidden = true;
    ctx.board.clearHighlights();
    ctx.board.clearArrows();

    if (retries > 12) { showEmpty(); return; }

    let puzzle;
    try { puzzle = await ctx.data.pick(pickOpts()); } catch { puzzle = null; }
    if (state.destroyed) return;
    if (!puzzle) { showEmpty(); return; }

    const walk = buildWalkthrough(puzzle);
    if (!walk) { loadNext(retries + 1); return; }

    // The requested ply count must be honoured exactly (see the file header): a puzzle whose
    // verified-quiet window falls short is skipped rather than silently served at a shallower
    // depth than the rating bucket claims.
    if (maxWindowFor(puzzle) < requestedPlies) { loadNext(retries + 1); return; }

    state.puzzle = puzzle;
    state.walk = walk;
    state.selectedFrom = null;
    state.erred = false;
    state.ratingRecorded = false;
    state.puzzleStartedAt = Date.now();
    state.resolved = null;
    state.startIndex = walk.preCount - requestedPlies;

    const visibleSan = walk.moves.slice(state.startIndex, walk.preCount + 1).map((m) => m.san);
    state.displayedSan = visibleSan.slice();

    // The board displays an EARLIER position than the one being solved -- the side to move
    // there depends on the parity of requestedPlies and can't be read off the board the way
    // it normally could. Orientation and the prompt both use the SOLVING side (the puzzle
    // position, after the full window plus the blunder), not the displayed one, so the board
    // and the text always agree about whose move the user is actually looking for.
    const solvingSide = walk.fens[walk.preCount + 1].split(' ')[1] === 'b' ? 'black' : 'white';
    const orientation = perspective === 'opponent' ? opposite(solvingSide) : solvingSide;
    state.orientation = orientation;

    ctx.board.setOrientation(orientation);
    if (typeof ctx.board.randomSeat === 'function') ctx.board.randomSeat(seedFor(puzzle.i));
    await ctx.board.setPosition(walk.fens[state.startIndex], { animate: false });
    if (state.destroyed) return;

    hideLoading();
    els.side.dataset.side = solvingSide;
    els.promptLabel.textContent = `Find ${solvingSide === 'white' ? 'White' : 'Black'}'s move`;
    els.rating.textContent = String(puzzle.r || '–');
    els.pliesLabel.textContent = `${requestedPlies} ${requestedPlies === 1 ? 'ply' : 'plies'} ahead`;
    els.moveList.textContent = formatMoveList(walk.fens[state.startIndex], state.displayedSan);
    showSolving();
    syncStageReserve();
  }

  if (typeof ctx.board.setSquareTapHandler === 'function') {
    ctx.board.setSquareTapHandler(onSquareTap);
  } else if (typeof console !== 'undefined') {
    // eslint-disable-next-line no-console
    console.warn('[visualization] ctx.board has no setSquareTapHandler(); this mode cannot receive taps.');
  }

  els.revealBtn.addEventListener('click', onReveal);
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

  // Content-driven re-measurement of --stage-reserve: the banner's own size is what changes
  // most often here (moves appended, text wrapping to more lines on a narrow phone), so a
  // ResizeObserver on it is the most direct trigger -- it fires for exactly the cases that
  // matter without needing every call site that might change its height to remember to ask.
  let stageResizeObserver = null;
  if (typeof ResizeObserver !== 'undefined') {
    stageResizeObserver = new ResizeObserver(() => syncStageReserve());
    stageResizeObserver.observe(els.banner);
  }

  // Viewport/orientation changes (device rotation, a software keyboard closing) also change
  // how much room the stage has, independent of the banner's own content. rAF-coalesced,
  // same as blunderrush.js, since resize fires in bursts.
  let resizePending = false;
  function onWindowResize() {
    if (resizePending || state.destroyed) return;
    resizePending = true;
    requestAnimationFrame(() => {
      resizePending = false;
      if (!state.destroyed) syncStageReserve();
    });
  }
  window.addEventListener('resize', onWindowResize);
  window.addEventListener('orientationchange', onWindowResize);

  updateReadouts();
  startTimer();
  loadNext();

  return {
    destroy() {
      state.destroyed = true;
      clearTimers();
      stopTimer();
      if (typeof ctx.board.setSquareTapHandler === 'function') ctx.board.setSquareTapHandler(null);
      if (stageResizeObserver) stageResizeObserver.disconnect();
      window.removeEventListener('resize', onWindowResize);
      window.removeEventListener('orientationchange', onWindowResize);
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
