/**
 * board2d.js -- inline-SVG 2D chess board renderer.
 *
 * Implements the BoardHandle contract described in board-interface.js. Pure ES module,
 * no dependencies, no build step, works fully offline. Renders as a single responsive
 * <svg viewBox="0 0 8 8"> so all geometry is in board units (1 unit == 1 square) and
 * scaling is free at any DPR.
 *
 * Layer order (bottom to top): squares -> coordinate labels -> highlights -> arrows ->
 * pieces. Pieces sit on top so they stay draggable and always read above arrows/highlights.
 */

import { parseSquare, toSquare, fenToMap, START_FEN, TOKENS } from './board-interface.js';
import { PIECES, PIECE_BOX } from './pieces-svg.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const HIGHLIGHT_KINDS = ['move', 'select', 'error', 'success', 'hint'];
const DEFAULT_HIGHLIGHT_KIND = 'move';

// board-interface.js: ONE GLYPH PER SQUARE. When several kinds are lit on the same square,
// the highest-precedence one wins the render and the rest contribute nothing visible there.
// Higher number == wins. Errors/successes are verdicts and must never be obscured; 'move' is
// ambient context and always yields.
const HIGHLIGHT_PRECEDENCE = { error: 4, success: 3, select: 2, hint: 1, move: 0 };

const MOVE_DURATION_MS = 220;
const FADE_DURATION_MS = 160;
const FLASH_DURATION_MS = 420;
const DRAG_THRESHOLD_PX = 5;

const PIECE_INSET = 0.075; // fraction of a cell left empty on each side around a piece
const PIECE_SCALE = (1 - 2 * PIECE_INSET) / PIECE_BOX;

function prefersReducedMotion() {
  try {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  if (attrs) {
    for (const k in attrs) el.setAttribute(k, attrs[k]);
  }
  return el;
}

// Sane fallbacks for every CSS custom property board-interface.js declares in TOKENS, so
// this renderer looks reasonable even before the app's design system has defined them
// (e.g. this module's standalone test harness). Keyed directly off TOKENS so a token added
// there without a fallback here is easy to spot.
const TOKEN_FALLBACKS = {
  '--board-light': '#eeeed2',
  '--board-dark': '#769656',
  '--board-edge': '#3a3a3a',
  '--hl-move': 'rgba(255,235,80,0.5)',
  '--hl-select': 'rgba(21,132,255,0.55)',
  '--hl-error': 'rgba(220,60,60,0.55)',
  '--hl-success': 'rgba(46,184,110,0.55)',
  '--hl-hint': 'rgba(255,170,30,0.6)',
  '--arrow': 'rgba(30,30,30,0.85)',
  '--piece-white': '#fafafa',
  '--piece-black': '#202020',
  '--board-coord-on-light': '#5c4526',
  '--board-coord-on-dark': '#faf2e2',
};
for (const name of TOKENS) {
  if (!(name in TOKEN_FALLBACKS)) TOKEN_FALLBACKS[name] = '#888';
}

function tok(name) {
  return `var(${name}, ${TOKEN_FALLBACKS[name] || '#888'})`;
}

/** file/rank (0-indexed) <-> on-screen board-unit coordinates, orientation-aware. */
function squareToXY(square, orientation) {
  const p = parseSquare(square);
  if (!p) return null;
  return orientation === 'black'
    ? { x: 7 - p.file, y: p.rank }
    : { x: p.file, y: 7 - p.rank };
}

function xyToSquare(x, y, orientation) {
  const col = Math.floor(x);
  const row = Math.floor(y);
  if (col < 0 || col > 7 || row < 0 || row > 7) return null;
  const file = orientation === 'black' ? 7 - col : col;
  const rank = orientation === 'black' ? row : 7 - row;
  return toSquare(file, rank);
}

function makeHighlightShape(kind) {
  const g = svgEl('g', { class: `b2d-hl b2d-hl-${kind}` });
  const color = tok(`--hl-${kind}`);

  if (kind === 'select') {
    g.appendChild(svgEl('rect', {
      x: 0.04, y: 0.04, width: 0.92, height: 0.92,
      fill: 'none', stroke: color, 'stroke-width': 0.09, rx: 0.06,
    }));
  } else if (kind === 'hint') {
    g.appendChild(svgEl('rect', {
      x: 0.07, y: 0.07, width: 0.86, height: 0.86,
      fill: 'none', stroke: color, 'stroke-width': 0.07,
      'stroke-dasharray': '0.16 0.1', rx: 0.05,
    }));
  } else if (kind === 'error') {
    g.appendChild(svgEl('rect', { x: 0, y: 0, width: 1, height: 1, fill: color }));
    g.appendChild(svgEl('path', {
      d: 'M0.28,0.28 L0.72,0.72 M0.72,0.28 L0.28,0.72',
      stroke: tok('--board-edge'), 'stroke-width': 0.06, 'stroke-linecap': 'round',
    }));
  } else if (kind === 'success') {
    g.appendChild(svgEl('rect', { x: 0, y: 0, width: 1, height: 1, fill: color }));
    g.appendChild(svgEl('path', {
      d: 'M0.24,0.52 L0.44,0.72 L0.78,0.3',
      fill: 'none', stroke: tok('--board-edge'), 'stroke-width': 0.07,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    }));
  } else {
    // move
    g.appendChild(svgEl('rect', { x: 0, y: 0, width: 1, height: 1, fill: color }));
  }
  return g;
}

export function createBoard(container, options = {}) {
  if (!container) throw new Error('createBoard: container is required');

  let orientation = options.orientation === 'black' ? 'black' : 'white';
  let showCoords = options.coordinates !== false;
  let interactive = !!options.interactive;
  let onMove = typeof options.onMove === 'function' ? options.onMove : null;
  let onSquareTap = typeof options.onSquareTap === 'function' ? options.onSquareTap : null;

  let position = fenToMap(options.position || START_FEN);
  let destroyed = false;

  // ---- DOM scaffold ---------------------------------------------------
  const wrap = document.createElement('div');
  wrap.className = 'b2d-wrap';
  wrap.style.position = 'relative';
  wrap.style.display = 'block';
  wrap.style.width = '100%';
  wrap.style.lineHeight = '0';
  wrap.style.userSelect = 'none';
  wrap.style.setProperty('-webkit-user-select', 'none');
  wrap.style.setProperty('-webkit-touch-callout', 'none');

  const svg = svgEl('svg', {
    viewBox: '0 0 8 8',
    class: 'b2d-svg',
  });
  svg.style.display = 'block';
  svg.style.width = '100%';
  svg.style.height = 'auto';
  svg.style.aspectRatio = '1 / 1';
  wrap.appendChild(svg);
  container.appendChild(wrap);

  const layerSquares = svgEl('g', { class: 'b2d-layer-squares' });
  const layerCoords = svgEl('g', { class: 'b2d-layer-coords' });
  const layerHighlights = svgEl('g', { class: 'b2d-layer-highlights' });
  const layerArrows = svgEl('g', { class: 'b2d-layer-arrows' });
  const layerHover = svgEl('g', { class: 'b2d-layer-hover' });
  const layerPieces = svgEl('g', { class: 'b2d-layer-pieces' });
  const layerFlash = svgEl('g', { class: 'b2d-layer-flash', 'pointer-events': 'none' });
  svg.append(layerSquares, layerCoords, layerHighlights, layerArrows, layerHover, layerPieces, layerFlash);

  // border/rim around the whole board
  const rim = svgEl('rect', {
    x: 0, y: 0, width: 8, height: 8, fill: 'none',
    stroke: tok('--board-edge'), 'stroke-width': 0.06,
  });

  // ---- squares + coordinate labels ------------------------------------
  function buildSquares() {
    layerSquares.textContent = '';
    for (let file = 0; file < 8; file++) {
      for (let rank = 0; rank < 8; rank++) {
        const sq = toSquare(file, rank);
        const light = (file + rank) % 2 === 1;
        const { x, y } = squareToXY(sq, orientation);
        const rect = svgEl('rect', {
          x, y, width: 1, height: 1,
          fill: tok(light ? '--board-light' : '--board-dark'),
          'data-square': sq,
        });
        layerSquares.appendChild(rect);
      }
    }
    layerSquares.appendChild(rim);
  }

  function buildCoords() {
    layerCoords.textContent = '';
    if (!showCoords) return;
    // Label ink comes from the two --board-coord-on-* tokens (board-interface.js), NOT the
    // opposite square's fill -- that old convention measures ~2:1 contrast at the current
    // board palette and is illegible at label size. --board-coord-on-dark in particular is
    // deliberately only ~3:1: that is the ceiling achievable against a mid-tone dark square
    // regardless of ink colour, so the token cannot be second-guessed with a "nicer" colour
    // here. Both tokens are calibrated for their target contrast at full opacity, so the
    // labels are drawn fully opaque -- blending in the square colour under an alpha < 1 would
    // erode exactly the contrast the tokens were tuned to guarantee.
    for (let row = 0; row < 8; row++) {
      const sq = xyToSquare(0, row, orientation);
      const p = parseSquare(sq);
      const light = (p.file + p.rank) % 2 === 1;
      const t = svgEl('text', {
        x: 0.045, y: row + 0.2, 'font-size': 0.16,
        fill: tok(light ? '--board-coord-on-light' : '--board-coord-on-dark'),
        'font-family': 'system-ui, sans-serif', 'font-weight': 600,
      });
      t.textContent = sq[1];
      layerCoords.appendChild(t);
    }
    for (let col = 0; col < 8; col++) {
      const sq = xyToSquare(col, 7, orientation);
      const p = parseSquare(sq);
      const light = (p.file + p.rank) % 2 === 1;
      const t = svgEl('text', {
        x: col + 1 - 0.16, y: 7 + 1 - 0.09, 'font-size': 0.16,
        fill: tok(light ? '--board-coord-on-light' : '--board-coord-on-dark'),
        'font-family': 'system-ui, sans-serif', 'font-weight': 600,
      });
      t.textContent = sq[0];
      layerCoords.appendChild(t);
    }
  }

  // ---- pieces -----------------------------------------------------------
  const pieceEls = new Map(); // square -> <g>

  // Cburnett artwork (see pieces-svg.js) bakes its own colours into the markup -- white
  // pieces white-filled with black outlines, black pieces black-filled with light-grey
  // detail strokes -- rather than being recoloured from --piece-white / --piece-black. That
  // authentic look is the point of using the real set, so we inject the markup as-is instead
  // of building tokenised <path> elements. A single shared DOMParser turns each piece's SVG
  // fragment into real nodes; importNode clones them into this document so they can be
  // reused across every piece instance on the board.
  const piecesParser = typeof DOMParser !== 'undefined' ? new DOMParser() : null;
  function markupToNodes(markup) {
    if (!piecesParser) return null;
    const doc = piecesParser.parseFromString(`<svg xmlns="${SVG_NS}">${markup}</svg>`, 'image/svg+xml');
    const root = doc.documentElement;
    if (!root || root.nodeName === 'parsererror') return null;
    const frag = document.createDocumentFragment();
    for (const child of Array.from(root.childNodes)) {
      frag.appendChild(document.importNode(child, true));
    }
    return frag;
  }

  function pieceGroup(code) {
    // code like 'wP' / 'bN'
    const colour = code[0] === 'w' ? 'white' : 'black';
    const markup = PIECES[code];
    const g = svgEl('g', { class: `b2d-piece b2d-piece-${colour}`, 'data-code': code });
    const inner = svgEl('g', {
      transform: `scale(${PIECE_SCALE})`,
    });
    const nodes = markup ? markupToNodes(markup) : null;
    if (nodes) inner.appendChild(nodes);
    g.appendChild(inner);
    return g;
  }

  function placeAt(el, square) {
    const { x, y } = squareToXY(square, orientation);
    el.style.transform = `translate(${x + PIECE_INSET}px, ${y + PIECE_INSET}px)`;
  }

  function buildPieces() {
    layerPieces.textContent = '';
    pieceEls.clear();
    for (const sq in position) {
      const g = pieceGroup(position[sq]);
      placeAt(g, sq);
      g.dataset.square = sq;
      layerPieces.appendChild(g);
      pieceEls.set(sq, g);
    }
    applyInteractivity();
  }

  // ---- animation helpers -------------------------------------------------
  function animateTransform(el, toX, toY, duration) {
    return new Promise((resolve) => {
      if (destroyed) return resolve();
      if (prefersReducedMotion() || duration <= 0) {
        el.style.transition = '';
        el.style.transform = `translate(${toX}px, ${toY}px)`;
        resolve();
        return;
      }
      el.style.transition = `transform ${duration}ms ease`;
      // force reflow so the browser registers the start state before we change it
      void el.getBoundingClientRect();
      requestAnimationFrame(() => {
        el.style.transform = `translate(${toX}px, ${toY}px)`;
      });
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        el.style.transition = '';
        el.removeEventListener('transitionend', onEnd);
        resolve();
      };
      const onEnd = (ev) => { if (ev.target === el && ev.propertyName === 'transform') finish(); };
      el.addEventListener('transitionend', onEnd);
      setTimeout(finish, duration + 60);
    });
  }

  function fadeOutAndRemove(el, duration) {
    return new Promise((resolve) => {
      if (destroyed) return resolve();
      if (prefersReducedMotion() || duration <= 0) {
        el.remove();
        resolve();
        return;
      }
      el.style.transition = `opacity ${duration}ms ease`;
      void el.getBoundingClientRect();
      requestAnimationFrame(() => { el.style.opacity = '0'; });
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        el.remove();
        resolve();
      };
      el.addEventListener('transitionend', finish, { once: true });
      setTimeout(finish, duration + 60);
    });
  }

  function fadeIn(el, duration) {
    return new Promise((resolve) => {
      if (destroyed) return resolve();
      if (prefersReducedMotion() || duration <= 0) {
        el.style.opacity = '1';
        resolve();
        return;
      }
      el.style.opacity = '0';
      el.style.transition = `opacity ${duration}ms ease`;
      void el.getBoundingClientRect();
      requestAnimationFrame(() => { el.style.opacity = '1'; });
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        el.style.transition = '';
        resolve();
      };
      el.addEventListener('transitionend', finish, { once: true });
      setTimeout(finish, duration + 60);
    });
  }

  // ---- setPosition / animateMove -----------------------------------------
  async function applyPositionDiff(newPosition, animate) {
    if (!animate || prefersReducedMotion()) {
      position = newPosition;
      buildPieces();
      return;
    }

    const oldPosition = position;
    const squares = new Set([...Object.keys(oldPosition), ...Object.keys(newPosition)]);
    const removed = [];
    const added = [];
    for (const sq of squares) {
      const a = oldPosition[sq];
      const b = newPosition[sq];
      if (a === b) continue;
      if (a) removed.push({ sq, code: a });
      if (b) added.push({ sq, code: b });
    }

    const usedAdded = new Set();
    const pairs = [];
    for (const r of removed) {
      const idx = added.findIndex((a, i) => !usedAdded.has(i) && a.code === r.code);
      if (idx !== -1) {
        usedAdded.add(idx);
        pairs.push({ from: r.sq, to: added[idx].sq, code: r.code });
      } else {
        pairs.push({ from: r.sq, to: null, code: r.code });
      }
    }
    for (let i = 0; i < added.length; i++) {
      if (!usedAdded.has(i)) pairs.push({ from: null, to: added[i].sq, code: added[i].code });
    }

    const jobs = [];
    for (const p of pairs) {
      if (p.from && p.to) {
        const el = pieceEls.get(p.from);
        if (!el) continue;
        pieceEls.delete(p.from);
        pieceEls.set(p.to, el);
        el.dataset.square = p.to;
        const { x, y } = squareToXY(p.to, orientation);
        jobs.push(animateTransform(el, x + PIECE_INSET, y + PIECE_INSET, MOVE_DURATION_MS));
      } else if (p.from && !p.to) {
        const el = pieceEls.get(p.from);
        if (!el) continue;
        pieceEls.delete(p.from);
        jobs.push(fadeOutAndRemove(el, FADE_DURATION_MS));
      } else if (!p.from && p.to) {
        const g = pieceGroup(p.code);
        placeAt(g, p.to);
        g.dataset.square = p.to;
        layerPieces.appendChild(g);
        pieceEls.set(p.to, g);
        jobs.push(fadeIn(g, FADE_DURATION_MS));
      }
    }
    position = newPosition;
    applyInteractivity();
    await Promise.all(jobs);
  }

  async function setPosition(fen, opts = {}) {
    const newPosition = fenToMap(fen);
    await applyPositionDiff(newPosition, !!opts.animate);
  }

  async function animateMove(from, to, opts = {}) {
    const fp = parseSquare(from);
    const tp = parseSquare(to);
    if (!fp || !tp) return;

    const el = pieceEls.get(from);
    if (!el) {
      // nothing to animate visually; just reconcile state if we can
      if (opts.fen) await applyPositionDiff(fenToMap(opts.fen), false);
      return;
    }

    // captured piece at destination disappears immediately under the sliding piece
    const capturedEl = pieceEls.get(to);
    if (capturedEl && capturedEl !== el) {
      pieceEls.delete(to);
      capturedEl.remove();
    }

    pieceEls.delete(from);
    pieceEls.set(to, el);
    el.dataset.square = to;
    const { x, y } = squareToXY(to, orientation);
    await animateTransform(el, x + PIECE_INSET, y + PIECE_INSET, MOVE_DURATION_MS);

    if (destroyed) return;

    if (opts.fen) {
      await applyPositionDiff(fenToMap(opts.fen), false);
    } else {
      const code = position[from];
      const next = { ...position };
      delete next[from];
      if (code) next[to] = code;
      position = next;
    }
  }

  // ---- highlights ---------------------------------------------------------
  // Highlight/arrow geometry is keyed by square, not screen position, so a flip needs to
  // rebuild it against the new orientation. Membership is tracked PER KIND -- one square list
  // per HighlightKind -- and that per-kind bookkeeping is the source of truth. It is never
  // collapsed into a single "current kind" per square, because clearHighlights('hint') must
  // reveal whatever lower-precedence kind (e.g. 'move') was already sitting under it, and that
  // information would be lost if a clear or a higher-precedence add overwrote a single field.
  //
  // What IS single-valued is the render: renderHighlights() derives, fresh on every call, the
  // one winning kind per square (board-interface.js's ONE GLYPH PER SQUARE /
  // HIGHLIGHT_PRECEDENCE rule) from that per-kind membership and draws exactly one shape per
  // occupied square -- so the winning kind's fill and glyph always come from the same
  // makeHighlightShape(kind) call and can never mismatch.
  const lastHighlightSquares = new Map();
  for (const kind of HIGHLIGHT_KINDS) lastHighlightSquares.set(kind, []);

  function renderHighlights() {
    layerHighlights.textContent = '';
    const winner = new Map(); // square -> highest-precedence kind lit there
    for (const kind of HIGHLIGHT_KINDS) {
      for (const sq of lastHighlightSquares.get(kind)) {
        const current = winner.get(sq);
        if (!current || HIGHLIGHT_PRECEDENCE[kind] > HIGHLIGHT_PRECEDENCE[current]) {
          winner.set(sq, kind);
        }
      }
    }
    for (const [sq, kind] of winner) {
      const shape = makeHighlightShape(kind);
      const { x, y } = squareToXY(sq, orientation);
      shape.setAttribute('transform', `translate(${x}, ${y})`);
      layerHighlights.appendChild(shape);
    }
  }

  function highlight(squares, kind = DEFAULT_HIGHLIGHT_KIND) {
    if (!HIGHLIGHT_KINDS.includes(kind)) return;
    const list = Array.isArray(squares) ? squares.filter((sq) => parseSquare(sq)) : [];
    lastHighlightSquares.set(kind, list);
    renderHighlights();
  }

  function clearHighlights(kind) {
    if (kind) {
      if (!HIGHLIGHT_KINDS.includes(kind)) return;
      lastHighlightSquares.set(kind, []);
    } else {
      for (const k of HIGHLIGHT_KINDS) lastHighlightSquares.set(k, []);
    }
    renderHighlights();
  }

  // ---- arrows ---------------------------------------------------------------
  let lastArrows = [];
  function arrow(from, to, kind) {
    const fp = parseSquare(from);
    const tp = parseSquare(to);
    if (!fp || !tp) return;
    lastArrows.push({ from, to, kind });
    const a = squareToXY(from, orientation);
    const b = squareToXY(to, orientation);
    const x1 = a.x + 0.5, y1 = a.y + 0.5;
    const x2 = b.x + 0.5, y2 = b.y + 0.5;
    const color = kind && HIGHLIGHT_KINDS.includes(kind)
      ? tok(`--hl-${kind}`)
      : tok('--arrow');

    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const headLen = Math.min(0.34, len * 0.4);
    const headWidth = 0.22;
    const shaftWidth = 0.09;
    // pull the shaft/head endpoint back so the arrow tip doesn't sit under the piece glyph
    const tipX = x2 - ux * 0.08, tipY = y2 - uy * 0.08;
    const baseX = tipX - ux * headLen, baseY = tipY - uy * headLen;
    const nx = -uy, ny = ux;

    const g = svgEl('g', { class: 'b2d-arrow' });
    g.appendChild(svgEl('line', {
      x1, y1, x2: baseX, y2: baseY,
      stroke: color, 'stroke-width': shaftWidth, 'stroke-linecap': 'round',
    }));
    const p1x = baseX + nx * headWidth, p1y = baseY + ny * headWidth;
    const p2x = baseX - nx * headWidth, p2y = baseY - ny * headWidth;
    g.appendChild(svgEl('path', {
      d: `M${tipX},${tipY} L${p1x},${p1y} L${p2x},${p2y} Z`,
      fill: color,
    }));
    layerArrows.appendChild(g);
  }

  function clearArrows() {
    layerArrows.textContent = '';
    lastArrows = [];
  }

  // ---- flash ------------------------------------------------------------------
  const flashAnims = new Map();
  function flash(kind) {
    if (kind !== 'success' && kind !== 'error') return;
    const existing = flashAnims.get(kind);
    if (existing) existing.cancel();
    let el = layerFlash.querySelector(`[data-flash="${kind}"]`);
    if (!el) {
      el = svgEl('rect', {
        x: 0, y: 0, width: 8, height: 8,
        fill: tok(`--hl-${kind}`),
        'data-flash': kind, opacity: 0,
      });
      layerFlash.appendChild(el);
    }
    if (prefersReducedMotion()) {
      el.style.opacity = '0';
      return;
    }
    const anim = el.animate(
      [{ opacity: 0 }, { opacity: 0.55 }, { opacity: 0 }],
      { duration: FLASH_DURATION_MS, easing: 'ease-out' },
    );
    flashAnims.set(kind, anim);
    anim.addEventListener('finish', () => { if (flashAnims.get(kind) === anim) flashAnims.delete(kind); });
  }

  // ---- orientation ------------------------------------------------------------
  function redrawAll() {
    buildSquares();
    buildCoords();
    for (const [sq, el] of pieceEls) placeAt(el, sq);
    renderHighlights();
    const arrows = lastArrows;
    clearArrows();
    for (const a of arrows) arrow(a.from, a.to, a.kind);
  }

  function setOrientation(side) {
    orientation = side === 'black' ? 'black' : 'white';
    redrawAll();
  }
  function getOrientation() {
    return orientation;
  }

  // ---- interaction: tap-tap and drag ------------------------------------------
  let selectedSquare = null;
  let dragState = null;
  let hoverRect = null;

  function svgPointFromEvent(evt) {
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const x = ((evt.clientX - rect.left) / rect.width) * 8;
    const y = ((evt.clientY - rect.top) / rect.height) * 8;
    return { x, y };
  }

  function squareFromEvent(evt) {
    const pt = svgPointFromEvent(evt);
    if (!pt) return null;
    return xyToSquare(pt.x, pt.y, orientation);
  }

  function clearSelection() {
    selectedSquare = null;
    clearHighlights('select');
  }

  function showHover(square) {
    if (!hoverRect) {
      hoverRect = svgEl('rect', {
        width: 1, height: 1, fill: 'none',
        stroke: tok('--hl-select'), 'stroke-width': 0.05, opacity: 0.6,
      });
      layerHover.appendChild(hoverRect);
    }
    if (!square) { hoverRect.style.display = 'none'; return; }
    const { x, y } = squareToXY(square, orientation);
    hoverRect.setAttribute('x', x);
    hoverRect.setAttribute('y', y);
    hoverRect.style.display = '';
  }

  function snapBack(square) {
    const el = pieceEls.get(square);
    if (!el) return;
    const { x, y } = squareToXY(square, orientation);
    el.style.zIndex = '';
    return animateTransform(el, x + PIECE_INSET, y + PIECE_INSET, MOVE_DURATION_MS);
  }

  async function attemptMove(from, to) {
    let ok = true;
    try {
      ok = onMove ? await onMove(from, to) : true;
    } catch {
      ok = false;
    }
    if (destroyed) return;
    if (ok) {
      const code = position[from];
      const next = { ...position };
      delete next[from];
      const capturedEl = pieceEls.get(to);
      if (capturedEl) { pieceEls.delete(to); capturedEl.remove(); }
      if (code) next[to] = code;
      position = next;
      const el = pieceEls.get(from);
      if (el) {
        pieceEls.delete(from);
        pieceEls.set(to, el);
        el.dataset.square = to;
        const { x, y } = squareToXY(to, orientation);
        await animateTransform(el, x + PIECE_INSET, y + PIECE_INSET, MOVE_DURATION_MS);
      }
    } else {
      await snapBack(from);
    }
  }

  function onPointerDown(evt) {
    if (!interactive || destroyed) return;
    const sq = squareFromEvent(evt);
    if (!sq) return;

    if (selectedSquare) {
      if (sq === selectedSquare) { clearSelection(); return; }
      const from = selectedSquare;
      clearSelection();
      attemptMove(from, sq);
      return;
    }

    const code = position[sq];
    if (!code) return;

    const el = pieceEls.get(sq);
    if (!el) return;

    evt.preventDefault();
    selectedSquare = sq;
    highlight([sq], 'select');

    try { svg.setPointerCapture(evt.pointerId); } catch { /* not all targets support capture */ }
    el.style.transition = '';
    layerPieces.appendChild(el); // bring to front

    dragState = {
      from: sq,
      el,
      pointerId: evt.pointerId,
      startX: evt.clientX,
      startY: evt.clientY,
      moved: false,
    };
  }

  function onPointerMove(evt) {
    if (!dragState || dragState.pointerId !== evt.pointerId) return;
    const dx = evt.clientX - dragState.startX;
    const dy = evt.clientY - dragState.startY;
    if (!dragState.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) dragState.moved = true;
    if (!dragState.moved) return;

    const pt = svgPointFromEvent(evt);
    if (!pt) return;
    dragState.el.style.transition = '';
    dragState.el.style.transform = `translate(${pt.x - 0.5}px, ${pt.y - 0.5}px)`;
    const hoverSq = xyToSquare(pt.x, pt.y, orientation);
    showHover(hoverSq);
  }

  function onPointerUp(evt) {
    if (!dragState || dragState.pointerId !== evt.pointerId) return;
    const { from, moved } = dragState;
    try { svg.releasePointerCapture(evt.pointerId); } catch { /* noop */ }
    showHover(null);
    dragState = null;

    if (!moved) {
      // this was a tap: keep the selection active, just make sure the piece is exactly
      // back on its square (it never really left, but be defensive)
      snapBack(from);
      return;
    }

    const target = squareFromEvent(evt);
    clearSelection();
    if (target && target !== from) {
      attemptMove(from, target);
    } else {
      snapBack(from);
    }
  }

  function onPointerCancel(evt) {
    if (!dragState || dragState.pointerId !== evt.pointerId) return;
    const { from } = dragState;
    dragState = null;
    showHover(null);
    clearSelection();
    snapBack(from);
  }

  // ---- square tap: independent of `interactive`, never selects/moves/validates -----
  // Own pointer-id tracking, kept entirely separate from the drag/select state machine
  // above, so it works whether or not `interactive` is on and whether or not the
  // piece-drag listeners are attached. Reports a square on a plain tap (no meaningful
  // movement between down and up); a drag/scroll gesture does not count as a tap.
  let tapState = null;

  function onTapPointerDown(evt) {
    if (destroyed) return;
    tapState = { pointerId: evt.pointerId, startX: evt.clientX, startY: evt.clientY, moved: false };
  }

  function onTapPointerMove(evt) {
    if (!tapState || tapState.pointerId !== evt.pointerId) return;
    const dx = evt.clientX - tapState.startX;
    const dy = evt.clientY - tapState.startY;
    if (Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) tapState.moved = true;
  }

  function onTapPointerUp(evt) {
    if (!tapState || tapState.pointerId !== evt.pointerId) return;
    const { moved } = tapState;
    tapState = null;
    if (moved || !onSquareTap) return;
    const sq = squareFromEvent(evt);
    if (sq) onSquareTap(sq);
  }

  function onTapPointerCancel(evt) {
    if (!tapState || tapState.pointerId !== evt.pointerId) return;
    tapState = null;
  }

  svg.addEventListener('pointerdown', onTapPointerDown);
  svg.addEventListener('pointermove', onTapPointerMove);
  svg.addEventListener('pointerup', onTapPointerUp);
  svg.addEventListener('pointercancel', onTapPointerCancel);

  function setSquareTapHandler(fn) {
    onSquareTap = typeof fn === 'function' ? fn : null;
  }

  let listenersAttached = false;
  function applyInteractivity() {
    svg.style.touchAction = interactive ? 'none' : 'auto';
    for (const el of pieceEls.values()) {
      el.style.cursor = interactive ? 'grab' : '';
      el.style.pointerEvents = interactive ? 'auto' : 'none';
    }
    if (interactive && !listenersAttached) {
      svg.addEventListener('pointerdown', onPointerDown);
      svg.addEventListener('pointermove', onPointerMove);
      svg.addEventListener('pointerup', onPointerUp);
      svg.addEventListener('pointercancel', onPointerCancel);
      listenersAttached = true;
    } else if (!interactive && listenersAttached) {
      svg.removeEventListener('pointerdown', onPointerDown);
      svg.removeEventListener('pointermove', onPointerMove);
      svg.removeEventListener('pointerup', onPointerUp);
      svg.removeEventListener('pointercancel', onPointerCancel);
      listenersAttached = false;
      clearSelection();
      dragState = null;
      showHover(null);
    }
  }

  /** Not part of BoardHandle, but a harmless extra: flip interactivity without a rebuild. */
  function setInteractive(value) {
    interactive = !!value;
    applyInteractivity();
  }

  // ---- resize / responsive sizing -----------------------------------------------
  function resize() {
    if (destroyed) return;
    const rect = container.getBoundingClientRect();
    const w = rect.width || container.clientWidth || 0;
    const h = rect.height || container.clientHeight || 0;
    const side = h > 0 ? Math.min(w, h) : w;
    if (side > 0) {
      wrap.style.width = `${side}px`;
      wrap.style.height = `${side}px`;
    }
  }

  let ro = null;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => resize());
    ro.observe(container);
  }

  // ---- init ------------------------------------------------------------------
  buildSquares();
  buildCoords();
  buildPieces();
  resize();

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    if (ro) { ro.disconnect(); ro = null; }
    if (listenersAttached) {
      svg.removeEventListener('pointerdown', onPointerDown);
      svg.removeEventListener('pointermove', onPointerMove);
      svg.removeEventListener('pointerup', onPointerUp);
      svg.removeEventListener('pointercancel', onPointerCancel);
      listenersAttached = false;
    }
    svg.removeEventListener('pointerdown', onTapPointerDown);
    svg.removeEventListener('pointermove', onTapPointerMove);
    svg.removeEventListener('pointerup', onTapPointerUp);
    svg.removeEventListener('pointercancel', onTapPointerCancel);
    tapState = null;
    onSquareTap = null;
    for (const anim of flashAnims.values()) anim.cancel();
    flashAnims.clear();
    pieceEls.clear();
    container.textContent = '';
  }

  const handle = {
    el: wrap,
    setPosition,
    animateMove,
    setOrientation,
    getOrientation,
    highlight,
    clearHighlights,
    arrow,
    clearArrows,
    flash,
    setSquareTapHandler,
    resize,
    destroy,
    setInteractive,
  };

  return handle;
}
