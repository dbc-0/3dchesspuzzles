/**
 * Shared contract for game modes.
 *
 * The shell owns navigation, the board, settings and persistence. A mode owns exactly one
 * thing: what happens during play. It mounts its own UI into `ctx.root` using the design
 * system's classes, drives `ctx.board`, and calls `ctx.onFinish(summary)` when it ends.
 *
 * Modes must never construct a board, touch the service worker, or write to localStorage
 * directly -- ask the shell. That keeps 2D/3D swapping and offline behaviour in one place.
 *
 * @typedef {import('./board-interface.js')} BoardModule
 *
 * @typedef {Object} Puzzle
 * @property {string}   i  puzzle id
 * @property {number}   r  lichess rating
 * @property {string}   f  FEN at the START of the quiet window
 * @property {string[]} p  quiet pre-moves in SAN, played from `f`
 * @property {string[]} m  the blunder (m[0]) then the solution line, in UCI
 * @property {number}   d  verified safe depth: how many of `p` are engine-checked quiet
 * @property {number}   e  eval at the window start, centipawns, mover's POV
 * @property {string}   u  lichess game url
 * @property {string}   t  space-separated lichess themes
 *
 * @typedef {Object} ModeContext
 * @property {HTMLElement} root      mount your UI here; the shell empties it on exit
 * @property {Object}      board     a live BoardHandle (2D or 3D per user settings)
 * @property {HTMLElement} boardEl   the element the board occupies, for sizing/visibility
 * @property {Object}      data      the data layer (see data.js)
 * @property {Object}      settings  current user settings, read-only snapshot.
 *                                   Includes `promptStyle`: 'highlight' | 'notation'.
 *                                   See PROMPT STYLE below -- it matters for training value.
 * @property {Object}      config    mode config chosen on the setup screen,
 *                                   e.g. {variant:'timed'|'survival'|'practice', band:1200}
 * @property {Object}      ui        {toast, confirm, haptic, sound, setHeader}
 * @property {Object}      stats     {record(kind, payload), query(kind)} -- see below
 * @property {Object}      rating    the Glicko puzzle-rating engine from rating.js, already
 *                                   bound to the current bucket. See RATING below.
 * @property {(summary: ModeSummary) => void} onFinish
 *
 * PROMPT STYLE
 * ------------
 * 'highlight' shows the prompted move's from/to squares on the board. Fast, and equivalent
 * to what an online board gives you.
 * 'notation' gives ONLY algebraic notation -- the user must locate the squares themselves.
 * This is the default in 3D, deliberately: online chess hands you last-move highlighting,
 * legal-move dots and coordinates, and leaning on those is a large part of why board vision
 * doesn't transfer over the board. Making the user find "Nf3-e5" on a 3D board from an
 * unfamiliar seat trains square location, piece identification and geometry at once.
 *
 * STATS
 * -----
 * Modes never touch localStorage; the shell owns persistence. Call
 * `ctx.stats.record(kind, payload)` with plain JSON. For the vision drills specifically,
 * record every answer with the CAMERA SEAT and BOARD ORIENTATION alongside correctness and
 * latency -- the point is to test whether reading the board from a low, unfamiliar seat is
 * genuinely slower than top-down, and whether that gap closes with practice. Without the
 * viewpoint attached the data can't answer that question.
 *   e.g. stats.record('drill', {drill:'square', correct:true, ms:1840,
 *                               elevation:31, yaw:-12, orientation:'black'})
 *
 * RATING
 * ------
 * Solving modes are rated, Chesstempo-style, using the lichess rating attached to each
 * puzzle. The user carries a separate rating per mode x board x promptStyle bucket, so the
 * gap between the 2D and 3D buckets measures the board-vision deficit in Elo points.
 *
 *   ctx.rating.nextTarget()             -> {rating, spread} to pass to data.pick()
 *   ctx.rating.record(puzzleRating, s)  -> s is 1 solved cleanly, 0 failed, 0.5 with a hint
 *
 * Serve puzzles at nextTarget() rather than at a fixed band, or the rating never converges.
 * Record exactly one result per puzzle -- rating the same puzzle twice corrupts the estimate.
 *
 * @typedef {Object} ModeSummary
 * @property {number}  score
 * @property {number}  [best]
 * @property {Array}   history   per-puzzle results for the game-over review list
 * @property {string}  [headline]
 *
 * @typedef {Object} ModeHandle
 * @property {() => void} destroy   remove listeners/timers; the shell then empties root
 * @property {() => void} [pause]   called when the app is backgrounded
 * @property {() => void} [resume]
 * @property {() => void} [restart] called by the shell's in-game restart control
 */

/** Throws if a mode handle is missing part of the contract. */
export function assertModeHandle(handle) {
  if (!handle || typeof handle.destroy !== 'function') {
    throw new Error('ModeHandle must expose destroy()');
  }
  return handle;
}

/**
 * Decide the safe/unsafe sequence for one puzzle.
 *
 * THE PROBLEM THIS SOLVES
 * -----------------------
 * The obvious approaches all leak the answer. The original app drew plies from {0,2,4},
 * giving 0/1/2 quiet moves at 30/40/30% -- so P(this prompt is safe) fell from 70% to 43%,
 * and after two safe answers the third was GUARANTEED to be the blunder. A uniform draw over
 * 0..d has the same defect in gentler form. In every such scheme the hazard rate climbs with
 * depth, because the puzzle always ends in a blunder, so "deeper than usual" always means
 * "closer to it". That teaches a meta-pattern with no counterpart in real chess, where the
 * chance your next move blunders does not depend on how many good moves you just played.
 *
 * THE FIX -- two parts, both required
 * -----------------------------------
 * 1. Constant hazard: at EVERY prompt, the probability that this one is the blunder is
 *    exactly `hazard`, independent of how deep you are. Memoryless, so counting tells you
 *    nothing.
 * 2. All-safe sequences: if the hazard never fires, the puzzle simply ENDS with no blunder
 *    at all. Without this, running out of verified quiet moves would force a blunder and
 *    reintroduce the leak at the deepest prompt. It also makes answering "safe" a real
 *    judgement rather than a delay before the real question.
 *
 * Never exceeds `puzzle.d`, the depth the engine actually verified as quiet.
 *
 * @returns {{safeMoves:number, allSafe:boolean}} how many quiet moves to prompt before the
 *          blunder, and whether this puzzle ends safely with no blunder at all.
 */
export function chooseSequence(puzzle, { hazard = 0.5, rng = Math.random } = {}) {
  // hazard 0.5 is deliberate: it makes every prompt an exact coin flip, so neither "safe"
  // nor "unsafe" is the statistically better guess. Any other value hands the player a
  // free edge from always answering the more common one.
  const d = Math.max(0, Math.min(puzzle.d | 0, (puzzle.p || []).length >> 1));
  // d+1 prompts are possible: d quiet moves, then the blunder. Draw at each one.
  for (let i = 0; i <= d; i++) {
    if (rng() < hazard) return { safeMoves: i, allSafe: false };
  }
  return { safeMoves: d, allSafe: true };
}

/** @deprecated use chooseSequence -- a bare count cannot express an all-safe puzzle. */
export function chooseWindow(puzzle, rng = Math.random) {
  return chooseSequence(puzzle, { rng }).safeMoves;
}

/** Deterministic 32-bit hash -> seed, so a puzzle always gets the same camera seat. */
export function seedFor(id) {
  let h = 2166136261;
  for (let i = 0; i < String(id).length; i++) {
    h ^= String(id).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
