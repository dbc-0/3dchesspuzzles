/**
 * Shared board-renderer contract.
 *
 * `board2d.js` and `board3d.js` each export `createBoard(container, options)` returning
 * an object with exactly the shape described below. The app swaps renderers by swapping
 * the import -- no other code changes. This is what lets 3D support highlights, arrows
 * and animation that the old chessboard3 library could not express at all.
 *
 * PLANNED THIRD RENDERER: `boardvr.js`, giving every mode a VR option (`board` becomes
 * '2d' | '3d' | 'vr', and is already a rating axis, so the three become directly
 * comparable). It is a WebXR session on top of the same three.js scene -- the Quest
 * browser supports immersive-vr, immersive-ar passthrough, plane detection and hand
 * tracking, so this stays a web app on the existing hosting rather than becoming a
 * native one. A virtual board on a virtual (or passthrough) desk; no attempt to detect
 * or align to a real physical board, which costs a hard computer-vision problem and buys
 * nothing a rendered board doesn't already give.
 *
 * Notes for whoever builds it, since parts of this contract change meaning in VR:
 *   - Orbit stops being a gesture and becomes literally leaning. That is the point: the
 *     "lean to see round an occluding piece" mechanic that 2D and 3D can only approximate
 *     is simply real, with true stereo depth and 6DOF parallax.
 *   - setSeat/randomSeat still apply, but by placing the BOARD relative to the player
 *     rather than moving a camera -- the head is the camera. Varying the board's height
 *     and angle preserves the same training value.
 *   - setSquareTapHandler and onMove need a controller raycast or hand-tracked point.
 *     Tap-tap remains the input model (see onMove below).
 *   - resize() has no meaningful job; the XR session owns the viewport.
 *
 * Rules both implementations must follow:
 *   - ES module. No jQuery, no CDN, no build step. Everything resolves offline.
 *   - Mobile-first. Touch targets and gestures come first; mouse is the fallback.
 *   - Device-pixel-ratio aware; crisp on retina, and correct after orientation change.
 *   - All colour comes from the CSS custom properties listed in TOKENS below, so the
 *     design system can restyle both renderers without either being touched.
 *   - Never throw on an illegal/unknown square; ignore it.
 *
 * @typedef {'a1'|string} Square  algebraic, 'a1'..'h8'
 * @typedef {'white'|'black'} Side
 * @typedef {'move'|'select'|'error'|'success'|'hint'} HighlightKind
 */

/** CSS custom properties both renderers read. The design system owns their values. */
export const TOKENS = [
  '--board-light',          // light square fill
  '--board-dark',           // dark square fill
  '--board-edge',           // board border / rim
  '--hl-move',              // last-move / prompted-move highlight
  '--hl-select',            // user selection
  '--hl-error',             // wrong answer feedback
  '--hl-success',           // right answer feedback
  '--hl-hint',              // hint / solution replay
  '--arrow',                // arrow colour
  '--piece-white',          // 3D white piece material / 2D fill
  '--piece-black',
  '--board-coord-on-light', // rank/file label ink, on a light square
  '--board-coord-on-dark',  // ...and on a dark square
];

/**
 * Coordinate labels must use the two --board-coord-* tokens, NOT the opposite square's fill.
 * Drawing a label in the other square's colour is the usual convention and it fails here: at
 * the current board values it measures 2.2:1 against its own square, which is not legible at
 * label size. A mid-tone dark square caps that trick at roughly 3:1 no matter what colour you
 * pick, so the ink has to be chosen independently of the square palette.
 */

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
export const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'];

/** 'e4' -> {file:4, rank:3} (0-indexed from a1). Returns null if malformed. */
export function parseSquare(sq) {
  if (typeof sq !== 'string' || sq.length !== 2) return null;
  const f = FILES.indexOf(sq[0]), r = RANKS.indexOf(sq[1]);
  return f < 0 || r < 0 ? null : { file: f, rank: r };
}

/** {file,rank} -> 'e4' */
export function toSquare(file, rank) {
  return FILES[file] + RANKS[rank];
}

/** Expand a FEN's board field into { e4: 'wP', ... }. Ignores everything after the board. */
export function fenToMap(fen) {
  const out = {};
  const board = String(fen).split(' ')[0];
  const rows = board.split('/');
  if (rows.length !== 8) return out;
  rows.forEach((row, i) => {
    const rank = 7 - i;
    let file = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) { file += Number(ch); continue; }
      const colour = ch === ch.toUpperCase() ? 'w' : 'b';
      out[toSquare(file, rank)] = colour + ch.toUpperCase();
      file += 1;
    }
  });
  return out;
}

/**
 * @typedef {Object} BoardOptions
 * @property {string}  [position]     initial FEN. default: standard start position
 * @property {Side}    [orientation]  default 'white'
 * @property {boolean} [coordinates]  draw rank/file labels. default true
 * @property {boolean} [interactive]  allow the user to move pieces. default false
 * @property {(from: Square, to: Square) => (boolean|Promise<boolean>)} [onMove]
 *           Called when the user completes a move while interactive.
 *           Return false to reject and snap back.
 *
 *           INPUT MODEL, and it differs deliberately between the renderers:
 *           - 2D supports BOTH tap-square-then-tap-square AND drag. A flat board has an
 *             unambiguous pixel-to-square mapping and no camera, so drag costs nothing.
 *           - 3D is TAP-TAP ONLY. Do not add drag-to-move. One-finger drag belongs to camera
 *             orbit, which is not a convenience: it is the "lean to see" mechanic that keeps
 *             a position recoverable when a tall piece hides a short one, and without it
 *             occlusion degrades from a skill into a guess. Dragging would also be least
 *             precise exactly where this app spends its time -- at low seats, where a few
 *             pixels of finger travel spans several ranks near the horizon. Tap-tap is
 *             additionally the only option the other modes have anyway, since visualization
 *             taps squares where pieces are NOT, and the square/diagonal drills are pure
 *             square taps.
 * @property {(square: Square) => void} [onSquareTap]
 *           Raw square taps, fired for ANY square regardless of what is on it and
 *           INDEPENDENT of `interactive`. The renderer must not select, move, or
 *           validate anything -- it only reports which square was touched.
 *
 *           This exists for the visualization/blindfold mode, where the board deliberately
 *           shows a STALE position while the user solves a later one in their head. They
 *           tap the square a piece will have moved to, which is usually empty on screen, so
 *           any piece-presence or legality check would make the mode impossible. Also used
 *           by the square-identification drill.
 *
 * @typedef {Object} BoardHandle
 * @property {HTMLElement} el
 *
 * @property {(fen: string, opts?: {animate?: boolean}) => Promise<void>} setPosition
 *           Render `fen`. With animate:true, pieces that moved slide to their new squares.
 *           Resolves when any animation has finished.
 *
 * @property {(from: Square, to: Square, opts?: {fen?: string}) => Promise<void>} animateMove
 *           Slide one piece. If `fen` is given it becomes the authoritative post-state
 *           (handles castling, en passant and promotion without the renderer knowing rules).
 *
 * @property {(side: Side) => void} setOrientation
 * @property {() => Side} getOrientation
 *
 * @property {(squares: Square[], kind?: HighlightKind) => void} highlight
 * @property {(kind?: HighlightKind) => void} clearHighlights   omit kind to clear all
 *
 *           ONE GLYPH PER SQUARE. Each kind carries a distinct shape as well as a colour
 *           (a check for success, a cross for error, rings for select/hint, and so on) so
 *           the kinds are distinguishable without relying on colour. But a square can
 *           legitimately be lit by two kinds at once -- the answer reveal keeps the blunder
 *           squares lit as 'error' while the refutation replays over them as 'hint' -- and
 *           stacking the shapes produces an unreadable pile of overlapping check marks and
 *           crosses on one square.
 *
 *           So a square must never display more than one glyph. When several kinds apply,
 *           the highest-precedence one wins and the others contribute nothing visible on
 *           that square:
 *
 *               error > success > select > hint > move
 *
 *           Errors and successes are verdicts about what just happened and must never be
 *           obscured; 'move' is ambient context and always yields. Membership itself is
 *           still tracked per kind, so clearHighlights('hint') removes only the hint and any
 *           lower-precedence kind still on that square becomes visible again.
 *
 * @property {(from: Square, to: Square, kind?: HighlightKind) => void} arrow
 * @property {() => void} clearArrows
 *
 * @property {(kind: 'success'|'error') => void} flash
 *           Brief whole-board feedback pulse. Must be safe to call rapidly.
 *
 * @property {(fn: ((square: Square) => void)|null) => void} setSquareTapHandler
 *           Install or clear the raw square-tap handler at runtime. Passing null removes it.
 *
 * @property {() => void} resize     recompute for the container's current size
 * @property {() => void} destroy    remove listeners, free GPU resources, empty the container
 */

/** Throws if `handle` is missing part of the contract. Used by the test harnesses. */
export function assertBoardHandle(handle) {
  const required = [
    'el', 'setPosition', 'animateMove', 'setOrientation', 'getOrientation',
    'highlight', 'clearHighlights', 'arrow', 'clearArrows', 'flash',
    'setSquareTapHandler', 'resize', 'destroy',
  ];
  const missing = required.filter((k) => handle == null || handle[k] === undefined);
  if (missing.length) throw new Error(`BoardHandle is missing: ${missing.join(', ')}`);
  return handle;
}

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
