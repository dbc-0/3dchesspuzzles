/**
 * Blunder Rush -- "is this move safe, or is it a blunder?"
 *
 * A position is shown with one move named in algebraic notation. You answer SAFE or UNSAFE.
 * The engine-verified quiet moves of the window come first (answer SAFE, play continues in
 * the same game), then the real blunder (answer UNSAFE, the refutation plays out and a new
 * puzzle loads). A wrong answer costs a strike. `chooseSequence` decides how many quiet
 * moves come first, and some puzzles are ALL SAFE -- they end with no blunder at all, and
 * this mode must never show one for those, or the "it always ends in a blunder" tell that
 * the constant-hazard draw exists to kill comes straight back.
 *
 * Variants: 'timed' (5 minutes, 3 strikes), 'survival' (no clock, 3 strikes), 'practice'
 * (no clock, no strike limit, pinned to the chosen band).
 *
 * You always sit on the side that is ABOUT TO MOVE -- the board is oriented to the mover
 * for every prompt -- because the exercise is spotting the tactic coming at you. (The only
 * exception is an explicit `config.perspective:'opponent'` run, which the shell uses to
 * measure reading the same position from across the table; the default never flips.)
 *
 * Layout contract with the shell
 * ------------------------------
 * This mode renders the complete `.screen.screen--play` structure from the design system
 * into `ctx.root`: app bar (readouts), stage (prompt + board + meta) and action bar
 * (the two answer buttons). It leaves the two app-bar corner cells empty and tagged
 * `[data-br-slot="left"|"right"]` so the shell can drop its restart / settings controls
 * in without either side inventing markup. Nothing in here ever scrolls anything.
 *
 * `ctx.boardEl` is adopted into this mode's `.board-slot` on mount and returned to its
 * original parent on destroy, so the shell keeps ownership of the board's lifetime while
 * the mode decides where it sits.
 *
 * Prompt style: `ctx.settings.promptStyle` decides how the prompted move is presented.
 *   'highlight' -- SAN plus the from/to squares lit on the board and an arrow between them.
 *   'notation'  -- long algebraic only ("Nf3-e5"); the board says nothing, so the player has
 *                  to find the squares themselves. Feedback after the answer still marks
 *                  them, and the solution always replays -- that is the payoff, not a hint.
 *
 * Persistence: modes must not touch localStorage. Every answer goes to `ctx.stats.record`
 * with the current level attached, the run is recorded on finish, and the drifted rating is
 * also reported in the ModeSummary for the shell to hand back as `ctx.config.band`.
 */

import { chooseSequence, seedFor } from '../mode-interface.js';
// Namespace import: still links if the vendored file is ever replaced by a plain UMD copy
// with no exports, in which case we fall back to a global.
import * as ChessModule from '../../vendor/chess.min.js';

const Chess = ChessModule.Chess || ChessModule.default || globalThis.Chess;

export const meta = {
  id: 'blunderrush',
  title: 'Blunder Rush',
  blurb: 'Safe or unsafe, as many as you can before the clock or your strikes run out.',
};

/* --------------------------------------------------------------------------
   Tuning
   -------------------------------------------------------------------------- */

const VARIANTS = {
  timed: { clock: 300, strikes: 3, drift: true, label: '5 min - 3 strikes' },
  survival: { clock: 0, strikes: 3, drift: true, label: 'Untimed - 3 strikes' },
  practice: { clock: 0, strikes: Infinity, drift: false, label: 'Practice' },
};

/* The ramp. This is the game: a rush opens on one-movers and gets brutal, and the climb is
   the whole pleasure of it.

   It is completely independent of the player's rating, exactly like Puzzle Rush. A 2200 and
   a 900 both open on the same trivial back-rank mate; the strong player simply blows through
   the early ones in seconds. The opening puzzles are a warm-up, not a measurement -- the
   measurement is the Glicko rating, which keeps recording in the background (see ratePuzzle)
   and has no say in where a run starts or how fast it climbs. Difficulty only ever climbs
   inside a run; strikes are what end it. */
const RAMP_STEP = 50;             // difficulty added per puzzle solved cleanly -- flat, as
                                  // in the original app, whose progression felt right
const RAMP_SPREAD = 75;           // tight, so the early puzzles really are the easy ones
const EASIEST_FALLBACK = 600;     // only if the data index tells us nothing

// Fallback rating drift, used only when the shell has no rating engine wired up (the
// standalone harness, mainly). The old app only ever ratcheted upward (`maxRating += 50`,
// never down) and its `minRating` was declared and never read; both directions matter now,
// and the floor/ceiling come from the data index when it is available.
const DRIFT_UP = 20;           // puzzle finished with every answer correct
const DRIFT_DOWN = 45;         // any wrong answer
const RATING_FLOOR = 500;
// Where a rush opens, matching the previous app (which started at 650-700 and whose
// progression the user confirmed felt right). Deliberately a constant rather than
// "whatever the easiest band happens to be" -- see easiestBand().
const RAMP_OPEN = 650;
const RATING_CEIL = 2900;
const PICK_SPREAD = 120;

const STRIP_MAX = 60;          // live history chips kept in the DOM during a run

const REPLAY_STEP_MS = 460;    // between plies of the solution replay
const QUIET_REPLY_MS = 260;    // pause before the opponent's reply to a quiet move
const FEEDBACK_MS = 620;       // how long the verdict sits before the board moves on
const COUNTDOWN_STEP_MS = 800;
const MAX_PUZZLE_ATTEMPTS = 6; // corrupt records to skip before giving up

/* --------------------------------------------------------------------------
   Icons -- the design gallery's sprite lives in the shell, which a mode cannot
   assume is present, so the same paths are inlined here.
   -------------------------------------------------------------------------- */

const ICON = {
  shield: '<path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
  alert: '<path d="M12 4L2.5 20h19z"/><path d="M12 10v4"/><path d="M12 17.5h.01"/>',
  check: '<path d="M4.5 12.5l5 5 10-11"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.5h.01"/>',
  bolt: '<path d="M13 2L4 14h6l-1 8 9-12h-6z"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/>',
  refresh: '<path d="M20 11a8 8 0 10-1.6 5.6"/><path d="M20 5v6h-6"/>',
};

function icon(name, width) {
  const w = width ? ` style="width:${width}px;height:${width}px"` : '';
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${w}>${ICON[name] || ''}</svg>`;
}

/* --------------------------------------------------------------------------
   Small helpers
   -------------------------------------------------------------------------- */

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

function mmss(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** A seeded PRNG so a given puzzle always picks the same window depth. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 1-based ply number of a FEN, for deep-linking a lichess game to the right move. */
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

/** Apply one UCI move. Returns the chess.js move object, or null if it is not legal. */
function applyUci(game, uci) {
  if (typeof uci !== 'string' || uci.length < 4) return null;
  try {
    return game.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      // chess.js only compares `promotion` when the candidate move is a promotion, so
      // passing it unconditionally is safe and covers 5-character UCI.
      promotion: (uci[4] || 'q').toLowerCase(),
    });
  } catch { return null; }
}

/** Apply one SAN move. Returns the move object, or null. */
function applySan(game, san) {
  if (typeof san !== 'string' || !san) return null;
  try { return game.move(san, { sloppy: true }); } catch { return null; }
}

/**
 * Long algebraic for the 'notation' prompt style: "Nf3-e5", "e4xd5", "a7-a8=Q", "O-O".
 * SAN alone names the destination but hides where the piece started, which is most of the
 * work when you are locating it on a 3D board from an unfamiliar seat.
 */
function longAlgebraic(mv) {
  if (!mv) return '';
  const flags = mv.flags || '';
  if (flags.includes('k')) return 'O-O';
  if (flags.includes('q')) return 'O-O-O';
  const piece = mv.piece === 'p' ? '' : String(mv.piece).toUpperCase();
  const sep = (flags.includes('c') || flags.includes('e')) ? 'x' : '-';
  const promo = mv.promotion ? `=${String(mv.promotion).toUpperCase()}` : '';
  const suffix = /[+#]$/.test(mv.san || '') ? mv.san.slice(-1) : '';
  return `${piece}${mv.from}${sep}${mv.to}${promo}${suffix}`;
}

/* --------------------------------------------------------------------------
   Mode
   -------------------------------------------------------------------------- */

export function createMode(ctx) {
  const root = ctx.root;
  const board = ctx.board;
  const ui = (ctx && ctx.ui) || {};
  const config = (ctx && ctx.config) || {};
  const settings = (ctx && ctx.settings) || {};
  const stats = (ctx && ctx.stats) || null;
  const ratingEngine = ctx && ctx.rating && typeof ctx.rating.nextTarget === 'function'
    ? ctx.rating : null;
  const variantName = VARIANTS[config.variant] ? config.variant : 'timed';
  const rules = VARIANTS[variantName];
  // 'notation' withholds the board hint; anything else (including nothing) highlights.
  const promptStyle = settings.promptStyle === 'notation' ? 'notation' : 'highlight';
  /**
   * Which side of the table you sit on. The default -- and the whole point of this game --
   * is 'own': the board faces the side ABOUT TO MOVE, so the tactic is coming at you. The
   * shell may opt a run into 'opponent' to measure reading the same position from across
   * the table; that is a deliberate, separately-bucketed experiment, never the default.
   */
  const perspective = config.perspective === 'opponent' ? 'opponent' : 'own';
  // This mode only ever presents the pre-blunder position, i.e. the defensive framing.
  const framing = 'defensive';

  // ---- run state ---------------------------------------------------------
  let destroyed = false;
  let runId = 0;                  // bumped by restart()/destroy() to strand old async work
  let finished = false;

  let score = 0;
  let strikes = 0;
  let streak = 0;
  let bestStreak = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let history = [];
  let startedAt = 0;
  let startLevel = 0;             // difficulty the run opened at, for the run record

  const ratingFloor = dataFloor();
  const ratingCeil = dataCeil();
  // Two different numbers, deliberately, and they do not talk to each other. `playerRating`
  // is who you are (Glicko, across sessions, for the stats screen); `served` is how hard the
  // puzzle in front of you is right now, and it starts at the bottom for everybody.
  let playerRating = storedRating();
  let served = openingDifficulty();

  let ratingDelta = 0;            // difficulty the ramp added after the last puzzle
  let puzzle = null;              // the raw record
  let rated = false;              // this puzzle's single rating result has been recorded
  let game = null;                // chess.js instance at the position on screen
  let seat = null;                // 3D camera seat for this puzzle, recorded with the stats
  let prompts = [];               // [{kind:'quiet'|'blunder', ply}]
  let allSafe = false;            // this puzzle has no blunder in it at all
  // Everything the summary's review player needs to replay this puzzle, built once when the
  // puzzle loads (see buildReviewLine) rather than per answer.
  let windowFen = '';             // position the window opens on -- what the player first saw
  let windowStartPly = 0;         // index into puzzle.p that windowFen corresponds to
  let reviewLine = [];            // [{uci, san, tag}] one per ply from windowFen
  let puzzleOrientation = 'white';
  let promptIndex = 0;
  let promptShownAt = 0;
  let accepting = false;

  // clock
  let clockLeft = rules.clock;
  let clockTimer = null;
  let clockDeadline = 0;
  let paused = false;

  const timers = new Set();

  /** Cancellable sleep that resolves false if the run moved on underneath it. */
  function sleep(ms, token) {
    return new Promise((resolve) => {
      const t = setTimeout(() => { timers.delete(t); resolve(token === runId && !destroyed); }, ms);
      timers.add(t);
    });
  }

  function clearTimers() {
    for (const t of timers) clearTimeout(t);
    timers.clear();
  }

  // ---- persistence (the shell owns storage; we hand it plain JSON) --------

  /** Fire-and-forget: a shell without stats must not break a run. */
  function recordStat(kind, payload) {
    if (!stats || typeof stats.record !== 'function') return;
    try { stats.record(kind, payload); } catch { /* the summary still carries the totals */ }
  }

  function queryStat(kind) {
    if (!stats || typeof stats.query !== 'function') return null;
    try { return stats.query(kind); } catch { return null; }
  }

  /**
   * The player's standing strength, across sessions. It feeds the stats screen and the
   * summary and nothing else -- it has no say in where a run opens or how fast it climbs.
   */
  function storedRating() {
    if (ratingEngine) {
      const t = engineTarget();
      if (t) return t.rating;
    }
    const candidates = [settings.rating, config.rating];
    for (const c of candidates) {
      const n = Number(c);
      if (Number.isFinite(n) && n > 0) return n;
    }
    const runs = queryStat(`${meta.id}.run`);
    if (Array.isArray(runs) && runs.length) {
      const n = Number(runs[runs.length - 1].playerRating);
      if (Number.isFinite(n) && n > 0) return n;
    }
    const band = Number(config.band);
    return Number.isFinite(band) && band > 0 ? band : 1200;
  }

  /**
   * Where a rush opens: the lowest stocked band, but never below RAMP_OPEN.
   *
   * "Lowest stocked band" alone is wrong, because it silently tracks whatever the corpus
   * happens to contain. The engine-filtered corpus reaches down to 400, so runs began ~250
   * points below the previous app's 650-700 opening -- the progression the user said felt
   * right -- and the first puzzles were trivial rather than merely easy.
   *
   * A rush should still open easy for everyone regardless of rating; RAMP_OPEN just stops
   * "easy" from drifting with the data.
   */
  function easiestBand() {
    const bands = (ctx.data && ctx.data.bands) || [];
    const stocked = bands.filter((b) => b && Number.isFinite(Number(b.lo)) && (b.n == null || b.n > 0));
    if (!stocked.length) return EASIEST_FALLBACK;
    const lowest = Math.min(...stocked.map((b) => Number(b.lo)));
    // If the corpus somehow starts above RAMP_OPEN, honour the data rather than ask for
    // puzzles that do not exist.
    return Math.max(lowest, Math.min(RAMP_OPEN, Math.max(...stocked.map((b) => Number(b.lo)))));
  }

  /**
   * Where the run opens.
   *
   * Practice pins to the band chosen on the setup screen. A rush always opens at the bottom
   * of the data -- back-rank mates and hanging queens -- for everyone, whatever their rating.
   */
  function openingDifficulty() {
    if (!rules.drift) {
      const band = Number(config.band);
      if (Number.isFinite(band) && band > 0) return clamp(band, RATING_FLOOR, RATING_CEIL);
      return clamp(playerRating, ratingFloor, ratingCeil);
    }
    return clamp(easiestBand(), ratingFloor, ratingCeil);
  }

  /** How much harder the next puzzle gets once this one is solved. Flat, for everyone. */
  function rampStep() {
    return RAMP_STEP;
  }

  /** {rating, spread} from the shell's rating engine, or null if it gave us nothing usable. */
  function engineTarget() {
    if (!ratingEngine) return null;
    let t = null;
    try { t = ratingEngine.nextTarget(); } catch { return null; }
    const r = Number(t && t.rating);
    if (!Number.isFinite(r) || r <= 0) return null;
    const spread = Number(t.spread);
    return { rating: Math.round(r), spread: Number.isFinite(spread) && spread > 0 ? spread : PICK_SPREAD };
  }

  /** Adopt the engine's updated view of the player after a result. */
  function syncRating() {
    const t = engineTarget();
    if (t) playerRating = t.rating;
  }

  /**
   * What to ask the data layer for: the ramp's current step, not the player's rating.
   * A tight spread in the rated variants keeps the opening puzzles genuinely easy instead
   * of scattering a 350-point Glicko deviation across the first few.
   */
  function pickTarget() {
    return {
      rating: Math.round(served),
      spread: rules.drift ? RAMP_SPREAD : PICK_SPREAD,
    };
  }

  /**
   * Best-effort: some shells own the app bar and want the mode's headline numbers. We render
   * our own readouts regardless, so this only ever adds information.
   */
  function pushHeader() {
    if (!ui.setHeader) return;
    try {
      ui.setHeader({
        title: meta.title, mode: meta.id, variant: variantName,
        rating: Math.round(served), playerRating: Math.round(playerRating),
        ratingDelta, score, strikes,
      });
    } catch { /* the shell's header is the shell's business */ }
  }

  function dataFloor() {
    const bands = (ctx.data && ctx.data.bands) || [];
    return bands.length ? Math.max(RATING_FLOOR, Math.min(...bands.map((b) => Number(b.lo) || RATING_CEIL)))
      : RATING_FLOOR;
  }

  function dataCeil() {
    const bands = (ctx.data && ctx.data.bands) || [];
    return bands.length ? Math.min(RATING_CEIL, bands[bands.length - 1].hi) : RATING_CEIL;
  }

  function previousBest() {
    const s = settings;
    const runs = queryStat(`${meta.id}.run`);
    const recorded = Array.isArray(runs)
      ? runs.filter((r) => r && r.variant === variantName).reduce((m, r) => Math.max(m, Number(r.score) || 0), 0)
      : null;
    const candidates = [
      s.best && s.best[variantName],
      s.bestScore && s.bestScore[variantName],
      s.bestScore,
      config.best,
      recorded,
    ];
    for (const c of candidates) {
      const n = Number(c);
      if (Number.isFinite(n)) return n;
    }
    return 0;
  }

  // ---- ui.* wrappers: every one is optional in the contract ---------------
  function haptic(kind) { try { ui.haptic && ui.haptic(kind); } catch { /* noop */ } }
  function sound(name) { try { ui.sound && ui.sound(name); } catch { /* noop */ } }
  function toast(msg, kind) { try { ui.toast && ui.toast(msg, { kind }); } catch { /* noop */ } }

  /* ------------------------------------------------------------------------
     DOM
     ---------------------------------------------------------------------- */

  const addedRootClasses = [];
  for (const cls of ['screen', 'screen--play']) {
    if (!root.classList.contains(cls)) { root.classList.add(cls); addedRootClasses.push(cls); }
  }

  root.innerHTML = `
    <header class="app-bar">
      <span data-br-slot="left"></span>
      <div class="readouts">
        <div class="readout readout--score">
          <span class="readout__label">Score</span>
          <span class="readout__value u-num" data-br="score">0</span>
        </div>
        ${rules.clock ? `
        <div class="readout readout--timer" data-br="timer">
          <span class="readout__label">Time</span>
          <span class="readout__value u-num" data-br="clock">${mmss(rules.clock)}</span>
        </div>` : ''}
        ${Number.isFinite(rules.strikes) ? `
        <div class="readout readout--strikes">
          <span class="readout__label">Strikes</span>
          <span class="strikes" role="img" data-br="strikes"
                aria-label="0 of ${rules.strikes} strikes used">
            ${Array.from({ length: rules.strikes }, () => '<span class="strikes__pip"></span>').join('')}
          </span>
        </div>` : `
        <div class="readout">
          <span class="readout__label">Streak</span>
          <span class="readout__value u-num" data-br="streak">0</span>
        </div>`}
      </div>
      <span data-br-slot="right"></span>
    </header>

    <div class="stage" data-br="stage">
      <div class="prompt" data-br="prompt">
        <span class="prompt__side" data-br="side" hidden></span>
        <span class="prompt__label" data-br="prompt-label">Get ready</span>
        <span class="prompt__move" data-br="move" hidden></span>
      </div>
      <div class="board-area">
        <div class="board-frame" data-br="frame">
          <div class="board-slot" data-br="slot"></div>
        </div>
      </div>
      <div class="stage__meta" data-br="meta">
        <span>${icon('target')} Rating <span class="u-num" data-br="rating">${Math.round(served)}</span>
          <span class="badge u-num" data-br="rating-delta" hidden></span></span>
        <span class="stage__meta-sep"></span>
        <span data-br="streak-meta"></span>
      </div>
      <!-- Live run history: one link per finished puzzle, to the lichess game at the ply the
           prompt was asked at, opening in a new tab so following one never costs the run.
           Not role="list" -- the children are links, and wrapping each in a listitem would
           bury that from assistive tech for no gain. -->
      <div class="u-scroll-x" data-br="strip" role="group" aria-label="Puzzles this run"
           style="display:flex; gap:var(--space-1); max-width:100%; padding-bottom:2px" hidden></div>
    </div>

    <div class="action-bar">
      <div class="action-bar__inner" data-br="actions">
        <div class="answers" data-br="answers">
          <button class="answer answer--safe" type="button" data-br="safe" disabled>
            ${icon('shield')} Safe<span class="answer__hint">&larr; or S</span>
          </button>
          <button class="answer answer--unsafe" type="button" data-br="unsafe" disabled>
            ${icon('alert')} Unsafe<span class="answer__hint">&rarr; or U</span>
          </button>
        </div>
      </div>
    </div>
  `;

  const $ = (name) => root.querySelector(`[data-br="${name}"]`);
  const el = {
    stage: $('stage'), frame: $('frame'), slot: $('slot'), prompt: $('prompt'),
    promptLabel: $('prompt-label'), move: $('move'), side: $('side'),
    score: $('score'), clock: $('clock'), timer: $('timer'), strikes: $('strikes'),
    streak: $('streak'), streakMeta: $('streak-meta'),
    rating: $('rating'), ratingDelta: $('rating-delta'),
    meta: $('meta'), strip: $('strip'), answers: $('answers'), actions: $('actions'),
    safe: $('safe'), unsafe: $('unsafe'),
  };

  // Adopt the shell's board element, remembering where it came from.
  const boardEl = ctx.boardEl || (board && board.el) || null;
  const boardHome = boardEl && boardEl.parentNode
    ? { parent: boardEl.parentNode, next: boardEl.nextSibling }
    : null;
  if (boardEl && !boardEl.contains(el.slot)) {
    el.slot.appendChild(boardEl);
    if (board && typeof board.resize === 'function') board.resize();
  }

  let overlay = null;

  /* ------------------------------------------------------------------------
     Readouts
     ---------------------------------------------------------------------- */

  function bump(node) {
    if (!node) return;
    node.classList.remove('is-bumped');
    void node.offsetWidth;
    node.classList.add('is-bumped');
  }

  function renderScore(animate) {
    if (!el.score) return;
    el.score.textContent = String(score);
    if (animate) bump(el.score);
  }

  function renderStrikes(justSpent) {
    if (!el.strikes) return;
    const pips = el.strikes.querySelectorAll('.strikes__pip');
    pips.forEach((pip, i) => {
      const spent = i < strikes;
      pip.classList.toggle('is-spent', spent);
      pip.classList.toggle('is-just-spent', spent && justSpent && i === strikes - 1);
    });
    el.strikes.setAttribute('aria-label', `${strikes} of ${rules.strikes} strikes used`);
  }

  function renderClock() {
    if (!el.clock) return;
    el.clock.textContent = mmss(clockLeft);
    if (el.timer) {
      el.timer.classList.toggle('is-warning', clockLeft <= 60 && clockLeft > 15);
      el.timer.classList.toggle('is-critical', clockLeft <= 15);
    }
  }

  function renderMeta() {
    // The rating of the puzzle in FRONT of you -- the same number the history strip logs,
    // and the one that visibly climbs as the ramp bites.
    const shown = puzzle && Number.isFinite(Number(puzzle.r)) ? Number(puzzle.r) : Math.round(served);
    if (el.rating) el.rating.textContent = String(shown);
    if (el.ratingDelta) {
      // How much the ramp just stepped up. Blank between puzzles rather than a stale "+0".
      el.ratingDelta.hidden = !ratingDelta;
      el.ratingDelta.textContent = `+${ratingDelta}`;
      el.ratingDelta.classList.toggle('badge--gold', ratingDelta > 0);
    }
    if (el.streak) el.streak.textContent = String(streak);
    if (!el.streakMeta) return;
    if (streak >= 2) {
      el.streakMeta.className = 'stage__meta-streak';
      el.streakMeta.innerHTML = `${icon('bolt')} ${streak} in a row`;
    } else if (streak === 0 && bestStreak > 0) {
      el.streakMeta.className = '';
      el.streakMeta.innerHTML = `${icon('x')} Streak lost`;
    } else {
      el.streakMeta.className = '';
      el.streakMeta.innerHTML = `${icon('bolt')} Best streak ${bestStreak}`;
    }
  }

  /* ------------------------------------------------------------------------
     Live history strip

     The old app built a row of coloured rating links as you played, and losing it left the
     player with no sense of the run behind them. This is that strip in the new design
     language: one design-system badge per finished puzzle, carrying an icon and a real
     label as well as a colour, and scrolling inside itself so the fixed play layout never
     grows. `--stage-reserve` is widened by exactly the strip's measured height, which is
     what keeps the board shrinking to fit instead of shoving the answer buttons off-screen.
     ---------------------------------------------------------------------- */

  const STRIP_LOOK = {
    correct: { cls: 'badge--safe', glyph: 'check', label: 'Correct' },
    blunder: { cls: 'badge--unsafe', glyph: 'x', label: 'Missed a blunder' },
    missed: { cls: 'badge--miss', glyph: 'alert', label: 'Called a safe move unsafe' },
  };

  /**
   * `--stage-reserve` is what the board formula subtracts from the stage's height before
   * sizing itself, so it has to equal everything in the stage that ISN'T the board. The
   * token's default only covers the prompt; with the meta line and the history strip below
   * the board as well, a 375x667 phone overflowed by ~15px and clipped the strip. Measuring
   * instead of guessing also survives a prompt that wraps to two lines.
   *
   * Heights of the non-board children do not depend on the board's size, so this settles in
   * one pass -- there is no feedback loop.
   */
  function syncStageReserve() {
    if (!el.stage) return;
    const area = el.stage.querySelector('.board-area');
    if (!area) return;
    const cs = getComputedStyle(el.stage);
    const gap = parseFloat(cs.rowGap) || 0;
    let extra = 0;
    let siblings = 0;
    for (const child of el.stage.children) {
      if (child === area || child.hidden) continue;
      if (getComputedStyle(child).position === 'absolute') continue;   // the verdict floats
      extra += child.getBoundingClientRect().height;
      siblings += 1;
    }
    // +1 for sub-pixel rounding: the fractional heights round up against us often enough to
    // leave the stage one pixel over and clip the bottom of the strip.
    const reserve = Math.ceil(extra + gap * siblings) + 1;
    if (reserve > 0 && `${reserve}px` !== el.stage.style.getPropertyValue('--stage-reserve')) {
      el.stage.style.setProperty('--stage-reserve', `${reserve}px`);
      if (typeof board.resize === 'function') board.resize();
    }
  }

  /**
   * Where a history badge points: OUR review player, reconstructible from the URL alone so a
   * fresh tab needs no shared state. `ply` is the same focus this entry already carries, so
   * the tab opens on the position the player was judging rather than at move one.
   *
   * The whole URL shape lives here, and only here -- the review screen may refine it, and a
   * refinement should be a one-line edit rather than a hunt.
   */
  function reviewHref(entry) {
    if (!entry || entry.id == null || entry.id === '') return '';
    const q = new URLSearchParams();
    q.set('id', String(entry.id));
    const r = Number(entry.rating);
    if (Number.isFinite(r)) q.set('r', String(Math.round(r)));
    const ply = entry.review && Number(entry.review.focusPly);
    q.set('ply', String(Number.isFinite(ply) ? Math.max(0, Math.round(ply)) : 0));
    // This opens in a NEW TAB (see addStripEntry below), which has no lastSummary to
    // inherit a board from -- without this, the review screen falls back to whatever
    // the global board setting happens to be, which may not be what this run was
    // actually played in. Carrying it explicitly keeps review matching the run.
    q.set('board', settings.board === '3d' ? '3d' : '2d');
    return `#/review?${q.toString()}`;
  }

  function addStripEntry(entry) {
    if (!el.strip) return;
    const look = STRIP_LOOK[entry.result] || STRIP_LOOK.correct;
    // Opens our own review, in a new tab so a tap can never cost a run. The lichess game is
    // not lost: the review screen carries an explicit "Open in lichess" link, which is where
    // it belongs -- you go there for the engine after seeing what happened, not instead.
    // Falls back to the lichess link only if the entry somehow has no id to review by.
    const href = reviewHref(entry) || entry.url || '';
    const chip = document.createElement(href ? 'a' : 'span');
    if (href) {
      chip.href = href;
      chip.target = '_blank';
      chip.rel = 'noopener noreferrer';
    }
    chip.className = `badge ${look.cls} u-num`;
    chip.dataset.result = entry.result;
    chip.dataset.lichess = entry.url || '';
    chip.title = `${look.label} - ${entry.san || ''} (${entry.rating})`;
    chip.setAttribute('aria-label', `${entry.rating}, ${look.label}`);
    // The colour comes from the badge modifier class, which beats `a { color: var(--accent) }`
    // on specificity -- so it must NOT be set inline here or the outcome coding is lost. Only
    // the link affordances are forced: no underline, and the whole pill a reliable tap target
    // (padding included) without making the strip any taller.
    chip.style.textDecoration = 'none';
    chip.style.touchAction = 'manipulation';
    chip.style.cursor = href ? 'pointer' : 'default';
    chip.innerHTML = `${icon(look.glyph, 12)}${entry.rating}`;
    el.strip.appendChild(chip);
    while (el.strip.children.length > STRIP_MAX) el.strip.removeChild(el.strip.firstChild);

    const firstEntry = el.strip.hidden;
    el.strip.hidden = false;
    if (firstEntry) syncStageReserve();
    // Scrolling an opt-in internal container, never the page.
    el.strip.scrollLeft = el.strip.scrollWidth;
  }

  function clearStrip() {
    if (!el.strip) return;
    el.strip.textContent = '';
    el.strip.hidden = true;
    syncStageReserve();
  }

  /* ------------------------------------------------------------------------
     Prompt / answer chrome
     ---------------------------------------------------------------------- */

  function setAnswersEnabled(on) {
    for (const btn of [el.safe, el.unsafe]) {
      if (!btn) continue;
      btn.disabled = !on;
      btn.classList.remove('is-correct', 'is-wrong', 'is-dimmed');
    }
    if (el.safe) el.safe.innerHTML = `${icon('shield')} Safe<span class="answer__hint">&larr; or S</span>`;
    if (el.unsafe) el.unsafe.innerHTML = `${icon('alert')} Unsafe<span class="answer__hint">&rarr; or U</span>`;
  }

  function setPrompt({ label, san, side }) {
    if (el.promptLabel) el.promptLabel.textContent = label;
    if (el.move) {
      el.move.hidden = !san;
      el.move.textContent = san || '';
    }
    if (el.side) {
      el.side.hidden = !side;
      if (side) el.side.setAttribute('data-side', side);
    }
  }

  function clearVerdict() {
    const v = el.stage && el.stage.querySelector('.verdict');
    if (v) v.remove();
  }

  /** Verdict pill AND the frame's result ring. Swapping pills must not drop the ring. */
  function clearFeedback() {
    clearVerdict();
    if (el.frame) el.frame.classList.remove('is-correct', 'is-wrong');
  }

  function showVerdict(kind, text, delta) {
    clearVerdict();
    const node = document.createElement('div');
    node.className = `verdict verdict--${kind}`;
    node.setAttribute('role', 'status');
    const glyph = kind === 'correct' ? 'check' : kind === 'wrong' ? 'x' : 'info';
    node.innerHTML = `${icon(glyph)} ${text}` +
      (delta ? ` <span class="verdict__delta u-num">${delta}</span>` : '');
    if (el.stage) el.stage.appendChild(node);
  }

  /**
   * A dead end is the one thing this mode must never show. Any unrecoverable state gets a
   * message in the prompt and a single labelled button where the answers were.
   */
  function showBlocked(message, actionLabel, onAction) {
    accepting = false;
    clearFeedback();
    setPrompt({ label: message, san: '', side: '' });
    if (!el.actions) return;
    el.actions.innerHTML = '';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--primary btn--lg btn--block';
    btn.innerHTML = `${icon('refresh')} ${actionLabel}`;
    btn.addEventListener('click', onAction);
    el.actions.appendChild(btn);
  }

  function restoreAnswerBar() {
    if (!el.actions || el.actions.contains(el.answers)) return;
    el.actions.innerHTML = '';
    el.actions.appendChild(el.answers);
  }

  /* ------------------------------------------------------------------------
     Clock
     ---------------------------------------------------------------------- */

  function startClock() {
    if (!rules.clock || clockTimer) return;
    clockDeadline = Date.now() + clockLeft * 1000;
    clockTimer = setInterval(() => {
      if (paused) return;
      clockLeft = Math.max(0, (clockDeadline - Date.now()) / 1000);
      renderClock();
      if (clockLeft <= 0) finish('Time');
    }, 200);
  }

  function stopClock() {
    if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
  }

  /* ------------------------------------------------------------------------
     Puzzle loading
     ---------------------------------------------------------------------- */

  /**
   * Build the playable state for a record: replay the plies before the chosen window and
   * return the prompt list. Returns null when the record cannot be trusted (bad FEN, a
   * SAN that will not parse, an illegal blunder) so the caller can skip it.
   */
  function prepare(record) {
    if (!Chess) return null;
    const g = new Chess();
    if (!record || typeof record.f !== 'string' || !g.load(record.f)) return null;

    const pre = Array.isArray(record.p) ? record.p : [];
    const line = Array.isArray(record.m) ? record.m : [];
    if (!line.length) return null;

    // chooseSequence() draws a constant-hazard sequence: it may ask about the blunder
    // immediately (safeMoves 0), or decide this puzzle has NO blunder at all (allSafe), in
    // which case we must never show one -- that is the whole point of the scheme, and
    // revealing the game's blunder afterwards would put the leak straight back. Seeded off
    // the puzzle id so a given puzzle is reproducible; `data.pick` avoids repeats anyway.
    // Depth is in MOVES; `p` is in plies.
    const rng = mulberry32(seedFor(record.i));
    const { safeMoves, allSafe } = chooseSequence(record, { rng });
    const skipPlies = Math.max(0, pre.length - safeMoves * 2);

    for (let i = 0; i < skipPlies; i++) {
      if (!applySan(g, pre[i])) return null;
    }

    const list = [];
    for (let i = skipPlies; i < pre.length; i += 2) {
      list.push({ kind: 'quiet', ply: i });
    }
    if (!allSafe) list.push({ kind: 'blunder', ply: pre.length });
    if (!list.length) return null;     // nothing to ask about; take another record

    // The window, and the blunder if this puzzle has one, must be legal from the position
    // the window ends at, or the record is unusable. Probe on a throwaway copy.
    const probe = new Chess();
    if (!probe.load(g.fen())) return null;
    for (let i = skipPlies; i < pre.length; i++) {
      if (!applySan(probe, pre[i])) return null;
    }
    if (!allSafe && !applyUci(probe, line[0])) return null;

    return { game: g, prompts: list, allSafe };
  }

  /**
   * The whole puzzle as one ply-per-entry line, for the summary's review player: the quiet
   * moves the player was shown, then the blunder, then the refutation that punishes it.
   *
   * Built from the window the player ACTUALLY SAW (post-skip), not from the record's own
   * window start -- replaying plies that were never on screen would open the review somewhere
   * the player does not recognise. Every move is validated as it is added, and the line
   * truncates at the first one the position rejects, exactly where the on-board replay stops.
   */
  function buildReviewLine(startFen, record, list, noBlunder) {
    const out = [];
    if (!Chess) return out;
    const g = new Chess();
    if (!g.load(startFen)) return out;

    const pre = Array.isArray(record.p) ? record.p : [];
    const skip = list && list[0] ? list[0].ply : pre.length;
    for (let i = skip; i < pre.length; i++) {
      const mv = applySan(g, pre[i]);
      if (!mv) return out;
      out.push({ uci: mv.from + mv.to + (mv.promotion || ''), san: mv.san, tag: 'quiet' });
    }

    // An all-safe puzzle genuinely has no blunder. Appending the game's real one here would
    // leak, in the review, precisely the tell the constant-hazard draw exists to remove.
    if (noBlunder) return out;

    const line = Array.isArray(record.m) ? record.m : [];
    for (let i = 0; i < line.length; i++) {
      const mv = applyUci(g, line[i]);
      if (!mv) break;
      out.push({
        uci: mv.from + mv.to + (mv.promotion || ''),
        san: mv.san,
        tag: i === 0 ? 'blunder' : 'refutation',
      });
    }
    return out;
  }

  /** The move the player is being asked about, resolved against the live position. */
  function currentMove() {
    const p = prompts[promptIndex];
    if (!p || !game) return null;
    const probe = new Chess();
    if (!probe.load(game.fen())) return null;
    const mv = p.kind === 'quiet'
      ? applySan(probe, puzzle.p[p.ply])
      : applyUci(probe, puzzle.m[0]);
    if (!mv) return null;
    return {
      from: mv.from, to: mv.to, san: mv.san, piece: mv.piece, flags: mv.flags,
      promotion: mv.promotion, colour: mv.color,
      uci: p.kind === 'quiet' ? null : puzzle.m[0],
    };
  }

  async function loadPuzzle(token) {
    accepting = false;
    setAnswersEnabled(false);
    clearFeedback();
    restoreAnswerBar();
    setPrompt({ label: 'Loading', san: '', side: '' });

    for (let attempt = 0; attempt < MAX_PUZZLE_ATTEMPTS; attempt++) {
      let record = null;
      try {
        // A rush RAMPS across the whole rating range (650 -> 2000+ in one run), so the
        // per-band shards are the wrong source: a 30-solve run would pull 16 bands /
        // ~11MB, fetched just-in-time as the ramp climbs, stalling the game mid-run on a
        // slow connection. `pickLadder` serves from one small cross-band pack instead,
        // and still prefers a full band when one happens to be resident.
        // Practice pins to a single band, so it uses the normal banded path.
        const sweeps = variantName !== 'practice' && typeof ctx.data.pickLadder === 'function';
        record = sweeps ? await ctx.data.pickLadder(pickTarget())
          : await ctx.data.pick(pickTarget());
      } catch (err) {
        if (token !== runId || destroyed) return;
        showBlocked('Puzzles unavailable offline', 'Try again', () => { void loadPuzzle(runId); });
        toast('Could not reach the puzzle data', 'error');
        return;
      }
      if (token !== runId || destroyed) return;

      if (!record) {
        showBlocked('No puzzle at this rating', 'Try again', () => { void loadPuzzle(runId); });
        return;
      }

      const built = prepare(record);
      if (!built) continue;   // corrupt record: quietly take the next one

      puzzle = record;
      game = built.game;
      prompts = built.prompts;
      allSafe = built.allSafe;
      promptIndex = 0;
      rated = false;
      ratingDelta = 0;
      windowFen = game.fen();
      windowStartPly = prompts[0] ? prompts[0].ply : 0;
      reviewLine = buildReviewLine(windowFen, record, prompts, allSafe);

      // A new puzzle is an unrelated position, so it is set rather than animated -- there
      // is no move to be legible. Every move WITHIN a puzzle animates.
      const mover = game.turn() === 'w' ? 'white' : 'black';
      const side = perspective === 'opponent'
        ? (mover === 'white' ? 'black' : 'white')
        : mover;
      puzzleOrientation = side;
      board.setOrientation(side);
      if (typeof board.randomSeat === 'function') {
        // The 3D board varies the camera seat per puzzle; seeding off the id keeps a given
        // puzzle reproducible. The 2D board has no seat, hence the feature check.
        try { seat = board.randomSeat(seedFor(record.i)) || null; } catch { seat = null; }
      }
      // Another mode may have left a square-tap handler on the shared board; this game
      // answers with two buttons and must not inherit one.
      if (typeof board.setSquareTapHandler === 'function') {
        try { board.setSquareTapHandler(null); } catch { /* noop */ }
      }
      board.clearArrows();
      clearJustPlayed();              // new puzzle: nothing carries over
      board.clearHighlights();
      await board.setPosition(game.fen(), { animate: false });
      if (token !== runId || destroyed) return;

      showPrompt(token);
      return;
    }

    showBlocked('Puzzle data looks damaged', 'Try again', () => { void loadPuzzle(runId); });
  }

  function showPrompt(token) {
    if (token !== runId || destroyed) return;
    const mv = currentMove();
    if (!mv) {
      // Should be impossible after prepare(), but never leave a dead board.
      void loadPuzzle(token);
      return;
    }
    clearFeedback();
    // Deliberately NOT clearHighlights() with no argument: the 'hint' squares showing what
    // just moved must survive into this prompt and time out on their own.
    board.clearHighlights('move');
    board.clearHighlights('success');
    board.clearHighlights('error');
    board.clearArrows();
    if (promptStyle === 'highlight') {
      yieldJustPlayedTo([mv.from, mv.to]);
      board.highlight([mv.from, mv.to], 'move');
      // No arrow. Lighting both squares already says everything the arrow would, and in 3D
      // the arrow is a solid object lying across the board -- it occludes squares and pieces
      // in a mode whose entire purpose is reading the position. Redundant information that
      // costs visibility is worse than no information.
    }
    // A longer prompt can wrap on a narrow phone; re-measure before the board is judged.
    setPrompt({
      label: 'Next move',
      // 'notation' has to name the origin square as well -- with nothing lit on the board,
      // "Nxd5" alone would leave the player hunting for which knight is being asked about.
      san: promptStyle === 'notation' ? longAlgebraic(mv) : mv.san,
      side: mv.colour === 'w' ? 'white' : 'black',
    });
    renderMeta();
    syncStageReserve();
    setAnswersEnabled(true);
    accepting = true;
    promptShownAt = Date.now();
  }

  /* ------------------------------------------------------------------------
     "What just moved"

     At a real board you watch your opponent's hand. Hiding what was just played is harder
     than life in a way that trains nothing -- it makes you reconstruct something you would
     simply have seen, and at a low 3D seat with pieces occluding each other that costs real
     clock. So auto-played moves (the one you called safe, and the reply) stay lit briefly.

     The move you are being ASKED about is a different thing and is untouched by this: it
     stays governed by promptStyle, so in 'notation' the board still says nothing and you
     locate the squares yourself. The two are never ambiguous -- the prompted move uses the
     'move' kind, what just moved uses 'hint', and this one clears itself after a beat.
     There is no fade, so there is nothing for prefers-reduced-motion to suppress.
     ---------------------------------------------------------------------- */

  const JUST_PLAYED_MS = 1800;   // long enough to read across a new prompt appearing
  let justPlayedTimer = null;
  let justPlayedSquares = [];

  function showJustPlayed(squares, ms = JUST_PLAYED_MS) {
    if (!squares || !squares.length) return;
    justPlayedSquares = squares.slice();
    board.highlight(squares, 'hint');
    if (justPlayedTimer) { clearTimeout(justPlayedTimer); timers.delete(justPlayedTimer); }
    justPlayedTimer = null;
    if (!Number.isFinite(ms)) return;            // caller will clear it explicitly
    const t = setTimeout(() => {
      timers.delete(t);
      justPlayedTimer = null;
      if (!destroyed) board.clearHighlights('hint');
    }, ms);
    justPlayedTimer = t;
    timers.add(t);
  }

  function clearJustPlayed() {
    if (justPlayedTimer) { clearTimeout(justPlayedTimer); timers.delete(justPlayedTimer); }
    justPlayedTimer = null;
    justPlayedSquares = [];
    try { board.clearHighlights('hint'); } catch { /* board may be gone */ }
  }

  /**
   * A square that was just played can also be a square the NEXT prompted move uses. 'hint'
   * outranks 'move' in the renderer's precedence, so leaving both would hide the prompt --
   * the more important of the two -- behind the fading context marker. Give the square to the
   * prompt and drop it from the just-played set.
   */
  function yieldJustPlayedTo(squares) {
    if (!justPlayedSquares.length) return;
    const rest = justPlayedSquares.filter((sq) => !squares.includes(sq));
    if (rest.length === justPlayedSquares.length) return;
    justPlayedSquares = rest;
    board.highlight(rest, 'hint');            // empty list simply clears the kind
  }

  /* ------------------------------------------------------------------------
     Answering
     ---------------------------------------------------------------------- */

  /**
   * One result per puzzle, never two -- rating the same puzzle twice corrupts the estimate.
   *
   * Two separate things happen here. The Glicko rating gets the result (that is the
   * across-sessions number, and it moves both ways). The RAMP only ever climbs, and only on
   * a clean solve: a rush that got easier after a mistake would defeat its own point, and
   * strikes are what end the run.
   */
  function ratePuzzle(s) {
    if (rated || !puzzle) return;
    rated = true;

    if (rules.drift) {
      const puzzleRating = Number(puzzle.r) || Math.round(served);
      if (ratingEngine && typeof ratingEngine.record === 'function') {
        try { ratingEngine.record(puzzleRating, s); } catch { /* keep playing */ }
        syncRating();
      } else {
        playerRating = clamp(playerRating + (s >= 1 ? DRIFT_UP : -DRIFT_DOWN), ratingFloor, ratingCeil);
      }
      if (s >= 1) {
        const before = served;
        served = clamp(served + rampStep(), ratingFloor, ratingCeil);
        ratingDelta = Math.round(served - before);
      } else {
        ratingDelta = 0;
      }
    }
    pushHeader();
  }

  function logAnswer(mv, chosenSafe, truthSafe, correct, scored) {
    const result = correct ? 'correct' : (truthSafe ? 'missed' : 'blunder');
    const fenBefore = game ? game.fen() : '';
    const ms = Math.max(0, Date.now() - promptShownAt);

    // Persisted through the shell. The viewpoint rides along: whether a low, unfamiliar 3D
    // seat costs accuracy or speed is only answerable if the seat is stored with the answer.
    recordStat(meta.id, {
      id: puzzle.i,
      rating: puzzle.r,
      served: Math.round(served),
      playerRating: Math.round(playerRating),
      variant: variantName,
      kind: truthSafe ? 'quiet' : 'blunder',
      allSafe,
      correct,
      chosen: chosenSafe ? 'safe' : 'unsafe',
      scored: scored == null ? null : scored,   // what went to rating.record(), if anything
      ms,
      promptStyle,
      perspective,
      framing,
      orientation: board.getOrientation ? board.getOrientation() : null,
      elevation: seat && Number.isFinite(seat.elevation) ? seat.elevation : null,
      yaw: seat && Number.isFinite(seat.yaw) ? seat.yaw : null,
      themes: puzzle.t || '',
    });

    history.push({
      id: puzzle.i,
      rating: puzzle.r,
      url: deepLink(puzzle.u, fenBefore),
      gameUrl: puzzle.u || '',
      san: mv ? mv.san : '',
      ply: plyFromFen(fenBefore),
      themes: puzzle.t || '',
      chosen: chosenSafe ? 'safe' : 'unsafe',
      truth: truthSafe ? 'safe' : 'unsafe',
      allSafe,
      correct,
      result,
      title: correct
        ? `Correct - ${truthSafe ? 'safe' : 'unsafe'}`
        : (truthSafe ? 'Called a safe move unsafe' : 'Missed a blunder'),
      ms,

      /*
       * For the summary's review player. It opens on the exact position this question was
       * asked about -- the one the player judged -- so stepping forward from there is the
       * answer to "why was that a blunder?". Entries are per ANSWER, so two prompts in the
       * same puzzle share the line but focus different plies.
       *
       * The objects are copied per entry so nothing downstream can reach back and mutate the
       * line the other entries of this puzzle are pointing at.
       */
      review: {
        fen: windowFen,
        moves: reviewLine.map((m) => ({ ...m })),
        focusPly: Math.max(0, (prompts[promptIndex] ? prompts[promptIndex].ply : windowStartPly) - windowStartPly),
        orientation: puzzleOrientation,
      },
    });

    // One chip per PUZZLE, added the moment it resolves.
    if (scored != null) addStripEntry(history[history.length - 1]);
  }

  async function answer(chosenSafe) {
    if (!accepting || destroyed || finished) return;
    accepting = false;
    const token = runId;

    const prompt = prompts[promptIndex];
    const truthSafe = prompt.kind === 'quiet';
    const correct = chosenSafe === truthSafe;
    const mv = currentMove();

    setAnswersEnabled(false);
    const chosenBtn = chosenSafe ? el.safe : el.unsafe;
    const otherBtn = chosenSafe ? el.unsafe : el.safe;
    if (chosenBtn) {
      chosenBtn.classList.add(correct ? 'is-correct' : 'is-wrong');
      // The button restates the RESULT, not its own label, so the icon swaps too.
      chosenBtn.innerHTML = `${icon(correct ? 'check' : 'x')} ${chosenSafe ? 'Safe' : 'Unsafe'}`;
    }
    if (otherBtn) otherBtn.classList.add('is-dimmed');

    // A puzzle ends on any wrong answer, on the blunder prompt, or -- for an all-safe
    // puzzle -- when the last quiet move is correctly called safe. A finished puzzle is
    // rated exactly once: clean sweep = 1, anything else = 0. There is no hint and no retry
    // in this game, so the 0.5 case never arises.
    const lastPrompt = promptIndex === prompts.length - 1;
    const puzzleOver = !correct || !truthSafe || lastPrompt;
    const scored = puzzleOver ? (correct ? 1 : 0) : null;
    if (puzzleOver) ratePuzzle(scored);

    logAnswer(mv, chosenSafe, truthSafe, correct, scored);

    if (correct) {
      score += 1;
      correctCount += 1;
      streak += 1;
      bestStreak = Math.max(bestStreak, streak);
      renderScore(true);
      if (el.frame) el.frame.classList.add('is-correct');
      board.flash('success');
      // The verdict replaces the prompt's ambient 'move' marking on those squares rather
      // than stacking on top of it -- one meaning per square.
      if (mv) { board.clearHighlights('move'); board.highlight([mv.from, mv.to], 'success'); }
      haptic('success');
      sound('ding');
      showVerdict(
        'correct',
        !truthSafe ? 'Correct - blunder'
          : (puzzleOver ? 'Correct - all safe' : 'Correct - safe'),
        '+1',
      );
    } else {
      wrongCount += 1;
      streak = 0;
      strikes += 1;
      renderStrikes(true);
      if (el.frame) el.frame.classList.add('is-wrong');
      board.flash('error');
      if (mv) { board.clearHighlights('move'); board.highlight([mv.from, mv.to], 'error'); }
      haptic('error');
      sound('buzz');
      showVerdict('wrong', truthSafe ? 'It was safe' : 'Blunder - watch the reply');
    }
    renderMeta();

    if (!(await sleep(FEEDBACK_MS, token))) return;

    if (correct && truthSafe) {
      // Plays the move (and the reply), then either asks the next prompt or -- if that was
      // the last one of an all-safe puzzle -- moves on to a new puzzle.
      await advanceQuiet(token);
      return;
    }

    // Every other outcome ends the puzzle by showing what the position was actually
    // hiding: the rest of the quiet window (if the player bailed out early), the blunder,
    // and the refutation.
    await revealSolution(token);
    if (token !== runId || destroyed) return;

    if (Number.isFinite(rules.strikes) && strikes >= rules.strikes) {
      finish('Strikes');
      return;
    }
    await loadPuzzle(token);
  }

  /** Correct SAFE call: play the quiet move and the reply, then ask about the next one. */
  async function advanceQuiet(token) {
    const prompt = prompts[promptIndex];
    const pre = puzzle.p;
    clearFeedback();

    const first = applySan(game, pre[prompt.ply]);
    if (!first) { await loadPuzzle(token); return; }
    board.clearArrows();
    board.clearHighlights('move');
    board.clearHighlights('success');
    board.clearHighlights('error');
    await board.animateMove(first.from, first.to, { fen: game.fen() });
    if (token !== runId || destroyed) return;
    let played = [first.from, first.to];
    showJustPlayed(played);

    const replyIdx = prompt.ply + 1;
    if (replyIdx < pre.length) {
      if (!(await sleep(QUIET_REPLY_MS, token))) return;
      const reply = applySan(game, pre[replyIdx]);
      if (!reply) { await loadPuzzle(token); return; }
      await board.animateMove(reply.from, reply.to, { fen: game.fen() });
      if (token !== runId || destroyed) return;
      // Both moves stay lit: what you allowed AND what it was answered with.
      played = played.concat([reply.from, reply.to]);
      showJustPlayed(played);
    }

    promptIndex += 1;
    if (promptIndex >= prompts.length) { await loadPuzzle(token); return; }
    showPrompt(token);
  }

  /**
   * Play out the truth: any remaining quiet plies, then the blunder and the engine line
   * that punishes it. This is the part the old version got wrong -- it fired the solution
   * from whatever position was on screen, which is illegal when the player answered
   * "unsafe" on a quiet move partway through the window.
   */
  async function revealSolution(token) {
    const prompt = prompts[promptIndex];
    const pre = Array.isArray(puzzle.p) ? puzzle.p : [];

    if (prompt.kind === 'quiet') {
      showVerdict('neutral', allSafe ? 'All of these were safe' : 'Here is what really happened');
      board.clearHighlights('success');
      board.clearHighlights('error');
      for (let i = prompt.ply; i < pre.length; i++) {
        const mv = applySan(game, pre[i]);
        if (!mv) return;
        board.clearArrows();
        board.clearHighlights('move');
        await board.animateMove(mv.from, mv.to, { fen: game.fen() });
        if (token !== runId || destroyed) return;
        showJustPlayed([mv.from, mv.to], Infinity);
        if (!(await sleep(QUIET_REPLY_MS, token))) return;
      }
    }

    // An all-safe puzzle has no refutation to show, and showing the game's actual blunder
    // anyway would hand back exactly the "it always ends in a blunder" tell that the
    // constant-hazard sequence exists to remove.
    if (allSafe) { clearFeedback(); return; }

    showVerdict('neutral', 'Replaying the refutation');
    board.clearArrows();
    board.clearHighlights('move');
    // Drop the answer verdict before the replay marks the blunder. Identifying the blunder
    // correctly leaves 'success' on exactly the squares the replay is about to mark 'error',
    // and "you were right" plus "this is the mistake" on one square is a contradiction no
    // precedence rule can resolve -- the replay's meaning is the one that belongs here.
    board.clearHighlights('success');
    board.clearHighlights('error');
    clearJustPlayed();
    const line = Array.isArray(puzzle.m) ? puzzle.m : [];
    for (let i = 0; i < line.length; i++) {
      const mv = applyUci(game, line[i]);
      if (!mv) break;              // truncated/foreign line: show what we could and move on
      // The blunder's own squares stay lit in 'error' for the whole replay -- it is the
      // thing being explained, so it should not scroll off under the moves that punish it.
      // Each following move is lit as it lands, and only the previous one is dropped.
      if (i > 0) board.clearHighlights('hint');
      await board.animateMove(mv.from, mv.to, { fen: game.fen() });
      if (token !== runId || destroyed) return;
      board.highlight([mv.from, mv.to], i === 0 ? 'error' : 'hint');
      if (!(await sleep(REPLAY_STEP_MS, token))) return;
    }
    clearFeedback();
    board.clearHighlights('hint');
    board.clearHighlights('error');
  }

  /* ------------------------------------------------------------------------
     Countdown, start, finish
     ---------------------------------------------------------------------- */

  function removeOverlay() {
    if (overlay) { overlay.remove(); overlay = null; }
  }

  async function countdown(token) {
    removeOverlay();
    overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'assertive');
    overlay.innerHTML = `
      <div class="countdown">
        <div class="countdown__num u-num" data-br="count">3</div>
        <div class="countdown__label">${meta.title}</div>
      </div>`;
    root.appendChild(overlay);
    const num = overlay.querySelector('[data-br="count"]');

    for (const step of ['3', '2', '1', 'Go']) {
      if (token !== runId || destroyed) { removeOverlay(); return false; }
      num.textContent = step;
      num.classList.toggle('countdown__num--go', step === 'Go');
      // restart the tick animation
      num.style.animation = 'none';
      void num.offsetWidth;
      num.style.animation = '';
      sound(step === 'Go' ? 'go' : 'tick');
      haptic('light');
      if (!(await sleep(COUNTDOWN_STEP_MS, token))) { removeOverlay(); return false; }
    }
    removeOverlay();
    return true;
  }

  async function start() {
    const token = runId;
    startedAt = Date.now();
    startLevel = Math.round(served);
    renderScore(false);
    renderStrikes(false);
    renderClock();
    renderMeta();
    pushHeader();

    // Warm the bands around us so the first answer is not spent waiting on a download.
    //
    // ONLY for practice, which sits in one band. A rush ramps across the whole range and is
    // served from the ladder pack, so prefetching bands here would download ~2.4MB of shards
    // the run will never open -- the exact cost the ladder exists to remove.
    if (variantName === 'practice') {
      try { ctx.data.prefetchAround && ctx.data.prefetchAround(Math.round(served)); } catch { /* noop */ }
    } else {
      try { ctx.data.ensureLadder && ctx.data.ensureLadder(); } catch { /* noop */ }
    }

    if (!Chess) {
      showBlocked('Chess engine failed to load', 'Reload', () => { void start(); });
      return;
    }

    await loadPuzzle(token);
    if (token !== runId || destroyed) return;

    if (rules.clock) {
      const wasAccepting = accepting;
      accepting = false;
      setAnswersEnabled(false);
      const ok = await countdown(token);
      if (!ok || token !== runId || destroyed) return;
      if (wasAccepting) { setAnswersEnabled(true); accepting = true; promptShownAt = Date.now(); }
      startClock();
    }
  }

  function finish(reason) {
    if (finished || destroyed) return;
    finished = true;
    accepting = false;
    runId += 1;                     // strand any replay still in flight
    clearTimers();
    stopClock();
    removeOverlay();
    setAnswersEnabled(false);

    const answered = correctCount + wrongCount;
    const accuracy = answered ? Math.round((correctCount / answered) * 100) : 0;
    const prevBest = previousBest();
    const best = Math.max(prevBest, score);
    const durationMs = startedAt ? Date.now() - startedAt : 0;

    // `playerRating` is the number that persists between sessions; `level` is how far the
    // ramp climbed in this run, which is a score in its own right.
    recordStat(`${meta.id}.run`, {
      variant: variantName,
      score,
      level: Math.round(served),
      playerRating: Math.round(playerRating),
      startLevel,
      correct: correctCount,
      wrong: wrongCount,
      accuracy,
      bestStreak,
      strikes,
      durationMs,
      reason: reason || 'end',
      promptStyle,
      perspective,
      framing,
    });

    const summary = {
      score,
      best,
      history,
      headline: reason === 'Time' ? "Time's up" : reason === 'Strikes' ? 'Three strikes' : 'Run complete',
      mode: meta.id,
      variant: variantName,
      rating: Math.round(playerRating),   // the standing rating; the shell persists this
      level: Math.round(served),          // how far the ramp climbed before the run ended
      startLevel,
      correct: correctCount,
      wrong: wrongCount,
      accuracy,
      bestStreak,
      strikes,
      durationMs,
      promptStyle,
      perspective,
      framing,
      isBest: score > prevBest,
    };
    try { ctx.onFinish && ctx.onFinish(summary); } catch { /* the shell's problem */ }
  }

  /* ------------------------------------------------------------------------
     Input
     ---------------------------------------------------------------------- */

  const onSafe = () => { void answer(true); };
  const onUnsafe = () => { void answer(false); };
  if (el.safe) el.safe.addEventListener('click', onSafe);
  if (el.unsafe) el.unsafe.addEventListener('click', onUnsafe);

  // Orientation change or a software keyboard closing changes the stage's height, and the
  // reserve is measured, so it has to be re-measured. rAF-coalesced: resize fires in bursts.
  let resizePending = false;
  function onResize() {
    if (resizePending || destroyed) return;
    resizePending = true;
    requestAnimationFrame(() => {
      resizePending = false;
      if (!destroyed) syncStageReserve();
    });
  }
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);

  function onKey(ev) {
    if (ev.defaultPrevented || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const k = ev.key.toLowerCase();
    if (k === 'arrowleft' || k === 's') { ev.preventDefault(); onSafe(); }
    else if (k === 'arrowright' || k === 'u') { ev.preventDefault(); onUnsafe(); }
  }
  window.addEventListener('keydown', onKey);

  /* ------------------------------------------------------------------------
     Handle
     ---------------------------------------------------------------------- */

  void start();

  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      runId += 1;
      clearTimers();
      stopClock();
      removeOverlay();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      if (el.safe) el.safe.removeEventListener('click', onSafe);
      if (el.unsafe) el.unsafe.removeEventListener('click', onUnsafe);
      try {
        board.clearHighlights();
        board.clearArrows();
      } catch { /* board may already be gone */ }
      // Hand the board back exactly where the shell had it.
      if (boardEl && boardHome && boardHome.parent && boardHome.parent.isConnected) {
        boardHome.parent.insertBefore(boardEl, boardHome.next);
      }
      for (const cls of addedRootClasses) root.classList.remove(cls);
    },

    pause() {
      paused = true;
      if (clockTimer) { clockLeft = Math.max(0, (clockDeadline - Date.now()) / 1000); }
      stopClock();
    },

    resume() {
      paused = false;
      if (rules.clock && !finished && !destroyed && clockLeft > 0) startClock();
    },

    restart() {
      if (destroyed) return;
      runId += 1;
      clearTimers();
      stopClock();
      removeOverlay();
      finished = false;
      score = 0; strikes = 0; streak = 0; bestStreak = 0;
      correctCount = 0; wrongCount = 0;
      history = [];
      puzzle = null; game = null; prompts = []; promptIndex = 0;
      rated = false; ratingDelta = 0; seat = null; allSafe = false;
      windowFen = ''; windowStartPly = 0; reviewLine = [];
      clockLeft = rules.clock;
      paused = false;
      playerRating = storedRating();
      served = openingDifficulty();   // a restart is a new run: back to the bottom of the ramp
      clearStrip();
      restoreAnswerBar();
      clearFeedback();
      renderScore(false);
      renderStrikes(false);
      renderClock();
      renderMeta();
      void start();
    },

    // Not part of the contract; the standalone harness reads it to assert state.
    get debug() {
      return {
        variant: variantName, promptStyle, perspective, framing, score, strikes, streak,
        served: Math.round(served), playerRating: Math.round(playerRating), ratingDelta, rated,
        puzzleRating: puzzle ? puzzle.r : null, allSafe, promptCount: prompts.length,
        strip: el.strip ? Array.from(el.strip.children).map((c) => ({
          result: c.dataset.result, text: c.textContent.trim(), tag: c.tagName,
        })) : [],
        accepting, finished, promptIndex,
        promptKind: prompts[promptIndex] ? prompts[promptIndex].kind : null,
        puzzleId: puzzle ? puzzle.i : null,
        fen: game ? game.fen() : null,
        history: history.slice(),
        clockLeft,
      };
    },
  };
}
